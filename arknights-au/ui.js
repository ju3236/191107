'use strict';
// =====================================================================
//  잿빛 등대 — 메뉴 화면 (메인 · 오퍼레이터 · 상세 · 편성 · 작전 목록 · 대화)
// =====================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  // 오퍼레이터 목록은 관리자가 실장하면 늘어나므로 매번 찾아봄
  const OPS = new Proxy({}, { get: (_, id) => OPERATORS.find((o) => o.id === id) });
  const CLASS_ORDER = Object.keys(CLASSES);
  const SQUAD_MAX = 12;

  // ---------- 저장 (account.js) ----------
  const save = ACCOUNT.player;
  const writeSave = () => ACCOUNT.save();
  const owned = (id) => ACCOUNT.owns(id);
  const ownedOps = () => OPERATORS.filter((o) => owned(o.id));
  function fixPlayer() {
    save.squad = save.squad.filter((id) => OPS[id] && owned(id));
    if (!OPS[save.assistant] || !owned(save.assistant)) save.assistant = (ownedOps()[0] || OPERATORS[0]).id;
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
    supporter: '<path d="M6 21V9"/><circle cx="6" cy="6" r="3"/><path d="M10 6c4 0 8 2 9 6M10 10c3 0 6 1.5 7 4.5"/>',
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
    store: '<path d="M4 9h16l-1.5 11h-13z"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>',
    headhunt: '<circle cx="12" cy="12" r="8"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><circle cx="12" cy="12" r="2"/>',
    depot: '<path d="M3 8 12 3l9 5v10l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v10"/>',
    admin: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
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
  // ---------- 음성 기록 ----------
  const pick = (v) => (Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v);
  function line(def, key) {
    const v = def && def.voice;
    if (v && v[key]) return pick(v[key]);
    if (!def) return '';
    if (key === 'deploy' || key === 'select' || key === 'obtain') return def.quote || '';
    return '';
  }
  const trustOf = (id) => Math.min(200, (save.trust && save.trust[id]) || 0);
  // 신뢰도로 해금되는 대사 (정예화가 없으므로 승진 후 대화는 신뢰도 120%에서 해금)
  const VOICE_UNLOCK = { trust40: 40, trust100: 100, promo: 120, trust150: 150, trust200: 200 };
  function homeLines(def) {
    const v = def.voice;
    if (!v) return def.voices && def.voices.length ? def.voices : [def.quote || '…'];
    const t = trustOf(def.id), out = [...(v.talk || [])];
    for (const [k, need] of Object.entries(VOICE_UNLOCK)) if (t >= need && v[k]) out.push(...[].concat(v[k]));
    return out;
  }
  function say(def, key) {
    const t = line(def, key);
    if (t) toast(`${def.name} — ${t}`, 1500 + t.length * 60);
  }
  const skillsOf = (def) => def.skills || (def.skill ? [def.skill] : []);
  function skillIndex(def) {
    const n = skillsOf(def).length;
    const i = save.skills[def.id];
    return Number.isInteger(i) && i >= 0 && i < n ? i : n - 1;
  }
  const SP_TYPE = { time: '자동 회복', attack: '공격 회복', hit: '피격 회복', deploy: '배치 시 발동' };
  const durText = (sk) => (sk.duration > 0 ? ` · ${sk.duration}초` : sk.duration === -1 ? ' · 지속' : '');
  function cardHTML(def, extra = '') {
    return `<div class="op-card ${extra}" style="--c:${def.color}">
      <div class="oc-art">${artHTML(def)}</div>
      <div class="oc-top"><span class="oc-class">${icon(def.class)}</span><span class="oc-stars">${stars(def.rarity)}</span></div>
      ${skillsOf(def).length > 1 ? `<span class="oc-skill">S${skillIndex(def) + 1}</span>` : ''}
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
  function toast(msg, ms = 1800) {
    const el = $('#ui-toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), Math.min(ms, 7000));
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
  let voiceIdx = 0, assistantLine = null;

  function setVoice(next) {
    fixPlayer();
    const a = OPS[save.assistant];
    if (assistantLine) { $('#home-voice-text').textContent = assistantLine; assistantLine = null; return; }
    const lines = homeLines(a);
    if (next) voiceIdx = (voiceIdx + 1) % lines.length;
    else voiceIdx = Math.floor(Math.random() * lines.length);
    $('#home-voice-text').textContent = lines[voiceIdx];
  }

  RENDER.home = () => {
    fixPlayer();
    const a = OPS[save.assistant];
    $('#home-art').innerHTML = artHTML(a);
    $('#home-banner').innerHTML = `<small>${esc(GAME_INFO.subtitle)}</small><b>${esc(GAME_INFO.title)}</b>`;
    const ts = totalStars();
    $('#home-lv').textContent = 1 + ts * 5;
    $('#home-name').textContent = save.nick || GAME_INFO.commander || '지휘관';
    $('#home-id').textContent = 'ID: ASHEN-' + String(1000 + ts).padStart(4, '0');
    renderResources();
    $('#tile-admin').classList.toggle('hidden', !ACCOUNT.isAdmin);
    const done = STAGES.filter(cleared).length;
    $('#home-progress').textContent = done;
    $('#home-progress-max').textContent = '/' + STAGES.length;
    const cur = STAGES.find((st) => !cleared(st)) || STAGES[STAGES.length - 1];
    $('#home-current').textContent = `${cur.code} ${cur.name}`;
    setVoice(false);
  };
  $('#home-voice').addEventListener('click', () => setVoice(true));
  $('#home-art').addEventListener('click', () => {
    // 비서 터치 대사 (신뢰도 100% 이상이면 신뢰 터치)
    const a = OPS[save.assistant], v = a && a.voice;
    const key = v && v.trustTouch && trustOf(a.id) >= 100 && Math.random() < 0.5 ? 'trustTouch' : 'touch';
    if (v && v[key]) { $('#home-voice-text').textContent = line(a, key); sfx('click'); }
    else setVoice(true);
  });

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
      <div class="set-row"><span>닉네임</span><input id="nick-input" maxlength="16" value="${esc(save.nick || '')}" placeholder="${esc(GAME_INFO.commander || '박사')}"><button class="btn small" id="nick-save">저장</button></div>
      <p class="modal-text">${ACCOUNT.mode === 'online'
        ? '온라인 계정에 저장 중입니다. 다른 기기에서 같은 계정으로 열어도 이어서 플레이할 수 있습니다.'
        : '이 브라우저에만 저장 중입니다. claude.ai 링크에서 로그인한 채로 열면 계정에 저장되고, 구매센터와 관리자 기능을 쓸 수 있습니다.'}</p>
      <button class="btn danger" id="btn-reset">작전 진행도 초기화</button>`);
    $('#nick-save').addEventListener('click', () => {
      save.nick = $('#nick-input').value.trim().slice(0, 16);
      writeSave();
      toast('닉네임을 저장했습니다');
      RENDER.home();
    });
    $('#btn-sound').addEventListener('click', (e) => { e.target.textContent = SFX.toggle() ? '켜짐' : '꺼짐'; });
    $('#btn-reset').addEventListener('click', (e) => {
      if (!resetArmed) { resetArmed = true; e.target.textContent = '한 번 더 누르면 초기화됩니다'; return; }
      save.stars = {};
      writeSave();
      closeModal();
      RENDER.home();
      toast('작전 진행도를 초기화했습니다');
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

  // =====================================================================
  //  2. 오퍼레이터 목록
  // =====================================================================
  let filter = 'all', sortKey = 'class';
  function sortedOps() {
    const list = OPERATORS.filter((o) => owned(o.id) && (filter === 'all' || o.class === filter));
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
      '<div class="empty-note">보유한 오퍼레이터가 없습니다. 헤드헌팅에서 모집해 보세요.</div>';
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
    const o = OPS[detailId], cls = CLASSES[o.class], arch = o.archetype && ARCHETYPES[o.archetype];
    $('#detail-bg').style.setProperty('--c', o.color);
    $('#detail-art').innerHTML = artHTML(o);
    $('#detail-stats').innerHTML = `
      <span><i>＋</i><b>${o.hp}</b></span><span><i>⌛</i>${redeployText(o.redeploy)} <small>${o.redeploy}s</small></span>
      <span><i>${o.class === 'medic' ? '✚' : '⚔'}</i><b>${o.atk}</b></span><span><i>◆</i>${o.cost}</span>
      <span><i>⛨</i><b>${o.def}</b></span><span><i>✋</i>${o.block}</span>
      <span><i>◈</i><b>${o.res || 0}</b></span><span><i>⚡</i>${speedText(o.interval)}</span>`;
    $('#detail-block').innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < o.block ? 'on' : ''}"></i>`).join('');
    $('#detail-stars').textContent = stars(o.rarity);
    const pot = ACCOUNT.potOf(o.id);
    $('#detail-pot').textContent = pot ? `잠재 ${pot} · 신뢰도 ${trustOf(o.id)}%` : '미보유';
    $('#detail-en').textContent = o.en || '';
    $('#detail-name').textContent = o.name;
    $('#detail-class').innerHTML = `${icon(o.class)}<b>${cls.name}</b>${arch ? `<small>${esc(arch.name)}</small>` : ''}`;
    $('#detail-range').innerHTML = rangeGridHTML(o.range, 12);
    $('#detail-tags').innerHTML = [cls.tile === 'ground' ? '지면 배치' : '고지대 배치', ...(o.tags || [])].map((t) => `<span>${esc(t)}</span>`).join('');
    $('#detail-cost').textContent = o.cost;
    const list = skillsOf(o), cur = skillIndex(o);
    $('#detail-skill').innerHTML = list.map((sk, i) => `
      <button class="skill-row ${i === cur ? 'on' : ''}" data-skill="${i}">
        <div class="sk-ico" style="--c:${o.color}"><b>S${i + 1}</b><small>${sk.spType === 'deploy' ? '배치' : 'SP ' + sk.sp}</small></div>
        <div><b>${esc(sk.name)}</b><em>${SP_TYPE[sk.spType || 'time']} · ${sk.trigger === 'auto' ? '자동 발동' : '수동 발동'}${durText(sk)}</em><p>${esc(sk.desc)}</p></div>
      </button>`).join('') + (list.length > 1 ? '<div class="skill-hint">눌러서 전투에 쓸 스킬을 고르세요</div>' : '');
    $('#detail-talents').innerHTML = `<div class="trait"><span class="chip">특성</span>${esc(arch ? arch.trait : cls.trait)}</div>` +
      (o.talents || []).map((t) => `<div class="talent"><b>${esc(t.name)}</b><p>${esc(t.desc)}</p></div>`).join('');
    $('#detail-race').textContent = `${o.race} · ${o.faction || cls.name}`;
    $('#detail-profile').textContent = o.profile;
    $('#detail-quote').textContent = `“${o.quote}”`;
    const isA = save.assistant === o.id;
    $('#detail-assist').textContent = !owned(o.id) ? '미보유 오퍼레이터' : isA ? '현재 비서' : '비서로 지정';
    $('#detail-assist').disabled = isA || !owned(o.id);
  };
  function stepDetail(d) {
    const list = sortedOps().length ? sortedOps() : OPERATORS;
    let i = list.findIndex((o) => o.id === detailId);
    i = (i + d + list.length) % list.length;
    RENDER.detail(list[i].id);
  }
  $('#detail-skill').addEventListener('click', (e) => {
    const b = e.target.closest('[data-skill]');
    if (!b) return;
    save.skills[detailId] = +b.dataset.skill;
    writeSave();
    RENDER.detail();
  });
  $('#detail-prev').addEventListener('click', () => stepDetail(-1));
  $('#detail-next').addEventListener('click', () => stepDetail(1));
  $('#detail-assist').addEventListener('click', () => {
    save.assistant = detailId;
    writeSave();
    RENDER.detail();
    const def = OPS[detailId];
    assistantLine = line(def, 'assistant') || null;
    if (assistantLine) say(def, 'assistant');
    else toast(`${def.name}을(를) 비서로 지정했습니다`);
  });
  const VOICE_LABEL = [['obtain', '획득'], ['assistant', '비서 임명'], ['talk', '대화'], ['promo', '승진 후 대화'],
    ['trust40', '신뢰도 40%'], ['trust100', '신뢰도 100%'], ['trust150', '신뢰도 150%'], ['trust200', '신뢰도 200%'],
    ['squad', '편성'], ['leader', '대장 임명'], ['depart', '작전 출발'], ['start', '작전 개시'], ['select', '선택'], ['deploy', '배치'],
    ['combat', '전투 중'], ['clear', '작전 완료(별 3개)'], ['clear2', '작전 완료(별 3개 미만)'], ['fail', '작전 실패'],
    ['base', '시설 배치'], ['touch', '터치'], ['trustTouch', '신뢰 터치']];
  $('#detail-voice').addEventListener('click', () => {
    const o = OPS[detailId];
    const v = o.voice || { talk: o.voices || [], deploy: [o.quote] };
    const t = trustOf(o.id);
    const rows = VOICE_LABEL.flatMap(([k, label]) => {
      const list = [].concat(v[k] || []).filter(Boolean);
      return list.map((txt, i) => {
        const need = VOICE_UNLOCK[k] || (k === 'trustTouch' ? 100 : 0), locked = t < need;
        return `<div class="vrow ${locked ? 'locked' : ''}"><b>${label}${list.length > 1 ? ' ' + (i + 1) : ''}</b><p>${locked ? `신뢰도 ${need}% 달성 시 해금` : esc(txt)}</p></div>`;
      });
    }).join('');
    openModal(`<div class="modal-title">${esc(o.name)} — 음성 기록</div><div class="modal-sub">신뢰도 ${t}% · 작전에서 사용한 이성만큼 신뢰도가 오릅니다</div><div class="voice-list">${rows}</div>`);
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
    fixPlayer();
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
    const pool = ownedOps().filter((o) => !save.squad.includes(o.id) || o.id === curId);
    openModal(`<div class="modal-title">오퍼레이터 선택</div><div class="modal-sub">슬롯 ${slot + 1}</div>
      <div class="pick-grid">${pool.map((o) => `<button class="card-btn ${o.id === curId ? 'picked' : ''}" data-pick="${o.id}" data-slot-i="${slot}">${cardHTML(o, 'small')}</button>`).join('')}</div>
      ${curId ? `<button class="btn danger" data-unpick="${slot}">편성 해제</button>` : ''}`);
  });
  $('#modal-body').addEventListener('click', (e) => {
    const p = e.target.closest('[data-pick]');
    const u = e.target.closest('[data-unpick]');
    if (p) {
      save.squad[+p.dataset.slotI] = p.dataset.pick;
      say(OPS[p.dataset.pick], +p.dataset.slotI === 0 ? 'leader' : 'squad');
    } else if (u) {
      save.squad.splice(+u.dataset.unpick, 1);
    } else return;
    save.squad = save.squad.filter(Boolean);
    writeSave();
    closeModal();
    renderFormation();
  });
  $('#btn-quick').addEventListener('click', () => {
    const order = ownedOps().sort((a, b) => (b.rarity || 3) - (a.rarity || 3) || CLASS_ORDER.indexOf(a.class) - CLASS_ORDER.indexOf(b.class));
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

  const sanityCost = (st) => st.sanity || 6;
  function startOperation(idx, skipStory) {
    const st = STAGES[idx];
    fixPlayer();
    const squad = [...save.squad];
    if (!squad.length) { toast('편성된 오퍼레이터가 없습니다'); return false; }
    if (!ACCOUNT.useSanity(sanityCost(st))) { openSanity(() => startOperation(idx, skipStory)); return false; }
    sfx('select');
    const run = () => window.Battle.begin(idx, squad);
    if (!skipStory && st.before && st.before.length && !(save.stars[st.code] > 0)) playDialog(st.before, run);
    else run();
    return true;
  }
  // 이성 부족 → 오리지늄으로 회복
  function openSanity(after) {
    const have = ACCOUNT.bal('originite');
    openModal(`<div class="modal-title">이성 회복</div><div class="modal-sub">SANITY</div>
      <p class="modal-text">현재 이성 <b>${ACCOUNT.sanity()}</b> / ${ACCOUNT.SANITY_MAX}
      ${ACCOUNT.sanity() < ACCOUNT.SANITY_MAX ? `· 다음 회복까지 ${Math.ceil(ACCOUNT.nextSanityMs() / 60000)}분` : ''}<br>
      오리지늄 1개를 사용해 이성을 ${ACCOUNT.SANITY_MAX} 회복합니다. (보유 오리지늄 ${have})</p>
      <div class="panel-btns"><button class="btn primary" id="sanity-use" ${have < 1 ? 'disabled' : ''}>오리지늄 1개 사용</button>
      <button class="btn" id="sanity-store">구매센터로 가기</button></div>`);
    $('#sanity-use').addEventListener('click', () => {
      if (!ACCOUNT.refillSanity()) return;
      closeModal();
      toast('이성을 회복했습니다');
      renderResources();
      if (after) after();
    });
    $('#sanity-store').addEventListener('click', () => { closeModal(); go('store', 'originite'); });
  }
  // 전투 결과 → 보상 (game.js에서 호출)
  function onBattleEnd(idx, win, starCount, squadIds = []) {
    const st = STAGES[idx], cost = sanityCost(st);
    if (!win) { ACCOUNT.addSanity(cost - 1); return `이성 ${cost - 1} 반환`; }
    // 원작처럼 소모한 이성만큼 편성 오퍼레이터의 신뢰도 상승 (최대 200%)
    save.trust = save.trust || {};
    for (const id of squadIds) save.trust[id] = Math.min(200, (save.trust[id] || 0) + cost);
    const first = !(save.stars[st.code] > 0);
    const reward = { lmd: cost * 12 };
    if (first) reward.originite = 1;
    ACCOUNT.earn(reward);
    return Object.entries(reward).map(([k, v]) => `${ITEMS[k].name} +${v}${k === 'originite' ? ' (첫 클리어)' : ''}`).join(' · ') + ` · 신뢰도 +${cost}%`;
  }
  function onBattleQuit(idx) { ACCOUNT.addSanity(sanityCost(STAGES[idx]) - 1); }
  const sfx = (n) => window.SFX && SFX.play(n);

  // =====================================================================
  //  5. 작전 목록
  // =====================================================================
  let opSel = 0;
  const NODE_Y = [40, 40, 66, 30, 58];

  let chapterSel = null;
  const chapters = () => (typeof CHAPTERS !== 'undefined' && CHAPTERS.length ? CHAPTERS : [{ id: undefined, code: 'EP', name: GAME_INFO.chapter || GAME_INFO.title }]);
  const stagesOf = (ch) => STAGES.map((st, i) => ({ st, i })).filter(({ st }) => st.chapter === ch.id || (ch.id === undefined));
  RENDER.operations = (arg, opts = {}) => {
    if (!unlocked(opSel)) opSel = 0;
    if (!opts.back) {
      let last = 0;
      STAGES.forEach((_, i) => { if (unlocked(i)) last = i; });
      opSel = last;
      chapterSel = STAGES[last].chapter;
    }
    const chs = chapters();
    const cur = chs.find((c) => c.id === chapterSel) || chs[0];
    chapterSel = cur.id;
    // 에피소드 탭: 그 에피소드의 첫 작전이 열려 있어야 선택 가능
    $('#chapter-title').innerHTML = chs.map((c) => {
      const first = stagesOf(c)[0];
      const open = first && unlocked(first.i);
      return `<button class="ep-tab ${c.id === cur.id ? 'on' : ''} ${open ? '' : 'locked'}" data-ep="${c.id}"><small>${esc(c.code)}</small><b>${open ? esc(c.name) : '???'}</b></button>`;
    }).join('');
    const list = stagesOf(cur);
    if (!list.some(({ i }) => i === opSel)) opSel = list[0].i;
    const map = $('#ops-map');
    const gap = 300, x0 = 150;
    const width = x0 * 2 + gap * (list.length - 1);
    const pos = list.map(({ st }, k) => ({ x: x0 + k * gap, y: st.pos ?? NODE_Y[k % NODE_Y.length] }));
    let lines = '';
    for (let k = 1; k < pos.length; k++) {
      lines += `<line x1="${pos[k - 1].x}" y1="${pos[k - 1].y}%" x2="${pos[k].x}" y2="${pos[k].y}%" class="${unlocked(list[k].i) ? '' : 'dim'}"/>`;
    }
    map.innerHTML = `<div class="ops-track" style="width:${width}px">
      <svg class="ops-lines" width="${width}" height="100%">${lines}</svg>
      ${list.map(({ st, i }, k) => {
        const s = save.stars[st.code] || 0;
        const cls = [unlocked(i) ? '' : 'locked', i === opSel ? 'sel' : '', cleared(st) ? 'done' : ''].join(' ');
        return `<button class="op-node ${cls}" data-stage="${i}" style="left:${pos[k].x}px;top:${pos[k].y}%">
          <span class="node-hex">${unlocked(i) ? (s ? '◆'.repeat(s) : '') : icon('lock')}</span>
          <span class="node-label"><small>OPERATION</small><b>${st.code}</b></span>
        </button>`;
      }).join('')}
    </div>`;
    renderOpsPanel();
  };
  $('#chapter-title').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ep]');
    if (!b) return;
    if (b.classList.contains('locked')) { toast('이전 에피소드를 완료하면 해금됩니다'); return; }
    chapterSel = isNaN(+b.dataset.ep) ? undefined : +b.dataset.ep;
    const first = stagesOf(chapters().find((c) => c.id === chapterSel))[0];
    let last = first.i;
    STAGES.forEach((st, i) => { if (st.chapter === chapterSel && unlocked(i)) last = i; });
    opSel = last;
    RENDER.operations(undefined, { back: true });
  });

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
          <div class="op-tag"><span class="chk"></span>목숨 ${st.life ?? 3} · 배치 가능 ${st.deployLimit ?? 8}명 · 첫 클리어 보상 오리지늄 1</div>
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
        <button class="act-start" id="op-start"><b>작전개시</b><small>이성 -${sanityCost(st)}</small></button>
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
      const flags = [e.boss && '보스', e.elite && '엘리트', e.fly && '비행', e.unblockable && '저지 불가', e.range > 0 && `원거리 ${e.range}`, e.arts && '마법 피해',
        e.aoe && '범위 공격', e.healer && '치료', e.blink && '순간이동', e.revive && '부활', e.enrage && '광폭화', e.chill && '냉기', e.regen && 'HP 회복'].filter(Boolean);
      return `<div class="enemy-row">
        <span class="enemy-ico" style="--c:${e.color}" title="${esc(e.code || '')}">${e.image ? `<img src="${esc(e.image)}" alt="">` : e.boss ? '王' : esc(e.name.replace(/[「」]/g, '')[0])}</span>
        <div class="enemy-info">
          <b><small class="e-code">${esc(e.code || '')}</small> ${esc(e.name)} <small>×${n}</small></b>
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
  // ---------- 상단 재화 표시 (원작처럼 이성 · 용문폐 · 합성옥 · 오리지늄) ----------
  function resourceHTML() {
    const n = (v) => Number(v).toLocaleString('ko-KR');
    return `<button class="res" data-res="sanity"><i class="ri sanity"></i><b>${ACCOUNT.sanity()}</b><small>/${ACCOUNT.SANITY_MAX}</small><span class="res-plus">${icon('plus')}</span></button>
      <span class="res"><i class="ri lmd"></i><b>${n(ACCOUNT.bal('lmd'))}</b></span>
      <button class="res" data-res="orundum"><i class="ri orundum"></i><b>${n(ACCOUNT.bal('orundum'))}</b><span class="res-plus">${icon('plus')}</span></button>
      <button class="res" data-res="originite"><i class="ri originite"></i><b>${n(ACCOUNT.bal('originite'))}</b><span class="res-plus">${icon('plus')}</span></button>`;
  }
  function renderResources() {
    document.querySelectorAll('[data-resbar]').forEach((el) => { el.innerHTML = resourceHTML(); });
  }
  document.addEventListener('click', (e) => {
    const r = e.target.closest('[data-res]');
    if (!r) return;
    if (r.dataset.res === 'sanity') openSanity(() => renderResources());
    else go('store', r.dataset.res === 'orundum' ? 'exchange' : 'originite');
  });
  setInterval(() => { if (current !== 'battle') renderResources(); }, 30000);

  // 공용 데이터가 바뀌면 지금 화면을 다시 그림
  const rerender = () => { if (current !== 'battle' && RENDER[current]) RENDER[current](undefined, { back: true, refresh: true }); };
  ACCOUNT.on('ops', rerender);
  ACCOUNT.on('player', rerender);
  ACCOUNT.on('mode', rerender);
  ACCOUNT.on('wallet', renderResources);
  ACCOUNT.on('granted', (g) => {
    const items = Object.entries(g.items || {}).map(([k, v]) => (k.startsWith('op:') ? (OPS[k.slice(3)] ? OPS[k.slice(3)].name : '오퍼레이터') : `${ITEMS[k] ? ITEMS[k].name : k} ×${v}`)).join(', ');
    toast(`지급 완료 — ${items}`);
    sfx('win');
  });

  window.UI = {
    save, writeSave, go, back, icon, toast, playDialog, startOperation, skillIndex, onBattleEnd, onBattleQuit,
    openModal, closeModal, cardHTML, artHTML, esc, stars, OPS, RENDER, renderResources, hydrateIcons, skillsOf, line, say,
    get current() { return current; },
  };
  RENDER.home();
})();
