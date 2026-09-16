document.addEventListener('DOMContentLoaded', async () => {
  await SS.init();

  const loginPrompt = document.getElementById('login-prompt');
  const aiApp = document.getElementById('ai-app');
  const configBanner = document.getElementById('ai-config-banner');
  const creditCount = document.getElementById('credit-count');
  const packList = document.getElementById('pack-list');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const previewWrap = document.getElementById('preview-wrap');
  const preview = document.getElementById('preview');
  const generateBtn = document.getElementById('generate-btn');
  const noCreditsNote = document.getElementById('no-credits-note');
  const resultArea = document.getElementById('result-area');
  const historyList = document.getElementById('history-list');

  let selectedFile = null;

  if (!SS.me) {
    loginPrompt.classList.remove('d-none');
    return;
  }

  aiApp.classList.remove('d-none');
  if (!SS.config.aiConfigured) configBanner.classList.remove('d-none');

  function refreshCredits(credits) {
    if (credits !== undefined) SS.me.ai_credits = credits;
    creditCount.textContent = SS.me.is_admin ? '∞' : SS.me.ai_credits;
    const has = SS.me.is_admin || SS.me.ai_credits > 0;
    generateBtn.disabled = !has || !selectedFile;
    noCreditsNote.classList.toggle('d-none', has || SS.me.is_admin);
  }

  // Credit packs
  packList.innerHTML = SS.config.creditPacks.map((p) => `
    <button class="btn btn-outline-success text-start d-flex justify-content-between align-items-center pack-btn" data-pack="${p.id}">
      <span><i class="bi bi-stars"></i> ${SS.esc(p.label)}</span>
      <span class="fw-bold">${SS.ghs(p.priceGhs)}</span>
    </button>`).join('');
  packList.querySelectorAll('.pack-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const done = await SS.startPayment({ type: 'credits', packId: btn.dataset.pack });
      btn.disabled = false;
      if (done) {
        SS.toast('Credits added to your account!');
        refreshCredits();
      }
    })
  );

  // Dropzone
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => fileInput.files[0] && pickFile(fileInput.files[0]));

  function pickFile(file) {
    if (!/^image\//.test(file.type)) return SS.toast('Please choose an image file.', 'danger');
    if (file.size > 10 * 1024 * 1024) return SS.toast('Image is larger than 10 MB.', 'danger');
    selectedFile = file;
    preview.src = URL.createObjectURL(file);
    previewWrap.classList.remove('d-none');
    refreshCredits();
  }

  // Generate
  generateBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> AI is analysing your screenshot…';
    resultArea.innerHTML = `
      <div class="card"><div class="card-body text-center p-5">
        <div class="spinner-border text-success"></div>
        <p class="text-secondary mt-2 mb-0">Reading matches and computing fair odds… this takes ~20 seconds.</p>
      </div></div>`;

    try {
      const form = new FormData();
      form.append('screenshot', selectedFile);
      const { result, creditsLeft } = await SS.api('/api/ai/generate', { method: 'POST', form });
      refreshCredits(creditsLeft);
      renderResult(result);
      loadHistory();
      SS.toast('Odds generated!');
    } catch (err) {
      resultArea.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle"></i> ${SS.esc(err.message)}</div>`;
    } finally {
      generateBtn.disabled = (!SS.me.is_admin && SS.me.ai_credits < 1) || !selectedFile;
      generateBtn.innerHTML = '<i class="bi bi-magic"></i> Generate odds <span class="small">(1 credit)</span>';
    }
  });

  function renderResult(result) {
    const matches = result.matches || [];
    resultArea.innerHTML = `
      ${matches.map((m) => {
        const p = m.probabilities || { home: 0.33, draw: 0.33, away: 0.34 };
        const homePct = Math.round((p.home || 0) * 100);
        const drawPct = Math.round((p.draw || 0) * 100);
        const awayPct = Math.max(0, 100 - homePct - drawPct);
        const fo = m.fairOdds || {};
        return `
        <div class="card mb-3"><div class="card-body">
          <div class="d-flex justify-content-between flex-wrap gap-1 mb-1">
            <span class="small text-secondary">${SS.esc(m.league || '')}${m.kickoff ? ' · ' + SS.fmtTime(m.kickoff) : ''}</span>
            <span class="badge ${m.confidence >= 7 ? 'text-bg-success' : m.confidence >= 4 ? 'text-bg-warning' : 'text-bg-secondary'}">Confidence ${SS.esc(m.confidence)}/10</span>
          </div>
          <h6 class="fw-bold">${SS.esc(m.home)} <span class="text-secondary">vs</span> ${SS.esc(m.away)}</h6>
          <div class="ss-prob-bar my-2" title="Home ${homePct}% · Draw ${drawPct}% · Away ${awayPct}%">
            <span class="prob-home" style="width:${homePct}%"></span>
            <span class="prob-draw" style="width:${drawPct}%"></span>
            <span class="prob-away" style="width:${awayPct}%"></span>
          </div>
          <div class="d-flex justify-content-between small text-secondary mb-2">
            <span>1 · <strong class="text-success">${fo.home ?? '—'}</strong></span>
            <span>X · <strong class="text-warning">${fo.draw ?? '—'}</strong></span>
            <span>2 · <strong class="text-primary">${fo.away ?? '—'}</strong></span>
          </div>
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span>Best pick: <span class="ss-odds-chip">${SS.esc(m.recommendedPick?.market || '—')} @ ${SS.esc(m.recommendedPick?.odds ?? '—')}</span></span>
            <small class="text-secondary">${SS.esc(m.reasoning || '')}</small>
          </div>
        </div></div>`;
      }).join('')}
      ${result.slipSuggestion ? `
      <div class="card border-success"><div class="card-header text-success"><i class="bi bi-ticket-perforated-fill"></i> Suggested combination slip · <span class="ss-odds-chip">${SS.esc(result.slipSuggestion.combinedOdds)}</span></div>
        <div class="card-body">
          <ul class="mb-2">${(result.slipSuggestion.picks || []).map((p) => `<li>${SS.esc(p)}</li>`).join('')}</ul>
          <p class="small text-secondary mb-0"><i class="bi bi-piggy-bank"></i> ${SS.esc(result.slipSuggestion.bankrollAdvice || '')}</p>
        </div></div>` : ''}
      <p class="small text-secondary mt-3"><i class="bi bi-shield-exclamation"></i> ${SS.esc(result.disclaimer || 'AI-generated odds are estimates, not guarantees. Bet responsibly (18+).')}</p>`;
  }

  async function loadHistory() {
    try {
      const { generations } = await SS.api('/api/ai/history');
      if (!generations.length) {
        historyList.innerHTML = '<p class="text-secondary small mb-0">None yet.</p>';
        return;
      }
      historyList.innerHTML = generations.map((g) => `
        <div class="d-flex justify-content-between align-items-center border-bottom border-secondary py-2">
          <div>
            <div class="small">${g.result.matches?.length || 0} matches · ${new Date(g.createdAt).toLocaleString()}</div>
            <div class="small text-secondary">${SS.esc(g.result.matches?.map((m) => m.home + ' vs ' + m.away).slice(0, 2).join(', ') || '')}${(g.result.matches?.length || 0) > 2 ? '…' : ''}</div>
          </div>
          <button class="btn btn-sm btn-outline-success" data-gen="${g.id}">View</button>
        </div>`).join('');
      historyList.querySelectorAll('[data-gen]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const gen = generations.find((x) => x.id === Number(btn.dataset.gen));
          if (gen) {
            renderResult(gen.result);
            resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        })
      );
    } catch {
      historyList.innerHTML = '<p class="text-secondary small mb-0">History unavailable.</p>';
    }
  }

  refreshCredits();
  loadHistory();
});
