#!/usr/bin/env node
/**
 * Test that savePrediction persists calibration_version and prediction_metadata into the DB.
 *
 * Usage:
 * node scripts/test-calibration-persistence.js
 *
 * This script:
 * - Initializes the database service
 * - Calls savePrediction with a test fixture id and a prediction object containing
 *   calibrationVersion and prediction_metadata
 * - Reads back the saved row and asserts the columns were stored
 */

import { databaseService } from '../src/services/databaseService.js';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';

(async () => {
  try {
    const fixtureId = 9999999; // non-conflicting test fixture id
    const testMetadata = { calibrator: { path: 'tmp/calibrator.json', trainedOn: '2025-08-20T00:00:00Z', temperature: 0.5 } };
    const prediction = {
      probabilities: { homeWin: 40, draw: 30, awayWin: 30 },
      predictedScore: { home: 2, away: 1 },
      confidence: 'medium',
      keyFactors: ['test'],
      bettingTips: [{ type: 'Over 2.5', probability: 60, reasoning: 'test' }],
      prediction_metadata: testMetadata,
      calibrationVersion: (testMetadata.calibrator && testMetadata.calibrator.trainedOn) ? testMetadata.calibrator.trainedOn : 'test-calib-v1'
    };

    console.log('Initializing DB (script will create DB if needed)...');
    await databaseService.initialize();

    console.log('Saving test prediction for fixture', fixtureId);
    const lastId = await databaseService.savePrediction(fixtureId, prediction);
    if (!lastId) {
      console.error('savePrediction returned falsy id; aborting test.');
      process.exit(2);
    }

    // Read the row directly via sqlite to bypass any caching layers
    const dbPath = path.join(process.cwd(), 'database', 'football_betting.db');
    if (!fs.existsSync(dbPath)) {
      console.error('Database file not found at', dbPath);
      process.exit(3);
    }
    const db = await open({ filename: dbPath, driver: sqlite3.Database });

    const row = await db.get(`
      SELECT id, fixture_id, prediction_metadata, calibration_version
      FROM match_predictions
      WHERE fixture_id = ?
      ORDER BY prediction_date DESC, id DESC
      LIMIT 1
    `, [fixtureId]);

    if (!row) {
      console.error('No row found for test fixture', fixtureId);
      await db.close();
      process.exit(4);
    }

    console.log('DB row fetched:', { id: row.id, fixture_id: row.fixture_id, calibration_version: row.calibration_version });

    // Validate calibration_version
    if (!row.calibration_version) {
      console.error('FAIL: calibration_version is missing in DB row');
      await db.close();
      process.exit(5);
    }
    if (String(row.calibration_version) !== String(prediction.calibrationVersion)) {
      console.error('FAIL: calibration_version in DB does not match expected value', row.calibration_version, prediction.calibrationVersion);
      await db.close();
      process.exit(6);
    }

    // Validate prediction_metadata is present and JSON-parsable
    try {
      const meta = row.prediction_metadata ? JSON.parse(row.prediction_metadata) : null;
      if (!meta) {
        console.error('FAIL: prediction_metadata missing or null');
        await db.close();
        process.exit(7);
      }
      if (!meta.calibrator || meta.calibrator.path !== testMetadata.calibrator.path) {
        console.error('FAIL: prediction_metadata content does not match expected metadata');
        await db.close();
        process.exit(8);
      }
    } catch (e) {
      console.error('FAIL: prediction_metadata parsing failed:', e.message);
      await db.close();
      process.exit(9);
    }

    console.log('PASS: calibration_version and prediction_metadata were saved correctly.');

    // Cleanup: optionally delete test row
    await db.run('DELETE FROM match_predictions WHERE fixture_id = ?', [fixtureId]);
    console.log('Cleanup: deleted test prediction row');

    await db.close();
    process.exit(0);
  } catch (err) {
    console.error('Test script failed:', err);
    process.exit(1);
  }
})();
