const express = require('express');
const { getLiveFixtures, getTodayFixtures, getFixtureDetail } = require('../services/apisports');
const footballData = require('../services/football-data');

const router = express.Router();

router.get('/live', async (req, res) => {
  try {
    res.json(await getLiveFixtures());
  } catch (err) {
    res.status(502).json({ error: `Could not load live matches: ${err.message}` });
  }
});

router.get('/today', async (req, res) => {
  try {
    res.json(await getTodayFixtures());
  } catch (err) {
    res.status(502).json({ error: `Could not load today's matches: ${err.message}` });
  }
});

router.get('/sources/:tab', async (req, res) => {
  if (!['live', 'today'].includes(req.params.tab)) return res.status(400).json({ error: 'Invalid matches tab.' });
  const primary = req.params.tab === 'live' ? getLiveFixtures : getTodayFixtures;
  const secondary = req.params.tab === 'live' ? footballData.getLiveFixtures : footballData.getTodayFixtures;
  const force = req.query.refresh === '1';
  const results = await Promise.allSettled([primary(force), secondary()]);
  res.json({ sources: results.map((result, index) => ({
    source: index === 0 ? 'Live feed' : 'Backup live feed',
    configured: index === 0 ? Boolean(process.env.APISPORTS_KEY) : footballData.isConfigured(),
    data: result.status === 'fulfilled'
      ? result.value
      : { matches: [], unavailable: true, error: process.env.NODE_ENV === 'development' ? result.reason.message : undefined },
  })) });
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid fixture id.' });
  try {
    res.json(await getFixtureDetail(id));
  } catch (err) {
    res.status(err.status || 502).json({ error: `Could not load fixture: ${err.message}` });
  }
});

module.exports = router;
