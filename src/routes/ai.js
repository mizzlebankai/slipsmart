const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../session');
const gemini = require('../services/gemini');
const openai = require('../services/openai');
const { getFixtureDetail } = require('../services/apisports');

const router = express.Router();

async function generateWithFallback(method, ...args) {
  try {
    return { result: await gemini[method](...args), provider: 'Gemini' };
  } catch (err) {
    const canFallback = [429, 502, 503].includes(Number(err.status)) || err.status === 'RESOURCE_EXHAUSTED';
    if (!openai.isConfigured() || !canFallback) throw err;
    return { result: await openai[method](...args), provider: 'OpenAI' };
  }
}

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.png').toLowerCase();
      cb(null, `${req.user.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, WEBP or GIF screenshots are allowed.'));
    }
    cb(null, true);
  },
});

// Simple in-memory rate limit: 5 generations per hour per user.
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const userHits = (hits.get(req.user.id) || []).filter((t) => now - t < windowMs);
  if (userHits.length >= 5) {
    return res.status(429).json({ error: 'Rate limit reached — max 5 AI generations per hour.' });
  }
  userHits.push(now);
  hits.set(req.user.id, userHits);
  next();
}

router.get('/status', (req, res) => {
  res.json({
    configured: gemini.isConfigured() || openai.isConfigured(),
    credits: req.user ? req.user.ai_credits : 0,
    loggedIn: Boolean(req.user),
  });
});

router.post('/generate', requireAuth, rateLimit, (req, res) => {
  upload.single('screenshot')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Please upload a screenshot image.' });

    try {
      if (!gemini.isConfigured() && !openai.isConfigured()) {
        fs.unlink(req.file.path, () => {});
        return res.status(503).json({
          error: 'AI odds generator is not configured yet. Add GEMINI_API_KEY to the .env file, then restart the server.',
        });
      }

      const fresh = db.prepare('SELECT ai_credits FROM users WHERE id = ?').get(req.user.id);
      if (!req.user.is_admin && fresh.ai_credits < 1) {
        fs.unlink(req.file.path, () => {});
        return res.status(402).json({ error: 'You need an AI credit to generate odds. Buy a pack to continue.' });
      }

      const generated = await generateWithFallback('generateOddsFromScreenshot', req.file.path, req.file.mimetype);
      const result = generated.result;

      if (!req.user.is_admin) db.prepare('UPDATE users SET ai_credits = ai_credits - 1 WHERE id = ?').run(req.user.id);
      db.prepare('INSERT INTO ai_generations (user_id, filename, result_json, created_at) VALUES (?, ?, ?, ?)')
        .run(req.user.id, req.file.filename, JSON.stringify(result), Date.now());

      const credits = db.prepare('SELECT ai_credits FROM users WHERE id = ?').get(req.user.id).ai_credits;
      res.json({ result, creditsLeft: credits });
    } catch (err) {
      fs.unlink(req.file.path, () => {});
      if (process.env.NODE_ENV !== 'production') console.error('[ai generation]', err);
      const status = err.status || 502;
      const message = status === 429
        ? 'AI is temporarily busy. Please try again later.'
        : 'AI analysis is temporarily unavailable. Please try again later.';
      res.status(status).json({ error: message });
    }
  });
});

// Separate, lighter limit for single-fixture predictions: 10 per hour per user.
const predictHits = new Map();
function predictRateLimit(req, res, next) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const userHits = (predictHits.get(req.user.id) || []).filter((t) => now - t < windowMs);
  if (userHits.length >= 10) {
    return res.status(429).json({ error: 'Rate limit reached — max 10 AI predictions per hour.' });
  }
  userHits.push(now);
  predictHits.set(req.user.id, userHits);
  next();
}

router.post('/predict-fixture', requireAuth, predictRateLimit, async (req, res) => {
  const fixtureId = Number(req.body?.fixtureId);
  if (!Number.isInteger(fixtureId) || fixtureId < 1) {
    return res.status(400).json({ error: 'A valid fixture id is required.' });
  }
  try {
    if (!gemini.isConfigured() && !openai.isConfigured()) {
      return res.status(503).json({ error: 'AI odds generator is not configured yet. Add GEMINI_API_KEY to the .env file, then restart the server.' });
    }

    const fresh = db.prepare('SELECT ai_credits FROM users WHERE id = ?').get(req.user.id);
    if (!req.user.is_admin && fresh.ai_credits < 1) {
      return res.status(402).json({ error: 'You need an AI credit for a prediction. Buy a pack to continue.' });
    }

    let fixture;
    try {
      fixture = await getFixtureDetail(fixtureId);
    } catch (err) {
      return res.status(err.status || 502).json({ error: `Could not load this fixture: ${err.message}` });
    }

    const generated = await generateWithFallback('predictFixture', fixture);
    const result = generated.result;

    if (!req.user.is_admin) db.prepare('UPDATE users SET ai_credits = ai_credits - 1 WHERE id = ?').run(req.user.id);
    const credits = db.prepare('SELECT ai_credits FROM users WHERE id = ?').get(req.user.id).ai_credits;
    res.json({ result, creditsLeft: credits });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[ai prediction]', err);
    const status = err.status || 502;
    const message = status === 429
      ? 'AI predictions are temporarily busy. Please try again later.'
      : 'AI prediction is temporarily unavailable. Please try again later.';
    res.status(status).json({ error: message });
  }
});

router.get('/history', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT id, filename, result_json, created_at FROM ai_generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(req.user.id);
  res.json({
    generations: rows.map((r) => ({ id: r.id, filename: r.filename, createdAt: r.created_at, result: JSON.parse(r.result_json) })),
  });
});

module.exports = router;
