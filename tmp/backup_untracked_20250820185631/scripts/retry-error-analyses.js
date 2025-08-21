import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const API_BASE = 'http://localhost:3001/api/betting';
const OUT_DIR = path.join(process.cwd(), 'tmp_analysis_all');
const TIMEOUT_MS = 180000; // increased timeout
const PAUSE_MS = 2000;

function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function getErrorFixtureIds() {
  try {
    const files = await fs.readdir(OUT_DIR);
    const errorFiles = files.filter(f => f.endsWith('_error.json'));
    const ids = new Set();
    for (const ef of errorFiles) {
      const m = ef.match(/^tmp_analysis_(\d+)_error\.json$/);
      if (m) ids.add(Number(m[1]));
    }
    return Array.from(ids);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function main() {
  try {
    const fixtureIds = await getErrorFixtureIds();
    if (!fixtureIds || fixtureIds.length === 0) {
      console.log('No error files found to retry.');
      return;
    }

    await fs.mkdir(OUT_DIR, { recursive: true });
    console.log(`Retrying ${fixtureIds.length} fixture(s) with timeout ${TIMEOUT_MS}ms.`);

    for (const fixtureId of fixtureIds) {
      try {
        console.log(`Retrying fixture ${fixtureId} ...`);
        const resp = await axios.get(`${API_BASE}/fixtures/${fixtureId}/analyze`, { timeout: TIMEOUT_MS });
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
        console.error(`Error retrying fixture ${fixtureId}:`, err.message || err);
        const errFile = path.join(OUT_DIR, `tmp_analysis_${fixtureId}_error.json`);
        const errPayload = { fetchedAt: new Date().toISOString(), fixtureId, error: (err.message || String(err)) };
        try { await fs.writeFile(errFile, JSON.stringify(errPayload, null, 2), 'utf8'); } catch(e){ /* ignore */ }
      }
      await wait(PAUSE_MS);
    }

    console.log('Retry pass completed. You can regenerate the report to see updated state.');
  } catch (err) {
    console.error('Unhandled error in retry-error-analyses.js:', err);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Unhandled top-level error:', e);
  process.exit(1);
});
