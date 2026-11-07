import * as THREE from 'three';
import { spawnCarModel, TRAFFIC_COLORS } from './carAssets.js';

/* =========================================================
   خامات وأدوات مشتركة + التوك توك المخصص
   (باقي العربيات موديلات GLB حقيقية من Kenney Car Kit)
   ========================================================= */

export const MAT = {
  tire: new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.92, metalness: 0.05 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xc9ccd6, roughness: 0.32, metalness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.7, metalness: 0.25 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecf5, roughness: 0.18, metalness: 1.0 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x0b1219, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.92,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6, side: THREE.DoubleSide,
  }),
  head: new THREE.MeshPhysicalMaterial({ color: 0xf7f2e0, emissive: 0xfff2cc, emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.4 }),
  tail: new THREE.MeshPhysicalMaterial({ color: 0x8b0f18, emissive: 0xff2233, emissiveIntensity: 0.9, roughness: 0.3 }),
};

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function makeWheel(radius, width) {
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.add(spin);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 16, 1), MAT.tire);
  tire.rotation.z = Math.PI / 2;
  spin.add(tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, width * 1.03, 14, 1), MAT.rim);
  rim.rotation.z = Math.PI / 2;
  spin.add(rim);
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(width * 1.05, radius * 1.0, radius * 0.12), MAT.rim);
    sp.rotation.x = (i / 4) * Math.PI;
    spin.add(sp);
  }
  return { pivot, spinner: spin, radius };
}

/* =========================================================
   توك توك (موديل مخصص بالكود — مفيش في مكتبات الموديلات)
   ========================================================= */
function buildTuktuk(color = 0x2fbf71) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.42, metalness: 0.25, clearcoat: 0.6, envMapIntensity: 1.1,
  });
  const L = 2.7, W = 1.34;
  const bed = box(W, 0.5, L * 0.62, bodyMat, 0, 0.56, -0.25);
  group.add(bed);
  group.add(box(W * 0.98, 0.06, L * 0.62, MAT.dark, 0, 0.83, -0.25));
  group.add(box(W * 0.9, 0.62, 0.5, bodyMat, 0, 1.05, 0.7));
  group.add(box(W * 1.02, 0.06, L * 0.78, new THREE.MeshStandardMaterial({ color: 0x22242c, roughness: 0.85 }), 0, 1.5, -0.05));
  for (const s of [-1, 1]) {
    for (const z of [0.62, -0.72]) group.add(box(0.05, 0.66, 0.05, MAT.dark, s * W * 0.48, 1.18, z));
  }
  const shield = box(W * 0.82, 0.5, 0.04, MAT.glass, 0, 1.12, 0.95);
  shield.rotation.x = -0.16;
  group.add(shield);
  const head = box(0.24, 0.14, 0.05, MAT.head, 0, 0.68, 1.32);
  const tail = box(0.3, 0.14, 0.05, MAT.tail, 0, 0.7, -1.3);
  group.add(head, tail);

  const wheels = [];
  const wr = 0.27;
  const front = makeWheel(wr, 0.14);
  front.pivot.position.set(0, wr, 1.05);
  front.isFront = true;
  group.add(front.pivot);
  wheels.push(front);
  for (const s of [-1, 1]) {
    const w = makeWheel(wr, 0.16);
    w.pivot.position.set(s * (W / 2 - 0.06), wr, -0.78);
    group.add(w.pivot);
    wheels.push(w);
  }

  const shellList = [bed];
  const origs = shellList.map((m) => Float32Array.from(m.geometry.attributes.position.array));

  return {
    group, body: bed, dims: { L, W, H: 1.6 }, wheels,
    glass: [shield],
    shells: shellList,
    restoreShells() {
      shellList.forEach((m, i) => {
        const pos = m.geometry.attributes.position;
        pos.array.set(origs[i]);
        pos.needsUpdate = true;
        m.geometry.computeVertexNormals();
      });
    },
    setBrake(on) { tail.material.emissiveIntensity = on ? 3 : 0.9; },
    setLights() {},
    breakGlass() { shield.visible = false; },
    restoreGlass() { shield.visible = true; },
  };
}

/* =========================================================
   مصنع الموديلات
   ========================================================= */
export function createVehicleModel(assets, def, color) {
  if (def.tuktuk) return buildTuktuk(color ?? def.color ?? 0x2fbf71);
  const m = spawnCarModel(assets, def.asset, { color: color ?? def.color });
  m.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return m;
}

/* =========================================================
   عربيات اللاعب
   ========================================================= */
export const CAR_DEFS = {
  shahin: {
    name: 'شاهين', sub: 'سيدان عائلية', asset: 'sedan', color: 0xc7cfdd,
    perf: { power: 0.95, grip: 1.0, mass: 950, top: 180 },
  },
  fabrika: {
    name: 'فابريكا', sub: '١٢٨ قديمة', asset: 'hatch', color: 0x9db7d4,
    perf: { power: 0.72, grip: 0.88, mass: 820, top: 150 },
  },
  taxi: {
    name: 'تاكسي', sub: 'أبيض × أصفر', asset: 'taxi', color: 0xf3c53a,
    perf: { power: 0.9, grip: 0.97, mass: 940, top: 176 },
  },
  coupe: {
    name: 'كوبيه', sub: 'رياضية سريعة', asset: 'sports', color: 0xd8642a,
    perf: { power: 1.4, grip: 1.12, mass: 1180, top: 228 },
  },
  family: {
    name: 'عائلية', sub: 'SUV كبيرة', asset: 'suv', color: 0x3f5a4e,
    perf: { power: 1.05, grip: 0.95, mass: 1500, top: 190 },
  },
};

/* =========================================================
   عربيات المرور
   ========================================================= */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export const TRAFFIC_DEFS = [
  { id: 'sedan', asset: 'sedan', mass: 950, speed: [16, 27], colors: TRAFFIC_COLORS.sedan },
  { id: 'hatch', asset: 'hatch', mass: 820, speed: [17, 28], colors: TRAFFIC_COLORS.hatch },
  { id: 'taxi', asset: 'taxi', mass: 940, speed: [15, 26], colors: TRAFFIC_COLORS.taxi },
  { id: 'suv', asset: 'suv', mass: 1500, speed: [14, 23], colors: TRAFFIC_COLORS.suv },
  { id: 'sports', asset: 'sports', mass: 1050, speed: [21, 33], colors: TRAFFIC_COLORS.sports },
  { id: 'sports2', asset: 'sports2', mass: 1100, speed: [19, 30], colors: TRAFFIC_COLORS.sports2 },
  { id: 'sedan2', asset: 'sedan', mass: 960, speed: [13, 22], colors: TRAFFIC_COLORS.sedan },
  { id: 'tuktuk', tuktuk: true, mass: 320, speed: [7, 12], colors: [0x2fbf71, 0xe0a12a, 0x2b8bd6, 0xd94f3d] },
];

export function randomTrafficColor(def) {
  return pick(def.colors || [0xcccccc]);
}

/* =========================================================
   تلف الهيكل: بنزق الـ vertices حوالين نقطة الخبطة
   ========================================================= */
export function dentGeometry(mesh, localPoint, localDir, strength) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const radius = 0.5 + strength * 0.85;
  const p = new THREE.Vector3();
  const d = new THREE.Vector3().copy(localDir).normalize();
  let moved = 0;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const dist = p.distanceTo(localPoint);
    if (dist > radius) continue;
    const f = Math.pow(1 - dist / radius, 1.5) * strength * 0.22;
    if (f <= 0.0005) continue;
    pos.setXYZ(i, p.x + d.x * f, p.y + d.y * f, p.z + d.z * f);
    moved++;
  }
  if (moved) {
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    if (geo.boundingBox) geo.computeBoundingBox();
  }
  return moved;
}
