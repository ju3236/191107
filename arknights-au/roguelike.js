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
  const R = () => { const r = P().is || null; if (r && r.v !== 2) fixRun(r); return r; };
  // 이전 버전 탐색 데이터 고치기 (임시 소장품 → 삭제, 새 자원 추가)
  function fixRun(r) {
    r.v = 2;
    r.freePromotes = r.freePromotes || Array(r.freePromote || 0).fill(null);
    delete r.freePromote;
    r.maxLife = r.maxLife ?? Math.max(r.life, D.start.life);
    r.shield = r.shield ?? 0;
    r.stacks = r.stacks || {};
    r.relics = (r.relics || []).filter((id) => relicById(id) && !relicById(id).na);
  }
  const save = () => ACCOUNT.save();
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rand(a.length)];
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = rand(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  // 소장품: is-relics.js(원작 목록). na가 있는 소장품은 이 AU에 없는 시스템이라 등장하지 않음
  const ALL_RELICS = typeof IS_RELICS !== 'undefined' ? IS_RELICS : [];
  const RELICS = ALL_RELICS.filter((x) => !x.na);
  const relicById = (id) => ALL_RELICS.find((r) => r.id === id);
  const RARITY = { common: '평범', rare: '진귀', special: '매우 진귀' };
  const BASE_SQUAD = 8, MAX_SQUAD = 13;
  const CLASS_NAME = (c) => (CLASSES[c] ? CLASSES[c].name : c);
  const isMelee = (def) => CLASSES[def.class] && CLASSES[def.class].tile === 'ground';
  const rec = () => (P().isRec = P().isRec || { runs: 0, wins: 0, best: 0, seen: [] });
  const PAIRS = ['vs', 'gs', 'dm', 'sc'];

  // ---------- 소장품·분대 효과 합산 ----------
  function fxList(r = R()) {
    const sq = D.squads.find((s) => s.id === r.squad);
    return [sq && sq.fx, ...r.relics.map((id) => relicById(id) && relicById(id).fx)].filter(Boolean);
  }
  const sumFx = (key, r = R()) => fxList(r).reduce((s, fx) => s + (typeof fx[key] === 'number' ? fx[key] : 0), 0);
  const hasFx = (key, r = R()) => fxList(r).find((fx) => fx[key]);
  const squadCap = (r = R()) => Math.min(MAX_SQUAD, BASE_SQUAD + sumFx('squadCap', r));
  const setCount = (set, r = R()) => r.relics.filter((id) => relicById(id) && relicById(id).set === set).length;
  // 소장품 효과가 이 오퍼레이터에게 해당하는지
  function fits(f, def, o) {
    if (f.classes && !f.classes.includes(def.class)) return false;
    if (f.range === 'melee' && !isMelee(def)) return false;
    if (f.range === 'ranged' && isMelee(def)) return false;
    if (f.rarity && !f.rarity.includes(def.rarity || 3)) return false;
    return true;
  }
  function condOk(c, r) {
    if (!c) return true;
    if (c === 'life1') return r.life === 1;
    if (c === 'lifeMax') return r.life >= r.maxLife;
    return true;
  }
  // 오퍼레이터 한 명에게 적용되는 능력치 합 (aspd는 원작처럼 공격 속도 수치, 100 = 2배)
  function statFor(def, r = R(), o = {}) {
    const m = { atk: 0, hp: 0, def: 0, aspd: 0, cost: 0, costMul: 0, redeploy: 0, res: 0, dodge: 0, artsDodge: 0, block: 0, spCost: 0, spInit: 0, defFlat: 0 };
    const addS = (st) => { for (const [k, v] of Object.entries(st || {})) m[k] = (m[k] || 0) + v; };
    const promotedN = r.ops.filter((x) => x.promoted).length;
    for (const fx of fxList(r)) {
      if (fx.stat && fits(fx, def, o) && condOk(fx.cond, r)) addS(fx.stat);
      if (fx.setBonus && condOk(fx.cond, r) && setCount(fx.setBonus.set, r) >= fx.setBonus.n) addS(fx.setBonus.stat);
      if (fx.promotedStat && o.promoted) addS(fx.promotedStat);
      if (fx.promotedCount && o.promoted) m.aspd += fx.promotedCount.aspd * Math.min(fx.promotedCount.max, promotedN);
      if (fx.promotedCountStat && o.promoted) for (const [k, v] of Object.entries(fx.promotedCountStat)) m[k] += v * Math.min(13, promotedN);
      if (fx.ingotAspd) m.aspd += fx.ingotAspd.aspd * Math.floor(r.ingot / fx.ingotAspd.per);
      if (fx.shieldHp && r.shield > 0) m.hp += fx.shieldHp;
      if (fx.floorPenalty) { const n = (r.stacks && r.stacks.floorPen) || 0; m.atk += fx.floorPenalty.v * n; m.hp += fx.floorPenalty.v * n; }
      if (fx.gyesim && o.promoted) { const n = (r.stacks && r.stacks.gyesim) || 0; m.atk += fx.gyesim.atk * n; m.redeploy -= fx.gyesim.redeploy * n; }
      if (fx.lowLife && r.life <= fx.lowLife.below) addS(fx.lowLife.stat);
    }
    const st = r.stacks || {};
    if (st.altar) { m.atk += 0.05 * st.altar; m.def += 0.05 * st.altar; }
    if (st.survivor && st.survivor.id === def.id) { m.atk += st.survivor.v; m.def += st.survivor.v; }
    return m;
  }
  // 전투 효과 합치기: 숫자는 더하고, 지속 시간·범위 같은 값은 큰 쪽을 씀
  const KEEP_MAX = new Set(['dur', 'r', 'after', 'min', 'max', 'below', 'cost', 'every', 'chance']);
  function mergeInto(m, b) {
    for (const [k, v] of Object.entries(b)) {
      if (k === 'perDeployed') { m.perDeployed = [...(m.perDeployed || []), v]; continue; }
      if (k === 'refund') { m.refund = [...(m.refund || []), ...v]; continue; }
      if (k === 'blockBuff') { const kk = v.min >= 3 ? 'blockBuff3' : 'blockBuff2'; m[kk] = m[kk] ? mergeObj(m[kk], v) : { ...v }; continue; }
      if (k === 'spTick') { m.spTick = m.spTick ? Math.min(m.spTick, v) : v; continue; }
      if (typeof v === 'number') m[k] = (m[k] || 0) + v;
      else if (typeof v === 'boolean') m[k] = m[k] || v;
      else if (v && typeof v === 'object' && !Array.isArray(v)) m[k] = m[k] ? mergeObj(m[k], v) : { ...v };
      else m[k] = v;
    }
  }
  function mergeObj(a, b) {
    const o = { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (typeof v === 'number' && typeof o[k] === 'number') o[k] = KEEP_MAX.has(k) ? (k === 'every' ? Math.min(o[k], v) : Math.max(o[k], v)) : o[k] + v;
      else if (Array.isArray(v)) o[k] = [...new Set([...(o[k] || []), ...v])];
      else if (v && typeof v === 'object') o[k] = mergeObj(o[k] || {}, v);
      else o[k] = v;
    }
    return o;
  }
  function battleMods(r = R()) {
    const m = { startDp: 0, deployLimit: 0, dpRate: 1, enemy: {} };
    for (const fx of fxList(r)) {
      if (fx.battle) mergeInto(m, fx.battle);
      if (fx.brandImmune) m.brandImmune = true;
      if (fx.ingotDp) m.startDp += Math.floor(r.ingot / fx.ingotDp);
      if (fx.squadDp) m.startDp += fx.squadDp.base + fx.squadDp.per * r.ops.filter((o) => OPS[o.id] && OPS[o.id].class === fx.squadDp.class).length;
    }
    return m;
  }
  function enemyMods(r = R()) {
    const e = battleMods(r).enemy, m = {};
    for (const k of ['hp', 'atk', 'def', 'speed']) m[k] = Math.max(0.3, 1 + (e[k] || 0));
    return m;
  }
  const shopPrice = (p) => Math.max(1, Math.round(p * (1 - Math.min(0.5, sumFx('shopDiscount')))));

  // 탐색용 오퍼레이터 정의: 랭크 상승 전에는 능력치가 낮고 1스킬만 씀
  function runDef(o, r = R()) {
    const base = OPS[o.id];
    if (!base) return null;
    const m = statFor(base, r, o), p = o.promoted ? 1 : D.unpromoted;
    const skills = skillsOf(base);
    let sk = o.promoted ? skills[o.skill ?? skills.length - 1] || skills[skills.length - 1] : skills[0];
    if (sk && (m.spCost || m.spInit)) sk = { ...sk, sp: Math.max(1, Math.round(sk.sp * (1 + m.spCost))), initSp: Math.min(sk.sp, (sk.initSp || 0) + m.spInit) };
    const gy = hasFx('gyesim', r);
    return {
      ...base,
      hp: Math.round(base.hp * p * Math.max(0.1, 1 + m.hp)), atk: Math.round(base.atk * p * Math.max(0.1, 1 + m.atk)),
      def: Math.round(base.def * p * Math.max(0, 1 + m.def) + m.defFlat), res: Math.min(95, (base.res || 0) + m.res),
      dodge: m.dodge, artsDodge: m.artsDodge, block: base.block + m.block,
      interval: base.interval / Math.max(0.1, 1 + m.aspd / 100),
      cost: Math.max(0, Math.round(base.cost * (1 + m.costMul)) + m.cost), redeploy: Math.max(5, base.redeploy * Math.max(0.1, 1 + m.redeploy)),
      skills: sk ? [sk] : [], skill: undefined, promoted: !!o.promoted,
      gyesimDp: gy && o.promoted ? gy.gyesim.dp * ((r.stacks && r.stacks.gyesim) || 0) : 0,
      talents: o.promoted ? base.talents : (base.talents || []).slice(0, 1),
    };
  }
  const hopeCost = (def) => D.hopeCost[def.rarity || 3] ?? 0;
  // 분대가 비어 있는데 희망이 모자라면 막히지 않도록 무료
  const recruitCost = (def, r = R()) => (!r.ops.length && r.hope < hopeCost(def) ? 0 : hopeCost(def));
  const promoteCost = (def) => D.promoteCost[def.rarity || 3] ?? 0;
  // 무료 랭크 상승: 직군 지정이 있으면 그 직군만
  const freeFor = (def, r = R()) => (r.freePromotes || []).findIndex((c) => !c || c === def.class);

  // ---------- 획득 처리 ----------
  function randomRelic(kind) {
    const r = R(), owned = new Set(r.relics);
    let pool = RELICS.filter((x) => !owned.has(x.id));
    if (kind === 'rare') pool = pool.filter((x) => x.rarity !== 'common');
    if (kind === 'special') pool = pool.filter((x) => x.rarity === 'special');
    if (!pool.length) pool = RELICS.filter((x) => !owned.has(x.id));
    if (!pool.length) return null;
    // 희귀도 확률: 평범 50% · 진귀 35% · 매우 진귀 15% (해당 희귀도가 남아 있을 때)
    const w = { common: 50, rare: 35, special: 15 };
    const have = Object.keys(w).filter((k) => pool.some((x) => x.rarity === k));
    let roll = Math.random() * have.reduce((t, k) => t + w[k], 0), rar = have[0];
    for (const k of have) { if ((roll -= w[k]) < 0) { rar = k; break; } }
    return pick(pool.filter((x) => x.rarity === rar));
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
    const f = x.fx;
    r.stacks = r.stacks || {};
    if (f.kingArmor) { r.shield += Math.max(0, r.life - 1); r.life = 1; extra.push('목표 HP가 실드로 전환'); }
    if (f.survivor) { const pickOp = pick(r.ops); r.stacks.survivor = { id: pickOp ? pickOp.id : null, v: f.survivor }; }
    if (f.squadCap) extra.push(`편성 가능 인원수 +${f.squadCap}`);
    return [`소장품 「${x.name}」`, ...extra].join(', ');
  }
  function addExp(n) {
    const r = R(), out = [];
    r.exp += n;
    while (r.level < D.levelExp.length && r.exp >= D.levelExp[r.level]) {
      r.level++;
      r.hope++;
      out.push(`지휘 레벨 ${r.level} (희망 +1)`);
      const k = hasFx('level10ingot', r);
      if (k && r.level === 10) { r.ingot += k.level10ingot; out.push(`오리지늄각뿔 +${k.level10ingot}`); }
    }
    return out;
  }
  // gain: { ingot, hope, life, maxLife, shield, exp, relic, ticket, promote, promoteClass, double } → 표시용 문구 목록
  function applyGain(g = {}) {
    const r = R(), out = [];
    const sign = (v) => (v > 0 ? '+' : '') + v;
    if (g.ingot) { r.ingot = Math.max(0, r.ingot + g.ingot); out.push(`오리지늄각뿔 ${sign(g.ingot)}`); }
    if (g.hope) { r.hope = Math.max(0, r.hope + g.hope); out.push(`희망 ${sign(g.hope)}`); }
    if (g.maxLife) { r.maxLife += g.maxLife; r.life += g.maxLife; out.push(`최대 목표 HP ${sign(g.maxLife)}`); }
    if (g.life) {
      const before = r.life;
      r.life = g.life > 0 ? Math.max(r.life, Math.min(r.maxLife, r.life + g.life)) : r.life + g.life;
      out.push(`목표 HP ${sign(r.life - before || g.life)}`);
    }
    if (g.shield) { r.shield = Math.max(0, r.shield + g.shield); out.push(`실드 ${sign(g.shield)}`); }
    if (g.exp) out.push(`지휘 경험치 +${g.exp}`, ...addExp(g.exp));
    if (g.ticket) { for (let i = 0; i < g.ticket; i++) r.tickets.push(pick(PAIRS)); out.push(`모집권 ${g.ticket}장`); }
    if (g.promote) { for (let i = 0; i < g.promote; i++) r.freePromotes.push(null); out.push(`무료 랭크 상승 ${g.promote}회`); }
    if (g.promoteClass) { r.freePromotes.push(g.promoteClass); out.push(`[${CLASS_NAME(g.promoteClass)}] 무료 랭크 상승`); }
    if (g.double) {
      const k = pick(['ingot', 'hope', 'shield']);
      r[k] *= 2;
      out.push(`${{ ingot: '오리지늄각뿔', hope: '희망', shield: '실드' }[k]} 2배`);
    }
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
      v: 2, squad: squadId, floor: 0, life: D.start.life, maxLife: D.start.life, shield: 0, ingot: D.start.ingot, hope: D.start.hope, exp: 0, level: 1,
      relics: [], ops: [], tickets: shuffle(PAIRS).slice(0, D.start.tickets), freePromotes: [], recruitNow: true, stacks: {}, lineup: null,
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
        <div class="is-rec"><span>탐색 <b>${rc.runs}</b>회</span><span>완주 <b>${rc.wins}</b>회</span><span>최고 점수 <b>${rc.best}</b></span><span>소장품 도감 <b>${rc.seen.length}</b>/${RELICS.length}</span></div>
      </div>
      <div class="is-actions">
        ${r ? `<div class="is-cur">진행 중 · ${r.floor + 1}층 ${esc(D.floors[r.floor].name)} · 목표 HP ${r.life} · 분대 ${r.ops.length}명</div>
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
  // 도감: 얻은 소장품은 설명까지, 이 AU에 없는 소장품은 이유와 함께 흐리게
  let dexTab = 'all';
  function openDex() {
    const seen = new Set(rec().seen);
    const list = ALL_RELICS.filter((x) => dexTab === 'all' || (dexTab === 'seen' ? seen.has(x.id) : dexTab === 'na' ? x.na : x.rarity === dexTab && !x.na));
    const tabs = [['all', '전체'], ['seen', '획득'], ['common', '평범'], ['rare', '진귀'], ['special', '매우 진귀'], ['na', '등장하지 않음']];
    openModal(`<div class="modal-title">소장품 도감</div><div class="modal-sub">획득 ${seen.size} / ${RELICS.length} · 원작 「쉐이의 기이한 계원」 소장품 ${ALL_RELICS.length}종</div>
      <div class="dex-tabs">${tabs.map(([k, n]) => `<button class="btn small ${dexTab === k ? 'primary' : ''}" data-dex="${k}">${n}</button>`).join('')}</div>
      <div class="relic-grid dex">${list.map((x) => (seen.has(x.id) || x.na ? relicHTML(x, '', true) : relicHTML(x, '', false, true))).join('') || '<p class="empty-note">없습니다.</p>'}</div>`);
    $('#modal-body').querySelectorAll('[data-dex]').forEach((b) => b.addEventListener('click', () => { dexTab = b.dataset.dex; openDex(); }));
  }
  function openHelp() {
    openModal(`<div class="modal-title">진행 방법</div><div class="modal-sub">통합전략</div>
      <div class="modal-text is-help">
        <p><b>분대</b>를 고르고 <b>모집권</b>으로 오퍼레이터를 모집해 탐색을 시작합니다. 모집에는 <b>희망</b>이 듭니다 (6성 ${D.hopeCost[6]}, 5성 ${D.hopeCost[5]}, 4성 ${D.hopeCost[4]}).</p>
        <p>모집한 오퍼레이터는 <b>랭크 상승 전</b>이라 능력치가 ${Math.round(D.unpromoted * 100)}%이고 1스킬과 1재능만 씁니다. 분대 화면에서 희망을 써서 <b>랭크 상승</b>하면 모든 능력치와 재능, 원하는 스킬을 쓸 수 있습니다.</p>
        <p>작전에 데려갈 수 있는 인원은 <b>편성 가능 인원수</b>(기본 ${BASE_SQUAD}명, 최대 ${MAX_SQUAD}명)까지입니다. 분대가 더 많으면 작전 전에 고릅니다.</p>
        <p>층 지도에서 길을 골라 나아갑니다. 작전·긴급 작전·불온한 조우·교역소·안식처가 있고, 층 끝에는 관문 작전이나 보스가 기다립니다.</p>
        <p>작전에서 적이 방어 지점을 돌파하면 탐색 전체의 <b>목표 HP</b>가 줄어듭니다. <b>실드</b>가 있으면 실드가 먼저 깎입니다. 목표 HP가 0이 되면 탐색이 끝납니다.</p>
        <p>작전 보상과 교역소에서 <b>소장품</b>을 모으면 분대가 강해집니다. <b>오리지늄각뿔</b>은 교역소의 화폐입니다. 소장품은 원작 「쉐이의 기이한 계원」 목록이며, 이 AU에 없는 시스템과 관련된 소장품은 등장하지 않습니다.</p>
        <p>바다의 <b>명흔</b> 위에 선 오퍼레이터는 방어력이 줄고 HP를 잃으며, 시본은 HP를 회복합니다. <b>신경 손상</b>이 가득 차면 오퍼레이터가 큰 피해를 입고 기절합니다.</p>
      </div>`);
  }
  // 소장품 카드 (그림 · 번호 · 희귀도 · 효과 원문 · 이 게임에서 다르게 적용되는 점)
  function relicHTML(x, extra = '', lore = false, hide = false) {
    if (!x) return '';
    if (hide) return `<div class="relic unknown">${x.image ? `<img class="relic-img" src="${esc(x.image)}" alt="">` : '<i class="relic-img"></i>'}<div class="relic-no">No.${String(x.no).padStart(3, '0')}</div><b>???</b><span>아직 얻지 못한 소장품</span></div>`;
    return `<div class="relic r-${x.na ? 'na' : x.rarity}">
      ${x.image ? `<img class="relic-img" src="${esc(x.image)}" alt="" loading="lazy">` : '<i class="relic-img"></i>'}
      <div class="relic-no">No.${String(x.no).padStart(3, '0')} · ${x.na ? '등장하지 않음' : esc(RARITY[x.rarity])}</div>
      <b>${esc(x.name)}</b><span>${esc(x.desc)}</span>
      ${x.note ? `<em class="relic-note">이 게임에서는: ${esc(x.note)}</em>` : ''}${x.na ? `<em class="relic-note">${esc(x.na)}</em>` : ''}
      ${lore && x.lore ? `<p class="relic-lore">${esc(x.lore)}</p>` : ''}${extra}</div>`;
  }

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
        <span class="ist-life" title="목표 HP">♥ <b>${r.life}</b><small>/${r.maxLife}</small></span>
        ${r.shield ? `<span class="ist-shield" title="실드">⛨ <b>${r.shield}</b></span>` : ''}
        <span class="ist-ingot" title="오리지늄각뿔">◆ <b>${r.ingot}</b></span>
        <span class="ist-hope" title="희망">✦ <b>${r.hope}</b></span>
        <span class="ist-lv" title="지휘 레벨">Lv.<b>${r.level}</b><small>${next ? `${r.exp}/${next}` : 'MAX'}</small></span>
      </div>`;
  }
  function renderBottom() {
    const r = R();
    $('#is-bottom').innerHTML = `
      <button class="btn" id="isb-squad">분대 <b>${r.ops.length}</b><small>/${squadCap()}</small>${r.freePromotes.length ? ` <span class="badge">랭크 상승 ${r.freePromotes.length}</span>` : ''}</button>
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
      <p class="isp-text">${first ? '탐색을 함께할 오퍼레이터를 모집하세요. ' : ''}희망 <b>${r.hope}</b> 보유 · 모집한 오퍼레이터는 랭크 상승 전 상태로 합류합니다.</p>
      <div class="is-cands">${cands.map((o) => {
        const c = recruitCost(o), ok = r.hope >= c;
        return `<button class="is-cand ${ok ? '' : 'no'}" data-recruit="${esc(o.id)}" ${ok ? '' : 'disabled'}>${cardHTML(o, 'small')}<span class="cost">희망 ${c}</span></button>`;
      }).join('') || '<p class="empty-note">이 모집권으로 모집할 수 있는 보유 오퍼레이터가 없습니다.</p>'}</div>
      <div class="panel-btns">
        ${cands.length ? '' : '<button class="btn primary" data-recruit-swap>오리지늄각뿔 +3으로 바꾸기</button>'}
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
      if (r.lineup && r.lineup.length < squadCap()) r.lineup.push(def.id);
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
      const fp = hasFx('floorPenalty', r);
      if (fp) r.stacks.floorPen = Math.min(fp.floorPenalty.max, (r.stacks.floorPen || 0) + 1);
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
      <p class="isp-text">목표 HP <b>${r.life}</b>${r.shield ? ` · 실드 ${r.shield}` : ''} · 편성 ${lineup().length}/${squadCap()}명 · 배치 가능 인원 ${st.deployLimit + battleMods().deployLimit} · 시작 코스트 ${st.startDp + battleMods().startDp}</p>
      ${r.ops.length > squadCap() ? `<div class="is-lineup"><b>편성 — 작전에 데려갈 오퍼레이터를 고르세요 (${lineup().length}/${squadCap()})</b><div>${r.ops.map((o) => {
        const d = OPS[o.id], on = lineup().includes(o.id);
        return d ? `<button class="btn small ${on ? 'primary' : ''}" data-act="lineup" data-id="${esc(o.id)}">${esc(d.name)}</button>` : '';
      }).join('')}</div></div>` : ''}
      <div class="enemy-list is-enemies">${UI.enemyRowsHTML(st.waves, enemies)}</div>
      <div class="panel-btns">
        <button class="btn" data-act="map-preview">맵 보기</button>
        <button class="btn" data-act="squad">분대</button>
        <button class="btn" data-act="back">돌아가기</button>
        <button class="btn primary big" data-act="fight">작전 개시</button>
      </div>`, 'wide');
  }
  // 이번 작전에 데려갈 오퍼레이터 (편성 가능 인원수까지)
  function lineup(r = R()) {
    const cap = squadCap(r), ids = r.ops.map((o) => o.id);
    // 직접 고른 적이 없으면 앞에서부터 자동 편성
    const l = r.lineup ? r.lineup.filter((id) => ids.includes(id)) : ids;
    return l.slice(0, cap);
  }
  function startBattle(node) {
    const r = R(), l = lineup();
    // 임연부: 층마다 첫 작전에 들어갈 때 모집권 1장
    if (hasFx('floorTicket') && r.floorTicketAt !== r.floor) { r.floorTicketAt = r.floor; r.tickets.push(pick(PAIRS)); r.recruitNow = true; toast('임연부 — 모집권 1장 획득'); }
    const defs = r.ops.filter((o) => l.includes(o.id)).map((o) => runDef(o)).filter(Boolean);
    if (!defs.length) { toast('분대에 오퍼레이터가 없습니다'); return; }
    const { st, enemies } = stageFor(node);
    hidePanel();
    sfx('select');
    window.Battle.begin(st, null, {
      defs, life: r.life, maxLife: r.life, shield: r.shield, enemies, mods: battleMods(),
      onEnd: (res) => battleEnd(node, res),
    });
  }
  function battleEnd(node, res) {
    const r = R();
    if (!res.win) {
      // 시간의 끝: 보스·관문이 아닌 작전에서 1회 실패해도 목표 HP 1로 계속
      if (hasFx('revive') && !r.revived && node.type !== 'boss' && node.type !== 'gate') {
        r.revived = true;
        r.life = 1;
        r.shield = res.shield;
        r.map.cur = node.id;
        if (!r.map.done.includes(node.id)) r.map.done.push(node.id);
        r.at = null;
        save();
        return { text: '「시간의 끝」 — 탐색을 계속합니다 (목표 HP 1)', buttons: [{ label: '탐색 계속', cls: 'primary', fn: () => { go('isrun'); finishNode(node); } }] };
      }
      r.life = 0;
      endRun(false);
      save();
      return { text: res.quit ? '작전을 포기했습니다. 탐색이 종료됩니다.' : '목표 HP를 모두 잃었습니다. 탐색이 종료됩니다.', buttons: [{ label: '탐색 결과', cls: 'primary', fn: () => go('isrun') }] };
    }
    const lost = r.life - res.life, lostShield = r.shield - res.shield;
    r.life = res.life;
    r.shield = res.shield;
    // 전투가 끝날 때마다 쌓이는 소장품
    r.stacks = r.stacks || {};
    const endLife = sumFx('endLife');
    if (endLife) r.life = Math.min(r.maxLife, r.life + endLife);
    if (hasFx('kingArmor')) r.shield += 1;
    const sv = hasFx('survivor');
    if (sv && r.stacks.survivor) r.stacks.survivor.v += sv.survivor;
    const al = hasFx('altar');
    if (al && Math.random() < al.altar.chance) r.stacks.altar = Math.min(al.altar.max, (r.stacks.altar || 0) + 1);
    r.score.battles++;
    if (!res.leaked) r.score.perfect++;
    const f = r.floor, kind = node.type;
    const big = kind === 'gate' || kind === 'boss';
    if (kind === 'boss') r.score.bosses++;
    let ingot = [3, 4, 5, 6][f] + (res.leaked ? 0 : 2) + (big ? 3 : 0);
    if (kind === 'emergency') ingot = Math.round(ingot * 1.5);
    ingot = Math.round(ingot * (1 + sumFx('ingotRate')));
    const exp = Math.round((kind === 'battle' ? 1 : kind === 'emergency' ? 2 : 3) * (1 + sumFx('expRate')) * 10) / 10;
    const got = applyGain({ ingot, exp });
    const items = [];
    const xr = sumFx('extraRelic'), xt = sumFx('extraTicket');
    if (kind === 'emergency') items.push({ type: 'relic', choices: relicChoices(3 + xr) });
    if (kind === 'gate') items.push({ type: 'relic', choices: relicChoices(2 + xr) });
    if (kind === 'boss') items.push({ type: 'relic', choices: relicChoices(3 + xr, 'rare') });
    if (kind !== 'battle' || Math.random() < 0.6) items.push({ type: 'ticket', choices: [...shuffle(PAIRS), 'all'].slice(0, 2 + xt) });
    r.pending = { kind: 'reward', node: node.id, got, lost, perfect: !res.leaked, items };
    save();
    return {
      text: `${lostShield ? `실드 -${lostShield} · ` : ''}${lost ? `목표 HP -${lost} · ` : ''}남은 목표 HP ${r.life}${r.shield ? ` · 실드 ${r.shield}` : ''}`,
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
    if (cost.ingot) { r.ingot -= cost.ingot; out.push(`오리지늄각뿔 -${cost.ingot}`); }
    if (cost.hope) { r.hope -= cost.hope; out.push(`희망 -${cost.hope}`); }
    if (cost.life) { r.life -= cost.life; out.push(`목표 HP -${cost.life}`); }
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
      <p class="isp-text">오리지늄각뿔 <b>${r.ingot}</b> 보유${sumFx('shopDiscount') ? ` · 할인 ${Math.round(Math.min(0.5, sumFx('shopDiscount')) * 100)}%` : ''}</p>
      <div class="is-shop">${node.stock.map((s, i) => {
        const price = shopPrice(s.price), ok = !s.sold && r.ingot >= price;
        const btn = s.sold ? '<button class="btn small" disabled>구매 완료</button>' : `<button class="btn small primary" data-act="buy" data-i="${i}" ${ok ? '' : 'disabled'}>◆ ${price}</button>`;
        if (s.kind === 'relic') return relicHTML(relicById(s.id), btn);
        if (s.kind === 'ticket') return `<div class="relic r-ticket"><i class="relic-img"></i><div class="relic-no">모집</div><b>무작위 모집권</b><span>직군 모집권 1장</span>${btn}</div>`;
        return `<div class="relic r-life"><i class="relic-img"></i><div class="relic-no">보급</div><b>응급 보급품</b><span>목표 HP +2</span>${btn}</div>`;
      }).join('')}</div>
      <div class="panel-btns"><button class="btn" data-act="squad">분대</button><button class="btn primary big" data-act="leave">떠나기</button></div>`, 'wide');
  }

  // ---------- 안식처 ----------
  function showRest(node) {
    panel(`<div class="isp-head t-rest"><small>SAFEHOUSE</small><b>안식처</b></div>
      <p class="isp-text story">파도 소리가 멀게 들리는 동굴. 잠시 숨을 돌릴 수 있다. 하나를 고르세요.</p>
      <div class="is-choices">
        <button class="is-choice" data-act="rest" data-k="life"><b>휴식</b><span>목표 HP +3</span></button>
        <button class="is-choice" data-act="rest" data-k="promote"><b>훈련</b><span>오퍼레이터 1명 무료 랭크 상승</span></button>
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
    if (act === 'lineup') {
      const id = el.dataset.id, l = lineup();
      if (l.includes(id)) r.lineup = l.filter((x) => x !== id);
      else if (l.length < squadCap()) r.lineup = [...l, id];
      else { toast(`편성 가능 인원수는 ${squadCap()}명입니다`); return; }
      save(); showBattle(node);
      return;
    }
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

  // ---------- 분대 · 랭크 상승 ----------
  function openSquad() {
    const r = R();
    const rows = r.ops.map((o, i) => {
      const def = OPS[o.id];
      if (!def) return '';
      const d = runDef(o), skills = skillsOf(def), c = promoteCost(def);
      const free = freeFor(def) >= 0;
      return `<div class="is-op ${o.promoted ? 'promoted' : ''}">
        ${cardHTML(def, 'small')}
        <div class="is-op-meta">
          <b>${esc(def.name)} <small>${o.promoted ? '랭크 상승 완료' : '랭크 상승 전'}</small></b>
          <span>HP ${d.hp} · 공격 ${d.atk} · 방어 ${d.def} · 코스트 ${d.cost}</span>
          ${o.promoted ? `<div class="is-skills">${skills.map((s, k) => `<button class="btn small ${(o.skill ?? skills.length - 1) === k ? 'primary' : ''}" data-sq="skill" data-i="${i}" data-k="${k}" title="${esc(s.desc || '')}">S${k + 1} ${esc(s.name)}</button>`).join('')}</div>`
            : `<span class="muted">스킬: ${esc(skills[0] ? skills[0].name : '-')}</span>
               <button class="btn small primary" data-sq="promote" data-i="${i}" ${free || r.hope >= c ? '' : 'disabled'}>${free ? '무료 랭크 상승' : `랭크 상승 · 희망 ${c}`}</button>`}
        </div></div>`;
    }).join('');
    const fp = r.freePromotes.map((c) => (c ? CLASS_NAME(c) : '아무나')).join(', ');
    openModal(`<div class="modal-title">분대</div><div class="modal-sub">${r.ops.length}명 · 편성 가능 인원수 ${squadCap()} · 희망 ${r.hope}${fp ? ` · 무료 랭크 상승: ${fp}` : ''} · 랭크 상승하면 모든 능력치와 재능, 고른 스킬을 씁니다</div>
      <div class="is-ops">${rows || '<p class="empty-note">아직 모집한 오퍼레이터가 없습니다.</p>'}</div>`);
    $('#modal-body').querySelectorAll('[data-sq]').forEach((b) => b.addEventListener('click', () => {
      const o = r.ops[+b.dataset.i], def = OPS[o.id];
      if (b.dataset.sq === 'promote') {
        const fi = freeFor(def);
        if (fi >= 0) r.freePromotes.splice(fi, 1);
        else { const c = promoteCost(def); if (r.hope < c) return; r.hope -= c; }
        o.promoted = true;
        // 계심청령: 획득 후 랭크 상승할 때마다 중첩
        const gy = hasFx('gyesim');
        if (gy) { r.stacks = r.stacks || {}; r.stacks.gyesim = Math.min(gy.gyesim.max, (r.stacks.gyesim || 0) + 1); }
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
      <div class="relic-grid">${r.relics.map((id) => relicHTML(relicById(id), '', true)).join('') || '<p class="empty-note">아직 소장품이 없습니다.</p>'}</div>`);
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
