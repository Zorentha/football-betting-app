import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const API_BASE = 'http://localhost:3001/api/betting';
const OUT_DIR = path.join(process.cwd(), 'tmp_analysis_all');
const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes for targeted retries
const PAUSE_MS = 2000;

function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function loadErrorReport() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'tmp', 'error-report.json'), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function main() {
  const report = await loadErrorReport();
  if (!report || report.length === 0) {
    console.log('No entries in tmp/error-report.json — nothing to retry.');
    return;
  }

  // Filter only timeout errors and items that have a numeric fixtureId
  const timeoutEntries = report.filter(e => typeof e.error === 'string' && e.error.toLowerCase().includes('timeout') && e.fixtureId);
  if (timeoutEntries.length === 0) {
    console.log('No timeout entries with fixtureId found in error report.');
    return;
  }

  const fixtureIds = Array.from(new Set(timeoutEntries.map(e => Number(e.fixtureId)).filter(Boolean)));
  console.log(`Found ${fixtureIds.length} fixture(s) to retry (timeout errors).`);

  await fs.mkdir(OUT_DIR, { recursive: true });

  const timeoutMs = Number(process.env.RETRY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  for (const fixtureId of fixtureIds) {
    try {
      console.log(`Retrying fixture ${fixtureId} with timeout ${timeoutMs}ms ...`);
      const resp = await axios.get(`${API_BASE}/fixtures/${fixtureId}/analyze`, { timeout: timeoutMs });
      const outFile = path.join(OUT_DIR, `tmp_analysis_${fixtureId}.json`);
      const payload = {
        fetchedAt: new Date().toISOString(),
        fixtureId,
        requestUrl: `${API_BASE}/fixtures/${fixtureId}/analyze`,
        status: resp.status,
        data: resp.data
      };
      await fs.writeFile(outFile, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`Saved success -> ${outFile}`);
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err);
      console.error(`Error retrying fixture ${fixtureId}:`, errMsg);
      const errFile = path.join(OUT_DIR, `tmp_analysis_${fixtureId}_error.json`);
      const errPayload = { fetchedAt: new Date().toISOString(), fixtureId, error: errMsg };
      try { await fs.writeFile(errFile, JSON.stringify(errPayload, null, 2), 'utf8'); } catch (e) { /* ignore */ }
    }
    await wait(PAUSE_MS);
  }

  console.log('Targeted timeout retry pass completed. Run generate-analysis-report.js next and then import-tmp-analyses.js (dry-run) to inspect results.');
}

main().catch(e => {
  console.error('Unhandled error in retry-timeout-fixtures.js:', e);
  process.exit(1);
});
