import * as CANNON from 'cannon-es';
import { LANES, MATS, BARRIER_X } from './physics.js';
import * as THREE from 'three';
import { createVehicleModel, randomTrafficColor, dentGeometry } from './carModels.js';

const X_AXIS = new THREE.Vector3(1, 0, 0);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* =========================================================
   عربية مرور واحدة
   - وهي بعيدة/ماشية طبيعي: بنتحكم في سرعتها مباشرة (زي الكينماتيك)
     عشان الطريق يمشي بسلاسة ومفيش عربيات بتقف.
   - أول ما تتخبط: بتتحول لجسم فيزيا حر تمامًا (مومنتوم + دوران + تلف).
   ========================================================= */
class TrafficCar {
  constructor(def, world, scene, assets) {
    this.def = def;
    this.world = world;
    this.assets = assets;
    this.model = createVehicleModel(assets, def);
    this.group = this.model.group;
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    scene.add(this.group);
    this.color = randomTrafficColor(def);
    this.repaint(this.color);

    const { L, W, H } = this.model.dims;
    const hx = W * 0.46, ty = H * 0.34, hz = L * 0.46;
    this.offsetY = ty;

    this.body = new CANNON.Body({
      mass: def.mass,
      material: MATS.car,
      linearDamping: 0.02,
      angularDamping: 0.42,
      allowSleep: false,
    });
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(hx, ty, hz)));
    this.body.position.set(0, ty + 0.02, 0);
    this.body.updateMassProperties();

    this.wheels = this.model.wheels;


    this.active = false;
    this.aiActive = true;
    this.aiTimer = 0;
    this.lane = 0;
    this.desiredSpeed = 15;
    this.spin = 0;
    this._passed = false;
    this._prevRelZ = undefined;

    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this.body.addEventListener('collide', (e) => {
      const rel = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (rel > 3.0) {
        this.knock(rel);
        this.dentFrom(e, Math.min(1.4, (rel - 3) / 12));
      }
    });
  }

  repaint(hex) {
    const paint = ['paintRed', 'paintBlue', 'paintGreen', 'paintYellow', 'paintOrange', 'paintWhite', 'paintBlack'];
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (paint.includes(m.name)) m.color.setHex(hex);
      }
    });
  }

  /** بنزق هيكل العربية المنكوبة عند نقطة الخبطة (تلف مرئي زي اللاعب) */
  dentFrom(e, strength) {
    if (strength <= 0.05) return;
    const c = e.contact;
    const self = c.bi === this.body;
    const wp = this._tmpA;
    const base = self ? c.bi.position : c.bj.position;
    const off = self ? c.ri : c.rj;
    wp.set(base.x + off.x, base.y + off.y, base.z + off.z);
    for (const sh of this.model.shells) {
      sh.updateWorldMatrix(true, false);
      const local = sh.worldToLocal(this._tmpB.copy(wp));
      const dir = local.clone().multiplyScalar(-1).normalize();
      dentGeometry(sh, local, dir, strength);
    }
  }

  knock(rel) {
    this.aiActive = false;
    this.aiTimer = 2.5 + Math.random() * 2;
    this.lastHit = rel;
  }

  place(lane, z, speed) {
    this.lane = lane;
    this.desiredSpeed = speed;
    this.active = true;
    this.aiActive = true;
    this.aiTimer = 0;
    this._passed = false;
    this._prevRelZ = undefined;
    this.group.visible = true;
    const b = this.body;
    b.position.set(LANES[lane] + (Math.random() - 0.5) * 0.4, this.offsetY + 0.02, z);
    b.quaternion.setFromEuler(0, 0, 0);
    b.velocity.set(0, 0, speed);
    b.angularVelocity.set(0, 0, 0);
    b.force.set(0, 0, 0);
    b.torque.set(0, 0, 0);
    b.wakeUp();
    // رجّع شكل الهيكل والدهان
    this.model.restoreShells();
    this.model.restoreGlass();
    this.repaint(this.color);
  }

  /** بينادى قبل world.step */
  update(dt, all, playerZ) {
    if (!this.active) return;
    const b = this.body;

    if (!this.aiActive) {
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) {
        // لو العربية لسه على عجلها بترجع تمشي تاني
        const up = this._upY();
        if (up > 0.8 && b.position.y < 2.5) {
          this.aiActive = true;
          this.desiredSpeed = this.def.speed[0];
        }
      }
    }

    if (this.aiActive) {
      // ----- قيادة كينماتيكية: سرعة + تثبيت على الأرض -----
      const v = b.velocity;
      b.angularVelocity.set(0, 0, 0);
      b.quaternion.setFromEuler(0, 0, 0);
      b.angularVelocity.set(0, 0, 0);

      // ابعد عن العربية اللي قدامك في نفس الحارة
      let gap = 999;
      for (const o of all) {
        if (o === this || !o.active) continue;
        if (Math.abs(o.body.position.x - b.position.x) > 2.6) continue;
        const dz = o.body.position.z - b.position.z;
        if (dz > 0 && dz < gap) gap = dz;
      }
      let target = this.desiredSpeed;
      const safe = 8 + target * 0.5;
      if (gap < safe) target = Math.max(0, target * (gap / safe) * 0.85);

      // تسارع/تباطؤ ناعم
      const acc = clamp((target - v.z) * 1.8, -9, 3.2);
      v.z += acc * dt;
      v.y = 0;

      // الرجوع لحارة العربية
      const targetX = LANES[this.lane];
      const dx = targetX - b.position.x;
      v.x = clamp(dx * 2.2, -2.2, 2.2);

      // تثبيت الارتفاع على الأرض
      b.position.y = this.offsetY + 0.02;
    } else {
      // ----- جسم حر بعد الخبطة: مقاومة هواء أفقية + عداد تنازلي -----
      const v = b.velocity;
      const k = 0.5;
      v.x -= v.x * k * dt;
      v.z -= v.z * k * dt;
      // أمان: لو طارت عالي أوي نرجّعها
      if (b.position.y > 6) {
        b.velocity.y = Math.min(b.velocity.y, 0);
        b.position.y = Math.min(b.position.y, 6);
      }
    }

    // حدود الطريق: ممنوع تطلع بره الحواجز
    const maxX = BARRIER_X - 0.45 - this.model.dims.W * 0.5;
    if (b.position.x > maxX) { b.position.x = maxX; b.velocity.x = Math.min(0, b.velocity.x) * 0.3; }
    if (b.position.x < -maxX) { b.position.x = -maxX; b.velocity.x = Math.max(0, b.velocity.x) * 0.3; }

    if (b.position.y < -6 || b.position.z < playerZ - 70) this.active = false;
  }

  _upY() {
    const q = this.body.quaternion;
    return 1 - 2 * (q.x * q.x + q.z * q.z);
  }

  sync(dt = 0.016) {
    const b = this.body;
    this.group.position.set(b.position.x, b.position.y - this.offsetY, b.position.z);
    this.group.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);

    const spd = b.velocity.length();
    this.spin += (spd * dt) / 0.33;
    if (!this._qSpin) this._qSpin = new THREE.Quaternion();
    this._qSpin.setFromAxisAngle(X_AXIS, this.spin);
    for (const w of this.wheels) {
      w.spinner.quaternion.copy(this._qSpin);
      if (w.baseQuat) w.spinner.quaternion.multiply(w.baseQuat);
      if (w.isFront) w.pivot.rotation.y = 0;
    }
  }
}

/* =========================================================
   مدير المرور
   ========================================================= */
export class Traffic {
  constructor({ world, scene, defs, count = 22, assets }) {
    this.scene = scene;
    this.world = world;
    this.assets = assets;
    this.defs = defs;
    this.cars = [];
    this.countActive = count;
    for (let i = 0; i < count; i++) {
      const def = defs[i % defs.length];
      const car = new TrafficCar(def, world, scene, assets);
      car.active = false;
      car.group.visible = false;
      world.addBody(car.body);
      this.cars.push(car);
    }
  }

  setDifficulty(level) {
    this.countActive = [10, 15, 20][level] ?? 15;
    this.speedBoost = [0.85, 1, 1.12][level] ?? 1;
  }

  reset(playerZ) {
    for (const c of this.cars) {
      c.active = false;
      c.group.visible = false;
      c.body.position.set(0, -50, 0);
      c.body.velocity.set(0, 0, 0);
    }
    let z = playerZ + 55;
    for (let i = 0; i < Math.min(this.countActive, this.cars.length); i++) {
      const car = this.cars[i];
      const lane = Math.floor(Math.random() * LANES.length);
      const [lo, hi] = car.def.speed;
      car.place(lane, z, (lo + Math.random() * (hi - lo)) * (this.speedBoost || 1));
      z += 14 + Math.random() * 24;
    }
  }

  update(dt, playerZ) {
    for (const c of this.cars) {
      if (c.active) c.update(dt, this.cars, playerZ);
    }
    // spawn
    const ahead = 230;
    let n = this.visibleCount();
    for (const c of this.cars) {
      if (n >= this.countActive) break;
      if (c.active) continue;
      const lane = Math.floor(Math.random() * LANES.length);
      const [lo, hi] = c.def.speed;
      c.place(lane, playerZ + ahead + Math.random() * 90, (lo + Math.random() * (hi - lo)) * (this.speedBoost || 1));
      n++;
    }
    // recycle
    for (const c of this.cars) {
      if (c.active && c.body.position.z < playerZ - 70) {
        c.active = false;
        c.group.visible = false;
      }
    }
  }

  visibleCount() {
    let n = 0;
    for (const c of this.cars) if (c.active) n++;
    return n;
  }

  sync() {
    for (const c of this.cars) if (c.active) c.sync();
  }

  nearestAhead(playerPos) {
    let best = null, bestD = 1e9;
    for (const c of this.cars) {
      if (!c.active) continue;
      const dx = c.body.position.x - playerPos.x;
      const dz = c.body.position.z - playerPos.z;
      if (dz <= 0) continue;
      const d = Math.hypot(dx, dz);
      if (d < bestD) { bestD = d; best = c; }
    }
    return { car: best, dist: bestD };
  }

  /**
   * تعديات (عربيات عدّيتها) + غرز (قرب شديد منها)
   * cb(car, { graze, side })
   */
  checkOvertakes(playerPos, cb) {
    for (const c of this.cars) {
      if (!c.active) { c._prevRelZ = undefined; continue; }
      const relZ = c.body.position.z - playerPos.z;
      const dx = c.body.position.x - playerPos.x;
      const prev = c._prevRelZ;
      c._prevRelZ = relZ;
      if (prev === undefined) continue;
      // العربية كانت قدامي وبقت ورايا (في مدى قريب) = تعدية
      const crossed = prev > 1.2 && relZ <= 1.2 && prev < 40;
      if (!crossed) continue;
      if (Math.abs(dx) < 6) {
        const graze = Math.abs(dx) < 2.4;
        cb(c, { graze, side: Math.sign(dx) || 1 });
      }
    }
  }
}
