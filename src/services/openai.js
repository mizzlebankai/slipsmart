const fs = require('fs');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const PROMPT = `Analyse this football fixture screenshot and respond with ONLY valid JSON in this shape:
{"matches":[{"home":"string","away":"string","league":"string","kickoff":"string or null","probabilities":{"home":0.0,"draw":0.0,"away":0.0},"fairOdds":{"home":0.0,"draw":0.0,"away":0.0},"recommendedPick":{"market":"string","odds":0.0},"confidence":1,"reasoning":"string"}],"slipSuggestion":{"picks":["string"],"combinedOdds":0.0,"bankrollAdvice":"string"},"disclaimer":"string"}`;

function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function request(content) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });
  if (!response.ok) {
    const error = new Error(`OpenAI responded ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned an empty response.');
  return JSON.parse(text);
}

async function generateOddsFromScreenshot(imagePath, mimeType) {
  if (!isConfigured()) throw new Error('OpenAI is not configured.');
  const data = fs.readFileSync(imagePath).toString('base64');
  return request([
    { type: 'text', text: PROMPT },
    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } },
  ]);
}

async function predictFixture(fixture) {
  if (!isConfigured()) throw new Error('OpenAI is not configured.');
  return request(`${PROMPT}\nFixture: ${fixture.home} vs ${fixture.away}\nCompetition: ${fixture.league}\nKickoff: ${fixture.kickoff || 'not scheduled'}`);
}

module.exports = { isConfigured, generateOddsFromScreenshot, predictFixture };
