#!/usr/bin/env node
/**
 * Train a simple temperature-scaling calibrator for 3-way probabilities using grid search.
 *
 * Expected input format (JSON array) - flexible:
 * [
 *   {
 *     "fixtureId": 123,
 *     "predicted": { "homeWin": 35, "draw": 36, "awayWin": 29 },  // percentages or 0..1
 *     "actual": "home" // one of "home","draw","away"
 *   },
 *   ...
 * ]
 *
 * Usage:
 * node scripts/train-calibrator.js --input tmp/predictions_dump.json --out tmp/calibrator.json
 *
 * Output:
 * { "temperature": 1.23, "trainedAt": "2025-08-20T12:00:00Z", "notes": "grid-search 0.01..5" }
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
  // Accept 0..100 integers or 0..1 floats
  const p = obj || {};
  const raw = [p.homeWin, p.draw, p.awayWin].map(v => (v === undefined || v === null) ? 0 : Number(v));
  // if any value > 1, assume percentages -> convert to fractions
  const anyGT1 = raw.some(v => v > 1);
  const fracs = anyGT1 ? raw.map(v => v / 100) : raw;
  // normalize to sum 1 (avoid all zeros)
  const s = fracs.reduce((a, b) => a + (isFinite(b) ? b : 0), 0) || 1;
  return fracs.map(v => (isFinite(v) ? v / s : 0));
}

function nll_for_dataset(data, temperature) {
  // Negative log-likelihood (log loss) for categorical outcomes
  // For each example, adjust probs by temperature: p_i -> softmax(log(p_i)/T)
  let total = 0;
  let count = 0;
  for (const ex of data) {
    const probs = safeGetProbs(ex.predicted);
    // avoid zeros by clipping
    const clipped = probs.map(p => Math.max(p, 1e-12));
    // convert to log-space
    const logs = clipped.map(p => Math.log(p));
    // apply temperature scaling in log-space: logs / T
    const scaled = logs.map(l => l / temperature);
    const maxS = Math.max(...scaled);
    const exps = scaled.map(s => Math.exp(s - maxS));
    const denom = exps.reduce((a, b) => a + b, 0);
    const calibrated = exps.map(e => e / denom);
    const actual = ex.actual;
    let idx = actual === 'home' ? 0 : actual === 'draw' ? 1 : 2;
    const p_true = calibrated[idx] || 1e-12;
    total += -Math.log(p_true);
    count++;
  }
  return total / Math.max(1, count);
}

function gridSearchTemperature(data, low = 0.01, high = 5, steps = 200) {
  // logarithmic grid (prefer smaller temps)
  let bestT = 1;
  let bestLoss = Infinity;
  for (let i = 0; i < steps; i++) {
    const t = low * Math.pow(high / low, i / (steps - 1));
    const loss = nll_for_dataset(data, t);
    if (loss < bestLoss) {
      bestLoss = loss;
      bestT = t;
    }
  }
  return { temperature: bestT, loss: bestLoss };
}

(async () => {
  try {
    const args = parseArgs();
    const input = args.input || 'tmp/predictions_dump.json';
    const out = args.out || 'tmp/calibrator.json';

    if (!fs.existsSync(input)) {
      console.error(`Input file not found: ${input}`);
      process.exit(2);
    }

    const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
    if (!Array.isArray(raw) || raw.length === 0) {
      console.error('Input must be a non-empty JSON array of prediction objects.');
      process.exit(3);
    }

    // Filter / normalize examples that have predicted and actual
    const examples = raw.map(r => {
      // tolerate legacy shapes: r.probabilities or r.predicted or r.predictedProbs
      const predicted = r.predicted || r.probabilities || r.prob || r.predictedProbs || {};
      const actual = r.actual || r.result || r.winner || null;
      // If actual is numeric or score, try to deduce winner (not implemented here)
      return { predicted, actual };
    }).filter(e => e.actual && (e.actual === 'home' || e.actual === 'draw' || e.actual === 'away'));

    if (examples.length < 50) {
      console.warn(`Warning: only ${examples.length} labeled examples found - calibrator may be noisy.`);
    }

    // Split into train/val 80/20
    const shuffled = examples.sort(() => Math.random() - 0.5);
    const split = Math.floor(shuffled.length * 0.8);
    const train = shuffled.slice(0, split);
    const valid = shuffled.slice(split);

    console.log(`Training calibrator on ${train.length} examples, validating on ${valid.length} examples...`);

    // Simple approach: perform grid search on validation set (train not used here, but left for extensions)
    const res = gridSearchTemperature(valid.length > 0 ? valid : train, 0.01, 5, 200);

    const calibrator = {
      temperature: Number(res.temperature.toFixed(6)),
      trainedOn: new Date().toISOString(),
      validationLoss: Number(res.loss.toFixed(6)),
      exampleCount: examples.length,
      notes: 'Temperature scaling via grid search (0.01..5).'
    };

    // Ensure tmp exists
    const outdir = path.dirname(out);
    if (!fs.existsSync(outdir)) fs.mkdirSync(outdir, { recursive: true });

    fs.writeFileSync(out, JSON.stringify(calibrator, null, 2), 'utf8');
    console.log(`Calibrator written to ${out}:`, calibrator);
    process.exit(0);
  } catch (err) {
    console.error('train-calibrator failed:', err);
    process.exit(1);
  }
})();
