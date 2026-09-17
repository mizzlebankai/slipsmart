const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../session');
const paystack = require('../services/paystack');
const email = require('../services/email');

const router = express.Router();

const DEFAULT_AI_CREDIT_PRICE_GHS = Number(process.env.AI_CREDIT_PRICE_GHS || 15);

function getCreditPriceGhs() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('ai_credit_price_ghs');
  const raw = row ? row.value : process.env.AI_CREDIT_PRICE_GHS;
  const price = Number(raw ?? DEFAULT_AI_CREDIT_PRICE_GHS);
  return Number.isFinite(price) && price >= 0 ? price : DEFAULT_AI_CREDIT_PRICE_GHS;
}

function getCreditPacks() {
  const base = getCreditPriceGhs();
  return [
    { id: 'pack1', credits: 1, priceGhs: Number(base.toFixed(2)), label: '1 AI generation' },
    { id: 'pack5', credits: 5, priceGhs: Number((base * 5).toFixed(2)), label: '5 AI generations' },
    { id: 'pack10', credits: 10, priceGhs: Number((base * 10).toFixed(2)), label: '10 AI generations' },
  ];
}

function demoPaymentsEnabled() {
  return !paystack.isConfigured() && process.env.NODE_ENV !== 'production';
}

function getPack(packId) {
  return getCreditPacks().find((p) => p.id === packId);
}

function fulfillPurchase(purchase) {
  if (purchase.status === 'completed') return;
  const paidAt = Date.now();
  const updated = db.prepare("UPDATE purchases SET status = 'completed', paid_at = ? WHERE id = ? AND status != 'completed'").run(paidAt, purchase.id);
  if (!updated.changes) return;
  if (purchase.credits > 0) {
    db.prepare('UPDATE users SET ai_credits = ai_credits + ? WHERE id = ?').run(purchase.credits, purchase.user_id);
  }
  const fresh = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchase.id);
  const user = db.prepare('SELECT email, name FROM users WHERE id = ?').get(purchase.user_id);
  const slip = fresh.slip_id ? db.prepare('SELECT title FROM slips WHERE id = ?').get(fresh.slip_id) : null;
  email.sendReceipt({ email: user.email, name: user.name, purchase: fresh, slip })
    .then((sent) => {
      if (sent) db.prepare('UPDATE purchases SET receipt_sent_at = ? WHERE id = ?').run(Date.now(), fresh.id);
    })
    .catch((err) => console.error('[receipt]', err.message));
}

router.post('/reference', requireAuth, async (req, res, next) => {
  try {
    const { type, slipId, packId } = req.body || {};
    let amountGhs = 0;
    let slip_id = null;
    let pack_id = null;
    let credits = 0;

    if (type === 'slip') {
      const slip = db.prepare('SELECT * FROM slips WHERE id = ? AND is_active = 1').get(slipId);
      if (!slip) return res.status(404).json({ error: 'Slip not found.' });
      const owned = db
        .prepare("SELECT id FROM purchases WHERE user_id = ? AND slip_id = ? AND status = 'completed'")
        .get(req.user.id, slip.id);
      if (owned) return res.status(409).json({ error: 'You already own this slip.' });
      amountGhs = slip.price_ghs;
      slip_id = slip.id;
    } else if (type === 'credits') {
      const pack = getPack(packId);
      if (!pack) return res.status(400).json({ error: 'Unknown credit pack.' });
      amountGhs = pack.priceGhs;
      pack_id = pack.id;
      credits = pack.credits;
    } else {
      return res.status(400).json({ error: 'Type must be "slip" or "credits".' });
    }

    const reference = paystack.newReference(type === 'slip' ? 'SLIP' : 'CREDIT');
    db.prepare(
      `INSERT INTO purchases (user_id, slip_id, pack_id, credits, reference, amount, currency, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'GHS', 'pending', ?)`
    ).run(req.user.id, slip_id, pack_id, credits, reference, Math.round(amountGhs * 100), Date.now());

    res.json({
      reference,
      amountPesewas: Math.round(amountGhs * 100),
      currency: 'GHS',
      paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
      paystackEnabled: paystack.isConfigured(),
      demoPayments: demoPaymentsEnabled(),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/verify/:reference', requireAuth, async (req, res, next) => {
  try {
    const purchase = db.prepare('SELECT * FROM purchases WHERE reference = ?').get(req.params.reference);
    if (!purchase || purchase.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Payment not found.' });
    }
    if (purchase.status === 'completed') return res.json({ status: 'completed', purchase: publicPurchase(purchase) });
    if (!paystack.isConfigured()) return res.status(503).json({ error: 'Paystack is not configured.' });

    const tx = await paystack.verifyTransaction(purchase.reference);
    if (tx.status !== 'success') {
      db.prepare("UPDATE purchases SET status = 'failed' WHERE id = ? AND status = 'pending'").run(purchase.id);
      const failed = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchase.id);
      return res.json({ status: 'failed', purchase: publicPurchase(failed) });
    }
    if (tx.amount !== purchase.amount) return res.status(400).json({ error: 'Paid amount mismatch.' });

    fulfillPurchase(purchase);
    const fresh = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchase.id);
    res.json({ status: 'completed', purchase: publicPurchase(fresh) });
  } catch (err) {
    next(err);
  }
});

// NOTE: the webhook endpoint lives in server.js — it needs the raw request body,
// which express.json() would otherwise consume before it reaches this router.

// Local testing only: stand-in for Paystack when no keys are configured.
router.post('/demo-pay', requireAuth, (req, res) => {
  if (!demoPaymentsEnabled()) return res.status(403).json({ error: 'Demo payments are disabled.' });
  const { reference } = req.body || {};
  const purchase = db.prepare('SELECT * FROM purchases WHERE reference = ?').get(reference);
  if (!purchase || purchase.user_id !== req.user.id) return res.status(404).json({ error: 'Payment not found.' });
  fulfillPurchase(purchase);
  const fresh = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchase.id);
  res.json({ status: 'completed', purchase: publicPurchase(fresh) });
});

router.get('/packs', (req, res) => {
  res.json({ packs: getCreditPacks(), currency: 'GHS' });
});

router.get('/admin/credit-price', requireAdmin, (req, res) => {
  res.json({ creditPriceGhs: getCreditPriceGhs() });
});

router.put('/admin/credit-price', requireAdmin, (req, res) => {
  const nextValue = Number(req.body?.creditPriceGhs);
  if (!Number.isFinite(nextValue) || nextValue < 0) {
    return res.status(400).json({ error: 'Credit price must be a valid non-negative number.' });
  }
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('ai_credit_price_ghs');
  if (row) {
    db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?').run(String(nextValue), Date.now(), 'ai_credit_price_ghs');
  } else {
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run('ai_credit_price_ghs', String(nextValue), Date.now());
  }
  res.json({ creditPriceGhs: getCreditPriceGhs(), packs: getCreditPacks() });
});

router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  res.json({ purchases: rows.map(publicPurchase) });
});

router.get('/admin/orders', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, u.email AS user_email FROM purchases p JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT 200`
    )
    .all();
  res.json({
    orders: rows.map((p) => ({ ...publicPurchase(p), userEmail: p.user_email })),
  });
});

router.delete('/admin/orders', requireAdmin, (req, res) => {
  const scope = req.body?.scope || 'all';
  if (!['all', 'pending', 'failed'].includes(scope)) {
    return res.status(400).json({ error: 'Scope must be all, pending, or failed.' });
  }
  const result = scope === 'all'
    ? db.prepare('DELETE FROM purchases').run()
    : db.prepare('DELETE FROM purchases WHERE status = ?').run(scope);
  res.json({ ok: true, deleted: result.changes, scope });
});

function publicPurchase(p) {
  return {
    id: p.id,
    reference: p.reference,
    slipId: p.slip_id,
    packId: p.pack_id,
    credits: p.credits,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    createdAt: p.created_at,
    paidAt: p.paid_at,
  };
}

router.CREDIT_PACKS = getCreditPacks;
router.getCreditPacks = getCreditPacks;
router.getCreditPriceGhs = getCreditPriceGhs;
router.setCreditPriceGhs = (value) => {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue < 0) return null;
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('ai_credit_price_ghs');
  if (row) {
    db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?').run(String(nextValue), Date.now(), 'ai_credit_price_ghs');
  } else {
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run('ai_credit_price_ghs', String(nextValue), Date.now());
  }
  return getCreditPriceGhs();
};
router.fulfillPurchase = fulfillPurchase;
module.exports = router;
