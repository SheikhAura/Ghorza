import * as THREE from 'three';
import { LANES, LANE_W, ROAD_HALF_W, BARRIER_X } from './physics.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ---------- تيكستشر الأسفلت (طريق اتجاه واحد زي الدائري) ---------- */
const TILE_M = 26;            // طول البلاطة بالمتر
const ROAD_LEN = 2600;        // طول شريط الأسفلت (بيتزحلق مع اللاعب)

function asphaltTexture() {
  const W = 1024, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const totalW = ROAD_HALF_W * 2;
  const toU = (x) => ((x + ROAD_HALF_W) / totalW) * W;

  // أسفلت أساسي
  g.fillStyle = '#3c3d42';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) {
    const v = 44 + Math.random() * 44;
    g.fillStyle = `rgba(${v},${v},${v + 5},${Math.random() * 0.4})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // آثار كاوتش (خطوط غامقة في نص كل حارة)
  const laneU = LANES.map(toU);
  for (const u of laneU) {
    for (const s of [-1, 1]) {
      const grad = g.createLinearGradient(u + s * 22 - 16, 0, u + s * 22 + 16, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, 'rgba(0,0,0,.16)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(u + s * 22 - 16, 0, 32, H);
    }
  }

  // الكتف (لون أغمق شوية + رمل على الحرف)
  const edgeU = toU(LANES[LANES.length - 1] + LANE_W / 2);
  for (const s of [-1, 1]) {
    const u0 = s < 0 ? 0 : edgeU;
    const u1 = s < 0 ? W - edgeU : W;
    g.fillStyle = 'rgba(28,26,24,.30)';
    g.fillRect(u0, 0, u1 - u0, H);
  }

  // خطوط فاصلة متقطعة (3 م خط / 6 م فراغ)
  g.strokeStyle = 'rgba(244,242,232,.88)';
  const pxPerM = H / TILE_M;
  g.lineWidth = 7;
  const dividers = [];
  for (let i = 0; i < LANES.length - 1; i++) dividers.push((laneU[i] + laneU[i + 1]) / 2);
  for (const u of dividers) {
    g.setLineDash([3 * pxPerM, 6 * pxPerM]);
    g.beginPath(); g.moveTo(u, 0); g.lineTo(u, H); g.stroke();
  }
  g.setLineDash([]);

  // خطوط حد الحارات المتصلة
  g.lineWidth = 9;
  for (const s of [-1, 1]) {
    const u = toU(s * (LANES[LANES.length - 1] + LANE_W / 2));
    g.beginPath(); g.moveTo(u, 0); g.lineTo(u, H); g.stroke();
  }

  // سهم اتجاه واحد في كل حارة
  g.fillStyle = 'rgba(246,244,236,.9)';
  for (const u of laneU) {
    const tipY = H * 0.66;
    const head = 30, shaft = 15, len = 105;
    g.beginPath();
    g.moveTo(u, tipY);
    g.lineTo(u - head, tipY - 52);
    g.lineTo(u - shaft / 2, tipY - 52);
    g.lineTo(u - shaft / 2, tipY - 52 - len);
    g.lineTo(u + shaft / 2, tipY - 52 - len);
    g.lineTo(u + shaft / 2, tipY - 52);
    g.lineTo(u + head, tipY - 52);
    g.closePath();
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ---------- لوحة إرشادية خضراء ---------- */
function signTexture(lines, bg = '#0f6b3f') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#f3f7f3'; g.lineWidth = 8;
  g.strokeRect(10, 10, 492, 236);
  g.fillStyle = '#f7fbf7';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 54px system-ui, Tahoma, sans-serif';
  lines.forEach((t, i) => g.fillText(t, 256, 78 + i * 68));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- تيكستشر الشبك المعدني (شفاف) ---------- */
function fenceTexture() {
  const W = 128, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.strokeStyle = '#aab2bd';
  g.lineWidth = 3;
  for (let i = -H; i < W + H; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke();
    g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- تيكستشر الحاجز الخرساني ---------- */
function barrierTexture() {
  const W = 128, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#b9b6ad';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const v = 150 + Math.random() * 60;
    g.fillStyle = `rgba(${v},${v},${v - 6},${Math.random() * 0.4})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // وصلات بين الوحدات
  g.fillStyle = 'rgba(90,88,82,.65)';
  g.fillRect(0, 0, 4, H);
  // شريط عواكس أصفر/أحمر
  g.fillStyle = '#e8b93a'; g.fillRect(0, H * 0.30, W, H * 0.07);
  g.fillStyle = '#cf3b33'; g.fillRect(W * 0.5, H * 0.30, W * 0.24, H * 0.07);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** خامة لوحة: بتفضل واضحة ولونها مظبوط مهما كانت الإضاءة (زي العواكس) */
function signMaterial(tex, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55,
    roughness: 0.8, metalness: 0.0, side: THREE.FrontSide, ...extra,
  });
}

function windowTexture(night = false) {
  const W = 128, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = night ? '#221f2b' : '#c9bda8';
  g.fillRect(0, 0, W, H);
  for (let y = 6; y < H - 6; y += 16) {
    for (let x = 8; x < W - 8; x += 18) {
      const lit = Math.random() > 0.42;
      if (night) g.fillStyle = lit ? (Math.random() > 0.5 ? '#ffd694' : '#ffe9c0') : '#191722';
      else g.fillStyle = Math.random() > 0.5 ? '#5c6a78' : '#4a5462';
      g.fillRect(x, y, 11, 9);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function billboardTexture(text, bg = '#e6542f') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 200, 512, 56);
  g.fillStyle = '#fff8ec';
  g.font = 'bold 92px system-ui, Tahoma, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 116);
  g.font = 'bold 30px system-ui, Tahoma, sans-serif';
  g.fillText('ع الدائري · 3D', 256, 226);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- شجرة نخل ---------- */
function palm() {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7c5a3a, roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 5.2, 7), trunkMat);
  trunk.position.y = 2.6;
  g.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.85, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.6), leafMat);
    const a = (i / 6) * Math.PI * 2 + Math.random();
    leaf.position.set(Math.cos(a) * 0.9, 5.1 + Math.random() * 0.3, Math.sin(a) * 0.9);
    leaf.rotation.set(rand(-0.2, 0.2), -a + Math.PI / 2, rand(-1.1, -0.5), 'YXZ');
    leaf.rotation.z = -rand(0.6, 1.2);
    leaf.rotation.x = rand(-0.3, 0.3);
    g.add(leaf);
  }
  return g;
}

function streetLight(night) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6f7480, roughness: 0.55, metalness: 0.7 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7.4, 8), mat);
  pole.position.y = 3.7;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.12), mat);
  arm.position.set(-1.0, 7.35, 0);
  g.add(arm);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff0c0, emissive: 0xffdf95, emissiveIntensity: night ? 2.6 : 0.15, roughness: 0.4,
  });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.34), lampMat);
  lamp.position.set(-2.0, 7.24, 0);
  g.add(lamp);
  g.userData.lampMat = lampMat;
  return g;
}

function radarGantry() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8e93a0, roughness: 0.5, metalness: 0.75 });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 8.4, 0.28), mat);
    post.position.set(s * (ROAD_HALF_W + 1.2), 4.2, 0);
    post.castShadow = true;
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry((ROAD_HALF_W + 1.4) * 2, 0.34, 0.34), mat);
  beam.position.y = 8.2;
  g.add(beam);
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.6 }));
  cam.position.set(ROAD_HALF_W * 0.45, 7.8, 0.2);
  g.add(cam);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3344, emissiveIntensity: 2.2 }));
  lens.position.set(ROAD_HALF_W * 0.45, 7.8, 0.68);
  g.add(lens);
  const signMat = signMaterial(billboardTexture('رادار', '#1f4bb8'));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), signMat);
  sign.position.set(0, 9.6, 0);
  sign.rotation.y = Math.PI;
  g.add(sign);
  return g;
}

function directionGantry() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8e93a0, roughness: 0.5, metalness: 0.75 });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8.6, 0.3), mat);
    post.position.set(s * (ROAD_HALF_W + 1.1), 4.3, 0);
    post.castShadow = true;
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry((ROAD_HALF_W + 1.2) * 2, 0.36, 0.36), mat);
  beam.position.y = 8.5;
  g.add(beam);

  const panels = [
    { text: ['المعادي · التجمع', 'الدائري الإقليمي'], x: -4.6, w: 7.2 },
    { text: ['اتجاه واحد', '→ → →'], x: 5.0, w: 4.4, bg: '#12496b' },
  ];
  for (const p of panels) {
    const m = signMaterial(signTexture(p.text, p.bg || '#0f6b3f'));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.w * 0.44), m);
    sign.position.set(p.x, 7.2, 0.12);
    sign.rotation.y = Math.PI; // بتقابل السير الجاي
    g.add(sign);
  }
  return g;
}

function overpass() {
  const g = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.9 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(58, 1.5, 9), concrete);
  deck.position.y = 8.6; deck.castShadow = true;
  g.add(deck);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(58, 1.0, 0.3), concrete);
    rail.position.set(0, 9.8, s * 4.4);
    g.add(rail);
  }
  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 8.6, 2.4), concrete);
    pillar.position.set(s * 14.5, 4.3, 0);
    pillar.castShadow = true;
    g.add(pillar);
  }
  return g;
}

/* =========================================================
   المشهد: طريق من بوليصات (segments) + ديكور متجدد
   ========================================================= */
export class Scenery {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.night = false;
    this.billboards = ['كشري', 'بوفيه', 'بنزين', 'الورشة', 'دوس بنزين', 'ميكانيكا', 'كوباية شاي'];

    this.segLen = 26;
    this.segCount = 16;
    this.total = this.segLen * this.segCount;

    /* ---------- شريط الطريق المستمر ----------
       الأسفلت + الحواجز مش بيتقطّعوا: شريط واحد طويل بيتزحلق مع اللاعب
       بخطوات 26 متر (طول البلاطة) فمفيش أي "تحميل" أو فراغ قدامك. */
    const tex = asphaltTexture();
    tex.repeat.set(1, ROAD_LEN / TILE_M);
    this.roadMat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.78, metalness: 0.06, color: 0xffffff,
    });
    this.curbMat = new THREE.MeshStandardMaterial({ color: 0x9a9384, roughness: 0.9 });

    this.barrierMat = new THREE.MeshStandardMaterial({ map: barrierTexture(), roughness: 0.86, metalness: 0.05 });
    this.barrierMat.map.repeat.set(ROAD_LEN / 4.3, 1);
    this.barrierMat.map.wrapS = THREE.RepeatWrapping;
    const fenceTex = fenceTexture();
    fenceTex.repeat.set(ROAD_LEN / 2, 1);
    this.fenceMat = new THREE.MeshStandardMaterial({
      map: fenceTex, alphaMap: fenceTex, transparent: true, alphaTest: 0.35,
      color: 0xb9c0ca, roughness: 0.45, metalness: 0.75, side: THREE.DoubleSide,
    });

    this.roadGroup = new THREE.Group();
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF_W * 2 + 0.4, ROAD_LEN),
      this.roadMat,
    );
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    this.roadGroup.add(road);

    for (const sgn of [-1, 1]) {
      // رصيف/كتف خرساني
      const curb = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, ROAD_LEN), this.curbMat);
      curb.position.set(sgn * (ROAD_HALF_W + 0.95), 0.11, 0);
      curb.receiveShadow = true;
      this.roadGroup.add(curb);

      // حاجز جيرسي خرساني (نفس مكان الحاجز الفيزيائي)
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.24, ROAD_LEN), this.barrierMat);
      barrier.position.set(sgn * BARRIER_X, 0.62, 0);
      barrier.receiveShadow = true;
      this.roadGroup.add(barrier);

      // شبك معدني فوق الحاجز + عمود علوي
      const fence = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LEN, 0.85), this.fenceMat);
      fence.rotation.y = Math.PI / 2;
      fence.position.set(sgn * BARRIER_X, 1.72, 0);
      this.roadGroup.add(fence);
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.09, ROAD_LEN),
        new THREE.MeshStandardMaterial({ color: 0xb9c0ca, roughness: 0.35, metalness: 0.85 }),
      );
      rail.position.set(sgn * BARRIER_X, 2.15, 0);
      this.roadGroup.add(rail);

      // شريط عاكس على وش الحاجز
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.16, ROAD_LEN),
        new THREE.MeshStandardMaterial({ color: 0xf0f0e6, emissive: 0xfff6d8, emissiveIntensity: 0.35, roughness: 0.5 }),
      );
      strip.position.set(sgn * (BARRIER_X - 0.44), 1.05, 0);
      this.roadGroup.add(strip);
    }
    this.scene.add(this.roadGroup);

    this.facadeDay = new THREE.MeshStandardMaterial({ map: windowTexture(false), roughness: 0.85 });
    this.facadeNight = new THREE.MeshStandardMaterial({ map: windowTexture(true), roughness: 0.8 });

    /* ---------- بوليصات الديكور بس (مباني/نخل/نور) ---------- */
    this.segments = [];
    for (let i = 0; i < this.segCount; i++) {
      const seg = new THREE.Group();
      const deco = new THREE.Group();
      deco.userData.props = [];
      seg.add(deco);
      seg.userData = { deco };
      seg.position.z = -i * this.segLen;
      this.segments.push(seg);
      scene.add(seg);
    }

    for (const seg of this.segments) this.populate(seg);

    // أرض صحراوية
    this.sand = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshStandardMaterial({ color: 0x9c8f74, roughness: 1 }));
    this.sand.rotation.x = -Math.PI / 2;
    this.sand.position.y = -0.45;  // وطّيها تحت الأسفلت عشان مفيش z-fighting
    sandReceive(this.sand);
    scene.add(this.sand);

    // رادارات وأكباري فوق الطريق
    this.gantries = [];
    for (let i = 0; i < 2; i++) {
      const g = radarGantry();
      g.position.z = -300 - i * 420;
      scene.add(g);
      this.gantries.push({ group: g, passed: false });
    }
    this.bridges = [];
    for (let i = 0; i < 2; i++) {
      const b = overpass();
      b.position.z = -520 - i * 700;
      scene.add(b);
      this.bridges.push(b);
    }
    this.radarSpacing = 460;
    this.bridgeSpacing = 780;

    // لوحات إرشادية علوية (اتجاه واحد / وجهات)
    this.signs = [];
    for (let i = 0; i < 2; i++) {
      const sg = directionGantry();
      sg.position.z = 150 + i * 640;
      scene.add(sg);
      this.signs.push(sg);
    }
    this.signSpacing = 640;

    this.buildSky();
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(700, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(0x2a3f7a) },
        bottom: { value: new THREE.Color(0xffb877) },
        offset: { value: 120 },
        exp: { value: 0.9 },
      },
      vertexShader: `varying vec3 vWorld; void main(){ vWorld = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float exp; varying vec3 vWorld;
        void main(){ float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y; 
        gl_FragColor = vec4(mix(bottom, top, pow(max(h,0.0), exp)), 1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    const sunGeo = new THREE.CircleGeometry(26, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.9 });
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    this.sun.position.set(-220, 130, 560);
    this.scene.add(this.sun);
  }

  populate(seg) {
    const deco = seg.userData.deco;
    // امسح الديكور القديم
    for (const p of deco.userData.props) {
      deco.remove(p);
      if (p.geometry && p.userData.disposable) p.geometry.dispose();
    }
    deco.userData.props = [];

    const facade = this.night ? this.facadeNight : this.facadeDay;
    // مباني
    for (const s of [-1, 1]) {
      if (Math.random() < 0.78) {
        const h = rand(6, 26);
        const w = rand(9, 18);
        const d = rand(8, 18);
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), facade);
        b.position.set(s * rand(17, 30), h / 2, rand(2, this.segLen - 2));
        b.castShadow = true;
        b.receiveShadow = true;
        deco.add(b);
        deco.userData.props.push(b);
      }
    }
    // نخل
    for (let i = 0; i < rand(1, 2); i++) {
      const s = Math.random() > 0.5 ? 1 : -1;
      const t = palm();
      t.position.set(s * rand(12.6, 16.5), 0, rand(0, this.segLen));
      t.scale.setScalar(rand(0.8, 1.2));
      deco.add(t);
      deco.userData.props.push(t);
    }
    // عمود نور
    const sl = streetLight(this.night);
    sl.position.set(-(ROAD_HALF_W + 2.6), 0, rand(1, this.segLen - 1));
    deco.add(sl);
    deco.userData.props.push(sl);

    // لوحة إعلانات
    if (Math.random() < 0.5) {
      const txt = pick(this.billboards);
      const mat = new THREE.MeshStandardMaterial({
        map: billboardTexture(txt, pick(['#e6542f', '#2f7de6', '#e0a12a', '#2fbf71'])),
        roughness: 0.7, side: THREE.DoubleSide,
        emissive: this.night ? 0xffffff : 0x000000, emissiveIntensity: this.night ? 0.35 : 0,
        emissiveMap: null,
      });
      const bb = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.1), mat);
      const s = Math.random() > 0.5 ? 1 : -1;
      bb.position.set(s * rand(13, 15), rand(3.4, 5.2), rand(2, this.segLen - 2));
      bb.rotation.y = s > 0 ? -Math.PI / 2.2 : Math.PI / 2.2;
      deco.add(bb);
      deco.userData.props.push(bb);
    }
  }

  setTime(night) {
    this.night = night;
    for (const seg of this.segments) this.populate(seg);
    if (this.onTimeChange) this.onTimeChange(night);
  }

  reset(playerZ) {
    this.syncRoad(playerZ);
    for (let i = 0; i < this.segments.length; i++) {
      this.segments[i].position.z = playerZ + 40 - i * this.segLen;
      this.populate(this.segments[i]);
    }
    this.gantries.forEach((g, i) => { g.group.position.z = playerZ + 320 + i * this.radarSpacing; g.passed = false; });
    this.bridges.forEach((b, i) => { b.position.z = playerZ + 180 + i * this.bridgeSpacing; });
    this.signs.forEach((sg, i) => { sg.position.z = playerZ + 150 + i * this.signSpacing; });
  }

  /** شريط الأسفلت والحواجز بيتزحلق مع اللاعب بخطوات بلاطة كاملة (مفيش فراغ) */
  syncRoad(playerZ) {
    const snap = Math.round(playerZ / TILE_M) * TILE_M;
    this.roadGroup.position.z = snap;
  }

  update(playerZ, camera) {
    this.syncRoad(playerZ);
    // بوليصات الديكور
    for (const seg of this.segments) {
      if (seg.position.z > playerZ + 60) seg.position.z -= this.total;
      else if (seg.position.z < playerZ - this.total + 30) seg.position.z += this.total;
    }
    // رادارات
    for (const g of this.gantries) {
      if (g.group.position.z < playerZ - 40) {
        g.group.position.z += this.radarSpacing * this.gantries.length;
        g.passed = false;
      }
    }
    for (const b of this.bridges) {
      if (b.position.z < playerZ - 60) b.position.z += this.bridgeSpacing * this.bridges.length;
    }
    for (const sg of this.signs) {
      if (sg.position.z < playerZ - 40) sg.position.z += this.signSpacing * this.signs.length;
    }
    this.sand.position.z = playerZ;
    this.sky.position.set(camera.position.x * 0.2, 0, camera.position.z * 0.2);
    this.sun.position.z = camera.position.z + 520;
  }

  /** بيرجع عدد الرادارات اللي اللاعب عدّاها في الفريم ده */
  checkRadars(playerZ) {
    for (const g of this.gantries) {
      const dz = playerZ - g.group.position.z;
      if (!g.passed && dz > 0 && dz < 3.5) { g.passed = true; return true; }
    }
    return false;
  }

  /** أقرب رادار قدام اللاعب (بالمتر) */
  nextRadarDistance(playerZ) {
    let best = 1e9;
    for (const g of this.gantries) {
      const d = g.group.position.z - playerZ;
      if (d > 0 && d < best) best = d;
    }
    return best;
  }
}

function sandReceive(m) { m.receiveShadow = true; }
