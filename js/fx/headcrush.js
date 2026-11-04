// A head crushed flat (Camilo's PUÑETALITY, js/fight/fatality.js): drawn only. The head bone is squashed (the skull,
// the face, the hair and whatever hangs from it flatten together, as much as what is pressing on it allows), and the
// fighter's materials take the blood: the head soaked dark and wet, a soaked collar at the neck and runs down from it
// over the shoulders, the chest and the back, longer as `run` grows. Patched copies of his materials, made as the move
// starts (their shaders are built behind its moment of black, not at the blow); everything put back with restore().
import * as THREE from 'three';

const NOISE = `
float hcH( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float hcN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hcH( i ), hcH( i + vec2( 1, 0 ) ), f.x ), mix( hcH( i + vec2( 0, 1 ) ), hcH( i + vec2( 1, 1 ) ), f.x ), f.y ); }`;

function crushMaterial(mat, U) {
  const m = mat.clone();
  m.userData = { ...mat.userData };
  // (a clone leaves the defines behind: the beard's shells need theirs, USE_UV)
  if (mat.defines) m.defines = { ...mat.defines };
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  m.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aHead; varying float vHc; varying vec3 vHcP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvHc = aHead; vHcP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vHc; varying vec3 vHcP; uniform float uCrush, uRun, uNeckY;${NOISE}
float headGore( out float fresh ) {
  float n = hcN( vHcP.xy * 60.0 + vHcP.z * 30.0 ) * 0.6 + hcN( vHcP.zy * 150.0 ) * 0.4;
  fresh = n;
  // the head itself, soaked (a few patches less so)
  float hd = smoothstep( 0.15, 0.55, vHc ) * uCrush * smoothstep( 0.1, 0.35, n + 0.25 );
  if ( uRun <= 0.0 ) return hd;
  // a soaked collar where the neck meets the trunk, and runs down from it of different lengths
  float below = uNeckY - vHcP.y;
  float band = ( 1.0 - smoothstep( 0.02 + 0.05 * uRun, 0.05 + 0.1 * uRun, below ) ) * step( -0.03, below ) * step( vHc, 0.6 ) * uRun;
  float ang = atan( vHcP.x, vHcP.z ) * 8.0 + hcN( vec2( below * 25.0, vHcP.x * 9.0 ) ) * 0.7;
  float cell = floor( ang ), f = fract( ang );
  float len = uRun * ( 0.03 + 0.42 * pow( hcH( vec2( cell, 2.7 ) ), 2.5 ) );
  float w = 0.12 + 0.3 * hcH( vec2( cell, 9.1 ) );
  float run = step( 0.0, below ) * ( 1.0 - smoothstep( len * 0.85, len, below ) ) * ( 1.0 - smoothstep( w * 0.6, w, abs( f - 0.5 ) * 2.0 ) );
  return clamp( max( hd, max( band, run ) ), 0.0, 1.0 );
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float hcFresh, hcG = headGore( hcFresh );
        diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.07, 0.002, 0.004 ), vec3( 0.2, 0.007, 0.01 ), hcFresh * smoothstep( 0.3, 0.7, vHc ) ), hcG );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.14, hcG );')
      // (no sheen on blood: on the hair it lit the gore up bright red)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n\t#ifdef USE_SHEEN\n\t\tmaterial.sheenColor *= 1.0 - hcG;\n\t#endif');
    if (!sh.fragmentShader.includes('headGore( hcFresh )')) console.warn('head crush: shader not patched', mat.type);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|crush';
  return m;
}

export class HeadCrush {
  constructor(f) {
    this.f = f; const ch = this.ch = f.ch;
    this.U = { uCrush: { value: 0 }, uRun: { value: 0 }, uNeckY: { value: ch.rest.neck03?.head.y ?? ch.rest.head.head.y - 0.06 } };
    // the head and everything that hangs from it (jaw, eyes, the face's bones)
    const set = new Set(), mark = (b) => { set.add(b); for (const c of b.children) if (c.isBone) mark(c); };
    if (ch.bones.head) mark(ch.bones.head);
    const idx = new Uint8Array(ch.skeleton.bones.length);
    ch.skeleton.bones.forEach((b, i) => { idx[i] = set.has(b) ? 1 : 0; });
    this.items = []; this.hidden = [];
    const done = new WeakMap();
    for (const mesh of Object.values(ch.meshes)) {
      if (!mesh.isSkinnedMesh) continue;
      // (the fur shells of a beard are drawn by layer-made shaders: they go with the crushed head instead)
      if (/beard/i.test(mesh.name)) { this.hidden.push(mesh); continue; }
      // (the hair's cards fanned out into red spikes when flattened: once crushed, the matted, bloody scalp instead)
      if (/hair/i.test(mesh.name)) { this.hidden.push(mesh); continue; }
      const g = mesh.geometry;
      if (!g.attributes.aHead) {
        const SW = g.attributes.skinWeight, SI = g.attributes.skinIndex;
        let a = done.get(SW);
        if (!a) {
          const arr = new Float32Array(SI.count);
          for (let i = 0; i < SI.count; i++) { let w = 0; for (let k = 0; k < 4; k++) if (idx[SI.getComponent(i, k)]) w += SW.getComponent(i, k); arr[i] = w; }
          a = new THREE.BufferAttribute(arr, 1); done.set(SW, a);
        }
        g.setAttribute('aHead', a);
      }
      this.items.push({ mesh, mat: mesh.material, crush: crushMaterial(mesh.material, this.U) });
    }
    for (const it of this.items) it.mesh.material = it.crush;
    this.base = ch.bones.head ? ch.bones.head.scale.clone() : new THREE.Vector3(1, 1, 1);
    this.sy = 1;
  }
  // how far it is crushed (1 whole, ~0.15 flat): never back up again
  squash(sy) {
    sy = Math.min(this.sy, Math.max(0.2, sy));
    this.sy = sy;
    const b = this.ch.bones.head;
    if (!b) return;
    const k = 1 - sy;
    b.scale.set(this.base.x * (1 + 0.3 * k), this.base.y * sy, this.base.z * (1 + 0.22 * k));
    if (sy < 0.8) for (const m of this.hidden) m.visible = false;
  }
  set(crush, run) { this.U.uCrush.value = crush; this.U.uRun.value = run; }
  restore() {
    for (const it of this.items) { it.mesh.material = it.mat; it.crush.dispose(); }
    for (const m of this.hidden) m.visible = true;
    if (this.ch.bones.head) this.ch.bones.head.scale.copy(this.base);
    this.items = [];
  }
}
