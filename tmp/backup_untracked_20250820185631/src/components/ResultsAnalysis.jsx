import React, { useState, useEffect } from 'react';
import './ResultsAnalysis.css';

const ResultsAnalysis = () => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzingMatch, setAnalyzingMatch] = useState(null);
  // Pagination for results list
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    fetchResultsData();
  }, []);

      const fetchResultsData = async () => {
        try {
          setLoading(true);
          
          // Pobierz historię predykcji (większy limit, żeby frontend mógł wyświetlić wszystkie zapisane predykcje)
          const historyResponse = await fetch('/api/betting/prediction-history?limit=500');
          const historyData = await historyResponse.json();
          
          // Pobierz statystyki dokładności
          const statsResponse = await fetch('/api/betting/accuracy-stats');
          const statsData = await statsResponse.json();
          
          if (historyData.success) {
            // Normalize API response shape to the format used in this component
            const normalized = historyData.data.map(m => ({
              fixture_id: m.fixtureId ?? m.fixture_id,
              home_team_name: m.homeTeam ?? m.home_team_name,
              away_team_name: m.awayTeam ?? m.away_team_name,
              league_name: m.league ?? m.league_name,
              match_date: m.matchDate ?? m.match_date,
              home_win_probability: m.prediction?.homeWin ?? m.home_win_probability,
              draw_probability: m.prediction?.draw ?? m.draw_probability,
              away_win_probability: m.prediction?.awayWin ?? m.away_win_probability,
              predicted_home_score: m.prediction?.predictedScore?.home ?? m.predicted_home_score,
              predicted_away_score: m.prediction?.predictedScore?.away ?? m.predicted_away_score,
              confidence_level: m.prediction?.confidence ?? m.confidence_level,
              ai_model: m.ai_model ?? m.ai_model,
              actual_home_score: m.actualResult ? m.actualResult.homeScore : (m.actual_home_score ?? null),
              actual_away_score: m.actualResult ? m.actualResult.awayScore : (m.actual_away_score ?? null),
              winner: m.actualResult?.winner ?? m.actual_winner,
              result_correct: m.accuracy?.resultCorrect ?? m.result_correct,
              score_correct: m.accuracy?.scoreCorrect ?? m.score_correct,
              league: m.league ?? m.league_name
            }));
            // Keep all normalized entries (frontend will paginate & optionally show only finished matches)
            setMatches(normalized);
          }
          
          if (statsData.success) {
            setStats(statsData.data);
          }
          
        } catch (err) {
          setError('Błąd pobierania danych: ' + err.message);
        } finally {
          setLoading(false);
        }
      };

  const analyzeMatchWithAI = async (match) => {
    try {
      setAnalyzingMatch(match.fixture_id);
      setAiAnalysis(null);
      
      // Przygotuj dane dla AI
      const analysisPrompt = `
Przeanalizuj dokładność predykcji AI dla meczu piłkarskiego:

🏟️ MECZ: ${match.home_team_name} vs ${match.away_team_name}
📅 Data: ${new Date(match.match_date).toLocaleDateString('pl-PL')}
🏆 Liga: ${match.league_name}

🔮 PREDYKCJA AI:
• Przewidywany wynik: ${match.predicted_home_score}-${match.predicted_away_score}
• Prawdopodobieństwa: ${match.home_win_probability}% - ${match.draw_probability}% - ${match.away_win_probability}%
• Poziom pewności: ${match.confidence_level}
• Model AI: ${match.ai_model}

⚽ RZECZYWISTY WYNIK:
• Faktyczny wynik: ${match.actual_home_score}-${match.actual_away_score}
• Zwycięzca: ${match.winner === 'home' ? match.home_team_name : match.winner === 'away' ? match.away_team_name : 'Remis'}

📊 DOKŁADNOŚĆ:
• Poprawny wynik: ${match.result_correct ? 'TAK ✅' : 'NIE ❌'}
• Dokładny wynik: ${match.score_correct ? 'TAK ✅' : 'NIE ❌'}

Przeanalizuj tę predykcję i zwróć analizę w formacie JSON:

{
  "overallAccuracy": "ocena ogólna (excellent/good/poor)",
  "strengths": ["mocne strony predykcji"],
  "weaknesses": ["słabe strony predykcji"],
  "insights": ["wnioski i spostrzeżenia"],
  "improvements": ["sugestie ulepszeń"],
  "confidence": "ocena poziomu pewności (justified/overconfident/underconfident)",
  "summary": "krótkie podsumowanie analizy"
}

Zwróć TYLKO JSON:`;

      const response = await fetch('/api/betting/openai/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: analysisPrompt,
          maxTokens: 1000
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        try {
          const analysis = JSON.parse(data.response);
          setAiAnalysis(analysis);
        } catch (parseError) {
          setAiAnalysis({
            overallAccuracy: 'good',
            summary: data.response,
            strengths: ['Analiza dostępna w formie tekstowej'],
            weaknesses: [],
            insights: [],
            improvements: [],
            confidence: 'justified'
          });
        }
      }
      
    } catch (err) {
      console.error('Błąd analizy AI:', err);
      setAiAnalysis({
        overallAccuracy: 'poor',
        summary: 'Błąd podczas analizy AI: ' + err.message,
        strengths: [],
        weaknesses: ['Błąd komunikacji z AI'],
        insights: [],
        improvements: [],
        confidence: 'unknown'
      });
    } finally {
      setAnalyzingMatch(null);
    }
  };

  const getAccuracyColor = (isCorrect) => {
    return isCorrect ? '#10b981' : '#ef4444';
  };

  const getAccuracyIcon = (isCorrect) => {
    return isCorrect ? '✅' : '❌';
  };

  // Deduplicate matches into uniqueMatches (stable across renders)
  const uniqueMatches = (() => {
    const map = {};
    for (const m of matches) {
      const id = m?.fixture_id ?? `${m?.fixture?.id ?? Math.random()}`;
      if (!map[id]) map[id] = m;
    }
    return Object.values(map);
  })();

  // Client-side pagination (pageSize and page are defined in component state)
  const totalPages = Math.max(1, Math.ceil(uniqueMatches.length / pageSize));
  const paginatedMatches = uniqueMatches.slice((page - 1) * pageSize, page * pageSize);

  if (loading) {
    return (
      <div className="results-analysis">
        <div className="loading">
          <div className="spinner"></div>
          <p>Ładowanie analizy wyników...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="results-analysis">
        <div className="error">
          <h3>Błąd</h3>
          <p>{error}</p>
          <button onClick={fetchResultsData}>Spróbuj ponownie</button>
        </div>
      </div>
    );
  }

  return (
    <div className="results-analysis">
      <div className="header">
        <h1>📊 Analiza Wyników</h1>
        <p>Porównanie predykcji AI z rzeczywistymi wynikami meczów</p>
      </div>

      {/* Statystyki ogólne */}
      {stats && (
        <div className="stats-overview">
          <div className="stat-card">
            <div className="stat-value">{stats.totalPredictions}</div>
            <div className="stat-label">Łączne predykcje</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.resultAccuracy.toFixed(1)}%</div>
            <div className="stat-label">Dokładność wyników</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.scoreAccuracy.toFixed(1)}%</div>
            <div className="stat-label">Dokładne wyniki</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.avgProbabilityAccuracy.toFixed(1)}%</div>
            <div className="stat-label">Średnia dokładność</div>
          </div>
        </div>
      )}

      {/* Lista meczów */}
      <div className="matches-list">
        <h2>🏟️ Zakończone mecze z predykcjami</h2>
        
        {uniqueMatches.length === 0 ? (
          <div className="no-matches">
            <p>Brak zakończonych meczów z predykcjami</p>
            <p>Mecze pojawią się tutaj po zakończeniu i aktualizacji wyników</p>
          </div>
        ) : (
          paginatedMatches.map((match) => (
            <div key={`${match.fixture_id}_${match.home_team_name ?? ''}_${match.away_team_name ?? ''}`} className="match-card">
              <div className="match-header">
                <div className="match-info">
                  <h3>{match.home_team_name} vs {match.away_team_name}</h3>
                  <div className="match-meta">
                    <span className="league">{match.league_name}</span>
                    <span className="date">{new Date(match.match_date).toLocaleDateString('pl-PL')}</span>
                  </div>
                </div>
                <div className="match-result">
                  <div className="score">
                    {match.actual_home_score} - {match.actual_away_score}
                  </div>
                </div>
              </div>

              <div className="prediction-comparison">
                <div className="prediction-section">
                  <h4>🔮 Predykcja AI</h4>
                  <div className="prediction-details">
                    <div className="predicted-score">
                      Przewidywany wynik: <strong>{match.predicted_home_score}-{match.predicted_away_score}</strong>
                    </div>
                    <div className="probabilities">
                      <span className="prob-home">{match.home_win_probability}%</span>
                      <span className="prob-draw">{match.draw_probability}%</span>
                      <span className="prob-away">{match.away_win_probability}%</span>
                    </div>
                    <div className="confidence">
                      Pewność: <span className={`confidence-${match.confidence_level}`}>{match.confidence_level}</span>
                    </div>
                  </div>
                </div>

                <div className="accuracy-section">
                  <h4>📊 Dokładność</h4>
                  <div className="accuracy-metrics">
                    <div className="metric">
                      <span className="metric-label">Poprawny wynik:</span>
                      <span className="metric-value" style={{color: getAccuracyColor(match.result_correct)}}>
                        {getAccuracyIcon(match.result_correct)} {match.result_correct ? 'TAK' : 'NIE'}
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Dokładny wynik:</span>
                      <span className="metric-value" style={{color: getAccuracyColor(match.score_correct)}}>
                        {getAccuracyIcon(match.score_correct)} {match.score_correct ? 'TAK' : 'NIE'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="match-actions">
                <button 
                  className="analyze-btn"
                  onClick={() => {
                    setSelectedMatch(match);
                    analyzeMatchWithAI(match);
                  }}
                  disabled={analyzingMatch === match.fixture_id}
                >
                  {analyzingMatch === match.fixture_id ? (
                    <>🤖 Analizuję...</>
                  ) : (
                    <>🧠 Analiza AI</>  
                  )}
                </button>
              </div>

              {/* Analiza AI */}
              {selectedMatch?.fixture_id === match.fixture_id && aiAnalysis && (
                <div className="ai-analysis">
                  <h4>🧠 Analiza AI predykcji</h4>
                  
                  <div className="analysis-summary">
                    <div className={`overall-rating rating-${aiAnalysis.overallAccuracy}`}>
                      Ogólna ocena: {aiAnalysis.overallAccuracy}
                    </div>
                    <p>{aiAnalysis.summary}</p>
                  </div>

                  <div className="analysis-details">
                    {aiAnalysis.strengths && aiAnalysis.strengths.length > 0 && (
                      <div className="analysis-section strengths">
                        <h5>✅ Mocne strony</h5>
                        <ul>
                          {aiAnalysis.strengths.map((strength, index) => (
                            <li key={index}>{strength}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {aiAnalysis.weaknesses && aiAnalysis.weaknesses.length > 0 && (
                      <div className="analysis-section weaknesses">
                        <h5>❌ Słabe strony</h5>
                        <ul>
                          {aiAnalysis.weaknesses.map((weakness, index) => (
                            <li key={index}>{weakness}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {aiAnalysis.insights && aiAnalysis.insights.length > 0 && (
                      <div className="analysis-section insights">
                        <h5>💡 Wnioski</h5>
                        <ul>
                          {aiAnalysis.insights.map((insight, index) => (
                            <li key={index}>{insight}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {aiAnalysis.improvements && aiAnalysis.improvements.length > 0 && (
                      <div className="analysis-section improvements">
                        <h5>🔧 Sugestie ulepszeń</h5>
                        <ul>
                          {aiAnalysis.improvements.map((improvement, index) => (
                            <li key={index}>{improvement}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div className="pagination" style={{display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', marginTop: '16px'}}>
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}>Poprzednia</button>
          <span>Strona {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}>Następna</button>
        </div>
      </div>
    </div>
  );
};

export default ResultsAnalysis;
