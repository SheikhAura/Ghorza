import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { FBXLoader } from '../vendor/addons/loaders/FBXLoader.js';
import { mergeGroups } from '../vendor/addons/utils/BufferGeometryUtils.js';

/* =========================================================
   موديلات العربيات
   - Quaternius Cars (CC0) بصيغة FBX — عربيات بشرية الشكل
     (شاهين/١٢٨/تاكسي/SUV/كوبيه) وفيها عجل منفصل.
   - Kenney Car Kit (CC0) بصيغة GLB — احتياطي/إضافي.
   ========================================================= */

export const CAR_ASSETS = {
  sedan: { file: 'NormalCar1.fbx', type: 'fbx', L: 4.25, W: 1.80, H: 1.35 },   // شاهين
  hatch: { file: 'NormalCar2.fbx', type: 'fbx', L: 3.62, W: 1.66, H: 1.34 },   // ١٢٨ / فابريكا
  taxi: { file: 'Taxi.fbx', type: 'fbx', L: 4.25, W: 1.80, H: 1.42 },
  suv: { file: 'SUV.fbx', type: 'fbx', L: 4.55, W: 2.00, H: 1.78 },
  sports: { file: 'SportsCar.fbx', type: 'fbx', L: 4.20, W: 1.82, H: 1.24 },
  sports2: { file: 'SportsCar2.fbx', type: 'fbx', L: 4.22, W: 1.86, H: 1.28 },
  cop: { file: 'Cop.fbx', type: 'fbx', L: 4.30, W: 1.80, H: 1.40 },
};

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
gltfLoader.setPath('./assets/cars/');
fbxLoader.setPath('./assets/cars/');

/* ---------- أسماء الخامات الأصلية → أنواع عندنا ---------- */
const MAT_KIND = {
  windows: 'window', window: 'window', glass: 'window',
  black: 'tire', tire: 'tire', wheel: 'tire', rubber: 'tire',
  grey: 'chrome', gray: 'chrome', chrome: 'chrome', metal: 'chrome',
  headlights: 'lightFront', headlight: 'lightFront', whitelights: 'lightFront', lightfront: 'lightFront',
  taillights: 'lightBack', taillight: 'lightBack', bluelights: 'lightBack', lightback: 'lightBack',
};

function isWheelNode(name) {
  return /wheel|wheel_/i.test(name || '');
}

function findWheelNodes(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh && !o.isGroup) return;
    if (isWheelNode(o.name)) out.push(o);
  });
  // لو لقينا نود جوّه نود عجلة نشيله
  return out.filter((o) => !out.some((p) => p !== o && isDescendant(o, p)));
}

function isDescendant(child, parent) {
  let p = child.parent;
  while (p) { if (p === parent) return true; p = p.parent; }
  return false;
}

/* ---------- تحويل خامات FBX (Phong) لخاماتنا ---------- */
function convertMaterials(root, fbx) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });

  // الهيكل = أكبر mesh مش عجل
  let body = null;
  for (const m of meshes) {
    if (isWheelNode(m.name)) continue;
    if (!body || m.geometry.attributes.position.count > body.geometry.attributes.position.count) body = m;
  }

  // مادة الدهان = أول مادة في الهيكل مش معروفة
  let paintName = null;
  if (body) {
    const mats = Array.isArray(body.material) ? body.material : [body.material];
    for (const m of mats) {
      const n = (m.name || '').toLowerCase();
      if (!MAT_KIND[n] && n !== 'material.007' && n !== 'darkorange') { paintName = n; break; }
    }
  }

  const cache = new Map();
  const make = (orig) => {
    const raw = (orig.name || '').toLowerCase();
    let kind = raw === paintName ? 'paint' : (MAT_KIND[raw] || 'trim');
    const key = kind + '|' + (orig.color ? orig.color.getHexString() : '');
    if (cache.has(key)) return cache.get(key);
    let mat;
    if (kind === 'paint') {
      mat = new THREE.MeshPhysicalMaterial({
        color: orig.color ? orig.color.clone() : 0xcccccc,
        metalness: 0.22, roughness: 0.34, clearcoat: 0.95, clearcoatRoughness: 0.10, envMapIntensity: 1.05,
      });
      mat.name = 'paint';
    } else if (kind === 'window') {
      mat = new THREE.MeshPhysicalMaterial({
        color: 0x0a1118, metalness: 0.65, roughness: 0.07, transparent: true, opacity: 0.93,
        clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.7, side: THREE.DoubleSide,
      });
      mat.name = 'window';
    } else if (kind === 'tire') {
      mat = new THREE.MeshStandardMaterial({ color: 0x121216, roughness: 0.94, metalness: 0.02 });
      mat.name = 'tire';
    } else if (kind === 'chrome') {
      mat = new THREE.MeshStandardMaterial({ color: 0xb9c0ca, roughness: 0.28, metalness: 0.92, envMapIntensity: 1.3 });
      mat.name = 'chrome';
    } else if (kind === 'lightFront') {
      mat = new THREE.MeshPhysicalMaterial({
        color: 0xf7f2e0, emissive: 0xfff0cc, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.3,
      });
      mat.name = 'lightFront';
    } else if (kind === 'lightBack') {
      mat = new THREE.MeshPhysicalMaterial({
        color: 0x7d1018, emissive: 0xff2233, emissiveIntensity: 1.0, roughness: 0.3, metalness: 0.2,
      });
      mat.name = 'lightBack';
    } else {
      mat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.72, metalness: 0.25 });
      mat.name = 'trim';
    }
    cache.set(key, mat);
    return mat;
  };

  for (const m of meshes) {
    if (Array.isArray(m.material)) m.material = m.material.map(make);
    else m.material = make(m.material);
  }
}

/* ---------- تحضير موديل واحد ---------- */
function prepare(rawScene, spec) {
  const root = rawScene;

  if (spec.type === 'fbx') {
    // Quaternius بتيجي Z-up وقدامها ناحية -Y → نرفعها Y-up
    root.rotation.x = -Math.PI / 2;
    root.updateMatrixWorld(true);
    convertMaterials(root, true);
  }

  root.updateMatrixWorld(true);

  const wheelNodes = findWheelNodes(root);
  const wheelSet = new Set(wheelNodes);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const sx = spec.W / Math.max(0.001, size.x);
  const sy = spec.H / Math.max(0.001, size.y);
  const sz = spec.L / Math.max(0.001, size.z);

  // العجل: بنكبّرها شوية عن نسبة الموديل عشان تبان طبيعية
  const wheelScale = Math.min(sx, sy, sz) * 1.10;

  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const sc = isInsideWheel(o, wheelSet) ? wheelScale : 0; // 0 = استخدم المقاسات العادية
    if (sc) g.scale(sc, sc, sc);
    else g.scale(sx, sy, sz);
    g.computeVertexNormals();
    // دمج المجموعات اللي بنفس المادة → 8 draw calls بدل 100+
    if (g.groups && g.groups.length > 1) {
      try { mergeGroups(g); } catch (e) { /* لو فشل نكمل عادي */ }
    }
    o.geometry = g;
    o.castShadow = false;
    o.receiveShadow = false;
  });

  for (const w of wheelNodes) {
    w.position.set(w.position.x * sx, w.position.y * sy, w.position.z * sz);
  }

  // الموديل لمستوى الأرض وفي النص
  const box2 = new THREE.Box3().setFromObject(root);
  const center = box2.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -box2.min.y, -center.z);

  const holder = new THREE.Group();
  const flip = new THREE.Group();
  // الموديلات بتبص ناحية -Z والفيزيا بتاعتنا بتفترض إن قدام العربية = +Z
  flip.rotation.y = Math.PI;
  flip.add(root);
  holder.add(flip);
  holder.updateMatrixWorld(true);

  /* ---------- العجل: pivot عند مركز العجلة ---------- */
  const wheels = [];
  for (const w of wheelNodes) {
    const meshes = [];
    w.traverse((o) => { if (o.isMesh) meshes.push(o); });
    if (!meshes.length) continue;

    const wb = new THREE.Box3().setFromObject(w);
    const centerW = wb.getCenter(new THREE.Vector3());
    const radius = Math.max(0.16, wb.getSize(new THREE.Vector3()).y / 2);

    const parent = w.parent || root;
    const steer = new THREE.Group();
    steer.name = 'wheelPivot_' + w.name.replace(/^wheel[_-]?/i, '');
    const spin = new THREE.Group();
    spin.name = 'wheelSpin_' + w.name.replace(/^wheel[_-]?/i, '');
    steer.add(spin);
    parent.add(steer);
    parent.updateMatrixWorld(true);
    steer.position.copy(parent.worldToLocal(centerW.clone()));
    steer.updateMatrixWorld(true);

    for (const m of meshes) spin.attach(m);
    if (w.parent && w.children.length === 0) w.parent.remove(w);

    wheels.push({
      pivot: steer,
      spinner: spin,
      isFront: /front/i.test(w.name),
      radius,
      baseQuat: new THREE.Quaternion(),
    });
  }
  holder.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(holder);
  const size2 = finalBox.getSize(new THREE.Vector3());

  return {
    template: holder,
    dims: { L: size2.z, W: size2.x, H: size2.y },
    wheelRadius: wheels[0] ? wheels[0].radius : 0.33,
  };
}

function isInsideWheel(obj, wheelSet) {
  let p = obj;
  while (p) {
    if (wheelSet.has(p)) return true;
    p = p.parent;
  }
  return false;
}

export async function loadCarAssets(onProgress) {
  const keys = Object.keys(CAR_ASSETS);
  const out = {};
  let done = 0;
  for (const key of keys) {
    const spec = CAR_ASSETS[key];
    const loader = spec.type === 'fbx' ? fbxLoader : gltfLoader;
    const res = await loader.loadAsync(spec.file);
    out[key] = prepare(spec.type === 'fbx' ? res : res.scene, spec);
    done++;
    if (onProgress) onProgress(done / keys.length, key);
  }
  return out;
}

/* ---------- ألوان الدهان ---------- */
const PAINT_NAMES = ['paintred', 'paintblue', 'paintgreen', 'paintyellow', 'paintorange', 'paintwhite', 'paintblack'];

function setupMaterials(root, opts) {
  const glassMats = [];
  const tailMats = [];
  const headMats = [];
  const paintMats = [];
  let tinted = false;
  const seen = new Set();

  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const newMats = mats.map((m) => {
      if (seen.has(m)) return m;
      const mat = m.clone();
      seen.add(m);
      const name = (m.name || '').toLowerCase();

      if (PAINT_NAMES.includes(name) || name === 'paint') {
        if (opts.color !== undefined && !tinted) {
          mat.color.setHex(opts.color);
          tinted = true;
        }
        mat.metalness = 0.35;
        mat.roughness = 0.30;
        if ('clearcoat' in mat) { mat.clearcoat = 0.85; mat.clearcoatRoughness = 0.18; }
        mat.envMapIntensity = 1.25;
        paintMats.push(mat);
      } else if (name.includes('window') || name.includes('glass') || name === 'window') {
        mat.color.setHex(0x0b1219);
        mat.metalness = 0.6;
        mat.roughness = 0.08;
        mat.transparent = true;
        mat.opacity = 0.93;
        mat.envMapIntensity = 1.6;
        glassMats.push(mat);
      } else if (name.includes('tire') || name.includes('wheel') || name.includes('rubber') || name === 'tire') {
        mat.color.setHex(0x121216);
        mat.roughness = 0.93;
        mat.metalness = 0.03;
      } else if (name.includes('lightfront') || name.includes('headlight')) {
        mat.emissive = new THREE.Color(0xfff0cc);
        mat.emissiveIntensity = 0.9;
        mat.color.setHex(0xf6f1e0);
        headMats.push(mat);
      } else if (name.includes('lightback') || name.includes('taillight') || name.includes('brake')) {
        mat.emissive = new THREE.Color(0xff2233);
        mat.emissiveIntensity = 1.0;
        mat.color.setHex(0x7d1018);
        tailMats.push(mat);
      }
      return mat;
    });
    o.material = Array.isArray(o.material) ? newMats : newMats[0];
  });

  return { glassMats, tailMats, headMats, paintMats };
}

/** بيعمل نسخة عربية جاهزة للعرض/الفيزيا */
export function spawnCarModel(assets, key, opts = {}) {
  const a = assets[key];
  if (!a) throw new Error('unknown car asset: ' + key);
  const group = a.template.clone(true);

  const wheels = [];
  group.traverse((o) => {
    if (o.name && o.name.toLowerCase().startsWith('wheelpivot_')) {
      wheels.push({
        pivot: o,
        spinner: o.children.find((c) => c.name.startsWith('wheelSpin_')) || o.children[0],
        isFront: /front/i.test(o.name),
        radius: a.wheelRadius,
        baseQuat: new THREE.Quaternion(),
      });
    }
  });

  const mats = setupMaterials(group, opts);

  const shells = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    let p = o;
    while (p) {
      const pn = (p.name || '').toLowerCase();
      if (pn.startsWith('wheel_') || pn.startsWith('wheelpivot_') || pn.startsWith('wheelspin_')) return;
      p = p.parent;
    }
    if (o.geometry.attributes.position.count < 24) return;
    const mn = ((Array.isArray(o.material) ? o.material[0] : o.material).name || '').toLowerCase();
    if (mn.includes('window') || mn.includes('light')) return;
    o.geometry = o.geometry.clone();
    shells.push(o);
  });
  const body = shells.reduce((best, m) => (
    !best || m.geometry.attributes.position.count > best.geometry.attributes.position.count ? m : best
  ), null);

  const dims = a.dims;
  const origs = shells.map((m) => Float32Array.from(m.geometry.attributes.position.array));

  return {
    group,
    body,
    shells,
    dims,
    wheels,
    glass: mats.glassMats,
    restoreShells() {
      shells.forEach((m, i) => {
        const pos = m.geometry.attributes.position;
        pos.array.set(origs[i]);
        pos.needsUpdate = true;
        m.geometry.computeVertexNormals();
      });
    },
    setBrake(on) {
      for (const m of mats.tailMats) m.emissiveIntensity = on ? 3.2 : 0.9;
    },
    setLights(on) {
      for (const m of mats.headMats) m.emissiveIntensity = on ? 2.4 : 0.85;
    },
    breakGlass() {
      for (const m of mats.glassMats) { m.transparent = true; m.opacity = 0.16; m.color.setHex(0x3a4a55); }
    },
    restoreGlass() {
      for (const m of mats.glassMats) { m.transparent = true; m.opacity = 0.93; m.color.setHex(0x0b1219); }
    },
  };
}

/* ---------- ألوان عربيات المرور ---------- */
export const TRAFFIC_COLORS = {
  sedan: [0xdfe3ea, 0x8d97a8, 0x2f3b4d, 0x7d2f2c, 0xc9c2b4, 0x33544e, 0xf0efe6],
  hatch: [0xd8dbe2, 0x2b6b5a, 0x8e3b32, 0x3b4a63, 0xe8e4d8],
  taxi: [0xf4f4ef],
  suv: [0x2c2f36, 0xb9bcc2, 0x4a5a45, 0x6a4a3a, 0xf1f0ea],
  sports: [0x1e2128, 0xa8342c, 0x24507e, 0xe0d44a],
  sports2: [0xd8d9dd, 0x2f3b4d, 0x8a2f2a],
  cop: [0xf2f3f0],
};
