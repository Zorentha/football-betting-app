import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { databaseService } from '../src/services/databaseService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const REPORT_PATH = path.join(PROJECT_ROOT, 'tmp_analysis_report.json');
const TMP_DIR = path.join(PROJECT_ROOT, 'tmp_analysis_all');

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

function summarizePrediction(pred) {
  return {
    homeWin: pred.probabilities?.homeWin ?? pred.probabilities?.home ?? null,
    draw: pred.probabilities?.draw ?? null,
    awayWin: pred.probabilities?.awayWin ?? pred.probabilities?.away ?? null,
    predictedScore: pred.predictedScore ? `${pred.predictedScore.home}-${pred.predictedScore.away}` : null,
    confidence: pred.confidence || (pred.confidencePercentage ? (pred.confidencePercentage >= 80 ? 'high' : pred.confidencePercentage >= 60 ? 'medium' : 'low') : 'unknown'),
    keyFactors: (pred.keyFactors || []).length,
    bettingTips: (pred.bettingTips || []).length,
    playerMatchups: (pred.playerMatchups || []).length
  };
}

async function loadReport() {
  try {
    const raw = await fs.readFile(REPORT_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function getCandidatesFromReport(report) {
  if (!report || !Array.isArray(report.filesWithoutDbPredictions)) return [];
  return report.filesWithoutDbPredictions;
}

async function getTmpForFixture(fixtureId) {
  const fpath = path.join(TMP_DIR, `tmp_analysis_${fixtureId}.json`);
  try {
    const raw = await fs.readFile(fpath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function buildPredictionFromTmp(tmpPayload) {
  // tmp file structure: { fetchedAt, fixtureId, requestUrl, status, data }
  // where data often is { success: true, data: { fixtureId, teams, aiAnalysis: { ... } }, savedToDatabase: true }
  const outer = tmpPayload?.data;
  if (!outer) return null;
  // handle two shapes: outer.data.aiAnalysis or outer.aiAnalysis
  const core = outer.data || outer;
  const ai = core.aiAnalysis || core.analysis || core;
  if (!ai) return null;

  const probabilities = ai.probabilities || {};
  const predictedScore = ai.predictedScore || ai.predicted_score || null;
  const confidence = ai.confidence || (ai.confidencePercentage ? (ai.confidencePercentage >= 80 ? 'high' : ai.confidencePercentage >= 60 ? 'medium' : 'low') : undefined);
  const keyFactors = ai.keyFactors || ai.key_factors || [];
  const bettingTips = ai.bettingTips || ai.betting_tips || [];
  const playerMatchups = ai.playerMatchups || ai.player_matchups || [];

  return {
    probabilities: {
      homeWin: probabilities.homeWin ?? probabilities.home ?? probabilities.home_win ?? 0,
      draw: probabilities.draw ?? probabilities.draw_probability ?? 0,
      awayWin: probabilities.awayWin ?? probabilities.away ?? probabilities.away_win ?? 0
    },
    predictedScore: predictedScore ? { home: predictedScore.home ?? predictedScore.home_score ?? predictedScore.homeScore ?? 0, away: predictedScore.away ?? predictedScore.away_score ?? predictedScore.awayScore ?? 0 } : null,
    confidence: confidence || ai.confidenceLevel || ai.confidence_level || 'unknown',
    confidencePercentage: ai.confidencePercentage ?? ai.confidence_percentage ?? null,
    keyFactors: Array.isArray(keyFactors) ? keyFactors : [keyFactors].filter(Boolean),
    bettingTips: Array.isArray(bettingTips) ? bettingTips.map(t => (typeof t === 'string' ? { type: t } : t)) : [],
    playerMatchups: Array.isArray(playerMatchups) ? playerMatchups : []
  };
}

async function dryRun(candidates) {
  console.log('DRY RUN: summary of candidates to import\n');
  const summary = [];
  for (const fid of candidates) {
    const tmp = await getTmpForFixture(fid);
    if (!tmp) {
      summary.push({ fixtureId: fid, status: 'no_tmp_file' });
      continue;
    }
    const pred = buildPredictionFromTmp(tmp);
    if (!pred) {
      summary.push({ fixtureId: fid, status: 'no_ai_analysis_in_tmp' });
      continue;
    }
    summary.push({ fixtureId: fid, status: 'ok', summary: summarizePrediction(pred) });
  }
  // Print report
  const ok = summary.filter(s => s.status === 'ok');
  const missing = summary.filter(s => s.status !== 'ok');
  console.log(`Total candidates: ${candidates.length}`);
  console.log(`Parsable (will be saved if --apply): ${ok.length}`);
  console.log(`Not parsable / missing tmp: ${missing.length}\n`);
  if (ok.length > 0) {
    console.log('Sample entries:');
    ok.slice(0, 20).forEach(s => {
      console.log(`- fixture ${s.fixtureId}:`, s.summary);
    });
  }
  if (missing.length > 0) {
    console.log('\nMissing / invalid entries:');
    missing.forEach(s => console.log(`- fixture ${s.fixtureId}: ${s.status}`));
  }
  console.log('\nDry run completed. To apply changes re-run with --apply');
  return { summary, okCount: ok.length, missingCount: missing.length };
}

async function applyImport(candidates) {
  // Initialize DB
  await databaseService.initialize();
  if (!databaseService.isConnected()) {
    console.error('DB not connected. Aborting apply.');
    return;
  }

  const results = [];
  for (const fid of candidates) {
    const tmp = await getTmpForFixture(fid);
    if (!tmp) {
      results.push({ fixtureId: fid, status: 'no_tmp_file' });
      continue;
    }
    const pred = buildPredictionFromTmp(tmp);
    if (!pred) {
      results.push({ fixtureId: fid, status: 'no_ai_analysis_in_tmp' });
      continue;
    }

    try {
      // Save prediction
      const predId = await databaseService.savePrediction(fid, pred);
      // Save player matchups if available
      if (pred.playerMatchups && pred.playerMatchups.length > 0) {
        try {
          await databaseService.savePlayerMatchups(fid, pred.playerMatchups);
        } catch (pmErr) {
          console.warn(`Warning: failed saving player matchups for ${fid}:`, pmErr.message || pmErr);
        }
      }
      results.push({ fixtureId: fid, status: 'saved', predictionId: predId || null });
    } catch (err) {
      results.push({ fixtureId: fid, status: 'error', error: err.message || String(err) });
    }
  }

  await databaseService.close();
  // Print summary
  const saved = results.filter(r => r.status === 'saved').length;
  const errored = results.filter(r => r.status === 'error').length;
  const skipped = results.filter(r => r.status !== 'saved' && r.status !== 'error').length;
  console.log(`\nApply finished. Saved: ${saved}, Errors: ${errored}, Skipped: ${skipped}`);
  results.forEach(r => {
    if (r.status !== 'saved') console.log(`- ${r.fixtureId}: ${r.status}${r.error ? ' - ' + r.error : ''}`);
  });
  return results;
}

async function main() {
  try {
    const report = await loadReport();
    let candidates = [];
    if (report) {
      candidates = await getCandidatesFromReport(report);
    } else {
      // Fallback: scan tmp_analysis_all for tmp_analysis_{id}.json and try to import all
      const files = await fs.readdir(TMP_DIR);
      candidates = files
        .map(f => {
          const m = f.match(/^tmp_analysis_(\d+)\.json$/);
          return m ? Number(m[1]) : null;
        })
        .filter(Boolean);
    }

    if (candidates.length === 0) {
      console.log('No candidate fixtures found to import.');
      return;
    }

    if (DRY_RUN) {
      await dryRun(candidates);
      return;
    }

    // APPLY mode
    console.log('APPLY mode: will attempt to save parsed predictions to DB for candidates.');
    console.log(`Candidates count: ${candidates.length}`);
    console.log('Proceeding...');

    await applyImport(candidates);
  } catch (err) {
    console.error('Unhandled error in import script:', err);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
