import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { databaseService } from './databaseService.js';

class OpenAIAnalysisService {
  constructor() {
    this.openai = null;
    this.analysisCache = new Map(); // Cache dla analiz

    // Prostym limiter tokenów - śledzi użycie tokenów w ostatniej minucie
    // i rezerwuje przewidywaną liczbę tokenów przed wysłaniem zapytania do OpenAI.
    this.tokenLimitPerMinute = 30000;
    // expectedOutputTokens can be configured via environment variable OPENAI_EXPECTED_OUTPUT_TOKENS.
    // If not set, leave undefined to avoid imposing a hidden cap on model output size.
    this.expectedOutputTokens = (typeof process.env.OPENAI_EXPECTED_OUTPUT_TOKENS !== 'undefined' && process.env.OPENAI_EXPECTED_OUTPUT_TOKENS !== '') ? Number(process.env.OPENAI_EXPECTED_OUTPUT_TOKENS) : undefined;
    this.tokenUsage = []; // { timestamp: ms, tokens: number }
  }

  // Oszacowanie tokenów na podstawie długości tekstu (przybliżenie: ~4 znaki/token)
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  // Bezpieczne wyciągnięcie tekstu z różnych formatów odpowiedzi OpenAI
  // Obsługuje: responses.create (output_text), legacy chat completions (choices[0].message.content),
  // oraz choices[0].text. Zwraca pusty string jeśli nic nie znaleziono.
  getResponseText(resp) {
    if (!resp) return '';
    // responses.create zwykle ma pole output_text
    if (typeof resp.output_text === 'string' && resp.output_text.trim().length > 0) {
      return resp.output_text;
    }
    // Nowa struktura responses może zawierać output array
    if (Array.isArray(resp.output) && resp.output.length > 0) {
      // output items may have content array with text segments
      try {
        const out = resp.output.map(o => {
          if (typeof o === 'string') return o;
          if (o?.content && Array.isArray(o.content)) {
            return o.content.map(c => c?.text || '').join('');
          }
          return JSON.stringify(o);
        }).join('\n');
        if (out.trim().length > 0) return out;
      } catch (e) {
        // fallback to other checks
      }
    }
    // Chat completions style (choices[0].message.content)
    if (resp.choices && Array.isArray(resp.choices) && resp.choices.length > 0) {
      const c0 = resp.choices[0];
      if (c0?.message?.content) return c0.message.content;
      if (typeof c0?.text === 'string') return c0.text;
    }
    // Fallback: try to stringify
    try {
      const s = JSON.stringify(resp);
      return s;
    } catch (e) {
      return '';
    }
  }

  // Bezpieczne parsowanie JSON z tekstu (usuwa fences i trimuje)
  safeParseJSONFromText(text) {
    if (!text || typeof text !== 'string') return null;
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      if (!cleaned) return null;
      return JSON.parse(cleaned);
    } catch (e) {
      // Jeśli nie uda się sparsować - zwróć null i pozwól callerowi użyć fallbacku
      return null;
    }
  }

  // Podziel długi tekst na kawałki bazując na przybliżonym limicie tokenów
  // Używane do analiz projektów / dużych plików, aby nie przekroczyć limitu TPM
  splitTextIntoChunks(text, maxInputTokens = 8000) {
    if (!text) return [];
    const approxCharsPerToken = 4;
    const maxChars = maxInputTokens * approxCharsPerToken;
    const chunks = [];
    let start = 0;
    const len = text.length;

    while (start < len) {
      let end = Math.min(start + maxChars, len);

      // Spróbuj podzielić w miejscu nowej linii (najbliżej końca)
      if (end < len) {
        const nl = text.lastIndexOf('\n', end);
        if (nl > start) end = nl;
      }

      const chunk = text.slice(start, end).trim();
      if (chunk.length > 0) chunks.push(chunk);
      // Jeśli nic się nie zmieniło (np. brak nowych linii), przełam na maxChars
      if (end === start) end = Math.min(start + maxChars, len);
      start = end;
    }

    return chunks;
  }

  // Apply temperature-scaling calibration and optional market blending
  applyCalibration(probs, calibrator = null, marketProbs = null, blendWeight = 0) {
    try {
      // Normalize incoming probabilities to fractions [0,1]
      const normalize = (p) => {
        const arr = [p.homeWin, p.draw, p.awayWin].map(v => (v === undefined || v === null) ? 0 : Number(v));
        const anyGT1 = arr.some(v => v > 1);
        const fracs = anyGT1 ? arr.map(v => v / 100) : arr;
        const s = fracs.reduce((a, b) => a + (isFinite(b) ? b : 0), 0) || 1;
        return fracs.map(v => (isFinite(v) ? v / s : 0));
      };

      let arr = normalize(probs);

      // Temperature-scaling if calibrator provided
      if (calibrator && typeof calibrator.temperature === 'number' && calibrator.temperature > 0) {
        const T = Number(calibrator.temperature);
        const logs = arr.map(p => Math.log(Math.max(p, 1e-12)));
        const scaled = logs.map(l => l / T);
        const maxS = Math.max(...scaled);
        const exps = scaled.map(s => Math.exp(s - maxS));
        const denom = exps.reduce((a, b) => a + b, 0) || 1;
        arr = exps.map(e => e / denom);
      }

      // Optional market blending (marketProbs as same shape as probs)
      if (marketProbs && blendWeight > 0) {
        const m = normalize(marketProbs);
        arr = arr.map((v, i) => blendWeight * v + (1 - blendWeight) * m[i]);
        const s = arr.reduce((a, b) => a + b, 0) || 1;
        arr = arr.map(v => v / s);
      }

      // Convert to integer percentages and correct rounding drift
      let ph = Math.round(arr[0] * 100);
      let pd = Math.round(arr[1] * 100);
      let pa = Math.round(arr[2] * 100);
      let sum = ph + pd + pa;
      const diff = 100 - sum;
      if (diff !== 0) {
        const maxIdx = arr.indexOf(Math.max(arr[0], arr[1], arr[2]));
        if (maxIdx === 0) ph += diff;
        else if (maxIdx === 1) pd += diff;
        else pa += diff;
      }

      return { homeWin: ph, draw: pd, awayWin: pa };
    } catch (e) {
      // On error, return original shape coerced to integers (best-effort)
      try {
        const fallback = {
          homeWin: Math.round(Number(probs.homeWin) || 0),
          draw: Math.round(Number(probs.draw) || 0),
          awayWin: Math.round(Number(probs.awayWin) || 0)
        };
        const s = fallback.homeWin + fallback.draw + fallback.awayWin || 1;
        // normalize to sum 100
        fallback.homeWin = Math.round((fallback.homeWin / s) * 100);
        fallback.draw = Math.round((fallback.draw / s) * 100);
        fallback.awayWin = 100 - fallback.homeWin - fallback.draw;
        return fallback;
      } catch (ee) {
        return probs;
      }
    }
  }

  // Wykonaj wywołanie OpenAI z budżetowaniem tokenów i timeoutem (globalny helper)
  async openAIRequest(inputText, model = 'gpt-5', seed = null, timeoutMs = 30000 /*, temperature = 0.2 */) {
    const openai = this.getOpenAI();
    if (!openai) throw new Error('OpenAI client not available');

    // Szacowanie i ograniczenie rezerwacji tokenów (zapobiega blokowaniu się zbyt dużymi estymacjami)
    let est = this.estimateTokens(inputText) + (Number.isFinite(this.expectedOutputTokens) ? this.expectedOutputTokens : 0);
    const MAX_ESTIMATE = 20000;
    if (est > MAX_ESTIMATE) {
      console.warn(`⚠️ Szacowana liczba tokenów (${est}) przekracza limit ${MAX_ESTIMATE} — przycinam do ${MAX_ESTIMATE}`);
      est = MAX_ESTIMATE;
    }
    console.log(`ℹ️ Szacowane tokeny dla zapytania: ${est} (timeoutMs=${timeoutMs}ms)`);

    await this.waitForTokenBudget(est);
    this.recordTokenUsage(est);

    // Używamy AbortController do bezpiecznego przerwania requestu po timeoutie
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timeoutHandle = null;
    if (controller) {
      timeoutHandle = setTimeout(() => {
        // aborcja requestu gdy przekroczony timeout
        try { controller.abort(); } catch (e) { /* ignore */ }
      }, timeoutMs);
    } else {
      // fallback: logujemy że brak AbortController
      console.warn('⚠️ AbortController not available in this environment — relying on Promise.race timeout fallback.');
    }

    try {
      // Jeśli SDK obsługuje przekazanie signal jako drugi argument - przekazujemy
      // Struktura: openai.responses.create(params, { signal })
      const createArgs = controller ? { signal: controller.signal } : undefined;
      const response = await (createArgs ? openai.responses.create({ model, input: inputText }, createArgs) : openai.responses.create({ model, input: inputText }));

      return response;
    } catch (err) {
      // Normalize timeout/abort errors to consistent message
      const msg = err && err.message ? err.message : String(err);
      if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout')) {
        throw new Error('OpenAI timeout - exceeded ' + timeoutMs + 'ms');
      }
      throw err;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  // Wykonaj sekwencyjne wywołania dla dużego tekstu:
  // 1) Podziel tekst na kawałki
  // 2) Dla każdego kawałka poproś model o krótkie podsumowanie JSON (perChunkInstruction)
  // 3) Połącz podsumowania i wyślij końcowe polecenie syntezy (synthesizePromptTemplate zawiera {{summaries}})
  async callOpenAIWithChunking(fullText, synthesizePromptTemplate, options = {}) {
    const {
      maxInputTokens = 8000,
      perChunkInstruction = 'Summarize this chunk in a compact JSON with keys: summary, issues (each max 100 chars). Return JSON only.',
      perChunkModel = 'gpt-5',
      synthesizeModel = 'gpt-5'
    } = options;

    const chunks = this.splitTextIntoChunks(fullText, maxInputTokens);
    const summaries = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkHeader = `CHUNK ${i + 1}/${chunks.length}`;
      const input = `${perChunkInstruction}\n\n${chunkHeader}\n\n${chunks[i]}`;
      try {
        const resp = await this.openAIRequest(input, perChunkModel, this.generateUniqueSeed('chunk', String(i)));
        const txt = this.getResponseText(resp);
        const cleaned = (txt || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        summaries.push(cleaned);
      } catch (err) {
        // W wypadku błędu dla jednego kawałka, zapisz informację i kontynuuj
        summaries.push(JSON.stringify({ error: err.message }));
      }
    }

    // Połącz podsumowania i wykonaj końcową syntezę
    const combined = summaries.join('\n\n');
    const synthPrompt = synthesizePromptTemplate.replace('{{summaries}}', combined);

    const finalResp = await this.openAIRequest(synthPrompt, synthesizeModel, this.generateUniqueSeed('synth', '0'));
    return finalResp;
  }

  // Zarejestruj użycie tokenów (rezerwacja)
  recordTokenUsage(tokens) {
    const now = Date.now();
    this.tokenUsage.push({ timestamp: now, tokens });
    // usuń wpisy starsze niż 61 sekund
    const cutoff = now - 61_000;
    this.tokenUsage = this.tokenUsage.filter(u => u.timestamp >= cutoff);
  }

  // Zwróć ile tokenów użyto w ostatniej minucie
  getTokensUsedLastMinute() {
    const now = Date.now();
    const cutoff = now - 60_000;
    return this.tokenUsage.reduce((sum, u) => u.timestamp >= cutoff ? sum + u.tokens : sum, 0);
  }

  // Poczekaj aż będzie wystarczająca pula tokenów (proste.sleep z pollingiem)
  async waitForTokenBudget(tokensNeeded) {
    const pollInterval = 500; // ms
    const maxAttempts = 120; // do ~1 min
    let attempts = 0;
    while (attempts < maxAttempts) {
      const used = this.getTokensUsedLastMinute();
      const available = Math.max(0, this.tokenLimitPerMinute - used);
      if (available >= tokensNeeded) {
        return;
      }
      // poczekaj i spróbuj ponownie
      await new Promise(r => setTimeout(r, pollInterval));
      attempts++;
    }
    // Jeśli nie uzyskamy budżetu w 1 minucie, pozwól przejść dalej (będzie błąd z OpenAI),
    // ale rejestrujemy dalej aby nie blokować niekończąco.
    console.warn('Brak dostępnego budżetu tokenów po odczekaniu - kontynuuję (ryzyko błędu limitu).');
  }

  // Przytnij matchData, aby znacząco zmniejszyć prompt (ogranicza formę, pojedynki i top graczy)
  trimMatchDataToFit(matchData, { maxForm = 3, maxMatchups = 6, maxTopPlayers = 3 } = {}) {
    try {
      if (matchData.teamForm) {
        if (Array.isArray(matchData.teamForm.home) && matchData.teamForm.home.length > maxForm) {
          matchData.teamForm.home = matchData.teamForm.home.slice(0, maxForm);
        }
        if (Array.isArray(matchData.teamForm.away) && matchData.teamForm.away.length > maxForm) {
          matchData.teamForm.away = matchData.teamForm.away.slice(0, maxForm);
        }
      }
      if (Array.isArray(matchData.playerMatchups) && matchData.playerMatchups.length > maxMatchups) {
        matchData.playerMatchups = matchData.playerMatchups.slice(0, maxMatchups);
      }
      if (matchData.teamPlayers) {
        if (Array.isArray(matchData.teamPlayers.home) && matchData.teamPlayers.home.length > maxTopPlayers) {
          matchData.teamPlayers.home = matchData.teamPlayers.home.slice(0, maxTopPlayers);
        }
        if (Array.isArray(matchData.teamPlayers.away) && matchData.teamPlayers.away.length > maxTopPlayers) {
          matchData.teamPlayers.away = matchData.teamPlayers.away.slice(0, maxTopPlayers);
        }
      }
    } catch (e) {
      // Nie przerywamy procesu przy błędzie przycinania
      console.warn('Błąd podczas trimMatchDataToFit:', e.message);
    }
  }

  // Wyczyść cache analiz
  clearCache() {
    const cacheSize = this.analysisCache.size;
    this.analysisCache.clear();
    console.log(`🧹 Wyczyszczono cache analiz (${cacheSize} elementów)`);
    return cacheSize;
  }

  // Wyczyść cache dla konkretnego meczu
  clearMatchCache(homeTeamId, awayTeamId) {
    const cacheKey = `${homeTeamId}_${awayTeamId}`;
    const deleted = this.analysisCache.delete(cacheKey);
    console.log(`🧹 ${deleted ? 'Usunięto' : 'Nie znaleziono'} cache dla meczu ${cacheKey}`);
    return deleted;
  }

  // Analiza z niestandardowym promptem (dla komponentu ResultsAnalysis)
  async analyzeWithCustomPrompt(prompt, maxOutputTokens) {
    try {
      const openai = this.getOpenAI();

      if (!openai) {
        return 'Analiza AI niedostępna - brak klucza OpenAI. Użyj fallback analizy.';
      }

      // Użyj modelu gpt-5 przez helper openAIRequest, zwiększając timeout do 60s,
      // aby zmniejszyć ilość fallbacków lokalnych przy wolniejszych odpowiedziach.
      const systemInstruction = 'Jesteś ekspertem od analizy predykcji sportowych. Analizujesz dokładność predykcji AI i dajesz konstruktywne uwagi.';
      const input = `${systemInstruction}\n\n${prompt}`;

      // openAIRequest korzysta z budżetowania tokenów i mechanizmu timeoutu.
      // Zwiększamy timeout do 60s dla analiz niestandardowych.
      const resp = await this.openAIRequest(input, 'gpt-5', null, 60000);
      const text = this.getResponseText(resp);
      return text || '';
    } catch (error) {
      console.error('Błąd analizy OpenAI:', error);
      throw error;
    }
  }

  getOpenAI() {
    if (!this.openai) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.warn('OPENAI_API_KEY nie jest ustawiony - używam fallback analizy');
        return null;
      }
      this.openai = new OpenAI({
        apiKey: apiKey,
      });
    }
    return this.openai;
  }

  // Precyzyjne mapowanie pojedynków pozycyjnych
  getDetailedPositionMatchups() {
    return {
      // Bramkarz vs Napastnicy
      'Goalkeeper': {
        'G': ['F'] // Bramkarz vs wszystkie pozycje atakujące
      },
      
      // Obrona vs Atak
      'Defense_vs_Attack': {
        'LB': ['RW', 'RM'], // Lewy obrońca vs prawy skrzydłowy/pomocnik
        'LCB': ['ST', 'CF'], // Lewy środkowy obrońca vs napastnik
        'RCB': ['ST', 'CF'], // Prawy środkowy obrońca vs napastnik  
        'RB': ['LW', 'LM'], // Prawy obrońca vs lewy skrzydłowy/pomocnik
        'CB': ['ST', 'CF'] // Środkowy obrońca vs napastnik
      },
      
      // Pomocnicy vs Pomocnicy (środek pola)
      'Midfield_Battle': {
        'DM': ['DM', 'CM'], // Defensywny pomocnik vs defensywny/środkowy
        'CM': ['CM', 'DM'], // Środkowy pomocnik vs środkowy/defensywny
        'LM': ['RM', 'RB'], // Lewy pomocnik vs prawy pomocnik/obrońca
        'RM': ['LM', 'LB'], // Prawy pomocnik vs lewy pomocnik/obrońca
        'CAM': ['DM', 'CB'] // Ofensywny pomocnik vs defensywny pomocnik/obrońca
      },
      
      // Atak vs Obrona
      'Attack_vs_Defense': {
        'LW': ['RB', 'RCB'], // Lewy skrzydłowy vs prawy obrońca/środkowy
        'RW': ['LB', 'LCB'], // Prawy skrzydłowy vs lewy obrońca/środkowy
        'ST': ['CB', 'LCB', 'RCB'], // Napastnik vs środkowi obrońcy
        'CF': ['CB', 'LCB', 'RCB'] // Środkowy napastnik vs środkowi obrońcy
      }
    };
  }

  // Normalizuj pozycje do standardowego formatu
  normalizePosition(position) {
    // Bezpiecznie obsłuż różne kształty wejścia i wielkość liter
    const positionMap = {
      // Bramkarze
      'G': 'G', 'GK': 'G', 'GOALKEEPER': 'G', 'Goalkeeper': 'G',
      
      // Obrońcy
      'D': 'CB', 'DEFENDER': 'CB', 'Defender': 'CB',
      'LB': 'LB', 'LEFT-BACK': 'LB', 'Left-Back': 'LB',
      'RB': 'RB', 'RIGHT-BACK': 'RB', 'Right-Back': 'RB', 
      'CB': 'CB', 'CENTRE-BACK': 'CB', 'Centre-Back': 'CB',
      'LCB': 'LCB', 'RCB': 'RCB',
      
      // Pomocnicy
      'M': 'CM', 'MIDFIELDER': 'CM', 'Midfielder': 'CM',
      'DM': 'DM', 'DEFENSIVE MIDFIELD': 'DM', 'Defensive Midfield': 'DM',
      'CM': 'CM', 'CENTRAL MIDFIELD': 'CM', 'Central Midfield': 'CM',
      'LM': 'LM', 'LEFT MIDFIELD': 'LM', 'Left Midfield': 'LM',
      'RM': 'RM', 'RIGHT MIDFIELD': 'RM', 'Right Midfield': 'RM',
      'CAM': 'CAM', 'ATTACKING MIDFIELD': 'CAM', 'Attacking Midfield': 'CAM',
      
      // Napastnicy
      'F': 'ST', 'FORWARD': 'ST', 'Forward': 'ST', 'Attacker': 'ST',
      'ST': 'ST', 'STRIKER': 'ST', 'Striker': 'ST',
      'CF': 'CF', 'CENTRE-FORWARD': 'CF', 'Centre-Forward': 'CF',
      'LW': 'LW', 'LEFT WINGER': 'LW', 'Left Winger': 'LW',
      'RW': 'RW', 'RIGHT WINGER': 'RW', 'Right Winger': 'RW'
    };
    
    if (!position && position !== 0) return position;
    const posStr = String(position).trim();
    if (positionMap[posStr]) return positionMap[posStr];
    const upper = posStr.toUpperCase();
    if (positionMap[upper]) return positionMap[upper];
    // Fallback: return original trimmed string
    return posStr;
  }

  // Helper: ujednolicone pobranie obiektu zawodnika z różnych struktur (API różnie serializuje)
  getPlayerFromEntry(entry) {
    // entry może być:
    // - obiekt z polem player: { name, pos }
    // - bezpośrednio obiekt zawodnika { name, position, pos }
    // - struktura z statistics i player wewnątrz (API football-data)
    if (!entry) return { player: { name: 'Unknown', pos: '' }, raw: entry };

    let playerObj = null;
    if (entry.player && typeof entry.player === 'object') {
      playerObj = entry.player;
    } else if (entry.name && (entry.pos || entry.position)) {
      playerObj = entry;
    } else if (entry?.statistics && Array.isArray(entry.statistics) && entry.player) {
      playerObj = entry.player;
    } else {
      playerObj = entry.player || entry;
    }

    const name = playerObj?.name || playerObj?.fullname || 'Unknown';
    const pos = playerObj?.pos || playerObj?.position || playerObj?.role || '';
    return { player: { name, pos }, raw: entry };
  }

  // Dokładna analiza pojedynków pozycyjnych
  analyzeDetailedMatchups(homeLineup, awayLineup) {
    const matchups = [];

    // Grupuj zawodników według pozycji (używamy getPlayerFromEntry aby obsłużyć różne struktury)
    const homeByPosition = {};
    const awayByPosition = {};

    (homeLineup || []).forEach(entry => {
      const entryObj = this.getPlayerFromEntry(entry); // { player: { name, pos }, raw }
      const pos = this.normalizePosition(entryObj.player.pos || entryObj.player.position || '');
      if (!homeByPosition[pos]) homeByPosition[pos] = [];
      homeByPosition[pos].push(entryObj);
    });

    (awayLineup || []).forEach(entry => {
      const entryObj = this.getPlayerFromEntry(entry);
      const pos = this.normalizePosition(entryObj.player.pos || entryObj.player.position || '');
      if (!awayByPosition[pos]) awayByPosition[pos] = [];
      awayByPosition[pos].push(entryObj);
    });

    // Bramkarz vs Napastnicy
    if (homeByPosition['G'] && (awayByPosition['ST'] || awayByPosition['CF'])) {
      const gk = homeByPosition['G'][0];
      const strikers = [...(awayByPosition['ST'] || []), ...(awayByPosition['CF'] || [])];
      strikers.forEach(striker => {
        matchups.push({
          category: '🧤 Bramkarz vs Napastnik',
          homePlayer: `${gk.player.name} (BR)`,
          awayPlayer: `${striker.player.name} (NAP)`,
          description: `${gk.player.name} będzie bronił przeciw ${striker.player.name}`
        });
      });
    }

    // Obrona vs Atak
    const defenseAttackMatchups = [
      { home: 'LB', away: ['RW', 'RM'], desc: 'Lewy obrońca vs prawy skrzydłowy' },
      { home: 'LCB', away: ['ST', 'CF'], desc: 'Lewy środkowy obrońca vs napastnik' },
      { home: 'RCB', away: ['ST', 'CF'], desc: 'Prawy środkowy obrońca vs napastnik' },
      { home: 'CB', away: ['ST', 'CF'], desc: 'Środkowy obrońca vs napastnik' },
      { home: 'RB', away: ['LW', 'LM'], desc: 'Prawy obrońca vs lewy skrzydłowy' }
    ];

    defenseAttackMatchups.forEach(matchup => {
      const homeDefenders = homeByPosition[matchup.home] || [];
      const awayAttackers = matchup.away.flatMap(pos => awayByPosition[pos] || []);

      homeDefenders.forEach(defender => {
        awayAttackers.forEach(attacker => {
          matchups.push({
            category: '🔰 Obrona vs Atak',
            homePlayer: `${defender.player.name} (${matchup.home})`,
            awayPlayer: `${attacker.player.name} (${this.normalizePosition(attacker.player.pos || attacker.player.position || '')})`,
            description: matchup.desc
          });
        });
      });
    });

    // Pomocnicy vs Pomocnicy
    const midfieldMatchups = [
      { home: 'DM', away: ['DM'], desc: 'Defensywny pomocnik vs defensywny pomocnik' },
      { home: 'CM', away: ['CM'], desc: 'Środkowy pomocnik vs środkowy pomocnik' },
      { home: 'LM', away: ['RM'], desc: 'Lewy pomocnik vs prawy pomocnik' },
      { home: 'RM', away: ['LM'], desc: 'Prawy pomocnik vs lewy pomocnik' }
    ];

    midfieldMatchups.forEach(matchup => {
      const homeMids = homeByPosition[matchup.home] || [];
      const awayMids = matchup.away.flatMap(pos => awayByPosition[pos] || []);

      homeMids.forEach(homeMid => {
        awayMids.forEach(awayMid => {
          matchups.push({
            category: '⚔️ Środek pola',
            homePlayer: `${homeMid.player.name} (${matchup.home})`,
            awayPlayer: `${awayMid.player.name} (${this.normalizePosition(awayMid.player.pos || awayMid.player.position || '')})`,
            description: matchup.desc
          });
        });
      });
    });

    return matchups.slice(0, 20); // Ogranicz do 20 najważniejszych pojedynków (zwiększone, aby mieć więcej pojedynków)
  }

  // Generuj unikalny seed dla meczu (stabilny dla tego samego meczu)
  generateUniqueSeed(homeTeamName, awayTeamName) {
    // Użyj tylko nazw drużyn, bez Date.now() - żeby seed był stabilny
    const matchString = homeTeamName + awayTeamName + '2025';
    let hash = 0;
    for (let i = 0; i < matchString.length; i++) {
      const char = matchString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // Analizuj trendy bramkowe
  analyzeScoring(homeForm, awayForm) {
    const homeGoals = (homeForm && homeForm.length) ? homeForm.reduce((sum, m) => sum + (Number(m.goalsFor) || 0), 0) : 0;
    const awayGoals = (awayForm && awayForm.length) ? awayForm.reduce((sum, m) => sum + (Number(m.goalsFor) || 0), 0) : 0;
    const homeAgainst = (homeForm && homeForm.length) ? homeForm.reduce((sum, m) => sum + (Number(m.goalsAgainst) || 0), 0) : 0;
    const awayAgainst = (awayForm && awayForm.length) ? awayForm.reduce((sum, m) => sum + (Number(m.goalsAgainst) || 0), 0) : 0;
    
    const homeAvg = (homeForm && homeForm.length) ? homeGoals / homeForm.length : 0;
    const awayAvg = (awayForm && awayForm.length) ? awayGoals / awayForm.length : 0;
    const totalExpected = homeAvg + awayAvg;
    
    // Klasyfikuj style gry
    let homeScoring = homeAvg > 2 ? 'Wysoka skuteczność' : homeAvg > 1.5 ? 'Średnia skuteczność' : 'Niska skuteczność';
    let awayScoring = awayAvg > 2 ? 'Wysoka skuteczność' : awayAvg > 1.5 ? 'Średnia skuteczność' : 'Niska skuteczność';
    
    let gameStyle = totalExpected > 3.5 ? 'Ofensywny mecz' : 
                   totalExpected > 2.5 ? 'Zrównoważony mecz' : 'Defensywny mecz';
    
    let expectedGoals = totalExpected > 3.5 ? 'Powyżej 3.5' :
                       totalExpected > 2.5 ? '2.5-3.5' : 'Poniżej 2.5';
    
    return {
      homeScoring,
      awayScoring,
      expectedGoals,
      gameStyle
    };
  }

  // Oblicz szczegółowe statystyki drużyny
  calculateDetailedStats(teamForm) {
    if (!teamForm || teamForm.length === 0) {
      return {
        points: 0, winRate: 0, goalsFor: 0, goalsAgainst: 0,
        avgGoalsFor: 0, avgGoalsAgainst: 0, goalDifference: 0,
        homeForm: 'Brak danych', awayForm: 'Brak danych'
      };
    }

    const points = teamForm.reduce((sum, match) => 
      sum + (match.result === 'W' ? 3 : match.result === 'D' ? 1 : 0), 0
    );
    const wins = teamForm.filter(m => m.result === 'W').length;
    const goalsFor = teamForm.reduce((sum, match) => sum + match.goalsFor, 0);
    const goalsAgainst = teamForm.reduce((sum, match) => sum + match.goalsAgainst, 0);
    
    const homeMatches = teamForm.filter(m => m.venue === 'H');
    const awayMatches = teamForm.filter(m => m.venue === 'A');
    
    return {
      points,
      winRate: Math.round((wins / teamForm.length) * 100),
      goalsFor,
      goalsAgainst,
      avgGoalsFor: (goalsFor / teamForm.length).toFixed(1),
      avgGoalsAgainst: (goalsAgainst / teamForm.length).toFixed(1),
      goalDifference: goalsFor - goalsAgainst,
      homeForm: homeMatches.length > 0 ? homeMatches.map(m => m.result).join('') : 'Brak',
      awayForm: awayMatches.length > 0 ? awayMatches.map(m => m.result).join('') : 'Brak'
    };
  }

  // Przygotuj dane dla OpenAI
  prepareMatchData(homeTeam, awayTeam, homeForm, awayForm, lineups, playerStats, teamPlayers, weather) {
    const data = {
      match: {
        homeTeam: homeTeam.name,
        awayTeam: awayTeam.name,
        venue: 'home' // Gospodarze grają u siebie
      },
      teamForm: {
        home: homeForm.map(match => ({
          result: match.result,
          goalsFor: match.goalsFor,
          goalsAgainst: match.goalsAgainst,
          opponent: match.opponent,
          venue: match.venue
        })),
        away: awayForm.map(match => ({
          result: match.result,
          goalsFor: match.goalsFor,
          goalsAgainst: match.goalsAgainst,
          opponent: match.opponent,
          venue: match.venue
        }))
      },
      lineups: {
        home: [],
        away: []
      },
      teamPlayers: {
        home: teamPlayers?.home || [],
        away: teamPlayers?.away || []
      },
      weather: weather ? {
        temperature: weather.temp,
        conditions: weather.weather?.[0]?.main,
        windSpeed: weather.wind_speed
      } : null
    };

    // Ustal lineups.home/away bezpiecznie (obsługa różnych struktur) i sprawdź potwierdzenie
    const teamsMap = {};
    (lineups || []).forEach(l => {
      const id = l?.team?.id ?? l?.teamId ?? null;
      if (id) teamsMap[id] = teamsMap[id] || l;
    });

    // Spróbuj przypisać odpowiednie startXI dla home i away (fallbacky jeśli brak dokładnego dopasowania)
    const homeLineupEntry = teamsMap[homeTeam.id] || Object.values(teamsMap)[0] || null;
    const awayLineupEntry = teamsMap[awayTeam.id] || Object.values(teamsMap)[1] || Object.values(teamsMap)[0] || null;

    data.lineups.home = (homeLineupEntry && Array.isArray(homeLineupEntry.startXI)) ? homeLineupEntry.startXI : data.lineups.home;
    data.lineups.away = (awayLineupEntry && Array.isArray(awayLineupEntry.startXI)) ? awayLineupEntry.startXI : data.lineups.away;

    // Użyj zunifikowanej funkcji walidującej składy
    const hasConfirmed = this.hasConfirmedLineups(lineups);
    if (hasConfirmed && data.lineups.home.length > 0 && data.lineups.away.length > 0) {
      data.playerMatchups = this.analyzeDetailedMatchups(
        data.lineups.home,
        data.lineups.away
      );
    }

    return data;
  }

  // Sprawdź czy składy są potwierdzone
  hasConfirmedLineups(lineups) {
    if (!lineups || lineups.length === 0) {
      return false;
    }

    // Zbierz unikalne składy według team.id (różne API mogą używać różnych pól)
    const teamsMap = {};
    lineups.forEach(l => {
      const id = l?.team?.id ?? l?.teamId ?? null;
      if (id) teamsMap[id] = teamsMap[id] || l;
    });

    const teamIds = Object.keys(teamsMap);
    if (teamIds.length < 2) {
      // Nie mamy składów dla dwóch drużyn
      return false;
    }

    // Sprawdź czy dla co najmniej dwóch drużyn mamy startXI z min. 11 zawodnikami
    const validLineups = teamIds.map(id => teamsMap[id]).filter(l => Array.isArray(l.startXI) && l.startXI.length >= 11);
    if (validLineups.length < 2) {
      return false;
    }

    // Jeśli pola confirmed występują i są ustawione - wymagaj, żeby były true dla obu
    const confirmedFlagsPresent = validLineups.every(l => typeof l.confirmed !== 'undefined');
    if (confirmedFlagsPresent) {
      return validLineups.every(l => l.confirmed === true);
    }

    // W przeciwnym razie akceptuj, bo mamy kompletne składy (>=11)
    return true;
  }

  // Zapisz kompletną analizę do bazy danych
  async saveAnalysisToDatabase(fixtureId, matchData, aiAnalysis, lineups = []) {
    try {
      console.log(`💾 Rozpoczynam zapisywanie analizy meczu ${fixtureId} do bazy...`);
      console.log(`🔍 Stan bazy przed zapisem: isConnected=${databaseService.isConnected()}`);
      
      // Sprawdź czy składy są potwierdzone
      const hasLineups = this.hasConfirmedLineups(lineups);
      console.log(`👥 Składy potwierdzone: ${hasLineups ? 'TAK ✅' : 'NIE ❌'}`);
      
      if (!hasLineups) {
        console.log('⚠️ Składy nie są jeszcze potwierdzone - pomijam zapisywanie predykcji');
        console.log('📝 Predykcja zostanie zapisana gdy składy będą dostępne');
        return false;
      }
      
      // Sprawdź czy baza jest połączona
      if (!databaseService.isConnected()) {
        console.log('⚠️ Baza danych nie jest połączona, inicjalizuję...');
        await databaseService.initialize();
        console.log(`✅ Baza zainicjalizowana: isConnected=${databaseService.isConnected()}`);
      }
      
      // Zapisz podstawowe dane meczu
      console.log(`📝 Zapisuję dane meczu: ${matchData.teams.home.name} vs ${matchData.teams.away.name}`);
      await databaseService.saveMatch({
        fixture: { 
          id: fixtureId, 
          date: matchData.fixture?.date || new Date().toISOString(),
          venue: matchData.fixture?.venue,
          status: matchData.fixture?.status || { short: 'NS' }
        },
        teams: matchData.teams,
        league: matchData.league || { id: 0, name: 'Unknown' }
      });

      // Zapisz predykcję AI
      console.log(`🔮 Zapisuję predykcję AI...`);
      await databaseService.savePrediction(fixtureId, aiAnalysis);

      // Zapisz formę drużyn
      console.log(`📊 Zapisuję formę drużyn...`);
      await databaseService.saveTeamForm(
        fixtureId,
        matchData.teams.home,
        matchData.teams.away,
        matchData.teamForm.home,
        matchData.teamForm.away
      );

      // Zapisz pojedynki zawodników jeśli są składy
      if (matchData.playerMatchups && matchData.playerMatchups.length > 0) {
        await databaseService.savePlayerMatchups(fixtureId, matchData.playerMatchups);
      }

      // Zapisz statystyki sezonowe zawodników
      if (matchData.teamPlayers?.home && matchData.teamPlayers.home.length > 0) {
        await databaseService.savePlayerSeasonStats(
          matchData.teamPlayers.home, 
          matchData.teams.home.id, 
          matchData.teams.home.name
        );
      }
      
      if (matchData.teamPlayers?.away && matchData.teamPlayers.away.length > 0) {
        await databaseService.savePlayerSeasonStats(
          matchData.teamPlayers.away, 
          matchData.teams.away.id, 
          matchData.teams.away.name
        );
      }

      // Zapisz statystyki meczowe zawodników (jeśli dostępne)
      if (matchData.players && matchData.players.length > 0) {
        await databaseService.savePlayerMatchStats(fixtureId, matchData.players);
      }

      console.log(`💾 Zapisano kompletną analizę meczu ${fixtureId} do bazy danych`);
      return true;
    } catch (error) {
      console.error('❌ Błąd zapisywania analizy do bazy:', error);
      // Nie przerywamy - analiza i tak zostanie zwrócona
      return false;
    }
  }

  // Główna funkcja analizy OpenAI
  async analyzeMatch(homeTeam, awayTeam, homeForm, awayForm, lineups = [], playerStats = [], teamPlayers = {}, weather = null, fixtureId = null) {
    // Sprawdź cache (krótszy czas cache'owania)
    const cacheKey = `${homeTeam.id}_${awayTeam.id}`;
    const now = Date.now();
    
    if (this.analysisCache.has(cacheKey)) {
      const cached = this.analysisCache.get(cacheKey);
      // Cache ważny przez 10 minut
      if (now - cached.timestamp < 600000) {
        console.log('🎯 Używam cache dla:', homeTeam.name, 'vs', awayTeam.name);
        
        // Sprawdź czy dane są już w bazie, jeśli nie - zapisz
        if (fixtureId) {
          try {
            // Upewnij się, że baza jest połączona
            if (!databaseService.isConnected()) {
              await databaseService.initialize();
            }
            
            const existingMatch = await databaseService.db.get('SELECT * FROM matches WHERE fixture_id = ?', [fixtureId]);
            if (!existingMatch) {
              console.log('💾 Cache hit, ale brak danych w bazie - zapisuję...');
              const fullMatchData = {
                fixture: { date: new Date().toISOString(), status: { short: 'NS' } },
                teams: { home: homeTeam, away: awayTeam },
                league: { id: 0, name: 'Unknown' },
                teamForm: { home: homeForm, away: awayForm },
                playerMatchups: []
              };
              await this.saveAnalysisToDatabase(fixtureId, fullMatchData, cached.data);
            } else {
              console.log('✅ Dane już są w bazie dla meczu', fixtureId);
            }
          } catch (error) {
            console.error('❌ Błąd sprawdzania/zapisywania cache do bazy:', error);
          }
        }
        
        return cached.data;
      } else {
        // Usuń przestarzały cache
        this.analysisCache.delete(cacheKey);
      }
    }
    
    try {
      const openai = this.getOpenAI();
      
      // Jeśli brak OpenAI, użyj fallback
      if (!openai) {
        console.log('Używam fallback analizy - brak klucza OpenAI');
        const fallbackResult = this.getFallbackAnalysis(homeForm, awayForm, homeTeam.name, awayTeam.name);
        
        // Zapisz fallback do bazy jeśli podano fixtureId
        if (fixtureId) {
          console.log(`🎯 ZAPISUJĘ FALLBACK DO BAZY: fixtureId=${fixtureId}`);
          const fullMatchData = {
            fixture: { date: new Date().toISOString(), status: { short: 'NS' } },
            teams: { home: homeTeam, away: awayTeam },
            league: { id: 0, name: 'Unknown' },
            teamForm: { home: homeForm, away: awayForm },
            playerMatchups: []
          };
          await this.saveAnalysisToDatabase(fixtureId, fullMatchData, fallbackResult, lineups);
          console.log(`✅ FALLBACK ZAPISANY dla meczu ${fixtureId}`);
        }
        
        this.analysisCache.set(cacheKey, {
          data: fallbackResult,
          timestamp: Date.now()
        });
        return fallbackResult;
      }

      console.log('🤖 Rozpoczynam analizę GPT-5 dla meczu:', homeTeam.name, 'vs', awayTeam.name);
      console.log('📊 Forma gospodarzy:', homeForm.map(m => `${m.result}(${m.goalsFor}-${m.goalsAgainst})`).join(' '));
      console.log('📊 Forma gości:', awayForm.map(m => `${m.result}(${m.goalsFor}-${m.goalsAgainst})`).join(' '));
      
      // Sprawdź czy dane są różne
      const homePoints = homeForm.reduce((sum, match) => sum + (match.result === 'W' ? 3 : match.result === 'D' ? 1 : 0), 0);
      const awayPoints = awayForm.reduce((sum, match) => sum + (match.result === 'W' ? 3 : match.result === 'D' ? 1 : 0), 0);
      console.log('🏆 Punkty: Gospodarze', homePoints, 'vs Goście', awayPoints);

      const matchData = this.prepareMatchData(homeTeam, awayTeam, homeForm, awayForm, lineups, playerStats, teamPlayers, weather);
      
      // Dodaj unikalny seed na podstawie nazw drużyn i daty
      const uniqueSeed = this.generateUniqueSeed(homeTeam.name, awayTeam.name);
      matchData.uniqueMatchId = uniqueSeed;
      
      // Zbuduj kompaktowy summary-prompt i wykonaj 2-etapową analizę (summary + opcjonalny follow-up player-vs-player)
      console.log('📝 Przygotowuję 2-etapową analizę (summary + follow-up) dla', homeTeam.name, 'vs', awayTeam.name, '(seed:', uniqueSeed, ')');

      const systemInstruction = "You are a professional football analyst AI. Provide concise JSON responses.";


      // Helper do wywołań OpenAI z mechanizmem retry, exponental backoff i jitter
      const callOpenAI = async (inputText, seed, attempts = 5, baseTimeout = 60000, backoffFactor = 1.7, maxTimeout = 300000) => {
        // attempts: max prób, baseTimeout: początkowy timeout w ms
        // backoffFactor: mnożnik timeoutu przy każdej iteracji (exponential)
        // maxTimeout: górne ograniczenie timeoutu
        for (let i = 0; i < attempts; i++) {
          // oblicz timeout z wykorzystaniem exponental backoff i cap
          let timeout = Math.min(Math.round(baseTimeout * Math.pow(backoffFactor, i)), maxTimeout);
          // dodaj mały jitter aby rozproszyć jednoczesne retry (0..2000ms)
          const jitter = Math.round(Math.random() * 2000);
          timeout = timeout + jitter;
          try {
            console.log(`🔁 OpenAI call attempt ${i + 1}/${attempts} (timeout ${timeout}ms, jitter ${jitter}ms, seed ${seed})`);
            const resp = await this.openAIRequest(inputText, 'gpt-5', seed, timeout);
            return resp;
          } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            console.warn(`⚠️ OpenAI call failed (attempt ${i + 1}/${attempts}):`, msg);
            // Jeśli to było ostatnie podejście — przekaż dalej błąd
            if (i === attempts - 1) {
              console.error('❌ Ostateczna porażka wywołania OpenAI po wszystkich próbach.');
              throw err;
            }
            // Czekaj przed kolejnym retry (exponential backoff sleep z jitter)
            const sleepBase = Math.min(1000 * Math.pow(backoffFactor, i), 30000);
            const sleepJitter = Math.round(Math.random() * 1000);
            const sleepMs = sleepBase + sleepJitter;
            console.log(`⏱️ Czekam ${sleepMs}ms przed kolejną próbą...`);
            await new Promise(r => setTimeout(r, sleepMs));
          }
        }
      };

      // 1) Summary prompt (krótki, deterministyczny)
      const homeStats = this.calculateDetailedStats(matchData.teamForm.home);
      const awayStats = this.calculateDetailedStats(matchData.teamForm.away);
      const scoringTrend = this.analyzeScoring(matchData.teamForm.home, matchData.teamForm.away);

      const summaryPrompt = `Short summary analysis for ${matchData.match.homeTeam} vs ${matchData.match.awayTeam}.
Return ONLY compact JSON with keys: probabilities (homeWin, draw, awayWin as integers),
predictedScore { home, away }, confidence ("high"/"medium"/"low"), keyFactors (array short strings), bettingTips (array).

HOME summary:
points: ${homeStats.points}, avgGoals: ${homeStats.avgGoalsFor}, form: ${matchData.teamForm.home.map(m => m.result).join('')}
AWAY summary:
points: ${awayStats.points}, avgGoals: ${awayStats.avgGoalsFor}, form: ${matchData.teamForm.away.map(m => m.result).join('')}
SCORING TREND: ${scoringTrend.gameStyle}, expectedGoals: ${scoringTrend.expectedGoals}
Return JSON only.`;

      let fullSummaryInput = `${systemInstruction}\n\n${summaryPrompt}`;
      let summaryResponse;
      try {
        summaryResponse = await callOpenAI(fullSummaryInput, uniqueSeed);
      } catch (e) {
        console.error('❌ Błąd podczas wywołania OpenAI (summary):', e.message);
        summaryResponse = null;
      }

      let parsedResponse = null;

      if (summaryResponse) {
        try {
          const txt = this.getResponseText(summaryResponse);
          parsedResponse = this.safeParseJSONFromText(txt);
          if (!parsedResponse) {
            console.warn('⚠️ Nie udało się sparsować summary-response jako JSON (safeParseJSONFromText zwrócił null).');
          }
        } catch (e) {
          console.warn('⚠️ Nie udało się sparsować summary-response jako JSON:', e.message);
          parsedResponse = null;
        }
      }

      // Fallback do lokalnej analizy jeśli summary nie powiódł się
      if (!parsedResponse) {
        console.log('ℹ️ Używam fallback summary (lokalny) - brak poprawnej odpowiedzi z OpenAI');
        parsedResponse = this.getFallbackAnalysis(homeForm, awayForm, homeTeam.name, awayTeam.name);
      }

      // 2) Jeśli mamy potwierdzone składy / playerMatchups - wykonaj follow-up, który
      //    1) potwierdzi listę pojedynków oraz
      //    2) zwróci szczegółową, skoncentrowaną analizę każdego pojedynku (advantage + krótkie uzasadnienie)
      if (matchData.playerMatchups && matchData.playerMatchups.length > 0) {
        // Przytnij matchData, aby zapewnić, że model otrzyma wystarczającą liczbę pojedynków i statystyk
        this.trimMatchDataToFit(matchData, { maxForm: 5, maxMatchups: 20, maxTopPlayers: 5 });

        // Przygotuj dane pojedynków w czytelnej formie dla modelu
        const matchupsListText = matchData.playerMatchups.map((m, i) => {
          const desc = m.description ? ` - ${m.description}` : '';
          return `${i + 1}. ${m.category}: ${m.homePlayer} vs ${m.awayPlayer}${desc}`;
        }).join('\n');

        // Dodaj skrócone statystyki top graczy z obu drużyn, aby model miał konkretny materiał do analizy pojedynków
        const topHomeStats = this.formatTopPlayersStats(matchData.teamPlayers?.home || [], 'home');
        const topAwayStats = this.formatTopPlayersStats(matchData.teamPlayers?.away || [], 'away');

        const playersStatsText = `HOME TOP PLAYERS:\n${topHomeStats}\n\nAWAY TOP PLAYERS:\n${topAwayStats}`;

        const followupPrompt = `You previously returned match probabilities and a predicted score for ${matchData.match.homeTeam} vs ${matchData.match.awayTeam}.
Now produce a focused PLAYER-VS-PLAYER analysis and return ONLY JSON with two keys:
1) "playerMatchups" — an array of matchup objects { category, homePlayer, awayPlayer, description } (confirm or normalize the list provided).
2) "matchupAnalysis" — an array of objects with the same order as playerMatchups, each object: 
   { homePlayer, awayPlayer, category, advantage, analysis } 
   where:
     - advantage: one of ["home","away","even","uncertain"] indicating which side likely has advantage in the individual duel,
     - analysis: a 1-2 sentence concise reasoning in Polish (or the language of the rest of the analysis) focusing strictly on the duel and citing available player stats.
Important rules:
- Base the matchupAnalysis PRIMARILY on the confirmed lineups and the provided TOP PLAYER STATS below (use them to justify advantage).
- Keep each analysis 1-2 sentences and focus on strengths/weaknesses relevant to the duel.
- Return valid JSON only, with arrays in the same order as the provided matchups.
Here are the confirmed matchups (use them) and the top-player stats to justify per-duel reasoning:

${matchupsListText}

${playersStatsText}

Return JSON ONLY: { "playerMatchups": [...], "matchupAnalysis": [...] }`;

        const followupInput = `${systemInstruction}\n\n${followupPrompt}`;
        let followupResp = null;
        try {
          followupResp = await callOpenAI(followupInput, uniqueSeed + 1);
        } catch (e) {
          console.warn('⚠️ Follow-up playerMatchups failed:', e.message);
          followupResp = null;
        }

        if (followupResp) {
          try {
            const ftxt = this.getResponseText(followupResp);
            const followParsed = this.safeParseJSONFromText(ftxt);
            if (followParsed) {
              // Prefer explicit playerMatchups returned by the model, otherwise fall back to local
              if (Array.isArray(followParsed.playerMatchups) && followParsed.playerMatchups.length > 0) {
                parsedResponse.playerMatchups = followParsed.playerMatchups;
              } else {
                parsedResponse.playerMatchups = matchData.playerMatchups.slice(0, 20);
              }

              // Attach matchupAnalysis if present and array-shaped
              if (Array.isArray(followParsed.matchupAnalysis) && followParsed.matchupAnalysis.length > 0) {
                parsedResponse.matchupAnalysis = followParsed.matchupAnalysis;
              } else {
                // Build a simple local matchupAnalysis fallback based on available data
                parsedResponse.matchupAnalysis = (parsedResponse.playerMatchups || matchData.playerMatchups || []).map((m, idx) => ({
                  homePlayer: (m.homePlayer || m.homePlayer?.name) || (m.home_player_name || 'Unknown'),
                  awayPlayer: (m.awayPlayer || m.awayPlayer?.name) || (m.away_player_name || 'Unknown'),
                  category: m.category || 'Pojedynek',
                  advantage: 'uncertain',
                  analysis: (m.description && m.description.length > 0) ? m.description : 'Brak szczegółowych danych — analiza oparta na dostępnych informacjach.'
                }));
              }
            } else {
              // Jeśli nie można sparsować, wstaw fallbacky
              parsedResponse.playerMatchups = matchData.playerMatchups.slice(0, 20);
              parsedResponse.matchupAnalysis = parsedResponse.playerMatchups.map(m => ({
                homePlayer: m.homePlayer || 'Unknown',
                awayPlayer: m.awayPlayer || 'Unknown',
                category: m.category || 'Pojedynek',
                advantage: 'uncertain',
                analysis: m.description || 'Brak szczegółowych danych.'
              }));
              console.warn('⚠️ Follow-up returned non-JSON (fallback applied).');
            }
          } catch (e) {
            console.warn('⚠️ Nie udało się sparsować follow-up jako JSON:', e.message);
            // fallback
            parsedResponse.playerMatchups = matchData.playerMatchups.slice(0, 20);
            parsedResponse.matchupAnalysis = parsedResponse.playerMatchups.map(m => ({
              homePlayer: m.homePlayer || 'Unknown',
              awayPlayer: m.awayPlayer || 'Unknown',
              category: m.category || 'Pojedynek',
              advantage: 'uncertain',
              analysis: m.description || 'Brak szczegółowych danych.'
            }));
          }
        } else {
          // Jeśli wywołanie follow-up nie powiodło się - użyj lokalnych matchups i wygeneruj prostą analizę
          parsedResponse.playerMatchups = matchData.playerMatchups.slice(0, 20);
          parsedResponse.matchupAnalysis = parsedResponse.playerMatchups.map(m => ({
            homePlayer: m.homePlayer || 'Unknown',
            awayPlayer: m.awayPlayer || 'Unknown',
            category: m.category || 'Pojedynek',
            advantage: 'uncertain',
            analysis: m.description || 'Brak szczegółowych danych.'
          }));
        }
      }

      // Używamy parsedResponse wygenerowanego wcześniej przez summary/follow-up (lub fallback).
      if (!parsedResponse) {
        parsedResponse = this.getFallbackAnalysis(homeForm, awayForm, homeTeam.name, awayTeam.name);
      }

      // Upewnij się, że pola istnieją i mają oczekiwany format
      if (!parsedResponse.predictedScore) parsedResponse.predictedScore = { home: 0, away: 0 };
      if (!parsedResponse.probabilities) parsedResponse.probabilities = { homeWin: 0, draw: 0, awayWin: 0 };

      // Napraw niepoprawne formaty (tablice -> pojedyncze wartości) i wymuś typ liczbowy
      try {
        if (Array.isArray(parsedResponse.predictedScore.home)) {
          parsedResponse.predictedScore.home = parsedResponse.predictedScore.home[0] || 0;
        }
      } catch (e) { parsedResponse.predictedScore.home = Number(parsedResponse.predictedScore.home) || 0; }

      try {
        if (Array.isArray(parsedResponse.predictedScore.away)) {
          parsedResponse.predictedScore.away = parsedResponse.predictedScore.away[0] || 0;
        }
      } catch (e) { parsedResponse.predictedScore.away = Number(parsedResponse.predictedScore.away) || 0; }

      parsedResponse.predictedScore.home = Number(parsedResponse.predictedScore.home) || 0;
      parsedResponse.predictedScore.away = Number(parsedResponse.predictedScore.away) || 0;

      parsedResponse.probabilities.homeWin = Number(parsedResponse.probabilities.homeWin) || 0;
      parsedResponse.probabilities.draw = Number(parsedResponse.probabilities.draw) || 0;
      parsedResponse.probabilities.awayWin = Number(parsedResponse.probabilities.awayWin) || Math.max(0, 100 - parsedResponse.probabilities.homeWin - parsedResponse.probabilities.draw);

      // Optionally apply calibration (temperature scaling + optional market blending).
      // Controlled by env var ENABLE_CALIBRATION (0/1 or true/false). Calibrator path via CALIBRATOR_PATH or tmp/calibrator.json.
      try {
        const enableCal = process.env.ENABLE_CALIBRATION === '1' || process.env.ENABLE_CALIBRATION === 'true';
        if (enableCal) {
          const calibratorPath = process.env.CALIBRATOR_PATH || path.join(process.cwd(), 'tmp', 'calibrator.json');
          let calibrator = null;
          try {
            if (fs.existsSync(calibratorPath)) {
              calibrator = JSON.parse(fs.readFileSync(calibratorPath, 'utf8'));
            }
          } catch (e) {
            console.warn('⚠️ Nie udało się wczytać calibratora:', e.message);
          }
          const blendWeight = Number(process.env.OPENAI_MARKET_BLEND_WEIGHT) || 0;
          // marketProbs not available in current context; pass null (placeholder for future blending)
          const calibrated = this.applyCalibration(parsedResponse.probabilities, calibrator, null, blendWeight);
          if (calibrated && typeof calibrated === 'object') {
            parsedResponse.probabilities = calibrated;
            // Attach calibration version/metadata so DB save can persist it for audit
            try {
              const calibVersion = calibrator && (calibrator.trainedOn || calibrator.version || (`T=${calibrator.temperature}`)) ? String(calibrator.trainedOn || calibrator.version || `T=${calibrator.temperature}`) : null;
              if (calibVersion) {
                parsedResponse.calibrationVersion = calibVersion;
                parsedResponse.prediction_metadata = parsedResponse.prediction_metadata || {};
                parsedResponse.prediction_metadata.calibrator = {
                  path: calibratorPath,
                  trainedOn: calibrator?.trainedOn || null,
                  temperature: (typeof calibrator?.temperature !== 'undefined') ? calibrator.temperature : null,
                  notes: calibrator?.notes || null
                };
              }
            } catch (metaErr) {
              console.warn('⚠️ Nie udało się dodać metadanych kalibratora do predykcji:', metaErr.message);
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ applyCalibration failed:', e.message);
      }

      // Synchronize predictedScore with probabilities so UI is consistent
      try {
        const homeP = parsedResponse.probabilities.homeWin;
        const awayP = parsedResponse.probabilities.awayWin;
        const drawP = parsedResponse.probabilities.draw;
        const nonDraw = Math.max(0, homeP + awayP);

        // Determine base total goals from team averages as a fallback
        const avgHome = (typeof homeStats !== 'undefined' && homeStats.avgGoalsFor) ? Number(homeStats.avgGoalsFor) : null;
        const avgAway = (typeof awayStats !== 'undefined' && awayStats.avgGoalsFor) ? Number(awayStats.avgGoalsFor) : null;
        let baseTotalGoals = 0;

        if (avgHome !== null && avgAway !== null) {
          baseTotalGoals = Math.max(1, Math.round(avgHome + avgAway));
        } else if (parsedResponse.predictedScore) {
          baseTotalGoals = Math.max(1, Math.round((Number(parsedResponse.predictedScore.home || 0) + Number(parsedResponse.predictedScore.away || 0))));
        } else {
          baseTotalGoals = 2;
        }

        if (parsedResponse.predictedScore && nonDraw > 0) {
          // Split total goals proportionally to win chances (ignoring draw)
          const ph = Math.round((homeP / nonDraw) * baseTotalGoals);
          const pa = Math.max(0, baseTotalGoals - ph);
          let newHome = ph;
          let newAway = pa;

          // If probabilities strongly favour one side, ensure score reflects that
          if (homeP > awayP + 20 && newHome <= newAway) {
            newHome = newAway + 1;
          } else if (awayP > homeP + 20 && newAway <= newHome) {
            newAway = newHome + 1;
          }

          parsedResponse.predictedScore.home = Number(newHome);
          parsedResponse.predictedScore.away = Number(newAway);
        } else if (parsedResponse.predictedScore) {
          // Keep existing predictedScore but ensure numeric
          parsedResponse.predictedScore.home = Number(parsedResponse.predictedScore.home) || 0;
          parsedResponse.predictedScore.away = Number(parsedResponse.predictedScore.away) || 0;
        }
      } catch (e) {
        console.warn('Błąd podczas synchronizacji predictedScore z probabilities:', e.message);
      }

      // If betting tips are present but missing probabilities, ask OpenAI to annotate them with numeric probabilities and short reasoning.
      try {
        if (Array.isArray(parsedResponse.bettingTips) && parsedResponse.bettingTips.length > 0) {
          // Check if any tip lacks a numeric probability
          const needAnnotate = parsedResponse.bettingTips.some(t => !(t && typeof t.probability === 'number'));
          if (needAnnotate) {
            const tipsForModel = parsedResponse.bettingTips.map(t => {
              if (typeof t === 'string') return { type: t };
              return { type: t.type || t.title || t.name || String(t), reasoning: t.reasoning || t.reason || t.description || '' };
            });

            const annotatePrompt = `${systemInstruction}\n\nYou are an expert football betting analyst. For the match ${matchData.match.homeTeam} vs ${matchData.match.awayTeam}, assign a probability (integer 0-100) and a one-sentence reasoning to each of the following betting suggestions. Use the match data and keyFactors to justify probabilities.\n\nTIPS:\n${JSON.stringify(tipsForModel, null, 2)}\n\nReturn JSON ONLY: an array in the same order as the tips: [{ "type": "...", "probability": 0-100, "reasoning": "..." }]`;

            let annotateResp = null;
            try {
              annotateResp = await callOpenAI(annotatePrompt, uniqueSeed + 3);
            } catch (e) {
              annotateResp = null;
            }

            if (annotateResp) {
              try {
                const atxt = this.getResponseText(annotateResp);
                const annotated = this.safeParseJSONFromText(atxt);
                if (Array.isArray(annotated) && annotated.length === tipsForModel.length) {
                  parsedResponse.bettingTips = annotated.map(a => ({
                    type: a.type || '',
                    probability: (typeof a.probability === 'number') ? Math.round(a.probability) : (a.probability ? Number(a.probability) : null),
                    reasoning: a.reasoning || ''
                  }));
                } else {
                  // If model returned invalid array, keep existing tips (do not override)
                  console.warn('⚠️ Annotate tips: unexpected response shape; keeping original bettingTips.');
                }
              } catch (e) {
                console.warn('⚠️ Error parsing annotated tips JSON:', e.message);
              }
            }
          }
        }
      } catch (e) {
        // Non-fatal: if annotation fails, we continue with existing tips
        console.warn('⚠️ Annotating betting tips with OpenAI failed:', e.message);
      }

      console.log('✅ Wynik:', parsedResponse.probabilities.homeWin + '% - ' + parsedResponse.probabilities.draw + '% - ' + parsedResponse.probabilities.awayWin + '%');
      
      // Zapisz w cache z timestampem
      this.analysisCache.set(cacheKey, {
        data: parsedResponse,
        timestamp: Date.now()
      });

      // Zapisz do bazy danych jeśli podano fixtureId
      if (fixtureId) {
        console.log(`🎯 ZAPISUJĘ DO BAZY: fixtureId=${fixtureId}, homeTeam=${homeTeam.name}, awayTeam=${awayTeam.name}`);
        const fullMatchData = {
          fixture: { date: new Date().toISOString(), status: { short: 'NS' } },
          teams: { home: homeTeam, away: awayTeam },
          league: { id: 0, name: 'Unknown' },
          teamForm: { home: homeForm, away: awayForm },
          playerMatchups: matchData.playerMatchups
        };
        await this.saveAnalysisToDatabase(fixtureId, fullMatchData, parsedResponse, lineups);
        console.log(`✅ ZAPISYWANIE ZAKOŃCZONE dla meczu ${fixtureId}`);
      } else {
        console.log(`⚠️ BRAK fixtureId - nie zapisuję do bazy`);
      }
      
      return parsedResponse;
      
    } catch (error) {
      console.error('Błąd analizy GPT-5 dla', homeTeam.name, 'vs', awayTeam.name, ':', error.message);
      // Fallback do podstawowej analizy
      const fallbackResult = this.getFallbackAnalysis(homeForm, awayForm, homeTeam.name, awayTeam.name);
      
      // Zapisz fallback do bazy jeśli podano fixtureId
      if (fixtureId) {
        console.log(`🎯 ZAPISUJĘ ERROR FALLBACK DO BAZY: fixtureId=${fixtureId}`);
        const fullMatchData = {
          fixture: { date: new Date().toISOString(), status: { short: 'NS' } },
          teams: { home: homeTeam, away: awayTeam },
          league: { id: 0, name: 'Unknown' },
          teamForm: { home: homeForm, away: awayForm },
          playerMatchups: []
        };
        try {
          await this.saveAnalysisToDatabase(fixtureId, fullMatchData, fallbackResult, lineups);
          console.log(`✅ ERROR FALLBACK ZAPISANY dla meczu ${fixtureId}`);
        } catch (saveError) {
          console.error('❌ Błąd zapisywania error fallback:', saveError);
        }
      }
      
      // Zapisz fallback w cache z timestampem
      this.analysisCache.set(cacheKey, {
        data: fallbackResult,
        timestamp: Date.now()
      });
      
      return fallbackResult;
    }
  }

  // Prompt dla OpenAI
  buildAnalysisPrompt(matchData) {
    // Oblicz szczegółowe statystyki
    const homeStats = this.calculateDetailedStats(matchData.teamForm.home);
    const awayStats = this.calculateDetailedStats(matchData.teamForm.away);
    
    // Dodaj więcej różnorodności w przewidywaniu wyniku
    const scoringTrend = this.analyzeScoring(matchData.teamForm.home, matchData.teamForm.away);
    
    return `Analyze the football match: ${matchData.match.homeTeam} vs ${matchData.match.awayTeam}.

HOME TEAM FORM (${matchData.match.homeTeam}):
Last 5 matches: ${matchData.teamForm.home.map(m => `${m.result}(${m.goalsFor}-${m.goalsAgainst})`).join(' ')}
Points: ${homeStats.points}/15
Goals: ${homeStats.goalsFor} scored, ${homeStats.goalsAgainst} conceded
Average: ${homeStats.avgGoalsFor} goals per match

AWAY TEAM FORM (${matchData.match.awayTeam}):
Last 5 matches: ${matchData.teamForm.away.map(m => `${m.result}(${m.goalsFor}-${m.goalsAgainst})`).join(' ')}
Points: ${awayStats.points}/15  
Goals: ${awayStats.goalsFor} scored, ${awayStats.goalsAgainst} conceded
Average: ${awayStats.avgGoalsFor} goals per match

SCORING ANALYSIS:
- Home team: ${scoringTrend.homeScoring}
- Away team: ${scoringTrend.awayScoring}
- Expected total goals: ${scoringTrend.expectedGoals}
- Game style: ${scoringTrend.gameStyle}

KEY DIFFERENCES:
- Points difference: ${homeStats.points - awayStats.points} (${homeStats.points > awayStats.points ? 'home advantage' : awayStats.points > homeStats.points ? 'away advantage' : 'balanced'})
- Goals average difference: ${(parseFloat(homeStats.avgGoalsFor) - parseFloat(awayStats.avgGoalsFor)).toFixed(1)}
- Defense: ${homeStats.goalsAgainst < awayStats.goalsAgainst ? matchData.match.homeTeam + ' better defense' : awayStats.goalsAgainst < homeStats.goalsAgainst ? matchData.match.awayTeam + ' better defense' : 'similar defense'}

${matchData.playerMatchups && matchData.playerMatchups.length > 0 ? `
🔥 CONFIRMED LINEUPS - KEY PLAYER MATCHUPS:

${matchData.playerMatchups.map(m => `${m.category}:
  ${m.homePlayer} vs ${m.awayPlayer}
  → ${m.description}`).join('\n\n')}

📊 TOP PLAYERS STATISTICS:

HOME TEAM TOP PERFORMERS:
${this.formatTopPlayersStats(matchData.teamPlayers?.home, 'home')}

AWAY TEAM TOP PERFORMERS:
${this.formatTopPlayersStats(matchData.teamPlayers?.away, 'away')}
` : `
LINEUPS: Not yet announced (check 30-60 min before match)
Analysis based solely on team form from recent matches.

📊 SEASON STATISTICS:

HOME TEAM TOP PERFORMERS:
${this.formatTopPlayersStats(matchData.teamPlayers?.home, 'home')}

AWAY TEAM TOP PERFORMERS:
${this.formatTopPlayersStats(matchData.teamPlayers?.away, 'away')}
`}

${matchData.weather ? `
🌤️ WEATHER CONDITIONS:
Temperature: ${matchData.weather.temperature}°C
Conditions: ${matchData.weather.conditions}
Wind: ${matchData.weather.windSpeed} m/s
` : ''}

Based on this data, return analysis in JSON format:

{
  "probabilities": {
    "homeWin": [calculate based on form and points],
    "draw": [calculate based on balanced form], 
    "awayWin": [calculate based on away form]
  },
  "predictedScore": {
    "home": [DIVERSE result based on averages and form],
    "away": [DIVERSE result based on averages and form]
  },
  "confidence": "high/medium/low",
  "keyFactors": [
    "Specific observations about team form (in Polish)",
    "Differences in goal statistics (in Polish)",
    "Home or away advantage (in Polish)"
  ],
  "bettingTips": [
    {
      "type": "Best bet type (in Polish)",
      "probability": [probability number],
      "reasoning": "Justification based on data (in Polish)"
    }
  ]
}

KEY RULES:
1. If a team has more points, they should have higher chances
2. Predicted score MUST be diverse - not always 2-1!
3. Consider goal averages: if team scores little, predict fewer goals
4. Home teams have 5-10% advantage, but don't always win
5. Each match is UNIQUE - different results for different teams

EXAMPLES OF DIVERSE RESULTS:
- Offensive teams: 3-2, 2-2, 3-1
- Defensive teams: 1-0, 0-1, 1-1
- Balanced teams: 2-1, 1-2, 2-2

Return ONLY JSON:
`;
  }

  // Normalize betting tips into a consistent object shape: { type, probability, reasoning }
  normalizeBettingTips(tips) {
    if (!Array.isArray(tips)) return [];
    return tips.map(t => {
      if (typeof t === 'string') {
        return { type: t, probability: null, reasoning: '' };
      }
      if (t && typeof t === 'object') {
        return {
          type: t.type || t.title || t.name || (Array.isArray(t) ? t[0] : '') || '',
          probability: (typeof t.probability !== 'undefined') ? t.probability : (t.prob || null),
          reasoning: t.reasoning || t.reason || t.description || ''
        };
      }
      return { type: String(t), probability: null, reasoning: '' };
    });
  }

  // Formatuj statystyki najlepszych zawodników (bardziej odporne na różne struktury danych)
  formatTopPlayersStats(teamPlayers, teamType) {
    if (!teamPlayers || teamPlayers.length === 0) {
      return `No player statistics available for ${teamType} team`;
    }

    // Normalizuj i wyciągnij metryki z różnych wariantów struktury
    const normalizeStats = (playerData) => {
      // Jeśli mamy standardową strukturę, użyj jej
      const stats = (playerData.statistics && playerData.statistics[0]) || playerData.stats || playerData.statistics || {};

      // games może być obiektem lub puste
      const games = stats.games || {};
      const goalsObj = stats.goals || {};

      const appearances = Number(
        games.appearances ??
        games.appearences ??
        stats.appearances ??
        stats.appearences ??
        0
      ) || 0;

      const goals = Number(
        goalsObj.total ??
        stats.goals_total ??
        stats.goals ??
        0
      ) || 0;

      const assists = Number(
        goalsObj.assists ??
        stats.assists ??
        0
      ) || 0;

      // rating może być w games.rating lub stats.rating lub jako string z przecinkiem
      const rawRating = games.rating ?? stats.rating ?? stats.average_rating ?? null;
      let rating = 'N/A';
      if (rawRating !== null && rawRating !== undefined) {
        const r = String(rawRating).replace(',', '.').trim();
        const rn = Number(r);
        rating = Number.isFinite(rn) ? rn.toFixed(1) : 'N/A';
      }

      const position = games.position ?? stats.position ?? playerData.player?.position ?? playerData.player?.pos ?? 'Unknown';

      return { appearances, goals, assists, rating, position, stats };
    };

    // Przygotuj listę z bezpiecznymi wartościami i score do sortowania
    const enriched = teamPlayers.map(p => {
      // Ujednolicone pozyskanie obiektu zawodnika
      const entry = this.getPlayerFromEntry(p);
      const player = entry.player || { name: 'Unknown', pos: '' };

      const s = normalizeStats(p);

      // Score do sortowania: priorytet bramki, asysty, występy
      const score = s.goals * 3 + s.assists * 2 + s.appearances;

      return { raw: p, player, ...s, score };
    });

    // Sortuj i wybierz top 5
    const top = enriched.sort((a, b) => b.score - a.score).slice(0, 5);

    // Sformatuj linie wyników
    return top.map(p => {
      return `• ${p.player.name} (${p.position}) - ${p.goals}G ${p.assists}A in ${p.appearances} games, Rating: ${p.rating}`;
    }).join('\n');
  }

  // Wzbogacenie analizy pojedynków lokalnie przy użyciu statystyk zawodników
  // Jeśli model nie podał konkretnych insightów (advantage === 'uncertain'), ta funkcja
  // generuje krótki 1-2 zdaniowy komentarz oraz określa przewagę na podstawie prostego scoringu:
  // score = goals*3 + assists*2 + rating
  enhanceMatchupAnalysis(matchupAnalysis, teamPlayers) {
    try {
      const playerStatsMap = {};
      const lists = [...(teamPlayers?.home || []), ...(teamPlayers?.away || [])];

      lists.forEach(p => {
        const entry = this.getPlayerFromEntry(p);
        const name = (entry.player && entry.player.name) || 'Unknown';
        const statsObj = (p.statistics && p.statistics[0]) || p.stats || p.statistics || {};
        const games = statsObj.games || {};
        const goals = Number((statsObj.goals && statsObj.goals.total) || statsObj.goals_total || statsObj.goals || 0) || 0;
        const assists = Number((statsObj.goals && statsObj.goals.assists) || statsObj.assists || 0) || 0;
        const rawRating = games.rating ?? statsObj.rating ?? statsObj.average_rating ?? null;
        const rating = rawRating !== null && rawRating !== undefined ? Number(String(rawRating).replace(',', '.')) || 0 : 0;

        playerStatsMap[name.trim().toLowerCase()] = { goals, assists, rating };
      });

      return (matchupAnalysis || []).map(m => {
        const home = (m.homePlayer && (typeof m.homePlayer === 'string' ? m.homePlayer : m.homePlayer.name)) || '';
        const away = (m.awayPlayer && (typeof m.awayPlayer === 'string' ? m.awayPlayer : m.awayPlayer.name)) || '';
        const hs = playerStatsMap[(home || '').toLowerCase()] || { goals: 0, assists: 0, rating: 0 };
        const as = playerStatsMap[(away || '').toLowerCase()] || { goals: 0, assists: 0, rating: 0 };

        const scoreH = (hs.goals || 0) * 3 + (hs.assists || 0) * 2 + (hs.rating || 0);
        const scoreA = (as.goals || 0) * 3 + (as.assists || 0) * 2 + (as.rating || 0);

        let advantage = 'uncertain';
        if (scoreH >= scoreA + 3) advantage = 'home';
        else if (scoreA >= scoreH + 3) advantage = 'away';
        else advantage = 'even';

        const analysisText = `Statystyki: ${home} — ${hs.goals}G/${hs.assists}A, rating ${hs.rating || 'N/A'}; ${away} — ${as.goals}G/${as.assists}A, rating ${as.rating || 'N/A'}. ${advantage === 'home' ? `${home} ma przewagę w tym pojedynku.` : advantage === 'away' ? `${away} ma przewagę w tym pojedynku.` : 'Pojedynek wydaje się wyrównany.'}`;

        return {
          homePlayer: home,
          awayPlayer: away,
          category: m.category || 'Pojedynek',
          advantage,
          analysis: analysisText
        };
      });
    } catch (e) {
      console.warn('Błąd podczas enhanceMatchupAnalysis:', e.message);
      return matchupAnalysis;
    }
  }

  // Fallback analiza jeśli OpenAI nie działa
  getFallbackAnalysis(homeForm, awayForm, homeTeamName = 'Gospodarze', awayTeamName = 'Goście') {
    console.log('Używam fallback analizy dla:', homeTeamName, 'vs', awayTeamName);
    
    const homeStats = this.calculateDetailedStats(homeForm);
    const awayStats = this.calculateDetailedStats(awayForm);

    // Dodaj element losowości na podstawie nazw drużyn i czasu
    const uniqueSeed = this.generateUniqueSeed(homeTeamName, awayTeamName);
    // Mniejsza losowość w fallback, aby ograniczyć niepotrzebne odchylenia w przewidywanych bramkach
    const randomFactor = (uniqueSeed % 10) - 5; // -5 do +4

    // Oblicz prawdopodobieństwa na podstawie szczegółowych statystyk
    const formDiff = (homeStats.points - awayStats.points) * 1.5;
    const goalDiff = homeStats.goalDifference - awayStats.goalDifference;
    const avgGoalsDiff = (homeStats.avgGoalsFor - awayStats.avgGoalsFor) * 5;
    
    // Bazowa szansa gospodarzy (40%) + modyfikatory
    let homeWin = Math.max(15, Math.min(75, 40 + formDiff + goalDiff * 2 + avgGoalsDiff + randomFactor));
    
    // Szansa na remis zależy od wyrównanej formy
    let draw = Math.max(15, Math.min(40, 25 - Math.abs(formDiff) + (Math.abs(randomFactor) / 3)));
    
    // Reszta dla gości
    let awayWin = 100 - homeWin - draw;

    console.log(`Fallback analiza ${homeTeamName} vs ${awayTeamName}:`);
    console.log(`- Forma: ${homeStats.points} vs ${awayStats.points} pkt`);
    console.log(`- Bramki: ${homeStats.avgGoalsFor} vs ${awayStats.avgGoalsFor} średnio`);
    console.log(`- Seed: ${uniqueSeed}, Random: ${randomFactor}`);
    console.log(`- Wynik: ${Math.round(homeWin)}% - ${Math.round(draw)}% - ${Math.round(awayWin)}%`);

    // Przewidywany wynik na podstawie średnich z większą różnorodnością
    const homeAvg = parseFloat(homeStats.avgGoalsFor);
    const awayAvg = parseFloat(awayStats.avgGoalsFor);
    
    // Dodaj więcej zmienności w wynikach
    const homeBonus = 0.3; // Bonus za dom
    const formBonus = (homeStats.points - awayStats.points) / 30; // Bonus za lepszą formę

    // Najpierw policz oczekiwane łączne bramki na podstawie średnich (możemy dać drobną premię za atak)
    const baseTotalGoals = Math.max(0.5, Math.min(6, homeAvg + awayAvg + 0.2)); // ogranicz zakres
    // Rozdziel sumę bramek proporcjonalnie do szans (ignorując remis przy podziale)
    const homeChance = Math.max(0, (homeWin || 40));
    const awayChance = Math.max(0, (awayWin || 40));
    const nonDraw = homeChance + awayChance;

    let predictedHome = 0;
    let predictedAway = 0;

    if (nonDraw > 0) {
      // Proporcjonalny podział totalGoals
      predictedHome = Math.round((homeChance / nonDraw) * baseTotalGoals);
      predictedAway = Math.round(baseTotalGoals - predictedHome);
    } else {
      // Fallback: równy podział
      predictedHome = Math.round(baseTotalGoals / 2);
      predictedAway = Math.round(baseTotalGoals / 2);
    }

    // Dodaj drobne korekty w oparciu o formę i domowy bonus
    predictedHome = Math.max(0, predictedHome + Math.round(homeBonus + formBonus));
    predictedAway = Math.max(0, predictedAway);

    // Zapewnij różnorodność wyników — drobne losowe przesunięcie zależne od seed/randomFactor
    if (Math.abs(randomFactor) > 6) {
      if (randomFactor > 0) {
        predictedHome = Math.min(6, predictedHome + 1);
      } else {
        predictedAway = Math.min(6, predictedAway + 1);
      }
    }

    // Korekta: jeśli jedna strona ma znacznie wyższe prawdopodobieństwo, upewnij się, że wynik to odzwierciedla
    try {
      if (homeChance > awayChance + 20 && predictedHome <= predictedAway) {
        predictedHome = predictedAway + 1;
      } else if (awayChance > homeChance + 20 && predictedAway <= predictedHome) {
        predictedAway = predictedHome + 1;
      }
    } catch (e) {
      console.warn('Błąd przy synchronizacji predictedScore z probabilities:', e.message);
    }

    // Upewnij się, że przewidywany wynik jest spójny z obliczonymi prawdopodobieństwami
    // Jeśli jedna ze stron ma wyraźnie większe szanse, dostosuj wynik tak, aby odzwierciedlał tę przewagę.
    try {
      if (homeWin > awayWin && predictedHome <= predictedAway) {
        predictedHome = predictedAway + 1;
      } else if (awayWin > homeWin && predictedAway <= predictedHome) {
        predictedAway = predictedHome + 1;
      } else if (Math.abs(homeWin - awayWin) < 6 && Math.abs(predictedHome - predictedAway) > 2) {
        // Jeśli prawdopodobieństwa są zbliżone, a prognoza bramek ma duży rozrzut, wyrównaj je bardziej
        const avg = Math.round((predictedHome + predictedAway) / 2);
        // zachowaj sumę w przybliżeniu i zredukuj różnicę
        if (predictedHome > predictedAway) {
          predictedHome = Math.max(0, avg + 1);
          predictedAway = Math.max(0, avg);
        } else if (predictedAway > predictedHome) {
          predictedAway = Math.max(0, avg + 1);
          predictedHome = Math.max(0, avg);
        }
      }
    } catch (e) {
      // Jeśli coś pójdzie nie tak, nie blokujemy analizy - zostawiamy oryginalne przewidywania
      console.warn('Błąd przy synchronizacji predictedScore z probabilities:', e.message);
    }

    // Dynamiczne czynniki kluczowe
    const keyFactors = [
      `${homeTeamName}: ${homeStats.points}/15 pkt (${homeStats.winRate}% zwycięstw)`,
      `${awayTeamName}: ${awayStats.points}/15 pkt (${awayStats.winRate}% zwycięstw)`,
      `Średnie bramek: ${homeStats.avgGoalsFor} vs ${awayStats.avgGoalsFor}`,
      `Bilans bramkowy: ${homeStats.goalDifference} vs ${awayStats.goalDifference}`
    ];

    // Dodaj specyficzne obserwacje
    if (homeStats.points > awayStats.points + 3) {
      keyFactors.push(`${homeTeamName} w znacznie lepszej formie`);
    } else if (awayStats.points > homeStats.points + 3) {
      keyFactors.push(`${awayTeamName} w znacznie lepszej formie`);
    } else {
      keyFactors.push('Wyrównane formy drużyn');
    }

    return {
      probabilities: {
        homeWin: Math.round(homeWin),
        draw: Math.round(draw),
        awayWin: Math.round(awayWin)
      },
      predictedScore: {
        home: predictedHome,
        away: predictedAway
      },
      confidence: Math.abs(homeStats.points - awayStats.points) > 4 ? "high" : 
                 Math.abs(homeStats.points - awayStats.points) <= 2 ? "low" : "medium",
      keyFactors: keyFactors,
      bettingTips: [
        {
          type: homeWin > 50 ? `Wygrana ${homeTeamName}` : awayWin > 50 ? `Wygrana ${awayTeamName}` : "Wyrównany mecz",
          probability: Math.max(homeWin, awayWin, draw),
          reasoning: `Analiza na podstawie formy z ostatnich 5 meczów`
        },
        {
          type: (predictedHome + predictedAway) > 2.5 ? "Over 2.5 bramek" : "Under 2.5 bramek",
          probability: (predictedHome + predictedAway) > 2.5 ? 60 + Math.abs(randomFactor) : 60 - Math.abs(randomFactor),
          reasoning: `Przewidywany wynik: ${predictedHome}-${predictedAway}`
        }
      ]
    };
  }
}

export const openaiAnalysisService = new OpenAIAnalysisService();
