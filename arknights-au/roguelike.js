'use strict';
// =====================================================================
//  통합전략 — 탐색 진행 (분대 · 모집 · 층 지도 · 작전 · 보상 · 교역소 · 안식처 · 불온한 조우)
//  데이터는 is-data.js(IS_DATA). 진행 중인 탐색은 플레이어 데이터의 is에 저장됩니다.
// =====================================================================
(() => {
  const D = IS_DATA;
  const $ = (s) => document.querySelector(s);
  const { esc, toast, go, openModal, closeModal, cardHTML, RENDER, OPS, skillsOf } = UI;
  const sfx = (n) => window.SFX && SFX.play(n);
  const P = () => ACCOUNT.player;
  const R = () => P().is || null;
  const save = () => ACCOUNT.save();
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rand(a.length)];
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = rand(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const relicById = (id) => D.relics.find((r) => r.id === id);
  const rec = () => (P().isRec = P().isRec || { runs: 0, wins: 0, best: 0, seen: [] });
  const PAIRS = ['vs', 'gs', 'dm', 'sc'];

  // ---------- 소장품·분대 효과 합산 ----------
  function fxList(r = R()) {
    const sq = D.squads.find((s) => s.id === r.squad);
    return [sq && sq.fx, ...r.relics.map((id) => relicById(id) && relicById(id).fx)].filter(Boolean);
  }
  function statFor(def, r = R()) {
    const m = { atk: 1, hp: 1, def: 1, aspd: 0, cost: 0, redeploy: 1 };
    for (const fx of fxList(r)) {
      const parts = [fx];
      if (fx.lowLife && r.life <= fx.lowLife.below) parts.push({ stat: fx.lowLife.stat, classes: fx.lowLife.classes });
      for (const f of parts) {
        if (!f.stat) continue;
        if (f.classes && !f.classes.includes(def.class)) continue;
        if (f.rarity && !f.rarity.includes(def.rarity || 3)) continue;
        const s = f.stat;
        m.atk += s.atk || 0; m.hp += s.hp || 0; m.def += s.def || 0; m.aspd += s.aspd || 0; m.cost += s.cost || 0; m.redeploy += s.redeploy || 0;
      }
    }
    return m;
  }
  function battleMods(r = R()) {
    const m = { startDp: 0, deployLimit: 0, dpRate: 1, brandImmune: false };
    for (const fx of fxList(r)) {
      const b = fx.battle || {};
      m.startDp += b.startDp || 0; m.deployLimit += b.deployLimit || 0; m.dpRate += b.dpRate || 0;
      if (fx.brandImmune) m.brandImmune = true;
    }
    return m;
  }
  function enemyMods(r = R()) {
    const m = { hp: 1, atk: 1, def: 1, speed: 1 };
    for (const fx of fxList(r)) for (const k of Object.keys(m)) m[k] += (fx.enemy && fx.enemy[k]) || 0;
    for (const k of Object.keys(m)) m[k] = Math.max(0.3, m[k]);
    return m;
  }
  const sumFx = (key, r = R()) => fxList(r).reduce((s, fx) => s + (fx[key] || 0), 0);
  const shopPrice = (p) => Math.max(1, Math.round(p * (1 - Math.min(0.5, sumFx('shopDiscount')))));

  // 탐색용 오퍼레이터 정의: 승진 전에는 능력치가 낮고 1스킬만 씀
  function runDef(o, r = R()) {
    const base = OPS[o.id];
    if (!base) return null;
    const m = statFor(base, r), p = o.promoted ? 1 : D.unpromoted;
    const skills = skillsOf(base);
    const sk = o.promoted ? skills[o.skill ?? skills.length - 1] || skills[skills.length - 1] : skills[0];
    return {
      ...base,
      hp: Math.round(base.hp * p * m.hp), atk: Math.round(base.atk * p * m.atk), def: Math.round(base.def * p * m.def),
      interval: base.interval / (1 + m.aspd), cost: Math.max(1, base.cost + m.cost), redeploy: Math.max(5, base.redeploy * m.redeploy),
      skills: sk ? [sk] : [], skill: undefined,
      talents: o.promoted ? base.talents : (base.talents || []).slice(0, 1),
    };
  }
  const hopeCost = (def) => D.hopeCost[def.rarity || 3] ?? 0;
  // 분대가 비어 있는데 희망이 모자라면 막히지 않도록 무료
  const recruitCost = (def, r = R()) => (!r.ops.length && r.hope < hopeCost(def) ? 0 : hopeCost(def));
  const promoteCost = (def) => D.promoteCost[def.rarity || 3] ?? 0;

  // ---------- 획득 처리 ----------
  function randomRelic(kind) {
    const r = R(), owned = new Set(r.relics);
    let pool = D.relics.filter((x) => !owned.has(x.id));
    if (kind === 'rare') pool = pool.filter((x) => x.rarity !== 'common');
    if (kind === 'special') pool = pool.filter((x) => x.rarity === 'special');
    if (!pool.length) pool = D.relics.filter((x) => !owned.has(x.id));
    return pool.length ? pick(pool) : null;
  }
  function relicChoices(n, kind) {
    const out = [];
    for (let i = 0; i < 20 && out.length < n; i++) {
      const x = randomRelic(kind);
      if (x && !out.includes(x.id)) out.push(x.id);
    }
    return out;
  }
  function addRelic(id) {
    const r = R(), x = relicById(id);
    if (!x || r.relics.includes(id)) return '';
    r.relics.push(id);
    const seen = rec().seen;
    if (!seen.includes(id)) seen.push(id);
    const extra = x.fx.gain ? applyGain(x.fx.gain) : [];
    return [`소장품 「${x.name}」`, ...extra].join(', ');
  }
  function addExp(n) {
    const r = R(), out = [];
    r.exp += n;
    while (r.level < D.levelExp.length && r.exp >= D.levelExp[r.level]) {
      r.level++;
      r.hope++;
      out.push(`지휘 레벨 ${r.level} (희망 +1)`);
    }
    return out;
  }
  // gain: { ingot, hope, life, exp, relic, ticket, promote } → 표시용 문구 목록
  function applyGain(g = {}) {
    const r = R(), out = [];
    if (g.ingot) { r.ingot = Math.max(0, r.ingot + g.ingot); out.push(`원석 덩어리 ${g.ingot > 0 ? '+' : ''}${g.ingot}`); }
    if (g.hope) { r.hope = Math.max(0, r.hope + g.hope); out.push(`희망 ${g.hope > 0 ? '+' : ''}${g.hope}`); }
    if (g.life) { r.life += g.life; out.push(`목숨 ${g.life > 0 ? '+' : ''}${g.life}`); }
    if (g.exp) out.push(`지휘 경험 +${g.exp}`, ...addExp(g.exp));
    if (g.ticket) { for (let i = 0; i < g.ticket; i++) r.tickets.push(pick(PAIRS)); out.push(`모집권 ${g.ticket}장`); }
    if (g.promote) { r.freePromote = (r.freePromote || 0) + g.promote; out.push(`무료 승진 ${g.promote}회`); }
    if (g.relic) {
      const n = typeof g.relic === 'number' ? g.relic : 1;
      for (let i = 0; i < n; i++) {
        const x = typeof g.relic === 'string' && relicById(g.relic) ? relicById(g.relic) : randomRelic(typeof g.relic === 'string' ? g.relic : null);
        if (x) out.push(addRelic(x.id));
      }
    }
    return out.filter(Boolean);
  }

  // ---------- 탐색 시작 ----------
  function newRun(squadId) {
    const r = {
      v: 1, squad: squadId, floor: 0, life: D.start.life, ingot: D.start.ingot, hope: D.start.hope, exp: 0, level: 1,
      relics: [], ops: [], tickets: shuffle(PAIRS).slice(0, D.start.tickets), freePromote: 0, recruitNow: true,
      map: null, at: null, pending: null, used: [], score: { battles: 0, perfect: 0, bosses: 0 }, started: Date.now(),
    };
    P().is = r;
    const sq = D.squads.find((s) => s.id === squadId);
    if (sq && sq.fx.gain) applyGain(sq.fx.gain);
    r.map = genFloor(0);
    rec().runs++;
    save();
  }

  // ---------- 층 지도 ----------
  const NODE = {
    battle: { name: '작전', en: 'OPERATION', ico: '⚔' },
    emergency: { name: '긴급 작전', en: 'EMERGENCY', ico: '⚠' },
    event: { name: '불온한 조우', en: 'ENCOUNTER', ico: '?' },
    shop: { name: '교역소', en: 'TRADER', ico: '◆' },
    rest: { name: '안식처', en: 'SAFEHOUSE', ico: '✚' },
    gate: { name: '관문 작전', en: 'GATE', ico: '⚑' },
    boss: { name: '보스 작전', en: 'BOSS', ico: '☠' },
  };
  function nodeType(c) {
    const w = [['battle', 40], ['event', 25]];
    if (c >= 1) w.push(['emergency', 10]);
    if (c >= 2) w.push(['shop', 12], ['rest', 13]);
    let x = Math.random() * w.reduce((s, [, v]) => s + v, 0);
    for (const [k, v] of w) { if ((x -= v) < 0) return k; }
    return 'battle';
  }
  function genFloor(f) {
    const F = D.floors[f], r = R();
    const cols = [];
    let n = 0;
    for (let c = 0; c < D.cols; c++) {
      const k = c === 0 ? 2 : 2 + (Math.random() < 0.55 ? 1 : 0);
      cols.push(Array.from({ length: k }, (_, i) => ({ id: 'n' + n++, type: c === 0 ? 'battle' : nodeType(c), y: (i + 1) / (k + 1) })));
    }
    const gb = D.battles[F.gate];
    cols.push([{ id: 'n' + n++, type: gb.boss ? 'boss' : 'gate', y: 0.5, battle: F.gate }]);
    // 교역소는 층마다 최대 1곳, 3번째 칸 이후에는 하나 보장
    const shops = cols.flat().filter((x) => x.type === 'shop');
    shops.slice(1).forEach((x) => { x.type = 'event'; });
    if (!shops.length) pick(cols[D.cols - 1]).type = 'shop';
    // 작전 배정 (같은 탐색에서 덜 쓴 맵 우선)
    const used = r ? r.used : [];
    for (const node of cols.flat()) {
      if (node.type === 'battle' || node.type === 'emergency') {
        const pool = shuffle(F.battles).sort((a, b) => used.filter((u) => u === a).length - used.filter((u) => u === b).length);
        node.battle = pool[0];
        used.push(pool[0]);
      }
      if (node.type === 'event') {
        const ev = D.events.filter((e) => !e.floors || e.floors.includes(f + 1));
        node.event = pick(ev).id;
      }
    }
    // 연결: 다음 칸에서 가까운 노드 1~2개, 들어오는 길이 없는 노드는 가장 가까운 노드와 연결
    const edges = {};
    for (let c = 0; c < cols.length - 1; c++) {
      const next = cols[c + 1];
      for (const a of cols[c]) {
        const near = [...next].sort((p, q) => Math.abs(p.y - a.y) - Math.abs(q.y - a.y));
        edges[a.id] = [near[0].id];
        if (near[1] && Math.abs(near[1].y - a.y) < 0.4 && Math.random() < 0.55) edges[a.id].push(near[1].id);
      }
      for (const b of next) {
        if (cols[c].some((a) => edges[a.id].includes(b.id))) continue;
        const a = [...cols[c]].sort((p, q) => Math.abs(p.y - b.y) - Math.abs(q.y - b.y))[0];
        edges[a.id].push(b.id);
      }
    }
    return { floor: f, cols, edges, cur: null, done: [] };
  }
  const findNode = (id, m = R().map) => m.cols.flat().find((x) => x.id === id);
  const colOf = (id, m = R().map) => m.cols.findIndex((c) => c.some((x) => x.id === id));
  function reachable() {
    const m = R().map;
    if (!m.cur) return m.cols[0].map((x) => x.id);
    return m.edges[m.cur] || [];
  }

  // =====================================================================
  //  화면: 통합전략 메인
  // =====================================================================
  RENDER.is = () => {
    const r = R(), rc = rec();
    $('#is-hub').innerHTML = `
      <div class="is-hero">
        <div class="is-code">${esc(D.code)}</div>
        <h1 class="is-title">${esc(D.title)}</h1>
        <div class="is-en">${esc(D.en)}</div>
        <p class="is-intro">${esc(D.intro)}</p>
        <div class="is-rec"><span>탐색 <b>${rc.runs}</b>회</span><span>완주 <b>${rc.wins}</b>회</span><span>최고 점수 <b>${rc.best}</b></span><span>소장품 도감 <b>${rc.seen.length}</b>/${D.relics.length}</span></div>
      </div>
      <div class="is-actions">
        ${r ? `<div class="is-cur">진행 중 · ${r.floor + 1}층 ${esc(D.floors[r.floor].name)} · 목숨 ${r.life} · 분대 ${r.ops.length}명</div>
          <button class="btn primary big" id="is-continue">탐색 계속</button>
          <button class="btn danger" id="is-abandon">탐색 포기</button>`
        : '<button class="btn primary big" id="is-start">탐색 시작</button>'}
        <button class="btn" id="is-dex">소장품 도감</button>
        <button class="btn" id="is-help">진행 방법</button>
      </div>`;
  };
  let abandonArmed = false;
  $('#is-hub').addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('#is-start')) { openSquadPick(); return; }
    if (t.closest('#is-continue')) { go('isrun'); return; }
    if (t.closest('#is-abandon')) {
      if (!abandonArmed) { abandonArmed = true; t.textContent = '한 번 더 누르면 포기합니다'; setTimeout(() => { abandonArmed = false; }, 3000); return; }
      abandonArmed = false;
      endRun(false, true);
      go('isrun');
      return;
    }
    if (t.closest('#is-dex')) { openDex(); return; }
    if (t.closest('#is-help')) { openHelp(); }
  });

  function openSquadPick() {
    openModal(`<div class="modal-title">분대 선택</div><div class="modal-sub">탐색을 함께할 분대를 고르세요</div>
      <div class="is-squads">${D.squads.map((s) => `<button class="is-squad" data-squad="${esc(s.id)}"><b>${esc(s.name)}</b><span>${esc(s.desc)}</span></button>`).join('')}</div>`);
    $('#modal-body').querySelectorAll('[data-squad]').forEach((b) => b.addEventListener('click', () => {
      closeModal();
      newRun(b.dataset.squad);
      sfx('select');
      go('isrun');
    }));
  }
  function openDex() {
    const seen = new Set(rec().seen);
    openModal(`<div class="modal-title">소장품 도감</div><div class="modal-sub">${seen.size} / ${D.relics.length}</div>
      <div class="relic-grid">${D.relics.map((x) => seen.has(x.id) ? relicHTML(x) : `<div class="relic unknown"><div class="relic-no">No.${x.no}</div><b>???</b><span>아직 얻지 못한 소장품</span></div>`).join('')}</div>`);
  }
  function openHelp() {
    openModal(`<div class="modal-title">진행 방법</div><div class="modal-sub">통합전략</div>
      <div class="modal-text is-help">
        <p><b>분대</b>를 고르고 <b>모집권</b>으로 오퍼레이터를 모집해 탐색을 시작합니다. 모집에는 <b>희망</b>이 듭니다 (6성 ${D.hopeCost[6]}, 5성 ${D.hopeCost[5]}, 4성 ${D.hopeCost[4]}).</p>
        <p>모집한 오퍼레이터는 <b>승진 전</b>이라 능력치가 ${Math.round(D.unpromoted * 100)}%이고 1스킬만 씁니다. 분대 화면에서 희망을 써서 <b>승진</b>하면 모든 능력치와 원하는 스킬을 쓸 수 있습니다.</p>
        <p>층 지도에서 길을 골라 나아갑니다. 작전·긴급 작전·불온한 조우·교역소·안식처가 있고, 층 끝에는 관문 작전이나 보스가 기다립니다.</p>
        <p>작전에서 적이 방어 지점을 돌파하면 탐색 전체의 <b>목숨</b>이 줄어듭니다. 목숨이 0이 되면 탐색이 끝납니다.</p>
        <p>작전 보상과 교역소에서 <b>소장품</b>을 모으면 분대가 강해집니다. <b>원석 덩어리</b>는 교역소의 화폐입니다.</p>
        <p>바다의 <b>명흔</b> 위에 선 오퍼레이터는 방어력이 줄고 HP를 잃으며, 시본은 HP를 회복합니다. <b>신경 손상</b>이 가득 차면 오퍼레이터가 큰 피해를 입고 기절합니다.</p>
      </div>`);
  }
  const relicHTML = (x, extra = '') => `<div class="relic r-${x.rarity}"><div class="relic-no">No.${x.no} · ${esc(D.rarityName[x.rarity] || '')}</div><b>${esc(x.name)}</b><span>${esc(x.desc)}</span>${extra}</div>`;

  // =====================================================================
  //  화면: 탐색 (층 지도)
  // =====================================================================
  RENDER.isrun = () => {
    const r = R();
    if (!r) { go('is'); return; }
    renderTop();
    renderMap();
    renderBottom();
    resumePanel();
  };
  function renderTop() {
    const r = R(), F = D.floors[r.floor];
    const next = D.levelExp[r.level];
    $('#is-top').innerHTML = `
      <div class="ist-floor"><small>${r.floor + 1}층 · ${esc(F.en)}</small><b>${esc(F.name)}</b></div>
      <div class="ist-res">
        <span class="ist-life" title="목숨">♥ <b>${r.life}</b></span>
        <span class="ist-ingot" title="원석 덩어리">◆ <b>${r.ingot}</b></span>
        <span class="ist-hope" title="희망">✦ <b>${r.hope}</b></span>
        <span class="ist-lv" title="지휘 레벨">Lv.<b>${r.level}</b><small>${next ? `${r.exp}/${next}` : 'MAX'}</small></span>
      </div>`;
  }
  function renderBottom() {
    const r = R();
    $('#is-bottom').innerHTML = `
      <button class="btn" id="isb-squad">분대 <b>${r.ops.length}</b>${r.freePromote ? ` <span class="badge">승진 ${r.freePromote}</span>` : ''}</button>
      <button class="btn" id="isb-relic">소장품 <b>${r.relics.length}</b></button>
      ${r.tickets.length ? `<button class="btn primary pulse" id="isb-ticket">모집권 ${r.tickets.length}장 사용</button>` : ''}
      <button class="btn" id="isb-exit">나가기</button>`;
  }
  function renderMap() {
    const r = R(), m = r.map, can = new Set(reachable());
    const nc = m.cols.length;
    const pos = (c, y) => [((c + 0.5) / nc) * 100, y * 100];
    let lines = '';
    m.cols.forEach((col, c) => col.forEach((a) => (m.edges[a.id] || []).forEach((bid) => {
      const b = findNode(bid), [x1, y1] = pos(c, a.y), [x2, y2] = pos(c + 1, b.y);
      const on = (m.cur === a.id || (!m.cur && false)) && can.has(bid);
      const walked = m.done.includes(a.id) && m.done.includes(bid);
      lines += `<line x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%" class="${on ? 'on' : walked ? 'walked' : ''}"/>`;
    })));
    const nodes = m.cols.map((col, c) => col.map((x) => {
      const [lx, ty] = pos(c, x.y), t = NODE[x.type];
      const st = m.done.includes(x.id) ? 'done' : can.has(x.id) ? 'open' : 'locked';
      const sub = x.battle && D.battles[x.battle] ? D.battles[x.battle].name : '';
      return `<button class="is-node t-${x.type} ${st} ${m.cur === x.id ? 'cur' : ''}" style="left:${lx}%;top:${ty}%" data-node="${x.id}" ${st === 'open' ? '' : 'tabindex="-1"'}>
        <i>${t.ico}</i><b>${t.name}</b><small>${st === 'locked' && x.type !== 'gate' && x.type !== 'boss' ? '' : esc(sub)}</small></button>`;
    }).join('')).join('');
    $('#is-map').innerHTML = `<svg class="is-lines" preserveAspectRatio="none">${lines}</svg>${nodes}`;
  }

  $('#is-map').addEventListener('click', (e) => {
    const b = e.target.closest('[data-node]');
    if (!b || !b.classList.contains('open')) return;
    const r = R();
    r.at = b.dataset.node;
    save();
    sfx('select');
    resumePanel();
  });
  $('#is-bottom').addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('#isb-squad')) openSquad();
    else if (t.closest('#isb-relic')) openRelics();
    else if (t.closest('#isb-ticket')) { resumePanel(true); }
    else if (t.closest('#isb-exit')) go('is');
  });

  // ---------- 패널 (닫을 수 없는 진행 창) ----------
  function panel(html, cls = '') {
    $('#is-panel').className = 'is-panel ' + cls;
    $('#is-panel').innerHTML = html;
    $('#is-overlay').classList.remove('hidden');
  }
  function hidePanel() { $('#is-overlay').classList.add('hidden'); }
  function refresh() { renderTop(); renderMap(); renderBottom(); }

  // 저장된 상태에 맞는 창 열기
  function resumePanel(useTicket) {
    const r = R();
    if (!r) return;
    if (r.result) { showEnd(); return; }
    if (r.pending && r.pending.kind === 'reward') { showReward(); return; }
    if (r.tickets.length && (useTicket || !r.ops.length || r.recruitNow)) { showRecruit(); return; }
    if (r.at) { enterNode(findNode(r.at)); return; }
    hidePanel();
  }

  // ---------- 모집 ----------
  function showRecruit() {
    const r = R(), tk = D.tickets[r.tickets[0]];
    const have = new Set(r.ops.map((o) => o.id));
    const cands = OPERATORS.filter((o) => ACCOUNT.owns(o.id) && !have.has(o.id) && (!tk.classes || tk.classes.includes(o.class)))
      .sort((a, b) => (b.rarity || 3) - (a.rarity || 3));
    const first = !r.ops.length;
    panel(`<div class="isp-head"><small>RECRUIT · 남은 모집권 ${r.tickets.length}장</small><b>${esc(tk.name)}</b></div>
      <p class="isp-text">${first ? '탐색을 함께할 오퍼레이터를 모집하세요. ' : ''}희망 <b>${r.hope}</b> 보유 · 모집한 오퍼레이터는 승진 전 상태로 합류합니다.</p>
      <div class="is-cands">${cands.map((o) => {
        const c = recruitCost(o), ok = r.hope >= c;
        return `<button class="is-cand ${ok ? '' : 'no'}" data-recruit="${esc(o.id)}" ${ok ? '' : 'disabled'}>${cardHTML(o, 'small')}<span class="cost">희망 ${c}</span></button>`;
      }).join('') || '<p class="empty-note">이 모집권으로 모집할 수 있는 보유 오퍼레이터가 없습니다.</p>'}</div>
      <div class="panel-btns">
        ${cands.length ? '' : '<button class="btn primary" data-recruit-swap>원석 덩어리 +3으로 바꾸기</button>'}
        <button class="btn" data-recruit-skip>모집 포기</button>
      </div>`, 'wide');
  }
  $('#is-panel').addEventListener('click', (e) => {
    const t = e.target, r = R();
    if (!r) return;
    const rc = t.closest('[data-recruit]');
    if (rc && !rc.disabled) {
      const def = OPS[rc.dataset.recruit], c = recruitCost(def);
      if (r.hope < c) return;
      r.hope -= c;
      r.ops.push({ id: def.id, promoted: false });
      r.tickets.shift();
      UI.say(def, 'obtain');
      sfx('select');
      afterTicket();
      return;
    }
    if (t.closest('[data-recruit-skip]')) { r.tickets.shift(); afterTicket(); return; }
    if (t.closest('[data-recruit-swap]')) { r.tickets.shift(); r.ingot += 3; afterTicket(); return; }
    const act = t.closest('[data-act]');
    if (act) onAct(act.dataset.act, act);
  });
  function afterTicket() {
    const r = R();
    if (!r.ops.length && !r.tickets.length) { r.tickets.push('all'); toast('최소 1명은 모집해야 탐색을 시작할 수 있습니다'); }
    if (!r.tickets.length) r.recruitNow = false;
    save();
    refresh();
    resumePanel();
  }

  // ---------- 노드 들어가기 ----------
  function enterNode(node) {
    if (!node) { R().at = null; hidePanel(); return; }
    if (['battle', 'emergency', 'gate', 'boss'].includes(node.type)) showBattle(node);
    else if (node.type === 'event') showEvent(node);
    else if (node.type === 'shop') showShop(node);
    else if (node.type === 'rest') showRest(node);
  }
  function finishNode(node) {
    const r = R(), m = r.map;
    m.cur = node.id;
    if (!m.done.includes(node.id)) m.done.push(node.id);
    r.at = null;
    // 층의 마지막 칸이면 다음 층으로
    if (colOf(node.id) === m.cols.length - 1) {
      if (r.floor >= D.floors.length - 1 || (D.battles[node.battle] && D.battles[node.battle].final)) { endRun(true); save(); resumePanel(); return; }
      r.floor++;
      r.map = genFloor(r.floor);
      toast(`${r.floor + 1}층 — ${D.floors[r.floor].name}`);
    }
    save();
    refresh();
    resumePanel();
  }

  // ---------- 작전 ----------
  function stageFor(node) {
    const r = R(), B = D.battles[node.battle], f = r.floor;
    const emer = node.type === 'emergency';
    const waves = [...B.waves, ...(emer ? B.extra || [] : [])];
    const scale = D.floorScale[f] * (emer ? D.emergencyScale : 1), em = enemyMods();
    const ids = new Set(waves.map((w) => w.enemy));
    for (const id of [...ids]) if (ENEMIES[id] && ENEMIES[id].summon) ids.add(ENEMIES[id].summon.enemy);
    const enemies = {};
    for (const id of ids) {
      const e = ENEMIES[id];
      if (!e) continue;
      enemies[id] = {
        ...e, hp: Math.round(e.hp * scale * em.hp), atk: Math.round(e.atk * scale * em.atk),
        def: Math.round(e.def * Math.min(1, 0.7 + 0.3 * scale) * em.def), speed: e.speed * em.speed,
      };
    }
    return {
      st: { code: `${f + 1}-${colOf(node.id) + 1}`, name: (emer ? '긴급 · ' : '') + B.name, map: B.map, waves, startDp: B.startDp, deployLimit: B.deployLimit, theme: 'sea' },
      enemies,
    };
  }
  function showBattle(node) {
    const r = R(), t = NODE[node.type], { st, enemies } = stageFor(node);
    panel(`<div class="isp-head t-${node.type}"><small>${t.en} · ${st.code}</small><b>${esc(st.name)}</b></div>
      ${node.type === 'emergency' ? '<p class="isp-text warn">긴급 작전: 적이 더 많고 강하지만, 보상으로 소장품을 고를 수 있습니다.</p>' : ''}
      ${node.type === 'boss' ? '<p class="isp-text warn">강력한 적이 기다리고 있습니다.</p>' : ''}
      <p class="isp-text">목숨 <b>${r.life}</b> · 분대 ${r.ops.length}명 · 배치 가능 인원 ${st.deployLimit + battleMods().deployLimit} · 시작 코스트 ${st.startDp + battleMods().startDp}</p>
      <div class="enemy-list is-enemies">${UI.enemyRowsHTML(st.waves, enemies)}</div>
      <div class="panel-btns">
        <button class="btn" data-act="map-preview">맵 보기</button>
        <button class="btn" data-act="squad">분대</button>
        <button class="btn" data-act="back">돌아가기</button>
        <button class="btn primary big" data-act="fight">작전 개시</button>
      </div>`, 'wide');
  }
  function startBattle(node) {
    const r = R();
    const defs = r.ops.map((o) => runDef(o)).filter(Boolean);
    if (!defs.length) { toast('분대에 오퍼레이터가 없습니다'); return; }
    const { st, enemies } = stageFor(node);
    hidePanel();
    sfx('select');
    window.Battle.begin(st, null, {
      defs, life: r.life, maxLife: r.life, enemies, mods: battleMods(),
      onEnd: (res) => battleEnd(node, res),
    });
  }
  function battleEnd(node, res) {
    const r = R();
    if (!res.win) {
      r.life = 0;
      endRun(false);
      save();
      return { text: res.quit ? '작전을 포기했습니다. 탐색이 종료됩니다.' : '목숨을 모두 잃었습니다. 탐색이 종료됩니다.', buttons: [{ label: '탐색 결과', cls: 'primary', fn: () => go('isrun') }] };
    }
    const lost = r.life - res.life;
    r.life = res.life;
    r.score.battles++;
    if (!res.leaked) r.score.perfect++;
    const f = r.floor, kind = node.type;
    const big = kind === 'gate' || kind === 'boss';
    if (kind === 'boss') r.score.bosses++;
    let ingot = [3, 4, 5, 6][f] + (res.leaked ? 0 : 2) + (big ? 3 : 0);
    if (kind === 'emergency') ingot = Math.round(ingot * 1.5);
    ingot = Math.round(ingot * (1 + sumFx('ingotRate')));
    const exp = kind === 'battle' ? 1 : kind === 'emergency' ? 2 : 3;
    const got = applyGain({ ingot, exp });
    const items = [];
    if (kind === 'emergency') items.push({ type: 'relic', choices: relicChoices(3) });
    if (kind === 'gate') items.push({ type: 'relic', choices: relicChoices(2) });
    if (kind === 'boss') items.push({ type: 'relic', choices: relicChoices(3, 'rare') });
    if (kind !== 'battle' || Math.random() < 0.6) items.push({ type: 'ticket', choices: shuffle(PAIRS).slice(0, 2) });
    r.pending = { kind: 'reward', node: node.id, got, lost, perfect: !res.leaked, items };
    save();
    return {
      text: `${lost ? `목숨 -${lost} · ` : ''}남은 목숨 ${r.life}`,
      buttons: [{ label: '보상 받기', cls: 'primary', fn: () => go('isrun') }],
    };
  }

  // ---------- 작전 보상 ----------
  function showReward() {
    const r = R(), p = r.pending;
    const items = p.items.map((it, i) => {
      if (it.taken != null) return `<div class="is-reward taken"><b>${it.type === 'relic' ? '소장품' : '모집권'}</b><span>${esc(it.takenText || '')}</span></div>`;
      if (it.type === 'relic') return `<div class="is-reward"><b>소장품 — 하나를 고르세요</b><div class="relic-grid">${it.choices.map((id) => relicHTML(relicById(id), `<button class="btn small primary" data-act="take-relic" data-i="${i}" data-id="${esc(id)}">획득</button>`)).join('')}</div></div>`;
      return `<div class="is-reward"><b>모집권 — 하나를 고르세요</b><div class="is-tickets">${it.choices.map((k) => `<button class="btn" data-act="take-ticket" data-i="${i}" data-id="${k}">${esc(D.tickets[k].name)}</button>`).join('')}</div></div>`;
    }).join('');
    panel(`<div class="isp-head"><small>REWARD</small><b>작전 보상${p.perfect ? ' <span class="perfect">완벽한 작전</span>' : ''}</b></div>
      <p class="isp-text">${p.got.map(esc).join(' · ')}</p>
      ${items}
      <div class="panel-btns"><button class="btn primary big" data-act="reward-done">탐색 계속</button></div>`, 'wide');
  }

  // ---------- 불온한 조우 ----------
  function showEvent(node) {
    const r = R(), ev = D.events.find((x) => x.id === node.event) || D.events[0];
    if (node.result) {
      panel(`<div class="isp-head t-event"><small>ENCOUNTER</small><b>${esc(ev.title)}</b></div>
        <p class="isp-text">${esc(node.result)}</p><p class="isp-text gain">${esc((node.resultGain || []).join(' · ') || '변화 없음')}</p>
        <div class="panel-btns"><button class="btn primary big" data-act="leave">계속</button></div>`);
      return;
    }
    panel(`<div class="isp-head t-event"><small>ENCOUNTER</small><b>${esc(ev.title)}</b></div>
      <p class="isp-text story">${esc(ev.text)}</p>
      <div class="is-choices">${ev.choices.map((c, i) => {
        const ok = canPay(c.cost);
        return `<button class="is-choice" data-act="choose" data-i="${i}" ${ok ? '' : 'disabled'}><b>${esc(c.label)}</b><span>${esc(c.desc || '')}</span>${ok ? '' : '<em>조건 부족</em>'}</button>`;
      }).join('')}</div>`);
  }
  function canPay(cost) {
    const r = R();
    if (!cost) return true;
    return (cost.ingot || 0) <= r.ingot && (cost.hope || 0) <= r.hope && (cost.life || 0) < r.life;
  }
  function pay(cost) {
    const r = R();
    if (!cost) return [];
    const out = [];
    if (cost.ingot) { r.ingot -= cost.ingot; out.push(`원석 덩어리 -${cost.ingot}`); }
    if (cost.hope) { r.hope -= cost.hope; out.push(`희망 -${cost.hope}`); }
    if (cost.life) { r.life -= cost.life; out.push(`목숨 -${cost.life}`); }
    return out;
  }

  // ---------- 교역소 ----------
  function showShop(node) {
    const r = R();
    if (!node.stock) {
      const relics = relicChoices(4);
      node.stock = [...relics.map((id) => ({ kind: 'relic', id, price: relicById(id).price })), { kind: 'ticket', price: 6 }, { kind: 'life', price: 5 }];
      save();
    }
    panel(`<div class="isp-head t-shop"><small>TRADER</small><b>교역소</b></div>
      <p class="isp-text">원석 덩어리 <b>${r.ingot}</b> 보유${sumFx('shopDiscount') ? ` · 할인 ${Math.round(Math.min(0.5, sumFx('shopDiscount')) * 100)}%` : ''}</p>
      <div class="is-shop">${node.stock.map((s, i) => {
        const price = shopPrice(s.price), ok = !s.sold && r.ingot >= price;
        const btn = s.sold ? '<button class="btn small" disabled>구매 완료</button>' : `<button class="btn small primary" data-act="buy" data-i="${i}" ${ok ? '' : 'disabled'}>◆ ${price}</button>`;
        if (s.kind === 'relic') return relicHTML(relicById(s.id), btn);
        if (s.kind === 'ticket') return `<div class="relic r-ticket"><div class="relic-no">모집</div><b>무작위 모집권</b><span>직군 모집권 1장</span>${btn}</div>`;
        return `<div class="relic r-life"><div class="relic-no">보급</div><b>응급 보급품</b><span>목숨 +2</span>${btn}</div>`;
      }).join('')}</div>
      <div class="panel-btns"><button class="btn" data-act="squad">분대</button><button class="btn primary big" data-act="leave">떠나기</button></div>`, 'wide');
  }

  // ---------- 안식처 ----------
  function showRest(node) {
    panel(`<div class="isp-head t-rest"><small>SAFEHOUSE</small><b>안식처</b></div>
      <p class="isp-text story">파도 소리가 멀게 들리는 동굴. 잠시 숨을 돌릴 수 있다. 하나를 고르세요.</p>
      <div class="is-choices">
        <button class="is-choice" data-act="rest" data-k="life"><b>휴식</b><span>목숨 +3</span></button>
        <button class="is-choice" data-act="rest" data-k="promote"><b>훈련</b><span>오퍼레이터 1명 무료 승진</span></button>
        <button class="is-choice" data-act="rest" data-k="hope"><b>정비</b><span>희망 +2</span></button>
      </div>`);
  }

  // ---------- 버튼 동작 ----------
  function onAct(act, el) {
    const r = R(), node = r.at && findNode(r.at);
    if (act === 'back') { r.at = null; save(); hidePanel(); refresh(); return; }
    if (act === 'fight') { startBattle(node); return; }
    if (act === 'squad') { openSquad(); return; }
    if (act === 'map-preview') { UI.openMap(stageFor(node).st); return; }
    if (act === 'leave') { finishNode(node); return; }
    if (act === 'choose') {
      const ev = D.events.find((x) => x.id === node.event), c = ev.choices[+el.dataset.i];
      if (!canPay(c.cost)) return;
      const paid = pay(c.cost);
      const ok = c.chance == null || Math.random() < c.chance;
      const got = applyGain(ok ? c.gain : c.fail);
      node.result = ok ? c.result : c.failResult || c.result;
      node.resultGain = [...paid, ...got];
      sfx(ok ? 'select' : 'hurt');
      if (r.life <= 0) { endRun(false); save(); resumePanel(); return; }
      if (r.tickets.length) r.recruitNow = true;
      save(); refresh(); showEvent(node);
      return;
    }
    if (act === 'buy') {
      const s = node.stock[+el.dataset.i], price = shopPrice(s.price);
      if (s.sold || r.ingot < price) return;
      r.ingot -= price;
      s.sold = true;
      const txt = s.kind === 'relic' ? addRelic(s.id) : applyGain(s.kind === 'ticket' ? { ticket: 1 } : { life: 2 }).join(', ');
      toast(txt);
      sfx('select');
      if (r.tickets.length) r.recruitNow = true;
      save(); refresh();
      if (r.recruitNow) showRecruit(); else showShop(node);
      return;
    }
    if (act === 'rest') {
      const k = el.dataset.k;
      toast(applyGain(k === 'life' ? { life: 3 } : k === 'hope' ? { hope: 2 } : { promote: 1 }).join(', '));
      finishNode(node);
      if (k === 'promote') openSquad();
      return;
    }
    if (act === 'take-relic' || act === 'take-ticket') {
      const it = r.pending.items[+el.dataset.i];
      if (it.taken != null) return;
      if (act === 'take-relic') { it.takenText = addRelic(el.dataset.id); }
      else { r.tickets.push(el.dataset.id); it.takenText = D.tickets[el.dataset.id].name; r.recruitNow = true; }
      it.taken = el.dataset.id;
      sfx('select');
      save(); refresh(); showReward();
      return;
    }
    if (act === 'reward-done') {
      const node2 = findNode(r.pending.node);
      r.pending = null;
      finishNode(node2);
      return;
    }
    if (act === 'end-ok') {
      P().is = null;
      save();
      hidePanel();
      go('is');
    }
  }

  // ---------- 분대 · 승진 ----------
  function openSquad() {
    const r = R();
    const rows = r.ops.map((o, i) => {
      const def = OPS[o.id];
      if (!def) return '';
      const d = runDef(o), skills = skillsOf(def), c = promoteCost(def);
      const free = r.freePromote > 0;
      return `<div class="is-op ${o.promoted ? 'promoted' : ''}">
        ${cardHTML(def, 'small')}
        <div class="is-op-meta">
          <b>${esc(def.name)} <small>${o.promoted ? '승진 완료' : '승진 전'}</small></b>
          <span>HP ${d.hp} · 공격 ${d.atk} · 방어 ${d.def} · 코스트 ${d.cost}</span>
          ${o.promoted ? `<div class="is-skills">${skills.map((s, k) => `<button class="btn small ${(o.skill ?? skills.length - 1) === k ? 'primary' : ''}" data-sq="skill" data-i="${i}" data-k="${k}" title="${esc(s.desc || '')}">S${k + 1} ${esc(s.name)}</button>`).join('')}</div>`
            : `<span class="muted">스킬: ${esc(skills[0] ? skills[0].name : '-')}</span>
               <button class="btn small primary" data-sq="promote" data-i="${i}" ${free || r.hope >= c ? '' : 'disabled'}>${free ? '무료 승진' : `승진 · 희망 ${c}`}</button>`}
        </div></div>`;
    }).join('');
    openModal(`<div class="modal-title">분대</div><div class="modal-sub">희망 ${r.hope}${r.freePromote ? ` · 무료 승진 ${r.freePromote}회` : ''} · 승진하면 모든 능력치와 재능, 고른 스킬을 씁니다</div>
      <div class="is-ops">${rows || '<p class="empty-note">아직 모집한 오퍼레이터가 없습니다.</p>'}</div>`);
    $('#modal-body').querySelectorAll('[data-sq]').forEach((b) => b.addEventListener('click', () => {
      const o = r.ops[+b.dataset.i], def = OPS[o.id];
      if (b.dataset.sq === 'promote') {
        if (r.freePromote > 0) r.freePromote--;
        else { const c = promoteCost(def); if (r.hope < c) return; r.hope -= c; }
        o.promoted = true;
        UI.say(def, 'promo');
        sfx('win');
      } else {
        o.skill = +b.dataset.k;
        sfx('select');
      }
      save();
      refresh();
      openSquad();
    }));
  }
  function openRelics() {
    const r = R();
    openModal(`<div class="modal-title">소장품</div><div class="modal-sub">${r.relics.length}개 보유</div>
      <div class="relic-grid">${r.relics.map((id) => relicHTML(relicById(id))).join('') || '<p class="empty-note">아직 소장품이 없습니다.</p>'}</div>`);
  }

  // ---------- 탐색 종료 ----------
  function endRun(win, abandoned) {
    const r = R();
    if (!r || r.result) return;
    const floors = r.floor + (win ? 1 : 0);
    const score = floors * 100 + r.score.battles * 20 + r.score.perfect * 10 + r.score.bosses * 150 + r.relics.length * 10 + (win ? 500 : 0);
    const lmd = score * 4;
    ACCOUNT.earn({ lmd });
    // 탐색에 참가한 오퍼레이터 신뢰도 상승
    const save2 = UI.save;
    save2.trust = save2.trust || {};
    for (const o of r.ops) save2.trust[o.id] = Math.min(200, (save2.trust[o.id] || 0) + 5 + floors * 3);
    const rc = rec();
    rc.best = Math.max(rc.best, score);
    if (win) rc.wins++;
    r.result = { win, abandoned: !!abandoned, score, lmd, floors };
    r.at = null;
    r.pending = null;
  }
  function showEnd() {
    const r = R(), x = r.result;
    const leader = r.ops[0] && OPS[r.ops[0].id];
    const vl = leader && UI.line(leader, x.win ? 'clear' : 'fail');
    panel(`<div class="isp-head ${x.win ? 't-win' : 't-lose'}"><small>${x.win ? 'EXPLORATION COMPLETE' : 'EXPLORATION ENDED'}</small><b>${x.win ? '탐색 완료' : x.abandoned ? '탐색 포기' : '탐색 실패'}</b></div>
      ${x.win ? `<p class="isp-text story">가라앉은 등대에 불이 켜졌다. 바다는 잠시 조용해졌다.</p>` : ''}
      <div class="is-score">
        <div><small>도달</small><b>${x.floors >= D.floors.length ? '완주' : `${Math.max(1, r.floor + 1)}층`}</b></div>
        <div><small>작전</small><b>${r.score.battles}</b></div>
        <div><small>완벽한 작전</small><b>${r.score.perfect}</b></div>
        <div><small>소장품</small><b>${r.relics.length}</b></div>
        <div><small>점수</small><b>${x.score}</b></div>
      </div>
      <p class="isp-text gain">용문폐 +${x.lmd} · 참가 오퍼레이터 신뢰도 상승</p>
      ${vl ? `<p class="isp-text voice">${esc(leader.name)} — “${esc(vl)}”</p>` : ''}
      <div class="panel-btns"><button class="btn primary big" data-act="end-ok">확인</button></div>`);
  }

  // 메인 화면 타일에 진행 상황 표시
  const homeRender = RENDER.home;
  const homeIS = () => {
    const r = R();
    $('#home-is').textContent = r ? (r.result ? '탐색 종료 · 결과 확인' : `탐색 중 · ${r.floor + 1}층 ${D.floors[r.floor].name}`) : D.title;
  };
  RENDER.home = (...a) => { homeRender(...a); homeIS(); };
  homeIS();
  ACCOUNT.on('player', homeIS);

  window.IS = { newRun, genFloor, runDef, stageFor, statFor, battleMods, enemyMods, applyGain, endRun, get run() { return R(); } };
})();
