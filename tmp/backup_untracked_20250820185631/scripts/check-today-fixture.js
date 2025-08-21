import fetch from 'node-fetch';

(async () => {
  try {
    const res = await fetch('http://localhost:3001/api/betting/fixtures/today');
    if (!res.ok) {
      console.error('FETCH_FAILED', res.status, await res.text());
      process.exit(2);
    }
    const body = await res.json();
    const fixtureId = 1393286;
    const found = (body.data || []).find(f => f.fixture && Number(f.fixture.id) === fixtureId);
    console.log(JSON.stringify({ found: !!found, fixture: found || null }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('ERROR', e.message || e);
    process.exit(1);
  }
})();
