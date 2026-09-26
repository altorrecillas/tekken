// Fight sun: a SunLight whose two shadow cascades are laid out for a fighting stage instead of view-depth splits.
// Cascade 0 is a small, high resolution tile that follows the fighters; cascade 1 is a wide tile that covers the
// surrounding set (buildings, trees, props). The shader picks the fine tile wherever it covers the fragment and
// blends into the wide one at its border, so environment shadows are consistent everywhere on screen.
import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { SunLightShadow } from 'three/addons/lights/SunLightShadow.js';

// cascade data per tile: ( atlas uMin, atlas uMax, normal offset in metres, depth bias )
const SUN_SHADOW_GLSL = /* glsl */`
		#if defined( SHADOWMAP_TYPE_PCF )
		float sunTileFilter( sampler2DShadow map, vec2 mapSize, float bias, float radius, vec4 c ) {
			vec3 sc = c.xyz / c.w;
			sc.z += bias;
			if ( sc.z > 1.0 ) return 1.0;
			vec2 r = radius / mapSize;
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			float s = 0.0;
			for ( int i = 0; i < 6; i ++ ) s += texture( map, vec3( sc.xy + vogelDiskSample( i, 6, phi ) * r, sc.z ) );
			return s / 6.0;
		}
		#else
		float sunTileFilter( sampler2D map, vec2 mapSize, float bias, float radius, vec4 c ) {
			return getShadow( map, mapSize, 1.0, bias, radius, c );
		}
		#endif
		float sunTileWeight( vec2 uv, vec2 ur, float vMin, float band ) {
			vec2 lo = vec2( ur.x, vMin ), hi = vec2( ur.y, 1.0 - vMin );
			vec2 e = min( uv - lo, hi - uv ) / ( hi - lo );
			return smoothstep( 0.0, band, min( e.x, e.y ) );
		}
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			int o = shadowIndex * SUN_LIGHT_CASCADES;
			vec4 d0 = sunShadowCascade[ o ];
			vec4 d1 = sunShadowCascade[ o + 1 ];
			vec3 wp = vSunShadowWorldPosition.xyz;
			vec3 wn = vSunShadowWorldNormal;
			vec4 c0 = sunShadowMatrix[ o ] * vec4( wp + wn * d0.z, 1.0 );
			vec4 c1 = sunShadowMatrix[ o + 1 ] * vec4( wp + wn * d1.z, 1.0 );
			float w0 = sunTileWeight( c0.xy / c0.w, d0.xy, 2.0 * d0.x, 0.1 );
			float w1 = sunTileWeight( c1.xy / c1.w, d1.xy, 2.0 * d1.x - 1.0, 0.06 );
			float s0 = 1.0;
			float s1 = 1.0;
			if ( w0 > 0.0 ) s0 = sunTileFilter( shadowMap, sunLightShadow.shadowMapSize, d0.w, sunLightShadow.shadowRadius, c0 );
			if ( w0 < 1.0 && w1 > 0.0 ) s1 = mix( 1.0, sunTileFilter( shadowMap, sunLightShadow.shadowMapSize, d1.w, sunLightShadow.shadowRadius * 0.75, c1 ), w1 );
			return mix( 1.0, mix( s1, s0, w0 ), sunLightShadow.shadowIntensity );
		}
`;

let patchState = null;
function patchShaderChunk() {
  if (patchState !== null) return patchState;
  const src = THREE.ShaderChunk.shadowmap_pars_fragment;
  const a = src.indexOf('float getSunShadow(');
  const endMark = 'return shadow;\n\t\t}';
  const b = a < 0 ? -1 : src.indexOf(endMark, a);
  if (a < 0 || b < 0) { console.warn('fight sun: getSunShadow not found, using a directional light'); return (patchState = false); }
  THREE.ShaderChunk.shadowmap_pars_fragment = src.slice(0, a) + SUN_SHADOW_GLSL.trim() + src.slice(b + endMark.length);
  return (patchState = true);
}

const _zero = new THREE.Vector3();
const _toSun = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3();
const _c = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _rotT = new THREE.Matrix4();

class FightSunShadow extends SunLightShadow {
  constructor() {
    super();
    this.center = new THREE.Vector3();   // fight centre, the fine tile follows it
    this.nearRadius = 2.6;               // half size of the fine tile (m)
    this.farRadius = 60;                 // half size of the wide tile (m)
    this.reach = 70;                     // casters this far towards the sun are captured (m)
    this.nearOffset = 0.015; this.farOffset = 0.09;   // normal offsets (m)
    this.nearBias = 0.006; this.farBias = 0.05;       // depth bias (m)
  }

  updateMatrices(light) {
    const inset = Math.min(0.25, (Math.ceil(this.radius) + 2) / this.mapSize.x);
    for (let i = 0; i < 2; i++) this._viewports[i].set(i + inset, inset, 1 - 2 * inset, 1 - 2 * inset);
    const res = this.mapSize.x * (1 - 2 * inset);
    _toSun.setFromMatrixPosition(light.matrixWorld).normalize();
    _dir.copy(_toSun).negate();
    _up.set(0, 1, 0); if (Math.abs(_up.dot(_dir)) > 0.99) _up.set(0, 0, 1);
    _rot.lookAt(_zero, _dir, _up); _rotT.copy(_rot).transpose();
    for (let i = 0; i < 2; i++) {
      const r = i === 0 ? this.nearRadius : this.farRadius;
      const texel = 2 * r / res;
      _c.copy(this.center).applyMatrix4(_rotT);
      // snap to the texel grid so edges do not crawl while the fighters move
      _c.x = Math.round(_c.x / texel) * texel; _c.y = Math.round(_c.y / texel) * texel;
      const up = this.reach + (i === 0 ? r : r * 0.9);
      _c.z += up; _c.applyMatrix4(_rot);
      const cam = this._cameras[i];
      cam.position.copy(_c); cam.quaternion.setFromRotationMatrix(_rot);
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
      cam.near = 0.5; cam.far = up + (i === 0 ? r + 3 : r + 20);
      cam.coordinateSystem = this.camera.coordinateSystem; cam._reversedDepth = this.camera.reversedDepth;
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      this._updateMatrix(cam, this._matrices[i], this._frustums[i], this._viewports[i]);
      const bias = (i === 0 ? this.nearBias : this.farBias) / (cam.far - cam.near);
      this._cascadeData[i].set((i + inset) / 2, (i + 1 - inset) / 2, i === 0 ? this.nearOffset : this.farOffset, -bias);
    }
  }
}

// Returns a light with the same follow interface for both paths: sun.shadow.center / nearRadius drive the fine tile.
export function createFightSun(color, intensity, mapSize = 2048) {
  if (!patchShaderChunk()) {
    const d = new THREE.DirectionalLight(color, intensity);
    d.castShadow = true; d.shadow.mapSize.set(mapSize * 2, mapSize * 2);
    d.shadow.bias = -0.0004; d.shadow.normalBias = 0.02; d.shadow.radius = 2.2;
    d.userData.fallback = true;
    return d;
  }
  const sun = new SunLight(color, intensity);
  sun.shadow.dispose();
  sun.shadow = new FightSunShadow();
  sun.shadow.mapSize.set(mapSize, mapSize);
  sun.shadow.radius = 2.2;
  sun.castShadow = true;
  return sun;
}

// Point the sun (unit vector towards it) and centre the fine shadow tile on the fight.
export function aimFightSun(sun, sunDir, center, radius) {
  if (sun.userData.fallback) {
    const sc = sun.shadow.camera, r = radius;
    if (Math.abs(sc.right - r) > 0.05) { sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 0.5; sc.far = 90; sc.updateProjectionMatrix(); }
    sun.target.position.copy(center); sun.position.copy(center).addScaledVector(sunDir, 40);
    return;
  }
  sun.position.copy(sunDir);
  sun.shadow.center.copy(center);
  sun.shadow.nearRadius = radius;
}
