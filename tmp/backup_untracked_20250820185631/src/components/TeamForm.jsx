import React from 'react';

export const TeamForm = ({ team, form, label }) => {
  if (!form || !form.length) {
    return (
      <div className="text-center text-gray-500">
        Brak danych o formie dla {team.name}
      </div>
    );
  }

  const getFormClass = (result) => {
    switch (result) {
      case 'W': return 'form-w';
      case 'D': return 'form-d';
      case 'L': return 'form-l';
      default: return 'bg-gray-400';
    }
  };

  const calculateStats = () => {
    const wins = form.filter(match => match.result === 'W').length;
    const draws = form.filter(match => match.result === 'D').length;
    const losses = form.filter(match => match.result === 'L').length;
    const goalsFor = form.reduce((sum, match) => sum + match.goalsFor, 0);
    const goalsAgainst = form.reduce((sum, match) => sum + match.goalsAgainst, 0);
    
    return { wins, draws, losses, goalsFor, goalsAgainst };
  };

  const stats = calculateStats();

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <img src={team.logo} alt={team.name} className="w-8 h-8" />
          <span className="font-semibold">{team.name}</span>
          <span className="text-sm text-gray-600">({label})</span>
        </div>
        
        <div className="flex space-x-1">
          {form.slice(0, 5).map((match, index) => (
            <div 
              key={index}
              className={`form-indicator ${getFormClass(match.result)}`}
              title={`vs ${match.opponent}: ${match.goalsFor}-${match.goalsAgainst} (${match.venue === 'H' ? 'Dom' : 'Wyjazd'})`}
            >
              {match.result}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="text-center">
          <div className="font-bold text-green-600">{stats.wins}</div>
          <div className="text-gray-600">Zwycięstwa</div>
        </div>
        <div className="text-center">
          <div className="font-bold text-yellow-600">{stats.draws}</div>
          <div className="text-gray-600">Remisy</div>
        </div>
        <div className="text-center">
          <div className="font-bold text-red-600">{stats.losses}</div>
          <div className="text-gray-600">Porażki</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t text-sm text-gray-600">
        <div className="flex justify-between">
          <span>Bramki strzelone:</span>
          <span className="font-semibold">{stats.goalsFor}</span>
        </div>
        <div className="flex justify-between">
          <span>Bramki stracone:</span>
          <span className="font-semibold">{stats.goalsAgainst}</span>
        </div>
        <div className="flex justify-between">
          <span>Bilans bramkowy:</span>
          <span className={`font-semibold ${stats.goalsFor - stats.goalsAgainst >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {stats.goalsFor - stats.goalsAgainst > 0 ? '+' : ''}{stats.goalsFor - stats.goalsAgainst}
          </span>
        </div>
      </div>

      {/* Ostatnie mecze */}
      <div className="mt-3 pt-3 border-t">
        <div className="text-xs text-gray-600 mb-2">Ostatnie mecze:</div>
        <div className="space-y-1">
          {form.slice(0, 3).map((match, index) => (
            <div key={index} className="flex justify-between text-xs">
              <span>vs {match.opponent}</span>
              <span className={`font-semibold ${
                match.result === 'W' ? 'text-green-600' : 
                match.result === 'D' ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {match.goalsFor}-{match.goalsAgainst}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};