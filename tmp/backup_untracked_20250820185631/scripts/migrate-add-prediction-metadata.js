#!/usr/bin/env node
/**
 * Migration: add prediction_metadata and calibration_version columns to match_predictions table.
 *
 * This script:
 * - Opens database/database/football_betting.db
 * - Checks PRAGMA table_info('match_predictions')
 * - If column 'prediction_metadata' is missing, runs:
 *     ALTER TABLE match_predictions ADD COLUMN prediction_metadata TEXT DEFAULT NULL;
 * - If column 'calibration_version' is missing, runs:
 *     ALTER TABLE match_predictions ADD COLUMN calibration_version TEXT DEFAULT NULL;
 *
 * Usage: node scripts/migrate-add-prediction-metadata.js
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';

(async () => {
  try {
    const dbPath = path.join(process.cwd(), 'database', 'football_betting.db');
    if (!fs.existsSync(dbPath)) {
      console.error(`Database not found at ${dbPath}`);
      process.exit(2);
    }

    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    const pragma = await db.all("PRAGMA table_info('match_predictions');");
    const cols = pragma.map(r => r.name);

    if (!cols.includes('prediction_metadata')) {
      console.log('Adding column prediction_metadata to match_predictions...');
      await db.run('ALTER TABLE match_predictions ADD COLUMN prediction_metadata TEXT DEFAULT NULL;');
      console.log('Added prediction_metadata.');
    } else {
      console.log('Column prediction_metadata already exists - skipping.');
    }

    if (!cols.includes('calibration_version')) {
      console.log('Adding column calibration_version to match_predictions...');
      await db.run('ALTER TABLE match_predictions ADD COLUMN calibration_version TEXT DEFAULT NULL;');
      console.log('Added calibration_version.');
    } else {
      console.log('Column calibration_version already exists - skipping.');
    }

    await db.close();
    console.log('Migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
