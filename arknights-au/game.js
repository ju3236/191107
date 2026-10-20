'use strict';
// =====================================================================
//  잿빛 등대 — 게임 엔진 (데이터는 data.js)
// =====================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const canvas = $('#board');
  const ctx = canvas.getContext('2d');

  const OPS_BY_ID = Object.fromEntries(OPERATORS.map((o) => [o.id, o]));
  const DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  const SLOW = 0.15;        // 배치/조작 중 시간 배속
  const MAX_DP = 99;

  // ---------- 이미지 (선택) ----------
  const IMG = {};
  for (const o of OPERATORS) {
    if (!o.image) continue;
    const im = new Image();
    im.src = o.image;
    IMG[o.id] = im;
  }
  const imgReady = (id) => IMG[id] && IMG[id].complete && IMG[id].naturalWidth > 0;
  function faceStyle(def) {
    return def.image ? `background-color:${def.color};background-image:url('${def.image}')` : `background-color:${def.color}`;
  }
  const faceText = (def) => (def.image ? '' : def.name[0]);

  let S = null; // 전투 상태
  const starText = (n) => '◆'.repeat(n) + '◇'.repeat(3 - n);

  const key = (x, y) => x + ',' + y;
  const walkable = (ch) => ch === '.' || ch === 'R' || ch === 'B';

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

  function beginBattle(idx, squadIds) {
    const st = STAGES[idx];
    const map = st.map.map((r) => r.split(''));
    const spawns = [];
    map.forEach((row, y) => row.forEach((ch, x) => { if (ch === 'R') spawns.push({ x, y }); }));
    const paths = spawns.map((sp) => buildPath(map, sp));
    const queue = [];
    for (const w of st.waves) {
      for (let i = 0; i < (w.count || 1); i++) queue.push({ t: w.t + i * (w.gap || 2), enemy: w.enemy, spawn: w.spawn || 0 });
    }
    queue.sort((a, b) => a.t - b.t);
    squadIds = squadIds || UI.save.squad;
    const squad = squadIds.map((id) => OPS_BY_ID[id]).filter(Boolean);

    UI.go('battle');
    S = {
      idx, st, squadIds, map, rows: map.length, cols: map[0].length, paths, queue,
      total: queue.length, killed: 0, leaked: 0, time: 0,
      dp: st.startDp ?? 10, life: st.life ?? 3, maxLife: st.life ?? 3, deployLimit: st.deployLimit ?? 8,
      ops: [], enemies: [], effects: [],
      roster: squad.map((def) => ({ def, cd: 0, deployed: false })),
      speed: 1, paused: false, ended: false,
      mode: 'idle', sel: null, tile: null, dir: 'right', press: null, inspect: null,
      shake: 0, T: 40, dpr: 1,
    };
    $('#hud-stage').textContent = `${st.code} ${st.name}`;
    $('#btn-speed').textContent = '1x';
    ['#result', '#pause', '#inspect', '#hint', '#toast'].forEach((s) => $(s).classList.add('hidden'));
    buildCards();
    resize();
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
      c.innerHTML = `<span class="card-face" style="${r.def.image ? `background-image:url('${r.def.image}')` : ''}">${faceText(r.def)}</span>
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
      r.el.classList.toggle('hidden', r.deployed);
      r.el.classList.toggle('cooling', r.cd > 0);
      r.el.classList.toggle('poor', S.dp < r.def.cost);
      r.el.classList.toggle('selected', S.sel === r && (S.mode === 'placing' || S.mode === 'direction'));
      if (r.cd > 0) r.cdEl.textContent = Math.ceil(r.cd);
    }
  }
  function onCard(r) {
    if (!S || S.ended) return;
    if (S.sel === r && S.mode !== 'idle' && S.mode !== 'inspect') { setMode('idle'); return; }
    if (r.deployed) return;
    if (r.cd > 0) { toast('재배치 대기 중입니다'); return; }
    if (S.dp < r.def.cost) { toast('배치 코스트가 부족합니다'); return; }
    if (S.ops.length >= S.deployLimit) { toast('배치 가능 인원을 초과했습니다'); return; }
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
  function toTile(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * S.cols, y: ((e.clientY - r.top) / r.height) * S.rows };
  }
  const opAt = (tx, ty) => S.ops.find((o) => o.x === tx && o.y === ty);
  function canPlace(def, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= S.cols || ty >= S.rows) return false;
    const ch = S.map[ty][tx];
    const need = CLASSES[def.class].tile === 'ground' ? '.' : '^';
    return ch === need && !opAt(tx, ty);
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
      pickDir(p);
      return;
    }
    const op = opAt(tx, ty);
    if (op) { S.inspect = op; setMode('inspect'); refreshInspect(true); }
    else if (S.mode === 'inspect') setMode('idle');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!S || S.mode !== 'direction') return;
    pickDir(toTile(e));
  });
  window.addEventListener('pointerup', (e) => {
    if (!S || S.mode !== 'direction' || !S.press) return;
    const p = toTile(e);
    const far = Math.hypot(p.x - (S.tile.x + 0.5), p.y - (S.tile.y + 0.5)) > 0.55;
    const from = S.press;
    S.press = null;
    if (far) { pickDir(p); deploy(S.sel, S.tile.x, S.tile.y, S.dir); }
    else if (from === 'inDirection') setMode('idle');
  });
  window.addEventListener('keydown', (e) => {
    if (!S || S.ended) return;
    if (e.key === 'Escape') setMode('idle');
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
  });

  $('#btn-speed').addEventListener('click', () => {
    if (!S) return;
    S.speed = S.speed === 1 ? 2 : 1;
    $('#btn-speed').textContent = S.speed + 'x';
  });
  function togglePause(force) {
    if (!S || S.ended) return;
    S.paused = force ?? !S.paused;
    $('#pause').classList.toggle('hidden', !S.paused);
  }
  $('#btn-pause').addEventListener('click', () => togglePause());
  $('#pause-resume').addEventListener('click', () => togglePause(false));
  $('#pause-retry').addEventListener('click', () => beginBattle(S.idx, S.squadIds));
  $('#pause-quit').addEventListener('click', () => { $('#pause').classList.add('hidden'); UI.go('operations'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });

  $('#ins-skill').addEventListener('click', () => { if (S && S.inspect) { activateSkill(S.inspect); refreshInspect(true); } });
  $('#ins-retreat').addEventListener('click', () => { if (S && S.inspect) { retreat(S.inspect); setMode('idle'); } });

  function refreshInspect(full) {
    const op = S.inspect;
    if (!op) return;
    const d = op.def, sk = d.skill;
    if (full) {
      const face = $('#ins-face');
      face.className = 'face ins-face';
      face.style.cssText = faceStyle(d);
      face.textContent = faceText(d);
      $('#ins-name').textContent = d.name;
      $('#ins-class').textContent = `${CLASSES[d.class].name} · 저지 ${d.block}`;
      $('#ins-skill-name').textContent = sk.name + (sk.trigger === 'auto' ? ' (자동)' : '');
      $('#ins-skill-desc').textContent = sk.desc;
    }
    $('#ins-stats').innerHTML = `<span>체력 <b>${Math.ceil(op.hp)}/${op.maxHp}</b></span><span>${d.class === 'medic' ? '치유' : '공격'} <b>${Math.round(opAtk(op))}</b></span>
      <span>방어 <b>${Math.round(opDef(op))}</b></span><span>저항 <b>${d.res || 0}</b></span>`;
    const fill = $('#ins-sp-fill');
    if (op.skillT > 0) {
      fill.style.width = (op.skillT / sk.duration) * 100 + '%';
      fill.classList.add('active');
      $('#ins-sp-text').textContent = `발동 중 ${op.skillT.toFixed(1)}s`;
    } else {
      fill.style.width = Math.min(1, op.sp / sk.sp) * 100 + '%';
      fill.classList.remove('active');
      $('#ins-sp-text').textContent = `SP ${Math.floor(op.sp)}/${sk.sp}`;
    }
    $('#ins-skill').disabled = !(sk.trigger === 'manual' && op.skillT <= 0 && op.sp >= sk.sp);
    $('#ins-skill').textContent = sk.trigger === 'auto' ? '자동 발동' : '스킬 발동';
  }

  // =====================================================================
  //  오퍼레이터
  // =====================================================================
  const eff = (op) => (op.skillT > 0 ? op.def.skill.effect || {} : {});
  const opAtk = (op) => op.def.atk * (eff(op).atk || 1);
  const opDef = (op) => op.def.def * (eff(op).def || 1);
  const opInterval = (op) => op.def.interval * (eff(op).interval || 1);
  const isGround = (def) => CLASSES[def.class].tile === 'ground';

  function deploy(r, tx, ty, dir) {
    if (S.dp < r.def.cost) { toast('배치 코스트가 부족합니다'); setMode('idle'); return; }
    if (S.ops.length >= S.deployLimit) { toast('배치 가능 인원을 초과했습니다'); setMode('idle'); return; }
    const def = r.def;
    S.dp -= def.cost;
    const rg = computeRange(def.range, dir, tx, ty);
    const op = {
      def, roster: r, x: tx, y: ty, dir, hp: def.hp, maxHp: def.hp, atkCd: 0.3,
      sp: def.skill.initSp || 0, skillT: 0, blocked: [], alive: true, flash: 0,
      range: rg.set, rangeList: rg.list, born: S.time,
    };
    S.ops.push(op);
    r.deployed = true;
    addFx({ type: 'ring', x: tx + 0.5, y: ty + 0.5, life: 0.4, color: def.color });
    addText(tx + 0.5, ty - 0.1, def.quote, def.color, 1.6, true);
    setMode('idle');
  }

  function removeOp(op, died) {
    op.alive = false;
    for (const e of op.blocked) if (e.blockedBy === op) e.blockedBy = null;
    op.blocked = [];
    S.ops = S.ops.filter((o) => o !== op);
    op.roster.deployed = false;
    op.roster.cd = op.def.redeploy;
    if (S.inspect === op) setMode('idle');
    if (died) addText(op.x + 0.5, op.y + 0.2, '전투 불능', '#ff6b6e', 1.2, true);
  }
  function retreat(op) {
    S.dp = Math.min(MAX_DP, S.dp + Math.floor(op.def.cost / 2));
    addText(op.x + 0.5, op.y + 0.2, '철수', '#9aa1ab', 0.8, true);
    removeOp(op, false);
  }

  function activateSkill(op) {
    const sk = op.def.skill, ef = sk.effect || {};
    if (op.skillT > 0 || op.sp < sk.sp) return;
    if (ef.dp) S.dp = Math.min(MAX_DP, S.dp + ef.dp);
    if (ef.heal) healOp(op, op.maxHp * ef.heal);
    op.sp = 0;
    op.skillT = sk.duration || 0;
    addFx({ type: 'ring', x: op.x + 0.5, y: op.y + 0.5, life: 0.5, color: '#ffcf3a' });
    addText(op.x + 0.5, op.y - 0.1, sk.name, '#ffcf3a', 1.2, true);
  }

  function healOp(op, amt) {
    const before = op.hp;
    op.hp = Math.min(op.maxHp, op.hp + amt);
    if (op.hp > before) addText(op.x + 0.5, op.y + 0.3, '+' + Math.round(op.hp - before), '#7dff9a', 0.7);
  }

  function remaining(e) {
    const p = e.path[e.pi];
    return p ? Math.hypot(p.x - e.x, p.y - e.y) + p.rem : 0;
  }

  function pickTargets(op, n) {
    const ground = isGround(op.def);
    const sniper = op.def.class === 'sniper';
    const list = S.enemies.filter((e) => e.alive && (e.blockedBy === op ||
      (op.range.has(key(Math.floor(e.x), Math.floor(e.y))) && !(ground && e.def.flying))));
    list.sort((a, b) =>
      (b.blockedBy === op) - (a.blockedBy === op) ||
      (sniper ? (!!b.def.flying) - (!!a.def.flying) : 0) ||
      remaining(a) - remaining(b));
    return list.slice(0, n);
  }

  function updateOp(op, dt) {
    const sk = op.def.skill;
    op.flash = Math.max(0, op.flash - dt);
    op.blocked = op.blocked.filter((e) => e.alive && e.blockedBy === op);

    if (op.skillT > 0) {
      op.skillT = Math.max(0, op.skillT - dt);
    } else {
      op.sp = Math.min(sk.sp, op.sp + dt);
      if (sk.trigger === 'auto' && op.sp >= sk.sp) {
        // 자동 스킬은 공격 대상이 있을 때만 발동
        const hasWork = op.def.class === 'medic'
          ? S.ops.some((o) => o.hp < o.maxHp && op.range.has(key(o.x, o.y)))
          : pickTargets(op, 1).length > 0;
        if (hasWork) activateSkill(op);
      }
    }

    op.atkCd -= dt;
    if (op.atkCd > 0) return;
    const n = eff(op).targets || op.def.targets || 1;
    const cx = op.x + 0.5, cy = op.y + 0.5;

    if (op.def.class === 'medic') {
      const allies = S.ops
        .filter((o) => o.alive && o.hp < o.maxHp && op.range.has(key(o.x, o.y)))
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
        .slice(0, n);
      if (!allies.length) return;
      for (const a of allies) {
        healOp(a, opAtk(op));
        addFx({ type: 'beam', x1: cx, y1: cy, x2: a.x + 0.5, y2: a.y + 0.5, life: 0.25, color: '#7dff9a' });
      }
      op.atkCd = opInterval(op);
      return;
    }

    const targets = pickTargets(op, n);
    if (!targets.length) return;
    const type = op.def.dmgType || (op.def.class === 'caster' ? 'arts' : 'phys');
    const atk = opAtk(op), splash = eff(op).splash;
    for (const t of targets) {
      if (isGround(op.def)) addFx({ type: 'slash', x: t.x, y: t.y, life: 0.15, color: op.def.color });
      else addFx({ type: 'shot', x1: cx, y1: cy, x2: t.x, y2: t.y, life: 0.15, color: type === 'arts' ? '#c89bff' : '#fff2b3' });
      hitEnemy(t, atk, type);
      if (splash) {
        addFx({ type: 'ring', x: t.x, y: t.y, life: 0.3, color: '#c89bff', r: splash });
        for (const o of S.enemies) {
          if (o !== t && o.alive && Math.hypot(o.x - t.x, o.y - t.y) <= splash) hitEnemy(o, atk, type);
        }
      }
    }
    op.atkCd = opInterval(op);
  }

  function calcDamage(atk, type, def, res) {
    if (type === 'arts') return Math.max(atk * (1 - res / 100), atk * 0.05);
    return Math.max(atk - def, atk * 0.05);
  }

  function hitOp(op, atk, type) {
    const dmg = calcDamage(atk, type, opDef(op), op.def.res || 0);
    op.hp -= dmg;
    op.flash = 0.12;
    addText(op.x + 0.5, op.y + 0.25, Math.round(dmg), type === 'arts' ? '#d9b3ff' : '#ff8c8f', 0.6);
    if (op.hp <= 0 && op.alive) removeOp(op, true);
  }

  // =====================================================================
  //  적
  // =====================================================================
  function spawnEnemy(q) {
    const def = ENEMIES[q.enemy];
    if (!def) { console.warn('알 수 없는 적:', q.enemy); S.total--; return; }
    const path = S.paths[q.spawn] || S.paths[0];
    S.enemies.push({
      def, path, pi: 1, x: path[0].x, y: path[0].y,
      hp: def.hp, maxHp: def.hp, atkCd: def.interval * 0.5, blockedBy: null, alive: true, flash: 0,
    });
    if (def.boss) { toast(`경고 — ${def.name} 출현`); S.shake = 0.5; }
  }

  function hitEnemy(e, atk, type) {
    if (!e.alive) return;
    const dmg = calcDamage(atk, type, e.def.def, e.def.res || 0);
    e.hp -= dmg;
    e.flash = 0.1;
    addText(e.x, e.y - 0.25, Math.round(dmg), type === 'arts' ? '#d9b3ff' : '#ffffff', 0.5);
    if (e.hp <= 0) { e.alive = false; S.killed++; addFx({ type: 'ring', x: e.x, y: e.y, life: 0.3, color: e.def.color }); }
  }

  function tryBlock(e) {
    const w = e.def.weight || 1;
    for (const op of S.ops) {
      if (!op.alive || !isGround(op.def)) continue;
      const load = op.blocked.reduce((s, b) => s + (b.alive && b.blockedBy === op ? b.def.weight || 1 : 0), 0);
      if (load + w > op.def.block) continue;
      if (Math.hypot(e.x - (op.x + 0.5), e.y - (op.y + 0.5)) < 0.7) {
        e.blockedBy = op;
        op.blocked.push(e);
        return;
      }
    }
  }

  function moveEnemy(e, dt) {
    let step = e.def.speed * dt;
    while (step > 0) {
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
    S.life -= e.def.lifeCost || 1;
    S.shake = 0.3;
    toast('방어선이 돌파당했습니다!');
  }

  function updateEnemy(e, dt) {
    e.flash = Math.max(0, e.flash - dt);
    if (e.blockedBy && !e.blockedBy.alive) e.blockedBy = null;
    if (!e.blockedBy && !e.def.flying) tryBlock(e);
    if (!e.blockedBy) moveEnemy(e, dt);
    if (!e.alive) return;

    e.atkCd -= dt;
    if (e.atkCd > 0) return;
    let target = e.blockedBy;
    if (!target && e.def.range > 0) {
      let best = Infinity;
      for (const op of S.ops) {
        const d = Math.hypot(op.x + 0.5 - e.x, op.y + 0.5 - e.y);
        if (d <= e.def.range && d < best) { best = d; target = op; }
      }
    }
    if (!target) return;
    const type = e.def.arts ? 'arts' : 'phys';
    if (e.def.range > 0 && !e.blockedBy) {
      addFx({ type: 'shot', x1: e.x, y1: e.y, x2: target.x + 0.5, y2: target.y + 0.5, life: 0.15, color: type === 'arts' ? '#b36bff' : '#ff9a5c' });
    } else {
      addFx({ type: 'slash', x: target.x + 0.5, y: target.y + 0.5, life: 0.15, color: '#ff5c5c' });
    }
    hitOp(target, e.def.atk, type);
    e.atkCd = e.def.interval;
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
    S.dp = Math.min(MAX_DP, S.dp + dt);
    S.shake = Math.max(0, S.shake - dt);
    while (S.queue.length && S.queue[0].t <= S.time) spawnEnemy(S.queue.shift());
    for (const r of S.roster) if (r.cd > 0) r.cd = Math.max(0, r.cd - dt);
    for (const op of [...S.ops]) if (op.alive) updateOp(op, dt);
    for (const e of S.enemies) if (e.alive) updateEnemy(e, dt);
    S.enemies = S.enemies.filter((e) => e.alive);
    for (const f of S.effects) f.t += dt;
    S.effects = S.effects.filter((f) => f.t < f.life);

    if (S.life <= 0) endBattle(false);
    else if (!S.queue.length && !S.enemies.length) endBattle(true);
  }

  function endBattle(win) {
    S.ended = true;
    setMode('idle');
    const st = S.st;
    const stars = !win ? 0 : S.leaked === 0 ? 3 : S.life >= Math.ceil(S.maxLife / 2) ? 2 : 1;
    if (win) {
      UI.save.stars[st.code] = Math.max(UI.save.stars[st.code] || 0, stars);
      UI.writeSave();
    }
    const title = $('#result-title');
    title.textContent = win ? '작전 완료' : '작전 실패';
    title.classList.toggle('fail', !win);
    $('#result-stars').textContent = win ? starText(stars) : '';
    $('#result-info').textContent = `처치 ${S.killed} · 돌파 ${S.leaked} · 남은 목숨 ${Math.max(0, S.life)}/${S.maxLife}`;
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
    if (win) {
      add('계속', 'primary', () => {
        const after = st.after || [];
        if (after.length) UI.playDialog(after, () => UI.go('operations'));
        else UI.go('operations');
      });
    } else {
      add('다시 도전', 'primary', () => beginBattle(idx, ended.squadIds));
    }
    add('작전 목록', '', () => UI.go('operations'));
    setTimeout(() => { if (S === ended) $('#result').classList.remove('hidden'); }, 400);
  }

  function updateHud() {
    $('#dp-num').textContent = Math.floor(S.dp);
    $('#dp-fill').style.width = (S.dp >= MAX_DP ? 100 : (S.dp % 1) * 100) + '%';
    $('#deploy-left').textContent = S.deployLimit - S.ops.length;
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
  //  렌더링
  // =====================================================================
  function resize() {
    if (!S) return;
    const wrap = $('#board-wrap');
    const T = Math.max(16, Math.floor(Math.min((wrap.clientWidth - 8) / S.cols, (wrap.clientHeight - 8) / S.rows)));
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = T * S.cols + 'px';
    canvas.style.height = T * S.rows + 'px';
    canvas.width = Math.round(T * S.cols * dpr);
    canvas.height = Math.round(T * S.rows * dpr);
    S.T = T;
    S.dpr = dpr;
  }
  window.addEventListener('resize', resize);

  const TILE_COLOR = { '#': '#15171c', '.': '#3b4049', '^': '#727a87', R: '#4a1a1e', B: '#16304f' };

  function drawTile(x, y, ch) {
    const T = S.T, px = x * T, py = y * T, g = Math.max(1, T * 0.03);
    ctx.fillStyle = TILE_COLOR[ch] || TILE_COLOR['#'];
    ctx.fillRect(px + g, py + g, T - 2 * g, T - 2 * g);
    if (ch === '^') {
      ctx.fillStyle = '#8a929f';
      ctx.fillRect(px + g, py + g, T - 2 * g, T * 0.12);
    } else if (ch === '#') {
      ctx.strokeStyle = '#1f2228';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + g, py + T - g); ctx.lineTo(px + T - g, py + g);
      ctx.stroke();
    } else if (ch === 'R' || ch === 'B') {
      const c = ch === 'R' ? '#ff4d57' : '#3fa3ff';
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(2, T * 0.06);
      ctx.strokeRect(px + T * 0.12, py + T * 0.12, T * 0.76, T * 0.76);
      ctx.fillStyle = c;
      ctx.font = `900 ${T * 0.3}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch === 'R' ? '!' : '◆', px + T / 2, py + T / 2);
    }
  }

  function fillTiles(list, fill, stroke) {
    const T = S.T;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    for (const [x, y] of list) {
      if (x < 0 || y < 0 || x >= S.cols || y >= S.rows) continue;
      ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
      if (stroke) ctx.strokeRect(x * T + 3, y * T + 3, T - 6, T - 6);
    }
  }

  function bar(x, y, w, h, ratio, color) {
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), h);
  }

  function drawFace(def, cx, cy, r, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = def.color;
    ctx.fill();
    if (imgReady(def.id)) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(IMG[def.id], cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.font = `900 ${r * 1.05}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.name[0], cx, cy + r * 0.05);
    }
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
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

  function drawOp(op) {
    const T = S.T, cx = (op.x + 0.5) * T, cy = (op.y + 0.5) * T, r = T * 0.32;
    const sk = op.def.skill;
    if (op.skillT > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.35 + Math.sin(S.time * 8) * 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,207,58,.25)';
      ctx.fill();
    }
    drawFace(op.def, cx, cy, r);
    if (op.flash > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,80,80,.5)';
      ctx.fill();
    }
    // 방향 표시
    const a = DIR_ANGLE[op.dir];
    drawArrowHead(cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 1.25, a, T * 0.08, '#fff');
    // 체력/SP
    const bw = T * 0.76, bx = cx - bw / 2, by = cy + r + T * 0.05;
    bar(bx, by, bw, Math.max(3, T * 0.06), op.hp / op.maxHp, '#4cd964');
    const spRatio = op.skillT > 0 ? op.skillT / sk.duration : op.sp / sk.sp;
    bar(bx, by + Math.max(4, T * 0.08), bw, Math.max(2, T * 0.04), spRatio, op.skillT > 0 ? '#ffcf3a' : '#8fd14f');
    // 수동 스킬 준비 완료
    if (sk.trigger === 'manual' && op.skillT <= 0 && op.sp >= sk.sp) {
      const bob = Math.sin(S.time * 6) * T * 0.03;
      ctx.fillStyle = '#ffcf3a';
      ctx.beginPath();
      ctx.arc(cx + r * 0.85, cy - r * 0.95 + bob, T * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = `900 ${T * 0.16}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', cx + r * 0.85, cy - r * 0.93 + bob);
    }
  }

  function drawEnemy(e) {
    const T = S.T, cx = e.x * T, cy = e.y * T, r = T * (e.def.boss ? 0.36 : 0.25);
    ctx.save();
    if (e.def.flying) {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 1.1, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(0, -r * 0.4);
    }
    ctx.beginPath();
    if (e.def.flying) {
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
    } else {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#22090c';
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.strokeStyle = e.def.color;
    ctx.stroke();
    ctx.fillStyle = e.def.color;
    ctx.font = `900 ${r * 0.9}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.def.boss ? '王' : e.def.name.replace(/[「」]/g, '')[0], cx, cy + r * 0.05);
    if (e.blockedBy) {
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    const bw = T * (e.def.boss ? 0.8 : 0.55);
    bar(cx - bw / 2, cy - r - T * 0.12, bw, Math.max(3, T * 0.05), e.hp / e.maxHp, '#ff4d57');
    ctx.restore();
  }

  function drawFx(f) {
    const T = S.T, k = f.t / f.life;
    ctx.globalAlpha = 1 - k;
    if (f.type === 'shot' || f.type === 'beam') {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.type === 'beam' ? Math.max(2, T * 0.06) : Math.max(1.5, T * 0.035);
      ctx.beginPath();
      ctx.moveTo(f.x1 * T, f.y1 * T);
      ctx.lineTo(f.x2 * T, f.y2 * T);
      ctx.stroke();
    } else if (f.type === 'slash') {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = Math.max(2, T * 0.06);
      ctx.beginPath();
      ctx.arc(f.x * T, f.y * T, T * 0.3, -2.4 + k * 1.5, -0.8 + k * 1.5);
      ctx.stroke();
    } else if (f.type === 'ring') {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = Math.max(2, T * 0.05);
      ctx.beginPath();
      ctx.arc(f.x * T, f.y * T, T * (f.r || 0.5) * (0.4 + k * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.type === 'text') {
      ctx.fillStyle = f.color;
      ctx.font = `${f.big ? 700 : 900} ${T * (f.big ? 0.24 : 0.22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.lineWidth = 3;
      const y = (f.y - k * 0.35) * T;
      ctx.strokeText(f.text, f.x * T, y);
      ctx.fillText(f.text, f.x * T, y);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    const T = S.T;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    if (S.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * S.shake, (Math.random() - 0.5) * 8 * S.shake);
    ctx.fillStyle = '#0b0c0f';
    ctx.fillRect(-10, -10, S.cols * T + 20, S.rows * T + 20);
    for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) drawTile(x, y, S.map[y][x]);

    // 적 이동 경로 (흐릿하게)
    ctx.strokeStyle = 'rgba(255,77,87,.18)';
    ctx.lineWidth = Math.max(2, T * 0.05);
    ctx.setLineDash([T * 0.12, T * 0.12]);
    for (const path of S.paths) {
      ctx.beginPath();
      path.forEach((p, i) => (i ? ctx.lineTo(p.x * T, p.y * T) : ctx.moveTo(p.x * T, p.y * T)));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (S.mode === 'placing') {
      const valid = [];
      for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) if (canPlace(S.sel.def, x, y)) valid.push([x, y]);
      fillTiles(valid, 'rgba(76,217,100,.22)', 'rgba(76,217,100,.6)');
    } else if (S.mode === 'direction') {
      fillTiles(computeRange(S.sel.def.range, S.dir, S.tile.x, S.tile.y).list, 'rgba(255,170,60,.3)', 'rgba(255,170,60,.85)');
    } else if (S.mode === 'inspect' && S.inspect) {
      fillTiles(S.inspect.rangeList, 'rgba(255,170,60,.25)', 'rgba(255,170,60,.7)');
    }

    for (const op of S.ops) drawOp(op);
    for (const e of S.enemies) if (!e.def.flying) drawEnemy(e);
    for (const e of S.enemies) if (e.def.flying) drawEnemy(e);

    if (S.mode === 'direction') {
      const cx = (S.tile.x + 0.5) * T, cy = (S.tile.y + 0.5) * T;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath();
      ctx.arc(cx, cy, T * 1.15, 0, Math.PI * 2);
      ctx.fill();
      drawFace(S.sel.def, cx, cy, T * 0.32, 0.75);
      for (const [d, a] of Object.entries(DIR_ANGLE)) {
        const on = d === S.dir;
        drawArrowHead(cx + Math.cos(a) * T * 0.85, cy + Math.sin(a) * T * 0.85, a, T * (on ? 0.2 : 0.14), on ? '#ffcf3a' : 'rgba(255,255,255,.75)');
      }
    }

    for (const f of S.effects) drawFx(f);
  }

  requestAnimationFrame(frame);

  // 디버그/테스트용
  window.Battle = { begin: beginBattle, stop: () => { S = null; } };
  window.__game = { get state() { return S; }, beginBattle, deploy: (id, x, y, dir) => {
    const r = S.roster.find((q) => q.def.id === id);
    if (r) deploy(r, x, y, dir || 'right');
  } };
})();
