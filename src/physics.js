import * as CANNON from 'cannon-es';

/* مقاسات الطريق: 4 حارات في اتجاه واحد (زي الدائري) + كتف على الجنبين */
export const LANES = [-5.7, -1.9, 1.9, 5.7];
export const LANE_W = 3.8;
export const ROAD_HALF_W = 11.6;         // نص عرض الأسفلت (شامل الكتف)
export const BARRIER_X = 11.0;           // مكان الحواجز الخرسانية
export const SHOULDER_W = 3.0;           // عرض الكتف

export const MATS = {
  ground: new CANNON.Material('ground'),
  car: new CANNON.Material('car'),
  barrier: new CANNON.Material('barrier'),
};

export function createWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) });
  // NaiveBroadphase مش SAP: SAP في cannon-es بيفضل مرتّب القائمة على محور واحد
  // ومش بيعيد ترتيبها كل خطوة، فبيضيّع تلامسات لما العربيات تتحرك بسرعة.
  // عدد الأجسام هنا صغير (≈30) فالمقارنة الثنائية رخيصة ومضمونة.
  const broadphase = new CANNON.NaiveBroadphase();
  broadphase.useBoundingBoxes = true;
  world.broadphase = broadphase;
  world.allowSleep = false;
  world.solver.iterations = 12;
  world.solver.tolerance = 0.002;

  // cannon-es بيتعامل مع friction كـ "أقصى اندفاع" لكل نقطة تلامس،
  // فأي رقم كبير بيوقف العربيات في لحظة.
  world.defaultContactMaterial.friction = 0.002;
  world.defaultContactMaterial.restitution = 0.05;

  world.addContactMaterial(new CANNON.ContactMaterial(MATS.ground, MATS.car, {
    friction: 0.0016, restitution: 0.04,
    contactEquationStiffness: 1e8, contactEquationRelaxation: 3,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(MATS.car, MATS.car, {
    friction: 0.003, restitution: 0.22,
    contactEquationStiffness: 1e7, contactEquationRelaxation: 3,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(MATS.barrier, MATS.car, {
    friction: 0.0018, restitution: 0.3,
    contactEquationStiffness: 1e8, contactEquationRelaxation: 3,
  }));

  // ملاحظة: raycast العجل مش بيشتغل صح مع Plane، فبنستخدم صندوق ضخم كأرض.
  const ground = new CANNON.Body({
    mass: 0, material: MATS.ground, type: CANNON.Body.STATIC,
    shape: new CANNON.Box(new CANNON.Vec3(900, 1.5, 12000)),
  });
  ground.position.set(0, -1.5, 0);
  world.addBody(ground);
  world.groundBody = ground;

  // حواجز خرسانية صلبة على الجنبين — طويلة جدًا (مش streamed) عشان تبقى solid دايماً
  const barrierHalf = new CANNON.Vec3(0.42, 0.62, 12000);
  const barriers = [];
  for (const s of [-1, 1]) {
    const b = new CANNON.Body({
      mass: 0, material: MATS.barrier, type: CANNON.Body.STATIC,
      shape: new CANNON.Box(barrierHalf),
    });
    b.position.set(s * BARRIER_X, 0.62, 0);
    world.addBody(b);
    barriers.push(b);
  }
  world.barriers = barriers;

  return world;
}
