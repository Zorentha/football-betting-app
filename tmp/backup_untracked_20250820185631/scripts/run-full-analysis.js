import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const API_BASE = 'http://localhost:3001/api/betting';
const OUT_DIR = path.join(process.cwd(), 'tmp_analysis_all');

function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function main() {
  try {
    console.log('🚀 Rozpoczynam pełną rundę analiz (A) — pobieram mecze z /fixtures/today ...');
    const todayResp = await axios.get(`${API_BASE}/fixtures/today`, { timeout: 15000 });
    if (!todayResp.data || !todayResp.data.success) {
      console.error('❌ Nie udało się pobrać meczów z /fixtures/today:', todayResp.data || 'no-data');
      process.exit(1);
    }

    const fixtures = todayResp.data.data || [];
    if (fixtures.length === 0) {
      console.log('⚠️ Brak meczów do analizy.');
      return;
    }

    await fs.mkdir(OUT_DIR, { recursive: true });
    console.log(`ℹ️ Znalazłem ${fixtures.length} mecz(ów). Rozpoczynam analizę kolejno (z 2s przerwą między żądaniami).`);

    for (const f of fixtures) {
      const fixtureId = f.fixture?.id || f.fixture_id || f.id;
      if (!fixtureId) {
        console.warn('⚠️ Nieprawidłowy obiekt meczu, pomijam:', f);
        continue;
      }

      try {
        console.log(`🔎 Analizuję fixture ${fixtureId} — ${f.teams?.home?.name || 'home'} vs ${f.teams?.away?.name || 'away'}`);
        const analysisResp = await axios.get(`${API_BASE}/fixtures/${fixtureId}/analyze`, { timeout: 60000 });
        const outFile = path.join(OUT_DIR, `tmp_analysis_${fixtureId}.json`);
        const payload = {
          fetchedAt: new Date().toISOString(),
          fixtureId,
          requestUrl: `${API_BASE}/fixtures/${fixtureId}/analyze`,
          status: analysisResp.status,
          data: analysisResp.data
        };
        await fs.writeFile(outFile, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`✅ Zapisano wynik dla ${fixtureId} -> ${outFile}`);
      } catch (err) {
        console.error(`❌ Błąd analizy fixture ${fixtureId}:`, err.message || err);
        // zapisz błąd do pliku
        const errFile = path.join(OUT_DIR, `tmp_analysis_${fixtureId}_error.json`);
        const errPayload = { fetchedAt: new Date().toISOString(), fixtureId, error: (err.message || String(err)) };
        try { await fs.writeFile(errFile, JSON.stringify(errPayload, null, 2), 'utf8'); } catch(e){/*ignore*/ }
      }

      // Krótka pauza, aby nie przeciążyć API/OpenAI
      await wait(2000);
    }

    console.log('🎉 Pełna runda analiz zakończona. Pliki wyników w:', OUT_DIR);
  } catch (error) {
    console.error('❌ Błąd w run-full-analysis.js:', error.message || error);
    process.exit(2);
  }
}

main().catch(e => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
