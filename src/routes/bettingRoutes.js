import express from 'express';
import { openaiAnalysisService } from '../services/openaiAnalysisService.js';
import { databaseService } from '../services/databaseService.js';

/*
  Helper: ensure predictedScore is consistent with probabilities.
  - If predictedScore missing or appears inconsistent, split totalGoals proportionally
    between home/away using probabilities (ignoring draw).
  - If no totalGoals available, fall back to 2 as a sensible default for list view.
*/
function syncPredictedScoreWithProbabilities(ai, fallbackTotalGoals = 2) {
  try {
    if (!ai || !ai.probabilities) return ai;
    const homeP = Number(ai.probabilities.homeWin) || 0;
    const awayP = Number(ai.probabilities.awayWin) || 0;
    const nonDraw = Math.max(0, homeP + awayP);
    if (nonDraw <= 0) {
      // Nothing to base on
      if (!ai.predictedScore) ai.predictedScore = { home: 0, away: 0 };
      return ai;
    }

    // Determine total goals baseline
    let totalGoals = null;
    if (ai.predictedScore && typeof ai.predictedScore.home === 'number' && typeof ai.predictedScore.away === 'number') {
      totalGoals = Number(ai.predictedScore.home || 0) + Number(ai.predictedScore.away || 0);
      if (totalGoals <= 0) totalGoals = null;
    }
    if (totalGoals === null) totalGoals = fallbackTotalGoals;

    // Split proportionally
    let ph = Math.round((homeP / nonDraw) * totalGoals);
    let pa = Math.max(0, totalGoals - ph);

    // Small sanity correction: if probabilities strongly favor one side, reflect that
    if (homeP > awayP + 20 && ph <= pa) ph = pa + 1;
    if (awayP > homeP + 20 && pa <= ph) pa = ph + 1;

    // Clamp reasonable values
    ph = Math.max(0, Math.min(6, ph));
    pa = Math.max(0, Math.min(6, pa));

    ai.predictedScore = { home: ph, away: pa };
  } catch (e) {
    // ignore
  }
  return ai;
}

/*
  Normalize betting tips into consistent objects and align any "Correct score" entries
  with the predictedScore produced for the analysis. If a stored "Correct score" differs
  from the predicted score, we replace it with the predicted score to avoid contradictions.
*/
function normalizeBettingTips(ai) {
  if (!ai) return ai;
  try {
    const tips = ai.bettingTips || [];
    const parsed = [];

    for (const t of tips) {
      if (typeof t === 'string') {
        // Try to capture "correct score" patterns like "Correct score 3-2" or "3-2"
        const m = t.match(/correct score\s*[:\-]?\s*(\d+)[\s\-:x](\d+)/i) || t.match(/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/);
        if (m) {
          const h = Number(m[1]), a = Number(m[2]);
          if (ai.predictedScore && (ai.predictedScore.home !== h || ai.predictedScore.away !== a)) {
            // Override to match predictedScore so UI doesn't show contradictory correct score
            parsed.push({ type: `Correct score ${ai.predictedScore.home}-${ai.predictedScore.away}`, probability: null, reasoning: 'Normalized to predictedScore' });
            continue;
          }
          parsed.push({ type: `Correct score ${h}-${a}`, probability: null, reasoning: '' });
          continue;
        }
        parsed.push({ type: t, probability: null, reasoning: '' });
      } else if (t && typeof t === 'object') {
        parsed.push({
          type: t.type || t.title || t.name || JSON.stringify(t),
          probability: (typeof t.probability !== 'undefined') ? t.probability : (t.prob ?? null),
          reasoning: t.reasoning || t.reason || t.description || ''
        });
      } else {
        parsed.push({ type: String(t), probability: null, reasoning: '' });
      }
    }

    ai.bettingTips = parsed;
  } catch (e) {
    // ignore normalization errors
  }
  return ai;
}

/*
  If the predictedScore indicates a draw (home === away) but stored probabilities
  don't reflect that, gently rebalance probabilities so the draw becomes the most
  likely outcome. This avoids UI contradictions where predictedScore shows a draw
  but the probabilities display a different highest-probability outcome.
*/
function rebalanceProbabilitiesBasedOnPredictedScore(ai) {
  // Stronger rebalance: when predicted score is a draw, ensure draw probability
  // becomes the single highest probability (by at least +1) and renormalize.
  if (!ai || !ai.probabilities || !ai.predictedScore) return ai;
  try {
    let h = Math.max(0, Number(ai.probabilities.homeWin) || 0);
    let d = Math.max(0, Number(ai.probabilities.draw) || 0);
    let a = Math.max(0, Number(ai.probabilities.awayWin) || 0);

    // Only act when predicted score is a draw
    if (Number(ai.predictedScore.home) === Number(ai.predictedScore.away)) {
      const maxSide = Math.max(h, a);
      if (d <= maxSide) {
        // Force draw to be higher than other sides by 1 (or at least a small margin)
        d = maxSide + 1;
      }

      // Renormalize to percentages
      const total = Math.max(1, h + d + a);
      let ph = Math.round((h / total) * 100);
      let pd = Math.round((d / total) * 100);
      let pa = Math.round((a / total) * 100);

      // Correct rounding drift so sum == 100
      let sum = ph + pd + pa;
      let diff = 100 - sum;
      // Add diff to the highest of the adjusted raw values (prefer draw)
      if (diff !== 0) {
        const maxAdj = Math.max(h, d, a);
        if (maxAdj === d) pd += diff;
        else if (maxAdj === h) ph += diff;
        else pa += diff;
      }

      ai.probabilities.homeWin = ph;
      ai.probabilities.draw = pd;
      ai.probabilities.awayWin = pa;
    }
  } catch (e) {
    // ignore rebalance errors
  }
  return ai;
}

const createBettingRoutes = (footballDataService) => {
  const router = express.Router();

  // Debug: Pobierz WSZYSTKIE mecze z dzisiaj
  router.get('/fixtures/all-today', async (req, res) => {
    try {
      const fixtures = await footballDataService.getAllTodayFixtures();

      // Attach any stored AI summary for each fixture (so the main page can show saved analyses immediately)
      await Promise.all(fixtures.map(async (f) => {
        try {
          const p = await databaseService.getPredictionByFixture(f.fixture.id);
          if (p) {
            f.aiAnalysis = {
              probabilities: {
                homeWin: Number(p.home_win_probability) || 0,
                draw: Number(p.draw_probability) || 0,
                awayWin: Number(p.away_win_probability) || 0
              },
              predictedScore: {
                home: Number(p.predicted_home_score) || 0,
                away: Number(p.predicted_away_score) || 0
              },
              confidence: p.confidence_level || 'unknown',
              confidencePercentage: Number(p.confidence_percentage) || null,
              keyFactors: (() => { try { return JSON.parse(p.key_factors || '[]'); } catch (e) { return []; } })(),
              bettingTips: (() => { try { return JSON.parse(p.betting_tips || '[]'); } catch (e) { return []; } })()
            };
            syncPredictedScoreWithProbabilities(f.aiAnalysis);
            normalizeBettingTips(f.aiAnalysis);
            rebalanceProbabilitiesBasedOnPredictedScore(f.aiAnalysis);
          }
        } catch (e) {
          // ignore DB errors per-fixture so list still returns
        }
      }));

      res.json({
        success: true,
        data: fixtures,
        count: fixtures.length,
        leagues: [...new Set(fixtures.map(f => `${f.league.id}: ${f.league.name}`))]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Błąd pobierania wszystkich dzisiejszych meczów',
        details: error.message
      });
    }
  });

  // Pobierz mecze z dzisiaj i najbliższych dni (z podłączeniem zapisanego skrótu analizy AI)
  router.get('/fixtures/today', async (req, res) => {
    try {
      const fixtures = await footballDataService.getTodayFixtures();

      // Attach any stored AI summary for each fixture so the main page shows saved analyses immediately
      await Promise.all(fixtures.map(async (f) => {
        try {
          const p = await databaseService.getPredictionByFixture(f.fixture.id);
          if (p) {
            f.aiAnalysis = {
              probabilities: {
                homeWin: Number(p.home_win_probability) || 0,
                draw: Number(p.draw_probability) || 0,
                awayWin: Number(p.away_win_probability) || 0
              },
              predictedScore: {
                home: Number(p.predicted_home_score) || 0,
                away: Number(p.predicted_away_score) || 0
              },
              confidence: p.confidence_level || 'unknown',
              confidencePercentage: Number(p.confidence_percentage) || null,
              keyFactors: (() => { try { return JSON.parse(p.key_factors || '[]'); } catch (e) { return []; } })(),
              bettingTips: (() => { try { return JSON.parse(p.betting_tips || '[]'); } catch (e) { return []; } })()
            };
            syncPredictedScoreWithProbabilities(f.aiAnalysis);
            normalizeBettingTips(f.aiAnalysis);
            rebalanceProbabilitiesBasedOnPredictedScore(f.aiAnalysis);
          }
        } catch (e) {
          // ignore per-fixture DB errors so list still returns
        }
      }));

      res.json({
        success: true,
        data: fixtures,
        count: fixtures.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Błąd pobierania dzisiejszych meczów',
        details: error.message
      });
    }
  });

  /*
    Endpoint zwracający jedynie ZAPISANĄ analizę z bazy (bez wywoływania OpenAI).
    Cel: umożliwić frontendowi sprawdzenie, czy analiza już istnieje i NIE uruchamiać
    ponownej analizy przy każdym wejściu na stronę meczu.
  */
  router.get('/fixtures/:fixtureId/analysis', async (req, res) => {
    try {
      const { fixtureId } = req.params;
      // Spróbuj pobrać najnowszą predykcję z bazy
      const existingPrediction = await databaseService.getPredictionByFixture(fixtureId);
      if (!existingPrediction) {
        return res.status(404).json({
          success: false,
          error: 'Brak zapisanej analizy dla tego meczu'
        });
      }

      // Pobierz także ewentualne zapisane pojedynki zawodników
      const storedMatchups = await databaseService.getPlayerMatchups(fixtureId);

      const aiAnalysisFromDb = {
        probabilities: {
          homeWin: Number(existingPrediction.home_win_probability) || 0,
          draw: Number(existingPrediction.draw_probability) || 0,
          awayWin: Number(existingPrediction.away_win_probability) || 0
        },
        predictedScore: {
          home: Number(existingPrediction.predicted_home_score) || 0,
          away: Number(existingPrediction.predicted_away_score) || 0
        },
        confidence: existingPrediction.confidence_level || 'unknown',
        confidencePercentage: Number(existingPrediction.confidence_percentage) || null,
        keyFactors: (() => {
          try { return JSON.parse(existingPrediction.key_factors || '[]'); } catch (e) { return []; }
        })(),
        bettingTips: (() => {
          try { return JSON.parse(existingPrediction.betting_tips || '[]'); } catch (e) { return []; }
        })(),
        playerMatchups: Array.isArray(storedMatchups) ? storedMatchups.map(m => ({
          category: m.category,
          homePlayer: m.home_player_name,
          awayPlayer: m.away_player_name,
          description: m.matchup_description
        })) : [],
        matchupAnalysis: Array.isArray(storedMatchups) ? storedMatchups.map(m => ({
          homePlayer: m.home_player_name,
          awayPlayer: m.away_player_name,
          category: m.category,
          advantage: m.advantage_prediction || 'uncertain',
          analysis: m.matchup_description || ''
            })) : []
          };
      
      // Validate and normalize AI analysis from DB using server-side validator (best-effort)
      try {
        const validated = openaiAnalysisService.validateAndNormalizeAIAnalysis(aiAnalysisFromDb);
        if (validated && typeof validated === 'object') {
          // overwrite values with normalized object
          // note: keep variable name aiAnalysisFromDb for continuity
          // (we mutate the existing object to preserve references used below)
          Object.assign(aiAnalysisFromDb, validated);
        }
      } catch (e) {
        console.warn('AI analysis validation failed:', e && e.message ? e.message : e);
      }

      syncPredictedScoreWithProbabilities(aiAnalysisFromDb);
      normalizeBettingTips(aiAnalysisFromDb);
      rebalanceProbabilitiesBasedOnPredictedScore(aiAnalysisFromDb);
      
      // Avoid calling external football data API here to prevent failures when API base URL is not configured.
      // Return saved AI analysis and placeholder team names instead — this endpoint's main purpose is to provide
      // stored analysis to the frontend without triggering external network calls.
      const result = {
        fixtureId: parseInt(fixtureId),
        teams: {
          home: 'Home',
          away: 'Away'
        },
        aiAnalysis: aiAnalysisFromDb
      };

      return res.json({
        success: true,
        data: result,
        fromDatabase: true
      });
    } catch (error) {
      console.error('❌ Błąd pobierania zapisanej analizy:', error);
      // Include stack in details for easier debugging in dev environment
      res.status(500).json({
        success: false,
        error: 'Błąd serwera przy pobieraniu zapisanej analizy',
        details: (error && error.message ? error.message : String(error)) + ' | ' + (error && error.stack ? error.stack : '')
      });
    }
  });

  // (file continues - full content already restored)

  // Development-only: custom OpenAI prompt tester
  // POST /api/betting/openai/analyze
  // Body: { prompt: string }
  // Returns: raw OpenAI response (no DB persistence) — used for inspecting the model output before saving.
  router.post('/openai/analyze', async (req, res) => {
    try {
      const prompt = req.body && (req.body.prompt || req.body);
      if (!prompt || (typeof prompt === 'object' && Object.keys(prompt).length === 0)) {
        return res.status(400).json({ success: false, error: 'Missing prompt in request body' });
      }
      const promptText = typeof prompt === 'string' ? prompt : (prompt.prompt || JSON.stringify(prompt));
      const result = await openaiAnalysisService.analyzeWithCustomPrompt(promptText);
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('Error in /openai/analyze:', error);
      return res.status(500).json({ success: false, error: error.message || String(error) });
    }
  });

  // Development-only: clear in-memory OpenAI analysis cache (useful for forcing strict fallback during tests)
  // POST /api/betting/openai/clear-cache
  // Returns: { success: true, cleared: <number_of_cleared_entries> }
  router.post('/openai/clear-cache', async (req, res) => {
    try {
      const cleared = openaiAnalysisService.clearCache();
      console.info('[Dev] OpenAI analysis service cache cleared, entries:', cleared);
      return res.json({ success: true, cleared });
    } catch (error) {
      console.error('Error clearing OpenAI cache:', error);
      return res.status(500).json({ success: false, error: error.message || String(error) });
    }
  });

  // POST /api/betting/fixtures/:fixtureId/confirm-save
  // Body: { prediction: { probabilities, predictedScore, confidence, bettingTips, keyFactors, prediction_metadata?, calibration_version? } }
  // This endpoint represents the user confirming the AI output; it persists the normalized prediction to DB.
  router.post('/fixtures/:fixtureId/confirm-save', async (req, res) => {
    try {
      const { fixtureId } = req.params;
      const prediction = req.body && req.body.prediction;
      if (!prediction || typeof prediction !== 'object') {
        return res.status(400).json({ success: false, error: 'Missing prediction object in request body' });
      }

      // Basic validation: ensure probabilities exist
      if (!prediction.probabilities || typeof prediction.probabilities !== 'object') {
        return res.status(400).json({ success: false, error: 'prediction.probabilities is required' });
      }

      // Save prediction via database service
      const savedId = await databaseService.savePrediction(fixtureId, prediction);
      if (!savedId) {
        return res.status(500).json({ success: false, error: 'Failed to save prediction to DB' });
      }

      // Return saved row id for client reference
      return res.json({ success: true, savedId });
    } catch (error) {
      console.error('Error in /fixtures/:fixtureId/confirm-save:', error);
      return res.status(500).json({ success: false, error: error.message || String(error) });
    }
  });

  // Finalize router and export factory
  return router;
};

export { createBettingRoutes };
