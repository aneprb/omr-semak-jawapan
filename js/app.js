// Bootstrap + hash router (PLAN.md 4.8). Views load lazily from js/ui/views/<name>.js;
// a view module exports `render(ctx)` returning a Node (or a Promise of one).
// ctx = { params, query, setHeader({title, back, wide}), navigate(hash), onLeave(fn) }
import { h, mount } from './util/dom.js';
import { warn, debug } from './util/log.js';
import { S } from './ui/strings.ms.js';
import { skeleton, emptyState } from './ui/components.js';
import { isIOSSafari, isStandalone, shouldShowInstallBanner, installBannerDismissed, dismissInstallBanner } from './util/platform.js';
import { requestPersist } from './data/persist.js';

export const ROUTES = [
  ['/', 'tests-list'],
  ['/ujian/baru', 'test-form'],
  ['/ujian/:id', 'test-home'],
  ['/ujian/:id/skema', 'key-entry'],
  ['/ujian/:id/roster', 'roster'],
  ['/ujian/:id/templat', 'template'],
  ['/ujian/:id/imbas', 'scan'],
  ['/ujian/:id/semak', 'review'],
  ['/ujian/:id/keputusan', 'results'],
  ['/ujian/:id/keputusan/:rid', 'result-detail'],
  ['/ujian/:id/analisis', 'analysis'],
  ['/tetapan', 'settings'],
].map(([pattern, view]) => ({ pattern, view, parts: pattern.split('/').filter(Boolean) }));

const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

export function matchRoute(path) {
  const [p, qs = ''] = path.split('?');
  const segs = p.split('/').filter(Boolean).map(dec);
  const query = Object.fromEntries(new URLSearchParams(qs));
  for (const r of ROUTES) {
    if (r.parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    r.parts.forEach((part, i) => {
      if (part.startsWith(':')) params[part.slice(1)] = segs[i];
      else if (part !== segs[i]) ok = false;
    });
    if (ok) return { view: r.view, params, query, pattern: r.pattern };
  }
  return null;
}

const appEl = document.getElementById('app');
let headerTitle; let headerBack; let mainEl; let tabbarEl; let bannerSlot;
let leaveFns = [];
let navToken = 0;

function shell() {
  headerBack = h('a', { class: 'btn-icon', href: '#/', 'aria-label': S.app.back, hidden: true }, '←');
  headerTitle = h('h1', null, S.app.name);
  mainEl = h('main', { class: 'main', id: 'view', tabindex: '-1' });
  tabbarEl = h('nav', { class: 'tabbar', 'aria-label': 'Utama' });
  bannerSlot = h('div', { id: 'banner-slot' });
  mount(
    appEl,
    h('a', { class: 'sr-only', href: '#view' }, S.app.skip ?? 'Langkau ke kandungan'),
    h('div', { id: 'install-slot' }),
    bannerSlot,
    h('header', { class: 'header' }, headerBack, headerTitle),
    mainEl,
    tabbarEl,
    h('div', { class: 'toast-host' }),
  );
}

function renderTabs(params, hash) {
  const id = params?.id && params.id !== 'baru' ? encodeURIComponent(params.id) : null;
  const tabs = id
    ? [[S.nav.scan, `#/ujian/${id}/imbas`, '◉'], [S.nav.results, `#/ujian/${id}/keputusan`, '▤'],
       [S.nav.analysis, `#/ujian/${id}/analisis`, '▥'], [S.nav.key, `#/ujian/${id}/skema`, '✎']]
    : [[S.nav.tests, '#/', '▤'], [S.nav.settings, '#/tetapan', '⚙']];
  mount(tabbarEl, tabs.map(([label, href, ico]) => {
    const cur = hash === href || (href !== '#/' && hash.startsWith(href + '/'));
    return h('a', { href, 'aria-current': cur ? 'page' : null },
      h('span', { class: 'ico', 'aria-hidden': 'true' }, ico), label);
  }));
}

function errorView(retry) {
  return h('div', { class: 'stack', role: 'alert' },
    h('h2', null, S.errors.generic),
    h('button', { class: 'btn', type: 'button', onclick: retry }, S.scan.retry));
}

async function route() {
  const token = ++navToken;
  for (const fn of leaveFns.splice(0)) { try { fn(); } catch { /* ignore */ } }
  const hash = location.hash.replace(/^#?/, '#') === '#' ? '#/' : location.hash;
  const m = matchRoute(hash.slice(1));
  const hdr = { title: S.app.name, back: null, wide: false };
  const ctx = {
    params: m?.params ?? {}, query: m?.query ?? {},
    setHeader: (o) => Object.assign(hdr, o),
    navigate: (to) => { location.hash = to; },
    onLeave: (fn) => leaveFns.push(fn),
  };
  renderTabs(ctx.params, hash.split('?')[0]);
  if (!m) {
    applyHeader(hdr);
    mount(mainEl, emptyState({ title: S.errors.notFound, action: { label: S.tests.title, href: '#/' } }));
    return;
  }
  mount(mainEl, skeleton(3));
  const t0 = performance.now();
  let node;
  let mod = null;
  try { mod = await import(`./ui/views/${m.view}.js`); } catch { warn('router', `view ${m.view} tidak dimuat`); }
  if (!mod || typeof mod.render !== 'function') {
    node = emptyState({ title: 'Akan datang', body: 'Skrin ini belum siap.', action: { label: S.tests.title, href: '#/' } });
  } else {
    try { node = await mod.render(ctx); } catch (e) {
      warn('router', `view ${m.view} ralat: ${e?.name}`);
      node = errorView(() => route());
    }
  }
  if (token !== navToken) return;
  applyHeader(hdr);
  mount(mainEl, node);
  window.scrollTo(0, 0);
  mainEl.focus({ preventScroll: true });
  debug('router', `${m.pattern} ${Math.round(performance.now() - t0)}ms`);
}

function applyHeader({ title, back, wide }) {
  headerTitle.textContent = title;
  document.title = title === S.app.name ? title : `${title} · ${S.app.name}`;
  if (back) { headerBack.setAttribute('href', back); headerBack.hidden = false; } else headerBack.hidden = true;
  mainEl.className = wide ? 'main main--wide' : 'main';
}

function showUpdateBanner(worker) {
  mount(bannerSlot, h('div', { class: 'banner', role: 'status' }, S.update.available,
    h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => {
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      worker.postMessage({ type: 'SKIP_WAITING' });
    } }, S.update.reload)));
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    const head = await fetch('sw.js', { method: 'HEAD', cache: 'no-store' });
    if (!head.ok) return;
    // updateViaCache 'none': the precache list (importScripts) is fetched past the HTTP cache too, otherwise a
    // phone can keep the old list for the host's max-age and see no update
    const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(nw);
      });
    });
    // an installed app on a phone is resumed, not reloaded, so the check at load alone may never run again
    let lastCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 60000) return;
      lastCheck = Date.now();
      reg.update().catch(() => {});
    });
  } catch (e) {
    warn('sw', `daftar gagal: ${e?.name}`);
  }
}

// One-time iOS Safari hint (not standalone); dismissal remembered in localStorage.
function showInstallBanner() {
  if (!shouldShowInstallBanner({ iosSafari: isIOSSafari(), standalone: isStandalone(), dismissed: installBannerDismissed() })) return;
  const slot = document.getElementById('install-slot');
  if (!slot) return;
  mount(slot, h('div', { class: 'banner banner--install', role: 'note' }, h('span', null, S.install.ios),
    h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => { dismissInstallBanner(); mount(slot); } }, S.install.dismiss)));
}

function boot() {
  shell();
  showInstallBanner();
  requestPersist();
  if (!globalThis.indexedDB) {
    mount(mainEl, h('p', { role: 'alert' }, S.errors.storage));
    return;
  }
  window.addEventListener('hashchange', route);
  route();
  registerServiceWorker();
}

if (appEl) boot();
