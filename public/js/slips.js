document.addEventListener('DOMContentLoaded', async () => {
  await SS.init();

  const grid = document.getElementById('slip-grid');
  const modal = new bootstrap.Modal(document.getElementById('slip-modal'));
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  async function load() {
    grid.innerHTML = '<p class="text-secondary">Loading slips…</p>';
    try {
      const { slips } = await SS.api('/api/slips');
      if (!slips.length) {
        grid.innerHTML = '<div class="col-12"><div class="alert alert-secondary">No slips for sale yet. Check back soon!</div></div>';
        return;
      }
      grid.innerHTML = slips.map((s) => `
        <div class="col-md-6 col-lg-4" id="slip-${s.id}">
          <div class="card ss-slip-card"><div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between mb-2">
              <span class="badge text-bg-secondary">${SS.esc(s.league || 'Mixed')}</span>
              ${s.owned ? '<span class="badge text-bg-success">Owned</span>' : ''}
            </div>
            <h6 class="fw-bold">${SS.esc(s.title)}</h6>
            <p class="small text-secondary flex-grow-1">${SS.esc(s.description || '')}</p>
            <div class="d-flex justify-content-between align-items-center mb-3">
              <span class="ss-odds-chip"><i class="bi bi-lightning-charge-fill"></i> ${SS.esc(s.oddsSummary || '—')}</span>
              <span class="fw-bold">${SS.ghs(s.priceGhs)}</span>
            </div>
            <button class="btn ${s.owned ? 'btn-outline-success' : 'btn-success'} w-100" data-view="${s.id}">
              ${s.owned ? '<i class="bi bi-eye"></i> View selections' : '<i class="bi bi-lock"></i> Unlock this slip'}
            </button>
          </div></div>
        </div>`).join('');

      grid.querySelectorAll('[data-view]').forEach((btn) =>
        btn.addEventListener('click', () => openSlip(Number(btn.dataset.view)))
      );
    } catch (err) {
      grid.innerHTML = `<div class="alert alert-danger">${SS.esc(err.message)}</div>`;
    }
  }

  async function openSlip(id) {
    modalTitle.textContent = 'Loading…';
    modalBody.innerHTML = '<p class="text-secondary">Loading slip…</p>';
    modalFooter.innerHTML = '';
    modal.show();

    let slip;
    try {
      ({ slip } = await SS.api('/api/slips/' + id));
    } catch (err) {
      modalTitle.textContent = 'Error';
      modalBody.innerHTML = `<div class="alert alert-danger">${SS.esc(err.message)}</div>`;
      return;
    }

    modalTitle.textContent = slip.title;
    if (slip.owned) {
      modalBody.innerHTML = `
        <div class="mb-2"><span class="badge text-bg-secondary">${SS.esc(slip.league || 'Mixed')}</span>
          <span class="ss-odds-chip ms-2">${SS.esc(slip.oddsSummary || '—')}</span></div>
        <div class="alert alert-success py-2 small"><i class="bi bi-unlock"></i> You own this slip. Good luck!</div>
        <div class="ss-slip-content" style="white-space:pre-line">${SS.esc(slip.content || 'No selections added yet.')}</div>`;
      modalFooter.innerHTML = '<button class="btn btn-outline-light btn-sm" data-bs-dismiss="modal">Close</button>';
    } else {
      modalBody.innerHTML = `
        <div class="mb-2"><span class="badge text-bg-secondary">${SS.esc(slip.league || 'Mixed')}</span>
          <span class="ss-odds-chip ms-2">${SS.esc(slip.oddsSummary || '—')}</span></div>
        <p>${SS.esc(slip.description || '')}</p>
        <div class="alert alert-warning py-2 small">
          <i class="bi bi-lock"></i> The selections are locked. Pay <strong>${SS.ghs(slip.priceGhs)}</strong> to reveal them instantly — yours forever.
        </div>
        <p class="small text-secondary mb-0">${slip.content ? slip.content.split('\n').filter(Boolean).length + ' selections inside' : ''}</p>`;
      modalFooter.innerHTML = `
        <button class="btn btn-outline-light btn-sm" data-bs-dismiss="modal">Not now</button>
        <button class="btn btn-success" id="buy-btn"><i class="bi bi-lock-fill"></i> Pay ${SS.ghs(slip.priceGhs)} & unlock</button>`;
      document.getElementById('buy-btn').addEventListener('click', async () => {
        const btn = document.getElementById('buy-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing…';
        const done = await SS.startPayment({ type: 'slip', slipId: slip.id });
        if (done) {
          SS.toast('Payment successful — slip unlocked!');
          await load();
          openSlip(slip.id);
        } else {
          btn.disabled = false;
          btn.innerHTML = `<i class="bi bi-lock-fill"></i> Pay ${SS.ghs(slip.priceGhs)} & unlock`;
        }
      });
    }
  }

  await load();

  // Deep link from homepage (#slip-12)
  if (location.hash.startsWith('#slip-')) openSlip(Number(location.hash.slice(6)));
});
