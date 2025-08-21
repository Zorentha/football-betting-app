import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const API_BASE = 'http://localhost:3001/api/betting';
const OUT_DIR = path.join(process.cwd(), 'tmp_analysis_all');
const REPORT_PATH = path.join(process.cwd(), 'tmp_analysis_report.json');

function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function main() {
  try {
    const reportRaw = await fs.readFile(REPORT_PATH, 'utf8');
    const report = JSON.parse(reportRaw);
    const fixtures = report.filesWithoutDbPredictions || [];
    if (!fixtures || fixtures.length === 0) {
      console.log('No fixtures to re-run according to report.');
      return;
    }

    await fs.mkdir(OUT_DIR, { recursive: true });
    console.log(`Found ${fixtures.length} fixture(s) to re-run. Starting analysis (2s pause between requests).`);

    for (const fixtureId of fixtures) {
      try {
        console.log(`Analysing fixture ${fixtureId} ...`);
        const resp = await axios.get(`${API_BASE}/fixtures/${fixtureId}/analyze`, { timeout: 60000 });
        const outFile = path.join(OUT_DIR, `tmp_analysis_${fixtureId}.json`);
        const payload = {
          fetchedAt: new Date().toISOString(),
          fixtureId,
          requestUrl: `${API_BASE}/fixtures/${fixtureId}/analyze`,
          status: resp.status,
          data: resp.data
        };
        await fs.writeFile(outFile, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`Saved result -> ${outFile}`);
      } catch (err) {
        console.error(`Error analysing fixture ${fixtureId}:`, err.message || err);
        const errFile = path.join(OUT_DIR, `tmp_analysis_${fixtureId}_error.json`);
        const errPayload = { fetchedAt: new Date().toISOString(), fixtureId, error: (err.message || String(err)) };
        try { await fs.writeFile(errFile, JSON.stringify(errPayload, null, 2), 'utf8'); } catch(e){ /* ignore */ }
      }
      await wait(2000);
    }

    console.log('Re-run for missing fixtures completed. Check tmp_analysis_all for outputs.');
  } catch (err) {
    console.error('Error in run-missing-analyses.js:', err);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
