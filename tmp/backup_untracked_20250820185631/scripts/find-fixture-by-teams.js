import fetch from 'node-fetch';

(async () => {
  try {
    const res = await fetch('http://localhost:3001/api/betting/fixtures/today');
    if (!res.ok) {
      console.error('FETCH_FAILED', res.status, await res.text());
      process.exit(2);
    }
    const body = await res.json();
    const homeName = process.argv[2] || 'Rangers';
    const awayName = process.argv[3] || 'Club Brugge';
    const found = (body.data || []).find(f => {
      const h = String(f.teams?.home?.name || '').toLowerCase();
      const a = String(f.teams?.away?.name || '').toLowerCase();
      return (h.includes(homeName.toLowerCase()) && a.includes(awayName.toLowerCase())) ||
             (h.includes(awayName.toLowerCase()) && a.includes(homeName.toLowerCase()));
    });
    if (!found) {
      console.log(JSON.stringify({ found: false }, null, 2));
      process.exit(0);
    }
    console.log(JSON.stringify({ found: true, fixture: found }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('ERROR', e.message || e);
    process.exit(1);
  }
})();
