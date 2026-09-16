const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const BASE = 'https://api.football-data.org/v4';

function normalize(match) {
  const score = match.score?.fullTime || {};
  const live = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  return {
    id: 2000000 + Number(match.id),
    externalId: match.id,
    league: match.competition?.name || '',
    country: match.area?.name || '',
    home: match.homeTeam?.name || 'Home',
    away: match.awayTeam?.name || 'Away',
    homeLogo: match.homeTeam?.crest || '',
    awayLogo: match.awayTeam?.crest || '',
    homeScore: score.home ?? null,
    awayScore: score.away ?? null,
    status: live ? (match.status === 'PAUSED' ? 'HT' : 'LIVE') : match.status || '',
    minute: null,
    kickoff: match.utcDate || null,
    venue: '',
  };
}

async function getMatches(params) {
  if (!API_KEY) return [];
  const url = new URL(BASE + '/matches');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { 'X-Auth-Token': API_KEY } });
  if (!response.ok) throw new Error(`Football-Data.org responded ${response.status}`);
  const data = await response.json();
  return (data.matches || []).map(normalize);
}

async function getLiveFixtures() {
  return { demo: false, source: 'Football-Data.org', updatedAt: new Date().toISOString(), matches: await getMatches({ status: 'LIVE' }) };
}

async function getTodayFixtures() {
  const date = new Date().toISOString().slice(0, 10);
  return { demo: false, source: 'Football-Data.org', updatedAt: new Date().toISOString(), matches: await getMatches({ dateFrom: date, dateTo: date }) };
}

module.exports = { isConfigured: () => Boolean(API_KEY), getLiveFixtures, getTodayFixtures };