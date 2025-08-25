import fetch from 'node-fetch';
import fs from 'fs/promises';

function safeParseJSONFromText(text) {
  if (!text || typeof text !== 'string') return null;
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch (e) {
    // Extract JSON block inside ```json ... ``` or {...}
    const jsonFence = /```json\s*([\s\S]*?)```/i.exec(text);
    const objMatch = /\{[\s\S]*\}/.exec(text);
    const candidate = jsonFence ? jsonFence[1] : (objMatch ? objMatch[0] : null);
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch (err) {
      // Try to fix trailing commas and single quotes (best-effort)
      try {
        const cleaned = candidate
          .replace(/,(\s*[}\]])/g, '$1') // remove trailing commas
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, (m, q1, key) => `"${key}":`) // ensure keys quoted
          .replace(/'/g, '"');
        return JSON.parse(cleaned);
      } catch (err2) {
        return null;
      }
    }
  }
}

class OpenAIAnalysisService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || null;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.expectedOutputTokens = process.env.OPENAI_EXPECTED_OUTPUT_TOKENS ? Number(process.env.OPENAI_EXPECTED_OUTPUT_TOKENS) : null;
    this.requestCount = 0;
    this._cache = new Map(); // simple in-memory cache for short-lived use
  }

  hasConfirmedLineups(lineups) {
    // Heuristic: if any lineup entry has a property 'confirmed' true, or lineups non-empty with startXI, treat as confirmed.
    if (!lineups) return false;
    if (Array.isArray(lineups) && lineups.length === 0) return false;
    try {
      if (Array.isArray(lineups)) {
        for (const l of lineups) {
          if (l && (l.confirmed === true || l.isConfirmed === true || (l.startXI && l.startXI.length > 0))) return true;
        }
      } else if (typeof lineups === 'object') {
        if (lineups.confirmed === true || lineups.isConfirmed === true || (lineups.startXI && lineups.startXI.length > 0)) return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  clearCache() {
    const size = this._cache.size;
    this._cache.clear();
    return size;
  }

  clearMatchCache(homeId, awayId) {
    // simple naming convention
    const key = `match_${homeId}_${awayId}`;
    const had = this._cache.delete(key);
    return had ? 1 : 0;
  }

  async _callOpenAI(prompt, opts = {}) {
    // opts:
    //  - temperature
    //  - max_tokens
    //  - timeout (ms)
    //  - retries (int)
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY not set in environment');
    }
    this.requestCount++;
    const maxRetries = Number(opts.retries ?? 3);
    const timeoutMs = Number(opts.timeout ?? 30000); // 30s default
    const baseUrl = 'https://api.openai.com/v1/chat/completions';
    console.info(`[OpenAI] _callOpenAI start — model=${this.model} expectedOutputTokens=${this.expectedOutputTokens ?? 'unset'} maxRetries=${maxRetries} timeoutMs=${timeoutMs}`);

    // Build body and include max_tokens only if explicitly set via env or opts.
    const buildBody = () => {
      const b = {
        model: this.model,
        messages: [
          { role: 'system', content: 'You are an expert football betting analyst. Return JSON when asked.' },
          { role: 'user', content: prompt }
        ],
        temperature: opts.temperature ?? 0.2
      };
      if (typeof this.expectedOutputTokens === 'number' && !isNaN(this.expectedOutputTokens) && this.expectedOutputTokens > 0) {
        b.max_tokens = this.expectedOutputTokens;
      } else if (typeof opts.max_tokens === 'number' && !isNaN(opts.max_tokens) && opts.max_tokens > 0) {
        b.max_tokens = opts.max_tokens;
      }
      return b;
    };

    // Exponential backoff with jitter
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const jitter = (n) => Math.floor(Math.random() * n);

    let lastErr = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const body = buildBody();
        console.info(`[OpenAI] attempt=${attempt+1}/${maxRetries+1} sending request to ${baseUrl} with max_tokens=${body.max_tokens ?? 'unset'} temperature=${body.temperature}`);

        const resp = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        clearTimeout(timer);

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          const err = new Error(`OpenAI API error ${resp.status}: ${txt}`);
          // Retry on 429 and 5xx
          if ((resp.status === 429 || (resp.status >= 500 && resp.status < 600)) && attempt < maxRetries) {
            lastErr = err;
            const backoff = Math.pow(2, attempt) * 500;
            await wait(backoff + jitter(300));
            continue;
          }
          throw err;
        }

        const data = await resp.json();
        // log important metadata from the response
        try {
          const respId = data.id || 'unknown';
          const totalTokens = data.usage?.total_tokens ?? 'n/a';
          console.info(`[OpenAI] success — id=${respId} total_tokens=${totalTokens} attempt=${attempt+1}`);
        } catch (logErr) {
          // non-fatal
          console.debug('[OpenAI] success: unable to extract usage metadata', logErr);
        }
        const choice = data.choices && data.choices[0];
        const content = choice?.message?.content ?? (choice?.text ?? null);
        return { raw: data, text: content };
      } catch (err) {
        clearTimeout(timer);
        // If aborted by timeout, set an informative error
        if (err.name === 'AbortError') {
          lastErr = new Error(`OpenAI request aborted after ${timeoutMs}ms`);
        } else {
          lastErr = err;
        }
        console.warn(`[OpenAI] attempt ${attempt+1} failed: ${lastErr.message || lastErr}. ${attempt < maxRetries ? 'Retrying...' : 'No more retries.'}`);
        // Retry on network errors / Abort / 429 / 5xx (best-effort)
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 500;
          await wait(backoff + jitter(300));
          continue;
        }
        // No more retries
        throw lastErr;
      }
    }

    // If we exit loop unexpectedly
    throw lastErr || new Error('Unknown error in _callOpenAI');
  }

  async analyzeWithCustomPrompt(prompt) {
    // Simple wrapper used by /openai/analyze route
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt must be a non-empty string');
    }
    const cacheKey = `custom:${prompt.slice(0, 200)}`;
    if (this._cache.has(cacheKey)) {
      return { fromCache: true, response: this._cache.get(cacheKey) };
    }

    const result = await this._callOpenAI(prompt, { max_tokens: this.expectedOutputTokens });
    this._cache.set(cacheKey, result);
    return result;
  }

  // analyzeMatch: build a structured prompt from match data and request a JSON analysis
  async analyzeMatch(homeTeam, awayTeam, homeForm = [], awayForm = [], lineups = [], players = [], teamPlayers = {}, weather = null, fixtureId = null) {
    // Build a concise prompt summarizing the match
    const promptParts = [];
    promptParts.push(`Match: ${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'}`);
    promptParts.push(`Fixture ID: ${fixtureId || 'unknown'}`);
    // Forms
    const summarizeForm = (f) => (Array.isArray(f) && f.length ? f.slice(0,5).map(x=>`${x.date||''}:${x.result||''}:${x.goalsFor||0}-${x.goalsAgainst||0}`).join('; ') : 'N/A');
    promptParts.push(`Home recent form (last up to 5): ${summarizeForm(homeForm)}`);
    promptParts.push(`Away recent form (last up to 5): ${summarizeForm(awayForm)}`);
    // Lineups presence
    promptParts.push(`Lineups provided: ${Array.isArray(lineups) ? lineups.length : !!lineups}`);
    // Team averages heuristic
    try {
      const homeAvg = (Array.isArray(homeForm) && homeForm.length) ? (homeForm.reduce((s,m)=>s+(m.goalsFor||0),0)/homeForm.length).toFixed(2) : 'N/A';
      const awayAvg = (Array.isArray(awayForm) && awayForm.length) ? (awayForm.reduce((s,m)=>s+(m.goalsFor||0),0)/awayForm.length).toFixed(2) : 'N/A';
      promptParts.push(`Home avg goals: ${homeAvg}, Away avg goals: ${awayAvg}`);
    } catch (_) {}

    if (weather) {
      promptParts.push(`Weather: ${JSON.stringify(weather)}`);
    }

    promptParts.push(`Instructions: Return a JSON object with keys: probabilities {homeWin, draw, awayWin} (integers summing to 100), predictedScore {home, away}, confidence ('high'|'medium'|'low'), keyFactors (array of strings), bettingTips (array of objects {type, probability (integer 0-100), reasoning}). Return JSON only.`);

    const prompt = promptParts.join('\n');

    const cacheKey = `analyze:${fixtureId || 'noid'}:${homeTeam?.name||''}:${awayTeam?.name||''}`;
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    const resp = await this._callOpenAI(prompt, { max_tokens: this.expectedOutputTokens });
    const text = resp.text || JSON.stringify(resp.raw);

    // Persist raw response to tmp for auditing/debugging (best-effort, do not fail analysis if write fails)
    try {
      if (typeof resp === 'object') {
        const rawPath = `tmp/annotate_raw_response_${fixtureId || 'noid'}.json`;
        await fs.writeFile(rawPath, JSON.stringify({ raw: resp.raw, text }, null, 2), 'utf8');
      }
    } catch (e) {
      console.warn('[OpenAI] failed to write raw response to tmp', e && e.message ? e.message : e);
    }

    // Attempt to parse JSON from the model's text; fall back to returning raw text in aiAnalysis.raw
    const parsed = safeParseJSONFromText(text);

    let aiAnalysis = parsed || { rawText: text };

    // If parsed result is missing robust per-tip probabilities, attempt a stricter annotate/fallback
    const tipsHaveIntegerProb = (a) => {
      try {
        if (!a || !Array.isArray(a.bettingTips) || a.bettingTips.length === 0) return false;
        return a.bettingTips.every(t => Number.isFinite(Number(t && (t.probability ?? t.probabillity ?? t.probabilty ?? t['probabil lity']))));
      } catch (err) {
        return false;
      }
    };

    // If initial parse failed or bettingTips lack integer probabilities, call a stricter prompt that returns only bettingTips JSON
    if (!parsed || !tipsHaveIntegerProb(parsed)) {
      try {
        const strictPrompt = [
          "STRICT OUTPUT REQUIRED: Return ONLY a single valid JSON object (no surrounding text, no markdown fences).",
          "The JSON must contain exactly one key: \"bettingTips\" which is an array of objects.",
          "Each object must have the keys: type (string), probability (integer between 0 and 100), reasoning (string).",
          "Example: {\"bettingTips\":[{\"type\":\"Over 2.5\",\"probability\":65,\"reasoning\":\"Recent home attack form...\"}]}",
          "",
          "Now, from the analysis below extract only the betting tips. If you cannot produce tips, return {\"bettingTips\":[]}.",
          "",
          "Context:",
          prompt
        ].join("\n");

        // Ask OpenAI for the strict bettingTips JSON. Use a lower max_tokens but a single retry (we already attempted once).
        const strictResp = await this._callOpenAI(strictPrompt, { max_tokens: 600, retries: 1, timeout: 20000 });
        const strictText = strictResp.text || JSON.stringify(strictResp.raw);
        const strictParsed = safeParseJSONFromText(strictText);

        if (strictParsed && Array.isArray(strictParsed.bettingTips) && strictParsed.bettingTips.length > 0) {
          // Persist strict response for auditing (best-effort)
          try {
            const strictPath = `tmp/annotate_strict_response_${fixtureId || 'noid'}.json`;
            await fs.writeFile(strictPath, JSON.stringify({ text: strictText, parsed: strictParsed }, null, 2), 'utf8');
          } catch (e) {
            console.warn('[OpenAI] failed to write strict response to tmp', e && e.message ? e.message : e);
          }

          // Merge bettingTips into aiAnalysis (preserve any other parsed fields if present)
          aiAnalysis = aiAnalysis || {};
          aiAnalysis.bettingTips = strictParsed.bettingTips.map(t => ({
            type: t.type || t.Type || '',
            probability: Number.isFinite(Number(t.probability)) ? Math.round(Number(t.probability)) : null,
            reasoning: t.reasoning || t.Reasoning || t.reason || ''
          }));
        } else if (!parsed) {
          // If we had no parsed object at all, still set aiAnalysis.rawText so caller can inspect
          aiAnalysis = { rawText: text, bettingTips: (strictParsed && Array.isArray(strictParsed.bettingTips)) ? strictParsed.bettingTips : [] };
        } else {
          // If parsed existed but tips were invalid and strict parse failed, preserve parsed but leave tips normalization to validate step
          aiAnalysis = parsed;
        }
      } catch (err) {
        console.warn('[OpenAI] strict annotate fallback failed', err && err.message ? err.message : err);
        // Keep whatever parsed/raw we have
      }
    }

    // Validate and normalize AI analysis when possible
    try {
      const normalized = this.validateAndNormalizeAIAnalysis(aiAnalysis);
      if (normalized) aiAnalysis = normalized;
    } catch (e) {
      console.warn('[OpenAI] normalization failed', e && e.message ? e.message : e);
    }

    // Keep in cache briefly
    this._cache.set(cacheKey, aiAnalysis);
    return aiAnalysis;
  }

  // Utility: apply a simple temperature-style calibration to a probs object (homeWin/draw/awayWin)
  applyCalibration(probs = { homeWin:0, draw:0, awayWin:0 }, calibrator = null, normalize = true, roundTo = 0) {
    // If no calibrator provided, just normalize to integers that sum to 100
    let h = Number(probs.homeWin) || 0;
    let d = Number(probs.draw) || 0;
    let a = Number(probs.awayWin) || 0;
    if (h + d + a === 0) {
      return { homeWin: 34, draw: 33, awayWin: 33 };
    }
    if (calibrator && calibrator.temperature && calibrator.temperature > 0) {
      const temp = calibrator.temperature;
      // simple power transform
      h = Math.pow(h || 1e-6, 1/temp);
      d = Math.pow(d || 1e-6, 1/temp);
      a = Math.pow(a || 1e-6, 1/temp);
    }
    const total = h + d + a || 1;
    let ph = Math.round((h/total)*100);
    let pd = Math.round((d/total)*100);
    let pa = Math.round((a/total)*100);
    // correct rounding drift
    let sum = ph+pd+pa;
    if (sum !== 100) {
      const maxKey = ph >= pd && ph >= pa ? 'ph' : (pd >= ph && pd >= pa ? 'pd' : 'pa');
      if (maxKey === 'ph') ph += 100 - sum;
      if (maxKey === 'pd') pd += 100 - sum;
      if (maxKey === 'pa') pa += 100 - sum;
    }
    return { homeWin: ph, draw: pd, awayWin: pa };
  }

  // Validate and normalize aiAnalysis objects produced by model
  validateAndNormalizeAIAnalysis(aiAnalysis) {
    if (!aiAnalysis || typeof aiAnalysis !== 'object') return null;
    const cleaned = JSON.parse(JSON.stringify(aiAnalysis)); // deep clone

    // Ensure probabilities object
    cleaned.probabilities = cleaned.probabilities || {};
    cleaned.probabilities.homeWin = Number(cleaned.probabilities.homeWin) || 0;
    cleaned.probabilities.draw = Number(cleaned.probabilities.draw) || 0;
    cleaned.probabilities.awayWin = Number(cleaned.probabilities.awayWin) || 0;
    // Normalize to sum 100
    const norm = this.applyCalibration(cleaned.probabilities);
    cleaned.probabilities = norm;

    // Predicted score
    if (!cleaned.predictedScore || typeof cleaned.predictedScore !== 'object') {
      cleaned.predictedScore = { home: 0, away: 0 };
    } else {
      cleaned.predictedScore.home = Number(cleaned.predictedScore.home) || 0;
      cleaned.predictedScore.away = Number(cleaned.predictedScore.away) || 0;
    }

    // Confidence
    const conf = (cleaned.confidence || '').toString().toLowerCase();
    cleaned.confidence = (conf === 'high' || conf === 'low' || conf === 'medium') ? conf : 'medium';
    cleaned.confidencePercentage = Number(cleaned.confidencePercentage) || (cleaned.confidence === 'high' ? 80 : (cleaned.confidence === 'low' ? 40 : 60));

    // Betting tips
    if (!Array.isArray(cleaned.bettingTips)) cleaned.bettingTips = [];
    cleaned.bettingTips = cleaned.bettingTips.map((t, idx) => {
      const type = (t && (t.type || t.Type)) ? String(t.type || t.Type).replace(/\s*\n\s*/g, ' ').trim() : `tip_${idx}`;
      const rawProb = t && (t.probability ?? t.probabillity ?? t.probabilty ?? t['probabil lity']);
      const probability = Number.isFinite(Number(rawProb)) ? Math.round(Number(rawProb)) : null;
      const reasoning = (t && (t.reasoning || t.Reasoning || t.reason)) ? String(t.reasoning || t.Reasoning || t.reason).replace(/\s*\n\s*/g, ' ').trim() : '';
      return { type, probability, reasoning };
    });

    // If probabilities missing, attempt to infer uniform distribution or derive from predictedScore
    const tipsProbSum = cleaned.bettingTips.reduce((s, tt) => s + (Number.isFinite(tt.probability) ? tt.probability : 0), 0);
    if (tipsProbSum === 0 && cleaned.bettingTips.length > 0) {
      // assign equal weights and scale to 100
      const n = cleaned.bettingTips.length;
      const base = Math.floor(100 / n);
      let rem = 100 - base * n;
      cleaned.bettingTips = cleaned.bettingTips.map((tt, i) => {
        const p = base + (rem > 0 ? 1 : 0);
        rem -= rem > 0 ? 1 : 0;
        return Object.assign({}, tt, { probability: p });
      });
    } else if (tipsProbSum > 0) {
      // scale to 100 preserving proportions
      const scaled = cleaned.bettingTips.map(tt => Math.floor(((Number.isFinite(tt.probability) ? tt.probability : 0) / tipsProbSum) * 100));
      let remainder = 100 - scaled.reduce((s,v)=>s+v,0);
      // assign remainder to largest original probabilities
      const order = cleaned.bettingTips.map((tt,i)=>({i, val: Number.isFinite(tt.probability)?tt.probability:0})).sort((a,b)=>b.val-a.val);
      let j=0;
      while(remainder>0 && j<order.length){ scaled[order[j].i] +=1; remainder-=1; j++; }
      cleaned.bettingTips = cleaned.bettingTips.map((tt,i)=>Object.assign({}, tt, { probability: scaled[i] }));
    }

    // Ensure consistency: if predicted score is a draw, ensure draw probability is the highest
    if (cleaned.predictedScore.home === cleaned.predictedScore.away) {
      const { homeWin, draw, awayWin } = cleaned.probabilities;
      if (!(cleaned.probabilities.draw >= cleaned.probabilities.homeWin && cleaned.probabilities.draw >= cleaned.probabilities.awayWin)) {
        // bump draw to max(home, away) + 1 and renormalize
        const maxOther = Math.max(cleaned.probabilities.homeWin, cleaned.probabilities.awayWin);
        cleaned.probabilities.draw = Math.min(100, maxOther + 1);
        // renormalize others proportionally
        const othersTotal = cleaned.probabilities.homeWin + cleaned.probabilities.awayWin;
        if (othersTotal > 0) {
          const scale = (100 - cleaned.probabilities.draw) / othersTotal;
          cleaned.probabilities.homeWin = Math.round(cleaned.probabilities.homeWin * scale);
          cleaned.probabilities.awayWin = Math.round(cleaned.probabilities.awayWin * scale);
        } else {
          const remaining = 100 - cleaned.probabilities.draw;
          cleaned.probabilities.homeWin = Math.floor(remaining / 2);
          cleaned.probabilities.awayWin = remaining - cleaned.probabilities.homeWin;
        }
      }
    }

    return cleaned;
  }
}

export const openaiAnalysisService = new OpenAIAnalysisService();
