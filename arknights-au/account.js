'use strict';
// =====================================================================
//  잿빛 등대 — 계정 · 재화 · 공용 데이터
//  claude.ai 아티팩트에서 열면 계정별로 저장되고(db), 관리자(편집 권한자)가
//  결제 요청 승인·재화 지급·오퍼레이터 실장을 할 수 있습니다.
//  그 밖의 곳(파일로 열기, GitHub Pages)에서는 이 브라우저에만 저장됩니다.
// =====================================================================
(() => {
  const LOCAL_KEY = 'ashen-beacon-save';
  const SANITY_MAX = 135;
  const SANITY_MS = 6 * 60 * 1000;   // 원작처럼 6분에 이성 1 회복
  const SQUAD_MAX = 12;

  const listeners = {};
  const on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);
  const emit = (ev, data) => (listeners[ev] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });

  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const num = (v, def, min = -Infinity, max = Infinity) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
  const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

  // ---------- 플레이어 데이터 ----------
  function freshPlayer() {
    const starters = OPERATORS.filter((o) => o.starter).map((o) => o.id);
    const owned = {};
    for (const id of starters) owned[id] = { pot: 1, at: Date.now() };
    return {
      v: 2, nick: '', stars: {}, squad: starters.slice(0, SQUAD_MAX), skills: {}, trust: {}, skins: { owned: [], wear: {} },
      assistant: starters[0] || OPERATORS[0].id, owned,
      earned: { ...STARTER_GIFT }, spent: {},
      sanity: SANITY_MAX, sanityAt: Date.now(), pity: 0, pulls: [], created: Date.now(),
    };
  }
  function normalize(raw) {
    // 공용 저장소가 돌려주는 데이터는 동결(수정 불가)되어 있으므로 반드시 깊은 복사본으로 작업
    let copy = null;
    try { copy = raw ? JSON.parse(JSON.stringify(raw)) : null; } catch { copy = null; }
    const f = freshPlayer(), o = obj(copy);
    const out = { ...f, ...o };
    out.stars = obj(o.stars);
    out.skills = obj(o.skills);
    out.trust = obj(o.trust);
    const sk = obj(o.skins);
    out.skins = { owned: Array.isArray(sk.owned) ? sk.owned.filter((x) => typeof x === 'string') : [], wear: obj(sk.wear) };
    out.owned = Object.keys(obj(o.owned)).length ? obj(o.owned) : f.owned;
    out.earned = o.earned ? obj(o.earned) : f.earned;
    out.spent = obj(o.spent);
    out.squad = Array.isArray(o.squad) ? o.squad.filter((x) => typeof x === 'string').slice(0, SQUAD_MAX) : f.squad;
    out.pulls = Array.isArray(o.pulls) ? o.pulls.slice(-60) : [];
    out.sanity = num(o.sanity, SANITY_MAX, 0, 9999);
    out.sanityAt = num(o.sanityAt, Date.now());
    out.pity = num(o.pity, 0, 0, 999);
    out.nick = str(o.nick, 16);
    delete out.known;
    return out;
  }
  function localGet() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)); } catch { return null; } }
  function localSet(p) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(p)); } catch { /* 저장 불가 환경 */ } }

  const player = normalize(localGet());   // 화면 코드가 계속 참조하는 같은 객체
  function loadPlayer(raw) {
    const n = normalize(raw);
    for (const k of Object.keys(player)) delete player[k];
    Object.assign(player, n);
  }

  // ---------- 저장 (한 번에 하나씩, 잠깐 모아서) ----------
  let mode = 'local', db = null, user = null, assets = null, uid = null, isAdmin = false, isOwner = false;
  let saveTimer = null, saving = false, dirty = false;
  function save() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }
  async function flush() {
    if (saving) { saveTimer = setTimeout(flush, 300); return; }
    if (!dirty) return;
    dirty = false;
    const body = JSON.parse(JSON.stringify(player));
    if (mode !== 'online') { localSet(body); return; }
    saving = true;
    try {
      await db.doc('players/' + uid).set({ ...body, updatedAt: Date.now() });
    } catch (e) {
      console.warn('저장 실패', e);
      if (e && e.code === 'invalid_argument') { mode = 'local'; localSet(body); emit('mode'); }
      else dirty = true;
    } finally {
      saving = false;
    }
  }
  window.addEventListener('pagehide', () => { if (dirty && mode !== 'online') localSet(player); });

  // ---------- 재화 ----------
  const grantTotals = {};
  let grantedOps = new Set();
  const bal = (k) => Math.floor((grantTotals[k] || 0) + (player.earned[k] || 0) - (player.spent[k] || 0));
  const canPay = (items) => Object.entries(items).every(([k, v]) => bal(k) >= v);
  function spend(items) {
    if (!canPay(items)) return false;
    for (const [k, v] of Object.entries(items)) player.spent[k] = (player.spent[k] || 0) + v;
    save();
    emit('wallet');
    return true;
  }
  function earn(items) {
    for (const [k, v] of Object.entries(items)) player.earned[k] = (player.earned[k] || 0) + v;
    save();
    emit('wallet');
  }

  // ---------- 보유 오퍼레이터 ----------
  const owns = (id) => !!player.owned[id] || grantedOps.has(id);
  // 헤드헌팅으로 얻었을 때: 처음이면 신규, 중복이면 잠재력 +1, 잠재 6 이후는 자격증
  function obtain(def) {
    const cur = player.owned[def.id] || (grantedOps.has(def.id) ? { pot: 1 } : null);
    const r = def.rarity || 3;
    const out = { isNew: !cur, pot: 1, cert: null };
    if (!cur) {
      player.owned[def.id] = { pot: 1, at: Date.now() };
      if (r <= 4) out.cert = { cert_lo: r === 4 ? 30 : 5 };
    } else if (cur.pot < 6) {
      player.owned[def.id] = { ...cur, pot: cur.pot + 1 };
      out.pot = cur.pot + 1;
      out.cert = r >= 5 ? { cert_hi: r === 6 ? 10 : 5 } : { cert_lo: r === 4 ? 30 : 5 };
    } else {
      out.pot = 6;
      out.cert = r >= 5 ? { cert_hi: r === 6 ? 15 : 8 } : { cert_lo: r === 4 ? 30 : 5 };
    }
    if (out.cert) for (const [k, v] of Object.entries(out.cert)) player.earned[k] = (player.earned[k] || 0) + v;
    return out;
  }
  const potOf = (id) => (player.owned[id] ? player.owned[id].pot || 1 : owns(id) ? 1 : 0);

  // ---------- 이성 ----------
  function settleSanity() {
    const now = Date.now();
    if (player.sanity >= SANITY_MAX) { player.sanityAt = now; return; }
    const g = Math.floor((now - player.sanityAt) / SANITY_MS);
    if (g > 0) {
      player.sanity = Math.min(SANITY_MAX, player.sanity + g);
      player.sanityAt = player.sanity >= SANITY_MAX ? now : player.sanityAt + g * SANITY_MS;
    }
  }
  function sanity() { settleSanity(); return player.sanity; }
  function useSanity(n) {
    settleSanity();
    if (player.sanity < n) return false;
    if (player.sanity >= SANITY_MAX) player.sanityAt = Date.now();
    player.sanity -= n;
    save();
    emit('wallet');
    return true;
  }
  function addSanity(n) {
    settleSanity();
    player.sanity += n;
    save();
    emit('wallet');
  }
  function refillSanity() {
    if (!spend({ originite: 1 })) return false;
    addSanity(SANITY_MAX);
    return true;
  }
  const nextSanityMs = () => (player.sanity >= SANITY_MAX ? 0 : SANITY_MS - ((Date.now() - player.sanityAt) % SANITY_MS));

  // ---------- 관리자가 실장한 오퍼레이터 (공용 데이터) ----------
  const RANGE_PRESETS = {
    self:   { name: '자기 칸', range: [[0, 0]] },
    melee1: { name: '전방 1칸', range: area(0, 1, 0, 0) },
    melee2: { name: '전방 2칸', range: area(0, 2, 0, 0) },
    around: { name: '주변 8칸', range: area(-1, 1, -1, 1) },
    diamond2: { name: '마름모 2칸', range: area(-2, 2, -2, 2).filter(([x, y]) => Math.abs(x) + Math.abs(y) <= 2) },
    ranged: { name: '원거리 3×4', range: area(0, 3, -1, 1) },
    long:   { name: '장거리 3×5', range: area(0, 4, -1, 1) },
  };
  function skillFx(fx) {
    const f = obj(fx), e = {};
    const pct = (k) => (Number.isFinite(+f[k]) && +f[k] !== 0 ? 1 + +f[k] / 100 : null);
    if (pct('atk')) e.atk = pct('atk');
    if (pct('def')) e.def = pct('def');
    if (num(f.speed, 0)) e.interval = Math.max(0.2, 1 - num(f.speed, 0, -90, 80) / 100);
    if (num(f.targets, 0)) e.targets = num(f.targets, 1, 1, 9);
    if (num(f.splash, 0)) e.splash = num(f.splash, 0, 0, 3);
    if (num(f.hits, 0) > 1) e.hits = { count: num(f.hits, 2, 2, 8), mul: num(f.hitMul, 100, 10, 500) / 100 };
    if (num(f.nextHit, 0)) e.nextHit = num(f.nextHit, 100, 100, 1000) / 100;
    if (num(f.charges, 0)) e.charges = num(f.charges, 1, 1, 99);
    if (num(f.strike, 0)) e.strike = { mul: num(f.strike, 100, 10, 1000) / 100, radius: num(f.strikeRadius, 1.5, 0.5, 4), stun: num(f.stun, 0, 0, 10) };
    if (num(f.heal, 0)) e.heal = num(f.heal, 0, 0, 100) / 100;
    if (num(f.regen, 0)) e.regen = num(f.regen, 0, 0, 20) / 100;
    if (num(f.allyHeal, 0)) e.allyHeal = { mul: num(f.allyHeal, 0, 0, 1000) / 100, radius: num(f.allyRadius, 1.5, 1, 4) };
    if (num(f.allyRegen, 0)) e.allyRegen = { mul: num(f.allyRegen, 0, 0, 200) / 100, radius: num(f.allyRadius, 1.5, 1, 4) };
    if (num(f.shield, 0)) e.shield = num(f.shield, 0, 0, 300) / 100;
    if (num(f.dodge, 0)) e.dodge = num(f.dodge, 0, 0, 90) / 100;
    if (num(f.block, 0)) e.block = num(f.block, 0, 0, 3);
    if (num(f.dp, 0)) e.dp = num(f.dp, 0, 0, 40);
    if (num(f.endBlast, 0)) e.endBlast = { mul: num(f.endBlast, 0, 0, 1000) / 100, radius: num(f.endRadius, 1.4, 0.5, 4), selfDmg: num(f.selfDmg, 0, 0, 90) / 100 };
    return e;
  }
  function talentFx(fx) {
    const f = obj(fx), e = {};
    const pct = (k) => (Number.isFinite(+f[k]) && +f[k] !== 0 ? 1 + +f[k] / 100 : null);
    if (pct('atk')) e.atk = pct('atk');
    if (pct('hp')) e.hp = pct('hp');
    if (pct('def')) e.def = pct('def');
    if (num(f.speed, 0)) e.speed = Math.max(0.3, 1 - num(f.speed, 0, -90, 70) / 100);
    if (num(f.dodge, 0)) e.dodge = num(f.dodge, 0, 0, 80) / 100;
    if (num(f.firstStrike, 0)) e.firstStrike = num(f.firstStrike, 100, 100, 1000) / 100;
    if (num(f.critRate, 0)) e.crit = { rate: num(f.critRate, 0, 0, 100) / 100, mul: num(f.critMul, 150, 100, 500) / 100 };
    if (num(f.auraDef, 0)) e.auraDef = { radius: 1.5, def: num(f.auraDef, 0, 0, 50) / 100 };
    if (num(f.guard, 0)) e.guard = { below: 0.5, taken: 1 - num(f.guard, 0, 0, 80) / 100 };
    if (num(f.lastStand, 0)) e.lastStand = { below: 0.25, heal: num(f.lastStand, 0, 0, 100) / 100 };
    return e;
  }
  const isAssetId = (v) => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
  function toOp(docId, raw) {
    const d = obj(raw);
    const cls = CLASSES[d.class] ? d.class : 'guard';
    const preset = RANGE_PRESETS[d.range] ? d.range : (CLASSES[cls].tile === 'high' ? 'ranged' : 'melee1');
    const skills = (Array.isArray(d.skills) ? d.skills : []).slice(0, 3).map((s) => {
      const k = obj(s);
      const spType = ['time', 'attack', 'hit', 'deploy'].includes(k.spType) ? k.spType : 'time';
      const rangeKey = RANGE_PRESETS[k.range] ? k.range : '';
      const effect = skillFx(k.fx);
      if (rangeKey) effect.range = RANGE_PRESETS[rangeKey].range;
      return {
        rangeKey, name: str(k.name, 30) || '스킬', desc: str(k.desc, 200), spType,
        trigger: k.trigger === 'auto' || spType === 'deploy' ? 'auto' : 'manual',
        sp: spType === 'deploy' ? 0 : num(k.sp, 20, 1, 200), initSp: spType === 'deploy' ? 0 : num(k.initSp, 0, 0, 200),
        duration: num(k.duration, 10, -1, 120), effect, fx: obj(k.fx),
      };
    });
    if (!skills.length) skills.push({ name: '기본 공격', desc: '스킬 없음', sp: 999, initSp: 0, duration: 0, trigger: 'manual', effect: {}, fx: {} });
    const talents = (Array.isArray(d.talents) ? d.talents : []).slice(0, 2).map((t) => {
      const k = obj(t);
      return { name: str(k.name, 30), desc: str(k.desc, 160), effect: talentFx(k.fx), fx: obj(k.fx) };
    }).filter((t) => t.name);
    const archetype = ARCHETYPES[d.archetype] ? d.archetype : undefined;
    return {
      id: 'c_' + docId, docId, custom: true, creator: str(d.creator, 80), isOnly: d.isOnly === true,
      name: str(d.name, 20) || '이름 없음', en: str(d.en, 30), class: cls, archetype,
      race: str(d.race, 20), faction: str(d.faction, 40), rarity: num(d.rarity, 5, 1, 6),
      color: /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : '#8899aa',
      tags: (Array.isArray(d.tags) ? d.tags : []).slice(0, 4).map((t) => str(t, 12)).filter(Boolean),
      profile: str(d.profile, 600), quote: str(d.quote, 80),
      voices: (Array.isArray(d.voices) ? d.voices : []).slice(0, 6).map((t) => str(t, 100)).filter(Boolean),
      image: isAssetId(d.imageId) ? '/_blob/' + d.imageId : undefined, imageId: isAssetId(d.imageId) ? d.imageId : '',
      cost: num(d.cost, 15, 1, 40), redeploy: num(d.redeploy, 40, 5, 200), block: num(d.block, 1, 0, 4),
      hp: num(d.hp, 2000, 100, 99999), atk: num(d.atk, 500, 0, 9999), def: num(d.def, 200, 0, 9999),
      res: num(d.res, 0, 0, 100), interval: num(d.interval, 1.2, 0.2, 5), rangeKey: preset, range: RANGE_PRESETS[preset].range,
      skills, talents,
    };
  }

  // ---------- 헤드헌팅 배너 설정 ----------
  // config/banner 문서의 list. 관리자가 한 번도 저장하지 않았으면(saved=false) data.js의 GACHA.banners를 씁니다.
  const banner = { list: [], saved: false };
  function cleanBanner(b, i) {
    b = obj(b);
    return {
      id: str(b.id, 40) || 'b' + i, name: str(b.name, 30), tag: str(b.tag, 20),
      until: /^\d{4}-\d{2}-\d{2}$/.test(b.until) ? b.until : '',
      featured: Array.isArray(b.featured) ? b.featured.filter((x) => typeof x === 'string').slice(0, 6) : [],
    };
  }
  const MAX_BANNERS = 12;

  // ---------- 온라인 연결 ----------
  let myRequests = [];
  async function init() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    try {
      [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    } catch { return; }
    if (!db) return;
    if (user) {
      uid = await user.id();
      isAdmin = await user.canEdit();
      try { isOwner = !!(await user.isOwner()); } catch { isOwner = false; }
    }
    subscribeShared();
    if (!uid) { emit('mode'); return; }
    // 관리자: 오퍼레이터 그림 · 모든 플레이어: 건의에 사진 첨부 (assets upload: interact)
    try { assets = await window.claude.use('assets'); } catch { assets = null; }
    try {
      const snap = await db.doc('players/' + uid).get();
      mode = 'online';
      if (snap.exists) loadPlayer(snap.data());
      else { dirty = true; await flush(); }   // 새 계정: 이 브라우저의 진행도로 시작
    } catch (e) {
      console.warn('계정 불러오기 실패', e);
      mode = 'local';
    }
    if (mode === 'online') {
      db.collection('grants').where('uid', '==', uid).onSnapshot(onGrants, (e) => console.warn(e));
      db.collection('requests').where('uid', '==', uid).onSnapshot((s) => {
        myRequests = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at || 0) - (a.at || 0));
        emit('requests');
      }, (e) => console.warn(e));
    }
    emit('mode');
    emit('player');
    emit('wallet');
  }
  let firstGrants = true;
  function onGrants(snap) {
    for (const k of Object.keys(grantTotals)) delete grantTotals[k];
    grantedOps = new Set();
    for (const d of snap.docs) {
      for (const [k, v] of Object.entries(obj(d.data().items))) {
        if (k.startsWith('op:')) grantedOps.add(k.slice(3));
        else if (ITEMS[k] && Number.isFinite(+v)) grantTotals[k] = (grantTotals[k] || 0) + +v;
      }
    }
    if (!firstGrants) for (const ch of snap.docChanges()) if (ch.type === 'added') emit('granted', ch.doc.data());
    firstGrants = false;
    emit('wallet');
  }
  function subscribeShared() {
    db.collection('operators').onSnapshot((snap) => {
      for (let i = OPERATORS.length - 1; i >= 0; i--) if (OPERATORS[i].custom) OPERATORS.splice(i, 1);
      for (const d of snap.docs) OPERATORS.push(toOp(d.id, d.data()));
      emit('ops');
    }, (e) => console.warn(e));
    db.doc('config/banner').onSnapshot((s) => {
      const d = s.exists ? obj(s.data()) : {};
      // 예전 형식(배너 1개: name, featured)도 읽음
      const raw = Array.isArray(d.list) ? d.list : d.name ? [{ id: 'event', name: d.name, featured: d.featured }] : null;
      banner.saved = !!raw;
      banner.list = (raw || []).slice(0, MAX_BANNERS).map(cleanBanner).filter((b) => b.name);
      emit('banner');
    }, (e) => console.warn(e));
  }

  // ---------- 결제 요청 ----------
  async function requestPurchase(pkg) {
    if (mode !== 'online') throw new Error('offline');
    await db.collection('requests').add({
      uid, pkg: pkg.id, label: pkg.label, items: pkg.items, price: pkg.price, status: 'pending', at: Date.now(),
    });
  }

  // ---------- 버그 신고 · 건의 ----------
  // 온라인: 공용 데이터의 requests에 kind 'feedback'으로 저장 (관리자 화면 「건의 · 버그」 탭에서 확인)
  // 오프라인: 이 브라우저에만 저장
  const FB_LOCAL = 'akau-feedback';
  const localFb = () => { try { return JSON.parse(localStorage.getItem(FB_LOCAL) || '[]'); } catch { return []; } };
  const FB_MAX_IMG = 3;
  async function sendFeedback(fb) {
    const doc = { kind: 'feedback', fbType: fb.type === 'bug' ? 'bug' : 'idea', title: str(fb.title, 80), body: str(fb.body, 2000), where: str(fb.where, 60), env: str(fb.env, 160), status: 'open', at: Date.now() };
    if (mode !== 'online') {
      const l = localFb(); l.unshift({ id: 'local' + doc.at, uid: 'local', ...doc });
      try { localStorage.setItem(FB_LOCAL, JSON.stringify(l.slice(0, 50))); } catch { /* 저장 못 해도 계속 */ }
      emit('requests');
      return 'local';
    }
    const imgs = [];
    for (const f of (fb.files || []).slice(0, FB_MAX_IMG)) {
      if (!assets) break;
      const a = await assets.upload(f);
      if (a && isAssetId(a.id)) imgs.push(a.id);
    }
    if (imgs.length) doc.imgs = imgs;
    await db.collection('requests').add({ uid, ...doc });
    return 'online';
  }

  // ---------- 관리자 ----------
  const admin = {
    watch(path, fn) {
      return db.collection(path).onSnapshot((s) => fn(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.warn(e));
    },
    async approve(req) {
      await db.collection('grants').add({ uid: req.uid, items: obj(req.items), req: req.id, note: str(req.label, 60), by: uid, at: Date.now() });
      await db.doc('requests/' + req.id).update({ status: 'approved', by: uid, doneAt: Date.now() });
    },
    async reject(req) {
      await db.doc('requests/' + req.id).update({ status: 'rejected', by: uid, doneAt: Date.now() });
    },
    async grant(target, items, note) {
      await db.collection('grants').add({ uid: target, items, note: str(note, 60) || '관리자 지급', by: uid, at: Date.now() });
    },
    async saveOp(docId, data) {
      const id = docId || db.collection('operators').doc().id;
      await db.doc('operators/' + id).set({ ...data, creator: data.creator || uid, updatedAt: Date.now() });
      return id;
    },
    async deleteOp(op) {
      await db.doc('operators/' + op.docId).delete();
      if (op.imageId && assets) { try { await assets.delete(op.imageId); } catch (e) { console.warn(e); } }
    },
    async upload(file) {
      if (!assets) throw new Error('no_assets');
      return assets.upload(file);
    },
    async setFeedback(id, patch) {
      const p = {};
      if (patch.status) p.status = str(patch.status, 20);
      if (patch.reply != null) p.reply = str(patch.reply, 500);
      await db.doc('requests/' + id).update({ ...p, by: uid, doneAt: Date.now() });
    },
    async setBanners(list) {
      await db.doc('config/banner').set({ list: list.slice(0, MAX_BANNERS).map(cleanBanner), by: uid, at: Date.now() });
    },
    profiles: (ids) => (user ? user.profiles(ids) : Promise.resolve({})),
  };

  window.ACCOUNT = {
    player, save, on, emit, normalize, freshPlayer,
    get mode() { return mode; }, get uid() { return uid; }, get isAdmin() { return isAdmin && mode === 'online'; }, get isOwner() { return isOwner && mode === 'online'; },
    get canUpload() { return !!assets && isAdmin; }, get canAttach() { return !!assets && mode === 'online'; }, FB_MAX_IMG, get myRequests() { return myRequests.filter((r) => r.kind !== 'feedback'); },
    get myFeedback() { return mode === 'online' ? myRequests.filter((r) => r.kind === 'feedback') : localFb(); }, sendFeedback,
    bal, canPay, spend, earn, owns, obtain, potOf,
    sanity, useSanity, addSanity, refillSanity, nextSanityMs, SANITY_MAX,
    banner, cleanBanner, MAX_BANNERS, RANGE_PRESETS, requestPurchase, admin,
    me: () => (user ? user.me() : Promise.resolve(null)),
    ready: Promise.resolve().then(init).catch((e) => console.warn(e)),
  };
})();
