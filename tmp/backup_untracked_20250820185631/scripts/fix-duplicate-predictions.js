import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'database', 'football_betting.db');

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
    console.log('Connected to DB:', dbPath);

    // Check if prediction_hash column exists
    const cols = await db.all("PRAGMA table_info(match_predictions);");
    const hasHash = cols.some(c => c.name === 'prediction_hash');

    if (!hasHash) {
      console.log('Adding column prediction_hash to match_predictions...');
      await db.exec('ALTER TABLE match_predictions ADD COLUMN prediction_hash TEXT;');
      console.log('Column added.');
    } else {
      console.log('Column prediction_hash already exists — skipping ALTER TABLE.');
    }

    // Populate prediction_hash deterministically
    console.log('Populating prediction_hash for existing rows...');
    await db.exec(`
      UPDATE match_predictions SET prediction_hash = LOWER(TRIM(
        COALESCE(CAST(home_win_probability AS TEXT),'') || '|' ||
        COALESCE(CAST(draw_probability AS TEXT),'') || '|' ||
        COALESCE(CAST(away_win_probability AS TEXT),'') || '|' ||
        COALESCE(CAST(predicted_home_score AS TEXT),'') || '|' ||
        COALESCE(CAST(predicted_away_score AS TEXT),'') || '|' ||
        COALESCE(CAST(confidence_percentage AS TEXT),'') || '|' ||
        COALESCE(key_factors,'') || '|' ||
        COALESCE(betting_tips,'')
      ));
    `);
    console.log('prediction_hash populated.');

    // Show duplicates count before deletion
    const dupInfoBefore = await db.get(`
      SELECT COUNT(*) as dup_groups, SUM(c-1) as dup_rows FROM (
        SELECT fixture_id, prediction_hash, COUNT(*) as c
        FROM match_predictions
        GROUP BY fixture_id, prediction_hash
        HAVING c > 1
      );
    `);
    console.log('Duplicate groups before cleanup:', dupInfoBefore.dup_groups || 0);
    console.log('Duplicate rows that will be removed:', dupInfoBefore.dup_rows || 0);

    // Delete duplicates, keep the most recent prediction (max prediction_date) per fixture_id+prediction_hash
    console.log('Removing duplicate rows (keeping most recent prediction per fixture_id+prediction_hash based on prediction_date)...');
    await db.exec(`
      DELETE FROM match_predictions
      WHERE id NOT IN (
        SELECT keep_id FROM (
          SELECT
            fixture_id,
            prediction_hash,
            (SELECT id FROM match_predictions mp2
             WHERE mp2.fixture_id = mp1.fixture_id
               AND mp2.prediction_hash = mp1.prediction_hash
             ORDER BY datetime(prediction_date) DESC, id DESC
             LIMIT 1
            ) as keep_id
          FROM match_predictions mp1
          GROUP BY fixture_id, prediction_hash
        )
      );
    `);
    console.log('Duplicates removed.');

    // Create unique index
    console.log('Creating UNIQUE index on (fixture_id, prediction_hash)...');
    await db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_fixture_prediction_hash
      ON match_predictions(fixture_id, prediction_hash);
    `);
    console.log('Unique index created (or already existed).');

    // Show summary after operations
    const totalAfter = await db.get('SELECT COUNT(*) as total FROM match_predictions;');
    const dupInfoAfter = await db.get(`
      SELECT COUNT(*) as dup_groups, SUM(c-1) as dup_rows FROM (
        SELECT fixture_id, prediction_hash, COUNT(*) as c
        FROM match_predictions
        GROUP BY fixture_id, prediction_hash
        HAVING c > 1
      );
    `);

    console.log('Total predictions after cleanup:', totalAfter.total);
    console.log('Duplicate groups remaining:', dupInfoAfter.dup_groups || 0);
    console.log('Duplicate rows remaining:', dupInfoAfter.dup_rows || 0);

    console.log('✅ Done.');
    await db.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during DB changes:', err);
    try { await db.close(); } catch(e){/*ignore*/ }
    process.exit(2);
  }
}

run();
