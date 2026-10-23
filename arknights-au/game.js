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
  // 자기 칸은 범위에 [0, 0]이 있을 때만 (원작 공성사수처럼 가까운 칸을 못 치는 범위)
  function computeRange(range, dir, tx, ty) {
    const list = !range.length || range.some(([x, y]) => !x && !y) ? [[tx, ty]] : [];
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
    // BGM: 보스가 나오는 작전은 보스 전투곡
    if (window.SFX && SFX.bgm) {
      const boss = st.waves.some((w) => { const e = (opts.enemies && opts.enemies[w.enemy]) || ENEMIES[w.enemy]; return e && e.boss; });
      const ch = typeof st.chapter === 'number' ? st.chapter : 1, isRun = typeof idx === 'object' && !opts.practice;
      // 장마다 다른 전투곡 (1장 기본 · 2장 체르노보그 · 3장 용문 · 4장 일반 전투), 보스는 1~2장 프로스트노바 · 3장~ 용문 보스, 통합전략은 따로
      // 통합전략은 원작 미즈키 전투곡: 일반 「沉溺浅洋」 · 심해 「跌坠海渊」 · 보스 「大群之殇」
      const deep = isRun && window.IS && IS.run && IS.run.floor >= IS.DEEP;
      SFX.bgm(isRun ? (boss ? 'isboss' : deep ? 'isbattle2' : 'isbattle') : boss ? (ch <= 2 ? 'boss2' : 'boss') : ({ 2: 'battle2', 3: 'battle3', 4: 'battle4' }[ch] || 'battle'));
    }
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
    if (opts.practice) opts.waveSet = queue.map((q) => ({ ...q }));
    const squad = opts.defs || (squadIds || UI.save.squad).map(opById).filter(Boolean);
    squadIds = squad.map((d) => d.id);
    const mods = opts.mods || {}, life = opts.life ?? st.life ?? 3;

    UI.go('battle');
    S = {
      flySpawns: new Set(st.waves.filter((w) => { const d = (opts.enemies && opts.enemies[w.enemy]) || ENEMIES[w.enemy]; return d && d.fly; }).map((w) => (paths[w.spawn] ? w.spawn : 0))),
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
    // 태생 백합: 초기 배치 코스트가 무작위로 변경 / 키틴질 나이프: 무작위 1명 공격력 · HP +100%
    if (mods.randomStartDp) S.dp = Math.max(0, S.dp + Math.floor(Math.random() * 16) - 5);
    if (mods.chitin && S.roster.length) { const c = S.roster[Math.floor(Math.random() * S.roster.length)]; c.def = { ...c.def, atk: c.def.atk * 2, hp: c.def.hp * 2 }; }
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
    $('#btn-spawner').classList.toggle('hidden', !opts.practice);
    $('#tr-panel').classList.add('hidden');
    S.autoWaves = true; S.trSpawn = 0; S.trCount = 1;
    $('#btn-speed').innerHTML = '<img src="img/ui/btn_speed_1x.png" alt="1배속"><kbd>F</kbd>';
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
      c.innerHTML = `<span class="card-face">${r.def.image ? `<img src="${r.def.image}" alt="">` : r.def.icon ? `<img src="${r.def.icon}" alt="" style="object-fit:contain;padding:14%;background:${r.def.color}">` : r.def.name[0]}</span>
        <span class="card-cost">${r.def.cost}</span><span class="card-class">${UI.icon(r.def.class)}</span>
        <span class="card-name">${r.def.name}</span><span class="card-cd"></span>
        <span class="card-rar" style="background-image:url(img/ui/card_rarity_${(r.def.rarity || 3) >= 6 ? 6 : (r.def.rarity || 3) === 5 ? 5 : 4}.png)"></span>`;
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
      r.el.classList.toggle('selected', S.sel === r && (S.mode === 'placing' || S.mode === 'direction' || S.mode === 'preview'));
      if (r.cd > 0) {
        // 재배치 대기: 원작처럼 남은 시간 고리 + 초
        r.cdEl.textContent = Math.ceil(r.cd);
        r.cdEl.style.setProperty('--p', `${Math.max(0, Math.min(1, 1 - r.cd / (r.cdMax || r.def.redeploy || 1))) * 360}deg`);
      }
    }
  }
  function onCard(r) {
    if (!S || S.ended) return;
    if (S.sel === r && S.mode !== 'idle' && S.mode !== 'inspect') { sfx('cancel'); setMode('idle'); return; }
    if (r.deployed || r.left === 0) return;
    // 배치할 수 없을 때도 정보 창은 보여 줌
    const no = r.cd > 0 ? '재배치 대기 중입니다' : S.dp < r.def.cost ? '배치 코스트가 부족합니다'
      : !r.def.summoned && deployedCount() >= S.deployLimit ? '배치 가능 인원을 초과했습니다' : null;
    if (no) { sfx('deny'); toast(no); S.sel = r; setMode('preview'); return; }
    sfx('select');
    S.sel = r;
    setMode('placing');
  }

  function setMode(mode) {
    S.mode = mode;
    if (mode === 'idle') { S.sel = null; S.tile = null; S.inspect = null; }
    if (mode === 'placing' || mode === 'direction' || mode === 'preview') S.inspect = null;
    $('#inspect').classList.toggle('hidden', mode === 'idle');
    insKey = null;
    if (mode !== 'idle') refreshInspect(true);
    if (!S.ended) placeRing();
    const hint = $('#hint');
    if (mode === 'placing') {
      hint.textContent = tileOf(S.sel.def) === 'ground' ? '지면(어두운 칸)을 선택하세요' : '고지대(밝은 칸)를 선택하세요';
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
  function canPlace(def, tx, ty, r = S.sel) {
    if (tx < 0 || ty < 0 || tx >= S.cols || ty >= S.rows) return false;
    // 전술가: 지원군(소환물)은 자기 공격 범위 안에만
    const own = r && r.owner;
    if (def.summoned && own && own.alive && own.def.archetype === 'tactician' && !own.range.has(key(tx, ty))) return false;
    const ch = S.map[ty][tx];
    const need = tileOf(def) === 'ground' ? '.' : '^';
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
    else if (S.mode === 'inspect' || S.mode === 'preview') setMode('idle');
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
    if (op.skillT > 0 && (sk.effect || {}).cancelable) { useSkill(op); if (S.inspect === op) refreshInspect(true); }
    else if (sk.trigger !== 'manual') toast(`${op.def.name}의 스킬은 자동 발동입니다`);
    else if (op.skillT > 0) toast('스킬 발동 중입니다');
    else if (op.sp < sk.sp) toast(`SP가 부족합니다 (${Math.floor(op.sp)}/${sk.sp})`);
    else { activateSkill(op); if (S.inspect === op) refreshInspect(true); }
  });

  function toggleSpeed() {
    if (!S) return;
    S.speed = S.speed === 1 ? 2 : 1;
    $('#btn-speed').innerHTML = `<img src="img/ui/btn_speed_${S.speed > 1 ? 2 : 1}x.png" alt="${S.speed}배속"><kbd>F</kbd>`;
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
    const i = S.idx; UI.onBattleQuit(i); UI.go('operations', 'after');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });

  $('#ins-skill').addEventListener('click', () => { if (S && S.inspect) { useSkill(S.inspect); refreshInspect(true); } });
  $('#ins-retreat').addEventListener('click', () => { if (S && S.inspect) { retreat(S.inspect); setMode('idle'); } });

  // 왼쪽 정보 창 — 카드를 눌렀을 때(배치 전)와 배치한 오퍼레이터를 눌렀을 때 함께 씀
  const SP_NAME = { time: '자연 회복', attack: '공격 회복', hit: '피격 회복', deploy: '배치 발동' };
  let insTab = 'skill', insKey = null;
  $('#ins-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-itab]');
    if (!b || !S) return;
    insTab = b.dataset.itab; insKey = null;
    refreshInspect(true);
  });
  function skillChips(sk) {
    const dur = sk.effect && sk.effect.charges ? `${sk.effect.charges}회` : sk.duration === -1 ? '무한' : sk.duration > 0 ? `${sk.duration}초` : '';
    return `<span class="chip g">${SP_NAME[sk.spType || 'time']}</span><span class="chip">${sk.trigger === 'auto' ? '자동 발동' : '수동 발동'}</span>${dur ? `<span class="chip d">⏱ ${dur}</span>` : ''}`;
  }
  function refreshInspect(full) {
    const op = S.inspect, r = !op && S.sel;
    const d = op ? op.def : r ? r.def : null;
    if (!d) return;
    const sk = op ? op.skill : chosenSkill(d);
    const key = (op ? 'op' : 'card') + d.id + insTab;
    if (full || insKey !== key) {
      insKey = key;
      const arch = d.archetype && ARCHETYPES[d.archetype];
      $('#ins-art').innerHTML = d.image ? `<img src="${d.image}" alt="">` : `<b style="color:${d.color}">${d.name[0]}</b>`;
      $('#ins-art').style.setProperty('--c', d.color);
      $('#ins-cls').innerHTML = UI.icon(d.class);
      $('#ins-name').textContent = d.name;
      $('#ins-class').textContent = `${CLASSES[d.class].name}${arch ? ' · ' + arch.name : ''}`;
      $('#ins-range').innerHTML = rangeHTML(op ? null : d.range, op) + '<small>공격 범위</small>';
      $('#ins-tabs').querySelectorAll('[data-itab]').forEach((b) => b.classList.toggle('on', b.dataset.itab === insTab));
      let body = '';
      if (insTab === 'skill') {
        body = `<div class="ins-sk"><span class="ins-sk-ico" style="--c:${d.color}"><img src="${UI.skillIcon(sk, Math.max(0, skillsOf(d).indexOf(sk)), d)}" alt=""><b>S${skillsOf(d).indexOf(sk) + 1 || 1}</b></span><div><b class="ins-skill-name" id="ins-skill-name">${UI.esc(sk.name)}</b><div class="ins-chips">${skillChips(sk)}</div></div></div><p class="ins-skill-desc" id="ins-skill-desc">${UI.esc(sk.desc)}</p>`;
      } else if (insTab === 'trait') {
        body = `<p>${UI.esc(arch ? arch.trait : CLASSES[d.class].trait)}</p>`;
      } else {
        body = (d.talents || []).length ? d.talents.map((t) => `<p><b>${UI.esc(t.name)}</b><br>${UI.esc(t.desc)}</p>`).join('') : '<p class="muted">재능이 없습니다.</p>';
      }
      $('#ins-body').innerHTML = body;
    }
    const hp = op ? op.hp : d.hp, maxHp = op ? op.maxHp : d.hp;
    $('#ins-stats').innerHTML = `<span>${d.class === 'medic' ? '치유' : '공격'} <b>${Math.round(op ? opAtk(op) : d.atk)}</b></span><span>방어 <b>${Math.round(op ? opDef(op) : d.def)}</b></span>
      <span>마항 <b>${Math.round(op ? opRes(op) : d.res || 0)}</b></span><span>저지 <b>${op ? opBlock(op) : d.block}</b></span>`;
    $('#ins-hp-fill').style.width = Math.max(0, Math.min(1, hp / maxHp)) * 100 + '%';
    $('#ins-hp-text').textContent = `${Math.ceil(hp)}/${Math.round(maxHp)}`;
    const fill = $('#ins-sp-fill'), btn = $('#ins-skill');
    let spText;
    if (op && op.skillT > 0) {
      const inf = op.skillT === Infinity;
      fill.style.width = (op.charges > 0 && sk.effect.charges ? (op.charges / sk.effect.charges) * 100 : inf ? 100 : (op.skillT / sk.duration) * 100) + '%';
      fill.classList.add('active');
      spText = op.charges > 0 ? `발동 중 · ${op.charges}회 남음` : inf ? '발동 중' : `발동 중 ${op.skillT.toFixed(1)}s`;
    } else {
      const sp = op ? op.sp : sk.initSp || 0;
      fill.style.width = (sk.sp ? Math.min(1, sp / sk.sp) : 0) * 100 + '%';
      fill.classList.remove('active');
      spText = sk.spType === 'deploy' ? '배치 시 발동' : sk.stock ? `SP ${Math.floor(sp >= spCap(sk) ? sk.sp : sp % sk.sp)}/${sk.sp} · 충전 ${Math.floor(sp / sk.sp)}/${sk.stock}` : `SP ${Math.floor(sp)}/${sk.sp}${op ? '' : ' (초기)'}`;
      if (op && op.def.archetype === 'librator') spText += ` · 공격력 +${Math.round((2 * Math.min(40, op.libT || 0)) / 40 * 100)}%`;
      if (op && op.tal.patience) spText += ` · 인내 ${Math.floor(op.patience || 0)}`;
      if (op && op.tal.wrath) spText += ` · 의분 ${op.wrath || 0}`;
    }
    $('#ins-sp-text').textContent = spText;
    if (!op) return;
    const canEnd = op.skillT > 0 && (sk.effect || {}).cancelable;
    const ready = sk.trigger === 'manual' && op.skillT <= 0 && op.sp >= sk.sp;
    btn.disabled = !(canEnd || ready);
    btn.classList.toggle('ready', ready || canEnd);
    btn.classList.toggle('active', op.skillT > 0);
    const state = canEnd ? '스킬 종료' : op.skillT > 0 ? '발동 중' : sk.trigger === 'auto' ? '자동 발동' : ready ? '스킬 발동' : `${Math.floor(op.sp)}/${sk.sp}`;
    const html = `<span class="ring-sk" style="--c:${d.color}">S${skillsOf(d).indexOf(sk) + 1 || 1}</span><span class="ring-sp">${state}</span>${sk.trigger === 'manual' || canEnd ? '<kbd>E</kbd>' : ''}`;
    if (btn.dataset.h !== html) { btn.innerHTML = html; btn.dataset.h = html; }
  }
  // 정보 창의 작은 공격 범위 그림 (배치한 오퍼레이터는 지금 범위)
  function rangeHTML(range, op) {
    const pts = op ? op.rangeList.map(([x, y]) => [x - op.x, y - op.y]) : [[0, 0], ...range];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const set = new Set(pts.map((p) => p.join(',')));
    const size = Math.max(5, Math.min(11, Math.floor(56 / Math.max(x1 - x0 + 1, y1 - y0 + 1))));
    let h = `<div class="range-grid" style="grid-template-columns:repeat(${x1 - x0 + 1},${size}px);grid-auto-rows:${size}px">`;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) h += `<i class="${x === 0 && y === 0 ? 'self' : set.has(x + ',' + y) ? 'on' : 'off'}"></i>`;
    return h + '</div>';
  }
  // 배치한 오퍼레이터 주변의 마름모 · 철수/스킬 버튼
  function placeRing() {
    const ring = $('#op-ring'), op = S.mode === 'inspect' && S.inspect;
    ring.classList.toggle('hidden', !op);
    if (!op) return;
    const [X, Y, s] = proj(op.x + 0.5, op.y + 0.5, tileH(op.x, op.y));
    const size = P.T * s * 2.7;
    ring.style.cssText = `left:${X}px;top:${Y - P.T * s * 0.35}px;width:${size}px;height:${size}px`;
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
  // 충전형 스킬(stock): SP가 stock번 분량까지 쌓임
  const spCap = (sk) => sk.sp * (sk.stock || 1);
  const B = (op, k) => (op.buff && op.buff[k]) || 0;
  // 장치·소환물에 걸리는 주인의 스킬 효과
  const oeff = (op) => (op.def.summoned && op.owner && op.owner.alive ? eff(op.owner) : {});
  // 적의 무게 (값이 없으면 보스 4 · 정예 3 · 중장갑 2 · 그 외 1로 봄)
  const wOf = (e) => e.def.weight || (e.def.boss ? 4 : e.def.elite ? 3 : e.def.def >= 400 ? 2 : 1);
  const opAtk = (op) => op.def.atk * op.tal.atk * (eff(op).atk || 1) * (1 + B(op, 'atk'));
  const phalanxIdle = (op) => op.def.archetype === 'phalanx' && !(op.skillT > 0);
  const opDef = (op) => op.def.def * (phalanxIdle(op) ? 3 : 1) * op.tal.def * (eff(op).def || 1) * (1 + (op.auraDef || 0)) * (op.brand ? 0.7 : 1) * (1 + B(op, 'def')) + B(op, 'defFlat');
  const opInterval = (op) => op.def.interval * op.tal.speed * (eff(op).interval || 1) * (op.chill > 0 ? 1.5 : 1) * partnerMul(op) / Math.max(0.1, 1 + B(op, 'aspd') / 100);
  const opRes = (op) => (op.def.res || 0) + (phalanxIdle(op) ? 20 : 0) + (op.resT > 0 ? op.resBuff : 0) + B(op, 'res');
  const inSquad = (id) => S.squadIds.includes(id);
  const isDebuffed = (e) => e.analysis > 0 || e.slowT > 0 || e.stun > 0;
  // 최고의 파트너: 약화된 적을 공격 중이면 공격 속도 상승 (파트너 편성 시 더 크게)
  function partnerMul(op) {
    const ps = op.tal.partnerSpeed;
    if (!ps || !op.debuffedTarget) return 1;
    return inSquad(ps.partner) ? ps.partnerSpeed : ps.speed;
  }
  // 기수: 스킬 지속 시간 동안 저지 가능 수 0
  // 해방자: 스킬 미발동 시 저지 0
  const opBlock = (op) => ((op.def.archetype === 'bearer' && op.skillT > 0) || (op.def.archetype === 'librator' && !(op.skillT > 0)) ? 0 : op.def.block + (eff(op).block || 0) + B(op, 'block'));
  const opDodge = (op) => op.tal.dodge + (eff(op).dodge || 0) + (op.def.dodge || 0) + B(op, 'dodge');
  const opArtsDodge = (op) => (op.def.artsDodge || 0) + (eff(op).artsDodge || 0) + B(op, 'artsDodge');
  const tileOf = (def) => def.tile || CLASSES[def.class].tile;
  const isGround = (def) => tileOf(def) === 'ground';
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
    op.sp = Math.min(spCap(op.skill), op.sp + n);
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
        if (r) op.sp = Math.min(spCap(op.skill), op.sp + r * dt);
      }
      if (X.spTick && (st === 'attack' || st === 'hit')) { op.spTickT = (op.spTickT || 0) + dt; if (op.spTickT >= X.spTick) { op.spTickT -= X.spTick; gainSp(op, 1); } }
    }
    summonAuras();
    fieldTick(dt);
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
    // 계시 「변천」: 최대 HP가 가장 높은 오퍼레이터 초당 SP / 「강인함」: HP 비율이 가장 낮은 오퍼레이터 초당 HP 회복
    if (X.spBoost || X.lowHeal) {
      const live = S.ops.filter((o) => o.alive && !o.def.summoned);
      if (X.spBoost && live.length) gainSp(live.reduce((a, o) => (o.maxHp > a.maxHp ? o : a)), X.spBoost * dt);
      if (X.lowHeal && live.length) healOp(live.reduce((a, o) => (o.hp / o.maxHp < a.hp / a.maxHp ? o : a)), X.lowHeal * dt, true);
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
    if (ef.aspd) add('aspd', ef.aspd);
    // 해방자: 40초간 공격력 최대 +200% (스킬의 공격력 증가와 합연산)
    if (op.def.archetype === 'librator' && op.libT > 0) add('atk', (2 * Math.min(40, op.libT)) / 40 / (ef.atk || 1));
    if (t.patience && op.skillT > 0 && op.patSnap >= 20) add('aspd', t.patience.aspd);
    if (op.wrathT > 0) { op.wrathT -= dt; add('atk', op.wrathAtk); }
    // 받는 피해 배율 (여명 · 주영하 · 보호 효과)
    let cut = 1;
    if (op.guardT > 0) { op.guardT -= dt; cut *= 1 - op.guardCut; }
    for (const b of S.ops) {
      if (!b.alive || !b.tal.daily || !inBearer(b, op.x, op.y)) continue;
      const be = eff(b), kind = b.arts, m = be.dailyMul || 1;
      if (be.dailyMax) {
        if (kind === 'wind') { add('aspd', 30); add('atk', 0.15); }
        if (kind === 'sun') { healOp(op, op.maxHp * 0.03 * dt, true); cut *= 0.8; }
      } else {
        if (kind === 'wind') add('aspd', 12 * m);
        if (kind === 'sun') healOp(op, 35 * m * dt, true);
      }
      const pm = b.tal.promise;
      if (pm && b.skillT > 0 && near8(b, op.x, op.y)) {
        cut *= 1 - pm.cut;
        if (op.hp / op.maxHp <= pm.below && op.promiseOf !== b.skillN) { op.promiseOf = b.skillN; op.shield = Math.max(op.shield || 0, op.maxHp * pm.shield); addText(op.x + 0.5, op.y - 0.2, '변하지 않는 약속', b.def.color, 0.9, true); }
      }
    }
    for (const z of S.zones || []) {
      if (Math.hypot(op.x + 0.5 - z.x, op.y + 0.5 - z.y) > z.r + 0.3) continue;
      const zt = z.owner.tal.memory;
      cut *= (1 - (zt ? zt.cut : 0)) * (1 - (eff(z.owner).zoneCut || 0));
      break;
    }
    op.takenMul = cut;
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
      if (!op.choiceUsed) { op.choiceUsed = true; if (op.skillT <= 0) op.sp = Math.min(spCap(op.skill), op.sp + t.choice.sp); addText(op.x + 0.5, op.y - 0.1, '정해지지 않은 선택', op.def.color, 1, true); }
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
  // 오늘의 변수: 세 아츠 중 하나를 무작위로 (배치 · 2·3스킬 발동 때)
  function rollArts(op) {
    const keys = Object.keys(DAILY_ARTS);
    op.arts = keys[Math.floor(Math.random() * keys.length)];
    const d = DAILY_ARTS[op.arts];
    addText(op.x + 0.5, op.y - 0.5, `「${d.name}」 발현`, d.color, 1.6, true);
    rise(op.x + 0.5, op.y + 0.55, d.color, 8, 0.6, op.arts === 'sun' ? 'circle' : op.arts === 'gravity' ? 'shard' : 'petal');
  }
  // 여명의 깃발 범위: 평소 주변 8칸, 스킬로 주변 12칸
  const inBearer = (b, x, y) => (eff(b).dailyWide ? Math.abs(b.x - x) + Math.abs(b.y - y) <= 2 : near8(b, x, y));
  const luckOps = () => S.ops.filter((o) => o.alive && o.tal.unluck);
  // 매 프레임: 적에게 걸리는 이동·공격 속도 배율 (불운 · 중력), 잔향 지대
  function fieldTick(dt) {
    charmTick(dt);
    const seal = luckOps().some((o) => eff(o).sealLuck);
    const bearers = S.ops.filter((o) => o.alive && o.tal.daily);
    for (const e of S.enemies) {
      if (!e.alive) continue;
      let mv = 1, ai = 1;
      if (e.unluckyT > 0) { if (!seal) e.unluckyT -= dt; mv *= 0.8; ai *= 1.15; }
      if (e.failCd > 0) e.failCd -= dt;
      const tx = Math.floor(e.x), ty = Math.floor(e.y);
      for (const b of bearers) {
        if (b.arts !== 'gravity' || !inBearer(b, tx, ty)) continue;
        if (eff(b).dailyMax) { mv *= 0.55; ai *= 1.25; } else mv *= 1 - 0.2 * (eff(b).dailyMul || 1);
      }
      e.auraMove = mv * (e.fieldMul || 1); e.auraAtkI = ai;
    }
    if (!S.zones) return;
    for (const z of S.zones) {
      z.t -= dt; z.killCd -= dt;
      const o = z.owner;
      if (!o.alive) { z.t = 0; continue; }
      if (z.dps && (z.tick = (z.tick || 0) + dt) >= 1) {
        z.tick -= 1;
        for (const e of S.enemies.filter((e) => e.alive && !isFly(e.def) && Math.hypot(e.x - z.x, e.y - z.y) <= z.r)) hitEnemy(e, opAtk(o) * z.dps, 'arts', false, o, 0, true);
      }
      const zh = eff(o).zoneHeal;
      if (zh && (z.healT = (z.healT || 0) + dt) >= zh.every) {
        z.healT -= zh.every;
        for (const a of S.ops) if (a.alive && Math.hypot(a.x + 0.5 - z.x, a.y + 0.5 - z.y) <= z.r + 0.3) healOp(a, opAtk(o) * zh.mul);
      }
    }
    S.zones = S.zones.filter((z) => z.t > 0);
  }
  // ---------- 비나리 「사방에 복을 빌어」: 축원 부적 · 진법 영역 (타일 단위, 최대 16타일) ----------
  const groundTile = (x, y) => !!(S.map[y] && walkable(S.map[y][x]));
  function slowEnemy(e, move, dur) {
    if (!(e.slowT > 0)) { e.slowMove = move; e.slowAtk = 1; } else if (e.slowMove > move) e.slowMove = move;
    e.slowT = Math.max(e.slowT || 0, dur);
  }
  function bindEnemy(e, dur) {
    if (!e.alive || dur <= 0) return;
    e.bindT = Math.max(e.bindT || 0, dur);
  }
  const charmAt = (x, y) => S.charms && S.charms.get(key(x, y));
  const inField = (e) => { const c = !isFly(e.def) && charmAt(Math.floor(e.x), Math.floor(e.y)); return !!(c && c.field); };
  function addCharm(op, x, y, n = 1) {
    const ch = op.tal.charm;
    if (!ch || !groundTile(x, y)) return;
    S.charms = S.charms || new Map();
    let c = S.charms.get(key(x, y));
    if (!c) {
      if (S.charms.size >= ch.max) return;
      c = { x, y, n: 0, owner: op, field: false };
      S.charms.set(key(x, y), c);
    }
    if (c.field) return;
    c.n = Math.min(ch.stack, c.n + n);
    c.at = S.time;
    if (c.n < ch.stack) return;
    c.field = true;
    addText(x + 0.5, y + 0.2, '진법 영역', '#ff6a4a', 1, true);
    addFx({ type: 'ring', x: x + 0.5, y: y + 0.5, life: 0.5, color: '#ffcf3a', r: 0.6 });
    // 만복을 비나이다: 완성된 진법 영역이 상하좌우로 번짐
    if (eff(op).fieldSpread) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) addCharm(op, x + dx, y + dy, 1);
  }
  // 부적을 붙일 타일: 적이 있는 타일 > 적 이동 경로 > 이미 부적이 있는 타일 우선
  function placeCharm(op) {
    if (!S.pathTiles) { S.pathTiles = new Set(); for (const path of S.paths) for (const p of path) S.pathTiles.add(key(Math.floor(p.x), Math.floor(p.y))); }
    const busy = new Set(S.enemies.filter((e) => e.alive && !isFly(e.def)).map((e) => key(Math.floor(e.x), Math.floor(e.y))));
    let best = null, bs = -1;
    for (const [x, y] of op.rangeList) {
      if (!groundTile(x, y)) continue;
      const c = charmAt(x, y), k = key(x, y);
      if (c && c.field) continue;
      if (!c && S.charms && S.charms.size >= op.tal.charm.max) continue;
      const sc = (busy.has(k) ? 4 : 0) + (S.pathTiles.has(k) ? 2 : 0) + (c ? c.n : 0) + Math.random() * 0.8;
      if (sc > bs) { bs = sc; best = [x, y]; }
    }
    if (!best) return;
    addCharm(op, best[0], best[1], 1);
    const [X, Y] = best;
    rise(X + 0.5, Y + 0.55, '#ffe9a0', 2, 0.3, 'card');
  }
  function charmTick(dt) {
    for (const op of S.ops) {
      if (!op.alive || !op.tal.charm) continue;
      op.charmT = (op.charmT || 0) + dt;
      const every = eff(op).charmEvery || op.tal.charm.every;
      if (op.charmT >= every) { op.charmT = 0; placeCharm(op); }
    }
    if (!S.charms || !S.charms.size) { for (const e of S.enemies) e.fieldMul = 1; return; }
    for (const [k, c] of S.charms) if (!c.owner.alive) S.charms.delete(k);
    for (const e of S.enemies) {
      e.fieldMul = 1;
      if (!e.alive || isFly(e.def)) continue;
      const tk = key(Math.floor(e.x), Math.floor(e.y)), c = S.charms.get(tk);
      const o = c && c.owner, ch = o && o.tal.charm;
      if (tk !== e.charmTile) {
        e.charmTile = tk;
        // 부적이 있는 타일에 들어오면 피해 + 감속
        if (c) { hitEnemy(e, opAtk(o) * ch.mul, 'arts', false, o, 0, true); slowEnemy(e, 1 - ch.slow, ch.dur); if (!e.alive) continue; }
      }
      if (!c || !c.field) { e.fieldT = 0; continue; }
      const oe = eff(o);
      e.fieldMul = oe.fieldMove || ch.fieldMove;
      if (oe.fieldRes) { e.resDown = Math.max(e.resDownT > 0 ? e.resDown : 0, oe.fieldRes); e.resDownT = 0.3; }
      if ((e.fieldT = (e.fieldT || 0) + dt) >= 1) { e.fieldT -= 1; hitEnemy(e, opAtk(o) * ch.dps, 'arts', false, o, 0, true); }
    }
  }
  // 끌어당기기: 지상 적을 오퍼레이터 쪽으로 (걸을 수 있는 타일 안에서만)
  function pullEnemy(e, op, dist) {
    if (!e.alive || isFly(e.def) || e.def.boss) return;
    const cx = op.x + 0.5, cy = op.y + 0.5, dx = cx - e.x, dy = cy - e.y, d = Math.hypot(dx, dy);
    if (d < 0.75) return;
    const st = Math.min(dist, d - 0.7), nx = e.x + (dx / d) * st, ny = e.y + (dy / d) * st;
    if (groundTile(Math.floor(nx), Math.floor(ny))) { e.x = nx; e.y = ny; }
  }
  function addZone(op, x, y, r, zn) {
    S.zones = S.zones || [];
    const old = S.zones.find((z) => z.owner === op && Math.hypot(z.x - x, z.y - y) < 0.6);
    if (old) { old.t = Math.max(old.t, zn.dur); old.dps = Math.max(old.dps, zn.dps); old.r = Math.max(old.r, r); return; }
    S.zones.push({ owner: op, x, y, r, t: zn.dur, max: zn.dur, dps: zn.dps, killCd: 0 });
    if (S.zones.length > 8) S.zones.shift();
  }
  // 기억하는 향: 불운 상태의 적이 지대 안에서 쓰러지면 가장 다친 아군 회복
  function zoneKill(e) {
    for (const z of S.zones || []) {
      const mm = z.owner.tal.memory;
      if (!mm || z.killCd > 0 || Math.hypot(e.x - z.x, e.y - z.y) > z.r) continue;
      const a = S.ops.filter((o) => o.alive && Math.hypot(o.x + 0.5 - z.x, o.y + 0.5 - z.y) <= z.r + 0.3).sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp)[0];
      if (a) { healOp(a, a.maxHp * mm.heal); z.killCd = mm.cd; }
      return;
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
    if (t.patience) op.patSnap = Math.floor(op.patience || 0);
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
    if (X.dancer && idx === 0) { op.sp = Math.min(spCap(op.skill), op.sp + X.dancer.sp); add('aspd', X.dancer.aspd); add('atk', X.dancer.atk); }
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
      // 전술가: 자기 지원군이 저지한 적에게 공격력 150%
      if (src.def.archetype === 'tactician' && e.blockedBy && e.blockedBy.owner === src) m += 0.5;
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
    if (def.mut && def.mut.freeze) { op.stun = 15; addText(tx + 0.5, ty - 0.4, '신경 쇠퇴', '#9266b2', 1.2, true); }
    sfx('deploy');
    if (r.left !== undefined) { r.left--; r.cd = def.redeploy; } else r.deployed = true;
    addFx({ type: 'ring', x: tx + 0.5, y: ty + 0.5, life: 0.4, color: def.color });
    addText(tx + 0.5, ty - 0.1, UI.line(def, 'deploy'), def.color, 1.8, true);
    if (tal.daily) rollArts(op);
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
    op.roster.cd = op.roster.cdMax = S.ext.practice ? 2 : op.def.redeploy * Math.max(0.2, 1 - perDep('redeploy'));
    if (S.inspect === op) setMode('idle');
    const cx = op.x + 0.5, cy = op.y + 0.5;
    if (died) {
      // 전투 불능: 붉은 고리 + 잿빛 파편이 흩어짐
      sfx('down');
      addFx({ type: 'ring', x: cx, y: cy, life: 0.6, color: '#ff4d57', r: 0.9 });
      sparks(cx, cy, '#9aa1ab', 22, { speed: 1.6, size: 0.07, h: 0.5, life: 0.9, shape: 'shard' });
      rise(cx, cy, '#ff6b6e', 8, 0.5, 'shard');
      addText(op.x + 0.5, op.y + 0.2, '전투 불능', '#ff6b6e', 1.2, true);
    } else {
      // 철수: 푸른 빛이 위로 흩어짐
      addFx({ type: 'ring', x: cx, y: cy, life: 0.45, color: '#8fd3ff', r: 0.7 });
      rise(cx, cy, '#bfe6ff', 12, 0.45, 'circle');
    }
  }
  function retreat(op) {
    S.dp = Math.min(S.maxDp, S.dp + Math.floor(op.def.cost / 2));
    addText(op.x + 0.5, op.y + 0.2, '철수', '#9aa1ab', 0.8, true);
    sfx('retreat');
    removeOp(op, false);
  }

  // 발동 중이고 수동 종료가 가능하면 종료, 아니면 발동
  function useSkill(op) {
    if (op.skillT > 0 && (op.skill.effect || {}).cancelable) {
      endSkill(op);
      addText(op.x + 0.5, op.y - 0.1, '스킬 종료', '#9aa1ab', 0.8, true);
      // 토글 스킬: 끄면 SP가 그대로 차 있어서 바로 다시 켤 수 있음
      if (op.skill.effect.toggle) op.sp = op.skill.sp;
      return;
    }
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
    if (ef.accident) op.accT = ef.accident.every;
    if (ef.luckAll && op.tal.unluck) {
      const rg = ef.range ? computeRange(ef.range, op.dir, op.x, op.y).set : op.range;
      for (const e of S.enemies) if (e.alive && rg.has(key(Math.floor(e.x), Math.floor(e.y)))) e.unluckyT = op.tal.unluck.dur;
    }
    if (ef.reroll && op.tal.daily) rollArts(op);
    op.skillAge = 0;
    if (ef.dailyMax && op.tal.daily && op.arts === 'gravity') {
      for (const e of S.enemies) if (e.alive && Math.abs(Math.floor(e.x) - op.x) + Math.abs(Math.floor(e.y) - op.y) <= 2) stunEnemy(e, 2);
    }
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
        addFx({ type: 'hit', style: vfxOf(op.def).hit || 'punch', x: t.x, y: t.y, life: 0.32, color: '#ffcf3a', color2: '#fff', big: true });
        sparks(t.x, t.y, '#ffcf3a', 5, { speed: 1.8, size: 0.05, h: 0.35 });
        hitEnemy(t, atk * ef.strike.mul, 'phys');
        if (ef.strike.stun) stunEnemy(t, ef.strike.stun);
      }
      addFx({ type: 'ring', x: op.x + 0.5, y: op.y + 0.5, life: 0.4, color: '#ffcf3a', r: ef.strike.radius });
    }
    // 잡귀는 물렀거라: 범위 안 모든 적에게 즉시 마법 피해 · 기절, 맞은 자리에 축원 부적
    if (ef.blast) {
      for (const t of S.enemies.filter((e) => e.alive && op.range.has(key(Math.floor(e.x), Math.floor(e.y))))) {
        attackFx(op, t, 0, 'arts', true, op.x + 0.5, op.y + 0.5);
        hitEnemy(t, opAtk(op) * ef.blast.mul, 'arts', false, op);
        stunEnemy(t, ef.blast.stun);
        if (ef.blast.charm && !isFly(t.def)) addCharm(op, Math.floor(t.x), Math.floor(t.y), 1);
      }
      for (const [kx, ky] of op.rangeList) if (Math.random() < 0.35) rise(kx + 0.5, ky + 0.55, '#ffe9a0', 1, 0.3, 'card');
    }
    op.sp = sk.stock ? Math.max(0, op.sp - sk.sp) : 0;
    relicSkill(op);
    charSkill(op);
    op.skillT = sk.duration === -1 ? Infinity : sk.duration || 0;
    op.charges = ef.charges || 0;
    if (ef.range && op.skillT > 0) setRange(op, ef.range);
    // 발동 순간 이 스킬의 공격 범위를 1.5초간 판 위에 표시
    op.flashUntil = S.time + 1.5;
    op.flashTiles = ef.range ? computeRange(ef.range, op.dir, op.x, op.y).list : op.rangeList.slice();
    afterActivate(op, ef);
    addFx({ type: 'ring', x: op.x + 0.5, y: op.y + 0.5, life: 0.6, color: op.def.color, r: 0.9 });
    addFx({ type: 'ring', x: op.x + 0.5, y: op.y + 0.5, life: 0.45, color: '#ffcf3a', r: 0.6 });
    castFx(op);
    addText(op.x + 0.5, op.y - 0.1, sk.name, '#ffcf3a', 1.2, true);
    const cl = sk.voice || UI.line(op.def, 'combat');
    if (cl && (op.def.voice || sk.voice)) addText(op.x + 0.5, op.y - 0.45, cl, op.def.color, 1.8, true);
    return true;
  }

  // 스킬 범위가 정해진 뒤의 발동 효과 (안드레아 · 비나리)
  function afterActivate(op, ef) {
    const inR = () => S.enemies.filter((e) => e.alive && (e.blockedBy === op || op.range.has(key(Math.floor(e.x), Math.floor(e.y)))));
    const wr = op.tal.wrath, n = op.wrath || 0;
    if (wr && n > 0) {
      op.wrathAtk = n * wr.atk; op.wrathT = n * wr.dur; op.wrath = 0;
      if (n >= wr.max) {
        for (const t of inR()) { hitEnemy(t, opAtk(op) * wr.mul, 'phys', true, op); stunEnemy(t, wr.stun); }
        addText(op.x + 0.5, op.y - 0.3, '정의로운 분노', '#ffd86b', 1.2, true);
      }
    }
    if (ef.rangeStrike) {
      for (const t of inR()) {
        addFx({ type: 'hit', style: 'bash', x: t.x, y: t.y, life: 0.35, color: '#ffd86b', color2: '#fff', big: true });
        hitEnemy(t, opAtk(op) * ef.rangeStrike.mul, 'phys', true, op, ef.ignoreDef || 0);
        stunEnemy(t, ef.rangeStrike.stun);
      }
      for (const [kx, ky] of op.rangeList) addFx({ type: 'ring', x: kx + 0.5, y: ky + 0.5, life: 0.5, color: '#ffd86b', r: 0.45 });
      S.shake = 0.3;
    }
    if (ef.pulse) op.pulseT = ef.pulse.every + ((ef.pull && ef.pull.dur) || 0);
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
    // 해방자: 스킬이 끝나면 공격력 충전 초기화 / 인내의 기도 초기화
    if (op.def.archetype === 'librator') op.libT = 0;
    if (op.tal.patience) { op.patience = 0; op.patSnap = 0; }
    // 만복을 비나이다를 끄면 설치된 부적이 모두 터지며(부적마다 주변 적에게 마법 피해 · 속박) 진법이 사라짐
    if (ef.clearCharms && S.charms) {
      const burst = ef.charmBurst, atk = op.def.atk * op.tal.atk * (ef.atk || 1);
      for (const [k, c] of S.charms) {
        if (c.owner !== op) continue;
        S.charms.delete(k);
        if (!burst || !op.alive) continue;
        addFx({ type: 'ring', x: c.x + 0.5, y: c.y + 0.5, life: 0.5, color: '#ff5a5a', r: 0.8 });
        for (const e of S.enemies) if (e.alive && Math.hypot(e.x - (c.x + 0.5), e.y - (c.y + 0.5)) <= burst.radius) { hitEnemy(e, atk * burst.mul, 'arts', false, op, 0, true); if (e.alive) bindEnemy(e, burst.bind); }
      }
      if (burst && op.alive) { sfx('strike'); S.shake = Math.max(S.shake, 0.25); }
      addText(op.x + 0.5, op.y - 0.2, burst && op.alive ? '부적 폭발' : '진법 해제', burst && op.alive ? '#ff7a7a' : '#9aa1ab', 1, true);
    }
    if (ef.hpMul) { op.maxHp /= ef.hpMul; op.hp = Math.min(op.hp, op.maxHp); }
    if (ef.endHeal) healOp(op, op.maxHp * ef.endHeal);
    if (ef.endStun) { op.stun = ef.endStun; addText(op.x + 0.5, op.y - 0.1, '기절', '#9aa1ab', 1, true); }
    if (ef.endGuard && (op.skillAge || 0) >= 3) {
      const a = S.ops.filter((o) => o.alive && Math.abs(o.x - op.x) + Math.abs(o.y - op.y) <= 2).sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp)[0];
      if (a) { a.guardT = ef.endGuard.dur; a.guardCut = ef.endGuard.cut; addText(a.x + 0.5, a.y - 0.2, '받는 피해 감소', '#7fd8ff', 0.9, true); }
    }
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

  // 같은 학교 친구들 (김가을 「패턴 학습」 공통 시너지)
  const SCHOOL = ['gaeul', 'iai', 'simhae', 'byeol'];
  function pickTargets(op, n) {
    const ground = isGround(op.def);
    const antiAir = op.def.class === 'sniper';
    // 공격수: 저지 중인 적 전부 동시 공격
    if (op.def.archetype === 'centurion' || eff(op).allBlocked || (op.def.summoned && op.owner && op.owner.alive && eff(op.owner).guardAll)) n = Math.max(n, op.blocked.length);
    const list = S.enemies.filter((e) => e.alive && (e.blockedBy === op ||
      (op.range.has(key(Math.floor(e.x), Math.floor(e.y))) && !((ground || op.def.groundOnly) && isFly(e.def) && op.def.archetype !== 'sentry' && op.def.archetype !== 'lord' && !eff(op).antiAir))));
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
    if (op.def.mut && op.def.mut.drain && op.hp < op.maxHp) op.hp = Math.max(1, op.hp - op.maxHp * 0.015 * dt);
    if (op.brand && !S.mods.brandImmune) { op.hp -= op.maxHp * 0.01 * dt; if (op.hp <= 0) { removeOp(op, true); return; } }
    if (op.stun > 0) { op.stun -= dt; op.atkCd = Math.max(op.atkCd, 0.2); return; }
    if (op.hotT > 0) { op.hotT -= dt; healOp(op, op.hotAmt * dt, true); }
    op.blocked = op.blocked.filter((e) => e.alive && e.blockedBy === op);
    if (op.blocked.length && opBlock(op) <= 0) { for (const e of op.blocked) e.blockedBy = null; op.blocked = []; }

    if (op.skillT > 0) {
      if (op.skillT !== Infinity) {
        op.skillT -= dt;
        if (op.skillT <= 0) endSkill(op);
      }
      if (ef.regen) healOp(op, op.maxHp * ef.regen * dt, true);
      if (ef.dpRegen) S.dp = Math.min(S.maxDp, S.dp + ef.dpRegen * dt);
      op.skillAge = (op.skillAge || 0) + dt;
      if (ef.dpFor && (op.dpForGot || 0) < ef.dpFor.total) { const g = Math.min((ef.dpFor.total / ef.dpFor.dur) * dt, ef.dpFor.total - (op.dpForGot || 0)); op.dpForGot = (op.dpForGot || 0) + g; S.dp = Math.min(S.maxDp, S.dp + g); }   // 배치당 최대 total
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
      // 만복을 비나이다: 발동 직후 끌어당김, 이후 주기적으로 약한 끌어당김 + 광역 마법 피해
      if (ef.pull && op.skillAge < ef.pull.dur) for (const e of S.enemies) if (e.alive && op.range.has(key(Math.floor(e.x), Math.floor(e.y)))) pullEnemy(e, op, ef.pull.speed * dt);
      if (ef.pulse && (op.pulseT -= dt) <= 0) {
        op.pulseT = ef.pulse.every;
        for (const e of S.enemies.filter((e) => e.alive && op.range.has(key(Math.floor(e.x), Math.floor(e.y))))) { pullEnemy(e, op, ef.pulse.pull); hitEnemy(e, opAtk(op) * ef.pulse.mul, 'arts', false, op); }
        for (const [kx, ky] of op.rangeList) addFx({ type: 'ring', x: kx + 0.5, y: ky + 0.5, life: 0.5, color: '#ff6a4a', r: 0.45 });
        sfx('strike');
      }
    } else if (sk.spType !== 'deploy') {
      if (!sk.spType || sk.spType === 'time') op.sp = Math.min(spCap(sk), op.sp + dt * (S.ext.practice ? 3 : 1));
      if (sk.trigger === 'auto' && op.sp >= sk.sp && !op.charge && !op.burst && (op.def.archetype === 'bearer' || hasWork(op))) activateSkill(op);
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

    // 해방자: 스킬 미발동 시 공격력 충전 · 인내 누적
    if (!(op.skillT > 0)) {
      if (op.def.archetype === 'librator') op.libT = Math.min(40, (op.libT || 0) + dt);
      if (op.tal.patience) op.patience = Math.min(op.tal.patience.max, (op.patience || 0) + dt);
    }
    // 기수: 스킬 중에는 공격하지 않음 / 진법 캐스터 · 해방자: 스킬 미발동 시 공격하지 않음
    if (op.def.archetype === 'bearer' && op.skillT > 0) return;
    if ((op.def.archetype === 'phalanx' || op.def.archetype === 'librator') && !(op.skillT > 0)) return;
    // 불행을 밀봉하는 법: 5초마다 「사고」
    const acc = ef.accident;
    if (acc && op.skillT > 0 && (op.accT = (op.accT ?? acc.every) - dt) <= 0) {
      op.accT = acc.every;
      const v = S.enemies.filter((e) => e.alive && e.unluckyT > 0).sort((a, b) => b.hp - a.hp)[0];
      if (v) { addFx({ type: 'ring', x: v.x, y: v.y, life: 0.5, color: '#b48cff', r: 0.6 }); addText(v.x, v.y - 0.5, '사고', '#b48cff', 0.9, true); hitEnemy(v, opAtk(op) * acc.mul, 'arts', true, op); stunEnemy(v, acc.stun); sfx('strike'); }
    }
    op.atkCd -= dt;
    if (op.atkCd > 0) return;
    // 진법 캐스터: 스킬 지속 중 범위 안 모든 적 공격
    const n = op.def.archetype === 'phalanx' ? 99 : eff(op).targets || oeff(op).devTargets || op.def.targets || 1;
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
        // 테라피스트: 멀리 있는(주변 8칸 밖) 아군 치료량 80%
        const far = op.def.archetype === 'therapist' && !eff(op).fullFar && Math.max(Math.abs(a.x - op.x), Math.abs(a.y - op.y)) > 1 ? 0.8 : 1;
        healOp(a, opAtk(op) * far * (ls && a === op.healTarget ? 1 + op.healStacks * ls.step : 1));
        if (rb) { a.resBuff = rb.res; a.resT = rb.dur; }
        if (hot) { a.hotAmt = opAtk(op) * hot.mul; a.hotT = hot.dur; }
        const hv = vfxOf(op.def);
        addFx({ type: 'beam', x1: cx, y1: cy, x2: a.x + 0.5, y2: a.y + 0.5, life: 0.3, color: hv.heal || '#7dff9a' });
        if (Math.random() < 0.5) rise(a.x + 0.5, a.y + 0.55, hv.heal || '#7dff9a', 2, 0.4, hv.cast === 'feather' ? 'feather' : 'cross');
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
    // 인내의 기도(30중첩 이상) · 주여, 용서하소서!: 방어력 무시
    if (op.patSnap >= 30) ignore = Math.min(1, ignore + op.tal.patience.ignore);
    if (eff(op).ignoreDef) ignore = Math.min(1, ignore + eff(op).ignoreDef);
    let mul = 1;
    // 인내에도 한계가 있습니다: 같은 적 연속 공격 시 물리 피해 증가
    const chn = eff(op).chain;
    if (chn) {
      if (op.chainTarget === targets[0]) op.chainN = Math.min(chn.max, (op.chainN || 0) + 1);
      else { op.chainTarget = targets[0]; op.chainN = 0; }
      mul *= 1 + chn.step * op.chainN;
    }
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
    if (op.charge) { mul *= op.charge; op.charge = 0; if (op.chargeStun) { stunHit = Math.max(stunHit, op.chargeStun); op.chargeStun = 0; } nsplash = (op.skill.effect || {}).nextSplash || 0; op.zoneBoost = (op.skill.effect || {}).nextZone; }
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
        attackFx(op, t, i, type, op.skillT > 0 || mul > 1.4, cx, cy);
        const crit = op.tal.crit && Math.random() < op.tal.crit.rate ? op.tal.crit.mul : 1;
        // 로드: 저지하지 않은 적(원거리 공격)에게는 공격력 80%
        const lordMul = op.def.archetype === 'lord' && t.blockedBy !== op ? 0.8 : 1;
        // 패턴 학습: 「공략」된 적에게 방어력 무시 · 추가 피해 (NO CONTINUE: 피해 +20%)
        // 공통 시너지 (같은 학교 · 김가을 판도라 헤이비스 천사별): 김가을이 배치되어 있으면 넷의 공격이 모두 「공략」을 쌓고,
        // 「공략」된 적을 공격할 때 김가을 외의 셋도 방어력 무시 · 피해 증가 (school)
        const own = op.tal.pattern ? op : null;
        const lead = own || (SCHOOL.includes(op.def.id) && S.ops.find((o) => o.alive && o.tal.pattern)) || null;
        const pt = lead && lead.tal.pattern, anal = pt && t.analyzedT > 0;
        const e2 = own && op.def.trained && op.def.trained.elite >= 2;
        const ptIgn = !anal ? 0 : own ? pt.ignore + (e2 ? pt.ignore2 || 0 : 0) : pt.schoolIgnore;
        const anaMul = !anal ? 1 : own ? 1 + (eff(op).analyzedAmp || 0) : 1 + pt.schoolAmp;
        hitEnemy(t, atk * crit * lordMul * anaMul * (t === targets[0] ? bsMul : 1), type, crit > 1, op, Math.min(1, ignOf(t) + ptIgn));
        if (pt && t.alive) {
          if (anal) {
            t.analyzedT = pt.dur;
            if (own) hitEnemy(t, opAtk(op) * (pt.extra + (e2 ? pt.extra2 || 0 : 0)) * anaMul, 'phys', false, op, ptIgn, true);
          } else if (!own || t.blockedBy !== op || eff(op).patternBlocked) {
            t.ptHits = (t.ptHits || 0) + 1;
            if (t.ptHits >= pt.hits) { t.analyzedT = pt.dur; t.ptHits = 0; addText(t.x, t.y - 0.45, '공략', '#7fe0ff', 0.9, true); }
          }
        }
        // NO CONTINUE: 같은 적을 N회 공격할 때마다 추가 피해 + 기절
        const ev = eff(op).everyHit;
        if (ev && i === 0 && t.alive) {
          if (op.evTarget === t) op.evN++; else { op.evTarget = t; op.evN = 1; }
          if (op.evN % ev.every === 0) { addFx({ type: 'ring', x: t.x, y: t.y, life: 0.35, color: '#7fe0ff', r: 0.5 }); hitEnemy(t, opAtk(op) * ev.mul, 'phys', true, op, ptIgn, true); stunEnemy(t, ev.stun); }
        }
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
          addFx({ type: 'shot', x1: cx, y1: cy, x2: t.x + 0.1, y2: t.y - 0.1, life: 0.22, color: '#ffe36b' });
          hitEnemy(t, atk * xh.mul, type, false, op);
        }
        if (op.tal.argue && t.alive && t.proof) hitEnemy(t, opAtk(op) * op.tal.argue.mul, 'arts', false, op);
        if (stunHit && t.alive) stunEnemy(t, stunHit);
        // 삼재를 막고: 추가 마법 피해, 진법 영역 위의 적 확률 속박
        if (eff(op).extraArts && i === 0 && t.alive) hitEnemy(t, opAtk(op) * eff(op).extraArts, 'arts', false, op, 0, true);
        const fb = eff(op).fieldBind;
        if (fb && i === 0 && t.alive && inField(t) && Math.random() < fb.rate) { bindEnemy(t, fb.dur); addText(t.x, t.y - 0.45, '속박', '#ff8a6a', 0.7); }
        // 인내의 기도 40중첩: 추가 물리 피해
        if (op.patSnap >= 40 && t.alive) hitEnemy(t, opAtk(op) * op.tal.patience.extra, 'phys', false, op, ignore, true);
        // 부디 자비를: 처음 공격하는 적 기절
        if (eff(op).firstStun && i === 0 && t.alive && !(t.mercyBy === op && t.mercyN === op.skillN)) { t.mercyBy = op; t.mercyN = op.skillN; stunEnemy(t, eff(op).firstStun); }
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
    // 연금술사: 시약이 떨어진 자리에 불운과 잔향 지대
    if (op.def.zone) {
      const ul = op.tal.unluck, r0 = splash || 0.9;
      for (const t of targets) {
        if (ul) for (const o of S.enemies) if (o.alive && Math.hypot(o.x - t.x, o.y - t.y) <= r0) o.unluckyT = ul.dur;
        addZone(op, t.x, t.y, r0, op.zoneBoost || op.def.zone);
      }
      op.zoneBoost = null;
    }
    // PARABELLUM BULLET: 가장 무거운 적에게 탄환 집중
    const hf = eff(op).heavyFocus;
    if (hf) {
      const hv = targets.filter((t) => t.alive).sort((a, b) => wOf(b) - wOf(a))[0];
      if (hv) { addFx({ type: 'shot', x1: cx, y1: cy, x2: hv.x, y2: hv.y, life: 0.25, color: '#6fa8ff', big: true }); hitEnemy(hv, atk * hf, type, false, op, ignOf(hv)); }
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
    if (sk.spType === 'attack' && op.skillT <= 0) op.sp = Math.min(spCap(sk), op.sp + 1);
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
    op.neural = (op.neural || 0) + v * m * (1 + (S.mods.neuralMul || 0));
    if (op.neural < 1000) return;
    op.neural = 0;
    op.stun = 6 * m;
    op.hp -= 800;
    op.flash = 0.2;
    addText(op.x + 0.5, op.y - 0.1, '신경 손상', '#c77dff', 1, true);
    if (op.hp <= 0) removeOp(op, true);
  }
  function onDodge(op, src) {
    const X = S.mods;
    addText(op.x + 0.5, op.y + 0.25, '회피', '#cfd3d6', 0.5);
    // 저스트 가드: 회피하면 반격 (1초에 1번) — 공격한 적이 범위 안이면 그 적, 아니면 범위 안 가장 가까운 적
    const ct = eff(op).counter;
    if (ct && S.time - (op.counterAt ?? -9) >= ct.cd) {
      const inR = (e) => e && e.alive && (e.blockedBy === op || op.range.has(key(Math.floor(e.x), Math.floor(e.y))));
      const t = inR(src) ? src : S.enemies.filter(inR).sort((a, b) => Math.hypot(a.x - op.x - 0.5, a.y - op.y - 0.5) - Math.hypot(b.x - op.x - 0.5, b.y - op.y - 0.5))[0];
      if (t) {
        op.counterAt = S.time;
        addFx({ type: 'hit', style: 'slash', x: t.x, y: t.y, life: 0.3, color: '#7fe0ff' });
        addText(op.x + 0.5, op.y - 0.05, '저스트 가드', '#7fe0ff', 0.7, true);
        hitEnemy(t, opAtk(op) * ct.mul, 'phys', true, op, 0, true);
        stunEnemy(t, ct.stun);
      }
    }
    if (X.dodgeAtk) op.dodgeAtkT = X.dodgeAtk.dur;
    if (X.dodgeAspd) op.dodgeAspdT = X.dodgeAspd.dur;
    if (X.dodgeNext) op.charge = Math.max(op.charge || 0, 1 + X.dodgeNext);
  }
  function hitOp(op, atk, type, src) {
    if (!op.alive) return;
    const X = S.mods;
    if (type === 'phys' && Math.random() < opDodge(op)) { onDodge(op, src); return; }
    if (type === 'arts' && Math.random() < opArtsDodge(op)) { onDodge(op, src); return; }
    const eg = src && src.blockedBy === op && op.tal.easygoing;
    if (eg && Math.random() < eg.nullify) { addText(op.x + 0.5, op.y + 0.25, '무효', '#7fd8ff', 0.5); return; }
    if (op.immune > 0) { op.immune--; addText(op.x + 0.5, op.y + 0.25, '무효', '#7fd8ff', 0.5); if (X.dodgeNext) op.charge = Math.max(op.charge || 0, 1 + X.dodgeNext); return; }
    let dmg = calcDamage(atk, type, opDef(op), opRes(op)) * guardMul(op);
    if (src && src.markT > 0 && eff(op).markCut) dmg *= 1 - eff(op).markCut;
    if (op.surviveT > 0) dmg *= 1 - op.tal.survive.cut;
    if (op.takenMul) dmg *= op.takenMul;
    if (op.def.evo) dmg *= 0.65;
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
    if (eff(op).blockedCut && src && src.blockedBy === op) dmg *= 1 - eff(op).blockedCut;
    // 액막이: 최대 HP의 20%(스킬 중 30%) 이하 피해 무효화 (5초마다 1회) → 주변 적에게 마법 피해 · 속박
    const am = op.tal.amulet;
    if (am && dmg > 0 && S.time - (op.amuletAt ?? -99) >= am.cd && dmg <= op.maxHp * (op.skillT > 0 ? am.skillBelow : am.below)) {
      op.amuletAt = S.time;
      addText(op.x + 0.5, op.y - 0.1, '액막이', '#ff6a4a', 0.9, true);
      addFx({ type: 'ring', x: op.x + 0.5, y: op.y + 0.5, life: 0.45, color: '#ff6a4a', r: am.radius });
      rise(op.x + 0.5, op.y + 0.55, '#ffe9a0', 5, 0.5, 'card');
      const hit = enemiesNear(op, am.radius);
      if (src && src.def && !src.tal && src.alive && !hit.includes(src)) hit.push(src);
      for (const e of hit) { hitEnemy(e, opAtk(op) * am.mul, 'arts', false, op); bindEnemy(e, am.bind); }
      if (eff(op).amuletExtra && src && src.def && !src.tal) hitEnemy(src, opAtk(op) * eff(op).amuletExtra, 'arts', true, op, 0, true);
      return;
    }
    if (op.shield > 0) {
      const absorbed = Math.min(op.shield, dmg);
      op.shield -= absorbed;
      dmg -= absorbed;
      if (dmg <= 0) { addText(op.x + 0.5, op.y + 0.25, '보호막', '#7fd8ff', 0.5); return; }
    }
    // 용기는 조금씩: 범위 안 아군의 치명상을 작전 중 1회 줄이고 부표 횟수 회복
    if (op.hp - dmg <= 0 && !S.courageUsed) {
      const near = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
      const cf = S.ops.find((o) => o.alive && o.tal.courage && (near(o, op) || S.ops.some((d) => d.alive && d.owner === o && near(d, op))));
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
      if (op.skillT <= 0) op.sp = Math.min(spCap(op.skill), op.sp + sv.sp);
      addText(op.x + 0.5, op.y - 0.1, '일단 살고 봐야죠!', '#7fd8ff', 1.2, true);
      return;
    }
    op.hp -= dmg;
    op.flash = 0.12;
    sfx('hurt');
    // 정의로운 분노: 주변 8칸 아군이 적에게 피해를 받으면 의분 +1
    if (src && src.def && !src.tal && dmg > 0) for (const a of S.ops) if (a.alive && a !== op && a.tal.wrath && near8(a, op.x, op.y)) a.wrath = Math.min(a.tal.wrath.max, (a.wrath || 0) + 1);
    addText(op.x + 0.5, op.y + 0.25, Math.round(dmg), type === 'arts' ? '#d9b3ff' : '#ff8c8f', 0.6);
    if (op.skill.spType === 'hit' && op.skillT <= 0) op.sp = Math.min(spCap(op.skill), op.sp + 1);
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
      rushT: S.mods.eliteRush && (def.elite || def.boss) ? S.mods.eliteRush.dur : 0,
    });
    if (def.boss) { sfx('boss'); toast(`경고 — ${def.name} 출현`); S.shake = 0.5; } else sfx('spawn');
  }

  function hitEnemy(e, atk, type, crit, src, ignore = 0, extra = false) {
    if (!e.alive) return;
    const X = S.mods;
    if (e.def.dodge && Math.random() < e.def.dodge) { addText(e.x, e.y - 0.25, '회피', '#cfd3d6', 0.4); return; }
    const hd = e.def.harden && e.hp / e.maxHp < e.def.harden.below ? e.def.harden.def : 1;
    if (src && src.def && X.ignoreDef && X.ignoreDef.classes.includes(src.def.class)) ignore = Math.min(1, ignore + X.ignoreDef.v);
    if (src && src.def && src.def.evo) ignore = Math.min(1, ignore + 0.35);
    let def = e.def.def * hd * (1 - ignore), res = (e.def.res || 0) * (src && src.def && src.def.evo ? 0.65 : 1), amp = relicDealt(e, type, src);
    if (e.rushT > 0) amp *= 1 - S.mods.eliteRush.cut;
    if (e.supDebuff) { def *= 1 - X.supporterDebuff.def; res *= 1 - X.supporterDebuff.res; }
    if (e.resDownT > 0) res = Math.max(0, res - e.resDown);
    if (e.unluckyT > 0) for (const o of luckOps()) {
      const le = eff(o);
      if (le.luckDef) def *= 1 - le.luckDef;
      if (le.luckRes) res *= 1 - le.luckRes;
      if (le.luckAmp && type === 'arts') amp += le.luckAmp;
    }
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
    if (e.unluckyT > 0) zoneKill(e);
    relicKill(e);
    sfx('kill');
    addFx({ type: 'ring', x: e.x, y: e.y, life: 0.4, color: e.def.color, r: e.def.boss ? 1.2 : 0.6 });
    sparks(e.x, e.y, e.def.color, e.def.boss ? 24 : 9, { speed: 1.5, size: 0.06, h: 0.3, life: 0.6 });
    sparks(e.x, e.y, '#ffffff', e.def.boss ? 10 : 4, { speed: 1, size: 0.04, h: 0.3 });
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
    let step = e.def.speed * dt * (S.mods.anger && S.time < S.mods.anger.dur ? 1 - S.mods.anger.speed : 1) * (e.slowT > 0 ? e.slowMove : 1) * (e.auraMove || 1) * Math.max(0.2, 1 - perDep('enemySlow'));
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
    if (S.ext.practice) return;   // 훈련장: 방어 지점이 깎이지 않음
    let cost = e.def.lifeCost || 1;
    if (S.shield > 0) { const a = Math.min(S.shield, cost); S.shield -= a; cost -= a; }
    S.life -= cost;
    S.shake = 0.3;
    sfx('leak');
    toast('방어선이 돌파당했습니다!');
  }

  function enemyAtk(e) {
    const en = e.def.enrage, X = S.mods;
    return e.def.atk * e.atkMul * (e.rushT > 0 ? 1 + X.eliteRush.atk : 1) * (X.anger && S.time < X.anger.dur ? 1 - X.anger.atk : 1) * (en && e.hp / e.maxHp <= en.below ? en.atk : 1) * (e.def.brandAtk && onBrand(e.x, e.y) ? e.def.brandAtk : 1) * (e.atkDownT > 0 ? 1 - e.atkDown : 1) * (e.markT > 0 && e.markBy ? 1 - e.markBy.tal.relay.atkDown : 1) * (e.unluckyT > 0 && luckOps().some((o) => eff(o).luckAtk) ? 1 - Math.max(...luckOps().map((o) => eff(o).luckAtk || 0)) : 1);
  }

  function updateEnemy(e, dt, healAura) {
    e.flash = Math.max(0, e.flash - dt);
    if (e.def.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.def.regen * healAura * dt);
    if (e.slowT > 0) e.slowT -= dt;
    if (e.analyzedT > 0) e.analyzedT -= dt;
    if (e.vulnT > 0) e.vulnT -= dt;
    if (e.atkDownT > 0) e.atkDownT -= dt;
    if (e.markT > 0) e.markT -= dt;
    if (e.bindT > 0) e.bindT -= dt;
    if (e.rushT > 0) e.rushT -= dt;
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
    if (!e.blockedBy && !(e.bindT > 0)) moveEnemy(e, dt);
    if (!e.alive) return;

    if (!e.def.atk) return;   // 훈련용 표적은 공격하지 않음
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
    // 불행의 연쇄: 공격 실패
    if (e.unluckyT > 0 && !(e.failCd > 0)) {
      const ul = luckOps()[0];
      if (ul && Math.random() < ul.tal.unluck.fail) { e.failCd = ul.tal.unluck.failCd; addText(e.x, e.y - 0.4, '실패', '#b48cff', 0.8, true); e.atkCd = e.def.interval; return; }
    }
    // 여러 명 동시 공격
    if (e.def.targets > 1) for (const op of inRange.filter((o) => o !== target).slice(0, e.def.targets - 1)) hitOp(op, enemyAtk(e), e.def.arts ? 'arts' : 'phys', e);
    const type = e.def.arts ? 'arts' : 'phys';
    if (e.def.range > 0 && !e.blockedBy) {
      addFx({ type: 'shot', x1: e.x, y1: e.y, x2: target.x + 0.5, y2: target.y + 0.5, life: type === 'arts' ? 0.3 : 0.2, color: type === 'arts' ? '#b36bff' : '#ff9a5c', arts: type === 'arts' });
    } else {
      addFx({ type: 'hit', style: 'slash', x: target.x + 0.5, y: target.y + 0.5, life: 0.18, color: '#ff5c5c', color2: '#fff', rot: -0.8 });
    }
    const atk = enemyAtk(e);
    if (e.def.aoe) {
      addFx({ type: 'ring', x: target.x + 0.5, y: target.y + 0.5, life: 0.35, color: e.def.arts ? '#aee3ff' : '#ff7a2f', r: e.def.aoe });
      for (const op of [...S.ops]) {
        if (op !== target && Math.hypot(op.x - target.x, op.y - target.y) <= e.def.aoe) hitOp(op, atk, type, e);
      }
    }
    hitOp(target, atk, type, e);
    e.atkCd = e.def.interval * (e.slowT > 0 ? e.slowAtk : 1) * (e.auraAtkI || 1) * (e.blockedBy && e.blockedBy.tal && e.blockedBy.tal.easygoing ? e.blockedBy.tal.easygoing.slow : 1);
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

    if (S.ext.practice) {
      // 훈련장: 코스트 무한, 적은 끝없이 반복
      S.dp = S.maxDp;
      if (S.autoWaves && !S.queue.length && !S.enemies.length) { S.queue = S.ext.waveSet.map((q) => ({ ...q, t: q.t + S.time + 2 })); S.total += S.queue.length; S.round = (S.round || 1) + 1; toast(`${S.round}번째 반복`); }
      return;
    }
    if (S.life <= 0) endBattle(false);
    else if (!S.queue.length && !S.enemies.length) endBattle(true);
  }

  // ---------- 훈련장: 적을 골라서 내보내기 ----------
  const TR_COUNTS = [1, 3, 5];
  function renderSpawner() {
    const esc = UI.esc;
    const el = $('#tr-panel'), list = Object.entries(ENEMIES).sort((a, b) => (a[1].boss ? 2 : a[1].elite ? 1 : 0) - (b[1].boss ? 2 : b[1].elite ? 1 : 0));
    el.innerHTML = `<div class="tr-head"><b>적 배출</b><button class="tr-x" data-tr="close" aria-label="닫기">✕</button></div>
      <div class="tr-opts">
        <button class="btn small ${S.autoWaves ? 'primary' : ''}" data-tr="auto">자동 반복 ${S.autoWaves ? '켜짐' : '꺼짐'}</button>
        <button class="btn small danger" data-tr="clear">모두 제거</button>
      </div>
      <div class="tr-opts"><span>출현 지점</span>${S.paths.map((_, i) => `<button class="btn small ${S.trSpawn === i ? 'primary' : ''}" data-trs="${i}">${i + 1}</button>`).join('')}
        <span>수량</span>${TR_COUNTS.map((n) => `<button class="btn small ${S.trCount === n ? 'primary' : ''}" data-trc="${n}">${n}</button>`).join('')}</div>
      <div class="tr-list">${list.map(([id, d]) => `<button class="tr-en ${d.boss ? 'boss' : d.elite ? 'elite' : ''}" data-tre="${id}" title="${esc(d.desc || '')}"><span class="tr-face" style="${faceStyle(d)}">${esc(faceText(d))}</span><b>${esc(d.name)}</b></button>`).join('')}</div>`;
  }
  $('#btn-spawner').addEventListener('click', () => {
    if (!S || !S.ext.practice) return;
    const el = $('#tr-panel');
    if (el.classList.toggle('hidden')) return;
    renderSpawner();
  });
  $('#tr-panel').addEventListener('click', (e) => {
    if (!S || !S.ext.practice) return;
    const t = e.target.closest('[data-tr],[data-trs],[data-trc],[data-tre]');
    if (!t) return;
    const d = t.dataset;
    if (d.tr === 'close') { $('#tr-panel').classList.add('hidden'); return; }
    if (d.tr === 'auto') {
      S.autoWaves = !S.autoWaves;
      if (!S.autoWaves) { S.total -= S.queue.length; S.queue = []; }
      toast(S.autoWaves ? '기본 적이 다시 반복해서 나옵니다' : '고른 적만 나옵니다');
    } else if (d.tr === 'clear') {
      for (const en of S.enemies) en.alive = false;
      S.total -= S.queue.length + S.enemies.length; S.queue = []; S.enemies = [];
      toast('필드의 적을 모두 지웠습니다');
    } else if (d.trs) S.trSpawn = +d.trs;
    else if (d.trc) S.trCount = +d.trc;
    else if (d.tre) {
      for (let i = 0; i < S.trCount; i++) S.queue.push({ t: S.time + 0.3 + i * 1.2, enemy: d.tre, spawn: S.trSpawn });
      S.queue.sort((a, b) => a.t - b.t);
      S.total += S.trCount;
      return;
    }
    renderSpawner();
  });

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
        if (after.length) UI.playDialog(after, () => UI.go('operations', 'after'), st);
        else UI.go('operations', 'after');
      });
    } else {
      add('다시 도전', 'primary', () => UI.startOperation(idx, true));
    }
    if (!ext) add('작전 목록', '', () => UI.go('operations', 'after'));
    setTimeout(() => { if (S === ended) $('#result').classList.remove('hidden'); }, 400);
  }

  function updateHud() {
    $('#dp-num').textContent = Math.floor(S.dp);
    $('#dp-fill').style.width = (S.dp >= S.maxDp ? 100 : (S.dp % 1) * 100) + '%';
    $('#deploy-left').textContent = S.deployLimit - deployedCount();
    $('#hud-enemy').textContent = `${S.killed + S.leaked}/${S.total}`;
    $('#hud-life').textContent = S.ext.practice ? '∞' : Math.max(0, S.life);
    updateCards();
    if (S.mode !== 'idle') refreshInspect(false);
    placeRing();
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
    // 빛나는 테두리: shadowBlur는 매 프레임 매우 느려서(특히 내장 그래픽) 굵은 반투명 선 + 가는 선으로 대신
    ctx.strokeStyle = color;
    const edges = () => {
      poly(quad(a, b, c, d, 0)); ctx.stroke();
      poly(quad(a, b, c, d, h)); ctx.stroke();
      ctx.beginPath();
      for (const [u, v] of [[a, b], [c, b], [c, d], [a, d]]) {
        const p0 = proj(u, v, 0), p1 = proj(u, v, h);
        ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
      }
      ctx.stroke();
    };
    ctx.globalAlpha = 0.25; ctx.lineWidth = Math.max(5, P.T * 0.11); edges();
    ctx.globalAlpha = 1; ctx.lineWidth = Math.max(1.5, P.T * 0.035); edges();
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
    const ic = def.icon && imgOf({ image: def.icon });
    if (ic) { const w = r * 1.5, h = (w * ic.naturalHeight) / ic.naturalWidth; ctx.drawImage(ic, X - w / 2, Y - h / 2, w, h); }
    else ctx.fillText(def.glyph || def.name[0], X, Y + r * 0.05);
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
      // 스킬 지속 중: 빛나는 발판 + 회전하는 점선 고리 + 떠오르는 빛
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(X, Y); ctx.scale(1, 0.38);
      const R = T * (0.5 + Math.sin(S.time * 6) * 0.03);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(0.5, op.def.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.55; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95; ctx.rotate(S.time * 1.5);
      ctx.setLineDash([R * 0.25, R * 0.12]);
      ctx.strokeStyle = '#ffcf3a'; ctx.lineWidth = Math.max(2, T * 0.05);
      ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      if (!S.paused && Math.random() < 0.18) rise(op.x + 0.5, op.y + 0.6, Math.random() < 0.5 ? op.def.color : '#ffe9a0', 1, 0.6);
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
    const spRatio = op.skillT > 0 ? (op.skillT === Infinity ? 1 : op.skillT / sk.duration) : !sk.sp ? 0 : sk.stock && op.sp < spCap(sk) ? (op.sp % sk.sp) / sk.sp : op.sp / sk.sp;
    bar(bx, by + Math.max(4, T * 0.075), bw, Math.max(2, T * 0.04), spRatio, op.skillT > 0 ? '#ffcf3a' : '#8fd14f');
    if (op.neural > 0) bar(bx, by + Math.max(7, T * 0.13), bw, Math.max(2, T * 0.035), op.neural / 1000, '#c77dff');
    // 해방자: 공격력 충전 게이지
    if (op.def.archetype === 'librator' && !(op.skillT > 0)) bar(bx, by + Math.max(7, T * 0.13), bw, Math.max(2, T * 0.035), (op.libT || 0) / 40, '#ffd86b');
    if (op.arts) {
      // 오늘의 변수: 지금 발현 중인 아츠
      const d = DAILY_ARTS[op.arts], tx2 = X, ty2 = op.rect[1] - T * 0.02;
      ctx.font = `900 ${Math.max(10, T * 0.15)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(d.name).width + T * 0.14;
      ctx.fillStyle = 'rgba(10,12,16,.8)'; ctx.fillRect(tx2 - w / 2, ty2 - T * 0.1, w, T * 0.2);
      ctx.fillStyle = d.color; ctx.fillText(d.name, tx2, ty2 + T * 0.005);
    }
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
      ctx.fillText(sk.stock && op.sp >= sk.sp * 2 ? String(Math.floor(op.sp / sk.sp)) : '!', bx2, by2 + T * 0.01);
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
    let headY = cy - r;
    if (im) {
      // 원작 도감 아이콘(투명 배경)을 그대로 세워서 그림. 발밑에 진영 색 고리
      ellipse(X, Y, r * 1.1, r * 0.42);
      ctx.lineWidth = Math.max(1.5, r * 0.09); ctx.strokeStyle = ring; ctx.stroke();
      // 전신 그림: 비율 유지, 발이 땅(발밑 고리)에 닿게, 진행 방향을 바라보게 좌우 반전
      const h = r * (e.def.boss ? 3.4 : 3), w = h * (im.naturalWidth / im.naturalHeight);
      const prevX = e.lastX ?? e.x; if (Math.abs(e.x - prevX) > 0.002) e.faceL = e.x < prevX; e.lastX = e.x;
      ctx.save();
      if (e.flash > 0) ctx.filter = 'brightness(2.2)';
      const top = isFly(e.def) ? cy - h * 0.55 : Y - h * 0.97;
      headY = top + h * 0.08;
      if (e.faceL) { ctx.translate(X, 0); ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, top, w, h); }
      else ctx.drawImage(im, X - w / 2, top, w, h);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(X, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#22090c'; ctx.fill();
      ctx.fillStyle = e.def.color;
      ctx.font = `900 ${r * 0.9}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.def.boss ? '王' : e.def.name.replace(/[「」]/g, '')[0], X, cy + r * 0.05);
      ctx.beginPath();
      ctx.arc(X, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.strokeStyle = ring; ctx.stroke();
    }
    const bw = T * (e.def.boss ? 0.8 : 0.5);
    bar(X - bw / 2, headY - T * 0.12, bw, Math.max(3, T * 0.05), e.hp / e.maxHp, e.revived ? '#aee3ff' : '#ff4d57');
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

  // 빛나는 점 (가산 혼합)
  function glow(X, Y, r, color, a = 1) {
    // 작은 파티클은 그라디언트 없이 두 겹 원으로 (그라디언트를 매 프레임 수백 개 만들면 느려짐)
    if (r < 7) {
      const ga = ctx.globalAlpha;
      ctx.fillStyle = color; ctx.globalAlpha = ga * 0.45; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.globalAlpha = ga * a; ctx.beginPath(); ctx.arc(X, Y, r * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = ga;
      return;
    }
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.25, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
  }
  // 파티클 모양 그리기
  function shapeAt(X, Y, r, shape, color, rot) {
    if (shape === 'circle' || !shape) { glow(X, Y, r, color); return; }
    ctx.save(); ctx.translate(X, Y); ctx.rotate(rot || 0);
    ctx.fillStyle = color; ctx.strokeStyle = color;
    if (shape === 'star') {
      glow(0, 0, r * 1.4, color, 0.6);
      ctx.fillStyle = '#ffffff'; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, q = i % 2 ? r * 0.4 : r; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
      ctx.fill();
    } else if (shape === 'card') {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-r * 0.7, -r, r * 1.4, r * 2);
      ctx.fillStyle = color; ctx.fillRect(-r * 0.5, -r * 0.8, r * 1.0, r * 1.6);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -r * 0.45); ctx.lineTo(r * 0.3, 0); ctx.lineTo(0, r * 0.45); ctx.lineTo(-r * 0.3, 0); ctx.fill();
    } else if (shape === 'bubble') {
      ctx.lineWidth = Math.max(1, r * 0.22); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, r * 0.25, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'feather') {
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.35, r * 1.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, r * 0.1); ctx.beginPath(); ctx.moveTo(0, -r * 1.1); ctx.lineTo(0, r * 1.1); ctx.stroke();
    } else if (shape === 'shard') {
      ctx.beginPath(); ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 0.45, 0); ctx.lineTo(0, r * 1.2); ctx.lineTo(-r * 0.45, 0); ctx.fill();
    } else if (shape === 'petal') {
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.5, r, 0.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'mist') {
      ctx.restore(); ctx.save();
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, r * 2.4);
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, r * 2.4, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'cross') {
      ctx.fillRect(-r * 0.25, -r, r * 0.5, r * 2); ctx.fillRect(-r, -r * 0.25, r * 2, r * 0.5);
    }
    ctx.restore();
  }
  const FISH = new Image(); FISH.src = 'img/fish.png';
  function drawFx(f) {
    const k = f.t / f.life;
    ctx.save();
    if (f.type === 'p') {
      // 파티클
      const t = f.t, x = f.x + f.vx * t, y = f.y + f.vy * t, h = f.h + f.vh * t - 0.9 * (f.g || 0) * t * t;
      const [X, Y, s] = proj(x, y, Math.max(0, h));
      ctx.globalCompositeOperation = f.shape && f.shape !== 'circle' && f.shape !== 'mist' ? 'source-over' : 'lighter';
      ctx.globalAlpha = (1 - k) * (f.a || 1);
      shapeAt(X, Y, P.T * s * (f.size || 0.06) * (1 - k * 0.4), f.shape, f.color, (f.spin || 0) * t + (f.rot0 || 0));
    } else if (f.type === 'shot') {
      // 투사체: 모양은 오퍼레이터마다 다름
      const st = f.style || 'tracer', lob = st === 'perfume';
      const hitAt = lob ? 0.7 : 0.55, m = Math.min(1, k / hitAt);
      const [x1, y1, s] = proj(f.x1, f.y1, 0.5), [x2, y2] = proj(f.x2, f.y2, 0.35);
      const arc = lob ? Math.sin(m * Math.PI) * P.T * s * 1.1 : 0;
      const hx = x1 + (x2 - x1) * m, hy = y1 + (y2 - y1) * m - arc;
      const tail = Math.max(0, m - (st === 'tracer' ? 0.5 : 0.3)), tx = x1 + (x2 - x1) * tail, ty = y1 + (y2 - y1) * tail - (lob ? Math.sin(tail * Math.PI) * P.T * s * 1.1 : 0);
      const big = f.big ? 1.5 : 1, T = P.T * s;
      ctx.globalCompositeOperation = 'lighter';
      if (k < hitAt) {
        if (st !== 'perfume' && st !== 'card' && st !== 'fish' && st !== 'bubble') {
          const g = ctx.createLinearGradient(tx, ty, hx, hy);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, f.color);
          ctx.strokeStyle = g; ctx.lineCap = 'round';
          ctx.lineWidth = T * ({ tracer: 0.03, star: 0.05, orb: 0.09, glyph: 0.06, lance: 0.07, blue: 0.16 }[st] || 0.05) * big;
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        }
        const ang = Math.atan2(y2 - y1, x2 - x1);
        if (st === 'tracer') { glow(hx, hy, T * 0.08 * big, f.color); }
        else if (st === 'star') { ctx.globalCompositeOperation = 'source-over'; shapeAt(hx, hy, T * 0.13 * big, 'star', f.color, k * 12); if (Math.random() < 0.6) sparks(f.x1 + (f.x2 - f.x1) * m, f.y1 + (f.y2 - f.y1) * m, f.color2 || '#fff', 1, { speed: 0.2, size: 0.03, h: 0.45, up: 0.1, shape: 'star' }); }
        else if (st === 'orb') { glow(hx, hy, T * 0.2 * big, f.color); }
        else if (st === 'glyph') { glow(hx, hy, T * 0.16 * big, f.color); ctx.save(); ctx.translate(hx, hy); ctx.rotate(k * 10); ctx.strokeStyle = f.color2 || '#fff'; ctx.lineWidth = Math.max(1, T * 0.02); ctx.strokeRect(-T * 0.08, -T * 0.08, T * 0.16, T * 0.16); ctx.restore(); }
        else if (st === 'lance') { ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang); const g = ctx.createLinearGradient(-T * 0.5, 0, T * 0.1, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#fff'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(T * 0.12, 0); ctx.lineTo(-T * 0.5, -T * 0.05); ctx.lineTo(-T * 0.5, T * 0.05); ctx.fill(); ctx.restore(); glow(hx, hy, T * 0.14 * big, f.color); }
        else if (st === 'blue') { glow(hx, hy, T * 0.3 * big, f.color); glow(hx, hy, T * 0.14 * big, '#ffffff'); }
        else if (st === 'card') { ctx.globalCompositeOperation = 'source-over'; shapeAt(hx, hy, T * 0.12 * big, 'card', Math.floor(k * 20) % 2 ? f.color : f.color2, k * 25); }
        else if (st === 'bubble') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9; shapeAt(hx, hy, T * 0.12 * big, 'bubble', f.color, 0); }
        else if (st === 'fish') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.translate(hx, hy); if (x2 < x1) ctx.scale(-1, 1);
          ctx.beginPath(); ctx.arc(0, 0, T * 0.15 * big, 0, Math.PI * 2); ctx.fillStyle = f.color; ctx.fill();
          if (FISH.complete && FISH.naturalWidth) { const w = T * 0.25 * big, hh = (w * FISH.naturalHeight) / FISH.naturalWidth; ctx.drawImage(FISH, -w / 2, -hh / 2, w, hh); }
          ctx.restore();
        } else if (st === 'perfume') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.translate(hx, hy); ctx.rotate(k * 9); ctx.scale(1.4, 1.4);
          ctx.fillStyle = 'rgba(230,210,255,.95)'; ctx.fillRect(-T * 0.05, -T * 0.06, T * 0.1, T * 0.12);
          ctx.fillStyle = f.color; ctx.fillRect(-T * 0.04, -T * 0.01, T * 0.08, T * 0.06);
          ctx.fillStyle = '#d9c070'; ctx.fillRect(-T * 0.025, -T * 0.1, T * 0.05, T * 0.04);
          ctx.restore();
        }
        if (f.muzzle && k < 0.15) glow(x1, y1, T * 0.22, f.color2 || '#fff');
      }
      if (k >= hitAt) {
        const q = (k - hitAt) / (1 - hitAt);
        ctx.globalAlpha = 1 - q;
        if (!f.burst) {
          f.burst = true;
          const sh = { star: 'star', card: 'card', bubble: 'bubble', perfume: 'mist', glyph: 'shard', lance: 'feather', fish: 'bubble' }[st] || 'circle';
          if (st === 'perfume') { sparks(f.x2, f.y2, f.color, 5, { speed: 0.5, size: 0.12, h: 0.15, up: 0.2, g: 0, shape: 'mist', life: 0.9 }); sparks(f.x2, f.y2, '#e8d8ff', 3, { speed: 1.2, size: 0.03, h: 0.3, shape: 'shard' }); }
          else if (st === 'blue') { addFx({ type: 'ring', x: f.x2, y: f.y2, life: 0.4, color: f.color, r: f.big ? 1 : 0.6 }); sparks(f.x2, f.y2, f.color2, 8, { speed: 1.8, size: 0.05, h: 0.35 }); }
          else sparks(f.x2, f.y2, f.color, f.arts ? 6 : 4, { speed: 1.3, size: sh === 'circle' ? 0.045 : 0.035, h: 0.35, shape: sh });
        }
        if (st !== 'perfume') glow(x2, y2, T * (0.16 + q * 0.22) * big * (st === 'blue' ? 1.8 : 1), f.color, 0.9);
      }
    } else if (f.type === 'hit') {
      // 근접 타격: 오퍼레이터마다 모양이 다름
      const [X, Y, s] = proj(f.x, f.y, 0.35), T = P.T * s, big = f.big ? 1.45 : 1, st = f.style || 'slash';
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const fade = 1 - k * k;
      const stroke = (w, c, al, fn) => { ctx.globalAlpha = fade * al; ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.5, T * w * (1 - k * 0.5)); ctx.beginPath(); fn(); ctx.stroke(); };
      if (st === 'slash' || st === 'dagger') {
        const R = T * 0.34 * big, a0 = (f.rot ?? -2.4) + k * 1.8;
        const arcs = st === 'dagger' ? [[0, 1.2], [0.6, 1.1]] : [[0, 1.7]];
        for (const [off, len] of arcs) {
          const a = a0 + off * 1.6;
          for (const [w, c, al] of [[0.3, f.color, 0.25], [0.11, f.color, 1], [0.035, '#ffffff', 1]]) stroke(w, c, al, () => ctx.arc(X, Y, R * (1 - off * 0.2), a, a + len));
        }
      } else if (st === 'iai') {
        // 발도: 대상을 가로지르는 긴 일직선 + 늦게 번지는 붉은 잔상
        const L = T * 0.9 * big, a = f.rot ?? -0.35, dx = Math.cos(a) * L, dy = Math.sin(a) * L, m = Math.min(1, k * 4);
        for (const [w, c, al] of [[0.22, f.color, 0.3], [0.06, f.color, 1], [0.02, '#ffffff', 1]]) stroke(w, c, al, () => { ctx.moveTo(X - dx, Y - dy); ctx.lineTo(X - dx + dx * 2 * m, Y - dy + dy * 2 * m); });
        if (k > 0.35) stroke(0.05, f.color2, 0.8 * (1 - k), () => { ctx.moveTo(X - dx * 0.8, Y - dy * 0.8 + T * 0.04); ctx.lineTo(X + dx * 0.8, Y + dy * 0.8 + T * 0.04); });
      } else if (st === 'punch') {
        // 주먹: 별 모양 충격 + 짧은 충격파
        const R = T * (0.18 + k * 0.25) * big;
        ctx.globalAlpha = fade; ctx.fillStyle = f.color;
        ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + (f.rot || 0), q = i % 2 ? R * 0.45 : R; ctx.lineTo(X + Math.cos(a) * q, Y + Math.sin(a) * q * 0.8); } ctx.fill();
        glow(X, Y, R * 0.8, '#ffffff', fade);
        stroke(0.04, f.color2, 0.9, () => ctx.ellipse(X, Y, R * 1.5, R * 0.7, 0, 0, Math.PI * 2));
      } else if (st === 'claw') {
        for (let i = -1; i <= 1; i++) stroke(0.05, f.color, 1, () => { ctx.moveTo(X - T * 0.25 + i * T * 0.08, Y - T * 0.3); ctx.lineTo(X + T * 0.2 + i * T * 0.08, Y + T * 0.25); });
      } else if (st === 'bash') {
        // 방패·진압봉: 넓은 호 + 둔탁한 섬광
        const R = T * 0.42 * big, a0 = -2.9 + k * 0.8;
        for (const [w, c, al] of [[0.4, f.color, 0.2], [0.14, f.color, 0.9], [0.04, '#ffffff', 1]]) stroke(w, c, al, () => ctx.arc(X, Y, R, a0, a0 + 1.3));
        glow(X, Y, T * 0.3 * (1 - k), f.color2, 0.8 * fade);
      }
      if (!f.burst) { f.burst = true; sparks(f.x, f.y, f.color, st === 'punch' ? 5 : 3, { speed: 1.3, size: 0.04, h: 0.35, shape: st === 'iai' ? 'petal' : 'circle' }); }
    } else if (f.type === 'beam') {
      // 치료 광선: 부드러운 빛 + 흐르는 빛 알갱이
      const [x1, y1, s] = proj(f.x1, f.y1, 0.5), [x2, y2] = proj(f.x2, f.y2, 0.45);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = f.color; ctx.lineWidth = P.T * s * 0.14; ctx.globalAlpha = (1 - k) * 0.25;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = P.T * s * 0.025;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      for (let i = 0; i < 3; i++) { const m = (k * 1.8 + i / 3) % 1; glow(x1 + (x2 - x1) * m, y1 + (y2 - y1) * m, P.T * s * 0.08, f.color); }
      glow(x2, y2, P.T * s * 0.3 * (1 - k * 0.5), f.color, 0.7);
    } else if (f.type === 'ring') {
      // 충격파: 안쪽 빛 + 선명한 고리 두 겹
      const [X, Y, s] = proj(f.x, f.y, 0.02);
      const r = P.T * (f.r || 0.5) * (0.35 + Math.sqrt(k) * 0.85) * s;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - k) * 0.55;
      ctx.save(); ctx.translate(X, Y); ctx.scale(1, 0.42);
      const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, f.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = (1 - k) * 0.3;
      ellipse(X, Y, r, r * 0.42);
      ctx.strokeStyle = f.color; ctx.lineWidth = Math.max(4, P.T * 0.16 * s * (1 - k)); ctx.stroke();
      ctx.globalAlpha = 1 - k;
      ellipse(X, Y, r, r * 0.42);
      ctx.strokeStyle = f.color; ctx.lineWidth = Math.max(2, P.T * 0.06 * s * (1 - k)); ctx.stroke();
      ellipse(X, Y, r * 0.7, r * 0.7 * 0.42);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, P.T * 0.02 * s); ctx.stroke();
    } else if (f.type === 'cast') {
      // 스킬 발동: 빛기둥 + 회전하는 마법진
      const [X, Y, s] = proj(f.x, f.y, f.h || 0);
      const T = P.T * s, fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade;
      const pw = T * 0.5 * (1 - k * 0.6), ph = T * 3.2;
      const g = ctx.createLinearGradient(0, Y - ph, 0, Y);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, f.color); g.addColorStop(1, '#ffffff');
      ctx.fillStyle = g;
      ctx.fillRect(X - pw / 2, Y - ph, pw, ph);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillRect(X - pw * 0.12, Y - ph * 0.9, pw * 0.24, ph * 0.9);
      ctx.save(); ctx.translate(X, Y); ctx.scale(1, 0.42); ctx.rotate(k * 2.4);
      const R = T * (0.55 + k * 0.25);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = Math.max(4, T * 0.12); ctx.globalAlpha = fade * 0.3;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = Math.max(1.5, T * 0.035); ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, R * 0.78, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const b = a + (Math.PI * 2 * 2) / 6; ctx.moveTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78); ctx.lineTo(Math.cos(b) * R * 0.78, Math.sin(b) * R * 0.78); }
      ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.89, Math.sin(a) * R * 0.89, T * 0.025, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
      ctx.restore();
    } else if (f.type === 'text') {
      const [X, Y, s] = proj(f.x, f.y, 0.9);
      const T = P.T * s;
      ctx.globalAlpha = 1 - k * k;
      const pop = f.big ? 1 + Math.max(0, 0.25 - f.t) * 1.6 : 1;
      ctx.font = `${f.big ? 700 : 900} ${Math.max(11, T * (f.big ? 0.24 : 0.22) * pop)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      const y = Y - (1 - (1 - k) * (1 - k)) * 0.4 * T;
      ctx.strokeText(f.text, X, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, X, y);
    }
    ctx.restore();
  }
  // 오퍼레이터 이펙트 설정 (data.js의 OP_VFX, 없으면 직군 기본값)
  function vfxOf(def) {
    const v = (typeof OP_VFX !== 'undefined' && (OP_VFX[def.id] || (def.icon && OP_VFX.cf_buoy))) || null;
    if (v) return v;
    const c = def.class;
    if (c === 'medic') return { heal: '#7dff9a', color: '#7dff9a', cast: 'feather' };
    if (c === 'caster' || c === 'supporter') return { shot: 'orb', color: '#b47bff', color2: '#fff', cast: 'circle' };
    if (c === 'sniper') return { shot: 'tracer', color: '#fff2b3', color2: '#fff', cast: 'star' };
    return { hit: 'slash', color: def.color, color2: '#fff', cast: 'circle' };
  }
  // 공격 이펙트 (투사체 또는 근접 타격)
  function attackFx(op, t, i, type, strong, cx, cy) {
    const v = vfxOf(op.def), melee = !v.shot && (isGround(op.def) || v.hit);
    if (melee) {
      const st = v.hit || 'slash';
      addFx({ type: 'hit', style: st, x: t.x, y: t.y, life: strong ? 0.3 : 0.22, color: strong ? '#ffcf3a' : v.color, color2: v.color2, big: strong, rot: st === 'iai' ? -0.35 + (Math.random() - 0.5) * 0.5 : -2.4 + (Math.random() - 0.5) * 1.2 + i * 0.9 });
    } else {
      const st = v.shot || (type === 'arts' ? 'orb' : 'tracer');
      const life = { perfume: 0.5, blue: 0.3, orb: 0.32, glyph: 0.3, bubble: 0.34, fish: 0.34, card: 0.28 }[st] || 0.22;
      addFx({ type: 'shot', style: st, x1: cx, y1: cy, x2: t.x + (i ? (Math.random() - 0.5) * 0.2 : 0), y2: t.y, life, color: strong && st === 'tracer' ? '#ffd86b' : v.color, color2: v.color2, arts: type === 'arts', big: strong, muzzle: v.muzzle });
    }
  }
  // 스킬 발동 연출: 빛기둥·마법진 + 오퍼레이터 고유 파티클
  function castFx(op) {
    const v = vfxOf(op.def), x = op.x + 0.5, y = op.y + 0.55;
    addFx({ type: 'cast', x, y: op.y + 0.58, h: tileH(op.x, op.y), life: 0.9, color: v.color || op.def.color });
    let shape = v.cast || 'circle', c1 = v.color || op.def.color, c2 = v.color2 || '#ffe9a0';
    if (shape === 'daily') {
      const a = op.arts || 'wind';
      shape = a === 'sun' ? 'circle' : a === 'gravity' ? 'shard' : 'petal';
      c1 = a === 'sun' ? '#ffd86b' : a === 'gravity' ? '#a07bff' : '#9fffd0';
    }
    if (shape === 'star') {
      // 별이 쏟아짐
      for (let i = 0; i < 14; i++) S.effects.push({ type: 'p', t: 0, life: 0.8 + Math.random() * 0.4, x: x + (Math.random() - 0.5) * 1.4, y: y + (Math.random() - 0.5) * 0.8, h: 1.6 + Math.random() * 0.6, vx: 0, vy: 0, vh: -1.6, g: 0, color: Math.random() < 0.5 ? c1 : c2, size: 0.05 + Math.random() * 0.04, shape: 'star', spin: 6 });
    } else if (shape === 'card') {
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; S.effects.push({ type: 'p', t: 0, life: 0.9, x, y, h: 0.5, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 0.8, vh: 0.6, g: 0.4, color: i % 2 ? c1 : c2, size: 0.07, shape: 'card', spin: 8, rot0: a }); }
    } else if (shape === 'mist') {
      sparks(x, y, c1, 8, { speed: 0.6, size: 0.14, h: 0.2, up: 0.3, g: 0, shape: 'mist', life: 1.1 });
      rise(x, y, c2, 8, 0.6, 'circle');
    } else {
      rise(x, y, c1, 10, 0.6, shape);
      rise(x, y, c2, 6, 0.5, shape === 'bubble' ? 'bubble' : 'circle');
    }
  }
  // 불꽃 파티클 뿌리기 (타일 좌표)
  function sparks(x, y, color, n, o = {}) {
    if (S.effects.length > 260) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (o.speed || 1) * (0.4 + Math.random() * 0.8);
      S.effects.push({ type: 'p', t: 0, life: (o.life || 0.45) * (0.6 + Math.random() * 0.6), x, y, h: o.h ?? 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vh: (o.up ?? 0.8) * (0.5 + Math.random()), g: o.g ?? 1.2, color, size: (o.size || 0.05) * (0.7 + Math.random() * 0.6), shape: o.shape, spin: (Math.random() - 0.5) * 10 });
    }
  }
  // 위로 떠오르는 빛 알갱이
  function rise(x, y, color, n, spread = 0.35, shape) {
    if (S.effects.length > 260) return;
    for (let i = 0; i < n; i++) S.effects.push({ type: 'p', t: 0, life: 0.7 + Math.random() * 0.6, x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread * 0.6, h: Math.random() * 0.2, vx: 0, vy: 0, vh: 0.8 + Math.random() * 0.8, g: 0, color, size: (shape && shape !== 'circle' ? 0.05 : 0.035) + Math.random() * 0.03, a: 0.9, shape, spin: (Math.random() - 0.5) * 4 });
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
    // 비행 적 경로 (그 침입 지점에서 비행 적이 나오는 작전만). 원거리 오퍼레이터를 배치할 때 더 진하게
    if (S.flySpawns.size) {
      const hi = (S.mode === 'placing' || S.mode === 'direction') && S.sel && !isGround(S.sel.def);
      ctx.strokeStyle = hi ? 'rgba(93,173,226,.95)' : 'rgba(93,173,226,.5)';
      ctx.lineWidth = Math.max(2, P.T * (hi ? 0.055 : 0.035));
      ctx.setLineDash([P.T * 0.06, P.T * 0.1]);
      S.flyPaths.forEach((path, i) => {
        if (!S.flySpawns.has(i) || !path) return;
        ctx.beginPath();
        path.forEach((p, k) => { const [X, Y] = proj(p.x, p.y, 0.02); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
        ctx.stroke();
        // 진행 방향 화살표
        const a0 = path[path.length - 2] || path[0], a1 = path[path.length - 1];
        const [x0, y0] = proj(a0.x, a0.y, 0.02), [x1, y1] = proj(a1.x, a1.y, 0.02), ang = Math.atan2(y1 - y0, x1 - x0), L = P.T * 0.22;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - L * Math.cos(ang - 0.5), y1 - L * Math.sin(ang - 0.5)); ctx.moveTo(x1, y1); ctx.lineTo(x1 - L * Math.cos(ang + 0.5), y1 - L * Math.sin(ang + 0.5)); ctx.stroke();
        ctx.setLineDash([P.T * 0.06, P.T * 0.1]);
      });
    }
    ctx.setLineDash([]);
    drawGates();
    // 잔향 지대
    for (const z of S.zones || []) {
      const [X, Y, sc] = proj(z.x, z.y, 0.02);
      ctx.globalAlpha = Math.min(1, z.t / 0.6) * 0.5;
      ellipse(X, Y, P.T * sc * z.r, P.T * sc * z.r * 0.5);
      ctx.fillStyle = z.dps ? 'rgba(160,110,255,.55)' : 'rgba(160,110,255,.3)'; ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 축원 부적 · 진법 영역 (오방색 문양)
    if (S.charms && S.charms.size) {
      for (const c of S.charms.values()) {
        const h = tileH(c.x, c.y);
        poly(quad(c.x + 0.08, c.y + 0.08, c.x + 0.92, c.y + 0.92, h + 0.006));
        if (c.field) {
          ctx.fillStyle = `rgba(220,60,40,${0.26 + Math.sin(S.time * 3 + c.x + c.y) * 0.06})`; ctx.fill();
          ctx.strokeStyle = 'rgba(255,207,58,.85)'; ctx.lineWidth = Math.max(1.5, P.T * 0.03); ctx.stroke();
          poly(quad(c.x + 0.3, c.y + 0.3, c.x + 0.7, c.y + 0.7, h + 0.007));
          ctx.strokeStyle = 'rgba(80,160,255,.7)'; ctx.lineWidth = Math.max(1, P.T * 0.02); ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(255,220,140,${0.08 + c.n * 0.06})`; ctx.fill();
        }
        // 떠 있는 종이 부적
        for (let i = 0; i < (c.field ? 3 : c.n); i++) {
          const [X, Y, sc] = proj(c.x + 0.3 + i * 0.2, c.y + 0.5, h + 0.25 + Math.sin(S.time * 2 + i + c.x) * 0.05);
          const w = P.T * sc * 0.09, hh = P.T * sc * 0.2;
          ctx.fillStyle = '#f4e3b0'; ctx.fillRect(X - w / 2, Y - hh, w, hh);
          ctx.fillStyle = '#c0302a'; ctx.fillRect(X - w * 0.25, Y - hh * 0.85, w * 0.5, hh * 0.6);
        }
      }
    }

    if (S.mode === 'placing') {
      const valid = [];
      for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) if (canPlace(S.sel.def, x, y)) valid.push([x, y]);
      fillTiles(valid, 'rgba(76,217,100,.28)', 'rgba(120,255,140,.75)');
    } else if (S.mode === 'direction') {
      fillTiles(computeRange(S.sel.def.range, S.dir, S.tile.x, S.tile.y).list, 'rgba(255,150,40,.35)', 'rgba(255,170,60,.9)');
    } else if (S.mode === 'inspect' && S.inspect) {
      fillTiles(S.inspect.rangeList, 'rgba(255,150,40,.3)', 'rgba(255,170,60,.8)');
    }
    for (const op of S.ops) if (op.alive && op.flashUntil > S.time && op !== S.inspect) {
      const a = Math.min(1, (op.flashUntil - S.time) / 0.5);
      fillTiles(op.flashTiles, `rgba(255,214,90,${0.28 * a})`, `rgba(255,225,120,${0.85 * a})`);
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
  window.__game = { get state() { return S; }, beginBattle, addFx: (f) => addFx(f), sparks: (...a) => sparks(...a), rise: (...a) => rise(...a), proj: (u, v, h) => proj(u, v, h), deploy: (id, x, y, dir) => {
    const r = S.roster.find((q) => q.def.id === id);
    if (r) deploy(r, x, y, dir || 'right');
  } };
})();
