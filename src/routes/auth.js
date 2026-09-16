const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { createSession, destroySession, requireAuth } = require('../session');
const firebase = require('../services/firebase');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const adminEmails = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

router.post('/register', (req, res) => {
  if (firebase.isConfigured()) return res.status(410).json({ error: 'Use Firebase authentication to create an account.' });
  const { email, name, password } = req.body || {};
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'Name, email and password are all required.' });
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const hash = bcrypt.hashSync(String(password), 10);
  const isAdmin = adminEmails().includes(email.toLowerCase()) ? 1 : 0;
  const result = db
    .prepare('INSERT INTO users (email, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(email.toLowerCase(), String(name).trim(), hash, isAdmin, Date.now());

  createSession(res, Number(result.lastInsertRowid));
  const user = db.prepare('SELECT id, email, name, ai_credits, is_admin FROM users WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json({ user });
});

router.post('/login', (req, res) => {
  if (firebase.isConfigured()) return res.status(410).json({ error: 'Use Firebase authentication to log in.' });
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  createSession(res, row.id);
  res.json({ user: { id: row.id, email: row.email, name: row.name, ai_credits: row.ai_credits, is_admin: row.is_admin } });
});

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user });
});

router.post('/sync', requireAuth, (req, res) => res.json({ user: req.user }));

router.put('/me', requireAuth, (req, res) => {
  const { name, password } = req.body || {};
  if (name && String(name).trim()) {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(name).trim(), req.user.id);
  }
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(password), 10), req.user.id);
  }
  const user = db.prepare('SELECT id, email, name, ai_credits, is_admin FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

module.exports = router;
