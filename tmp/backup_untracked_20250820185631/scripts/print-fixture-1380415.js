import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function run() {
  try {
    const db = await open({
      filename: 'database/football_betting.db',
      driver: sqlite3.Database
    });

    const fixtureId = 1380415;

    console.log('--- match_predictions for fixture', fixtureId, '---');
    const preds = await db.all('SELECT * FROM match_predictions WHERE fixture_id = ?', [fixtureId]);
    console.log(JSON.stringify(preds, null, 2));

    console.log('\\n--- player_matchups for fixture', fixtureId, '---');
    const matchups = await db.all('SELECT * FROM player_matchups WHERE fixture_id = ? ORDER BY id', [fixtureId]);
    console.log(JSON.stringify(matchups, null, 2));

    await db.close();
  } catch (err) {
    console.error('ERROR querying database:', err);
    process.exit(1);
  }
}

run();
