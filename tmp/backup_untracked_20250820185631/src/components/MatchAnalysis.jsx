import React from 'react';

const MatchAnalysis = ({ homeForm, awayForm, homeTeam, awayTeam }) => {
  if (!homeForm || !awayForm || homeForm.length === 0 || awayForm.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold mb-4">📊 Analiza meczu</h3>
        <div className="text-center text-gray-500">
          <div className="animate-pulse">Ładowanie danych do analizy...</div>
          <div className="text-xs mt-2">Pobieranie formy drużyn z ostatnich meczów</div>
        </div>
      </div>
    );
  }

  // Oblicz statystyki formy
  const calculateFormStats = (form) => {
    const wins = form.filter(match => match.result === 'W').length;
    const draws = form.filter(match => match.result === 'D').length;
    const losses = form.filter(match => match.result === 'L').length;
    const goalsFor = form.reduce((sum, match) => sum + match.goalsFor, 0);
    const goalsAgainst = form.reduce((sum, match) => sum + match.goalsAgainst, 0);
    const points = wins * 3 + draws * 1;
    const matches = form.length;

    return {
      wins, draws, losses, goalsFor, goalsAgainst, points,
      // Keep numeric averages (safer to work with numbers in logic). Format when rendering.
      avgGoalsFor: matches > 0 ? goalsFor / matches : 0,
      avgGoalsAgainst: matches > 0 ? goalsAgainst / matches : 0,
      formPercentage: matches > 0 ? Math.round((points / (matches * 3)) * 100) : 0
    };
  };

  const homeStats = calculateFormStats(homeForm);
  const awayStats = calculateFormStats(awayForm);

  // Predykcja wyniku
  const predictMatch = () => {
    // Use numeric averages (avgGoals are numbers now)
    let homeScore = 0;
    let awayScore = 0;

    const homeAvgGF = Number(homeStats.avgGoalsFor || 0);
    const awayAvgGF = Number(awayStats.avgGoalsFor || 0);
    const homeAvgGA = Number(homeStats.avgGoalsAgainst || 0);
    const awayAvgGA = Number(awayStats.avgGoalsAgainst || 0);

    // Clamp defensive influence so it doesn't go negative
    const awayDefFactor = Math.max(0, 3 - awayAvgGA);
    const homeDefFactor = Math.max(0, 3 - homeAvgGA);

    // Base prediction from averages (weights tuned)
    homeScore = homeAvgGF * 0.6 + awayDefFactor * 0.4;
    awayScore = awayAvgGF * 0.5 + homeDefFactor * 0.5;

    // Adjust by recent form difference (scaled and clamped)
    const formDiff = ((homeStats.formPercentage || 0) - (awayStats.formPercentage || 0)) / 100;
    const formAdjustment = Math.max(-0.6, Math.min(0.6, formDiff * 0.8)); // limit impact
    homeScore += formAdjustment;
    awayScore -= formAdjustment;

    // Ensure scores are within reasonable bounds
    homeScore = Math.max(0, Math.min(6, homeScore));
    awayScore = Math.max(0, Math.min(6, awayScore));

    // Round to nearest 0.5 for nicer display
    homeScore = Math.round(homeScore * 2) / 2;
    awayScore = Math.round(awayScore * 2) / 2;

    return { homeScore, awayScore };
  };

  const prediction = predictMatch();

  // Określ prawdopodobieństwa
  const calculateProbabilities = () => {
    // Base factors
    const pointDiff = (homeStats.points || 0) - (awayStats.points || 0);
    const goalDiff = (parseFloat(homeStats.avgGoalsFor || 0) - parseFloat(awayStats.avgGoalsFor || 0));

    // Start with balanced baseline and apply modifiers
    let homeBase = 40 + pointDiff * 2 + goalDiff * 6; // scaled influence
    let awayBase = 40 - pointDiff * 2 - goalDiff * 6;
    let drawBase = 20 - Math.abs(pointDiff) * 1.5;

    // Apply small home advantage
    homeBase += 5;

    // Clamp bases to avoid extremes
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    homeBase = clamp(homeBase, 5, 90);
    awayBase = clamp(awayBase, 5, 90);
    drawBase = clamp(drawBase, 5, 60);

    // Normalize to sum 100
    const sum = homeBase + drawBase + awayBase;
    let homeWin = Math.round((homeBase / sum) * 100);
    let draw = Math.round((drawBase / sum) * 100);
    let awayWin = 100 - homeWin - draw; // ensure total 100

    return {
      homeWin: homeWin.toFixed(0),
      draw: draw.toFixed(0),
      awayWin: awayWin.toFixed(0)
    };
  };

  const probabilities = calculateProbabilities();

  // Rekomendacje zakładów
  const getBettingTips = () => {
    const tips = [];
    
    // Over/Under 2.5
    const totalGoals = prediction.homeScore + prediction.awayScore;
    if (totalGoals > 2.5) {
      tips.push({
        type: 'Over 2.5 bramek',
        confidence: totalGoals > 3 ? 'Wysoka' : 'Średnia',
        reason: `Przewidywane ${totalGoals} bramek na podstawie formy ofensywnej`
      });
    } else {
      tips.push({
        type: 'Under 2.5 bramek',
        confidence: totalGoals < 2 ? 'Wysoka' : 'Średnia',
        reason: `Przewidywane ${totalGoals} bramek - defensywny mecz`
      });
    }

    // Wynik meczu
    if (probabilities.homeWin > 50) {
      tips.push({
        type: `Wygrana ${homeTeam.name}`,
        confidence: probabilities.homeWin > 60 ? 'Wysoka' : 'Średnia',
        reason: `${probabilities.homeWin}% szans na wygraną gospodarzy`
      });
    } else if (probabilities.awayWin > 40) {
      tips.push({
        type: `Wygrana ${awayTeam.name}`,
        confidence: probabilities.awayWin > 50 ? 'Wysoka' : 'Średnia',
        reason: `${probabilities.awayWin}% szans na wygraną gości`
      });
    } else {
      tips.push({
        type: 'Remis',
        confidence: 'Średnia',
        reason: 'Wyrównane szanse obu drużyn'
      });
    }

    // Obie drużyny strzelą
    const bothScore = (homeStats.avgGoalsFor > 1 && awayStats.avgGoalsFor > 0.8);
    tips.push({
      type: bothScore ? 'Obie drużyny strzelą - TAK' : 'Obie drużyny strzelą - NIE',
      confidence: 'Średnia',
      reason: bothScore ? 'Obie drużyny mają dobrą formę strzelecką' : 'Słaba forma strzelecka jednej z drużyn'
    });

    return tips;
  };

  const bettingTips = getBettingTips();

  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'Wysoka': return 'text-green-600 bg-green-100';
      case 'Średnia': return 'text-yellow-600 bg-yellow-100';
      case 'Niska': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold mb-6 text-center">📊 Analiza meczu</h3>
      
      {/* Porównanie statystyk */}
      <div className="grid md:grid-cols-3 gap-6 mb-6">
        <div className="text-center">
          <h4 className="font-semibold text-blue-600 mb-2">{homeTeam.name}</h4>
            <div className="space-y-1 text-sm">
            <div>Forma: {homeStats.formPercentage}%</div>
            <div>Bramki/mecz: {homeStats.avgGoalsFor.toFixed ? homeStats.avgGoalsFor.toFixed(1) : String(homeStats.avgGoalsFor)}</div>
            <div>Stracone/mecz: {homeStats.avgGoalsAgainst.toFixed ? homeStats.avgGoalsAgainst.toFixed(1) : String(homeStats.avgGoalsAgainst)}</div>
            <div className="font-semibold">Punkty: {homeStats.points}/{homeForm.length * 3}</div>
          </div>
        </div>
        
        <div className="text-center border-x px-4">
          <h4 className="font-semibold mb-2">VS</h4>
          <div className="text-2xl font-bold text-gray-700 mb-2">
            {prediction.homeScore} - {prediction.awayScore}
          </div>
          <div className="text-xs text-gray-600">Przewidywany wynik</div>
        </div>
        
        <div className="text-center">
          <h4 className="font-semibold text-red-600 mb-2">{awayTeam.name}</h4>
            <div className="space-y-1 text-sm">
            <div>Forma: {awayStats.formPercentage}%</div>
            <div>Bramki/mecz: {awayStats.avgGoalsFor.toFixed ? awayStats.avgGoalsFor.toFixed(1) : String(awayStats.avgGoalsFor)}</div>
            <div>Stracone/mecz: {awayStats.avgGoalsAgainst.toFixed ? awayStats.avgGoalsAgainst.toFixed(1) : String(awayStats.avgGoalsAgainst)}</div>
            <div className="font-semibold">Punkty: {awayStats.points}/{awayForm.length * 3}</div>
          </div>
        </div>
      </div>

      {/* Prawdopodobieństwa */}
      <div className="mb-6">
        <h4 className="font-semibold mb-3">Prawdopodobieństwa:</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-3 bg-blue-50 rounded">
            <div className="font-bold text-blue-600">{probabilities.homeWin}%</div>
            <div className="text-xs">Wygrana gospodarzy</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="font-bold text-gray-600">{probabilities.draw}%</div>
            <div className="text-xs">Remis</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded">
            <div className="font-bold text-red-600">{probabilities.awayWin}%</div>
            <div className="text-xs">Wygrana gości</div>
          </div>
        </div>
      </div>

      {/* Rekomendacje zakładów */}
      <div>
        <h4 className="font-semibold mb-3">💡 Rekomendacje zakładów:</h4>
        <div className="space-y-3">
          {bettingTips.map((tip, index) => (
            <div key={index} className="border rounded-lg p-3">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium">{tip.type}</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getConfidenceColor(tip.confidence)}`}>
                  {tip.confidence}
                </span>
              </div>
              <div className="text-sm text-gray-600">{tip.reason}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t text-xs text-gray-500 text-center">
        ⚠️ Analiza oparta na ostatnich 5 meczach. Nie gwarantuje wyników.
      </div>
    </div>
  );
};

export default MatchAnalysis;
