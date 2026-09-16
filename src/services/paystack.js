const crypto = require('crypto');

const SECRET = process.env.PAYSTACK_SECRET_KEY;
const PUBLIC = process.env.PAYSTACK_PUBLIC_KEY;

function isConfigured() {
  return Boolean(SECRET && PUBLIC);
}

async function verifyTransaction(reference) {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  if (!res.ok) throw new Error(`Paystack verify failed with status ${res.status}`);
  const data = await res.json();
  if (!data.status) throw new Error(`Paystack error: ${data.message || 'unknown'}`);
  return data.data;
}

function verifyWebhookSignature(rawBody, signature) {
  if (!SECRET || !signature) return false;
  const hash = crypto.createHmac('sha512', SECRET).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

function newReference(prefix) {
  return `${prefix}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

module.exports = { isConfigured, verifyTransaction, verifyWebhookSignature, newReference };
