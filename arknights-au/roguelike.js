'use strict';
// =====================================================================
//  통합전략 — 탐색 진행. 규칙은 원작 「미즈키 & 카이룰라 아버」를 따릅니다.
//  난이도 · 분대 · 초기 모집 · 출발 전 준비 → 층 지도(작전 · 긴급 작전 · 우연한 만남 · 교활한 상인 · 안전한 곳 ·
//  자욱한 안개 · 소원성취 · 흥미진진 · 풍운제회 · 긴급 수송 · 지역 의뢰) · 등불 · 주사위 · 열쇠 · 거부반응 · 계시 · 메아리
//  데이터: is-data.js(IS_DATA: 층 · 작전 · 모집권), is-ro2.js(IS_RO2: 원작 시스템), is-relics.js(소장품)
//  진행 중인 탐색은 플레이어 데이터의 is에 저장됩니다.
// =====================================================================
(() => {
  const D = IS_DATA, X2 = IS_RO2;
  const $ = (s) => document.querySelector(s);
  const { esc, toast, go, openModal, closeModal, cardHTML, RENDER, OPS } = UI;
  const sfx = (n) => window.SFX && SFX.play(n);
  const P = () => ACCOUNT.player;
  const R = () => { const r = P().is || null; if (r && r.v !== 4) fixRun(r); return r; };
  const save = () => ACCOUNT.save();
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rand(a.length)];
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = rand(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  // 소장품: is-relics.js(원작 목록) + 원작 조우 전용 소장품(is-ro2.js). na가 있으면 이 AU에 없는 시스템이라 등장하지 않음
  const ALL_RELICS = [...(typeof IS_RELICS !== 'undefined' ? IS_RELICS : []), ...X2.relics];
  const RELICS = ALL_RELICS.filter((x) => !x.na && x.pool !== false);
  const relicById = (id) => ALL_RELICS.find((r) => r.id === id);
  const RARITY = { common: '평범', rare: '진귀', special: '매우 진귀', curse: '저주받은 고물' };
  const MAX_SQUAD = 13;
  const isMelee = (def) => CLASSES[def.class] && (def.tile || CLASSES[def.class].tile) === 'ground';
  const rec = () => {
    const x = (P().isRec = P().isRec || { runs: 0, wins: 0, best: 0, seen: [] });
    x.unlock = x.unlock || {}; x.diffMax = x.diffMax ?? -1; x.ingot = x.ingot || 0; x.exp = x.exp || 0; x.bank = x.bank || 0;
    return x;
  };
  const CLASS_IDS = ['vanguard', 'guard', 'defender', 'sniper', 'caster', 'medic', 'supporter', 'specialist'];
  const DEEP = 2;   // 이 층(0부터)부터 「심해」 — 원작의 심해 진입(제4구역)에 해당

  // 이전 버전 탐색 데이터 고치기
  function fixRun(r) {
    r.v = 4;
    r.tickets = (r.tickets || []).map((k) => (D.tickets[k] ? k : 'all'));
    if (r.pending && r.pending.items) for (const it of r.pending.items) if (it.type === 'ticket') it.choices = it.choices.map((k) => (D.tickets[k] ? k : 'all'));
    r.freePromotes = r.freePromotes || [];
    r.maxLife = r.maxLife ?? Math.max(r.life, D.start.life);
    r.shield = r.shield ?? 0;
    r.stacks = r.stacks || {};
    r.relics = (r.relics || []).filter((id) => relicById(id) && !relicById(id).na);
    r.squadBonus = r.squadBonus || 0;
    r.band = r.band || 'band_1';
    r.diff = r.diff || 'n0';
    r.key = r.key || 0; r.dice = r.dice ?? D.start.dice; r.light = r.light ?? D.start.light;
    r.virtues = r.virtues || []; r.flags = r.flags || {}; r.away = r.away || []; r.stat = r.stat || {};
    // 예전 조우 이벤트는 원작 조우로 바뀜
    if (r.map) for (const n of r.map.cols.flat()) if (n.type === 'event' && !X2.events.find((e) => e.id === n.event)) { n.event = pick(X2.events).id; n.result = null; n.scene = null; }
  }

  // ---------- 난이도 (원작 일렁이는 파도 0~18 · 고요한 바다) ----------
  const diffOf = (r = R()) => X2.diffs.find((x) => x.id === r.diff) || X2.diffs[1];
  const gradeOf = (r = R()) => diffOf(r).grade;
  // 새 구역에 들어갈 때마다 적 공격력 · HP 추가 증가 (원작 addDesc)
  function zoneAdd(g) {
    if (g <= 0) return { atk: 0, hp: 0 };
    if (g <= 15) return { atk: g / 100, hp: g / 100 };
    return g === 16 ? { atk: 0.2, hp: 0.2 } : g === 17 ? { atk: 0.2, hp: 0.25 } : { atk: 0.2, hp: 0.3 };
  }
  // 난이도 규칙을 소장품과 같은 형식의 효과로 (등급 이하 규칙이 모두 누적)
  function diffFx(r = R()) {
    const g = gradeOf(r), e = {}, b = { enemy: e };
    if (g < 0) return null;   // 고요한 바다: 시작 시 「사일런트 스쿼드」 소장품
    const za = zoneAdd(g), f = r.floor;
    e.hp = za.hp * f + (f >= DEEP ? 0.1 : 0); e.atk = za.atk * f + (f >= DEEP ? 0.1 : 0);   // 0등급: 심해 진입 시 더욱 가혹한 시련
    b.neuralMul = (g >= 1 ? 0.15 : 0) + (g >= 8 ? 0.15 : 0) + (g >= 13 ? 0.15 : 0);
    e.res = (g >= 3 ? 10 : 0) + (g >= 12 ? 10 : 0);
    if (g >= 5) { e.bossAtk = 0.15; e.bossDef = 0.15; }
    if (g >= 7) e.speed = 0.15;
    if (g >= 9) e.aspd = 15;
    if (g >= 11) e.eliteHp = 0.2;
    if (g >= 14) b.deployLimit = -1;
    if (g >= 15) { e.eliteHp = (e.eliteHp || 0) + 0.2; e.eliteAtk = 0.2; e.eliteDef = 0.2; }
    if (g >= 18) b.eliteRush = { dur: 20, cut: 0.5, atk: 0.3 };
    return { battle: b };
  }
  const diffUnlocked = (x) => x.grade <= Math.max(0, rec().diffMax + 1);

  // ---------- 분대 (원작) ----------
  const bandOf = (r = R()) => X2.bands.find((b) => b.id === r.band) || X2.bands[0];
  function bandUnlocked(b) {
    if (!b.lock) return true;
    if (b.lock === 'ingot200') return rec().ingot >= 200;
    if (b.lock === 'exp1000') return rec().exp >= 1000;
    return !!rec().unlock[b.lock];
  }

  // ---------- 소장품 · 분대 · 계시 · 메아리 · 난이도 효과 합산 ----------
  const virtueFx = (id) => ({
    virtue_5: { stat: { dodge: 0.35, artsDodge: 0.35 }, range: 'melee' },
    virtue_6: { stat: { defFlat: 300, res: 30 }, range: 'ranged' },
    virtue_1: { battle: { anger: { dur: 30, atk: 0.3, speed: 0.3 } } },
    virtue_2: { battle: { spBoost: 2 } },
    virtue_4: { battle: { lowHeal: 50 } },
  }[id]);
  const variationFx = (id) => ({
    variation_2: { stat: { aspd: 50 }, battle: { healMul: -0.7, enemy: { nonBossAspd: 50 } } },
    variation_5: { battle: { enemy: { res: 15 } } },
    variation_6: { expRate: 0.5, battle: { enemy: { def: 0.5 } } },
  }[id]);
  function fxList(r = R()) {
    const out = [bandOf(r).fx, ...r.relics.map((id) => relicById(id) && relicById(id).fx), ...(r.virtues || []).map(virtueFx), diffFx(r)];
    if (r.vari) out.push(variationFx(r.vari));
    if (r.task && r.task.arg && r.task.kind === 'battles' && !r.task.done) out.push(r.task.arg.deploy ? { battle: { deployLimit: r.task.arg.deploy } } : { battle: { enemy: { hp: r.task.arg.enemy, atk: r.task.arg.enemy } } });
    return out.filter(Boolean);
  }
  const sumFx = (key, r = R()) => fxList(r).reduce((s, fx) => s + (typeof fx[key] === 'number' ? fx[key] : 0), 0);
  const hasFx = (key, r = R()) => fxList(r).find((fx) => fx[key]);
  const squadCap = (r = R()) => Math.min(MAX_SQUAD, D.start.squad + sumFx('squadCap', r) + (r.squadBonus || 0));
  const setCount = (set, r = R()) => r.relics.filter((id) => relicById(id) && relicById(id).set === set).length;
  function fits(f, def) {
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
      if (fx.stat && fits(fx, def) && condOk(fx.cond, r)) addS(fx.stat);
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
  const shopPrice = (p) => Math.max(1, Math.round(p * (1 - Math.min(0.5, sumFx('shopDiscount')))));

  // ---------- 원작 랭크 상승 규칙 ----------
  // 계정 육성 상태를 따르되, 랭크 상승 전에는 1차 정예화(스킬 레벨 7, 특화 없음)까지만 적용.
  // 임시 모집 오퍼레이터는 계정과 관계없이 정해진 상태(D.tempProg)로 합류
  const maxElite = (def) => ((def.rarity || 3) >= 4 ? 2 : (def.rarity || 3) === 3 ? 1 : 0);
  function progFor(o) {
    if (o.temp) return { ...D.tempProg[o.promoted ? 1 : 0] };
    const p = TRAIN.prog(o.id);
    if (o.promoted) return p;
    return p.elite >= 2 ? { elite: 1, level: TRAIN.maxLevel(1), slv: Math.min(7, p.slv), mst: [0, 0, 0] } : { ...p, mst: [0, 0, 0] };
  }
  const isAway = (id, r = R()) => (r.away || []).some((a) => a.id === id);
  // 랭크 상승 가능 여부: 4성 이상이고, 임시 모집이 아니면 계정에서 2차 정예화를 마쳐야 함
  function canRankUp(o) {
    const def = OPS[o.id];
    if (!def || o.promoted) return { ok: false };
    if (isAway(o.id)) return { ok: false, why: '긴급 수송에 파견 중' };
    if (maxElite(def) < 2) return { ok: false, why: '3성 이하 오퍼레이터는 랭크 상승할 수 없습니다' };
    if (!o.temp && TRAIN.prog(o.id).elite < 2) return { ok: false, why: '계정에서 2차 정예화를 마쳐야 랭크 상승할 수 있습니다' };
    return { ok: true };
  }
  const eliteText = (p) => `${p.elite}정 Lv.${p.level}`;
  // 거부반응: 기본 4종 (조혈 장애 · 주의력 상실 · 신경 쇠퇴 · 생체 변이), 17등급부터 조합 거부반응
  const MUT = {
    mutation_1: { drain: 1 }, mutation_2: { auto: 1 }, mutation_3: { freeze: 1 }, mutation_4: { weak: 1 },
    mutation_13: { auto: 1, freeze: 1 }, mutation_14: { drain: 1, freeze: 1 }, mutation_15: { weak: 1, freeze: 1 },
    mutation_16: { auto: 1, drain: 1 }, mutation_17: { auto: 1, weak: 1 }, mutation_18: { drain: 1, weak: 1 },
  };
  const mutInfo = (id) => X2.mutations.find((m) => m.id === id);
  // 탐색용 오퍼레이터 정의 (육성 상태 + 분대·소장품·거부반응 효과)
  function runDef(o, r = R()) {
    const raw = OPS[o.id];
    if (!raw) return null;
    const base = TRAIN.trained(raw, progFor(o));
    const m = statFor(base, r, o);
    const skills = base.skills || [];
    const mu = !o.evo && o.mut ? MUT[o.mut] || {} : {};
    let sk = skills[Math.min(o.skill ?? skills.length - 1, skills.length - 1)];
    if (sk && (m.spCost || m.spInit)) sk = { ...sk, sp: Math.max(1, Math.round(sk.sp * (1 + m.spCost))), initSp: Math.max(0, Math.min(sk.sp, (sk.initSp || 0) + m.spInit)) };
    if (sk && mu.auto) sk = { ...sk, trigger: 'auto' };
    const w = mu.weak ? 0.5 : 1;
    const gy = hasFx('gyesim', r);
    return {
      ...base,
      hp: Math.round(base.hp * w * Math.max(0.1, 1 + m.hp)), atk: Math.round(base.atk * w * Math.max(0.1, 1 + m.atk)),
      def: Math.round(base.def * w * Math.max(0, 1 + m.def) + m.defFlat), res: Math.min(95, (base.res || 0) + m.res),
      dodge: m.dodge, artsDodge: m.artsDodge, block: base.block + m.block,
      interval: base.interval / Math.max(0.1, 1 + m.aspd / 100),
      cost: Math.max(0, Math.round(base.cost * w * (1 + m.costMul)) + m.cost), redeploy: Math.max(5, base.redeploy * w * Math.max(0.1, 1 + m.redeploy)),
      skills: sk ? [sk] : [], skill: undefined, promoted: !!o.promoted,
      gyesimDp: gy && o.promoted ? gy.gyesim.dp * ((r.stacks && r.stacks.gyesim) || 0) : 0,
      mut: Object.keys(mu).length ? mu : null, evo: !!o.evo,
    };
  }
  // 희망: 원작 비용 + 분대 · 난이도 보정
  function hopeCost(def, r = R()) {
    let c = D.hopeCost[def.rarity || 3] ?? 0;
    const hc = hasFx('hopeCut', r);
    if (hc && (def.rarity || 3) >= 4 && hc.hopeCut.classes.includes(def.class)) c -= hc.hopeCut.recruit;
    c -= sumFx('hopeCutAll', r);
    if (gradeOf(r) >= 4 && (def.rarity || 3) >= 3) c += 1;
    return Math.max(0, c);
  }
  const recruitCost = (def, r = R(), temp = false) => (temp ? 0 : !r.ops.length && r.hope < hopeCost(def, r) ? 0 : hopeCost(def, r));
  function promoteCost(def, r = R()) {
    let c = D.promoteCost[def.rarity || 3] ?? 0;
    const hc = hasFx('hopeCut', r);
    if (hc && (def.rarity || 3) >= 4 && hc.hopeCut.classes.includes(def.class)) c -= hc.hopeCut.promote;
    return Math.max(0, c);
  }
  // 쓸 수 있는 랭크 상승권: 직군 랭크 상승권 > 임시 물자배급권(5성 이하) > 고급 물자배급권 순
  function freeFor(def, r = R()) {
    const t = r.freePromotes || [];
    let i = t.indexOf(def.class);
    if (i < 0 && (def.rarity || 3) <= 5) i = t.indexOf('star5');
    if (i < 0) i = t.findIndex((k) => !k || k === 'all');
    return i;
  }

  // ---------- 무작위 모집권 ----------
  function randTicket(good) {
    const c = pick(CLASS_IDS), x = Math.random();
    if (good && x < 0.25) return c + '_vip';
    if (good && x < 0.6) return c + '_sp';
    if (x < 0.15) return pick(['d_assault', 'd_defense', 'd_ranged', 'd_destroy']);
    if (x < 0.2) return pick(['q_melee', 'q_ranged']);
    return c;
  }

  // ---------- 획득 처리 ----------
  function randomRelic(kind) {
    const r = R(), owned = new Set(r.relics);
    if (kind === 'curse') { const c = X2.relics.filter((x) => x.rarity === 'curse' && !owned.has(x.id) && !/curse_(8|9|10)$/.test(x.id)); return c.length ? pick(c) : null; }
    let pool = RELICS.filter((x) => !owned.has(x.id));
    if (kind && kind.startsWith('set:')) { const s = pool.filter((x) => x.set === kind.slice(4)); if (s.length) return pick(s); }
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
    return [`${x.rarity === 'curse' ? '저주받은 고물' : '소장품'} 「${x.name}」`, ...extra].join(', ');
  }
  function addExp(n) {
    const r = R(), out = [];
    r.exp += n;
    rec().exp += n * 10;
    while (r.level < D.levels.length && r.exp >= D.levels[r.level].exp) {
      const L = D.levels[r.level];
      r.level++;
      const parts = [];
      if (L.hope) { r.hope += L.hope; parts.push(`희망 +${L.hope}`); }
      if (L.squad) { r.squadBonus = (r.squadBonus || 0) + L.squad; parts.push(`편성 가능 인원수 +${L.squad}`); }
      if (L.maxLife) { r.maxLife += L.maxLife; r.life += L.maxLife; parts.push(`최대 목표 HP +${L.maxLife}`); }
      out.push(`지휘 레벨 ${r.level}${parts.length ? ` (${parts.join(', ')})` : ''}`);
      const k = hasFx('level10ingot', r);
      if (k && r.level === 10) { r.ingot += k.level10ingot; out.push(`오리지늄각뿔 +${k.level10ingot}`); }
    }
    return out;
  }
  // 등불: 0~100. 100 <밝음> · 50~99 <흔들림> · 1~49 <희미함> · 0 <꺼짐>
  const lightState = (v = R().light) => (v >= 100 ? 0 : v >= 50 ? 1 : v >= 1 ? 2 : 3);
  const LIGHT_NAME = ['밝음', '흔들림', '희미함', '꺼짐'];
  function addLight(n) {
    const r = R(), before = r.light;
    r.light = Math.max(0, Math.min(100, r.light + n));
    if (n > 0) track('light', r.light - before);
    return r.light - before;
  }
  // gain → 표시용 문구 목록
  function applyGain(g = {}) {
    const r = R(), out = [];
    if (!g) return out;
    const sign = (v) => (v > 0 ? '+' : '') + v;
    if (g.ingot) { r.ingot = Math.max(0, r.ingot + g.ingot); if (g.ingot > 0) { rec().ingot += g.ingot; r.zoneIngot = (r.zoneIngot || 0) + g.ingot; } out.push(`오리지늄각뿔 ${sign(g.ingot)}`); }
    if (g.hope) { r.hope = Math.max(0, r.hope + g.hope); out.push(`희망 ${sign(g.hope)}`); }
    // 전투 밖에서는 목표 HP가 1 아래로 내려가지 않음 (소장품 · 조우로 탐색이 끝나지 않도록)
    if (g.maxLife) { r.maxLife = Math.max(1, r.maxLife + g.maxLife); r.life = Math.max(1, Math.min(r.maxLife, r.life + g.maxLife)); out.push(`최대 목표 HP ${sign(g.maxLife)}`); }
    if (g.life) {
      const before = r.life;
      r.life = g.life > 0 ? Math.max(r.life, Math.min(r.maxLife, r.life + g.life)) : Math.max(Math.min(1, r.life), r.life + g.life);
      out.push(`목표 HP ${sign(r.life - before || g.life)}`);
    }
    if (g.shield) { r.shield = Math.max(0, r.shield + g.shield); out.push(`실드 ${sign(g.shield)}`); }
    if (g.key) { r.key = Math.max(0, r.key + g.key); out.push(`열쇠 ${sign(g.key)}`); }
    if (g.dice) { r.dice = Math.max(0, r.dice + g.dice); out.push(`주사위 ${sign(g.dice)}`); }
    if (g.light) { const d = addLight(g.light); out.push(d ? `등불 ${sign(d)}` : `등불 ${sign(g.light)} (등불은 0~100)`); }
    if (g.exp) out.push(`지휘 경험치 +${g.exp}`, ...addExp(g.exp));
    if (g.ticket) {
      const n = typeof g.ticket === 'number' ? g.ticket : 1;
      for (let i = 0; i < n; i++) {
        const k = g.ticket === 'double' ? pick(['d_assault', 'd_defense', 'd_ranged', 'd_destroy']) : typeof g.ticket === 'string' && D.tickets[g.ticket] ? g.ticket : randTicket();
        r.tickets.push(k); r.recruitNow = true; out.push(D.tickets[k].name);
      }
    }
    if (g.promote) { for (let i = 0; i < g.promote; i++) r.freePromotes.push('all'); out.push(`${D.upgradeName('all')} ${g.promote}장`); }
    if (g.upgrade) { r.freePromotes.push(g.upgrade); out.push(D.upgradeName(g.upgrade)); }
    if (g.promoteClass) { r.freePromotes.push(g.promoteClass); out.push(D.upgradeName(g.promoteClass)); }
    if (g.double) {
      const k = pick(['ingot', 'hope', 'shield']);
      r[k] *= 2;
      out.push(`${{ ingot: '오리지늄각뿔', hope: '희망', shield: '실드' }[k]} 2배`);
    }
    if (g.flag) r.flags[g.flag] = true;
    if (g.relic) {
      const n = typeof g.relic === 'number' ? g.relic : 1;
      for (let i = 0; i < n; i++) {
        const x = typeof g.relic === 'string' && relicById(g.relic) ? relicById(g.relic) : randomRelic(typeof g.relic === 'string' ? g.relic : null);
        if (x) out.push(addRelic(x.id));
      }
    }
    if (g.curse) for (let i = 0; i < g.curse; i++) { const x = randomRelic('curse'); if (x) out.push(addRelic(x.id)); }
    if (g.virtue) for (let i = 0; i < g.virtue; i++) out.push(addVirtue());
    if (g.mutate) for (let i = 0; i < g.mutate; i++) out.push(mutate());
    if (g.purify) { r.purify = (r.purify || 0) + g.purify; out.push(`거부반응 억제 ${g.purify}회`); }
    return out.filter(Boolean);
  }
  // 계시: 원작 7종 중 아직 없는 것 (관대함은 즉시 소장품 2개)
  function addVirtue() {
    const r = R(), have = new Set(r.virtues), pool = X2.virtues.filter((v) => !have.has(v.id));
    if (!pool.length) return '';
    const v = pick(pool);
    r.virtues.push(v.id);
    if (v.id === 'virtue_7') return [`계시 「${v.inner}」`, ...applyGain({ relic: 2 })].join(', ');
    return `계시 「${v.inner}」`;
  }
  // 거부반응: 거부반응이 없는 오퍼레이터 1명 (17등급부터 조합 거부반응)
  function mutate(r = R()) {
    const cand = r.ops.filter((o) => !o.mut && !o.evo);
    if (!cand.length) return '';
    const o = pick(cand), basic = ['mutation_1', 'mutation_2', 'mutation_3', 'mutation_4'], combo = ['mutation_13', 'mutation_14', 'mutation_15', 'mutation_16', 'mutation_17', 'mutation_18'];
    o.mut = pick(gradeOf(r) >= 17 ? combo : basic);
    const out = [`${OPS[o.id].name} 「${mutInfo(o.mut).name}」 거부반응`];
    // 양육자 동유전자종: 정상 오퍼레이터 2명이 [진화]
    if (hasFx('nurturer', r)) for (const x of shuffle(r.ops.filter((y) => !y.mut && !y.evo)).slice(0, 2)) { x.evo = true; out.push(`${OPS[x.id].name} 「진화」`); }
    return out.join(', ');
  }

  // ---------- 지역 의뢰 진행 ----------
  function track(kind, n = 1, arg) {
    const r = R();
    if (!r || !r.task || r.task.done) return;
    const t = r.task;
    if (t.kind !== kind || n <= 0) return;
    if (kind === 'noClass' && arg && arg.some((c) => t.arg.includes(c))) return;
    t.prog = Math.min(t.goal, (t.prog || 0) + n);
    if (t.prog >= t.goal) { t.done = true; toast(`지역 의뢰 「${t.name}」 완료 — 보상을 고르세요`); }
  }

  // ---------- 탐색 시작 ----------
  function newRun(bandId, diffId) {
    const S0 = D.start;
    const r = {
      v: 4, band: bandId, diff: diffId, floor: 0, life: S0.life, maxLife: S0.life, shield: 0, ingot: S0.ingot, hope: S0.hope, exp: 0, level: 1,
      key: S0.key, dice: S0.dice, light: S0.light, virtues: [], flags: {}, away: [], stat: {},
      relics: [], ops: [], tickets: [], freePromotes: [], recruitNow: true, needGroup: true, needStart: !!rec().bonusNext, squadBonus: 0, offer: null, stacks: {}, lineup: null,
      map: null, at: null, pending: null, used: [], score: { battles: 0, perfect: 0, bosses: 0 }, started: Date.now(),
    };
    P().is = r;
    rec().bonusNext = false;   // 지난 탐색의 추가 보상은 이번 탐색에서 한 번만
    const g = gradeOf(r);
    if (g >= 6) r.light -= 15;
    if (g >= 10) r.light -= 15;
    if (g >= 16) addRelic('ro2_fight_159');
    if (g < 0) addRelic('ro2_grace_52');
    const b = bandOf(r);
    if (b.fx.gain) applyGain(b.fx.gain);
    if (b.fx.setLife1) { r.life = 1; r.maxLife = 1; }
    r.map = genFloor(0);
    rec().runs++;
    save();
  }

  // ---------- 층 지도 ----------
  const NODE = {
    battle: { key: 'BATTLE_NORMAL', en: 'OPERATION', ico: '⚔' },
    emergency: { key: 'BATTLE_ELITE', en: 'EMERGENCY', ico: '⚠' },
    event: { key: 'INCIDENT', en: 'ENCOUNTER', ico: '?' },
    shop: { key: 'BATTLE_SHOP', en: 'TRADER', ico: '◆' },
    rest: { key: 'REST', en: 'SAFEHOUSE', ico: '✚' },
    unknown: { key: 'UNKNOWN', en: 'FOG', ico: '☁' },
    wish: { key: 'WISH', en: 'WISH', ico: '✧' },
    ent: { key: 'ENTERTAINMENT', en: 'ENTERTAINMENT', ico: '♫' },
    sacrifice: { key: 'SACRIFICE', en: 'EXCHANGE', ico: '☯' },
    expedition: { key: 'EXPEDITION', en: 'EXPEDITION', ico: '⛵' },
    mission: { key: 'MISSION', en: 'MISSION', ico: '✉' },
    gate: { key: null, name: '관문 작전', en: 'GATE', ico: '⚑' },
    boss: { key: 'BATTLE_BOSS', en: 'BOSS', ico: '☠' },
  };
  const nodeName = (t) => (NODE[t].key ? X2.nodes[NODE[t].key].name : NODE[t].name);
  const nodeDesc = (t) => (NODE[t].key ? X2.nodes[NODE[t].key].desc : '');
  function nodeType(c, f) {
    const w = [['battle', 36], ['event', 22], ['unknown', 8], ['ent', 6], ['wish', 5]];
    if (c >= 1) w.push(['emergency', 9], ['expedition', 4], ['mission', 4]);
    if (c >= 2) w.push(['shop', 10], ['rest', 12]);
    if (f >= DEEP) w.push(['sacrifice', 7]);
    let x = Math.random() * w.reduce((s, [, v]) => s + v, 0);
    for (const [k, v] of w) { if ((x -= v) < 0) return k; }
    return 'battle';
  }
  function genFloor(f) {
    const F = D.floors[f], r = R();
    const cols = [];
    let n = 0;
    // 메아리 「탐색」: 이 구역의 노드 +2 (칸 1개 추가)
    const ncols = D.cols + (r && r.vari === 'variation_1' ? 1 : 0);
    for (let c = 0; c < ncols; c++) {
      const k = c === 0 ? 2 : 2 + (Math.random() < 0.55 ? 1 : 0);
      cols.push(Array.from({ length: k }, (_, i) => ({ id: 'n' + n++, type: c === 0 ? 'battle' : nodeType(c, f), y: (i + 1) / (k + 1) })));
    }
    const gb = D.battles[F.gate];
    cols.push([{ id: 'n' + n++, type: gb.boss ? 'boss' : 'gate', y: 0.5, battle: F.gate }]);
    // 상인은 층마다 최대 1곳(마지막 칸에 하나 보장), 지역 의뢰 · 긴급 수송은 층마다 최대 1곳
    const flat = cols.flat();
    for (const t of ['shop', 'mission', 'expedition']) flat.filter((x) => x.type === t).slice(1).forEach((x) => { x.type = 'event'; });
    if (!flat.some((x) => x.type === 'shop')) pick(cols[ncols - 1]).type = 'shop';
    // 열쇠가 필요한 길: 같은 칸 안의 위아래 노드를 잇는 통로 (앞으로 가는 길은 열쇠 없이)
    const vlinks = [];
    for (let c = 1; c < ncols; c++) for (let i = 0; i < cols[c].length - 1; i++) if (Math.random() < 0.4) vlinks.push([cols[c][i].id, cols[c][i + 1].id]);
    const used = r ? r.used : [];
    for (const node of flat) assignNode(node, F, f, used);
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
    return { floor: f, cols, edges, vlinks, cur: null, done: [] };
  }
  function assignNode(node, F, f, used) {
    if (node.type === 'battle' || node.type === 'emergency') {
      const pool = shuffle(F.battles).sort((a, b) => used.filter((u) => u === a).length - used.filter((u) => u === b).length);
      node.battle = pool[0];
      used.push(pool[0]);
    }
    if (node.type === 'event') {
      const r = R(), seen = new Set((r && r.seenEv) || []);
      const ev = X2.events.filter((e) => (!e.floors || e.floors.includes(f + 1)) && !seen.has(e.id));
      node.event = pick(ev.length ? ev : X2.events).id;
    }
  }
  const findNode = (id, m = R().map) => m.cols.flat().find((x) => x.id === id);
  const colOf = (id, m = R().map) => m.cols.findIndex((c) => c.some((x) => x.id === id));
  // 지금 노드에서 열쇠를 써서 갈 수 있는 위아래 노드
  function keyMoves() {
    const m = R().map;
    if (!m.cur) return [];
    return (m.vlinks || []).filter((l) => l.includes(m.cur)).map((l) => (l[0] === m.cur ? l[1] : l[0])).filter((id) => !m.done.includes(id));
  }
  function reachable() {
    const m = R().map;
    if (!m.cur) return m.cols[0].map((x) => x.id);
    return [...(m.edges[m.cur] || []), ...keyMoves()];
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
        <div class="is-rec"><span>탐색 <b>${rc.runs}</b>회</span><span>완주 <b>${rc.wins}</b>회</span><span>최고 점수 <b>${rc.best}</b></span><span>완주한 최고 난이도 <b>${rc.diffMax >= 0 ? rc.diffMax : '-'}</b></span><span>소장품 도감 <b>${rc.seen.length}</b>/${ALL_RELICS.filter((x) => !x.na).length}</span>${rc.bank ? `<span>투자금 <b>${rc.bank}</b></span>` : ''}</div>
      </div>
      <div class="is-actions">
        ${r ? `<div class="is-cur">진행 중 · ${esc(diffOf(r).name)}${diffOf(r).grade >= 0 ? ` ${diffOf(r).grade}` : ''} · ${r.floor + 1}층 ${esc(D.floors[r.floor].name)} · 목표 HP ${r.life} · 분대 ${r.ops.length}명</div>
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
    if (t.closest('#is-start')) { openDiffPick(); return; }
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

  // 난이도 → 분대 → (탐색 시작) 초기 모집 → 출발 전 준비
  let pickDiff = null;
  function openDiffPick() {
    openModal(`<div class="modal-title">난이도 선택</div><div class="modal-sub">한 단계를 완주하면 다음 단계가 열립니다. 높은 단계는 아래 단계의 규칙이 모두 적용됩니다</div>
      <div class="is-diffs">${X2.diffs.map((x) => {
        const ok = diffUnlocked(x);
        return `<button class="is-diff ${ok ? '' : 'locked'}" data-diff="${x.id}" ${ok ? '' : 'disabled'} style="--c:${x.color || '#5aa9ff'}">
          <b>${esc(x.name)}${x.grade >= 0 ? ` <em>${x.grade}</em>` : ''}</b><span>${esc(x.rule)}</span>${x.add && x.grade > 0 ? `<small>${esc(x.add)}</small>` : ''}<i>점수 ×${x.score}</i>${ok ? '' : '<small class="bad">이전 단계를 완주해야 합니다</small>'}</button>`;
      }).join('')}</div>`);
    $('#modal-body').querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => { pickDiff = b.dataset.diff; sfx('select'); openSquadPick(); }));
  }
  function openSquadPick() {
    openModal(`<div class="modal-title">분대 선택</div><div class="modal-sub">탐색을 함께할 분대를 고르세요 · 난이도 ${esc(X2.diffs.find((x) => x.id === pickDiff).name)}</div>
      <div class="is-squads">${X2.bands.map((s) => {
        const ok = bandUnlocked(s);
        return `<button class="is-squad ${ok ? '' : 'locked'}" data-squad="${esc(s.id)}" ${ok ? '' : 'disabled'}><img src="${s.icon}" alt=""><b>${esc(s.name)}</b><span>${esc(s.desc)}</span>${ok ? '' : `<small class="bad">해금: ${esc(s.unlock || '')}</small>`}</button>`;
      }).join('')}</div>`);
    $('#modal-body').querySelectorAll('[data-squad]').forEach((b) => b.addEventListener('click', () => {
      closeModal();
      newRun(b.dataset.squad, pickDiff || 'n0');
      sfx('select');
      go('isrun');
    }));
  }
  // 도감: 얻은 소장품은 설명까지, 이 AU에 없는 소장품은 이유와 함께 흐리게
  let dexTab = 'all';
  function openDex() {
    const seen = new Set(rec().seen);
    const list = ALL_RELICS.filter((x) => dexTab === 'all' || (dexTab === 'seen' ? seen.has(x.id) : dexTab === 'na' ? x.na : dexTab === 'ro2' ? x.ro2 : x.rarity === dexTab && !x.na));
    const tabs = [['all', '전체'], ['seen', '획득'], ['common', '평범'], ['rare', '진귀'], ['special', '매우 진귀'], ['ro2', '조우 · 저주'], ['na', '등장하지 않음']];
    openModal(`<div class="modal-title">소장품 도감</div><div class="modal-sub">획득 ${seen.size} / ${ALL_RELICS.filter((x) => !x.na).length} · 원작 소장품 ${ALL_RELICS.length}종</div>
      <div class="dex-tabs">${tabs.map(([k, n]) => `<button class="btn small ${dexTab === k ? 'primary' : ''}" data-dex="${k}">${n}</button>`).join('')}</div>
      <div class="relic-grid dex">${list.map((x) => (seen.has(x.id) || x.na ? relicHTML(x, '', true) : relicHTML(x, '', false, true))).join('') || '<p class="empty-note">없습니다.</p>'}</div>`);
    $('#modal-body').querySelectorAll('[data-dex]').forEach((b) => b.addEventListener('click', () => { dexTab = b.dataset.dex; openDex(); }));
  }
  function openHelp() {
    openModal(`<div class="modal-title">진행 방법</div><div class="modal-sub">통합전략 — 원작 「미즈키 & 카이룰라 아버」 규칙</div>
      <div class="modal-text is-help">
        <p><b>난이도</b>(고요한 바다 · 일렁이는 파도 0~18)와 <b>분대</b>를 고르고, <b>초기 모집 조합</b>과 <b>출발 전 준비</b>를 고른 뒤 모집권으로 오퍼레이터를 모집합니다. 모집에는 <b>희망</b>이 듭니다 (6성 ${D.hopeCost[6]}, 5성 ${D.hopeCost[5]}, 4성 ${D.hopeCost[4]}, 3성 이하 0).</p>
        <p>모집권을 쓸 때 가끔 <b>임시 모집</b> 오퍼레이터가 함께 나옵니다. 보유하지 않은 오퍼레이터도 나오며 <b>희망 없이</b> 모집하고, 정해진 육성 상태로 합류합니다.</p>
        <p>오퍼레이터는 <b>계정의 육성 상태</b>로 합류하지만 <b>랭크 상승 전</b>에는 1차 정예화(스킬 레벨 7)까지만 적용됩니다. <b>랭크 상승</b>(희망 6성 ${D.promoteCost[6]}, 5성 ${D.promoteCost[5]}, 4성 ${D.promoteCost[4]})하면 계정의 2차 정예화 상태를 씁니다. 랭크 상승권 · 물자배급권이 있으면 희망 없이 랭크 상승합니다.</p>
        <p>작전에서 적이 돌파하면 <b>목표 HP</b>가 줄고(<b>실드</b>가 먼저), 0이 되면 탐색이 끝납니다. 전투 밖에서는 목표 HP가 1 아래로 내려가지 않습니다.</p>
        <p><b>등불</b>: 100 &lt;밝음&gt; · 50~99 &lt;흔들림&gt; · 1~49 &lt;희미함&gt; · 0 &lt;꺼짐&gt;. 완벽한 작전이 아니거나 작전 후 목표 HP가 절반 미만이면 등불이 줄어듭니다. <b>심해</b>(${DEEP + 1}층부터)에 들어갈 때마다 주사위를 굴려, 등불이 밝으면 <b>계시</b>를 얻고 어두우면 오퍼레이터가 <b>거부반응</b>을 일으킵니다. <b>주사위</b>는 다시 굴리기 · 조우 · 소원성취 · 상인 흥정에, <b>열쇠</b>는 잠긴 길 · 떠내려온 상자 · 투자금 인출에 씁니다.</p>
        <p>층 지도: ${['battle', 'emergency', 'event', 'shop', 'rest', 'unknown', 'wish', 'ent', 'sacrifice', 'expedition', 'mission'].map((t) => `<b>${esc(nodeName(t))}</b>`).join(' · ')}. 층 끝에는 관문 작전이나 보스(험난한 길)가 있습니다. 구역마다 <b>메아리</b>가 생길 수 있습니다.</p>
        <p>바다의 <b>명흔</b> 위에 선 오퍼레이터는 방어력이 줄고 HP를 잃으며, 시본은 HP를 회복합니다. <b>신경 손상</b>(원작의 원소 손상)이 가득 차면 오퍼레이터가 큰 피해를 입고 기절합니다.</p>
      </div>`);
  }
  // 소장품 카드 (그림 · 번호 · 희귀도 · 효과 원문 · 이 게임에서 다르게 적용되는 점)
  function relicIco(x) {
    if (x.icon) return `<i class="relic-img"><img src="${x.icon}" alt=""></i>`;
    const m = x.image && String(x.image).match(/(\d+)\.webp$/);
    if (!m) return '<i class="relic-img"></i>';
    const k = +m[1] - 1;
    return `<i class="relic-img relic-sp" style="background-position:${-(k % 16) * 58}px ${-Math.floor(k / 16) * 58}px"></i>`;
  }
  function relicHTML(x, extra = '', lore = false, hide = false) {
    if (!x) return '';
    if (hide) return `<div class="relic unknown">${relicIco(x)}<div class="relic-no">${x.no ? `No.${String(x.no).padStart(3, '0')}` : '조우'}</div><b>???</b><span>아직 얻지 못한 소장품</span></div>`;
    return `<div class="relic r-${x.na ? 'na' : x.rarity}">
      ${relicIco(x)}
      <div class="relic-no">${x.no ? `No.${String(x.no).padStart(3, '0')} · ` : ''}${x.na ? '등장하지 않음' : esc(RARITY[x.rarity] || '')}</div>
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
    refresh();
    resumePanel();
  };
  // 원작 지도 리소스: 구역 배경 · 노드 아이콘 · 노드 태그 (img/is/ui)
  const UI_IMG = 'img/is/ui/';
  const MAP_BG = [1, 2, 4, 5];   // 층별 원작 구역 배경
  const NODE_IMG = { battle: 'n_battle', emergency: 'n_elite', event: 'n_incident', shop: 'n_shop', rest: 'n_rest', unknown: 'n_unknown', wish: 'n_wish', ent: 'n_ent', sacrifice: 'n_sacrifice', expedition: 'n_expedition', mission: 'n_mission', gate: 'n_elite' };
  const NODE_TAG = { battle: 'battle', emergency: 'elite', event: 'incident', shop: 'shop', rest: 'rest', unknown: 'unknown', wish: 'treasure', ent: 'entertainment', sacrifice: 'sacafri', expedition: 'exped', gate: 'elite', boss: 'boss' };
  function renderTop() {
    const r = R(), F = D.floors[r.floor];
    const next = D.levels[r.level] && D.levels[r.level].exp;
    const vi = r.vari && X2.variations.find((v) => v.id === r.vari);
    $('#screen-isrun .is-bg').style.backgroundImage = `url(${UI_IMG}map_${MAP_BG[r.floor] || 1}.webp)`;
    $('#is-top').innerHTML = `
      <div class="ist-left">
        <button class="ist-exit" id="isb-exit" title="나가기"></button>
        <div class="ist-hp"><img src="${UI_IMG}init_hp.png" alt=""><div><small>목표 HP</small><b>${r.life}</b><i>/${r.maxLife}</i>${r.shield ? `<em title="실드">+${r.shield}</em>` : ''}</div></div>
        <div class="ist-lv"><span class="lvc"><small>LV</small><b>${r.level}</b></span><div><small>지휘 레벨</small><b>${next ? Math.round(r.exp * 10) / 10 : 'MAX'}</b>${next ? `<i>/${next}</i>` : ''}</div></div>
      </div>
      <div class="ist-zone"><img src="${UI_IMG}zone_${MAP_BG[r.floor] || 1}.png" alt=""><b>${esc(F.name)}</b><small>${r.floor + 1}층 · ${esc(F.en)}${r.floor >= DEEP ? ' · 심해' : ''}${vi ? ` · 메아리: ${esc(vi.name)}` : ''}</small></div>
      <div class="ist-res">
        <span class="ist-hope" title="희망"><img src="${UI_IMG}init_population.png" alt=""><b>${r.hope}</b></span>
        <span class="ist-ingot" title="오리지늄각뿔"><img src="${UI_IMG}ut_gold.png" alt=""><b>${r.ingot}</b></span>
        <span class="ist-key" title="열쇠"><img src="img/is/key.png" alt=""><b>${r.key}</b></span>
      </div>`;
  }
  function renderBottom() {
    const r = R(), cap = squadCap(), n = lineup().length;
    const mutN = r.ops.filter((o) => o.mut && !o.evo).length;
    const st = lightState();
    $('#is-bottom').innerHTML = `
      <div class="isb-left">
        <button class="isb-light l${st}" id="isb-light" title="등불 &lt;${LIGHT_NAME[st]}&gt;"><i style="--v:${r.light}"></i><b>${r.light}</b><small>${LIGHT_NAME[st]}</small></button>
        <button class="isb-dice" id="isb-dice" title="주사위"><img src="${UI_IMG}init_dice.png" alt=""><small>REMAIN</small><b>${r.dice}</b><span>주사위</span></button>
        <button class="isb-relic" id="isb-relic"><img src="${UI_IMG}ut_relic.png" alt=""><b>${r.relics.length}</b><span>소장품${r.virtues.length ? ` · 계시 ${r.virtues.length}` : ''}</span></button>
      </div>
      <div class="isb-mid">
        ${r.task ? `<button class="btn small" id="isb-task">의뢰 ${esc(r.task.name)} ${r.task.prog || 0}/${r.task.goal}${r.task.done ? ' · 완료' : ''}</button>` : ''}
        ${r.tickets.length ? `<button class="btn small primary pulse" id="isb-ticket">모집권 ${r.tickets.length}장 사용</button>` : ''}
        ${r.freePromotes.length ? `<span class="isb-tag">랭크 상승권 ${r.freePromotes.length}</span>` : ''}${mutN ? `<span class="isb-tag bad">거부반응 ${mutN}</span>` : ''}
      </div>
      <div class="isb-right">
        <button class="isb-ops" id="isb-squad"><span>오퍼레이터</span><b>${r.ops.length}</b></button>
        <button class="isb-form" id="isb-form"><span>편성</span></button>
        <div class="isb-cap" title="편성 ${n}/${cap}">${Array.from({ length: MAX_SQUAD }, (_, i) => `<i class="${i < n ? 'on' : i < cap ? '' : 'off'}"></i>`).join('')}</div>
      </div>`;
  }
  const COLW = 300;
  function renderMap() {
    const r = R(), m = r.map, can = new Set(reachable()), keyed = new Set(keyMoves());
    if (UI.current === 'isrun' && window.SFX && SFX.bgm) SFX.bgm(r.floor >= DEEP ? 'isdeep' : 'ismap');
    const nc = m.cols.length, wrap = $('#is-map').parentElement;
    const H = Math.max(200, wrap.clientHeight || 420), small = H < 320, cw = small ? 200 : COLW, half = small ? 60 : 95;
    const W = 140 + (nc - 1) * cw + 220;
    const pos = (c, y) => [110 + c * cw, (small ? 10 : 30) + y * (H - (small ? 20 : 90))];
    let lines = '';
    m.cols.forEach((col, c) => col.forEach((a) => (m.edges[a.id] || []).forEach((bid) => {
      const b = findNode(bid), [x1, y1] = pos(c, a.y), [x2, y2] = pos(c + 1, b.y);
      const on = (m.cur ? m.cur === a.id : false) && can.has(bid);
      const walked = m.done.includes(a.id) && m.done.includes(bid);
      const sx = x1 + half, ex = x2 - half, mx = (sx + ex) / 2;
      lines += `<path d="M${sx} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${ex} ${y2}" class="${on ? 'on' : walked ? 'walked' : ''}" marker-end="url(#is-arrow)"/>`;
    })));
    // 위아래 통로 (열쇠 필요)
    let vkeys = '';
    for (const [a, b] of m.vlinks || []) {
      const c = colOf(a), na = findNode(a), nb = findNode(b), [x, y1] = pos(c, na.y), [, y2] = pos(c, nb.y);
      const on = m.cur === a || m.cur === b;
      lines += `<path d="M${x} ${y1 + (small ? 34 : 52)} L${x} ${y2 - (small ? 30 : 46)}" class="vkey ${on ? 'on' : ''}"/>`;
      vkeys += `<img class="is-vkey ${on ? 'on' : ''}" src="${UI_IMG}need_key.png" alt="열쇠 필요" style="left:${x}px;top:${(y1 + y2) / 2}px">`;
    }
    const nodes = m.cols.map((col, c) => col.map((x) => {
      const [lx, ty] = pos(c, x.y);
      const shown = x.fog && !x.entered ? 'unknown' : x.type;
      const st = m.done.includes(x.id) ? 'done' : can.has(x.id) ? 'open' : 'locked';
      const sub = x.battle && D.battles[x.battle] && shown !== 'unknown' ? D.battles[x.battle].name : nodeName(shown);
      const big = shown === 'boss';
      const tag = NODE_TAG[shown];
      return `<button class="is-node t-${shown} ${st} ${m.cur === x.id ? 'cur' : ''} ${big ? 'big' : ''}" style="left:${lx}px;top:${ty}px" data-node="${x.id}" ${st === 'open' ? '' : 'tabindex="-1"'} title="${esc(nodeName(shown))} — ${esc(nodeDesc(shown))}">
        <span class="nd-card">${big ? `<img class="nd-boss" src="${UI_IMG}${r.floor >= D.floors.length - 1 ? 'n_final' : 'n_boss'}.png" alt="">` : `<img class="nd-ico" src="${UI_IMG}${NODE_IMG[shown]}.png" alt="">`}${keyed.has(x.id) ? `<img class="nd-key" src="${UI_IMG}need_key.png" alt="열쇠 필요">` : ''}</span>
        <span class="nd-tag">${tag ? `<img src="${UI_IMG}tag_${tag}.png" alt="">` : `<em>${esc(NODE[shown].en)}</em>`}<b>✕ ${esc(sub)}</b></span></button>`;
    }).join('')).join('');
    const el = $('#is-map');
    el.style.width = W + 'px';
    el.innerHTML = `<svg class="is-lines" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><marker id="is-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 L3 5 Z" fill="#fff"/></marker></defs>${lines}</svg>${vkeys}${nodes}`;
    // 진행 중인 칸이 보이도록 스크롤
    const ci = m.cur ? colOf(m.cur) : -1;
    wrap.scrollLeft = Math.max(0, pos(Math.max(0, ci), 0)[0] - 160);
  }
  window.addEventListener('resize', () => { if (UI.current === 'isrun' && R()) renderMap(); });

  $('#is-map').addEventListener('click', (e) => {
    const b = e.target.closest('[data-node]');
    if (!b || !b.classList.contains('open')) return;
    const r = R(), node = findNode(b.dataset.node);
    if (keyMoves().includes(node.id)) {
      if (r.key < 1) { toast('위아래로 옮겨 가려면 열쇠가 필요합니다'); return; }
      r.key--; track('keyUse');
      toast('열쇠를 써서 옆 길로 옮겨 갔습니다');
    }
    r.at = b.dataset.node;
    save();
    sfx('select');
    resumePanel();
  });
  $('#is-top').addEventListener('click', (e) => { if (e.target.closest('#isb-exit')) go('is'); });
  $('#is-bottom').addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('#isb-squad')) openSquad();
    else if (t.closest('#isb-form')) openForm(null);
    else if (t.closest('#isb-relic')) openRelics();
    else if (t.closest('#isb-task')) openTask();
    else if (t.closest('#isb-ticket')) { resumePanel(true); }
    else if (t.closest('#isb-light') || t.closest('#isb-dice')) openLightInfo();
  });

  // ---------- 패널 (닫을 수 없는 진행 창) ----------
  function panel(html, cls = '', bg = null) {
    const p = $('#is-panel');
    p.className = 'is-panel ' + cls + (bg ? ' has-bg' : '');
    p.style.setProperty('--bg', bg ? `url(img/is/ev/${bg}.webp)` : 'none');
    p.innerHTML = html;
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
    if (r.pending && r.pending.kind === 'dice') { showDice(); return; }
    if (r.needStart) { showStartBuff(); return; }
    if (r.needGroup) { showGroupPick(); return; }
    if (r.purify && r.ops.some((o) => o.mut && !o.evo)) { showPurify(); return; }
    if (r.tickets.length && (useTicket || !r.ops.length || r.recruitNow)) { showRecruit(); return; }
    if (r.task && r.task.done && !r.task.claimed) { showTaskReward(); return; }
    if (r.at) { enterNode(findNode(r.at)); return; }
    hidePanel();
  }

  // ---------- 초기 모집 조합 (원작: 선수필승 · 차근차근 · 상호보완 · 원하는 대로) ----------
  function showGroupPick() {
    const img = { g1: 'grp_1', g2: 'grp_2', g3: 'grp_3', random: 'grp_random' };
    panel(`<div class="isp-head"><small>INITIAL RECRUITMENT</small><b>모집 조합 선택</b></div>
      <p class="isp-text">희망 <b>${R().hope}</b> 보유 · 분대 「${esc(bandOf().name)}」</p>
      <div class="is-cardsel">${D.recruitGroups.map((g) => `<button class="is-cardpick" data-act="group" data-k="${g.id}"><img src="${UI_IMG}${img[g.id]}.png" alt=""><b>${esc(g.name)}</b><span>${esc(g.desc)}</span></button>`).join('')}</div>`, 'wide ispcards');
  }
  // ---------- 출발 전 준비 (원작 8종 중 3종) ----------
  const START_GAIN = [{ shield: 3 }, { hope: 2 }, { ingot: 5 }, 'allIngotRelic', 'hopeRelic', { relic: 'ro2_grace_21' }, { key: 1 }, { dice: 2 }];
  function showStartBuff() {
    const r = R(), S0 = X2.start;
    if (!r.startOpts) { r.startOpts = shuffle([0, 1, 2, 3, 4, 5, 6, 7]).slice(0, 3); save(); }
    panel(`<div class="isp-head"><small>PREPARATION · 지난 탐색 보상</small><b>${esc(S0.title)}</b></div>
      <p class="isp-text story">${esc(S0.text)}</p>
      <p class="isp-text">지난 탐색에서 3층 이상 도달 — 하나를 골라 이번 탐색을 시작합니다.</p>
      <div class="is-cardsel">${r.startOpts.map((i) => `<button class="is-cardpick" data-act="startbuff" data-k="${i}"><img src="${UI_IMG}init_${['shield', 'population', 'gold', 'unknown', 'unknown', 'hp', 'unknown', 'dice'][i]}.png" alt=""><b>${esc(S0.choices[i].label)}</b><span>${esc(S0.choices[i].desc)}</span></button>`).join('')}</div>`, 'wide ispcards', S0.bg);
  }

  // ---------- 모집 ----------
  // 임시 모집 후보 (모집권마다 한 번 정해서 저장 — 다시 열어도 바뀌지 않음)
  function tempOffer(tk, r) {
    const have = new Set(r.ops.map((o) => o.id));
    const pool = OPERATORS.filter((o) => !o.summoned && !have.has(o.id) && (!tk.classes || tk.classes.includes(o.class)) && (!tk.maxRarity || (o.rarity || 3) <= tk.maxRarity));
    if (!pool.length) return [];
    const byRar = (n) => pool.filter((o) => (o.rarity || 3) === n);
    // 통합전략 전용 오퍼레이터(관리자 실장)는 같은 등급이면 절반 확률로 우선
    const pickRar = (n) => { for (const k of [n, n + 1, n - 1, 6, 5, 4, 3]) { const l = byRar(k), iso = l.filter((o) => o.isOnly); if (iso.length && Math.random() < 0.5) return pick(iso); if (l.length) return pick(l); } return pick(pool); };
    // 전술 분대: 해당 직군의 승급(랭크 상승한) 임시 모집 출현 확률 대폭 상승
    const tu = hasFx('tempUp', r), upCls = tu ? tu.tempUp : [];
    const promoted = (x) => maxElite(x) >= 2 && upCls.includes(x.class) && Math.random() < 0.6;
    if (tk.temp === 'promoted') { const x = pickRar(Math.random() < 0.5 ? 6 : 5); return [{ id: x.id, promoted: maxElite(x) >= 2 }]; }
    if (tk.temp) { const x = pickRar(tk.temp); return [{ id: x.id, promoted: promoted(x) }]; }
    const up = upCls.length && tk.classes && tk.classes.some((c) => upCls.includes(c));
    if (Math.random() >= D.tempChance + (up ? 0.3 : 0)) return [];
    const w = D.tempRarity, tot = Object.values(w).reduce((a, v) => a + v, 0);
    let x = Math.random() * tot, rar = 4;
    for (const [k, v] of Object.entries(w)) { if ((x -= v) < 0) { rar = +k; break; } }
    const o = pickRar(rar);
    return [{ id: o.id, promoted: promoted(o) }];
  }
  function showRecruit() {
    const r = R(), key = r.tickets[0], tk = D.tickets[key] || D.tickets.all;
    if (!r.offer || r.offer.ticket !== key || r.offer.n !== r.tickets.length) { r.offer = { ticket: key, n: r.tickets.length, temps: tempOffer(tk, r) }; save(); }
    const have = new Set(r.ops.map((o) => o.id));
    const temps = r.offer.temps.filter((t) => OPS[t.id] && !have.has(t.id));
    const tempIds = new Set(temps.map((t) => t.id));
    const cands = OPERATORS.filter((o) => ACCOUNT.owns(o.id) && !o.summoned && !have.has(o.id) && !tempIds.has(o.id) && (!tk.classes || tk.classes.includes(o.class)) && (!tk.maxRarity || (o.rarity || 3) <= tk.maxRarity))
      .sort((a, b) => (b.rarity || 3) - (a.rarity || 3));
    const first = !r.ops.length;
    const tempHTML = temps.map((t) => {
      const o = OPS[t.id], pg = progFor({ id: t.id, temp: true, promoted: t.promoted });
      return `<button class="is-cand temp" data-recruit="${esc(o.id)}" data-temp="1">${cardHTML(o, 'small')}<span class="cost">임시 모집 · 희망 0</span><small class="is-cand-st">${t.promoted ? '랭크 상승 · ' : ''}${eliteText(pg)}</small></button>`;
    }).join('');
    panel(`<div class="isp-head"><small>RECRUIT · 남은 모집권 ${r.tickets.length}장</small><b>${esc(tk.name)}</b></div>
      <p class="isp-text">${first ? '탐색을 함께할 오퍼레이터를 모집하세요. ' : ''}${esc(tk.desc || '')} · 희망 <b>${r.hope}</b> 보유<br><small>보유 오퍼레이터는 계정 육성 상태로 합류합니다 (랭크 상승 전에는 1차 정예화까지)</small></p>
      <div class="is-cands">${tempHTML}${cands.map((o) => {
        const c = recruitCost(o), ok = r.hope >= c, pg = progFor({ id: o.id });
        return `<button class="is-cand ${ok ? '' : 'no'}" data-recruit="${esc(o.id)}" ${ok ? '' : 'disabled'}>${cardHTML(o, 'small')}<span class="cost">희망 ${c}</span><small class="is-cand-st">${eliteText(pg)}</small></button>`;
      }).join('') || (tempHTML ? '' : '<p class="empty-note">이 모집권으로 모집할 수 있는 오퍼레이터가 없습니다.</p>')}</div>
      <div class="panel-btns">
        ${cands.length || tempHTML ? '' : '<button class="btn primary" data-recruit-swap>오리지늄각뿔 +3으로 바꾸기</button>'}
        <button class="btn" data-recruit-skip>모집 포기</button>
      </div>`, 'wide');
  }
  $('#is-panel').addEventListener('click', (e) => {
    const t = e.target, r = R();
    if (!r) return;
    const rc = t.closest('[data-recruit]');
    if (rc && !rc.disabled) {
      const def = OPS[rc.dataset.recruit], temp = !!rc.dataset.temp, c = recruitCost(def, r, temp);
      if (r.hope < c) return;
      const tp = temp && r.offer && r.offer.temps.find((x) => x.id === def.id);
      r.hope -= c;
      r.ops.push({ id: def.id, promoted: !!(tp && tp.promoted), temp: temp || undefined });
      if (r.lineup && r.lineup.length < squadCap()) r.lineup.push(def.id);
      r.tickets.shift();
      r.offer = null;
      track('recruit');
      UI.say(def, 'obtain');
      sfx('select');
      afterTicket();
      return;
    }
    if (t.closest('[data-recruit-skip]')) { r.tickets.shift(); r.offer = null; afterTicket(); return; }
    if (t.closest('[data-recruit-swap]')) { r.tickets.shift(); r.offer = null; r.ingot += 3; afterTicket(); return; }
    const act = t.closest('[data-act]');
    if (act && !act.disabled) onAct(act.dataset.act, act);
  });
  function afterTicket() {
    const r = R();
    if (!r.ops.length && !r.tickets.length) { r.tickets.push('all'); r.offer = null; toast('최소 1명은 모집해야 탐색을 시작할 수 있습니다'); }
    if (!r.tickets.length) r.recruitNow = false;
    save();
    refresh();
    resumePanel();
  }

  // ---------- 노드 들어가기 ----------
  function enterNode(node) {
    const r = R();
    if (!node) { r.at = null; hidePanel(); return; }
    if (!node.entered) {
      // 자욱한 안개: 들어가면 정체가 드러남
      if (node.type === 'unknown') {
        node.fog = true;
        node.type = pick(['battle', 'event', 'event', 'shop', 'rest', 'ent', 'wish']);
        assignNode(node, D.floors[r.floor], r.floor, r.used);
      }
      node.entered = true;
      // 메아리 「개조」: 비전투 노드에서 오리지늄각뿔 +3 / 「성쇠」: 전투 노드 진입 시 목표 HP -1 (최소 1)
      const battle = ['battle', 'emergency', 'gate', 'boss'].includes(node.type);
      if (r.vari === 'variation_3' && !battle) toast(applyGain({ ingot: 3 }).join(', '));
      if (r.vari === 'variation_4' && battle && r.life > 1) { r.life--; toast('메아리: 성쇠 — 목표 HP -1'); }
      if (battle) track('battleEnter');
      if (node.type === 'event') { track('eventEnter'); r.seenEv = [...(r.seenEv || []), node.event]; }
      if (node.type === 'rest') track('restEnter');
      save(); refresh();
    }
    if (['battle', 'emergency', 'gate', 'boss'].includes(node.type)) showBattle(node);
    else if (node.type === 'event') showEvent(node);
    else if (node.type === 'shop') showShop(node);
    else if (node.type === 'rest') showRest(node);
    else if (node.type === 'wish') showWish(node);
    else if (node.type === 'ent') showEnt(node);
    else if (node.type === 'sacrifice') showSacrifice(node);
    else if (node.type === 'expedition') showExpedition(node);
    else if (node.type === 'mission') showMission(node);
  }
  function finishNode(node) {
    const r = R(), m = r.map;
    m.cur = node.id;
    if (!m.done.includes(node.id)) m.done.push(node.id);
    r.at = null;
    // 층의 마지막 칸이면 다음 층으로
    if (colOf(node.id) === m.cols.length - 1) {
      if (r.floor >= D.floors.length - 1 || (D.battles[node.battle] && D.battles[node.battle].final)) { endRun(true); save(); resumePanel(); return; }
      nextFloor();
      return;
    }
    save();
    refresh();
    resumePanel();
  }
  function nextFloor() {
    const r = R();
    // 메아리 「개조」: 구역 종료 시 이번 구역에서 얻은 오리지늄각뿔 차감
    if (r.vari === 'variation_3' && r.zoneIngot) { r.ingot = Math.max(0, r.ingot - r.zoneIngot); toast(`메아리: 개조 — 오리지늄각뿔 -${r.zoneIngot}`); }
    r.floor++;
    r.zoneIngot = 0;
    // 메아리: 2층부터 60% 확률
    r.vari = Math.random() < 0.6 ? pick(X2.variations).id : null;
    r.map = genFloor(r.floor);
    const out = [];
    const fp = hasFx('floorPenalty', r);
    if (fp) r.stacks.floorPen = Math.min(fp.floorPenalty.max, (r.stacks.floorPen || 0) + 1);
    const zd = sumFx('zoneDice', r);
    if (zd) out.push(...applyGain({ dice: zd }));
    if (hasFx('zoneMutate', r)) out.push(mutate());
    if (gradeOf(r) >= 2 && r.floor === 2) out.push(...applyGain({ curse: 1 }));
    // 긴급 수송에서 돌아옴: 랭크 상승 · 거부반응 치료 + 보급품
    for (const a of (r.away || []).filter((x) => x.floor < r.floor)) {
      const o = r.ops.find((x) => x.id === a.id);
      if (o && !o.promoted && maxElite(OPS[o.id]) >= 2 && (o.temp || TRAIN.prog(o.id).elite >= 2)) { o.promoted = true; o.skill = undefined; }
      if (o && o.mut && !o.evo) o.mut = null;
      out.push(`${OPS[a.id].name} 복귀`, ...applyGain({ ingot: 5 }));
    }
    r.away = (r.away || []).filter((a) => a.floor >= r.floor);
    const vi = r.vari && X2.variations.find((v) => v.id === r.vari);
    toast(`${r.floor + 1}층 — ${D.floors[r.floor].name}${vi ? ` · 메아리: ${vi.name}` : ''}${out.filter(Boolean).length ? ' · ' + out.filter(Boolean).join(', ') : ''}`);
    // 심해 진입: 등불에 따라 주사위 판정
    if (r.floor >= DEEP) r.pending = { kind: 'dice', roll: null };
    save();
    refresh();
    resumePanel();
  }

  // ---------- 주사위 (심해 진입 · 소원성취 · 떠내려온 상자 · 조우 · 상인) ----------
  // 적재적소 분대 상위 단계가 아니면 6면 주사위
  const diceFace = () => 6;
  const roll = () => { const v = 1 + rand(diceFace()); track('diceUse'); if (v >= 6) track('roll6'); return v; };
  // 심해 진입 판정: 원작 diceEvents (밝음: 6+ 계시 / 흔들림: 3 이하 거부반응 / 희미함: 5 이하 거부반응 / 꺼짐: 5 이하 2명, 그 외 1명)
  function deepResult(v, st) {
    if (st === 0) return v >= 6 ? { cls: 'great', text: '고난 속에서 계시 획득', gain: { virtue: 1 } } : { cls: 'good', text: X2.dice.rogue_2_diceEve_2, reroll: true };
    if (st === 1) return v <= 3 ? { cls: 'bad', text: '오퍼레이터 1명이 거부반응 발동', gain: { mutate: 1 }, reroll: true } : { cls: 'good', text: X2.dice.rogue_2_diceEve_3 };
    if (st === 2) return v <= 5 ? { cls: 'bad', text: '오퍼레이터 1명이 거부반응 발동', gain: { mutate: 1 }, reroll: true } : { cls: 'good', text: X2.dice.rogue_2_diceEve_5 };
    return v <= 5 ? { cls: 'verybad', text: '오퍼레이터 2명이 거부반응 발동', gain: { mutate: 2 }, reroll: true } : { cls: 'bad', text: '오퍼레이터 1명이 거부반응 발동', gain: { mutate: 1 } };
  }
  function showDice() {
    const r = R(), p = r.pending, st = lightState();
    if (p.roll == null) { p.roll = roll(); save(); }
    const res = deepResult(p.roll, st);
    panel(`<div class="isp-head"><small>심해 진입 · 등불 &lt;${LIGHT_NAME[st]}&gt; ${r.light}</small><b>주사위 판정</b></div>
      <p class="isp-text">${esc(X2.san[st].desc)}</p>
      <div class="is-dice r-${res.cls}"><i>${p.roll}</i><small>d${diceFace()}</small></div>
      <p class="isp-text gain">${esc(res.text)}</p>
      <div class="panel-btns">${res.reroll ? `<button class="btn" data-act="reroll" ${r.dice > 0 ? '' : 'disabled'}>다시 굴리기 · 주사위 1 (보유 ${r.dice})</button>` : ''}<button class="btn primary big" data-act="dice-ok">확인</button></div>`);
  }

  // ---------- 작전 ----------
  function stageFor(node) {
    const r = R(), B = D.battles[node.battle], f = r.floor;
    const emer = node.type === 'emergency' || node.hard;
    const waves = [...B.waves, ...(emer ? B.extra || [] : [])];
    const scale = D.floorScale[f] * (emer ? D.emergencyScale : 1), em = battleMods(r).enemy || {};
    const ids = new Set(waves.map((w) => w.enemy));
    for (const id of [...ids]) if (ENEMIES[id] && ENEMIES[id].summon) ids.add(ENEMIES[id].summon.enemy);
    const enemies = {};
    const mul = (k) => Math.max(0.3, 1 + (em[k] || 0));
    for (const id of ids) {
      const e = ENEMIES[id];
      if (!e) continue;
      const elite = e.elite || e.boss, boss = e.boss;
      const aspd = (em.aspd || 0) + (boss ? 0 : em.nonBossAspd || 0);
      enemies[id] = {
        ...e,
        hp: Math.round(e.hp * scale * mul('hp') * (elite ? 1 + (em.eliteHp || 0) : 1)),
        atk: Math.round(e.atk * scale * mul('atk') * (elite ? 1 + (em.eliteAtk || 0) : 1) * (boss ? 1 + (em.bossAtk || 0) : 1)),
        def: Math.round(e.def * Math.min(1, 0.7 + 0.3 * scale) * mul('def') * (elite ? 1 + (em.eliteDef || 0) : 1) * (boss ? 1 + (em.bossDef || 0) : 1)),
        res: Math.min(95, (e.res || 0) + (em.res || 0)), speed: e.speed * mul('speed'),
        interval: e.interval / Math.max(0.2, 1 + aspd / 100),
      };
    }
    return {
      st: { code: `${f + 1}-${colOf(node.id) + 1}`, name: (emer ? '긴급 · ' : '') + B.name, map: B.map, waves, startDp: B.startDp, deployLimit: B.deployLimit, theme: 'sea' },
      enemies,
    };
  }
  function showBattle(node) {
    const r = R(), t = NODE[node.type], { st, enemies } = stageFor(node);
    const bm = battleMods();
    panel(`<div class="isp-head t-${node.type}"><small>${t.en} · ${st.code}</small><b>${esc(st.name)}</b></div>
      ${node.type === 'emergency' || node.hard ? '<p class="isp-text warn">긴급 작전: 적이 더 많고 강하지만, 보상으로 소장품을 고를 수 있습니다.</p>' : ''}
      ${node.type === 'boss' ? `<p class="isp-text warn">${esc(nodeDesc('boss'))}</p>` : ''}
      <p class="isp-text">목표 HP <b>${r.life}</b>${r.shield ? ` · 실드 ${r.shield}` : ''} · 편성 ${lineup().length}/${squadCap()}명 · 배치 가능 인원 ${st.deployLimit + bm.deployLimit} · 시작 코스트 ${st.startDp + bm.startDp} · 등불 ${r.light}</p>
      <div class="enemy-list is-enemies">${UI.enemyRowsHTML(st.waves, enemies)}</div>
      <div class="panel-btns">
        <button class="btn" data-act="map-preview">맵 보기</button>
        <button class="btn" data-act="squad">분대</button>
        ${node.fromEvent ? '' : '<button class="btn" data-act="back">돌아가기</button>'}
        <button class="btn primary big" data-act="form">편성 · 작전 개시</button>
      </div>`, 'wide');
  }
  // 이번 작전에 데려갈 오퍼레이터 (편성 가능 인원수까지, 긴급 수송 중인 오퍼레이터 제외)
  function lineup(r = R()) {
    const cap = squadCap(r), ids = r.ops.filter((o) => !isAway(o.id, r)).map((o) => o.id);
    const l = r.lineup ? r.lineup.filter((id) => ids.includes(id)) : ids;
    return l.slice(0, cap);
  }
  function startBattle(node) {
    const r = R(), l = lineup();
    // 임연부: 층마다 첫 작전에 들어갈 때 모집권 1장
    if (hasFx('floorTicket') && r.floorTicketAt !== r.floor) { r.floorTicketAt = r.floor; const k = randTicket(); r.tickets.push(k); r.recruitNow = true; toast(`임연부 — ${D.tickets[k].name} 획득`); }
    const defs = r.ops.filter((o) => l.includes(o.id)).map((o) => runDef(o)).filter(Boolean);
    if (!defs.length) { toast('분대에 오퍼레이터가 없습니다'); return; }
    const { st, enemies } = stageFor(node);
    hidePanel();
    sfx('select');
    window.Battle.begin(st, null, {
      defs, life: r.life, maxLife: r.life, shield: r.shield, enemies, mods: battleMods(), hard: ['emergency', 'boss'].includes(node.type) || node.hard,
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
    let lost = r.life - res.life, lostShield = r.shield - res.shield;
    let life = res.life, shield = res.shield;
    // 메아리 「과잉」: 잃는 목표 HP · 실드 2배 (전투를 이긴 뒤라 목표 HP는 1까지만)
    if (r.vari === 'variation_7') {
      const xs = Math.min(shield, lostShield), xl = Math.min(Math.max(0, life - 1), lost);
      shield -= xs; life -= xl; lost += xl; lostShield += xs;
    }
    r.life = life;
    r.shield = shield;
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
    if (r.floor >= 2 && big) rec().unlock.zone3 = true;
    // 등불: 완벽한 작전이 아니거나 목표 HP가 절반 미만이면 감소 (메아리 「탐색」 2배)
    let dl = 0;
    if (res.leaked) dl += 5;
    if (r.life < r.maxLife / 2) dl += 5;
    dl += sumFx('lightLoss');
    if (r.vari === 'variation_1') dl *= 2;
    const lightTxt = [];
    if (dl) { addLight(-dl); lightTxt.push(`등불 -${dl}`); }
    const lp = sumFx('lightPerfect');
    if (lp && !lost) { const g = addLight(lp); if (g) lightTxt.push(`등불 +${g}`); }
    let ingot = [3, 4, 5, 6][f] + (res.leaked ? 0 : 2) + (big ? 3 : 0);
    if (kind === 'emergency' || node.hard) ingot = Math.round(ingot * 1.5);
    ingot = Math.round(ingot * (1 + sumFx('ingotRate')) * (r.vari === 'variation_4' ? 2 : 1));
    const exp = Math.round((kind === 'battle' ? 1 : kind === 'emergency' ? 2 : 3) * (1 + sumFx('expRate')) * 10) / 10;
    const got = [...applyGain({ ingot, exp }), ...lightTxt];
    if (r.vari === 'variation_7') got.push(...applyGain({ maxLife: 1 }));
    // 계시 「발상」: 전투 종료 후 지휘 경험치 추가 (1회)
    if (r.virtues.includes('virtue_3') && !r.flags.idea) { r.flags.idea = true; got.push(...applyGain({ exp: 20 })); }
    // 지역 의뢰 진행
    const cls = r.ops.filter((o) => lineup().includes(o.id)).map((o) => OPS[o.id].class);
    track('battles'); track('noClass', 1, cls); track('kills', res.killed || 0); track('seaKills', res.killed || 0);
    const items = [];
    const xr = sumFx('extraRelic'), xt = sumFx('extraTicket');
    if (kind === 'emergency' || node.hard) items.push({ type: 'relic', choices: relicChoices(3 + xr) });
    if (kind === 'gate') items.push({ type: 'relic', choices: relicChoices(2 + xr) });
    if (kind === 'boss') items.push({ type: 'relic', choices: relicChoices(3 + xr, 'rare') });
    // 마음가짐 분대: 전투 후 일정 확률로 추가 소장품
    if (Math.random() < sumFx('extraRelicChance')) items.push({ type: 'relic', choices: relicChoices(1) });
    if (kind !== 'battle' || Math.random() < 0.6) {
      const ch = [];
      for (let i = 0; i < 20 && ch.length < 3 + xt; i++) { const k = randTicket(kind !== 'battle'); if (!ch.includes(k)) ch.push(k); }
      if (kind === 'boss') ch.push('premium');
      items.push({ type: 'ticket', choices: ch });
    }
    // 메아리 「급양」: 30% 확률로 모집권 추가
    if (r.vari === 'variation_5' && Math.random() < 0.3) items.push({ type: 'ticket', choices: [randTicket(), randTicket()] });
    // 떠내려온 상자 (열쇠로 열기)
    if (Math.random() < 0.2) items.push({ type: 'chest' });
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
      const nm = it.type === 'relic' ? '소장품' : it.type === 'chest' ? '떠내려온 상자' : '모집권';
      if (it.taken != null) return `<div class="is-reward taken"><b>${nm}</b><span>${esc(it.takenText || '')}</span></div>`;
      if (it.type === 'relic') return `<div class="is-reward"><b>소장품 — 하나를 고르세요</b><div class="relic-grid">${it.choices.map((id) => relicHTML(relicById(id), `<button class="btn small primary" data-act="take-relic" data-i="${i}" data-id="${esc(id)}">획득</button>`)).join('')}</div></div>`;
      if (it.type === 'chest') return `<div class="is-reward chest"><img src="img/is/treasure.png" alt=""><b>떠내려온 상자</b><span>안에 뭔가 들어있다. 열쇠 1개로 열고 주사위를 굴립니다 (5 이상: 소장품 / 4 이하: 코인 몇 닢)</span><button class="btn small primary" data-act="open-chest" data-i="${i}" ${r.key > 0 ? '' : 'disabled'}>열쇠로 연다 (보유 ${r.key})</button></div>`;
      return `<div class="is-reward"><b>모집권 — 하나를 고르세요</b><div class="is-tickets">${it.choices.map((k) => `<button class="btn" data-act="take-ticket" data-i="${i}" data-id="${k}" title="${esc(D.tickets[k].desc || '')}">${esc(D.tickets[k].name)}</button>`).join('')}</div></div>`;
    }).join('');
    panel(`<div class="isp-head"><small>REWARD</small><b>작전 보상${p.perfect ? ' <span class="perfect">완벽한 작전</span>' : ''}</b></div>
      <p class="isp-text">${p.got.map(esc).join(' · ')}</p>
      ${items}
      <div class="panel-btns"><button class="btn primary big" data-act="reward-done">탐색 계속</button></div>`, 'wide');
  }

  // ---------- 우연한 만남 (원작 조우 · 글 원문 그대로) ----------
  function canPay(cost) {
    const r = R();
    if (!cost) return true;
    if (cost.allIngot) return true;
    return (cost.ingot || 0) <= r.ingot && (cost.hope || 0) <= r.hope && (cost.life || 0) < r.life && (cost.key || 0) <= r.key && (cost.dice || 0) <= r.dice && (cost.light || 0) <= r.light;
  }
  function pay(cost) {
    const r = R();
    if (!cost) return [];
    const out = [];
    if (cost.allIngot) { out.push(`오리지늄각뿔 -${r.ingot}`); track('ingotSpend', r.ingot); r.ingot = 0; }
    if (cost.ingot) { r.ingot -= cost.ingot; track('ingotSpend', cost.ingot); out.push(`오리지늄각뿔 -${cost.ingot}`); }
    if (cost.hope) { r.hope -= cost.hope; out.push(`희망 -${cost.hope}`); }
    if (cost.life) { r.life -= cost.life; out.push(`목표 HP -${cost.life}`); }
    if (cost.key) { r.key -= cost.key; track('keyUse', cost.key); out.push(`열쇠 -${cost.key}`); }
    if (cost.dice) { r.dice -= cost.dice; track('diceUse', cost.dice); out.push(`주사위 -${cost.dice}`); }
    if (cost.light) { r.light -= cost.light; out.push(`등불 -${cost.light}`); }
    return out;
  }
  const needOk = (need) => !need || (need.relic ? R().relics.includes(need.relic) : need.flag ? !!R().flags[need.flag] : true);
  function showEvent(node) {
    const ev = X2.events.find((x) => x.id === node.event) || X2.events[0];
    if (node.done) {
      panel(`<div class="isp-head t-event"><small>${esc(nodeName('event'))}</small><b>${esc(ev.title)}</b></div>
        ${node.result ? `<p class="isp-text story">${esc(node.result)}</p>` : ''}<p class="isp-text gain">${esc((node.resultGain || []).join(' · ') || '변화 없음')}</p>
        <div class="panel-btns"><button class="btn primary big" data-act="leave">계속</button></div>`, '', ev.bg);
      return;
    }
    const sc = node.scene ? ev.scenes[node.scene] : ev;
    panel(`<div class="isp-head t-event"><small>${esc(nodeName('event'))}</small><b>${esc(ev.title)}</b></div>
      <p class="isp-text story">${esc(sc.text)}</p>
      <div class="is-choices">${sc.choices.map((c, i) => {
        const ok = canPay(c.cost) && needOk(c.need);
        const why = !needOk(c.need) ? (c.need.relic ? `「${(relicById(c.need.relic) || {}).name || ''}」 필요` : '조건 부족') : '조건 부족';
        return `<button class="is-choice" data-act="choose" data-i="${i}" ${ok ? '' : 'disabled'}><b>${esc(c.label)}</b><span>${esc(c.desc || '')}${c.roll ? ` (주사위 ${c.roll.min} 이상)` : ''}</span>${ok ? '' : `<em>${esc(why)}</em>`}</button>`;
      }).join('')}</div>`, '', ev.bg);
  }

  // ---------- 교활한 상인 ----------
  function showShop(node) {
    const r = R(), rc = rec();
    if (!node.stock) {
      const relics = relicChoices(4);
      node.stock = [...relics.map((id) => ({ kind: 'relic', id, price: relicById(id).price || 8 })), { kind: 'ticket', price: 6 }, { kind: 'life', price: 5 }];
      save();
    }
    panel(`<div class="isp-head t-shop"><small>${NODE.shop.en}</small><b>${esc(nodeName('shop'))}</b></div>
      <p class="isp-text">${esc(nodeDesc('shop'))}<br>오리지늄각뿔 <b>${r.ingot}</b> 보유${sumFx('shopDiscount') ? ` · 할인 ${Math.round(Math.min(0.5, sumFx('shopDiscount')) * 100)}%` : ''} · 투자금 <b>${rc.bank}</b>/999 (탐색이 끝나도 남음)</p>
      <div class="is-shop">${node.stock.map((s, i) => {
        const price = shopPrice(s.price), ok = !s.sold && r.ingot >= price;
        const btn = s.sold ? '<button class="btn small" disabled>구매 완료</button>' : `<button class="btn small primary" data-act="buy" data-i="${i}" ${ok ? '' : 'disabled'}>◆ ${price}</button>`;
        if (s.kind === 'relic') return relicHTML(relicById(s.id), btn);
        if (s.kind === 'ticket') return `<div class="relic r-ticket"><i class="relic-img"></i><div class="relic-no">모집</div><b>무작위 모집권</b><span>직군 모집권 1장</span>${btn}</div>`;
        return `<div class="relic r-life"><i class="relic-img"></i><div class="relic-no">보급</div><b>응급 보급품</b><span>목표 HP +2</span>${btn}</div>`;
      }).join('')}</div>
      <div class="panel-btns">
        <button class="btn" data-act="shop-roll" ${r.dice > 0 && !node.rolled ? '' : 'disabled'}>주사위로 흥정 (주사위 1)</button>
        <button class="btn" data-act="invest" ${r.ingot > 0 && rc.bank < 999 ? '' : 'disabled'}>투자 (오리지늄각뿔 1)</button>
        <button class="btn" data-act="withdraw" ${r.key > 0 && rc.bank > 0 ? '' : 'disabled'}>투자금 인출 (열쇠 1 → 최대 8)</button>
        <button class="btn" data-act="squad">분대</button><button class="btn primary big" data-act="leave">떠나기</button></div>`, 'wide');
  }

  // ---------- 안전한 곳 (원작 6종 중 3종) ----------
  function showRest(node) {
    const S0 = X2.rest;
    if (!node.opts) { node.opts = shuffle([0, 1, 2, 3, 4, 5]).slice(0, 3); save(); }
    panel(`<div class="isp-head t-rest"><small>${NODE.rest.en}</small><b>${esc(nodeName('rest'))}</b></div>
      <p class="isp-text story">${esc(S0.text || nodeDesc('rest'))}</p>
      <div class="is-choices">${node.opts.map((i) => `<button class="is-choice" data-act="rest" data-k="${i}"><b>${esc(S0.choices[i].label)}</b><span>${esc(S0.choices[i].desc)}</span></button>`).join('')}</div>`, '', S0.bg);
  }
  // ---------- 소원성취: 소장품 하나를 골라 주사위 (1: 실패 · 2~5: 획득 · 6 이상: 소장품 1개 더) ----------
  function showWish(node) {
    const r = R(), W = X2.wish;
    if (!node.relics) { node.relics = relicChoices(3); save(); }
    if (node.wished) {
      panel(`<div class="isp-head t-wish"><small>${esc(nodeName('wish'))}</small><b>${esc(W.title)}</b></div>
        <div class="is-dice r-${node.cls}"><i>${node.roll}</i><small>d${diceFace()}</small></div>
        <p class="isp-text gain">${esc(node.result)}</p>
        <div class="panel-btns">${node.cls === 'bad' ? `<button class="btn" data-act="wish-reroll" ${r.dice > 0 ? '' : 'disabled'}>다시 굴리기 · 주사위 1 (보유 ${r.dice})</button>` : ''}<button class="btn primary big" data-act="leave">계속</button></div>`, '', W.bg);
      return;
    }
    panel(`<div class="isp-head t-wish"><small>${esc(nodeName('wish'))}</small><b>${esc(W.title)}</b></div>
      <p class="isp-text story">${esc(W.text)}</p>
      <div class="relic-grid">${node.relics.map((id) => relicHTML(relicById(id), `<button class="btn small primary" data-act="wish" data-id="${esc(id)}">${esc(W.label)}</button>`)).join('')}</div>
      <div class="panel-btns"><button class="btn" data-act="leave">떠난다</button></div>`, 'wide', W.bg);
  }
  function wishRoll(node) {
    const r = R(), v = roll();
    node.roll = v;
    if (v <= 1) { node.cls = 'bad'; node.result = X2.dice.rogue_2_diceEve_20; return; }
    const out = [addRelic(node.wished)];
    if (v >= 6) { out.push(...applyGain({ relic: 1 })); node.cls = 'great'; node.result = `${X2.dice.rogue_2_diceEve_18} — ${out.join(', ')}`; }
    else { node.cls = 'good'; node.result = `${X2.dice.rogue_2_diceEve_19} — ${out.join(', ')}`; }
    // 메아리 「적응」: 이 구역의 첫 소원성취에서 소장품 1개 추가
    if (r.vari === 'variation_8' && r.flags.adaptWish !== r.floor) { r.flags.adaptWish = r.floor; node.result += ', ' + applyGain({ relic: 1 }).join(', '); }
  }
  // ---------- 흥미진진: 코인 기계 (원작 「코인을 투입한다」) ----------
  function showEnt(node) {
    const r = R(), E = X2.ent;
    node.coins = node.coins || 0;
    panel(`<div class="isp-head t-ent"><small>${esc(nodeName('ent'))}</small><b>${esc(E.title)}</b></div>
      <p class="isp-text story">${esc(E.text)}</p>
      ${node.last ? `<p class="isp-text gain">${esc(node.last)}</p>` : ''}
      <div class="panel-btns">
        <button class="btn primary" data-act="coin" ${r.ingot >= E.coin.cost && node.coins < E.coin.max ? '' : 'disabled'}>${esc(E.coin.label)} (오리지늄각뿔 ${E.coin.cost}) · ${node.coins}/${E.coin.max}</button>
        <button class="btn" data-act="leave">${esc(E.coin.leave)}</button></div>`, '', E.bg);
  }
  // ---------- 풍운제회: 소장품을 내주고 교환 (심해에서 등불 <밝음>이면 계시) ----------
  function showSacrifice(node) {
    const r = R(), Sx = X2.sacrifice;
    if (node.result) {
      panel(`<div class="isp-head t-sacrifice"><small>${esc(nodeName('sacrifice'))}</small><b>${esc(Sx.title)}</b></div>
        <p class="isp-text story">${esc(node.result)}</p><p class="isp-text gain">${esc((node.resultGain || []).join(' · ') || '변화 없음')}</p>
        <div class="panel-btns"><button class="btn primary big" data-act="leave">계속</button></div>`, '', Sx.bg);
      return;
    }
    const give = r.relics.filter((id) => relicById(id) && relicById(id).rarity !== 'curse');
    const bright = r.floor >= DEEP && lightState() === 0;
    panel(`<div class="isp-head t-sacrifice"><small>${esc(nodeName('sacrifice'))}</small><b>${esc(Sx.title)}</b></div>
      <p class="isp-text story">${esc(Sx.text)}</p>
      <p class="isp-text">${bright ? '등불이 &lt;밝음&gt; — 소장품을 건네면 <b>계시</b>를 얻습니다.' : '소장품을 건네면 더 귀한 소장품을 얻습니다. (심해에서 등불이 &lt;밝음&gt;이면 계시)'}</p>
      ${give.length ? `<div class="relic-grid">${give.map((id) => relicHTML(relicById(id), `<button class="btn small primary" data-act="sac-give" data-id="${esc(id)}">${esc(Sx.trade[0])}</button>`)).join('')}</div>` : ''}
      <div class="panel-btns"><button class="btn" data-act="sac-rest">${esc(Sx.rest[0])} · ${esc(Sx.rest[1])}</button></div>`, 'wide', Sx.bg);
  }
  // ---------- 긴급 수송: 오퍼레이터 파견(다음 구역에 랭크 상승 · 거부반응 치료 후 복귀) 또는 희망 3 ----------
  function showExpedition(node) {
    const r = R(), Ex = X2.expedition;
    if (node.result) {
      panel(`<div class="isp-head t-expedition"><small>${esc(nodeName('expedition'))}</small><b>${esc(Ex.title)}</b></div>
        <p class="isp-text story">${esc(node.result)}</p><p class="isp-text gain">${esc((node.resultGain || []).join(' · '))}</p>
        <div class="panel-btns"><button class="btn primary big" data-act="leave">계속</button></div>`, '', Ex.bg);
      return;
    }
    const cand = r.ops.filter((o) => !isAway(o.id));
    panel(`<div class="isp-head t-expedition"><small>${esc(nodeName('expedition'))}</small><b>${esc(Ex.title)}</b></div>
      <p class="isp-text story">${esc(Ex.text)}</p>
      <p class="isp-text">${esc(Ex.send[0])}: 이번 구역 동안 팀을 떠났다가, 다음 구역에서 <b>랭크 상승</b>(가능한 경우) · 거부반응 치료 · 오리지늄각뿔 5와 함께 복귀합니다.</p>
      <div class="is-tickets">${cand.length > 1 ? cand.map((o) => `<button class="btn" data-act="exp-send" data-id="${esc(o.id)}">${esc(OPS[o.id].name)}</button>`).join('') : ''}</div>
      <div class="panel-btns"><button class="btn primary" data-act="exp-support">${esc(Ex.support[0])} · ${esc(Ex.support[1])}</button></div>`, 'wide', Ex.bg);
  }
  // ---------- 지역 의뢰 (튤립의 의뢰): 난이도별 의뢰 하나를 받아 완료하면 보상 선택 ----------
  function showMission(node) {
    const r = R(), T = X2.task;
    if (r.task) {
      panel(`<div class="isp-head t-mission"><small>${esc(nodeName('mission'))}</small><b>${esc(T.title)}</b></div>
        <p class="isp-text">당신은 눈앞의 문제를 처리하는 데 전념했다. 의뢰를 처리할 여력이 없다. (진행 중: ${esc(r.task.name)})</p>
        <div class="panel-btns"><button class="btn primary big" data-act="leave">계속</button></div>`, '', T.bg);
      return;
    }
    if (!node.tasks) { node.tasks = [1, 2, 3].map((tier) => pick(X2.tasks.filter((t) => t.tier === tier)).id); save(); }
    panel(`<div class="isp-head t-mission"><small>${esc(nodeName('mission'))}</small><b>${esc(T.title)}</b></div>
      <p class="isp-text story">${esc(T.text)}</p>
      <div class="is-choices">${node.tasks.map((id, i) => { const t = X2.tasks.find((x) => x.id === id); return `<button class="is-choice" data-act="task-take" data-id="${id}"><b>${esc(T.labels[i])} — ${esc(t.name)}</b><span>${esc(t.desc)}</span></button>`; }).join('')}
        <button class="is-choice" data-act="leave"><b>${esc(T.leave)}</b></button></div>`, '', T.bg);
  }
  function openTask() {
    const r = R(), t = r.task;
    if (!t) return;
    if (t.done && !t.claimed) { showTaskReward(); return; }
    openModal(`<div class="modal-title">지역 의뢰 — ${esc(t.name)}</div><div class="modal-sub">${esc(t.desc)}</div><p class="modal-text">진행 ${t.prog || 0} / ${t.goal}</p>`);
  }
  function showTaskReward() {
    const r = R(), t = r.task, list = X2.taskRewards[String(t.tier)];
    panel(`<div class="isp-head t-mission"><small>${esc(nodeName('mission'))}</small><b>${esc(X2.task.title)} — ${esc(t.name)}</b></div>
      <p class="isp-text">${esc(X2.task.reward)}</p>
      <div class="is-choices">${list.map((x, i) => `<button class="is-choice" data-act="task-reward" data-i="${i}"><b>의뢰 완료</b><span>${esc(x.desc)}</span></button>`).join('')}</div>`, '', X2.task.bg);
  }
  // ---------- 거부반응 억제: 오퍼레이터 1명 선택 ----------
  function showPurify() {
    const r = R(), list = r.ops.filter((o) => o.mut && !o.evo);
    panel(`<div class="isp-head"><small>거부반응 억제 · ${r.purify}회</small><b>거부반응을 억제할 오퍼레이터</b></div>
      <div class="is-tickets">${list.map((o) => `<button class="btn" data-act="purify" data-id="${esc(o.id)}">${esc(OPS[o.id].name)} — ${esc(mutInfo(o.mut).name)}</button>`).join('')}</div>`);
  }

  // ---------- 버튼 동작 ----------
  function onAct(act, el) {
    const r = R(), node = r.at && findNode(r.at);
    if (act === 'group') {
      const g = D.recruitGroups.find((x) => x.id === el.dataset.k);
      if (!g) return;
      if (g.random) { const cl = shuffle(CLASS_IDS).slice(0, g.random); r.tickets.push(cl[0] + '_sp', ...cl.slice(1)); } else r.tickets.push(...g.tickets);
      // 고급화 분대: 초기 모집 시 랜덤 정예 모집권 1장
      if (hasFx('vipTicket')) r.tickets.push(pick(CLASS_IDS) + '_vip');
      r.needGroup = false; r.recruitNow = true; r.offer = null;
      sfx('select');
      save(); refresh(); resumePanel();
      return;
    }
    if (act === 'startbuff') {
      const k = START_GAIN[+el.dataset.k];
      let txt;
      if (k === 'allIngotRelic') { r.ingot = 0; txt = applyGain({ relic: 1 }); }
      else if (k === 'hopeRelic') { r.hope = Math.max(0, r.hope - 1); txt = ['희망 -1', ...applyGain({ relic: 1 })]; }
      else txt = applyGain(k);
      toast(txt.join(', '));
      r.needStart = false;
      sfx('select');
      save(); refresh(); resumePanel();
      return;
    }
    if (act === 'reroll') { if (r.dice < 1) return; r.dice--; r.pending.roll = null; sfx('select'); save(); refresh(); showDice(); return; }
    if (act === 'dice-ok') {
      const res = deepResult(r.pending.roll, lightState());
      r.pending = null;
      const txt = res.gain ? applyGain(res.gain) : [];
      if (txt.length) toast(txt.join(', '));
      save(); refresh(); resumePanel();
      return;
    }
    if (act === 'purify') {
      const o = r.ops.find((x) => x.id === el.dataset.id);
      if (o) { o.mut = null; r.purify--; toast(`${OPS[o.id].name} 거부반응 억제`); }
      if (!r.ops.some((x) => x.mut && !x.evo)) r.purify = 0;
      save(); refresh(); resumePanel();
      return;
    }
    if (act === 'task-reward') {
      const g = X2.taskRewards[String(r.task.tier)][+el.dataset.i];
      r.task = null;
      toast(applyGain(g.gain).join(', '));
      save(); refresh(); resumePanel();
      return;
    }
    if (act === 'back') { r.at = null; save(); hidePanel(); refresh(); return; }
    if (act === 'fight') { startBattle(node); return; }
    if (act === 'form') { openForm(node); return; }
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
      const ev = X2.events.find((x) => x.id === node.event), sc = node.scene ? ev.scenes[node.scene] : ev, c = sc.choices[+el.dataset.i];
      if (!canPay(c.cost) || !needOk(c.need)) return;
      const paid = pay(c.cost);
      if (c.goto) { node.scene = c.goto; node.paid = [...(node.paid || []), ...paid]; save(); refresh(); showEvent(node); return; }
      if (c.battle) {
        // 조우 전투: 이 층의 작전 맵에서 긴급 작전으로
        node.type = 'battle'; node.hard = true; node.fromEvent = true;
        assignNode(node, D.floors[r.floor], r.floor, r.used);
        save(); refresh(); showBattle(node);
        return;
      }
      let ok = c.chance == null || Math.random() < c.chance, got;
      if (c.roll) { const v = roll(); ok = v >= c.roll.min; got = [`주사위 ${v}`, ...applyGain(ok ? c.roll.gain : c.roll.fail)]; }
      else got = applyGain(ok ? c.gain : c.fail);
      node.done = true;
      node.result = c.result || '';
      node.resultGain = [...(node.paid || []), ...paid, ...got];
      sfx(ok ? 'select' : 'hurt');
      save(); refresh(); resumePanel();
      return;
    }
    if (act === 'buy') {
      const s = node.stock[+el.dataset.i], price = shopPrice(s.price);
      if (s.sold || r.ingot < price) return;
      r.ingot -= price; track('ingotSpend', price);
      s.sold = true;
      const txt = s.kind === 'relic' ? addRelic(s.id) : applyGain(s.kind === 'ticket' ? { ticket: 1 } : { life: 2 }).join(', ');
      toast(txt);
      sfx('select');
      save(); refresh();
      if (r.recruitNow && r.tickets.length) showRecruit(); else showShop(node);
      return;
    }
    if (act === 'shop-roll') {
      // 원작 교활한 상인 주사위: 4 이하 새 상품 2개 · 5~6 새로 입고한 상품 · 7 이상 상등품
      if (r.dice < 1 || node.rolled) return;
      r.dice--; node.rolled = true;
      const v = roll();
      const add = v >= 7 ? relicChoices(2, 'special') : v >= 5 ? relicChoices(3, 'rare') : relicChoices(2);
      node.stock.push(...add.map((id) => ({ kind: 'relic', id, price: relicById(id).price || 8 })));
      toast(`주사위 ${v} — ${v >= 7 ? X2.dice.rogue_2_diceEve_9 : v >= 5 ? X2.dice.rogue_2_diceEve_10 : X2.dice.rogue_2_diceEve_11}`);
      save(); refresh(); showShop(node);
      return;
    }
    if (act === 'invest') { if (r.ingot < 1) return; r.ingot--; rec().bank = Math.min(999, rec().bank + 1); track('ingotSpend'); save(); refresh(); showShop(node); return; }
    if (act === 'withdraw') {
      if (r.key < 1 || rec().bank < 1) return;
      r.key--; track('keyUse');
      const n = Math.min(8, rec().bank); rec().bank -= n; r.ingot += n;
      toast(`투자금 인출 — 오리지늄각뿔 +${n}`);
      save(); refresh(); showShop(node);
      return;
    }
    if (act === 'rest') {
      const k = +el.dataset.k;
      let txt;
      if (k === 3) { r.squadBonus = (r.squadBonus || 0) + 1; txt = '편성 가능 인원수 +1'; }
      else if (k === 1) {
        // 랭크 상승권: 분대에 랭크 상승할 수 있는 오퍼레이터가 있는 직군 우선
        const want = r.ops.filter((o) => canRankUp(o).ok).map((o) => OPS[o.id].class);
        txt = applyGain({ promoteClass: want.length ? pick(want) : pick(CLASS_IDS) }).join(', ');
      } else txt = applyGain([{ maxLife: 3 }, null, { hope: 3 }, null, { dice: 2 }, { light: 15 }][k]).join(', ');
      toast(txt);
      finishNode(node);
      if (k === 1) openSquad();
      return;
    }
    if (act === 'wish') { if (node.wished) return; node.wished = el.dataset.id; wishRoll(node); sfx('select'); save(); refresh(); showWish(node); return; }
    if (act === 'wish-reroll') { if (r.dice < 1) return; r.dice--; wishRoll(node); save(); refresh(); showWish(node); return; }
    if (act === 'coin') {
      const E = X2.ent.coin;
      if (r.ingot < E.cost || node.coins >= E.max) return;
      r.ingot -= E.cost; track('ingotSpend', E.cost); node.coins++;
      const tot = E.prizes.reduce((s, p) => s + p.w, 0);
      let x = Math.random() * tot, pz = E.prizes[0];
      for (const p of E.prizes) { if ((x -= p.w) < 0) { pz = p; break; } }
      node.last = `${pz.label}${Object.keys(pz.gain).length ? ' — ' + applyGain(pz.gain).join(', ') : ''}`;
      sfx('select'); save(); refresh(); showEnt(node);
      return;
    }
    if (act === 'sac-give') {
      const id = el.dataset.id, x = relicById(id);
      if (!x || !r.relics.includes(id)) return;
      r.relics = r.relics.filter((y) => y !== id);
      const bright = r.floor >= DEEP && lightState() === 0;
      const got = bright ? applyGain({ virtue: 1 }) : applyGain({ relic: x.rarity === 'common' ? 'rare' : 'special' });
      node.result = X2.sacrifice.tradeResult; node.resultGain = [`「${x.name}」 건넴`, ...got];
      save(); refresh(); showSacrifice(node);
      return;
    }
    if (act === 'sac-rest') { node.result = X2.sacrifice.restResult; node.resultGain = applyGain({ life: 4 }); save(); refresh(); showSacrifice(node); return; }
    if (act === 'exp-send') {
      const id = el.dataset.id;
      r.away = [...(r.away || []), { id, floor: r.floor }];
      if (r.lineup) r.lineup = r.lineup.filter((x) => x !== id);
      node.result = X2.expedition.sendResult; node.resultGain = [`${OPS[id].name} 파견 — 다음 구역에서 복귀`];
      save(); refresh(); showExpedition(node);
      return;
    }
    if (act === 'exp-support') { node.result = X2.expedition.supportResult; node.resultGain = applyGain({ hope: 3 }); save(); refresh(); showExpedition(node); return; }
    if (act === 'task-take') {
      const t = X2.tasks.find((x) => x.id === el.dataset.id);
      r.task = { ...t, prog: 0, arg: t.arg && !Array.isArray(t.arg) ? { ...t.arg } : t.arg };
      toast(`지역 의뢰 「${t.name}」 수락`);
      finishNode(node);
      return;
    }
    if (act === 'open-chest') {
      const it = r.pending.items[+el.dataset.i];
      if (it.taken != null || r.key < 1) return;
      r.key--; track('keyUse');
      const v = roll();
      it.taken = 1;
      it.takenText = `주사위 ${v} — ` + (v >= 5 ? `${X2.dice.rogue_2_diceEve_21}: ${applyGain({ relic: 1 }).join(', ')}` : `${X2.dice.rogue_2_diceEve_22}: ${applyGain({ ingot: 3 }).join(', ')}`);
      sfx('select'); save(); refresh(); showReward();
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
      const d = runDef(o), pg = progFor(o), skills = TRAIN.trained(def, pg).skills || [];
      const cur = Math.min(o.skill ?? skills.length - 1, skills.length - 1);
      const cr = canRankUp(o), fi = freeFor(def), c = promoteCost(def);
      const btn = o.promoted ? '' : cr.ok
        ? `<button class="btn small primary" data-sq="promote" data-i="${i}" ${fi >= 0 || r.hope >= c ? '' : 'disabled'}>${fi >= 0 ? `랭크 상승 · ${esc(D.upgradeName(r.freePromotes[fi]))}` : `랭크 상승 · 희망 ${c}`}</button>`
        : `<span class="muted small">${esc(cr.why || '')}</span>`;
      const mi = o.mut && !o.evo && mutInfo(o.mut), ev = o.evo && mutInfo('mutation_19');
      return `<div class="is-op ${o.promoted ? 'promoted' : ''} ${isAway(o.id) ? 'away' : ''}">
        ${cardHTML(def, 'small')}
        <div class="is-op-meta">
          <b>${esc(def.name)} <small>${o.temp ? '임시 모집 · ' : ''}${isAway(o.id) ? '긴급 수송 중 · ' : ''}${o.promoted ? '랭크 상승 완료' : '랭크 상승 전'} · ${eliteText(pg)} · 스킬 Lv.${pg.slv}${pg.mst && pg.mst[cur] ? ` 특화 ${pg.mst[cur]}` : ''}</small></b>
          <span>HP ${d.hp} · 공격 ${d.atk} · 방어 ${d.def} · 코스트 ${d.cost}</span>
          ${mi ? `<span class="is-mut"><img src="${mi.icon}" alt="">거부반응 「${esc(mi.name)}」 — ${esc(mi.desc)}</span>` : ''}${ev ? `<span class="is-mut evo"><img src="${ev.icon}" alt="">「${esc(ev.name)}」 — ${esc(ev.desc)}</span>` : ''}
          <div class="is-skills">${skills.map((sk, k) => `<button class="btn small ${cur === k ? 'primary' : ''}" data-sq="skill" data-i="${i}" data-k="${k}" title="${esc(sk.desc || '')}">S${k + 1} ${esc(sk.name)}</button>`).join('')}</div>
          ${btn}
        </div></div>`;
    }).join('');
    const fp = r.freePromotes.map((k) => D.upgradeName(k)).join(', ');
    openModal(`<div class="modal-title">분대</div><div class="modal-sub">${r.ops.length}명 · 편성 가능 인원수 ${squadCap()} · 희망 ${r.hope}${fp ? ` · 보유: ${esc(fp)}` : ''}<br>랭크 상승 전에는 1차 정예화까지, 랭크 상승하면 계정의 2차 정예화 상태(3스킬 · 특화)를 씁니다</div>
      <div class="is-ops">${rows || '<p class="empty-note">아직 모집한 오퍼레이터가 없습니다.</p>'}</div>`);
    $('#modal-body').querySelectorAll('[data-sq]').forEach((b) => b.addEventListener('click', () => {
      const o = r.ops[+b.dataset.i], def = OPS[o.id];
      if (b.dataset.sq === 'promote') {
        if (!canRankUp(o).ok) return;
        const fi = freeFor(def);
        if (fi >= 0) r.freePromotes.splice(fi, 1);
        else { const c = promoteCost(def); if (r.hope < c) return; r.hope -= c; }
        o.promoted = true;
        o.skill = undefined;   // 랭크 상승하면 기본으로 마지막(3) 스킬
        track('rankUp');
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
  // ---------- 편성 (원작 편성 화면) ----------
  let formNode = null;
  function openForm(node) {
    formNode = node;
    const r = R(), cap = squadCap(), l = lineup();
    const slot = (id) => {
      if (!id) return '<button class="fm-slot empty" data-fm="add"><span>＋</span></button>';
      const o = r.ops.find((x) => x.id === id), def = OPS[id], d = runDef(o), pg = progFor(o);
      const sk = d.skills[0];
      return `<button class="fm-slot" data-fm="del" data-id="${esc(id)}" style="--c:${def.color}">
        <span class="fm-cls">${UI.icon(def.class)}</span><span class="fm-lv"><small>LV</small>${pg.level}</span>
        <span class="fm-art">${def.image ? `<img src="${esc(def.image)}" alt="">` : `<b>${esc(def.name[0])}</b>`}</span>
        <span class="fm-stars">${'★'.repeat(def.rarity || 3)}</span>
        ${sk ? `<span class="fm-sk" data-fm="skill" data-id="${esc(id)}" title="스킬 변경"><img src="${UI.skillIcon(sk, Math.max(0, (def.skills || []).findIndex((x) => x.name === sk.name)), def)}" alt=""><i>${pg.slv}</i></span>` : ''}
        ${o.promoted ? '<span class="fm-pro">랭크 상승</span>' : ''}${o.mut && !o.evo ? '<span class="fm-mut">거부반응</span>' : ''}
        <span class="fm-name">${esc(def.name)}</span></button>`;
    };
    const slots = Array.from({ length: MAX_SQUAD }, (_, i) => (i < cap ? slot(l[i]) : '<div class="fm-slot off"></div>'));
    const colsHTML = [slots.slice(0, 4), slots.slice(4, 9), slots.slice(9)].map((c, i) => `<div class="fm-col c${i}">${c.join('')}</div>`).join('');
    $('#is-form').innerHTML = `
      <div class="fm-top"><button class="nav-btn" data-fm="close" aria-label="뒤로"></button><span class="fm-title">편성</span>
        <button class="fm-quick" data-fm="quick"><b>++</b>빠른 편성</button><button class="fm-clear" data-fm="clear" title="편성 비우기">🗑</button></div>
      <div class="fm-grid">${colsHTML}</div>
      <div class="fm-bottom"><span class="fm-cap"><small>편성 가능 인원수</small><b>${l.length}/${cap}</b></span>
        ${node ? '<button class="fm-start" data-fm="start"><small>MISSION START</small>작전 개시</button>' : '<button class="btn primary big" data-fm="close">확인</button>'}</div>
      <div class="fm-pick hidden" id="fm-pick"></div>`;
    $('#is-form').classList.remove('hidden');
  }
  function formPick() {
    const r = R(), l = lineup();
    const cand = r.ops.filter((o) => !isAway(o.id) && !l.includes(o.id));
    const el = $('#fm-pick');
    el.innerHTML = `<div class="fm-pick-box"><b>편성할 오퍼레이터</b><div class="is-cands">${cand.map((o) => `<button class="is-cand" data-fm="pick" data-id="${esc(o.id)}">${cardHTML(OPS[o.id], 'small')}<small class="is-cand-st">${eliteText(progFor(o))}${o.promoted ? ' · 랭크 상승' : ''}</small></button>`).join('') || '<p class="empty-note">편성할 수 있는 오퍼레이터가 없습니다.</p>'}</div><button class="btn" data-fm="pick-close">닫기</button></div>`;
    el.classList.remove('hidden');
  }
  // 편성 화면: 스킬 고르기 (랭크 상승 전에는 1차 정예화까지 열린 스킬)
  function formSkill(id) {
    const r = R(), o = r.ops.find((x) => x.id === id), def = OPS[id], pg = progFor(o);
    const skills = TRAIN.trained(def, pg).skills || [], cur = Math.min(o.skill ?? skills.length - 1, skills.length - 1);
    const el = $('#fm-pick');
    el.innerHTML = `<div class="fm-pick-box"><b>${esc(def.name)} — 스킬 선택</b><div class="fm-skills">${skills.map((sk, k) => `<button class="fm-skrow ${k === cur ? 'on' : ''}" data-fm="setskill" data-id="${esc(id)}" data-k="${k}">
      <img src="${UI.skillIcon(sk, k, def)}" alt=""><div><b>S${k + 1} ${esc(sk.name)} <small>Lv.${pg.slv}${pg.mst && pg.mst[k] ? ` 특화 ${pg.mst[k]}` : ''}</small></b><span>${esc(sk.desc || '')}</span><small>SP ${sk.sp}${sk.initSp ? ` · 초기 ${sk.initSp}` : ''}${sk.duration > 0 ? ` · ${sk.duration}초` : ''}</small></div></button>`).join('')}</div>
      ${skills.length < (def.skills || []).length ? `<p class="muted small">${o.promoted ? '' : '랭크 상승하면 '}남은 스킬은 정예화 단계가 오르면 열립니다.</p>` : ''}<button class="btn" data-fm="pick-close">닫기</button></div>`;
    el.classList.remove('hidden');
  }
  $('#is-form').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fm]');
    if (!b) return;
    const r = R(), k = b.dataset.fm, cap = squadCap();
    let l = lineup();
    if (k === 'close') { $('#is-form').classList.add('hidden'); refresh(); return; }
    if (k === 'add') { formPick(); return; }
    if (k === 'pick-close') { $('#fm-pick').classList.add('hidden'); return; }
    if (k === 'skill') { formSkill(b.dataset.id); return; }
    if (k === 'setskill') { const o = r.ops.find((x) => x.id === b.dataset.id); if (o) { o.skill = +b.dataset.k; sfx('select'); } }
    if (k === 'pick') { if (l.length < cap) r.lineup = [...l, b.dataset.id]; sfx('select'); }
    if (k === 'del') { r.lineup = l.filter((x) => x !== b.dataset.id); sfx('select'); }
    if (k === 'clear') r.lineup = [];
    if (k === 'quick') r.lineup = r.ops.filter((o) => !isAway(o.id)).map((o) => o.id).slice(0, cap);
    if (k === 'start') {
      if (!lineup().length) { toast('편성된 오퍼레이터가 없습니다'); return; }
      $('#is-form').classList.add('hidden');
      startBattle(formNode);
      return;
    }
    save();
    openForm(formNode);
  });
  function openLightInfo() {
    const r = R(), st = lightState();
    openModal(`<div class="modal-title">등불 · 주사위</div><div class="modal-sub">등불 ${r.light} &lt;${LIGHT_NAME[st]}&gt; · 주사위 ${r.dice}개 (d${diceFace()})</div>
      <div class="modal-text is-help">${X2.san.map((x, i) => `<p class="${i === st ? 'on' : 'muted'}"><b>${['100', '50~99', '1~49', '0'][i]}</b> ${esc(x.desc)}</p>`).join('')}
      <p>완벽한 작전이 아니거나 작전 후 목표 HP가 최대 목표 HP 절반 미만이면 등불이 줄어듭니다. 심해(${DEEP + 1}층부터)에 들어갈 때마다 등불 상태에 따라 주사위를 굴려 계시를 얻거나 거부반응이 일어납니다. 주사위는 다시 굴리기 · 조우 · 소원성취 · 상인 흥정에 씁니다.</p></div>`);
  }
  function openRelics() {
    const r = R();
    const vs = r.virtues.map((id) => X2.virtues.find((v) => v.id === id)).filter(Boolean);
    const vi = r.vari && X2.variations.find((v) => v.id === r.vari);
    openModal(`<div class="modal-title">소장품 · 계시</div><div class="modal-sub">소장품 ${r.relics.length}개 · 계시 ${vs.length}개 · 난이도 ${esc(diffOf(r).name)}${diffOf(r).grade >= 0 ? ` ${diffOf(r).grade}` : ''} · 분대 「${esc(bandOf(r).name)}」</div>
      ${vs.length ? `<div class="relic-grid">${vs.map((v) => `<div class="relic r-virtue"><i class="relic-img"><img src="${v.icon}" alt=""></i><div class="relic-no">계시</div><b>${esc(v.inner)}</b><span>${esc(v.desc)}</span><p class="relic-lore">${esc(v.lore)}</p></div>`).join('')}</div>` : ''}
      ${vi ? `<div class="relic-grid"><div class="relic r-vari"><i class="relic-img"><img src="${vi.icon}" alt=""></i><div class="relic-no">이번 구역의 메아리</div><b>${esc(vi.inner)}</b><span>${esc(vi.desc)}</span><p class="relic-lore">${esc(vi.lore)}</p></div></div>` : ''}
      <div class="relic-grid">${r.relics.map((id) => relicHTML(relicById(id), '', true)).join('') || '<p class="empty-note">아직 소장품이 없습니다.</p>'}</div>`);
  }

  // ---------- 탐색 종료 ----------
  function endRun(win, abandoned) {
    const r = R();
    if (!r || r.result) return;
    const floors = r.floor + (win ? 1 : 0);
    const raw = floors * 100 + r.score.battles * 20 + r.score.perfect * 10 + r.score.bosses * 150 + r.relics.length * 10 + (win ? 500 : 0);
    const score = Math.round(raw * (diffOf(r).score || 1));
    const lmd = score * 4;
    ACCOUNT.earn({ lmd });
    // 탐색에 참가한 오퍼레이터 신뢰도 상승
    const save2 = UI.save;
    save2.trust = save2.trust || {};
    for (const o of r.ops) if (ACCOUNT.owns(o.id)) save2.trust[o.id] = Math.min(200, (save2.trust[o.id] || 0) + 5 + floors * 3);
    const rc = rec();
    rc.best = Math.max(rc.best, score);
    // 원작: 3층(구역) 이상 도달하면 다음 탐색 시작 시 추가 보상 선택
    rc.bonusNext = r.floor + 1 >= 3;
    if (win) {
      rc.wins++;
      // 난이도 · 분대 해금 (원작 해금 조건)
      if (diffOf(r).grade >= 0) rc.diffMax = Math.max(rc.diffMax, diffOf(r).grade);
      if (r.life >= 10) rc.unlock.endLife10 = true;
      const cls = r.ops.map((o) => OPS[o.id] && OPS[o.id].class);
      for (const b of X2.bands) if (b.lock && b.lock.startsWith('end5:') && cls.filter((c) => b.lock.slice(5).split(',').includes(c)).length >= 5) rc.unlock[b.lock] = true;
      if (r.ops.length >= 20) rc.unlock.end20 = true;
    }
    r.result = { win, abandoned: !!abandoned, score, lmd, floors };
    r.at = null;
    r.pending = null;
  }
  function showEnd() {
    const r = R(), x = r.result;
    const leader = r.ops[0] && OPS[r.ops[0].id];
    const vl = leader && (x.win ? UI.line(leader, 'hard') || UI.line(leader, 'clear') : UI.line(leader, 'fail'));
    panel(`<div class="isp-head ${x.win ? 't-win' : 't-lose'}"><small>${x.win ? 'EXPLORATION COMPLETE' : 'EXPLORATION ENDED'}</small><b>${x.win ? '탐색 완료' : x.abandoned ? '탐색 포기' : '연락 두절'}</b></div>
      ${x.win ? '<p class="isp-text story">가라앉은 등대에 불이 켜졌다. 바다는 잠시 조용해졌다.</p>' : ''}
      <div class="is-score">
        <div><small>난이도</small><b>${esc(diffOf(r).name)}${diffOf(r).grade >= 0 ? ` ${diffOf(r).grade}` : ''}</b></div>
        <div><small>도달</small><b>${x.floors >= D.floors.length ? '완주' : `${Math.max(1, r.floor + 1)}층`}</b></div>
        <div><small>작전</small><b>${r.score.battles}</b></div>
        <div><small>완벽한 작전</small><b>${r.score.perfect}</b></div>
        <div><small>소장품</small><b>${r.relics.length}</b></div>
        <div><small>점수 ×${diffOf(r).score}</small><b>${x.score}</b></div>
      </div>
      <p class="isp-text gain">용문폐 +${x.lmd} · 참가 오퍼레이터 신뢰도 상승</p>
      ${vl ? `<p class="isp-text voice">${esc(leader.name)} — “${esc(vl)}”</p>` : ''}
      <div class="panel-btns"><button class="btn primary big" data-act="end-ok">확인</button></div>`);
  }

  // 메인 화면 타일에 진행 상황 표시
  const homeRender = RENDER.home;
  const homeIS = () => {
    const r = R(), el = $('#home-is');
    if (!el) return;
    el.textContent = r ? (r.result ? '탐색 종료 · 결과 확인' : `탐색 중 · ${r.floor + 1}층 ${D.floors[r.floor].name}`) : D.title;
  };
  RENDER.home = (...a) => { homeRender(...a); homeIS(); };
  homeIS();
  ACCOUNT.on('player', homeIS);

  window.IS = { DEEP, newRun, genFloor, runDef, stageFor, statFor, battleMods, applyGain, endRun, mutate, addVirtue, get run() { return R(); } };
})();
