import React, { useState, useEffect } from 'react';

export const AIAnalysis = ({ match }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Normalize probabilities to integer percentages that sum to 100.
  // Also, if predictedScore is a draw (home === away) but draw probability is not highest,
  // gently boost draw so UI reflects the predicted draw.
  const getFormattedProbabilities = (probs = {}, predictedScore = null) => {
    const hRaw = Number(probs.homeWin) || 0;
    const dRaw = Number(probs.draw) || 0;
    const aRaw = Number(probs.awayWin) || 0;
    let h = hRaw, d = dRaw, a = aRaw;

    // If predictedScore is a draw, and draw is not already the highest, boost it adaptively
    try {
      if (predictedScore && Number(predictedScore.home) === Number(predictedScore.away)) {
        const maxSide = Math.max(hRaw, aRaw);
        if ((dRaw || 0) < maxSide) {
          const boost = Math.max(3, Math.round(maxSide * 0.1)); // small adaptive boost
          d = dRaw + boost;
          // keep h/a as raw values
          h = hRaw;
          a = aRaw;
        }
      }
    } catch (e) {
      // ignore rebalance errors
    }

    const total = Math.max(1, h + d + a);
    let ph = Math.round((h / total) * 100);
    let pd = Math.round((d / total) * 100);
    let pa = Math.round((a / total) * 100);
    const sum = ph + pd + pa;
    const diff = 100 - sum;
    if (diff !== 0) {
      // add diff to the largest of the adjusted raw values (prefer draw if we boosted it)
      const maxAdj = Math.max(h, d, a);
      if (maxAdj === d) pd += diff;
      else if (maxAdj === h) ph += diff;
      else pa += diff;
    }
    return { home: ph, draw: pd, away: pa };
  };

  const formattedProbabilities = getFormattedProbabilities(analysis?.probabilities || {}, analysis?.predictedScore || null);

  // Determine probability for the predicted outcome (home/draw/away) so we can display it next to the predicted score.
  const predictedOutcomeProbability = (() => {
    try {
      const ps = analysis?.predictedScore;
      if (!ps) return null;
      const ph = Number(ps.home || 0);
      const pa = Number(ps.away || 0);
      if (ph === pa) return formattedProbabilities.draw;
      return ph > pa ? formattedProbabilities.home : formattedProbabilities.away;
    } catch (e) {
      return null;
    }
  })();

  useEffect(() => {
    // On mount / when fixture changes, only attempt to LOAD stored analysis.
    // Do NOT trigger OpenAI analysis automatically from the frontend.
    fetchStoredAnalysis();
  }, [match.fixture.id]);

  const fetchStoredAnalysis = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to fetch stored analysis from the DB (does NOT trigger OpenAI).
      const response = await fetch(`/api/betting/fixtures/${match.fixture.id}/analysis`);
      if (response.status === 404) {
        // No stored analysis yet — do NOT call /analyze automatically.
        setAnalysis(null);
        setError('Analiza jeszcze nie wygenerowana.'); // visible message, no automatic retry
        return;
      }

      const data = await response.json();

      if (data.success) {
        // Endpoint /analysis returns data.aiAnalysis under data.data.aiAnalysis
        const raw = data.data.aiAnalysis || {};
        const normalizedTips = (raw.bettingTips || []).map(t => {
          if (typeof t === 'string') {
            const trimmed = t.trim();
            return { type: trimmed, probability: null, reasoning: '' };
          }
          if (Array.isArray(t) && t.length > 0) {
            const first = t[0];
            if (typeof first === 'string') return { type: first.trim(), probability: null, reasoning: '' };
            if (first && typeof first === 'object') {
              return {
                type: first.type || first.title || first.name || JSON.stringify(first),
                probability: (typeof first.probability !== 'undefined') ? first.probability : (first.prob ?? null),
                reasoning: first.reasoning || first.reason || first.description || ''
              };
            }
          }
          if (t && typeof t === 'object') {
            const resolvedType = (t.type || t.title || t.name || (typeof t[0] === 'string' ? t[0] : '') || '').toString().trim();
            const prob = (typeof t.probability !== 'undefined') ? t.probability : (t.prob ?? null);
            const reason = (t.reasoning || t.reason || t.description || t.explanation || '').toString();
            return {
              type: resolvedType,
              probability: (prob === '' ? null : prob),
              reasoning: reason
            };
          }
          return { type: String(t), probability: null, reasoning: '' };
        });
        raw.bettingTips = normalizedTips;
        setAnalysis(raw);
      } else {
        console.error('Błąd API:', data.error, data.details);
        setError(data.error || 'Nieznany błąd API');
      }
    } catch (err) {
      console.error('Błąd pobierania zapisanej analizy:', err);
      setError(`Błąd połączenia: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center">
          🤖 Analiza AI
          <span className="ml-2 text-sm font-normal text-gray-500">(GPT-5)</span>
        </h3>
        <div className="text-center text-gray-500">
          <div className="animate-pulse flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3"></div>
            Analizuję dane meczowe...
          </div>
          <div className="text-xs mt-2">GPT-5 analizuje formę, składy i pojedynki zawodników</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center">
          🤖 Analiza AI
          <span className="ml-2 text-sm font-normal text-red-500">(Błąd)</span>
        </h3>
        <div className="text-center text-red-500">
          <div className="mb-2">❌ {error}</div>
          <div className="space-y-2">
            <button 
              onClick={fetchAIAnalysis}
              className="text-sm bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200 mr-2"
              disabled={loading}
            >
              {loading ? 'Ładowanie...' : 'Spróbuj ponownie'}
            </button>
            <div className="text-xs text-gray-500">
              ID meczu: {match.fixture.id}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'high': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getConfidenceText = (confidence) => {
    switch (confidence) {
      case 'high': return 'Wysoka';
      case 'medium': return 'Średnia';
      case 'low': return 'Niska';
      default: return 'Nieznana';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold flex items-center">
          🤖 Analiza AI
          <span className="ml-2 text-sm font-normal text-blue-500">(GPT-5)</span>
        </h3>
        <div className="flex flex-col items-end">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor(analysis.confidence)}`}>
            Pewność: {getConfidenceText(analysis.confidence)}
          </span>
          {analysis?.calibrationVersion && (
            <span className="text-xs text-gray-500 mt-1">Kalibracja: {analysis.calibrationVersion}</span>
          )}
        </div>
      </div>

      {/* Przewidywany wynik */}
      <div className="text-center mb-6">
        <div className="text-3xl font-bold text-gray-700 mb-2">
          {analysis.predictedScore.home} - {analysis.predictedScore.away}
        </div>
        <div className="text-sm text-gray-600">Przewidywany wynik AI</div>
        {typeof predictedOutcomeProbability === 'number' && (
          <div className="text-sm text-gray-700 mt-1">
            Prawdopodobieństwo tej predykcji: <span className="font-semibold">{predictedOutcomeProbability}%</span>
          </div>
        )}
      </div>

      {/* Prawdopodobieństwa */}
      <div className="mb-6">
        <h4 className="font-semibold mb-3">Prawdopodobieństwa AI:</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-3 bg-blue-50 rounded">
            <div className="font-bold text-blue-600 text-xl">{formattedProbabilities.home}%</div>
            <div className="text-xs text-blue-700">{match.teams.home.name}</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="font-bold text-gray-600 text-xl">{formattedProbabilities.draw}%</div>
            <div className="text-xs text-gray-700">Remis</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded">
            <div className="font-bold text-red-600 text-xl">{formattedProbabilities.away}%</div>
            <div className="text-xs text-red-700">{match.teams.away.name}</div>
          </div>
        </div>
      </div>

      {/* Kluczowe czynniki */}
      {analysis.keyFactors && analysis.keyFactors.length > 0 && (
        <div className="mb-6">
          <h4 className="font-semibold mb-3">🎯 Kluczowe czynniki AI:</h4>
          <div className="space-y-2">
            {analysis.keyFactors.map((factor, index) => (
              <div key={index} className="flex items-start">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <div className="text-sm text-gray-700">{factor}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pojedynki zawodników (Player vs Player) - szczegółowa analiza */}
      {((analysis.matchupAnalysis && analysis.matchupAnalysis.length > 0) || (analysis.playerMatchups && analysis.playerMatchups.length > 0)) && (
        <div className="mb-6">
          <h4 className="font-semibold mb-3">🤼‍♂️ Pojedynki zawodników — szczegółowa analiza (GŁÓWNE ŹRÓDŁO)</h4>

          {/* Jeśli model dostarcza szczegółową analizę pojedynków, pokaż ją najpierw */}
          {analysis.matchupAnalysis && analysis.matchupAnalysis.length > 0 ? (
            <div className="space-y-3">
              {analysis.matchupAnalysis.map((ma, i) => (
                <div key={i} className="border rounded-lg p-3 bg-white shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-800">
                      {ma.category || (analysis.playerMatchups?.[i]?.category) || 'Pojedynek'}
                    </div>
                    <div className={`text-xs font-semibold px-2 py-1 rounded ${ma.advantage === 'home' ? 'bg-green-100 text-green-800' : ma.advantage === 'away' ? 'bg-red-100 text-red-800' : ma.advantage === 'even' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                      {ma.advantage === 'home' ? 'Faworyt: gospodarze' : ma.advantage === 'away' ? 'Faworyt: goście' : ma.advantage === 'even' ? 'Wyrównany' : 'Niepewny'}
                    </div>
                  </div>
                  <div className="text-sm text-gray-700 mt-1">
                    <span className="font-medium">{ma.homePlayer}</span> vs <span className="font-medium">{ma.awayPlayer}</span>
                  </div>
                  {ma.analysis && <div className="text-xs text-gray-500 mt-2">{ma.analysis}</div>}
                </div>
              ))}
            </div>
          ) : (
            // Jeśli brak matchupAnalysis — pokaż listę wygenerowanych par i zachęć model do analizy
            <div className="space-y-2">
              {analysis.playerMatchups.map((m, idx) => (
                <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                  <div className="text-sm font-medium text-gray-800">{m.category}</div>
                  <div className="text-sm text-gray-700 mt-1">{m.homePlayer} vs {m.awayPlayer}</div>
                  {m.description && <div className="text-xs text-gray-500 mt-2">{m.description}</div>}
                </div>
              ))}
              <div className="text-xs text-gray-500 mt-2">Brak szczegółowej analizy pojedynków — model nie dostarczył per-duel insights. Możesz spróbować ponownie wygenerować analizę.</div>
            </div>
          )}

          {/* Krótkie podsumowanie najważniejszych insightów z pojedynków (jeśli są) */}
          {analysis.matchupAnalysis && analysis.matchupAnalysis.length > 0 && (
            <div className="mt-3 p-3 bg-blue-50 rounded">
              <div className="text-sm font-semibold mb-2">Szybkie wnioski z pojedynków:</div>
              <ul className="list-disc list-inside text-sm text-gray-700">
                {analysis.matchupAnalysis.slice(0,3).map((m, i) => (
                  <li key={i}>
                    <span className="font-medium">{m.homePlayer} vs {m.awayPlayer}:</span> {m.advantage === 'home' ? 'faworyt gospodarze' : m.advantage === 'away' ? 'faworyt goście' : m.advantage === 'even' ? 'wyrównany' : 'niepewny'} — {m.analysis || 'brak dodatkowych danych'}.
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Rekomendacje AI */}
      {analysis.bettingTips && analysis.bettingTips.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3">💡 Rekomendacje AI:</h4>
          <div className="space-y-3">
            {analysis.bettingTips.map((tip, index) => {
              // Decide probability label:
              // - If tip.probability is a number, show it (rounded).
              // - Otherwise fall back to analysis.confidencePercentage as an approximate (~).
              const prob = (tip && typeof tip === 'object' && typeof tip.probability !== 'undefined' && tip.probability !== null && tip.probability !== '') 
                ? Number(tip.probability) 
                : null;
              const probLabel = (typeof prob === 'number' && !Number.isNaN(prob)) 
                ? `${Math.round(prob)}%` 
                : (analysis.confidencePercentage ? `~${analysis.confidencePercentage}%` : '');
              return (
                <div key={index} className="border rounded-lg p-3 bg-gradient-to-r from-blue-50 to-purple-50">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium text-gray-800">
                      {tip.type || tip.title || tip.name || (typeof tip === 'string' ? tip : JSON.stringify(tip))}
                    </span>
                    <span className="text-sm font-bold text-blue-600">
                      {probLabel}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">{tip.reasoning || tip.description || ''}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t text-xs text-gray-500 text-center">
        🤖 Analiza wygenerowana przez GPT-5 na podstawie danych z API-Football
      </div>
    </div>
  );
};
