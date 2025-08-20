import React from 'react';

export const Header = () => {
  return (
    <header className="bg-green-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="text-2xl">⚽</div>
            <div>
              <h1 className="text-2xl font-bold">Football Betting</h1>
              <p className="text-green-100">Profesjonalne analizy meczów</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm text-green-100">Dane na żywo</div>
              <div className="text-xs text-green-200">API-Football</div>
            </div>
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>
    </header>
  );
};