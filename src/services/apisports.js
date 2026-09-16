const API_KEY = process.env.APISPORTS_KEY;
const BASE = 'https://v3.football.api-sports.io';
const CACHE_TTL = 60 * 1000;
const cache = new Map();

async function apiGet(path, params) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
  if (!res.ok) throw new Error(`API-SPORTS responded ${res.status}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length) {
    throw new Error(`API-SPORTS error: ${JSON.stringify(data.errors)}`);
  }
  return data.response;
}

function normalize(fixture) {
  return {
    id: fixture.fixture.id,
    league: fixture.league?.name || '',
    country: fixture.league?.country || '',
    home: fixture.teams?.home?.name || 'Home',
    away: fixture.teams?.away?.name || 'Away',
    homeLogo: fixture.teams?.home?.logo || '',
    awayLogo: fixture.teams?.away?.logo || '',
    homeScore: fixture.goals?.home,
    awayScore: fixture.goals?.away,
    status: fixture.fixture?.status?.short || '',
    minute: fixture.fixture?.status?.elapsed || null,
    kickoff: fixture.fixture?.date || null,
    venue: fixture.fixture?.venue?.name || '',
  };
}

function statNum(value) {
  if (value === null || value === undefined) return null;
  const n = parseFloat(String(value).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeDetail(fixture, events, statsEntries, h2hFixtures) {
  const base = normalize(fixture);
  const homeId = fixture.teams?.home?.id;
  const awayId = fixture.teams?.away?.id;

  const eventsOut = (events || [])
    .map((e) => ({
      minute: e.time?.elapsed ?? null,
      extra: e.time?.extra ?? null,
      team: e.team?.id === awayId ? 'away' : 'home',
      type: e.type || '',
      detail: e.detail || '',
      player: e.player?.name || '',
    }))
    .sort((a, b) => (b.minute ?? 9999) - (a.minute ?? 9999));

  const homeStats = (statsEntries || []).find((s) => s.team?.id === homeId)?.statistics || [];
  const awayStats = (statsEntries || []).find((s) => s.team?.id === awayId)?.statistics || [];
  const statsOut = homeStats
    .map((s) => {
      const awayVal = awayStats.find((a) => a.type === s.type)?.value;
      return { name: s.type, home: statNum(s.value), away: statNum(awayVal), homeRaw: s.value ?? '—', awayRaw: awayVal ?? '—' };
    })
    .filter((s) => s.home !== null || s.away !== null);

  const h2hOut = (h2hFixtures || []).slice(0, 5).map((f) => ({
    date: f.fixture?.date || null,
    league: f.league?.name || '',
    home: f.teams?.home?.name || '',
    away: f.teams?.away?.name || '',
    homeScore: f.goals?.home,
    awayScore: f.goals?.away,
  }));

  return { ...base, events: eventsOut, stats: statsOut, h2h: h2hOut };
}

function demoDetail(id) {
  const all = [...DEMO.live, ...DEMO.today];
  const base = all.find((m) => m.id === Number(id));
  if (!base) {
    const err = new Error('Fixture not found.');
    err.status = 404;
    throw err;
  }
  const events = [];
  if (base.homeScore) {
    for (let i = 0; i < base.homeScore; i++) events.push({ minute: 12 + i * 22, extra: null, team: 'home', type: 'Goal', detail: 'Goal', player: 'Demo scorer' });
  }
  if (base.awayScore) {
    for (let i = 0; i < base.awayScore; i++) events.push({ minute: 20 + i * 25, extra: null, team: 'away', type: 'Goal', detail: 'Goal', player: 'Demo scorer' });
  }
  return { demo: true, ...base, events, stats: [], h2h: [] };
}

async function getFixtureDetail(id) {
  if (!API_KEY) return demoDetail(id);
  return cached('detail:' + id, async () => {
    const fixtures = await apiGet('/fixtures', { id });
    if (!fixtures.length) {
      const err = new Error('Fixture not found.');
      err.status = 404;
      throw err;
    }
    const fixture = fixtures[0];
    const h2hId = `${fixture.teams.home.id}-${fixture.teams.away.id}`;
    const [events, statsEntries, h2hFixtures] = await Promise.all([
      apiGet('/fixtures/events', { fixture: id }).catch(() => []),
      apiGet('/fixtures/statistics', { fixture: id }).catch(() => []),
      apiGet('/fixtures/headtohead', { h2h: h2hId, last: 5 }).catch(() => []),
    ]);
    return { demo: false, ...normalizeDetail(fixture, events, statsEntries, h2hFixtures) };
  }, 2 * 60 * 1000);
}

async function cached(key, fn, ttl = CACHE_TTL) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + ttl });
  return value;
}

const DEMO = {
  live: [
    { id: 9001, league: 'Premier League', country: 'England', home: 'Arsenal', away: 'Chelsea', homeLogo: 'https://media.api-sports.io/football/teams/42.png', awayLogo: 'https://media.api-sports.io/football/teams/49.png', homeScore: 2, awayScore: 1, status: '2H', minute: 67, kickoff: null, venue: 'Emirates Stadium' },
    { id: 9002, league: 'La Liga', country: 'Spain', home: 'Sevilla', away: 'Valencia', homeLogo: 'https://media.api-sports.io/football/teams/536.png', awayLogo: 'https://media.api-sports.io/football/teams/532.png', homeScore: 0, awayScore: 0, status: '1H', minute: 23, kickoff: null, venue: 'Ramón Sánchez-Pizjuán' },
    { id: 9003, league: 'Bundesliga', country: 'Germany', home: 'Dortmund', away: 'Leverkusen', homeLogo: 'https://media.api-sports.io/football/teams/165.png', awayLogo: 'https://media.api-sports.io/football/teams/168.png', homeScore: 1, awayScore: 2, status: '2H', minute: 74, kickoff: null, venue: 'Signal Iduna Park' },
  ],
  today: [
    { id: 9101, league: 'Premier League', country: 'England', home: 'Liverpool', away: 'Man City', homeLogo: 'https://media.api-sports.io/football/teams/40.png', awayLogo: 'https://media.api-sports.io/football/teams/50.png', homeScore: null, awayScore: null, status: 'NS', minute: null, kickoff: '2026-09-15T16:30:00Z', venue: 'Anfield' },
    { id: 9102, league: 'La Liga', country: 'Spain', home: 'Real Madrid', away: 'Atlético Madrid', homeLogo: 'https://media.api-sports.io/football/teams/541.png', awayLogo: 'https://media.api-sports.io/football/teams/530.png', homeScore: null, awayScore: null, status: 'NS', minute: null, kickoff: '2026-09-15T19:00:00Z', venue: 'Santiago Bernabéu' },
    { id: 9103, league: 'Serie A', country: 'Italy', home: 'Inter', away: 'Napoli', homeLogo: 'https://media.api-sports.io/football/teams/505.png', awayLogo: 'https://media.api-sports.io/football/teams/492.png', homeScore: null, awayScore: null, status: 'NS', minute: null, kickoff: '2026-09-15T18:45:00Z', venue: 'San Siro' },
    { id: 9104, league: 'Ligue 1', country: 'France', home: 'PSG', away: 'Marseille', homeLogo: 'https://media.api-sports.io/football/teams/85.png', awayLogo: 'https://media.api-sports.io/football/teams/81.png', homeScore: null, awayScore: null, status: 'NS', minute: null, kickoff: '2026-09-15T18:45:00Z', venue: 'Parc des Princes' },
    { id: 9105, league: 'Eredivisie', country: 'Netherlands', home: 'Ajax', away: 'Feyenoord', homeLogo: 'https://media.api-sports.io/football/teams/194.png', awayLogo: 'https://media.api-sports.io/football/teams/209.png', homeScore: null, awayScore: null, status: 'NS', minute: null, kickoff: '2026-09-15T19:00:00Z', venue: 'Johan Cruyff Arena' },
    { id: 9106, league: 'Premier League', country: 'England', home: 'Newcastle', away: 'Aston Villa', homeLogo: 'https://media.api-sports.io/football/teams/34.png', awayLogo: 'https://media.api-sports.io/football/teams/66.png', homeScore: null, awayScore: null, status: 'NS', minute: null, kickoff: '2026-09-15T19:30:00Z', venue: "St James' Park" },
  ],
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function getLiveFixtures(force = false) {
  if (!API_KEY) return { demo: true, updatedAt: new Date().toISOString(), matches: DEMO.live };
  const matches = force ? await apiGet('/fixtures', { live: 'all' }) : await cached('live', () => apiGet('/fixtures', { live: 'all' }));
  return { demo: false, source: 'API-Sports', updatedAt: new Date().toISOString(), matches: matches.map(normalize) };
}

async function getTodayFixtures(force = false) {
  if (!API_KEY) return { demo: true, updatedAt: new Date().toISOString(), matches: DEMO.today };
  const matches = force ? await apiGet('/fixtures', { date: todayStr() }) : await cached('today', () => apiGet('/fixtures', { date: todayStr() }));
  return { demo: false, source: 'API-Sports', updatedAt: new Date().toISOString(), matches: matches.map(normalize) };
}

module.exports = { getLiveFixtures, getTodayFixtures, getFixtureDetail };
