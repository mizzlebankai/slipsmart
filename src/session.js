const crypto = require('crypto');
const db = require('./db');
const firebase = require('./services/firebase');

const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function createSession(res, userId) {
  const sid = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (sid, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(sid, userId, now, now + SESSION_TTL);
  res.cookie('sid', sid, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL,
    path: '/',
  });
  return sid;
}

function destroySession(req, res) {
  const sid = parseCookies(req).sid;
  if (sid) db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
  res.clearCookie('sid', { path: '/' });
}

async function attachSession(req, res, next) {
  req.cookies = parseCookies(req);
  req.user = null;
  const authorization = req.headers.authorization || '';
  if (authorization.startsWith('Bearer ')) {
    try {
      const decoded = await firebase.verifyIdToken(authorization.slice(7));
      req.firebaseEmailVerified = decoded.email_verified === true;
      const email = String(decoded.email || '').toLowerCase();
      const profile = await firebase.getUserProfile(decoded.uid);
      const isAdmin = adminEmails().includes(email) || decoded.admin === true || profile?.role === 'admin';
      let user = db.prepare('SELECT id, email, name, ai_credits, is_admin, created_at FROM users WHERE firebase_uid = ?').get(decoded.uid);
      if (!user) {
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
          db.prepare('UPDATE users SET firebase_uid = ?, is_admin = ? WHERE id = ?').run(decoded.uid, isAdmin ? 1 : 0, existing.id);
        } else {
          const result = db.prepare(
            'INSERT INTO users (firebase_uid, email, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(decoded.uid, email, decoded.name || email.split('@')[0], '', isAdmin ? 1 : 0, Date.now());
          await firebase.createUserProfile(decoded.uid, { email, name: decoded.name || '', role: isAdmin ? 'admin' : 'user' });
          user = { id: Number(result.lastInsertRowid), email, name: decoded.name || email.split('@')[0], ai_credits: 0, is_admin: isAdmin ? 1 : 0, created_at: Date.now() };
        }
        user = db.prepare('SELECT id, email, name, ai_credits, is_admin, created_at FROM users WHERE firebase_uid = ?').get(decoded.uid);
      }
      req.firebaseUid = decoded.uid;
      if (user && Boolean(user.is_admin) !== isAdmin) {
        db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, user.id);
        user.is_admin = isAdmin ? 1 : 0;
      }
      if (req.firebaseEmailVerified) req.user = user;
      return next();
    } catch (err) {
      // Treat an expired browser token as logged out for public endpoints.
      // Protected routes still reject the request through requireAuth.
      if (process.env.NODE_ENV !== 'production') {
        console.error('[firebase auth]', err.code || err.name || 'unknown', err.message || err);
      }
      req.firebaseAuthError = err;
    }
  }
  const sid = req.cookies.sid;
  if (sid) {
    const row = db.prepare('SELECT * FROM sessions WHERE sid = ?').get(sid);
    if (row && row.expires_at > Date.now()) {
      const user = db.prepare('SELECT id, email, name, ai_credits, is_admin, created_at FROM users WHERE id = ?').get(row.user_id);
      if (user) {
        req.user = user;
        req.sessionId = sid;
      }
    } else if (row) {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
    }
  }
  next();
}

function adminEmails() {
  return (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
  if (firebase.isConfigured() && !req.firebaseEmailVerified) {
    return res.status(403).json({ error: 'Please verify your email address before continuing.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
  if (firebase.isConfigured() && !req.firebaseEmailVerified) {
    return res.status(403).json({ error: 'Please verify your email address before continuing.' });
  }
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required.' });
  next();
}

module.exports = { attachSession, createSession, destroySession, requireAuth, requireAdmin };
