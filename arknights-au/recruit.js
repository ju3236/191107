'use strict';
// =====================================================================
//  잿빛 등대 — 공개모집 (원작 규칙, data.js의 RECRUIT 참고)
//  계정 데이터 player.recruit = { slots: [{ offer, tags, time, start, end, res } | { offer } ...], rf: { day, n } }
// =====================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const { esc, toast, openModal, closeModal, RENDER, save, writeSave, renderResources } = UI;
  const sfx = (n) => window.SFX && SFX.play(n);
  const fmt = (n) => Number(n).toLocaleString('ko-KR');
  const ico = (k, big) => `<i class="ri ${esc(k)}${big ? ' big' : ''}"></i>`;
  const R = RECRUIT;
  const TOP = '고급 특별 채용', SENIOR = '특별 채용', STARTER = '신입', ROBOT = '로봇';

  // ---------- 오퍼레이터의 모집 태그 ----------
  function tagsOf(o) {
    if (o.recruitTags) return o.recruitTags;
    const out = new Set();
    if (R.classTag[o.class]) out.add(R.classTag[o.class]);
    const cls = CLASSES[o.class] || {};
    const tile = o.tile || cls.tile;
    if ((o.tags || []).includes('근거리') || (!(o.tags || []).includes('원거리') && tile !== 'high')) out.add('근거리');
    if ((o.tags || []).includes('원거리') || tile === 'high') out.add('원거리');
    for (const t of o.tags || []) if (R.tagMap[t]) out.add(R.tagMap[t]);
    if (o.rarity === 6) out.add(TOP);
    if (o.rarity === 5) out.add(SENIOR);
    if (o.rarity === 2) out.add(STARTER);
    if (o.rarity === 1) out.add(ROBOT);
    return [...out];
  }
  const pool = () => (window.GACHA_FX ? GACHA_FX.pool() : OPERATORS).filter((o) => !o.summoned && !o.noRecruit);
  // 모집 시간에 따라 나올 수 있는 등급 (원작 recruitRarityTable)
  const rarityRange = (min) => (min <= 230 ? [1, 4] : min <= 450 ? [2, 5] : [3, 5]);

  // 고른 태그의 조합(1~3개)마다 나올 수 있는 등급 · 오퍼레이터
  function combos(tags, time) {
    const out = [], ops = pool(), [lo, hi] = rarityRange(time), have = new Set(ops.map((o) => o.rarity));
    const n = tags.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const sub = tags.filter((_, i) => mask & (1 << i));
      const top = sub.includes(TOP), senior = sub.includes(SENIOR);
      // 등급 범위: 고급 특별 채용 + 9시간은 6성만, 특별 채용 + 9시간은 5성만, 그 밖에는 모집 시간 범위(6성 없음)
      const full = time >= R.maxTime;
      const rs = top && full ? [6] : senior && full ? [5] : [1, 2, 3, 4, 5].filter((r) => r >= lo && r <= hi);
      const cand = {};
      for (const r of rs) {
        const list = ops.filter((o) => o.rarity === r && sub.every((t) => tagsOf(o).includes(t)));
        if (list.length) cand[r] = list;
        // 그 등급 오퍼레이터가 아예 없으면(1~3성) 대체 보상 — 등급 전용 태그나 일반 태그 조합일 때만
        else if (!have.has(r) && R.substitute[r] && !top && !senior && sub.every((t) => (r === 2 ? true : t !== STARTER) && (r === 1 ? true : t !== ROBOT))) {
          const special = (r === 2 && sub.includes(STARTER)) || (r === 1 && sub.includes(ROBOT));
          if (special || !sub.some((t) => t === STARTER || t === ROBOT)) cand[r] = 'sub';
        }
      }
      // 신입 · 로봇은 그 등급만
      if (sub.includes(STARTER)) for (const r of Object.keys(cand)) if (+r !== 2) delete cand[r];
      if (sub.includes(ROBOT)) for (const r of Object.keys(cand)) if (+r !== 1) delete cand[r];
      if (Object.keys(cand).length) out.push({ sub, cand });
    }
    return out;
  }
  function pickRarity(cand) {
    const rs = Object.keys(cand).map(Number);
    if (rs.length === 1) return rs[0];
    const w = rs.map((r) => (r === 6 ? 1 : R.weights[r] || 1)), tot = w.reduce((a, b) => a + b, 0);
    let x = Math.random() * tot;
    for (let i = 0; i < rs.length; i++) { x -= w[i]; if (x <= 0) return rs[i]; }
    return rs[rs.length - 1];
  }
  // 채용 결과 정하기 (모집 시작할 때)
  function roll(tags, time) {
    let cs = combos(tags, time);
    if (!cs.length) cs = combos([], time).length ? combos([], time) : [];
    let cand;
    if (cs.length) cand = cs[Math.floor(Math.random() * cs.length)].cand;
    else {
      // 태그 없이: 시간 범위의 아무 오퍼레이터
      const [lo, hi] = rarityRange(time), have = new Set(pool().map((o) => o.rarity));
      cand = {};
      for (let r = lo; r <= hi; r++) { const l = pool().filter((o) => o.rarity === r && !tagsOf(o).includes(TOP)); if (l.length) cand[r] = l; else if (!have.has(r) && R.substitute[r]) cand[r] = 'sub'; }
    }
    const r = pickRarity(cand), list = cand[r];
    if (list === 'sub') return { sub: r };
    return { id: list[Math.floor(Math.random() * list.length)].id };
  }
  // 고른 태그로 나올 수 있는 등급 (설정 창 「획득 가능 오퍼레이터」)
  function possible(tags, time) {
    const cs = tags.length ? combos(tags, time) : [];
    const set = new Set();
    if (!cs.length) { const [lo, hi] = rarityRange(time); for (let r = lo; r <= hi; r++) set.add(r); }
    for (const c of cs) for (const r of Object.keys(c.cand)) set.add(+r);
    return [...set].sort((a, b) => a - b);
  }

  // ---------- 상태 ----------
  const dayKey = () => { const d = new Date(Date.now() - 4 * 3600e3); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  function newOffer() {
    const rest = R.tags.filter((t) => t !== TOP && t !== SENIOR), out = [];
    if (Math.random() < R.topChance) out.push(TOP);
    else if (Math.random() < R.seniorChance) out.push(SENIOR);
    while (out.length < 5) { const t = rest[Math.floor(Math.random() * rest.length)]; if (!out.includes(t)) out.push(t); }
    return out.sort(() => Math.random() - 0.5);
  }
  function state() {
    const p = ACCOUNT.player;
    const st = p.recruit = p.recruit || {};
    st.slots = Array.from({ length: R.slots }, (_, i) => (st.slots || [])[i] || { offer: newOffer() });
    if (!st.rf || st.rf.day !== dayKey()) st.rf = { day: dayKey(), n: R.refreshPerDay };
    return st;
  }
  const slotState = (s) => (!s.end ? 'empty' : Date.now() >= s.end ? 'done' : 'run');
  const left = (s) => { const ms = Math.max(0, s.end - Date.now()), t = Math.ceil(ms / 1000); return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

  // ---------- 화면 ----------
  let timer = null;
  RENDER.recruit = () => {
    const st = state();
    $('#rc-res').innerHTML = [['recruit_permit'], ['recruit_plan'], ['lmd'], ['cert_lo']].map(([k]) => `<span class="hh-r" data-src="${k}">${ico(k)}<b>${fmt(ACCOUNT.bal(k))}</b></span>`).join('')
      + `<span class="rc-rf">태그 갱신 <b>${st.rf.n}</b>/${R.refreshPerDay}</span>`;
    $('#rc-slots').innerHTML = st.slots.map((s, i) => {
      const k = slotState(s);
      if (k === 'empty') return `<button class="rc-slot empty" data-rcopen="${i}"><span class="rc-no">${i + 1}</span><b>＋</b><span>모집 개시</span></button>`;
      if (k === 'run') return `<div class="rc-slot run"><span class="rc-no">${i + 1}</span><div class="rc-req"><small>모집 요건</small>${s.tags.map((t) => `<em>${esc(t)}</em>`).join('') || '<em class="none">없음</em>'}</div>
        <div class="rc-mid"><span class="rc-left"><small>잔여 시간</small><b data-rcleft="${i}">${left(s)}</b></span>${ico('recruit_permit', true)}</div>
        <div class="rc-btns"><button class="rc-stop" data-rcstop="${i}">모집 중지</button><button class="rc-fast" data-rcfast="${i}">즉시 모집 ${ico('recruit_plan')}<small>${ACCOUNT.bal('recruit_plan')}</small></button></div></div>`;
      return `<div class="rc-slot done"><span class="rc-no">${i + 1}</span><p>${s.tags.length ? '일부 모집 요건에 부합하는 후보를 찾았습니다.' : '후보를 찾았습니다.'}</p><button class="rc-hire" data-rchire="${i}">채용하기</button></div>`;
    }).join('');
    renderResources();
    badge();
    clearInterval(timer);
    timer = setInterval(() => {
      if (UI.current !== 'recruit') { clearInterval(timer); return; }
      let redraw = false;
      st.slots.forEach((s, i) => { const el = document.querySelector(`[data-rcleft="${i}"]`); if (el) { if (slotState(s) === 'done') redraw = true; else el.textContent = left(s); } });
      if (redraw) RENDER.recruit();
    }, 1000);
  };

  // 모집 설정 창
  let cfg = null;
  function openSetup(i) {
    const st = state(), s = st.slots[i];
    cfg = cfg && cfg.i === i ? cfg : { i, time: R.minTime, tags: [] };
    const pos = possible(cfg.tags, cfg.time), h = Math.floor(cfg.time / 60), m = cfg.time % 60, have = ACCOUNT.bal('recruit_permit');
    openModal(`<div class="rc-setup">
      <div class="rc-row"><span class="rc-lbl">모집 시간</span>
        <div class="rc-time"><div><button data-rct="60">︿</button><b>${String(h).padStart(2, '0')}</b><button data-rct="-60">﹀</button></div><i>:</i>
          <div><button data-rct="10">︿</button><b>${String(m).padStart(2, '0')}</b><button data-rct="-10">﹀</button></div><i>:</i><div><b class="dim">00</b></div></div>
        <div class="rc-pos"><small>· 획득 가능 오퍼레이터</small><div>${pos.map((r) => `<span class="r${r}">${r}★</span>`).join('')}</div></div></div>
      <div class="rc-row"><span class="rc-lbl">모집 요건<small>(최대 3항)</small></span>
        <div class="rc-tags">${s.offer.map((t) => `<button class="${cfg.tags.includes(t) ? 'on' : ''} ${t === TOP || t === SENIOR ? 'rare' : ''}" data-rctag="${esc(t)}">${esc(t)}</button>`).join('')}<span class="rc-tagx"></span></div>
        <button class="rc-refresh" data-rcref ${st.rf.n > 0 ? '' : 'disabled'}><b>⟳</b><small>태그 새로고침</small></button></div>
      <div class="rc-row rc-bud"><span class="rc-lbl">모집 예산</span><span class="rc-cost">${ico('recruit_permit', true)}<em class="${have >= 1 ? '' : 'bad'}">${have > 999 ? '999+' : have}/1</em></span>
        <div class="rc-ok"><button class="rc-go" data-rcgo ${have >= 1 ? '' : 'disabled'}>✓</button><button class="rc-x" data-rccancel>✕</button></div></div>
      <p class="rc-help">고급 특별 채용 + 9시간이면 6성, 특별 채용 + 9시간이면 5성 확정 · 7:40 이상이면 1 · 2성이 나오지 않습니다 · 3:50 이하에서만 1성이 나옵니다</p></div>`);
    $('#modal').dataset.kind = 'recruit';
  }
  $('#modal-body').addEventListener('click', (e) => {
    if (!cfg || $('#modal').dataset.kind !== 'recruit') return;
    const st = state(), s = st.slots[cfg.i];
    const t = e.target.closest('[data-rct]');
    if (t) { cfg.time = Math.max(R.minTime, Math.min(R.maxTime, cfg.time + +t.dataset.rct)); openSetup(cfg.i); return; }
    const g = e.target.closest('[data-rctag]');
    if (g) {
      const k = g.dataset.rctag, j = cfg.tags.indexOf(k);
      if (j >= 0) cfg.tags.splice(j, 1); else if (cfg.tags.length >= 3) { toast('모집 요건은 최대 3개까지 고를 수 있습니다'); return; } else cfg.tags.push(k);
      // 원작처럼 고급 특별 채용을 고르면 9시간으로
      if (k === TOP && cfg.tags.includes(TOP)) cfg.time = R.maxTime;
      sfx('select'); openSetup(cfg.i); return;
    }
    if (e.target.closest('[data-rcref]')) {
      if (st.rf.n <= 0) { toast('오늘의 태그 새로고침을 모두 사용했습니다'); return; }
      st.rf.n--; s.offer = newOffer(); cfg.tags = []; ACCOUNT.save(); sfx('select'); openSetup(cfg.i); RENDER.recruit(); return;
    }
    if (e.target.closest('[data-rccancel]')) { cfg = null; closeModal(); return; }
    if (e.target.closest('[data-rcgo]')) {
      if (!ACCOUNT.spend({ recruit_permit: 1 })) { toast('모집 허가증이 부족합니다'); return; }
      const res = roll(cfg.tags, cfg.time);
      st.slots[cfg.i] = { offer: s.offer, tags: [...cfg.tags], time: cfg.time, start: Date.now(), end: Date.now() + cfg.time * 60e3, res };
      ACCOUNT.save(); writeSave();
      if (window.MISSION) MISSION.track('recruit', 1);
      cfg = null; closeModal(); sfx('select'); toast('공개모집을 시작했습니다');
      RENDER.recruit();
    }
  });
  $('#rc-slots').addEventListener('click', (e) => {
    const st = state();
    const o = e.target.closest('[data-rcopen]');
    if (o) { cfg = null; openSetup(+o.dataset.rcopen); return; }
    const sp = e.target.closest('[data-rcstop]');
    if (sp) {
      const i = +sp.dataset.rcstop;
      UI.confirmBuy({ name: '모집 중지', sub: '사용한 모집 허가증 1장을 돌려받습니다', item: 'recruit_permit', cur: 'recruit_permit', price: 0, max: 1,
        onOk: () => { st.slots[i] = { offer: newOffer() }; ACCOUNT.earn({ recruit_permit: 1 }); ACCOUNT.save(); sfx('cancel'); RENDER.recruit(); } });
      return;
    }
    const f = e.target.closest('[data-rcfast]');
    if (f) {
      const i = +f.dataset.rcfast;
      if (ACCOUNT.bal('recruit_plan') < 1) { toast('즉시 완료 허가증이 부족합니다'); return; }
      UI.confirmBuy({ name: '즉시 완료 허가증', sub: '진행 중인 모집을 바로 완료합니다', desc: ITEMS.recruit_plan.desc, item: 'recruit_plan', cur: 'recruit_plan', price: 1, max: 1,
        onOk: () => { if (!ACCOUNT.spend({ recruit_plan: 1 })) return; st.slots[i].end = Date.now(); ACCOUNT.save(); sfx('select'); RENDER.recruit(); } });
      return;
    }
    const h = e.target.closest('[data-rchire]');
    if (h) {
      const i = +h.dataset.rchire, s = st.slots[i], res = s.res || {};
      st.slots[i] = { offer: newOffer() };
      let out;
      if (res.id && OPERATORS.find((x) => x.id === res.id)) { const def = OPERATORS.find((x) => x.id === res.id); out = { def, ...ACCOUNT.obtain(def) }; }
      else { const r = res.sub || 3, cert = R.substitute[r] || { cert_lo: 1 }; ACCOUNT.earn(cert); out = { def: GACHA_FX.makeSub(r), sub: true, isNew: false, cert }; }
      ACCOUNT.save(); writeSave();
      GACHA_FX.play([out]);
      RENDER.recruit();
    }
  });

  // 메인 화면 공개모집 타일의 빨간 점: 채용할 후보가 있으면
  function badge() { const el = $('#rc-badge'); if (el) el.classList.toggle('hidden', !state().slots.some((s) => slotState(s) === 'done')); }
  badge();
  setInterval(() => { if (UI.current === 'home') badge(); }, 30e3);
  window.RECRUIT_SYS = { tagsOf, combos, roll, possible, state, badge };
})();
