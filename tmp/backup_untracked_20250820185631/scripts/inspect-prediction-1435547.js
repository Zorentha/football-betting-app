#!/usr/bin/env node
/**
 * Inspect latest prediction for a fixture and print parsed betting_tips and metadata.
 *
 * Usage:
 * node scripts/inspect-prediction-1435547.js --fixture 1435547
 *
 * Writes output to tmp/inspect_prediction_{fixtureId}.json
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { argv } from 'process';

function parseArgs() {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.replace(/^--/, '');
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      args[k] = v;
      if (v !== true) i++;
    }
  }
  return args;
}

(async () => {
  try {
    const args = parseArgs();
    const fixtureId = Number(args.fixture || args.f || 1435547);
    const dbPath = path.join(process.cwd(), 'database', 'football_betting.db');
    if (!fs.existsSync(dbPath)) {
      console.error('Database not found at', dbPath);
      process.exit(2);
    }

    const db = await open({ filename: dbPath, driver: sqlite3.Database });

    const row = await db.get(`
      SELECT *
      FROM match_predictions
      WHERE fixture_id = ?
      ORDER BY prediction_date DESC, id DESC
      LIMIT 1
    `, [fixtureId]);

    if (!row) {
      console.error('No prediction found for fixture', fixtureId);
      await db.close();
      process.exit(3);
    }

    // parse betting_tips and prediction_metadata if present
    let bettingTips = null;
    try { bettingTips = row.betting_tips ? JSON.parse(row.betting_tips) : null; } catch (e) { bettingTips = null; }
    let predictionMetadata = null;
    try { predictionMetadata = row.prediction_metadata ? JSON.parse(row.prediction_metadata) : null; } catch (e) { predictionMetadata = null; }

    const out = {
      fixtureId,
      dbRow: row,
      parsed: {
        bettingTips,
        predictionMetadata,
        calibrationVersion: row.calibration_version || null
      }
    };

    const outPath = path.join(process.cwd(), 'tmp', `inspect_prediction_${fixtureId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote inspection to', outPath);

    await db.close();
    process.exit(0);
  } catch (err) {
    console.error('inspect script failed:', err);
    process.exit(1);
  }
})();
