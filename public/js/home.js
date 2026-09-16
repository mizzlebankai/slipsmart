document.addEventListener('DOMContentLoaded', async () => {
  await SS.init();

  // Live strip
  const strip = document.getElementById('live-strip');
  try {
    const { demo, matches } = await SS.api('/api/matches/live');
    if (!matches.length) {
      strip.innerHTML = '<p class="text-secondary">No live matches right now — check the fixtures page.</p>';
    } else {
      const logo = (url, name) => url
        ? `<img src="${SS.esc(url)}" alt="${SS.esc(name)} crest" class="ss-mini-logo" loading="lazy">`
        : '';
      strip.innerHTML = matches.slice(0, 8).map((m) => `
        <a href="/matches.html?open=${m.id}" class="text-decoration-none ss-live-card d-block">
        <div class="card h-100"><div class="card-body p-3">
          <div class="d-flex justify-content-between small text-secondary mb-2">
            <span>${SS.esc(m.league)}${demo ? ' · demo' : ''}</span>
            <span class="text-danger">${m.minute ? m.minute + '&prime;' : SS.esc(m.status)}</span>
          </div>
          <div class="d-flex justify-content-between align-items-center">
            <span class="ss-mini-team">${logo(m.homeLogo, m.home)}${SS.esc(m.home)}</span>
            <span class="ss-score">${m.homeScore ?? ''}–${m.awayScore ?? ''}</span>
            <span class="text-end ss-mini-team">${SS.esc(m.away)}${logo(m.awayLogo, m.away)}</span>
          </div>
        </div></div>
        </a>`).join('');
    }
  } catch (err) {
    strip.innerHTML = `<p class="text-danger small">${SS.esc(err.message)}</p>`;
  }

  // Featured slips
  const grid = document.getElementById('featured-slips');
  try {
    const { slips } = await SS.api('/api/slips');
    if (!slips.length) {
      grid.innerHTML = '<p class="text-secondary">No slips published yet — the admin can add slips from the admin panel.</p>';
    } else {
      grid.innerHTML = slips.slice(0, 3).map((s) => `
        <div class="col-md-4">
          <div class="card ss-slip-card"><div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between mb-2">
              <span class="badge text-bg-secondary">${SS.esc(s.league || 'Mixed')}</span>
              ${s.owned ? '<span class="badge text-bg-success">Owned</span>' : ''}
            </div>
            <h6 class="fw-bold">${SS.esc(s.title)}</h6>
            <p class="small text-secondary flex-grow-1">${SS.esc(s.description || '')}</p>
            <div class="d-flex justify-content-between align-items-center">
              <span class="ss-odds-chip">${SS.esc(s.oddsSummary || '—')}</span>
              <a href="/slips.html#slip-${s.id}" class="btn btn-sm btn-outline-success">${s.owned ? 'View' : 'Buy · ' + SS.ghs(s.priceGhs)}</a>
            </div>
          </div></div>
        </div>`).join('');
    }
  } catch (err) {
    grid.innerHTML = `<p class="text-danger small">${SS.esc(err.message)}</p>`;
  }
});
