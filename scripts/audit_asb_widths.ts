import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

console.log('--- ALL DISTINCT WIDTHS IN master_asb_items ---');
const widths = db.prepare('SELECT item_category, road_width_m, count(*) as cnt FROM master_asb_items GROUP BY item_category, road_width_m ORDER BY item_category, road_width_m').all();
console.log(widths);

console.log('--- DISTINCT WIDTHS BY ASB TYPE (Jalan Kabupaten) ---');
const items = db.prepare("SELECT package_name, road_width_m FROM master_asb_items WHERE item_category = 'Jalan Kabupaten'").all() as any[];
const byType: Record<string, Set<number>> = {};
for (const it of items) {
  const m = it.package_name.match(/Jalan Tipe ([A-Z])/i);
  const t = m ? m[1].toUpperCase() : 'OTHER';
  if (!byType[t]) byType[t] = new Set();
  if (it.road_width_m !== null) byType[t].add(it.road_width_m);
}
for (const [t, set] of Object.entries(byType)) {
  console.log(`Type ${t}: widths =`, [...set].sort((a,b)=>a-b));
}

console.log('--- JEMBATAN WIDTHS ---');
const jembatan = db.prepare("SELECT package_name, road_width_m, count(*) as cnt FROM master_asb_items WHERE item_category = 'Jembatan' GROUP BY road_width_m").all();
console.log(jembatan);
