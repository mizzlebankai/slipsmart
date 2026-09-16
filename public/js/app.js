/* SlipSmart shared frontend core: API client, session state, layout, payments. */
window.SS = (() => {
  let me = null;
  let config = null;
  let firebaseReady = false;
  let theme = localStorage.getItem('slipsmart-theme') || 'dark';

  function applyTheme(nextTheme) {
    theme = nextTheme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('slipsmart-theme', theme);
  }

  applyTheme(theme);

  async function initFirebase(cfg) {
    if (!cfg.firebaseConfigured) return;
    if (!window.firebase) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not load Firebase.'));
        document.head.appendChild(script);
      });
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth-compat.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not load Firebase Auth.'));
        document.head.appendChild(script);
      });
    }
    if (!firebase.apps.length) firebase.initializeApp(cfg.firebaseConfig);
    window.firebaseAuth = firebase.auth();
    await new Promise((resolve) => window.firebaseAuth.onAuthStateChanged(resolve));
    firebaseReady = true;
  }

  async function api(path, { method = 'GET', body, form } = {}) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (firebaseReady && window.firebaseAuth.currentUser) {
      opts.headers.Authorization = `Bearer ${await window.firebaseAuth.currentUser.getIdToken()}`;
    }
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    if (form) opts.body = form;
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok) {
      if (res.status === 401 && firebaseReady && window.firebaseAuth.currentUser) {
        await window.firebaseAuth.signOut();
      }
      throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    return data;
  }

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ghs = (n) => `₵${Number(n || 0).toFixed(2)}`;

  const fmtTime = (iso) =>
    iso
      ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '—';

  function toast(message, type = 'success') {
    let holder = document.getElementById('ss-toasts');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'ss-toasts';
      holder.className = 'toast-container position-fixed top-0 end-0 p-3';
      document.body.appendChild(holder);
    }
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    holder.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 4000 });
    t.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
  }

  function renderNav() {
    const page = document.body.dataset.page || '';
    document.querySelector('nav.ss-nav')?.remove();
    const link = (href, label, key) =>
      `<li class="nav-item"><a class="nav-link ${page === key ? 'active' : ''}" href="${href}">${label}</a></li>`;
    const adminNavLink = me?.is_admin ? link('/admin.html', 'Admin', 'admin') : '';

    let right;
    if (me) {
      const credits = me.ai_credits > 0
        ? `<span class="badge rounded-pill text-bg-success me-2" title="AI credits"><i class="bi bi-stars"></i> ${me.ai_credits}</span>`
        : '';
      const admin = me.is_admin ? '<li><a class="dropdown-item" href="/admin.html"><i class="bi bi-speedometer2"></i> Admin</a></li>' : '';
      right = `${credits}
        <div class="dropdown">
          <a class="btn btn-outline-light btn-sm dropdown-toggle" href="#" data-bs-toggle="dropdown">
            <i class="bi bi-person-circle"></i> ${esc(me.name.split(' ')[0])}
          </a>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item" href="/account.html"><i class="bi bi-bag"></i> My purchases</a></li>
            ${admin}
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="#" id="ss-logout"><i class="bi bi-box-arrow-right"></i> Log out</a></li>
          </ul>
        </div>`;
    } else {
      right = `<a href="/login.html" class="btn btn-outline-light btn-sm me-2">Log in</a>
               <a href="/register.html" class="btn btn-success btn-sm">Sign up</a>`;
    }

    const nav = document.createElement('nav');
    nav.className = 'navbar navbar-expand-lg navbar-dark ss-nav sticky-top';
    nav.innerHTML = `
      <div class="container">
        <a class="navbar-brand fw-bold" href="/"><i class="bi bi-ticket-perforated-fill text-success"></i> SlipSmart</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#ssNav" aria-controls="ssNav" aria-expanded="false" aria-label="Toggle navigation"><i class="bi bi-list"></i></button>
        <div class="collapse navbar-collapse" id="ssNav">
          <ul class="navbar-nav me-auto">
            ${link('/', 'Home', 'home')}
            ${link('/matches.html', 'Matches', 'matches')}
            ${link('/slips.html', 'Slips', 'slips')}
            ${link('/ai-odds.html', 'AI Odds', 'ai')}
            ${adminNavLink}
          </ul>
          <div class="d-flex align-items-center gap-1">
            <button class="btn btn-sm ss-theme-toggle" id="ss-theme-toggle" type="button" title="Switch theme" aria-label="Switch theme">
              <i class="bi ${theme === 'dark' ? 'bi-sun' : 'bi-moon-stars'}"></i>
            </button>
            ${right}
          </div>
        </div>
      </div>`;
    document.body.prepend(nav);

    document.getElementById('ss-theme-toggle').addEventListener('click', () => {
      applyTheme(theme === 'dark' ? 'light' : 'dark');
      renderNav();
    });

    const logout = document.getElementById('ss-logout');
    if (logout) {
      logout.addEventListener('click', async (e) => {
        e.preventDefault();
        if (firebaseReady && window.firebaseAuth.currentUser) await window.firebaseAuth.signOut();
        await api('/api/auth/logout', { method: 'POST' });
        location.href = '/';
      });
    }
  }

  function renderFooter() {
    const footer = document.createElement('footer');
    footer.className = 'ss-footer text-center text-lg-start mt-5';
    footer.innerHTML = `
      <div class="container py-4">
        <div class="row">
          <div class="col-lg-6 mb-3">
            <h6 class="fw-bold"><i class="bi bi-ticket-perforated-fill text-success"></i> SlipSmart</h6>
            <p class="small mb-1">Expert betting slips and AI-generated odds from any match screenshot.</p>
            <p class="small text-secondary mb-0">Odds and slips are analysis, not guarantees. Bet responsibly.</p>
          </div>
          <div class="col-lg-6 mb-3 text-lg-end">
            <p class="small text-secondary mb-2"><i class="bi bi-shield-exclamation"></i> Strictly 18+. Gambling can be addictive — only stake what you can afford to lose.</p>
            <a class="small me-3" href="/slips.html">Buy slips</a>
            <a class="small me-3" href="/ai-odds.html">AI odds</a>
            <a class="small" href="/matches.html">Live matches</a>
          </div>
        </div>
      </div>`;
    document.body.appendChild(footer);
  }

  async function refreshMe() {
    const res = await api('/api/auth/me');
    me = res.user;
    document.querySelector('nav.ss-nav')?.remove();
    renderNav();
    return me;
  }

  function requireLogin() {
    if (me) return true;
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `/login.html?next=${next}`;
    return false;
  }

  // Creates a pending purchase, then either opens Paystack or falls back to demo pay.
  // Returns the verify/demo-pay response, or null when the flow was cancelled.
  async function startPayment({ type, slipId, packId }) {
    if (!requireLogin()) return null;
    const ref = await api('/api/payments/reference', { method: 'POST', body: { type, slipId, packId } });

    if (!ref.paystackEnabled) {
      if (ref.demoPayments && confirm('Payment gateway is not configured (demo mode).\nSimulate a successful payment?')) {
        const done = await api('/api/payments/demo-pay', { method: 'POST', body: { reference: ref.reference } });
        await refreshMe();
        return done;
      }
      if (!ref.demoPayments) alert('Online payments are not configured yet.');
      return null;
    }

    return new Promise((resolve) => {
      try {
        if (!window.PaystackPop || typeof window.PaystackPop.setup !== 'function') {
          throw new Error('Paystack checkout could not load. Disable ad blockers and refresh the page.');
        }
        const handler = window.PaystackPop.setup({
          key: ref.paystackPublicKey,
          email: me.email,
          amount: ref.amountPesewas,
          currency: ref.currency,
          ref: ref.reference,
          callback: (response) => {
            (async () => {
              try {
                const v = await api('/api/payments/verify/' + encodeURIComponent(response.reference));
                await refreshMe();
                resolve(v);
              } catch (err) {
                alert(err.message);
                resolve(null);
              }
            })();
          },
          onClose: () => resolve(null),
        });
        handler.openIframe();
      } catch (err) {
        alert(err.message || 'Unable to open Paystack checkout.');
        resolve(null);
      }
    });
  }

  let initPromise = null;
  function init() {
    if (!initPromise) {
      initPromise = (async () => {
        const cfg = await api('/api/config');
        config = cfg;
        await initFirebase(cfg);
        const meRes = await api('/api/auth/me');
        me = meRes.user;
        renderNav();
        renderFooter();
      })();
    }
    return initPromise;
  }

  return {
    init,
    api,
    get firebaseReady() { return firebaseReady; },
    esc,
    ghs,
    fmtTime,
    toast,
    refreshMe,
    requireLogin,
    startPayment,
    get me() { return me; },
    get config() { return config; },
  };
})();

document.addEventListener('DOMContentLoaded', () => SS.init());
