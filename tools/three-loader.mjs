const GAME = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: 'file://' + GAME + '/vendor/three/build/three.module.js', shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: 'file://' + GAME + '/vendor/three/jsm/' + spec.slice(13), shortCircuit: true };
  return next(spec, ctx);
}
