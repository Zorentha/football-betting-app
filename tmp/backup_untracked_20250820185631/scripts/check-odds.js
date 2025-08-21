import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const baseUrl = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
const apiKey = process.env.API_FOOTBALL_KEY;
const headers = {
  'x-rapidapi-key': apiKey,
  'x-rapidapi-host': 'v3.football.api-sports.io'
};

if (!apiKey) {
  console.error('ERROR: API_FOOTBALL_KEY is not set in environment. Aborting.');
  process.exit(1);
}

async function checkOddsForFixture(fixtureId) {
  try {
    const url = `${baseUrl}/odds`;
    const resp = await axios.get(url, {
      headers,
      params: { fixture: fixtureId }
    });

    const data = resp.data;
    if (!data || !Array.isArray(data.response) || data.response.length === 0) {
      console.log(`Fixture ${fixtureId}: no odds data returned (response empty).`);
      return { fixtureId, hasOdds: false, details: null };
    }

    // Data may contain bookmakers and markets
    const respItem = data.response[0];
    const bookmakers = respItem.bookmakers || [];
    if (!bookmakers.length) {
      console.log(`Fixture ${fixtureId}: response present but no bookmakers/odds found.`);
      return { fixtureId, hasOdds: false, details: respItem };
    }

    // Summarize bookmakers and first market outcomes
    const summary = bookmakers.map(b => {
      const markets = b.markets || [];
      const firstMarket = markets[0] || null;
      const outcomes = firstMarket ? (firstMarket.outcomes || []).slice(0, 5) : [];
      return {
        bookmaker: b.name || b.bookmaker || b.key || 'unknown',
        marketCount: markets.length,
        firstMarketKey: firstMarket ? firstMarket.key || firstMarket.market : null,
        outcomes: outcomes.map(o => ({ name: o.name, price: o.price }))
      };
    });

    console.log(`Fixture ${fixtureId}: found odds from ${bookmakers.length} bookmakers.`);
    console.log(JSON.stringify(summary, null, 2));
    return { fixtureId, hasOdds: true, details: summary };
  } catch (err) {
    console.error(`ERROR fetching odds for fixture ${fixtureId}:`, err.message);
    return { fixtureId, error: err.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node scripts/check-odds.js <fixtureId1> [fixtureId2] [...]');
    process.exit(0);
  }

  for (const f of args) {
    const id = Number(f);
    if (Number.isNaN(id)) {
      console.log(`Skipping invalid fixture id: ${f}`);
      continue;
    }
    await checkOddsForFixture(id);
  }
}

main();
