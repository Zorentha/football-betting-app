import React from 'react';

export const MatchInsights = ({ homeForm, awayForm, homeTeam, awayTeam }) => {
  if (!homeForm || !awayForm || homeForm.length === 0 || awayForm.length === 0) {
    return null;
  }

  // Analiza trendów
  const analyzeTrends = (form) => {
    const recent3 = form.slice(0, 3);
    const older2 = form.slice(3, 5);
    
    const recent3Points = recent3.reduce((sum, match) => {
      return sum + (match.result === 'W' ? 3 : match.result === 'D' ? 1 : 0);
    }, 0);
    
    const older2Points = older2.reduce((sum, match) => {
      return sum + (match.result === 'W' ? 3 : match.result === 'D' ? 1 : 0);
    }, 0);

    const recentAvg = recent3Points / 3;
    const olderAvg = older2Points / 2;
    
    return {
      trend: recentAvg > olderAvg ? 'rosnąca' : recentAvg < olderAvg ? 'spadająca' : 'stabilna',
      recentPoints: recent3Points,
      momentum: recentAvg - olderAvg
    };
  };

  // Analiza stylu gry
  const analyzePlayStyle = (form) => {
    const totalGoalsFor = form.reduce((sum, match) => sum + match.goalsFor, 0);
    const totalGoalsAgainst = form.reduce((sum, match) => sum + match.goalsAgainst, 0);
    const cleanSheets = form.filter(match => match.goalsAgainst === 0).length;
    const highScoringGames = form.filter(match => (match.goalsFor + match.goalsAgainst) > 2.5).length;
    
    return {
      avgGoalsFor: (totalGoalsFor / form.length).toFixed(1),
      avgGoalsAgainst: (totalGoalsAgainst / form.length).toFixed(1),
      cleanSheets,
      highScoringGames,
      style: totalGoalsFor > totalGoalsAgainst * 1.5 ? 'ofensywny' : 
             totalGoalsAgainst < totalGoalsFor * 0.7 ? 'defensywny' : 'zrównoważony'
    };
  };

  const homeTrends = analyzeTrends(homeForm);
  const awayTrends = analyzeTrends(awayForm);
  const homeStyle = analyzePlayStyle(homeForm);
  const awayStyle = analyzePlayStyle(awayForm);

  // Kluczowe czynniki
  const getKeyFactors = () => {
    const factors = [];

    // Momentum
    if (Math.abs(homeTrends.momentum - awayTrends.momentum) > 0.5) {
      const betterTeam = homeTrends.momentum > awayTrends.momentum ? homeTeam.name : awayTeam.name;
      factors.push({
        icon: '📈',
        title: 'Momentum',
        description: `${betterTeam} ma lepszą formę w ostatnich meczach`,
        impact: 'Wysoki'
      });
    }

    // Styl gry
    if (homeStyle.style === 'ofensywny' && awayStyle.style === 'defensywny') {
      factors.push({
        icon: '⚔️',
        title: 'Starcie stylów',
        description: 'Ofensywni gospodarze vs defensywni goście',
        impact: 'Średni'
      });
    }

    // Clean sheets
    const totalCleanSheets = homeStyle.cleanSheets + awayStyle.cleanSheets;
    if (totalCleanSheets >= 6) {
      factors.push({
        icon: '🛡️',
        title: 'Mocne obrony',
        description: 'Obie drużyny mają solidne defensywy',
        impact: 'Średni'
      });
    }

    // Wysokie wyniki
    const totalHighScoring = homeStyle.highScoringGames + awayStyle.highScoringGames;
    if (totalHighScoring >= 7) {
      factors.push({
        icon: '🎯',
        title: 'Bramkostrzelne mecze',
        description: 'Obie drużyny grają w meczach z wieloma bramkami',
        impact: 'Wysoki'
      });
    }

    return factors;
  };

  const keyFactors = getKeyFactors();

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'rosnąca': return '📈';
      case 'spadająca': return '📉';
      default: return '➡️';
    }
  };

  const getTrendColor = (trend) => {
    switch (trend) {
      case 'rosnąca': return 'text-green-600';
      case 'spadająca': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold mb-4">🔍 Szczegółowa analiza</h3>
      
      {/* Trendy formy */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="border rounded-lg p-4">
          <h4 className="font-semibold mb-3 flex items-center">
            <img src={homeTeam.logo} alt={homeTeam.name} className="w-5 h-5 mr-2" />
            {homeTeam.name}
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Trend formy:</span>
              <span className={`font-semibold ${getTrendColor(homeTrends.trend)}`}>
                {getTrendIcon(homeTrends.trend)} {homeTrends.trend}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Styl gry:</span>
              <span className="font-semibold">{homeStyle.style}</span>
            </div>
            <div className="flex justify-between">
              <span>Czyste konta:</span>
              <span className="font-semibold">{homeStyle.cleanSheets}/5</span>
            </div>
            <div className="flex justify-between">
              <span>Bramkostrzelne mecze:</span>
              <span className="font-semibold">{homeStyle.highScoringGames}/5</span>
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <h4 className="font-semibold mb-3 flex items-center">
            <img src={awayTeam.logo} alt={awayTeam.name} className="w-5 h-5 mr-2" />
            {awayTeam.name}
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Trend formy:</span>
              <span className={`font-semibold ${getTrendColor(awayTrends.trend)}`}>
                {getTrendIcon(awayTrends.trend)} {awayTrends.trend}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Styl gry:</span>
              <span className="font-semibold">{awayStyle.style}</span>
            </div>
            <div className="flex justify-between">
              <span>Czyste konta:</span>
              <span className="font-semibold">{awayStyle.cleanSheets}/5</span>
            </div>
            <div className="flex justify-between">
              <span>Bramkostrzelne mecze:</span>
              <span className="font-semibold">{awayStyle.highScoringGames}/5</span>
            </div>
          </div>
        </div>
      </div>

      {/* Kluczowe czynniki */}
      {keyFactors.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3">🎯 Kluczowe czynniki</h4>
          <div className="space-y-3">
            {keyFactors.map((factor, index) => (
              <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium flex items-center">
                    <span className="mr-2">{factor.icon}</span>
                    {factor.title}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    factor.impact === 'Wysoki' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {factor.impact}
                  </span>
                </div>
                <div className="text-sm text-gray-600">{factor.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};