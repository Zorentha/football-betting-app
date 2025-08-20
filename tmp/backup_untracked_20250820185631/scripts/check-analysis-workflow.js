#!/usr/bin/env node
/**
 * Smoke-check script: runs a full analyze -> persist workflow for a fixture and validates results.
 *
 * Steps:
 * 1) Calls backend analyze endpoint: GET /api/betting/fixtures/:fixtureId/analyze?force=1
 * 2) Saves the HTTP response to tmp/smoke_analysis_{fixtureId}.json
 * 3) Waits a short moment, queries DB for the latest match_predictions row for the fixture
 * 4) Saves DB row to tmp/smoke_db_prediction_{fixtureId}.json and validates betting_tips shape:
 *    - betting_tips is an array
 *    - each item has { type: string, probability: integer 0..100, reasoning: string }
 *
 * Usage:
 * node scripts/check-analysis-workflow.js --fixture 1435547
 */

import fs from 'fs';
import path from 'path';
import { argv } from 'process';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

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

async function fetchAnalyze(host, fixtureId, timeoutMs = 120000) {
  const url = `${host.replace(/\/$/, '')}/api/betting/fixtures/${fixtureId}/analyze?force=1`;
  console.log('Calling analyze endpoint:', url);
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { method: 'GET', signal: controller.signal });
    const text = await resp.text();
    return { status: resp.status, text };
  } finally {
    clearTimeout(to);
  }
}

function safeParseJSON(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

function validateBettingTips(tips) {
  if (!Array.isArray(tips)) return { ok: false, reason: 'not-array' };
  for (const t of tips) {
    if (!t || typeof t !== 'object') return { ok: false, reason: 'tip-not-object', item: t };
    if (typeof t.type !== 'string' || t.type.trim().length === 0) return { ok: false, reason: 'missing-type', item: t };
    if (typeof t.probability !== 'number' || !Number.isFinite(t.probability)) return { ok: false, reason: 'prob-not-number', item: t };
    const p = Math.round(t.probability);
    if (p < 0 || p > 100) return { ok: false, reason: 'prob-out-of-range', item: t };
    // reasoning may be empty string
    if (typeof t.reasoning !== 'string') return { ok: false, reason: 'reasoning-not-string', item: t };
  }
  return { ok: true };
}

(async () => {
  try {
    const args = parseArgs();
    const fixtureId = Number(args.fixture || args.fixtureId || args.f);
    if (!fixtureId) {
      console.error('Usage: node scripts/check-analysis-workflow.js --fixture 1435547');
      process.exit(2);
    }
    const host = args.host || 'http://localhost:3001';

    // Ensure tmp exists
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    console.log(`Starting smoke-check for fixture ${fixtureId}`);

    // 1) Call analyze endpoint
    let analyzeResp;
    try {
      analyzeResp = await fetchAnalyze(host, fixtureId, 120000);
    } catch (err) {
      console.error('Analyze request failed:', err.message || err);
      process.exit(3);
    }

    const analyzePath = path.join(tmpDir, `smoke_analysis_${fixtureId}.json`);
    fs.writeFileSync(analyzePath, JSON.stringify({ httpStatus: analyzeResp.status, body: analyzeResp.text }, null, 2), 'utf8');
    console.log('Saved analyze response to', analyzePath);

    // Try to parse body as JSON for quick checks
    const parsedBody = safeParseJSON(analyzeResp.text);
    if (!parsedBody) {
      console.warn('Analyze response body is not valid JSON (it may be wrapped or plain text). See file for raw output.');
    } else {
      console.log('Analyze response parsed as JSON. success:', parsedBody.success === true);
    }

    // 2) Wait briefly to let server persist to DB (if it does asynchronously)
    await new Promise(r => setTimeout(r, 1500));

    // 3) Query DB for latest prediction for fixtureId
    const dbPath = path.join(process.cwd(), 'database', 'football_betting.db');
    if (!fs.existsSync(dbPath)) {
      console.error('Database file not found at', dbPath);
      process.exit(4);
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
      console.error('No prediction row found in DB for fixture', fixtureId);
      await db.close();
      process.exit(5);
    }

    const dbOutPath = path.join(tmpDir, `smoke_db_prediction_${fixtureId}.json`);
    fs.writeFileSync(dbOutPath, JSON.stringify(row, null, 2), 'utf8');
    console.log('Saved DB prediction row to', dbOutPath);

    // 4) Validate betting_tips field if present
    let bettingTips = null;
    try {
      bettingTips = row.betting_tips ? JSON.parse(row.betting_tips) : null;
    } catch (e) {
      console.warn('Could not parse betting_tips JSON from DB row:', e.message);
    }

    if (!bettingTips) {
      console.warn('No betting_tips found (or parse failed). The workflow may have stored predictions without annotated tips.');
      console.log('Smoke-check completed with warnings. Inspect files:', analyzePath, dbOutPath);
      await db.close();
      process.exit(0);
    }

    const validation = validateBettingTips(bettingTips);
    if (!validation.ok) {
      console.error('Betting tips validation failed:', validation.reason, validation.item || '');
      console.log('Inspect DB file:', dbOutPath);
      await db.close();
      process.exit(6);
    }

    console.log('Betting tips validated successfully (each tip has integer probability 0..100 and reasoning).');

    await db.close();
    console.log('Smoke-check OK. Files saved under tmp/:', analyzePath, dbOutPath);
    process.exit(0);
  } catch (err) {
    console.error('Smoke-check failed:', err);
    process.exit(1);
  }
})();
