import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async function() {
  const dbPath = path.join(__dirname, '../database/football_betting.db');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    const rows = await db.all(`
      SELECT 
        m.id as match_row_id,
        m.fixture_id as match_fixture_id,
        p.id as prediction_id,
        p.fixture_id as prediction_fixture_id,
        p.prediction_date
      FROM matches m
      INNER JOIN match_predictions p 
        ON p.id = (
          SELECT id FROM match_predictions
          WHERE fixture_id = m.fixture_id
          ORDER BY prediction_date DESC, id DESC
          LIMIT 1
        )
      ORDER BY m.match_date DESC
      LIMIT 500
    `);

    console.log('rows returned:', rows.length);
    const sample = rows.slice(0, 200).map(r => ({
      match_row_id: r.match_row_id,
      match_fixture_id: r.match_fixture_id,
      prediction_id: r.prediction_id,
      prediction_fixture_id: r.prediction_fixture_id,
      prediction_date: r.prediction_date
    }));
    console.log(JSON.stringify(sample, null, 2));

    const fixtureCounts = {};
    for (const r of rows) {
      fixtureCounts[r.match_fixture_id] = (fixtureCounts[r.match_fixture_id] || 0) + 1;
    }
    console.log('fixtureCounts:', fixtureCounts);
  } catch (err) {
    console.error('Error querying DB:', err);
    process.exit(1);
  } finally {
    await db.close();
  }
})();
