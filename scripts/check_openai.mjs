import fetch from 'node-fetch';
import fs from 'fs';

function loadKeyFromDotEnv() {
  try {
    const envText = fs.readFileSync('.env', 'utf8');
    const match = envText.match(/^\s*OPENAI_API_KEY\s*=\s*(.+)\s*$/m);
    if (match) {
      // Trim possible surrounding quotes
      return match[1].replace(/^["']|["']$/g, '').trim();
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function run() {
  let key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!key) {
    key = loadKeyFromDotEnv();
    if (key) {
      console.log('Loaded OPENAI_API_KEY from .env into process (temporary for this run).');
      process.env.OPENAI_API_KEY = key;
    }
  }

  console.log('OPENAI_API_KEY present:', !!key);
  if (!key) {
    console.error('No OPENAI API key found in environment variables or .env.');
    process.exit(2);
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('HTTP status:', res.status);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log('Response JSON keys:', Object.keys(json || {}));
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Non-JSON response:', text.slice(0, 1000));
    }
    process.exit(res.ok ? 0 : 1);
  } catch (e) {
    console.error('NETWORK_ERROR', e && e.message ? e.message : e);
    process.exit(3);
  }
}

run();
