#!/usr/bin/env node
/**
 * Evaluate calibration: compute Brier score and Log Loss before and after applying a calibrator.
 *
 * Usage:
 * node scripts/eval-calibration.js --input tmp/predictions_dump.json --calibrator tmp/calibrator.json
 *
 * Input format: same as train-calibrator.js expects:
 * [
 *   { "fixtureId": 123, "predicted": { "homeWin": 35, "draw": 36, "awayWin": 29 }, "actual": "home" },
 *   ...
 * ]
 *
 * Output: prints JSON report with before/after metrics.
 */

import fs from 'fs';
import path from 'path';
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

function safeGetProbs(obj) {
  const p = obj || {};
  const raw = [p.homeWin, p.draw, p.awayWin].map(v => (v === undefined || v === null) ? 0 : Number(v));
  const anyGT1 = raw.some(v => v > 1);
  const fracs = anyGT1 ? raw.map(v => v / 100) : raw;
  const s = fracs.reduce((a, b) => a + (isFinite(b) ? b : 0), 0) || 1;
  return fracs.map(v => (isFinite(v) ? v / s : 0));
}

function oneHot(actual) {
  if (actual === 'home') return [1, 0, 0];
  if (actual === 'draw') return [0, 1, 0];
  return [0, 0, 1];
}

function brierForExample(probs, actual) {
  const oh = oneHot(actual);
  return probs.reduce((s, p, i) => s + Math.pow(p - oh[i], 2), 0);
}

function logLossForExample(probs, actual) {
  const idx = actual === 'home' ? 0 : actual === 'draw' ? 1 : 2;
  const p = Math.max(1e-12, probs[idx]);
  return -Math.log(p);
}

function applyTemperatureScaling(probs, T) {
  // probs: fractions array length 3
  const clipped = probs.map(p => Math.max(p, 1e-12));
  const logs = clipped.map(p => Math.log(p));
  const scaled = logs.map(l => l / T);
  const maxS = Math.max(...scaled);
  const exps = scaled.map(s => Math.exp(s - maxS));
  const denom = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / denom);
}

(async () => {
  try {
    const args = parseArgs();
    const input = args.input || 'tmp/predictions_dump.json';
    const calibratorPath = args.calibrator || null;

    if (!fs.existsSync(input)) {
      console.error(`Input file not found: ${input}`);
      process.exit(2);
    }

    const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
    const examples = raw.map(r => {
      const predicted = r.predicted || r.probabilities || r.prob || r.predictedProbs || {};
      const actual = r.actual || r.result || r.winner || null;
      return { predicted, actual };
    }).filter(e => e.actual && (e.actual === 'home' || e.actual === 'draw' || e.actual === 'away'));

    if (examples.length === 0) {
      console.error('No labeled examples found in input.');
      process.exit(3);
    }

    let calibrator = null;
    if (calibratorPath && fs.existsSync(calibratorPath)) {
      calibrator = JSON.parse(fs.readFileSync(calibratorPath, 'utf8'));
      console.log('Loaded calibrator:', calibrator);
    } else {
      console.log('No calibrator provided - evaluation will show uncalibrated metrics only.');
    }

    // compute before metrics
    let totalBrier = 0;
    let totalNLL = 0;
    for (const ex of examples) {
      const probs = safeGetProbs(ex.predicted);
      totalBrier += brierForExample(probs, ex.actual);
      totalNLL += logLossForExample(probs, ex.actual);
    }
    const n = examples.length;
    const before = {
      brier: totalBrier / n,
      logloss: totalNLL / n,
      count: n
    };

    let after = null;
    if (calibrator && typeof calibrator.temperature === 'number' && calibrator.temperature > 0) {
      let tb = 0;
      let tnll = 0;
      for (const ex of examples) {
        const probs = safeGetProbs(ex.predicted);
        const calibrated = applyTemperatureScaling(probs, calibrator.temperature);
        tb += brierForExample(calibrated, ex.actual);
        tnll += logLossForExample(calibrated, ex.actual);
      }
      after = {
        brier: tb / n,
        logloss: tnll / n,
        temperature: calibrator.temperature
      };
    }

    const report = {
      inputFile: input,
      calibrator: calibratorPath || null,
      before,
      after
    };

    const outPath = args.out || 'tmp/eval_calibration_report.json';
    const outdir = path.dirname(outPath);
    if (!fs.existsSync(outdir)) fs.mkdirSync(outdir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

    console.log('Evaluation report saved to', outPath);
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('eval-calibration failed:', err);
    process.exit(1);
  }
})();
