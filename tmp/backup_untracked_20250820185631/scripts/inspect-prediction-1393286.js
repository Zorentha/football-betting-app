import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';
import path from 'path';

(async function() {
  const dbPath = path.join(process.cwd(), 'database', 'football_betting.db');
  try {
    const db = await open({ filename: dbPath, driver: sqlite3.Database });

    const fixtureId = 1393286;

    const prediction = await db.get(`
      SELECT * FROM match_predictions WHERE fixture_id = ?
      ORDER BY prediction_date DESC, id DESC
      LIMIT 1
    `, [fixtureId]);

    const result = await db.get(`
      SELECT * FROM match_results WHERE fixture_id = ?
      ORDER BY result_date DESC, id DESC
      LIMIT 1
    `, [fixtureId]);

    const accuracy = await db.get(`
      SELECT * FROM prediction_accuracy WHERE fixture_id = ?
      LIMIT 1
    `, [fixtureId]);

    console.log('=== DB: match_predictions (latest) ===');
    console.log(JSON.stringify(prediction || null, null, 2));

    console.log('\\n=== DB: match_results (latest) ===');
    console.log(JSON.stringify(result || null, null, 2));

    console.log('\\n=== DB: prediction_accuracy (latest) ===');
    console.log(JSON.stringify(accuracy || null, null, 2));

    await db.close();

    // Check tmp_analysis_all file (if run-full-analysis or server saved outputs)
    const outPath = path.join(process.cwd(), 'tmp_analysis_all', `tmp_analysis_${fixtureId}.json`);
    try {
      const txt = await fs.readFile(outPath, 'utf8');
      console.log('\\n=== tmp_analysis_all file content ===');
      console.log(txt);
    } catch (e) {
      console.log('\\n=== tmp_analysis_all file not found ===');
    }

  } catch (err) {
    console.error('Error inspecting DB/files:', err);
    process.exit(1);
  }
})();
