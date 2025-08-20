import { databaseService } from '../src/services/databaseService.js';

(async () => {
  try {
    await databaseService.initialize();
    const row = await databaseService.getPredictionByFixture(1393286);
    console.log(JSON.stringify(row, null, 2));
    await databaseService.close();
    process.exit(0);
  } catch (e) {
    console.error('ERROR', e);
    try { await databaseService.close(); } catch {}
    process.exit(1);
  }
})();
