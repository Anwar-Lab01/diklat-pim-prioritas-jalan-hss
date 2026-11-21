import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');
const funded = db.prepare(`
  SELECT rcs.allocation_rank, rcs.road_key, r.canonical_name, rcs.total_pagu_asb_rp, rcs.cumulative_cost_rp, rcs.is_funded
  FROM road_cost_summaries rcs
  JOIN roads r ON rcs.road_key = r.road_key
  WHERE rcs.scenario_id = 'SCN-2027-BASELINE' AND rcs.allocation_rank <= 25
  ORDER BY rcs.allocation_rank ASC
`).all();

console.log('Top 25 roads in SCN-2027-BASELINE:');
for (const r of funded as any[]) {
  console.log(`#${r.allocation_rank} [${r.road_key}] ${r.canonical_name}: Pagu=Rp ${r.total_pagu_asb_rp.toLocaleString('id-ID')} | Kumulatif=Rp ${r.cumulative_cost_rp.toLocaleString('id-ID')} | Funded=${r.is_funded}`);
}
