import fs from 'fs/promises';
import path from 'path';

const OUT_DIR = path.join(process.cwd(), 'tmp_analysis_all');
const SEEN_FILE = path.join(process.cwd(), 'tmp', 'retry-seen.json');
const STATUS_FILE = path.join(process.cwd(), 'tmp', 'retry_status.txt');
const POLL_MS = 1000;

async function loadSeen() {
  try {
    const raw = await fs.readFile(SEEN_FILE, 'utf8');
    return new Set(JSON.parse(raw));
  } catch (e) {
    return new Set();
  }
}

async function saveSeen(set) {
  try {
    await fs.mkdir(path.dirname(SEEN_FILE), { recursive: true });
    await fs.writeFile(SEEN_FILE, JSON.stringify(Array.from(set), null, 2), 'utf8');
  } catch (e) { /* ignore */ }
}

async function appendStatus(line) {
  const ts = new Date().toISOString();
  const out = `${ts} ${line}\n`;
  try {
    await fs.appendFile(STATUS_FILE, out, 'utf8');
  } catch (e) { /* ignore */ }
}

function isSuccessFile(fname) {
  return /^tmp_analysis_(\d+)\.json$/.test(fname);
}

async function poll() {
  const seen = await loadSeen();
  while (true) {
    try {
      const files = await fs.readdir(OUT_DIR);
      for (const f of files) {
        if (!isSuccessFile(f)) continue;
        if (seen.has(f)) continue;
        // new success file
        seen.add(f);
        const m = f.match(/^tmp_analysis_(\d+)\.json$/);
        const fixtureId = m ? m[1] : 'unknown';
        const msg = `Saved success -> ${path.join(OUT_DIR, f)} (fixture ${fixtureId})`;
        console.log(msg);
        await appendStatus(msg);
        await saveSeen(seen);
      }
    } catch (e) {
      // directory may not exist yet; skip
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(res => setTimeout(res, POLL_MS));
  }
}

poll().catch(e => {
  console.error('Watcher error:', e);
  process.exit(1);
});
