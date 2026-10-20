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
  const sfx = (name) => window.SFX && window.SFX.play(name);

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
  const walkable = (ch) => ch === '.' || ch === '-' || ch === 'R' || ch === 'B';

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
    squadIds = squadIds || UI.save.squad;
    const squad = squadIds.map((id) => OPS_BY_ID[id]).filter(Boolean);

    UI.go('battle');
    S = {
      idx, st, squadIds, map, rows: map.length, cols: map[0].length, paths, flyPaths, queue,
      total: queue.length, killed: 0, leaked: 0, time: 0,
      dp: st.startDp ?? 10, life: st.life ?? 3, maxLife: st.life ?? 3, deployLimit: st.deployLimit ?? 8,
      ops: [], enemies: [], effects: [],
      roster: squad.map((def) => ({ def, cd: 0, deployed: false })),
      speed: 1, paused: false, ended: false,
      mode: 'idle', sel: null, tile: null, dir: 'right', press: null, inspect: null,
      shake: 0, T: 40, dpr: 1,
    };
    $('#hud-stage').textContent = `${st.code} ${st.name}`;
    $('#btn-speed').innerHTML = '1X<small>▶</small>';
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
      r.el.classList.toggle('hidden', r.deployed);
      r.el.classList.toggle('cooling', r.cd > 0);
      r.el.classList.toggle('poor', S.dp < r.def.cost);
      r.el.classList.toggle('selected', S.sel === r && (S.mode === 'placing' || S.mode === 'direction'));
      if (r.cd > 0) r.cdEl.textContent = Math.ceil(r.cd);
    }
  }
  function onCard(r) {
    if (!S || S.ended) return;
    if (S.sel === r && S.mode !== 'idle' && S.mode !== 'inspect') { sfx('cancel'); setMode('idle'); return; }
    if (r.deployed) return;
    if (r.cd > 0) { sfx('deny'); toast('재배치 대기 중입니다'); return; }
    if (S.dp < r.def.cost) { sfx('deny'); toast('배치 코스트가 부족합니다'); return; }
    if (S.ops.length >= S.deployLimit) { sfx('deny'); toast('배치 가능 인원을 초과했습니다'); return; }
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
      pickDir(toTile(e, tileH(S.tile.x, S.tile.y)));
      return;
    }
    const op = opAtScreen(e) || opAt(tx, ty);
    if (op) { S.inspect = op; setMode('inspect'); refreshInspect(true); }
    else if (S.mode === 'inspect') setMode('idle');
  });
  canvas.addEventListener('pointermove', (e) => {
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
  window.addEventListener('keydown', (e) => {
    if (!S || S.ended) return;
    if (e.key === 'Escape') setMode('idle');
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
  });

  $('#btn-speed').addEventListener('click', () => {
    if (!S) return;
    S.speed = S.speed === 1 ? 2 : 1;
    $('#btn-speed').innerHTML = S.speed + 'X<small>' + (S.speed > 1 ? '▶▶' : '▶') + '</small>';
  });
  function togglePause(force) {
    if (!S || S.ended) return;
    S.paused = force ?? !S.paused;
    $('#pause').classList.toggle('hidden', !S.paused);
    soundLabel();
  }
  $('#btn-pause').addEventListener('click', () => togglePause());
  $('#btn-gear').addEventListener('click', () => togglePause(true));
  $('#pause-resume').addEventListener('click', () => togglePause(false));
  const soundLabel = () => { $('#pause-sound').textContent = '효과음 ' + (window.SFX && SFX.enabled ? '켜짐' : '꺼짐'); };
  $('#pause-sound').addEventListener('click', () => { SFX.toggle(); soundLabel(); });
  $('#pause-retry').addEventListener('click', () => beginBattle(S.idx, S.squadIds));
  $('#pause-quit').addEventListener('click', () => { $('#pause').classList.add('hidden'); UI.go('operations'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });

  $('#ins-skill').addEventListener('click', () => { if (S && S.inspect) { activateSkill(S.inspect); refreshInspect(true); } });
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
    $('#ins-skill').disabled = !(sk.trigger === 'manual' && op.skillT <= 0 && op.sp >= sk.sp);
    $('#ins-skill').textContent = sk.trigger === 'auto' ? '자동 발동' : '스킬 발동';
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
  const opAtk = (op) => op.def.atk * op.tal.atk * (eff(op).atk || 1);
  const opDef = (op) => op.def.def * op.tal.def * (eff(op).def || 1) * (1 + (op.auraDef || 0));
  const opInterval = (op) => op.def.interval * op.tal.speed * (eff(op).interval || 1) * (op.chill > 0 ? 1.5 : 1);
  const opBlock = (op) => op.def.block + (eff(op).block || 0);
  const opDodge = (op) => op.tal.dodge + (eff(op).dodge || 0);
  const isGround = (def) => CLASSES[def.class].tile === 'ground';
  const isFly = (def) => !!(def.fly || def.flying);

  function setRange(op, range) {
    const rg = computeRange(range, op.dir, op.x, op.y);
    op.range = rg.set;
    op.rangeList = rg.list;
  }
  const alliesNear = (op, r) => S.ops.filter((o) => o.alive && Math.hypot(o.x - op.x, o.y - op.y) <= r);
  const enemiesNear = (op, r) => S.enemies.filter((e) => e.alive && Math.hypot(e.x - (op.x + 0.5), e.y - (op.y + 0.5)) <= r);

  function deploy(r, tx, ty, dir) {
    if (S.dp < r.def.cost) { toast('배치 코스트가 부족합니다'); setMode('idle'); return; }
    if (S.ops.length >= S.deployLimit) { toast('배치 가능 인원을 초과했습니다'); setMode('idle'); return; }
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
    sfx('deploy');
    r.deployed = true;
    addFx({ type: 'ring', x: tx + 0.5, y: ty + 0.5, life: 0.4, color: def.color });
    addText(tx + 0.5, ty - 0.1, def.quote, def.color, 1.6, true);
    setMode('idle');
    if (skill.spType === 'deploy') activateSkill(op);
  }

  function removeOp(op, died) {
    op.alive = false;
    for (const e of op.blocked) if (e.blockedBy === op) e.blockedBy = null;
    op.blocked = [];
    S.ops = S.ops.filter((o) => o !== op);
    op.roster.deployed = false;
    op.roster.cd = op.def.redeploy;
    if (S.inspect === op) setMode('idle');
    if (died) { sfx('down'); addText(op.x + 0.5, op.y + 0.2, '전투 불능', '#ff6b6e', 1.2, true); }
  }
  function retreat(op) {
    S.dp = Math.min(MAX_DP, S.dp + Math.floor(op.def.cost / 2));
    addText(op.x + 0.5, op.y + 0.2, '철수', '#9aa1ab', 0.8, true);
    sfx('retreat');
    removeOp(op, false);
  }

  function activateSkill(op) {
    const sk = op.skill, ef = sk.effect || {};
    if (op.skillT > 0 || op.sp < sk.sp) return false;
    sfx(ef.strike ? 'strike' : 'skill');
    const atk = op.def.atk * op.tal.atk * (ef.atk || 1);
    if (ef.dp) S.dp = Math.min(MAX_DP, S.dp + ef.dp);
    if (ef.heal) healOp(op, op.maxHp * ef.heal);
    if (ef.shield) op.shield = op.maxHp * ef.shield;
    if (ef.nextHit) op.charge = ef.nextHit;
    if (ef.hits && !sk.duration) op.burst = ef.hits;
    if (ef.allyHeal) {
      for (const a of alliesNear(op, ef.allyHeal.radius)) {
        if (a.hp >= a.maxHp) continue;
        healOp(a, atk * ef.allyHeal.mul);
        addFx({ type: 'beam', x1: op.x + 0.5, y1: op.y + 0.5, x2: a.x + 0.5, y2: a.y + 0.5, life: 0.3, color: '#7dff9a' });
      }
      sfx('heal');
    }
    if (ef.strike) {
      for (const t of enemiesNear(op, ef.strike.radius)) {
        addFx({ type: 'slash', x: t.x, y: t.y, life: 0.3, color: '#ffcf3a' });
        hitEnemy(t, atk * ef.strike.mul, 'phys');
        if (ef.strike.stun) t.stun = Math.max(t.stun || 0, ef.strike.stun);
      }
      addFx({ type: 'ring', x: op.x + 0.5, y: op.y + 0.5, life: 0.4, color: '#ffcf3a', r: ef.strike.radius });
    }
    op.sp = 0;
    op.skillT = sk.duration === -1 ? Infinity : sk.duration || 0;
    op.charges = ef.charges || 0;
    if (ef.range && op.skillT > 0) setRange(op, ef.range);
    addFx({ type: 'ring', x: op.x + 0.5, y: op.y + 0.5, life: 0.5, color: '#ffcf3a' });
    addText(op.x + 0.5, op.y - 0.1, sk.name, '#ffcf3a', 1.2, true);
    return true;
  }

  // 지속형 스킬이 끝날 때
  function endSkill(op) {
    const ef = op.skill.effect || {};
    op.skillT = 0;
    op.charges = 0;
    if (ef.range) setRange(op, op.def.range);
    if (ef.shield) op.shield = 0;
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
    op.hp = Math.min(op.maxHp, op.hp + amt);
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
    if (op.def.archetype === 'centurion') n = Math.max(n, op.blocked.length);
    const list = S.enemies.filter((e) => e.alive && (e.blockedBy === op ||
      (op.range.has(key(Math.floor(e.x), Math.floor(e.y))) && !(ground && isFly(e.def)))));
    list.sort((a, b) =>
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
    op.blocked = op.blocked.filter((e) => e.alive && e.blockedBy === op);

    if (op.skillT > 0) {
      if (op.skillT !== Infinity) {
        op.skillT -= dt;
        if (op.skillT <= 0) endSkill(op);
      }
      if (ef.regen) healOp(op, op.maxHp * ef.regen * dt, true);
      if (ef.allyRegen) for (const a of alliesNear(op, ef.allyRegen.radius)) healOp(a, opAtk(op) * ef.allyRegen.mul * dt, true);
    } else if (sk.spType !== 'deploy') {
      if (!sk.spType || sk.spType === 'time') op.sp = Math.min(sk.sp, op.sp + dt);
      if (sk.trigger === 'auto' && op.sp >= sk.sp && !op.charge && !op.burst && hasWork(op)) activateSkill(op);
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
      sfx('heal');
      afterAttack(op);
      return;
    }

    const targets = pickTargets(op, n);
    if (!targets.length) return;
    const type = op.def.dmgType || (op.def.class === 'caster' ? 'arts' : 'phys');
    let mul = 1;
    if (op.firstStrike) { mul *= op.tal.firstStrike; op.firstStrike = false; addText(cx, op.y + 0.1, '발도!', '#ffcf3a', 0.8, true); }
    if (op.charge) { mul *= op.charge; op.charge = 0; }
    const hits = op.burst || eff(op).hits;
    op.burst = null;
    const count = hits ? hits.count : 1, hitMul = hits ? hits.mul : 1;
    const atk = opAtk(op) * mul * hitMul, splash = eff(op).splash;
    sfx(type === 'arts' ? 'arts' : isGround(op.def) ? 'slash' : 'shot');
    for (const t of targets) {
      for (let i = 0; i < count; i++) {
        if (isGround(op.def)) addFx({ type: 'slash', x: t.x, y: t.y, life: 0.15, color: op.def.color });
        else addFx({ type: 'shot', x1: cx, y1: cy, x2: t.x + (i ? (Math.random() - 0.5) * 0.2 : 0), y2: t.y, life: 0.15, color: type === 'arts' ? '#c89bff' : '#fff2b3' });
        const crit = op.tal.crit && Math.random() < op.tal.crit.rate ? op.tal.crit.mul : 1;
        hitEnemy(t, atk * crit, type, crit > 1);
        if (splash) {
          for (const o of S.enemies) {
            if (o !== t && o.alive && Math.hypot(o.x - t.x, o.y - t.y) <= splash) hitEnemy(o, atk, type);
          }
        }
      }
      if (splash) addFx({ type: 'ring', x: t.x, y: t.y, life: 0.3, color: '#c89bff', r: splash });
    }
    afterAttack(op);
  }

  function afterAttack(op) {
    const sk = op.skill;
    if (sk.spType === 'attack' && op.skillT <= 0) op.sp = Math.min(sk.sp, op.sp + 1);
    if (op.charges > 0 && --op.charges === 0 && op.skillT > 0) endSkill(op);
    op.atkCd = opInterval(op);
  }

  function calcDamage(atk, type, def, res) {
    if (type === 'arts') return Math.max(atk * (1 - res / 100), atk * 0.05);
    return Math.max(atk - def, atk * 0.05);
  }

  function hitOp(op, atk, type, src) {
    if (!op.alive) return;
    if (type === 'phys' && Math.random() < opDodge(op)) { addText(op.x + 0.5, op.y + 0.25, '회피', '#cfd3d6', 0.5); return; }
    let dmg = calcDamage(atk, type, opDef(op), op.def.res || 0);
    const g = op.tal.guard;
    if (g && op.hp / op.maxHp <= g.below) dmg *= g.taken;
    if (op.shield > 0) {
      const absorbed = Math.min(op.shield, dmg);
      op.shield -= absorbed;
      dmg -= absorbed;
      if (dmg <= 0) { addText(op.x + 0.5, op.y + 0.25, '보호막', '#7fd8ff', 0.5); return; }
    }
    op.hp -= dmg;
    op.flash = 0.12;
    sfx('hurt');
    addText(op.x + 0.5, op.y + 0.25, Math.round(dmg), type === 'arts' ? '#d9b3ff' : '#ff8c8f', 0.6);
    if (op.skill.spType === 'hit' && op.skillT <= 0) op.sp = Math.min(op.skill.sp, op.sp + 1);
    if (src && src.def.chill) op.chill = 3;
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
    const def = ENEMIES[q.enemy];
    if (!def) { console.warn('알 수 없는 적:', q.enemy); S.total--; return; }
    const i = S.paths[q.spawn] ? q.spawn : 0;
    const path = isFly(def) ? S.flyPaths[i] : S.paths[i];
    S.enemies.push({
      def, path, pi: 1, x: path[0].x, y: path[0].y,
      hp: def.hp, maxHp: def.hp, atkCd: def.interval * 0.5, blockedBy: null, alive: true, flash: 0,
      stun: 0, atkMul: 1, revived: false, blinked: false,
    });
    if (def.boss) { sfx('boss'); toast(`경고 — ${def.name} 출현`); S.shake = 0.5; } else sfx('spawn');
  }

  function hitEnemy(e, atk, type, crit) {
    if (!e.alive) return;
    const dmg = calcDamage(atk, type, e.def.def, e.def.res || 0);
    e.hp -= dmg;
    e.flash = 0.1;
    addText(e.x, e.y - 0.25, Math.round(dmg) + (crit ? '!' : ''), crit ? '#ffcf3a' : type === 'arts' ? '#d9b3ff' : '#ffffff', 0.5, crit);
    if (e.hp > 0) return;
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
    sfx('kill');
    addFx({ type: 'ring', x: e.x, y: e.y, life: 0.3, color: e.def.color });
  }

  function tryBlock(e) {
    const w = e.def.weight || 1;
    for (const op of S.ops) {
      if (!op.alive || !isGround(op.def)) continue;
      const load = op.blocked.reduce((s, b) => s + (b.alive && b.blockedBy === op ? b.def.weight || 1 : 0), 0);
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
        return;
      }
    }
  }

  function moveEnemy(e, dt) {
    let step = e.def.speed * dt;
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
    S.life -= e.def.lifeCost || 1;
    S.shake = 0.3;
    sfx('leak');
    toast('방어선이 돌파당했습니다!');
  }

  function enemyAtk(e) {
    const en = e.def.enrage;
    return e.def.atk * e.atkMul * (en && e.hp / e.maxHp <= en.below ? en.atk : 1);
  }

  function updateEnemy(e, dt, healAura) {
    e.flash = Math.max(0, e.flash - dt);
    if (e.def.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.def.regen * healAura * dt);
    if (e.stun > 0) { e.stun -= dt; return; }
    if (e.blockedBy && !e.blockedBy.alive) e.blockedBy = null;
    if (!e.blockedBy && !isFly(e.def) && !e.def.unblockable) tryBlock(e);
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
    const atk = enemyAtk(e);
    if (e.def.aoe) {
      addFx({ type: 'ring', x: target.x + 0.5, y: target.y + 0.5, life: 0.35, color: e.def.arts ? '#aee3ff' : '#ff7a2f', r: e.def.aoe });
      for (const op of [...S.ops]) {
        if (op !== target && Math.hypot(op.x - target.x, op.y - target.y) <= e.def.aoe) hitOp(op, atk, type, e);
      }
    }
    hitOp(target, atk, type, e);
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
    // 가디언 재능: 주변 아군 방어력 오라
    for (const op of S.ops) op.auraDef = 0;
    for (const g of S.ops) {
      const a = g.tal.auraDef;
      if (a) for (const o of alliesNear(g, a.radius)) o.auraDef = Math.max(o.auraDef, a.def);
    }
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
    g.addColorStop(0, '#1d2b2d');
    g.addColorStop(1, '#040506');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, P.W + 40, P.H + 40);
    const m = 0.7;
    // 구덩이 벽 (보드 바깥 테두리)
    poly(quad(-m, -m, S.cols + m, S.rows + m, 0));
    ctx.fillStyle = '#151c1e'; ctx.fill();
    ctx.strokeStyle = 'rgba(110,190,180,.18)'; ctx.lineWidth = 2; ctx.stroke();
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
    ctx.fillStyle = '#343c40'; ctx.fill();
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
    box(x + 0.02, y + 0.02, x + 0.98, y + 0.98, 0, HIGH, '#94786d', '#4f3d37', '#68534b', { right: hi(1), left: hi(-1) });
    poly(quad(x + 0.1, y + 0.1, x + 0.9, y + 0.9, HIGH));
    ctx.fillStyle = '#a68b80'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,215,.25)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function drawWall(x, y) {
    poly(quad(x, y, x + 1, y + 1, 0));
    ctx.fillStyle = '#1b2224'; ctx.fill();
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
  function drawTile(x, y) {
    const ch = S.map[y][x];
    if (ch === '#') drawWall(x, y);
    else if (ch === '^') drawHigh(x, y);
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
    ctx.fillText(def.name[0], X, Y + r * 0.05);
    ctx.globalAlpha = 1;
  }
  // 캐릭터 몸체(그림 또는 동그라미). 화면상 영역 [x0, y0, x1, y1]을 돌려줌
  function drawBody(def, X, Y, T, alpha = 1, flash = 0) {
    if (imgReady(def.id)) {
      const im = IMG[def.id], ih = T * 1.25, iw = (ih * im.naturalWidth) / im.naturalHeight;
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
    drawArrowHead(ax, ay, Math.atan2(ay - Y, ax - X), T * 0.11, '#ff9a1f');
    op.rect = drawBody(op.def, X, Y, T, 1, op.flash);
    // 체력/SP
    const bw = T * 0.72, bx = X - bw / 2, by = Y + T * 0.1;
    bar(bx, by, bw, Math.max(3, T * 0.055), op.hp / op.maxHp, '#4cd964');
    const spRatio = op.skillT > 0 ? (op.skillT === Infinity ? 1 : op.skillT / sk.duration) : sk.sp ? op.sp / sk.sp : 0;
    bar(bx, by + Math.max(4, T * 0.075), bw, Math.max(2, T * 0.04), spRatio, op.skillT > 0 ? '#ffcf3a' : '#8fd14f');
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
    const T = P.T * s, r = T * (e.def.boss ? 0.34 : 0.23);
    const lift = isFly(e.def) ? T * 0.6 + Math.sin(S.time * 4 + e.x) * T * 0.04 : T * 0.02;
    ellipse(X, Y, r * 1.05, r * 0.4);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
    const cy = Y - r - lift;
    ctx.beginPath();
    if (isFly(e.def)) {
      ctx.moveTo(X, cy - r); ctx.lineTo(X + r, cy); ctx.lineTo(X, cy + r); ctx.lineTo(X - r, cy); ctx.closePath();
    } else {
      ctx.arc(X, cy, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#22090c'; ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.strokeStyle = e.def.color; ctx.stroke();
    ctx.fillStyle = e.def.color;
    ctx.font = `900 ${r * 0.9}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e.def.boss ? '王' : e.def.name.replace(/[「」]/g, '')[0], X, cy + r * 0.05);
    const bw = T * (e.def.boss ? 0.8 : 0.5);
    bar(X - bw / 2, cy - r - T * 0.12, bw, Math.max(3, T * 0.05), e.hp / e.maxHp, e.revived ? '#aee3ff' : '#ff4d57');
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
