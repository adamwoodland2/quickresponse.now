'use strict';

// Everything happens here, in the browser. No network calls, no storage of
// what you encode — only style preferences are remembered (localStorage).

qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const PREFS_KEY = 'qrn-prefs-v1';
const SAMPLE = 'https://quickresponse.now';
const MARGIN = 4; // quiet zone in modules — the spec's minimum, and what scanners expect

const els = {
  form: $('#fields'),
  code: $('#code'),
  viewfinder: $('#viewfinder'),
  sampleNote: $('#sampleNote'),
  health: $('#health'),
  status: $('#status'),
  textHint: $('#textHint'),
  fg: $('input[name="fg"]'),
  bg: $('input[name="bg"]'),
  fgOut: $('#fgOut'),
  bgOut: $('#bgOut'),
  ecc: $('select[name="ecc"]'),
  pngSize: $('#pngSize'),
  style: $('#style'),
};

let current = null; // { qr, n, payload, isSample, type }

// ---- payload builders --------------------------------------------------

const v = (name) => {
  const el = els.form.querySelector(`[name="${name}"]`);
  return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : '';
};

// WIFI: and vCard both escape the same set of characters.
const escWifi  = (s) => s.replace(/([\\;,":])/g, '\\$1');
const escVcard = (s) => s.replace(/\\/g, '\\\\').replace(/([;,])/g, '\\$1').replace(/\r?\n/g, '\\n');

// A single line that looks like a web address becomes a link; if it has no
// scheme we add https:// so every phone treats it as one. Anything else is text.
function looksLikeUrl(s) {
  if (/\s/.test(s)) return false;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/|$|\?|#)/i.test(s);
}

const BUILDERS = {
  text() {
    const t = v('text');
    if (!t) return '';
    if (!looksLikeUrl(t)) return t;
    return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : 'https://' + t;
  },
  wifi() {
    const ssid = v('ssid');
    if (!ssid) return '';
    const enc = v('encryption');
    let s = `WIFI:T:${enc};S:${escWifi(ssid)};`;
    if (enc !== 'nopass' && v('password')) s += `P:${escWifi(v('password'))};`;
    if (v('hidden')) s += 'H:true;';
    return s + ';';
  },
  contact() {
    const first = v('first'), last = v('last');
    if (!first && !last && !v('cphone') && !v('cemail') && !v('org')) return '';
    const fn = [first, last].filter(Boolean).join(' ') || v('org');
    const lines = ['BEGIN:VCARD', 'VERSION:3.0',
      `N:${escVcard(last)};${escVcard(first)};;;`,
      `FN:${escVcard(fn)}`];
    if (v('org'))    lines.push(`ORG:${escVcard(v('org'))}`);
    if (v('title'))  lines.push(`TITLE:${escVcard(v('title'))}`);
    if (v('cphone')) lines.push(`TEL;TYPE=CELL:${v('cphone')}`);
    if (v('cemail')) lines.push(`EMAIL:${v('cemail')}`);
    if (v('curl'))   lines.push(`URL:${v('curl')}`);
    if (v('adr'))    lines.push(`ADR;TYPE=WORK:;;${escVcard(v('adr'))};;;;`);
    lines.push('END:VCARD');
    return lines.join('\r\n');
  },
  email() {
    const to = v('to');
    if (!to) return '';
    const q = [];
    if (v('subject')) q.push('subject=' + encodeURIComponent(v('subject')));
    if (v('body'))    q.push('body=' + encodeURIComponent(v('body')));
    return 'mailto:' + to + (q.length ? '?' + q.join('&') : '');
  },
  sms() {
    const n = v('smsnum');
    if (!n) return '';
    return `SMSTO:${n.replace(/\s+/g, '')}:${v('smsbody')}`;
  },
  phone() {
    const n = v('phone');
    return n ? 'tel:' + n.replace(/[\s()-]/g, '') : '';
  },
  geo() {
    const lat = parseFloat(v('lat')), lng = parseFloat(v('lng'));
    if (Number.isNaN(lat) || Number.isNaN(lng)) return '';
    return `geo:${lat},${lng}`;
  },
};

const FILE_HINT = {
  text: () => v('text'), wifi: () => v('ssid'),
  contact: () => [v('first'), v('last')].filter(Boolean).join('-'),
  email: () => v('to'), sms: () => v('smsnum'), phone: () => v('phone'),
  geo: () => `${v('lat')}_${v('lng')}`,
};

function activeType() { return $('input[name="type"]:checked').value; }

// ---- rendering -----------------------------------------------------------

function paint(qr, opts, p) {
  const n = qr.getModuleCount();
  const m = opts.margin;
  const total = n + 2 * m;
  const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const rx = opts.shape === 'square' ? 0 : 0.3;

  p.begin(total, opts.bg);
  p.fill(opts.fg);

  // Data modules
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c) || inFinder(r, c)) continue;
      const x = c + m, y = r + m;
      if (opts.shape === 'dots') p.circle(x + 0.5, y + 0.5, 0.42);
      else if (opts.shape === 'rounded') p.rect(x + 0.05, y + 0.05, 0.9, 0.9, rx);
      else p.rect(x, y, 1, 1, 0);
    }
  }

  // Finder patterns are drawn as solid shapes so they stay unmistakable
  // whatever the module style — scanners lock onto these first.
  const frx = opts.shape === 'square' ? 0 : 1.2;
  for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = fc + m, y = fr + m;
    p.fill(opts.fg); p.rect(x, y, 7, 7, frx);
    p.fill(opts.bg); p.rect(x + 1, y + 1, 5, 5, frx * 0.7);
    p.fill(opts.fg); p.rect(x + 2, y + 2, 3, 3, frx * 0.4);
  }
  return p.end();
}

function svgPainter(px) {
  let out = '', colour = '', total = 0;
  return {
    begin(t, bg) {
      total = t;
      out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" width="${px}" height="${px}">` +
            `<rect width="${t}" height="${t}" fill="${bg}"/>`;
    },
    fill(c) { colour = c; },
    rect(x, y, w, h, rx) {
      out += rx ? `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${colour}"/>`
                : `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${colour}"/>`;
    },
    circle(cx, cy, r) { out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${colour}"/>`; },
    end() { return out + '</svg>'; },
  };
  function f(n) { return Number.isInteger(n) ? n : n.toFixed(2); }
}

function canvasPainter(px) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  let s = 1;
  return {
    begin(t, bg) { s = px / t; ctx.fillStyle = bg; ctx.fillRect(0, 0, px, px); },
    fill(c) { ctx.fillStyle = c; },
    rect(x, y, w, h, rx) {
      ctx.beginPath();
      if (rx && ctx.roundRect) ctx.roundRect(x * s, y * s, w * s, h * s, rx * s);
      else ctx.rect(x * s, y * s, w * s, h * s);
      ctx.fill();
    },
    circle(cx, cy, r) { ctx.beginPath(); ctx.arc(cx * s, cy * s, r * s, 0, Math.PI * 2); ctx.fill(); },
    end() { return canvas; },
  };
}

function styleOpts() {
  return {
    fg: els.fg.value, bg: els.bg.value,
    shape: $('input[name="shape"]:checked').value,
    margin: MARGIN,
    ecc: els.ecc.value,
  };
}

// ---- scan health --------------------------------------------------------

function luminance(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function health(qr, opts, payload) {
  const items = [];
  const n = qr.getModuleCount();
  const total = n + 2 * opts.margin;

  const cr = contrast(opts.fg, opts.bg);
  const inverted = luminance(opts.fg) > luminance(opts.bg);
  if (inverted) items.push(['bad', 'Light code on a dark background — many phone cameras can\'t read inverted codes. Swap the colours.']);
  else if (cr < 2.5) items.push(['bad', `Contrast too low (${cr.toFixed(1)}:1) — most scanners need 4:1 or better.`]);
  else if (cr < 4) items.push(['warn', `Contrast is marginal (${cr.toFixed(1)}:1) — fine on a screen, risky in print or low light.`]);
  else items.push(['ok', `Contrast ${cr.toFixed(1)}:1 — scans easily.`]);

  // ~0.5 mm per module keeps a phone comfortable at arm's length; never below 2 cm.
  const minMm = Math.max(20, Math.ceil(total * 0.5));
  const version = (n - 17) / 4;
  if (version >= 20) items.push(['warn', `Dense code (${payload.length} characters) — print at least ${minMm / 10} cm wide, or shorten the content.`]);
  else items.push(['ok', `Print at ${minMm / 10} cm wide or larger; scans from about ${minMm} cm away.`]);

  return items;
}

// ---- main render ----------------------------------------------------------

let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 50);
}

function render() {
  const type = activeType();
  let payload = BUILDERS[type]();
  const isSample = !payload;
  if (isSample) payload = SAMPLE;
  const opts = styleOpts();

  let qr;
  try {
    qr = qrcode(0, opts.ecc);
    qr.addData(payload);
    qr.make();
  } catch (err) {
    els.code.classList.add('stale');
    els.health.innerHTML = '';
    setStatus(`Too much for one code (${payload.length} characters) — shorten it or lower the damage tolerance.`, 'bad');
    current = null;
    setButtons(false);
    return;
  }

  current = { qr, n: qr.getModuleCount(), payload, isSample, type };
  els.code.classList.remove('stale');
  els.code.innerHTML = paint(qr, opts, svgPainter(360));
  els.code.setAttribute('aria-label', isSample ? 'Sample QR code' : `QR code for ${type}`);
  els.sampleNote.hidden = !isSample;

  if (type === 'text') {
    els.textHint.textContent = isSample
      ? 'Paste a web address and it opens as a link. Anything else is shown as text.'
      : (looksLikeUrl(v('text')) ? 'Opens as a link when scanned.' : 'Shown as text when scanned.');
  }

  els.health.innerHTML = health(qr, opts, payload)
    .map(([lvl, text]) => `<li class="${lvl}">${text}</li>`).join('');

  setStatus('');
  setButtons(true);
  snap();
}

function snap() {
  els.viewfinder.classList.remove('snap');
  void els.viewfinder.offsetWidth;
  els.viewfinder.classList.add('snap');
  setTimeout(() => els.viewfinder.classList.remove('snap'), 180);
}

function setStatus(msg, kind) {
  els.status.textContent = msg;
  els.status.className = 'status' + (kind ? ' ' + kind : '');
}
function setButtons(enabled) {
  for (const id of ['dlSvg', 'dlPng', 'copyPng']) $('#' + id).disabled = !enabled;
}

// ---- export -------------------------------------------------------------

function filename(ext) {
  const hint = (FILE_HINT[current.type]() || 'code')
    .replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase();
  return `qr-${current.isSample ? 'sample' : current.type}-${hint || 'code'}.${ext}`;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function downloadSvg() {
  if (!current) return;
  const svg = paint(current.qr, styleOpts(), svgPainter(1024));
  download(new Blob([svg], { type: 'image/svg+xml' }), filename('svg'));
  setStatus('Downloaded SVG.', 'ok');
}

function pngBlob() {
  const px = parseInt(els.pngSize.value, 10);
  const canvas = paint(current.qr, styleOpts(), canvasPainter(px));
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}

async function downloadPng() {
  if (!current) return;
  download(await pngBlob(), filename('png'));
  setStatus(`Downloaded PNG at ${els.pngSize.value} px.`, 'ok');
}

async function copyPng() {
  if (!current) return;
  if (!navigator.clipboard || !window.ClipboardItem) {
    setStatus('This browser can\'t copy images — download the PNG instead.', 'bad');
    return;
  }
  try {
    // Safari needs the promise handed over synchronously inside the gesture.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]);
    setStatus('Copied — paste it anywhere that takes an image.', 'ok');
  } catch (err) {
    setStatus('Couldn\'t copy — download the PNG instead.', 'bad');
  }
}

// ---- prefs ---------------------------------------------------------------

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (p.fg) els.fg.value = p.fg;
    if (p.bg) els.bg.value = p.bg;
    if (p.ecc) els.ecc.value = p.ecc;
    if (p.shape) { const r = $(`input[name="shape"][value="${p.shape}"]`); if (r) r.checked = true; }
    if (p.png) els.pngSize.value = p.png;
  } catch (e) { /* prefs are a convenience only */ }
}
function savePrefs() {
  try {
    const o = styleOpts();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...o, png: els.pngSize.value }));
  } catch (e) { /* private mode, etc. */ }
}

// ---- wiring ----------------------------------------------------------------

function showType(type) {
  for (const box of $$('.fields')) box.hidden = box.dataset.type !== type;
  const first = $(`.fields[data-type="${type}"] input, .fields[data-type="${type}"] textarea`);
  if (first && !('ontouchstart' in window)) first.focus();
}

for (const r of $$('input[name="type"]')) {
  r.addEventListener('change', () => { showType(r.value); render(); });
}

els.form.addEventListener('input', (e) => {
  if (e.target === els.fg) els.fgOut.value = els.fg.value;
  if (e.target === els.bg) els.bgOut.value = els.bg.value;
  if (e.target.closest('.style')) savePrefs();
  scheduleRender();
});
els.form.addEventListener('submit', (e) => e.preventDefault());

for (const sw of $$('.swatch')) {
  sw.addEventListener('click', () => { els.fg.value = sw.dataset.c; els.fgOut.value = sw.dataset.c; savePrefs(); render(); });
}
$('#swap').addEventListener('click', () => {
  [els.fg.value, els.bg.value] = [els.bg.value, els.fg.value];
  els.fgOut.value = els.fg.value; els.bgOut.value = els.bg.value;
  savePrefs(); render();
});
els.pngSize.addEventListener('change', savePrefs);

$('#dlSvg').addEventListener('click', downloadSvg);
$('#dlPng').addEventListener('click', downloadPng);
$('#copyPng').addEventListener('click', copyPng);
$('#printBtn').addEventListener('click', () => window.print());

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); downloadSvg(); }
});

// ?url=… / ?text=… prefill, so the generator can be linked to directly.
(function prefill() {
  const q = new URLSearchParams(location.search);
  const pre = q.get('url') || q.get('text');
  if (pre) { $('input[name="type"][value="text"]').checked = true; $('textarea[name="text"]').value = pre; }
})();

loadPrefs();
els.fgOut.value = els.fg.value; els.bgOut.value = els.bg.value;
showType(activeType());
render();

// ---- PWA: offline cache + installability ------------------------------
// The service worker (sw.js) serves code network-first (deploys land
// immediately, cache covers offline) and images cache-first. Registered
// only where service workers exist; localhost is allowed for testing.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* PWA is optional — the site works without it */ });
}
