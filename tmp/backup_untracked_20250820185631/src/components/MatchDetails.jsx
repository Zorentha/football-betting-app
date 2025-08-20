import React, { useState, useEffect } from 'react';
import { TeamForm } from './TeamForm';
import { LineupDisplay } from './LineupDisplay';
import { WeatherInfo } from './WeatherInfo';
import MatchAnalysis from './MatchAnalysis';
import { MatchInsights } from './MatchInsights';
import { AIAnalysis } from './AIAnalysis';

export const MatchDetails = ({ match, onBack }) => {
  const [detailedData, setDetailedData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMatchDetails();
  }, [match.fixture.id]);

  const fetchMatchDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/betting/fixtures/${match.fixture.id}`);
      const data = await response.json();
      
      if (data.success) {
        setDetailedData(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Błąd pobierania szczegółów meczu');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('pl-PL', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    };
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        <span className="ml-4 text-gray-600">Ładowanie szczegółów meczu...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">❌ {error}</div>
        <button 
          onClick={onBack}
          className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700"
        >
          Powrót do listy
        </button>
      </div>
    );
  }

  const { date, time } = formatDate(match.fixture.date);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <button 
          onClick={onBack}
          className="mb-4 text-green-600 hover:text-green-700 flex items-center space-x-2"
        >
          <span>←</span>
          <span>Powrót do listy</span>
        </button>

        <div className="text-center">
          <div className="text-sm text-gray-600 mb-2">
            {match.league.name} • {date} • {time}
          </div>
          
          <div className="flex items-center justify-center space-x-8 mb-4">
            <div className="text-center">
              <img 
                src={match.teams.home.logo} 
                alt={match.teams.home.name}
                className="w-16 h-16 mx-auto mb-2"
              />
              <h2 className="text-xl font-bold">{match.teams.home.name}</h2>
            </div>
            
            <div className="text-2xl font-bold text-gray-400">VS</div>
            
            <div className="text-center">
              <img 
                src={match.teams.away.logo} 
                alt={match.teams.away.name}
                className="w-16 h-16 mx-auto mb-2"
              />
              <h2 className="text-xl font-bold">{match.teams.away.name}</h2>
            </div>
          </div>

          <div className="text-gray-600">
            📍 {match.fixture.venue.name}, {match.fixture.venue.city}
          </div>
        </div>
      </div>

      {detailedData && (
        <div className="space-y-6">
          {/* TYLKO Analiza AI */}
          <AIAnalysis match={match} />

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Forma drużyn */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold mb-4">Ostatnia forma</h3>
              <div className="space-y-4">
                <TeamForm 
                  team={match.teams.home}
                  form={detailedData.teamForm.home}
                  label="Gospodarze"
                />
                <TeamForm 
                  team={match.teams.away}
                  form={detailedData.teamForm.away}
                  label="Goście"
                />
              </div>
            </div>

            {/* Pogoda */}
            {detailedData.weather && (
              <WeatherInfo weather={detailedData.weather} />
            )}

            {/* Składy */}
            {detailedData.lineups.length > 0 && (
              <div className="lg:col-span-2">
                <LineupDisplay lineups={detailedData.lineups} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
