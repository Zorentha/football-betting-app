import axios from 'axios';
import dotenv from 'dotenv';

// Załaduj zmienne środowiskowe
dotenv.config();

class FootballDataService {
  constructor() {
    this.apiKey = process.env.API_FOOTBALL_KEY;
    this.baseUrl = process.env.API_FOOTBALL_BASE_URL;
    console.log('API Config:', { apiKey: this.apiKey ? 'SET' : 'NOT SET', baseUrl: this.baseUrl });
    this.headers = {
      'x-rapidapi-key': this.apiKey,
      'x-rapidapi-host': 'v3.football.api-sports.io'
    };
  }

  // KROK A: Pobierz nadchodzące mecze z top lig
  async getUpcomingFixtures(leagueIds = [
    2,   // UEFA Champions League
    3,   // UEFA Europa League
    4,   // UEFA Conference League
    39,  // Premier League
    140, // La Liga
    78,  // Bundesliga
    135, // Serie A
    61,  // Ligue 1
    106, // Ekstraklasa (Poland)
    848, // UEFA Champions League Qualifiers
    849, // UEFA Europa League Qualifiers
    850, // UEFA Conference League Qualifiers
    81,  // DFB Pokal
    137, // Coppa Italia
    143, // Copa del Rey
    48,  // FA Cup
    66   // Coupe de France
  ]) {
    try {
      const fixtures = [];
      const currentSeason = new Date().getFullYear();
      
      for (const leagueId of leagueIds) {
        const response = await axios.get(`${this.baseUrl}/fixtures`, {
          headers: this.headers,
          params: {
            timezone: 'Europe/Warsaw',
            league: leagueId,
            season: currentSeason,
            status: 'NS', // nadchodzące mecze
            next: 20 // następne 20 meczów
          }
        });
        
        if (response.data.response) {
          fixtures.push(...response.data.response);
        }
      }
      
      return fixtures;
    } catch (error) {
      console.error('Błąd pobierania nadchodzących meczów:', error);
      throw error;
    }
  }

  // Pobierz mecze z dzisiaj i najbliższych dni
  async getTodayFixtures() {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      // Pobierz mecze nadchodzące i w trakcie
      const [upcomingResponse, liveResponse] = await Promise.all([
        // Mecze nadchodzące (Not Started)
        axios.get(`${this.baseUrl}/fixtures`, {
          headers: this.headers,
          params: {
            timezone: 'Europe/Warsaw',
            date: todayStr,
            status: 'NS'
          }
        }),
        // Mecze w trakcie (Live)
        axios.get(`${this.baseUrl}/fixtures`, {
          headers: this.headers,
          params: {
            timezone: 'Europe/Warsaw',
            live: 'all'
          }
        })
      ]);
      
      const allFixtures = [
        ...(upcomingResponse.data.response || []),
        ...(liveResponse.data.response || [])
      ];
      
      if (allFixtures.length > 0) {
        // Filtruj tylko ważne ligi
        const importantLeagues = [2, 3, 4, 39, 140, 78, 135, 61, 106, 848, 849, 850, 81, 137, 143, 48, 66];
        const filteredFixtures = allFixtures.filter(fixture => 
          importantLeagues.includes(fixture.league.id)
        );
        
        // Sortuj: mecze w trakcie na górze, potem nadchodzące
        return filteredFixtures.sort((a, b) => {
          const aIsLive = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT'].includes(a.fixture.status.short);
          const bIsLive = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT'].includes(b.fixture.status.short);
          
          if (aIsLive && !bIsLive) return -1;
          if (!aIsLive && bIsLive) return 1;
          
          // Jeśli oba są live lub oba nie są live, sortuj po dacie
          return new Date(a.fixture.date) - new Date(b.fixture.date);
        });
      }
      
      return [];
    } catch (error) {
      console.error('Błąd pobierania dzisiejszych meczów:', error);
      throw error;
    }
  }

  // Pobierz WSZYSTKIE mecze z dzisiaj (bez filtrowania lig) - do debugowania
  async getAllTodayFixtures() {
    try {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const todayStr = today.toISOString().split('T')[0];
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      console.log(`Pobieranie meczów z ${todayStr} do ${tomorrowStr}`);
      
      const response = await axios.get(`${this.baseUrl}/fixtures`, {
        headers: this.headers,
        params: {
          timezone: 'Europe/Warsaw',
          date: todayStr,
          status: 'NS'
        }
      });
      
      console.log(`API zwróciło ${response.data.response?.length || 0} meczów`);
      
      return response.data.response || [];
    } catch (error) {
      console.error('Błąd pobierania wszystkich dzisiejszych meczów:', error);
      throw error;
    }
  }

  // KROK B: Pobierz szczegóły meczu z line-ups i statystykami
  async getFixtureDetails(fixtureIds) {
    try {
      // Dziel na grupy po 20 (limit API)
      const chunks = this.chunkArray(fixtureIds, 20);
      const allDetails = [];

      for (const chunk of chunks) {
        const response = await axios.get(`${this.baseUrl}/fixtures`, {
          headers: this.headers,
          params: {
            ids: chunk.join(','),
            timezone: 'Europe/Warsaw'
          }
        });

        if (response.data.response) {
          allDetails.push(...response.data.response);
        }
      }

      return allDetails;
    } catch (error) {
      console.error('Błąd pobierania szczegółów meczów:', error);
      throw error;
    }
  }

  // Pobierz fixture po ID (pojedynczy) - używane przez routy aktualizacji wyników
  async getFixtureById(fixtureId) {
    try {
      const response = await axios.get(`${this.baseUrl}/fixtures`, {
        headers: this.headers,
        params: {
          timezone: 'Europe/Warsaw',
          ids: fixtureId
        }
      });

      return response.data.response && response.data.response.length ? response.data.response[0] : null;
    } catch (error) {
      console.error(`Błąd pobierania meczu ${fixtureId}:`, error.message);
      return null;
    }
  }

  // Pobierz line-upy dla meczu
  async getFixtureLineups(fixtureId) {
    try {
      const response = await axios.get(`${this.baseUrl}/fixtures/lineups`, {
        headers: this.headers,
        params: {
          fixture: fixtureId
        }
      });

      return response.data.response || [];
    } catch (error) {
      console.error('Błąd pobierania składów:', error);
      return [];
    }
  }

  // Pobierz statystyki zawodników dla meczu
  async getFixturePlayerStats(fixtureId) {
    try {
      const response = await axios.get(`${this.baseUrl}/fixtures/players`, {
        headers: this.headers,
        params: {
          fixture: fixtureId
        }
      });

      return response.data.response || [];
    } catch (error) {
      console.error('Błąd pobierania statystyk zawodników:', error);
      return [];
    }
  }

  // Pobierz zawodników drużyny z ich statystykami z sezonu
  async getTeamPlayers(teamId, season = new Date().getFullYear()) {
    try {
      const response = await axios.get(`${this.baseUrl}/players`, {
        headers: this.headers,
        params: {
          team: teamId,
          season: season
        }
      });

      return response.data.response || [];
    } catch (error) {
      console.error('Błąd pobierania zawodników drużyny:', error);
      return [];
    }
  }

  // KROK C: Historia formy drużyn (ostatnie 5 meczów)
  async getTeamForm(teamId) {
    try {
      const response = await axios.get(`${this.baseUrl}/fixtures`, {
        headers: this.headers,
        params: {
          team: teamId,
          last: 5,
          status: 'FT', // zakończone mecze
          timezone: 'Europe/Warsaw'
        }
      });

      if (response.data.response) {
        return this.processTeamForm(response.data.response, teamId);
      }
      
      return null;
    } catch (error) {
      console.error(`Błąd pobierania formy drużyny ${teamId}:`, error);
      throw error;
    }
  }

  // KROK D: Pobierz pogodę dla stadionu
  async getWeatherForVenue(lat, lon) {
    try {
      const weatherApiKey = process.env.OPENWEATHERMAP_API_KEY;
      if (!weatherApiKey) {
        console.warn('Brak klucza OpenWeatherMap API');
        return null;
      }

      const response = await axios.get('https://api.openweathermap.org/data/2.5/onecall', {
        params: {
          lat,
          lon,
          exclude: 'minutely,hourly,daily,alerts',
          units: 'metric',
          appid: weatherApiKey
        }
      });

      return response.data.current;
    } catch (error) {
      console.error('Błąd pobierania pogody:', error);
      return null;
    }
  }

  // Główna funkcja zbierająca wszystkie dane dla meczu
  async getCompleteMatchData(fixtureId) {
    try {
      console.log(`Pobieranie danych dla meczu ${fixtureId}`);
      
      // Pobierz szczegóły meczu
      const fixtureDetails = await this.getFixtureDetails([fixtureId]);

      // Jeśli nie znaleziono przez batchowe /fixtures (czasami API zwraca puste dla niektórych id),
      // spróbuj pobrać pojedynczy fixture przez getFixtureById jako fallback.
      let fixture = null;
      if (!fixtureDetails.length) {
        const single = await this.getFixtureById(fixtureId);
        if (!single) {
          console.warn(`Brak danych dla meczu ${fixtureId} (getFixtureDetails i fallback getFixtureById zwróciły puste).`);
          // Zwróć null aby caller mógł zdecydować jak postępować (nie wyrzucamy wyjątku tutaj).
          return null;
        }
        fixture = single;
      } else {
        fixture = fixtureDetails[0];
      }

      const homeTeamId = fixture.teams.home.id;
      const awayTeamId = fixture.teams.away.id;

      console.log(`Pobieranie formy dla drużyn: ${homeTeamId} vs ${awayTeamId}`);

      // Pobierz formę obu drużyn, składy i statystyki zawodników
      const [homeForm, awayForm, lineups, playerStats, homePlayers, awayPlayers] = await Promise.all([
        this.getTeamForm(homeTeamId),
        this.getTeamForm(awayTeamId),
        this.getFixtureLineups(fixtureId),
        this.getFixturePlayerStats(fixtureId),
        this.getTeamPlayers(homeTeamId),
        this.getTeamPlayers(awayTeamId)
      ]);

      // Pobierz pogodę jeśli są współrzędne stadionu
      let weather = null;
      if (fixture.fixture.venue?.lat && fixture.fixture.venue?.lon) {
        weather = await this.getWeatherForVenue(
          fixture.fixture.venue.lat,
          fixture.fixture.venue.lon
        );
      }

      console.log(`Dane pobrane pomyślnie. Forma gospodarzy: ${homeForm?.length || 0} meczów`);

      return {
        fixture: fixture.fixture,
        teams: fixture.teams,
        lineups: lineups || [],
        statistics: [],
        players: playerStats || [],
        teamPlayers: {
          home: homePlayers || [],
          away: awayPlayers || []
        },
        teamForm: {
          home: homeForm,
          away: awayForm
        },
        weather
      };
    } catch (error) {
      console.error('Błąd pobierania kompletnych danych meczu:', error);
      throw error;
    }
  }

  // Funkcje pomocnicze
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  processTeamForm(fixtures, teamId) {
    return fixtures.map(fixture => {
      const isHome = fixture.teams.home.id === teamId;
      const team = isHome ? fixture.teams.home : fixture.teams.away;
      const opponent = isHome ? fixture.teams.away : fixture.teams.home;
      
      let result = 'D'; // Draw
      if (team.winner === true) result = 'W'; // Win
      if (team.winner === false) result = 'L'; // Loss

      return {
        date: fixture.fixture.date,
        opponent: opponent.name,
        result,
        goalsFor: fixture.goals[isHome ? 'home' : 'away'],
        goalsAgainst: fixture.goals[isHome ? 'away' : 'home'],
        venue: isHome ? 'H' : 'A'
      };
    });
  }

  // Aktualizacja danych (wywoływana przez cron)
  async updateUpcomingFixtures() {
    try {
      const fixtures = await this.getUpcomingFixtures();
      console.log(`Pobrano ${fixtures.length} nadchodzących meczów`);
      
      // Tu możesz dodać logikę zapisywania do bazy danych
      // lub cache'owania danych
      
      return fixtures;
    } catch (error) {
      console.error('Błąd aktualizacji danych:', error);
      throw error;
    }
  }

  // Pobierz zakończone mecze z ostatnich dni
  async getFinishedMatches(days = 7) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      console.log(`Pobieranie zakończonych meczów z ${startDateStr} do ${endDateStr}`);

      const response = await axios.get(`${this.baseUrl}/fixtures`, {
        headers: this.headers,
        params: {
          timezone: 'Europe/Warsaw',
          from: startDateStr,
          to: endDateStr,
          status: 'FT' // Tylko zakończone mecze
        }
      });

      if (response.data.response) {
        // Filtruj tylko ważne ligi
        const importantLeagues = [2, 3, 4, 39, 140, 78, 135, 61, 106, 848, 849, 850, 81, 137, 143, 48, 66];
        const filteredMatches = response.data.response.filter(fixture => 
          importantLeagues.includes(fixture.league.id)
        );

        console.log(`Znaleziono ${filteredMatches.length} zakończonych meczów z ważnych lig`);
        return filteredMatches;
      }

      return [];
    } catch (error) {
      console.error('Błąd pobierania zakończonych meczów:', error.message);
      return [];
    }
  }
}

export { FootballDataService };
export const footballDataService = new FootballDataService();
