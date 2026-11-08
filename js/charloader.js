// Loads a fighter exported by tools/buildchar.py (mesh.json + mesh.bin) into a skinned THREE.Group.
import * as THREE from 'three';
import { hairSwayDepth } from './materials.js';
import { addSkinCor } from './anim/corskin.js';
import { setupClothSway } from './anim/clothsway.js';

const texLoader = new THREE.TextureLoader();
const texCache = new Map();
const pending = new Set();

export function texturesReady() { return Promise.all([...pending]); }
// (how many textures are still on their way: the loading card's bar counts them down)
export function texturesPending() { return pending.size; }

// GPU-compressed textures (KTX2, tools/ktx2assets.py): a fighter's pictures unpacked to full size took ~180 MB of
// the graphics card's memory; compressed (the browser transcodes them to what the GPU has: ASTC or ETC on phones, BC
// on computers) they take 4 to 8 times less, which is what keeps a phone with little memory from losing WebGL.
// assets/ktx2.json lists the textures that have one. Used only where the GPU takes some compressed format and once
// initKTX2 has run (main.js, before the first fighter is built); otherwise, or if one fails, the picture as before
let ktx2 = null, ktxMap = null, textureCap = () => 0;
// (cap: the device's texture size limit, js/engine/device.js textureCap)
export async function initKTX2(renderer, cap = () => 0) {
  textureCap = cap;
  try {
    const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
    const L = new KTX2Loader().setTranscoderPath('vendor/three/jsm/libs/basis/').detectSupport(renderer);
    const c = L.workerConfig || {};
    if (!(c.astcSupported || c.etc2Supported || c.etc1Supported || c.dxtSupported || c.bptcSupported || c.pvrtcSupported)) return false;
    const r = await fetch('assets/ktx2.json');
    if (!r.ok) return false;
    ktxMap = await r.json(); ktx2 = L;
    return true;
  } catch (e) { console.warn('KTX2 off:', e.message); return false; }
}
// (the game's paths go through ../shared/: the index has them resolved)
const normPath = (u) => { const out = []; for (const seg of u.split('/')) { if (seg === '..') out.pop(); else if (seg !== '.' && seg) out.push(seg); } return out.join('/'); };
// a compressed texture into the one the materials already hold: its mip levels, format and size (a phone's texture
// cap drops the top levels instead of resizing the picture: compressed, twice the cap costs less than the cap did)
function bindCompressed(t, c) {
  let mips = c.mipmaps, w = c.image.width, h = c.image.height;
  const cap = textureCap() * 2;
  while (cap && Math.max(w, h) > cap && mips.length > 1) { mips = mips.slice(1); w = mips[0].width; h = mips[0].height; }
  t.isCompressedTexture = true; // (WebGLTextures uploads it level by level, as compressed data)
  t.mipmaps = mips; t.image = { width: w, height: h };
  t.format = c.format; t.type = c.type; t.colorSpace = c.colorSpace;
  t.minFilter = mips.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false; t.flipY = false; t.premultiplyAlpha = c.premultiplyAlpha;
  t.needsUpdate = true;
}

function loadTex(url, srgb = true) {
  const key = url + (srgb ? '|s' : '|l');
  if (!texCache.has(key)) {
    let done;
    const pr = new Promise(r => (done = r));
    pending.add(pr);
    const fin = () => { pending.delete(pr); done(); };
    const kurl = ktx2 && ktxMap[normPath(url)];
    let t;
    if (kurl) {
      // (encoded upside down: tools/ktx2assets.py; the picture, if the KTX2 fails, the usual way up)
      t = new THREE.Texture();
      const picture = () => new THREE.ImageLoader().load(url, (img) => { t.image = img; t.needsUpdate = true; fin(); }, undefined, fin);
      ktx2.load(kurl, (c) => { bindCompressed(t, c); fin(); }, undefined, picture);
    } else t = texLoader.load(url, fin, undefined, fin);
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

// mesh attributes, either format (tools/pipeline/meshfmt.py): 1, raw typed arrays [offset, count]; 2, quantized
// {o, n, t, q, k, c, e}, decoded here to the same types as format 1 (nothing downstream changes, the download is a third)
const TYPES = { f32: Float32Array, i16: Int16Array, i8: Int8Array, u16: Uint16Array, u8: Uint8Array, u32: Uint32Array };
const COMP = { position: 3, normal: 3, uv: 2, skinIndex: 4, skinWeight: 4, index: 1, color: 3, tangent: 4 };
const F1 = { position: Float32Array, normal: Float32Array, uv: Float32Array, skinIndex: Uint16Array, skinWeight: Float32Array, index: Uint32Array, color: Float32Array, tangent: Float32Array };
// The stored integers: as they are, or (d.e) with the bytes of every element grouped by significance ('s') and/or as
// differences from the previous row of the same component ('d'; the typed arrays wrap round as the writer did)
function ints(bin, d, k) {
  const T = TYPES[d.t];
  if (!d.e) return new T(bin, d.o, d.n);
  const bs = T.BYTES_PER_ELEMENT, n = d.n;
  let a;
  if (d.e.includes('s') && bs > 1) {
    const src = new Uint8Array(bin, d.o, n * bs), dst = new Uint8Array(n * bs);
    for (let b = 0; b < bs; b++) for (let i = 0, o = b * n; i < n; i++) dst[i * bs + b] = src[o + i];
    a = new T(dst.buffer);
  } else a = new T(bin.slice(d.o, d.o + n * bs));
  if (d.e.includes('d')) for (let i = k; i < n; i++) a[i] += a[i - k];
  return a;
}
function attr(bin, d, name) {
  if (Array.isArray(d)) return new F1[name](bin, d[0], d[1]);
  const k = COMP[name];
  if (d.c) { const rows = d.n / d.c.length, out = new F1[name](rows * k); for (let i = 0; i < rows; i++) out.set(d.c, i * k); return out; }
  const src = ints(bin, d, name === 'index' ? 1 : (d.k || k));
  if (name === 'index') return src; // (uint16 or uint32: three takes either)
  if (name === 'skinIndex') return Uint16Array.from(src);
  const kk = d.k || k, q = d.q, rows = d.n / kk, out = new Float32Array(rows * k);
  for (let i = 0, j = 0, o = 0; i < rows; i++, j += kk, o += k) {
    for (let c = 0; c < kk; c++) out[o + c] = q ? q[c] + src[j + c] * q[kk + c] : src[j + c];
    if (kk < k) out[o + 3] = 1; // (a tangent's w)
  }
  return out;
}

export const LOD = { hair: 1.0, far: 1.0 };

// How much of a fighter's hair and beard is drawn, from the camera's distance to his head: all of it in a close-up
// (the presentation, a win, a PUÑETALITY), less of it at the fight's distance, where the outer layer of cards and
// the finest beard shells can't be told apart on a phone's screen. The hair cards are stored inner layers first
// (js/../tools/pipeline/hairgen.py), so drawing the first part keeps the full shape; every other beard shell is left
// out. k: 1 all, down to LOD.far (each quality's floor); LOD.hair caps it (low, medium)
export function detailFor(ch, dist) {
  const near = 1.3, far = 3.6;
  const t = Math.min(1, Math.max(0, (dist - near) / (far - near)));
  const k = Math.min(LOD.hair, 1 - (1 - LOD.far) * t);
  const D = ch.detail || (ch.detail = { k: -1 });
  if (Math.abs(k - D.k) < 0.04 && !(k === 1 && D.k !== 1)) return;
  D.k = k;
  for (const m of Object.values(ch.meshes)) {
    const full = m.userData.lodCount;
    if (full) m.geometry.setDrawRange(0, Math.max(3, Math.floor(full * k / 3) * 3));
    // (the beard's shells: the odd ones go as it gets further)
    const sh = m.userData.shell;
    if (sh != null) m.visible = k > 0.8 || sh % 2 === 0 || sh === m.userData.shells - 1;
  }
}

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
  // parts whose vertices are the same bytes (the head and the body) share one buffer each, on the GPU too
  const shared = new Map();
  const vattr = (d, name, k) => {
    const key = Array.isArray(d) || d.c ? null : name + JSON.stringify(d);
    if (key && shared.has(key)) return shared.get(key);
    const a = new THREE.BufferAttribute(attr(bin, d, name), k);
    if (key) shared.set(key, a);
    return a;
  };
  for (const p of meta.parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', vattr(p.position, 'position', 3));
    g.setAttribute('normal', vattr(p.normal, 'normal', 3));
    g.setAttribute('uv', vattr(p.uv, 'uv', 2));
    g.setAttribute('skinIndex', vattr(p.skinIndex, 'skinIndex', 4));
    g.setAttribute('skinWeight', vattr(p.skinWeight, 'skinWeight', 4));
    g.setIndex(new THREE.BufferAttribute(attr(bin, p.index, 'index'), 1));
    if (p.color) g.setAttribute('color', new THREE.BufferAttribute(attr(bin, p.color, 'color'), 3));
    if (p.tangent) g.setAttribute('tangent', new THREE.BufferAttribute(attr(bin, p.tangent, 'tangent'), 4));
    addSkinCor(g, meta.bones); // the hands turn about their joints (js/anim/corskin.js)
    g.computeBoundingSphere();
    const lodCount = p.mat.lod ? g.index.count : 0;
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
        sm.userData.shell = layer; sm.userData.shells = n;
        sm.castShadow = false; sm.receiveShadow = true; sm.frustumCulled = false; sm.userData.noAO = true;
        sm.bind(skeleton, new THREE.Matrix4());
        group.add(sm);
        meshes[sm.name] = sm;
      }
      continue;
    }
    const mat = makeMaterial(p.mat, base, loadTex, p.name);
    const m = new THREE.SkinnedMesh(g, mat);
    if (lodCount) m.userData.lodCount = lodCount;
    m.name = p.name;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    // (swinging hair casts its shadow from where it is drawn)
    if (mat.userData.sway) m.customDepthMaterial = hairSwayDepth(mat.userData.sway);
    m.bind(skeleton, new THREE.Matrix4());
    group.add(m);
    meshes[p.name] = m;
    if (p.mat.type === 'haircards' || p.mat.type === 'hair') {
      // two-pass hair: the alpha-tested pass above writes depth for the solid core, this blended pass
      // draws the soft strand tips on top without the stipple of alpha-to-coverage
      const soft = mat.clone();
      soft.alphaTest = 0.04; soft.transparent = true; soft.depthWrite = false; soft.forceSinglePass = true;
      soft.onBeforeCompile = mat.onBeforeCompile; soft.customProgramCacheKey = mat.customProgramCacheKey;
      // (a clone copies userData by value: the swing uniform must stay the one the shaders read.) depthAlpha: the
      // depth of field's depth pass counts these strands as solid above it, so the soft tips stay in focus with the
      // head instead of being blurred as background (a dark smudge round the hair and a stippled edge left)
      if (mat.userData.sway) soft.userData.sway = mat.userData.sway;
      soft.userData.depthAlpha = 0.15;
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
  // the hems of coats, jackets and shirts swing (js/anim/clothsway.js; driven by the fighter)
  const clothSway = setupClothSway(meshes, meta);
  return { group, skeleton, bones: boneMap, meshes, meta, rest, clothSway };
}
