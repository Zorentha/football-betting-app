import { footballDataService } from '../src/services/footballDataService.js';
import { databaseService } from '../src/services/databaseService.js';
import path from 'path';
import fs from 'fs';

async function run() {
  const fixtureId = parseInt(process.argv[2], 10);
  if (!fixtureId) {
    console.error('Usage: node scripts/update-single-result.js <fixtureId>');
    process.exit(1);
  }

  try {
    // Initialize DB
    await databaseService.initialize();

    console.log(`Fetching fixture ${fixtureId} from API...`);
    const matchData = await footballDataService.getFixtureById(fixtureId);

    if (!matchData) {
      console.error('Fixture not found from API.');
      await databaseService.close();
      process.exit(2);
    }

    console.log(`Fixture status: ${matchData.fixture.status.short}`);
    if (matchData.fixture.status.short !== 'FT') {
      console.log('Match is not finished (status != FT). Will not save.');
      await databaseService.close();
      process.exit(0);
    }

    // Save match result using existing DB service
    console.log('Attempting to save match result to DB...');
    const saved = await databaseService.saveMatchResult(fixtureId, matchData);

    if (saved) {
      console.log(`✅ Result saved for fixture ${fixtureId}`);
    } else {
      console.error(`❌ Failed to save result for fixture ${fixtureId}`);
    }

    await databaseService.close();
    process.exit(saved ? 0 : 3);
  } catch (err) {
    console.error('Error during update-single-result:', err);
    try { await databaseService.close(); } catch(e){/*ignore*/ }
    process.exit(4);
  }
}

run();
