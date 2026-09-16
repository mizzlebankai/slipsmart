document.addEventListener('DOMContentLoaded', async () => {
  await SS.init();

  if (!SS.me) {
    document.getElementById('login-prompt').classList.remove('d-none');
    return;
  }
  document.getElementById('account-app').classList.remove('d-none');

  document.getElementById('acc-name').textContent = SS.me.name;
  document.getElementById('acc-email').textContent = SS.me.email;
  document.getElementById('acc-credits').textContent = SS.me.ai_credits;

  const rows = document.getElementById('purchase-rows');
  const modal = new bootstrap.Modal(document.getElementById('slip-modal'));

  const [{ purchases }, { slips }] = await Promise.all([
    SS.api('/api/payments/mine'),
    SS.api('/api/slips/purchased/mine'),
  ]);

  document.getElementById('acc-purchases').textContent =
    purchases.filter((p) => p.status === 'completed').length;

  const slipById = new Map(slips.map((s) => [s.id, s]));
  const packLabel = (id) => (SS.config.creditPacks.find((p) => p.id === id) || {}).label || 'AI credits';

  if (!purchases.length) {
    rows.innerHTML = '<tr><td colspan="6" class="text-secondary">No purchases yet. <a href="/slips.html">Browse slips</a> or <a href="/ai-odds.html">get AI credits</a>.</td></tr>';
  } else {
    rows.innerHTML = purchases.map((p) => {
      const item = p.slipId
        ? `Slip #${p.slipId}${slipById.has(p.slipId) ? ' — ' + SS.esc(slipById.get(p.slipId).title) : ''}`
        : SS.esc(packLabel(p.packId));
      const canView = p.status === 'completed' && p.slipId && slipById.has(p.slipId);
      return `
      <tr>
        <td>${item}</td>
        <td class="small text-secondary">${SS.esc(p.reference)}</td>
        <td>${SS.ghs(p.amount / 100)}</td>
        <td><span class="badge ${p.status === 'completed' ? 'text-bg-success' : p.status === 'pending' ? 'text-bg-warning' : 'text-bg-secondary'}">${SS.esc(p.status)}</span></td>
        <td class="small text-secondary">${new Date(p.createdAt).toLocaleString()}</td>
        <td>${canView ? `<button class="btn btn-sm btn-outline-success" data-slip="${p.slipId}">View</button>` : ''}</td>
      </tr>`;
    }).join('');

    rows.querySelectorAll('[data-slip]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const slip = slipById.get(Number(btn.dataset.slip));
        document.getElementById('modal-title').textContent = slip.title;
        document.getElementById('modal-body').textContent = slip.content || 'No selections added yet.';
        modal.show();
      })
    );
  }
});
