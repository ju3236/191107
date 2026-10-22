'use strict';
// =====================================================================
//  잿빛 등대 — 가공소 · 임무
// =====================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const { esc, icon, toast, RENDER, save, writeSave, renderResources } = UI;
  const sfx = (n) => window.SFX && SFX.play(n);
  const fmt = (n) => Number(n).toLocaleString('ko-KR');
  const ico = (k, big) => `<i class="ri ${esc(k)}${big ? ' big' : ''}"></i>`;
  const rewardText = (items) => Object.entries(items).map(([k, v]) => `${ITEMS[k] ? ITEMS[k].name : k} ×${fmt(v)}`).join(' · ');

  // =====================================================================
  //  가공소
  // =====================================================================
  const WS_CATS = [['mat', '고급 재료', 'MATERIALS'], ['chip', '듀얼칩', 'CHIPS'], ['skill', '스킬개론', 'SKILL SUMMARIES']];
  let wsCat = 'mat', wsSel = null, wsN = 1;
  const costOf = (r, n) => ({ ...Object.fromEntries(Object.entries(r.items).map(([k, v]) => [k, v * n])), ...(r.lmd ? { lmd: r.lmd * n } : {}) });
  const maxOf = (r) => Math.min(99, ...Object.entries(costOf(r, 1)).map(([k, v]) => Math.floor(ACCOUNT.bal(k) / v)));

  RENDER.workshop = (arg) => {
    if (arg && WORKSHOP.some((r) => r.out === arg)) { wsSel = arg; wsCat = WORKSHOP.find((r) => r.out === arg).cat; wsN = 1; }
    const list = WORKSHOP.filter((r) => r.cat === wsCat);
    if (!list.some((r) => r.out === wsSel)) { wsSel = list[0].out; wsN = 1; }
    $('#ws-tabs').innerHTML = WS_CATS.map(([id, ko, en]) => `<button class="${id === wsCat ? 'on' : ''}" data-wscat="${id}"><b>${ko}</b><small>${en}</small></button>`).join('');
    $('#ws-grid').innerHTML = list.map((r) => {
      const m = maxOf(r);
      return `<button class="ws-card ${r.out === wsSel ? 'on' : ''} ${m > 0 ? 'can' : ''}" data-ws="${r.out}">${ico(r.out, true)}<b>${esc(ITEMS[r.out].name)}</b><small>보유 ${fmt(ACCOUNT.bal(r.out))}</small></button>`;
    }).join('');
    renderWsPanel();
    renderResources();
  };
  function renderWsPanel() {
    const r = WORKSHOP.find((x) => x.out === wsSel), it = ITEMS[r.out], max = maxOf(r);
    wsN = Math.max(1, Math.min(wsN, Math.max(1, max)));
    const cost = costOf(r, wsN), ok = max >= wsN;
    $('#ws-panel').innerHTML = `
      <div class="ws-out">${ico(r.out, true)}<div><b>${esc(it.name)}</b><small>보유 ${fmt(ACCOUNT.bal(r.out))}</small></div></div>
      <p class="ws-desc">${esc(it.desc || '')}</p>
      <div class="ws-need-t">필요 재료 <small>(눌러서 획득처 보기)</small></div>
      <div class="ws-need">${Object.entries(cost).map(([k, v]) => { const have = ACCOUNT.bal(k); return `<button class="ws-mat ${have >= v ? '' : 'bad'}" data-src="${k}">${ico(k, true)}<small><em>${fmt(have)}</em>/${fmt(v)}</small><span>${esc(ITEMS[k].short)}</span></button>`; }).join('')}</div>
      <div class="ws-count">
        <button data-wsn="-1">−</button><b>${wsN}</b><button data-wsn="1">＋</button><button class="ws-max" data-wsn="max">MAX ${max}</button>
      </div>
      <button class="ws-go" id="ws-go" ${ok ? '' : 'disabled'}><b>가공</b><small>${ok ? `${esc(it.short)} ×${wsN}` : '재료가 부족합니다'}</small></button>`;
  }
  $('#ws-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wscat]');
    if (!b) return;
    wsCat = b.dataset.wscat; wsSel = null;
    sfx('select');
    RENDER.workshop();
  });
  $('#ws-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ws]');
    if (!b) return;
    wsSel = b.dataset.ws; wsN = 1;
    RENDER.workshop();
  });
  $('#ws-panel').addEventListener('click', (e) => {
    const n = e.target.closest('[data-wsn]');
    if (n) {
      const r = WORKSHOP.find((x) => x.out === wsSel);
      wsN = n.dataset.wsn === 'max' ? Math.max(1, maxOf(r)) : wsN + +n.dataset.wsn;
      renderWsPanel();
      return;
    }
    if (e.target.closest('#ws-go')) {
      const r = WORKSHOP.find((x) => x.out === wsSel);
      if (!ACCOUNT.spend(costOf(r, wsN))) { toast('재료가 부족합니다'); return; }
      ACCOUNT.earn({ [r.out]: wsN });
      track('craft', wsN);
      sfx('win');
      toast(`${ITEMS[r.out].name} ×${wsN} 가공 완료`);
      wsN = 1;
      RENDER.workshop();
    }
  });

  // =====================================================================
  //  임무 — 일일(오전 4시) · 주간(월요일 오전 4시) 초기화
  // =====================================================================
  const dayKey = (t) => { const d = new Date(t - 4 * 3600e3); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const weekKey = (t) => { const d = new Date(t - 4 * 3600e3); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d.getTime() + 4 * 3600e3); };
  function state() {
    const now = Date.now(), dk = dayKey(now), wk = weekKey(now);
    const m = save.mission = save.mission || {};
    if (m.day !== dk) Object.assign(m, { day: dk, cnt: {}, got: [], bonus: false });
    if (m.week !== wk) Object.assign(m, { week: wk, wcnt: {}, wgot: [], wbonus: false });
    return m;
  }
  function track(kind, n = 1) {
    const m = state();
    m.cnt[kind] = (m.cnt[kind] || 0) + n;
    m.wcnt[kind] = (m.wcnt[kind] || 0) + n;
    writeSave();
    badge();
  }
  const progOf = (ms, weekly) => Math.min(ms.n, (weekly ? state().wcnt : state().cnt)[ms.kind] || 0);
  const claimable = () => {
    const m = state();
    const d = MISSIONS.daily.filter((x) => !m.got.includes(x.id) && progOf(x) >= x.n).length;
    const w = MISSIONS.weekly.filter((x) => !m.wgot.includes(x.id) && progOf(x, true) >= x.n).length;
    const db = !m.bonus && MISSIONS.daily.every((x) => m.got.includes(x.id)) ? 1 : 0;
    const wb = !m.wbonus && MISSIONS.weekly.every((x) => m.wgot.includes(x.id)) ? 1 : 0;
    return { d: d + db, w: w + wb };
  };
  function badge() {
    const el = $('#mission-badge');
    if (!el) return;
    const c = claimable(), n = c.d + c.w;
    el.textContent = n;
    el.classList.toggle('hidden', !n);
  }
  let msTab = 'daily';
  RENDER.missions = (arg) => {
    if (arg === 'daily' || arg === 'weekly') msTab = arg;
    const m = state(), weekly = msTab === 'weekly', c = claimable();
    const list = MISSIONS[msTab], got = weekly ? m.wgot : m.got;
    const nextReset = (() => {
      const d = new Date(Date.now() - 4 * 3600e3);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + (weekly ? 7 - ((d.getDay() + 6) % 7) : 1));
      const ms = d.getTime() + 4 * 3600e3 - Date.now(), h = Math.floor(ms / 3600e3);
      return h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간` : `${h}시간 ${Math.floor((ms % 3600e3) / 60e3)}분`;
    })();
    $('#ms-tabs').innerHTML = [['daily', '일일 임무', 'DAILY', c.d], ['weekly', '주간 임무', 'WEEKLY', c.w]]
      .map(([id, ko, en, n]) => `<button class="${id === msTab ? 'on' : ''}" data-mstab="${id}"><small>${en}</small><b>${ko}</b>${n ? `<i class="ms-dot">${n}</i>` : ''}</button>`).join('');
    const done = list.filter((x) => got.includes(x.id)).length, bonus = MISSIONS[weekly ? 'weeklyBonus' : 'dailyBonus'], bonusGot = weekly ? m.wbonus : m.bonus;
    const rows = [...list].sort((a, b) => {
      const sa = got.includes(a.id) ? 2 : progOf(a, weekly) >= a.n ? 0 : 1, sb = got.includes(b.id) ? 2 : progOf(b, weekly) >= b.n ? 0 : 1;
      return sa - sb;
    }).map((x) => {
      const p = progOf(x, weekly), fin = p >= x.n, has = got.includes(x.id);
      return `<div class="ms-row ${has ? 'got' : fin ? 'ready' : ''}">
        <div class="ms-info"><b>${esc(x.text)}</b><div class="ms-bar"><i style="width:${(p / x.n) * 100}%"></i></div><small>${fmt(p)}/${fmt(x.n)}</small></div>
        <div class="ms-rew">${Object.entries(x.reward).map(([k, v]) => `<span title="${esc(ITEMS[k].name)}">${ico(k)}${fmt(v)}</span>`).join('')}</div>
        <button class="ms-claim" data-claim="${x.id}" ${fin && !has ? '' : 'disabled'}>${has ? '수령 완료' : fin ? '수령' : '진행 중'}</button>
      </div>`;
    }).join('');
    $('#ms-main').innerHTML = `
      <div class="ms-head">
        <div class="ms-all"><small>${weekly ? '주간' : '일일'} 임무 완료</small><b>${done}<span>/${list.length}</span></b></div>
        <div class="ms-bonus ${bonusGot ? 'got' : done >= list.length ? 'ready' : ''}">
          <small>모두 완료 보상</small><div>${Object.entries(bonus).map(([k, v]) => `<span>${ico(k)}${fmt(v)}</span>`).join('')}</div>
          <button data-claim="${weekly ? 'wbonus' : 'bonus'}" ${!bonusGot && done >= list.length ? '' : 'disabled'}>${bonusGot ? '수령 완료' : '수령'}</button>
        </div>
        <div class="ms-reset">초기화까지 <b>${nextReset}</b></div>
        <button class="ms-claim-all" id="ms-claim-all" ${(weekly ? c.w : c.d) ? '' : 'disabled'}>모두 수령</button>
      </div>
      <div class="ms-list">${rows}</div>`;
    badge();
  };
  function claim(id) {
    const m = state();
    if (id === 'bonus' || id === 'wbonus') {
      const weekly = id === 'wbonus', list = MISSIONS[weekly ? 'weekly' : 'daily'], got = weekly ? m.wgot : m.got;
      if (m[id] || !list.every((x) => got.includes(x.id))) return null;
      m[id] = true;
      return MISSIONS[weekly ? 'weeklyBonus' : 'dailyBonus'];
    }
    const weekly = MISSIONS.weekly.some((x) => x.id === id);
    const x = MISSIONS[weekly ? 'weekly' : 'daily'].find((y) => y.id === id), got = weekly ? m.wgot : m.got;
    if (!x || got.includes(id) || progOf(x, weekly) < x.n) return null;
    got.push(id);
    return x.reward;
  }
  function give(rewards) {
    const total = {};
    for (const r of rewards) for (const [k, v] of Object.entries(r)) total[k] = (total[k] || 0) + v;
    if (!Object.keys(total).length) return;
    ACCOUNT.earn(total);
    writeSave();
    sfx('win');
    toast(`임무 보상: ${rewardText(total)}`);
    RENDER.missions();
    renderResources();
  }
  $('#ms-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mstab]');
    if (b) { msTab = b.dataset.mstab; sfx('select'); RENDER.missions(); }
  });
  $('#ms-main').addEventListener('click', (e) => {
    const b = e.target.closest('[data-claim]');
    if (b) { give([claim(b.dataset.claim)].filter(Boolean)); return; }
    if (e.target.closest('#ms-claim-all')) {
      const list = MISSIONS[msTab], out = list.map((x) => claim(x.id)).filter(Boolean);
      out.push(claim(msTab === 'weekly' ? 'wbonus' : 'bonus'));
      give(out.filter(Boolean));
    }
  });

  window.MISSION = { track, state, claimable, badge };
  badge();
  setInterval(() => { if (UI.current === 'home') badge(); }, 60e3);
})();
