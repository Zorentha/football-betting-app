import React, { useState } from 'react';

export const LineupDisplay = ({ lineups }) => {
  const [activeTab, setActiveTab] = useState('list');

  if (!lineups || lineups.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center">
          👥 Składy
          <span className="ml-2 text-sm font-normal text-gray-500">(Nie ogłoszono)</span>
        </h3>
        <div className="text-center text-gray-500 py-8">
          <div className="text-4xl mb-2">⏰</div>
          <div>Składy zostaną ogłoszone 30-60 minut przed meczem</div>
          <div className="text-sm mt-2">Sprawdź ponownie później</div>
        </div>
      </div>
    );
  }

  const homeLineup = lineups[0];
  const awayLineup = lineups[1];

  // Debug - sprawdź dane
  console.log('Lineups:', lineups);
  console.log('Home lineup:', homeLineup);
  console.log('Away lineup:', awayLineup);
  if (homeLineup?.startXI) {
    console.log('Home startXI:', homeLineup.startXI.slice(0, 3));
  }

  // Grupuj zawodników według pozycji
  const groupPlayersByPosition = (players) => {
    const positions = {
      goalkeepers: players.filter(p => p.player.pos === 'G'),
      defenders: players.filter(p => p.player.pos === 'D'),
      midfielders: players.filter(p => p.player.pos === 'M'),
      forwards: players.filter(p => p.player.pos === 'F')
    };
    return positions;
  };

  // Renderuj formację w stylu boiska
  const renderFormationField = (lineup) => {
    if (!lineup || !lineup.startXI) return null;

    const positions = groupPlayersByPosition(lineup.startXI);
    
    return (
      <div className="relative bg-gradient-to-b from-green-400 to-green-500 rounded-lg p-4 min-h-96">
        {/* Linie boiska */}
        <div className="absolute inset-0 opacity-20">
          <div className="h-full border-2 border-white rounded-lg">
            <div className="h-1/2 border-b-2 border-white"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-white rounded-full"></div>
          </div>
        </div>

        {/* Bramkarz */}
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
          {positions.goalkeepers.map(player => (
            <div key={player.player.id} className="bg-yellow-400 text-black px-2 py-1 rounded text-xs font-bold text-center shadow-lg">
              <div>{player.player.number}</div>
              <div className="text-xs">{player.player.name.split(' ').pop()}</div>
            </div>
          ))}
        </div>

        {/* Obrońcy */}
        <div className="absolute bottom-16 left-0 right-0 flex justify-center space-x-2">
          {positions.defenders.map((player, index) => (
            <div key={player.player.id} className="bg-blue-500 text-white px-2 py-1 rounded text-xs font-bold text-center shadow-lg">
              <div>{player.player.number}</div>
              <div className="text-xs">{player.player.name.split(' ').pop()}</div>
            </div>
          ))}
        </div>

        {/* Pomocnicy */}
        <div className="absolute bottom-32 left-0 right-0 flex justify-center space-x-2">
          {positions.midfielders.map((player, index) => (
            <div key={player.player.id} className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold text-center shadow-lg">
              <div>{player.player.number}</div>
              <div className="text-xs">{player.player.name.split(' ').pop()}</div>
            </div>
          ))}
        </div>

        {/* Napastnicy */}
        <div className="absolute bottom-48 left-0 right-0 flex justify-center space-x-2">
          {positions.forwards.map((player, index) => (
            <div key={player.player.id} className="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold text-center shadow-lg">
              <div>{player.player.number}</div>
              <div className="text-xs">{player.player.name.split(' ').pop()}</div>
            </div>
          ))}
        </div>

        {/* Informacje o drużynie */}
        <div className="absolute top-2 left-2 bg-white bg-opacity-90 rounded p-2">
          <div className="flex items-center space-x-2">
            <img src={lineup.team.logo} alt={lineup.team.name} className="w-6 h-6" />
            <div>
              <div className="font-bold text-sm">{lineup.team.name}</div>
              <div className="text-xs text-gray-600">{lineup.formation}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Renderuj listę zawodników
  const renderPlayerList = (lineup) => {
    if (!lineup || !lineup.startXI || lineup.startXI.length === 0) {
      return (
        <div className="text-center text-gray-500 py-8">
          <div>Skład podstawowy nie został jeszcze ogłoszony</div>
          <div className="text-sm mt-2">Sprawdź ponownie 30-60 minut przed meczem</div>
        </div>
      );
    }

    const positions = groupPlayersByPosition(lineup.startXI);
    
    // Debug
    console.log('Rendering player list for:', lineup.team.name);
    console.log('StartXI length:', lineup.startXI.length);
    console.log('First player:', lineup.startXI[0]);
    console.log('Positions:', positions);

    return (
      <div className="space-y-4">
        {/* Header drużyny */}
        <div className="text-center border-b pb-3">
          <div className="flex items-center justify-center space-x-3 mb-2">
            <img src={lineup.team.logo} alt={lineup.team.name} className="w-10 h-10" />
            <div>
              <h4 className="font-bold text-lg">{lineup.team.name}</h4>
              <div className="text-sm text-gray-600">Formacja: {lineup.formation}</div>
            </div>
          </div>
        </div>

        {/* Bramkarz */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded p-3">
          <div className="flex items-center mb-2">
            <span className="text-yellow-600 font-bold text-sm">🧤 BRAMKARZ</span>
          </div>
          {positions.goalkeepers.map(player => (
            <div key={player.player.id} className="flex items-center space-x-3 py-1">
              <div className="w-8 h-8 bg-yellow-400 text-black rounded-full flex items-center justify-center text-sm font-bold">
                {player.player.number}
              </div>
              <div>
                <div className="font-semibold">{player.player.name}</div>
                <div className="text-xs text-gray-600">Bramkarz</div>
              </div>
            </div>
          ))}
        </div>

        {/* Obrońcy */}
        <div className="bg-blue-50 border-l-4 border-blue-400 rounded p-3">
          <div className="flex items-center mb-2">
            <span className="text-blue-600 font-bold text-sm">🛡️ OBRONA ({positions.defenders.length})</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {positions.defenders.map(player => (
              <div key={player.player.id} className="flex items-center space-x-3 py-1">
                <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {player.player.number}
                </div>
                <div>
                  <div className="font-semibold">{player.player.name}</div>
                  <div className="text-xs text-gray-600">Obrońca</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pomocnicy */}
        <div className="bg-green-50 border-l-4 border-green-400 rounded p-3">
          <div className="flex items-center mb-2">
            <span className="text-green-600 font-bold text-sm">⚽ POMOC ({positions.midfielders.length})</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {positions.midfielders.map(player => (
              <div key={player.player.id} className="flex items-center space-x-3 py-1">
                <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {player.player.number}
                </div>
                <div>
                  <div className="font-semibold">{player.player.name}</div>
                  <div className="text-xs text-gray-600">Pomocnik</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Napastnicy */}
        <div className="bg-red-50 border-l-4 border-red-400 rounded p-3">
          <div className="flex items-center mb-2">
            <span className="text-red-600 font-bold text-sm">🎯 ATAK ({positions.forwards.length})</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {positions.forwards.map(player => (
              <div key={player.player.id} className="flex items-center space-x-3 py-1">
                <div className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {player.player.number}
                </div>
                <div>
                  <div className="font-semibold">{player.player.name}</div>
                  <div className="text-xs text-gray-600">Napastnik</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trener */}
        {lineup.coach && (
          <div className="bg-gray-50 border-l-4 border-gray-400 rounded p-3">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                👨‍💼
              </div>
              <div>
                <div className="font-semibold">{lineup.coach.name}</div>
                <div className="text-xs text-gray-600">Trener główny</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold mb-4 text-center flex items-center justify-center">
        <span className="mr-2">👥</span>
        Potwierdzone składy 
        <span className="ml-2 text-green-500">✅</span>
      </h3>
      
      {/* Taby */}
      <div className="flex justify-center mb-6">
        <div className="bg-gray-100 rounded-lg p-1 flex space-x-1">
          <button
            onClick={() => setActiveTab('formation')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'formation'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            🏟️ Formacja
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'list'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            📋 Lista
          </button>
          <button
            onClick={() => setActiveTab('bench')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'bench'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            🪑 Ławka
          </button>
        </div>
      </div>

      {/* Zawartość tabów */}
      {activeTab === 'formation' && (
        <div className="grid md:grid-cols-2 gap-6">
          {homeLineup && renderFormationField(homeLineup)}
          {awayLineup && renderFormationField(awayLineup)}
        </div>
      )}

      {activeTab === 'list' && (
        <div className="grid md:grid-cols-2 gap-6">
          {homeLineup && renderPlayerList(homeLineup)}
          {awayLineup && renderPlayerList(awayLineup)}
        </div>
      )}

      {activeTab === 'bench' && (
        <div className="space-y-6">
          <h4 className="font-bold text-center text-lg">🪑 Ławka rezerwowych</h4>
          <div className="grid md:grid-cols-2 gap-6">
            {lineups.map(lineup => (
              <div key={lineup.team.id} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-center space-x-3 mb-4">
                  <img src={lineup.team.logo} alt={lineup.team.name} className="w-8 h-8" />
                  <div className="font-bold text-lg">{lineup.team.name}</div>
                </div>
                <div className="space-y-2">
                  {lineup.substitutes?.slice(0, 9).map(sub => (
                    <div key={sub.player.id} className="flex items-center space-x-3 py-2 border-b border-gray-200 last:border-b-0">
                      <div className="w-8 h-8 bg-gray-400 text-white rounded-full flex items-center justify-center text-sm font-bold">
                        {sub.player.number}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold">{sub.player.name}</div>
                        <div className="text-xs text-gray-600">
                          {sub.player.pos === 'G' ? '🧤 Bramkarz' : 
                           sub.player.pos === 'D' ? '🛡️ Obrońca' :
                           sub.player.pos === 'M' ? '⚽ Pomocnik' : '🎯 Napastnik'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Informacje dodatkowe */}
      <div className="mt-6 pt-4 border-t text-center text-sm text-gray-500">
        <div className="flex items-center justify-center space-x-4">
          <span>🧤 Bramkarz</span>
          <span>🛡️ Obrona</span>
          <span>⚽ Pomoc</span>
          <span>🎯 Atak</span>
        </div>
        <div className="mt-2">
          Składy potwierdzone przez {homeLineup?.team.name} i {awayLineup?.team.name}
        </div>
      </div>
    </div>
  );
};