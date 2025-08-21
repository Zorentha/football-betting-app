import React from 'react';
import { MatchCard } from './MatchCard';

export const MatchList = ({ matches, loading, error, viewMode, onMatchSelect, onRefresh, onViewModeChange, aiEnabled, toggleAi }) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        <div className="ml-4 text-center">
          <div className="text-gray-600">Ładowanie meczów...</div>
          <div className="text-xs text-gray-500 mt-1">🤖 Analizuję wszystkie mecze z AI</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">❌ {error}</div>
        <button 
          onClick={onRefresh}
          className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  if (!matches.length) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600 mb-4">Brak nadchodzących meczów</div>
        <button 
          onClick={onRefresh}
          className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
        >
          Odśwież
        </button>
      </div>
    );
  }

  // Grupuj mecze według lig
  const matchesByLeague = matches.reduce((acc, match) => {
    const leagueName = match.league.name;
    if (!acc[leagueName]) {
      acc[leagueName] = [];
    }
    acc[leagueName].push(match);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            {viewMode === 'today' ? 'Dzisiejsze mecze' : 'Nadchodzące mecze'} ({matches.length})
          </h2>
          <div className="flex space-x-2 mt-2">
            <button
              onClick={() => onViewModeChange('today')}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                viewMode === 'today' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Najbliższe 7 dni
            </button>
            <button
              onClick={() => onViewModeChange('upcoming')}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                viewMode === 'upcoming' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Wszystkie nadchodzące
            </button>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={onRefresh}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2"
          >
            <span>🔄</span>
            <span>Odśwież</span>
          </button>

          <button
            onClick={toggleAi}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${aiEnabled ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            title={aiEnabled ? 'Wyłącz automatyczną analizę AI' : 'Włącz automatyczną analizę AI'}
          >
            {aiEnabled ? '🛑 Stop AI' : '▶️ Resume AI'}
          </button>
        </div>
      </div>

      {Object.entries(matchesByLeague).map(([leagueName, leagueMatches]) => (
        <div key={leagueName} className="mb-8">
          <h3 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
            <img 
              src={leagueMatches[0].league.logo} 
              alt={leagueName}
              className="w-6 h-6 mr-2"
            />
            {leagueName}
          </h3>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {leagueMatches.map((match) => (
              <MatchCard 
                key={match.fixture.id}
                match={match}
                onClick={() => onMatchSelect(match)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
