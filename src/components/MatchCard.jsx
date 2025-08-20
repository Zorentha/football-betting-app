import React, { useState, useEffect } from 'react';

export const MatchCard = ({ match, onClick }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('pl-PL'),
      time: date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const getMatchStatus = () => {
    const status = match.fixture.status.short;
    const elapsed = match.fixture.status.elapsed;
    
    switch (status) {
      case 'NS':
        return {
          text: 'Nie rozpoczęty',
          color: 'bg-blue-100 text-blue-800',
          icon: '⏰'
        };
      case '1H':
        return {
          text: `${elapsed}' - I połowa`,
          color: 'bg-green-100 text-green-800',
          icon: '🟢'
        };
      case 'HT':
        return {
          text: 'Przerwa',
          color: 'bg-yellow-100 text-yellow-800',
          icon: '⏸️'
        };
      case '2H':
        return {
          text: `${elapsed}' - II połowa`,
          color: 'bg-green-100 text-green-800',
          icon: '🟢'
        };
      case 'ET':
        return {
          text: `${elapsed}' - Dogrywka`,
          color: 'bg-orange-100 text-orange-800',
          icon: '⏱️'
        };
      case 'P':
        return {
          text: 'Rzuty karne',
          color: 'bg-red-100 text-red-800',
          icon: '🥅'
        };
      case 'FT':
        return {
          text: 'Zakończony',
          color: 'bg-gray-100 text-gray-800',
          icon: '✅'
        };
      case 'SUSP':
        return {
          text: 'Przerwany',
          color: 'bg-red-100 text-red-800',
          icon: '⛔'
        };
      case 'INT':
        return {
          text: 'Przerwany',
          color: 'bg-red-100 text-red-800',
          icon: '⛔'
        };
      default:
        return {
          text: match.fixture.status.long,
          color: 'bg-gray-100 text-gray-800',
          icon: '❓'
        };
    }
  };

  const { date, time } = formatDate(match.fixture.date);
  const matchStatus = getMatchStatus();

  const [aiAnalysisState, setAiAnalysisState] = useState(match.aiAnalysis || null);
  // Compute formatted percentage display for probabilities (ensure they sum to 100 and are integers)
  const getFormattedProbabilities = (probs) => {
    const h = Number(probs?.homeWin) || 0;
    const d = Number(probs?.draw) || 0;
    const a = Number(probs?.awayWin) || 0;
    const total = h + d + a;
    if (total <= 0) return { home: 0, draw: 0, away: 0 };
    let ph = Math.round((h / total) * 100);
    let pd = Math.round((d / total) * 100);
    let pa = Math.round((a / total) * 100);
    const sum = ph + pd + pa;
    const diff = 100 - sum;
    if (diff !== 0) {
      // add diff to the largest raw value to correct rounding issues
      const maxRaw = Math.max(h, d, a);
      if (maxRaw === h) ph += diff;
      else if (maxRaw === d) pd += diff;
      else pa += diff;
    }
    return { home: ph, draw: pd, away: pa };
  };

  const formattedProbabilities = getFormattedProbabilities(aiAnalysisState?.probabilities || {});
  useEffect(() => {
    let mounted = true;
    const fetchStored = async () => {
      try {
        const resp = await fetch(`/api/betting/fixtures/${match.fixture.id}/analysis`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.success && mounted) setAiAnalysisState(data.data.aiAnalysis || null);
        } else {
          if (mounted) setAiAnalysisState(null);
        }
      } catch (e) {
        if (mounted) setAiAnalysisState(null);
      }
    };
    fetchStored();
    return () => { mounted = false; };
  }, [match.fixture.id]);

  return (
    <div 
      className="match-card cursor-pointer transform hover:scale-105 transition-transform"
      onClick={onClick}
    >
      {/* Header z datą i ligą */}
      <div className="flex justify-between items-center mb-4 text-sm text-gray-600">
        <span>{date} • {time}</span>
        <span className="bg-gray-100 px-2 py-1 rounded text-xs">
          {match.league.name}
        </span>
      </div>

      {/* Drużyny */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3 flex-1">
          <img 
            src={match.teams.home.logo} 
            alt={match.teams.home.name}
            className="team-logo"
          />
          <span className="font-semibold text-gray-800 truncate">
            {match.teams.home.name}
          </span>
        </div>
        
        <div className="mx-4 text-gray-400 font-bold">VS</div>
        
        <div className="flex items-center space-x-3 flex-1 justify-end">
          <span className="font-semibold text-gray-800 truncate">
            {match.teams.away.name}
          </span>
          <img 
            src={match.teams.away.logo} 
            alt={match.teams.away.name}
            className="team-logo"
          />
        </div>
      </div>

      {/* Stadion */}
      <div className="text-center text-sm text-gray-600 mb-3">
        📍 {match.fixture.venue.name}, {match.fixture.venue.city}
      </div>

      {/* Status i wynik */}
      <div className="flex justify-center mb-2">
        <span className={`${matchStatus.color} px-3 py-1 rounded-full text-sm font-medium flex items-center`}>
          <span className="mr-1">{matchStatus.icon}</span>
          {matchStatus.text}
        </span>
      </div>

      {/* Wynik dla meczów w trakcie lub zakończonych */}
      {(match.goals.home !== null && match.goals.away !== null) && (
        <div className="text-center mb-2">
          <div className="text-2xl font-bold text-gray-800">
            {match.goals.home} - {match.goals.away}
          </div>
          <div className="text-xs text-gray-500">Aktualny wynik</div>
        </div>
      )}

      {/* Analiza AI */}
      <div className="mt-3 border-t pt-3">
        {match.analyzing ? (
          <div className="text-center">
            <div className="flex justify-center items-center mb-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600 mr-2"></div>
              <span className="text-xs font-semibold text-purple-600">🤖 Analizuję z AI...</span>
            </div>
            <div className="text-xs text-gray-500">
              {['1H', '2H', 'HT', 'ET', 'P'].includes(match.fixture.status.short) 
                ? 'Analiza meczu w trakcie' 
                : 'Pobieranie danych i analiza GPT-5'}
            </div>
          </div>
        ) : aiAnalysisState && !aiAnalysisState.error ? (
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-purple-600">🤖 Analiza AI</span>
              <div className="flex flex-col items-end">
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                  {aiAnalysisState.confidencePercentage}% pewności
                </span>
                {aiAnalysisState?.calibrationVersion && (
                  <span className="text-xs text-gray-500 mt-1">Kalibracja: {aiAnalysisState.calibrationVersion}</span>
                )}
                {aiAnalysisState?.bettingTips && aiAnalysisState.bettingTips.length > 0 && (
                  <span className="text-xs text-gray-600 mt-1">
                    Top rekomendacja: {aiAnalysisState.bettingTips[0].type} — {typeof aiAnalysisState.bettingTips[0].probability === 'number' ? `${Math.round(aiAnalysisState.bettingTips[0].probability)}%` : (aiAnalysisState.confidencePercentage ? `~${aiAnalysisState.confidencePercentage}%` : '')}
                  </span>
                )}
              </div>
            </div>
            
            <div className="text-center mb-2">
              <div className="text-lg font-bold text-gray-700">
                {aiAnalysisState.predictedScore.home} - {aiAnalysisState.predictedScore.away}
              </div>
              <div className="text-xs text-gray-500">Przewidywany wynik</div>
            </div>
            
            <div className="grid grid-cols-3 gap-1 text-xs">
              <div className="text-center">
                <div className="font-bold text-blue-600">{formattedProbabilities.home}%</div>
                <div className="text-gray-500">Gosp.</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-gray-600">{formattedProbabilities.draw}%</div>
                <div className="text-gray-500">Remis</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-red-600">{formattedProbabilities.away}%</div>
                <div className="text-gray-500">Goście</div>
              </div>
            </div>
          </div>
        ) : aiAnalysisState?.error ? (
          <div className="text-center">
            <span className="text-xs text-red-600">❌ Błąd analizy AI</span>
          </div>
        ) : (
          <div className="text-center">
            <span className="text-xs text-gray-500">⏳ Oczekuje na analizę AI...</span>
          </div>
        )}
      </div>

      {/* Hover effect indicator */}
      <div className="mt-3 text-center text-xs text-gray-500">
        Kliknij aby zobaczyć szczegóły →
      </div>
    </div>
  );
};
