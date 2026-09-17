require('dotenv').config();
const path = require('path');
const express = require('express');

const db = require('./src/db');
const { attachSession } = require('./src/session');
const authRoutes = require('./src/routes/auth');
const matchesRoutes = require('./src/routes/matches');
const slipsRoutes = require('./src/routes/slips');
const paymentsRoutes = require('./src/routes/payments');
const aiRoutes = require('./src/routes/ai');
const gemini = require('./src/services/gemini');
const paystack = require('./src/services/paystack');
const firebase = require('./src/services/firebase');
const email = require('./src/services/email');
const openai = require('./src/services/openai');

const { fulfillPurchase, getCreditPacks } = paymentsRoutes;
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Paystack webhook: raw body + signature check, mounted before express.json().
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
  if (!paystack.verifyWebhookSignature(raw, signature)) return res.status(401).json({ error: 'Bad signature' });

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event.event === 'charge.success') {
    const reference = event.data && event.data.reference;
    const purchase = reference && db.prepare('SELECT * FROM purchases WHERE reference = ?').get(reference);
    if (purchase && purchase.status !== 'completed' && event.data.amount === purchase.amount) {
      fulfillPurchase(purchase);
    }
  }
  res.json({ ok: true });
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(attachSession);

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/api/config', (req, res) => {
  res.json({
    siteName: 'SlipSmart',
    currency: 'GHS',
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    paystackEnabled: paystack.isConfigured(),
    demoPayments: !paystack.isConfigured() && process.env.NODE_ENV !== 'production',
    aiConfigured: gemini.isConfigured(),
    firebaseConfigured: firebase.isConfigured(),
    firebaseConfig: firebase.clientConfig(),
    creditPacks: getCreditPacks(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/slips', slipsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/ai', aiRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`SlipSmart running → http://localhost:${PORT}`);
  if (!paystack.isConfigured()) console.log('Paystack keys not set — demo payments are enabled (no real money).');
  if (!email.isConfigured()) console.log('Receipt email not configured — add RESEND_API_KEY and a verified RECEIPT_FROM address.');
  if (!gemini.isConfigured()) console.log('GEMINI_API_KEY not set — AI odds generator is disabled until you add it.');
  if (openai.isConfigured()) console.log('OpenAI fallback is enabled for AI generation.');
  if (!process.env.APISPORTS_KEY) console.log('APISPORTS_KEY not set — matches page shows demo fixtures.');
});
