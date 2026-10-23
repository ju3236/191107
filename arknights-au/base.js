'use strict';
// =====================================================================
//  잿빛 등대 — 기반시설 (무역소 · 제조소 · 응접실)
//  계정 데이터 player.base = { lv, ops, at, acc } (시설 id별)
// =====================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const { esc, icon, toast, openModal, closeModal, RENDER, save, writeSave, renderResources, OPS } = UI;
  const sfx = (n) => window.SFX && SFX.play(n);
  const fmt = (n) => Number(Math.floor(n)).toLocaleString('ko-KR');
  const FAC = BASE.facilities;
  const EXP_ITEMS = ['exp_4', 'exp_3', 'exp_2', 'exp_1'];
  const MAX_LV = 3;

  function state() {
    const b = save.base = save.base || {};
    for (const k of ['lv', 'ops', 'at', 'acc']) b[k] = b[k] || {};
    const now = Date.now();
    for (const f of FAC) {
      b.lv[f.id] = Math.max(1, Math.min(MAX_LV, b.lv[f.id] | 0 || 1));
      b.ops[f.id] = (b.ops[f.id] || []).filter((id) => OPS[id] && ACCOUNT.owns(id)).slice(0, f.slots[b.lv[f.id] - 1]);
      if (!b.at[f.id]) b.at[f.id] = now;
      b.acc[f.id] = b.acc[f.id] || 0;
    }
    return b;
  }
  // 배치 오퍼레이터 한 명의 효율
  const opEff = (f, id) => BASE.opEff + (f.classes.includes(OPS[id].class) ? BASE.classEff : 0) + TRAIN.prog(id).elite * BASE.eliteEff;
  const effOf = (f, b) => b.ops[f.id].reduce((s, id) => s + opEff(f, id), 0);
  const rateOf = (f, b) => f.rate[b.lv[f.id] - 1] * (f.out === 'trust' ? 1 : effOf(f, b));
  const capOf = (f, b) => f.rate[b.lv[f.id] - 1] * f.cap[b.lv[f.id] - 1];
  // 지난 시간만큼 생산 (보관 한도까지). 응접실은 바로 신뢰도에 반영
  function settle(b = state()) {
    const now = Date.now();
    for (const f of FAC) {
      const h = Math.min(f.cap[b.lv[f.id] - 1], Math.max(0, (now - b.at[f.id]) / 3600e3));
      b.at[f.id] = now;
      if (!b.ops[f.id].length || h <= 0) continue;
      if (f.out === 'trust') {
        save.trust = save.trust || {};
        for (const id of b.ops[f.id]) save.trust[id] = Math.min(200, (save.trust[id] || 0) + rateOf(f, b) * h);
      } else b.acc[f.id] = Math.min(capOf(f, b), b.acc[f.id] + rateOf(f, b) * h);
    }
    writeSave();
    return b;
  }
  // 경험치 → 작전기록 (남는 경험치는 다음에)
  function expToItems(exp) {
    const out = {};
    for (const k of EXP_ITEMS) { const v = ITEMS[k].exp, n = Math.floor(exp / v); if (n) { out[k] = n; exp -= n * v; } }
    return { out, rest: exp };
  }
  function collect(only) {
    const b = settle(), got = {};
    let n = 0;
    for (const f of FAC) {
      if (only && f.id !== only) continue;
      if (f.out === 'lmd' && b.acc[f.id] >= 1) { got.lmd = (got.lmd || 0) + Math.floor(b.acc[f.id]); b.acc[f.id] -= Math.floor(b.acc[f.id]); n++; }
      if (f.out === 'exp') {
        const r = expToItems(b.acc[f.id]);
        if (Object.keys(r.out).length) { for (const [k, v] of Object.entries(r.out)) got[k] = (got[k] || 0) + v; b.acc[f.id] = r.rest; n++; }
      }
    }
    if (!n) { toast('수령할 생산물이 없습니다'); return; }
    ACCOUNT.earn(got);
    writeSave();
    if (window.MISSION) MISSION.track('base', n);
    sfx('win');
    toast('기반시설 수령: ' + Object.entries(got).map(([k, v]) => `${ITEMS[k].name} ×${fmt(v)}`).join(' · '));
    RENDER.base();
    renderResources();
  }
  function badge() {
    const el = $('#base-badge');
    if (!el) return;
    const b = settle();
    el.classList.toggle('hidden', !FAC.some((f) => f.out !== 'trust' && b.acc[f.id] >= capOf(f, b) * 0.5));
  }
  const avatar = (id) => {
    const o = OPS[id];
    return `<span class="bs-av" style="--c:${o.color}">${o.image ? `<img src="${esc(o.image)}" alt="">` : esc(o.name[0])}</span>`;
  };
  const outText = (f, v) => (f.out === 'lmd' ? `용문폐 ${fmt(v)}` : f.out === 'exp' ? `경험치 ${fmt(v)}` : `신뢰도 ${v}%`);

  RENDER.base = () => {
    const b = settle();
    $('#bs-body').innerHTML = FAC.map((f) => {
      const lv = b.lv[f.id], slots = f.slots[lv - 1], ops = b.ops[f.id], eff = effOf(f, b);
      const cap = capOf(f, b), acc = b.acc[f.id], up = f.upgrade[lv - 1];
      const store = f.out === 'trust'
        ? `<div class="bs-rate">배치 오퍼레이터 신뢰도 <b>+${f.rate[lv - 1]}%</b>/시간 <small>(최대 ${f.cap[lv - 1]}시간씩 쌓임)</small></div>`
        : `<div class="bs-rate">${ops.length ? `시간당 <b>${outText(f, rateOf(f, b))}</b> · 효율 ${Math.round(eff * 100)}%` : '<span class="bad">오퍼레이터를 배치해야 가동합니다</span>'}</div>
           <div class="bs-store"><i class="ri ${f.out === 'lmd' ? 'lmd' : 'exp_4'}"></i><div class="bs-bar"><i style="width:${(acc / cap) * 100}%"></i></div><small>${fmt(acc)} / ${fmt(cap)}</small>
           <button class="bs-get" data-get="${f.id}" ${acc >= (f.out === 'exp' ? 200 : 1) ? '' : 'disabled'}>수령</button></div>`;
      return `<section class="bs-room" style="--c:${f.color};--bg:url(img/ui/base_${f.id}_bg.webp)">
        <header><img class="bs-ico" src="img/ui/base_${f.id}.png" alt=""><div><small>${esc(f.en)}</small><b>${esc(f.name)}</b></div><span class="bs-lv">Lv.${lv}</span></header>
        <p class="bs-desc">${esc(f.desc)}</p>
        ${store}
        <div class="bs-slots">${Array.from({ length: slots }, (_, i) => ops[i]
          ? `<button class="bs-slot on" data-slot="${f.id}">${avatar(ops[i])}<span>${esc(OPS[ops[i]].name)}</span><em>+${Math.round(opEff(f, ops[i]) * 100)}%</em></button>`
          : `<button class="bs-slot" data-slot="${f.id}"><span class="bs-plus">＋</span><span>배치</span></button>`).join('')}</div>
        <div class="bs-up">${up ? `<span>Lv.${lv + 1}: 배치 ${f.slots[lv]}명 · 생산 ${outText(f, f.rate[lv])}${f.out === 'trust' ? '' : '/시간'} · 보관 ${f.cap[lv]}시간</span>
          <div class="bs-cost">${Object.entries({ lmd: up.lmd, ...up.items }).map(([k, v]) => `<span class="${ACCOUNT.bal(k) >= v ? '' : 'bad'}" data-src="${k}"><i class="ri ${k}"></i>${k === 'lmd' ? fmt(v) : `${ACCOUNT.bal(k)}/${v}`}</span>`).join('')}</div>
          <button class="btn small primary" data-up="${f.id}">확장</button>` : '<span>최대 레벨</span>'}</div>
      </section>`;
    }).join('');
    badge();
    renderResources();
  };
  // 배치 창: 오퍼레이터를 누르면 이 시설에 배치 / 이미 있으면 해제 (다른 시설에 있으면 옮겨 옴)
  function openPicker(fid) {
    const b = settle(), f = FAC.find((x) => x.id === fid), slots = f.slots[b.lv[fid] - 1];
    const where = {};
    for (const x of FAC) for (const id of b.ops[x.id]) where[id] = x;
    const list = OPERATORS.filter((o) => !o.summoned && ACCOUNT.owns(o.id))
      .sort((a, c) => (where[c.id] === f) - (where[a.id] === f) || opEff(f, c.id) - opEff(f, a.id) || (c.rarity || 3) - (a.rarity || 3));
    openModal(`<div class="modal-title">${esc(f.name)} — 오퍼레이터 배치</div><div class="modal-sub">${b.ops[fid].length}/${slots}명 · 눌러서 배치 / 해제 · ${f.classes.length ? `${f.classes.map((c) => CLASSES[c].name).join(' · ')} 효율 +${Math.round(BASE.classEff * 100)}%, ` : ''}정예화 단계마다 +${Math.round(BASE.eliteEff * 100)}%</div>
      <div class="bs-pick">${list.map((o) => {
        const w = where[o.id];
        return `<button class="bs-pk ${w === f ? 'on' : ''}" data-pick="${o.id}">${avatar(o.id)}<b>${esc(o.name)}</b><small>${f.out === 'trust' ? `신뢰도 ${Math.floor((save.trust || {})[o.id] || 0)}%` : `효율 +${Math.round(opEff(f, o.id) * 100)}%`}</small>${w && w !== f ? `<em>${esc(w.name)}</em>` : ''}</button>`;
      }).join('')}</div>`);
    $('#modal-body').querySelectorAll('[data-pick]').forEach((btn) => btn.addEventListener('click', () => {
      const id = btn.dataset.pick, cur = state();
      settle(cur);
      if (cur.ops[fid].includes(id)) cur.ops[fid] = cur.ops[fid].filter((x) => x !== id);
      else {
        if (cur.ops[fid].length >= slots) { toast(`${f.name}에는 ${slots}명까지 배치할 수 있습니다`); return; }
        for (const x of FAC) cur.ops[x.id] = cur.ops[x.id].filter((y) => y !== id);
        cur.ops[fid].push(id);
      }
      writeSave();
      sfx('select');
      openPicker(fid);
      RENDER.base();
    }));
  }
  $('#bs-body').addEventListener('click', (e) => {
    const s = e.target.closest('[data-slot]');
    if (s) { openPicker(s.dataset.slot); return; }
    const g = e.target.closest('[data-get]');
    if (g) { collect(g.dataset.get); return; }
    const u = e.target.closest('[data-up]');
    if (u) {
      const b = settle(), f = FAC.find((x) => x.id === u.dataset.up), c = f.upgrade[b.lv[f.id] - 1];
      if (!c) return;
      if (!ACCOUNT.spend({ lmd: c.lmd, ...c.items })) { toast('재료가 부족합니다'); return; }
      b.lv[f.id]++;
      writeSave();
      sfx('skill');
      toast(`${f.name} Lv.${b.lv[f.id]}로 확장했습니다`);
      RENDER.base();
    }
  });
  $('#bs-collect').addEventListener('click', () => collect());

  window.BASE_UI = { settle, collect, badge };
  badge();
  setInterval(() => { if (UI.current === 'home') badge(); if (UI.current === 'base') RENDER.base(); }, 60e3);
})();
