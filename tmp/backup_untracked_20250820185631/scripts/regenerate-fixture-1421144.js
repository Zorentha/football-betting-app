import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const API_BASE = 'http://localhost:3001/api/betting';
const FIXTURE_ID = 1421144;
const OUT_FILE = path.join(process.cwd(), 'tmp_analysis_1421144.json');

async function main() {
  try {
    console.log(`🔁 Regeneruję analizę dla fixture ${FIXTURE_ID}...`);
    const resp = await axios.get(`${API_BASE}/fixtures/${FIXTURE_ID}/analyze`, { timeout: 120000 });
    const payload = {
      fetchedAt: new Date().toISOString(),
      fixtureId: FIXTURE_ID,
      status: resp.status,
      data: resp.data
    };
    await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`✅ Zapisano wygenerowaną analizę do ${OUT_FILE}`);
  } catch (err) {
    console.error('❌ Błąd podczas regeneracji analizy:', err.message || err);
    const errFile = path.join(process.cwd(), `tmp_analysis_${FIXTURE_ID}_error.json`);
    try {
      await fs.writeFile(errFile, JSON.stringify({ fetchedAt: new Date().toISOString(), error: err.message || String(err) }, null, 2), 'utf8');
      console.log(`ℹ️ Zapisano szczegóły błędu do ${errFile}`);
    } catch (e) {
      console.warn('Nie udało się zapisać pliku błędu:', e.message || e);
    }
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Unhandled error:', e);
  process.exit(2);
});
