import React from 'react';

export const WeatherInfo = ({ weather }) => {
  if (!weather) return null;

  const getWeatherIcon = (condition) => {
    const iconMap = {
      'clear': '☀️',
      'clouds': '☁️',
      'rain': '🌧️',
      'snow': '❄️',
      'thunderstorm': '⛈️',
      'drizzle': '🌦️',
      'mist': '🌫️',
      'fog': '🌫️'
    };
    
    return iconMap[condition] || '🌤️';
  };

  const getWindDirection = (degrees) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold mb-4 flex items-center">
        🌤️ Warunki pogodowe
      </h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-4xl mb-2">
            {getWeatherIcon(weather.weather?.[0]?.main?.toLowerCase())}
          </div>
          <div className="text-2xl font-bold text-gray-800">
            {Math.round(weather.temp)}°C
          </div>
          <div className="text-sm text-gray-600 capitalize">
            {weather.weather?.[0]?.description}
          </div>
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Odczuwalna:</span>
            <span className="font-semibold">{Math.round(weather.feels_like)}°C</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Wilgotność:</span>
            <span className="font-semibold">{weather.humidity}%</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Ciśnienie:</span>
            <span className="font-semibold">{weather.pressure} hPa</span>
          </div>
          
          {weather.wind_speed && (
            <div className="flex justify-between">
              <span className="text-gray-600">Wiatr:</span>
              <span className="font-semibold">
                {Math.round(weather.wind_speed * 3.6)} km/h {getWindDirection(weather.wind_deg)}
              </span>
            </div>
          )}
          
          <div className="flex justify-between">
            <span className="text-gray-600">Widoczność:</span>
            <span className="font-semibold">
              {weather.visibility ? `${weather.visibility / 1000} km` : 'Brak danych'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Wpływ na grę */}
      <div className="mt-4 pt-4 border-t">
        <div className="text-sm text-gray-600 mb-2">Wpływ na mecz:</div>
        <div className="flex flex-wrap gap-2">
          {weather.temp < 5 && (
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
              Niska temperatura
            </span>
          )}
          {weather.temp > 30 && (
            <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
              Wysoka temperatura
            </span>
          )}
          {weather.wind_speed > 5 && (
            <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
              Silny wiatr
            </span>
          )}
          {weather.humidity > 80 && (
            <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">
              Wysoka wilgotność
            </span>
          )}
          {weather.weather?.[0]?.main?.toLowerCase().includes('rain') && (
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
              Deszcz - śliska murawa
            </span>
          )}
        </div>
      </div>
    </div>
  );
};