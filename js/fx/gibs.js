// A fighter blown apart (Dani's PUÑETALITY, js/fight/fatality.js): drawn only.
//
// First his chest swells under the blow (the trunk's bones scaled up, everything they carry scaled back down so the
// head and the arms keep their size), then he bursts. The trunk is gone, into the blood and the bits of
// js/fx/blood.js; the head, the arms and the thighs fly off as pieces of his own body; the lower legs, shoes and all,
// stay standing a moment where he was and then topple. Each piece is a copy of the meshes that draw that part (the one
// skeleton, frozen at the burst) keeping only its own region's triangles (the strongest weighted bone group of each
// vertex), hung from a group of its own that a little rigid body moves (gravity, the floor, a spin that dies down,
// limbs settling flat). The torn ends: seen into, a piece's inner walls are wet red meat, and its skin is soaked dark
// round them. Accessories go with the bones they hang from.
import * as THREE from 'three';

const G = 9.81, DT = 1 / 60;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4();
function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// regions: 0 the trunk (it goes), the pieces; roots: the bones whose subtrees they are (later ones take bones from
// earlier ones: the shins out of the thighs)
const REGIONS = [
  { name: 'head', roots: ['neck01'], pts: [['head', 0, 0.09, 0.02, 0.1], ['neck02', 0, 0, 0, 0.06]] },
  { name: 'armL', roots: ['shoulder01.L'], pts: [['upperarm01.L', 0, 0, 0, 0.06], ['lowerarm01.L', 0, 0, 0, 0.05], ['wrist.L', 0, 0, 0, 0.045], ['finger3-2.L', 0, 0, 0, 0.03]] },
  { name: 'armR', roots: ['shoulder01.R'], pts: [['upperarm01.R', 0, 0, 0, 0.06], ['lowerarm01.R', 0, 0, 0, 0.05], ['wrist.R', 0, 0, 0, 0.045], ['finger3-2.R', 0, 0, 0, 0.03]] },
  { name: 'thighL', roots: ['upperleg01.L'], pts: [['upperleg01.L', 0, 0, 0, 0.085], ['lowerleg01.L', 0, 0, 0, 0.065]] },
  { name: 'thighR', roots: ['upperleg01.R'], pts: [['upperleg01.R', 0, 0, 0, 0.085], ['lowerleg01.R', 0, 0, 0, 0.065]] },
  { name: 'shinL', roots: ['lowerleg01.L'], pts: [['lowerleg01.L', 0, 0, 0, 0.06], ['foot.L', 0, 0, 0, 0.05], ['toe3-1.L', 0, 0, 0, 0.035]], stand: true },
  { name: 'shinR', roots: ['lowerleg01.R'], pts: [['lowerleg01.R', 0, 0, 0, 0.06], ['foot.R', 0, 0, 0, 0.05], ['toe3-1.R', 0, 0, 0, 0.035]], stand: true },
];
// the trunk's bones that swell, and how much each (of the full swelling)
const SWELL = [['spine04', 0.55], ['spine03', 0.85], ['spine02', 1.0], ['spine01', 0.9]];

const NOISE = `
float gbH( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float gbN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( gbH( i ), gbH( i + vec2( 1, 0 ) ), f.x ), mix( gbH( i + vec2( 0, 1 ) ), gbH( i + vec2( 1, 1 ) ), f.x ), f.y ); }`;
const VDECL = 'attribute float aGib; attribute float aGibEdge; flat varying float vGib; varying float vGibEdge; varying vec3 vGibP;\n';
const VBODY = 'vGib = aGib; vGibEdge = aGibEdge; vGibP = position;\n';
const FDECL = 'flat varying float vGib; varying float vGibEdge; varying vec3 vGibP; uniform float uGib, uGibBlood;\n' + NOISE;
// (a piece keeps only its own region's triangles: uGib < 0 keeps nothing, the pieces before the burst)
const CLIP = 'if ( uGib < 0.0 || abs( vGib - uGib ) > 0.5 ) discard;\n';

function pieceMaterial(mat, U) {
  const m = mat.clone();
  m.userData = { ...mat.userData };
  // (a clone leaves the defines behind: the beard's shells need theirs, USE_UV)
  if (mat.defines) m.defines = { ...mat.defines };
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  m.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r);
    sh.uniforms.uGib = U.gib; sh.uniforms.uGibBlood = U.blood;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VDECL).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VBODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FDECL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + CLIP + `
        // soaked round the torn end, and splashed all over with what burst out of him
        float gbE = smoothstep( 0.04, 0.22, vGibEdge + 0.08 * gbN( vGibP.xy * 60.0 ) );
        float gbS = uGibBlood * smoothstep( 0.62, 0.7, gbN( vGibP.xy * 45.0 + vGibP.z * 20.0 ) * 0.7 + gbN( vGibP.zy * 130.0 ) * 0.3 );
        float gbB = max( gbE, gbS );`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.1, 0.003, 0.005 ), gbB * 0.95 );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.15, gbB );')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n\t#ifdef USE_SHEEN\n\t\tmaterial.sheenColor *= 1.0 - gbB;\n\t#endif');
    if (!sh.fragmentShader.includes('gbB * 0.95')) console.warn('gibs: shader not patched', mat.type);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|gib';
  return m;
}
// the inside of a piece, seen through its torn end: wet, lumpy red meat, darker deep in
function meatMaterial(U) {
  const m = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGib = U.gib; sh.uniforms.uGibBlood = U.blood;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VDECL).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VBODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FDECL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + CLIP)
      .replace('#include <opaque_fragment>', `
        float n = gbN( vGibP.xy * 80.0 + vGibP.z * 40.0 ) * 0.6 + gbN( vGibP.zx * 210.0 ) * 0.4;
        vec3 meat = mix( vec3( 0.09, 0.004, 0.006 ), vec3( 0.3, 0.025, 0.025 ), n );
        meat = mix( meat, vec3( 0.55, 0.45, 0.33 ), smoothstep( 0.82, 0.9, n ) * 0.6 );
        outgoingLight = meat * ( 0.55 + 0.45 * n ) + vec3( 0.9, 0.7, 0.7 ) * pow( n, 12.0 ) * 0.6;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'gibMeat';
  return m;
}

export class GibBody {
  constructor(scene, f, seed = 7) {
    this.scene = scene; this.f = f; this.ch = f.ch; this.R = rng(seed);
    this.on = false; this.burst = false; this.stepN = 0;
    this._build();
  }

  _build() {
    const ch = this.ch, bones = ch.skeleton.bones;
    // each bone's region (later regions take their subtrees from earlier ones)
    const regOf = new Map();
    for (const b of bones) regOf.set(b, 0);
    REGIONS.forEach((R, i) => {
      const mark = (b) => { regOf.set(b, i + 1); for (const c of b.children) if (c.isBone) mark(c); };
      for (const n of R.roots) if (ch.bones[n]) mark(ch.bones[n]);
    });
    this.regOf = regOf;
    const ri = new Uint8Array(bones.length);
    bones.forEach((b, i) => { ri[i] = regOf.get(b); });
    const done = new WeakMap();
    this.items = []; this.pieces = REGIONS.map((R, i) => ({ R, id: i + 1, meshes: [], caps: [], group: new THREE.Group(), U: { gib: { value: -1 }, blood: { value: 0 } } }));
    for (const P of this.pieces) { P.group.matrixAutoUpdate = false; P.group.name = 'gib_' + P.R.name; }
    for (const mesh of Object.values(ch.meshes)) {
      if (!mesh.isSkinnedMesh) continue;
      const g = mesh.geometry;
      const SW = g.attributes.skinWeight, SI = g.attributes.skinIndex;
      let at = done.get(SW);
      if (!at) {
        const n = SI.count, reg = new Float32Array(n), edge = new Float32Array(n), acc = new Float32Array(REGIONS.length + 1);
        for (let i = 0; i < n; i++) {
          acc.fill(0);
          for (let k = 0; k < 4; k++) acc[ri[SI.getComponent(i, k)]] += SW.getComponent(i, k);
          let best = 0; for (let r = 1; r < acc.length; r++) if (acc[r] > acc[best]) best = r;
          reg[i] = best; edge[i] = 1 - acc[best];
        }
        at = [new THREE.BufferAttribute(reg, 1), new THREE.BufferAttribute(edge, 1)]; done.set(SW, at);
      }
      g.setAttribute('aGib', at[0]); g.setAttribute('aGibEdge', at[1]);
      // which regions this part draws
      const I = g.index, A = at[0].array, has = new Set();
      for (let t = 0, n = I ? I.count : A.length; t < n; t++) has.add(A[I ? I.getX(t) : t]);
      this.items.push({ mesh });
      const solid = !(mesh.material.transparent || mesh.material.alphaTest > 0) && !/beard|lash|eye|cornea|teeth/i.test(mesh.name);
      for (const P of this.pieces) {
        if (!has.has(P.id)) continue;
        const copy = new THREE.SkinnedMesh(g, pieceMaterial(mesh.material, P.U));
        copy.name = mesh.name + '_' + P.R.name;
        copy.bindMode = THREE.DetachedBindMode; copy.bind(ch.skeleton, new THREE.Matrix4()); copy.bindMatrixInverse.identity();
        copy.renderOrder = mesh.renderOrder; copy.castShadow = solid && mesh.castShadow; copy.receiveShadow = true; copy.frustumCulled = false;
        copy.userData = { ...mesh.userData, noGTAO: true };
        P.group.add(copy); P.meshes.push(copy);
        if (solid) {
          const cap = new THREE.SkinnedMesh(g, meatMaterial(P.U));
          cap.bindMode = THREE.DetachedBindMode; cap.bind(ch.skeleton, new THREE.Matrix4()); cap.bindMatrixInverse.identity();
          cap.frustumCulled = false; cap.castShadow = false; cap.userData.noGTAO = true; cap.name = copy.name + '_meat';
          P.group.add(cap); P.caps.push(cap);
        }
      }
    }
  }

  // the pieces into the scene (drawing nothing yet): their shaders are built now, behind the move's moment of black
  begin() {
    if (this.on) return;
    this.on = true;
    for (const P of this.pieces) { P.group.matrix.identity(); this.scene.add(P.group); P.group.updateMatrixWorld(true); }
    this.base = {};
    for (const [n] of SWELL) if (this.ch.bones[n]) this.base[n] = this.ch.bones[n].scale.clone();
  }

  // the chest swelling (k 0..1, wob: a wobble of the surface), drawn on the pose of the frame (after it is posed)
  swell(k, wob = 0) {
    const B = this.ch.bones;
    let acc = 1;
    for (const [n, w] of SWELL) {
      const b = B[n]; if (!b) continue;
      const s = 1 + 0.55 * k * w * (1 + wob);
      // (each scale relative to the parent's: the bone's own swelling over what its parent already has)
      const rel = s / acc;
      b.scale.set(rel, 1 + (rel - 1) * 0.55, rel * 1.08);
      acc = s;
    }
    // what spine01 carries keeps its size
    const top = B.spine01;
    if (top) for (const c of top.children) if (c.isBone && !SWELL.some(([n]) => n === c.name)) c.scale.setScalar(1 / acc);
    this.swollen = acc;
    this.ch.group.updateMatrixWorld(true);
  }

  // he bursts (at the body as last drawn): c, where from
  explode(c) {
    const ch = this.ch, R = this.R;
    this.burst = true; this.c0 = c.clone();
    ch.group.updateMatrixWorld(true);
    for (const it of this.items) { it.vis = it.mesh.visible; it.mesh.visible = false; }
    // accessories ride with the bones they hang from (the trunk's are gone with it)
    this.carried = [];
    for (const b of ch.skeleton.bones) for (const o of [...b.children]) {
      if (o.isBone) continue;
      const reg = this.regOf.get(b);
      if (!reg) { o.userData.gibVis = o.visible; o.visible = false; this.carried.push({ o, b, gone: true }); continue; }
      const holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.matrix.copy(b.matrixWorld);
      b.remove(o); holder.add(o); this.pieces[reg - 1].group.add(holder);
      this.carried.push({ o, b, holder });
    }
    for (const P of this.pieces) {
      P.U.gib.value = P.id; P.U.blood.value = 0.9;
      // its points (world, at the burst) and its centre
      P.pts = P.R.pts.filter(([n]) => ch.bones[n]).map(([n, x, y, z, r]) => {
        const b = ch.bones[n], p = new THREE.Vector3(x, y, z).applyQuaternion(b.getWorldQuaternion(_q)).add(b.getWorldPosition(_v));
        return { p0: p.clone(), r };
      });
      const c0 = P.pts.reduce((a, q) => a.add(q.p0), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, P.pts.length));
      P.c0 = c0; P.p = c0.clone(); P.prev = c0.clone(); P.q = new THREE.Quaternion(); P.prevQ = new THREE.Quaternion();
      for (const q of P.pts) q.l = q.p0.clone().sub(c0);
      // flung out from the chest, up, spinning
      const out = c0.clone().sub(c).setY(0);
      if (out.lengthSq() < 1e-4) out.set(R() - 0.5, 0, R() - 0.5);
      out.normalize();
      const sp = P.R.name === 'head' ? 5.5 : 3.5 + R() * 2.5;
      P.v = out.multiplyScalar(sp).add(new THREE.Vector3((R() - 0.5) * 1.5, (P.R.name === 'head' ? 5.5 : 2.5) + R() * 2.5, (R() - 0.5) * 1.5));
      P.w = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(8 + R() * 10);
      P.landed = 0; P.rest = false; P.hits = 0;
      // the lower legs stay standing, and fall a moment later (each its own moment and way)
      if (P.R.stand) { P.v.set(0, 0, 0); P.w.set(0, 0, 0); P.standT = 50 + Math.floor(R() * 25); P.fall = null; }
    }
    this.stepN = 0;
    this._draw(1);
  }

  // one frame; onLand(piece, speed) when a piece hits the floor
  step(onLand) {
    if (!this.burst) return;
    this.stepN++;
    for (const P of this.pieces) {
      P.prev.copy(P.p); P.prevQ.copy(P.q);
      if (P.R.stand) { this.topple(P, onLand); continue; }
      if (P.rest) continue;
      P.v.y -= G * DT;
      P.p.addScaledVector(P.v, DT);
      if (P.w.lengthSq() > 1e-6) P.q.premultiply(_q.setFromAxisAngle(_v.copy(P.w).normalize(), P.w.length() * DT));
      // the floor: its lowest point
      let pen = 0;
      for (const q of P.pts) { const y = _v.copy(q.l).applyQuaternion(P.q).add(P.p).y - q.r; if (y < pen) pen = y; }
      if (pen < 0) {
        P.p.y -= pen;
        const sp = -P.v.y;
        if (sp > 0.8 && P.hits < 3) { P.hits++; onLand?.(P, sp); }
        P.v.y = Math.max(0, sp) * 0.22; P.v.x *= 0.55; P.v.z *= 0.55; P.w.multiplyScalar(0.45);
        // a limb settles flat along the floor: its long axis turned level
        if (P.pts.length > 1) {
          const a = _v.copy(P.pts[P.pts.length - 1].l).sub(P.pts[0].l).applyQuaternion(P.q).normalize();
          const lev = _w.set(a.x, 0, a.z);
          if (lev.lengthSq() > 1e-4) { lev.normalize(); P.q.premultiply(_q.setFromUnitVectors(a, lev).slerp(new THREE.Quaternion(), 0.65)); }
        }
        if (++P.landed > 10 && P.v.lengthSq() < 0.02 && P.w.lengthSq() < 0.5) P.rest = true;
      }
    }
  }
  // a lower leg standing on its own: it wobbles, then tips over round the edge of its shoe and drops flat
  topple(P, onLand) {
    if (this.stepN < P.standT) return;
    if (!P.fall) {
      const a = this.R() * Math.PI * 2;
      P.fall = { axis: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), th: 0, w: 0.4, pivot: P.pts[1].p0.clone().setY(0) };
    }
    const F = P.fall;
    if (F.done) return;
    F.w += 9 * Math.sin(Math.max(0.05, F.th)) * DT * 2.2;
    F.th = Math.min(1.42, F.th + F.w * DT);
    P.q.setFromAxisAngle(F.axis, F.th);
    P.p.copy(P.c0).sub(F.pivot).applyQuaternion(P.q).add(F.pivot);
    if (F.th >= 1.42) { F.done = true; onLand?.(P, 2.2); }
  }

  // drawn (alpha: between the last two frames)
  sync(alpha) {
    if (!this.burst) return;
    this._draw(alpha);
  }
  _draw(alpha) {
    for (const P of this.pieces) {
      const p = _v.lerpVectors(P.prev, P.p, alpha), q = _q.slerpQuaternions(P.prevQ, P.q, alpha);
      // C = T(p) R(q) T(-c0): the body as burst, carried where the piece is
      P.group.matrix.makeRotationFromQuaternion(q).setPosition(p).multiply(_m.makeTranslation(-P.c0.x, -P.c0.y, -P.c0.z));
      P.group.matrixWorldNeedsUpdate = true;
      P.group.updateMatrixWorld(true);
    }
  }
  // where a piece's torn end is now (world): the first of its points
  end(P, out) { return out.copy(P.pts[0].l).applyQuaternion(P.q).add(P.p); }

  restore() {
    for (const it of this.items) it.mesh.visible = it.vis ?? true;
    for (const c of this.carried || []) { if (c.gone) c.o.visible = c.o.userData.gibVis ?? true; else { c.holder.remove(c.o); c.b.add(c.o); } }
    this.carried = [];
    for (const P of this.pieces) {
      this.scene.remove(P.group);
      for (const m of [...P.meshes, ...P.caps]) m.material.dispose();
    }
    const B = this.ch.bones;
    for (const n in this.base || {}) B[n].scale.copy(this.base[n]);
    if (B.spine01) for (const c of B.spine01.children) if (c.isBone && !SWELL.some(([n]) => n === c.name)) c.scale.setScalar(1);
    this.on = false;
  }
}
