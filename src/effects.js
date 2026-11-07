import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

function makePool(n, factory) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(factory(i));
  return arr;
}

/* =========================================================
   مؤثرات: شرار · دخان · زجاج مكسّر · حتت حديد · آثار فرامل
   ========================================================= */
export class Effects {
  constructor(scene) {
    this.scene = scene;

    const sparkGeo = new THREE.BoxGeometry(0.055, 0.055, 0.22);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcf6b });
    this.sparks = makePool(90, () => {
      const m = new THREE.Mesh(sparkGeo, sparkMat);
      m.visible = false;
      m.userData = { v: new THREE.Vector3(), life: 0, max: 1 };
      scene.add(m);
      return m;
    });

    const smokeGeo = new THREE.SphereGeometry(0.5, 7, 6);
    this.smoke = makePool(40, () => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x8d8a86, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false,
      });
      const m = new THREE.Mesh(smokeGeo, mat);
      m.visible = false;
      m.userData = { v: new THREE.Vector3(), life: 0, max: 1, scale: 1 };
      scene.add(m);
      return m;
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xdfeaf5, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.75,
      clearcoat: 1,
    });
    const glassGeo = new THREE.TetrahedronGeometry(0.09);
    this.shards = makePool(60, () => {
      const m = new THREE.Mesh(glassGeo, glassMat);
      m.visible = false;
      m.userData = { v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, max: 1 };
      scene.add(m);
      return m;
    });

    const chunkGeo = new THREE.BoxGeometry(0.16, 0.08, 0.2);
    const chunkMat = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.6, metalness: 0.6 });
    this.chunks = makePool(40, () => {
      const m = new THREE.Mesh(chunkGeo, chunkMat);
      m.visible = false;
      m.userData = { v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, max: 1 };
      scene.add(m);
      return m;
    });

    // آثار الكاوتش
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x101014, transparent: true, opacity: 0.5, depthWrite: false,
    });
    const skidGeo = new THREE.PlaneGeometry(0.2, 0.55);
    this.skids = makePool(260, () => {
      const m = new THREE.Mesh(skidGeo, skidMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      return m;
    });
    this.skidIdx = 0;

    this._tmp = new THREE.Vector3();
  }

  _take(pool, key) {
    for (const m of pool) if (!m.visible) return m;
    return pool[(Math.random() * pool.length) | 0];
  }

  impact(point, dir, strength, glassBroken) {
    const n = Math.min(26, Math.round(6 + strength * 16));
    for (let i = 0; i < n; i++) {
      const s = this._take(this.sparks);
      s.visible = true;
      s.position.set(point.x, point.y, point.z);
      s.userData.v.set(rand(-7, 7), rand(1, 8), rand(-7, 7)).multiplyScalar(0.5 + strength);
      s.userData.life = 0;
      s.userData.max = rand(0.25, 0.6);
      const k = rand(0.5, 1.4);
      s.scale.setScalar(k);
    }
    const smokeN = Math.min(9, Math.round(2 + strength * 5));
    for (let i = 0; i < smokeN; i++) {
      const s = this._take(this.smoke);
      s.visible = true;
      s.position.set(point.x + rand(-0.3, 0.3), point.y + rand(0, 0.5), point.z + rand(-0.3, 0.3));
      s.userData.v.set(rand(-1.4, 1.4), rand(0.4, 2.2), rand(-1.4, 1.4));
      s.userData.life = 0;
      s.userData.max = rand(0.8, 1.7);
      s.userData.scale = rand(0.35, 0.8) * (0.7 + strength * 0.55);
      s.scale.setScalar(s.userData.scale * 0.4);
      s.material.opacity = 0.26 * Math.min(1.2, 0.5 + strength);
    }
    const chunkN = Math.min(12, Math.round(strength * 8));
    for (let i = 0; i < chunkN; i++) {
      const s = this._take(this.chunks);
      s.visible = true;
      s.position.set(point.x, point.y, point.z);
      s.userData.v.set(rand(-6, 6), rand(2, 7), rand(-6, 6)).multiplyScalar(0.4 + strength * 0.7);
      s.userData.spin.set(rand(-14, 14), rand(-14, 14), rand(-14, 14));
      s.userData.life = 0;
      s.userData.max = rand(1.2, 2.4);
    }
    if (glassBroken) {
      for (let i = 0; i < 18; i++) {
        const s = this._take(this.shards);
        s.visible = true;
        s.position.set(point.x + rand(-0.4, 0.4), point.y + rand(0.1, 0.5), point.z + rand(-0.4, 0.4));
        s.userData.v.set(rand(-5, 5), rand(2, 6), rand(-5, 5));
        s.userData.spin.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));
        s.userData.life = 0;
        s.userData.max = rand(1, 2.2);
      }
    }
  }

  dust(point, strength) {
    const n = Math.min(10, Math.round(2 + strength * 5));
    for (let i = 0; i < n; i++) {
      const s = this._take(this.smoke);
      s.visible = true;
      s.position.set(point.x + rand(-1, 1), 0.15, point.z + rand(-1, 1));
      s.userData.v.set(rand(-2, 2), rand(0.4, 1.4), rand(-2, 2));
      s.userData.life = 0;
      s.userData.max = rand(0.6, 1.3);
      s.userData.scale = rand(0.7, 1.5);
      s.scale.setScalar(0.5);
      s.material.opacity = 0.35;
    }
  }

  smokeTrail(pos, damage) {
    if (Math.random() > Math.min(0.9, damage / 90)) return;
    const s = this._take(this.smoke);
    s.visible = true;
    s.position.set(pos.x + rand(-0.2, 0.2), pos.y + 0.2, pos.z + rand(-0.2, 0.2));
    s.userData.v.set(rand(-0.4, 0.4), rand(0.8, 1.8), rand(-0.4, 0.4));
    s.userData.life = 0;
    s.userData.max = rand(0.7, 1.4);
    s.userData.scale = rand(0.5, 1.0);
    s.scale.setScalar(0.3);
    s.material.opacity = 0.28;
  }

  addSkid(x, z, yaw) {
    const m = this.skids[this.skidIdx];
    this.skidIdx = (this.skidIdx + 1) % this.skids.length;
    m.visible = true;
    m.position.set(x + rand(-0.05, 0.05), 0.012 + Math.random() * 0.004, z);
    m.rotation.z = -yaw;
    m.scale.setScalar(rand(0.8, 1.2));
  }

  update(dt) {
    for (const s of this.sparks) {
      if (!s.visible) continue;
      s.userData.life += dt;
      const u = s.userData;
      if (u.life > u.max) { s.visible = false; continue; }
      u.v.y -= 22 * dt;
      s.position.addScaledVector(u.v, dt);
      if (s.position.y < 0.05) { s.position.y = 0.05; u.v.y *= -0.35; u.v.multiplyScalar(0.7); }
      s.scale.setScalar(Math.max(0.05, 1 - u.life / u.max));
    }
    for (const s of this.smoke) {
      if (!s.visible) continue;
      const u = s.userData;
      u.life += dt;
      if (u.life > u.max) { s.visible = false; continue; }
      s.position.addScaledVector(u.v, dt);
      u.v.multiplyScalar(1 - 1.6 * dt);
      u.v.y += 0.7 * dt;
      const k = u.scale * (0.7 + (u.life / u.max) * 1.5);
      s.scale.setScalar(k);
      s.material.opacity = 0.26 * (1 - u.life / u.max);
      s.rotation.y += dt * 0.4;
    }
    for (const pool of [this.shards, this.chunks]) {
      for (const s of pool) {
        if (!s.visible) continue;
        const u = s.userData;
        u.life += dt;
        if (u.life > u.max) { s.visible = false; continue; }
        u.v.y -= 20 * dt;
        s.position.addScaledVector(u.v, dt);
        s.rotation.x += u.spin.x * dt;
        s.rotation.y += u.spin.y * dt;
        s.rotation.z += u.spin.z * dt;
        if (s.position.y < 0.06) {
          s.position.y = 0.06; u.v.y *= -0.32; u.v.x *= 0.75; u.v.z *= 0.75;
          u.spin.multiplyScalar(0.7);
        }
      }
    }
  }

  reset() {
    for (const pool of [this.sparks, this.smoke, this.shards, this.chunks, this.skids]) {
      for (const m of pool) m.visible = false;
    }
  }
}
