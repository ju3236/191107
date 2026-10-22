'use strict';
// =====================================================================
//  잿빛 등대 — 오퍼레이터 육성 (레벨 · 정예화)
//  계정 데이터 player.prog[id] = { elite, level, exp }
// =====================================================================
(() => {
  const R = TRAIN_RULE;
  const P = () => ACCOUNT.player;
  const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const skillsOf = (def) => def.skills || (def.skill ? [def.skill] : []);

  function prog(id) {
    const p = (P().prog || {})[id];
    const elite = Math.max(0, Math.min(2, (p && p.elite) | 0));
    const level = Math.max(1, Math.min(R.maxLevel[elite], (p && p.level) | 0 || 1));
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
    return R.skillCost[p.slv + 1];
  }
  function masteryCost(def, i, p) {
    const m = p.mst[i];
    if (p.elite < 2 || p.slv < 7 || m >= 3) return null;
    const c = R.masteryCost[m], pc = promoteCost(def, 2);
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
  function master(def, i) {
    const p = prog(def.id), c = masteryCost(def, i, p);
    if (!c) return { ok: false, why: '2차 정예화 · 스킬 레벨 7이 필요합니다' };
    return payAnd(c, () => { const mst = [...p.mst]; mst[i]++; setProg(def.id, { ...p, mst }); });
  }
  const maxLevel = (e) => R.maxLevel[e];
  const expNeed = (e, lv) => R.expNeed[e][0] + lv * R.expNeed[e][1];
  const lmdFor = (exp) => Math.ceil(exp * R.lmdPerExp);
  // 육성 상태의 스탯 배율
  function statMul(e, lv) {
    const [a, b] = R.statRange[e], m = R.maxLevel[e];
    return a + ((b - a) * (lv - 1)) / (m - 1);
  }
  // 육성 상태를 적용한 오퍼레이터 정의 (전투 · 화면 표시용)
  // ---------- 잠재 · 신뢰도 ----------
  const potOf = (def) => Math.max(1, Math.min(6, (window.ACCOUNT && ACCOUNT.potOf(def.id)) || 1));
  const trustOf = (def) => Math.min(200, ((P().trust || {})[def.id]) || 0);
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
    const m = statMul(p.elite, p.level), pb = potBonus(def), tb = trustBonus(def);
    const mul = (k) => m * (1 + (pb[k] || 0) + (tb[k] || 0));
    return {
      ...def,
      hp: Math.round(def.hp * mul('hp')), atk: Math.round(def.atk * mul('atk')), def: Math.round(def.def * mul('def')),
      cost: Math.max(1, def.cost - R.costDown[p.elite] - pb.cost),
      redeploy: def.redeploy ? Math.max(5, def.redeploy - pb.redeploy) : def.redeploy,
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
    const chip = (toElite === 1 ? 'chip_' : 'dual_') + def.class;
    const items = { [chip]: c.chip, [a]: c.a, [b]: c.b };
    return { lmd: c.lmd, items };
  }
  function canPromote(def) {
    const p = prog(def.id);
    if (p.elite >= 2) return { ok: false, why: '이미 2차 정예화를 마쳤습니다' };
    if (p.level < R.maxLevel[p.elite]) return { ok: false, why: `레벨 ${R.maxLevel[p.elite]}이 되어야 정예화할 수 있습니다` };
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
    const p = prog(id), max = R.maxLevel[p.elite];
    let lv = p.level, exp = p.exp + addExp;
    while (lv < max && exp >= expNeed(p.elite, lv)) { exp -= expNeed(p.elite, lv); lv++; }
    if (lv >= max) exp = 0;
    return { level: lv, exp };
  }
  function levelUp(def, use) {
    const exp = Object.entries(use).reduce((s, [k, n]) => s + ITEMS[k].exp * n, 0);
    if (!exp) return { ok: false, why: '사용할 작전기록이 없습니다' };
    const lmd = lmdFor(exp);
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
    if (st.supply) return { fixed: Object.entries(st.drops || {}), chance: (st.chance || []).map(([k, p, n]) => [k, p, n || 1]) };
    const ch = st.chapter || 1, pool = ch >= 3 ? R.matsT3 : R.matsT2;
    const n = STAGES.slice(0, idx).filter((x) => !x.supply && x.chapter === st.chapter).length;
    const main = st.mainDrop || pool[(n + ch * 2) % pool.length];
    const sub = st.subDrop || pool[(n + ch * 2 + 3) % pool.length];
    return { fixed: [['lmd', (st.sanity || 6) * R.lmdPerSanity]], main, chance: [[main, 1, 1, '주요'], [main, 0.5, 1, '추가'], [sub, 0.25, 1]] };
  }
  // 획득처: 이 아이템이 나오는 작전(주요 드롭 → 물자 비축 고정 → 일반 → 확률 순)과 가공소 레시피
  function sourcesOf(k) {
    const rows = [];
    STAGES.forEach((st, i) => {
      const t = dropTable(st, i);
      if (t.main === k) { rows.push({ i, rank: 0, label: '주요 드롭' }); return; }
      const f = t.fixed.find(([id]) => id === k);
      if (f) { rows.push({ i, rank: st.supply ? 1 : 2, label: st.supply ? `고정 ×${f[1].toLocaleString('ko-KR')}` : '일반 드롭' }); return; }
      const c = t.chance.find(([id, , , tag]) => id === k && !tag);
      if (c) rows.push({ i, rank: 3, label: `확률 ${Math.round(c[1] * 100)}%` });
    });
    rows.sort((a, b) => a.rank - b.rank || (STAGES[b.i].tier || 0) - (STAGES[a.i].tier || 0));
    const craft = (typeof WORKSHOP !== 'undefined' ? WORKSHOP : []).find((r) => r.out === k) || null;
    return { stages: rows, craft };
  }
  function stageDrops(st, idx, stars) {
    const t = dropTable(st, idx), out = {};
    const add = (k, n) => { if (n > 0) out[k] = (out[k] || 0) + n; };
    for (const [k, n] of t.fixed) add(k, n);
    for (const [k, p, n, tag] of t.chance) {
      const q = tag === '주요' ? (stars >= 3 ? 1 : 0.7) : tag === '추가' && stars < 3 ? 0 : p;
      if (Math.random() < q) add(k, n);
    }
    return out;
  }
  // 물자 조달 보상: 고정 보상(별 3개 미만이면 70%) + 확률 보상
  function supplyDrops(st, stars) {
    const out = {}, k = stars >= 3 ? 1 : 0.7;
    for (const [id, n] of Object.entries(st.drops || {})) { const v = Math.max(1, Math.round(n * k)); out[id] = v; }
    for (const [id, p, n] of st.chance || []) if (Math.random() < p) out[id] = (out[id] || 0) + n;
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
    for (const o of OPERATORS) if (!o.custom && ACCOUNT.owns(o.id)) P().prog[o.id] = { elite: 2, level: R.maxLevel[2], exp: 0, slv: 7, mst: [3, 3, 3] };
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
      v.mst = e === 2 && v.level >= R.maxLevel[2] ? [3, 3, 3] : [0, 0, 0];
    }
    ACCOUNT.save();
  }
  window.TRAIN = { potBonus, trustBonus, trustMax, potList, potOf, trustOf, prog, setProg, maxLevel, expNeed, lmdFor, statMul, trained, promoteCost, canPromote, promote, expTo, pickRecords, levelAfter, levelUp, dropTable, sourcesOf, stageDrops, supplyDrops, giveGift, migrate, migrateSkills, skillPower, skillAt, skillUpCost, masteryCost, skillUp, master };
})();
