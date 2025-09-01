import { databaseService } from '../src/services/databaseService.js';

(async () => {
  try {
    await databaseService.initialize();
    const fixtureId = Number(process.argv[2] || 1435547);
    const existingPrediction = await databaseService.getPredictionByFixture(fixtureId);
    if (!existingPrediction) {
      console.log(JSON.stringify({ success: false, error: 'not_found', fixtureId }, null, 2));
      await databaseService.close();
      process.exit(0);
    }

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

    // Apply the same normalization functions as the route would (copied minimally here)
    const syncPredictedScoreWithProbabilities = (ai, fallbackTotalGoals = 2) => {
      if (!ai || !ai.probabilities) return ai;
      const homeP = Number(ai.probabilities.homeWin) || 0;
      const awayP = Number(ai.probabilities.awayWin) || 0;
      const nonDraw = Math.max(0, homeP + awayP);
      if (nonDraw <= 0) {
        if (!ai.predictedScore) ai.predictedScore = { home: 0, away: 0 };
        return ai;
      }
      let totalGoals = (ai.predictedScore && typeof ai.predictedScore.home === 'number' && typeof ai.predictedScore.away === 'number')
        ? Number(ai.predictedScore.home || 0) + Number(ai.predictedScore.away || 0)
        : null;
      if (totalGoals === null || totalGoals <= 0) totalGoals = fallbackTotalGoals;
      let ph = Math.round((homeP / nonDraw) * totalGoals);
      let pa = Math.max(0, totalGoals - ph);
      if (homeP > awayP + 20 && ph <= pa) ph = pa + 1;
      if (awayP > homeP + 20 && pa <= ph) pa = ph + 1;
      ph = Math.max(0, Math.min(6, ph));
      pa = Math.max(0, Math.min(6, pa));
      ai.predictedScore = { home: ph, away: pa };
      return ai;
    };

    const normalizeBettingTips = (ai) => {
      if (!ai) return ai;
      try {
        const tips = ai.bettingTips || [];
        const parsed = [];
        for (const t of tips) {
          if (typeof t === 'string') {
            const m = t.match(/correct score\s*[:\-]?\s*(\d+)[\s\-:x](\d+)/i) || t.match(/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/);
            if (m) {
              const h = Number(m[1]), a = Number(m[2]);
              if (ai.predictedScore && (ai.predictedScore.home !== h || ai.predictedScore.away !== a)) {
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
      } catch (e) {}
      return ai;
    };

    const rebalanceProbabilitiesBasedOnPredictedScore = (ai) => {
      if (!ai || !ai.probabilities || !ai.predictedScore) return ai;
      try {
        let h = Math.max(0, Number(ai.probabilities.homeWin) || 0);
        let d = Math.max(0, Number(ai.probabilities.draw) || 0);
        let a = Math.max(0, Number(ai.probabilities.awayWin) || 0);
        if (Number(ai.predictedScore.home) === Number(ai.predictedScore.away)) {
          const maxSide = Math.max(h, a);
          if (d <= maxSide) d = maxSide + 1;
          const total = Math.max(1, h + d + a);
          let ph = Math.round((h / total) * 100);
          let pd = Math.round((d / total) * 100);
          let pa = Math.round((a / total) * 100);
          let sum = ph + pd + pa;
          let diff = 100 - sum;
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
      } catch (e) {}
      return ai;
    };

    syncPredictedScoreWithProbabilities(aiAnalysisFromDb);
    normalizeBettingTips(aiAnalysisFromDb);
    rebalanceProbabilitiesBasedOnPredictedScore(aiAnalysisFromDb);

    console.log(JSON.stringify({
      fixtureId,
      teams: { home: 'Home', away: 'Away' },
      aiAnalysis: aiAnalysisFromDb
    }, null, 2));

    await databaseService.close();
    process.exit(0);
  } catch (err) {
    console.error('ERROR building ai analysis:', err && err.stack ? err.stack : String(err));
    process.exit(2);
  }
})();
