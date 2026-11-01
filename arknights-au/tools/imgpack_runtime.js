// ---- 실행부: <img> · new Image()가 묶인 경로를 쓰면 시트에서 잘라 data URL로 바꿔 넣음 ----
(() => {
  const MAP = window.IMGPACK_MAP || {}, sheets = {}, cache = {}, waiting = [];
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  const norm = (v) => String(v || '').replace(/^\.\//, '').replace(/^.*?\/(img\/)/, (m, a) => (m.startsWith('img/') ? m : a));
  const keyOf = (v) => { if (!v || v.startsWith('data:')) return null; const k = norm(v); return MAP[k] ? k : null; };
  function urlFor(k) {
    if (cache[k]) return cache[k];
    const [s, x, y, w, h] = MAP[k], sh = sheets[s];
    if (!sh || !sh.ready) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(sh.img, x, y, w, h, 0, 0, w, h);
    return (cache[k] = c.toDataURL('image/png'));
  }
  function apply(el, k) {
    const u = urlFor(k);
    if (u) desc.set.call(el, u);
    else waiting.push([el, k]);
  }
  for (const s of new Set(Object.values(MAP).map((v) => v[0]))) {
    const img = new Image(), rec = (sheets[s] = { img, ready: false });
    img.onload = () => {
      rec.ready = true;
      for (let i = waiting.length - 1; i >= 0; i--) { const [el, k] = waiting[i]; if (MAP[k][0] === s) { waiting.splice(i, 1); apply(el, k); } }
    };
    desc.set.call(img, s);
  }
  // 1) 스크립트에서 img.src = '...'
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true, enumerable: true,
    get() { return desc.get.call(this); },
    set(v) { const k = keyOf(v); if (k) apply(this, k); else desc.set.call(this, v); },
  });
  // 2) innerHTML · 마크업의 <img src="...">
  const scan = (root) => {
    if (root.nodeType !== 1) return;
    const list = root.tagName === 'IMG' ? [root] : root.querySelectorAll('img[src]');
    for (const el of list) { const k = keyOf(el.getAttribute('src')); if (k) apply(el, k); }
  };
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'attributes') { const k = keyOf(m.target.getAttribute('src')); if (k) apply(m.target, k); }
      else for (const n of m.addedNodes) scan(n);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  document.addEventListener('DOMContentLoaded', () => scan(document.body));
  // CSS 배경 등에 쓸 때: 준비됐으면 data URL, 아니면 원래 경로
  window.IMGPACK = { src: (p) => { const k = keyOf(p); return (k && urlFor(k)) || p; } };
})();
