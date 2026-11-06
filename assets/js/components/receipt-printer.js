// ============================================================
// receipt-printer.js — ماكينة طباعة إيصال التسجيل (Vanilla JS)
// الاستخدام: mountReceiptPrinter(element, options)
//   → { play, replay, setStage, setStatus, root }
// ============================================================

const LOGO_SVG =
  '<svg class="rp-logo" xmlns="http://www.w3.org/2000/svg" viewBox="395 350 250 400" aria-hidden="true">' +
  '<path fill="#ffffff" d="M603.7,589.26c-19.66,0.07-38.85,2.04-57.41,5.71l-21.55-52.49l-26.43,66.27c-28.68,10.93-55.13,26.14-78.51,44.82l73.77-184.99l0,0l60.49-0.22l0.12,0.3L603.7,589.26z"/>' +
  '<path fill="#365aa2" d="M638.42,673.8c0.37,0.89-0.5,1.78-1.4,1.44c-17.03-6.31-35.45-9.75-54.67-9.75c-2.36,0-4.7,0.05-7.03,0.16c-45.12,1.98-85.31,22.97-112.75,55.16c-1.14,1.34-2.79,2.13-4.55,2.13l-5.26,0.02l-56.92,0.2c-1.49,0.01-2.48-1.57-1.8-2.9c20.69-40.44,54.88-73.26,96.87-92.94c18.99-8.91,39.57-15.13,61.22-18.14c9.86-1.38,19.94-2.09,30.2-2.09c9.6,0,19.04,0.62,28.29,1.83c0.75,0.1,1.4,0.6,1.68,1.3L638.42,673.8z"/>' +
  '</svg>';

const ICON_CHECK =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#22c55e"/><path d="M7 12.5l3.2 3.2L17 8.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CSS = `
.rp{position:relative;isolation:isolate;display:flex;flex-direction:column;align-items:center;width:100%;max-width:380px;margin:0 auto;direction:rtl;font-family:inherit}

.rp-machine{position:relative;z-index:2;width:100%;box-sizing:border-box;padding:12px 12px 30px;border-radius:24px;overflow:hidden;
  background:linear-gradient(160deg,#18264a 0%,#0b1430 55%,#070e20 100%);
  border:1px solid rgba(255,255,255,.10);
  box-shadow:0 24px 40px -20px rgba(0,0,0,.65),0 6px 14px -8px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.12),inset 0 -1px 0 rgba(0,0,0,.5)}
.rp-machine::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:radial-gradient(circle at 92% 0%,rgba(54,90,162,.38),transparent 55%),radial-gradient(circle at 5% 100%,rgba(255,209,84,.07),transparent 50%)}

.rp-head{position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;height:44px}
.rp-logo{height:32px;width:auto;display:block}
.rp-home{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:10px;
  font-size:12px;font-weight:800;color:#e8eefc;text-decoration:none;
  background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.04));
  border:1px solid rgba(255,255,255,.16);box-shadow:0 3px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.14);
  transition:transform .15s ease,box-shadow .15s ease}
.rp-home:hover{color:#fff;transform:translateY(-1px)}
.rp-home:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.35)}

.rp-screen{position:relative;z-index:1;border-radius:14px;padding:16px;color:#fff;background:#040914;
  border:1px solid rgba(255,255,255,.06);box-shadow:inset 0 0 24px 4px rgba(0,0,0,.55)}
.rp-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.rp-title{margin:0;font-size:15px;font-weight:800;line-height:1.4}
.rp-sub{margin:2px 0 0;font-size:12px;color:rgba(255,255,255,.55)}
.rp-total{text-align:left;flex-shrink:0}
.rp-total small{display:block;font-size:10.5px;color:rgba(255,255,255,.5)}
.rp-total strong{font-size:18px;font-weight:900;color:#ffd154;direction:ltr;unicode-bidi:isolate}

.rp-status{display:flex;align-items:center;gap:10px;margin-top:16px;min-height:20px}
.rp-ico{position:relative;display:grid;place-items:center;width:20px;height:20px;flex-shrink:0}
.rp-spin{width:16px;height:16px;border-radius:50%;border:2.5px solid rgba(156,191,247,.3);border-top-color:#9cbff7;animation:rp-spin .8s linear infinite}
@keyframes rp-spin{to{transform:rotate(360deg)}}
.rp-label{font-size:12.5px;font-weight:700;color:#9cbff7;animation:rp-fade .25s ease both}
.rp[data-stage="complete"] .rp-label{color:#86efac}
@keyframes rp-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}

.rp-slot{position:absolute;z-index:3;left:24px;right:24px;bottom:12px;height:8px;border-radius:4px;background:#02050d;box-shadow:inset 0 1px 3px #000,0 1px 0 rgba(255,255,255,.08)}

.rp-out{position:relative;z-index:3;width:80%;margin-top:-16px;overflow:hidden}
.rp-out::before{content:'';position:absolute;z-index:4;left:6px;right:6px;top:-2px;height:8px;background:rgba(0,0,0,.6);filter:blur(6px);pointer-events:none}
.rp-feed{position:relative;opacity:0;transform:translateY(-100%);will-change:transform}
.rp[data-stage="complete"] .rp-feed{opacity:1;transform:none}

.rp-paper{position:relative;box-sizing:border-box;padding:24px 20px 34px;color:#0b1224;background:#fdfdfb;
  font-family:ui-monospace,'SFMono-Regular',Consolas,monospace;
  filter:drop-shadow(0 10px 18px rgba(0,0,0,.28))}
.rp-p-logo{display:grid;place-items:center;width:40px;height:40px;margin:0 auto 6px;border-radius:8px;background:#071022}
.rp-p-logo .rp-logo{height:26px}
.rp-p-head{text-align:center;font-family:inherit;font-size:13px;font-weight:900;margin:0 0 2px}
.rp-p-sub{text-align:center;font-size:10.5px;color:#64748b;margin:0 0 12px;direction:ltr}
.rp-hr{border:0;border-top:1px dashed #cbd0d8;margin:10px 0}
.rp-row{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:3px 0;align-items:baseline}
.rp-row dt{color:#64748b;margin:0;flex-shrink:0}
.rp-row dd{margin:0;font-weight:700;text-align:left;min-width:0;overflow-wrap:anywhere}
.rp-row .ltr{direction:ltr;unicode-bidi:isolate}
.rp-grand{display:flex;justify-content:space-between;align-items:baseline;margin:2px 0}
.rp-grand span{font-size:12px;font-weight:900}
.rp-grand strong{font-size:20px;font-weight:900;direction:ltr;unicode-bidi:isolate}
.rp-chip{display:block;width:max-content;margin:12px auto 0;padding:4px 12px;border-radius:99px;font-size:11px;font-weight:800;
  background:#fef3c7;color:#b45309;border:1px solid #fde68a}
.rp-chip[data-tone="ok"]{background:#dcfce7;color:#15803d;border-color:#bbf7d0}
.rp-chip[data-tone="review"]{background:#dbeafe;color:#1d4ed8;border-color:#bfdbfe}
.rp-note{margin:12px 0 0;font-size:11px;line-height:1.7;color:#475569;text-align:center}
.rp-bars{display:block;width:70%;height:38px;margin:14px auto 2px}
.rp-bars rect{fill:#0b1224}
.rp-code{text-align:center;font-size:9.5px;letter-spacing:.3em;color:#64748b;direction:ltr}

.rp-replay{margin-top:14px;padding:8px 16px;border-radius:99px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;
  color:#9cbff7;background:rgba(54,90,162,.18);border:1px solid rgba(54,90,162,.45)}
.rp-replay:hover{color:#fff;background:#365aa2}

@media (max-width:420px){.rp{max-width:100%}.rp-out{width:86%}}
@media (prefers-reduced-motion:reduce){.rp-spin{animation:none}.rp-label{animation:none}}
`;

// ── خطوات الطباعة المتقطعة (زي ماكينات الكاشير) ──
const FEED_Y = ['calc(-100% + 2px)', '-91%', '-91%', '-81%', '-81%', '-70%', '-70%', '-58%', '-58%', '-45%',
  '-45%', '-32%', '-32%', '-20%', '-20%', '-10%', '-10%', '-3%', '-3%', '0%'];
const FEED_T = [0, .075, .105, .18, .21, .285, .315, .39, .42, .495, .525, .6, .63, .705, .735, .81, .84, .915, .945, 1];
const FEED_MS = 1750;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function injectStyle() {
  if (document.getElementById('rp-style')) return;
  const st = document.createElement('style');
  st.id = 'rp-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

// حافة الورقة المسننة
function tornEdgeClip() {
  const n = 40, d = 4, pts = [];
  for (let i = 0; i < n * 2; i++) {
    const x = 100 - ((i + 1) * 100) / (n * 2);
    pts.push(x + '% ' + (i % 2 === 0 ? '100%' : 'calc(100% - ' + d + 'px)'));
  }
  return 'polygon(0 0, 100% 0, 100% calc(100% - ' + d + 'px), ' + pts.join(', ') + ')';
}

// باركود شكلي مبني من الكود (نفس الكود = نفس الشكل)
function barcodeSvg(code) {
  const s = String(code || 'AMT');
  let x = 0, bars = '';
  for (let i = 0; i < s.length * 4 + 14; i++) {
    const w = 1 + ((s.charCodeAt(i % s.length) * (i + 3)) % 3);
    if (i % 2 === 0) bars += '<rect x="' + x + '" y="0" width="' + w + '" height="38"/>';
    x += w;
  }
  return '<svg class="rp-bars" viewBox="0 0 ' + x + ' 38" preserveAspectRatio="none" aria-hidden="true">' + bars + '</svg>';
}

export function mountReceiptPrinter(target, opts) {
  if (!target) return null;
  opts = opts || {};
  injectStyle();

  const labels = Object.assign({
    processing: 'بنسجّل طلبك...',
    printing: 'بنطبع إيصال التسجيل...',
    complete: 'تم تسجيل طلبك'
  }, opts.labels || {});

  const r = opts.receipt || {};
  const rows = (r.rows || []).map(function (row) {
    return '<div class="rp-row"><dt>' + esc(row.label) + '</dt><dd' + (row.ltr ? ' class="ltr"' : '') + '>' + esc(row.value) + '</dd></div>';
  }).join('');

  target.innerHTML =
    '<section class="rp" data-stage="processing" aria-label="إيصال التسجيل">' +
      '<div class="rp-machine">' +
        '<div class="rp-head">' + LOGO_SVG +
          (opts.homeHref
            ? '<a class="rp-home" href="' + esc(opts.homeHref) + '"><i class="fa-solid ' + esc(opts.homeIcon || 'fa-house') + '"></i> ' + esc(opts.homeLabel || 'الرئيسية') + '</a>'
            : '') +
        '</div>' +
        '<div class="rp-screen">' +
          '<div class="rp-top">' +
            '<div><p class="rp-title">' + esc(opts.title) + '</p><p class="rp-sub">' + esc(opts.subtitle) + '</p></div>' +
            '<div class="rp-total"><small>المبلغ</small><strong>' + esc(opts.amountText) + '</strong></div>' +
          '</div>' +
          '<div class="rp-status" role="status" aria-live="polite"><span class="rp-ico"></span><span class="rp-label"></span></div>' +
        '</div>' +
        '<div class="rp-slot" aria-hidden="true"></div>' +
      '</div>' +
      '<div class="rp-out"><div class="rp-feed" aria-hidden="true">' +
        '<article class="rp-paper" style="clip-path:' + tornEdgeClip() + '">' +
          '<div class="rp-p-logo">' + LOGO_SVG + '</div>' +
          '<h3 class="rp-p-head">' + esc(r.heading || 'إيصال تسجيل') + '</h3>' +
          '<p class="rp-p-sub">AHMED MOSTAFA TECH</p>' +
          '<hr class="rp-hr">' + rows + '<hr class="rp-hr">' +
          (r.total ? '<div class="rp-grand"><span>' + esc(r.total.label) + '</span><strong>' + esc(r.total.value) + '</strong></div>' : '') +
          (r.status ? '<span class="rp-chip" data-tone="' + esc(r.status.tone || 'wait') + '">' + esc(r.status.text) + '</span>' : '') +
          (r.note ? '<p class="rp-note">' + esc(r.note) + '</p>' : '') +
          '<hr class="rp-hr">' + barcodeSvg(r.code) +
          '<div class="rp-code">' + esc(r.code || '') + '</div>' +
        '</article>' +
      '</div></div>' +
      (opts.showReplay ? '<button type="button" class="rp-replay"><i class="fa-solid fa-rotate-right"></i> إعادة الطباعة</button>' : '') +
    '</section>';

  const root = target.querySelector('.rp');
  const feed = target.querySelector('.rp-feed');
  const out = target.querySelector('.rp-out');
  const ico = target.querySelector('.rp-ico');
  const label = target.querySelector('.rp-label');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let anim = null;
  let timers = [];

  function clearAll() {
    timers.forEach(clearTimeout);
    timers = [];
    if (anim) { anim.cancel(); anim = null; }
  }

  // حجز ارتفاع الورقة (يتحدّث تلقائياً لو الصفحة كانت مخفية أو الخط اتحمّل)
  function reserve() { out.style.height = feed.offsetHeight + 'px'; }
  if (window.ResizeObserver) new ResizeObserver(reserve).observe(feed);
  else window.addEventListener('resize', reserve);
  reserve();

  function paint(stage) {
    root.dataset.stage = stage;
    ico.innerHTML = stage === 'complete' ? ICON_CHECK : '<span class="rp-spin"></span>';
    label.textContent = labels[stage];
    label.style.animation = 'none'; void label.offsetWidth; label.style.animation = '';
  }

  function setStage(stage) {
    clearAll();
    paint(stage);
    feed.style.opacity = stage === 'processing' ? '0' : '1';
    feed.style.transform = stage === 'processing' ? 'translateY(-100%)' : 'translateY(0)';
    feed.setAttribute('aria-hidden', stage === 'complete' ? 'false' : 'true');
  }

  function play() {
    clearAll();
    setStage('processing');
    return new Promise(function (resolve) {
      if (reduce) {
        timers.push(setTimeout(function () { setStage('complete'); resolve(); }, 600));
        return;
      }
      timers.push(setTimeout(function () {
        paint('printing');
        feed.style.opacity = '1';
        anim = feed.animate(
          FEED_Y.map(function (y, i) { return { transform: 'translateY(' + y + ')', offset: FEED_T[i] }; }),
          { duration: FEED_MS, easing: 'linear', fill: 'forwards' }
        );
        anim.onfinish = function () { setStage('complete'); resolve(); };
      }, opts.processingMs || 1300));
    });
  }

  // تحديث حالة الإيصال (بعد رفع الإيصال مثلاً)
  function setStatus(o) {
    o = o || {};
    const chip = target.querySelector('.rp-chip');
    if (chip && o.text) { chip.textContent = o.text; chip.dataset.tone = o.tone || 'wait'; }
    const note = target.querySelector('.rp-note');
    if (note && o.note) note.textContent = o.note;
    if (o.label) labels.complete = o.label;
  }

  const replayBtn = target.querySelector('.rp-replay');
  if (replayBtn) replayBtn.addEventListener('click', play);

  setStage('processing');
  if (opts.autoPlay !== false) play();

  return { play: play, replay: play, setStage: setStage, setStatus: setStatus, root: root };
}