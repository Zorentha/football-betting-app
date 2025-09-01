(async () => {
  try {
    // Node 18+ has global fetch
    const url = 'http://localhost:3001/api/betting/fixtures/1435547/analysis';
    console.log('Fetching', url);
    const res = await fetch(url, { method: 'GET' });
    console.log('HTTP status:', res.status);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Response (non-JSON):\n', text);
    }
    process.exit(0);
  } catch (err) {
    console.error('Fetch error:', err && err.stack ? err.stack : String(err));
    process.exit(2);
  }
})();
