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
    
    syncPredictedScoreWithProbabilities(aiAnalysisFromDb);
    normalizeBettingTips(aiAnalysisFromDb);
    rebalanceProbabilitiesBasedOnPredictedScore(aiAnalysisFromDb);
    
    const matchData = await footballDataService.getCompleteMatchData(parseInt(fixtureId));
    const result = {
      fixtureId: parseInt(fixtureId),
      teams: {
        home: matchData?.teams?.home?.name || 'Home',
        away: matchData?.teams?.away?.name || 'Away'
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
    res.status(500).json({
      success: false,
      error: 'Błąd serwera przy pobieraniu zapisanej analizy',
      details: error.message
    });
  }
});

/* Analizuj pojedynczy mecz z AI */
router.get('/fixtures/:fixtureId/analyze', async (req, res) => {
  try {
    const { fixtureId } = req.params;
    console.log(`🤖 Rozpoczynam analizę AI dla meczu ${fixtureId}`);
    
    const matchData = await footballDataService.getCompleteMatchData(parseInt(fixtureId));
    
    // Jeśli serwis danych zwrócił null (brak meczu) - odpowiedz 404 zamiast dalej się wywalać.
    if (!matchData) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono meczu w źródle danych',
        fixtureId: parseInt(fixtureId)
      });
    }

    // Walidacja danych
    if (!matchData.teamForm || !matchData.teamForm.home || !matchData.teamForm.away) {
      return res.status(400).json({
        success: false,
        error: 'Brak danych o formie drużyn',
        details: `Forma gospodarzy: ${!!(matchData.teamForm && matchData.teamForm.home)}, Forma gości: ${!!(matchData.teamForm && matchData.teamForm.away)}`,
        fixtureId: parseInt(fixtureId)
      });
    }
    
    if (matchData.teamForm.home.length === 0 || matchData.teamForm.away.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Niewystarczające dane o formie drużyn',
        details: `Mecze gospodarzy: ${matchData.teamForm.home.length}, Mecze gości: ${matchData.teamForm.away.length}`,
        fixtureId: parseInt(fixtureId)
      });
    }

    console.log(`📊 Analizuję: ${matchData.teams.home.name} vs ${matchData.teams.away.name}`);

    // Jeśli składy są potwierdzone, wymuszamy świeżą analizę aby uwzględnić składy.
    // Dodatkowo honorujemy parametr query ?force=1 do ręcznego wymuszenia.
    const hasConfirmedLineups = openaiAnalysisService.hasConfirmedLineups(matchData.lineups);
    const forceParam = req.query && (req.query.force === '1' || req.query.force === 'true' || req.query.force === true);

    // Najpierw sprawdź czy mamy już zapisaną predykcję w bazie - jeśli tak i nie wymuszono force,
    // zwróć istniejącą analizę zamiast ponownie wywoływać OpenAI (wymóg: jednorazowa analiza zapisana).
    try {
      const existingPrediction = await databaseService.getPredictionByFixture(fixtureId);
      if (existingPrediction && !forceParam) {
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

        const result = {
          fixtureId: parseInt(fixtureId),
          teams: {
            home: matchData.teams.home.name,
            away: matchData.teams.away.name
          },
          aiAnalysis: aiAnalysisFromDb
        };

        console.log(`ℹ️ Zwracam zapisaną w bazie analizę dla meczu ${fixtureId} (nie wykonuję ponownej analizy).`);
        return res.json({
          success: true,
          data: result,
          savedToDatabase: true,
          fromDatabase: true
        });
      }
    } catch (dbErr) {
      console.warn('⚠️ Błąd podczas sprawdzania istniejącej predykcji w bazie:', dbErr.message || dbErr);
      // Kontynuujemy - jeśli DB chwilowo niedostępna, pozwólmy na analizę (lub fallback w service)
    }

    // Jeśli nie mamy zapisanej predykcji i składy NIE SĄ potwierdzone, nie wykonujemy analizy.
    if (!hasConfirmedLineups && !forceParam) {
      return res.status(400).json({
        success: false,
        error: 'Składy niepotwierdzone - analiza AI jest wykonywana tylko po potwierdzeniu składów.',
        fixtureId: parseInt(fixtureId)
      });
    }

    // Jeśli składy są potwierdzone lub wymuszono force -> wyczyść cache przed analizą
    if (hasConfirmedLineups || forceParam) {
      try {
        console.log(`⚡ Force analysis for fixture ${fixtureId} (confirmedLineups=${hasConfirmedLineups}, forceParam=${forceParam}) - clearing cache`);
        // clearMatchCache bierze homeTeamId i awayTeamId
        openaiAnalysisService.clearMatchCache(matchData.teams.home.id, matchData.teams.away.id);
      } catch (e) {
        console.warn('⚠️ Nie udało się wyczyścić cache przed force analysis:', e.message || e);
      }
    }

    const aiAnalysis = await openaiAnalysisService.analyzeMatch(
      matchData.teams.home,
      matchData.teams.away,
      matchData.teamForm.home,
      matchData.teamForm.away,
      matchData.lineups,
      matchData.players,
      matchData.teamPlayers,
      matchData.weather,
      parseInt(fixtureId) // Przekaż fixtureId do zapisania w bazie
    );

    syncPredictedScoreWithProbabilities(aiAnalysis);
    normalizeBettingTips(aiAnalysis);
    rebalanceProbabilitiesBasedOnPredictedScore(aiAnalysis);
    
    // Ensure predictedScore is consistent with probabilities (override if needed)
    try {
      const probs = aiAnalysis.probabilities || { homeWin: 0, draw: 0, awayWin: 0 };
      const homeP = Number(probs.homeWin) || 0;
      const awayP = Number(probs.awayWin) || 0;
      const nonDraw = Math.max(0.0001, homeP + awayP); // avoid div by zero

      // Determine total goals baseline from either AI predicted score or team averages
      let totalGoals = null;
      if (aiAnalysis.predictedScore && (typeof aiAnalysis.predictedScore.home === 'number' || typeof aiAnalysis.predictedScore.away === 'number')) {
        totalGoals = (Number(aiAnalysis.predictedScore.home || 0) + Number(aiAnalysis.predictedScore.away || 0));
        if (totalGoals <= 0) totalGoals = null;
      }
      if (totalGoals === null) {
        const homeAvg = (matchData.teamForm.home && matchData.teamForm.home.length) ? matchData.teamForm.home.reduce((s,m)=>s+(m.goalsFor||0),0)/matchData.teamForm.home.length : 1;
        const awayAvg = (matchData.teamForm.away && matchData.teamForm.away.length) ? matchData.teamForm.away.reduce((s,m)=>s+(m.goalsFor||0),0)/matchData.teamForm.away.length : 1;
        totalGoals = Math.max(1, Math.round(homeAvg + awayAvg));
      }

      // Split total goals proportionally to home/away win chances (ignore draw)
      let ph = Math.round((homeP / nonDraw) * totalGoals);
      let pa = Math.max(0, totalGoals - ph);

      // Small sanity corrections (use let so we can adjust)
      if (homeP > awayP + 20 && ph <= pa) ph = pa + 1;
      if (awayP > homeP + 20 && pa <= ph) pa = ph + 1;

      // Final clamp to reasonable values
      ph = Math.max(0, Math.min(6, ph));
      pa = Math.max(0, Math.min(6, pa));

      aiAnalysis.predictedScore = { home: Number(ph), away: Number(pa) };
    } catch (e) {
      // leave aiAnalysis.predictedScore as-is on error
      console.warn('Nie udało się zsynchronizować predictedScore z probabilities:', e.message);
    }

    // Normalize betting tips to a consistent object shape for the frontend
    const normalizedBettingTips = (aiAnalysis.bettingTips || []).map(t => {
      // If the model returned a simple string, convert to object { type, probability, reasoning }
      if (typeof t === 'string') {
        return { type: t, probability: null, reasoning: '' };
      }
      if (t && typeof t === 'object') {
        return {
          type: t.type || t.title || t.name || (t[0] || ''),
          probability: (typeof t.probability !== 'undefined') ? t.probability : (t.prob || null),
          reasoning: t.reasoning || t.reason || t.description || ''
        };
      }
      // Fallback: stringify
      return { type: String(t), probability: null, reasoning: '' };
    });

    // Sanitize playerMatchups returned from AI to ensure valid object shape (prevents malformed JSON)
    const safePlayerMatchups = Array.isArray(aiAnalysis.playerMatchups) ? aiAnalysis.playerMatchups.map((m, idx) => {
      const obj = (m && typeof m === 'object') ? m : { category: String(m || '') };
      return {
        category: String(obj.category || obj.cat || '').toString().trim() || `Pojedynek ${idx + 1}`,
        homePlayer: String(obj.homePlayer || obj.home_player || obj.home || '').toString().trim(),
        awayPlayer: String(obj.awayPlayer || obj.away_player || obj.away || '').toString().trim(),
        description: String(obj.description || obj.desc || obj.matchup_description || '').toString().trim()
      };
    }) : [];

    // Sanitize matchupAnalysis to ensure stable keys and allowed advantage values
    const allowedAdvantages = new Set(['home', 'away', 'even', 'uncertain']);
    const safeMatchupAnalysis = Array.isArray(aiAnalysis.matchupAnalysis) ? aiAnalysis.matchupAnalysis.map((m, idx) => {
      const obj = (m && typeof m === 'object') ? m : {};
      const rawAdv = String(obj.advantage || obj.adv || '').toLowerCase();
      const advantage = allowedAdvantages.has(rawAdv) ? rawAdv : 'uncertain';
      return {
        homePlayer: String(obj.homePlayer || obj.home_player || obj.home || '').toString().trim(),
        awayPlayer: String(obj.awayPlayer || obj.away_player || obj.away || '').toString().trim(),
        category: String(obj.category || '').toString().trim() || `Pojedynek ${idx + 1}`,
        advantage,
        analysis: String(obj.analysis || obj.reasoning || obj.description || '').toString().trim()
      };
    }) : [];

    // Replace raw arrays with sanitized ones before sending to frontend
    aiAnalysis.playerMatchups = safePlayerMatchups;
    aiAnalysis.matchupAnalysis = safeMatchupAnalysis;

    const result = {
      fixtureId: parseInt(fixtureId),
      teams: {
        home: matchData.teams.home.name,
        away: matchData.teams.away.name
      },
      aiAnalysis: {
        probabilities: aiAnalysis.probabilities,
        predictedScore: aiAnalysis.predictedScore,
        confidence: aiAnalysis.confidence,
        confidencePercentage: aiAnalysis.confidence === 'high' ? 85 : 
                            aiAnalysis.confidence === 'medium' ? 65 : 45,
        keyFactors: aiAnalysis.keyFactors || [],
        // Dodajemy playerMatchups oraz matchupAnalysis do odpowiedzi,
        // aby frontend mógł pokazać szczegółową analizę pojedynków zawodników
        playerMatchups: aiAnalysis.playerMatchups || [],
        matchupAnalysis: aiAnalysis.matchupAnalysis || [],
        bettingTips: normalizedBettingTips
      }
    };

    console.log(`✅ Analiza zakończona: ${result.aiAnalysis.probabilities.homeWin}% - ${result.aiAnalysis.probabilities.draw}% - ${result.aiAnalysis.probabilities.awayWin}%`);

    res.json({
      success: true,
      data: result,
      savedToDatabase: true
    });
  } catch (error) {
    console.error(`❌ Błąd analizy AI dla meczu ${req.params.fixtureId}:`, error);
    
    // Różne typy błędów
    let errorMessage = 'Błąd analizy AI';
    if (error.message.includes('Invalid URL')) {
      errorMessage = 'Błąd konfiguracji API';
    } else if (error.message.includes('JSON')) {
      errorMessage = 'Błąd parsowania odpowiedzi AI';
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Przekroczono czas oczekiwania';
    } else if (error.message.includes('rate limit')) {
      errorMessage = 'Przekroczono limit zapytań API';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message,
      fixtureId: req.params.fixtureId
    });
  }
});

// Pobierz mecze z dzisiaj i najbliższych dni (bez AI - szybsze)
router.get('/fixtures/today-simple', async (req, res) => {
  try {
    const fixtures = await footballDataService.getTodayFixtures();
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

// Pobierz nadchodzące mecze
router.get('/fixtures/upcoming', async (req, res) => {
  try {
    const fixtures = await footballDataService.getUpcomingFixtures();
    res.json({
      success: true,
      data: fixtures,
      count: fixtures.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd pobierania nadchodzących meczów',
      details: error.message
    });
  }
});

// Pobierz kompletne dane meczu
router.get('/fixtures/:fixtureId', async (req, res) => {
  try {
    const { fixtureId } = req.params;
    const matchData = await footballDataService.getCompleteMatchData(parseInt(fixtureId));
    
    res.json({
      success: true,
      data: matchData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd pobierania danych meczu',
      details: error.message
    });
  }
});



// Pobierz formę drużyny
router.get('/teams/:teamId/form', async (req, res) => {
  try {
    const { teamId } = req.params;
    const form = await footballDataService.getTeamForm(parseInt(teamId));
    
    res.json({
      success: true,
      data: form
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd pobierania formy drużyny',
      details: error.message
    });
  }
});

// Endpoint do testowania API
router.get('/test', async (req, res) => {
  try {
    const fixtures = await footballDataService.getUpcomingFixtures([39]); // Premier League
    const testFixture = fixtures[0];
    
    if (testFixture) {
      const completeData = await footballDataService.getCompleteMatchData(testFixture.fixture.id);
      res.json({
        success: true,
        message: 'API działa poprawnie',
        sampleData: completeData
      });
    } else {
      res.json({
        success: true,
        message: 'API działa, ale brak nadchodzących meczów',
        data: []
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd testowania API',
      details: error.message
    });
  }
});

// Endpoint do statystyk dokładności predykcji
router.get('/accuracy-stats', async (req, res) => {
  try {
    const stats = await databaseService.getAccuracyStats();
    
    if (!stats) {
      return res.status(503).json({
        success: false,
        error: 'Baza danych niedostępna',
        details: 'Nie można pobrać statystyk dokładności'
      });
    }

    res.json({
      success: true,
      data: {
        totalPredictions: stats.totalPredictions,
        resultAccuracy: Math.round(stats.resultAccuracy * 100) / 100,
        scoreAccuracy: Math.round(stats.scoreAccuracy * 100) / 100,
        goalAccuracy: Math.round(stats.goalAccuracy * 100) / 100,
        avgProbabilityAccuracy: Math.round(stats.avgProbabilityAccuracy * 100) / 100
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd pobierania statystyk',
      details: error.message
    });
  }
});

// Endpoint do statystyk według lig
router.get('/accuracy-stats/by-league', async (req, res) => {
  try {
    const stats = await databaseService.getAccuracyByLeague();
    
    if (!stats) {
      return res.status(503).json({
        success: false,
        error: 'Baza danych niedostępna'
      });
    }

    res.json({
      success: true,
      data: stats.map(league => ({
        leagueName: league.league_name,
        totalMatches: league.total_matches,
        accuracyRate: Math.round(league.accuracy_rate * 100) / 100,
        avgProbabilityAccuracy: Math.round(league.avg_probability_accuracy * 100) / 100
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd pobierania statystyk lig',
      details: error.message
    });
  }
});

// Endpoint do historii predykcji
router.get('/prediction-history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    // Jeśli podano ?systemOnly=1 zwracamy WYŁĄCZNIE predykcje wygenerowane przez nasz system
    // (np. ai_model = 'ChatGPT-5' lub posiadające prediction_hash). W przeciwnym wypadku
    // używamy domyślnej metody z databaseService.
    const systemOnly = req.query.systemOnly === '1' || req.query.systemOnly === 'true';
    let matches;
    if (systemOnly && databaseService.db) {
      matches = await databaseService.db.all(`
        SELECT m.*,
          p.home_win_probability,
          p.draw_probability,
          p.away_win_probability,
          p.predicted_home_score,
          p.predicted_away_score,
          p.confidence_level,
          p.prediction_date,
          r.home_score as actual_home_score,
          r.away_score as actual_away_score,
          r.winner as actual_winner,
          a.result_correct,
          a.score_correct
        FROM matches m
        INNER JOIN match_predictions p
          ON p.id = (
            SELECT id FROM match_predictions WHERE fixture_id = m.fixture_id ORDER BY prediction_date DESC, id DESC LIMIT 1
          )
        LEFT JOIN match_results r
          ON r.id = (
            SELECT id FROM match_results WHERE fixture_id = m.fixture_id ORDER BY result_date DESC, id DESC LIMIT 1
          )
        LEFT JOIN prediction_accuracy a ON m.fixture_id = a.fixture_id
        WHERE (p.ai_model = 'ChatGPT-5' OR p.prediction_hash IS NOT NULL)
        ORDER BY m.match_date DESC
        LIMIT ?
      `, [limit]);
    } else {
      matches = await databaseService.getMatchesWithPredictions(limit);
    }
    
    if (!matches) {
      return res.status(503).json({
        success: false,
        error: 'Baza danych niedostępna'
      });
    }

    res.json({
      success: true,
      data: matches.map(match => ({
        fixtureId: match.fixture_id,
        homeTeam: match.home_team_name,
        awayTeam: match.away_team_name,
        league: match.league_name,
        matchDate: match.match_date,
        prediction: {
          homeWin: match.home_win_probability,
          draw: match.draw_probability,
          awayWin: match.away_win_probability,
          predictedScore: {
            home: match.predicted_home_score,
            away: match.predicted_away_score
          },
          confidence: match.confidence_level
        },
        actualResult: match.actual_home_score !== null ? {
          homeScore: match.actual_home_score,
          awayScore: match.actual_away_score,
          winner: match.actual_winner
        } : null,
        accuracy: {
          resultCorrect: match.result_correct === 1,
          scoreCorrect: match.score_correct === 1
        }
      })),
      count: matches.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd pobierania historii',
      details: error.message
    });
  }
});

// Endpoint do najlepszych predykcji
router.get('/prediction-history/best', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const bestPredictions = await databaseService.getBestPredictions(limit);
    
    if (!bestPredictions) {
      return res.status(503).json({
        success: false,
        error: 'Baza danych niedostępna'
      });
    }

    res.json({
      success: true,
      data: bestPredictions.map(prediction => ({
        homeTeam: prediction.home_team_name,
        awayTeam: prediction.away_team_name,
        matchDate: prediction.match_date,
        predicted: `${prediction.predicted_home_score}-${prediction.predicted_away_score}`,
        actual: `${prediction.actual_home_score}-${prediction.actual_away_score}`,
        probabilityAccuracy: Math.round(prediction.probability_accuracy * 100),
        resultCorrect: prediction.result_correct === 1,
        scoreCorrect: prediction.score_correct === 1
      })),
      count: bestPredictions.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd pobierania najlepszych predykcji',
      details: error.message
    });
  }
});

/*
  Endpoint do masowej aktualizacji wyników — teraz działa na podstawie meczów,
  które mamy zapisane w bazie (z predykcjami). Dzięki temu nie zależymy od listy
  "ważnych lig" i aktualizujemy tylko te mecze, które analizowaliśmy.
*/
router.post('/update-results', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 500;
    console.log(`🔄 Rozpoczynam aktualizację wyników dla meczów z predykcjami (limit=${limit})...`);
    
    // Pobierz mecze z predykcjami
    const matchesWithPredictions = await databaseService.getMatchesWithPredictions(limit);
    
    if (!matchesWithPredictions || matchesWithPredictions.length === 0) {
      return res.json({
        success: true,
        message: 'Brak meczów z predykcjami do aktualizacji',
        data: { updatedCount: 0, errorCount: 0, totalProcessed: 0 }
      });
    }

    let updatedCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const match of matchesWithPredictions) {
      try {
        const fixtureId = match.fixture_id;
        if (!fixtureId) continue;

        // Pobierz aktualny status meczu z API (nie filtrujemy po ligach)
        const matchData = await footballDataService.getFixtureById(fixtureId);
        if (!matchData) continue;

        if (matchData.fixture && matchData.fixture.status && matchData.fixture.status.short === 'FT') {
          const saved = await databaseService.saveMatchResult(fixtureId, matchData);
          if (saved) {
            updatedCount++;
            console.log(`✅ Zaktualizowano wynik meczu ${fixtureId}`);
          } else {
            errorCount++;
            errors.push({ fixtureId, error: 'Błąd zapisu wyniku (saveMatchResult zwrócił false)' });
          }
        }
      } catch (error) {
        errorCount++;
        errors.push({
          fixtureId: match.fixture_id,
          error: error.message
        });
        console.error(`❌ Błąd przetwarzania meczu ${match.fixture_id}:`, error.message);
      }
    }

    console.log(`✅ Aktualizacja zakończona: ${updatedCount} zaktualizowanych, ${errorCount} błędów`);

    res.json({
      success: true,
      message: `Zaktualizowano ${updatedCount} wyników meczów`,
      data: {
        updatedCount,
        errorCount,
        totalProcessed: matchesWithPredictions.length,
        errors: errors.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('❌ Błąd masowej aktualizacji wyników:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd aktualizacji wyników',
      details: error.message
    });
  }
});

// Endpoint do pojedynków zawodników dla meczu
router.get('/fixtures/:fixtureId/matchups', async (req, res) => {
  try {
    const { fixtureId } = req.params;
    const matchups = await databaseService.getPlayerMatchups(parseInt(fixtureId));
    
    if (!matchups) {
      return res.status(503).json({
        success: false,
        error: 'Baza danych niedostępna'
      });
    }

    res.json({
      success: true,
      data: matchups.map(matchup => ({
        category: matchup.category,
        homePlayer: {
          name: matchup.home_player_name,
          position: matchup.home_player_position
        },
        awayPlayer: {
          name: matchup.away_player_name,
          position: matchup.away_player_position
        },
        description: matchup.matchup_description,
        advantage: matchup.advantage_prediction
      })),
      count: matchups.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd pobierania pojedynków',
      details: error.message
    });
  }
});

// Endpoint do statystyk sezonowych zawodników drużyny
router.get('/teams/:teamId/players/stats', async (req, res) => {
  try {
    const { teamId } = req.params;
    const season = parseInt(req.query.season) || new Date().getFullYear();
    
    const stats = await databaseService.getPlayerSeasonStats(parseInt(teamId), season);
    
    if (!stats) {
      return res.status(503).json({
        success: false,
        error: 'Baza danych niedostępna'
      });
    }

    res.json({
      success: true,
      data: stats,
      count: stats.length,
      teamId: parseInt(teamId),
      season: season
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd pobierania statystyk zawodników',
      details: error.message
    });
  }
});

// Endpoint do statystyk meczowych zawodników
router.get('/fixtures/:fixtureId/players/stats', async (req, res) => {
  try {
    const { fixtureId } = req.params;
    const stats = await databaseService.getPlayerMatchStats(parseInt(fixtureId));
    
    if (!stats) {
      return res.status(503).json({
        success: false,
        error: 'Baza danych niedostępna'
      });
    }

    // Grupuj według drużyn
    const homeStats = stats.filter(s => s.team_id === stats[0]?.team_id);
    const awayStats = stats.filter(s => s.team_id !== stats[0]?.team_id);

    res.json({
      success: true,
      data: {
        home: homeStats,
        away: awayStats
      },
      count: stats.length,
      fixtureId: parseInt(fixtureId)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd pobierania statystyk meczowych',
      details: error.message
    });
  }
});

// Endpoint do symulacji wyniku meczu (dla testów)
router.post('/fixtures/:fixtureId/simulate-result', async (req, res) => {
  try {
    const { fixtureId } = req.params;
    const { homeScore, awayScore } = req.body;
    
    if (homeScore === undefined || awayScore === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Brak wyników meczu',
        details: 'Wymagane: homeScore i awayScore'
      });
    }

    // Symuluj wynik meczu
    const mockResult = {
      fixture: {
        id: parseInt(fixtureId),
        status: { short: 'FT' }
      },
      goals: {
        home: parseInt(homeScore),
        away: parseInt(awayScore)
      },
      score: {
        halftime: {
          home: Math.floor(homeScore / 2),
          away: Math.floor(awayScore / 2)
        }
      }
    };

    const saved = await databaseService.saveMatchResult(parseInt(fixtureId), mockResult);
    
    if (saved) {
      res.json({
        success: true,
        message: `Symulowano wynik meczu ${fixtureId}: ${homeScore}-${awayScore}`,
        data: {
          fixtureId: parseInt(fixtureId),
          homeScore: parseInt(homeScore),
          awayScore: parseInt(awayScore),
          accuracyCalculated: true
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Błąd zapisywania wyniku'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd symulacji wyniku',
      details: error.message
    });
  }
});

  // Endpoint do czyszczenia cache analiz
  router.post('/cache/clear', async (req, res) => {
    try {
      const clearedCount = openaiAnalysisService.clearCache();
      
      res.json({
        success: true,
        message: `Wyczyszczono cache analiz`,
        clearedCount: clearedCount
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Błąd czyszczenia cache',
        details: error.message
      });
    }
  });

  // Endpoint do analizy OpenAI (dla komponentu ResultsAnalysis)
  router.post('/openai/analyze', async (req, res) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt) {
        return res.status(400).json({
          success: false,
          error: 'Brak promptu do analizy'
        });
      }

      // Użyj istniejącego serwisu OpenAI
      const response = await openaiAnalysisService.analyzeWithCustomPrompt(prompt);
      
      res.json({
        success: true,
        response: response
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Błąd analizy OpenAI',
        details: error.message
      });
    }
  });

  // Endpoint do automatycznej aktualizacji wyników zakończonych meczów
  router.post('/update-results', async (req, res) => {
    try {
      console.log('🔄 Rozpoczynam automatyczną aktualizację wyników...');
      
      // Pobierz mecze z predykcjami, które mogły się już zakończyć
      const matchesWithPredictions = await databaseService.getMatchesWithPredictions();
      
      if (!matchesWithPredictions || matchesWithPredictions.length === 0) {
        return res.json({
          success: true,
          message: 'Brak meczów do aktualizacji',
          data: {
            updatedCount: 0,
            errorCount: 0,
            totalProcessed: 0,
            errors: []
          }
        });
      }
      
      let updatedCount = 0;
      let errorCount = 0;
      const errors = [];
      
      for (const match of matchesWithPredictions) {
        try {
          // Pobierz aktualny status meczu z API
          const matchData = await footballDataService.getFixtureById(match.fixture_id);
          
          if (matchData && matchData.fixture.status.short === 'FT') {
            // Mecz się zakończył - zapisz wynik
            const saved = await databaseService.saveMatchResult(match.fixture_id, matchData);
            
            if (saved) {
              updatedCount++;
              console.log(`✅ Zaktualizowano wynik meczu ${match.fixture_id}: ${matchData.goals.home}-${matchData.goals.away}`);
            } else {
              errorCount++;
              errors.push(`Błąd zapisywania wyniku meczu ${match.fixture_id}`);
            }
          }
        } catch (error) {
          errorCount++;
          errors.push(`Błąd przetwarzania meczu ${match.fixture_id}: ${error.message}`);
          console.error(`❌ Błąd meczu ${match.fixture_id}:`, error);
        }
      }
      
      console.log(`🎉 Aktualizacja zakończona: ${updatedCount} zaktualizowanych, ${errorCount} błędów`);
      
      res.json({
        success: true,
        message: `Zaktualizowano ${updatedCount} wyników meczów`,
        data: {
          updatedCount,
          errorCount,
          totalProcessed: matchesWithPredictions.length,
          errors
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Błąd aktualizacji wyników',
        details: error.message
      });
    }
  });

  return router;
};

export { createBettingRoutes };
