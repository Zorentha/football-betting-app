#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { databaseService } from '../src/services/databaseService.js';

function extractJsonBlock(text) {
  if (!text || typeof text !== 'string') return null;
  // try ```json fenced block
  const fenced = /```json\s*([\s\S]*?)```/i.exec(text);
  if (fenced) return fenced[1];
  // try plain array/object match
  const objMatch = /(\[\s*{[\s\S]*}\s*\])/m.exec(text) || /\{[\s\S]*\}/m.exec(text);
  if (objMatch) return objMatch[0];
  return null;
}

function safeParse(candidate) {
  if (!candidate) return null;
  try { return JSON.parse(candidate); } catch (e) {
    // best-effort cleanup
    try {
      const cleaned = candidate
        .replace(/,(\s*[}\]])/g, '$1') // trailing commas
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, (m, q1, key) => `"${key}":`) // quote keys
        .replace(/'/g, '"');
      return JSON.parse(cleaned);
    } catch (e2) {
      return null;
    }
  }
}

(async () => {
  try {
    const fixtureId = 1435547;

    // Read model raw response
    const respPath = path.resolve('tmp/annotate_strict_response_1435547.json');
    if (!fs.existsSync(respPath)) {
      console.error('Response file not found:', respPath);
      process.exit(2);
    }
    const respRaw = JSON.parse(fs.readFileSync(respPath, 'utf8'));

    // Extract model text where JSON array should be
    const modelText = respRaw?.data?.text || respRaw?.data?.raw?.choices?.[0]?.message?.content || respRaw?.text || '';
    const candidate = extractJsonBlock(modelText);
    const bettingTips = safeParse(candidate);

    if (!Array.isArray(bettingTips)) {
      console.error('Failed to parse betting tips JSON from model output. Parsed value:', bettingTips);
      process.exit(3);
    }

    // Read annotate payload to extract predictedScore / 3-way probabilities as fallback/context
    const payloadPath = path.resolve('tmp/annotate_payload_1435547.json');
    let predictedScore = { home: 2, away: 2 };
    let probs = { homeWin: 35, draw: 36, awayWin: 29 };
    if (fs.existsSync(payloadPath)) {
      const payloadRaw = fs.readFileSync(payloadPath, 'utf8');
      try {
        const payloadObj = JSON.parse(payloadRaw);
        const prompt = payloadObj.prompt || payloadObj;
        if (typeof prompt === 'string') {
          const scoreMatch = /predicted score\s*(\d+)[\s\-:x](\d+)/i.exec(prompt);
          if (scoreMatch) {
            predictedScore = { home: Number(scoreMatch[1]), away: Number(scoreMatch[2]) };
          }
          const probMatch = /homeWin\s*[:=]?\s*(\d+)[\s,;]+draw\s*[:=]?\s*(\d+)[\s,;]+awayWin\s*[:=]?\s*(\d+)/i.exec(prompt)
            || /probabilities\s*[:=]?\s*\(?\s*homeWin\s*(\d+).*draw\s*(\d+).*awayWin\s*(\d+)/is.exec(prompt);
          if (probMatch) {
            probs = { homeWin: Number(probMatch[1]), draw: Number(probMatch[2]), awayWin: Number(probMatch[3]) };
          }
        }
      } catch (e) {
        // ignore parse errors and keep defaults
      }
    }

    // Build prediction object expected by databaseService.savePrediction
    const prediction = {
      probabilities: {
        homeWin: Number(probs.homeWin) || 0,
        draw: Number(probs.draw) || 0,
        awayWin: Number(probs.awayWin) || 0
      },
      predictedScore: {
        home: Number(predictedScore.home) || 0,
        away: Number(predictedScore.away) || 0
      },
      confidence: 'medium',
      keyFactors: [], // not provided here
      bettingTips: bettingTips,
      prediction_metadata: { source: 'annotate_strict_response_1435547.json' }
    };

    // Initialize DB and save
    await databaseService.initialize();
    const lastId = await databaseService.savePrediction(fixtureId, prediction);
    if (!lastId) {
      console.error('savePrediction returned falsy id. Aborting.');
      process.exit(4);
    }
    console.log('Saved prediction id:', lastId);

    // Read back the saved row
    const saved = await databaseService.getPredictionByFixture(fixtureId);
    console.log('Saved DB row:', JSON.stringify(saved, null, 2));

    // Close DB
    await databaseService.close();
    process.exit(0);
  } catch (err) {
    console.error('Error saving annotated prediction:', err);
    try { await databaseService.close(); } catch (_) {}
    process.exit(1);
  }
})();
