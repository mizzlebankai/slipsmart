async function sendReceipt({ email, name, purchase, slip, pack }) {
  if (!isConfigured()) return false;

  const item = slip
    ? `Slip: ${slip.title}`
    : `AI credits: ${purchase.credits} credit${purchase.credits === 1 ? '' : 's'}`;
  const amount = `${purchase.currency} ${(purchase.amount / 100).toFixed(2)}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RECEIPT_FROM,
      to: [email],
      subject: `SlipSmart purchase receipt · ${purchase.reference}`,
      html: `<h2>SlipSmart purchase receipt</h2><p>Hello ${escapeHtml(name || '')},</p><p>Your purchase was completed successfully.</p><p><strong>${escapeHtml(item)}</strong><br>Amount: ${escapeHtml(amount)}<br>Reference: ${escapeHtml(purchase.reference)}</p><p>Thank you for using SlipSmart.</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Receipt email failed (${response.status}).`);
  return true;
}

function isConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY
      && !process.env.RESEND_API_KEY.startsWith('re_your_')
      && process.env.RECEIPT_FROM
      && !process.env.RECEIPT_FROM.includes('yourdomain.com')
  );
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

module.exports = { isConfigured, sendReceipt };