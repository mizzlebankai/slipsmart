const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

const PROMPT = `You are a professional football betting analyst. The user uploaded a screenshot listing football matches (for example from a betting app or fixture list).

Tasks:
1. Extract every match visible in the screenshot: home team, away team, league/competition, and kickoff date/time if shown.
2. For each match, estimate 1X2 probabilities (home win / draw / away win) and convert them to fair decimal odds. Round odds to 2 decimal places.
3. Recommend the single best market for each match (e.g. "1X", "Over 2.5", "BTTS", "Away win") with odds for that pick.
4. Rate your confidence from 1 to 10 and give a one-sentence reason.

Also produce a short "slipSuggestion": the 2-4 safest picks combined into one example slip with a combined odds figure, and one sentence of bankroll advice.

Respond with ONLY a JSON object in exactly this shape (no markdown fences, no commentary):
{
  "matches": [
    {
      "home": "string",
      "away": "string",
      "league": "string",
      "kickoff": "string or null",
      "probabilities": { "home": 0.0, "draw": 0.0, "away": 0.0 },
      "fairOdds": { "home": 0.0, "draw": 0.0, "away": 0.0 },
      "recommendedPick": { "market": "string", "odds": 0.0 },
      "confidence": 1,
      "reasoning": "string"
    }
  ],
  "slipSuggestion": { "picks": ["string"], "combinedOdds": 0.0, "bankrollAdvice": "string" },
  "disclaimer": "string"}`;

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const RETRYABLE_STATUSES = new Set(['UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'DEADLINE_EXCEEDED']);
const RETRYABLE_CODES = new Set([429, 500, 502, 503]);
const BACKOFF_MS = [3000, 8000, 20000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err) {
  if (isQuotaExceeded(err)) return false;
  const status = Number(err?.status ?? err?.code);
  const causeCode = err?.cause?.code;
  return RETRYABLE_STATUSES.has(err?.status)
    || RETRYABLE_CODES.has(status)
    || causeCode === 'ECONNRESET'
    || causeCode === 'ECONNREFUSED'
    || causeCode === 'ETIMEDOUT'
    || err?.message === 'fetch failed';
}

function isQuotaExceeded(err) {
  return err?.status === 'RESOURCE_EXHAUSTED'
    && /quota|exceeded|free.?tier/i.test(err?.message || '');
}

function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI did not return a JSON object.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function generateWithRetry(contents, maxOutputTokens) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastErr;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          maxOutputTokens,
          responseMimeType: 'application/json',
        },
      });
      const text = response.text;
      if (!text) throw new Error('Gemini returned an empty response.');
      return extractJson(text);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === BACKOFF_MS.length) break;
      await sleep(BACKOFF_MS[attempt]);
    }
  }
  if (isQuotaExceeded(lastErr)) {
    const quotaError = new Error('Gemini daily quota has been reached. Wait for the quota to reset or enable billing/use a project with available Gemini quota.');
    quotaError.status = 429;
    throw quotaError;
  }
  throw lastErr;
}

function notConfiguredError() {
  const err = new Error('AI odds generator is not configured yet. Add GEMINI_API_KEY to the .env file.');
  err.status = 503;
  return err;
}

async function generateOddsFromScreenshot(imagePath, mimeType) {
  if (!isConfigured()) throw notConfiguredError();
  const data = fs.readFileSync(imagePath).toString('base64');
  return generateWithRetry(
    {
      role: 'user',
      parts: [
        { inlineData: { mimeType, data } },
        { text: PROMPT },
      ],
    },
    4000
  );
}

const FIXTURE_PROMPT = `You are a professional football betting analyst. Analyse the football fixture described below and estimate outcome probabilities.

Estimate 1X2 probabilities (home win / draw / away win) and convert them to fair decimal odds rounded to 2 decimal places. Then recommend the single best market for this match (e.g. "1X", "Over 2.5", "BTTS", "Home win") with odds for that pick. Rate your confidence from 1 to 10 and give a one-sentence reason based on the available information.

Respond with ONLY a JSON object in exactly this shape (no markdown fences, no commentary):
{
  "probabilities": { "home": 0.0, "draw": 0.0, "away": 0.0 },
  "fairOdds": { "home": 0.0, "draw": 0.0, "away": 0.0 },
  "recommendedPick": { "market": "string", "odds": 0.0 },
  "confidence": 1,
  "reasoning": "string",
  "disclaimer": "string"
}`;

function buildFixtureText(fixture) {
  const lines = [
    `Match: ${fixture.home} vs ${fixture.away}`,
    `Competition: ${fixture.league}${fixture.country ? ` (${fixture.country})` : ''}`,
    `Kickoff: ${fixture.kickoff ? new Date(fixture.kickoff).toUTCString() : 'not scheduled yet'}`,
    `Venue: ${fixture.venue || 'unknown'}`,
  ];
  const live = ['1H', '2H', 'HT', 'ET'].includes(fixture.status);
  if (live) {
    lines.push(`LIVE: score ${fixture.homeScore ?? 0}-${fixture.awayScore ?? 0}, minute ${fixture.minute ?? 'unknown'} (${fixture.status})`);
  } else if (fixture.homeScore !== null && fixture.homeScore !== undefined) {
    lines.push(`Final score: ${fixture.homeScore}-${fixture.awayScore} (${fixture.status})`);
  }
  if (fixture.h2h && fixture.h2h.length) {
    lines.push('Recent meetings between these teams:');
    for (const h of fixture.h2h) {
      lines.push(`- ${h.home} ${h.homeScore ?? '?'}–${h.awayScore ?? '?'} ${h.away} (${h.league || 'league unknown'}, ${h.date ? new Date(h.date).toISOString().slice(0, 10) : 'date unknown'})`);
    }
  }
  const usefulStats = (fixture.stats || []).filter((s) => s.home !== null && s.away !== null).slice(0, 8);
  if (usefulStats.length) {
    lines.push('Match stats so far:');
    for (const s of usefulStats) lines.push(`- ${s.name}: ${s.homeRaw} vs ${s.awayRaw}`);
  }
  return lines.join('\n');
}

async function predictFixture(fixture) {
  if (!isConfigured()) throw notConfiguredError();
  return generateWithRetry(
    {
      role: 'user',
      parts: [{ text: `${FIXTURE_PROMPT}\n\nFixture to analyse:\n${buildFixtureText(fixture)}` }],
    },
    1500
  );
}

module.exports = { isConfigured, generateOddsFromScreenshot, predictFixture };
