'use strict';
// =====================================================================
//  잿빛 등대 — 메뉴 화면 (메인 · 오퍼레이터 · 상세 · 편성 · 작전 목록 · 대화)
// =====================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  // 오퍼레이터 목록은 관리자가 실장하면 늘어나므로 매번 찾아봄
  const OPS = new Proxy({}, { get: (_, id) => OPERATORS.find((o) => o.id === id) });
  const CLASS_ORDER = Object.keys(CLASSES).filter((c) => c !== 'device');
  const SQUAD_MAX = 12;

  // ---------- 저장 (account.js) ----------
  const save = ACCOUNT.player;
  const writeSave = () => ACCOUNT.save();
  const owned = (id) => ACCOUNT.owns(id);
  const ownedOps = () => OPERATORS.filter((o) => owned(o.id));
  const ASST_MAX = 12;
  let rotatedFor = null;
  function fixPlayer() {
    save.squad = save.squad.filter((id) => OPS[id] && owned(id));
    if (!OPS[save.assistant] || !owned(save.assistant)) save.assistant = (ownedOps()[0] || OPERATORS[0]).id;
    // 비서 여러 명: 접속할 때마다 / 하루에 한 번 바뀜
    save.assistants = (Array.isArray(save.assistants) ? save.assistants : []).filter((id) => OPS[id] && owned(id)).slice(0, ASST_MAX);
    if (!save.assistants.length) save.assistants = [save.assistant];
    if (rotatedFor !== ACCOUNT.mode && save.assistants.length > 1) {
      rotatedFor = ACCOUNT.mode;
      const l = save.assistants;
      if (save.asstMode === 'login') save.assistant = pick(l.filter((id) => id !== save.assistant));
      else if (save.asstMode === 'daily') {
        const day = Math.floor((Date.now() + 9 * 3600e3) / 86400e3);
        save.assistant = l[day % l.length];
      }
    }
    applyHomeBg();
  }
  // ---------- 로비 배경 (원작 홈 배경) ----------
  const HOME_BGS = [['default', '기본', 'img/ui/home_bg.webp'], ...[
    ['bg_rhodes_night', '밤'], ['bg_main_victoria_1', '흐림'], ['bg_siesta_1', '휴일'], ['bg_kazimierz_1', '상업'],
    ['bg_ursus_1', '엄동'], ['bg_yan_1', '산악'], ['bg_iberia_1', '바다'], ['bg_rogue_1', '무너진 벽'], ['bg_anniversary_1', '축제'],
    ['bg_laterano_1', '맑음'], ['bg_rhine_1', '수풀'], ['bg_rogue_2', '저편'], ['bg_rogue_3', '시작'], ['bg_rhodes_flower_1', '꽃밭'],
    ['bg_sandboxv2_1', '광야'], ['bg_dungeon_1', '던전'], ['bg_sui_1', '푸름'], ['bg_rogue_4', '의식의 형성'], ['bg_kalts_1', '발자취'],
  ].map(([id, n]) => [id, n, `img/homebg/${id}.webp`])];
  let randomBg = null;
  function applyHomeBg() {
    let id = save.homeBg || 'default';
    if (id === 'random') id = randomBg = randomBg || pick(HOME_BGS)[0];
    const bg = HOME_BGS.find((b) => b[0] === id) || HOME_BGS[0];
    document.documentElement.style.setProperty('--home-bg-img', `url(${bg[2]})`);
  }
  function openBgPicker() {
    const cur = save.homeBg || 'default';
    openModal(`<div class="modal-title">로비 배경</div><div class="modal-sub">원작 홈 배경 · 눌러서 바로 바꿉니다</div>
      <div class="bg-pick">${[['random', '접속마다 무작위', '']].concat(HOME_BGS).map(([id, n, src]) => `<button class="bg-pk ${cur === id ? 'on' : ''}" data-bg="${id}" ${src ? `style="background-image:url(${src})"` : ''}><span>${esc(n)}</span></button>`).join('')}</div>`);
    $('#modal-body').querySelectorAll('[data-bg]').forEach((b) => b.addEventListener('click', () => {
      save.homeBg = b.dataset.bg; randomBg = null; writeSave(); applyHomeBg(); openBgPicker();
    }));
  }

  // ---------- 아이콘 ----------
  const ICON = {
    base: '<path d="M3 21V10l9-6 9 6v11"/><path d="M9 21v-6h6v6M3 21h18"/>',
    mission: '<path d="M9 4h6v3H9z"/><path d="M9 5H6v16h12V5h-3"/><path d="M9 12l2 2 4-4M9 17h6"/>',
    craft: '<path d="M14 4l6 6-3 3-6-6z"/><path d="M11 7L3 15l3 3 8-8M4 21h7"/>',
    vanguard: '<path d="M6 21V3.5"/><path d="M6 4h12l-3 4.5L18 13H6"/>',
    guard: '<path d="M20 4 9.5 14.5"/><path d="M20 4h-5M20 4v5"/><path d="m6.5 12.5 5 5"/><path d="m4 20 4-4"/>',
    defender: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    sniper: '<path d="M5 4c8 1.5 13.5 7 15 15"/><path d="M5 4 20 19"/><path d="M14 4h6v6"/><path d="M3 21l4-4"/>',
    caster: '<path d="M12 2.5l2.4 7.1 7.1 2.4-7.1 2.4L12 21.5l-2.4-7.1L2.5 12l7.1-2.4z"/>',
    medic: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    specialist: '<path d="M15 3v9.5a5 5 0 1 1-10 0V11"/><path d="M5 11l-2 3M5 11l2.5 2.5"/><path d="M12 3h6"/>',
    device: '<circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
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
    feedback: '<path d="M4 4h16v12H9l-5 4z"/><path d="M12 7v4M12 13.5v.5"/>',
    fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    shrink: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
    wrench: '<path d="M14.5 4.5a4.5 4.5 0 0 0-5.8 5.8L3 16l5 5 5.7-5.7a4.5 4.5 0 0 0 5.8-5.8l-3 3-3-1-1-3z"/>',
    flag: '<path d="M5 21V4h13l-3 4.5 3 4.5H5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  };
  // 원작 직군 아이콘 (img/ui/pro_<직군>.png, 흰색 그림)
  const PRO_IMG = new Set(['vanguard', 'guard', 'defender', 'sniper', 'caster', 'medic', 'supporter', 'specialist']);
  function icon(name, cls = '') {
    if (PRO_IMG.has(name)) return `<img class="ico pro ${cls}" src="img/ui/pro_${name}.png" alt="" draggable="false">`;
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
  // 긴 이름은 칸 너비에 맞게 글자 크기를 줄임
  function fitName(el) {
    const fit = () => {
      el.style.fontSize = '';
      let fs = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 1 && fs > 24) el.style.fontSize = (fs -= 2) + 'px';
    };
    requestAnimationFrame(fit);
    // 웹 폰트가 늦게 들어오면 너비가 바뀌므로 다시 맞춤
    if (document.fonts) document.fonts.ready.then(fit);
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
  const trustOf = (id) => Math.floor(Math.min(200, (save.trust && save.trust[id]) || 0));
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
    let n = skillsOf(def).length;
    // 육성: 정예화 단계까지 열린 스킬만 (통합전략의 오퍼레이터는 따로 정함)
    if (!def.trained && def.promoted === undefined && !def.summoned && window.TRAIN) n = Math.min(n, TRAIN.prog(def.id).elite + 1);
    const i = save.skills[def.id];
    return Number.isInteger(i) && i >= 0 && i < n ? i : n - 1;
  }
  const SP_TYPE = { time: '자동 회복', attack: '공격 회복', hit: '피격 회복', deploy: '배치 시 발동' };
  const durText = (sk) => (sk.duration > 0 ? ` · ${sk.duration}초` : sk.duration === -1 ? ' · 지속' : '');
  function cardHTML(def, extra = '') {
    const t = window.TRAIN && !def.trained && !def.summoned ? TRAIN.trained(def) : def;
    return `<div class="op-card ${extra}" style="--c:${def.color}">
      <div class="oc-art">${artHTML(def)}</div>
      <div class="oc-top"><span class="oc-class">${icon(def.class)}</span><span class="oc-stars">${stars(def.rarity)}</span></div>
      ${skillsOf(def).length > 1 ? `<span class="oc-skill">S${skillIndex(def) + 1}</span>` : ''}
      <div class="oc-foot">
        <div class="oc-cost"><b>${t.cost}</b><small>COST</small></div>
        <div class="oc-name">${esc(def.name)}</div>
      </div>
    </div>`;
  }
  // 정예화 표시 (0: 없음, 1: 꺾쇠 하나, 2: 둘)
  const eliteIcon = (e) => `<img class="elite-ico" src="img/ui/elite_${e}.png" alt="정예화 ${e}" draggable="false">`;
  // 스킬 아이콘: 효과에 맞는 원작 공용 스킬 아이콘 (img/skill/*.png)
  function skillIcon(sk, i = 0, def = {}) {
    const e = (sk && sk.effect) || {}, n = Math.min(3, i + 1);
    let k;
    if (def.class === 'medic' || e.burstHeal || e.hot) k = e.allyGuard ? 'heal_rage' : 'heal_up';
    else if (e.dp || e.dpRegen || e.dpFor) k = 'charge_cost';
    else if (e.range) k = 'range_extend';
    else if (e.nextHit || e.shell || e.twinShot || e.strike) k = 'powerstrike';
    else if (e.def || e.block || e.shield || e.allyGuard || e.guardDef) k = 'def_up';
    else if (e.heal || e.regen || e.selfHeal) k = 'heal_self';
    else if (e.interval || e.aspd || e.devAspd) k = 'quickattack';
    else if (def.class === 'caster' || def.class === 'supporter' || def.dmgType === 'arts') k = 'magic_rage';
    else k = 'atk_up';
    return `img/skill/${k === 'range_extend' ? k : k + '_' + n}.png`;
  }
  // 오퍼레이터 목록 카드 (원작 목록 화면 모양)
  function rosterCardHTML(def) {
    const list = skillsOf(def), si = skillIndex(def), pot = ACCOUNT.potOf(def.id), pg = TRAIN.prog(def.id);
    return `<div class="rcard" style="--c:${def.color}">
      <div class="rc-art">${def.image ? `<img src="${esc(def.image)}" alt="">` : `<b>${esc(def.name[0])}</b>`}</div>
      <div class="rc-top"><span class="rc-class">${icon(def.class)}</span><span class="rc-stars">${stars(def.rarity)}</span></div>
      <div class="rc-band"></div>
      <div class="rc-foot">
        <span class="rc-elite e${pg.elite}">${eliteIcon(pg.elite)}</span>
        <div class="rc-lv"><small>LV</small><b>${pg.level}</b></div>
        <span class="rc-pot" title="잠재">${pot > 1 ? 'P' + pot : ''}</span>
        ${list.length ? `<span class="rc-sk" style="--c:${def.color}">S${si + 1}</span>` : ''}
      </div>
      <div class="rc-name">${esc(def.name)}</div>
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
    $('#modal').dataset.kind = '';
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
    if (name !== 'battle' && window.SFX && SFX.bgm) SFX.bgm(screenBgm(name));
    if (RENDER[name]) RENDER[name](arg, opts);
  }
  // 화면별 BGM (전투는 game.js에서 정함)
  // 통합전략: 로비 「海愿」, 지도 「深蓝之树」 · 심해(3층~) 「族群歌谣」 (원작 미즈키 통합전략)
  const isMapBgm = () => (window.IS && IS.run && IS.run.floor >= IS.DEEP ? 'isdeep' : 'ismap');
  const screenBgm = (name) => (name === 'isrun' ? isMapBgm() : { store: 'shop', headhunt: 'shop', base: 'base', is: 'is' }[name] || 'home');
  function back() {
    const prev = history.pop() || 'home';
    go(prev, undefined, { back: true });
  }
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { go(g.dataset.go); return; }
    if (e.target.closest('[data-back]')) { back(); return; }
    const src = e.target.closest('[data-src]');
    if (src && ITEMS[src.dataset.src]) openSource(src.dataset.src);
  });
  const track = (kind, n = 1) => window.MISSION && MISSION.track(kind, n);

  // =====================================================================
  //  1. 메인 화면
  // =====================================================================
  const totalStars = () => STAGES.reduce((s, st) => s + (save.stars[st.code] || 0), 0);
  const cleared = (st) => (save.stars[st.code] || 0) > 0;
  // 물자 조달: 1-4를 깨면 열리고, 같은 시리즈의 이전 단계를 깨야 다음 단계가 열림
  const unlocked = (i) => {
    const st = STAGES[i];
    if (st.supply) {
      if (!cleared(STAGES[3])) return false;
      const prev = STAGES.find((x) => x.supply === st.supply && x.tier === st.tier - 1);
      return !prev || cleared(prev);
    }
    return i === 0 || cleared(STAGES[i - 1]);
  };
  let voiceIdx = 0, assistantLine = null, greeted = false, lastInput = Date.now(), idleShown = false;
  // 방치 대사: 메인 화면에서 1분 동안 아무 입력이 없으면
  ['pointerdown', 'keydown'].forEach((t) => document.addEventListener(t, () => { lastInput = Date.now(); idleShown = false; }, true));
  setInterval(() => {
    if (current !== 'home' || idleShown || Date.now() - lastInput < 60000) return;
    const a = OPS[save.assistant], t = a && line(a, 'idle');
    if (t) { $('#home-voice-text').textContent = t; idleShown = true; }
  }, 2000);

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
    // 인사: 게임을 켜고 처음 메인 화면에 왔을 때
    if (!greeted) { greeted = true; if (!assistantLine) assistantLine = line(a, 'greet') || null; }
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
  const ASST_MODE = { fixed: '고정', login: '접속할 때마다', daily: '하루에 한 번' };
  function openSettings() {
    resetArmed = false;
    openModal(`<div class="modal-title">설정</div><div class="modal-sub">SETTINGS</div>
      <div class="set-row"><span>효과음</span><button class="btn" id="btn-sound">${window.SFX && SFX.enabled ? '켜짐' : '꺼짐'}</button></div>
      <div class="set-row"><span>배경 음악</span><button class="btn" id="btn-bgm">${window.SFX && SFX.bgmOn ? '켜짐' : '꺼짐'}</button></div>
      <div class="set-row"><span>로비 배경 <small>${esc(save.homeBg === 'random' ? '접속마다 무작위' : (HOME_BGS.find((b) => b[0] === (save.homeBg || 'default')) || HOME_BGS[0])[1])}</small></span><button class="btn" id="btn-homebg">변경</button></div>
      <div class="set-row"><span>비서 교체 <small>비서 ${save.assistants.length}명 · 오퍼레이터 상세에서 추가</small></span><button class="btn" id="btn-asst">${ASST_MODE[save.asstMode || 'fixed']}</button></div>
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
    $('#btn-homebg').addEventListener('click', openBgPicker);
    $('#btn-asst').addEventListener('click', (e) => {
      const ks = Object.keys(ASST_MODE);
      save.asstMode = ks[(ks.indexOf(save.asstMode || 'fixed') + 1) % ks.length];
      writeSave();
      e.target.textContent = ASST_MODE[save.asstMode];
    });
    $('#btn-sound').addEventListener('click', (e) => { e.target.textContent = SFX.toggle() ? '켜짐' : '꺼짐'; });
    $('#btn-bgm').addEventListener('click', (e) => { e.target.textContent = SFX.toggleBgm() ? '켜짐' : '꺼짐'; });
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
    playDialog(STAGES[+i][part], () => {}, STAGES[+i]);
  });
  $('#btn-settings').innerHTML = icon('gear');
  $('#btn-notice').innerHTML = icon('mail');
  $('#btn-archive').innerHTML = icon('book');
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-notice').addEventListener('click', () => openNotice());

  // ---------- 공지 (원작 로비 공지 창 · 패치 내역) ----------
  const NT_TABS = [['patch', '패치 내역', 'wrench'], ['event', '이벤트 공지', 'flag'], ['info', '정보 공지', 'info']];
  const NT_SEEN = 'akau-notice-seen', NT_AUTO = 'akau-notice-auto';
  const ntList = () => (typeof NOTICES !== 'undefined' ? NOTICES : []);
  const ntSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(NT_SEEN) || '[]')); } catch { return new Set(); } };
  function ntMark(id) {
    const s = ntSeen(); if (s.has(id)) return;
    s.add(id); try { localStorage.setItem(NT_SEEN, JSON.stringify([...s])); } catch { /* 저장 불가 */ }
  }
  const ntArt = (a) => (!a ? '' : a.includes('/') ? a : ((OPERATORS.find((o) => o.id === a) || {}).image || ''));
  function ntDot() {
    const seen = ntSeen();
    $('#btn-notice').classList.toggle('has-new', ntList().some((n) => !seen.has(n.id)));
  }
  let ntTab = 'patch', ntSel = null;
  function openNotice(tab, id) {
    const all = ntList();
    if (id) { const n = all.find((x) => x.id === id); if (n) tab = n.tab; }
    ntTab = tab || ntTab;
    const list = all.filter((n) => n.tab === ntTab);
    ntSel = (id && list.find((n) => n.id === id)) || list.find((n) => n.id === (ntSel && ntSel.id)) || list[0] || null;
    const seen = ntSeen();
    const el = $('#notice');
    el.querySelector('.nt-tabs').innerHTML = NT_TABS.map(([k, name, ic]) => {
      const nw = all.some((n) => n.tab === k && !seen.has(n.id));
      return `<button class="nt-tab ${k === ntTab ? 'on' : ''}" data-ntt="${k}">${icon(ic)}<span>${name}</span>${nw ? '<i class="nt-dot"></i>' : ''}</button>`;
    }).join('');
    el.querySelector('.nt-list').innerHTML = list.map((n) => {
      const [, m, d] = n.date.split('-').map(Number);
      return `<button class="nt-item ${n === ntSel ? 'on' : ''}" data-nti="${esc(n.id)}"><span class="nt-date"><b>${d}</b><small>${m}월</small></span><span class="nt-short">${esc(n.short).replace(/\n/g, '<br>')}</span>${seen.has(n.id) ? '' : '<img class="nt-new" src="img/ui/ann_new.png" alt="NEW">'}</button>`;
    }).join('') || '<p class="empty-note">공지가 없습니다.</p>';
    const v = el.querySelector('.nt-view');
    if (ntSel) {
      const n = ntSel, art = ntArt(n.art);
      const body = n.world
        ? `<p>${esc(GAME_INFO.synopsis).replace(/\n/g, '<br>')}</p>`
        : (n.body || []).map((b) => `${b.h ? `<h4>${esc(b.h)}</h4>` : ''}${b.p ? `<p>${esc(b.p)}</p>` : ''}${b.li ? `<ul>${b.li.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`).join('');
      v.innerHTML = `<div class="nt-banner" style="background-image:url('${esc(n.bg || 'img/ui/home_bg.webp')}')">${art ? `<img class="nt-art ${n.art.includes('/') ? 'wide' : ''}" src="${esc(art)}" alt="">` : ''}<b>${esc(n.banner || '공지사항')}</b></div>
        <div class="nt-title">${esc(n.title)}</div>
        <div class="nt-body"><div class="nt-meta">${n.date.replace(/-/g, '.')}</div>${body}</div>`;
      v.scrollTop = 0;
      ntMark(n.id);
      const it = el.querySelector(`[data-nti="${CSS.escape(n.id)}"] .nt-new`); if (it) it.remove();
    } else v.innerHTML = '';
    el.classList.remove('hidden');
    ntDot();
  }
  $('#notice').addEventListener('click', (e) => {
    const t = e.target.closest('[data-ntt]'); if (t) { ntSel = null; openNotice(t.dataset.ntt); return; }
    const i = e.target.closest('[data-nti]'); if (i) { openNotice(null, i.dataset.nti); return; }
    if (e.target.closest('.nt-close') || e.target.id === 'notice') $('#notice').classList.add('hidden');
  });
  ntDot();
  // 새 패치 내역이 있으면 접속 때 한 번 자동으로 열기 (원작처럼)
  {
    const latest = ntList().find((n) => n.tab === 'patch');
    let auto = null; try { auto = localStorage.getItem(NT_AUTO); } catch { /* 저장 불가 */ }
    if (latest && auto !== latest.id && !ntSeen().has(latest.id)) {
      try { localStorage.setItem(NT_AUTO, latest.id); } catch { /* 저장 불가 */ }
      setTimeout(() => { if (current === 'home' && $('#modal').classList.contains('hidden')) openNotice('patch', latest.id); }, 900);
    }
  }
  $('#btn-archive').addEventListener('click', openArchive);
  $('#btn-feedback').innerHTML = icon('feedback');
  $('#btn-feedback').addEventListener('click', () => openFeedback());
  // ---------- 버그 신고 · 건의 ----------
  const SCREEN_NAME = { home: '메인 화면', operators: '오퍼레이터', detail: '오퍼레이터 상세', squad: '편성', ops: '작전', battle: '전투', is: '통합전략', isrun: '통합전략 탐색', store: '구매센터', headhunt: '헤드헌팅', base: '기반시설', depot: '창고', admin: '관리자' };
  let fbType = 'bug', fbDraft = { title: '', body: '' }, fbFiles = [];
  // 첨부 사진은 긴 변 1600px JPEG로 줄여서 올림
  function shrinkImage(file) {
    return new Promise((res) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => { URL.revokeObjectURL(url); res(b || file); }, 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(file); };
      img.src = url;
    });
  }
  function openFeedback(from) {
    const where = SCREEN_NAME[from || current] || from || current || '';
    const mine = ACCOUNT.myFeedback || [];
    const ST = { open: '접수됨', doing: '확인 중', done: '반영 완료', rejected: '보류' };
    openModal(`<div class="modal-title">버그 신고 · 건의</div>
      <div class="modal-sub">보낸 글은 관리자가 보고 하나씩 고칩니다${ACCOUNT.mode === 'online' ? '' : ' · 오프라인이라 이 브라우저에만 저장됩니다'}</div>
      <div class="fb-form">
        <div class="fb-types"><button class="btn small ${fbType === 'bug' ? 'primary' : ''}" data-fbt="bug">🐞 버그 신고</button><button class="btn small ${fbType === 'idea' ? 'primary' : ''}" data-fbt="idea">💡 건의</button></div>
        <input id="fb-title" maxlength="80" placeholder="${fbType === 'bug' ? '무엇이 잘못됐나요? (예: 통합전략 상점에서 구매가 안 됨)' : '어떤 걸 바꾸면 좋을까요?'}">
        <textarea id="fb-body" maxlength="2000" rows="6" placeholder="${fbType === 'bug' ? '언제 · 어디서 · 무엇을 했더니 · 어떻게 됐는지 적어 주세요' : '자세한 내용을 적어 주세요'}"></textarea>
        ${ACCOUNT.canAttach ? `<div class="fb-attach"><label class="btn small">📷 사진 첨부 (최대 ${ACCOUNT.FB_MAX_IMG}장)<input type="file" id="fb-file" accept="image/*" multiple hidden></label><div class="fb-thumbs">${fbFiles.map((f, i) => `<span class="fb-thumb"><img src="${f.url}" alt=""><button data-fbx="${i}" aria-label="빼기">✕</button></span>`).join('')}</div></div>` : ''}
        <label class="fb-where"><input type="checkbox" id="fb-env" checked> 현재 화면(${esc(where || '-')}) · 기기 정보 함께 보내기</label>
        <button class="btn primary" id="fb-send">보내기</button>
      </div>
      <h4 class="fb-mine-title">내가 보낸 글 <small>${mine.length}건</small></h4>
      <div class="fb-mine">${mine.slice(0, 20).map((r, i) => `<div class="fb-item st-${esc(r.status)}"><div class="fb-head"><span class="chip fb-${r.fbType === 'bug' ? 'bug' : 'idea'}">${r.fbType === 'bug' ? '버그' : '건의'}</span><b data-fbt-i="${i}"></b><span class="chip st">${ST[r.status] || esc(r.status || '')}</span><span class="req-time">${new Date(r.at || 0).toLocaleDateString('ko-KR')}</span></div>${(r.imgs || []).length ? `<small class="fb-meta">사진 ${r.imgs.length}장</small>` : ''}${r.reply ? `<p class="fb-reply-view" data-fbr-i="${i}"></p>` : ''}</div>`).join('') || '<p class="empty-note">아직 보낸 글이 없습니다.</p>'}</div>`);
    const body = $('#modal-body');
    body.querySelector('#fb-title').value = fbDraft.title;
    body.querySelector('#fb-body').value = fbDraft.body;
    mine.slice(0, 20).forEach((r, i) => {
      const t = body.querySelector(`[data-fbt-i="${i}"]`); if (t) t.textContent = r.title || '(제목 없음)';
      const rp = body.querySelector(`[data-fbr-i="${i}"]`); if (rp) rp.textContent = '관리자 답변: ' + r.reply;
    });
    const keep = () => { fbDraft = { title: body.querySelector('#fb-title').value, body: body.querySelector('#fb-body').value }; };
    const fileIn = body.querySelector('#fb-file');
    if (fileIn) fileIn.addEventListener('change', () => {
      keep();
      for (const f of [...fileIn.files].filter((x) => x.type.startsWith('image/'))) if (fbFiles.length < ACCOUNT.FB_MAX_IMG) fbFiles.push({ file: f, url: URL.createObjectURL(f) });
      openFeedback(from || current);
    });
    body.querySelectorAll('[data-fbx]').forEach((b) => b.addEventListener('click', () => { keep(); const [x] = fbFiles.splice(+b.dataset.fbx, 1); URL.revokeObjectURL(x.url); openFeedback(from || current); }));
    body.querySelectorAll('[data-fbt]').forEach((b) => b.addEventListener('click', () => { keep(); fbType = b.dataset.fbt; openFeedback(from || current); }));
    body.querySelector('#fb-send').addEventListener('click', async (e) => {
      keep();
      if (!fbDraft.title.trim() && !fbDraft.body.trim()) { toast('내용을 적어 주세요'); return; }
      e.target.disabled = true;
      const env = body.querySelector('#fb-env').checked ? `${window.innerWidth}×${window.innerHeight} · ${(navigator.userAgent.match(/(iPhone|iPad|Android|Windows|Macintosh|Linux)/) || ['기타'])[0]} · ${(navigator.userAgent.match(/(Chrome|Safari|Firefox|Edg)\/[\d.]+/) || [''])[0]}` : '';
      try {
        const files = ACCOUNT.canAttach ? await Promise.all(fbFiles.map((f) => shrinkImage(f.file))) : [];
        await ACCOUNT.sendFeedback({ files, type: fbType, title: fbDraft.title.trim() || fbDraft.body.trim().slice(0, 40), body: fbDraft.body.trim(), where: body.querySelector('#fb-env').checked ? where : '', env });
        fbDraft = { title: '', body: '' };
        fbFiles.forEach((f) => URL.revokeObjectURL(f.url)); fbFiles = [];
        toast('보냈습니다. 고마워요!');
        openFeedback(from || current);
      } catch (err) { console.warn(err); toast('보내지 못했습니다'); e.target.disabled = false; }
    });
  }
  $('#pause-feedback').addEventListener('click', () => openFeedback('battle'));

  // 전체 화면: 주소창과 claude.ai 상단 바를 가림. 브라우저·앱이 허용할 때만 버튼을 보여 줌
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const fsOk = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  async function toggleFullscreen() {
    try {
      if (fsEl()) { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      const el = document.documentElement;
      await (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      // 폰이면 가로로 고정 (지원하는 브라우저만)
      try { await screen.orientation.lock('landscape'); } catch { /* 지원 안 함 */ }
    } catch {
      toast('이 브라우저에서는 전체 화면을 쓸 수 없습니다');
    }
  }
  function fsLabel() {
    const on = !!fsEl();
    $('#btn-fullscreen').innerHTML = icon(on ? 'shrink' : 'fullscreen');
    $('#btn-fullscreen').setAttribute('aria-label', on ? '전체 화면 끝내기' : '전체 화면');
    $('#pause-fullscreen').textContent = on ? '전체 화면 끝내기' : '전체 화면';
  }
  if (fsOk) {
    $('#btn-fullscreen').classList.remove('hidden');
    $('#pause-fullscreen').classList.remove('hidden');
    $('#btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('#pause-fullscreen').addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', fsLabel);
    document.addEventListener('webkitfullscreenchange', fsLabel);
    fsLabel();
  }
  if ($('#tile-archive')) $('#tile-archive').addEventListener('click', openArchive);

  // =====================================================================
  //  2. 오퍼레이터 목록
  // =====================================================================
  let filter = 'all', sortKey = 'rarity', railHidden = false;
  function sortedOps() {
    const list = OPERATORS.filter((o) => owned(o.id) && (filter === 'all' || o.class === filter));
    const byClass = (a, b) => CLASS_ORDER.indexOf(a.class) - CLASS_ORDER.indexOf(b.class);
    if (sortKey === 'class') list.sort(byClass);
    if (sortKey === 'rarity') list.sort((a, b) => (b.rarity || 3) - (a.rarity || 3) || byClass(a, b));
    if (sortKey === 'cost') list.sort((a, b) => b.cost - a.cost || byClass(a, b));
    if (sortKey === 'trust') list.sort((a, b) => trustOf(b.id) - trustOf(a.id) || (b.rarity || 3) - (a.rarity || 3));
    return list;
  }
  RENDER.roster = () => {
    const nav = $('#class-filter');
    $('#roster-body').classList.toggle('rail-hidden', railHidden);
    nav.innerHTML = `<button class="rail-toggle" data-rail="1">${railHidden ? '‹' : '숨기기 ›'}</button><button data-f="all" class="${filter === 'all' ? 'on' : ''}"><b>ALL</b></button>` +
      CLASS_ORDER.map((c) => `<button data-f="${c}" class="${filter === c ? 'on' : ''}" title="${CLASSES[c].name}">${icon(c)}</button>`).join('');
    document.querySelectorAll('#sort-bar button').forEach((b) => b.classList.toggle('on', b.dataset.sort === sortKey));
    const grid = $('#op-grid');
    const list = sortedOps();
    grid.innerHTML = list.map((o) => `<button class="card-btn" data-op="${o.id}">${rosterCardHTML(o)}</button>`).join('') ||
      '<div class="empty-note">보유한 오퍼레이터가 없습니다. 헤드헌팅에서 모집해 보세요.</div>';
  };
  $('#class-filter').addEventListener('click', (e) => {
    if (e.target.closest('[data-rail]')) { railHidden = !railHidden; RENDER.roster(); return; }
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
    const base = OPS[detailId], o = TRAIN.trained(base), pg = TRAIN.prog(base.id), cls = CLASSES[o.class], arch = o.archetype && ARCHETYPES[o.archetype];
    $('#detail-bg').style.setProperty('--c', o.color);
    renderLevel(base, pg);
    $('#detail-art').innerHTML = artHTML(o);
    $('#detail-stats').innerHTML = `
      <span><i>＋</i><b>${o.hp}</b></span><span><i>⌛</i>${redeployText(o.redeploy)} <small>${o.redeploy}s</small></span>
      <span><i>${o.class === 'medic' ? '✚' : '⚔'}</i><b>${o.atk}</b></span><span><i>◆</i>${o.cost}</span>
      <span><i>⛨</i><b>${o.def}</b></span><span><i>✋</i>${o.block}</span>
      <span><i>◈</i><b>${o.res || 0}</b></span><span><i>⚡</i>${speedText(o.interval)}</span>`;
    $('#detail-block').innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < o.block ? 'on' : ''}"></i>`).join('');
    $('#detail-stars').textContent = stars(o.rarity);
    const pot = ACCOUNT.potOf(o.id);
    $('#detail-pot').innerHTML = pot ? `<img src="img/ui/pot_${pot}.png" alt="">잠재 ${pot} · 신뢰도 ${trustOf(o.id)}%` : '미보유';
    $('#detail-en').textContent = o.en || '';
    $('#detail-name').textContent = o.name;
    fitName($('#detail-name'));
    $('#detail-class').innerHTML = `${icon(o.class)}<b>${cls.name}</b>${arch ? `<small>${PRO_IMG.has(o.class) ? `<img class="sub-ico" src="img/ui/sub_${esc(o.archetype)}.png" alt="">` : ''}${esc(arch.name)}</small>` : ''}`;
    $('#detail-range').innerHTML = rangeGridHTML(o.range, 12);
    $('#detail-tags').innerHTML = [(o.tile || cls.tile) === 'ground' ? '지면 배치' : '고지대 배치', ...(o.tags || [])].map((t) => `<span>${esc(t)}</span>`).join('');
    $('#detail-cost').textContent = o.cost;
    const list = skillsOf(base), cur = skillIndex(base), tlist = skillsOf(o);
    const lvTag = (i) => (i > pg.elite ? '' : `<span class="sk-lv ${pg.mst[i] ? 'm' : ''}">${pg.mst[i] ? `특화 ${pg.mst[i]}` : `Lv.${pg.slv}`}</span>`);
    $('#detail-skill').innerHTML = (owned(base.id) ? `<button class="sk-train" id="sk-train">스킬 육성 · 레벨 ${pg.slv}/${TRAIN_RULE.skillMax[pg.elite]}</button>` : '') + list.map((sk0, i) => { const sk = tlist[i] || sk0; return `
      <button class="skill-row ${i === cur ? 'on' : ''} ${i > pg.elite ? 'locked' : ''}" data-skill="${i}">${i > pg.elite ? `<span class="lock-tag">${eliteIcon(i)} ${i}차 정예화 해금</span>` : ''}${lvTag(i)}
        <div class="sk-ico" style="--c:${o.color}"><img src="${skillIcon(sk0, i, o)}" alt=""><b>S${i + 1}</b><small>${sk.spType === 'deploy' ? '배치' : 'SP ' + sk.sp}</small></div>
        <div><b>${esc(sk.name)}</b><em>${SP_TYPE[sk.spType || 'time']} · ${sk.trigger === 'auto' ? '자동 발동' : '수동 발동'}${durText(sk)}</em><p>${esc(sk0.desc)}</p>${sk.power && sk.power < 1 && i <= pg.elite ? `<p class="sk-pow">현재 위력 ${Math.round(sk.power * 100)}% (설명은 특화 3 기준)</p>` : ''}</div>
      </button>`; }).join('') + (list.length > 1 ? '<div class="skill-hint">눌러서 전투에 쓸 스킬을 고르세요</div>' : '');
    $('#detail-talents').innerHTML = `<div class="trait"><span class="chip">특성</span>${esc(arch ? arch.trait : cls.trait)}</div>` +
      (base.talents || []).map((t, i) => `<div class="talent ${i >= pg.elite ? 'locked' : ''}"><b>${esc(t.name)}${i >= pg.elite ? ` <small>${i + 1}차 정예화 해금</small>` : ''}</b><p>${esc(t.desc)}</p></div>`).join('');
    $('#detail-race').textContent = `${o.race} · ${o.faction || cls.name}`;
    $('#detail-profile').innerHTML = profileHTML(base);
    $('#detail-quote').textContent = `“${o.quote}”`;
    const inL = save.assistants.includes(o.id), only = inL && save.assistants.length <= 1;
    $('#detail-assist').textContent = !owned(o.id) ? '미보유 오퍼레이터' : only ? '현재 비서' : inL ? `비서에서 빼기 (${save.assistants.length}/${ASST_MAX})` : `비서 추가 (${save.assistants.length}/${ASST_MAX})`;
    $('#detail-assist').disabled = only || !owned(o.id);
  };
  // ---------- 육성: 레벨 · 정예화 ----------
  const itemCircle = (k, top, bottom, cls = '') => `<div class="tv-item ${cls}"><span class="tv-ring">${`<i class="ri ${esc(k)} big"></i>`}<b>${top}</b></span><small>${bottom}</small></div>`;
  function renderLevel(def, pg) {
    const max = TRAIN.maxLevel(pg.elite), need = pg.level < max ? TRAIN.expNeed(pg.elite, pg.level) : 0, own = owned(def.id);
    $('#detail-lv').innerHTML = `
      <div class="lvw-ring"><small>LV</small><b>${pg.level}</b></div><span class="lvw-max">/${max}</span>
      <div class="lvw-exp"><small>EXP</small><span><em>${pg.level < max ? pg.exp : '-'}</em>/${pg.level < max ? need : 'MAX'}</span><i style="width:${need ? (pg.exp / need) * 100 : 100}%"></i></div>
      <button class="lvw-plus" id="lv-open" ${own && pg.level < max ? '' : 'disabled'} aria-label="레벨업">＋</button>
      <button class="lvw-elite e${pg.elite}" id="elite-open" ${own ? '' : 'disabled'}>${eliteIcon(pg.elite)}<span>정예화 ${pg.elite}단계</span></button>`;
  }
  let lvTarget = 1;
  const statRows = (a, b) => [['최대 체력', 'hp'], ['공격', 'atk'], ['방어', 'def'], ['마법 저항', 'res']].map(([n, k]) => `<div><span>${n}</span><b>${a[k] || 0}</b><i>→</i><b class="${(b[k] || 0) > (a[k] || 0) ? 'up' : ''}">${b[k] || 0}</b></div>`).join('');
  function openLevelUp() {
    const def = OPS[detailId], pg = TRAIN.prog(def.id), max = TRAIN.maxLevel(pg.elite);
    if (pg.level >= max) { toast('이미 최대 레벨입니다. 정예화하면 더 올릴 수 있습니다'); return; }
    // 가진 작전기록으로 오를 수 있는 최대 레벨
    const allExp = TRAIN_RULE.expItems.reduce((sum, k) => sum + ACCOUNT.bal(k) * ITEMS[k].exp, 0);
    const reach = TRAIN.levelAfter(def.id, allExp).level;
    lvTarget = Math.max(pg.level + 1, Math.min(lvTarget > pg.level ? lvTarget : reach, max));
    const need = TRAIN.expTo(def.id, lvTarget), pick = TRAIN.pickRecords(need);
    const after = TRAIN.levelAfter(def.id, pick.exp), lmd = TRAIN.lmdFor(pick.exp), lmdShort = ACCOUNT.bal('lmd') < lmd;
    const cur = TRAIN.trained(def), nxt = TRAIN.trained(def, { elite: pg.elite, level: after.level, exp: after.exp });
    const v = $('#train-view');
    v.className = 'train-view lvup';
    v.style.setProperty('--c', def.color);
    v.innerHTML = `
      <button class="nav-btn tv-back" data-tvclose aria-label="뒤로">${icon('back')}</button>
      <div class="tv-art">${artHTML(def)}</div>
      <div class="tv-panel">
        <div class="tv-update">UPDATE -</div>
        <div class="tv-stats">${statRows(cur, nxt)}</div>
        <div class="tv-target"><div><span>목표 레벨</span><b>LV ${after.level}</b></div><div class="tv-exp">EXP- <em>${after.exp}</em>/${after.level < max ? TRAIN.expNeed(pg.elite, after.level) : 'MAX'}</div>
          ${pick.short ? '<div class="tv-warn">작전기록이 부족해 목표 레벨까지 올릴 수 없습니다</div>' : ''}${lmdShort ? '<div class="tv-warn">용문폐가 부족합니다</div>' : ''}</div>
      </div>
      <div class="tv-items">${TRAIN_RULE.expItems.map((k) => itemCircle(k, ACCOUNT.bal(k), (pick.use[k] || 0) ? `사용 ${pick.use[k]}` : '&nbsp;', (pick.use[k] || 0) ? 'on' : '')).join('')}
        <span class="tv-sep"></span>${itemCircle('lmd', lmd >= 10000 ? (lmd / 10000).toFixed(1) + '만' : lmd, `보유 ${ACCOUNT.bal('lmd') >= 10000 ? (ACCOUNT.bal('lmd') / 10000).toFixed(1) + '만' : ACCOUNT.bal('lmd')}`, lmdShort ? 'short' : '')}</div>
      <div class="tv-dial" id="tv-dial">
        <button class="tv-up" data-lv="1" aria-label="레벨 올리기">${lvTarget < max ? lvTarget + 1 : ''}</button>
        <div class="tv-big">${lvTarget}</div>
        <div class="tv-ring"><small>LV</small><b>${pg.level}</b></div>
        <button class="tv-down" data-lv="-1" aria-label="레벨 내리기">︾</button>
        <small class="tv-hint">레벨을 바꾸면 작전기록이 자동으로 선택됩니다</small>
      </div>
      <div class="tv-side"><button class="tv-max" data-lvmax>MAX ${max}</button><span class="tv-target-tag">TARGET</span></div>
      <button class="tv-go" id="tv-lvgo" ${pick.exp && !lmdShort && after.level > pg.level ? '' : 'disabled'}>︽ 레벨업</button>`;
    v.dataset.use = JSON.stringify(pick.use);
  }
  function openElite() {
    const def = OPS[detailId], pg = TRAIN.prog(def.id);
    const v = $('#train-view');
    v.className = 'train-view elite';
    v.style.setProperty('--c', def.color);
    if (pg.elite >= 2) {
      v.innerHTML = `<button class="nav-btn tv-back" data-tvclose aria-label="뒤로">${icon('back')}</button><div class="tv-art big">${artHTML(def)}</div>
        <div class="el-band"><div class="el-step"><b>2</b><span>정예화 단계</span></div><div class="el-ico">${eliteIcon(2)}</div><div class="el-gain">최고 정예화 단계입니다.<br>모든 스킬과 재능이 열려 있습니다.</div></div>`;
      return;
    }
    const to = pg.elite + 1, cost = TRAIN.promoteCost(def, to), max = TRAIN.maxLevel(pg.elite);
    const sk = skillsOf(def)[to], tal = (def.talents || [])[pg.elite];
    const gains = [`최대 레벨 ${max} → ${TRAIN.maxLevel(to)}`, '최대 스탯 상승'];
    if (TRAIN_RULE.costDown[pg.elite] > TRAIN_RULE.costDown[to]) gains.push(`배치 코스트 <em class="r">${TRAIN_RULE.costDown[pg.elite] - TRAIN_RULE.costDown[to]}</em> 증가`);
    if (sk) gains.push(`신규 스킬 <em>${esc(sk.name)}</em> 획득`);
    if (tal) gains.push(`신규 재능 <em>${esc(tal.name)}</em> 획득`);
    const lvOk = pg.level >= max, lmdOk = ACCOUNT.bal('lmd') >= cost.lmd;
    const fmtN = (n) => Number(n).toLocaleString('ko-KR');
    const req = [`<div class="tv-item ${lvOk ? '' : 'short'}"><span class="tv-ring lvr"><b>${max}</b><small>레벨</small></span><small class="${lvOk ? '' : 'bad'}"><em>${pg.level}</em>/${max}</small></div>`,
      `<div class="tv-item" data-src="lmd"><span class="tv-ring"><i class="ri lmd big"></i></span><small class="tag ${lmdOk ? '' : 'bad'}">${fmtN(cost.lmd)}</small></div>`]
      .concat(Object.entries(cost.items).map(([k, n]) => { const have = ACCOUNT.bal(k); return `<div class="tv-item ${have >= n ? '' : 'lack'}" data-src="${esc(k)}" title="${esc(ITEMS[k].name)} — 눌러서 획득처 보기"><span class="tv-ring"><i class="ri ${esc(k)} big"></i></span><small class="tag ${have >= n ? '' : 'bad'}"><em>${have}</em>/${n}</small><span class="tv-iname">${esc(ITEMS[k].name)}</span></div>`; }));
    const chk = TRAIN.canPromote(def);
    v.innerHTML = `
      <button class="nav-btn tv-back" data-tvclose aria-label="뒤로">${icon('back')}</button>
      <div class="tv-art big">${artHTML(def)}</div>
      <div class="el-band">
        <div class="el-step"><b>${pg.elite}</b><span>정예화 단계</span></div><div class="el-ico small">${eliteIcon(pg.elite)}</div>
        <div class="el-arrow"></div>
        <div class="el-ico">${eliteIcon(to)}</div><div class="el-step"><b>${to}</b><span>정예화 단계</span></div>
        <div class="el-gain">${gains.join('<br>')}</div>
      </div>
      <div class="el-req">${req.join('')}</div>
      <div class="el-ask"><p>${chk.ok ? '계속 진행하시겠습니까?' : esc(chk.why)}</p>
        <div class="el-btns"><button class="el-no" data-tvclose aria-label="취소">✕</button><button class="el-yes" id="tv-elgo" ${chk.ok ? '' : 'disabled'} aria-label="정예화">✓</button></div></div>`;
  }
  const closeTrain = () => { $('#train-view').classList.add('hidden'); RENDER.detail(); };
  $('#detail-lv').addEventListener('click', (e) => {
    if (e.target.closest('#lv-open')) { lvTarget = 0; openLevelUp(); }
    else if (e.target.closest('#elite-open')) openElite();
  });
  $('#train-view').addEventListener('click', (e) => {
    if (e.target.closest('[data-tvclose]')) { closeTrain(); return; }
    const pg = TRAIN.prog(detailId), max = TRAIN.maxLevel(pg.elite);
    const st = e.target.closest('[data-lv]');
    if (st) { lvTarget = Math.max(pg.level + 1, Math.min(max, lvTarget + +st.dataset.lv)); openLevelUp(); return; }
    if (e.target.closest('[data-lvmax]')) { lvTarget = max; openLevelUp(); return; }
    if (e.target.closest('#tv-lvgo')) {
      const r = TRAIN.levelUp(OPS[detailId], JSON.parse($('#train-view').dataset.use || '{}'));
      if (!r.ok) { toast(r.why); return; }
      sfx('levelup');
      track('train');
      toast(`레벨 ${r.from} → ${r.to}`);
      closeTrain();
      return;
    }
    if (e.target.closest('#tv-elgo')) {
      const def = OPS[detailId], r = TRAIN.promote(def);
      if (!r.ok) { toast(r.why); return; }
      sfx('skill');
      track('train'); track('promote');
      const p2 = TRAIN.prog(def.id);
      toast(`${def.name} — ${p2.elite}차 정예화 완료!`);
      if (def.voice && def.voice['elite' + p2.elite]) say(def, 'elite' + p2.elite);
      closeTrain();
    }
  });
  // 레벨 다이얼: 휠로 목표 레벨 바꾸기
  $('#train-view').addEventListener('wheel', (e) => {
    if (!e.target.closest('#tv-dial')) return;
    e.preventDefault();
    const pg = TRAIN.prog(detailId), max = TRAIN.maxLevel(pg.elite);
    lvTarget = Math.max(pg.level + 1, Math.min(max, lvTarget + (e.deltaY < 0 ? 1 : -1)));
    openLevelUp();
  }, { passive: false });

  function stepDetail(d) {
    const list = sortedOps().length ? sortedOps() : OPERATORS;
    let i = list.findIndex((o) => o.id === detailId);
    i = (i + d + list.length) % list.length;
    RENDER.detail(list[i].id);
  }
  // 스킬 육성 창: 스킬 레벨(공통) · 스킬별 특화
  function costHTML(c) {
    if (!c) return '';
    const items = { lmd: c.lmd, ...c.items };
    return `<div class="st-cost">${Object.entries(items).map(([k, n]) => { const have = ACCOUNT.bal(k); return `<span class="${have >= n ? '' : 'bad'}" data-src="${k}" title="${esc(ITEMS[k].name)} — 눌러서 획득처 보기"><i class="ri ${k}"></i>${k === 'lmd' ? n.toLocaleString('ko-KR') : `${have}/${n}`}</span>`; }).join('')}</div>`;
  }
  function openSkillTrain() {
    const def = OPS[detailId], p = TRAIN.prog(def.id), max = TRAIN_RULE.skillMax[p.elite];
    const up = TRAIN.skillUpCost(def, p), list = skillsOf(def);
    const rows = list.map((sk, i) => {
      if (i > p.elite) return `<div class="st-row dim"><b>S${i + 1} ${esc(sk.name)}</b><span>${i}차 정예화 후 열림</span></div>`;
      const mc = TRAIN.masteryCost(def, i, p);
      return `<div class="st-row"><b>S${i + 1} ${esc(sk.name)}</b><span class="st-m">${[1, 2, 3].map((m) => `<i class="${p.mst[i] >= m ? 'on' : ''}"></i>`).join('')} 특화 ${p.mst[i]}/3 · 위력 ${Math.round(TRAIN.skillPower(p.slv, p.mst[i]) * 100)}%</span>
        ${mc ? `${costHTML(mc)}<button class="btn small primary" data-master="${i}">특화 ${p.mst[i] + 1}</button>` : `<small>${p.mst[i] >= 3 ? '최고 단계' : '2차 정예화 · 스킬 레벨 7이 필요'}</small>`}</div>`;
    }).join('');
    openModal(`<div class="modal-title">${esc(def.name)} — 스킬 육성</div><div class="modal-sub">스킬 레벨은 모든 스킬에 함께 적용되고, 특화는 스킬마다 따로 올립니다</div>
      <div class="st-rank"><div class="st-lv"><small>스킬 레벨</small><b>${p.slv}</b><span>/${max}</span></div>
        <div class="st-bars">${[1, 2, 3, 4, 5, 6, 7].map((l) => `<i class="${l <= p.slv ? 'on' : l > max ? 'lock' : ''}"></i>`).join('')}</div>
        ${up ? `${costHTML(up)}<button class="btn primary" id="st-up">레벨 ${p.slv + 1}로</button>` : `<small>${p.slv >= 7 ? '최고 레벨' : '1차 정예화를 하면 레벨 7까지 올릴 수 있습니다'}</small>`}</div>
      <div class="st-list">${rows}</div>`);
    const go2 = (r) => { if (!r.ok) { toast(r.why); return; } sfx('select'); track('train'); openSkillTrain(); RENDER.detail(); };
    const u = $('#st-up'); if (u) u.addEventListener('click', () => go2(TRAIN.skillUp(def)));
    document.querySelectorAll('[data-master]').forEach((b) => b.addEventListener('click', () => go2(TRAIN.master(def, +b.dataset.master))));
  }
  $('#detail-skill').addEventListener('click', (e) => {
    if (e.target.closest('#sk-train')) { openSkillTrain(); return; }
    const b = e.target.closest('[data-skill]');
    if (!b) return;
    if (b.classList.contains('locked')) { toast(`${b.dataset.skill}차 정예화를 하면 쓸 수 있습니다`); return; }
    save.skills[detailId] = +b.dataset.skill;
    writeSave();
    RENDER.detail();
  });
  $('#detail-prev').addEventListener('click', () => stepDetail(-1));
  $('#detail-next').addEventListener('click', () => stepDetail(1));
  $('#detail-assist').addEventListener('click', () => {
    const l = save.assistants;
    if (l.includes(detailId)) {
      save.assistants = l.filter((id) => id !== detailId);
      if (save.assistant === detailId) save.assistant = save.assistants[0];
      writeSave(); RENDER.detail();
      toast(`${OPS[detailId].name}을(를) 비서에서 뺐습니다`);
      return;
    }
    if (l.length >= ASST_MAX) { toast(`비서는 ${ASST_MAX}명까지 지정할 수 있습니다`); return; }
    l.push(detailId);
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
    ['combat', '전투 중'], ['hard', '고난이도 작전 완료'], ['clear', '작전 완료(별 3개)'], ['clear2', '작전 완료(별 3개 미만)'], ['fail', '작전 실패'],
    ['base', '시설 배치'], ['touch', '터치'], ['trustTouch', '신뢰 터치'], ['idle', '방치'], ['greet', '인사'],
    ['study', '작전기록 학습'], ['elite1', '1차 정예화'], ['elite2', '2차 정예화'], ['newyear', '새해'], ['birthday', '생일'], ['anniv', '애니버서리']];
  // ---------- 의상 (스킨) ----------
  const skinsOf = (id) => (typeof SKINS !== 'undefined' ? SKINS : []).filter((k) => k.op === id);
  const skinSave = () => { save.skins = save.skins || { owned: [], wear: {} }; return save.skins; };
  const ownsSkin = (sid) => skinSave().owned.includes(sid);
  // 입고 있는 의상의 그림을 오퍼레이터 그림으로 씀 (전투·카드·대화 모두 같은 그림)
  function applySkins() {
    const sv = skinSave();
    for (const o of OPERATORS) {
      if (o.baseImage === undefined) o.baseImage = o.image || null;
      const sk = skinsOf(o.id).find((k) => k.id === sv.wear[o.id] && sv.owned.includes(k.id));
      o.image = sk ? sk.image : o.baseImage || undefined;
      o.skin = sk ? sk.id : null;
    }
  }
  function buySkin(sk, after) {
    const o = OPS[sk.op];
    openModal(`<div class="modal-title">의상 구매</div><div class="modal-sub">OUTFIT</div>
      <div class="skin-buy"><img src="${esc(sk.image)}" alt=""><div><b>${esc(sk.name)}</b><small>${esc(sk.brand || '')} · ${esc(o ? o.name : '')}</small><p>${esc(sk.desc || '')}</p></div></div>
      <p class="modal-text">오리지늄 ${sk.price}개로 구매합니다. 보유 오리지늄 ${ACCOUNT.bal('originite')}</p>
      <div class="panel-btns"><button class="btn primary" id="skin-go">구매</button><button class="btn" id="skin-no">취소</button></div>`);
    $('#skin-no').addEventListener('click', () => (after ? after() : closeModal()));
    $('#skin-go').addEventListener('click', () => {
      if (!ACCOUNT.spend({ originite: sk.price })) { toast('오리지늄이 부족합니다'); return; }
      const sv = skinSave();
      if (!sv.owned.includes(sk.id)) sv.owned.push(sk.id);
      if (OPS[sk.op] && owned(sk.op)) sv.wear[sk.op] = sk.id;
      writeSave(); applySkins();
      sfx('select');
      toast(`의상 「${sk.name}」을(를) 구매했습니다`);
      if (after) after(); else closeModal();
      if (current !== 'battle' && RENDER[current]) RENDER[current](undefined, { back: true, refresh: true });
    });
  }
  function openSkins(id) {
    const o = OPS[id], sv = skinSave(), list = skinsOf(id);
    const cur = o.skin || 'base';
    const row = (sid, img, name, sub, state) => `<button class="skin-card ${cur === sid ? 'on' : ''}" data-skin="${esc(sid)}">
        <span class="skin-img" style="--c:${o.color}">${img ? `<img src="${esc(img)}" alt="">` : ''}</span><b>${esc(name)}</b><small>${esc(sub)}</small><em>${state}</em></button>`;
    const cards = [row('base', o.baseImage, '기본 의상', '오퍼레이터 기본 복장', cur === 'base' ? '착용 중' : '착용')]
      .concat(list.map((k) => row(k.id, k.image, k.name, k.brand || '', cur === k.id ? '착용 중' : ownsSkin(k.id) ? '착용' : `오리지늄 ${k.price}`)));
    openModal(`<div class="modal-title">${esc(o.name)} — 의상</div><div class="modal-sub">${list.length ? '의상을 눌러 갈아입거나 구매하세요' : '아직 이 오퍼레이터의 의상이 없습니다'}</div><div class="skin-grid">${cards.join('')}</div>`);
    document.querySelectorAll('[data-skin]').forEach((b) => b.addEventListener('click', () => {
      const sid = b.dataset.skin, sk = list.find((k) => k.id === sid);
      if (sid !== 'base' && !ownsSkin(sid)) { buySkin(sk, () => openSkins(id)); return; }
      if (!owned(id)) { toast('보유한 오퍼레이터만 갈아입을 수 있습니다'); return; }
      if (sid === 'base') delete sv.wear[id]; else sv.wear[id] = sid;
      writeSave(); applySkins(); sfx('select');
      openSkins(id);
      RENDER.detail();
    }));
  }
  // 프로필: 첫 문단은 기본 정보, 나머지는 신뢰도에 따라 「기록 N」으로 열림
  const recordNeed = (i, n) => { const [lo, hi] = TRAIN_RULE.recordTrust; return n <= 2 ? lo : Math.round((lo + ((hi - lo) * (i - 1)) / (n - 2)) / 5) * 5; };
  function profileHTML(o) {
    const paras = String(o.profile || '').split('\n\n'), t = trustOf(o.id);
    return paras.map((txt, i) => {
      if (!i) return `<span class="pf-sec"><b>기본 정보</b>${esc(txt)}</span>`;
      const need = recordNeed(i, paras.length);
      return t >= need ? `<span class="pf-sec"><b>기록 ${i}</b>${esc(txt)}</span>` : `<span class="pf-sec locked"><b>기록 ${i}</b>${icon('lock')} 신뢰도 ${need}% 달성 시 열람 가능</span>`;
    }).join('');
  }
  // 잠재 · 신뢰도 효과 창 (상세 화면의 잠재 표시를 눌러 열기)
  function openPotTrust(id) {
    const o = OPS[id], pot = ACCOUNT.potOf(id), t = trustOf(id);
    if (!pot) { toast('보유하지 않은 오퍼레이터입니다'); return; }
    const pct = (v) => `${Math.round(v * 1000) / 10}%`;
    const fx = (b) => [b.cost && `배치 코스트 -${b.cost}`, b.redeploy && `재배치 시간 -${b.redeploy}초`, b.atk && `공격력 +${pct(b.atk)}`, b.hp && `HP +${pct(b.hp)}`, b.def && `방어력 +${pct(b.def)}`].filter(Boolean).join(' · ');
    const name = { atk: '공격력', hp: 'HP', def: '방어력' };
    const tb = TRAIN.trustBonus(o, t), tm = TRAIN.trustMax(o);
    openModal(`<div class="modal-title">${esc(o.name)} — 잠재 · 신뢰도</div><div class="modal-sub">헤드헌팅에서 중복으로 얻으면 잠재가 오르고, 작전에서 쓴 이성만큼 신뢰도가 오릅니다</div>
      <div class="pt-sec"><b>잠재 ${pot}/6</b><div class="pt-list">${TRAIN.potList(o).map((b, i) => `<div class="pt-row ${pot >= i + 2 ? 'on' : ''}"><span class="pt-lv">${i + 2}</span>${fx(b)}</div>`).join('')}</div></div>
      <div class="pt-sec"><b>신뢰도 ${t}%</b><div class="pt-bar"><i style="width:${Math.min(100, t / 2)}%"></i><em style="left:50%">100%</em></div>
        <p class="pt-note">신뢰도 100%까지 능력치가 오르고(현재 ${Object.keys(tm).map((k) => `${name[k]} +${pct(tb[k])} / 최대 ${pct(tm[k])}`).join(' · ')}), 100% 이후로는 음성 기록과 승진 후 대화가 열립니다.</p>
        <p class="pt-note">프로필 기록: ${String(o.profile || '').split('\n\n').slice(1).map((_, i, a) => `기록 ${i + 1} ${recordNeed(i + 1, a.length + 1)}%`).join(' · ') || '없음'}</p></div>`);
  }
  $('#detail-pot').addEventListener('click', () => openPotTrust(detailId));
  // 오퍼레이터 파일: 기본 정보 · 체검 보고서(medical) · 기록 1~N(프로필 문단, 신뢰도) · 승진 기록(2차 정예화)
  function openFile(id, tab = 0) {
    const o = OPS[id], t = trustOf(id), pg = TRAIN.prog(id), own = owned(id);
    const paras = String(o.profile || '').split('\n\n');
    const real = (paras[0].match(/본명 ([^.,]+)/) || [])[1];
    const cls = CLASSES[o.class], arch = o.archetype && ARCHETYPES[o.archetype];
    const at = own && save.owned && save.owned[id] && save.owned[id].at;
    const tabs = [{ name: '기본 정보', html: `<table class="fl-tbl">${[['코드네임', o.name], real && ['본명', real], ['영문', o.en], ['종족', o.race], ['소속', o.faction],
      ['직군', `${cls.name}${arch ? ' · ' + arch.name : ''}`], ['레어도', '★'.repeat(o.rarity || 3)], ['태그', (o.tags || []).join(' · ')], at && ['합류일', new Date(at).toLocaleDateString('ko-KR')]]
      .filter((r) => r && r[1]).map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table><p class="fl-txt">${esc(paras[0])}</p>` }];
    if (o.medical) tabs.push({ name: '체검 보고서', need: 10, html: `<p class="fl-txt">${esc(o.medical)}</p>` });
    paras.slice(1).forEach((txt, i) => tabs.push({ name: `기록 ${i + 1}`, need: recordNeed(i + 1, paras.length), html: `<p class="fl-txt">${esc(txt)}</p>` }));
    const promo = o.promoRecord || (o.voice && o.voice.promo && [].concat(o.voice.promo).join('\n\n'));
    if (promo) tabs.push({ name: '승진 기록', elite: 2, html: `<p class="fl-txt">${esc(promo)}</p>` });
    const lockOf = (tb) => (!own ? '보유하지 않은 오퍼레이터입니다' : tb.need && t < tb.need ? `신뢰도 ${tb.need}% 달성 시 열람 가능` : tb.elite && pg.elite < tb.elite ? `${tb.elite}차 정예화 후 열람 가능` : '');
    tab = Math.min(tab, tabs.length - 1);
    const lk = tab ? lockOf(tabs[tab]) : '';
    openModal(`<div class="fl-wrap" style="--c:${o.color}">
      <div class="fl-head"><small>OPERATOR FILE · ${esc(o.en || '')}</small><b>${esc(o.name)}</b><span>신뢰도 ${t}%</span></div>
      <div class="fl-body"><nav class="fl-tabs">${tabs.map((tb, i) => `<button class="${i === tab ? 'on' : ''} ${i && lockOf(tb) ? 'locked' : ''}" data-ftab="${i}">${i && lockOf(tb) ? icon('lock') : ''}${tb.name}</button>`).join('')}</nav>
        <div class="fl-main">${lk ? `<div class="fl-lock">${icon('lock')}<b>${esc(tabs[tab].name)}</b><span>${lk}</span></div>` : tabs[tab].html}</div></div></div>`);
    $('#modal').dataset.kind = 'file';
    $('#modal-body').querySelectorAll('[data-ftab]').forEach((b) => b.addEventListener('click', () => openFile(id, +b.dataset.ftab)));
  }
  $('#detail-file').addEventListener('click', () => openFile(detailId));
  $('#detail-skin').addEventListener('click', () => openSkins(detailId));
  $('#detail-voice').addEventListener('click', () => {
    const o = OPS[detailId];
    const v = o.voice || { talk: o.voices || [], deploy: [o.quote] };
    const t = trustOf(o.id);
    const sv = (o.skills || []).map((sk, i) => sk.voice && `<div class="vrow"><b>${i + 1}스킬 발동 — ${esc(sk.name)}</b><p>${esc(sk.voice)}</p></div>`).filter(Boolean).join('');
    const rows = VOICE_LABEL.flatMap(([k, label]) => {
      const list = [].concat(v[k] || []).filter(Boolean);
      return list.map((txt, i) => {
        const need = VOICE_UNLOCK[k] || (k === 'trustTouch' ? 100 : 0), locked = t < need;
        return `<div class="vrow ${locked ? 'locked' : ''}"><b>${label}${list.length > 1 ? ' ' + (i + 1) : ''}</b><p>${locked ? `신뢰도 ${need}% 달성 시 해금` : esc(txt)}</p></div>`;
      });
    }).join('') + sv;
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
    if (pressed) { pressed = false; return; }   // 꾹 누르기로 정보 창을 연 경우
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
  // 빠른 편성: 보유 오퍼레이터를 한 화면에서 여러 명 골라 한꺼번에 편성 (누른 순서대로)
  let quickSel = [];
  const quickOrder = () => ownedOps().sort((a, b) => (b.rarity || 3) - (a.rarity || 3) || CLASS_ORDER.indexOf(a.class) - CLASS_ORDER.indexOf(b.class));
  function renderQuick() {
    const list = quickOrder();
    openModal(`<div class="modal-title">빠른 편성</div><div class="modal-sub">누른 순서대로 편성됩니다 · <b id="quick-n">${quickSel.length}</b>/${SQUAD_MAX}</div>
      <div class="pick-grid quick-grid">${list.map((o) => { const n = quickSel.indexOf(o.id); return `<button class="card-btn ${n >= 0 ? 'picked' : ''}" data-quick="${o.id}">${cardHTML(o, 'small')}${n >= 0 ? `<span class="quick-no">${n + 1}</span>` : ''}</button>`; }).join('')}</div>
      <div class="panel-btns quick-btns"><button class="btn primary" id="quick-ok">편성 확인</button><button class="btn" id="quick-auto">자동 선택</button><button class="btn" id="quick-none">전체 해제</button></div>`);
    $('#modal').dataset.kind = 'quick';
  }
  $('#btn-quick').addEventListener('click', () => { quickSel = save.squad.filter((id) => owned(id)); renderQuick(); });
  $('#modal-body').addEventListener('click', (e) => {
    if ($('#modal').dataset.kind !== 'quick') return;
    const q = e.target.closest('[data-quick]');
    if (q) {
      const id = q.dataset.quick, i = quickSel.indexOf(id);
      if (i >= 0) quickSel.splice(i, 1);
      else if (quickSel.length >= SQUAD_MAX) { toast(`최대 ${SQUAD_MAX}명까지 편성할 수 있습니다`); return; }
      else quickSel.push(id);
      const sc = $('.quick-grid').scrollTop;
      renderQuick();
      $('.quick-grid').scrollTop = sc;
      return;
    }
    if (e.target.closest('#quick-auto')) { quickSel = quickOrder().map((o) => o.id).slice(0, SQUAD_MAX); renderQuick(); return; }
    if (e.target.closest('#quick-none')) { quickSel = []; renderQuick(); return; }
    if (e.target.closest('#quick-ok')) {
      save.squad = quickSel.slice(0, SQUAD_MAX);
      writeSave();
      closeModal();
      renderFormation();
      if (save.squad[0]) say(OPS[save.squad[0]], 'leader');
      toast('빠른 편성을 완료했습니다');
    }
  });
  // 편성된 오퍼레이터를 꾹 누르면 정보 창
  let pressT = null, pressed = false;
  function opInfo(id) {
    const o = OPS[id], cls = CLASSES[o.class], arch = o.archetype && ARCHETYPES[o.archetype];
    const list = skillsOf(o), cur = skillIndex(o);
    openModal(`<div class="opinfo" style="--c:${o.color}">
      <div class="opinfo-art">${artHTML(o)}</div>
      <div class="opinfo-main">
        <div class="modal-title">${esc(o.name)} <small>${stars(o.rarity)}</small></div>
        <div class="modal-sub">${esc(cls.name)}${arch ? ' · ' + esc(arch.name) : ''} · ${esc(o.race || '')} · 잠재 ${ACCOUNT.potOf(o.id)} · 신뢰도 ${trustOf(o.id)}%</div>
        <div class="opinfo-stats"><span>체력 <b>${o.hp}</b></span><span>공격 <b>${o.atk}</b></span><span>방어 <b>${o.def}</b></span><span>마항 <b>${o.res || 0}</b></span><span>코스트 <b>${o.cost}</b></span><span>저지 <b>${o.block}</b></span><span>재배치 <b>${o.redeploy}s</b></span><span>공격 범위 ${rangeGridHTML(o.range, 9)}</span></div>
        <div class="opinfo-sec"><b>특성</b><p>${esc(arch ? arch.trait : cls.trait)}</p></div>
        ${list.length ? `<div class="opinfo-sec"><b>스킬 ${cur + 1} · ${esc(list[cur].name)}</b><p>${esc(list[cur].desc)}</p></div>` : ''}
        ${(o.talents || []).map((t) => `<div class="opinfo-sec"><b>재능 · ${esc(t.name)}</b><p>${esc(t.desc)}</p></div>`).join('')}
        <div class="panel-btns"><button class="btn primary" id="opinfo-detail">상세 보기</button></div>
      </div></div>`);
    $('#modal').dataset.kind = 'opinfo';
    $('#opinfo-detail').addEventListener('click', () => { closeModal(); go('detail', id); });
    sfx('select');
  }
  $('#slot-grid').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.slot.filled');
    pressed = false;
    clearTimeout(pressT);
    if (!b) return;
    pressT = setTimeout(() => { pressed = true; const id = save.squad[+b.dataset.slot]; if (id) opInfo(id); }, 500);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => $('#slot-grid').addEventListener(ev, () => clearTimeout(pressT)));
  $('#slot-grid').addEventListener('contextmenu', (e) => { if (e.target.closest('.slot.filled')) e.preventDefault(); });
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
    const run = () => window.Battle.begin(idx, squad, { defs: squad.map((id) => TRAIN.trained(OPS[id])) });
    if (!skipStory && st.before && st.before.length && !(save.stars[st.code] > 0)) playDialog(st.before, run, st);
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
    if (!win) { ACCOUNT.addSanity(cost - 1); track('sanity', 1); return `이성 ${cost - 1} 반환`; }
    trackBattle(st, 1);
    // 원작처럼 소모한 이성만큼 편성 오퍼레이터의 신뢰도 상승 (최대 200%)
    save.trust = save.trust || {};
    for (const id of squadIds) save.trust[id] = Math.min(200, (save.trust[id] || 0) + cost);
    const first = !(save.stars[st.code] > 0);
    const reward = rewardFor(st, idx, starCount, first);
    ACCOUNT.earn(reward);
    return Object.entries(reward).map(([k, v]) => `${ITEMS[k].name} +${v}${k === 'originite' ? ' (첫 클리어)' : ''}`).join(' · ') + ` · 신뢰도 +${cost}%`;
  }
  // 훈련장: 지금 편성으로, 목숨이 줄지 않는 연습 작전
  function startPractice() {
    fixPlayer();
    const squad = [...save.squad];
    if (!squad.length) { toast('편성된 오퍼레이터가 없습니다. 편성에서 오퍼레이터를 골라 주세요'); return; }
    sfx('select');
    window.Battle.begin(PRACTICE_STAGE, squad, {
      defs: squad.map((id) => TRAIN.trained(OPS[id])), practice: true,
      onEnd: (r) => ({ text: `훈련 종료 · 처치 ${r.killed}`, buttons: [{ label: '다시 훈련', cls: 'primary', fn: startPractice }, { label: '편성', fn: () => go('formation') }, { label: '작전 목록', fn: () => go('operations') }] }),
    });
  }
  function rewardFor(st, idx, starCount, first) {
    if (st.supply) return TRAIN.supplyDrops(st, starCount);
    const reward = TRAIN.stageDrops({ ...st, sanity: sanityCost(st) }, idx, starCount, first);
    if (first) reward.originite = 1;
    return reward;
  }
  function onBattleQuit(idx) { ACCOUNT.addSanity(sanityCost(STAGES[idx]) - 1); track('sanity', 1); }
  function trackBattle(st, n) {
    track('battle', n);
    track('sanity', sanityCost(st) * n);
    const sr = seriesOf(st);
    if (sr) track(sr.tab, n);
  }
  const sfx = (n) => window.SFX && SFX.play(n);

  // =====================================================================
  //  5. 작전 목록
  // =====================================================================
  let opSel = 0;
  const NODE_Y = [40, 40, 66, 30, 58];

  let chapterSel = null;
  // 하단 탭: main(메인 스토리) · supply(물자 비축) · chip(칩 탐색). seriesSel: 고른 시리즈 (없으면 카드 목록)
  let opsMode = 'main', seriesSel = null;
  const chapters = () => (typeof CHAPTERS !== 'undefined' && CHAPTERS.length ? CHAPTERS : [{ id: undefined, code: 'EP', name: GAME_INFO.chapter || GAME_INFO.title }]).filter((c) => c.id !== 'supply');
  const stagesOf = (ch) => STAGES.map((st, i) => ({ st, i })).filter(({ st }) => !st.supply && (st.chapter === ch.id || ch.id === undefined));
  const seriesStages = (id) => STAGES.map((st, i) => ({ st, i })).filter(({ st }) => st.supply === id);
  const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
  // 원작처럼 하루는 오전 4시에 바뀜
  const gameDay = () => new Date(Date.now() - 4 * 3600e3).getDay();
  const seriesOf = (st) => (typeof SUPPLY_SERIES !== 'undefined' ? SUPPLY_SERIES : []).find((x) => x.id === st.supply);
  const seriesOpen = (sr) => !sr || !sr.days || sr.days.includes(gameDay());
  const daysText = (sr) => (sr.days ? [1, 2, 3, 4, 5, 6, 0].filter((d) => sr.days.includes(d)).map((d) => DAY_KO[d]).join('') + '요일 개방' : '상시 개방');
  const supplyReady = () => cleared(STAGES[3]);
  RENDER.operations = (arg, opts = {}) => {
    if (!opts.back && arg !== 'after') { opsMode = 'main'; seriesSel = null; }
    if (arg === 'supply' || arg === 'chip') { opsMode = arg; seriesSel = null; }
    document.querySelectorAll('#ops-nav [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === opsMode));
    const scr = $('#screen-operations');
    if (opsMode !== 'main' && !seriesSel) { scr.classList.add('cards-mode'); renderSeriesCards(); return; }
    scr.classList.remove('cards-mode');
    $('#ops-cards').classList.add('hidden');
    let list;
    if (opsMode === 'main') {
      if (!opts.back && arg !== 'after') {
        let last = 0;
        STAGES.forEach((st, i) => { if (!st.supply && unlocked(i)) last = i; });
        opSel = last;
        chapterSel = STAGES[last].chapter;
      }
      if (!STAGES[opSel] || STAGES[opSel].supply) { opSel = 0; chapterSel = STAGES[0].chapter; }
      const chs = chapters();
      const cur = chs.find((c) => c.id === chapterSel) || chs[0];
      chapterSel = cur.id;
      // 에피소드 탭: 그 에피소드의 첫 작전이 열려 있어야 선택 가능
      $('#chapter-title').innerHTML = chs.map((c) => {
        const first = stagesOf(c)[0];
        const open = first && unlocked(first.i);
        return `<button class="ep-tab ${c.id === cur.id ? 'on' : ''} ${open ? '' : 'locked'}" data-ep="${c.id}"><small>${esc(c.code)}</small><b>${open ? esc(c.name) : '???'}</b></button>`;
      }).join('');
      list = stagesOf(cur);
    } else {
      const sr = SUPPLY_SERIES.find((x) => x.id === seriesSel);
      list = seriesStages(seriesSel);
      $('#chapter-title').innerHTML = `<button class="ep-tab" data-series-back><small>◀ ${opsMode === 'chip' ? 'CHIPS' : 'SUPPLIES'}</small><b>${opsMode === 'chip' ? '칩 탐색' : '물자 비축'}</b></button>
        <span class="ep-tab on series-now" style="--sc:${sr.color}"><small>${esc(sr.en)} · ${daysText(sr)}</small><b>${esc(sr.name)}</b></span>`;
      if (!list.some(({ i }) => i === opSel)) {
        let last = list[0].i;
        list.forEach(({ i }) => { if (unlocked(i)) last = i; });
        opSel = last;
      }
    }
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
  // 물자 비축 · 칩 탐색: 요일 일정 + 시리즈 카드
  function renderSeriesCards() {
    const today = gameDay();
    const week = [1, 2, 3, 4, 5, 6, 0];
    $('#chapter-title').innerHTML = `<div class="sched"><span class="sched-t">SCHEDULE</span>${week.map((d) => `<span class="sched-d ${d === today ? 'today' : ''}">${d === today ? '<small>TODAY</small>' : ''}${DAY_KO[d]}</span>`).join('')}</div>`;
    const ready = supplyReady();
    const cards = SUPPLY_SERIES.filter((sr) => sr.tab === opsMode);
    $('#ops-cards').classList.remove('hidden');
    $('#ops-cards').innerHTML = cards.map((sr) => {
      const open = seriesOpen(sr);
      const done = seriesStages(sr.id).filter(({ st }) => cleared(st)).length, total = seriesStages(sr.id).length;
      const art = sr.classes ? `<span class="sc-cls">${sr.classes.map((c) => `<span class="sc-dia">${icon(c)}</span>`).join('')}</span>` : `<i class="ri ${sr.item} sc-item"></i>`;
      return `<button class="series-card ${open && ready ? '' : 'closed'}" data-series="${sr.id}" style="--sc:${sr.color}">
        <span class="sc-art">${art}</span>
        <span class="sc-en">${esc(sr.en)}</span>
        <b class="sc-name">${esc(sr.name)}</b>
        <span class="sc-gain">${esc(sr.gain)}</span>
        <span class="sc-days">${daysText(sr)}</span>
        <span class="sc-dots">${week.map((d) => `<i class="${!sr.days || sr.days.includes(d) ? 'on' : ''} ${d === today ? 'today' : ''}"></i>`).join('')}</span>
        <span class="sc-prog">${done}/${total}</span>
        ${open && ready ? '' : `<span class="sc-lock"><b>진입 불가</b><small>${ready ? '오늘은 개방되지 않습니다' : '1-4 클리어 후 개방'}</small></span>`}
      </button>`;
    }).join('');
  }
  $('#ops-cards').addEventListener('click', (e) => {
    const b = e.target.closest('[data-series]');
    if (!b) return;
    const sr = SUPPLY_SERIES.find((x) => x.id === b.dataset.series);
    if (!supplyReady()) { toast('메인 스토리 1-4를 클리어하면 개방됩니다'); return; }
    if (!seriesOpen(sr)) { toast(`${sr.name}: ${daysText(sr)} · 오늘은 진입할 수 없습니다`); return; }
    sfx('select');
    seriesSel = sr.id;
    opSel = -1;
    RENDER.operations(undefined, { back: true });
  });
  $('#ops-nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    if (b.dataset.mode === 'is') { go('is'); return; }
    sfx('select');
    if (b.dataset.mode === opsMode && !seriesSel) return;
    opsMode = b.dataset.mode;
    seriesSel = null;
    if (opsMode === 'main') { RENDER.operations(); return; }
    RENDER.operations(undefined, { back: true });
  });
  $('#chapter-title').addEventListener('click', (e) => {
    if (e.target.closest('[data-series-back]')) { seriesSel = null; RENDER.operations(undefined, { back: true }); return; }
    const b = e.target.closest('[data-ep]');
    if (!b) return;
    if (b.classList.contains('locked')) { toast('이전 에피소드를 완료하면 해금됩니다'); return; }
    const chf = chapters().find((c) => String(c.id) === b.dataset.ep);
    chapterSel = chf ? chf.id : undefined;
    const first = stagesOf(chapters().find((c) => c.id === chapterSel))[0];
    let last = first.i;
    STAGES.forEach((st, i) => { if (st.chapter === chapterSel && unlocked(i) && !st.supply) last = i; });
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
          <div class="op-tag"><span class="chk"></span>목숨 ${st.life ?? 3} · 배치 가능 ${st.deployLimit ?? 8}명${st.supply || cleared(st) ? '' : ' · 첫 클리어 보상 오리지늄 1'}</div>
          ${dropsHTML(st, opSel)}
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
        <button class="act-start" id="op-start"><b>${proxyOn && s >= 3 ? '대리 작전' : '작전개시'}</b><small>이성 -${sanityCost(st) * (proxyOn && s >= 3 ? proxyN : 1)}</small></button>
      </div>
      <div class="op-proxy ${s >= 3 ? '' : 'off'}">
        <button class="px-toggle ${proxyOn && s >= 3 ? 'on' : ''}" id="op-proxy" ${s >= 3 ? '' : 'disabled'}><span class="px-box"></span>대리 지휘 ${s >= 3 ? '' : '<small>(별 3개 클리어 후)</small>'}</button>
        ${s >= 3 && proxyOn ? `<div class="px-times">${[1, 2, 3, 4, 5, 6].map((n) => `<button class="${n === proxyN ? 'on' : ''}" data-px="${n}">×${n}</button>`).join('')}</div>` : ''}
      </div>`;
    const story = $('#op-story');
    if (story) story.addEventListener('click', () => playDialog(st.before, () => {}, st));
    $('#op-enemy').addEventListener('click', () => openEnemies(st));
    $('#op-mapview').addEventListener('click', () => openMap(st));
    $('#op-formation').addEventListener('click', () => go('formation', { stage: opSel }));
    $('#op-start').addEventListener('click', () => {
      if (!seriesOpen(seriesOf(st))) { toast('오늘은 개방되지 않은 작전입니다'); return; }
      if (proxyOn && s >= 3) runProxy(opSel, proxyN); else go('formation', { stage: opSel });
    });
    $('#op-proxy').addEventListener('click', () => { proxyOn = !proxyOn; renderOpsPanel(); });
    document.querySelectorAll('[data-px]').forEach((b) => b.addEventListener('click', () => { proxyN = +b.dataset.px; renderOpsPanel(); }));
  }
  // 드롭 표시: 고정 · 주요(별 3개 확정) · 확률
  function dropsHTML(st, idx) {
    const t = TRAIN.dropTable({ ...st, sanity: sanityCost(st) }, idx);
    const item = (k, txt, cls = '') => `<span class="${cls}" title="${esc(ITEMS[k].name)}"><i class="ri ${k}"></i>${esc(ITEMS[k].short)} ${txt}</span>`;
    return `<div class="op-drops"><small class="od-t">${st.supply ? '고정 드롭' : '드롭'}</small>${t.fixed.map(([k, n]) => item(k, `×${n.toLocaleString('ko-KR')}`)).join('')}${t.chance.map(([k, p, n, tag]) =>
      tag === '주요' ? item(k, '<em>주요 · ★3 확정</em>', 'main') : item(k, `${tag === '추가' ? '+1 ' : n > 1 ? `×${n} ` : ''}${Math.round(p * 100)}%`, 'maybe')).join('')}</div>`;
  }
  // 획득처: 재료를 누르면 그 재료가 나오는 작전 · 가공소로 바로 이동
  function openSource(k) {
    const it = ITEMS[k], src = TRAIN.sourcesOf(k);
    const rows = src.stages.slice(0, 10).map(({ i, label }) => {
      const st = STAGES[i], sr = seriesOf(st), ul = unlocked(i), open = seriesOpen(sr);
      const where = sr ? `${sr.tab === 'chip' ? '칩 탐색' : '물자 비축'} · ${sr.name}` : `메인 스토리 · ${(CHAPTERS.find((c) => c.id === st.chapter) || {}).code || ''}`;
      const state = !ul ? `<small class="bad">${icon('lock')}미해금</small>` : !open ? `<small class="bad">${daysText(sr)}</small>` : `<small>이성 ${sanityCost(st)}</small>`;
      return `<button class="src-row ${ul && open ? '' : 'off'}" data-jump="${i}"><span class="src-code">${esc(st.code)}</span><span class="src-name"><small>${esc(where)}</small>${esc(st.name)}</span><em class="${label === '주요 드롭' ? 'main' : ''}">${esc(label)}</em>${state}<i class="src-go">${ul && open ? '이동 ▶' : ''}</i></button>`;
    });
    if (src.craft) {
      const c = src.craft, need = Object.entries(c.items).map(([id, n]) => `${esc(ITEMS[id].short)} ×${n}`).join(' + ') + (c.lmd ? ` + 용문폐 ${c.lmd.toLocaleString('ko-KR')}` : '');
      rows.unshift(`<button class="src-row craft" data-craft="${esc(k)}"><span class="src-code">${icon('craft')}</span><span class="src-name"><small>가공소</small>합성</span><em>${need}</em><small></small><i class="src-go">이동 ▶</i></button>`);
    }
    if (['lmd', 'exp_1', 'exp_2', 'exp_3', 'exp_4', 'orundum', 'skill_1'].includes(k)) rows.push(`<button class="src-row craft" data-mission><span class="src-code">${icon('mission')}</span><span class="src-name"><small>임무</small>일일 · 주간 임무</span><em>보상</em><small></small><i class="src-go">이동 ▶</i></button>`);
    openModal(`<div class="item-detail"><i class="ri ${esc(k)} big"></i><div><div class="modal-title">${esc(it.name)}</div><div class="modal-sub">보유 ${ACCOUNT.bal(k).toLocaleString('ko-KR')}</div><p class="modal-text">${esc(it.desc || '')}</p></div></div>
      <div class="src-title">획득처</div><div class="src-list">${rows.join('') || '<p class="modal-text">작전에서는 얻을 수 없습니다.</p>'}</div>`);
  }
  // 작전 목록의 해당 작전으로 바로 이동 (메인 스토리 · 시리즈 자동 선택)
  function jumpStage(i) {
    const st = STAGES[i], sr = seriesOf(st);
    if (!unlocked(i)) { toast('아직 해금되지 않은 작전입니다'); return; }
    if (!seriesOpen(sr)) { toast(`${sr.name}: ${daysText(sr)} · 오늘은 진입할 수 없습니다`); return; }
    if (sr) { opsMode = sr.tab; seriesSel = sr.id; } else { opsMode = 'main'; seriesSel = null; chapterSel = st.chapter; }
    opSel = i;
    closeModal();
    $('#train-view').classList.add('hidden');
    go('operations', 'after');
  }
  $('#modal-body').addEventListener('click', (e) => {
    const j = e.target.closest('[data-jump]');
    if (j) { jumpStage(+j.dataset.jump); return; }
    const c = e.target.closest('[data-craft]');
    if (c) { closeModal(); $('#train-view').classList.add('hidden'); go('workshop', c.dataset.craft); return; }
    if (e.target.closest('[data-mission]')) { closeModal(); $('#train-view').classList.add('hidden'); go('missions'); }
  });
  // 대리 작전: 별 3개로 깬 작전을 N번 바로 완료 (이성 N배, 보상 N번)
  let proxyOn = false, proxyN = 1;
  function runProxy(idx, n) {
    const st = STAGES[idx], cost = sanityCost(st) * n;
    if (!seriesOpen(seriesOf(st))) { toast('오늘은 개방되지 않은 작전입니다'); return; }
    if (!ACCOUNT.useSanity(cost)) { openSanity(() => runProxy(idx, n)); return; }
    fixPlayer();
    const total = {};
    for (let k = 0; k < n; k++) for (const [id, v] of Object.entries(rewardFor(st, idx, 3, false))) total[id] = (total[id] || 0) + v;
    ACCOUNT.earn(total);
    trackBattle(st, n);
    save.trust = save.trust || {};
    for (const id of save.squad) save.trust[id] = Math.min(200, (save.trust[id] || 0) + sanityCost(st) * n);
    writeSave();
    sfx('win');
    const rows = Object.entries(total).map(([k, v]) => `<div class="px-item"><i class="ri ${k} big"></i><b>${v.toLocaleString('ko-KR')}</b><span>${esc(ITEMS[k] ? ITEMS[k].name : k)}</span></div>`).join('');
    openModal(`<div class="modal-title">대리 작전 완료 ×${n}</div><div class="modal-sub">${esc(st.code)} ${esc(st.name)} · 이성 -${cost} · 편성 오퍼레이터 신뢰도 +${sanityCost(st) * n}%</div><div class="px-grid">${rows}</div>
      <div class="panel-btns"><button class="btn primary" id="px-again">한 번 더 (×${n})</button><button class="btn" id="px-close">확인</button></div>`);
    $('#px-close').addEventListener('click', closeModal);
    $('#px-again').addEventListener('click', () => { closeModal(); runProxy(idx, n); });
    renderResources();
  }

  $('#btn-practice').addEventListener('click', startPractice);
  $('#ops-map').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stage]');
    if (!b) return;
    const i = +b.dataset.stage;
    if (!unlocked(i)) { toast('이전 작전을 완료하면 해금됩니다'); return; }
    opSel = i;
    document.querySelectorAll('.op-node').forEach((n) => n.classList.toggle('sel', +n.dataset.stage === i));
    renderOpsPanel();
  });

  // 적 목록 HTML (작전 목록·통합전략 공용). defs로 적 정의를 덮어쓸 수 있음
  function enemyRowsHTML(waves, defs) {
    const count = {};
    for (const w of waves) count[w.enemy] = (count[w.enemy] || 0) + (w.count || 1);
    return Object.entries(count).map(([id, n]) => {
      const e = (defs && defs[id]) || ENEMIES[id];
      if (!e) return '';
      const flags = [e.boss && '보스', e.elite && '엘리트', e.sea && '시본', e.fly && '비행', e.unblockable && '저지 불가', e.range > 0 && `원거리 ${e.range}`, e.arts && '마법 피해',
        e.aoe && '범위 공격', e.healer && '치료', e.blink && '순간이동', e.revive && '부활', e.enrage && '광폭화', e.chill && '냉기', e.regen && 'HP 회복',
        e.neural && '신경 손상', e.neuralAura && '신경 손상 오라', e.dodge && '회피', e.targets > 1 && `동시 ${e.targets}명 공격`, e.lowHp && 'HP 낮은 대상 우선',
        e.burst && '피격 시 폭발', e.brandOnDeath && '사망 시 명흔', e.brandTrail && '명흔 남김', e.brandUnblockable && '명흔 위 저지 불가', e.brandAtk && '명흔 위 공격력 증가',
        e.harden && '빈사 시 방어 상승', e.summon && '소환'].filter(Boolean);
      return `<div class="enemy-row">
        <span class="enemy-ico" style="--c:${e.color}" title="${esc(e.code || '')}">${e.image ? `<img src="${esc(e.image)}" alt="">` : e.boss ? '王' : esc(e.name.replace(/[「」]/g, '')[0])}</span>
        <div class="enemy-info">
          <b><small class="e-code">${esc(e.code || '')}</small> ${esc(e.name)} <small>×${n}</small></b>
          <div class="enemy-stats">체력 ${e.hp} · 공격 ${e.atk} · 방어 ${e.def} · 저항 ${e.res || 0}</div>
          <div class="enemy-desc">${flags.map((f) => `<span class="flag">${f}</span>`).join('')}${esc(e.desc || '')}</div>
        </div>
      </div>`;
    }).join('');
  }
  // 적 정보: 원작처럼 왼쪽에 출현 적 아이콘, 오른쪽에 큰 그림 · 능력치 등급 · 특성
  const GRADE = [['D', 0], ['C', 0.25], ['B', 0.45], ['A', 0.65], ['S', 0.85]];
  const gradeOf = (v, max) => { const r = Math.min(1, v / max); let g = 'D'; for (const [k, t] of GRADE) if (r >= t) g = k; return g; };
  function enemyDetailHTML(e, n) {
    const stat = (label, v, max) => { const g = gradeOf(v, max); return `<div class="ed-stat"><span>${label}</span><i><b style="width:${Math.min(100, (v / max) * 100)}%"></b></i><em class="g-${g}">${g}</em><small>${v}</small></div>`; };
    const flags = [e.boss && '보스', e.elite && '엘리트', e.sea && '시본', e.fly && '비행', e.unblockable && '저지 불가', e.range > 0 && `원거리 ${e.range}`, e.arts && '마법 피해', e.aoe && '범위 공격', e.healer && '치료', e.revive && '부활', e.summon && '소환', e.dodge && '회피', (e.weight || 1) >= 3 && `무게 ${e.weight}`].filter(Boolean);
    return `<div class="ed-art" style="--c:${e.color}">${e.image ? `<img src="${esc(e.image)}" alt="">` : `<b>${esc(e.name[0])}</b>`}<span class="ed-lv ${e.boss ? 'boss' : e.elite ? 'elite' : ''}">${e.boss ? 'BOSS' : e.elite ? 'ELITE' : 'NORMAL'}</span></div>
      <div class="ed-body"><div class="ed-name"><small>${esc(e.code || '')}</small><b>${esc(e.name)}</b><span>×${n}</span></div>
        <div class="ed-stats">${stat('내구', e.hp, 20000)}${stat('공격력', e.atk, 1500)}${stat('방어력', e.def, 1200)}${stat('마법 저항', e.res || 0, 80)}</div>
        <div class="ed-flags">${flags.map((f) => `<span>${f}</span>`).join('')}</div>
        <p class="ed-desc">${esc(e.desc || '')}</p></div>`;
  }
  function openEnemies(st, defs) {
    const count = {};
    for (const w of st.waves) count[w.enemy] = (count[w.enemy] || 0) + (w.count || 1);
    const list = Object.entries(count).map(([id, n]) => ({ id, n, e: (defs && defs[id]) || ENEMIES[id] })).filter((x) => x.e)
      .sort((a, b) => (b.e.boss ? 2 : b.e.elite ? 1 : 0) - (a.e.boss ? 2 : a.e.elite ? 1 : 0));
    openModal(`<div class="modal-title">적 정보</div><div class="modal-sub">${esc(st.code || '')} ${esc(st.name)} · 출현 적 ${list.reduce((s, x) => s + x.n, 0)}</div>
      <div class="ed-wrap"><div class="ed-list">${list.map((x, i) => `<button class="ed-pick ${i ? '' : 'on'} ${x.e.boss ? 'boss' : x.e.elite ? 'elite' : ''}" data-ed="${i}" style="--c:${x.e.color}">${x.e.image ? `<img src="${esc(x.e.image)}" alt="">` : esc(x.e.name[0])}<small>×${x.n}</small></button>`).join('')}</div>
        <div class="ed-detail" id="ed-detail">${list[0] ? enemyDetailHTML(list[0].e, list[0].n) : ''}</div></div>`);
    $('#modal').dataset.kind = 'enemy';
    $('#modal-body').querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => {
      $('#modal-body').querySelectorAll('[data-ed]').forEach((x) => x.classList.toggle('on', x === b));
      const x = list[+b.dataset.ed];
      $('#ed-detail').innerHTML = enemyDetailHTML(x.e, x.n);
    }));
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
    const color = { '#': '#15171c', '.': '#3b4049', '^': '#8a929f', R: '#e5484d', B: '#3fa3ff', '~': '#1f6f73', '-': '#2b2f36' };
    st.map.forEach((row, y) => [...row].forEach((ch, x) => {
      c.fillStyle = color[ch] || color['#'];
      c.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
    }));
  }

  // =====================================================================
  //  대화
  // =====================================================================
  // 스토리 배경: 원작 스토리 배경 그림 (장마다 다름 · img/ui/story_*.webp)
  const storyBg = (st) => (st && typeof st.chapter === 'number' && st.chapter >= 1 && st.chapter <= 4 ? `story_${st.chapter}` : st && st.is ? 'story_is' : 'story_0');
  function playDialog(lines, done, st) {
    const ov = $('#dialog'), nameEl = $('#dlg-name'), textEl = $('#dlg-text'), por = $('#dlg-portrait');
    ov.style.setProperty('--bg', `url(img/ui/${storyBg(st)}.webp)`);
    let i = -1, timer = null, full = '';
    ov.classList.remove('hidden');
    const bgmBefore = current === 'battle' ? null : screenBgm(current);
    if (bgmBefore && window.SFX && SFX.bgm) SFX.bgm('story');

    function finish() {
      clearInterval(timer);
      ov.classList.add('hidden');
      ov.onclick = null;
      if (bgmBefore && window.SFX && SFX.bgm) SFX.bgm(bgmBefore);
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
  const rerender = () => { applySkins(); if (current !== 'battle' && RENDER[current]) RENDER[current](undefined, { back: true, refresh: true }); };
  ACCOUNT.on('ops', rerender);
  ACCOUNT.on('player', rerender);
  ACCOUNT.on('mode', rerender);
  ACCOUNT.on('wallet', renderResources);
  applySkins();
  TRAIN.migrate(); TRAIN.migrateSkills(); TRAIN.giveGift();
  ACCOUNT.on('player', () => { if (!ACCOUNT.player.trainMigrated || !ACCOUNT.player.skillMigrated) { TRAIN.migrate(); TRAIN.migrateSkills(); rerender(); } TRAIN.giveGift(); });
  ACCOUNT.on('granted', (g) => {
    const items = Object.entries(g.items || {}).map(([k, v]) => (k.startsWith('op:') ? (OPS[k.slice(3)] ? OPS[k.slice(3)].name : '오퍼레이터') : `${ITEMS[k] ? ITEMS[k].name : k} ×${v}`)).join(', ');
    toast(`지급 완료 — ${items}`);
    sfx('win');
  });

  // 마우스 휠로 가로 목록 넘기기 (오퍼레이터 목록 · 작전 목록 · 구매센터)
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    const el = e.target.closest('#op-grid, #ops-map, .pk-row');
    if (!el || el.scrollWidth <= el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) return;
    el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? el.clientWidth : 1);
    e.preventDefault();
  }, { passive: false });
  window.UI = {
    applySkins, buySkin, skinsOf, ownsSkin,
    save, writeSave, go, back, icon, toast, playDialog, startOperation, skillIndex, onBattleEnd, onBattleQuit,
    openFeedback, skillIcon, openModal, closeModal, openSource, jumpStage, cardHTML, enemyRowsHTML, openEnemies, openMap, artHTML, esc, stars, OPS, RENDER, renderResources, hydrateIcons, skillsOf, line, say,
    get current() { return current; },
  };
  RENDER.home();
  if (window.SFX && SFX.bgm) SFX.bgm('home');
})();
