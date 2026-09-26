// Soft contact shadows under the feet: grounds the fighters where the shadow map is too soft or the
// sun grazes the floor. One small decal per foot, fading and widening as the foot leaves the ground.
import * as THREE from 'three';

function blobTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const img = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const r = Math.hypot((x + 0.5) / 32 - 1, (y + 0.5) / 32 - 1);
    const a = Math.pow(Math.max(0, 1 - r), 1.6);
    const i = (y * 64 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

const _p = new THREE.Vector3(), _t = new THREE.Vector3();

export class ContactShadows {
  constructor(scene) {
    this.scene = scene;
    this.tex = blobTex();
    this.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.decals = [];
  }
  ensure(n) {
    while (this.decals.length < n) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: this.tex, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, opacity: 0 }));
      m.renderOrder = -1; m.frustumCulled = false; m.userData.noAO = true;
      this.scene.add(m); this.decals.push(m);
    }
  }
  update(fighters, groundY = 0) {
    this.ensure(fighters.length * 2);
    let k = 0;
    for (const f of fighters) {
      if (f.ragdoll) {
        // knocked out: one soft blob under the body
        const c = f.ragdoll.center();
        const d = this.decals[k++], d2 = this.decals[k++];
        d.visible = true; d2.visible = false;
        d.position.set(c.x, groundY + 0.003, c.z); d.rotation.y = f.yaw || 0;
        d.scale.set(0.9, 1, 1.5); d.material.opacity = 0.42 * Math.max(0, 1 - Math.max(0, c.y - 0.3) / 0.8);
        continue;
      }
      for (const s of ['L', 'R']) {
        const d = this.decals[k++];
        const foot = f.ch.bones[`foot.${s}`], toe = f.ch.bones[`toe1-1.${s}`] || f.ch.bones[`toe2-1.${s}`];
        if (!foot) { d.visible = false; continue; }
        foot.getWorldPosition(_p);
        if (toe) toe.getWorldPosition(_t); else _t.copy(_p).add(new THREE.Vector3(0, 0, 0.15));
        const h = Math.max(0, Math.min(_p.y, _t.y) - groundY - 0.06);
        const k01 = Math.min(1, h / 0.35);
        d.visible = k01 < 1;
        d.position.set((_p.x + _t.x) / 2, groundY + 0.003, (_p.z + _t.z) / 2);
        d.rotation.y = Math.atan2(_t.x - _p.x, _t.z - _p.z);
        const len = Math.max(0.2, Math.hypot(_t.x - _p.x, _t.z - _p.z) * 2.2);
        d.scale.set(0.16 * (1 + k01 * 1.5), 1, len * (1 + k01));
        d.material.opacity = 0.55 * (1 - k01) * (1 - k01);
      }
    }
    for (; k < this.decals.length; k++) this.decals[k].visible = false;
  }
  clear() { for (const d of this.decals) d.visible = false; }
}
