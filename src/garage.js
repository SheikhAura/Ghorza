import * as THREE from 'three';
import { BARRIER_X, SHOULDER_W } from './physics.js';

/* =========================================================
   ورش الصيانة — محطات خدمة على الكتف اليمين كل ٦٥٠ متر
   ========================================================= */

// أماكن الورش جوه وحدة الطريق (اللي طولها 2600 م)
export const SHOP_SPACING = 650;
export const SHOP_LOCAL_Z = [-1140, -490, 160, 810, 1460];
export const SHOP_HALF_LEN = 14;      // نص طول ساحة الورشة
export const SHOP_X = 9.15;           // نص كتف الخدمة اليمين
export const SHOP_REACH = 1.6;        // لازم العربية تطلع على الكتف فعلاً

const C = {
  concrete: 0x8d8b86,
  concreteDark: 0x6f6d69,
  steel: 0x9aa0a8,
  red: 0xb8352c,
  green: 0x1f6b4a,
  glass: 0x1a2530,
  yellow: 0xe8c33a,
};

function signTexture(lines, opts = {}) {
  const W = 512, H = opts.h || 160;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.direction = 'rtl';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = opts.bg || '#0f4a32';
  g.fillRect(0, 0, W, H);
  g.fillStyle = opts.accent || '#e8c33a';
  g.fillRect(0, 0, W, 8);
  g.fillRect(0, H - 8, W, 8);
  g.fillStyle = opts.fg || '#f6f2e6';
  g.font = `700 ${opts.size || 62}px "Cairo","Tajawal",system-ui,sans-serif`;
  g.fillText(lines[0], W / 2, H * (lines.length > 1 ? 0.38 : 0.5), W - 40);
  if (lines[1]) {
    g.fillStyle = opts.fg2 || '#d9d3c0';
    g.font = `600 ${opts.size2 || 30}px "Cairo","Tajawal",system-ui,sans-serif`;
    g.fillText(lines[1], W / 2, H * 0.76, W - 40);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function apronTexture() {
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4a4d';
  g.fillRect(0, 0, W, H);
  // بقع وشقوق خفيفة
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    g.fillStyle = `rgba(${20 + Math.random() * 40},${20 + Math.random() * 38},${22 + Math.random() * 38},.5)`;
    g.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // خطوط صفراء (منطقة الخدمة)
  g.strokeStyle = '#e8c33a';
  g.lineWidth = 6;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(0, 40 + i * 34);
    g.lineTo(W, 66 + i * 34);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.19, 0.62, 10),
    new THREE.MeshStandardMaterial({ color: 0xd4501f, roughness: 0.7 }),
  );
  body.position.y = 0.31;
  g.add(body);
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(0.145, 0.172, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0xf2f0e6, roughness: 0.6 }),
  );
  ring.position.y = 0.34;
  g.add(ring);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.05, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.9 }),
  );
  base.position.y = 0.025;
  g.add(base);
  return g;
}

export class Garages {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.shops = [];

    const apronMat = new THREE.MeshStandardMaterial({ map: apronTexture(), roughness: 0.92, metalness: 0.05 });
    const steelMat = new THREE.MeshStandardMaterial({ color: C.steel, roughness: 0.42, metalness: 0.72 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xd8d6cf, roughness: 0.6, metalness: 0.35 });
    const redMat = new THREE.MeshStandardMaterial({ color: C.red, roughness: 0.5, metalness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.75, metalness: 0.3 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: C.glass, roughness: 0.12, metalness: 0.5, transparent: true, opacity: 0.85 });
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.95 });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff4d8, emissive: 0xfff0c0, emissiveIntensity: 1.6, roughness: 0.4,
    });
    const boardTex = signTexture(['ورشة الدائري'], { bg: '#0f4a32' });
    const boardTex2 = signTexture(['صيانة · ترقيات · زيوت'], { bg: '#0b3a28', h: 128, size: 46 });

    this.count = SHOP_LOCAL_Z.length;
    for (const localZ of SHOP_LOCAL_Z) {
      const shop = new THREE.Group();
      shop.position.set(0, 0, localZ);

      // ساحة الخدمة على الكتف
      const apron = new THREE.Mesh(new THREE.PlaneGeometry(SHOULDER_W + 1.4, SHOP_HALF_LEN * 2), apronMat);
      apron.rotation.x = -Math.PI / 2;
      apron.position.set(SHOP_X, 0.035, 0);
      apron.receiveShadow = true;
      shop.add(apron);

      // عمود الكشف على حدود الكتف
      const posts = [-12, -4.5, 4.5, 12];
      for (const pz of posts) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, 5.2, 0.26), steelMat);
        post.position.set(SHOP_X + 1.55, 2.6, pz);
        post.castShadow = true;
        shop.add(post);
        // قاعدة
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), darkMat);
        foot.position.set(SHOP_X + 1.55, 0.06, pz);
        shop.add(foot);
      }

      // سقف المظلة
      const roofW = 4.8;
      const roofY = 5.25;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.26, 27), roofMat);
      roof.position.set(SHOP_X + 0.35, roofY, 0);
      roof.castShadow = false;   // عشان الورشة تفضل منوّرة
      shop.add(roof);

      // بطانة السقف من تحت (منوّرة)
      const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(roofW - 0.2, 26.8),
        new THREE.MeshStandardMaterial({ color: 0xdedbd0, emissive: 0xfff3d8, emissiveIntensity: 0.28, roughness: 0.9 }),
      );
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.set(SHOP_X + 0.35, roofY - 0.14, 0);
      shop.add(ceiling);

      // شريط أحمر على وش السقف
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 27), redMat);
      band.position.set(SHOP_X - 2.05, roofY - 0.06, 0);
      shop.add(band);

      // شريط أبيض/أحمر عالي على السقف يبان من بعيد
      const beacon = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.55, 27),
        new THREE.MeshStandardMaterial({ color: 0xf2efe4, emissive: 0xfff0cc, emissiveIntensity: 0.5, roughness: 0.5 }),
      );
      beacon.position.set(SHOP_X + 2.4, roofY + 0.42, 0);
      shop.add(beacon);

      // عمود لافتة طويل على حدود الحاجز
      const poleSign = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 7.4, 0.22), steelMat);
      pole.position.y = 3.7;
      poleSign.add(pole);
      const pboard = new THREE.Mesh(
        new THREE.PlaneGeometry(3.0, 1.5),
        new THREE.MeshStandardMaterial({
          map: signTexture(['ورشة'], { bg: '#b8352c', h: 160, size: 82 }), roughness: 0.6,
          emissive: 0x2a0704, emissiveIntensity: 0.55,
        }),
      );
      pboard.position.set(-0.12, 7.0, 0);
      pboard.rotation.y = Math.PI;
      poleSign.add(pboard);
      poleSign.position.set(BARRIER_X + 0.35, 0, 15.5);
      shop.add(poleSign);

      // لوحة الورشة فوق السقف
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(6.6, 1.9),
        new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.7, emissive: 0x0a1f16, emissiveIntensity: 0.4 }),
      );
      board.position.set(SHOP_X + 0.2, roofY + 1.55, 0);
      board.rotation.y = Math.PI; // تبان للعربيات الجاية من ورا
      shop.add(board);
      const boardBack = new THREE.Mesh(new THREE.BoxGeometry(6.7, 2.0, 0.14), darkMat);
      boardBack.position.set(SHOP_X + 0.2, roofY + 1.55, 0.09);
      shop.add(boardBack);

      // لوحة تانية أفقية صغيرة على المظلة (جهة الطريق)
      const board2 = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 0.8),
        new THREE.MeshStandardMaterial({ map: boardTex2, roughness: 0.8 }),
      );
      board2.position.set(SHOP_X - 2.1, roofY - 1.1, 0);
      board2.rotation.y = -Math.PI / 2;
      shop.add(board2);

      // كشافات تحت السقف
      for (const pz of [-9, 0, 9]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.45), lampMat);
        lamp.position.set(SHOP_X - 0.4, roofY - 0.3, pz);
        shop.add(lamp);
      }

      // مكتب/كشك صغير عند آخر الساحة
      const kiosk = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.4, 3.2), new THREE.MeshStandardMaterial({ color: 0xcfc9b8, roughness: 0.8 }));
      kiosk.position.set(SHOP_X + 1.2, 1.2, 11.4);
      kiosk.castShadow = true;
      shop.add(kiosk);
      const kioskWin = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.0), glassMat);
      kioskWin.position.set(SHOP_X + 0.13, 1.45, 11.4);
      kioskWin.rotation.y = -Math.PI / 2;
      shop.add(kioskWin);

      // خراطيم ومعدات على الجنب
      const toolbox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 1.6), redMat);
      toolbox.position.set(SHOP_X + 1.25, 0.5, -10.4);
      toolbox.castShadow = true;
      shop.add(toolbox);

      // كفرات مركونة
      for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12), tyreMat);
        t.rotation.z = Math.PI / 2;
        t.position.set(SHOP_X + 1.3, 0.36 + (i % 2) * 0.0, -7.4 + Math.floor(i / 2) * 0.8);
        t.rotation.x = 0;
        shop.add(t);
      }
      for (let i = 0; i < 3; i++) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12), tyreMat);
        t.rotation.x = 0;
        t.position.set(SHOP_X + 1.3, 0.24 + i * 0.26, -9.2);
        shop.add(t);
      }

      // أقماع على حد الكتف
      for (const pz of [-13, -6.5, 0, 6.5, 13]) {
        const c = cone();
        c.position.set(SHOP_X - 2.3, 0, pz);
        shop.add(c);
      }

      // علامة أرضية "PIT" (سهم أصفر)
      const arrowMat = new THREE.MeshStandardMaterial({ color: C.yellow, roughness: 0.8, emissive: 0x1a1503, emissiveIntensity: 0.3 });
      for (let i = 0; i < 3; i++) {
        const a = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.36), arrowMat);
        a.rotation.x = -Math.PI / 2;
        a.position.set(SHOP_X, 0.045, -8 + i * 3.2);
        shop.add(a);
      }

      // لوحة تحذير قبل الورشة بـ ١٢٠ متر
      const warn = new THREE.Group();
      const wpole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), steelMat);
      wpole.position.y = 1.3;
      warn.add(wpole);
      const wBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 0.9),
        new THREE.MeshStandardMaterial({ map: signTexture(['ورشة قدام ١٢٠م'], { bg: '#123f6d', h: 128, size: 44 }), roughness: 0.75 }),
      );
      wBoard.position.set(0.16, 2.4, 0);
      wBoard.rotation.y = Math.PI;
      warn.add(wBoard);
      warn.position.set(BARRIER_X - 0.75, 0, -SHOP_HALF_LEN - 118);
      shop.add(warn);

      this.group.add(shop);
      this.shops.push({ z: localZ, mesh: shop });
    }

    this._v = new THREE.Vector3();
  }

  /** أول مرة: نحط الورش قدام اللاعب */
  reset(playerZ) {
    this.shops.forEach((s, i) => {
      s.z = playerZ + 150 + i * SHOP_SPACING;
      s.mesh.position.z = s.z;
    });
  }

  /** نعيد تدوير الورش اللي عدّت */
  update(playerZ) {
    for (const s of this.shops) {
      if (s.z < playerZ - SHOP_HALF_LEN - 20) {
        s.z += SHOP_SPACING * this.count;
        s.mesh.position.z = s.z;
      }
    }
  }

  /* ورشة قدام اللاعب بكام متر؟ (null لو مفيش) */
  nextDistance(playerZ) {
    let best = Infinity;
    for (const s of this.shops) {
      const d = s.z - playerZ;
      if (d > -SHOP_HALF_LEN && d < best) best = d;
    }
    return Number.isFinite(best) ? best : null;
  }

  /* اللاعب جوه ساحة ورشة؟ */
  inside(px, pz) {
    if (px <= SHOP_X - SHOP_REACH) return null;
    for (const s of this.shops) {
      const dz = pz - s.z;
      if (Math.abs(dz) < SHOP_HALF_LEN) return { shop: s, dz };
    }
    return null;
  }
}
