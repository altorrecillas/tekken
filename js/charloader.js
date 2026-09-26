// Loads a fighter exported by tools/buildchar.py (mesh.json + mesh.bin) into a skinned THREE.Group.
import * as THREE from 'three';

const texLoader = new THREE.TextureLoader();
const texCache = new Map();
const pending = new Set();

export function texturesReady() { return Promise.all([...pending]); }

function loadTex(url, srgb = true) {
  const key = url + (srgb ? '|s' : '|l');
  if (!texCache.has(key)) {
    let done;
    const pr = new Promise(r => (done = r));
    pending.add(pr);
    const t = texLoader.load(url, () => { pending.delete(pr); done(); }, undefined, () => { pending.delete(pr); done(); });
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.flipY = true;
    texCache.set(key, t);
  }
  return texCache.get(key);
}

const metaCache = new Map();
async function fetchOk(url, as) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return as === 'json' ? r.json() : r.arrayBuffer();
}
// the small descriptor (name, parts, skeleton) is enough for menus; the mesh is fetched when a fighter is shown
export function loadCharacterMeta(id) {
  if (!metaCache.has(id)) metaCache.set(id, fetchOk(`assets/chars/${id}/mesh.json`, 'json').catch((e) => { metaCache.delete(id); throw e; }));
  return metaCache.get(id);
}
// meshes ship gzip-precompressed (60% smaller whatever the server does); DecompressionStream inflates them.
// Falls back to the raw file where the stream API is missing or the .gz cannot be fetched.
async function fetchMesh(url) {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const buf = await fetchOk(url + '.gz');
      const u8 = new Uint8Array(buf, 0, 2);
      if (u8[0] !== 0x1f || u8[1] !== 0x8b) return buf; // a server already inflated it (Content-Encoding)
      return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    } catch (e) { /* fall back to the raw mesh */ }
  }
  return fetchOk(url);
}
export async function loadCharacterData(id) {
  const base = `assets/chars/${id}/`;
  const [meta, bin] = await Promise.all([loadCharacterMeta(id), fetchMesh(base + 'mesh.bin')]);
  return { id, base, meta, bin };
}

function view(bin, [off, len], Type) {
  return new Type(bin, off, len);
}

export const LOD = { hair: 1.0 };

export function buildCharacter(data, makeMaterial) {
  const { meta, bin, base } = data;
  const bones = meta.bones.map(b => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    return bone;
  });
  let root = null;
  meta.bones.forEach((b, i) => {
    const h = b.head;
    if (b.parent >= 0) {
      const ph = meta.bones[b.parent].head;
      bones[i].position.set(h[0] - ph[0], h[1] - ph[1], h[2] - ph[2]);
      bones[b.parent].add(bones[i]);
    } else {
      bones[i].position.set(h[0], h[1], h[2]);
      root = bones[i];
    }
  });
  const group = new THREE.Group();
  group.name = meta.id;
  group.add(root);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const meshes = {};
  for (const p of meta.parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(view(bin, p.position, Float32Array), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(view(bin, p.normal, Float32Array), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(view(bin, p.uv, Float32Array), 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(view(bin, p.skinIndex, Uint16Array), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(view(bin, p.skinWeight, Float32Array), 4));
    g.setIndex(new THREE.BufferAttribute(view(bin, p.index, Uint32Array), 1));
    if (p.color) g.setAttribute('color', new THREE.BufferAttribute(view(bin, p.color, Float32Array), 3));
    if (p.tangent) g.setAttribute('tangent', new THREE.BufferAttribute(view(bin, p.tangent, Float32Array), 4));
    g.computeBoundingSphere();
    if (p.mat.lod && LOD.hair < 1) {
      const n = g.index.count;
      g.setDrawRange(0, Math.floor(n * LOD.hair / 3) * 3);
    }
    if (p.mat.type === 'beard') {
      // fur shells: the same skinned geometry drawn once per layer, inner layers first
      const n = p.mat.shells || 6;
      for (let layer = 0; layer < n; layer++) {
        const sm = new THREE.SkinnedMesh(g, makeMaterial({ ...p.mat, layer }, base, loadTex, p.name));
        sm.name = `${p.name}_${layer}`; sm.renderOrder = 2 + layer;
        sm.castShadow = false; sm.receiveShadow = true; sm.frustumCulled = false; sm.userData.noAO = true;
        sm.bind(skeleton, new THREE.Matrix4());
        group.add(sm);
        meshes[sm.name] = sm;
      }
      continue;
    }
    const mat = makeMaterial(p.mat, base, loadTex, p.name);
    const m = new THREE.SkinnedMesh(g, mat);
    m.name = p.name;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.bind(skeleton, new THREE.Matrix4());
    group.add(m);
    meshes[p.name] = m;
    if (p.mat.type === 'haircards' || p.mat.type === 'hair') {
      // two-pass hair: the alpha-tested pass above writes depth for the solid core, this blended pass
      // draws the soft strand tips on top without the stipple of alpha-to-coverage
      const soft = mat.clone();
      soft.alphaTest = 0.04; soft.transparent = true; soft.depthWrite = false; soft.forceSinglePass = true;
      soft.onBeforeCompile = mat.onBeforeCompile; soft.customProgramCacheKey = mat.customProgramCacheKey;
      const sm = new THREE.SkinnedMesh(g, soft);
      sm.name = p.name + '_soft'; sm.renderOrder = 1;
      sm.castShadow = false; sm.receiveShadow = true; sm.frustumCulled = false; sm.userData.noAO = true;
      sm.bind(skeleton, new THREE.Matrix4());
      group.add(sm);
      meshes[sm.name] = sm;
    }
  }
  const boneMap = {};
  bones.forEach(b => (boneMap[b.name] = b));
  // rest-pose world positions (character local space) for rigging helpers
  const rest = {};
  meta.bones.forEach(b => (rest[b.name] = { head: new THREE.Vector3(...b.head), tail: new THREE.Vector3(...b.tail) }));
  return { group, skeleton, bones: boneMap, meshes, meta, rest };
}
