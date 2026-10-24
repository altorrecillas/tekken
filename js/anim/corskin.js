// Centre-of-rotation skinning for the hands. Plain linear blend skinning averages the bone matrices: a point half way
// between two bones turned 100 degrees apart lands on the chord between the two places it could be, close to the
// joint's axis. A closed fist turns the thumb's base 109 degrees, so the skin between the wrist and the thumb sank in
// and folded over itself (a grey crease at the wrist in close-ups), and the knuckles flattened. Here those points
// turn about their joint instead: the joint is carried by the blended matrices, the rest of the offset is turned by
// the blended rotation (quaternions) and scaled by the blended scale (the hands are drawn 1.2 times their size, so
// the bones of a hand and those of its forearm differ in scale and dual quaternions alone would tear them apart).
// The three.js skinning chunks are patched once, for every material (colour, shadow, ambient occlusion, depth of
// field), so all passes deform the skin the same way (in the bones' space, like the plain blend, then brought back
// into the mesh's own with bindMatrixInverse). Each mesh opts in through a 'skinCor' attribute:
// xyz = the point's centre of rotation in bind space, w = 1 - its share of the new skinning. Meshes without it read
// the attribute's default (0, 0, 0, 1) and keep linear blending.
import * as THREE from 'three';

const C = THREE.ShaderChunk;
if (!C.skinning_pars_vertex.includes('skinCor')) {
  C.skinning_pars_vertex = C.skinning_pars_vertex.replace(/#endif\s*$/, `
	attribute vec4 skinCor;
	vec4 pdbQuat( mat3 m ) {
		float t = m[ 0 ][ 0 ] + m[ 1 ][ 1 ] + m[ 2 ][ 2 ];
		if ( t > 0.0 ) { float s = 0.5 / sqrt( t + 1.0 ); return vec4( ( m[ 1 ][ 2 ] - m[ 2 ][ 1 ] ) * s, ( m[ 2 ][ 0 ] - m[ 0 ][ 2 ] ) * s, ( m[ 0 ][ 1 ] - m[ 1 ][ 0 ] ) * s, 0.25 / s ); }
		if ( m[ 0 ][ 0 ] > m[ 1 ][ 1 ] && m[ 0 ][ 0 ] > m[ 2 ][ 2 ] ) { float s = 2.0 * sqrt( 1.0 + m[ 0 ][ 0 ] - m[ 1 ][ 1 ] - m[ 2 ][ 2 ] ); return vec4( 0.25 * s, ( m[ 1 ][ 0 ] + m[ 0 ][ 1 ] ) / s, ( m[ 2 ][ 0 ] + m[ 0 ][ 2 ] ) / s, ( m[ 1 ][ 2 ] - m[ 2 ][ 1 ] ) / s ); }
		if ( m[ 1 ][ 1 ] > m[ 2 ][ 2 ] ) { float s = 2.0 * sqrt( 1.0 + m[ 1 ][ 1 ] - m[ 0 ][ 0 ] - m[ 2 ][ 2 ] ); return vec4( ( m[ 1 ][ 0 ] + m[ 0 ][ 1 ] ) / s, 0.25 * s, ( m[ 2 ][ 1 ] + m[ 1 ][ 2 ] ) / s, ( m[ 2 ][ 0 ] - m[ 0 ][ 2 ] ) / s ); }
		float s = 2.0 * sqrt( 1.0 + m[ 2 ][ 2 ] - m[ 0 ][ 0 ] - m[ 1 ][ 1 ] ); return vec4( ( m[ 2 ][ 0 ] + m[ 0 ][ 2 ] ) / s, ( m[ 2 ][ 1 ] + m[ 1 ][ 2 ] ) / s, 0.25 * s, ( m[ 0 ][ 1 ] - m[ 1 ][ 0 ] ) / s );
	}
	vec3 pdbQRot( vec4 q, vec3 v ) { return v + 2.0 * cross( q.xyz, cross( q.xyz, v ) + q.w * v ); }
	// the blended rotation (signs aligned to the first bone's) and scale of the four bones
	vec4 pdbCorQuat( mat4 a, mat4 b, mat4 c, mat4 d, vec4 w, out float sc ) {
		float sa = length( a[ 0 ].xyz ), sb = length( b[ 0 ].xyz ), sc_ = length( c[ 0 ].xyz ), sd = length( d[ 0 ].xyz );
		vec4 qa = pdbQuat( mat3( a ) / sa ), qb = pdbQuat( mat3( b ) / sb ), qc = pdbQuat( mat3( c ) / max( sc_, 1e-6 ) ), qd = pdbQuat( mat3( d ) / max( sd, 1e-6 ) );
		qb *= sign( dot( qa, qb ) + 1e-9 ); qc *= sign( dot( qa, qc ) + 1e-9 ); qd *= sign( dot( qa, qd ) + 1e-9 );
		sc = w.x * sa + w.y * sb + w.z * sc_ + w.w * sd;
		return normalize( w.x * qa + w.y * qb + w.z * qc + w.w * qd );
	}
#endif`);
  C.skinnormal_vertex = C.skinnormal_vertex.replace('objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;',
    `vec3 pdbN0 = objectNormal;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	if ( skinCor.w < 0.999 ) {
		float pdbS; vec4 pdbQ = pdbCorQuat( boneMatX, boneMatY, boneMatZ, boneMatW, skinWeight, pdbS );
		vec3 pdbN = mat3( bindMatrixInverse ) * pdbQRot( pdbQ, mat3( bindMatrix ) * pdbN0 );
		objectNormal = mix( normalize( objectNormal ), normalize( pdbN ), 1.0 - skinCor.w );
	}`);
  C.skinning_vertex = C.skinning_vertex.replace('transformed = ( bindMatrixInverse * skinned ).xyz;',
    `transformed = ( bindMatrixInverse * skinned ).xyz;
	if ( skinCor.w < 0.999 ) {
		vec4 pdbC = bindMatrix * vec4( skinCor.xyz, 1.0 );
		vec3 pdbCt = ( boneMatX * pdbC * skinWeight.x + boneMatY * pdbC * skinWeight.y + boneMatZ * pdbC * skinWeight.z + boneMatW * pdbC * skinWeight.w ).xyz;
		float pdbS; vec4 pdbQ = pdbCorQuat( boneMatX, boneMatY, boneMatZ, boneMatW, skinWeight, pdbS );
		vec4 pdbP = vec4( pdbQRot( pdbQ, ( skinVertex.xyz - pdbC.xyz ) * pdbS ) + pdbCt, 1.0 );
		transformed = mix( transformed, ( bindMatrixInverse * pdbP ).xyz, 1.0 - skinCor.w );
	}`);
  if (!C.skinning_vertex.includes('pdbCt') || !C.skinnormal_vertex.includes('pdbN0')) console.warn('corskin: skinning chunks not patched');
}

const OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('cor') === '0';

// The centre of rotation of every point the hand bones move (fingers, thumb, palm), from its weights: the joint of
// each parent-child pair of its bones (the child's head), or the middle of two sibling bones' heads (the palm's
// metacarpals and the thumb's base all hang from the wrist), averaged by the product of their weights. The share of
// the new skinning grows with the hand bones' weight, so it fades to plain blending on the forearm.
const corOf = new WeakMap(); // one per skin weights (parts sharing their vertices share it too)
export function addSkinCor(g, bones) {
  if (OFF) return;
  const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, n = SI.count;
  if (corOf.has(SW)) { const c = corOf.get(SW); if (c) g.setAttribute('skinCor', c); return; }
  const hand = bones.map(b => /^(finger|metacarpal)/.test(b.name));
  const anc = (a, b) => { for (let p = bones[b].parent; p >= 0; p = bones[p].parent) if (p === a) return true; return false; };
  const out = new Float32Array(n * 4);
  let any = false;
  for (let i = 0; i < n; i++) {
    out[i * 4 + 3] = 1;
    let hw = 0;
    for (let k = 0; k < 4; k++) if (hand[SI.getComponent(i, k)]) hw += SW.getComponent(i, k);
    if (hw <= 0) continue;
    let cx = 0, cy = 0, cz = 0, cw = 0;
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const ia = SI.getComponent(i, a), ib = SI.getComponent(i, b), w = SW.getComponent(i, a) * SW.getComponent(i, b);
      if (!(w > 0) || ia === ib) continue;
      let h;
      if (anc(ia, ib)) h = bones[ib].head;
      else if (anc(ib, ia)) h = bones[ia].head;
      else h = [(bones[ia].head[0] + bones[ib].head[0]) / 2, (bones[ia].head[1] + bones[ib].head[1]) / 2, (bones[ia].head[2] + bones[ib].head[2]) / 2];
      cx += h[0] * w; cy += h[1] * w; cz += h[2] * w; cw += w;
    }
    if (cw <= 0) continue; // one bone only: nothing to blend
    const x = Math.min(1, hw / 0.2), share = x * x * (3 - 2 * x);
    out[i * 4] = cx / cw; out[i * 4 + 1] = cy / cw; out[i * 4 + 2] = cz / cw; out[i * 4 + 3] = 1 - share;
    any = true;
  }
  const c = any ? new THREE.BufferAttribute(out, 4) : null;
  corOf.set(SW, c);
  if (c) g.setAttribute('skinCor', c);
}
