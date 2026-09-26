// Procedural accessories attached to bones: glasses, watches, bracelets, necklace, finisher medal.
import * as THREE from 'three';
import { addFighterKey } from '../materials.js';

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function ringShape(w, h, r, t, top = t, bottom = t) {
  const s = roundedRect(w, h, r);
  const hole = roundedRect(w - 2 * t, h - top - bottom, Math.max(0.001, r - t));
  // shift hole for uneven top/bottom thickness
  const pts = hole.getPoints(24).map(p => new THREE.Vector2(p.x, p.y + (bottom - top) / 2));
  s.holes.push(new THREE.Path(pts.reverse()));
  return s;
}

const PER = {
  alejandro: { watch: { side: 'L', color: 0x111111, face: 0x1a1a1a }, bracelets: [{ side: 'R', color: 0x1c2e6e }, { side: 'R', color: 0x6b3b1e, off: 0.012 }], chain: { color: 0xd4a23a } },
  arnau: { watch: null },
  camilo: { watch: { side: 'L', color: 0x222222, face: 0x0d0d0d }, medal: true },
  rafa: { watch: { side: 'L', color: 0x2458c9, face: 0x0d0d0d } },
  zapponi: { watch: { side: 'L', color: 0x111111, face: 0x111111 }, bracelets: [{ side: 'L', color: 0x45d15a, off: -0.03 }] },
  dani: { watch: null, bracelets: [{ side: 'R', color: 0x7a2e24 }] },
};

export class Accessories {
  constructor() {
    this.items = [];
    // lenses only add reflections (additive over black): no milky veil over the eyes
    this.lensMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  }
  attach(ch, style, meta) {
    const R = (n) => ch.rest[n].head;
    const bone = (n) => ch.bones[n];
    const id = meta.id;
    const g = meta.glasses;
    if (g) this.glasses(ch, g);
    const cfg = PER[id] || {};
    if (cfg.watch) this.watch(ch, cfg.watch);
    for (const b of cfg.bracelets || []) this.bracelet(ch, b);
    if (cfg.chain) this.chain(ch, cfg.chain);
    if (cfg.medal) this.medal(ch);
    // accessories receive the character key light like the rest of the fighter
    ch.group.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => addFighterKey(m, ch.fighterKey)); });
  }

  // local offset of a world(rest) point relative to a bone head
  local(ch, boneName, p) { return p.clone().sub(ch.rest[boneName].head); }

  glasses(ch, g) {
    const eL = ch.rest['eye.L'].head, eR = ch.rest['eye.R'].head;
    const c = eL.clone().add(eR).multiplyScalar(0.5);
    const ipd = eL.distanceTo(eR);
    const style = g.style;
    const lw = ipd * (style === 'thick' ? 0.86 : 0.8), lh = lw * (style === 'thick' ? 0.58 : 0.52);
    const t = style === 'thick' ? 0.0045 : style === 'half' ? 0.0028 : 0.0014;
    const depth = style === 'thick' ? 0.004 : 0.0022;
    // g.color is authored in sRGB
    const fc = new THREE.Color().setRGB(...g.color, THREE.SRGBColorSpace);
    const frameMat = style === 'metal'
      ? new THREE.MeshPhysicalMaterial({ color: fc, metalness: 0.85, roughness: 0.3 })
      : new THREE.MeshPhysicalMaterial({ color: fc, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.15, specularIntensity: 0.5 });
    const grp = new THREE.Group();
    const zFront = 0.024;
    for (const sgn of [1, -1]) {
      const cx = sgn * ipd / 2;
      // half-rim (browline): heavy top bar, the bottom of the lens is held by a nylon thread (practically invisible)
      const top = style === 'half' ? t * 1.6 : t, bottom = style === 'half' ? t * 0.12 : t;
      const fg = new THREE.ExtrudeGeometry(ringShape(lw, lh, lh * 0.28, t, top, bottom), { depth, bevelEnabled: style !== 'half', bevelSize: depth * 0.25, bevelThickness: depth * 0.25, bevelSegments: 2, curveSegments: 12 });
      fg.translate(0, 0, -depth / 2);
      const frame = new THREE.Mesh(fg, frameMat);
      frame.position.set(cx, 0, zFront);
      frame.rotation.y = sgn * 0.12; // slight wrap
      grp.add(frame);
      const lens = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(lw - t, lh - t, lh * 0.25)), this.lensMat);
      lens.position.set(cx, 0, zFront - 0.001); lens.rotation.y = sgn * 0.12;
      lens.renderOrder = 5;
      grp.add(lens);
      // temple arm towards the ear
      const armLen = 0.105;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(t * 0.8, style === 'thick' ? 0.007 : 0.003, armLen), frameMat);
      arm.position.set(sgn * (ipd / 2 + lw / 2 + 0.002), lh * 0.18, zFront - armLen / 2);
      arm.rotation.y = -sgn * 0.08;
      grp.add(arm);
      // nose pad
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 6), this.lensMat);
      pad.position.set(sgn * 0.009, -lh * 0.15, zFront - 0.006);
      grp.add(pad);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(ipd - lw * 0.96, t * 0.9, depth), frameMat);
    bridge.position.set(0, lh * 0.18, zFront + 0.002);
    grp.add(bridge);
    grp.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    const headB = ch.bones.head;
    // lens centre slightly below the pupils: the eyes sit in the upper half of the lens, the top rim under the brows
    grp.position.copy(this.local(ch, 'head', c)).add(new THREE.Vector3(0, -0.0025, 0));
    headB.add(grp);
  }

  watch(ch, w) {
    const s = w.side;
    const wr = ch.rest[`wrist.${s}`].head, el = ch.rest[`lowerarm01.${s}`].head;
    const axis = wr.clone().sub(el).normalize();
    const p = wr.clone().addScaledVector(axis, -0.025);
    const grp = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 8, 28), new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.6 }));
    band.scale.set(1, 0.72, 1.6);
    grp.add(band);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.008, 24), new THREE.MeshPhysicalMaterial({ color: w.face, roughness: 0.1, clearcoat: 1, metalness: 0.2 }));
    face.rotation.x = Math.PI / 2; face.position.z = 0.0;
    face.position.set(0, 0.026, 0); face.rotation.set(0, 0, 0);
    grp.add(face);
    const screen = new THREE.Mesh(new THREE.CircleGeometry(0.014, 20), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
    screen.rotation.x = -Math.PI / 2; screen.position.set(0, 0.0305, 0);
    screen.material.color.multiplyScalar(0.35);
    grp.add(screen);
    // orient: torus axis (z) along forearm, face on the back of the wrist (+y-ish)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    grp.quaternion.copy(q);
    grp.rotateZ(s === 'L' ? -0.6 : 0.6);
    grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    grp.position.copy(this.local(ch, `lowerarm02.${s}`, p));
    ch.bones[`lowerarm02.${s}`].add(grp);
  }

  bracelet(ch, b) {
    const s = b.side;
    const wr = ch.rest[`wrist.${s}`].head, el = ch.rest[`lowerarm01.${s}`].head;
    const axis = wr.clone().sub(el).normalize();
    const p = wr.clone().addScaledVector(axis, -0.02 - (b.off || 0));
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0035, 6, 24), new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.7 }));
    m.scale.set(1, 0.75, 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    m.position.copy(this.local(ch, `lowerarm02.${s}`, p));
    m.castShadow = true;
    ch.bones[`lowerarm02.${s}`].add(m);
  }

  chain(ch, c) {
    const n1 = ch.rest.neck01.head, sp = ch.rest.spine01.head;
    const pts = [];
    const cz = n1.z + 0.005;
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(a) * 0.075, n1.y - 0.035 - (Math.cos(a) > 0 ? Math.cos(a) * 0.09 : Math.cos(a) * 0.01), cz + Math.cos(a) * 0.065));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const gold = new THREE.MeshStandardMaterial({ color: c.color, metalness: 1, roughness: 0.22 });
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.0018, 6, true), gold);
    m.position.copy(new THREE.Vector3().sub(ch.rest.spine01.head));
    const pend = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 0.003), gold);
    pend.position.copy(pts[0]).sub(ch.rest.spine01.head).add(new THREE.Vector3(0, -0.012, 0.004));
    ch.bones.spine01.add(m); ch.bones.spine01.add(pend);
  }

  medal(ch) {
    // finisher medal: the ribbon is draped on the actual shirt surface (rest pose) so it never sinks into it
    const n1 = ch.rest.neck01.head;
    const surf = ch.meshes.shirt || ch.meshes.body;
    const P = surf.geometry.attributes.position;
    const frontZ = (x, y) => {
      let best = -Infinity;
      for (let i = 0; i < P.count; i++) {
        const px = P.getX(i), py = P.getY(i), pz = P.getZ(i);
        if (Math.abs(px - x) < 0.014 && Math.abs(py - y) < 0.014 && pz > best) best = pz;
      }
      return best > -Infinity ? best : n1.z + 0.1;
    };
    const grp = new THREE.Group();
    const ribbonMat = new THREE.MeshStandardMaterial({ color: 0x1d4fa8, roughness: 0.55, side: THREE.DoubleSide });
    const drop = 0.19, W = 0.011;
    for (const s of [1, -1]) {
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const x = s * (0.055 * (1 - t) + 0.006 * t), y = n1.y - 0.015 - drop * t;
        pts.push(new THREE.Vector3(x, y, frontZ(x, y) + 0.004));
      }
      const pos = [], idx = [];
      for (let k = 0; k < pts.length; k++) {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
        const tng = b.clone().sub(a).normalize();
        const w = new THREE.Vector3().crossVectors(tng, new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(W);
        pos.push(pts[k].x + w.x, pts[k].y + w.y, pts[k].z, pts[k].x - w.x, pts[k].y - w.y, pts[k].z);
        if (k > 0) { const o = (k - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      grp.add(new THREE.Mesh(g, ribbonMat));
    }
    const gold = new THREE.MeshStandardMaterial({ color: 0xcfa24a, metalness: 1, roughness: 0.3 });
    const my = n1.y - 0.015 - drop - 0.028;
    const med = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.029, 0.004, 32), gold);
    med.rotation.x = Math.PI / 2;
    med.position.set(0, my, frontZ(0, my) + 0.006);
    grp.add(med);
    grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    grp.position.sub(ch.rest.spine01.head);
    ch.bones.spine01.add(grp);
  }

  update() {}
}
