// Post-processing chain: scene (MSAA HDR) -> GTAO -> bloom -> cinematic final pass (AgX + grading + lens FX).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

// Clamp material radiance: a grazing clearcoat/metal highlight facing the sun can exceed the HalfFloat range,
// and a single Inf pixel poisons bloom and the baked environment (whole surfaces turn black).
{
  const line = 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );';
  if (THREE.ShaderChunk.opaque_fragment.includes(line))
    THREE.ShaderChunk.opaque_fragment = THREE.ShaderChunk.opaque_fragment.replace(line,
      // NaN fails every comparison, so this also scrubs NaN/Inf (one bad pixel would black out the frame via bloom)
      'gl_FragColor = vec4( all( lessThan( abs( outgoingLight ), vec3( 1e4 ) ) ) ? clamp( outgoingLight, 0.0, 64.0 ) : vec3( 0.0 ), diffuseColor.a );');
  else console.warn('radiance clamp: opaque_fragment pattern not found');
}

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    exposure: { value: 1.0 },
    time: { value: 0 },
    slope: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    offset: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
    power: { value: new THREE.Vector3(1.12, 1.12, 1.12) },
    saturation: { value: 1.1 },
    contrast: { value: 1.1 },
    vignette: { value: 0.32 },
    grain: { value: 0.025 },
    ca: { value: 0.0 },
    hitFlash: { value: 0 },
    desat: { value: 0 },
    radial: { value: 0 },
    radialCenter: { value: new THREE.Vector2(0.5, 0.5) },
    sharpen: { value: 0.12 },
    letterbox: { value: 0 },
    fade: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float exposure, time, saturation, contrast, vignette, grain, ca, hitFlash, desat, radial, sharpen, letterbox, fade;
    uniform vec3 slope, offset, power; uniform vec2 radialCenter;
    varying vec2 vUv;
    const mat3 LIN_TO_2020 = mat3(0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.0880, 0.0433, 0.0113, 0.8956);
    const mat3 R2020_TO_LIN = mat3(1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187);
    vec3 agxContrast(vec3 x){ vec3 x2=x*x; vec3 x4=x2*x2;
      return 15.5*x4*x2 - 40.14*x4*x + 31.96*x4 - 6.868*x2*x + 0.4298*x2 + 0.1191*x - 0.00232; }
    vec3 agx(vec3 c){
      const mat3 inset = mat3(vec3(0.856627153315983,0.137318972929847,0.11189821299995), vec3(0.0951212405381588,0.761241990602591,0.0767994186031903), vec3(0.0482516061458583,0.101439036467562,0.811302368396859));
      const mat3 outset = mat3(vec3(1.1271005818144368,-0.1413297634984383,-0.14132976349843826), vec3(-0.11060664309660323,1.157823702216272,-0.11060664309660294), vec3(-0.016493938717834573,-0.016493938717834257,1.2519364065950405));
      c = LIN_TO_2020 * c; c = inset * c; c = max(c, 1e-10); c = log2(c);
      c = (c + 12.47393) / (4.026069 + 12.47393); c = clamp(c, 0.0, 1.0);
      c = agxContrast(c);
      // ASC CDL look (punchy)
      c = pow(max(vec3(0.0), c * slope + offset), power);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = l + saturation * (c - l);
      c = outset * c; c = pow(max(vec3(0.0), c), vec3(2.2));
      c = R2020_TO_LIN * c;
      return clamp(c, 0.0, 1.0);
    }
    float cmp(float l){ return l / (1.0 + l); }
    vec3 safe(vec3 c){ return all(lessThan(abs(c), vec3(1e4))) ? max(c, 0.0) : vec3(0.0); }
    float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec2 uv = vUv;
      // radial zoom blur for impacts
      vec3 col = vec3(0.0);
      vec2 dir = uv - radialCenter;
      float caAmt = ca + radial * 0.0025;
      if (radial > 0.001) {
        for (int i = 0; i < 8; i++) {
          float t = float(i) / 7.0;
          vec2 u = uv - dir * t * radial * 0.06;
          col += vec3(texture2D(tDiffuse, u + dir*caAmt).r, texture2D(tDiffuse, u).g, texture2D(tDiffuse, u - dir*caAmt).b);
        }
        col /= 8.0;
      } else {
        col = vec3(texture2D(tDiffuse, uv + dir*caAmt).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir*caAmt).b);
      }
      col = safe(col);
      float ex = exposure * (1.0 + hitFlash * 1.6);
      col = agx(col * ex);
      // light sharpening on compressed luminance, applied after tonemapping (in linear HDR a bright sparkle
      // would push its neighbours below zero -> black specks)
      if (sharpen > 0.0) {
        vec2 px = 1.0 / resolution;
        vec3 W = vec3(0.2126, 0.7152, 0.0722);
        float lc = dot(safe(texture2D(tDiffuse, uv).rgb), W) * ex;
        float n = 0.0;
        n += cmp(dot(safe(texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb), W) * ex);
        n += cmp(dot(safe(texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb), W) * ex);
        n += cmp(dot(safe(texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb), W) * ex);
        n += cmp(dot(safe(texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb), W) * ex);
        col = clamp(col + (cmp(lc) - n * 0.25) * sharpen * 1.4, 0.0, 1.0);
      }
      // contrast in log space (a linear pivot at 0.18 would clip everything below ~0.013 to black)
      col = exp2(clamp((log2(max(col, vec3(1e-5))) - log2(0.18)) * contrast + log2(0.18), -16.0, 0.0));
      // KO / slow-mo desaturation towards warm monochrome
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, vec3(l) * vec3(1.08, 0.98, 0.86), desat);
      // vignette
      vec2 v = uv - 0.5; v.x *= resolution.x / resolution.y;
      float vig = smoothstep(0.95, 0.2, length(v));
      col *= mix(1.0 - vignette, 1.0, vig);
      // hit flash: warm lift of the highlights only (exposure bump done before tonemapping)
      col += vec3(0.06, 0.035, 0.0) * hitFlash;
      vec3 s = toSRGB(col);
      // black point: AgX has a soft toe, pull the blacks down a little
      s = max((s - 0.012) / (1.0 - 0.012), 0.0);
      // film grain in display space
      float g = hash(uv * resolution + fract(time * 13.0) * 100.0) - 0.5;
      s += g * grain * (1.0 - l * 0.6);
      // letterbox bars for cinematics
      float lb = letterbox * 0.11;
      if (uv.y < lb || uv.y > 1.0 - lb) s = vec3(0.0);
      s = mix(s, vec3(0.0), fade);
      gl_FragColor = vec4(s, 1.0);
    }`,
};

// Depth of field for the cinematic shots (intro, KO, victory), on three.js's BokehPass with two things of our own:
// - its depth pass: with the pass's shared override material a head of hair was a solid block in the depth (the cards'
//   cut-out ignored), the background kept a sharp halo around it, and a spark or a puff of dust punched a hole of
//   focus in the blur. Here alpha-tested materials (the hair cards) keep their cut-out, and the effects (transparent,
//   additive, sprites, lines, points) stay out of the depth;
// - its blur: a gather over a golden-angle spiral where each sample counts only as far as its own blur reaches the
//   pixel (scatter as gather), so a sharp fighter does not smear a coloured halo over the blurred street behind him;
//   something behind a pixel never spills over it more than the pixel's own blur. The radius is as three's: 0.4 of
//   |distance - focus| x aperture of the screen's width, up to 0.4 x maxblur.
const DOF_FS = `
  #include <common>
  #include <packing>
  varying vec2 vUv;
  uniform sampler2D tColor; uniform sampler2D tDepth;
  uniform float maxblur, aperture, nearClip, farClip, focus;
  uniform vec2 resolution;
  float dist(const in vec2 uv) { return -perspectiveDepthToViewZ(unpackRGBAToDepth(texture2D(tDepth, uv)), nearClip, farClip); }
  float cocPx(const in float d, const in float maxPx) { return min(maxPx, 0.4 * abs(d - focus) * aperture * resolution.x); }
  void main() {
    float maxPx = 0.4 * maxblur * resolution.x;
    float d0 = dist(vUv), s0 = cocPx(d0, maxPx);
    vec3 col = texture2D(tColor, vUv).rgb;
    float tot = 1.0;
    float rs = max(0.5, maxPx * maxPx / 192.0), r = rs, ang = 0.0;
    vec2 px = 1.0 / resolution;
    for (int i = 0; i < 96; i++) {
      if (r > maxPx) break;
      vec2 tc = vUv + vec2(cos(ang), sin(ang)) * r * px;
      vec3 c = texture2D(tColor, tc).rgb;
      float d = dist(tc);
      float s = cocPx(d, maxPx);
      if (d > d0) s = min(s, s0 * 2.0);
      float m = smoothstep(r - rs, r + rs, s);
      col += mix(col / tot, c, m);
      tot += 1.0;
      ang += 2.39996323;
      r += rs / r;
    }
    gl_FragColor = vec4(col / tot, 1.0);
  }`;
class CineDOF extends BokehPass {
  constructor(scene, camera, params) {
    super(scene, camera, params);
    this._depthMats = new Map();
    this._hide = []; this._swap = [];
    this.uniforms.resolution = { value: new THREE.Vector2(1, 1) };
    this.materialBokeh.dispose();
    this.materialBokeh = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: this.materialBokeh.vertexShader, fragmentShader: DOF_FS });
    this._fsQuad.material = this.materialBokeh;
  }
  setSize(w, h) { super.setSize(w, h); this.uniforms.resolution.value.set(w, h); }
  _depthFor(m) {
    if (!m || (!m.alphaTest && !m.alphaMap)) return this._materialDepth;
    let d = this._depthMats.get(m);
    if (!d) {
      d = new THREE.MeshDepthMaterial({ map: m.map, alphaMap: m.alphaMap, alphaTest: m.alphaTest || 0.5, side: m.side, depthPacking: THREE.RGBADepthPacking, blending: THREE.NoBlending });
      this._depthMats.set(m, d);
    }
    return d;
  }
  render(renderer, writeBuffer, readBuffer) {
    const hide = this._hide, swap = this._swap;
    hide.length = 0; swap.length = 0;
    this.scene.traverseVisible((o) => {
      if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO) { hide.push(o); return; }
      if (!o.isMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.transparent || m.blending === THREE.AdditiveBlending) { hide.push(o); return; }
      swap.push(o, o.material);
    });
    for (const o of hide) o.visible = false;
    for (let i = 0; i < swap.length; i += 2) { const m = swap[i + 1]; swap[i].material = Array.isArray(m) ? m.map((x) => this._depthFor(x)) : this._depthFor(m); }
    const oldClear = renderer.getClearColor(this._oldClearColor), oldAlpha = renderer.getClearAlpha(), oldAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(0xffffff); renderer.setClearAlpha(1.0);
    renderer.setRenderTarget(this._renderTargetDepth);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    for (let i = 0; i < swap.length; i += 2) swap[i].material = swap[i + 1];
    for (const o of hide) o.visible = true;
    this.uniforms.tColor.value = readBuffer.texture;
    this.uniforms.nearClip.value = this.camera.near;
    this.uniforms.farClip.value = this.camera.far;
    if (this.renderToScreen) { renderer.setRenderTarget(null); this._fsQuad.render(renderer); }
    else { renderer.setRenderTarget(writeBuffer); renderer.clear(); this._fsQuad.render(renderer); }
    renderer.setClearColor(oldClear); renderer.setClearAlpha(oldAlpha); renderer.autoClear = oldAuto;
  }
  dispose() { super.dispose(); for (const d of this._depthMats.values()) d.dispose(); }
}

export const QUALITY = {
  low: { scale: 0.75, msaa: 0, gtao: false, bloom: true, shadow: 1024, smaa: true },
  medium: { scale: 1.0, msaa: 0, gtao: false, bloom: true, shadow: 2048, smaa: true },
  high: { scale: 1.0, msaa: 4, gtao: true, bloom: true, shadow: 4096, smaa: false },
  ultra: { scale: 1.0, msaa: 8, gtao: true, bloom: true, shadow: 4096, smaa: false, dprMax: 2 },
};

export class PostFX {
  constructor(renderer, scene, camera, quality = 'high') {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.q = QUALITY[quality] || QUALITY.high;
    this.build();
  }
  build() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.q.msaa });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.q.gtao) {
      this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      this.gtao.output = GTAOPass.OUTPUT.Default;
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      // the G-buffer pass draws everything with one normal material (no alpha test), so cards, sprites and
      // transparent FX would occlude as solid quads: dark halos around hair, trails casting AO on the set
      const gtao = this.gtao;
      gtao._overrideVisibility = function () {
        const cache = this._visibilityCache;
        this.scene.traverse((o) => {
          if (!o.visible) return;
          const m = o.material, mm = Array.isArray(m) ? m[0] : m;
          if (o.isPoints || o.isLine || o.isLine2 || o.isSprite || o.userData.noAO || (mm && (mm.transparent || mm.alphaTest > 0 || mm.blending === THREE.AdditiveBlending))) {
            o.visible = false; cache.push(o);
          }
        });
      };
      this.composer.addPass(this.gtao);
    }
    if (this.q.gtao) {
      // depth of field for cinematics only (intro, KO, victory): enabled per frame by the game. (The blur reaches 0.4
      // of maxblur: 0.016 is a background a hundredth of the screen soft, the look of a long lens)
      this.bokeh = new CineDOF(this.scene, this.camera, { focus: 2.0, aperture: 0.0035, maxblur: 0.016 });
      this.bokeh.enabled = false;
      this.composer.addPass(this.bokeh);
    }
    if (this.q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.6, 1.1);
      // clamp what feeds the bloom: specular sparkles become soft glows instead of giant discs, NaN never spreads
      const hp = this.bloom.materialHighPassFilter;
      hp.fragmentShader = hp.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );',
        'vec4 texel = texture2D( tDiffuse, vUv ); texel.rgb = all( lessThan( abs( texel.rgb ), vec3( 1e4 ) ) ) ? min( texel.rgb, vec3( 8.0 ) ) : vec3( 0.0 );');
      if (!hp.fragmentShader.includes('vec3( 8.0 )')) console.warn('bloom clamp: pattern not found');
      hp.needsUpdate = true;
      this.composer.addPass(this.bloom);
    }
    this.final = new ShaderPass(FinalShader);
    this.final.uniforms.resolution.value.set(size.x, size.y);
    this.composer.addPass(this.final);
    if (this.q.smaa) this.composer.addPass(new SMAAPass(size.x, size.y));
    this.u = this.final.uniforms;
  }
  setSize(w, h) {
    this.composer.setSize(w, h);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.u.resolution.value.set(s.x, s.y);
  }
  render(dt) {
    this.u.time.value += dt;
    this.composer.render(dt);
  }
}
