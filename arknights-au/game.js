'use strict';
// =====================================================================
//  잿빛 등대 — 게임 엔진 (데이터는 data.js)
// =====================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const canvas = $('#board');
  const ctx = canvas.getContext('2d');

  const opById = (id) => OPERATORS.find((o) => o.id === id);
  const DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  const SLOW = 0.15;        // 배치/조작 중 시간 배속
  const MAX_DP = 99;
  const sfx = (name) => window.SFX && window.SFX.play(name);

  // ---------- 이미지 (선택) ----------
  const IMG = new Map();   // 그림 주소 → Image (관리자가 실장한 오퍼레이터도 포함)
  function imgOf(def) {
    if (!def.image) return null;
    let im = IMG.get(def.image);
    if (!im) { im = new Image(); im.src = def.image; IMG.set(def.image, im); }
    return im.complete && im.naturalWidth > 0 ? im : null;
  }
  // 적 그림
  // 그림 경로로 저장 (통합전략처럼 능력치만 바꾼 적 정의도 같은 그림을 씀)
  const EIMG = new Map();
  const loadE = (src) => { if (!EIMG.has(src)) { const im = new Image(); im.src = src; EIMG.set(src, im); } return EIMG.get(src); };
  for (const e of Object.values(ENEMIES)) if (e.image) loadE(e.image);
  const eImg = (def) => { const im = def.image && loadE(def.image); return im && im.complete && im.naturalWidth > 0 ? im : null; };
  function faceStyle(def) {
    return def.image ? `background-color:${def.color};background-image:url('${def.image}')` : `background-color:${def.color}`;
  }
  const faceText = (def) => (def.image ? '' : def.name[0]);

  let S = null; // 전투 상태
  const starText = (n) => '◆'.repeat(n) + '◇'.repeat(3 - n);

  const key = (x, y) => x + ',' + y;
  const walkable = (ch) => ch === '.' || ch === '-' || ch === 'R' || ch === 'B' || ch === '~';
  // 명흔(~): 지면처럼 배치·통행 가능. 위에 있는 오퍼레이터는 방어력이 줄고 HP를 잃으며, 시본은 HP를 회복함
  const onBrand = (x, y) => S.map[Math.floor(y)] && S.map[Math.floor(y)][Math.floor(x)] === '~';

  // 침입 지점에서 가장 가까운 방어 지점까지 BFS 경로
  function buildPath(map, start) {
    const rows = map.length, cols = map[0].length;
    const prev = new Map([[key(start.x, start.y), null]]);
    const q = [start];
    let goal = null;
    while (q.length) {
      const c = q.shift();
      if (map[c.y][c.x] === 'B') { goal = c; break; }
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const nx = c.x + dx, ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (!walkable(map[ny][nx]) || prev.has(key(nx, ny))) continue;
        prev.set(key(nx, ny), c);
        q.push({ x: nx, y: ny });
      }
    }
    if (!goal) throw new Error(`경로 없음: 침입 지점 (${start.x},${start.y})에서 B로 갈 수 없습니다.`);
    const pts = [];
    for (let c = goal; c; c = prev.get(key(c.x, c.y))) pts.unshift({ x: c.x + 0.5, y: c.y + 0.5 });
    pts[pts.length - 1].rem = 0;
    for (let i = pts.length - 2; i >= 0; i--) {
      pts[i].rem = pts[i + 1].rem + Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    return pts;
  }

  function rotate(x, y, dir) {
    if (dir === 'down') return [-y, x];
    if (dir === 'left') return [-x, -y];
    if (dir === 'up') return [y, -x];
    return [x, y];
  }
  function computeRange(range, dir, tx, ty) {
    const list = [[tx, ty]];
    for (const [rx, ry] of range) {
      const [dx, dy] = rotate(rx, ry, dir);
      if (dx === 0 && dy === 0) continue;
      list.push([tx + dx, ty + dy]);
    }
    return { list, set: new Set(list.map(([x, y]) => key(x, y))) };
  }

  // opts (통합전략 등): defs 오퍼레이터 정의 목록, life 시작 목숨, enemies 적 정의 덮어쓰기,
  //   mods { startDp, deployLimit, dpRate }, onEnd(결과) → { text, buttons }
  function beginBattle(idx, squadIds, opts = {}) {
    const st = typeof idx === 'object' ? idx : STAGES[idx];
    if (typeof idx === 'object') idx = -1;
    const map = st.map.map((r) => r.split(''));
    const spawns = [];
    map.forEach((row, y) => row.forEach((ch, x) => { if (ch === 'R') spawns.push({ x, y }); }));
    const paths = spawns.map((sp) => buildPath(map, sp));
    // 비행 유닛은 길을 무시하고 방어 지점까지 곧장 날아감
    const flyPaths = paths.map((p) => {
      const a = p[0], b = p[p.length - 1], d = Math.hypot(b.x - a.x, b.y - a.y);
      return [{ x: a.x, y: a.y, rem: d }, { x: b.x, y: b.y, rem: 0 }];
    });
    const queue = [];
    for (const w of st.waves) {
      for (let i = 0; i < (w.count || 1); i++) queue.push({ t: w.t + i * (w.gap || 2), enemy: w.enemy, spawn: w.spawn || 0 });
    }
    queue.sort((a, b) => a.t - b.t);
    const squad = opts.defs || (squadIds || UI.save.squad).map(opById).filter(Boolean);
    squadIds = squad.map((d) => d.id);
    const mods = opts.mods || {}, life = opts.life ?? st.life ?? 3;

    UI.go('battle');
    S = {
      idx, st, squadIds, map, rows: map.length, cols: map[0].length, paths, flyPaths, queue,
      total: queue.length, killed: 0, leaked: 0, time: 0,
      dp: (st.startDp ?? 10) + (mods.startDp || 0), life, maxLife: opts.maxLife ?? life, deployLimit: (st.deployLimit ?? 8) + (mods.deployLimit || 0),
      ext: opts, mods, edefs: opts.enemies || null, maxDp: MAX_DP + (mods.maxDp || 0), shield: opts.shield || 0,
      ops: [], enemies: [], effects: [],
      roster: squad.map((def) => ({ def, cd: 0, deployed: false })),
      speed: 1, paused: false, ended: false,
      mode: 'idle', sel: null, tile: null, dir: 'right', press: null, inspect: null,
      shake: 0, T: 40, dpr: 1,
    };
    // 치엔창 꾸러미: 배치 코스트를 무작위로 섞음 / 담대함의 칼날: 코스트가 가장 높은 오퍼레이터
    if (mods.shuffleCost && S.roster.length > 1) {
      const costs = S.roster.map((r) => r.def.cost).sort(() => Math.random() - 0.5);
      S.roster.forEach((r, i) => { r.def = { ...r.def, cost: costs[i] }; });
    }
    if (mods.boldBlade && S.roster.length) {
      const top = Math.max(...S.roster.map((r) => r.def.cost)), c = S.roster.filter((r) => r.def.cost === top);
      S.boldId = c[Math.floor(Math.random() * c.length)].def.id;
    }
    $('#hud-stage').textContent = `${st.code} ${st.name}`;
    $('#btn-speed').innerHTML = '1X<small>▶</small><kbd>F</kbd>';
    ['#result', '#pause', '#inspect', '#hint', '#toast'].forEach((s) => $(s).classList.add('hidden'));
    buildCards();
    resize();
    // 대장의 작전 출발 → 작전 개시 대사
    $('#ui-toast').classList.add('hidden');
    const leader = squad[0], ran = S;
    const dl = leader && UI.line(leader, 'depart'), sl = leader && UI.line(leader, 'start');
    if (dl) showVoice(leader, dl);
    if (sl) setTimeout(() => { if (S === ran) showVoice(leader, sl); }, dl ? 2400 : 0);
  }
  let voiceTimer = null;
  function showVoice(def, text) {
    const el = $('#voice-line');
    el.innerHTML = '';
    const n = document.createElement('b'); n.textContent = def.name; n.style.color = def.color;
    const t = document.createElement('span'); t.textContent = text;
    el.append(n, t);
    el.classList.remove('hidden');
    clearTimeout(voiceTimer);
    voiceTimer = setTimeout(() => el.classList.add('hidden'), 2200 + text.length * 40);
  }

  // =====================================================================
  //  배치 카드
  // =====================================================================
  function buildCards() {
    const wrap = $('#cards');
    wrap.innerHTML = '';
    S.roster.forEach((r) => {
      const c = document.createElement('button');
      c.className = 'card';
      c.style.setProperty('--c', r.def.color);
      c.innerHTML = `<span class="card-face">${r.def.image ? `<img src="${r.def.image}" alt="">` : r.def.name[0]}</span>
        <span class="card-cost">${r.def.cost}</span><span class="card-class">${UI.icon(r.def.class)}</span>
        <span class="card-name">${r.def.name}</span><span class="card-cd"></span>`;
      c.addEventListener('click', () => onCard(r));
      r.el = c;
      r.cdEl = c.querySelector('.card-cd');
      wrap.appendChild(c);
    });
  }
  function updateCards() {
    for (const r of S.roster) {
      r.el.classList.toggle('hidden', r.deployed || r.left === 0);
      if (r.left !== undefined && r.shown !== r.left) { r.shown = r.left; r.el.querySelector('.card-name').textContent = `${r.def.name} ×${r.left}`; }
      r.el.classList.toggle('cooling', r.cd > 0);
      r.el.classList.toggle('poor', S.dp < r.def.cost);
      r.el.classList.toggle('selected', S.sel === r && (S.mode === 'placing' || S.mode === 'direction'));
      if (r.cd > 0) r.cdEl.textContent = Math.ceil(r.cd);
    }
  }
  function onCard(r) {
    if (!S || S.ended) return;
    if (S.sel === r && S.mode !== 'idle' && S.mode !== 'inspect') { sfx('cancel'); setMode('idle'); return; }
    if (r.deployed || r.left === 0) return;
    if (r.cd > 0) { sfx('deny'); toast('재배치 대기 중입니다'); return; }
    if (S.dp < r.def.cost) { sfx('deny'); toast('배치 코스트가 부족합니다'); return; }
    if (!r.def.summoned && deployedCount() >= S.deployLimit) { sfx('deny'); toast('배치 가능 인원을 초과했습니다'); return; }
    sfx('select');
    S.sel = r;
    setMode('placing');
  }

  function setMode(mode) {
    S.mode = mode;
    if (mode === 'idle') { S.sel = null; S.tile = null; S.inspect = null; }
    $('#inspect').classList.toggle('hidden', mode !== 'inspect');
    const hint = $('#hint');
    if (mode === 'placing') {
      hint.textContent = CLASSES[S.sel.def.class].tile === 'ground' ? '지면(어두운 칸)을 선택하세요' : '고지대(밝은 칸)를 선택하세요';
    } else if (mode === 'direction') {
      hint.textContent = '드래그하거나 화살표를 눌러 방향 결정 · 가운데를 누르면 취소';
    }
    hint.classList.toggle('hidden', mode !== 'placing' && mode !== 'direction');
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 1500);
  }

  // =====================================================================
  //  입력
  // =====================================================================
  // 화면 좌표 → 타일 좌표. 고지대는 위로 솟아 있으므로 높이를 고려해 먼저 검사
  function toTile(e, h) {
    const r = canvas.getBoundingClientRect();
    const X = e.clientX - r.left, Y = e.clientY - r.top;
    if (h !== undefined) return unproject(X, Y, h);
    const hi = unproject(X, Y, HIGH);
    if (tileH(Math.floor(hi.x), Math.floor(hi.y)) === HIGH) return hi;
    return unproject(X, Y, 0);
  }
  // 캐릭터 그림을 직접 눌렀을 때
  function opAtScreen(e) {
    const r = canvas.getBoundingClientRect();
    const X = e.clientX - r.left, Y = e.clientY - r.top;
    const list = [...S.ops].sort((a, b) => b.y - a.y);
    return list.find((o) => o.rect && X >= o.rect[0] && X <= o.rect[2] && Y >= o.rect[1] && Y <= o.rect[3]);
  }
  const opAt = (tx, ty) => S.ops.find((o) => o.x === tx && o.y === ty);
  function canPlace(def, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= S.cols || ty >= S.rows) return false;
    const ch = S.map[ty][tx];
    const need = CLASSES[def.class].tile === 'ground' ? '.' : '^';
    const ok = ch === need || (need === '.' && ch === '~') || (need === '^' && S.mods.rangedGround && (ch === '.' || ch === '~'));
    return ok && !opAt(tx, ty);
  }
  function pickDir(p) {
    const dx = p.x - (S.tile.x + 0.5), dy = p.y - (S.tile.y + 0.5);
    if (Math.hypot(dx, dy) < 0.35) return;
    S.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!S || S.ended) return;
    const p = toTile(e), tx = Math.floor(p.x), ty = Math.floor(p.y);
    if (S.mode === 'placing') {
      if (canPlace(S.sel.def, tx, ty) && S.sel.def.noDir) { deploy(S.sel, tx, ty, 'right'); return; }
      if (canPlace(S.sel.def, tx, ty)) {
        S.tile = { x: tx, y: ty };
        S.dir = 'right';
        S.press = 'fromPlacing';
        setMode('direction');
        return;
      }
      setMode('idle');
    } else if (S.mode === 'direction') {
      S.press = 'inDirection';
      pickDir(toTile(e, tileH(S.tile.x, S.tile.y)));
      return;
    }
    const op = opAtScreen(e) || opAt(tx, ty);
    if (op) {
      if (S.inspect !== op) { const sl = UI.line(op.def, 'select'); if (sl) addText(op.x + 0.5, op.y - 0.1, sl, op.def.color, 1.4, true); }
      S.inspect = op; setMode('inspect'); refreshInspect(true);
    }
    else if (S.mode === 'inspect') setMode('idle');
  });
  let hoverPt = null;   // PC 단축키용: 마우스가 올라가 있는 위치
  canvas.addEventListener('pointerleave', () => { hoverPt = null; });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') hoverPt = { clientX: e.clientX, clientY: e.clientY };
    if (!S || S.mode !== 'direction') return;
    pickDir(toTile(e, tileH(S.tile.x, S.tile.y)));
  });
  window.addEventListener('pointerup', (e) => {
    if (!S || S.mode !== 'direction' || !S.press) return;
    const p = toTile(e, tileH(S.tile.x, S.tile.y));
    const far = Math.hypot(p.x - (S.tile.x + 0.5), p.y - (S.tile.y + 0.5)) > 0.55;
    const from = S.press;
    S.press = null;
    if (far) { pickDir(p); deploy(S.sel, S.tile.x, S.tile.y, S.dir); }
    else if (from === 'inDirection') setMode('idle');
  });
  // ---------- PC 단축키: Q 철수 · E 스킬 · F 배속 · Space 일시정지 · Esc 취소 ----------
  // 대상은 정보창이 열린 오퍼레이터, 없으면 마우스를 올린 오퍼레이터
  function keyTarget() {
    if (S.inspect && S.inspect.alive) return S.inspect;
    if (!hoverPt) return null;
    const p = toTile(hoverPt);
    return opAtScreen(hoverPt) || opAt(Math.floor(p.x), Math.floor(p.y)) || null;
  }
  window.addEventListener('keydown', (e) => {
    if (!S || S.ended || UI.current !== 'battle') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
    if (!$('#dialog').classList.contains('hidden')) return;
    const code = e.code;
    if (code === 'Escape') { setMode('idle'); return; }
    if (code === 'Space') { e.preventDefault(); if (!e.repeat) togglePause(); return; }
    if (e.repeat || S.paused) return;
    if (code === 'KeyF') { e.preventDefault(); toggleSpeed(); return; }
    if (code !== 'KeyQ' && code !== 'KeyE') return;
    e.preventDefault();
    const op = keyTarget();
    if (!op) { toast('오퍼레이터를 선택하거나 마우스를 올려 주세요'); return; }
    if (code === 'KeyQ') { retreat(op); setMode('idle'); return; }
    const sk = op.skill;
    if (sk.trigger !== 'manual') toast(`${op.def.name}의 스킬은 자동 발동입니다`);
    else if (op.skillT > 0 && (sk.effect || {}).cancelable) { useSkill(op); if (S.inspect === op) refreshInspect(true); }
    else if (op.skillT > 0) toast('스킬 발동 중입니다');
    else if (op.sp < sk.sp) toast(`SP가 부족합니다 (${Math.floor(op.sp)}/${sk.sp})`);
    else { activateSkill(op); if (S.inspect === op) refreshInspect(true); }
  });

  function toggleSpeed() {
    if (!S) return;
    S.speed = S.speed === 1 ? 2 : 1;
    $('#btn-speed').innerHTML = S.speed + 'X<small>' + (S.speed > 1 ? '▶▶' : '▶') + '</small><kbd>F</kbd>';
  }
  $('#btn-speed').addEventListener('click', toggleSpeed);
  function togglePause(force) {
    if (!S || S.ended) return;
    S.paused = force ?? !S.paused;
    $('#pause').classList.toggle('hidden', !S.paused);
    $('#pause-retry').classList.toggle('hidden', !!S.ext.onEnd);
    soundLabel();
  }
  $('#btn-pause').addEventListener('click', () => togglePause());
  $('#btn-gear').addEventListener('click', () => togglePause(true));
  $('#pause-resume').addEventListener('click', () => togglePause(false));
  const soundLabel = () => { $('#pause-sound').textContent = '효과음 ' + (window.SFX && SFX.enabled ? '켜짐' : '꺼짐'); };
  $('#pause-sound').addEventListener('click', () => { SFX.toggle(); soundLabel(); });
  $('#pause-retry').addEventListener('click', () => { if (S.ext.onEnd) return; const i = S.idx; UI.onBattleQuit(i); UI.startOperation(i, true); });
  $('#pause-quit').addEventListener('click', () => {
    $('#pause').classList.add('hidden');
    if (S.ext.onEnd) { S.paused = false; S.quit = true; endBattle(false); return; }
    const i = S.idx; UI.onBattleQuit(i); UI.go('operations');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });

  $('#ins-skill').addEventListener('click', () => { if (S && S.inspect) { useSkill(S.inspect); refreshInspect(true); } });
  $('#ins-retreat').addEventListener('click', () => { if (S && S.inspect) { retreat(S.inspect); setMode('idle'); } });

  function refreshInspect(full) {
    const op = S.inspect;
    if (!op) return;
    const d = op.def, sk = op.skill;
    if (full) {
      const face = $('#ins-face');
      face.className = 'face ins-face';
      face.style.cssText = faceStyle(d);
      face.textContent = faceText(d);
      $('#ins-name').textContent = d.name;
      const arch = d.archetype && ARCHETYPES[d.archetype];
      $('#ins-class').textContent = `${CLASSES[d.class].name}${arch ? ' · ' + arch.name : ''} · 저지 ${opBlock(op)}`;
      $('#ins-skill-name').textContent = sk.name + (sk.trigger === 'auto' ? ' (자동)' : '');
      $('#ins-skill-desc').textContent = sk.desc;
    }
    $('#ins-stats').innerHTML = `<span>체력 <b>${Math.ceil(op.hp)}/${op.maxHp}</b></span><span>${d.class === 'medic' ? '치유' : '공격'} <b>${Math.round(opAtk(op))}</b></span>
      <span>방어 <b>${Math.round(opDef(op))}</b></span><span>저항 <b>${d.res || 0}</b></span>`;
    const fill = $('#ins-sp-fill');
    if (op.skillT > 0) {
      const inf = op.skillT === Infinity;
      fill.style.width = (inf ? 100 : (op.skillT / sk.duration) * 100) + '%';
      fill.classList.add('active');
      $('#ins-sp-text').textContent = op.charges > 0 ? `발동 중 · ${op.charges}회 남음` : inf ? '발동 중' : `발동 중 ${op.skillT.toFixed(1)}s`;
    } else {
      fill.style.width = (sk.sp ? Math.min(1, op.sp / sk.sp) : 0) * 100 + '%';
      fill.classList.remove('active');
      $('#ins-sp-text').textContent = sk.spType === 'deploy' ? '배치 시 발동 (재배치하면 다시 발동)' : `SP ${Math.floor(op.sp)}/${sk.sp}`;
    }
    const canEnd = op.skillT > 0 && (sk.effect || {}).cancelable;
    $('#ins-skill').disabled = !(canEnd || (sk.trigger === 'manual' && op.skillT <= 0 && op.sp >= sk.sp));
    $('#ins-skill').innerHTML = canEnd ? '스킬 종료<kbd>E</kbd>' : sk.trigger === 'auto' ? '자동 발동' : '스킬 발동<kbd>E</kbd>';
  }

  // =====================================================================
  //  오퍼레이터 — 재능 · 스킬 · 세부 직군 특성
  // =====================================================================
  const skillsOf = (def) => def.skills || (def.skill ? [def.skill] : []);
  function chosenSkill(def) {
    const list = skillsOf(def);
    return list[UI.skillIndex(def)] || list[0] || { name: '-', desc: '', sp: 999, duration: 0, effect: {} };
  }
  function talentFx(def) {
    const t = { atk: 1, hp: 1, def: 1, speed: 1, dodge: 0 };
    for (const tal of def.talents || []) {
      for (const [k, v] of Object.entries(tal.effect || {})) {
        if (k in t && k !== 'dodge') t[k] *= v;
        else if (k === 'dodge') t.dodge += v;
        else t[k] = v;
      }
    }
    return t;
  }
  const eff = (op) => (op.skillT > 0 ? op.skill.effect || {} : {});
  const B = (op, k) => (op.buff && op.buff[k]) || 0;
  // 장치·소환물에 걸리는 주인의 스킬 효과
  const oeff = (op) => (op.def.summoned && op.owner && op.owner.alive ? eff(op.owner) : {});
  // 적의 무게 (값이 없으면 보스 4 · 정예 3 · 중장갑 2 · 그 외 1로 봄)
  const wOf = (e) => e.def.weight || (e.def.boss ? 4 : e.def.elite ? 3 : e.def.def >= 400 ? 2 : 1);
  const opAtk = (op) => op.def.atk * op.tal.atk * (eff(op).atk || 1) * (1 + B(op, 'atk'));
  const opDef = (op) => op.def.def * op.tal.def * (eff(op).def || 1) * (1 + (op.auraDef || 0)) * (op.brand ? 0.7 : 1) * (1 + B(op, 'def')) + B(op, 'defFlat');
  const opInterval = (op) => op.def.interval * op.tal.speed * (eff(op).interval || 1) * (op.chill > 0 ? 1.5 : 1) * partnerMul(op) / Math.max(0.1, 1 + B(op, 'aspd') / 100);
  const opRes = (op) => (op.def.res || 0) + (op.resT > 0 ? op.resBuff : 0) + B(op, 'res');
  const inSquad = (id) => S.squadIds.includes(id);
  const isDebuffed = (e) => e.analysis > 0 || e.slowT > 0 || e.stun > 0;
  // 최고의 파트너: 약화된 적을 공격 중이면 공격 속도 상승 (파트너 편성 시 더 크게)
  function partnerMul(op) {
    const ps = op.tal.partnerSpeed;
    if (!ps || !op.debuffedTarget) return 1;
    return inSquad(ps.partner) ? ps.partnerSpeed : ps.speed;
  }
  const opBlock = (op) => op.def.block + (eff(op).block || 0) + B(op, 'block');
  const opDodge = (op) => op.tal.dodge + (eff(op).dodge || 0) + (op.def.dodge || 0) + B(op, 'dodge');
  const opArtsDodge = (op) => (op.def.artsDodge || 0) + (eff(op).artsDodge || 0) + B(op, 'artsDodge');
  const isGround = (def) => CLASSES[def.class].tile === 'ground';
  const isFly = (def) => !!(def.fly || def.flying);

  function setRange(op, range) {
    const rg = computeRange(range, op.dir, op.x, op.y);
    op.range = rg.set;
    op.rangeList = rg.list;
  }
  // 정당한 보호: 치료 범위 안 아군의 상태 이상 지속시간 감소
  function debuffMul(op) {
    let m = 1;
    for (const o of S.ops) if (o.alive && o.tal.protect && o.range.has(key(op.x, op.y))) m = Math.min(m, o.tal.protect.mul);
    const X = S.mods;
    if (X.medicProtect) for (const o of S.ops) if (o.alive && o.def.class === 'medic' && o.range.has(key(op.x, op.y))) m = Math.min(m, 0.5);
    if (X.rangedProtect && !isGround(op.def)) m = Math.min(m, 1 - X.rangedProtect);
    if (op.protect) m = Math.min(m, 1 - op.protect);
    if (eff(op).statusRes) m = Math.min(m, 1 - eff(op).statusRes);
    return m;
  }
  // 변호인의 소임: 스킬 지속 중 범위 안 아군이 받는 피해 감소
  function guardMul(op) {
    let m = 1;
    for (const o of S.ops) if (o.alive && eff(o).allyGuard && o.range.has(key(op.x, op.y))) m = Math.min(m, eff(o).allyGuard);
    return m;
  }
  // =====================================================================
  //  소장품 효과 (통합전략) — S.mods에 모인 효과를 전투에 적용
  // =====================================================================
  const near8 = (a, x, y) => Math.abs(a.x - x) <= 1 && Math.abs(a.y - y) <= 1;
  const tileIs = (x, y, ch) => S.map[y] && S.map[y][x] === ch;
  const nearTile = (x, y, ch) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tileIs(x + dx, y + dy, ch)) return true; return false; };
  const deployedOf = (cls) => Math.min(8, S.ops.filter((o) => o.alive && o.def.class === cls).length);
  const perDep = (kind) => (S.mods.perDeployed || []).filter((p) => p.kind === kind).reduce((s, p) => s + p.v * deployedOf(p.class), 0);
  function stunEnemy(e, dur) {
    if (!e.alive || dur <= 0) return;
    e.stun = Math.max(e.stun || 0, dur * (1 + (S.mods.stunMul || 0)));
  }
  function gainSp(op, n) {
    if (!op.alive || op.skillT > 0 || op.skill.spType === 'deploy') return;
    op.sp = Math.min(op.skill.sp, op.sp + n);
  }
  // 매 프레임: 오퍼레이터 버프 계산과 전장 전체 효과
  function relicTick(dt) {
    const X = S.mods;
    const full = S.dp >= 99;
    for (const op of S.ops) {
      const b = {};
      const add = (k, v) => { b[k] = (b[k] || 0) + v; };
      const t = S.time - op.born, hr = op.hp / op.maxHp, melee = isGround(op.def), cls = op.def.class;
      for (const k of ['skillAtkT', 'dodgeAtkT', 'dodgeAspdT', 'hurtAspdT', 'bb2T', 'bb3T']) if (op[k] > 0) op[k] -= dt;
      if (op.skillAtkT > 0) add('atk', X.skillAtk.atk);
      if (op.dodgeAtkT > 0) add('atk', X.dodgeAtk.atk);
      if (op.dodgeAspdT > 0) add('aspd', X.dodgeAspd.aspd);
      if (op.hurtAspdT > 0) add('aspd', X.meleeHurtAspd.aspd);
      const nb = op.blocked.length;
      for (const [k, bb] of [['bb2T', X.blockBuff2], ['bb3T', X.blockBuff3]]) {
        if (!bb) continue;
        if (nb >= bb.min) op[k] = bb.dur;
        if (op[k] > 0) { add('atk', bb.atk || 0); add('def', bb.def || 0); add('aspd', bb.aspd || 0); add('dodge', bb.dodge || 0); add('artsDodge', bb.dodge || 0); }
      }
      if (X.block1Atk && nb === 1) add('atk', X.block1Atk);
      if (X.blockingAtk && nb > 0) add('atk', X.blockingAtk);
      if (X.blockDodge && nb > 0) { const v = X.blockDodge.per * Math.min(X.blockDodge.max, nb); add('dodge', v); add('artsDodge', v); }
      if (X.deployedTimed && t >= X.deployedTimed.after) { add('defFlat', X.deployedTimed.def); add('res', X.deployedTimed.res); }
      if (op.firstGround) add('atk', X.firstGround.atk);
      if (X.defenderEntry && cls === 'defender' && t < X.defenderEntry.dur) { add('atk', X.defenderEntry.atk); add('def', X.defenderEntry.def); add('block', X.defenderEntry.block); }
      if (X.vanguardEarly && cls === 'vanguard' && S.time < X.vanguardEarly.dur) { add('atk', X.vanguardEarly.atk); add('def', X.vanguardEarly.def); }
      if (X.promotedDeployAtk && op.def.promoted && t < X.promotedDeployAtk.dur) add('atk', X.promotedDeployAtk.atk);
      if (X.noSkillRamp) {
        if (op.skillT > 0) op.ramp = 0; else op.ramp = Math.min(X.noSkillRamp.dur, (op.ramp || 0) + dt);
        const k = op.ramp / X.noSkillRamp.dur;
        add('atk', (X.noSkillRamp.atk || 0) * k); add('aspd', (X.noSkillRamp.aspd || 0) * k);
      }
      if (X.lowHpAspd) add('aspd', X.lowHpAspd * Math.min(1, Math.max(0, (1 - hr) / 0.7)));
      if (X.highHpAtk) add('atk', X.highHpAtk * hr);
      if (X.hurtAspd) add('aspd', X.hurtAspd.aspd * Math.min(X.hurtAspd.max, op.hurtN || 0));
      if (X.hurtAtk) add('atk', X.hurtAtk.base + X.hurtAtk.per * Math.min(X.hurtAtk.max, op.hurtN || 0));
      if (X.preSkillAtk && !op.usedManual) add('atk', X.preSkillAtk);
      if (X.ccGuard && (op.stun > 0 || op.chill > 0)) { add('defFlat', X.ccGuard.defFlat); add('res', X.ccGuard.res); }
      if (X.skillStackAtk) add('atk', X.skillStackAtk.per * Math.min(X.skillStackAtk.max, op.skillN || 0));
      if (X.skillStackStat && X.skillStackStat.classes.includes(cls)) { const n = Math.min(X.skillStackStat.max, op.skillN || 0); add('atk', X.skillStackStat.atk * n); add('def', X.skillStackStat.def * n); }
      if (X.timedStack && X.timedStack.classes.includes(cls)) add('atk', X.timedStack.atk * Math.min(X.timedStack.max, Math.floor(t / X.timedStack.every)));
      if (op.zoneAtk) add('atk', op.zoneAtk);
      if (op.bonus) for (const [k, v] of Object.entries(op.bonus)) add(k, v);
      charBuffs(op, add, dt);
      add('atk', perDep('atk'));
      add('aspd', perDep('aspd'));
      if (X.supporterAura) for (const o of S.ops) if (o.alive && o.def.class === 'supporter' && o.range.has(key(op.x, op.y))) { add('atk', X.supporterAura); break; }
      if (X.tower && full) { add('dodge', X.tower); add('artsDodge', X.tower); }
      if (X.chariot) {
        if (full && !op.chariotOn) { op.chariotOn = true; op.maxHp *= 1 + X.chariot.hp; op.hp *= 1 + X.chariot.hp; }
        if (!full && op.chariotOn) { op.chariotOn = false; op.maxHp /= 1 + X.chariot.hp; op.hp = Math.min(op.hp, op.maxHp); }
        if (op.chariotOn) add('block', X.chariot.block);
      }
      op.buff = b;
      // 지속 회복·SP
      if (X.opRegen) healOp(op, X.opRegen * dt, true);
      if (X.meleeRegen && melee && t < X.meleeRegen.dur) healOp(op, op.maxHp * X.meleeRegen.pct * dt, true);
      const st = op.skill.spType;
      if (op.skillT <= 0 && (!st || st === 'time')) {
        let r = (X.spRate || 0) + ((X.classSp && X.classSp[cls]) || 0) + perDep('sp');
        if (X.skillStackSp) r += X.skillStackSp.per * Math.min(X.skillStackSp.max, op.skillN || 0);
        if (X.snack && !op.usedManual) r += 1;
        if (r) op.sp = Math.min(op.skill.sp, op.sp + r * dt);
      }
      if (X.spTick && (st === 'attack' || st === 'hit')) { op.spTickT = (op.spTickT || 0) + dt; if (op.spTickT >= X.spTick) { op.spTickT -= X.spTick; gainSp(op, 1); } }
    }
    summonAuras();
    // 서포터 범위 안 적 약화
    if (X.supporterDebuff) for (const e of S.enemies) e.supDebuff = S.ops.some((o) => o.alive && o.def.class === 'supporter' && o.range.has(key(Math.floor(e.x), Math.floor(e.y))));
    // 전장 전체 주기 효과
    const vg = (X.perDeployed || []).find((p) => p.kind === 'dp');
    if (vg) { S.vgT = (S.vgT || 0) + dt; if (S.vgT >= 3) { S.vgT -= 3; S.dp = Math.min(S.maxDp, S.dp + vg.v * deployedOf(vg.class)); } }
    if (X.changdong && full) {
      S.cdT = (S.cdT || 0) + dt;
      if (S.cdT >= X.changdong.every) {
        S.cdT = 0; S.shake = 0.3; sfx('strike');
        for (const e of [...S.enemies]) { hitEnemy(e, X.changdong.dmg, 'arts', false, null, 0, true); stunEnemy(e, X.changdong.stun); }
        toast('창동 — 모든 적에게 번개가 내리칩니다');
      }
    }
    if (X.defenderBind) {
      S.bindT = (S.bindT || 0) + dt;
      if (S.bindT >= X.defenderBind.every) {
        S.bindT = 0;
        for (const op of S.ops) if (op.alive && op.def.class === 'defender') for (const e of enemiesNear(op, 1.5)) { stunEnemy(e, X.defenderBind.stun); hitEnemy(e, opAtk(op) * X.defenderBind.mul, 'phys', false, op, 0, true); }
      }
    }
    if (X.kingTools && S.life === 1) {
      S.kingT = (S.kingT || 0) + dt;
      if (S.kingT >= X.kingTools.every) { S.kingT = 0; for (const op of S.ops) { gainSp(op, X.kingTools.sp); healOp(op, op.maxHp * X.kingTools.hp, true); } }
    }
  }
  const deployedCount = () => S.ops.filter((o) => !o.def.summoned).length;
  // 오퍼레이터 재능·스킬로 생기는 매 프레임 버프 (키스 · 루시아 등)
  function charBuffs(op, add, dt) {
    const t = op.tal, ef = eff(op);
    if (op.def.summoned && op.owner && op.owner.alive) {
      const oe = eff(op.owner);
      if (oe.guardAtk) add('atk', oe.guardAtk - 1);
      if (oe.guardDef) add('def', oe.guardDef - 1);
      if (oe.guardAspd) add('aspd', oe.guardAspd);
      if (oe.guardBlock) add('block', oe.guardBlock);
    }
    if (t.houseEdge && S.ops.some((o) => o.owner === op && o.blocked.length)) add('aspd', t.houseEdge.aspd);
    if (op.def.class === 'vanguard') for (const k of S.ops) if (k.alive && k !== op && k.tal.trustGuest && k.range.has(key(op.x, op.y))) { add('aspd', k.tal.trustGuest.aspd); break; }
    if (t.easygoing && op.blocked.length) add('def', t.easygoing.def);
    if (op.def.class === 'device') {
      const oe = oeff(op), want = oe.devRange || op.def.range;
      if (oe.devAspd) add('aspd', oe.devAspd);
      if (op.rangeSrc !== want) { op.rangeSrc = want; setRange(op, want); }
    } else {
      let au = 0;
      for (const d of S.ops) if (d.alive && d.def.aura && near8(d, op.x, op.y)) au = Math.max(au, d.def.aura + (oeff(d).devAura || 0));
      if (au) add('aspd', au);
    }
    if (op.fatigueT > 0) { op.fatigueT -= dt; add('aspd', op.fatigueAspd); }
    if (t.choice && S.ops.some((o) => o.alive && o !== op && !o.def.summoned && o.hp / o.maxHp <= t.choice.below && op.range.has(key(o.x, o.y)))) {
      add('aspd', t.choice.aspd);
      if (!op.choiceUsed) { op.choiceUsed = true; if (op.skillT <= 0) op.sp = Math.min(op.skill.sp, op.sp + t.choice.sp); addText(op.x + 0.5, op.y - 0.1, '정해지지 않은 선택', op.def.color, 1, true); }
    }
    if (t.principle && op.prinStacks) { add('aspd', t.principle.aspd * op.prinStacks); }
    if (t.strict && S.ops.some((o) => o.alive && o !== op && o.def.class === 'defender' && near8(o, op.x, op.y))) { add('atk', t.strict.atk); add('dodge', t.strict.dodge); }
    const mc = t.mercenary;
    if (mc) {
      const m = ef.talentMul || 1;
      if (op.blocked.length) { add('def', mc.def * m); add('dodge', mc.dodge * m); }
      if (op.killAspdT > 0) { op.killAspdT -= dt; add('aspd', mc.killAspd * m * (op.killStacks || 0)); } else op.killStacks = 0;
    }
  }
  // 소환물이 적에게 거는 효과 (취약 · 공격력 감소)
  function summonAuras() {
    for (const o of S.ops) {
      const bv = eff(o).blockVuln;
      if (bv) for (const e of o.blocked) { e.vulnAmp = Math.max(e.vulnT > 0 ? e.vulnAmp : 0, bv); e.vulnT = 0.3; }
    }
    for (const g of S.ops) {
      if (!g.def.summoned || !g.owner || !g.owner.alive) continue;
      const ot = g.owner.tal, oe = eff(g.owner);
      for (const e of g.blocked) {
        if (ot.houseEdge) { e.vulnAmp = Math.max(e.vulnT > 0 ? e.vulnAmp : 0, ot.houseEdge.vuln); e.vulnT = 0.3; }
        if (oe.guardAtkDown) { e.atkDown = oe.guardAtkDown; e.atkDownT = 0.3; }
      }
      if (oe.guardVuln) for (const e of S.enemies) if (e.alive && Math.hypot(e.x - (g.x + 0.5), e.y - (g.y + 0.5)) <= oe.guardVuln.radius) { e.vulnAmp = Math.max(e.vulnT > 0 ? e.vulnAmp : 0, oe.guardVuln.amp); e.vulnT = 0.3; }
    }
  }
  // 오퍼레이터가 적을 처치했을 때
  function onOpKill(op) {
    const t = op.tal, ef = eff(op);
    op.kills = (op.kills || 0) + 1;
    if (t.mercenary) { op.killStacks = Math.min(t.mercenary.max, (op.killStacks || 0) + 1); op.killAspdT = t.mercenary.dur; }
    if (op.skillT > 0) {
      op.skillKills = (op.skillKills || 0) + 1;
      if (t.dailyPay) S.dp = Math.min(S.maxDp, S.dp + t.dailyPay.dp);
      if (ef.killHeal) healOp(op, op.maxHp * ef.killHeal);
      if (ef.killExtend && op.skillT !== Infinity && (op.extended || 0) < ef.killExtend.max) { op.skillT += ef.killExtend.sec; op.extended = (op.extended || 0) + ef.killExtend.sec; }
    }
  }
  // 스킬 발동 시 재능 효과
  function charSkill(op) {
    const t = op.tal;
    op.skillKills = 0; op.extended = 0;
    if (t.dailyPay) healOp(op, op.maxHp * t.dailyPay.heal);
    if (op.def.class === 'vanguard') {
      S.vgFirst = S.vgFirst || {};
      const keith = S.ops.find((k) => k.alive && k.tal.trustGuest);
      if (keith && !S.vgFirst[op.def.id]) { S.vgFirst[op.def.id] = true; S.dp = Math.min(S.maxDp, S.dp + keith.tal.trustGuest.dp); addText(op.x + 0.5, op.y - 0.35, '+' + keith.tal.trustGuest.dp + ' COST', '#ffd27a', 0.9, true); }
    }
  }
  // 배치 직후
  function relicDeploy(op, r) {
    const X = S.mods, def = op.def, melee = isGround(def);
    const idx = S.roster.indexOf(r), last = S.roster.length - 1;
    const bonus = {};
    const add = (k, v) => { bonus[k] = (bonus[k] || 0) + v; };
    const refund = (X.refund && X.refund.includes(def.class) ? 1 : 0) + (X.merchant && idx === last ? X.merchant.refund : 0);
    if (refund) S.dp = Math.min(S.maxDp, S.dp + Math.floor(def.cost * Math.min(1, refund)));
    if (def.gyesimDp) S.dp = Math.min(S.maxDp, S.dp + def.gyesimDp);
    if (X.meleeShield && melee) op.shield += op.maxHp * X.meleeShield;
    if (X.rangedShield && !melee) op.immune = (op.immune || 0) + X.rangedShield;
    if (X.immuneOnce) op.immune = (op.immune || 0) + 1;
    if (X.firstGround && melee && !S.firstGroundUsed) { S.firstGroundUsed = true; op.firstGround = true; op.protect = X.firstGround.debuff; }
    if (X.spawnZoneAtk && nearTile(op.x, op.y, 'R')) op.zoneAtk = X.spawnZoneAtk;
    if (X.baseZone && nearTile(op.x, op.y, 'B')) { add('block', X.baseZone.block); op.maxHp *= 1 + X.baseZone.hp; op.hp = op.maxHp; }
    if (X.dancer && idx === 0) { op.sp = Math.min(op.skill.sp, op.sp + X.dancer.sp); add('aspd', X.dancer.aspd); add('atk', X.dancer.atk); }
    if (X.merchant && idx === last) { add('block', X.merchant.block); add('def', X.merchant.def); op.maxHp *= 1 + X.merchant.hp; op.hp = op.maxHp; }
    if (X.boldBlade && def.id === S.boldId) { add('atk', X.boldBlade.atk); add('def', X.boldBlade.def); }
    S.deployCount = (S.deployCount || 0) + 1;
    if (X.fifthDeploy && S.deployCount === 5) {
      const f = X.fifthDeploy;
      if (f.hp) { op.maxHp *= 1 + f.hp; op.hp = op.maxHp; }
      add('def', f.def || 0); add('block', f.block || 0); add('atk', f.atk || 0);
      if (f.protect) op.protect = Math.max(op.protect || 0, f.protect);
      addText(op.x + 0.5, op.y - 0.3, '사방회료', '#ffd27a', 1, true);
    }
    if (X.adjacent) {
      const nb = S.ops.filter((o) => o !== op && o.alive && near8(o, op.x, op.y));
      for (const o of nb.length ? [op, ...nb] : []) {
        if (o.adjDone) continue;
        o.adjDone = true;
        o.bonus = o.bonus || {};
        if (X.adjacent.defFlat) { o.bonus.defFlat = (o.bonus.defFlat || 0) + X.adjacent.defFlat; o.bonus.res = (o.bonus.res || 0) + (X.adjacent.res || 0); }
        if (X.adjacent.hp && o !== op) { o.maxHp *= 1 + X.adjacent.hp; o.hp *= 1 + X.adjacent.hp; }
        if (X.adjacent.hp && o === op) { o.maxHp *= 1 + X.adjacent.hp; o.hp = o.maxHp; }
      }
    }
    if (X.dollLeft && idx === 0) for (const o of S.ops) gainSp(o, def.cost * X.dollLeft.sp);
    if (X.dollRight && idx === last) for (const o of S.ops) o.shield += def.cost * X.dollRight.shield;
    if (X.swan) {
      for (const e of [...S.enemies]) { hitEnemy(e, def.cost * X.swan.mul, 'arts', false, null, 0, true); if (def.cost >= X.swan.cost) stunEnemy(e, X.swan.stun); }
      if (S.enemies.length) addFx({ type: 'ring', x: op.x + 0.5, y: op.y + 0.5, life: 0.5, color: '#ffffff', r: 2 });
    }
    op.bonus = Object.assign(op.bonus || {}, Object.fromEntries(Object.entries(bonus).map(([k, v]) => [k, ((op.bonus || {})[k] || 0) + v])));
  }
  // 스킬 발동 직후
  function relicSkill(op) {
    const X = S.mods;
    op.skillN = (op.skillN || 0) + 1;
    if (op.skill.trigger === 'manual') op.usedManual = true;
    if (X.skillAtk) op.skillAtkT = X.skillAtk.dur;
    if (X.skillShield) op.shield += op.maxHp * X.skillShield;
    if (X.skillNova) for (const e of S.enemies) if (e.alive && op.range.has(key(Math.floor(e.x), Math.floor(e.y)))) hitEnemy(e, opAtk(op) * X.skillNova, 'arts', false, op, 0, true);
  }
  // 공격(치료) 직후
  function relicAttack(op, targets) {
    const X = S.mods, cls = op.def.class;
    if (X.classAtkSp && X.classAtkSp[cls]) gainSp(op, X.classAtkSp[cls]);
    if (X.casterHitSp && cls === 'caster') gainSp(op, X.casterHitSp * targets.length);
    if (X.rangedProc && !isGround(op.def)) {
      const list = S.enemies.filter((e) => e.alive && op.range.has(key(Math.floor(e.x), Math.floor(e.y))));
      if (list.length) hitEnemy(list[Math.floor(Math.random() * list.length)], X.rangedProc, 'arts', false, op, 0, true);
    }
    if (X.sniperProc && cls === 'sniper' && targets[0] && Math.random() < X.sniperProc.chance) {
      const t = targets[0];
      addFx({ type: 'ring', x: t.x, y: t.y, life: 0.3, color: '#ffb627', r: X.sniperProc.r });
      for (const e of [...S.enemies]) if (e.alive && Math.hypot(e.x - t.x, e.y - t.y) <= X.sniperProc.r) hitEnemy(e, opAtk(op) * X.sniperProc.mul, 'phys', false, op, 0, true);
    }
  }
  // 적에게 주는 대미지 배율
  function relicDealt(e, type, src) {
    const X = S.mods, en = X.enemy || {};
    let m = 1 + (type === 'phys' ? en.phys || 0 : en.arts || 0);
    if (type === 'arts') m += perDep('artsTaken');
    if (src && src.def) {
      if (type === 'arts' && X.classArtsDmg && X.classArtsDmg[src.def.class]) m += X.classArtsDmg[src.def.class];
      if (X.blockedDealt && e.blockedBy) m += X.blockedDealt;
      if (X.seaDmg && e.def.sea) m += X.seaDmg;
      const d = Math.hypot(src.x + 0.5 - e.x, src.y + 0.5 - e.y);
      if (X.farDmg) m += X.farDmg * Math.min(1, Math.max(0, (d - 1) / 5));
      if (X.nearDmg) m += X.nearDmg * Math.min(1, Math.max(0, (6 - d) / 5));
    }
    return m;
  }
  // 적이 쓰러졌을 때
  function relicKill(e) {
    const X = S.mods;
    if (X.killHeal) for (const o of S.ops) if (Math.hypot(o.x + 0.5 - e.x, o.y + 0.5 - e.y) <= X.killHeal.r) healOp(o, X.killHeal.amt);
    if (X.killSlow) for (const o of S.enemies) if (o !== e && o.alive && Math.hypot(o.x - e.x, o.y - e.y) <= X.killSlow.r && !(o.slowT > 0)) { o.slowT = X.killSlow.dur; o.slowMove = 1; o.slowAtk = 1.3; }
    if (X.flyKillBlast && isFly(e.def)) {
      addFx({ type: 'ring', x: e.x, y: e.y, life: 0.4, color: '#ff9a1f', r: X.flyKillBlast.r });
      for (const o of [...S.enemies]) if (o !== e && o.alive && Math.hypot(o.x - e.x, o.y - e.y) <= X.flyKillBlast.r) hitEnemy(o, X.flyKillBlast.dmg, 'phys', false, null, 0, true);
    }
  }
  const alliesNear = (op, r) => S.ops.filter((o) => o.alive && Math.hypot(o.x - op.x, o.y - op.y) <= r);
  const enemiesNear = (op, r) => S.enemies.filter((e) => e.alive && Math.hypot(e.x - (op.x + 0.5), e.y - (op.y + 0.5)) <= r);

  function deploy(r, tx, ty, dir) {
    if (r.left !== undefined && r.left <= 0) { setMode('idle'); return; }
    if (S.dp < r.def.cost) { toast('배치 코스트가 부족합니다'); setMode('idle'); return; }
    if (!r.def.summoned && deployedCount() >= S.deployLimit) { toast('배치 가능 인원을 초과했습니다'); setMode('idle'); return; }
    const def = r.def, tal = talentFx(def), skill = chosenSkill(def);
    S.dp -= def.cost;
    const maxHp = Math.round(def.hp * tal.hp);
    const op = {
      def, tal, skill, roster: r, x: tx, y: ty, dir, hp: maxHp, maxHp, atkCd: 0.3,
      sp: skill.initSp || 0, skillT: 0, charges: 0, charge: 0, burst: null, shield: 0, chill: 0, auraDef: 0,
      firstStrike: !!tal.firstStrike, lastStandUsed: false,
      blocked: [], alive: true, flash: 0, born: S.time,
    };
    setRange(op, def.range);
    S.ops.push(op);
    if (r.owner) op.owner = r.owner;
    // 소환물을 가진 오퍼레이터: 배치하면 소환물 카드가 생김
    // charges가 있는 장치는 남은 횟수만큼 여러 개 설치할 수 있음 (작전 중 횟수 유지)
    const sums = def.summons || (def.summon ? [def.summon] : []);
    if (sums.length) {
      r.summonRs = r.summonRs || sums.map((sm, i) => ({ def: { ...sm, summoned: true, id: sm.id || def.id + '_summon' + (i || ''), skills: [{ name: '-', desc: '', sp: 999, duration: 0, effect: {} }], talents: [], rarity: 0 }, cd: 0, deployed: false, left: sm.charges }));
      let at = S.roster.indexOf(r) + 1, changed = false;
      for (const sr of r.summonRs) {
        sr.owner = op;
        if (!S.roster.includes(sr)) { S.roster.splice(at, 0, sr); changed = true; }
        at = S.roster.indexOf(sr) + 1;
      }
      if (changed) buildCards();
    }
    relicDeploy(op, r);
    sfx('deploy');
    if (r.left !== undefined) { r.left--; r.cd = def.redeploy; } else r.deployed = true;
    addFx({ type: 'ring', x: tx + 0.5, y: ty + 0.5, life: 0.4, color: def.color });
    addText(tx + 0.5, ty - 0.1, UI.line(def, 'deploy'), def.color, 1.8, true);
    setMode('idle');
    if (skill.spType === 'deploy') activateSkill(op);
  }

  function removeOp(op, died) {
    if (!op.alive) return;
    op.alive = false;
    // 주인이 퇴각하면 소환물도 함께 퇴각, 카드도 사라짐
    const srs = op.roster.summonRs;
    if (srs) {
      for (const sm of S.ops.filter((o) => o.owner === op)) removeOp(sm, false);
      S.roster = S.roster.filter((x) => !srs.includes(x));
      for (const sr of srs) { sr.deployed = false; if (S.sel === sr) setMode('idle'); }
      buildCards();
    }
    for (const e of op.blocked) if (e.blockedBy === op) e.blockedBy = null;
    op.blocked = [];
    S.ops = S.ops.filter((o) => o !== op);
    op.roster.deployed = false;
    op.roster.cd = op.def.redeploy * Math.max(0.2, 1 - perDep('redeploy'));
    if (S.inspect === op) setMode('idle');
    if (died) { sfx('down'); addText(op.x + 0.5, op.y + 0.2, '전투 불능', '#ff6b6e', 1.2, true); }
  }
  function retreat(op) {
    S.dp = Math.min(S.maxDp, S.dp + Math.floor(op.def.cost / 2));
    addText(op.x + 0.5, op.y + 0.2, '철수', '#9aa1ab', 0.8, true);
    sfx('retreat');
    removeOp(op, false);
  }

  // 발동 중이고 수동 종료가 가능하면 종료, 아니면 발동
  function useSkill(op) {
    if (op.skillT > 0 && (op.skill.effect || {}).cancelable) { endSkill(op); addText(op.x + 0.5, op.y - 0.1, '스킬 종료', '#9aa1ab', 0.8, true); return; }
    activateSkill(op);
  }
  function activateSkill(op) {
    const sk = op.skill, ef = sk.effect || {};
    if (op.skillT > 0 || op.sp < sk.sp) return false;
    sfx(ef.strike ? 'strike' : 'skill');
    const atk = op.def.atk * op.tal.atk * (ef.atk || 1);
    if (ef.dp) S.dp = Math.min(S.maxDp, S.dp + ef.dp);
    if (ef.heal) healOp(op, op.maxHp * ef.heal);
    if (ef.shield) op.shield = op.maxHp * ef.shield;
    if (ef.nextHit) { op.charge = ef.nextHit; op.chargeStun = ef.nextStun || 0; }
    if (ef.hpMul && sk.duration) { op.maxHp *= ef.hpMul; op.hp *= ef.hpMul; }
    op.rallyUsed = false; op.finN = 0; op.shellN = 0;
    if (ef.wave) op.waveT = ef.wave.every * 0.5;
    if (ef.fishing) {
      const fs = ef.fishing;
      S.giftMiss = S.giftMiss || 0;
      const rare = S.giftMiss >= fs.pity || Math.random() < fs.gift;
      S.giftMiss = rare ? 0 : S.giftMiss + 1;
      const sr = (op.roster.summonRs || []).find((x) => x.def.id === (rare ? fs.rare : fs.common));
      if (sr) { sr.left = (sr.left || 0) + 1; addText(op.x + 0.5, op.y - 0.45, sr.def.name + ' 획득!', rare ? '#6fa8ff' : '#ff9a5c', 1.4, true); }
      op.hp = Math.max(1, op.hp - op.maxHp * fs.hp);
    }
    if (ef.hits && !sk.duration) op.burst = ef.hits;
    if (ef.allyHeal) {
      for (const a of alliesNear(op, ef.allyHeal.radius)) {
        if (a.hp >= a.maxHp) continue;
        healOp(a, atk * ef.allyHeal.mul);
        addFx({ type: 'beam', x1: op.x + 0.5, y1: op.y + 0.5, x2: a.x + 0.5, y2: a.y + 0.5, life: 0.3, color: '#7dff9a' });
      }
      sfx('heal');
    }
    if (ef.burstHeal) {
      for (const a of S.ops) {
        if (!a.alive || !op.range.has(key(a.x, a.y))) continue;
        healOp(a, atk * ef.burstHeal);
        addFx({ type: 'beam', x1: op.x + 0.5, y1: op.y + 0.5, x2: a.x + 0.5, y2: a.y + 0.5, life: 0.35, color: '#7dff9a' });
      }
      sfx('heal');
    }
    if (ef.strike) {
      for (const t of enemiesNear(op, ef.strike.radius)) {
        addFx({ type: 'slash', x: t.x, y: t.y, life: 0.3, color: '#ffcf3a' });
        hitEnemy(t, atk * ef.strike.mul, 'phys');
        if (ef.strike.stun) stunEnemy(t, ef.strike.stun);
      }
      addFx({ type: 'ring', x: op.x + 0.5, y: op.y + 0.5, life: 0.4, color: '#ffcf3a', r: ef.strike.radius });
    }
    op.sp = 0;
    relicSkill(op);
    charSkill(op);
    op.skillT = sk.duration === -1 ? Infinity : sk.duration || 0;
    op.charges = ef.charges || 0;
    if (ef.range && op.skillT > 0) setRange(op, ef.range);
    addFx({ type: 'ring', x: op.x + 0.5, y: op.y + 0.5, life: 0.5, color: '#ffcf3a' });
    addText(op.x + 0.5, op.y - 0.1, sk.name, '#ffcf3a', 1.2, true);
    const cl = sk.voice || UI.line(op.def, 'combat');
    if (cl && (op.def.voice || sk.voice)) addText(op.x + 0.5, op.y - 0.45, cl, op.def.color, 1.8, true);
    return true;
  }

  // 지속형 스킬이 끝날 때
  function endSkill(op) {
    const ef = op.skill.effect || {};
    op.skillT = 0;
    op.charges = 0;
    if (ef.endHealPerKill && op.skillKills) healOp(op, op.maxHp * ef.endHealPerKill * op.skillKills);
    if (ef.guardRetreat) for (const sm of S.ops.filter((o) => o.owner === op)) { addText(sm.x + 0.5, sm.y + 0.2, '퇴각', '#9aa1ab', 0.8, true); removeOp(sm, false); }
    if (ef.range) setRange(op, op.def.range);
    if (ef.shield) op.shield = 0;
    if (ef.hpMul) { op.maxHp /= ef.hpMul; op.hp = Math.min(op.hp, op.maxHp); }
    if (ef.endCost) { op.hp = Math.max(1, op.hp - op.maxHp * ef.endCost.hp); op.fatigueT = ef.endCost.dur; op.fatigueAspd = ef.endCost.aspd; addText(op.x + 0.5, op.y - 0.1, '어지러워……', '#9aa1ab', 1, true); }
    if (ef.proofBlast) {
      const atk = op.def.atk * op.tal.atk * (ef.atk || 1);
      const proven = S.enemies.filter((e) => e.alive && e.proof);
      for (const t of proven) {
        addFx({ type: 'ring', x: t.x, y: t.y, life: 0.5, color: '#ffe36b', r: 0.6 });
        hitEnemy(t, atk * ef.proofBlast, 'arts', true, op);
      }
      if (proven.length) { sfx('strike'); addText(op.x + 0.5, op.y - 0.3, '논고 종결', '#ffe36b', 1.2, true); }
    }
    if (ef.endBlast) {
      const atk = op.def.atk * op.tal.atk * (ef.atk || 1);
      for (const t of enemiesNear(op, ef.endBlast.radius)) hitEnemy(t, atk * ef.endBlast.mul, 'phys');
      addFx({ type: 'ring', x: op.x + 0.5, y: op.y + 0.5, life: 0.5, color: '#ff9a1f', r: ef.endBlast.radius });
      sfx('strike');
      if (ef.endBlast.selfDmg) op.hp = Math.max(1, op.hp - op.maxHp * ef.endBlast.selfDmg);
    }
  }

  function healOp(op, amt, quiet) {
    const before = op.hp;
    op.hp = Math.min(op.maxHp, op.hp + amt * (1 + (S.mods.healMul || 0)));
    // 가시 고리: 근거리 오퍼레이터가 치료를 받으면 주변 4칸 오퍼레이터 SP +1
    if (S.mods.meleeHealSp && !quiet && op.hp > before && isGround(op.def)) for (const o of S.ops) if (Math.abs(o.x - op.x) + Math.abs(o.y - op.y) <= 1) gainSp(o, S.mods.meleeHealSp);
    if (!quiet && op.hp > before) addText(op.x + 0.5, op.y + 0.3, '+' + Math.round(op.hp - before), '#7dff9a', 0.7);
  }

  function remaining(e) {
    const p = e.path[e.pi];
    return p ? Math.hypot(p.x - e.x, p.y - e.y) + p.rem : 0;
  }

  function pickTargets(op, n) {
    const ground = isGround(op.def);
    const antiAir = op.def.class === 'sniper';
    // 공격수: 저지 중인 적 전부 동시 공격
    if (op.def.archetype === 'centurion' || eff(op).allBlocked || (op.def.summoned && op.owner && op.owner.alive && eff(op.owner).guardAll)) n = Math.max(n, op.blocked.length);
    const list = S.enemies.filter((e) => e.alive && (e.blockedBy === op ||
      (op.range.has(key(Math.floor(e.x), Math.floor(e.y))) && !(ground && isFly(e.def) && op.def.archetype !== 'sentry'))));
    const prio = eff(op).priority;
    list.sort((a, b) =>
      (prio === 'lowDef' ? a.def.def - b.def.def : 0) ||
      (prio === 'proof' ? !!b.proof - !!a.proof : 0) ||
      (op.def.archetype === 'besieger' ? wOf(b) - wOf(a) : 0) ||
      (b.blockedBy === op) - (a.blockedBy === op) ||
      (antiAir ? isFly(b.def) - isFly(a.def) : 0) ||
      remaining(a) - remaining(b));
    return list.slice(0, n);
  }

  function hasWork(op) {
    const ef = op.skill.effect || {};
    if (ef.allyHeal) return alliesNear(op, ef.allyHeal.radius).some((o) => o.hp < o.maxHp);
    if (op.def.class === 'medic') return S.ops.some((o) => o.hp < o.maxHp && op.range.has(key(o.x, o.y)));
    return pickTargets(op, 1).length > 0;
  }

  function updateOp(op, dt) {
    const sk = op.skill, ef = sk.effect || {};
    op.flash = Math.max(0, op.flash - dt);
    op.chill = Math.max(0, op.chill - dt);
    if (op.resT > 0) op.resT -= dt;
    if (op.surviveT > 0) op.surviveT -= dt;
    op.brand = onBrand(op.x, op.y);
    if (op.brand && !S.mods.brandImmune) { op.hp -= op.maxHp * 0.01 * dt; if (op.hp <= 0) { removeOp(op, true); return; } }
    if (op.stun > 0) { op.stun -= dt; op.atkCd = Math.max(op.atkCd, 0.2); return; }
    if (op.hotT > 0) { op.hotT -= dt; healOp(op, op.hotAmt * dt, true); }
    op.blocked = op.blocked.filter((e) => e.alive && e.blockedBy === op);

    if (op.skillT > 0) {
      if (op.skillT !== Infinity) {
        op.skillT -= dt;
        if (op.skillT <= 0) endSkill(op);
      }
      if (ef.regen) healOp(op, op.maxHp * ef.regen * dt, true);
      if (ef.dpRegen) S.dp = Math.min(S.maxDp, S.dp + ef.dpRegen * dt);
      if (ef.wave && (op.waveT -= dt) <= 0) {
        op.waveT = ef.wave.every;
        const wv = ef.wave;
        for (const e of S.enemies.filter((e) => e.alive && op.range.has(key(Math.floor(e.x), Math.floor(e.y))))) {
          hitEnemy(e, opAtk(op) * wv.mul, 'arts', false, op);
          e.slowT = wv.dur; e.slowMove = wv.slow; e.slowAtk = 1;
        }
        for (const [kx, ky] of op.rangeList) addFx({ type: 'ring', x: kx + 0.5, y: ky + 0.5, life: 0.5, color: '#5fd3ff', r: 0.45 });
        sfx('arts');
      }
      if (ef.allyRegen) for (const a of alliesNear(op, ef.allyRegen.radius)) healOp(a, opAtk(op) * ef.allyRegen.mul * dt, true);
    } else if (sk.spType !== 'deploy') {
      if (!sk.spType || sk.spType === 'time') op.sp = Math.min(sk.sp, op.sp + dt);
      if (sk.trigger === 'auto' && op.sp >= sk.sp && !op.charge && !op.burst && hasWork(op)) activateSkill(op);
    }

    // 예리한 관찰: 공격 범위 안의 적에게 「분석」 누적
    const an = op.tal.analyze;
    if (an) {
      const rate = an.rate * (eff(op).analyzeRate || 1), slow = eff(op).slowAnalyzed, dd = op.tal.deduce;
      for (const e of S.enemies) {
        if (!e.alive || !op.range.has(key(Math.floor(e.x), Math.floor(e.y)))) continue;
        e.analysis = Math.min(an.max, e.analysis + rate * dt);
        e.ana = { max: an.max, def: an.def, res: an.res, amp: dd ? dd.amp : 0, partner: dd && dd.partner, partnerAmp: dd ? dd.partnerAmp : 0 };
        if (slow && e.analysis >= an.max) { e.slowT = 0.3; e.slowMove = slow.move; e.slowAtk = slow.atk; }
      }
    }

    op.atkCd -= dt;
    if (op.atkCd > 0) return;
    const n = eff(op).targets || oeff(op).devTargets || op.def.targets || 1;
    const cx = op.x + 0.5, cy = op.y + 0.5;

    if (op.def.class === 'medic') {
      const allies = S.ops
        .filter((o) => o.alive && o.hp < o.maxHp && op.range.has(key(o.x, o.y)))
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
        .slice(0, n);
      if (!allies.length) return;
      const ls = op.tal.listen, rb = eff(op).resBuff, hot = eff(op).hot;
      if (ls) {
        if (op.healTarget === allies[0]) op.healStacks = Math.min(ls.max / ls.step, (op.healStacks || 0) + 1);
        else { op.healTarget = allies[0]; op.healStacks = 0; }
      }
      for (const a of allies) {
        healOp(a, opAtk(op) * (ls && a === op.healTarget ? 1 + op.healStacks * ls.step : 1));
        if (rb) { a.resBuff = rb.res; a.resT = rb.dur; }
        if (hot) { a.hotAmt = opAtk(op) * hot.mul; a.hotT = hot.dur; }
        addFx({ type: 'beam', x1: cx, y1: cy, x2: a.x + 0.5, y2: a.y + 0.5, life: 0.25, color: '#7dff9a' });
      }
      sfx('heal');
      relicAttack(op, []);
      afterAttack(op);
      return;
    }

    const targets = pickTargets(op, n);
    if (!targets.length) return;
    const type = op.def.dmgType || (op.def.class === 'caster' || op.def.class === 'supporter' ? 'arts' : 'phys');
    // 타고난 천재: 같은 적을 연속 공격하면 방어력 무시가 쌓임
    let ignore = 0;
    const fo = op.tal.focus;
    if (fo) {
      if (op.focusTarget === targets[0]) op.focusStacks = Math.min(fo.max / fo.step, (op.focusStacks || 0) + 1);
      else { op.focusTarget = targets[0]; op.focusStacks = 0; }
      ignore = op.focusStacks * fo.step;
    }
    // 원칙에 따라: 같은 적 연속 공격 중첩
    const pr = op.tal.principle;
    if (pr) {
      if (op.prinTarget === targets[0]) op.prinStacks = Math.min(pr.max, (op.prinStacks || 0) + 1);
      else { op.prinTarget = targets[0]; op.prinStacks = 0; }
      ignore = Math.min(1, ignore + op.prinStacks * pr.ignore);
    }
    op.debuffedTarget = isDebuffed(targets[0]);
    let mul = 1;
    if (pr && op.prinStacks >= pr.max) mul *= 1 + pr.amp;
    if (eff(op).focusAmp && op.prinStacks) mul *= 1 + eff(op).focusAmp * op.prinStacks;
    // 믿음직한 동료: 펠릭스가 저지한 적을 치는 가드
    const rb = targets[0].blockedBy;
    if (op.def.class === 'guard' && rb && rb !== op && rb.alive && rb.tal.reliable) mul *= 1 + rb.tal.reliable.atk;
    let stunHit = eff(op).hitStun || op.def.hitStun || 0, nsplash = 0;
    if (eff(op).twinShot) mul *= eff(op).twinShot.mul;
    // 푸른 탄도: 무거운 적 방어 무시, 같은 적 연속 공격 중첩
    const bs = op.tal.blueShot;
    let bsMul = 1;
    if (bs) {
      if (op.bsTarget === targets[0]) op.bsStacks = Math.min(bs.max, (op.bsStacks || 0) + 1);
      else { op.bsTarget = targets[0]; op.bsStacks = 0; }
      bsMul = 1 + op.bsStacks * bs.step;
    }
    const ignOf = (t) => (bs && wOf(t) >= bs.weight ? Math.min(1, ignore + bs.ignore) : ignore);
    if (op.firstStrike) { mul *= op.tal.firstStrike; op.firstStrike = false; addText(cx, op.y + 0.1, '발도!', '#ffcf3a', 0.8, true); }
    if (op.charge) { mul *= op.charge; op.charge = 0; if (op.chargeStun) { stunHit = Math.max(stunHit, op.chargeStun); op.chargeStun = 0; } nsplash = (op.skill.effect || {}).nextSplash || 0; }
    const fin = eff(op).finisher;
    const finish = fin && ++op.finN % fin.every === 0;
    const sh = eff(op).shell;
    const shell = sh && ++op.shellN % sh.every === 0;
    const hits = op.burst || eff(op).hits || oeff(op).devHits;
    op.burst = null;
    const count = hits ? hits.count : 1, hitMul = hits ? hits.mul : 1;
    const atk = opAtk(op) * mul * hitMul, splash = eff(op).splash || op.def.splash || nsplash;
    sfx(type === 'arts' ? 'arts' : isGround(op.def) ? 'slash' : 'shot');
    for (const t of targets) {
      for (let i = 0; i < count; i++) {
        if (isGround(op.def)) addFx({ type: 'slash', x: t.x, y: t.y, life: 0.15, color: op.def.color });
        else addFx({ type: 'shot', x1: cx, y1: cy, x2: t.x + (i ? (Math.random() - 0.5) * 0.2 : 0), y2: t.y, life: 0.15, color: type === 'arts' ? '#c89bff' : '#fff2b3' });
        const crit = op.tal.crit && Math.random() < op.tal.crit.rate ? op.tal.crit.mul : 1;
        hitEnemy(t, atk * crit * (t === targets[0] ? bsMul : 1), type, crit > 1, op, ignOf(t));
        const ec = op.def.summoned && op.owner && op.owner.tal.echo;
        if (ec && t.alive) {
          t.resDown = ec.res; t.resDownT = ec.dur;
          if (op.echoTarget === t) hitEnemy(t, opAtk(op) * ec.mul, 'arts', false, op, 0, true);
          op.echoTarget = t;
        }
        const ts = eff(op).twinShot;
        if (ts && i === 0) {
          addFx({ type: 'ring', x: t.x, y: t.y, life: 0.3, color: '#6fa8ff', r: ts.radius });
          for (const o of S.enemies.filter((o) => o.alive && Math.hypot(o.x - t.x, o.y - t.y) <= ts.radius)) hitEnemy(o, opAtk(op) * ts.blast, 'phys', false, op, ignOf(o));
        }
        const pf = op.tal.proof;
        if (pf && t.alive && !t.proof) {
          t.proofHits = (t.proofHits || 0) + (eff(op).proofRate || 1);
          if (t.proofHits >= pf.hits) { t.proof = { res: pf.res }; addText(t.x, t.y - 0.45, '입증', '#ffe36b', 0.9, true); }
        }
        const xh = eff(op).extraHit;
        if (xh && t.alive && Math.random() < xh.rate) {
          addFx({ type: 'shot', x1: cx, y1: cy, x2: t.x + 0.1, y2: t.y - 0.1, life: 0.15, color: '#ffe36b' });
          hitEnemy(t, atk * xh.mul, type, false, op);
        }
        if (op.tal.argue && t.alive && t.proof) hitEnemy(t, opAtk(op) * op.tal.argue.mul, 'arts', false, op);
        if (stunHit && t.alive) stunEnemy(t, stunHit);
        if (op.tal.relay && i === 0) markEnemy(op, t);
        if (finish && i === 0 && t.alive) { addFx({ type: 'ring', x: t.x, y: t.y, life: 0.35, color: '#ffcf3a', r: 0.5 }); hitEnemy(t, opAtk(op) * fin.mul, 'phys', true, op, ignore, true); }
        if (splash) {
          for (const o of S.enemies) {
            if (o !== t && o.alive && Math.hypot(o.x - t.x, o.y - t.y) <= splash) hitEnemy(o, atk, type, false, op);
          }
        }
      }
      if (splash) addFx({ type: 'ring', x: t.x, y: t.y, life: 0.3, color: '#c89bff', r: splash });
    }
    // PARABELLUM BULLET: 가장 무거운 적에게 탄환 집중
    const hf = eff(op).heavyFocus;
    if (hf) {
      const hv = targets.filter((t) => t.alive).sort((a, b) => wOf(b) - wOf(a))[0];
      if (hv) { addFx({ type: 'shot', x1: cx, y1: cy, x2: hv.x, y2: hv.y, life: 0.15, color: '#6fa8ff' }); hitEnemy(hv, atk * hf, type, false, op, ignOf(hv)); }
    }
    // 편집 없는 생중계: 특수 탄환
    if (shell) {
      const c = targets[0];
      addFx({ type: 'ring', x: c.x, y: c.y, life: 0.4, color: '#ffcf3a', r: sh.radius });
      for (const o of S.enemies.filter((o) => o.alive && Math.hypot(o.x - c.x, o.y - c.y) <= sh.radius)) {
        hitEnemy(o, opAtk(op) * sh.mul, 'phys', true, op);
        stunEnemy(o, sh.stun);
        if (op.tal.relay) markEnemy(op, o);
      }
      sfx('strike');
    }
    if (eff(op).hitHeal) healOp(op, op.maxHp * eff(op).hitHeal, true);
    relicAttack(op, targets);
    afterAttack(op);
  }
  // 현장 생중계: 중계 표식 (동시에 최대 max명)
  function markEnemy(op, e) {
    if (!e.alive) return;
    const rl = op.tal.relay;
    if (!(e.markT > 0) && S.enemies.filter((o) => o.alive && o.markT > 0).length >= rl.max) return;
    e.markT = rl.dur + (eff(op).markExtra || 0);
    e.markBy = op;
  }
  const markAmpOf = (e) => (e.markT > 0 && e.markBy ? eff(e.markBy).markAmp || e.markBy.tal.relay.amp : 0);

  function afterAttack(op) {
    const sk = op.skill;
    if (sk.spType === 'attack' && op.skillT <= 0) op.sp = Math.min(sk.sp, op.sp + 1);
    if (op.charges > 0 && --op.charges === 0 && op.skillT > 0) endSkill(op);
    op.atkCd = opInterval(op);
  }

  function calcDamage(atk, type, def, res) {
    if (type === 'true') return atk;
    if (type === 'arts') return Math.max(atk * (1 - res / 100), atk * 0.05);
    return Math.max(atk - def, atk * 0.05);
  }

  // 신경 손상: 1000까지 쌓이면 큰 피해를 입고 잠시 기절
  function addNeural(op, v) {
    if (!op.alive || v <= 0) return;
    const m = debuffMul(op);
    op.neural = (op.neural || 0) + v * m;
    if (op.neural < 1000) return;
    op.neural = 0;
    op.stun = 6 * m;
    op.hp -= 800;
    op.flash = 0.2;
    addText(op.x + 0.5, op.y - 0.1, '신경 손상', '#c77dff', 1, true);
    if (op.hp <= 0) removeOp(op, true);
  }
  function onDodge(op) {
    const X = S.mods;
    addText(op.x + 0.5, op.y + 0.25, '회피', '#cfd3d6', 0.5);
    if (X.dodgeAtk) op.dodgeAtkT = X.dodgeAtk.dur;
    if (X.dodgeAspd) op.dodgeAspdT = X.dodgeAspd.dur;
    if (X.dodgeNext) op.charge = Math.max(op.charge || 0, 1 + X.dodgeNext);
  }
  function hitOp(op, atk, type, src) {
    if (!op.alive) return;
    const X = S.mods;
    if (type === 'phys' && Math.random() < opDodge(op)) { onDodge(op); return; }
    if (type === 'arts' && Math.random() < opArtsDodge(op)) { onDodge(op); return; }
    const eg = src && src.blockedBy === op && op.tal.easygoing;
    if (eg && Math.random() < eg.nullify) { addText(op.x + 0.5, op.y + 0.25, '무효', '#7fd8ff', 0.5); return; }
    if (op.immune > 0) { op.immune--; addText(op.x + 0.5, op.y + 0.25, '무효', '#7fd8ff', 0.5); if (X.dodgeNext) op.charge = Math.max(op.charge || 0, 1 + X.dodgeNext); return; }
    let dmg = calcDamage(atk, type, opDef(op), opRes(op)) * guardMul(op);
    if (src && src.markT > 0 && eff(op).markCut) dmg *= 1 - eff(op).markCut;
    if (op.surviveT > 0) dmg *= 1 - op.tal.survive.cut;
    if (src && src.def) {
      if (X.firstHitCut && !src.firstHitDone) { src.firstHitDone = true; dmg *= 1 - X.firstHitCut; }
      if (X.blockedTaken && src.blockedBy) dmg *= 1 - X.blockedTaken;
      if (X.outRangeCut && !op.range.has(key(Math.floor(src.x), Math.floor(src.y)))) dmg *= 1 - X.outRangeCut;
      if (X.seaFear && src.def.sea && !src.feared) { src.feared = true; stunEnemy(src, X.seaFear); addText(src.x, src.y - 0.4, '공포', '#c9a6ff', 0.8); }
    }
    if (type === 'phys') {
      dmg *= Math.max(0.1, 1 - perDep('physCut'));
      if (eff(op).physCut) dmg *= 1 - eff(op).physCut;
      if (op.tal.strict && src && src.blockedBy === op) dmg *= 1 - op.tal.strict.cut;
      if (op.def.class === 'guard') { const f = S.ops.find((o) => o.alive && o !== op && o.tal.reliable && near8(o, op.x, op.y)); if (f) dmg *= 1 - f.tal.reliable.cut; }
      // 농담은 여기까지: 주변 아군의 물리 피해 일부를 대신 받음
      const cv = S.ops.find((o) => o.alive && o !== op && eff(o).cover && near8(o, op.x, op.y));
      if (cv && dmg > 0) { const part = dmg * eff(cv).cover; dmg -= part; hitOp(cv, part, 'true', null); }
    }
    const g = op.tal.guard;
    if (g && op.hp / op.maxHp <= g.below) dmg *= g.taken;
    if (op.shield > 0) {
      const absorbed = Math.min(op.shield, dmg);
      op.shield -= absorbed;
      dmg -= absorbed;
      if (dmg <= 0) { addText(op.x + 0.5, op.y + 0.25, '보호막', '#7fd8ff', 0.5); return; }
    }
    // 용기는 조금씩: 범위 안 아군의 치명상을 작전 중 1회 줄이고 부표 횟수 회복
    if (op.hp - dmg <= 0 && !S.courageUsed) {
      const cf = S.ops.find((o) => o.alive && o.tal.courage && o.range.has(key(op.x, op.y)));
      if (cf) {
        S.courageUsed = true;
        dmg *= 1 - cf.tal.courage.cut;
        const br = (cf.roster.summonRs || [])[0];
        if (br) br.left = (br.left || 0) + 1;
        addText(cf.x + 0.5, cf.y - 0.1, '용기는 조금씩', cf.def.color, 1.2, true);
      }
    }
    // 일단 살고 봐야죠!: 배치 후 첫 치명상 무효
    const sv = op.tal.survive;
    if (sv && !op.surviveUsed && op.hp - dmg <= 0) {
      op.surviveUsed = true;
      op.surviveT = sv.dur;
      healOp(op, op.maxHp * sv.heal);
      if (op.skillT <= 0) op.sp = Math.min(op.skill.sp, op.sp + sv.sp);
      addText(op.x + 0.5, op.y - 0.1, '일단 살고 봐야죠!', '#7fd8ff', 1.2, true);
      return;
    }
    op.hp -= dmg;
    op.flash = 0.12;
    sfx('hurt');
    addText(op.x + 0.5, op.y + 0.25, Math.round(dmg), type === 'arts' ? '#d9b3ff' : '#ff8c8f', 0.6);
    if (op.skill.spType === 'hit' && op.skillT <= 0) op.sp = Math.min(op.skill.sp, op.sp + 1);
    if (src && src.def.chill) op.chill = 3 * debuffMul(op);
    if (src && src.def.neural) { addNeural(op, src.def.neural); if (X.hurtSp) gainSp(op, X.hurtSp); }
    if (X.hurtSp) gainSp(op, X.hurtSp);
    if (X.classHitSp && X.classHitSp[op.def.class]) gainSp(op, X.classHitSp[op.def.class]);
    if (X.meleeHurtAspd && isGround(op.def)) op.hurtAspdT = X.meleeHurtAspd.dur;
    op.hurtN = (op.hurtN || 0) + 1;
    if (X.hpFear && !op.feared && op.hp > 0 && op.hp / op.maxHp <= X.hpFear.below) {
      op.feared = true;
      for (const e of S.enemies) if (e.alive && op.range.has(key(Math.floor(e.x), Math.floor(e.y)))) stunEnemy(e, X.hpFear.dur);
      addText(op.x + 0.5, op.y - 0.2, '명적통', '#c9a6ff', 1, true);
    }
    const ra = eff(op).rally;
    if (ra && !op.rallyUsed && op.hp > 0 && op.hp / op.maxHp <= ra.below) {
      op.rallyUsed = true;
      healOp(op, op.maxHp * ra.heal);
      for (const e of enemiesNear(op, ra.radius)) stunEnemy(e, ra.stun);
      addFx({ type: 'ring', x: op.x + 0.5, y: op.y + 0.5, life: 0.5, color: '#ffcf3a', r: ra.radius });
      addText(op.x + 0.5, op.y - 0.1, '농담은 여기까지', '#ffcf3a', 1.2, true);
      S.shake = 0.25;
    }
    const ls = op.tal.lastStand;
    if (ls && !op.lastStandUsed && op.hp > 0 && op.hp / op.maxHp <= ls.below) {
      op.lastStandUsed = true;
      healOp(op, op.maxHp * ls.heal);
      addText(op.x + 0.5, op.y - 0.1, '마지막 정리', '#ffcf3a', 1, true);
    }
    if (op.hp <= 0) removeOp(op, true);
  }

  // =====================================================================
  //  적 — 특수 능력
  // =====================================================================
  function spawnEnemy(q) {
    const def = (S.edefs && S.edefs[q.enemy]) || ENEMIES[q.enemy];
    if (!def) { console.warn('알 수 없는 적:', q.enemy); S.total--; return; }
    const i = S.paths[q.spawn] ? q.spawn : 0;
    const path = isFly(def) ? S.flyPaths[i] : S.paths[i];
    S.enemies.push({
      def, path, pi: 1, x: path[0].x, y: path[0].y,
      hp: def.hp, maxHp: def.hp, atkCd: def.interval * 0.5, blockedBy: null, alive: true, flash: 0,
      stun: 0, atkMul: 1, revived: false, blinked: false, analysis: 0, ana: null, slowT: 0, proofHits: 0, proof: null,
    });
    if (def.boss) { sfx('boss'); toast(`경고 — ${def.name} 출현`); S.shake = 0.5; } else sfx('spawn');
  }

  function hitEnemy(e, atk, type, crit, src, ignore = 0, extra = false) {
    if (!e.alive) return;
    const X = S.mods;
    if (e.def.dodge && Math.random() < e.def.dodge) { addText(e.x, e.y - 0.25, '회피', '#cfd3d6', 0.4); return; }
    const hd = e.def.harden && e.hp / e.maxHp < e.def.harden.below ? e.def.harden.def : 1;
    if (src && src.def && X.ignoreDef && X.ignoreDef.classes.includes(src.def.class)) ignore = Math.min(1, ignore + X.ignoreDef.v);
    let def = e.def.def * hd * (1 - ignore), res = e.def.res || 0, amp = relicDealt(e, type, src);
    if (e.supDebuff) { def *= 1 - X.supporterDebuff.def; res *= 1 - X.supporterDebuff.res; }
    if (e.resDownT > 0) res = Math.max(0, res - e.resDown);
    if (e.vulnT > 0) amp += e.vulnAmp;
    if (type === 'phys') amp += markAmpOf(e);
    const a = e.ana;
    if (a && e.analysis > 0) {
      const st = Math.floor(e.analysis);
      def *= Math.max(0, 1 - a.def * st);
      res = Math.max(0, res - a.res * st);
      if (e.analysis >= a.max) amp += a.amp + (src && src.def.id === a.partner ? a.partnerAmp : 0);
    }
    if (e.proof) {
      // 최종 논고 지속 중이면 입증된 적의 마법 저항이 더 내려감
      let extra = 0;
      for (const o of S.ops) if (o.alive && eff(o).proofRes) extra = Math.max(extra, eff(o).proofRes);
      res = Math.max(0, res - e.proof.res - extra);
    }
    const dmg = calcDamage(atk, type, def, res) * amp;
    e.hp -= dmg;
    // 추가 마법 대미지 (부지깽이 · 긁기의 손)
    if (!extra && src && src.def && e.hp > 0) {
      if (X.seaExtra && e.def.sea) hitEnemy(e, opAtk(src) * X.seaExtra, 'arts', false, src, 0, true);
      if (X.archPct && X.archPct.arch.includes(src.def.archetype)) hitEnemy(e, e.hp * X.archPct.pct, 'arts', false, src, 0, true);
    }
    if (!e.alive) return;   // 추가 대미지로 이미 쓰러졌으면 한 번만 처리
    e.flash = 0.1;
    addText(e.x, e.y - 0.25, Math.round(dmg) + (crit ? '!' : ''), crit ? '#ffcf3a' : type === 'arts' ? '#d9b3ff' : '#ffffff', 0.5, crit);
    const bu = e.def.burst;
    if (bu && e.hp > 0) {
      const n = Math.floor((1 - e.hp / e.maxHp) / bu.step);
      if (n > (e.bursts || 0)) {
        e.bursts = n;
        addFx({ type: 'ring', x: e.x, y: e.y, life: 0.5, color: '#c77dff', r: bu.radius });
        S.shake = 0.25;
        for (const op of [...S.ops]) if (Math.hypot(op.x + 0.5 - e.x, op.y + 0.5 - e.y) <= bu.radius) { hitOp(op, enemyAtk(e) * bu.mul, 'arts', null); addNeural(op, bu.neural || 0); }
      }
    }
    if (e.hp > 0) return;
    if (e.def.brandOnDeath) setBrand(e.x, e.y);
    if (e.def.revive && !e.revived) {
      e.revived = true;
      e.hp = e.maxHp;
      e.atkMul = e.def.revive.atk || 1;
      sfx('boss');
      S.shake = 0.4;
      addText(e.x, e.y - 0.4, '부활', '#aee3ff', 1.2, true);
      toast(`${e.def.name}이(가) 다시 일어섰습니다!`);
      return;
    }
    e.alive = false;
    S.killed++;
    if (src && src.def && src.tal) onOpKill(src);
    relicKill(e);
    sfx('kill');
    addFx({ type: 'ring', x: e.x, y: e.y, life: 0.3, color: e.def.color });
  }

  function setBrand(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y), row = S.map[ty];
    if (row && (row[tx] === '-' || row[tx] === '.')) { row[tx] = '~'; addFx({ type: 'ring', x: tx + 0.5, y: ty + 0.5, life: 0.5, color: '#2ec4b6' }); }
  }
  // 소환: 소환한 적의 위치에서 같은 길을 따라 이어서 걸어감
  function summonAt(e, id) {
    const def = (S.edefs && S.edefs[id]) || ENEMIES[id];
    if (!def) return;
    S.total++;
    S.enemies.push({
      def, path: e.path, pi: e.pi, x: e.x, y: e.y, hp: def.hp, maxHp: def.hp, atkCd: def.interval, blockedBy: null, alive: true, flash: 0,
      stun: 0, atkMul: 1, revived: false, blinked: false, analysis: 0, ana: null, slowT: 0, proofHits: 0, proof: null,
    });
    addFx({ type: 'ring', x: e.x, y: e.y, life: 0.4, color: def.color });
  }
  function tryBlock(e) {
    const w = Math.max(1, (e.def.weight || 1) + ((S.mods.enemy && S.mods.enemy.weight) || 0));
    for (const op of S.ops) {
      if (!op.alive || !isGround(op.def)) continue;
      const load = op.blocked.reduce((s, b) => s + (b.alive && b.blockedBy === op ? Math.max(1, (b.def.weight || 1) + ((S.mods.enemy && S.mods.enemy.weight) || 0)) : 0), 0);
      if (load + w > opBlock(op)) continue;
      if (Math.hypot(e.x - (op.x + 0.5), e.y - (op.y + 0.5)) < 0.7) {
        if (e.def.blink && !e.blinked) {
          // 크라운슬레이어: 저지당하면 목표의 뒤로 순간이동
          e.blinked = true;
          addFx({ type: 'ring', x: e.x, y: e.y, life: 0.3, color: e.def.color });
          moveEnemy(e, 1.6 / e.def.speed);
          addText(e.x, e.y - 0.4, '순간이동', e.def.color, 0.8, true);
          sfx('retreat');
          return;
        }
        e.blockedBy = op;
        op.blocked.push(e);
        if (S.mods.firstBlockStun && !e.blockedOnce) { e.blockedOnce = true; stunEnemy(e, S.mods.firstBlockStun); addText(e.x, e.y - 0.4, '공포', '#c9a6ff', 0.8); }
        return;
      }
    }
  }

  function moveEnemy(e, dt) {
    let step = e.def.speed * dt * (e.slowT > 0 ? e.slowMove : 1) * Math.max(0.2, 1 - perDep('enemySlow'));
    while (step > 0 && e.alive) {
      const p = e.path[e.pi];
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
      if (d <= step) {
        e.x = p.x; e.y = p.y; step -= d; e.pi++;
        if (e.pi >= e.path.length) { leak(e); return; }
      } else {
        e.x += (dx / d) * step; e.y += (dy / d) * step; step = 0;
      }
    }
  }

  function leak(e) {
    e.alive = false;
    S.leaked++;
    let cost = e.def.lifeCost || 1;
    if (S.shield > 0) { const a = Math.min(S.shield, cost); S.shield -= a; cost -= a; }
    S.life -= cost;
    S.shake = 0.3;
    sfx('leak');
    toast('방어선이 돌파당했습니다!');
  }

  function enemyAtk(e) {
    const en = e.def.enrage;
    return e.def.atk * e.atkMul * (en && e.hp / e.maxHp <= en.below ? en.atk : 1) * (e.def.brandAtk && onBrand(e.x, e.y) ? e.def.brandAtk : 1) * (e.atkDownT > 0 ? 1 - e.atkDown : 1) * (e.markT > 0 && e.markBy ? 1 - e.markBy.tal.relay.atkDown : 1);
  }

  function updateEnemy(e, dt, healAura) {
    e.flash = Math.max(0, e.flash - dt);
    if (e.def.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.def.regen * healAura * dt);
    if (e.slowT > 0) e.slowT -= dt;
    if (e.vulnT > 0) e.vulnT -= dt;
    if (e.atkDownT > 0) e.atkDownT -= dt;
    if (e.markT > 0) e.markT -= dt;
    if (e.resDownT > 0) e.resDownT -= dt;
    if (e.def.sea && e.hp < e.maxHp && onBrand(e.x, e.y)) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.015 * dt);
    if (e.def.brandTrail && e.hp / e.maxHp < 0.5) setBrand(e.x, e.y);
    const na = e.def.neuralAura;
    if (na) for (const op of [...S.ops]) if (Math.hypot(op.x + 0.5 - e.x, op.y + 0.5 - e.y) <= na.radius) addNeural(op, na.amount * dt);
    const sm = e.def.summon;
    if (sm) {
      e.sumT = (e.sumT ?? sm.every * 0.5) - dt;
      if (e.sumT <= 0) { e.sumT = sm.every; for (let i = 0; i < (sm.count || 1); i++) summonAt(e, sm.enemy); }
    }
    const X = S.mods;
    if ((X.stunDot && e.stun > 0) || (X.blockedDot && e.blockedBy && e.blockedBy.alive)) {
      e.dotT = (e.dotT || 0) + dt;
      if (e.dotT >= 1) {
        e.dotT -= 1;
        if (X.stunDot && e.stun > 0) hitEnemy(e, X.stunDot, 'arts', false, null, 0, true);
        if (X.blockedDot && e.blockedBy && e.alive) hitEnemy(e, opAtk(e.blockedBy) * X.blockedDot, 'arts', false, e.blockedBy, 0, true);
        if (!e.alive) return;
      }
    }
    if (e.stun > 0) { e.stun -= dt; return; }
    if (e.blockedBy && !e.blockedBy.alive) e.blockedBy = null;
    if (!e.blockedBy && !isFly(e.def) && !e.def.unblockable && !(e.def.brandUnblockable && onBrand(e.x, e.y))) tryBlock(e);
    if (!e.blockedBy) moveEnemy(e, dt);
    if (!e.alive) return;

    e.atkCd -= dt;
    if (e.atkCd > 0) return;

    // 메피스토: 공격 대신 주변 적 치료
    if (e.def.healer) {
      const hurt = S.enemies
        .filter((o) => o.alive && o !== e && o.hp < o.maxHp && Math.hypot(o.x - e.x, o.y - e.y) <= e.def.range)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
        .slice(0, e.def.healer.count);
      if (!hurt.length) return;
      for (const o of hurt) {
        o.hp = Math.min(o.maxHp, o.hp + enemyAtk(e));
        addFx({ type: 'beam', x1: e.x, y1: e.y, x2: o.x, y2: o.y, life: 0.3, color: '#b6ff6b' });
        addText(o.x, o.y - 0.3, '+' + Math.round(enemyAtk(e)), '#b6ff6b', 0.6);
      }
      e.atkCd = e.def.interval;
      return;
    }

    let target = e.blockedBy;
    const inRange = e.def.range > 0 ? S.ops.filter((op) => Math.hypot(op.x + 0.5 - e.x, op.y + 0.5 - e.y) <= e.def.range) : [];
    if (!target && inRange.length) {
      const dist = (op) => Math.hypot(op.x + 0.5 - e.x, op.y + 0.5 - e.y);
      inRange.sort((a, b) => (e.def.lowHp ? a.hp / a.maxHp - b.hp / b.maxHp : 0) || dist(a) - dist(b));
      target = inRange[0];
    }
    if (!target) return;
    // 여러 명 동시 공격
    if (e.def.targets > 1) for (const op of inRange.filter((o) => o !== target).slice(0, e.def.targets - 1)) hitOp(op, enemyAtk(e), e.def.arts ? 'arts' : 'phys', e);
    const type = e.def.arts ? 'arts' : 'phys';
    if (e.def.range > 0 && !e.blockedBy) {
      addFx({ type: 'shot', x1: e.x, y1: e.y, x2: target.x + 0.5, y2: target.y + 0.5, life: 0.15, color: type === 'arts' ? '#b36bff' : '#ff9a5c' });
    } else {
      addFx({ type: 'slash', x: target.x + 0.5, y: target.y + 0.5, life: 0.15, color: '#ff5c5c' });
    }
    const atk = enemyAtk(e);
    if (e.def.aoe) {
      addFx({ type: 'ring', x: target.x + 0.5, y: target.y + 0.5, life: 0.35, color: e.def.arts ? '#aee3ff' : '#ff7a2f', r: e.def.aoe });
      for (const op of [...S.ops]) {
        if (op !== target && Math.hypot(op.x - target.x, op.y - target.y) <= e.def.aoe) hitOp(op, atk, type, e);
      }
    }
    hitOp(target, atk, type, e);
    e.atkCd = e.def.interval * (e.slowT > 0 ? e.slowAtk : 1) * (e.blockedBy && e.blockedBy.tal && e.blockedBy.tal.easygoing ? e.blockedBy.tal.easygoing.slow : 1);
  }

  // =====================================================================
  //  이펙트
  // =====================================================================
  function addFx(f) { f.t = 0; S.effects.push(f); }
  function addText(x, y, text, color, life = 0.6, big = false) {
    addFx({ type: 'text', x, y, text: String(text), color, life, big });
  }

  // =====================================================================
  //  메인 루프
  // =====================================================================
  function update(dt) {
    S.time += dt;
    S.dp = Math.min(S.maxDp, S.dp + dt * (S.mods.dpRate || 1));
    S.shake = Math.max(0, S.shake - dt);
    while (S.queue.length && S.queue[0].t <= S.time) spawnEnemy(S.queue.shift());
    for (const r of S.roster) if (r.cd > 0) r.cd = Math.max(0, r.cd - dt);
    // 가디언 재능: 주변 아군 방어력 오라
    for (const op of S.ops) op.auraDef = 0;
    for (const g of S.ops) {
      const a = g.tal.auraDef;
      if (a) for (const o of alliesNear(g, a.radius)) o.auraDef = Math.max(o.auraDef, a.def);
    }
    relicTick(dt);
    for (const op of [...S.ops]) if (op.alive) updateOp(op, dt);
    const healAura = S.enemies.reduce((m, e) => (e.alive && e.def.healAura ? Math.max(m, e.def.healAura) : m), 1);
    for (const e of S.enemies) if (e.alive) updateEnemy(e, dt, healAura);
    S.enemies = S.enemies.filter((e) => e.alive);
    for (const f of S.effects) f.t += dt;
    S.effects = S.effects.filter((f) => f.t < f.life);

    if (S.life <= 0) endBattle(false);
    else if (!S.queue.length && !S.enemies.length) endBattle(true);
  }

  function endBattle(win) {
    S.ended = true;
    sfx(win ? 'win' : 'lose');
    setMode('idle');
    const st = S.st;
    const stars = !win ? 0 : S.leaked === 0 ? 3 : S.life >= Math.ceil(S.maxLife / 2) ? 2 : 1;
    const ext = S.ext.onEnd ? S.ext.onEnd({ win, stars, life: Math.max(0, S.life), shield: S.shield || 0, leaked: S.leaked, killed: S.killed, quit: !!S.quit }) : null;
    const firstClear = !ext && win && !(UI.save.stars[st.code] > 0);
    const rewardText = ext ? ext.text : UI.onBattleEnd(S.idx, win, stars, S.squadIds);
    if (win && !ext) {
      UI.save.stars[st.code] = Math.max(UI.save.stars[st.code] || 0, stars);
      UI.writeSave();
    }
    const title = $('#result-title');
    title.textContent = win ? '작전 완료' : '작전 실패';
    title.classList.toggle('fail', !win);
    $('#result-stars').textContent = win ? starText(stars) : '';
    $('#result-info').innerHTML = '';
    const info = document.createElement('div');
    info.textContent = `처치 ${S.killed} · 돌파 ${S.leaked} · 남은 ${ext ? '목표 HP' : '목숨'} ${Math.max(0, S.life)}/${S.maxLife}${S.shield ? ` · 실드 ${S.shield}` : ''}`;
    const rw = document.createElement('div');
    rw.className = 'result-reward';
    rw.textContent = rewardText || '';
    $('#result-info').append(info, rw);
    // 대장(편성 1번)의 결과 대사
    const leader = opById(S.squadIds[0]);
    const vline = leader && (win ? (stars === 3 ? ((S.ext.hard || S.st.hard) && UI.line(leader, 'hard')) || UI.line(leader, 'clear') : UI.line(leader, 'clear2') || UI.line(leader, 'clear')) : UI.line(leader, 'fail'));
    if (vline) {
      const v = document.createElement('div');
      v.className = 'result-voice';
      v.textContent = `${leader.name} — “${vline}”`;
      $('#result-info').append(v);
    }
    const btns = $('#result-btns');
    btns.innerHTML = '';
    const idx = S.idx, ended = S;
    const add = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls;
      b.textContent = label;
      b.addEventListener('click', () => { $('#result').classList.add('hidden'); fn(); });
      btns.appendChild(b);
    };
    if (ext) {
      for (const b of ext.buttons || []) add(b.label, b.cls || '', b.fn);
    } else if (win) {
      add('계속', 'primary', () => {
        const after = firstClear ? st.after || [] : [];
        if (after.length) UI.playDialog(after, () => UI.go('operations'));
        else UI.go('operations');
      });
    } else {
      add('다시 도전', 'primary', () => UI.startOperation(idx, true));
    }
    if (!ext) add('작전 목록', '', () => UI.go('operations'));
    setTimeout(() => { if (S === ended) $('#result').classList.remove('hidden'); }, 400);
  }

  function updateHud() {
    $('#dp-num').textContent = Math.floor(S.dp);
    $('#dp-fill').style.width = (S.dp >= S.maxDp ? 100 : (S.dp % 1) * 100) + '%';
    $('#deploy-left').textContent = S.deployLimit - deployedCount();
    $('#hud-enemy').textContent = `${S.killed + S.leaked}/${S.total}`;
    $('#hud-life').textContent = Math.max(0, S.life);
    updateCards();
    if (S.mode === 'inspect') refreshInspect(false);
  }

  let last = performance.now();
  function frame(now) {
    const raw = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (S) {
      if (!S.paused && !S.ended) {
        const dt = raw * S.speed * (S.mode === 'idle' ? 1 : SLOW);
        const steps = Math.max(1, Math.ceil(dt / 0.02));
        for (let i = 0; i < steps && !S.ended; i++) update(dt / steps);
      }
      if (S) { updateHud(); draw(); }
    }
    requestAnimationFrame(frame);
  }

  // =====================================================================
  //  렌더링 — 원근감 있는 3D풍 보드
  // =====================================================================
  const HIGH = 0.24;     // 고지대 높이 (타일 단위)
  const PERSP = 0.055;   // 원근 정도 (뒷줄일수록 작게)
  const TILT = 0.82;     // 바닥 기울기 (세로 압축)
  const DIRV = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
  let P = { T: 40, cx: 0, yb: 0, W: 0, H: 0 };

  const tileH = (x, y) => (S && S.map[y] && S.map[y][x] === '^' ? HIGH : 0);

  // 타일 좌표(u, v, 높이 h) → 화면 좌표 [X, Y, 축척]
  function proj(u, v, h = 0) {
    const t = S.rows - v, w = 1 + PERSP * t;
    return [P.cx + (P.T * (u - S.cols / 2)) / w, P.yb - (P.T * (TILT * t + h)) / w, 1 / w];
  }
  // 화면 좌표 → 높이 h 평면 위의 타일 좌표
  function unproject(X, Y, h = 0) {
    const m = (P.yb - Y) / P.T;
    const t = (m - h) / (TILT - PERSP * m);
    const w = 1 + PERSP * t;
    return { x: ((X - P.cx) * w) / P.T + S.cols / 2, y: S.rows - t };
  }

  function resize() {
    if (!S) return;
    const wrap = $('#board-wrap');
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // 위쪽 HUD와 아래쪽 카드 줄만 피하고, 코스트 상자는 원작처럼 보드 위에 겹쳐 둠
    const top = H < 480 ? 40 : 50, bottom = $('#cards').offsetHeight + 2;
    const far = 1 / (1 + PERSP * S.rows);
    const unitsH = TILT * S.rows * far + 0.3 + 1.05 * far; // 보드 + 앞면 두께 + 뒷줄 캐릭터 머리
    const T = Math.max(16, Math.min((W * 0.96) / (S.cols + 0.6), (H - top - bottom) / unitsH));
    const y0 = top + Math.max(0, (H - top - bottom - T * unitsH) / 2);
    P = { T, cx: W / 2, yb: y0 + T * (1.05 * far + TILT * S.rows * far), W, H };
    S.dpr = dpr;
    S.T = T;
  }
  window.addEventListener('resize', resize);

  // ---------- 도형 도우미 ----------
  function poly(pts) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  const quad = (x0, y0, x1, y1, h) => [proj(x0, y0, h), proj(x1, y0, h), proj(x1, y1, h), proj(x0, y1, h)];
  function hash(x, y, k = 0) {
    let n = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function ellipse(X, Y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(X, Y, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
  }
  // 상자: 윗면 + 앞면 + (보드 중앙을 향한) 옆면
  function box(x0, y0, x1, y1, h0, h1, top, front, side, skipSide = {}) {
    const mid = S.cols / 2;
    poly([proj(x0, y1, h0), proj(x1, y1, h0), proj(x1, y1, h1), proj(x0, y1, h1)]);
    ctx.fillStyle = front; ctx.fill();
    if (x1 <= mid && !skipSide.right) {
      poly([proj(x1, y0, h0), proj(x1, y1, h0), proj(x1, y1, h1), proj(x1, y0, h1)]);
      ctx.fillStyle = side; ctx.fill();
    }
    if (x0 >= mid && !skipSide.left) {
      poly([proj(x0, y0, h0), proj(x0, y1, h0), proj(x0, y1, h1), proj(x0, y0, h1)]);
      ctx.fillStyle = side; ctx.fill();
    }
    poly(quad(x0, y0, x1, y1, h1));
    ctx.fillStyle = top; ctx.fill();
  }

  // ---------- 배경 ----------
  function drawBackground() {
    const g = ctx.createRadialGradient(P.W / 2, P.H * 0.45, 40, P.W / 2, P.H * 0.5, Math.max(P.W, P.H) * 0.8);
    const sea = S.st.theme === 'sea';
    g.addColorStop(0, sea ? '#12324a' : '#1d2b2d');
    g.addColorStop(1, sea ? '#02070d' : '#040506');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, P.W + 40, P.H + 40);
    const m = 0.7;
    // 구덩이 벽 (보드 바깥 테두리)
    poly(quad(-m, -m, S.cols + m, S.rows + m, 0));
    ctx.fillStyle = sea ? '#0d2230' : '#151c1e'; ctx.fill();
    ctx.strokeStyle = sea ? 'rgba(90,180,230,.25)' : 'rgba(110,190,180,.18)'; ctx.lineWidth = 2; ctx.stroke();
    // 테두리 위 파이프와 상자 장식
    for (let i = 0; i < S.cols + 1; i++) {
      for (const [v, k] of [[-m, 1], [S.rows + 0.05, 2]]) {
        if (hash(i, k) < 0.55) continue;
        const sz = 0.25 + hash(i, k, 3) * 0.35;
        box(i - 0.2, v + 0.05, i - 0.2 + sz, v + 0.05 + 0.45, 0, 0.1 + hash(i, k, 5) * 0.35, '#2c3538', '#1b2225', '#232b2e');
      }
    }
    // 앞쪽 두께
    poly([proj(-m, S.rows + m, 0), proj(S.cols + m, S.rows + m, 0), proj(S.cols + m, S.rows + m, -0.45), proj(-m, S.rows + m, -0.45)]);
    ctx.fillStyle = '#0d1214'; ctx.fill();
  }

  // ---------- 타일 ----------
  function drawGround(x, y, deployable) {
    poly(quad(x + 0.03, y + 0.03, x + 0.97, y + 0.97, 0));
    ctx.fillStyle = S.st.theme === 'sea' ? '#2e3d47' : '#343c40'; ctx.fill();
    if (!deployable) return;
    const s = proj(x + 0.5, y + 0.5)[2];
    poly(quad(x + 0.11, y + 0.11, x + 0.89, y + 0.89, 0));
    ctx.lineWidth = Math.max(1.5, P.T * 0.05 * s);
    ctx.strokeStyle = '#c8a033'; ctx.stroke();
    ctx.setLineDash([P.T * 0.06 * s, P.T * 0.06 * s]);
    ctx.strokeStyle = '#15181a'; ctx.stroke();
    ctx.setLineDash([]);
    for (const [a, b] of [[0.2, 0.2], [0.52, 0.2], [0.2, 0.52], [0.52, 0.52]]) {
      poly(quad(x + a, y + b, x + a + 0.28, y + b + 0.28, 0));
      ctx.fillStyle = '#272d31'; ctx.fill();
    }
  }
  function drawHigh(x, y) {
    const hi = (dx) => tileH(x + dx, y) === HIGH;
    const sea = S.st.theme === 'sea';
    box(x + 0.02, y + 0.02, x + 0.98, y + 0.98, 0, HIGH, sea ? '#7f9aa3' : '#94786d', sea ? '#3b4f57' : '#4f3d37', sea ? '#55707a' : '#68534b', { right: hi(1), left: hi(-1) });
    poly(quad(x + 0.1, y + 0.1, x + 0.9, y + 0.9, HIGH));
    ctx.fillStyle = sea ? '#93b0b8' : '#a68b80'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,215,.25)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function drawWall(x, y) {
    poly(quad(x, y, x + 1, y + 1, 0));
    ctx.fillStyle = S.st.theme === 'sea' ? '#0e2a36' : '#1b2224'; ctx.fill();
    if (S.st.theme === 'sea') {
      // 바닷물: 잔물결
      const [X, Y, s] = proj(x + 0.5, y + 0.5, 0);
      ctx.strokeStyle = 'rgba(120,200,240,.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X - P.T * 0.3 * s, Y + Math.sin(S.time + x + y) * 2); ctx.lineTo(X + P.T * 0.3 * s, Y + Math.sin(S.time + x + y + 1) * 2); ctx.stroke();
      return;
    }
    for (let k = 0; k < 2; k++) {
      if (hash(x, y, k) < 0.4) continue;
      const w = 0.3 + hash(x, y, k + 7) * 0.4, d = 0.3 + hash(x, y, k + 9) * 0.4;
      const ox = x + hash(x, y, k + 11) * (1 - w), oy = y + hash(x, y, k + 13) * (1 - d);
      const h = 0.12 + hash(x, y, k + 15) * 0.5;
      const shade = 40 + Math.floor(hash(x, y, k + 17) * 20);
      box(ox, oy, ox + w, oy + d, 0, h, `rgb(${shade},${shade + 8},${shade + 10})`, `rgb(${shade - 18},${shade - 12},${shade - 10})`, `rgb(${shade - 10},${shade - 4},${shade - 2})`);
    }
  }
  function wireCube(x, y, color, fill) {
    const a = x + 0.08, b = y + 0.08, c = x + 0.92, d = y + 0.92, h = 0.95;
    poly(quad(a, b, c, d, 0)); ctx.fillStyle = fill; ctx.fill();
    poly([proj(a, d, 0), proj(c, d, 0), proj(c, d, h), proj(a, d, h)]); ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, P.T * 0.035);
    ctx.shadowColor = color; ctx.shadowBlur = 10;
    poly(quad(a, b, c, d, 0)); ctx.stroke();
    poly(quad(a, b, c, d, h)); ctx.stroke();
    ctx.beginPath();
    for (const [u, v] of [[a, b], [c, b], [c, d], [a, d]]) {
      const p0 = proj(u, v, 0), p1 = proj(u, v, h);
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 경고 표시
    const [X, Y, s] = proj(x + 0.5, d, h * 0.5);
    const r = P.T * 0.2 * s;
    poly([[X, Y - r], [X + r, Y + r * 0.75], [X - r, Y + r * 0.75]]);
    ctx.lineWidth = Math.max(1.5, P.T * 0.03); ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `900 ${r}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', X, Y + r * 0.2);
  }
  function drawBrand(x, y) {
    poly(quad(x + 0.03, y + 0.03, x + 0.97, y + 0.97, 0));
    ctx.fillStyle = '#123a3f'; ctx.fill();
    const s = proj(x + 0.5, y + 0.5)[2];
    ctx.strokeStyle = 'rgba(46,196,182,.55)'; ctx.lineWidth = Math.max(1, P.T * 0.03 * s);
    for (const v of [0.3, 0.55, 0.8]) {
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const u = x + 0.1 + k * 0.13, w = y + v + Math.sin(S.time * 2 + k + x * 3) * 0.04;
        const [X, Y] = proj(u, w, 0.002);
        k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      ctx.stroke();
    }
  }
  function drawTile(x, y) {
    const ch = S.map[y][x];
    if (ch === '#') drawWall(x, y);
    else if (ch === '^') drawHigh(x, y);
    else if (ch === '~') drawBrand(x, y);
    else drawGround(x, y, ch === '.');
  }
  function drawGates() {
    for (let y = 0; y < S.rows; y++) {
      for (let x = 0; x < S.cols; x++) {
        const ch = S.map[y][x];
        if (ch === 'R') wireCube(x, y, '#ff3b47', 'rgba(255,40,50,.16)');
        if (ch === 'B') wireCube(x, y, '#3fa3ff', 'rgba(60,150,255,.16)');
      }
    }
  }
  function fillTiles(list, fill, stroke) {
    for (const [x, y] of list) {
      if (x < 0 || y < 0 || x >= S.cols || y >= S.rows) continue;
      const h = tileH(x, y);
      poly(quad(x + 0.05, y + 0.05, x + 0.95, y + 0.95, h + 0.005));
      ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    }
  }

  // ---------- 유닛 ----------
  function bar(x, y, w, h, ratio, color) {
    ctx.fillStyle = 'rgba(0,0,0,.75)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), h);
  }
  function drawArrowHead(cx, cy, ang, size, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, -size * 0.7);
    ctx.lineTo(-size * 0.6, size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawToken(def, X, Y, r, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(X, Y, r, 0, Math.PI * 2);
    ctx.fillStyle = def.color; ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.font = `900 ${r * 1.05}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.glyph || def.name[0], X, Y + r * 0.05);
    ctx.globalAlpha = 1;
  }
  // 캐릭터 몸체(그림 또는 동그라미). 화면상 영역 [x0, y0, x1, y1]을 돌려줌
  function drawBody(def, X, Y, T, alpha = 1, flash = 0) {
    const im = imgOf(def);
    if (im) {
      const ih = T * 1.25, iw = (ih * im.naturalWidth) / im.naturalHeight;
      const x0 = X - iw / 2, y0 = Y - ih * 0.96;
      ctx.globalAlpha = alpha;
      if (flash > 0) ctx.filter = 'brightness(1.6) sepia(1) saturate(4) hue-rotate(-40deg)';
      ctx.drawImage(im, x0, y0, iw, ih);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      return [x0, y0, x0 + iw, y0 + ih];
    }
    const r = T * 0.3;
    drawToken(def, X, Y - T * 0.42, r, alpha);
    if (flash > 0) {
      ctx.beginPath(); ctx.arc(X, Y - T * 0.42, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,80,80,.5)'; ctx.fill();
    }
    return [X - r, Y - T * 0.42 - r, X + r, Y];
  }

  function drawOp(op) {
    const h = tileH(op.x, op.y);
    const [X, Y, s] = proj(op.x + 0.5, op.y + 0.58, h);
    const T = P.T * s, sk = op.skill;
    ellipse(X, Y, T * 0.34, T * 0.12);
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill();
    if (op.skillT > 0) {
      ellipse(X, Y, T * (0.44 + Math.sin(S.time * 8) * 0.03), T * 0.17);
      ctx.strokeStyle = '#ffcf3a'; ctx.lineWidth = Math.max(2, T * 0.05); ctx.stroke();
    }
    if (op.shield > 0) {
      ellipse(X, Y - T * 0.5, T * 0.42, T * 0.62);
      ctx.strokeStyle = 'rgba(127,216,255,.7)'; ctx.lineWidth = Math.max(1.5, T * 0.03); ctx.stroke();
    }
    if (op.chill > 0) {
      ellipse(X, Y, T * 0.36, T * 0.13);
      ctx.fillStyle = 'rgba(174,227,255,.35)'; ctx.fill();
    }
    // 바라보는 방향 (주황 화살표)
    const [dx, dy] = DIRV[op.dir];
    const [ax, ay] = proj(op.x + 0.5 + dx * 0.44, op.y + 0.58 + dy * 0.44, h);
    if (!op.def.noDir) drawArrowHead(ax, ay, Math.atan2(ay - Y, ax - X), T * 0.11, '#ff9a1f');
    op.rect = drawBody(op.def, X, Y, T, 1, op.flash);
    // 체력/SP
    const bw = T * 0.72, bx = X - bw / 2, by = Y + T * 0.1;
    bar(bx, by, bw, Math.max(3, T * 0.055), op.hp / op.maxHp, '#4cd964');
    const spRatio = op.skillT > 0 ? (op.skillT === Infinity ? 1 : op.skillT / sk.duration) : sk.sp ? op.sp / sk.sp : 0;
    bar(bx, by + Math.max(4, T * 0.075), bw, Math.max(2, T * 0.04), spRatio, op.skillT > 0 ? '#ffcf3a' : '#8fd14f');
    if (op.neural > 0) bar(bx, by + Math.max(7, T * 0.13), bw, Math.max(2, T * 0.035), op.neural / 1000, '#c77dff');
    if (op.stun > 0) {
      ctx.fillStyle = '#c77dff';
      ctx.font = `900 ${T * 0.2}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('기절', X, op.rect[1] - T * 0.05);
    }
    if (sk.trigger === 'manual' && op.skillT <= 0 && op.sp >= sk.sp) {
      const bob = Math.sin(S.time * 6) * T * 0.04;
      const bx2 = op.rect[2] - T * 0.08, by2 = op.rect[1] + T * 0.12 + bob;
      ctx.beginPath(); ctx.arc(bx2, by2, T * 0.13, 0, Math.PI * 2);
      ctx.fillStyle = '#ffcf3a'; ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = `900 ${T * 0.18}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', bx2, by2 + T * 0.01);
    }
  }

  function drawEnemy(e) {
    const [X, Y, s] = proj(e.x, e.y, 0);
    const T = P.T * s, r = T * (e.def.boss ? 0.4 : e.def.elite ? 0.33 : 0.28);
    const lift = isFly(e.def) ? T * 0.6 + Math.sin(S.time * 4 + e.x) * T * 0.04 : T * 0.02;
    ellipse(X, Y, r * 1.05, r * 0.4);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
    const cy = Y - r - lift;
    const im = eImg(e.def);
    const ring = e.def.boss ? '#ff3b47' : isFly(e.def) ? '#5dade2' : e.def.elite ? '#ffb627' : 'rgba(255,90,90,.9)';
    ctx.beginPath();
    ctx.arc(X, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#22090c'; ctx.fill();
    if (im) {
      // 원작 도감 아이콘을 동그랗게 잘라서 표시 (테두리 여백은 잘라냄)
      ctx.save();
      ctx.clip();
      const sw = im.naturalWidth * 0.8, sx = im.naturalWidth * 0.1;
      ctx.drawImage(im, sx, im.naturalHeight * 0.06, sw, sw, X - r, cy - r, r * 2, r * 2);
      if (e.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(X - r, cy - r, r * 2, r * 2); }
      ctx.restore();
    } else {
      ctx.fillStyle = e.def.color;
      ctx.font = `900 ${r * 0.9}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.def.boss ? '王' : e.def.name.replace(/[「」]/g, '')[0], X, cy + r * 0.05);
    }
    ctx.beginPath();
    ctx.arc(X, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, r * 0.16);
    ctx.strokeStyle = ring; ctx.stroke();
    const bw = T * (e.def.boss ? 0.8 : 0.5);
    bar(X - bw / 2, cy - r - T * 0.12, bw, Math.max(3, T * 0.05), e.hp / e.maxHp, e.revived ? '#aee3ff' : '#ff4d57');
    if (e.analysis > 0 && e.ana) {
      // 분석 스택 표시
      const st = Math.floor(e.analysis), done = e.analysis >= e.ana.max, pw = T * 0.07;
      for (let i = 0; i < e.ana.max; i++) {
        ctx.fillStyle = i < st ? (done ? '#ffcf3a' : '#5fe0a8') : 'rgba(255,255,255,.18)';
        ctx.fillRect(X - (e.ana.max * pw * 1.3) / 2 + i * pw * 1.3, cy - r - T * 0.2, pw, pw * 0.7);
      }
      if (done) {
        ctx.fillStyle = '#ffcf3a';
        ctx.font = `900 ${T * 0.13}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('분석', X, cy - r - T * 0.26);
      }
    }
    if (e.proof) {
      ctx.fillStyle = '#ffe36b';
      ctx.font = `900 ${T * 0.12}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('입증', X, cy + r + T * 0.14);
    }
    if (e.markT > 0) {
      // 중계 표식: 빨간 REC 점
      ctx.beginPath();
      ctx.arc(X - r * 0.95, cy - r * 0.95, Math.max(3, T * 0.045), 0, Math.PI * 2);
      ctx.fillStyle = Math.sin(S.time * 8) > -0.3 ? '#ff3b47' : '#7a1a20'; ctx.fill();
      ctx.fillStyle = '#ff6b70';
      ctx.font = `900 ${T * 0.09}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('REC', X - r * 0.95 + T * 0.06, cy - r * 0.95 + T * 0.03);
      ctx.textAlign = 'center';
    }
    if (e.slowT > 0) {
      ctx.beginPath();
      ctx.arc(X, cy, r * 1.22, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.strokeStyle = 'rgba(95,224,168,.75)'; ctx.stroke();
    }
    if (e.stun > 0) {
      ctx.fillStyle = '#ffcf3a';
      ctx.font = `900 ${T * 0.2}px sans-serif`;
      ctx.fillText('★', X + r * 0.9, cy - r);
    }
  }

  function drawFx(f) {
    const k = f.t / f.life;
    ctx.globalAlpha = 1 - k;
    if (f.type === 'shot' || f.type === 'beam') {
      const [x1, y1, s] = proj(f.x1, f.y1, 0.5), [x2, y2] = proj(f.x2, f.y2, 0.35);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = (f.type === 'beam' ? 0.06 : 0.035) * P.T * s + 1;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    } else if (f.type === 'slash') {
      const [X, Y, s] = proj(f.x, f.y, 0.35);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = Math.max(2, P.T * 0.06 * s);
      ctx.beginPath();
      ctx.arc(X, Y, P.T * 0.3 * s, -2.4 + k * 1.5, -0.8 + k * 1.5);
      ctx.stroke();
    } else if (f.type === 'ring') {
      const [X, Y, s] = proj(f.x, f.y, 0.02);
      const r = P.T * (f.r || 0.5) * (0.4 + k * 0.8) * s;
      ellipse(X, Y, r, r * 0.42);
      ctx.strokeStyle = f.color; ctx.lineWidth = Math.max(2, P.T * 0.05 * s); ctx.stroke();
    } else if (f.type === 'text') {
      const [X, Y, s] = proj(f.x, f.y, 0.9);
      const T = P.T * s;
      ctx.font = `${f.big ? 700 : 900} ${Math.max(11, T * (f.big ? 0.24 : 0.22))}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 3;
      const y = Y - k * 0.35 * T;
      ctx.strokeText(f.text, X, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, X, y);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    if (S.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * S.shake, (Math.random() - 0.5) * 8 * S.shake);
    drawBackground();
    for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) drawTile(x, y);

    // 적 이동 경로
    ctx.strokeStyle = 'rgba(255,70,80,.35)';
    ctx.lineWidth = Math.max(2, P.T * 0.04);
    ctx.setLineDash([P.T * 0.1, P.T * 0.12]);
    for (const path of S.paths) {
      ctx.beginPath();
      path.forEach((p, i) => { const [X, Y] = proj(p.x, p.y, 0.01); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    drawGates();

    if (S.mode === 'placing') {
      const valid = [];
      for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) if (canPlace(S.sel.def, x, y)) valid.push([x, y]);
      fillTiles(valid, 'rgba(76,217,100,.28)', 'rgba(120,255,140,.75)');
    } else if (S.mode === 'direction') {
      fillTiles(computeRange(S.sel.def.range, S.dir, S.tile.x, S.tile.y).list, 'rgba(255,150,40,.35)', 'rgba(255,170,60,.9)');
    } else if (S.mode === 'inspect' && S.inspect) {
      fillTiles(S.inspect.rangeList, 'rgba(255,150,40,.3)', 'rgba(255,170,60,.8)');
    }

    // 뒤쪽부터 앞쪽 순서로 유닛 그리기
    const units = [
      ...S.ops.map((o) => ({ y: o.y + 0.58, f: () => drawOp(o) })),
      ...S.enemies.map((e) => ({ y: e.y + (isFly(e.def) ? 50 : 0), f: () => drawEnemy(e) })),
    ].sort((a, b) => a.y - b.y);
    for (const u of units) u.f();

    for (const f of S.effects) drawFx(f);

    if (S.mode === 'direction') {
      const h = tileH(S.tile.x, S.tile.y);
      const [X, Y, s] = proj(S.tile.x + 0.5, S.tile.y + 0.58, h);
      const T = P.T * s;
      ellipse(X, Y, T * 1.15, T * 0.55);
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke();
      drawBody(S.sel.def, X, Y, T, 0.8);
      for (const [d, [dx, dy]] of Object.entries(DIRV)) {
        const on = d === S.dir;
        const [ax, ay] = proj(S.tile.x + 0.5 + dx * 0.95, S.tile.y + 0.58 + dy * 0.95, h);
        drawArrowHead(ax, ay, Math.atan2(ay - Y, ax - X), T * (on ? 0.22 : 0.15), on ? '#ffcf3a' : 'rgba(255,255,255,.8)');
      }
    }
  }

  requestAnimationFrame(frame);

  // 디버그/테스트용
  window.Battle = { begin: beginBattle, stop: () => { S = null; } };
  window.__game = { get state() { return S; }, beginBattle, proj: (u, v, h) => proj(u, v, h), deploy: (id, x, y, dir) => {
    const r = S.roster.find((q) => q.def.id === id);
    if (r) deploy(r, x, y, dir || 'right');
  } };
})();
