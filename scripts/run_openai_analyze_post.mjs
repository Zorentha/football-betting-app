import fs from 'fs/promises';
import path from 'path';
import process from 'process';

async function run() {
  try {
    const payloadPath = path.resolve('tmp/annotate_payload_1435547.json');
    const outPath = path.resolve('tmp/annotate_strict_run_result.json');
    const payload = await fs.readFile(payloadPath, 'utf8');

    const res = await fetch('http://localhost:3001/api/betting/openai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });

    const text = await res.text();
    // Try to parse JSON body, but save raw text as well
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      parsed = { rawText: text };
    }

    await fs.writeFile(outPath, JSON.stringify(parsed, null, 2), 'utf8');
    console.log('Wrote response to', outPath);
    console.log('---- RESPONSE ----');
    console.log(JSON.stringify(parsed, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('ERROR_POST', e && e.message ? e.message : e);
    process.exit(1);
  }
}

run();
