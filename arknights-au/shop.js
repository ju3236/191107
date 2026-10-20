'use strict';
// =====================================================================
//  잿빛 등대 — 구매센터 · 헤드헌팅 · 창고 · 관리자
// =====================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const { esc, icon, toast, openModal, closeModal, cardHTML, artHTML, stars, RENDER, go, OPS } = UI;
  const sfx = (n) => window.SFX && SFX.play(n);
  const won = (n) => '₩' + Number(n).toLocaleString('ko-KR');
  const fmt = (n) => Number(n).toLocaleString('ko-KR');
  const itemName = (k) => (k.startsWith('op:') ? (OPS[k.slice(3)] ? OPS[k.slice(3)].name : '오퍼레이터') : ITEMS[k] ? ITEMS[k].name : k);
  const itemsText = (items) => Object.entries(items || {}).map(([k, v]) => (k.startsWith('op:') ? `오퍼레이터 ${itemName(k)}` : `${itemName(k)} ×${fmt(v)}`)).join(' + ');
  const ico = (k, big) => `<i class="ri ${esc(k)}${big ? ' big' : ''}"></i>`;
  const timeText = (t) => { const d = new Date(t || 0), p = (n) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const onlineOnly = () => {
    openModal(`<div class="modal-title">온라인 전용 기능</div><div class="modal-sub">ONLINE</div>
      <p class="modal-text">결제 요청은 claude.ai 링크에서 로그인한 채로 열었을 때만 보낼 수 있습니다.\n관리자(이 게임 페이지의 편집 권한이 있는 사람)가 요청을 승인하면 재화가 지급됩니다.</p>`);
  };

  // =====================================================================
  //  구매센터
  // =====================================================================
  const STORE_TABS = [['recommend', '추천'], ['originite', '오리지늄'], ['packages', '패키지'], ['exchange', '합성옥 교환'], ['history', '결제 내역']];
  let storeTab = 'recommend';
  RENDER.store = (arg, opts = {}) => {
    if (arg && !opts.back) storeTab = arg;
    UI.renderResources();
    $('#store-tabs').innerHTML = STORE_TABS.map(([k, n]) => `<button class="${k === storeTab ? 'on' : ''}" data-stab="${k}">${n}</button>`).join('');
    const main = $('#store-main');
    const card = (p, kind) => `
      <button class="prod ${kind}" data-buy="${esc(p.id)}">
        <div class="prod-art">${Object.keys(p.items).slice(0, 2).map((k) => ico(k, true)).join('')}</div>
        <div class="prod-name">${esc(p.name)}${kind === 'op' ? ` <b>×${p.items.originite}</b>` : ''}</div>
        ${p.desc ? `<div class="prod-desc">${esc(p.desc)}</div>` : ''}
        <div class="prod-price">${won(p.price)}</div>
      </button>`;
    if (storeTab === 'recommend') {
      main.innerHTML = `<div class="store-banner"><b>헤드헌팅 진행 중</b><span>${esc(ACCOUNT.banner.name || GACHA.standardName)}</span><button class="btn primary" data-go="headhunt">헤드헌팅으로</button></div>
        <div class="prod-grid">${SHOP.packages.slice(0, 2).map((p) => card(p, 'pkg')).join('')}${SHOP.originite.slice(1, 3).map((p) => card(p, 'op')).join('')}</div>`;
    } else if (storeTab === 'originite') {
      main.innerHTML = `<div class="prod-grid">${SHOP.originite.map((p) => card(p, 'op')).join('')}</div>`;
    } else if (storeTab === 'packages') {
      main.innerHTML = `<div class="prod-grid">${SHOP.packages.map((p) => card(p, 'pkg')).join('')}</div>`;
    } else if (storeTab === 'exchange') {
      const have = ACCOUNT.bal('originite');
      main.innerHTML = `<div class="exchange">
        <div class="ex-row">${ico('originite', true)}<span class="ex-arrow">→</span>${ico('orundum', true)}</div>
        <p>오리지늄 1개 = 합성옥 ${ORIGINITE_TO_ORUNDUM}개 · 보유 오리지늄 <b>${fmt(have)}</b></p>
        <div class="ex-qty"><button class="btn small" data-exq="-10">-10</button><button class="btn small" data-exq="-1">-1</button>
          <b id="ex-n">1</b><button class="btn small" data-exq="1">+1</button><button class="btn small" data-exq="10">+10</button></div>
        <p class="ex-result">합성옥 <b id="ex-get">${ORIGINITE_TO_ORUNDUM}</b>개 획득</p>
        <button class="btn primary" id="ex-go" ${have < 1 ? 'disabled' : ''}>교환</button>
      </div>`;
    } else {
      const list = ACCOUNT.myRequests;
      const label = { pending: '승인 대기', approved: '지급 완료', rejected: '거절됨' };
      main.innerHTML = ACCOUNT.mode !== 'online'
        ? '<p class="empty-note">온라인 계정에서만 결제 내역이 기록됩니다.</p>'
        : list.length
          ? `<div class="req-list">${list.map((r) => `<div class="req-row"><span class="req-time">${timeText(r.at)}</span><b>${esc(r.label || '')}</b><span>${won(r.price || 0)}</span><span class="chip st-${esc(r.status)}">${label[r.status] || esc(r.status)}</span></div>`).join('')}</div>`
          : '<p class="empty-note">아직 결제 요청이 없습니다.</p>';
    }
  };
  ACCOUNT.on('requests', () => { if (UI.current === 'store') RENDER.store(undefined, { back: true }); });
  $('#store-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stab]');
    if (b) { storeTab = b.dataset.stab; RENDER.store(); }
  });
  let exN = 1;
  $('#store-main').addEventListener('click', async (e) => {
    const q = e.target.closest('[data-exq]');
    if (q) {
      exN = Math.max(1, Math.min(ACCOUNT.bal('originite') || 1, exN + +q.dataset.exq));
      $('#ex-n').textContent = exN;
      $('#ex-get').textContent = fmt(exN * ORIGINITE_TO_ORUNDUM);
      return;
    }
    if (e.target.closest('#ex-go')) {
      if (!ACCOUNT.spend({ originite: exN })) { toast('오리지늄이 부족합니다'); return; }
      ACCOUNT.earn({ orundum: exN * ORIGINITE_TO_ORUNDUM });
      sfx('select');
      toast(`합성옥 ${fmt(exN * ORIGINITE_TO_ORUNDUM)}개를 획득했습니다`);
      exN = 1;
      RENDER.store();
      return;
    }
    const b = e.target.closest('[data-buy]');
    if (!b) return;
    const p = [...SHOP.originite, ...SHOP.packages].find((x) => x.id === b.dataset.buy);
    if (!p) return;
    if (ACCOUNT.mode !== 'online') { onlineOnly(); return; }
    const label = SHOP.originite.includes(p) ? `${p.name} ×${p.items.originite}` : p.name;
    openModal(`<div class="modal-title">구매 확인</div><div class="modal-sub">PURCHASE</div>
      <div class="buy-box"><b>${esc(label)}</b><span>${esc(itemsText(p.items))}</span><span class="buy-price">${won(p.price)}</span></div>
      <p class="modal-text">실제 결제는 이뤄지지 않습니다. 결제 요청을 보내면 관리자가 확인한 뒤 승인했을 때 지급됩니다.</p>
      <div class="panel-btns"><button class="btn primary" id="buy-go">결제 요청 보내기</button><button class="btn" id="buy-no">취소</button></div>`);
    $('#buy-no').addEventListener('click', closeModal);
    $('#buy-go').addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      try {
        await ACCOUNT.requestPurchase({ ...p, label });
        closeModal();
        sfx('select');
        toast('결제 요청을 보냈습니다. 관리자 승인 후 지급됩니다');
      } catch (err) {
        console.warn(err);
        ev.target.disabled = false;
        toast('요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요');
      }
    });
  });

  // =====================================================================
  //  헤드헌팅
  // =====================================================================
  let hhSel = null;
  function banners() {
    const list = [];
    const b = ACCOUNT.banner;
    const feat = b.featured.map((id) => OPS[id]).filter(Boolean);
    if (b.name && feat.length) list.push({ key: 'event', name: b.name, featured: feat.map((o) => o.id), tag: '한정 아님 · 확률 UP' });
    list.push({ key: 'standard', name: GACHA.standardName, featured: [], tag: '상시' });
    return list;
  }
  const pool = () => OPERATORS;
  function payFor(n) {
    const b = (k) => ACCOUNT.bal(k);
    if (n === 1) {
      if (b('permit') >= 1) return { permit: 1 };
      if (b('orundum') >= GACHA.cost) return { orundum: GACHA.cost };
      return null;
    }
    if (b('permit10') >= 1) return { permit10: 1 };
    if (b('permit') >= 10) return { permit: 10 };
    if (b('orundum') >= GACHA.cost * 10) return { orundum: GACHA.cost * 10 };
    return null;
  }
  function payLabel(n) {
    const p = payFor(n) || (n === 1 ? { orundum: GACHA.cost } : { orundum: GACHA.cost * 10 });
    const [k, v] = Object.entries(p)[0];
    return `${ico(k)}<span>${ITEMS[k].short} ×${fmt(v)}</span>`;
  }
  const rate6 = () => GACHA.rates[6] + Math.max(0, ACCOUNT.player.pity - GACHA.pityStart + 1) * GACHA.pityStep;

  RENDER.headhunt = () => {
    UI.renderResources();
    const list = banners();
    if (!hhSel || !list.find((x) => x.key === hhSel)) hhSel = list[0].key;
    const bn = list.find((x) => x.key === hhSel);
    $('#hh-banners').innerHTML = list.map((x) => `<button class="${x.key === hhSel ? 'on' : ''}" data-hh="${x.key}"><b>${esc(x.name)}</b><small>${esc(x.tag)}</small></button>`).join('');
    const showcase = (bn.featured.length ? bn.featured.map((id) => OPS[id]) : pool().filter((o) => (o.rarity || 3) >= 6).slice(0, 3)).filter(Boolean);
    const sixes = bn.featured.map((id) => OPS[id]).filter((o) => o && o.rarity === 6);
    const fives = bn.featured.map((id) => OPS[id]).filter((o) => o && o.rarity === 5);
    $('#hh-main').innerHTML = `
      <div class="hh-art">${showcase.map((o, i) => `<div class="hh-op" style="--i:${i}">${artHTML(o)}</div>`).join('')}</div>
      <div class="hh-info">
        <div class="hh-kind">HEADHUNTING</div>
        <div class="hh-name">${esc(bn.name)}</div>
        ${sixes.length ? `<div class="hh-up"><span class="up6">★6</span> ${sixes.map((o) => esc(o.name)).join(' · ')} <small>6성 획득 시 50% 확률</small></div>` : ''}
        ${fives.length ? `<div class="hh-up"><span class="up5">★5</span> ${fives.map((o) => esc(o.name)).join(' · ')} <small>5성 획득 시 50% 확률</small></div>` : ''}
        ${!bn.featured.length ? '<div class="hh-up">모든 오퍼레이터가 같은 확률로 등장합니다</div>' : ''}
        <div class="hh-pity">${ACCOUNT.player.pity}회 연속 6성 미획득 · 다음 6성 확률 <b>${Math.round(rate6() * 100)}%</b></div>
        <button class="btn small" id="hh-rates">확률 정보</button>
      </div>
      <div class="hh-btns">
        <button class="hh-btn" data-pull="1"><b>헤드헌팅 1회</b><span class="hh-cost">${payLabel(1)}</span></button>
        <button class="hh-btn ten" data-pull="10"><b>헤드헌팅 10회</b><span class="hh-cost">${payLabel(10)}</span></button>
      </div>`;
  };
  ACCOUNT.on('banner', () => { if (UI.current === 'headhunt') RENDER.headhunt(); });
  ACCOUNT.on('wallet', () => { if (UI.current === 'headhunt') RENDER.headhunt(); });
  $('#hh-banners').addEventListener('click', (e) => {
    const b = e.target.closest('[data-hh]');
    if (b) { hhSel = b.dataset.hh; RENDER.headhunt(); }
  });
  $('#hh-main').addEventListener('click', (e) => {
    if (e.target.closest('#hh-rates')) { openRates(); return; }
    const b = e.target.closest('[data-pull]');
    if (b) tryPull(+b.dataset.pull);
  });

  function openRates() {
    const by = {};
    for (const o of pool()) (by[o.rarity || 3] = by[o.rarity || 3] || []).push(o);
    openModal(`<div class="modal-title">확률 정보</div><div class="modal-sub">원작과 같은 확률 · 50회 연속 6성이 나오지 않으면 이후 1회마다 6성 확률 +2%</div>
      <div class="rate-list">${[6, 5, 4, 3].map((r) => `<div class="rate-row"><b class="r${r}">★${r}</b><span>${Math.round(GACHA.rates[r] * 100)}%</span>
        <small>${(by[r] || []).map((o) => esc(o.name)).join(', ') || '해당 등급 오퍼레이터 없음 (다른 등급으로 대체)'}</small></div>`).join('')}</div>`);
  }

  function tryPull(n) {
    const pay = payFor(n);
    if (!pay) {
      const need = n * GACHA.cost - ACCOUNT.bal('orundum');
      const op = Math.ceil(need / ORIGINITE_TO_ORUNDUM);
      const haveOp = ACCOUNT.bal('originite');
      openModal(`<div class="modal-title">합성옥 부족</div><div class="modal-sub">ORUNDUM</div>
        <p class="modal-text">헤드헌팅 ${n}회에 합성옥 ${fmt(n * GACHA.cost)}개(또는 허가증)가 필요합니다. 합성옥이 ${fmt(need)}개 부족합니다.</p>
        <div class="panel-btns">
          ${haveOp >= op ? `<button class="btn primary" id="hh-ex">오리지늄 ${op}개를 합성옥으로 교환하고 진행</button>` : ''}
          <button class="btn" id="hh-store">구매센터로 가기</button></div>`);
      const ex = $('#hh-ex');
      if (ex) ex.addEventListener('click', () => {
        if (!ACCOUNT.spend({ originite: op })) return;
        ACCOUNT.earn({ orundum: op * ORIGINITE_TO_ORUNDUM });
        closeModal();
        tryPull(n);
      });
      $('#hh-store').addEventListener('click', () => { closeModal(); go('store', 'originite'); });
      return;
    }
    if (!ACCOUNT.spend(pay)) return;
    const results = rollMany(n);
    playGacha(results);
  }

  function rollRarity() {
    const r6 = rate6(), r5 = GACHA.rates[5], r4 = GACHA.rates[4];
    const x = Math.random();
    return x < r6 ? 6 : x < r6 + r5 ? 5 : x < r6 + r5 + r4 ? 4 : 3;
  }
  function rollMany(n) {
    const bn = banners().find((x) => x.key === hhSel) || banners()[0];
    const by = {};
    for (const o of pool()) (by[o.rarity || 3] = by[o.rarity || 3] || []).push(o);
    const out = [];
    const p = ACCOUNT.player;
    for (let i = 0; i < n; i++) {
      let r = rollRarity();
      if (!by[r]) {   // 그 등급이 없으면 가까운 등급으로
        const alt = [r - 1, r - 2, r - 3, r + 1, r + 2, r - 4, r + 3].find((x) => by[x]);
        r = alt || Object.keys(by)[0];
      }
      const feat = bn.featured.map((id) => OPS[id]).filter((o) => o && (o.rarity || 3) === r);
      const list = feat.length && Math.random() < 0.5 ? feat : by[r];
      const def = list[Math.floor(Math.random() * list.length)];
      p.pity = (def.rarity || 3) === 6 ? 0 : p.pity + 1;
      const got = ACCOUNT.obtain(def);
      p.pulls.push({ id: def.id, r: def.rarity || 3, at: Date.now() });
      out.push({ def, ...got });
    }
    p.pulls = p.pulls.slice(-60);
    ACCOUNT.save();
    ACCOUNT.emit('wallet');
    return out;
  }

  // ---------- 헤드헌팅 연출 ----------
  function playGacha(results) {
    const ov = $('#gacha'), stage = $('#gacha-stage');
    const top = Math.max(...results.map((r) => r.def.rarity || 3));
    let i = -1;
    ov.classList.remove('hidden');
    ov.className = `overlay gacha r${top}`;
    stage.innerHTML = `<div class="g-intro"><div class="g-beam"></div><div class="g-text">HEADHUNTING</div></div>`;
    sfx('gacha');
    let timer = setTimeout(next, 1500);
    function next() {
      clearTimeout(timer);
      i++;
      if (i >= results.length) { summary(); return; }
      const r = results[i], d = r.def, rr = d.rarity || 3;
      ov.className = `overlay gacha r${rr}`;
      sfx('rev' + Math.min(6, Math.max(3, rr)));
      stage.innerHTML = `<div class="g-reveal">
        <div class="g-flash"></div>
        <div class="g-art">${artHTML(d)}</div>
        <div class="g-meta">
          <div class="g-stars">${stars(rr)}</div>
          <div class="g-en">${esc(d.en || '')}</div>
          <div class="g-name">${esc(d.name)}</div>
          <div class="g-class">${icon(d.class)}<span>${esc(CLASSES[d.class].name)}</span></div>
          <div class="g-badge">${r.isNew ? '<span class="new">NEW</span>' : `잠재력 ${r.pot}${r.cert ? ' · ' + esc(itemsText(r.cert)) : ''}`}</div>
          ${r.isNew ? `<div class="g-quote">“${esc(d.quote || '')}”</div>` : ''}
        </div>
        <div class="g-count">${i + 1} / ${results.length}</div>
      </div>`;
      timer = setTimeout(next, rr >= 5 ? 2600 : 1300);
    }
    function summary() {
      ov.className = `overlay gacha summary`;
      stage.innerHTML = `<div class="g-summary">
        <div class="g-sum-title">헤드헌팅 결과</div>
        <div class="g-sum-grid">${results.map((r) => `<div class="g-sum-card r${r.def.rarity || 3}">${cardHTML(r.def, 'small')}${r.isNew ? '<span class="new">NEW</span>' : ''}</div>`).join('')}</div>
        <button class="btn primary" id="g-close">확인</button>
      </div>`;
      $('#g-close').addEventListener('click', close);
    }
    function close() {
      clearTimeout(timer);
      ov.classList.add('hidden');
      ov.onclick = null;
      $('#gacha-skip').onclick = null;
      if (UI.current === 'headhunt') RENDER.headhunt();
    }
    ov.onclick = (e) => {
      if (e.target.closest('#gacha-skip') || e.target.closest('#g-close')) return;
      if (ov.classList.contains('summary')) return;
      next();
    };
    $('#gacha-skip').onclick = (e) => { e.stopPropagation(); clearTimeout(timer); i = results.length; summary(); };
  }

  // =====================================================================
  //  창고
  // =====================================================================
  RENDER.depot = () => {
    const keys = Object.keys(ITEMS);
    $('#depot-grid').innerHTML = keys.map((k) => `<button class="depot-item" data-item="${k}">${ico(k, true)}<b>${fmt(ACCOUNT.bal(k))}</b><span>${esc(ITEMS[k].name)}</span></button>`).join('') +
      `<button class="depot-item" data-item="sanity"><i class="ri sanity big"></i><b>${ACCOUNT.sanity()}</b><span>이성</span></button>`;
  };
  $('#depot-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-item]');
    if (!b) return;
    const k = b.dataset.item;
    const it = k === 'sanity' ? { name: '이성', desc: `작전에 필요한 체력. 6분마다 1씩 회복되며 최대 ${ACCOUNT.SANITY_MAX}. 오리지늄 1개로 전부 회복할 수 있다.` } : ITEMS[k];
    openModal(`<div class="item-detail">${ico(k, true)}<div><div class="modal-title">${esc(it.name)}</div><div class="modal-sub">보유 ${k === 'sanity' ? ACCOUNT.sanity() : fmt(ACCOUNT.bal(k))}</div><p class="modal-text">${esc(it.desc)}</p></div></div>`);
  });
  ACCOUNT.on('wallet', () => { if (UI.current === 'depot') RENDER.depot(); });

  // =====================================================================
  //  관리자
  // =====================================================================
  const ADMIN_TABS = [['requests', '결제 요청'], ['grant', '재화 지급'], ['ops', '오퍼레이터 실장'], ['banner', '헤드헌팅 배너']];
  let adminTab = 'requests', editing = null;
  const A = { requests: [], players: [], grants: [], names: {}, subscribed: false };
  function subscribeAdmin() {
    if (A.subscribed || !ACCOUNT.isAdmin) return;
    A.subscribed = true;
    const re = () => { if (UI.current === 'admin' && !editing) RENDER.admin(); };
    ACCOUNT.admin.watch('requests', (l) => { A.requests = l.sort((a, b) => (b.at || 0) - (a.at || 0)); notifyPending(); re(); });
    ACCOUNT.admin.watch('players', (l) => { A.players = l; re(); });
    ACCOUNT.admin.watch('grants', (l) => { A.grants = l; re(); });
  }
  let lastPending = -1;
  function notifyPending() {
    const n = A.requests.filter((r) => r.status === 'pending').length;
    const tile = $('#tile-admin');
    if (tile) tile.dataset.badge = n ? String(n) : '';
    if (lastPending >= 0 && n > lastPending) toast(`새 결제 요청이 ${n - lastPending}건 들어왔습니다`);
    lastPending = n;
  }
  ACCOUNT.on('mode', () => { if (ACCOUNT.isAdmin) subscribeAdmin(); });

  async function nameMap(ids) {
    const uniq = [...new Set(ids.filter(Boolean))];
    let ps = {};
    try { ps = await ACCOUNT.admin.profiles(uniq); } catch { /* 이름을 못 가져와도 계속 */ }
    const out = {};
    for (const id of uniq) {
      const pl = A.players.find((p) => p.id === id);
      out[id] = (pl && pl.nick) || (ps[id] && ps[id].name) || (id === ACCOUNT.uid ? '나' : '박사');
    }
    return out;
  }
  function balanceOf(pl) {
    const g = {};
    for (const gr of A.grants) if (gr.uid === pl.id) for (const [k, v] of Object.entries(gr.items || {})) if (ITEMS[k]) g[k] = (g[k] || 0) + (+v || 0);
    const b = {};
    for (const k of Object.keys(ITEMS)) b[k] = Math.floor((g[k] || 0) + ((pl.earned || {})[k] || 0) - ((pl.spent || {})[k] || 0));
    return b;
  }

  RENDER.admin = async (arg, opts = {}) => {
    if (editing && opts.refresh) return;   // 편집 중에는 입력 내용을 지키기 위해 다시 그리지 않음
    if (!ACCOUNT.isAdmin) {
      $('#admin-tabs').innerHTML = '';
      $('#admin-main').innerHTML = '<p class="empty-note">관리자만 볼 수 있습니다. (이 게임 페이지의 편집 권한이 필요합니다)</p>';
      return;
    }
    subscribeAdmin();
    $('#admin-tabs').innerHTML = ADMIN_TABS.map(([k, n]) => {
      const badge = k === 'requests' ? A.requests.filter((r) => r.status === 'pending').length : 0;
      return `<button class="${k === adminTab ? 'on' : ''}" data-atab="${k}">${n}${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
    }).join('');
    const main = $('#admin-main');
    if (adminTab === 'requests') {
      const names = await nameMap(A.requests.map((r) => r.uid));
      const pend = A.requests.filter((r) => r.status === 'pending');
      const done = A.requests.filter((r) => r.status !== 'pending').slice(0, 30);
      const row = (r, act) => `<div class="req-row"><span class="req-time">${timeText(r.at)}</span><b class="req-who"></b><span>${esc(r.label || '')}</span><span>${won(r.price || 0)}</span>
        ${act ? `<button class="btn small primary" data-approve="${esc(r.id)}">승인</button><button class="btn small danger" data-reject="${esc(r.id)}">거절</button>` : `<span class="chip st-${esc(r.status)}">${r.status === 'approved' ? '승인' : '거절'}</span>`}</div>`;
      main.innerHTML = `<h3>승인 대기 <small>${pend.length}건</small></h3>
        <div class="req-list" id="req-pend">${pend.map((r) => row(r, true)).join('') || '<p class="empty-note">대기 중인 요청이 없습니다.</p>'}</div>
        <h3>처리 내역</h3><div class="req-list" id="req-done">${done.map((r) => row(r, false)).join('') || '<p class="empty-note">없음</p>'}</div>`;
      // 이름은 사용자 입력이므로 textContent로
      const fill = (sel, list) => main.querySelectorAll(sel + ' .req-who').forEach((el, i) => { el.textContent = names[list[i].uid] || '박사'; });
      fill('#req-pend', pend);
      fill('#req-done', done);
    } else if (adminTab === 'grant') {
      const names = await nameMap(A.players.map((p) => p.id));
      const opts = [...Object.keys(ITEMS).map((k) => `<option value="${k}">${esc(ITEMS[k].name)}</option>`),
        ...OPERATORS.map((o) => `<option value="op:${esc(o.id)}">오퍼레이터 · ${esc(o.name)} (★${o.rarity || 3})</option>`)].join('');
      main.innerHTML = `<h3>재화 · 오퍼레이터 지급</h3>
        <div class="form-row">
          <label>플레이어<select id="g-player">${A.players.map((p) => `<option value="${esc(p.id)}"></option>`).join('')}</select></label>
          <label>항목<select id="g-item">${opts}</select></label>
          <label>수량<input id="g-amount" type="number" value="6000" step="1"></label>
          <label>메모<input id="g-note" maxlength="40" placeholder="예: 이벤트 보상"></label>
          <button class="btn primary" id="g-go">지급</button>
        </div>
        <h3>플레이어 현황</h3>
        <div class="player-table"><div class="pt-row head"><span>플레이어</span>${['orundum', 'originite', 'permit', 'permit10', 'lmd'].map((k) => `<span>${esc(ITEMS[k].short)}</span>`).join('')}<span>오퍼레이터</span><span>클리어</span></div>
          ${A.players.map((p) => { const b = balanceOf(p); return `<div class="pt-row" data-pid="${esc(p.id)}"><span class="pt-name"></span>${['orundum', 'originite', 'permit', 'permit10', 'lmd'].map((k) => `<span>${fmt(b[k])}</span>`).join('')}<span>${new Set([...Object.keys(p.owned || {}), ...A.grants.filter((g) => g.uid === p.id).flatMap((g) => Object.keys(g.items || {}).filter((k) => k.startsWith('op:')).map((k) => k.slice(3)))]).size}</span><span>${Object.keys(p.stars || {}).length}/${STAGES.length}</span></div>`; }).join('')}
        </div>`;
      main.querySelectorAll('#g-player option').forEach((o) => { o.textContent = names[o.value] || '박사'; });
      main.querySelectorAll('.pt-row[data-pid]').forEach((r) => { r.querySelector('.pt-name').textContent = names[r.dataset.pid] || '박사'; });
    } else if (adminTab === 'ops') {
      if (editing) { renderEditor(main); return; }
      const custom = OPERATORS.filter((o) => o.custom);
      const names = await nameMap(custom.map((o) => o.creator));
      main.innerHTML = `<div class="ops-head"><h3>실장한 오퍼레이터 <small>${custom.length}명</small></h3><button class="btn primary" id="op-new">＋ 새 오퍼레이터</button></div>
        <p class="hint-text">여기서 만든 오퍼레이터는 두 관리자 모두 수정할 수 있고, 헤드헌팅에 바로 등장합니다. 기본 오퍼레이터는 data.js에서 수정합니다.</p>
        <div class="admin-ops">${custom.map((o) => `<div class="admin-op">${cardHTML(o, 'small')}<div class="ao-meta"><b>${esc(o.name)}</b><small class="ao-by" data-by="${esc(o.creator)}"></small>
          <div><button class="btn small" data-edit="${esc(o.docId)}">수정</button> <button class="btn small danger" data-del="${esc(o.docId)}">삭제</button></div></div></div>`).join('') || '<p class="empty-note">아직 없습니다. 「새 오퍼레이터」로 자캐를 실장해 보세요.</p>'}</div>
        <h3>기본 오퍼레이터 (data.js)</h3><div class="admin-ops builtin">${OPERATORS.filter((o) => !o.custom).map((o) => `<div class="admin-op">${cardHTML(o, 'small')}</div>`).join('')}</div>`;
      main.querySelectorAll('.ao-by').forEach((el) => { el.textContent = '실장: ' + (names[el.dataset.by] || '관리자'); });
    } else if (adminTab === 'banner') {
      const b = ACCOUNT.banner;
      const cands = OPERATORS.filter((o) => (o.rarity || 3) >= 5);
      main.innerHTML = `<h3>헤드헌팅 배너</h3>
        <p class="hint-text">확률 UP 오퍼레이터를 고르면 헤드헌팅에 이벤트 배너가 생깁니다. 해당 등급이 나오면 50% 확률로 확률 UP 오퍼레이터가 나옵니다. 아무도 고르지 않으면 표준 헤드헌팅만 남습니다.</p>
        <label class="wide">배너 이름<input id="bn-name" maxlength="30" value="${esc(b.name || '')}" placeholder="예: 등대의 불빛"></label>
        <div class="bn-list">${cands.map((o) => `<label class="bn-op"><input type="checkbox" value="${esc(o.id)}" ${b.featured.includes(o.id) ? 'checked' : ''}>${cardHTML(o, 'small')}</label>`).join('')}</div>
        <button class="btn primary" id="bn-save">배너 저장</button>`;
    }
  };

  $('#admin-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-atab]');
    if (b) { adminTab = b.dataset.atab; editing = null; RENDER.admin(); }
  });
  let delArmed = null;
  $('#admin-main').addEventListener('click', async (e) => {
    const t = e.target;
    const ap = t.closest('[data-approve]'), rj = t.closest('[data-reject]');
    if (ap || rj) {
      const req = A.requests.find((r) => r.id === (ap || rj).dataset[ap ? 'approve' : 'reject']);
      if (!req || req.status !== 'pending') return;
      (ap || rj).disabled = true;
      try {
        if (ap) { await ACCOUNT.admin.approve(req); toast('승인했습니다. 재화가 지급되었습니다'); sfx('select'); }
        else { await ACCOUNT.admin.reject(req); toast('거절했습니다'); }
      } catch (err) { console.warn(err); toast('처리하지 못했습니다'); (ap || rj).disabled = false; }
      return;
    }
    if (t.closest('#g-go')) {
      const target = $('#g-player').value, item = $('#g-item').value;
      const amount = Math.trunc(+$('#g-amount').value || 0);
      if (!target) { toast('플레이어를 고르세요'); return; }
      const items = item.startsWith('op:') ? { [item]: 1 } : { [item]: amount };
      if (!item.startsWith('op:') && !amount) { toast('수량을 입력하세요'); return; }
      t.disabled = true;
      try { await ACCOUNT.admin.grant(target, items, $('#g-note').value.trim()); toast(`${itemsText(items)} 지급했습니다`); }
      catch (err) { console.warn(err); toast('지급하지 못했습니다'); }
      t.disabled = false;
      return;
    }
    if (t.closest('#op-new')) { editing = { docId: null, data: blankOp() }; RENDER.admin(); return; }
    const ed = t.closest('[data-edit]');
    if (ed) {
      const op = OPERATORS.find((o) => o.custom && o.docId === ed.dataset.edit);
      if (op) { editing = { docId: op.docId, data: opToForm(op) }; RENDER.admin(); }
      return;
    }
    const del = t.closest('[data-del]');
    if (del) {
      const op = OPERATORS.find((o) => o.custom && o.docId === del.dataset.del);
      if (!op) return;
      if (delArmed !== op.docId) { delArmed = op.docId; del.textContent = '한 번 더 누르면 삭제'; return; }
      delArmed = null;
      try { await ACCOUNT.admin.deleteOp(op); toast(`${op.name}을(를) 삭제했습니다`); } catch (err) { console.warn(err); toast('삭제하지 못했습니다'); }
      return;
    }
    if (t.closest('#bn-save')) {
      const featured = [...document.querySelectorAll('.bn-op input:checked')].map((i) => i.value);
      try { await ACCOUNT.admin.setBanner({ name: $('#bn-name').value.trim(), featured }); toast('배너를 저장했습니다'); }
      catch (err) { console.warn(err); toast('저장하지 못했습니다'); }
      return;
    }
    if (t.closest('#ed-cancel')) { editing = null; RENDER.admin(); return; }
    if (t.closest('#ed-save')) { saveEditor(t.closest('#ed-save')); }
  });

  // ---------- 오퍼레이터 편집기 ----------
  const TALENT_FX = [['atk', '공격력 %'], ['hp', '최대 HP %'], ['def', '방어력 %'], ['speed', '공격 속도 %'], ['dodge', '물리 회피 %'], ['firstStrike', '첫 공격 배율 %'],
    ['critRate', '치명타 확률 %'], ['critMul', '치명타 배율 %'], ['auraDef', '주변 아군 방어 %'], ['guard', 'HP 50% 이하 피해 감소 %'], ['lastStand', 'HP 25% 이하 1회 회복 %']];
  const SKILL_FX = [['atk', '공격력 %'], ['def', '방어력 %'], ['speed', '공격 속도 %'], ['targets', '동시 공격 수'], ['splash', '범위 피해 반경'],
    ['hits', '연발 횟수'], ['hitMul', '연발 1발 배율 %'], ['nextHit', '다음 공격 배율 %'], ['charges', '유지 공격 횟수'],
    ['strike', '즉시 범위 공격 %'], ['strikeRadius', '범위 공격 반경'], ['stun', '기절(초)'], ['heal', '자기 즉시 회복 %'], ['regen', '초당 자기 회복 %'],
    ['allyHeal', '주변 아군 즉시 회복(공격력 %)'], ['allyRegen', '주변 아군 초당 회복(공격력 %)'], ['allyRadius', '아군 회복 반경'],
    ['shield', '보호막(최대 HP %)'], ['dodge', '물리 회피 %'], ['block', '저지 수 +'], ['dp', '즉시 코스트 +'],
    ['endBlast', '종료 시 폭발 %'], ['endRadius', '폭발 반경'], ['selfDmg', '종료 시 자기 HP 소모 %']];
  function blankOp() {
    return {
      name: '', en: '', rarity: 6, class: 'guard', archetype: '', race: '', faction: '로도스 아일랜드', color: '#6fa8dc', tags: '',
      imageId: '', cost: 15, redeploy: 40, block: 2, hp: 2500, atk: 600, def: 350, res: 0, interval: 1.2, range: 'melee1',
      profile: '', quote: '', voices: '',
      talents: [{ name: '', desc: '', fx: {} }, { name: '', desc: '', fx: {} }],
      skills: [0, 1, 2].map(() => ({ name: '', desc: '', spType: 'time', trigger: 'manual', sp: 30, initSp: 10, duration: 15, fx: {} })),
      creator: '',
    };
  }
  function opToForm(o) {
    const b = blankOp();
    return {
      ...b, name: o.name, en: o.en, rarity: o.rarity, class: o.class, archetype: o.archetype || '', race: o.race, faction: o.faction,
      color: o.color, tags: (o.tags || []).join(', '), imageId: o.imageId || '', cost: o.cost, redeploy: o.redeploy, block: o.block,
      hp: o.hp, atk: o.atk, def: o.def, res: o.res, interval: o.interval, range: o.rangeKey, profile: o.profile, quote: o.quote,
      voices: (o.voices || []).join('\n'), creator: o.creator,
      talents: [0, 1].map((i) => (o.talents[i] ? { name: o.talents[i].name, desc: o.talents[i].desc, fx: { ...o.talents[i].fx } } : b.talents[i])),
      skills: [0, 1, 2].map((i) => (o.skills[i] && o.skills[i].name !== '기본 공격' ? { ...b.skills[i], ...o.skills[i], fx: { ...o.skills[i].fx } } : { ...b.skills[i], name: '' })),
    };
  }
  const inp = (id, label, val, type = 'text', extra = '') => `<label>${label}<input id="${id}" type="${type}" value="${esc(val ?? '')}" ${extra}></label>`;
  const sel = (id, label, val, options) => `<label>${label}<select id="${id}">${options.map(([v, n]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  function fxGrid(prefix, list, fx) {
    return `<div class="fx-grid">${list.map(([k, n]) => inp(`${prefix}-${k}`, n, fx[k] ?? '', 'number', 'step="any"')).join('')}</div>`;
  }
  function renderEditor(main) {
    const d = editing.data;
    const img = d.imageId ? `<img src="/_blob/${esc(d.imageId)}" alt="">` : '<span>그림 없음</span>';
    main.innerHTML = `<div class="editor">
      <div class="ops-head"><h3>${editing.docId ? '오퍼레이터 수정' : '새 오퍼레이터'}</h3>
        <div><button class="btn" id="ed-cancel">취소</button> <button class="btn primary" id="ed-save">저장</button></div></div>
      <section><h4>기본 정보</h4><div class="form-grid">
        ${inp('ed-name', '이름', d.name, 'text', 'maxlength="20"')}${inp('ed-en', '영문 이름', d.en, 'text', 'maxlength="30"')}
        ${sel('ed-rarity', '레어도', d.rarity, [6, 5, 4, 3, 2, 1].map((r) => [r, '★' + r]))}
        ${sel('ed-class', '직군', d.class, Object.entries(CLASSES).map(([k, c]) => [k, c.name]))}
        ${sel('ed-arch', '세부 직군 특성', d.archetype, [['', '없음 (직군 기본 특성)'], ...Object.entries(ARCHETYPES).map(([k, a]) => [k, `${a.name} — ${a.trait}`])])}
        ${inp('ed-race', '종족', d.race, 'text', 'maxlength="20"')}${inp('ed-faction', '소속', d.faction, 'text', 'maxlength="40"')}
        ${inp('ed-color', '대표 색', d.color, 'color')}${inp('ed-tags', '태그 (쉼표로 구분)', d.tags, 'text', 'maxlength="60"')}
      </div>
      <div class="img-row"><div class="img-prev" id="ed-img-prev">${img}</div>
        <label class="btn ${ACCOUNT.canUpload ? '' : 'disabled'}">그림 올리기<input id="ed-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden ${ACCOUNT.canUpload ? '' : 'disabled'}></label>
        <small>투명 배경 PNG, 세로로 긴 전신 그림을 추천합니다. 전투 화면에도 그대로 서서 나옵니다.</small></div></section>
      <section><h4>능력치</h4><div class="form-grid">
        ${inp('ed-cost', '배치 코스트', d.cost, 'number')}${inp('ed-redeploy', '재배치(초)', d.redeploy, 'number')}${inp('ed-block', '저지 수', d.block, 'number')}
        ${inp('ed-hp', 'HP', d.hp, 'number')}${inp('ed-atk', '공격력', d.atk, 'number')}${inp('ed-def', '방어력', d.def, 'number')}
        ${inp('ed-res', '마법 저항', d.res, 'number')}${inp('ed-interval', '공격 간격(초)', d.interval, 'number', 'step="0.05"')}
        ${sel('ed-range', '공격 범위', d.range, Object.entries(ACCOUNT.RANGE_PRESETS).map(([k, r]) => [k, r.name]))}
      </div></section>
      <section><h4>프로필</h4><div class="form-grid one">
        <label>프로필<textarea id="ed-profile" maxlength="600" rows="3">${esc(d.profile)}</textarea></label>
        ${inp('ed-quote', '배치 대사', d.quote, 'text', 'maxlength="80"')}
        <label>비서 대사 (한 줄에 하나)<textarea id="ed-voices" rows="3">${esc(d.voices)}</textarea></label>
      </div></section>
      ${d.talents.map((t, i) => `<section><h4>재능 ${i + 1}</h4><div class="form-grid">
        ${inp(`t${i}-name`, '이름', t.name, 'text', 'maxlength="30"')}${inp(`t${i}-desc`, '설명', t.desc, 'text', 'maxlength="160"')}</div>
        <details><summary>효과 수치</summary>${fxGrid('t' + i, TALENT_FX, t.fx)}</details></section>`).join('')}
      ${d.skills.map((s, i) => `<section><h4>스킬 ${i + 1} <small>(이름을 비우면 스킬 없음)</small></h4><div class="form-grid">
        ${inp(`s${i}-name`, '이름', s.name, 'text', 'maxlength="30"')}${inp(`s${i}-desc`, '설명', s.desc, 'text', 'maxlength="200"')}
        ${sel(`s${i}-spType`, 'SP 회복', s.spType, [['time', '자동 회복'], ['attack', '공격 회복'], ['hit', '피격 회복'], ['deploy', '배치 시 발동']])}
        ${sel(`s${i}-trigger`, '발동', s.trigger, [['manual', '수동 발동'], ['auto', '자동 발동']])}
        ${inp(`s${i}-sp`, '필요 SP', s.sp, 'number')}${inp(`s${i}-initSp`, '초기 SP', s.initSp, 'number')}
        ${inp(`s${i}-duration`, '지속(초, 0=즉시, -1=무한)', s.duration, 'number')}</div>
        <details ${s.name ? 'open' : ''}><summary>효과 수치</summary>${fxGrid('s' + i, SKILL_FX, s.fx)}</details></section>`).join('')}
    </div>`;
    const file = $('#ed-file');
    if (file) file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { toast('8MB 이하 그림을 올려 주세요'); return; }
      $('#ed-img-prev').innerHTML = '<span>올리는 중…</span>';
      try {
        const r = await ACCOUNT.admin.upload(f);
        editing.data.imageId = r.id;
        $('#ed-img-prev').innerHTML = `<img src="${esc(r.url)}" alt="">`;
      } catch (err) {
        console.warn(err);
        toast('그림을 올리지 못했습니다');
        $('#ed-img-prev').innerHTML = '<span>실패</span>';
      }
    });
  }
  function readEditor() {
    const v = (id) => { const el = $('#' + id); return el ? el.value : ''; };
    const n = (id) => +v(id);
    const fx = (prefix, list) => { const o = {}; for (const [k] of list) { const x = v(`${prefix}-${k}`); if (x !== '' && Number.isFinite(+x) && +x !== 0) o[k] = +x; } return o; };
    return {
      name: v('ed-name').trim(), en: v('ed-en').trim(), rarity: n('ed-rarity'), class: v('ed-class'), archetype: v('ed-arch'),
      race: v('ed-race').trim(), faction: v('ed-faction').trim(), color: v('ed-color'),
      tags: v('ed-tags').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4),
      imageId: editing.data.imageId || '',
      cost: n('ed-cost'), redeploy: n('ed-redeploy'), block: n('ed-block'), hp: n('ed-hp'), atk: n('ed-atk'), def: n('ed-def'),
      res: n('ed-res'), interval: n('ed-interval'), range: v('ed-range'),
      profile: v('ed-profile').trim(), quote: v('ed-quote').trim(),
      voices: v('ed-voices').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6),
      talents: [0, 1].map((i) => ({ name: v(`t${i}-name`).trim(), desc: v(`t${i}-desc`).trim(), fx: fx('t' + i, TALENT_FX) })).filter((t) => t.name),
      skills: [0, 1, 2].map((i) => ({
        name: v(`s${i}-name`).trim(), desc: v(`s${i}-desc`).trim(), spType: v(`s${i}-spType`), trigger: v(`s${i}-trigger`),
        sp: n(`s${i}-sp`), initSp: n(`s${i}-initSp`), duration: n(`s${i}-duration`), fx: fx('s' + i, SKILL_FX),
      })).filter((s) => s.name),
      creator: editing.data.creator || '',
    };
  }
  async function saveEditor(btn) {
    const data = readEditor();
    if (!data.name) { toast('이름을 입력하세요'); return; }
    btn.disabled = true;
    try {
      await ACCOUNT.admin.saveOp(editing.docId, data);
      toast(`${data.name}을(를) 저장했습니다`);
      editing = null;
      RENDER.admin();
    } catch (err) {
      console.warn(err);
      toast('저장하지 못했습니다');
      btn.disabled = false;
    }
  }
})();
