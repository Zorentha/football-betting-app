import fs from 'fs';
import path from 'path';
import { openaiAnalysisService } from '../src/services/openaiAnalysisService.js';

function tryParseJSON(text) {
  try { return JSON.parse(text); } catch (e) {
    // try to extract first {...} block
    const m = text.match(/\{[\s\S]*\}/m);
    if (m) {
      try { return JSON.parse(m[0]); } catch (e2) { return null; }
    }
    return null;
  }
}

function extractAIAnalysis(parsed) {
  // Many tmp artifacts wrap aiAnalysis under .data.aiAnalysis or .aiAnalysis
  if (!parsed) return null;
  if (parsed.data && parsed.data.aiAnalysis) return parsed.data.aiAnalysis;
  if (parsed.aiAnalysis) return parsed.aiAnalysis;
  // Some files are already aiAnalysis objects
  const hasProb = parsed.probabilities && parsed.bettingTips;
  if (hasProb) return parsed;
  // If parsed contains a rawText that itself contains JSON, try to extract
  if (parsed.rawText && typeof parsed.rawText === 'string') {
    const inner = tryParseJSON(parsed.rawText);
    if (inner) return extractAIAnalysis(inner) || inner;
  }
  return null;
}

async function run() {
  const candidates = [
    'tmp/analyze_1435547_out.json',
    'tmp_analysis_all/tmp_analysis_1435547.json',
    'tmp/analysis_1435547_cleaned.json',
    'tmp/annotate_strict_response_1435547.json',
    'tmp/payload_annotate_1435547.json'
  ];

  const results = [];

  for (const p of candidates) {
    const full = path.resolve(p);
    if (!fs.existsSync(full)) continue;
    const raw = fs.readFileSync(full, 'utf8');
    let parsed = tryParseJSON(raw);
    if (!parsed) {
      // store rawText if we couldn't parse
      parsed = { rawText: raw };
    }

    // Try to extract the aiAnalysis object if wrapped
    const aiCandidate = extractAIAnalysis(parsed) || parsed;

    let before = aiCandidate;
    let after = null;
    try {
      after = openaiAnalysisService.validateAndNormalizeAIAnalysis(aiCandidate) || aiCandidate;
    } catch (e) {
      after = { error: 'validation_failed', message: e && e.message ? e.message : String(e) };
    }

    results.push({
      path: p,
      beforeSample: (before && before.bettingTips) ? before.bettingTips.slice(0,3) : (before && before.rawText ? String(before.rawText).slice(0,200) : {}),
      afterSample: (after && after.bettingTips) ? after.bettingTips.slice(0,3) : {},
      fullAfter: after
    });
  }

  const outPath = 'tmp/validation_test_results.json';
  fs.mkdirSync('tmp', { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log('Wrote validation results to', outPath);
  console.log('Summary:');
  for (const r of results) {
    console.log('-', r.path, '-> bettingTips count:', (r.fullAfter && r.fullAfter.bettingTips ? r.fullAfter.bettingTips.length : 'n/a'));
  }
}

run().catch(e => { console.error('ERROR', e); process.exit(1); });
