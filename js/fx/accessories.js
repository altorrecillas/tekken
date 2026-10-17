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
  // (his phone only comes out in his win pose: "no molestes, estoy trabajando")
  camilo: { watch: { side: 'L', color: 0x222222, face: 0x0d0d0d }, medal: true, phone: { side: 'R', from: 12 } },
  rafa: { watch: { side: 'L', color: 0x2458c9, face: 0x0d0d0d } },
  zapponi: { watch: { side: 'L', color: 0x111111, face: 0x111111 }, bracelets: [{ side: 'L', color: 0x45d15a, off: -0.03 }] },
  dani: { watch: null, bracelets: [{ side: 'R', color: 0x7a2e24 }] },
  // the call-centre headset of her photos, a rose-gold smartwatch on the left wrist, a thin gold bracelet on the right
  noemi: { watch: { side: 'L', color: 0xc99b7a, face: 0x0d0d10, metal: true }, bracelets: [{ side: 'R', color: 0xd4a23a, metal: true, thin: true }], headset: { side: 'R' } },
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
    if (cfg.headset) this.headset(ch, cfg.headset);
    if (cfg.medal) this.medal(ch);
    if (cfg.phone) this.phone(ch, cfg.phone);
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
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 8, 28), w.metal ? new THREE.MeshStandardMaterial({ color: w.color, metalness: 0.9, roughness: 0.32 }) : new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.6 }));
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
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.036, b.thin ? 0.0018 : 0.0035, 6, 24), b.metal ? new THREE.MeshStandardMaterial({ color: b.color, metalness: 1, roughness: 0.25 }) : new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.7 }));
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

  // a call-centre headset on the head bone: the earpiece over one ear (found on the head mesh), the band over the
  // top of the head to a pad above the other ear, pressed into the hair (cfg.press: how far out between the scalp
  // and the hair's outline it rests; 1 = on top of the outline), and the microphone boom curving forward to the
  // corner of the mouth
  headset(ch, cfg) {
    const head = ch.meshes.head?.geometry?.attributes.position, hair = ch.meshes.hair?.geometry?.attributes.position;
    if (!head) return;
    const sg = cfg.side === 'L' ? 1 : -1; // (+x is the character's left)
    const eye = ch.rest[cfg.side === 'L' ? 'eye.L' : 'eye.R'].head, eyeO = ch.rest[cfg.side === 'L' ? 'eye.R' : 'eye.L'].head;
    // the ear: the outermost point of the head at eye height, behind the eye
    let ear = null;
    for (let i = 0; i < head.count; i++) {
      const x = head.getX(i), y = head.getY(i), z = head.getZ(i);
      if (Math.abs(y - eye.y) < 0.035 && z < eye.z - 0.05 && z > eye.z - 0.13 && (!ear || x * sg > ear.x * sg)) ear = new THREE.Vector3(x, y, z);
    }
    if (!ear) return;
    const earO = ear.clone(); earO.x = -ear.x;
    // the outlines of the scalp and of the hair in the plane through both ears: highest point per sideways slice
    const zc = ear.z + 0.012, pts = [];
    const outline = (src) => {
      const top = new Map();
      for (let i = 0; i < src.count; i++) {
        const z = src.getZ(i); if (Math.abs(z - zc) > 0.03) continue;
        const x = src.getX(i), y = src.getY(i), k = Math.round(x / 0.012);
        if (y > ear.y && (!top.has(k) || y > top.get(k))) top.set(k, y);
      }
      return top;
    };
    const scalp = outline(head), hairTop = hair ? outline(hair) : scalp, press = cfg.press ?? 0.5;
    const top = new Map();
    for (const [k, yh] of hairTop) { const ys = scalp.get(k) ?? yh; top.set(k, ys + Math.max(0, yh - ys) * press); }
    const n = 16;
    for (let j = 0; j <= n; j++) {
      const t = j / n, ang = Math.PI * t;
      // a half ellipse from ear to ear, lifted onto the outline where the hair stands higher
      const x = ear.x * Math.cos(ang) * 1.04, yBase = ear.y + 0.02 + Math.sin(ang) * 0.13;
      const k = Math.round(x / 0.012);
      const yt = Math.max(yBase, (top.get(k) ?? top.get(k - 1) ?? top.get(k + 1) ?? yBase) + 0.006);
      pts.push(new THREE.Vector3(x + sg * 0.004, j === 0 || j === n ? ear.y + 0.03 : yt, zc));
    }
    const grp = new THREE.Group();
    const plastic = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.3 });
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.004, 6), plastic));
    // earpiece: a padded cup over the ear, a silver ring on its back
    const cupAxis = new THREE.Vector3(sg, 0, 0);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.034, 0.022, 24), plastic);
    cup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cupAxis); cup.position.copy(ear).addScaledVector(cupAxis, 0.012);
    grp.add(cup);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0025, 6, 24), metal);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), cupAxis); ring.position.copy(ear).addScaledVector(cupAxis, 0.024);
    grp.add(ring);
    // the other end: a small T-pad resting on the head above the other ear
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.05), plastic);
    pad.position.copy(earO).add(new THREE.Vector3(-sg * 0.005, 0.035, 0.012)); grp.add(pad);
    // microphone boom: from the cup forward and down along the cheek to beside the mouth, a foam tip at its end
    const mouth = new THREE.Vector3((eye.x + eyeO.x) / 2 + sg * 0.03, eye.y - 0.075, eye.z + 0.005);
    const b0 = ear.clone().addScaledVector(cupAxis, 0.022).add(new THREE.Vector3(0, -0.012, 0.012));
    const b1 = b0.clone().lerp(mouth, 0.45).add(new THREE.Vector3(sg * 0.03, -0.02, 0.01));
    const b2 = mouth.clone().add(new THREE.Vector3(sg * 0.012, -0.004, 0.02));
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([b0, b1, b2]), 20, 0.0022, 6), metal));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), plastic);
    tip.scale.set(1, 1, 1.4); tip.position.copy(b2); grp.add(tip);
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    grp.position.sub(ch.rest.head.head);
    ch.bones.head.add(grp);
  }

  // a phone held in the palm, its screen lit, for the win pose (Fighter.syncRender shows it from frame `from` of the
  // win clip; hidden everywhere else)
  phone(ch, cfg) {
    const s = cfg.side || 'R', R = (n) => ch.rest[n].head;
    const W = R(`wrist.${s}`), K = R(`finger3-1.${s}`), f2 = R(`finger2-1.${s}`), f5 = R(`finger5-1.${s}`);
    const dir = K.clone().sub(W).normalize(), across = f2.clone().sub(f5).normalize();
    const palm = new THREE.Vector3().crossVectors(dir, across).normalize();
    if (s === 'R') palm.negate();
    const z = palm.clone().addScaledVector(dir, -palm.dot(dir)).normalize(), x = new THREE.Vector3().crossVectors(dir, z);
    const grp = new THREE.Group();
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x15161a, roughness: 0.35, metalness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.15 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.154, 0.009), dark);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.143), new THREE.MeshStandardMaterial({ color: 0x10141c, emissive: 0x6f9cd8, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0 }));
    screen.position.z = 0.0046;
    // the camera module on its back, so that it reads as a phone from the front too (he holds it facing himself)
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.003), new THREE.MeshPhysicalMaterial({ color: 0x2a2c31, roughness: 0.25, metalness: 0.6, clearcoat: 1 }));
    cam.position.set(-0.018, 0.052, -0.006);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.002, 16), new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.05, metalness: 0.2, clearcoat: 1 }));
    lens.rotation.x = Math.PI / 2; lens.position.set(-0.022, 0.056, -0.008);
    const lens2 = lens.clone(); lens2.position.set(-0.014, 0.046, -0.008);
    grp.add(body, screen, cam, lens, lens2);
    // in the palm: lengthwise along the hand, the screen facing out of it (the fingers close round its sides)
    grp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, dir, z));
    grp.position.copy(W).addScaledVector(dir, 0.112).addScaledVector(palm, 0.024).sub(W);
    grp.visible = false;
    grp.userData.from = cfg.from || 0;
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    ch.bones[`wrist.${s}`].add(grp);
    ch.winProp = grp;
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
