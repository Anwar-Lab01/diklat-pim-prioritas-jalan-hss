import { getDatabase, closeDatabase, withTransaction } from '../src/db/connection.ts';
import { runCostingReferenceIngestion } from '../src/ingestion/ingestCostingReference.ts';

function main() {
  console.log('================================================================');
  console.log('RUNNING STANDALONE COSTING & BUDGETING INGESTION (PHASE 1)');
  console.log('================================================================');

  const db = getDatabase();

  const stats = withTransaction(db, () => {
    return runCostingReferenceIngestion(db);
  });

  console.log('================================================================');
  console.log('COSTING REFERENCE INGESTION COMPLETE');
  console.log('================================================================');
  console.log('ASB Stats:', stats.asbStats);
  console.log('AHSP Stats:', stats.ahspStats);
  console.log('Rules Stats:', stats.rulesStats);
  console.log('Profiles Stats:', stats.profileStats);

  closeDatabase();
}

main();
