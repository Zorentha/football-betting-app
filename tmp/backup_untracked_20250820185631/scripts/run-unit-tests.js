#!/usr/bin/env node
/**
 * Simple unit test runner for applyCalibration and safeParseJSONFromText.
 * Runs without test framework using Node's assert.
 *
 * Usage:
 * node scripts/run-unit-tests.js
 */

import assert from 'assert';
import { openaiAnalysisService } from '../src/services/openaiAnalysisService.js';

function approxEqual(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

(async () => {
  console.log('Running unit tests for openaiAnalysisService...');

  // Test 1: applyCalibration preserves sum == 100 and returns integers
  {
    const probs = { homeWin: 50, draw: 30, awayWin: 20 };
    const calibrator = { temperature: 1.0 }; // T=1 should leave distribution roughly same (mod rounding)
    const out = openaiAnalysisService.applyCalibration(probs, calibrator, null, 0);
    console.log('Test1 output:', out);
    assert.strictEqual(typeof out.homeWin, 'number', 'homeWin is number');
    assert.strictEqual(typeof out.draw, 'number', 'draw is number');
    assert.strictEqual(typeof out.awayWin, 'number', 'awayWin is number');
    const sum = out.homeWin + out.draw + out.awayWin;
    assert.strictEqual(sum, 100, `sum should be 100 but is ${sum}`);
  }

  // Test 2: applyCalibration with small temperature (sharpen) moves mass to top category
  {
    const probs = { homeWin: 40, draw: 35, awayWin: 25 };
    const calibrator = { temperature: 0.2 }; // sharpen
    const out = openaiAnalysisService.applyCalibration(probs, calibrator, null, 0);
    console.log('Test2 output:', out);
    const maxBefore = Math.max(40,35,25);
    const maxAfter = Math.max(out.homeWin, out.draw, out.awayWin);
    assert.ok(maxAfter >= maxBefore, 'max probability should not decrease after sharpening');
    const sum = out.homeWin + out.draw + out.awayWin;
    assert.strictEqual(sum, 100, `sum should be 100 but is ${sum}`);
  }

  // Test 3: applyCalibration handles zeros gracefully
  {
    const probs = { homeWin: 0, draw: 0, awayWin: 0 };
    const out = openaiAnalysisService.applyCalibration(probs, null, null, 0);
    console.log('Test3 output:', out);
    const sum = out.homeWin + out.draw + out.awayWin;
    assert.strictEqual(sum, 100, `sum should be 100 for zero input fallback but is ${sum}`);
    assert.ok(Number.isInteger(out.homeWin) && Number.isInteger(out.draw) && Number.isInteger(out.awayWin));
  }

  // Test 4: safeParseJSONFromText with fenced JSON
  {
    const raw = "```json\n[ {\"type\":\"A\",\"probability\":50} ]\n```";
    const parsed = openaiAnalysisService.safeParseJSONFromText(raw);
    console.log('Test4 parsed:', parsed);
    assert.ok(Array.isArray(parsed), 'parsed should be array');
    assert.strictEqual(parsed[0].type, 'A');
    assert.strictEqual(parsed[0].probability, 50);
  }

  // Test 5: safeParseJSONFromText returns null for invalid JSON
  {
    const raw = "not a json";
    const parsed = openaiAnalysisService.safeParseJSONFromText(raw);
    console.log('Test5 parsed:', parsed);
    assert.strictEqual(parsed, null);
  }

  console.log('All tests passed.');
  process.exit(0);
})();
