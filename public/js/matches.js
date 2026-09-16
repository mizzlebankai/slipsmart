document.addEventListener('DOMContentLoaded', async () => {
  await SS.init();

  let tab = 'live';
  const list = document.getElementById('match-list');
  const demoBanner = document.getElementById('demo-banner');
  const modal = new bootstrap.Modal(document.getElementById('match-modal'));
  const mmTitle = document.getElementById('mm-title');
  const mmBody = document.getElementById('mm-body');
  const sourceFixtures = new Map();

  const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET'];

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      tab = btn.dataset.tab;
      load();
    });
  });
  document.getElementById('refresh').addEventListener('click', load);

  function matchRow(m, demo, source) {
    const live = LIVE_STATUSES.includes(m.status);
    const teamLogo = (logo, name) => logo
      ? `<img src="${SS.esc(logo)}" alt="${SS.esc(name)} crest" class="ss-team-logo" loading="lazy">`
      : `<span class="ss-team-logo ss-team-logo-empty"><i class="bi bi-shield-shaded"></i></span>`;
    const center = live
      ? `<div class="text-center ss-match-center"><div class="ss-score">${m.homeScore} – ${m.awayScore}</div>
         <span class="badge text-bg-danger">${m.minute ? m.minute + '&prime; ' : ''}${SS.esc(m.status)}</span></div>`
      : `<div class="text-center ss-match-center"><div class="fw-semibold">${SS.fmtTime(m.kickoff)}</div>
         <span class="badge text-bg-secondary">${SS.esc(m.status || 'Scheduled')}</span></div>`;
    return `
    <div class="ss-match-row" data-fixture="${m.id}" data-source="${SS.esc(source)}">
      <div class="row align-items-center g-2">
        <div class="col-12 small text-secondary mb-1">${SS.esc(m.league)} · ${SS.esc(m.country)}${demo ? ' · demo' : ''}</div>
        <div class="col ss-team-cell"><div>${teamLogo(m.homeLogo, m.home)}<span class="fw-semibold">${SS.esc(m.home)}</span></div><div class="small text-secondary">${SS.esc(m.venue || '')}</div></div>
        <div class="col-auto">${center}</div>
        <div class="col ss-team-cell text-end"><div><span class="fw-semibold">${SS.esc(m.away)}</span>${teamLogo(m.awayLogo, m.away)}</div><div class="small text-secondary">Details <i class="bi bi-chevron-right"></i></div></div>
      </div>
    </div>`;
  }

  function renderSource(source, data) {
    const matches = data.matches || [];
    if (!matches.length) return `<section class="ss-source-block"><div class="ss-source-heading"><span>${SS.esc(source)}</span><span class="ss-source-status">${data.unavailable ? 'Temporarily unavailable' : 'No matches'}</span></div><p class="text-secondary small">${data.unavailable ? 'Live fixtures are temporarily unavailable. Please try again shortly.' : `No ${tab} matches are available right now.`}</p></section>`;
    const groups = [];
    const byKey = new Map();
    for (const m of matches) {
      sourceFixtures.set(`${source}:${m.id}`, m);
      const key = `${m.league}|${m.country}`;
      if (!byKey.has(key)) {
        const g = { league: m.league, country: m.country, matches: [] };
        byKey.set(key, g);
        groups.push(g);
      }
      byKey.get(key).matches.push(m);
    }
    return `<section class="ss-source-block"><div class="ss-source-heading"><span><i class="bi bi-broadcast-pin"></i> ${SS.esc(source)}</span><span class="ss-source-status">${matches.length} matches</span></div>${groups.map((g) => `
      <div class="ss-league-header"><i class="bi bi-trophy-fill text-success"></i> ${SS.esc(g.league || 'Other competitions')} <span class="text-secondary fw-normal small">${SS.esc(g.country)}</span><span class="ss-count ms-auto">${g.matches.length}</span></div>
      ${g.matches.map((m) => matchRow(m, Boolean(data.demo), source)).join('')}
    `).join('')}</section>`;
  }

  async function load() {
    list.innerHTML = '<p class="text-secondary"><span class="spinner-border spinner-border-sm"></span> Loading matches…</p>';
    try {
      const data = await SS.api('/api/matches/sources/' + tab + '?refresh=1');
      demoBanner.classList.add('d-none');
      sourceFixtures.clear();
      list.innerHTML = data.sources.map((source) => renderSource(source.source, source.data)).join('');
      list.querySelectorAll('[data-fixture]').forEach((row) =>
        row.addEventListener('click', () => {
          if (row.dataset.source === 'Live feed') return openFixture(Number(row.dataset.fixture));
          openSourceFixture(sourceFixtures.get(`${row.dataset.source}:${row.dataset.fixture}`));
        })
      );
    } catch (err) {
      list.innerHTML = `<div class="alert alert-danger">${SS.esc(err.message)}</div>`;
    }
  }

  function openSourceFixture(fixture) {
    if (!fixture) return;
    mmTitle.textContent = `${fixture.home} vs ${fixture.away}`;
    const live = LIVE_STATUSES.includes(fixture.status) || fixture.status === 'LIVE';
    mmBody.innerHTML = `
      <div class="text-center mb-3">
        <div class="small text-secondary mb-3">${SS.esc(fixture.league)} · ${SS.esc(fixture.country)} · Backup live feed</div>
        <div class="d-flex justify-content-between align-items-center">
          <div class="text-center col"><img src="${SS.esc(fixture.homeLogo || '')}" alt="" class="ss-team-badge"><div class="fw-bold mt-2">${SS.esc(fixture.home)}</div></div>
          <div class="col-auto px-3"><div class="ss-score fs-3">${fixture.homeScore ?? '–'} – ${fixture.awayScore ?? '–'}</div><span class="badge ${live ? 'text-bg-danger' : 'text-bg-secondary'}">${SS.esc(fixture.status || 'Scheduled')}</span></div>
          <div class="text-center col"><img src="${SS.esc(fixture.awayLogo || '')}" alt="" class="ss-team-badge"><div class="fw-bold mt-2">${SS.esc(fixture.away)}</div></div>
        </div>
        <p class="small text-secondary mt-3 mb-0">${fixture.kickoff ? SS.fmtTime(fixture.kickoff) : 'Live fixture'}</p>
      </div>
      <div class="alert alert-info small mb-0">Detailed events and statistics are not available from this backup feed, but the live score and team information are current.</div>`;
    modal.show();
  }

  function eventIcon(e) {
    if (e.type === 'Goal') return '<i class="bi bi-record-circle-fill ss-ev-goal"></i>';
    if (e.type === 'Card') return `<span class="card-dot" style="background:${e.detail === 'Red Card' ? '#ef4444' : '#eab308'}"></span>`;
    if (e.type === 'subst') return '<i class="bi bi-arrow-left-right text-secondary"></i>';
    if (e.type === 'Var') return '<i class="bi bi-tv text-secondary"></i>';
    return '<i class="bi bi-dot text-secondary"></i>';
  }

  function aiSectionHtml(fixture) {
    if (!SS.config.aiConfigured) {
      return '<p class="small text-secondary mb-0">AI odds engine is not configured yet.</p>';
    }
    if (!SS.me) {
      return `<p class="small text-secondary mb-2">Log in to get an AI prediction for this match.</p>
        <a href="/login.html?next=${encodeURIComponent('/matches.html?open=' + fixture.id)}" class="btn btn-outline-light btn-sm">Log in</a>`;
    }
    if (!SS.me.is_admin && SS.me.ai_credits < 1) {
      return `<p class="small text-secondary mb-2">You need an AI credit to predict this match.</p>
        <a href="/ai-odds.html" class="btn btn-success btn-sm"><i class="bi bi-stars"></i> Get credits</a>`;
    }
    return `<button class="btn btn-success w-100" id="predict-btn">
      <i class="bi bi-stars"></i> Predict this match with AI <span class="small">(${SS.me.is_admin ? 'admin access' : '1 credit'})</span>
      </button>
      <div id="predict-result" class="mt-3"></div>`;
  }

  function renderPrediction(target, result, fixtureId) {
    const p = result.probabilities || { home: 0.33, draw: 0.33, away: 0.34 };
    const homePct = Math.round((p.home || 0) * 100);
    const drawPct = Math.round((p.draw || 0) * 100);
    const awayPct = Math.max(0, 100 - homePct - drawPct);
    const fo = result.fairOdds || {};
    const conf = Number(result.confidence) || 0;
    target.innerHTML = `
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
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
        <span>Best pick: <span class="ss-odds-chip">${SS.esc(result.recommendedPick?.market || '—')} @ ${SS.esc(result.recommendedPick?.odds ?? '—')}</span></span>
        <span class="badge ${conf >= 7 ? 'text-bg-success' : conf >= 4 ? 'text-bg-warning' : 'text-bg-secondary'}">Confidence ${conf}/10</span>
      </div>
      <p class="small mb-1">${SS.esc(result.reasoning || '')}</p>
      <p class="small text-secondary mb-0"><i class="bi bi-shield-exclamation"></i> ${SS.esc(result.disclaimer || 'AI-generated prediction, not a guarantee. Bet responsibly (18+).')}</p>`;
  }

  async function openFixture(id) {
    mmTitle.textContent = 'Match details';
    mmBody.innerHTML = '<p class="text-secondary"><span class="spinner-border spinner-border-sm"></span> Loading match…</p>';
    modal.show();

    let fx;
    try {
      fx = await SS.api('/api/matches/' + id);
    } catch (err) {
      mmBody.innerHTML = `<div class="alert alert-danger mb-0">${SS.esc(err.message)}</div>`;
      return;
    }

    mmTitle.textContent = `${fx.home} vs ${fx.away}`;
    const live = LIVE_STATUSES.includes(fx.status);
    const finished = fx.homeScore !== null && fx.homeScore !== undefined && !live && fx.status !== 'NS';
    const centerBadge = live
      ? `<span class="badge text-bg-danger">${fx.minute ? fx.minute + '&prime; ' : ''}${SS.esc(fx.status)}</span>`
      : finished
        ? `<span class="badge text-bg-secondary">Full time · ${SS.esc(fx.status)}</span>`
        : `<span class="badge text-bg-secondary">Scheduled</span>`;

    const statsHtml = fx.stats.length
      ? fx.stats.map((s) => {
          const sum = (s.home || 0) + (s.away || 0);
          const hPct = sum > 0 ? Math.round(((s.home || 0) / sum) * 100) : 50;
          return `<div class="ss-stat">
            <div class="ss-stat-top"><span class="fw-semibold">${SS.esc(s.homeRaw)}</span><span class="ss-stat-name">${SS.esc(s.name)}</span><span class="fw-semibold">${SS.esc(s.awayRaw)}</span></div>
            <div class="ss-stat-track"><span class="h" style="width:${hPct}%"></span><span class="a" style="width:${100 - hPct}%"></span></div>
          </div>`;
        }).join('')
      : '<p class="small text-secondary mb-0">No statistics available yet.</p>';

    const eventsHtml = fx.events.length
      ? fx.events.map((e) => {
          const side = e.team === 'home' ? fx.home : fx.away;
          const label = e.type === 'Card' ? e.detail : e.type === 'subst' ? 'Substitution' : e.type === 'Var' ? 'VAR' : 'Goal';
          return `<div class="ss-event">
            <span class="min">${e.minute ?? '–'}&prime;${e.extra ? '+' + e.extra : ''}</span>
            ${eventIcon(e)}
            <span class="flex-grow-1">${SS.esc(label)}${e.player ? ' — ' + SS.esc(e.player) : ''} <span class="text-secondary">(${SS.esc(side)})</span></span>
          </div>`;
        }).join('')
      : '<p class="small text-secondary mb-0">No match events yet.</p>';

    const h2hHtml = fx.h2h.length
      ? fx.h2h.map((h) => `<div class="ss-h2h-row">
          <span class="text-secondary small">${h.date ? new Date(h.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
          <span class="flex-grow-1 px-2 text-secondary small">${SS.esc(h.league)}</span>
          <span class="fw-semibold text-nowrap">${SS.esc(h.home)} ${h.homeScore ?? '–'}–${h.awayScore ?? '–'} ${SS.esc(h.away)}</span>
        </div>`).join('')
      : '<p class="small text-secondary mb-0">No recent meetings found.</p>';

    mmBody.innerHTML = `
      <div class="text-center mb-1">
        <div class="small text-secondary mb-2">${SS.esc(fx.league)} · ${SS.esc(fx.country)}${fx.demo ? ' · demo data' : ''}</div>
        <div class="d-flex justify-content-between align-items-center col-lg-8 mx-auto">
          <div class="text-center col">
            ${fx.homeLogo ? `<img src="${SS.esc(fx.homeLogo)}" alt="" class="ss-team-badge mb-1">` : ''}
            <div class="fw-bold">${SS.esc(fx.home)}</div>
          </div>
          <div class="col-auto px-3">
            ${live || finished ? `<div class="ss-score fs-3">${fx.homeScore} – ${fx.awayScore}</div>` : `<div class="fw-bold">${SS.fmtTime(fx.kickoff)}</div>`}
            <div class="mt-1">${centerBadge}</div>
          </div>
          <div class="text-center col">
            ${fx.awayLogo ? `<img src="${SS.esc(fx.awayLogo)}" alt="" class="ss-team-badge mb-1">` : ''}
            <div class="fw-bold">${SS.esc(fx.away)}</div>
          </div>
        </div>
        <div class="small text-secondary mt-2">${SS.esc(fx.venue || '')}${fx.kickoff ? ' · ' + SS.fmtTime(fx.kickoff) : ''}</div>
      </div>

      <div class="ss-section-label">Match stats</div>
      ${statsHtml}

      <div class="ss-section-label">Match events</div>
      ${eventsHtml}

      <div class="ss-section-label">Recent meetings</div>
      ${h2hHtml}

      <div class="ss-section-label"><i class="bi bi-stars text-success"></i> AI prediction</div>
      <div id="ai-predict-area">${aiSectionHtml(fx)}</div>`;

    const predictBtn = document.getElementById('predict-btn');
    if (predictBtn) {
      predictBtn.addEventListener('click', async () => {
        predictBtn.disabled = true;
        predictBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> AI is analysing this fixture…';
        const target = document.getElementById('predict-result');
        try {
          const { result } = await SS.api('/api/ai/predict-fixture', { method: 'POST', body: { fixtureId: fx.id } });
          renderPrediction(target, result, fx.id);
          await SS.refreshMe();
          SS.toast('Prediction ready!');
        } catch (err) {
          const needsCredits = /credit/i.test(err.message);
          target.innerHTML = `<div class="alert alert-danger small mb-2">${SS.esc(err.message)}</div>
            ${needsCredits ? '<a href="/ai-odds.html" class="btn btn-success btn-sm"><i class="bi bi-stars"></i> Get credits</a>' : ''}`;
          predictBtn.disabled = false;
          predictBtn.innerHTML = '<i class="bi bi-stars"></i> Try again <span class="small">(1 credit)</span>';
        }
      });
    }
  }

  await load();
  const openId = Number(new URLSearchParams(location.search).get('open'));
  if (Number.isInteger(openId) && openId > 0) {
    history.replaceState(null, '', location.pathname);
    openFixture(openId);
  }
});
