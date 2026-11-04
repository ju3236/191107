'use strict';
// =====================================================================
//  백하방주 — 프롤로그 진행 · 메인 화면 안내 (데이터는 prologue-data.js)
//  계정 데이터 save.prologue: 'done' | 'skip' (없으면 새 계정) · save.prologueClear: { 'P-1': true … } 첫 클리어 보상
// =====================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const { save, writeSave, toast, go, playDialog, OPS, openModal, closeModal, esc } = UI;
  const P = PROLOGUE;
  const sfx = (n) => window.SFX && SFX.play(n);
  const opOf = (id) => OPS[id] || OPERATORS.find((o) => o.id === id);

  // 프롤로그 전용 오퍼레이터 (계정 보유 · 육성과 관계없이 정해진 상태)
  const squadDefs = (st) => st.squad.map((id) => ({ ...TRAIN.trained(opOf(id), P.prog), fixedSkill: P.skill[id] ?? 0 }));
  function amiyaDef() {
    const base = opOf('noa') || OPERATORS.find((o) => o.class === 'caster');
    const d = TRAIN.trained(base, { ...P.prog, elite: 2, level: 60, slv: 7 });
    return { ...d, id: 'amiya_p', name: '아미야', en: 'Amiya', image: undefined, baseImage: undefined, color: '#6b5cd6', voice: null, voices: null, quote: '박사님, 함께 싸울게요.', fixedSkill: 0, rarity: 5, summoned: false };
  }
  const stObj = (st) => ({ ...st, chapter: 'prologue', prologue: true, storyBg: 'img/ui/story_0.webp' });
  const itemsText = (o) => Object.entries(o).map(([k, v]) => `${ITEMS[k] ? ITEMS[k].name : k} ×${Number(v).toLocaleString('ko-KR')}`).join(' · ');

  function play(n, skipStory) {
    const st = P.stages[n], so = stObj(st);
    const run = () => window.Battle.begin(so, st.squad, {
      defs: squadDefs(st), tutorial: st.tutorial, life: st.life,
      onTutRun: (k, api) => { if (k === 'amiya') { api.addOp(amiyaDef()); api.addDp(20); sfx('skill'); } },
      onEnd: (r) => onEnd(n, r),
    });
    if (skipStory || !st.before) run(); else playDialog(st.before, run, so);
  }
  function onEnd(n, r) {
    const st = P.stages[n];
    if (!r.win) {
      return { text: r.quit ? '프롤로그를 중단했습니다' : '작전 실패 · 다시 도전할 수 있습니다',
        buttons: [{ label: '다시 도전', cls: 'primary', fn: () => play(n, true) }, { label: '나가기', fn: () => go('home') }] };
    }
    save.prologueClear = save.prologueClear || {};
    let text = `${st.code} 「${st.name}」 완료`;
    if (!save.prologueClear[st.code]) {
      save.prologueClear[st.code] = true;
      const rw = P.reward[st.code];
      if (rw) { ACCOUNT.earn(rw); text += ` · 첫 클리어 보상: ${itemsText(rw)}`; }
      writeSave(); ACCOUNT.save();
    }
    return { text, buttons: [{ label: n < P.stages.length - 1 ? '다음으로' : '계속', cls: 'primary', fn: () => after(n) }] };
  }
  function after(n) {
    const st = P.stages[n], next = () => (n < P.stages.length - 1 ? play(n + 1) : finish());
    if (st.after && st.after.length) playDialog(st.after, next, stObj(st)); else next();
  }
  function finish() {
    const first = save.prologue !== 'done';
    save.prologue = 'done'; writeSave();
    go('home');
    if (first) setTimeout(homeGuide, 700);
  }

  // ---------- 새 계정: 프롤로그 시작 안내 ----------
  const isNew = () => !save.prologue && !Object.keys(save.stars || {}).length;
  function offer(k = 0) {
    setTimeout(() => {
      if (!isNew()) return;
      if (UI.current !== 'home' || !$('#modal').classList.contains('hidden') || !$('#notice').classList.contains('hidden') || !$('#dialog').classList.contains('hidden')) { if (k < 60) offer(k + 1); return; }
      openModal(`<div class="modal-title">프롤로그 「방과후 탐방」</div><div class="modal-sub">PROLOGUE</div>
        <p class="modal-text">박사님, 처음 오셨군요. 기본 조작을 익힐 수 있는 짧은 프롤로그(작전 3개)를 시작할까요?<br>나중에 작전 → 메인 스토리에서 언제든 다시 볼 수 있습니다.</p>
        <div class="panel-btns"><button class="btn primary" id="pl-go">시작</button><button class="btn" id="pl-skip">건너뛰기</button></div>`);
      $('#pl-go').addEventListener('click', () => { closeModal(); play(0); });
      $('#pl-skip').addEventListener('click', () => { save.prologue = 'skip'; writeSave(); closeModal(); toast('프롤로그를 건너뛰었습니다. 작전 → 메인 스토리에서 볼 수 있습니다'); setTimeout(homeGuide, 400); });
    }, k ? 1000 : 2200);
  }
  offer();

  // ---------- 메인 화면 안내 (프롤로그 뒤 한 번) ----------
  const GUIDE = [
    { sel: '[data-go="headhunt"]', who: 'simhae', text: '여기가 헤드헌팅이에요. 새 오퍼레이터를 데려올 수 있어요. 처음 10번 안에는 5성 이상이 꼭 나온대요!' },
    { sel: '[data-go="recruit"]', who: 'iai', text: '공개모집은 태그를 골라서 사람을 뽑는 곳임다. 허가증은 우편함에 들어 있슴다.' },
    { sel: '[data-go="formation"]', who: 'gaeul', text: '편성. 작전에 데려갈 사람을 정해요. 12명까지 돼요.' },
    { sel: '[data-go="roster"]', who: 'byeol', text: '……오퍼레이터를… 키우는 곳이에요… 레벨이랑… 정예화…' },
    { sel: '[data-go="operations"]', who: 'gaeul', text: '준비되면 작전으로. 1-1 「첫 출격」부터예요, 박사님.' },
  ];
  function homeGuide(i = 0, k = 0) {
    // 다른 창(출석 · 공지 · 우편 등)이 닫힌 뒤에 시작
    if (i === 0 && UI.current === 'home' && (!$('#modal').classList.contains('hidden') || !$('#notice').classList.contains('hidden') || !$('#dialog').classList.contains('hidden'))) {
      if (k < 120) setTimeout(() => homeGuide(0, k + 1), 1000);
      return;
    }
    let ov = document.getElementById('hguide');
    if (!ov) { ov = document.createElement('div'); ov.id = 'hguide'; ov.className = 'hguide'; document.body.appendChild(ov); }
    document.querySelectorAll('.hg-focus').forEach((e) => e.classList.remove('hg-focus'));
    if (i >= GUIDE.length || UI.current !== 'home') { ov.remove(); return; }
    const g = GUIDE[i], el = $(`#screen-home ${g.sel}`), o = opOf(g.who);
    if (!el) { homeGuide(i + 1); return; }
    el.classList.add('hg-focus');
    const r = el.getBoundingClientRect(), below = r.top < window.innerHeight / 2;
    ov.innerHTML = `<div class="hg-bubble" style="left:${Math.max(12, Math.min(window.innerWidth - 372, r.left + r.width / 2 - 180))}px;${below ? `top:${r.bottom + 12}px` : `bottom:${window.innerHeight - r.top + 12}px`}">
      <span class="tut-face" style="--c:${o.color}">${o.image ? `<img src="${esc(o.image)}" alt="">` : esc(o.name[0])}</span>
      <div><b style="color:${o.color}">${esc(o.name)}</b><p>${esc(g.text)}</p><small>${i + 1}/${GUIDE.length} · 눌러서 계속</small></div></div>
      <button class="hg-skip" data-hgskip>안내 끄기</button>`;
    ov.onclick = (e) => { e.stopPropagation(); if (e.target.closest('[data-hgskip]')) { homeGuide(GUIDE.length); return; } sfx('select'); homeGuide(i + 1); };
  }

  window.PROLOGUE_UI = { play, homeGuide };
})();
