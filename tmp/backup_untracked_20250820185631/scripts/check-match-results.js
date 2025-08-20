import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'database', 'football_betting.db');

function formatRow(row) {
  if (!row) return '  (brak)';
  return `  fixture_id: ${row.fixture_id}
  match: ${row.home_team_name} vs ${row.away_team_name}
  match_date: ${row.match_date}
  result: ${row.home_score ?? 'null'} - ${row.away_score ?? 'null'}
  status: ${row.match_status ?? 'null'}
  result_date: ${row.result_date ?? 'null'}`;
}

async function run() {
  if (!fs.existsSync(dbPath)) {
    console.error('❌ Database file not found at', dbPath);
    process.exit(1);
  }

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  try {
    const keyword = process.argv[2] || 'Lechia';
    const dateArg = process.argv[3]; // optional YYYY-MM-DD

    console.log(`Searching for matches with "${keyword}"${dateArg ? ' on ' + dateArg : ''}...`);

    let matches;
    if (dateArg) {
      matches = await db.all(
        `SELECT m.* FROM matches m
         WHERE (m.home_team_name LIKE ? OR m.away_team_name LIKE ?)
           AND DATE(m.match_date) = DATE(?)
         ORDER BY m.match_date DESC`,
        [`%${keyword}%`, `%${keyword}%`, dateArg]
      );
    } else {
      matches = await db.all(
        `SELECT m.* FROM matches m
         WHERE m.home_team_name LIKE ? OR m.away_team_name LIKE ?
         ORDER BY m.match_date DESC
         LIMIT 50`,
        [`%${keyword}%`, `%${keyword}%`]
      );
    }

    if (!matches || matches.length === 0) {
      console.log('No matches found for that keyword.');
      await db.close();
      process.exit(0);
    }

    console.log(`Found ${matches.length} match(es):`);
    for (const m of matches) {
      console.log('-------------------------');
      console.log(`Fixture ID: ${m.fixture_id}`);
      console.log(`Match: ${m.home_team_name} vs ${m.away_team_name}`);
      console.log(`Match date: ${m.match_date}`);
      // Check match_results
      const result = await db.get('SELECT * FROM match_results WHERE fixture_id = ?', [m.fixture_id]);
      if (result) {
        console.log('Match result found:');
        console.log(formatRow(result));
      } else {
        console.log('Match result: (not found in match_results)');
      }
      // Check prediction_presence
      const pred = await db.get('SELECT * FROM match_predictions WHERE fixture_id = ? ORDER BY prediction_date DESC LIMIT 1', [m.fixture_id]);
      if (pred) {
        console.log('Latest prediction:');
        console.log(`  id: ${pred.id}, predicted: ${pred.predicted_home_score}-${pred.predicted_away_score}, date: ${pred.prediction_date}`);
      } else {
        console.log('No predictions found for this fixture.');
      }
    }

    await db.close();
    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    try { await db.close(); } catch(e){/*ignore*/ }
    process.exit(2);
  }
}

run();
