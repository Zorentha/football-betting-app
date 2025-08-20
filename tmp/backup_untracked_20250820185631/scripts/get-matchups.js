import { databaseService } from '../src/services/databaseService.js';

async function main() {
  try {
    await databaseService.initialize();
    const fixtureId = 999999;
    const matchups = await databaseService.getPlayerMatchups(fixtureId);
    console.log(JSON.stringify(matchups, null, 2));
    await databaseService.close();
  } catch (err) {
    console.error('Error fetching matchups:', err);
    try { await databaseService.close(); } catch(e) {}
    process.exit(1);
  }
}

main();
