document.addEventListener('DOMContentLoaded', async () => {
  await SS.init();

  if (!SS.me || !SS.me.is_admin) {
    document.getElementById('denied').classList.remove('d-none');
    return;
  }
  document.getElementById('admin-app').classList.remove('d-none');

  const errorBox = document.getElementById('admin-error');
  const slipsBox = document.getElementById('admin-slips');
  const ordersBox = document.getElementById('admin-orders');
  const creditPriceInput = document.getElementById('ai-credit-price');
  const creditPriceStatus = document.getElementById('credit-price-status');
  let slipsRequestId = 0;

  async function loadCreditPrice() {
    const { creditPriceGhs } = await SS.api('/api/payments/admin/credit-price');
    creditPriceInput.value = Number(creditPriceGhs || 0).toFixed(2);
    creditPriceStatus.textContent = `1 credit = ${SS.ghs(creditPriceGhs)}. Packs update automatically.`;
  }

  async function loadSlips() {
    const requestId = ++slipsRequestId;
    const { slips = [] } = await SS.api('/api/slips');
    if (requestId !== slipsRequestId) return;

    slipsBox.innerHTML = slips.length
      ? slips.map((s) => `
        <div class="d-flex justify-content-between align-items-center border-bottom border-secondary py-2">
          <div>
            <div class="fw-semibold small">${SS.esc(s.title)}</div>
            <div class="small text-secondary">${SS.esc(s.league || 'Mixed')} · ${SS.ghs(s.priceGhs)} · ${SS.esc(s.oddsSummary || '—')}</div>
          </div>
          <div class="d-flex gap-1">
            <button class="btn btn-sm ${s.isActive !== false ? 'btn-outline-warning' : 'btn-outline-success'}" data-toggle="${s.id}">
              ${s.isActive !== false ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn btn-sm btn-outline-danger" data-delete="${s.id}" title="Delete slip"><i class="bi bi-trash3"></i></button>
          </div>
        </div>`).join('')
      : '<p class="text-secondary small">No slips yet — publish your first one.</p>';

    slipsBox.querySelectorAll('[data-toggle]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        await SS.api('/api/slips/' + btn.dataset.toggle, { method: 'PUT', body: { isActive: btn.textContent.trim() === 'Activate' } });
        await loadSlips();
      })
    );
    slipsBox.querySelectorAll('[data-delete]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const slip = slips.find((item) => item.id === Number(btn.dataset.delete));
        if (!slip || !confirm(`Delete "${slip.title}" permanently? Existing purchase records will be kept without the slip link.`)) return;
        btn.disabled = true;
        try {
          await SS.api('/api/slips/' + btn.dataset.delete, { method: 'DELETE' });
          SS.toast('Slip deleted.');
          await loadSlips();
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.classList.remove('d-none');
          btn.disabled = false;
        }
      })
    );
  }

  async function loadOrders() {
    const res = await SS.api('/api/payments/admin/orders');
    const orders = res.orders;
    ordersBox.innerHTML = orders.length
      ? orders.map((o) => `
        <tr>
          <td class="small text-secondary">${SS.esc(o.reference)}</td>
          <td>${o.slipId ? 'Slip #' + o.slipId : SS.esc(o.packId || 'credits')}<div class="small text-secondary">${SS.esc(o.userEmail || '')}</div></td>
          <td>${SS.ghs(o.amount / 100)}</td>
          <td><span class="badge ${o.status === 'completed' ? 'text-bg-success' : 'text-bg-warning'}">${SS.esc(o.status)}</span></td>
          <td class="small text-secondary">${new Date(o.createdAt).toLocaleString()}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="text-secondary">No orders yet.</td></tr>';
  }

  async function clearOrders(scope, message) {
    if (!confirm(message)) return;
    try {
      const result = await SS.api('/api/payments/admin/orders', { method: 'DELETE', body: { scope } });
      SS.toast(`${result.deleted} transaction${result.deleted === 1 ? '' : 's'} deleted.`);
      await loadOrders();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('d-none');
    }
  }

  document.getElementById('slip-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('d-none');
    const btn = document.getElementById('slip-submit');
    btn.disabled = true;
    try {
      await SS.api('/api/slips', {
        method: 'POST',
        body: {
          title: document.getElementById('s-title').value,
          league: document.getElementById('s-league').value,
          oddsSummary: document.getElementById('s-odds').value,
          priceGhs: Number(document.getElementById('s-price').value),
          description: document.getElementById('s-desc').value,
          content: document.getElementById('s-content').value,
        },
      });
      SS.toast('Slip published!');
      e.target.reset();
      await loadSlips();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('d-none');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('credit-price-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = Number(creditPriceInput.value);
    if (!Number.isFinite(value) || value < 0) {
      creditPriceStatus.textContent = 'Enter a valid non-negative GHS value.';
      creditPriceStatus.classList.add('text-danger');
      return;
    }
    creditPriceStatus.classList.remove('text-danger');
    try {
      const res = await SS.api('/api/payments/admin/credit-price', {
        method: 'PUT',
        body: { creditPriceGhs: value },
      });
      creditPriceInput.value = Number(res.creditPriceGhs || 0).toFixed(2);
      creditPriceStatus.textContent = `Saved. 1 credit = ${SS.ghs(res.creditPriceGhs)} and all pack prices update immediately.`;
      SS.toast('AI credit price updated!');
      await loadCreditPrice();
    } catch (err) {
      creditPriceStatus.textContent = err.message;
      creditPriceStatus.classList.add('text-danger');
    }
  });

  document.getElementById('clear-failed-orders').addEventListener('click', () =>
    clearOrders('failed', 'Delete all failed transactions? This cannot be undone.')
  );
  document.getElementById('clear-all-orders').addEventListener('click', () =>
    clearOrders('all', 'Delete every transaction record, including completed payments? This cannot be undone. Credits already granted will not be reversed.')
  );

  await Promise.all([loadSlips(), loadOrders(), loadCreditPrice()]);
});
