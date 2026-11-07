#!/usr/bin/env node
/**
 * قارئ باك موديلات GLB — بيطلع جدول بكل موديل:
 * الاسم، عدد المثلثات، الحجم، المقاسات الحقيقية، العجل المنفصل، الخامات
 * الاستخدام:  node tools/scan_glb.mjs assets/cars/_NEW_MODELS
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || 'assets/cars/_NEW_MODELS';

function findGlb(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findGlb(p, out);
    else if (/\.glb$/i.test(e.name)) out.push(p);
  }
  return out;
}

function parseGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('مش GLB صحيح');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binOffset = 20 + jsonLen + 8;

  let tris = 0;
  const wheelNodes = [];
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];

  (json.meshes || []).forEach((m) => {
    m.primitives.forEach((pr) => {
      if (pr.indices !== undefined) {
        const acc = json.accessors[pr.indices];
        tris += acc.count / 3;
      } else if (pr.attributes.POSITION !== undefined) {
        tris += json.accessors[pr.attributes.POSITION].count / 3;
      }
      const pos = json.accessors[pr.attributes.POSITION];
      if (pos && pos.min && pos.max) {
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], pos.min[i]);
          max[i] = Math.max(max[i], pos.max[i]);
        }
      }
    });
  });

  (json.nodes || []).forEach((n) => {
    if (/wheel|tire|tyre|rim/i.test(n.name || '')) wheelNodes.push(n.name);
  });

  const dims = [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((v) =>
    Number.isFinite(v) ? +v.toFixed(2) : 0);

  return {
    name: (json.asset && json.asset.generator) || '',
    tris: Math.round(tris),
    meshes: (json.meshes || []).length,
    materials: (json.materials || []).map((m) => m.name).filter(Boolean),
    wheels: wheelNodes.length,
    wheelNames: wheelNodes.slice(0, 6),
    dims,
    sizeMB: +(buf.length / 1048576).toFixed(2),
  };
}

if (!fs.existsSync(root)) {
  console.log(`مفيش فولدر: ${root}`);
  process.exit(1);
}
const files = findGlb(root);
console.log(`\nلقيت ${files.length} موديل GLB جوه ${root}\n`);

let totalMB = 0, totalTris = 0;
const rows = [];
for (const f of files) {
  try {
    const info = parseGlb(f);
    totalMB += info.sizeMB;
    totalTris += info.tris;
    rows.push({ file: path.relative(root, f), ...info });
  } catch (e) {
    rows.push({ file: path.relative(root, f), error: e.message });
  }
}

for (const r of rows) {
  if (r.error) { console.log(`✗ ${r.file} — ${r.error}`); continue; }
  const wheel = r.wheels ? `عجل: ${r.wheels} ✅` : 'عجل ملزوق ⚠️';
  console.log(
    `• ${r.file}\n   ${r.tris} مثلث · ${r.sizeMB} ميجا · مقاسات ${r.dims.join(' × ')} م · ${wheel} · ${r.materials.length} خامة`,
  );
}
console.log(`\nالإجمالي: ${files.length} موديل · ${(totalMB).toFixed(1)} ميجا · ${totalTris.toLocaleString('en')} مثلث`);
if (totalMB > 60) console.log('⚠️  الباك كبير — هستخدم تحميل تدريجي (lazy load) للمعرض.');
