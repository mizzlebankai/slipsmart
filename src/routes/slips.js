const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../session');

const router = express.Router();

function ownsSlip(userId, slipId) {
  return Boolean(
    db
      .prepare("SELECT id FROM purchases WHERE user_id = ? AND slip_id = ? AND status = 'completed'")
      .get(userId, slipId)
  );
}

function shape(s, user) {
  const owned = user ? ownsSlip(user.id, s.id) || Boolean(user.is_admin) : false;
  return {
    id: s.id,
    title: s.title,
    league: s.league,
    oddsSummary: s.odds_summary,
    priceGhs: s.price_ghs,
    description: s.description,
    owned,
    isActive: Boolean(s.is_active),
    createdAt: s.created_at,
  };
}

router.get('/', (req, res) => {
  const admin = Boolean(req.user && req.user.is_admin);
  const slips = admin
    ? db.prepare('SELECT * FROM slips ORDER BY created_at DESC').all()
    : db.prepare('SELECT * FROM slips WHERE is_active = 1 ORDER BY created_at DESC').all();
  res.json({ slips: slips.map((s) => shape(s, req.user)) });
});

router.get('/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM slips WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Slip not found.' });

  const owned = req.user ? ownsSlip(req.user.id, s.id) || Boolean(req.user.is_admin) : false;
  const out = shape(s, req.user);
  if (owned) out.content = s.content;
  res.json({ slip: out });
});

router.post('/', requireAdmin, (req, res) => {
  const { title, league, oddsSummary, priceGhs, description, content } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Slip title is required.' });
  const price = Number(priceGhs);
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Price must be a valid number (GHS).' });

  const result = db
    .prepare(
      `INSERT INTO slips (title, league, odds_summary, price_ghs, description, content, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      String(title).trim(),
      String(league || '').trim(),
      String(oddsSummary || '').trim(),
      price,
      String(description || '').trim(),
      String(content || '').trim(),
      Date.now()
    );
  const slip = db.prepare('SELECT * FROM slips WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json({ slip: shape(slip, req.user) });
});

router.put('/:id', requireAdmin, (req, res) => {
  const s = db.prepare('SELECT * FROM slips WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Slip not found.' });

  const { title, league, oddsSummary, priceGhs, description, content, isActive } = req.body || {};
  db.prepare(
    `UPDATE slips SET title = ?, league = ?, odds_summary = ?, price_ghs = ?, description = ?, content = ?, is_active = ? WHERE id = ?`
  ).run(
    title !== undefined ? String(title).trim() : s.title,
    league !== undefined ? String(league).trim() : s.league,
    oddsSummary !== undefined ? String(oddsSummary).trim() : s.odds_summary,
    priceGhs !== undefined ? Number(priceGhs) : s.price_ghs,
    description !== undefined ? String(description).trim() : s.description,
    content !== undefined ? String(content).trim() : s.content,
    isActive !== undefined ? (isActive ? 1 : 0) : s.is_active,
    s.id
  );
  const slip = db.prepare('SELECT * FROM slips WHERE id = ?').get(s.id);
  res.json({ slip: shape(slip, req.user) });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const slip = db.prepare('SELECT id FROM slips WHERE id = ?').get(req.params.id);
  if (!slip) return res.status(404).json({ error: 'Slip not found.' });
  db.prepare('UPDATE purchases SET slip_id = NULL WHERE slip_id = ?').run(slip.id);
  db.prepare('DELETE FROM slips WHERE id = ?').run(slip.id);
  res.json({ ok: true });
});

router.get('/purchased/mine', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.* FROM purchases p JOIN slips s ON s.id = p.slip_id
       WHERE p.user_id = ? AND p.status = 'completed' ORDER BY p.paid_at DESC`
    )
    .all(req.user.id);
  res.json({ slips: rows.map((s) => ({ ...shape(s, req.user), content: s.content })) });
});

module.exports = router;
