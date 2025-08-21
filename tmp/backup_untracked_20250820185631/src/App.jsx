import React, { useState, useEffect, useRef } from 'react';
import { MatchList } from './components/MatchList';
import { MatchDetails } from './components/MatchDetails';
import { Header } from './components/Header';
import { AIAnalysis } from './components/AIAnalysis';
import MatchAnalysis from './components/MatchAnalysis';
import ResultsAnalysis from './components/ResultsAnalysis';
import './App.css';

function App() {
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('today'); // 'today' lub 'upcoming'
  const [activeTab, setActiveTab] = useState('matches'); // 'matches', 'analysis', 'results'

  // Toggle to enable/disable automatic AI analysis (persisted in localStorage)
  const [aiEnabled, setAiEnabled] = useState(() => {
    try {
      const v = localStorage.getItem('aiEnabled');
      return v === null ? true : v === 'true';
    } catch (e) {
      return true;
    }
  });

  const toggleAi = () => {
    setAiEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('aiEnabled', String(next)); } catch (e) {}
      // Increment runId to cancel any in-flight streaming when toggling AI
      try { runIdRef.current = (runIdRef.current || 0) + 1; } catch(e) {}
      return next;
    });
  };

  // Keep a ref to the current aiEnabled value so long-running async loops can read latest state
  const aiEnabledRef = useRef(aiEnabled);
  useEffect(() => {
    aiEnabledRef.current = aiEnabled;
  }, [aiEnabled]);

  // Run-id to cancel in-flight streaming analyses when user toggles AI off or a new fetch starts
  const runIdRef = useRef(0);
  const isAnalyzingRef = useRef(false);

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async (mode = viewMode) => {
    try {
      setLoading(true);
      const endpoint = mode === 'today' ? '/api/betting/fixtures/today' : '/api/betting/fixtures/upcoming';
      const response = await fetch(endpoint);
      const data = await response.json();
      
      if (data.success) {
        const initialMatches = data.data.map(match => ({
          ...match,
          aiAnalysis: match.aiAnalysis || null, // Use server-provided stored analysis if present
          analyzing: false
        }));
        
        setMatches(initialMatches);
        
        // Jeśli to dzisiejsze mecze, rozpocznij streaming analizę AI (tylko jeśli AI włączone)
        if (mode === 'today' && aiEnabledRef.current) {
          startStreamingAnalysis(initialMatches);
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Błąd połączenia z serwerem');
    } finally {
      setLoading(false);
    }
  };

  const startStreamingAnalysis = async (matchesToAnalyze) => {
    // Increment run id for this streaming session and capture locally
    runIdRef.current = (runIdRef.current || 0) + 1;
    const myRunId = runIdRef.current;
    isAnalyzingRef.current = true;

    // If AI is disabled by user, skip analyses entirely
    if (!aiEnabledRef.current) {
      console.log('❌ Automatyczna analiza AI wyłączona — pomijam analizę meczów');
      isAnalyzingRef.current = false;
      return;
    }

    console.log('🚀 Rozpoczynam streaming analizę AI dla', matchesToAnalyze.length, 'meczów');
    
    for (let i = 0; i < matchesToAnalyze.length; i++) {
      // If user turned AI off or a new run started while streaming, stop further processing
      if (!aiEnabledRef.current || runIdRef.current !== myRunId) {
        console.log('⏸️ Analiza AI została wyłączona lub anulowana — przerywam dalsze analizy');
        // Clear analyzing flag for remaining matches
        setMatches(prev => prev.map(m => ({ ...m, analyzing: false })));
        break;
      }

      const match = matchesToAnalyze[i];
      
      try {
        // Oznacz mecz jako analizowany
        setMatches(prevMatches => 
          prevMatches.map(m => 
            m.fixture.id === match.fixture.id 
              ? { ...m, analyzing: true }
              : m
          )
        );

        console.log(`🤖 Analizuję mecz ${i + 1}/${matchesToAnalyze.length}: ${match.teams.home.name} vs ${match.teams.away.name}`);

        const response = await fetch(`/api/betting/fixtures/${match.fixture.id}/analyze`);
        const analysisData = await response.json();

        if (analysisData.success) {
          // Zaktualizuj mecz z wynikami analizy
          setMatches(prevMatches => 
            prevMatches.map(m => 
              m.fixture.id === match.fixture.id 
                ? { 
                    ...m, 
                    aiAnalysis: analysisData.data.aiAnalysis,
                    analyzing: false
                  }
                : m
            )
          );
          
          console.log(`✅ Analiza zakończona dla: ${match.teams.home.name} vs ${match.teams.away.name}`);
        } else {
          // Oznacz jako błąd analizy
          setMatches(prevMatches => 
            prevMatches.map(m => 
              m.fixture.id === match.fixture.id 
                ? { ...m, analyzing: false, aiAnalysis: { error: true } }
                : m
            )
          );
        }

        // Opóźnienie między analizami
        if (i < matchesToAnalyze.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`❌ Błąd analizy dla meczu ${match.fixture.id}:`, error);
        setMatches(prevMatches => 
          prevMatches.map(m => 
            m.fixture.id === match.fixture.id 
              ? { ...m, analyzing: false, aiAnalysis: { error: true } }
              : m
          )
        );
      }
    }
    
    console.log('🎉 Wszystkie analizy AI zakończone!');
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    fetchMatches(mode);
  };

  const handleMatchSelect = (match) => {
    setSelectedMatch(match);
  };

  const handleBackToList = () => {
    setSelectedMatch(null);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Nawigacja zakładek */}
        <nav className="nav-tabs mb-6">
          <button 
            className={`nav-tab ${activeTab === 'matches' ? 'active' : ''}`}
            onClick={() => setActiveTab('matches')}
          >
            🏟️ Mecze
          </button>
          <button 
            className={`nav-tab ${activeTab === 'analysis' ? 'active' : ''}`}
            onClick={() => setActiveTab('analysis')}
          >
            🤖 Analiza AI
          </button>
          <button 
            className={`nav-tab ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveTab('results')}
          >
            📊 Analiza Wyników
          </button>
        </nav>

        {/* Zawartość zakładek */}
        <div className="tab-content">
          {activeTab === 'matches' && (
            selectedMatch ? (
              <MatchDetails 
                match={selectedMatch} 
                onBack={handleBackToList}
              />
            ) : (
              <MatchList 
                matches={matches}
                loading={loading}
                error={error}
                viewMode={viewMode}
                onMatchSelect={handleMatchSelect}
                onRefresh={() => fetchMatches()}
                onViewModeChange={handleViewModeChange}
                aiEnabled={aiEnabled}
                toggleAi={toggleAi}
              />
            )
          )}
          
          {activeTab === 'analysis' && (
            selectedMatch ? (
              <MatchDetails match={selectedMatch} onBack={handleBackToList} />
            ) : matches && matches.length > 0 ? (
              <AIAnalysis match={matches[0]} />
            ) : (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
                Wybierz mecz z listy, aby zobaczyć analizę.
              </div>
            )
          )}
          {activeTab === 'results' && <ResultsAnalysis />}
        </div>
      </main>
    </div>
  );
}

export default App;
