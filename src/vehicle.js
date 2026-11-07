import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createVehicleModel, dentGeometry } from './carModels.js';
import { MATS, BARRIER_X } from './physics.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const X_AXIS = new THREE.Vector3(1, 0, 0);

/* =========================================================
   عربية اللاعب: RaycastVehicle حقيقية + تلف في الهيكل
   ========================================================= */
export class PlayerVehicle {
  constructor({ world, def, scene, assets, onImpact }) {
    this.world = world;
    this.def = def;
    this.scene = scene;
    this.onImpact = onImpact || (() => {});
    this.perf = def.perf;

    /* ---------- الموديل 3D (GLB حقيقي) ---------- */
    this.model = createVehicleModel(assets, def);
    this.group = this.model.group;
    const dims = this.model.dims;
    this.dims = dims;
    scene.add(this.group);

    this.wheels = this.model.wheels;
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    /* ---------- الفيزيا ---------- */
    const W = dims.W, L = dims.L, H = dims.H;
    this.y0 = Math.max(0.44, H * 0.34);
    this.group.position.y = -this.y0;

    const hx = W * 0.44, hy = H * 0.19, hz = L * 0.46;
    const chassis = new CANNON.Body({
      mass: this.perf.mass,
      material: MATS.car,
      linearDamping: 0.02,
      angularDamping: 0.32,
      allowSleep: false,
    });
    chassis.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    chassis.position.set(0, this.y0, 0);
    chassis.updateMassProperties();
    this.chassis = chassis;

    const vehicle = new CANNON.RaycastVehicle({
      chassisBody: chassis,
      indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2,
    });
    this.vehicle = vehicle;

    this.wheelRadius = this.wheels[0] ? this.wheels[0].radius : 0.33;
    const halfW = W * 0.42;
    const halfL = L * 0.34;
    const common = {
      radius: this.wheelRadius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      suspensionStiffness: 31,
      suspensionRestLength: 0.30,
      frictionSlip: 2.9,
      dampingRelaxation: 2.6,
      dampingCompression: 4.6,
      maxSuspensionForce: 200000,
      rollInfluence: 0.04,
      customSlidingRotationalSpeed: -32,
      useCustomSlidingRotationalSpeed: true,
      maxSuspensionTravel: 0.32,
    };
    const cp = (x, z) => new CANNON.Vec3(x, -hy * 0.25, z);
    vehicle.addWheel({ ...common, chassisConnectionPointLocal: cp(-halfW, halfL) });
    vehicle.addWheel({ ...common, chassisConnectionPointLocal: cp(halfW, halfL) });
    vehicle.addWheel({ ...common, chassisConnectionPointLocal: cp(-halfW, -halfL) });
    vehicle.addWheel({ ...common, chassisConnectionPointLocal: cp(halfW, -halfL) });
    vehicle.addToWorld(world);

    /* ---------- حالة ---------- */
    // ترقيات الورشة (٠ لـ ٣ لكل حاجة)
    this.up = { engine: 0, brakes: 0, tires: 0, armor: 0 };
    this.maxForce = this.perf.mass * 2.5 * this.perf.power;
    this.vmax = this.perf.top / 3.6;
    this.applyUpgrades();
    this.steer = 0;
    this.wheelSpin = 0;
    this.damage = 0;
    this.glassBroken = false;
    this.engineOn = true;
    this.wrecked = false;
    this.lastImpact = 0;
    this.skid = 0;
    this._braking = false;

    chassis.addEventListener('collide', (e) => this._collide(e));

    this._qSpin = new THREE.Quaternion();
    this._v3 = new THREE.Vector3();
    this._v3b = new THREE.Vector3();
    this._v3c = new THREE.Vector3();
  }

  /* -------- ترقيات الورشة -------- */
  applyUpgrades() {
    const e = this.up.engine, b = this.up.brakes, t = this.up.tires, a = this.up.armor;
    this.maxForce = this.perf.mass * 2.5 * this.perf.power * (1 + 0.15 * e);
    this.vmax = (this.perf.top / 3.6) * (1 + 0.09 * e);
    this.brakePower = 1 + 0.22 * b;
    this.gripBase = 2.9 * (1 + 0.09 * t);
    this.armorMul = 1 - 0.17 * a;
    if (this.vehicle) {
      this.vehicle.wheelInfos.forEach((w) => { w.frictionSlip = this.gripBase; });
    }
  }

  /** إصلاح كامل في الورشة */
  repairAll() {
    this.damage = 0;
    this.wrecked = false;
    this.engineOn = true;
    this.model.restoreShells();
    this.model.restoreGlass();
    this.glassBroken = false;
  }

  repairGlass() {
    this.model.restoreGlass();
    this.glassBroken = false;
  }

  /* -------- قراءات -------- */
  get speed() {
    const f = this.forward;
    return this.chassis.velocity.x * f.x + this.chassis.velocity.y * f.y + this.chassis.velocity.z * f.z;
  }
  get speedKmh() { return Math.abs(this.speed) * 3.6; }
  get forward() {
    const q = this.chassis.quaternion;
    const x = 2 * (q.x * q.z + q.w * q.y);
    const y = 2 * (q.y * q.z - q.w * q.x);
    const z = 1 - 2 * (q.x * q.x + q.y * q.y);
    return { x, y, z };
  }
  get position() { return this.chassis.position; }

  reset(z = 0, x = 0) {
    const p = this.chassis.position;
    p.set(x, this.y0 + 0.12, z);
    this.chassis.velocity.set(0, 0, 0);
    this.chassis.angularVelocity.set(0, 0, 0);
    this.chassis.quaternion.setFromEuler(0, 0, 0);
    this.chassis.force.set(0, 0, 0);
    this.chassis.torque.set(0, 0, 0);
    this.steer = 0;
    this.damage = 0;
    this.glassBroken = false;
    this.engineOn = true;
    this.wrecked = false;
    this.model.restoreGlass();
    this.vehicle.wheelInfos.forEach((w, i) => {
      this.vehicle.setBrake(0, i);
      this.vehicle.setSteeringValue(0, i);
      this.vehicle.applyEngineForce(0, i);
      w.frictionSlip = this.gripBase || 2.9;
    });
    this.model.restoreShells();
    this.syncVisual(0);
  }

  /** ملاحظة: cannon-es بينادي updateVehicle لوحده من preStep */
  step() {}

  /* ---------- السواقة ---------- */
  drive(dt, input) {
    const v = this.chassis.velocity;

    if (this.wrecked) {
      this.vehicle.applyEngineForce(0, 2);
      this.vehicle.applyEngineForce(0, 3);
      for (let i = 0; i < 4; i++) this.vehicle.setBrake(16, i);
      this.vehicle.setSteeringValue(this.steer, 0);
      this.vehicle.setSteeringValue(this.steer, 1);
      return;
    }

    const spd = this.speed;
    const absSpd = Math.abs(spd);
    const vmax = this.vmax;
    const powerLoss = 1 - Math.min(0.55, this.damage / 220);

    // دركسيون
    const speedFactor = clamp(1 - absSpd / (vmax * 1.05), 0.22, 1);
    const maxSteer = 0.52 * speedFactor;
    const targetSteer = input.steer * maxSteer;
    const steerRate = 9 * dt;
    this.steer += clamp(targetSteer - this.steer, -steerRate, steerRate);
    this.vehicle.setSteeringValue(this.steer, 0);
    this.vehicle.setSteeringValue(this.steer, 1);

    // بنزين (القوة السالبة = لقدام ناحية +Z في cannon-es)
    let force = 0;
    const throttle = input.throttle;
    if (throttle > 0) {
      const f = Math.pow(clamp(Math.max(0, spd) / vmax, 0, 1), 3.2);
      force = -this.maxForce * throttle * (1 - f) * powerLoss;
    }
    let brake = 0;
    if (input.brake > 0) {
      if (spd > 1.2) brake = 33 * input.brake * this.brakePower;
      else if (throttle === 0) force = this.maxForce * input.brake * 0.62;
      else brake = 26 * input.brake * this.brakePower;
    }

    const hb = input.handbrake;
    this.vehicle.wheelInfos.forEach((w, i) => {
      const rear = i >= 2;
      if (hb && rear) {
        w.frictionSlip = this.gripBase * 0.42;
        this.vehicle.setBrake(72 * this.brakePower, i);
      } else {
        w.frictionSlip = this.gripBase;
        this.vehicle.setBrake(brake, i);
      }
    });

    this.vehicle.applyEngineForce(force, 2);
    this.vehicle.applyEngineForce(force, 3);
    this.vehicle.applyEngineForce(force * 0.35, 0);
    this.vehicle.applyEngineForce(force * 0.35, 1);

    // مقاومة هواء
    const dragK = 0.30;
    this.chassis.applyForce(
      new CANNON.Vec3(-v.x * Math.abs(v.x) * dragK, 0, -v.z * Math.abs(v.z) * dragK),
      this.chassis.position,
    );

    const lat = this._lateralSpeed();
    this.skid = clamp((Math.abs(lat) - 1.4) / 4, 0, 1) * clamp(absSpd / 6, 0, 1) + (hb && absSpd > 3 ? 0.55 : 0);
  }

  _lateralSpeed() {
    const q = this.chassis.quaternion;
    const rx = 1 - 2 * (q.y * q.y + q.z * q.z);
    const rz = 2 * (q.x * q.z - q.w * q.y);
    const v = this.chassis.velocity;
    return v.x * rx + v.z * rz;
  }

  /* -------- مزامنة الموديل مع الفيزيا -------- */
  syncVisual(dt = 0.016) {
    const b = this.chassis;
    this.group.position.set(b.position.x, b.position.y - this.y0, b.position.z);
    this.group.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);

    // دوران العجل + زاوية الدركسيون
    this.wheelSpin += (this.speed / Math.max(0.15, this.wheelRadius)) * dt;
    this._qSpin.setFromAxisAngle(X_AXIS, this.wheelSpin);
    for (const w of this.wheels) {
      if (w.isFront) w.pivot.rotation.y = this.steer;
      w.spinner.quaternion.copy(this._qSpin);
      if (w.baseQuat) w.spinner.quaternion.multiply(w.baseQuat);
    }

    this.model.setBrake(this._braking);
    this.model.setLights(!!this.headlightsOn);
  }

  setHeadlights(on) {
    this.headlightsOn = on;
    this.model.setLights(on);
  }

  /**
   * جدار الحواجز: تثبيت مضمون (الفيزيا لوحدها ساعات بتعدي جوه صندوق طويل)
   * بيرجّع العربية وبيديها خبطة + تلف لو كانت داخلة بسرعة
   */
  clampToWalls() {
    const b = this.chassis;
    const maxX = BARRIER_X - 0.42 - this.dims.W * 0.5;
    const over = Math.abs(b.position.x) - maxX;
    if (over <= 0) { this._wallCd = Math.max(0, (this._wallCd || 0) - 1); return; }

    const side = Math.sign(b.position.x) || 1;
    b.position.x = side * maxX;
    const vx = b.velocity.x;
    const into = vx * side; // سرعة الدخول في الحاجز
    if (into <= 0) return;
    b.velocity.x = -vx * 0.30;
    b.velocity.z *= 0.94;
    // لفة خفيفة ناحية الطريق
    b.angularVelocity.y -= side * Math.min(1.6, into * 0.12);

    this._wallCd = this._wallCd || 0;
    if (into < 2.5 || this._wallCd > 0) return;
    this._wallCd = 12;
    const strength = clamp((into - 2.5) / 12, 0.1, 1.5);
    this.damage = Math.min(100, this.damage + strength * 9 * (this.armorMul ?? 1));
    if (!this.glassBroken && strength > 0.7) { this.model.breakGlass(); this.glassBroken = true; }
    if (this.damage >= 100) { this.damage = 100; this.wrecked = true; }
    this.onImpact({
      strength,
      rel: into,
      point: {
        x: b.position.x + side * this.dims.W * 0.5,
        y: b.position.y,
        z: b.position.z,
      },
      normalDir: { x: -side, y: 0.2, z: 0 },
      other: null,
      glass: this.glassBroken,
      damage: this.damage,
      wall: true,
    });
  }

  /** مفتاح الفرامل عشان شدادات النور */
  setBrakingFlag(v) { this._braking = v; }

  /* -------- خبطة -------- */
  _collide(e) {
    const other = e.body;
    const rel = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (rel < 2.0) return;
    const now = performance.now();
    if (now - this.lastImpact < 90) return;
    this.lastImpact = now;

    const worldPoint = new CANNON.Vec3();
    const isCar = e.contact.bi === this.chassis;
    // اتجاه الخبطة للعالم (للشرر)
    const ni = e.contact.ni;
    this._inward = { x: isCar ? -ni.x : ni.x, y: isCar ? -ni.y : ni.y, z: isCar ? -ni.z : ni.z };
    e.contact[isCar ? 'bi' : 'bj'].position.vadd(e.contact[isCar ? 'ri' : 'rj'], worldPoint);

    let strength = clamp((rel - 2.0) / 13, 0.08, 1.7);
    const massFactor = other && other.mass ? clamp(other.mass / 900, 0.45, 2.6) : 1.3;
    strength *= clamp(massFactor, 0.6, 1.9);
    this.damage = Math.min(100, this.damage + strength * 11 * (this.armorMul ?? 1));

    // نقطة الخبطة → إحداثيات كل جزء من الهيكل (عشان النحت)
    const wp = this._v3.set(worldPoint.x, worldPoint.y, worldPoint.z);
    for (const sh of this.model.shells) {
      sh.updateWorldMatrix(true, false);
      const local = sh.worldToLocal(this._v3b.copy(wp));
      const dir = this._v3c.set(0, this.dims.H * 0.45, 0).sub(local);
      const len = dir.length();
      if (len < 0.001) continue;
      dir.multiplyScalar(1 / len);
      dentGeometry(sh, local, dir, strength);
    }

    if (!this.glassBroken && (strength > 0.5 || this.damage > 26)) {
      this.model.breakGlass();
      this.glassBroken = true;
    }
    if (this.damage >= 100) {
      this.damage = 100;
      this.wrecked = true;
    }
    this.onImpact({
      strength, rel,
      point: { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
      normalDir: this._inward,
      other,
      glass: this.glassBroken,
      damage: this.damage,
    });
  }

  dispose() {
    this.scene.remove(this.group);
    this.vehicle.removeFromWorld(this.world);
  }
}
