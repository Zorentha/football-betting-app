import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';

const ERROR_REPORT = path.join(process.cwd(), 'tmp', 'error-report.json');
const SEEN_FILE = path.join(process.cwd(), 'tmp', 'retry-seen.json');
const STATUS_FILE = path.join(process.cwd(), 'tmp', 'retry_status.txt');
const POLL_MS = 5000;

function now() {
  return new Date().toISOString();
}

async function loadErrorTimeoutFixtureIds() {
  try {
    const raw = await fs.readFile(ERROR_REPORT, 'utf8');
    const arr = JSON.parse(raw);
    const ids = new Set();
    for (const e of arr) {
      if (!e || !e.error || !e.fixtureId) continue;
      if (String(e.error).toLowerCase().includes('timeout')) ids.add(Number(e.fixtureId));
    }
    return ids;
  } catch (e) {
    return new Set();
  }
}

async function loadSeenFixtureFiles() {
  try {
    const raw = await fs.readFile(SEEN_FILE, 'utf8');
    const arr = JSON.parse(raw);
    const ids = new Set();
    for (const f of arr) {
      const m = f.match(/^tmp_analysis_(\d+)\.json$/);
      if (m) ids.add(Number(m[1]));
    }
    return ids;
  } catch (e) {
    return new Set();
  }
}

async function appendStatus(line) {
  const out = `${now()} ${line}\n`;
  await fs.appendFile(STATUS_FILE, out, 'utf8').catch(()=>{});
}

function runCmd(cmd, args, outPath) {
  appendStatus(`Running: ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  const out = `stdout:\n${res.stdout || ''}\nstderr:\n${res.stderr || ''}\nexitCode:${res.status}\n`;
  if (outPath) {
    try { fs.writeFile(outPath, out, 'utf8'); } catch (e) {}
  }
  appendStatus(`Finished: ${cmd} ${args.join(' ')} -> exit ${res.status}`);
  return res.status === 0;
}

async function main() {
  const expected = await loadErrorTimeoutFixtureIds();
  if (expected.size === 0) {
    await appendStatus('No timeout entries found in tmp/error-report.json — nothing to wait for.');
    process.exit(0);
  }
  await appendStatus(`Waiting for ${expected.size} timeout fixture(s) to be retried: ${Array.from(expected).join(', ')}`);

  while (true) {
    const seen = await loadSeenFixtureFiles();
    const matched = Array.from(expected).filter(id => seen.has(id));
    await appendStatus(`Progress: ${matched.length}/${expected.size} retried successfully.`);
    if (matched.length >= expected.size) {
      await appendStatus('All timeout fixtures retried (or detected). Proceeding to generate report and import (dry-run).');
      // generate-analysis-report
      runCmd('node', ['scripts/generate-analysis-report.js'], path.join(process.cwd(), 'tmp', 'generate-analysis-report.output.txt'));
      // import-tmp-analyses (dry-run)
      runCmd('node', ['scripts/import-tmp-analyses.js'], path.join(process.cwd(), 'tmp', 'import-tmp-analyses.dryrun.output.txt'));
      await appendStatus('generate-analysis-report.js and import-tmp-analyses.js (dry-run) completed. Check tmp/*.output.txt for details.');
      // Update retry_status
      await appendStatus('Retry sequence completed. Import performed in dry-run mode. Update tmp/retry_status.txt status externally if needed.');
      process.exit(0);
    }
    await new Promise(res => setTimeout(res, POLL_MS));
  }
}

main().catch(async (e) => {
  await appendStatus('auto-run-after-retry encountered error: ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
