import { h } from '../../util/dom.js';
import { warn } from '../../util/log.js';
import { getSetting } from '../../data/repo.js';
import { buildLayout, isRedForm } from '../../omr/layout.js';
import * as client from '../../omr/client.js';
import { cameraSupported, startCamera, stopCamera, cameraIsDead, createAutoCapture, grabFrame, fileToImageData, pickPhoto } from '../camera.js';
import { isIOS } from '../../util/platform.js';
import { setCapture, setState } from '../state.js';
import { S } from '../strings.ms.js';
import { toast } from '../components.js';
import { loadTest, keyComplete, enc } from '../helpers.js';

// Engine error code -> BM message (S only has two; others are local).
const ERR = {
  NO_MARKERS: () => S.scan.failNoMarkers,
  BAD_GEOMETRY: () => S.scan.failNoMarkers,
  LOW_CONTRAST: () => `${S.scan.failGeneric} ${S.scan.hintLight}`,
  IMAGE_TOO_SMALL: () => `Gambar terlalu kecil. ${S.scan.hintTooFar}`,
  NO_FRAME: () => S.scan.failNoFrame,
};

export async function render(ctx) {
  const { test, notFound } = await loadTest(ctx.params.id);
  ctx.setHeader({ title: S.scan.title, back: notFound ? '#/' : `#/ujian/${enc(ctx.params.id)}` });
  if (notFound) return notFound;

  const keyMode = ctx.query.skema === '1';
  const id = enc(test.id);
  const exitHref = keyMode ? `#/ujian/${id}/skema` : `#/ujian/${id}`;
  if (!keyMode && !keyComplete(test)) {
    return h('div', { class: 'stack' }, h('p', { role: 'alert' }, S.home.needKey), h('a', { class: 'btn', href: `#/ujian/${id}/skema` }, S.home.key));
  }

  const layout = buildLayout(test.layoutConfig);
  // Official SPM red form: separate engine (redform.js); its thin red lines need >= 1200 px live frames.
  const red = isRedForm(test.layoutConfig);
  const detectOpts = red ? { format: layout.format } : undefined;
  const msgSearching = red ? S.scan.searchingSpm : S.scan.searching;
  const msgPartial = red ? S.scan.partialSpm : S.scan.found(2);
  const msgHolding = red ? S.scan.holdingSpm : S.scan.holding;
  const [thresholds, autoPref] = await Promise.all([getSetting('thresholds', null), getSetting('autoCapture', true)]);
  const scanOpts = thresholds ? { thresholds: { ...thresholds } } : undefined;

  let stream = null; let auto = null; let busy = false; let autoOn = !!autoPref; let live = false; let gone = false;
  let lastDetect = null;

  const video = h('video', { 'aria-hidden': 'true', playsinline: '', 'webkit-playsinline': '', autoplay: '', muted: true });
  video.muted = true; video.playsInline = true; // attribute alone is not enough on some iOS versions
  const frame = h('div', { class: 'frame', 'data-found': '0' }, h('i'), h('i'), h('i'), h('i'));
  const status = h('div', { class: 'scan__status', 'aria-live': 'polite' }, msgSearching);
  const retryBtn = h('button', { class: 'btn btn--lg', type: 'button', hidden: true }, S.scan.retry);
  const shutter = h('button', { class: 'shutter', type: 'button', 'aria-label': S.scan.capture, hidden: true });
  const photoBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, S.scan.takePhoto);
  const autoBtn = h('button', { class: 'btn btn--ghost', type: 'button', hidden: true, 'aria-pressed': String(autoOn) }, autoOn ? S.scan.autoOn : S.scan.autoOff);
  const startBtn = h('button', { class: 'btn', type: 'button', hidden: true }, S.scan.startCamera);
  const torchBtn =h('button', { class: 'btn btn--ghost', type: 'button', hidden: true, 'aria-pressed': 'false' }, S.scan.torch);

  const setStatus = (t) => { status.textContent = t; };
  const setFrame = (found, state) => { frame.dataset.found = String(found); if (state) frame.dataset.state = state; else delete frame.dataset.state; };

  function stopAll() {
    gone = true;
    auto?.stop();
    stopCamera(stream); stream = null;
  }

  async function detect(img) {
    const r = await client.detect(img, detectOpts);
    if (r && r.skipped) return lastDetect ?? { found: false, corners: null, error: null };
    lastDetect = r;
    return r;
  }

  function startAuto() {
    if (!live || !autoOn || busy || gone) return;
    auto = auto ?? createAutoCapture({
      detect,
      detectMaxSide: red ? 1200 : 640,
      onStatus: (st) => {
        if (st === 'searching') { setFrame(0); setStatus(msgSearching); }
        else if (st === 'partial') { setFrame(2); setStatus(msgPartial); }
        else if (st === 'holding') { setFrame(4, 'hold'); setStatus(msgHolding); }
        else if (st === 'captured') { setFrame(4); setStatus(S.scan.capturing); }
      },
      onCapture: (img) => process(img),
    });
    lastDetect = null;
    auto.start(video);
  }

  async function process(img) {
    if (busy || gone) return;
    busy = true;
    auto?.stop();
    retryBtn.hidden = true;
    setFrame(live ? 4 : 0);
    setStatus(S.scan.processing);
    status.setAttribute('aria-busy', 'true');
    let res;
    try {
      res = await client.scan(img, layout, scanOpts);
    } catch (e) {
      warn('scan', `gagal: ${e?.message}`);
      res = { ok: false, error: 'GENERIC' };
    }
    status.removeAttribute('aria-busy');
    if (gone) return;
    busy = false;
    if (!res.ok) {
      setFrame(0);
      setStatus((ERR[res.error] ?? (() => S.scan.failGeneric))());
      retryBtn.hidden = false;
      retryBtn.focus();
      return;
    }
    if (keyMode) {
      const key = res.answers.map((a) => (a.status === 'OK' ? a.choice : null));
      setState('keyDraft', { testId: test.id, key, unresolved: key.filter((k) => k === null).length });
      stopAll();
      ctx.navigate(`#/ujian/${id}/skema`);
      return;
    }
    setCapture(test.id, { imageData: img, scan: res });
    stopAll();
    ctx.navigate(`#/ujian/${id}/semak`);
  }

  async function fromFile() {
    const f = await pickPhoto({ capture: true });
    if (!f || gone) return;
    setStatus(S.scan.processing);
    try { await process(await fileToImageData(f, 1600)); } catch (e) {
      warn('scan', `foto gagal: ${e?.name}`);
      busy = false; setStatus(S.scan.failGeneric); retryBtn.hidden = false;
    }
  }

  photoBtn.addEventListener('click', fromFile);
  shutter.addEventListener('click', async () => {
    if (!live || busy) return;
    try { await process(grabFrame(video, 1600)); } catch { setStatus(S.scan.failGeneric); }
  });
  retryBtn.addEventListener('click', () => { retryBtn.hidden = true; setStatus(msgSearching); if (live) startAuto(); else fromFile(); });
  autoBtn.addEventListener('click', () => {
    autoOn = !autoOn;
    autoBtn.setAttribute('aria-pressed', String(autoOn));
    autoBtn.textContent = autoOn ? S.scan.autoOn : S.scan.autoOff;
    if (autoOn) startAuto(); else { auto?.stop(); setFrame(0); setStatus(S.scan.hintLight); }
  });
  torchBtn.addEventListener('click', async () => {
    const track = stream?.getVideoTracks()[0];
    const on = torchBtn.getAttribute('aria-pressed') !== 'true';
    try { await track.applyConstraints({ advanced: [{ torch: on }] }); torchBtn.setAttribute('aria-pressed', String(on)); } catch { torchBtn.hidden = true; }
  });

  ctx.onLeave(stopAll);

  const root = h('div', { class: 'scan' },
    h('div', { class: 'scan__top' },
      h('a', { class: 'btn-icon', href: exitHref, 'aria-label': S.scan.close, style: 'color:#fff' }, '✕'),
      h('span', { style: 'flex:1;font-weight:650' }, keyMode ? S.key.scanSheet : test.name),
      autoBtn, torchBtn),
    h('div', { class: 'scan__view' }, video, frame, status),
    h('div', { class: 'scan__bar' }, photoBtn, shutter, retryBtn, startBtn));

  async function startLive() {
    if (gone || busy) return;
    startBtn.hidden = true;
    try {
      stream = await startCamera(video);
      if (gone) { stopCamera(stream); stream = null; return; }
      live = true;
      shutter.hidden = false; autoBtn.hidden = false;
      // Torch is never offered on iOS (unsupported); elsewhere only if the track reports it.
      let torchOk = false;
      try { torchOk = !isIOS() && !!stream.getVideoTracks()[0]?.getCapabilities?.().torch; } catch { /* ignore */ }
      torchBtn.hidden = !torchOk;
      setStatus(msgSearching);
      startAuto();
    } catch (e) {
      warn('scan', `kamera: ${e?.name}`);
      if (!busy) setStatus(e?.name === 'NotAllowedError' ? S.scan.denied : S.scan.noCamera);
      photoBtn.className = 'btn btn--lg';
      // A tap is a user gesture: lets iOS re-ask permission / allow play() after a blocked autostart.
      startBtn.hidden = false;
    }
  }
  startBtn.addEventListener('click', startLive);

  // iOS pauses/kills the camera when the app goes to the background; restart on return.
  function onVisible() {
    if (document.visibilityState !== 'visible' || gone || busy || !live) return;
    if (cameraIsDead(stream, video)) {
      auto?.stop(); stopCamera(stream); stream = null; live = false;
      shutter.hidden = true; autoBtn.hidden = true;
      startLive();
    }
  }
  document.addEventListener('visibilitychange', onVisible);
  ctx.onLeave(() => document.removeEventListener('visibilitychange', onVisible));

  // Start camera after the node is mounted by the router.
  setTimeout(() => {
    if (gone) return;
    if (!cameraSupported()) { setStatus(window.isSecureContext ? S.scan.noCamera : S.scan.insecure); photoBtn.className = 'btn btn--lg'; return; }
    startLive();
  }, 0);

  return root;
}
