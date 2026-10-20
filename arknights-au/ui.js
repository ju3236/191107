'use strict';
// =====================================================================
//  잿빛 등대 — 메뉴 화면 (메인 · 오퍼레이터 · 상세 · 편성 · 작전 목록 · 대화)
// =====================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const OPS = Object.fromEntries(OPERATORS.map((o) => [o.id, o]));
  const CLASS_ORDER = Object.keys(CLASSES);
  const SQUAD_MAX = 12;

  // ---------- 저장 ----------
  const SAVE_KEY = 'ashen-beacon-save';
  const save = (() => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { /* 저장 불가 환경 */ }
    if (!s || typeof s !== 'object') s = {};
    s.stars = s.stars && typeof s.stars === 'object' ? s.stars : {};
    s.squad = (Array.isArray(s.squad) ? s.squad : OPERATORS.map((o) => o.id)).filter((id) => OPS[id]).slice(0, SQUAD_MAX);
    if (!OPS[s.assistant]) s.assistant = OPERATORS[0].id;
    // 새로 추가된 오퍼레이터는 기존 편성에도 자동으로 넣기
    if (!Array.isArray(s.known)) s.known = Array.isArray(s.squad) && s.squad.length ? [...s.squad] : [];
    for (const o of OPERATORS) {
      if (s.known.includes(o.id)) continue;
      s.known.push(o.id);
      if (!s.squad.includes(o.id) && s.squad.length < SQUAD_MAX) s.squad.push(o.id);
    }
    return s;
  })();
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 저장 불가 환경 */ }
  }

  // ---------- 아이콘 ----------
  const ICON = {
    vanguard: '<path d="M6 21V3.5"/><path d="M6 4h12l-3 4.5L18 13H6"/>',
    guard: '<path d="M20 4 9.5 14.5"/><path d="M20 4h-5M20 4v5"/><path d="m6.5 12.5 5 5"/><path d="m4 20 4-4"/>',
    defender: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    sniper: '<path d="M5 4c8 1.5 13.5 7 15 15"/><path d="M5 4 20 19"/><path d="M14 4h6v6"/><path d="M3 21l4-4"/>',
    caster: '<path d="M12 2.5l2.4 7.1 7.1 2.4-7.1 2.4L12 21.5l-2.4-7.1L2.5 12l7.1-2.4z"/>',
    medic: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    specialist: '<path d="M15 3v9.5a5 5 0 1 1-10 0V11"/><path d="M5 11l-2 3M5 11l2.5 2.5"/><path d="M12 3h6"/>',
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
    back: '<path d="M15 4l-8 8 8 8"/>',
    gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    mail: '<path d="M3 6h18v12H3z"/><path d="m3 6 9 7 9-7"/>',
    book: '<path d="M3 5c3-1.2 6-1.2 9 1 3-2.2 6-2.2 9-1v14c-3-1.2-6-1.2-9 1-3-2.2-6-2.2-9-1z"/><path d="M12 6v14"/>',
    alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18v.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.8 2.9-6 6.5-6s6.5 2.2 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.3c2 .7 3.5 2.6 3.5 5.7"/>',
    userplus: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.8 2.9-6 6.5-6s6.5 2.2 6.5 6"/><path d="M19 7v6M16 10h6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    lock: '<rect x="5" y="10" width="14" height="10"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  };
  function icon(name, cls = '') {
    return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;
  }
  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-ico]').forEach((el) => { if (!el.firstChild || el.firstChild.nodeName !== 'svg') el.insertAdjacentHTML('afterbegin', icon(el.dataset.ico)); });
    root.querySelectorAll('[data-back]').forEach((el) => { if (!el.innerHTML) el.innerHTML = icon('back'); });
    root.querySelectorAll('.nav-btn.home').forEach((el) => { if (!el.innerHTML) el.innerHTML = icon('home'); });
  }

  // ---------- 공통 그림 ----------
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function artHTML(def) {
    if (def.image) return `<div class="art has-img" style="--c:${def.color}"><span class="art-en">${esc(def.en || '')}</span><img src="${esc(def.image)}" alt="${esc(def.name)}"></div>`;
    return `<div class="art" style="--c:${def.color}">
      <span class="art-ico">${icon(def.class)}</span>
      <span class="art-en">${esc(def.en || '')}</span>
      <span class="art-init">${esc(def.name[0])}</span>
    </div>`;
  }
  const stars = (n) => '★'.repeat(n || 3);
  function cardHTML(def, extra = '') {
    return `<div class="op-card ${extra}" style="--c:${def.color}">
      <div class="oc-art">${artHTML(def)}</div>
      <div class="oc-top"><span class="oc-class">${icon(def.class)}</span><span class="oc-stars">${stars(def.rarity)}</span></div>
      <div class="oc-foot">
        <div class="oc-cost"><b>${def.cost}</b><small>COST</small></div>
        <div class="oc-name">${esc(def.name)}</div>
      </div>
    </div>`;
  }
  function rangeGridHTML(range, size = 18) {
    const pts = [[0, 0], ...range];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const set = new Set(range.map((p) => p.join(',')));
    let html = `<div class="range-grid" style="grid-template-columns:repeat(${x1 - x0 + 1},${size}px);grid-auto-rows:${size}px">`;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        html += `<i class="${x === 0 && y === 0 ? 'self' : set.has(x + ',' + y) ? 'on' : 'off'}"></i>`;
      }
    }
    return html + '</div>';
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#ui-toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  function openModal(html) {
    $('#modal-body').innerHTML = html;
    hydrateIcons($('#modal-body'));
    $('#modal').classList.remove('hidden');
  }
  function closeModal() { $('#modal').classList.add('hidden'); }
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  // =====================================================================
  //  화면 전환
  // =====================================================================
  const RENDER = {};
  const history = [];
  let current = 'home';

  function go(name, arg, opts = {}) {
    if (name !== 'battle' && window.Battle) window.Battle.stop();
    if (!opts.back && name !== current) {
      const k = history.indexOf(name);
      if (k >= 0) history.length = k;
      else if (current !== 'battle' && name !== 'battle') history.push(current);
    }
    if (name === 'home') history.length = 0;
    current = name;
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'screen-' + name));
    ['#result', '#pause', '#modal'].forEach((s) => $(s).classList.add('hidden'));
    if (RENDER[name]) RENDER[name](arg, opts);
  }
  function back() {
    const prev = history.pop() || 'home';
    go(prev, undefined, { back: true });
  }
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { go(g.dataset.go); return; }
    if (e.target.closest('[data-back]')) back();
  });

  // =====================================================================
  //  1. 메인 화면
  // =====================================================================
  const totalStars = () => STAGES.reduce((s, st) => s + (save.stars[st.code] || 0), 0);
  const cleared = (st) => (save.stars[st.code] || 0) > 0;
  const unlocked = (i) => i === 0 || cleared(STAGES[i - 1]);
  let voiceIdx = 0;

  function setVoice(next) {
    const a = OPS[save.assistant];
    const lines = a.voices && a.voices.length ? a.voices : [a.quote];
    if (next) voiceIdx = (voiceIdx + 1) % lines.length;
    else voiceIdx = Math.floor(Math.random() * lines.length);
    $('#home-voice-text').textContent = lines[voiceIdx];
  }

  RENDER.home = () => {
    const a = OPS[save.assistant];
    $('#home-art').innerHTML = artHTML(a);
    $('#home-banner').innerHTML = `<small>${esc(GAME_INFO.subtitle)}</small><b>${esc(GAME_INFO.title)}</b>`;
    const ts = totalStars();
    $('#home-lv').textContent = 1 + ts * 5;
    $('#home-name').textContent = GAME_INFO.commander || '지휘관';
    $('#home-id').textContent = 'ID: ASHEN-' + String(1000 + ts).padStart(4, '0');
    $('#home-stars').textContent = ts;
    $('#home-stars-max').textContent = '/' + STAGES.length * 3;
    $('#home-ops').textContent = OPERATORS.length;
    const done = STAGES.filter(cleared).length;
    $('#home-progress').textContent = done;
    $('#home-progress-max').textContent = '/' + STAGES.length;
    const cur = STAGES.find((st) => !cleared(st)) || STAGES[STAGES.length - 1];
    $('#home-current').textContent = `${cur.code} ${cur.name}`;
    setVoice(false);
  };
  $('#home-voice').addEventListener('click', () => setVoice(true));
  $('#home-art').addEventListener('click', () => setVoice(true));

  function tickClock() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    $('#home-clock').textContent = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  tickClock();
  setInterval(tickClock, 10000);

  function openSynopsis() {
    openModal(`<div class="modal-title">${esc(GAME_INFO.title)}</div>
      <div class="modal-sub">${esc(GAME_INFO.subtitle)}</div>
      <p class="modal-text">${esc(GAME_INFO.synopsis)}</p>`);
  }
  function openArchive() {
    const rows = STAGES.map((st, i) => {
      if (!unlocked(i)) return `<div class="arc-row locked"><b>${st.code}</b><span>???</span></div>`;
      return `<div class="arc-row"><b>${st.code}</b><span>${esc(st.name)}</span>
        ${st.before && st.before.length ? `<button class="btn small" data-story="${i}:before">작전 전</button>` : ''}
        ${cleared(st) && st.after && st.after.length ? `<button class="btn small" data-story="${i}:after">작전 후</button>` : ''}
      </div>`;
    }).join('');
    openModal(`<div class="modal-title">기록</div><div class="modal-sub">ARCHIVES · 지나온 이야기를 다시 봅니다</div><div class="arc-list">${rows}</div>`);
  }
  let resetArmed = false;
  function openSettings() {
    resetArmed = false;
    openModal(`<div class="modal-title">설정</div><div class="modal-sub">SETTINGS</div>
      <div class="set-row"><span>효과음</span><button class="btn" id="btn-sound">${window.SFX && SFX.enabled ? '켜짐' : '꺼짐'}</button></div>
      <p class="modal-text">진행 상황, 편성, 비서 설정은 이 브라우저에만 저장됩니다.</p>
      <button class="btn danger" id="btn-reset">데이터 초기화</button>`);
    $('#btn-sound').addEventListener('click', (e) => { e.target.textContent = SFX.toggle() ? '켜짐' : '꺼짐'; });
    $('#btn-reset').addEventListener('click', (e) => {
      if (!resetArmed) { resetArmed = true; e.target.textContent = '한 번 더 누르면 초기화됩니다'; return; }
      save.stars = {};
      save.squad = OPERATORS.map((o) => o.id).slice(0, SQUAD_MAX);
      save.assistant = OPERATORS[0].id;
      save.known = OPERATORS.map((o) => o.id);
      writeSave();
      closeModal();
      RENDER.home();
      toast('데이터를 초기화했습니다');
    });
  }
  $('#modal-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-story]');
    if (!b) return;
    const [i, part] = b.dataset.story.split(':');
    closeModal();
    playDialog(STAGES[+i][part], () => {});
  });
  $('#btn-settings').innerHTML = icon('gear');
  $('#btn-notice').innerHTML = icon('mail');
  $('#btn-archive').innerHTML = icon('book');
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-notice').addEventListener('click', openSynopsis);
  $('#btn-archive').addEventListener('click', openArchive);
  $('#tile-archive').addEventListener('click', openArchive);
  $('#tile-profile').addEventListener('click', openSynopsis);

  // =====================================================================
  //  2. 오퍼레이터 목록
  // =====================================================================
  let filter = 'all', sortKey = 'class';
  function sortedOps() {
    const list = OPERATORS.filter((o) => filter === 'all' || o.class === filter);
    const byClass = (a, b) => CLASS_ORDER.indexOf(a.class) - CLASS_ORDER.indexOf(b.class);
    if (sortKey === 'class') list.sort(byClass);
    if (sortKey === 'rarity') list.sort((a, b) => (b.rarity || 3) - (a.rarity || 3) || byClass(a, b));
    if (sortKey === 'cost') list.sort((a, b) => b.cost - a.cost || byClass(a, b));
    return list;
  }
  RENDER.roster = () => {
    const nav = $('#class-filter');
    nav.innerHTML = `<button data-f="all" class="${filter === 'all' ? 'on' : ''}"><b>ALL</b></button>` +
      CLASS_ORDER.map((c) => `<button data-f="${c}" class="${filter === c ? 'on' : ''}" title="${CLASSES[c].name}">${icon(c)}</button>`).join('');
    document.querySelectorAll('#sort-bar button').forEach((b) => b.classList.toggle('on', b.dataset.sort === sortKey));
    const grid = $('#op-grid');
    const list = sortedOps();
    grid.innerHTML = list.map((o) => `<button class="card-btn" data-op="${o.id}">${cardHTML(o)}</button>`).join('') ||
      '<div class="empty-note">이 직군에는 오퍼레이터가 없습니다.</div>';
  };
  $('#class-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (b) { filter = b.dataset.f; RENDER.roster(); }
  });
  $('#sort-bar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]');
    if (b) { sortKey = b.dataset.sort; RENDER.roster(); }
  });
  $('#op-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-op]');
    if (b) go('detail', b.dataset.op);
  });

  // =====================================================================
  //  3. 오퍼레이터 상세
  // =====================================================================
  let detailId = OPERATORS[0].id;
  const speedText = (iv) => (iv <= 0.8 ? '매우 빠름' : iv <= 1.05 ? '빠름' : iv <= 1.3 ? '보통' : iv <= 1.8 ? '느림' : '매우 느림');
  const redeployText = (s) => (s <= 25 ? '빠름' : s <= 35 ? '보통' : '느림');

  RENDER.detail = (id) => {
    if (id) detailId = id;
    const o = OPS[detailId], sk = o.skill, cls = CLASSES[o.class];
    $('#detail-bg').style.setProperty('--c', o.color);
    $('#detail-art').innerHTML = artHTML(o);
    $('#detail-stats').innerHTML = `
      <span><i>＋</i><b>${o.hp}</b></span><span><i>⌛</i>${redeployText(o.redeploy)} <small>${o.redeploy}s</small></span>
      <span><i>${o.class === 'medic' ? '✚' : '⚔'}</i><b>${o.atk}</b></span><span><i>◆</i>${o.cost}</span>
      <span><i>⛨</i><b>${o.def}</b></span><span><i>✋</i>${o.block}</span>
      <span><i>◈</i><b>${o.res || 0}</b></span><span><i>⚡</i>${speedText(o.interval)}</span>`;
    $('#detail-block').innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < o.block ? 'on' : ''}"></i>`).join('');
    $('#detail-stars').textContent = stars(o.rarity);
    $('#detail-en').textContent = o.en || '';
    $('#detail-name').textContent = o.name;
    $('#detail-class').innerHTML = `${icon(o.class)}<b>${cls.name}</b>`;
    $('#detail-range').innerHTML = rangeGridHTML(o.range, 12);
    $('#detail-tags').innerHTML = [cls.tile === 'ground' ? '지면 배치' : '고지대 배치', ...(o.tags || [])].map((t) => `<span>${esc(t)}</span>`).join('');
    $('#detail-cost').textContent = o.cost;
    $('#detail-skill').innerHTML = `<div class="sk-ico" style="--c:${o.color}">${icon(o.class)}<small>SP ${sk.sp}</small></div>
      <div><b>${esc(sk.name)}</b><em>${sk.trigger === 'auto' ? '자동 발동' : '수동 발동'}${sk.duration ? ` · ${sk.duration}초` : ''}</em><p>${esc(sk.desc)}</p></div>`;
    $('#detail-race').textContent = `${o.race} · ${cls.name}`;
    $('#detail-profile').textContent = o.profile;
    $('#detail-quote').textContent = `“${o.quote}”`;
    const isA = save.assistant === o.id;
    $('#detail-assist').textContent = isA ? '현재 비서' : '비서로 지정';
    $('#detail-assist').disabled = isA;
  };
  function stepDetail(d) {
    const list = sortedOps().length ? sortedOps() : OPERATORS;
    let i = list.findIndex((o) => o.id === detailId);
    i = (i + d + list.length) % list.length;
    RENDER.detail(list[i].id);
  }
  $('#detail-prev').addEventListener('click', () => stepDetail(-1));
  $('#detail-next').addEventListener('click', () => stepDetail(1));
  $('#detail-assist').addEventListener('click', () => {
    save.assistant = detailId;
    writeSave();
    RENDER.detail();
    toast(`${OPS[detailId].name}을(를) 비서로 지정했습니다`);
  });

  // =====================================================================
  //  4. 편성
  // =====================================================================
  let pendingStage = null;
  let clearArmed = false;

  RENDER.formation = (arg, opts = {}) => {
    if (!opts.back) pendingStage = arg && Number.isInteger(arg.stage) ? arg.stage : null;
    renderFormation();
  };
  function renderFormation() {
    clearArmed = false;
    const grid = $('#slot-grid');
    let html = '';
    for (let i = 0; i < SQUAD_MAX; i++) {
      const id = save.squad[i];
      html += id
        ? `<button class="slot filled" data-slot="${i}">${cardHTML(OPS[id])}</button>`
        : `<button class="slot empty" data-slot="${i}"><span>${i === save.squad.length ? '＋' : ''}</span></button>`;
    }
    grid.innerHTML = html;
    const st = pendingStage !== null ? STAGES[pendingStage] : null;
    $('#formation-start').classList.toggle('hidden', !st);
    fitSlots();
    $('#formation-title').textContent = st ? `편성 · ${st.code} ${st.name}` : '편성';
    $('#formation-foot').innerHTML = `<span>편성 인원 <b>${save.squad.length}</b>/${SQUAD_MAX}</span>` +
      (st ? `<span>배치 가능 인원 ${st.deployLimit ?? 8}명</span>` : '<span>작전 목록에서 작전을 고르면 출격할 수 있습니다</span>');
  }

  // 카드 2줄 × 6칸이 화면에 꼭 맞도록 크기 계산 (가로 화면)
  function fitSlots() {
    const body = $('.formation-body'), grid = $('#slot-grid');
    if (!body.clientWidth) return;
    const gap = parseFloat(getComputedStyle(grid).rowGap) || 14;
    const startBtn = $('#formation-start');
    const startW = startBtn.classList.contains('hidden') ? 0 : startBtn.offsetWidth + 18;
    const byW = ((body.clientWidth - startW - gap * 5) / 6) * 8 / 5;
    const byH = (body.clientHeight - gap) / 2;
    grid.style.setProperty('--slot-h', Math.floor(Math.max(60, Math.min(byW, byH))) + 'px');
  }
  window.addEventListener('resize', () => { if (current === 'formation') fitSlots(); });

  $('#slot-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-slot]');
    if (!b) return;
    const slot = Math.min(+b.dataset.slot, save.squad.length);
    const curId = save.squad[slot];
    const pool = OPERATORS.filter((o) => !save.squad.includes(o.id) || o.id === curId);
    openModal(`<div class="modal-title">오퍼레이터 선택</div><div class="modal-sub">슬롯 ${slot + 1}</div>
      <div class="pick-grid">${pool.map((o) => `<button class="card-btn ${o.id === curId ? 'picked' : ''}" data-pick="${o.id}" data-slot-i="${slot}">${cardHTML(o, 'small')}</button>`).join('')}</div>
      ${curId ? `<button class="btn danger" data-unpick="${slot}">편성 해제</button>` : ''}`);
  });
  $('#modal-body').addEventListener('click', (e) => {
    const p = e.target.closest('[data-pick]');
    const u = e.target.closest('[data-unpick]');
    if (p) {
      save.squad[+p.dataset.slotI] = p.dataset.pick;
    } else if (u) {
      save.squad.splice(+u.dataset.unpick, 1);
    } else return;
    save.squad = save.squad.filter(Boolean);
    writeSave();
    closeModal();
    renderFormation();
  });
  $('#btn-quick').addEventListener('click', () => {
    const order = [...OPERATORS].sort((a, b) => CLASS_ORDER.indexOf(a.class) - CLASS_ORDER.indexOf(b.class));
    save.squad = order.map((o) => o.id).slice(0, SQUAD_MAX);
    writeSave();
    renderFormation();
    toast('빠른 편성을 완료했습니다');
  });
  $('#btn-clear').addEventListener('click', () => {
    if (!clearArmed) { clearArmed = true; toast('한 번 더 누르면 편성을 비웁니다'); return; }
    save.squad = [];
    writeSave();
    renderFormation();
  });
  $('#formation-start').addEventListener('click', () => {
    if (pendingStage === null) return;
    if (!save.squad.length) { toast('편성된 오퍼레이터가 없습니다'); return; }
    startOperation(pendingStage);
  });

  function startOperation(idx) {
    const st = STAGES[idx];
    const squad = [...save.squad];
    const run = () => window.Battle.begin(idx, squad);
    if (st.before && st.before.length) playDialog(st.before, run);
    else run();
  }

  // =====================================================================
  //  5. 작전 목록
  // =====================================================================
  let opSel = 0;
  const NODE_Y = [40, 40, 66, 30, 58];

  RENDER.operations = (arg, opts = {}) => {
    $('#chapter-title').innerHTML = `<small>EPISODE</small><b>${esc(GAME_INFO.chapter || GAME_INFO.title)}</b>`;
    if (!unlocked(opSel)) opSel = 0;
    if (!opts.back) {
      let last = 0;
      STAGES.forEach((_, i) => { if (unlocked(i)) last = i; });
      opSel = last;
    }
    const map = $('#ops-map');
    const gap = 300, x0 = 150;
    const width = x0 * 2 + gap * (STAGES.length - 1);
    const pos = STAGES.map((st, i) => ({ x: x0 + i * gap, y: st.pos ?? NODE_Y[i % NODE_Y.length] }));
    let lines = '';
    for (let i = 1; i < pos.length; i++) {
      lines += `<line x1="${pos[i - 1].x}" y1="${pos[i - 1].y}%" x2="${pos[i].x}" y2="${pos[i].y}%" class="${unlocked(i) ? '' : 'dim'}"/>`;
    }
    map.innerHTML = `<div class="ops-track" style="width:${width}px">
      <svg class="ops-lines" width="${width}" height="100%">${lines}</svg>
      ${STAGES.map((st, i) => {
        const s = save.stars[st.code] || 0;
        const cls = [unlocked(i) ? '' : 'locked', i === opSel ? 'sel' : '', cleared(st) ? 'done' : ''].join(' ');
        return `<button class="op-node ${cls}" data-stage="${i}" style="left:${pos[i].x}px;top:${pos[i].y}%">
          <span class="node-hex">${unlocked(i) ? (s ? '◆'.repeat(s) : '') : icon('lock')}</span>
          <span class="node-label"><small>OPERATION</small><b>${st.code}</b></span>
        </button>`;
      }).join('')}
    </div>`;
    renderOpsPanel();
  };

  function renderOpsPanel() {
    const st = STAGES[opSel], s = save.stars[st.code] || 0;
    const enemyIds = [...new Set(st.waves.map((w) => w.enemy))];
    $('#ops-panel').innerHTML = `
      <div class="op-head">
        <div><small>OPERATION</small><b>${st.code}</b><div class="op-name">${esc(st.name)}</div></div>
        <div class="op-stars">${[0, 1, 2].map((i) => `<span class="hex ${i < s ? 'on' : ''}"></span>`).join('')}</div>
      </div>
      <div class="op-story">
        ${st.before && st.before.length ? `<button class="story-btn" id="op-story">${icon('play')}<span>스토리</span></button>` : ''}
        <div class="op-desc">
          <div class="op-tag"><span class="chk"></span>목숨 ${st.life ?? 3} · 배치 가능 ${st.deployLimit ?? 8}명</div>
          <p>${esc(st.desc)}</p>
          <p class="op-warn">출현 적: ${enemyIds.map((id) => ENEMIES[id] ? esc(ENEMIES[id].name) : id).join(', ')}</p>
        </div>
      </div>
      <div class="op-tools">
        <button class="tool-box" id="op-enemy"><span>적 정보</span>${icon('search')}</button>
        <button class="tool-box" id="op-mapview"><span>맵</span>${icon('search')}</button>
      </div>
      <div class="op-actions">
        <button class="act-formation" id="op-formation">${icon('users')}<span>편성</span></button>
        <button class="act-start" id="op-start"><b>작전개시</b><small>OPERATION START</small></button>
      </div>`;
    const story = $('#op-story');
    if (story) story.addEventListener('click', () => playDialog(st.before, () => {}));
    $('#op-enemy').addEventListener('click', () => openEnemies(st));
    $('#op-mapview').addEventListener('click', () => openMap(st));
    $('#op-formation').addEventListener('click', () => go('formation', { stage: opSel }));
    $('#op-start').addEventListener('click', () => go('formation', { stage: opSel }));
  }

  $('#ops-map').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stage]');
    if (!b) return;
    const i = +b.dataset.stage;
    if (!unlocked(i)) { toast('이전 작전을 완료하면 해금됩니다'); return; }
    opSel = i;
    document.querySelectorAll('.op-node').forEach((n) => n.classList.toggle('sel', +n.dataset.stage === i));
    renderOpsPanel();
  });

  function openEnemies(st) {
    const count = {};
    for (const w of st.waves) count[w.enemy] = (count[w.enemy] || 0) + (w.count || 1);
    const rows = Object.entries(count).map(([id, n]) => {
      const e = ENEMIES[id];
      if (!e) return '';
      const flags = [e.boss && '보스', e.flying && '비행', e.range > 0 && '원거리', e.arts && '마법 피해'].filter(Boolean);
      return `<div class="enemy-row">
        <span class="enemy-ico" style="--c:${e.color}">${e.boss ? '王' : esc(e.name.replace(/[「」]/g, '')[0])}</span>
        <div class="enemy-info">
          <b>${esc(e.name)} <small>×${n}</small></b>
          <div class="enemy-stats">체력 ${e.hp} · 공격 ${e.atk} · 방어 ${e.def} · 저항 ${e.res || 0}</div>
          <div class="enemy-desc">${flags.map((f) => `<span class="flag">${f}</span>`).join('')}${esc(e.desc || '')}</div>
        </div>
      </div>`;
    }).join('');
    openModal(`<div class="modal-title">적 정보</div><div class="modal-sub">${st.code} ${esc(st.name)}</div><div class="enemy-list">${rows}</div>`);
  }

  function openMap(st) {
    openModal(`<div class="modal-title">맵</div><div class="modal-sub">${st.code} ${esc(st.name)}</div>
      <canvas id="map-preview"></canvas>
      <div class="map-legend"><span><i style="background:#3b4049"></i>지면</span><span><i style="background:#8a929f"></i>고지대</span><span><i style="background:#e5484d"></i>침입 지점</span><span><i style="background:#3fa3ff"></i>방어 지점</span></div>`);
    const cv = $('#map-preview');
    const rows = st.map.length, cols = st.map[0].length;
    const T = Math.floor(Math.min(520, window.innerWidth - 80) / cols);
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = cols * T + 'px';
    cv.style.height = rows * T + 'px';
    cv.width = cols * T * dpr;
    cv.height = rows * T * dpr;
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    const color = { '#': '#15171c', '.': '#3b4049', '^': '#8a929f', R: '#e5484d', B: '#3fa3ff' };
    st.map.forEach((row, y) => [...row].forEach((ch, x) => {
      c.fillStyle = color[ch] || color['#'];
      c.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
    }));
  }

  // =====================================================================
  //  대화
  // =====================================================================
  function playDialog(lines, done) {
    const ov = $('#dialog'), nameEl = $('#dlg-name'), textEl = $('#dlg-text'), por = $('#dlg-portrait');
    let i = -1, timer = null, full = '';
    ov.classList.remove('hidden');

    function finish() {
      clearInterval(timer);
      ov.classList.add('hidden');
      ov.onclick = null;
      done();
    }
    function next() {
      i++;
      if (i >= lines.length) { finish(); return; }
      const L = lines[i];
      const def = L.who && OPS[L.who];
      const name = def ? def.name : L.name || '';
      nameEl.textContent = name;
      nameEl.style.color = def ? def.color : '';
      textEl.classList.toggle('narr', !name);
      if (def) { por.innerHTML = artHTML(def); por.style.opacity = 1; }
      else if (name) { por.innerHTML = '<div class="art unknown"><span class="art-init">?</span></div>'; por.style.opacity = 1; }
      else { por.style.opacity = 0; }
      full = L.text;
      let n = 0;
      textEl.textContent = '';
      clearInterval(timer);
      timer = setInterval(() => {
        n++;
        textEl.textContent = full.slice(0, n);
        if (n % 2 && window.SFX) SFX.play('text');
        if (n >= full.length) { clearInterval(timer); timer = null; }
      }, 22);
    }
    ov.onclick = (e) => {
      if (e.target.closest('#dlg-skip')) { finish(); return; }
      if (timer) { clearInterval(timer); timer = null; textEl.textContent = full; return; }
      next();
    };
    next();
  }

  // ---------- 시작 ----------
  document.title = GAME_INFO.title;
  hydrateIcons();
  window.UI = { save, writeSave, go, back, icon, toast, playDialog, startOperation };
  RENDER.home();
})();
