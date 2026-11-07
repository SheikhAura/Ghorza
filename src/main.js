import * as THREE from 'three';
import { createWorld, LANES } from './physics.js';
import { PlayerVehicle } from './vehicle.js';
import { Traffic } from './traffic.js';
import { Scenery } from './scenery.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { CAR_DEFS, TRAFFIC_DEFS } from './carModels.js';
import { loadCarAssets } from './carAssets.js';
import { UI } from './ui.js';
import { Garages } from './garage.js';

const FIXED = 1 / 60;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

const CAM_MODES = {
  near: { back: 5.8, height: 2.35, ahead: 5.0, lookY: 1.0, fov: 66 },
  normal: { back: 7.6, height: 3.05, ahead: 7.0, lookY: 1.1, fov: 62 },
  far: { back: 11.0, height: 4.3, ahead: 9.0, lookY: 1.2, fov: 58 },
  hood: { back: 0.2, height: 1.35, ahead: 12.0, lookY: 1.1, fov: 70 },
};

class Game {
  constructor(assets) {
    this.assets = assets;
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xd3ae8b, 90, 430);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.25, 1200);
    this.camera.position.set(0, 3, -8);

    /* ---------- إضاءة ---------- */
    this.hemi = new THREE.HemisphereLight(0xbdd3f2, 0x9a7f5e, 0.75);
    this.scene.add(this.hemi);
    this.sunLight = new THREE.DirectionalLight(0xffe0b0, 2.0);
    this.sunLight.position.set(-38, 46, 26);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    const d = 34;
    const sc = this.sunLight.shadow.camera;
    sc.left = -d; sc.right = d; sc.top = d; sc.bottom = -d; sc.near = 1; sc.far = 150;
    this.sunLight.shadow.bias = -0.0008;
    this.sunLight.shadow.normalBias = 0.03;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    /* ---------- الأنظمة ---------- */
    this.world = createWorld();
    this.effects = new Effects(this.scene);
    this.audio = new GameAudio();
    this.input = { keys: {}, touch: {}, steer: 0, throttle: 0, brake: 0, handbrake: false };
    this.ui = new UI(this);

    this.selectedCar = localStorage.getItem('dayeri3d.car') || 'shahin';
    if (!CAR_DEFS[this.selectedCar]) this.selectedCar = 'shahin';
    this.difficulty = 1;
    this.night = false;
    this.soundOn = true;
    this.shadows = true;
    this.cameraMode = window.innerWidth < 760 ? 'far' : 'normal';
    this.best = parseFloat(localStorage.getItem('dayeri3d.best') || '0');

    this.scenery = new Scenery(this.scene, this.renderer);
    this.garages = new Garages(this.scene);
    this.inGarage = false;
    this.garageUsed = false;
    this.applyTimeOfDay(false);

    this.traffic = new Traffic({
      world: this.world, scene: this.scene, defs: TRAFFIC_DEFS, count: 24, assets: this.assets,
    });
    this.traffic.setDifficulty(this.difficulty);

    this.buildVehicle();

    this.state = 'menu';
    this.clock = new THREE.Clock();
    this.acc = 0;
    this.camYaw = 0;
    this.shake = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.menuAngle = 0;
    this.lastSkidZ = 0;

    this.resetStats();
    this.setupInput();
    this.setupResize();

    this.ui.buildMenu({
      defs: CAR_DEFS, selectedCar: this.selectedCar, difficulty: this.difficulty,
      night: this.night, sound: this.soundOn, camera: this.cameraMode, shadows: this.shadows,
    });
    this.ui.setBest(this.best);
    this.ui.show('menu');
    this.ui.hideLoading();
    this.ui.showTouch(false);

    // كاميرا المنيو
    this.player.reset(0, 0);
    this.scenery.reset(0);
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  /* =========================================================
     عربية اللاعب
     ========================================================= */
  buildVehicle() {
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
    this.headlights = [];
    const def = CAR_DEFS[this.selectedCar];
    this.player = new PlayerVehicle({
      world: this.world, def, scene: this.scene, assets: this.assets,
      onImpact: (e) => this.onImpact(e),
    });
    // كشافات
    for (const s of [-1, 1]) {
      const sp = new THREE.SpotLight(0xfff2d8, 0, 90, 0.52, 0.45, 1.1);
      sp.position.set(s * 0.62, 0.85, this.player.dims.L * 0.45);
      sp.target.position.set(s * 1.5, -0.6, 30);
      this.player.group.add(sp);
      this.player.group.add(sp.target);
      this.headlights.push(sp);
    }
    this.player.chassis.position.set(0, this.player.y0 + 0.15, 0);
    this.player.syncVisual(0);
    if (this.night) this.setHeadlights(true);
  }

  setHeadlights(on) {
    for (const sp of this.headlights) sp.intensity = on ? 900 : 0;
    if (this.player) this.player.setHeadlights(on);
  }

  /* =========================================================
     إعدادات
     ========================================================= */
  buildEnvironment(night) {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64);
    if (night) {
      grad.addColorStop(0, '#06080f');
      grad.addColorStop(0.42, '#16203c');
      grad.addColorStop(0.53, '#2b2338');
      grad.addColorStop(0.7, '#141018');
      grad.addColorStop(1, '#08070c');
    } else {
      grad.addColorStop(0, '#4d86cf');
      grad.addColorStop(0.42, '#cde0f3');
      grad.addColorStop(0.52, '#ffd7a8');
      grad.addColorStop(0.72, '#8a7358');
      grad.addColorStop(1, '#4c4038');
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(this.renderer);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromEquirectangular(tex);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = night ? 0.55 : 0.9;
    tex.dispose();
  }

  applyTimeOfDay(night) {
    this.buildEnvironment(night);
    this.night = night;
    const sc = this.scenery;
    if (night) {
      this.hemi.color.set(0x5a6fa8);
      this.hemi.groundColor.set(0x3a3040);
      this.hemi.intensity = 1.15;
      this.sunLight.color.set(0xa8c0f0);
      this.sunLight.intensity = 0.85;
      this.scene.fog.color.set(0x181d2c);
      this.scene.fog.near = 60;
      this.scene.fog.far = 340;
      this.scene.background = new THREE.Color(0x0a0c14);
      if (sc) {
        sc.sky.material.uniforms.top.value.set(0x05060f);
        sc.sky.material.uniforms.bottom.value.set(0x2a2140);
        sc.sun.visible = false;
        sc.setTime(true);
      }
      this.renderer.toneMappingExposure = 1.35;
    } else {
      this.hemi.color.set(0xc5d8f2);
      this.hemi.groundColor.set(0x9a7f5e);
      this.hemi.intensity = 0.8;
      this.sunLight.color.set(0xffdfae);
      this.sunLight.intensity = 2.1;
      this.scene.fog.color.set(0xd3ae8b);
      this.scene.fog.near = 95;
      this.scene.fog.far = 440;
      this.scene.background = new THREE.Color(0xd3ae8b);
      if (sc) {
        sc.sky.material.uniforms.top.value.set(0x2e5aa8);
        sc.sky.material.uniforms.bottom.value.set(0xffc78a);
        sc.sun.visible = true;
        sc.setTime(false);
      }
      this.renderer.toneMappingExposure = 1.05;
    }
    if (this.headlights) this.setHeadlights(night);
  }

  setNight(v) {
    this.applyTimeOfDay(v);
    this.ui.buildMenu({
      defs: CAR_DEFS, selectedCar: this.selectedCar, difficulty: this.difficulty,
      night: this.night, sound: this.soundOn, camera: this.cameraMode, shadows: this.shadows,
    });
  }

  setDifficulty(i) {
    this.difficulty = i;
    this.traffic.setDifficulty(i);
    this.ui.buildMenu({
      defs: CAR_DEFS, selectedCar: this.selectedCar, difficulty: this.difficulty,
      night: this.night, sound: this.soundOn, camera: this.cameraMode, shadows: this.shadows,
    });
  }

  selectCar(id) {
    if (!CAR_DEFS[id] || this.selectedCar === id) return;
    this.selectedCar = id;
    localStorage.setItem('dayeri3d.car', id);
    this.buildVehicle();
    this.ui.buildMenu({
      defs: CAR_DEFS, selectedCar: this.selectedCar, difficulty: this.difficulty,
      night: this.night, sound: this.soundOn, camera: this.cameraMode, shadows: this.shadows,
    });
  }

  toggleOption(opt) {
    if (opt === 'sound') {
      this.soundOn = !this.soundOn;
      this.audio.init();
      this.audio.setEnabled(this.soundOn);
    } else if (opt === 'shadow') {
      this.shadows = !this.shadows;
      this.renderer.shadowMap.enabled = this.shadows;
      this.sunLight.castShadow = this.shadows;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.shadows ? 2 : 1));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    this.ui.renderOptions();
  }

  setCamera(mode) {
    this.cameraMode = mode;
    this.ui.renderOptions();
  }

  /* =========================================================
     حالة اللعب
     ========================================================= */
  resetStats() {
    this.stats = {
      startZ: 0, dist: 0, passes: 0, crashes: 0, score: 0, bonus: 0, topSpeed: 0,
      time: 0, radarFines: 0, combo: 0, wreckTimer: 0, grazes: 0, cash: 450,
    };
  }

  startRun() {
    this.audio.init();
    this.audio.resume();
    this.audio.setEnabled(this.soundOn);
    this.audio.engine(true);

    this.resetStats();
    this.player.up = { engine: 0, brakes: 0, tires: 0, armor: 0 };
    this.player.applyUpgrades();
    this.player.reset(0, 0);
    this.garages.reset(0);
    this.garageUsed = false;
    this.inGarage = false;
    this.scenery.reset(0);
    this.traffic.setDifficulty(this.difficulty);
    this.traffic.reset(0);
    this.effects.reset();
    this.acc = 0;
    this.camYaw = 0;
    this.shake = 0;
    this.lastSkidZ = 0;
    this.input.keys = {};
    this.state = 'playing';
    this.ui.show('hud');
    this.ui.showTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    this.ui.setRecoverVisible(false);
    this.ui.warning(null);
    this.ui.toast('يلا بينا! 🚗', 1400);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.engine(false);
    this.audio.setSkid(0);
    this.ui.show('pause');
    this.ui.renderOptions();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.audio.engine(true);
    this.ui.show('hud');
  }

  toMenu() {
    this.state = 'menu';
    this.audio.engine(false);
    this.audio.setSkid(0);
    this.resetStats();
    this.player.up = { engine: 0, brakes: 0, tires: 0, armor: 0 };
    this.player.applyUpgrades();
    this.player.reset(0, 0);
    this.garages.reset(0);
    this.garageUsed = false;
    this.inGarage = false;
    this.scenery.reset(0);
    this.traffic.reset(-9999);
    this.ui.setRecoverVisible(false);
    this.ui.show('menu');
    this.ui.showTouch(false);
    this.ui.buildMenu({
      defs: CAR_DEFS, selectedCar: this.selectedCar, difficulty: this.difficulty,
      night: this.night, sound: this.soundOn, camera: this.cameraMode, shadows: this.shadows,
    });
  }

  endRun() {
    if (this.state !== 'playing') return;
    this.state = 'results';
    this.audio.engine(false);
    this.audio.setSkid(0);
    this.ui.setRecoverVisible(false);
    const st = this.stats;
    if (st.dist > this.best) {
      this.best = st.dist;
      localStorage.setItem('dayeri3d.best', String(this.best));
      this.ui.setBest(this.best);
    }
    const mm = Math.floor(st.time / 60);
    const ss = Math.floor(st.time % 60);
    this.ui.showResults({
      distance: st.dist / 1000, time: `${mm}:${String(ss).padStart(2, '0')}`,
      topSpeed: st.topSpeed, crashes: st.crashes, passes: st.passes,
      score: st.score, wrecked: this.player.wrecked,
    });
  }

  recover() {
    const b = this.player.chassis;
    b.quaternion.setFromEuler(0, 0, 0);
    b.position.y = this.player.y0 + 0.5;
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
    this.ui.toast('اتعدلت ✨', 900);
    this.ui.setRecoverVisible(false);
  }

  /* =========================================================
     خبطة
     ========================================================= */
  onImpact(e) {
    if (this.state !== 'playing') return;
    const { strength, point, normalDir, glass } = e;
    this.effects.impact(point, normalDir, strength, glass);
    this.audio.crash(strength);
    if (glass) this.audio.glass();
    this.shake = Math.min(1.6, this.shake + strength * 1.1);

    if (strength > 0.3) {
      this.stats.crashes++;
      this.stats.combo = 0;
      if (strength > 1.1) this.ui.toast('خبطة جامدة! 💥', 1100);
      else if (strength > 0.55) this.ui.toast('خبطة! 😬', 800);
      this.stats.bonus -= Math.round(strength * 22);
    }
    if (this.player.wrecked) {
      this.ui.toast('العربية باظت… 🛑', 1800);
      this.stats.wreckTimer = 1.4;
    }
  }

  /* =========================================================
     ورشة الصيانة
     ========================================================= */
  garageList() {
    const p = this.player;
    const up = p.up;
    const price = { engine: [280, 520, 860], brakes: [200, 380, 640], tires: [230, 430, 700], armor: [300, 560, 900] };
    const lvlItem = (id, icon, title, desc) => {
      const lv = up[id];
      const done = lv >= 3;
      return { id, icon, title, desc, level: lv, max: done, price: done ? null : price[id][lv] };
    };
    const items = [
      {
        id: 'repair',
        icon: '🔧',
        title: 'إصلاح الهيكل والخبطات',
        desc: p.damage < 1 ? 'العربية زي الفل' : `هيرجّع ${Math.round(p.damage)}% خبطة`,
        price: p.damage < 1 ? null : Math.round(70 + p.damage * 2.4),
      },
      {
        id: 'glass',
        icon: '🪟',
        title: 'تغيير الإزاز',
        desc: p.glassBroken ? 'الإزاز مكسور' : 'الإزاز سليم',
        price: p.glassBroken ? 160 : null,
      },
      lvlItem('engine', '⚙️', 'ترقية الموتور', 'سرعة قصوى +9% · سحب +15%'),
      lvlItem('brakes', '🛑', 'ترقية الفرامل', 'فرملة أقوى 22%'),
      lvlItem('tires', '🛞', 'كاوتش رياضى', 'تحكم وثبات أعلى'),
      lvlItem('armor', '🛡️', 'درع للهيكل', 'خبطات أقل بـ 17%'),
    ];
    return items;
  }

  openGarage() {
    if (this.state !== 'playing') return;
    this.state = 'garage';
    this.inGarage = true;
    this.garageUsed = true;
    this.input.keys = {};
    this.input.throttle = 0;
    this.input.brake = 0;
    this.ui.show('garage');
    this.renderGaragePanel();
    this.audio.beep && this.audio.beep(false);
  }

  renderGaragePanel() {
    this.ui.renderGarage({
      cash: this.stats.cash,
      damage: this.player.damage,
      glass: this.player.glassBroken,
      topSpeed: this.player.perf.top * (1 + 0.09 * this.player.up.engine),
      items: this.garageList(),
    });
    this.ui.updateCash(this.stats.cash);
  }

  closeGarage() {
    if (this.state !== 'garage') return;
    this.state = 'playing';
    this.inGarage = false;
    this.ui.show('hud');
  }

  buyGarageItem(id) {
    if (this.state !== 'garage') return;
    const item = this.garageList().find((i) => i.id === id);
    if (!item || item.price === null) return;
    if (this.stats.cash < item.price) {
      this.ui.toast('مش معاك فلوس كفاية 💸', 1200);
      return;
    }
    this.stats.cash -= item.price;
    const p = this.player;
    if (id === 'repair') {
      p.repairAll();
      this.ui.toast('العربية اتصلحت ✨', 1100);
    } else if (id === 'glass') {
      p.repairGlass();
      this.ui.toast('الإزاز جديد 🪟', 1000);
    } else {
      p.up[id] = Math.min(3, p.up[id] + 1);
      p.applyUpgrades();
      const names = { engine: 'الموتور', brakes: 'الفرامل', tires: 'الكاوتش', armor: 'الدرع' };
      this.ui.toast(`${names[id]} اتطوّر ×${p.up[id]} ⬆️`, 1200);
    }
    this.audio.graze && this.audio.graze();
    this.renderGaragePanel();
  }

  /* =========================================================
     مدخلات
     ========================================================= */
  setupInput() {
    const onKey = (e, down) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.input.keys[k] = down;
      if (down && (k === 'r')) this.recover();
      if (down && (k === 'h')) this.audio.horn(true);
      if (!down && (k === 'h')) this.audio.horn(false);
      if (k === 'Escape') {
        if (this.state === 'garage') this.closeGarage();
        else if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup', (e) => onKey(e, false));
    window.addEventListener('blur', () => { this.input.keys = {}; });
  }

  setupResize() {
    const onR = () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onR);
    window.addEventListener('orientationchange', () => setTimeout(onR, 250));
  }

  readInput() {
    const k = this.input.keys, t = this.input.touch;
    const inp = this.input;
    inp.steer = 0;
    if (k['ArrowLeft'] || k['a'] || t.left) inp.steer -= 1;
    if (k['ArrowRight'] || k['d'] || t.right) inp.steer += 1;

    let thr = 0;
    if (k['ArrowUp'] || k['w'] || t.gas) thr = 1;
    inp.throttle = thr;

    inp.brake = (k['ArrowDown'] || k['s'] || t.brake) ? 1 : 0;
    inp.handbrake = !!(k[' '] || t.hand);
    return inp;
  }

  /* =========================================================
     خطوة الفيزيا
     ========================================================= */
  physicsStep(h) {
    this.player.drive(h, this.input);
    this.player.setBrakingFlag(this.input.brake > 0.1);
    this.traffic.update(h, this.player.position.z);
    this.player.step(h);
    this.world.step(h);
    this.player.clampToWalls();
  }

  /* =========================================================
     اللوب
     ========================================================= */
  tick() {
    requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, this.clock.getDelta());

    if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'paused' || this.state === 'results' || this.state === 'garage') this.render();
    else this.updateMenu(dt);

    this.effects.update(dt);
  }

  updateMenu(dt) {
    // عربية واقفة في المعرض — بنثبتها عشان تبان نضيفة
    this.acc += dt;
    let guard = 0;
    const b = this.player.chassis;
    while (this.acc >= FIXED && guard++ < 5) {
      this.input.throttle = 0; this.input.brake = 0; this.input.steer = 0; this.input.handbrake = false;
      this.player.drive(FIXED, this.input);
      this.world.step(FIXED);
      this.acc -= FIXED;
    }
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
    b.position.set(0, this.player.y0, 0);
    b.quaternion.set(0, 0, 0, 1);
    this.player.damage = 0;
    this.player.syncVisual();

    this.menuAngle += dt * 0.30;
    const r = 7.2;
    const cx = Math.sin(this.menuAngle) * r;
    const cz = Math.cos(this.menuAngle) * r;
    const p = this.player.position;
    this.camera.position.lerp(new THREE.Vector3(p.x + cx, 1.85 + Math.sin(this.menuAngle * 0.6) * 0.3, p.z + cz),
      1 - Math.exp(-dt * 6));
    // بنبص فوق العربية شوية عشان تطلع في آخر الشاشة تحت البانلات
    this.camera.lookAt(p.x, 1.0 + 1.75, p.z);
    this.camera.fov = 54;
    this.camera.updateProjectionMatrix();

    this.scenery.update(p.z, this.camera);
    this.sunLight.position.set(p.x - 30, 42, p.z + 24);
    this.sunLight.target.position.set(p.x, 0, p.z);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.shadow.camera.updateProjectionMatrix();
    this.render();
  }

  updatePlaying(dt) {
    this.readInput();
    this.stats.time += dt;

    this.acc += dt;
    let guard = 0;
    while (this.acc >= FIXED && guard++ < 5) {
      this.physicsStep(FIXED);
      this.acc -= FIXED;
    }

    const p = this.player;
    p.syncVisual();
    this.traffic.sync();

    const z = p.position.z;
    const st = this.stats;
    const prevDist = st.dist;
    st.dist = Math.max(st.dist, z - st.startZ);
    // فلوس مع المسافة (عشان تقدر تصرف في الورشة)
    st.cash += Math.max(0, st.dist - prevDist) * 0.08;
    st.topSpeed = Math.max(st.topSpeed, p.speedKmh);

    // تعديات + غرز
    this.traffic.checkOvertakes(p.position, (car, info) => {
      st.passes++;
      st.combo++;
      const base = 22 + Math.min(60, st.combo * 4);
      st.cash += Math.round((info.graze ? base + 35 : base) * 0.55);
      if (info.graze) {
        st.bonus += base + 35;
        st.grazes = (st.grazes || 0) + 1;
        this.ui.toast(`غرزة! 🏎️ +${base + 35}`, 800);
        this.audio.graze && this.audio.graze();
      } else {
        st.bonus += base;
        if (st.combo % 5 === 0) this.ui.toast(`تعدية ×${st.combo} 🔥`, 900);
      }
    });

    // رادار
    if (this.scenery.checkRadars(z)) {
      if (p.speedKmh > 100) {
        st.radarFines++;
        st.bonus -= 60;
        this.ui.toast('مخالفة رادار! 📸 -60', 1500);
        this.audio.beep(true);
        this.shake = Math.max(this.shake, 0.35);
      } else {
        this.ui.toast('عدّيت الرادار بأمان ✅', 900);
      }
    }
    const radarDist = this.scenery.nextRadarDistance(z);
    let hint = null;
    if (radarDist < 170 && p.speedKmh > 100) hint = `رادار قدام · ${Math.round(radarDist)} م`;

    /* ---------- ورشة الصيانة ---------- */
    const inShop = this.garages.inside(p.position.x, z);
    if (inShop) {
      if (Math.abs(p.speedKmh) < 9 && !this.garageUsed) {
        this.openGarage();
        this.ui.updateCash(st.cash);
        return;
      }
      if (!this.garageUsed) hint = 'اطلع على الكتف واقف جوه الورشة 🛠️';
    } else {
      this.garageUsed = false;
      const nd = this.garages.nextDistance(z);
      if (nd !== null && nd < 240 && !hint) hint = `ورشة صيانة قدام · ${Math.round(nd)} م 🛠️`;
    }
    this.ui.warning(hint);

    // نقاط
    st.score = Math.max(0, Math.round(st.dist * 1.2 + st.bonus + st.topSpeed * 2));

    // آثار كاوتش
    if (p.skid > 0.3 && z - this.lastSkidZ > 0.7) {
      this.lastSkidZ = z;
      const f = p.forward;
      const yaw = Math.atan2(f.x, f.z);
      const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
      const back = -p.dims.L * 0.36;
      for (const s of [-1, 1]) {
        this.effects.addSkid(
          p.position.x + rightX * s * p.dims.W * 0.44 + f.x * back, z, yaw,
        );
      }
      this.effects.dust({ x: p.position.x, y: 0, z }, 0.3);
    }

    // دخان لو التلف عالي
    if (p.damage > 45) this.effects.smokeTrail({ x: p.position.x, y: 0.6, z }, p.damage);

    // صوت
    const rpm = clamp(p.speedKmh / (p.perf.top * 0.92), 0, 1);
    this.audio.setEngine(rpm * (0.72 + 0.28 * (this.input.throttle > 0 ? 1 : 0.4)), this.input.throttle);
    this.audio.setSkid(p.skid);
    this.audio.setWind(clamp(p.speedKmh / 200, 0, 1));

    // مقلوبة؟
    const upY = 1 - 2 * (p.chassis.quaternion.x ** 2 + p.chassis.quaternion.z ** 2);
    const slow = p.speedKmh < 30;
    this.ui.setRecoverVisible(upY < 0.45 && slow);

    this.updateCamera(dt);
    this.scenery.update(z, this.camera);
    this.garages.update(z);
    this.ui.updateHUD({
      dist: st.dist / 1000, score: st.score, passes: st.passes, crashes: st.crashes,
      speed: p.speedKmh, damage: p.damage,
    });
    this.ui.updateCash(st.cash);

    // خلصت؟
    if (p.wrecked) {
      st.wreckTimer -= dt;
      if (st.wreckTimer <= 0) this.endRun();
    }
    this.render();
  }

  updateCamera(dt) {
    const p = this.player;
    const f = p.forward;
    const targetYaw = Math.atan2(f.x, f.z);
    let diff = targetYaw - this.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    // لو ماشي بالعكس نسيب الكاميرا تلف
    this.camYaw += diff * (1 - Math.exp(-dt * 5.5));

    const cfg = CAM_MODES[this.cameraMode] || CAM_MODES.normal;
    const cf = { x: Math.sin(this.camYaw), z: Math.cos(this.camYaw) };
    const pos = p.position;

    this.shake *= Math.exp(-dt * 4.2);
    const sh = this.shake;
    const jitter = () => (Math.random() - 0.5) * sh * 0.5;

    if (this.cameraMode === 'hood') {
      this.camPos.set(
        pos.x + cf.x * (p.dims.L * 0.22) + jitter(),
        pos.y + 0.55 + jitter() * 0.4,
        pos.z + cf.z * (p.dims.L * 0.22),
      );
      this.camLook.set(pos.x + cf.x * 30, pos.y + 0.9, pos.z + cf.z * 30);
      this.camera.position.lerp(this.camPos, 1 - Math.exp(-dt * 22));
    } else {
      this.camPos.set(
        pos.x - cf.x * cfg.back + jitter(),
        pos.y + cfg.height * 0.55 + jitter(),
        pos.z - cf.z * cfg.back,
      );
      this.camLook.set(pos.x + cf.x * cfg.ahead, pos.y + cfg.lookY, pos.z + cf.z * cfg.ahead);
      this.camera.position.lerp(this.camPos, 1 - Math.exp(-dt * 9));
    }
    this.camera.lookAt(this.camLook);

    const targetFov = cfg.fov + clamp(p.speedKmh, 0, 200) * 0.055 + sh * 3;
    this.camera.fov = lerp(this.camera.fov, targetFov, 1 - Math.exp(-dt * 4));
    this.camera.updateProjectionMatrix();

    // ظل الشمس بيمشي مع العربية
    this.sunLight.position.set(pos.x - 32, 44, pos.z + 26);
    this.sunLight.target.position.set(pos.x, 0, pos.z);
    this.sunLight.target.updateMatrixWorld();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

// تنبيه "لُف الموبايل" في الوضع الرأسي
(function rotateHint() {
  const el = document.getElementById('rotate-hint');
  if (!el) return;
  el.addEventListener('click', () => { el.style.display = 'none'; el.dataset.dismissed = '1'; });
  const check = () => {
    const portrait = window.innerHeight > window.innerWidth;
    if (el.dataset.dismissed === '1') { el.style.display = 'none'; return; }
    el.style.display = (portrait && window.innerWidth < 820) ? 'grid' : 'none';
  };
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', () => setTimeout(check, 200));
  check();
})();

function showBootError(err) {
  console.error(err);
  const l = document.getElementById('loading');
  if (l) l.innerHTML = `<div style="color:#ff5566;font-weight:800;padding:20px;text-align:center">
      حصلت مشكلة في تشغيل اللعبة<br><small style="opacity:.7">${String(err.message || err)}</small></div>`;
}

window.addEventListener('DOMContentLoaded', async () => {
  const txt = document.querySelector('#loading .loader');
  const bar = document.querySelector('#loading .bar i');
  try {
    if (txt) txt.textContent = 'بنحمّل العربيات…';
    const assets = await loadCarAssets((p) => {
      if (bar) bar.style.width = Math.round(p * 100) + '%';
    });
    if (bar) bar.style.width = '100%';
    if (txt) txt.textContent = 'بنظبط الطريق…';
    window.game = new Game(assets);
  } catch (err) {
    showBootError(err);
  }
});
