#!/usr/bin/env node
/**
 * Dump predictions joined with actual results to create a labeled dataset for calibration.
 *
 * Output format (JSON array):
 * [
 *   {
 *     fixtureId: 123,
 *     predicted: { homeWin: 35, draw: 36, awayWin: 29 }, // percentages
 *     predictedScore: { home: 2, away: 1 },
 *     actual: "home" | "draw" | "away",
 *     prediction_date: "2025-08-20T..."
 *   },
 *   ...
 * ]
 *
 * Usage:
 * node scripts/dump-predictions-labeled.js --out tmp/predictions_dump.json --limit 1000
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
    const out = args.out || path.join('tmp', 'predictions_dump.json');
    const limit = Number(args.limit || 2000);

    const dbPath = path.join(process.cwd(), 'database', 'football_betting.db');
    if (!fs.existsSync(dbPath)) {
      console.error(`Database not found at ${dbPath}`);
      process.exit(2);
    }

    const db = await open({ filename: dbPath, driver: sqlite3.Database });

    // Join predictions with match_results to get actual outcomes.
    // We take the latest prediction per fixture (ordered by prediction_date DESC, id DESC)
    // and the latest result per fixture (result_date DESC, id DESC)
    const rows = await db.all(`
      SELECT
        p.fixture_id as fixtureId,
        p.home_win_probability as homeWin,
        p.draw_probability as draw,
        p.away_win_probability as awayWin,
        p.predicted_home_score as predicted_home_score,
        p.predicted_away_score as predicted_away_score,
        p.prediction_date as prediction_date,
        r.home_score as actual_home_score,
        r.away_score as actual_away_score
      FROM match_predictions p
      LEFT JOIN match_results r
        ON r.fixture_id = p.fixture_id
      WHERE r.home_score IS NOT NULL AND r.away_score IS NOT NULL
      GROUP BY p.id
      ORDER BY p.prediction_date DESC, p.id DESC
      LIMIT ?
    `, [limit]);

    const outRows = rows.map(r => {
      let actual = null;
      if (r.actual_home_score !== null && r.actual_away_score !== null) {
        if (r.actual_home_score > r.actual_away_score) actual = 'home';
        else if (r.actual_home_score < r.actual_away_score) actual = 'away';
        else actual = 'draw';
      }
      return {
        fixtureId: r.fixtureId,
        predicted: {
          homeWin: Number(r.homeWin) || 0,
          draw: Number(r.draw) || 0,
          awayWin: Number(r.awayWin) || 0
        },
        predictedScore: {
          home: r.predicted_home_score !== null ? Number(r.predicted_home_score) : null,
          away: r.predicted_away_score !== null ? Number(r.predicted_away_score) : null
        },
        actual,
        prediction_date: r.prediction_date
      };
    }).filter(r => r.actual !== null);

    // Ensure output dir exists
    const outDir = path.dirname(out);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(out, JSON.stringify(outRows, null, 2), 'utf8');
    console.log(`Wrote ${outRows.length} labeled examples to ${out}`);
    await db.close();
    process.exit(0);
  } catch (err) {
    console.error('dump-predictions-labeled failed:', err);
    process.exit(1);
  }
})();
