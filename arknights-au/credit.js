'use strict';
// =====================================================================
//  잿빛 등대 — 크레딧 상점 · 지원 유닛 (data.js의 CREDIT 참고)
//  계정 데이터 player.credit = { day, goods, claimed, uses, rf, units, pick }
// =====================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const { esc, toast, openModal, closeModal, RENDER, renderResources } = UI;
  const sfx = (n) => window.SFX && SFX.play(n);
  const fmt = (n) => Number(n).toLocaleString('ko-KR');
  const ico = (k, big) => `<i class="ri ${esc(k)}${big ? ' big' : ''}"></i>`;
  const C = CREDIT;
  const OPSX = () => OPERATORS.filter((o) => !o.summoned);
  const opOf = (id) => OPERATORS.find((o) => o.id === id);
  const dayKey = () => { const d = new Date(Date.now() - 4 * 3600e3); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  // 날짜로 정해지는 난수 (하루 동안 같은 진열 · 같은 지원 목록)
  function rng(seed) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }

  // ---------- 상태 ----------
  function state() {
    const p = ACCOUNT.player, st = (p.credit = p.credit || {});
    if (st.day !== dayKey()) {
      st.day = dayKey(); st.goods = newGoods(); st.claimed = false; st.uses = 0; st.rf = 3; st.seed = 0;
    }
    st.units = Array.from({ length: 3 }, (_, i) => (st.units || [])[i] || null).map((u) => (u && ACCOUNT.owns(u.op) ? u : null));
    return st;
  }
  function newGoods() {
    const r = rng('goods' + dayKey() + (ACCOUNT.player.nick || '')), pool = C.goods.flatMap((g) => Array(g[3]).fill(g)), out = [];
    while (out.length < C.slots) {
      const g = pool[Math.floor(r() * pool.length)];
      out.push({ k: g[0], n: g[1], price: g[2], disc: C.discounts[out.length] && r() < 0.8 ? C.discounts[out.length] : 0, sold: false });
    }
    return out;
  }
  const bal = () => ACCOUNT.bal('credit');
  // 크레딧 받기 (최대 300, 넘치는 만큼은 버려짐)
  function addCredit(n) {
    const got = Math.max(0, Math.min(n, C.cap - bal()));
    if (got) ACCOUNT.earn({ credit: got });
    return got;
  }
  const priceOf = (g) => Math.round(g.price * (1 - g.disc));
  const resetText = () => {
    const d = new Date(Date.now() - 4 * 3600e3); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1);
    const ms = d.getTime() + 4 * 3600e3 - Date.now(), t = Math.floor(ms / 1000);
    return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };

  // ---------- 크레딧 상점 (구매센터 탭) ----------
  function html() {
    const st = state();
    return `<div class="cr-shop">
      <div class="cr-top"><button class="cr-get ${st.claimed ? 'done' : ''}" data-crget>${st.claimed ? '오늘 획득 완료' : '획득하기'}</button><span class="cr-bal">${ico('credit')}<b>${bal()}</b><small>/${C.cap}</small></span></div>
      <div class="cr-grid">${st.goods.map((g, i) => {
        const it = ITEMS[g.k] || { name: g.k };
        return `<button class="cr-good ${g.sold ? 'sold' : ''}" data-crbuy="${i}">
          <b class="cr-name">${esc(it.name)}</b>
          ${g.disc ? `<span class="cr-disc">-${Math.round(g.disc * 100)}%</span>` : ''}
          <span class="cr-ico">${ico(g.k, true)}<em>${g.n >= 1000 ? fmt(g.n) : g.n}</em></span>
          <span class="cr-price">${ico('credit')}${g.disc ? `<s>${g.price}</s>` : ''}<b>${priceOf(g)}</b></span>
          ${g.sold ? '<span class="evg-sold"><i>SOLD OUT</i><b>매진</b><i>SOLD OUT</i></span>' : ''}</button>`;
      }).join('')}</div>
      <div class="cr-foot"><button class="cr-sup" data-crsup>지원 유닛 설정</button><button class="cr-rule" data-crrule>? 크레딧 획득 규칙</button><span>업데이트까지: <b id="cr-reset">${resetText()}</b></span></div></div>`;
  }
  function buy(i) {
    const st = state(), g = st.goods[i];
    if (!g || g.sold) return;
    const it = ITEMS[g.k] || { name: g.k }, price = priceOf(g);
    openModal(`<div class="cr-pop">
      <div class="cr-pop-l"><span class="cr-pop-name">${esc(it.name)}</span><div class="cr-pop-art">${ico(g.k, true)}</div><p>${esc(it.desc || '')}</p></div>
      <div class="cr-pop-r">${g.disc ? `<span class="cr-pop-disc">-${Math.round(g.disc * 100)}%</span>` : ''}
        <div class="cr-pop-price">${g.disc ? `<s>${ico('credit')}${g.price}</s>` : ''}<span>가격 ${ico('credit')}<b>${price}</b></span><small>보유 ${fmt(ACCOUNT.bal(g.k))}</small></div>
        <div class="cr-pop-in"><small>상품 내용</small><p>· ${esc(it.name)} x ${fmt(g.n)}</p></div>
        <button class="cr-pop-go" id="cr-go" ${bal() >= price ? '' : 'disabled'}>🛒 물품 구매</button>
        ${bal() >= price ? '' : '<small class="cr-pop-bad">크레딧이 부족합니다</small>'}</div></div>`);
    $('#modal').dataset.kind = 'crbuy';
    $('#cr-go').addEventListener('click', () => {
      if (!ACCOUNT.spend({ credit: price })) { toast('크레딧이 부족합니다'); return; }
      g.sold = true; ACCOUNT.earn({ [g.k]: g.n }); ACCOUNT.save(); sfx('select'); closeModal();
      toast(`${it.name} ×${fmt(g.n)} 구매 완료`);
      RENDER.store(undefined, { back: true });
    });
  }
  function claim() {
    const st = state();
    if (st.claimed) { toast('오늘의 크레딧은 이미 받았습니다. 오전 4시에 다시 받을 수 있습니다'); return; }
    const units = st.units.filter(Boolean).length;
    const want = C.daily + C.perUnit * units + Math.floor(rng('claim' + dayKey())() * 10);
    const got = addCredit(want);
    st.claimed = true; ACCOUNT.save(); sfx('win');
    openModal(`<div class="cr-gain"><div class="cr-gain-h">물자 획득</div><div class="cr-gain-ico">${ico('credit', true)}<b>${got}</b></div><span>크레딧</span>
      <p>다른 박사의 기반시설 방문 · 내 지원 유닛 사용 보상${got < want ? ` (보유 한도 ${C.cap}을 넘은 ${want - got}은 받지 못했습니다)` : ''}</p></div>`);
    $('#modal').dataset.kind = 'crgain';
    RENDER.store(undefined, { back: true });
  }
  function rules() {
    openModal(`<div class="modal-title">크레딧 획득 규칙</div><div class="modal-sub">CREDIT</div>
      <ul class="cr-rules"><li>매일 「획득하기」: 다른 박사의 기반시설 방문 보상 ${C.daily} + 내 지원 유닛 1명당 ${C.perUnit} (지원 유닛 설정에서 3명까지)</li>
      <li>작전에서 지원 유닛을 편성해 승리하면 ${C.useReward} (하루 ${C.useMax}번)</li>
      <li>크레딧은 최대 ${C.cap}까지 보유할 수 있고, 넘는 만큼은 받을 수 없습니다.</li>
      <li>크레딧 상점은 매일 오전 4시에 새 상품으로 바뀌며, 일부 상품은 할인됩니다.</li></ul>`);
  }
  $('#store-main').addEventListener('click', (e) => {
    if (!e.target.closest('.cr-shop')) return;
    const b = e.target.closest('[data-crbuy]'); if (b) { buy(+b.dataset.crbuy); return; }
    if (e.target.closest('[data-crget]')) { claim(); return; }
    if (e.target.closest('[data-crrule]')) { rules(); return; }
    if (e.target.closest('[data-crsup]')) openUnits();
  });
  setInterval(() => { const el = document.getElementById('cr-reset'); if (el) el.textContent = resetText(); }, 1000);

  // ---------- 지원 유닛 ----------
  const RAR_LV = { 6: [50, 80, 90], 5: [50, 70, 80], 4: [45, 60, 70], 3: [40, 55, 55], 2: [30, 30, 30], 1: [30, 30, 30] };
  // 오늘의 다른 박사 지원 목록 (직군별 최대 6명)
  function borrowList(cls) {
    const st = state(), r = rng('sup' + dayKey() + ':' + st.seed + ':' + cls), ops = OPSX().filter((o) => o.class === cls);
    if (!ops.length) return [];
    const docs = [...C.doctors].sort(() => r() - 0.5).slice(0, 6);
    return docs.map((name, i) => {
      const o = ops[Math.floor(r() * ops.length)], rar = o.rarity || 4;
      const elite = r() < 0.75 ? Math.min(2, rar >= 4 ? 2 : 1) : 1, lv = elite === 2 ? RAR_LV[rar][2] - (r() < 0.6 ? 0 : Math.floor(r() * 30)) : RAR_LV[rar][1] - Math.floor(r() * 20);
      const sk = Math.min(elite, Math.max(0, ((o.skills || [o.skill]).filter(Boolean).length) - 1));
      return { key: cls + i, doc: name, tag: String(Math.floor(r() * 9000) + 1000), plv: 60 + Math.floor(r() * 61), login: r() < 0.7 ? '오늘' : `${1 + Math.floor(r() * 3)}일 전`, friend: r() < 0.3,
        op: o.id, elite, level: Math.max(1, lv), pot: 1 + Math.floor(r() * 6), slv: 7, mst: elite === 2 ? [0, 1, 2].map(() => Math.floor(r() * 4)) : [0, 0, 0], skill: Math.floor(r() * (sk + 1)), trust: 100 + Math.floor(r() * 101) };
    }).sort((a, b) => b.friend - a.friend);
  }
  // 지원 유닛 → 전투용 오퍼레이터 정의
  function defOf(sup) {
    const base = opOf(sup.op);
    const d = TRAIN.trained(base, { elite: sup.elite, level: sup.level, exp: 0, slv: sup.slv, mst: sup.mst, pot: sup.pot, trust: sup.trust });
    return { ...d, support: sup.doc, fixedSkill: sup.skill };
  }
  const elIco = (e) => `<img class="elite-ico" src="${window.IMGPACK ? IMGPACK.src(`img/ui/elite_${e}.png`) : `img/ui/elite_${e}.png`}" alt="">`;
  const potIco = (p) => `<img class="sp-pot" src="${window.IMGPACK ? IMGPACK.src(`img/ui/pot_${p}.png`) : `img/ui/pot_${p}.png`}" alt="">`;
  function supCard(s, picked) {
    const o = opOf(s.op), sk = (o.skills || [o.skill]).filter(Boolean)[s.skill];
    return `<button class="sp-card ${picked ? 'on' : ''} ${s.friend ? 'friend' : ''}" data-sppick="${esc(s.key)}">
      <span class="sp-doc"><i class="sp-plv"><small>LV</small>${s.plv}</i><span class="sp-ava" style="--c:${o.color}">${o.image ? `<img src="${esc(o.image)}" alt="">` : `<b>${esc(o.name[0])}</b>`}</span><b>${esc(s.doc)}</b><small>#${s.tag}</small><em>${esc(s.login)}</em></span>
      <span class="sp-art" style="--c:${o.color}">${UI.artHTML(o)}
        <span class="sp-el">${elIco(s.elite)}</span><span class="sp-lv">${potIco(s.pot)}<small>LV</small><b>${s.level}</b></span>
        <span class="sp-sk">${sk ? `<img src="${UI.skillIcon(sk, s.skill, o)}" alt=""><i>${s.elite === 2 && s.mst[s.skill] ? `M${s.mst[s.skill]}` : s.slv}</i>` : ''}</span></span>
      <b class="sp-name">${esc(o.name)}</b>${s.friend ? '<span class="sp-rec">FRIEND</span>' : '<span class="sp-rec">RECOMMEND</span>'}</button>`;
  }
  let supCls = 'guard';
  function openBorrow() {
    const st = state(), v = $('#sup-view'), list = borrowList(supCls), pk = st.pick;
    v.innerHTML = `<header class="pv-top"><button class="nav-btn" data-spclose aria-label="뒤로">${UI.icon('back')}</button><span>지원 유닛 선택</span>
      <button class="sp-mine" data-spmine>내 지원 유닛</button>${pk ? '<button class="sp-clear" data-spclear>선택 해제</button>' : ''}<button class="sp-ref" data-spref ${st.rf > 0 ? '' : 'disabled'}>⟳ 새로고침 <small>${st.rf}/3</small></button></header>
      <nav class="sp-cls">${Object.keys(C_CLS).map((c) => `<button class="${c === supCls ? 'on' : ''}" data-spcls="${c}" title="${esc(CLASSES[c].name)}">${UI.icon(c)}</button>`).join('')}</nav>
      <div class="sp-list">${list.map((s) => supCard(s, pk && pk.key === s.key && pk.day === dayKey() && pk.seed === st.seed)).join('') || '<p class="empty-note">이 직군의 지원 유닛이 없습니다.</p>'}</div>
      <p class="sp-note">작전마다 지원 유닛 1명을 편성할 수 있습니다 · 이기면 크레딧 ${C.useReward} (오늘 ${st.uses}/${C.useMax})</p>`;
    v.classList.remove('hidden');
    v._list = list;
  }
  const C_CLS = { vanguard: 1, guard: 1, defender: 1, sniper: 1, caster: 1, medic: 1, supporter: 1, specialist: 1 };
  document.addEventListener('click', (e) => {
    const v = $('#sup-view');
    if (!v || v.classList.contains('hidden') || !v.contains(e.target)) return;
    const st = state(), g = (s) => e.target.closest(s);
    if (g('[data-spclose]')) { v.classList.add('hidden'); renderBtn(); return; }
    if (g('[data-spmine]')) { openUnits(); return; }
    if (g('[data-spclear]')) { st.pick = null; ACCOUNT.save(); openBorrow(); return; }
    const c = g('[data-spcls]'); if (c) { supCls = c.dataset.spcls; openBorrow(); return; }
    if (g('[data-spref]')) { if (st.rf <= 0) return; st.rf--; st.seed++; ACCOUNT.save(); sfx('select'); openBorrow(); return; }
    const p = g('[data-sppick]');
    if (p) {
      const s = (v._list || []).find((x) => x.key === p.dataset.sppick);
      if (!s) return;
      if (UI.save.squad.includes(s.op)) { toast('이미 편성에 있는 오퍼레이터는 지원 유닛으로 고를 수 없습니다'); return; }
      st.pick = st.pick && st.pick.key === s.key ? null : { ...s, day: dayKey(), seed: st.seed };
      ACCOUNT.save(); sfx('select');
      v.classList.add('hidden'); renderBtn();
    }
  });
  // 편성 화면의 지원 유닛 버튼
  function picked() { const st = state(), p = st.pick; return p && p.day === dayKey() ? p : null; }
  function renderBtn() {
    const b = $('#btn-support');
    if (!b) return;
    const p = picked(), o = p && opOf(p.op);
    b.innerHTML = o ? `<span class="sb-art" style="--c:${o.color}">${o.image ? `<img src="${esc(o.image)}" alt="">` : `<b>${esc(o.name[0])}</b>`}</span><span class="sb-txt"><small>지원 유닛</small><b>${esc(o.name)}</b><em>${esc(p.doc)} · LV ${p.level}</em></span>`
      : '<span class="sb-plus">＋</span><span class="sb-txt"><small>SUPPORT</small><b>지원 유닛</b></span>';
    b.classList.toggle('on', !!o);
  }
  // 작전 승리 시 크레딧
  function used(sup) {
    const st = state();
    if (st.uses >= C.useMax) return;
    st.uses++;
    const got = addCredit(C.useReward);
    ACCOUNT.save();
    if (got) setTimeout(() => toast(`지원 유닛 사용 · 크레딧 +${got}`), 900);
  }
  // 내 지원 유닛 설정 (3명) — 매일 「획득하기」 보상이 늘어남
  function openUnits() {
    const st = state();
    openModal(`<div class="modal-title">내 지원 유닛</div><div class="modal-sub">SUPPORT UNITS · 다른 박사가 사용하면 크레딧을 얻습니다 (1명당 매일 ${C.perUnit})</div>
      <div class="su-row">${st.units.map((u, i) => {
        const o = u && opOf(u.op), pg = u && TRAIN.prog(u.op), sks = o ? (o.skills || [o.skill]).filter(Boolean).slice(0, pg.elite + 1) : [];
        return `<div class="su-card ${o ? '' : 'empty'}">${o ? `<span class="su-art" style="--c:${o.color}">${UI.artHTML(o)}</span>
          <span class="su-info">${elIco(pg.elite)}<small>LV</small><b>${pg.level}</b></span>
          <div class="su-sks">${sks.map((sk, j) => `<button class="${j === u.skill ? 'on' : ''}" data-suskill="${i}:${j}"><img src="${UI.skillIcon(sk, j, o)}" alt=""></button>`).join('')}</div>
          <b class="su-name">${esc(o.name)}</b><button class="su-chg" data-suset="${i}">변경</button>` : `<button class="su-add" data-suset="${i}">＋<small>지원 유닛 ${i + 1}</small></button>`}</div>`;
      }).join('')}</div>`);
    $('#modal').dataset.kind = 'units';
  }
  function pickUnit(i) {
    const st = state(), taken = st.units.filter(Boolean).map((u) => u.op);
    const list = OPSX().filter((o) => ACCOUNT.owns(o.id)).sort((a, b) => (b.rarity || 3) - (a.rarity || 3));
    openModal(`<div class="modal-title">지원 유닛 ${i + 1} 선택</div><div class="modal-sub">보유한 오퍼레이터 중에서 고르세요</div>
      <div class="pick-grid">${st.units[i] ? '<button class="card-btn su-none" data-suop="">해제</button>' : ''}${list.map((o) => `<button class="card-btn ${taken.includes(o.id) ? 'picked' : ''}" data-suop="${o.id}" ${taken.includes(o.id) && (!st.units[i] || st.units[i].op !== o.id) ? 'disabled' : ''}>${UI.cardHTML(o, 'small form')}</button>`).join('')}</div>`);
    $('#modal').dataset.kind = 'unitpick';
    $('#modal').dataset.slot = i;
  }
  $('#modal-body').addEventListener('click', (e) => {
    const kind = $('#modal').dataset.kind, st = state();
    if (kind === 'units') {
      const s = e.target.closest('[data-suset]'); if (s) { pickUnit(+s.dataset.suset); return; }
      const k = e.target.closest('[data-suskill]'); if (k) { const [i, j] = k.dataset.suskill.split(':').map(Number); st.units[i].skill = j; ACCOUNT.save(); openUnits(); }
      return;
    }
    if (kind === 'unitpick') {
      const b = e.target.closest('[data-suop]'); if (!b) return;
      const i = +$('#modal').dataset.slot, id = b.dataset.suop;
      st.units[i] = id ? { op: id, skill: Math.max(0, Math.min(TRAIN.prog(id).elite, ((opOf(id).skills || []).length || 1) - 1)) } : null;
      ACCOUNT.save(); sfx('select'); openUnits();
    }
  });

  window.SUPPORT = { picked, defOf, used, open: openBorrow, renderBtn };
  window.CREDIT_UI = { html, addCredit, state };
})();
