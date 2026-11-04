'use strict';
// =====================================================================
//  백하방주 — 오퍼레이터 육성 (레벨 · 정예화)
//  계정 데이터 player.prog[id] = { elite, level, exp }
// =====================================================================
(() => {
  const R = TRAIN_RULE;
  const P = () => ACCOUNT.player;
  const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const skillsOf = (def) => def.skills || (def.skill ? [def.skill] : []);

  let rarMap = null;
  const rarOf = (id) => { if (!rarMap) { rarMap = {}; for (const o of OPERATORS) rarMap[o.id] = o.rarity || 3; } return rarMap[id] || 6; };
  const clampR = (r) => Math.max(1, Math.min(6, r || 6));
  const maxElite = (r) => R.maxElite[clampR(r)];
  function prog(id) {
    if (P().mtrain) finishTraining();
    const p = (P().prog || {})[id], r = rarOf(id);
    const elite = Math.max(0, Math.min(maxElite(r), (p && p.elite) | 0));
    const level = Math.max(1, Math.min(maxLevel(elite, r), (p && p.level) | 0 || 1));
    const slv = Math.max(1, Math.min(R.skillMax[elite], (p && p.slv) | 0 || 1));
    const mst = [0, 1, 2].map((i) => (elite >= 2 && slv >= 7 ? Math.max(0, Math.min(3, ((p && p.mst) || [])[i] | 0)) : 0));
    return { elite, level, exp: Math.max(0, (p && p.exp) | 0), slv, mst };
  }
  function setProg(id, v) {
    P().prog = P().prog || {};
    const old = P().prog[id] || {};
    P().prog[id] = { elite: v.elite, level: v.level, exp: v.exp, slv: v.slv ?? old.slv ?? 1, mst: v.mst ?? old.mst ?? [0, 0, 0] };
    ACCOUNT.save();
  }
  // ---------- 스킬 레벨 · 특화 ----------
  // 스킬 위력 비율: 레벨 1~7 → 특화 1~3 (데이터 수치는 특화 3 기준)
  const skillPower = (slv, m) => R.skillPower[Math.min(9, slv - 1 + (slv >= 7 ? m : 0))];
  const BUFF = ['atk', 'def', 'hpMul', 'nextHit'];
  const ADD = ['aspd', 'dodge', 'artsDodge', 'heal', 'regen', 'shield', 'physCut', 'markCut', 'devAspd', 'devAura', 'luckAmp', 'luckAtk', 'luckDef', 'luckRes', 'focusAmp', 'hitHeal', 'blockVuln', 'statusRes', 'killHeal', 'allyGuard', 'cover'];
  const MULS = ['strike', 'endBlast', 'allyHeal', 'allyRegen', 'finisher', 'shell', 'wave', 'accident', 'twinShot', 'hits'];
  function skillAt(sk, f) {
    if (!sk || f >= 1) return sk;
    const e = { ...(sk.effect || {}) };
    for (const k of BUFF) if (typeof e[k] === 'number' && e[k] > 1) e[k] = 1 + (e[k] - 1) * f;
    if (typeof e.interval === 'number' && e.interval < 1) e.interval = 1 - (1 - e.interval) * f;
    for (const k of ADD) if (typeof e[k] === 'number') e[k] = e[k] * f;
    if (typeof e.dp === 'number') e.dp = Math.round(e.dp * (0.6 + 0.4 * f));
    if (typeof e.dpRegen === 'number') e.dpRegen *= 0.6 + 0.4 * f;
    for (const k of MULS) if (e[k] && typeof e[k] === 'object') { const o = { ...e[k] }; for (const kk of ['mul', 'blast']) if (typeof o[kk] === 'number') o[kk] *= 0.7 + 0.3 * f; e[k] = o; }
    const slow = 1 + (1 - f) * 0.6;
    return {
      ...sk, effect: e, power: f,
      sp: sk.spType === 'deploy' ? sk.sp : Math.round(sk.sp * slow), initSp: Math.round((sk.initSp || 0) * (2 - slow)),
      duration: sk.duration > 0 ? Math.round(sk.duration * (0.75 + 0.25 * f) * 10) / 10 : sk.duration,
    };
  }
  function skillUpCost(def, p) {
    if (p.slv >= R.skillMax[p.elite]) return null;
    const c = R.skillCost[p.slv + 1], k = (R.skillScale || {})[Math.max(3, Math.min(6, def.rarity || 3))] || 1;
    return { lmd: c.lmd, items: Object.fromEntries(Object.entries(c.items).map(([id, n]) => [id, Math.max(1, Math.round(n * k))])) };
  }
  function masteryCost(def, i, p) {
    const m = p.mst[i];
    if (p.elite < 2 || p.slv < 7 || m >= 3) return null;
    const mc = R.masteryCost, c = (Array.isArray(mc) ? mc : mc[Math.max(3, Math.min(6, def.rarity || 3))])[m], pc = promoteCost(def, 2);
    const mat = Object.keys(pc.items).find((k) => R.matsT3.includes(k)) || R.matsT3[0];
    const items = { skill_3: c.book, [mat]: c.mat };
    if (c.dual) items['dual_' + def.class] = c.dual;
    return { lmd: c.lmd, items };
  }
  function payAnd(cost, fn) {
    if (!cost) return { ok: false, why: '더 올릴 수 없습니다' };
    if (!ACCOUNT.spend({ lmd: cost.lmd, ...cost.items })) return { ok: false, why: '재료가 부족합니다' };
    fn();
    return { ok: true };
  }
  function skillUp(def) {
    const p = prog(def.id), c = skillUpCost(def, p);
    if (!c) return { ok: false, why: p.elite < 1 ? '스킬 레벨 5부터는 1차 정예화가 필요합니다' : '최대 스킬 레벨입니다' };
    return payAnd(c, () => setProg(def.id, { ...p, slv: p.slv + 1 }));
  }
  // 특화 훈련 (원작: 훈련실에서 한 명씩, 특화 1 · 2 · 3에 8 · 12 · 16시간). 끝나면 자동으로 반영
  const training = () => P().mtrain || null;
  function finishTraining() {
    const t = P().mtrain;
    if (!t || Date.now() < t.end) return null;
    delete P().mtrain;
    const raw = (P().prog || {})[t.id];
    if (raw) { raw.mst = raw.mst || [0, 0, 0]; raw.mst[t.i] = Math.max(raw.mst[t.i] | 0, t.to); }
    ACCOUNT.save();
    if (window.UI && UI.toast && OPERATORS.find((o) => o.id === t.id)) UI.toast(`특화 훈련 완료: ${OPERATORS.find((o) => o.id === t.id).name} S${t.i + 1} 특화 ${t.to}`, 3000);
    return t;
  }
  function master(def, i) {
    finishTraining();
    const p = prog(def.id), c = masteryCost(def, i, p);
    if (!c) return { ok: false, why: '2차 정예화 · 스킬 레벨 7이 필요합니다' };
    if (training()) return { ok: false, why: '훈련실에서 다른 특화 훈련이 진행 중입니다' };
    const h = (R.masteryHours || [8, 12, 16])[p.mst[i]];
    return payAnd(c, () => { P().mtrain = { id: def.id, i, to: p.mst[i] + 1, end: Date.now() + h * 3600e3, cost: c }; ACCOUNT.save(); });
  }
  // 훈련 중단: 재료 반환
  function cancelTraining() {
    const t = training();
    if (!t) return false;
    delete P().mtrain;
    ACCOUNT.earn({ ...(t.cost.items || {}), ...(t.cost.lmd ? { lmd: t.cost.lmd } : {}) });
    ACCOUNT.save();
    return true;
  }
  function maxLevel(e, r = 6) { return R.maxLevelBy[clampR(r)][e]; }
  const expNeed = (e, lv) => R.expTable[e][Math.max(0, lv - 1)] || 0;
  // 경험치를 넣을 때 드는 용문폐: 지나가는 레벨마다 원작 표의 용문폐를 쓴 경험치 비율만큼
  function lmdFor(id, exp) {
    const p = prog(id), max = maxLevel(p.elite, rarOf(id));
    let lv = p.level, cur = p.exp, left = exp, lmd = 0;
    while (left > 0 && lv < max) {
      const need = expNeed(p.elite, lv), use = Math.min(left, need - cur);
      lmd += R.lmdTable[p.elite][lv - 1] * (use / need);
      left -= use; cur += use;
      if (cur >= need) { lv++; cur = 0; }
    }
    return Math.ceil(lmd);
  }
  // 육성 상태의 스탯 배율
  function statMul(e, lv, r = 6) {
    const [a, b] = R.statRange[e], m = maxLevel(e, r);
    return a + ((b - a) * (lv - 1)) / (m - 1);
  }
  // ---------- 모듈 ----------
  const modsOf = (def) => ((typeof MODULES !== 'undefined' && MODULES[def.id]) || []);
  function modState(id) {
    const m = (P().mods || {})[id] || {};
    return { cur: m.cur || null, st: { ...(m.st || {}) } };
  }
  function setModState(id, v) { P().mods = P().mods || {}; P().mods[id] = v; ACCOUNT.save(); }
  const modStage = (id, modId) => modState(id).st[modId] || 0;
  const modRar = (def) => Math.max(4, Math.min(6, def.rarity || 4));
  const modCost = (def, stage) => (MODULE_RULE.cost[modRar(def)] || [])[stage - 1] || null;
  // 다음 단계 조건: { stage, lvNeed, eliteOk, lvOk, trustOk, cost } — 임무는 화면에서 따로 확인
  function modNext(def, modId) {
    const p = prog(def.id), stage = modStage(def.id, modId) + 1, r = modRar(def);
    if (stage > 3) return null;
    const lvNeed = stage === 1 ? MODULE_RULE.level[r] : MODULE_RULE.stage2Level[r];
    return { stage, lvNeed, eliteOk: p.elite >= 2, lvOk: p.elite >= 2 && p.level >= lvNeed, trustOk: trustOf(def) >= MODULE_RULE.trust, cost: modCost(def, stage) };
  }
  function modUp(def, modId, missionsOk = true) {
    const n = modNext(def, modId);
    if (!n) return { ok: false, why: '최고 단계입니다' };
    if (!n.eliteOk) return { ok: false, why: '2차 정예화가 필요합니다' };
    if (!n.lvOk) return { ok: false, why: `레벨 ${n.lvNeed}이 필요합니다` };
    if (n.stage === 1 && !n.trustOk) return { ok: false, why: `신뢰도 ${MODULE_RULE.trust}%가 필요합니다` };
    if (n.stage === 1 && !missionsOk) return { ok: false, why: '모듈 임무를 먼저 완료하세요' };
    return payAnd(n.cost, () => { const m = modState(def.id); m.st[modId] = n.stage; if (n.stage === 1) m.cur = modId; setModState(def.id, m); });
  }
  function setModCur(id, modId) { const m = modState(id); if (modId && !m.st[modId]) return false; m.cur = modId || null; setModState(id, m); return true; }
  // 장착한 모듈의 효과 (2차 정예화 상태에서만)
  function modApply(def, p, m, mul) {
    if (!p || p.elite < 2) return {};
    const ms = modState(def.id), mod = modsOf(def).find((x) => x.id === ms.cur), st = mod ? ms.st[mod.id] || 0 : 0;
    if (!mod || !st) return {};
    const add = (mod.stats || [])[st - 1] || {};
    return {
      hp: Math.round(def.hp * mul('hp')) + (add.hp || 0), atk: Math.round(def.atk * mul('atk')) + (add.atk || 0), def: Math.round(def.def * mul('def')) + (add.def || 0),
      res: (def.res || 0) + (add.res || 0),
      module: { id: mod.id, code: mod.code, name: mod.name, stage: st, effect: mod.effect || null, trait: mod.trait || '', talent: (mod.talent || [])[st - 1] || '' },
    };
  }
  // 육성 상태를 적용한 오퍼레이터 정의 (전투 · 화면 표시용)
  // ---------- 잠재 · 신뢰도 ----------
  const potOf = (def) => Math.max(1, Math.min(6, (window.ACCOUNT && ACCOUNT.potOf(def.id)) || 1));
  const trustOf = (def) => Math.min(200, ((P().trust || {})[def.id]) || 0);
  // 원작 신뢰도: 신뢰 포인트를 쌓아 %가 오름. 1%당 필요 포인트는 8에서 시작해 70% 이후 155 (200% = 25,570)
  const TRUST_CP = [[0, 0], [25, 804], [50, 2732], [70, 5420], [100, 10070], [200, 25570]];
  function trustCum(pct) {
    for (let i = 1; i < TRUST_CP.length; i++) {
      const [p0, c0] = TRUST_CP[i - 1], [p1, c1] = TRUST_CP[i];
      if (pct <= p1) return Math.round(c0 + ((c1 - c0) * (pct - p0)) / (p1 - p0));
    }
    return TRUST_CP[TRUST_CP.length - 1][1];
  }
  function trustPctOf(pt) {
    for (let i = 1; i < TRUST_CP.length; i++) {
      const [p0, c0] = TRUST_CP[i - 1], [p1, c1] = TRUST_CP[i];
      if (pt <= c1) return Math.floor(p0 + ((p1 - p0) * (pt - c0)) / (c1 - c0));
    }
    return 200;
  }
  // 예전 저장(% 단위)은 같은 %의 포인트로 옮김
  function trustPts(id) {
    const pl = P(); pl.trustPt = pl.trustPt || {}; pl.trust = pl.trust || {};
    if (pl.trustPt[id] == null) pl.trustPt[id] = trustCum(Math.min(200, pl.trust[id] || 0));
    return pl.trustPt[id];
  }
  function addTrust(id, pts) {
    const pl = P(), before = trustPts(id);
    pl.trustPt[id] = Math.min(TRUST_CP[TRUST_CP.length - 1][1], before + Math.max(0, pts || 0));
    pl.trust[id] = trustPctOf(pl.trustPt[id]);
    return pl.trustPt[id] - before;
  }
  // 작전 신뢰 포인트: 소모 이성만큼 (3성 클리어), 그 외에는 절반
  const trustGain = (sanity, stars = 3) => (stars >= 3 ? sanity : Math.floor(sanity / 2));
  const potList = (def) => def.potentials || R.potential;
  function potBonus(def, pot = potOf(def)) {
    const out = { cost: 0, redeploy: 0, atk: 0, hp: 0, def: 0 };
    for (const b of potList(def).slice(0, pot - 1)) for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
    return out;
  }
  const trustMax = (def) => def.trustBonus || R.trustBonus[def.class] || {};
  function trustBonus(def, t = trustOf(def)) {
    const r = Math.min(100, t) / 100, out = {};
    for (const [k, v] of Object.entries(trustMax(def))) out[k] = v * r;
    return out;
  }
  function trained(def, p) {
    if (!def || def.summoned) return def;
    p = p || prog(def.id);
    const m = statMul(p.elite, p.level, def.rarity), pb = potBonus(def, p.pot || undefined), tb = trustBonus(def, p.trust ?? undefined);   // 지원 유닛은 p.pot · p.trust로 지정
    const mul = (k) => m * (1 + (pb[k] || 0) + (tb[k] || 0));
    return {
      ...def,
      hp: Math.round(def.hp * mul('hp')), atk: Math.round(def.atk * mul('atk')), def: Math.round(def.def * mul('def')),
      cost: Math.max(1, def.cost - R.costDown[p.elite] - pb.cost),
      redeploy: def.redeploy ? Math.max(5, def.redeploy - pb.redeploy) : def.redeploy,
      ...modApply(def, p, m, mul),
      pot: potOf(def), trust: trustOf(def),
      skills: skillsOf(def).slice(0, p.elite + 1).map((sk, i) => skillAt(sk, skillPower(p.slv || 1, (p.mst || [])[i] || 0))), skill: undefined,
      talents: (def.talents || []).slice(0, p.elite),
      trained: p,
    };
  }
  // 정예화 비용
  function promoteCost(def, toElite) {
    if (def.promote && def.promote[toElite - 1]) return def.promote[toElite - 1];
    const r = Math.max(3, Math.min(6, def.rarity || 3));
    const c = R.promote[r][toElite - 1];
    const pool = toElite === 1 ? R.matsT2 : R.matsT3;
    const h = hash(def.id), a = pool[h % pool.length], b = pool[(h % pool.length + 1 + (h >> 8) % (pool.length - 1)) % pool.length];
    const chip = (toElite === 1 ? 'chip_' : c.pack ? 'pack_' : 'dual_') + def.class;
    const items = { [chip]: c.chip, [a]: c.a, [b]: c.b };
    return { lmd: c.lmd, items };
  }
  function canPromote(def) {
    const p = prog(def.id);
    if (p.elite >= maxElite(def.rarity)) return { ok: false, why: p.elite >= 2 ? '이미 2차 정예화를 마쳤습니다' : '더 정예화할 수 없는 레어도입니다' };
    if (p.level < maxLevel(p.elite, def.rarity)) return { ok: false, why: `레벨 ${maxLevel(p.elite, def.rarity)}이 되어야 정예화할 수 있습니다` };
    const c = promoteCost(def, p.elite + 1);
    if (!ACCOUNT.canPay({ lmd: c.lmd, ...c.items })) return { ok: false, why: '재료가 부족합니다' };
    return { ok: true };
  }
  function promote(def) {
    const p = prog(def.id), chk = canPromote(def);
    if (!chk.ok) return chk;
    const c = promoteCost(def, p.elite + 1);
    if (!ACCOUNT.spend({ lmd: c.lmd, ...c.items })) return { ok: false, why: '재료가 부족합니다' };
    setProg(def.id, { ...p, elite: p.elite + 1, level: 1, exp: 0 });
    return { ok: true };
  }
  // 목표 레벨까지 필요한 경험치
  function expTo(id, target) {
    const p = prog(id);
    let need = -p.exp;
    for (let lv = p.level; lv < target; lv++) need += expNeed(p.elite, lv);
    return Math.max(0, need);
  }
  // 경험치에 맞게 작전기록을 고름 (큰 것부터, 남는 경험치는 최소로)
  function pickRecords(need) {
    const keys = [...R.expItems].reverse(), use = {};
    let left = need;
    for (const k of keys) {
      const have = ACCOUNT.bal(k), v = ITEMS[k].exp;
      const n = Math.min(have, Math.floor(left / v));
      if (n > 0) { use[k] = n; left -= n * v; }
    }
    if (left > 0) for (const k of [...R.expItems]) {
      const have = ACCOUNT.bal(k) - (use[k] || 0);
      if (have > 0) { use[k] = (use[k] || 0) + 1; left -= ITEMS[k].exp; break; }
    }
    const exp = Object.entries(use).reduce((s, [k, n]) => s + ITEMS[k].exp * n, 0);
    return { use, exp, short: left > 0 };
  }
  // 경험치를 더했을 때 오르는 레벨 (만렙에서 멈춤)
  function levelAfter(id, addExp) {
    const p = prog(id), max = maxLevel(p.elite, rarOf(id));
    let lv = p.level, exp = p.exp + addExp;
    while (lv < max && exp >= expNeed(p.elite, lv)) { exp -= expNeed(p.elite, lv); lv++; }
    if (lv >= max) exp = 0;
    return { level: lv, exp };
  }
  function levelUp(def, use) {
    const exp = Object.entries(use).reduce((s, [k, n]) => s + ITEMS[k].exp * n, 0);
    if (!exp) return { ok: false, why: '사용할 작전기록이 없습니다' };
    const lmd = lmdFor(def.id, exp);
    if (!ACCOUNT.spend({ ...use, lmd })) return { ok: false, why: '작전기록이나 용문폐가 부족합니다' };
    const p = prog(def.id), r = levelAfter(def.id, exp);
    setProg(def.id, { ...p, level: r.level, exp: r.exp });
    return { ok: true, from: p.level, to: r.level };
  }
  // 작전 보상 (일반 작전) — 이성 소모량과 장에 따라
  // 드롭 테이블 (작전 목록 패널 표시 · 보상 계산 공용)
  //  메인 스토리: 용문폐(이성 × 12) + 작전마다 정해진 주요 재료(별 3개면 확정, 아니면 70%) · 추가 1개 50% · 부가 재료 25%
  //    1~2장은 중급 재료, 3장부터는 고급 재료. 스테이지에 mainDrop / subDrop을 넣으면 직접 지정
  //    작전기록·칩·스킬개론은 나오지 않음 (물자 비축 · 칩 탐색에서)
  //  물자 비축 · 칩 탐색: 스테이지의 drops(고정) · chance([아이템, 확률, 개수])
  function dropTable(st, idx) {
    if (st.supply || st.event) {
      const one = st.oneOf ? st.oneOf[0].map((k) => [k, 1 / st.oneOf[0].length, st.oneOf[1] || 1, '택1']) : [];
      return { fixed: Object.entries(st.drops || {}), chance: one.concat((st.chance || []).map(([k, p, n]) => [k, p, n || 1])) };
    }
    const ch = st.chapter || 1, pool = ch >= 3 ? R.matsT3 : R.matsT2;
    const n = STAGES.slice(0, idx).filter((x) => !x.supply && x.chapter === st.chapter).length;
    const main = st.mainDrop || pool[(n + ch * 2) % pool.length];
    const sub = st.subDrop || R.matsT2[(n + ch * 2 + 3) % R.matsT2.length];
    // 원작처럼 확률 드롭 (별 3개 확정 없음). 기대 개수가 이성에 비례: 중급 재료 이성 약 7 · 고급 재료 약 22당 1개 + 부재료(중급)
    const s = st.sanity || 6, t3 = ch >= 3;
    return { fixed: [['lmd', s * R.lmdPerSanity]], main, chance: [[main, s / (t3 ? 22 : 7), 1, '주요'], [sub, s / (t3 ? 24 : 30), 1]] };
  }
  // 획득처: 이 아이템이 나오는 작전(주요 드롭 → 물자 비축 고정 → 일반 → 확률 순)과 가공소 레시피
  function sourcesOf(k) {
    const rows = [];
    STAGES.forEach((st, i) => {
      if (st.event && !eventLive(EVENTS.find((e) => e.id === st.event))) return;
      const t = dropTable(st, i);
      if (t.main === k) { rows.push({ i, rank: 0, label: '주요 드롭' }); return; }
      const f = t.fixed.find(([id]) => id === k);
      if (f) { rows.push({ i, rank: st.supply ? 1 : 2, label: st.supply ? `고정 ×${f[1].toLocaleString('ko-KR')}` : '일반 드롭' }); return; }
      const c = t.chance.find(([id, , , tag]) => id === k && tag !== '주요');
      if (c) rows.push({ i, rank: c[3] === '택1' ? 1 : 3, label: c[3] === '택1' ? `택1 ${Math.round(c[1] * 100)}%` : `확률 ${Math.round(Math.min(1, c[1]) * 100)}%` });
    });
    rows.sort((a, b) => a.rank - b.rank || (STAGES[b.i].tier || 0) - (STAGES[a.i].tier || 0));
    const craft = (typeof WORKSHOP !== 'undefined' ? WORKSHOP : []).find((r) => r.out === k) || null;
    return { stages: rows, craft };
  }
  function stageDrops(st, idx, stars) {
    const t = dropTable(st, idx), out = {};
    const add = (k, n) => { if (n > 0) out[k] = (out[k] || 0) + n; };
    for (const [k, n] of t.fixed) add(k, n);
    // 기대 개수 p (1 이상이면 여러 개). 별 3개 미만이면 80%
    for (const [k, p, n] of t.chance) {
      const q = p * (stars >= 3 ? 1 : 0.8), c = Math.floor(q) + (Math.random() < q % 1 ? 1 : 0);
      add(k, n * c);
    }
    return out;
  }
  // 물자 조달 보상: 고정 보상(별 3개 미만이면 70%) + 확률 보상
  function supplyDrops(st, stars) {
    const out = {}, k = stars >= 3 ? 1 : 0.7;
    for (const [id, n] of Object.entries(st.drops || {})) { const v = Math.max(1, Math.round(n * k)); out[id] = v; }
    for (const [id, p, n] of st.chance || []) if (Math.random() < p) out[id] = (out[id] || 0) + n;
    // 칩 탐색: 두 직군 중 하나 (택1)
    if (st.oneOf) { const [ids, n] = st.oneOf, id = ids[Math.floor(Math.random() * ids.length)]; out[id] = (out[id] || 0) + (n || 1); }
    return out;
  }
  // 육성 기능 이전 계정 · 새 계정에 한 번 지원 물자
  function giveGift() {
    if (P().trainGift) return;
    P().trainGift = true;
    ACCOUNT.earn(TRAIN_GIFT);
  }
  // 육성 기능 이전부터 가지고 있던 오퍼레이터는 2정예화 90레벨로 (계정마다 한 번)
  function migrate() {
    if (P().trainMigrated) return;
    P().trainMigrated = true;
    P().prog = P().prog || {};
    for (const o of OPERATORS) if (!o.custom && ACCOUNT.owns(o.id)) P().prog[o.id] = { elite: maxElite(o.rarity), level: maxLevel(maxElite(o.rarity), o.rarity), exp: 0, slv: 7, mst: [3, 3, 3] };
    ACCOUNT.save();
  }
  // 스킬 레벨 기능 이전의 육성 데이터: 2정 90은 레벨 7·특화 3, 나머지는 단계별 상한 레벨로
  function migrateSkills() {
    if (P().skillMigrated) return;
    P().skillMigrated = true;
    for (const [id, v] of Object.entries(P().prog || {})) {
      if (v.slv) continue;
      const e = v.elite | 0;
      v.slv = R.skillMax[e];
      v.mst = e === 2 && v.level >= maxLevel(2, rarOf(id)) ? [3, 3, 3] : [0, 0, 0];
    }
    ACCOUNT.save();
  }
  window.TRAIN = { addTrust, trustPts, trustCum, trustGain, modsOf, modState, modStage, modNext, modUp, setModCur, modCost, potBonus, trustBonus, trustMax, potList, potOf, trustOf, prog, setProg, maxLevel, maxElite, rarOf, expNeed, lmdFor, statMul, trained, promoteCost, canPromote, promote, expTo, pickRecords, levelAfter, levelUp, dropTable, sourcesOf, stageDrops, supplyDrops, giveGift, migrate, migrateSkills, skillPower, skillAt, skillUpCost, masteryCost, skillUp, master, training, finishTraining, cancelTraining };
})();
