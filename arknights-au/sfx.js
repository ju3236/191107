'use strict';
// =====================================================================
//  효과음 · BGM — 원작 사운드(snd/*.mp3)를 Web Audio로 재생, 파일을 못 불러오면 직접 합성한 소리로 대신
//  SFX.play('이름')  /  SFX.toggle()  /  SFX.enabled  /  SFX.bgm('home' | 'battle' | …)  /  SFX.toggleBgm()
// =====================================================================
(() => {
  const KEY = 'ashen-beacon-sound', BKEY = 'ashen-beacon-bgm';
  let enabled = true, bgmOn = true;
  try { enabled = localStorage.getItem(KEY) !== 'off'; bgmOn = localStorage.getItem(BKEY) !== 'off'; } catch { /* 저장 불가 환경 */ }

  let ac = null, master = null, noiseBuf = null, bgmGain = null;
  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.45;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    bgmGain = ac.createGain();
    bgmGain.gain.value = 0.35;
    bgmGain.connect(ac.destination);
    loadSamples();
    if (bgmWant) startBgm(bgmWant);
    return true;
  }
  // ---------- 원작 사운드 파일 ----------
  const SAMPLE = ['click', 'select', 'cancel', 'deny', 'deploy', 'retreat', 'slash', 'shot', 'arts', 'heal', 'hurt', 'kill', 'down', 'skill', 'strike', 'leak', 'boss', 'win', 'lose', 'gacha', 'levelup', 'tab'];
  const VOL = { click: 0.5, slash: 0.55, shot: 0.55, arts: 0.55, heal: 0.5, hurt: 0.45, kill: 0.6, gacha: 0.8 };
  const buf = {}, loading = {};
  function load(name) {
    if (buf[name] || loading[name]) return loading[name];
    loading[name] = fetch(`snd/${name}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((a) => new Promise((ok, no) => ac.decodeAudioData(a, ok, no))).then((b) => { buf[name] = b; return b; })
      .catch(() => { loading[name] = null; return null; });
    return loading[name];
  }
  function loadSamples() { for (const n of SAMPLE) load(n); }
  function playBuf(name) {
    const b = buf[name];
    if (!b) return false;
    const src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = b;
    g.gain.value = VOL[name] || 0.7;
    src.connect(g); g.connect(master);
    src.start();
    return true;
  }
  // ---------- BGM (반복 재생, 바뀔 때 페이드) ----------
  let bgmWant = null, bgmCur = null, bgmSrc = null, bgmNode = null;
  function stopBgm(fade = 0.8) {
    if (!bgmSrc) return;
    const s0 = bgmSrc, g0 = bgmNode, t = ac.currentTime;
    g0.gain.setValueAtTime(g0.gain.value, t);
    g0.gain.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => { try { s0.stop(); } catch { /* 이미 멈춤 */ } }, fade * 1000 + 50);
    bgmSrc = bgmNode = null; bgmCur = null;
  }
  function startBgm(name) {
    if (!ac || !bgmOn || !enabled) return;
    if (bgmCur === name && bgmSrc) return;
    stopBgm();
    bgmCur = name;
    load('bgm_' + name).then((b) => {
      if (!b || bgmWant !== name || bgmCur !== name || bgmSrc) return;
      const src = ac.createBufferSource(), g = ac.createGain(), t = ac.currentTime;
      src.buffer = b; src.loop = true;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(1, t + 1.2);
      src.connect(g); g.connect(bgmGain);
      src.start();
      bgmSrc = src; bgmNode = g;
    });
  }
  function bgm(name) {
    bgmWant = name || null;
    if (!ac) return;
    if (!name) { stopBgm(); return; }
    startBgm(name);
  }
  // 브라우저는 사용자가 화면을 누른 뒤에만 소리를 허용함
  window.addEventListener('pointerdown', () => { if (enabled) ensure(); }, { capture: true });

  // ---------- 소리 재료 ----------
  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone({ type = 'sine', f0, f1 = f0, t = 0, a = 0.005, d = 0.1, vol = 0.3, out = master }) {
    const now = ac.currentTime + t;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, now);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + a + d);
    env(g, now, a, d, vol);
    o.connect(g); g.connect(out);
    o.start(now); o.stop(now + a + d + 0.05);
  }
  function noise({ t = 0, a = 0.002, d = 0.08, vol = 0.3, filter = 'bandpass', f0 = 2000, f1 = f0, q = 1 }) {
    const now = ac.currentTime + t;
    const src = ac.createBufferSource(), flt = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf;
    flt.type = filter;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, now);
    if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + a + d);
    env(g, now, a, d, vol);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(now, Math.random() * 0.5); src.stop(now + a + d + 0.05);
  }

  // ---------- 효과음 목록 ----------
  const SOUNDS = {
    click:   () => { tone({ type: 'square', f0: 1400, f1: 900, d: 0.04, vol: 0.06 }); },
    select:  () => { tone({ type: 'triangle', f0: 660, d: 0.05, vol: 0.18 }); tone({ type: 'triangle', f0: 990, t: 0.05, d: 0.07, vol: 0.18 }); },
    cancel:  () => { tone({ type: 'triangle', f0: 700, f1: 420, d: 0.08, vol: 0.12 }); },
    deny:    () => { tone({ type: 'square', f0: 180, d: 0.12, vol: 0.12 }); },
    deploy:  () => {
      tone({ type: 'sine', f0: 160, f1: 50, d: 0.18, vol: 0.55 });
      noise({ filter: 'lowpass', f0: 1800, f1: 200, d: 0.16, vol: 0.35 });
      tone({ type: 'triangle', f0: 880, f1: 1320, t: 0.04, d: 0.12, vol: 0.08 });
    },
    retreat: () => { noise({ filter: 'bandpass', f0: 600, f1: 2400, a: 0.05, d: 0.2, vol: 0.18, q: 2 }); },
    slash:   () => { noise({ filter: 'bandpass', f0: 4200, f1: 1200, d: 0.09, vol: 0.32, q: 1.5 }); tone({ type: 'sawtooth', f0: 320, f1: 120, d: 0.06, vol: 0.06 }); },
    shot:    () => { noise({ filter: 'highpass', f0: 3000, d: 0.04, vol: 0.18 }); tone({ type: 'square', f0: 1100, f1: 380, d: 0.06, vol: 0.06 }); },
    arts:    () => { tone({ type: 'sine', f0: 420, f1: 1500, a: 0.01, d: 0.16, vol: 0.18 }); tone({ type: 'triangle', f0: 840, f1: 2600, t: 0.02, d: 0.12, vol: 0.06 }); },
    heal:    () => { tone({ type: 'sine', f0: 880, d: 0.12, vol: 0.1 }); tone({ type: 'sine', f0: 1320, t: 0.06, d: 0.16, vol: 0.08 }); },
    hurt:    () => { noise({ filter: 'lowpass', f0: 900, d: 0.07, vol: 0.28 }); tone({ type: 'sine', f0: 110, f1: 70, d: 0.08, vol: 0.2 }); },
    kill:    () => { noise({ filter: 'bandpass', f0: 1200, f1: 200, d: 0.2, vol: 0.3 }); tone({ type: 'square', f0: 420, f1: 70, d: 0.18, vol: 0.08 }); },
    down:    () => { tone({ type: 'square', f0: 330, f1: 90, d: 0.4, vol: 0.12 }); noise({ filter: 'lowpass', f0: 600, d: 0.3, vol: 0.2 }); },
    skill:   () => {
      tone({ type: 'sawtooth', f0: 300, f1: 1400, a: 0.02, d: 0.25, vol: 0.12 });
      [1568, 2093, 2637].forEach((f, i) => tone({ type: 'sine', f0: f, t: 0.12 + i * 0.05, d: 0.18, vol: 0.08 }));
    },
    strike:  () => { noise({ filter: 'bandpass', f0: 6000, f1: 800, d: 0.25, vol: 0.45, q: 0.8 }); tone({ type: 'sine', f0: 90, f1: 40, d: 0.3, vol: 0.4 }); },
    leak:    () => { tone({ type: 'square', f0: 880, d: 0.12, vol: 0.12 }); tone({ type: 'square', f0: 660, t: 0.16, d: 0.16, vol: 0.12 }); },
    boss:    () => { tone({ type: 'sawtooth', f0: 82, d: 0.8, a: 0.05, vol: 0.25 }); tone({ type: 'sawtooth', f0: 123, t: 0.1, d: 0.7, a: 0.05, vol: 0.15 }); },
    spawn:   () => { tone({ type: 'sine', f0: 220, f1: 330, d: 0.1, vol: 0.05 }); },
    win:     () => { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, t: i * 0.11, d: i === 3 ? 0.5 : 0.14, vol: 0.2 })); },
    lose:    () => { [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f0: f, t: i * 0.16, d: 0.22, vol: 0.18 })); },
    gacha:   () => {
      tone({ type: 'sawtooth', f0: 110, f1: 880, a: 0.05, d: 1.2, vol: 0.12 });
      noise({ filter: 'bandpass', f0: 400, f1: 6000, a: 0.3, d: 1.0, vol: 0.12, q: 0.7 });
    },
    rev3:    () => { tone({ type: 'triangle', f0: 660, d: 0.15, vol: 0.15 }); },
    rev4:    () => { tone({ type: 'triangle', f0: 660, d: 0.12, vol: 0.15 }); tone({ type: 'triangle', f0: 990, t: 0.08, d: 0.2, vol: 0.15 }); },
    rev5:    () => { [784, 988, 1175].forEach((fq, i) => tone({ type: 'triangle', f0: fq, t: i * 0.08, d: 0.3, vol: 0.16 })); },
    rev6:    () => {
      tone({ type: 'sine', f0: 60, f1: 40, d: 0.6, vol: 0.5 });
      [523, 659, 784, 1047, 1319].forEach((fq, i) => tone({ type: 'triangle', f0: fq, t: 0.1 + i * 0.09, d: i === 4 ? 0.8 : 0.25, vol: 0.18 }));
      noise({ filter: 'highpass', f0: 5000, a: 0.05, d: 0.6, vol: 0.08 });
    },
    text:    () => { tone({ type: 'square', f0: 1800 + Math.random() * 200, d: 0.015, vol: 0.025 }); },
  };
  // 같은 소리가 한꺼번에 몰리지 않도록 최소 간격(초)
  const GAP = { slash: 0.06, shot: 0.05, arts: 0.06, heal: 0.08, hurt: 0.08, kill: 0.05, text: 0.04, spawn: 0.15, click: 0.03 };
  const last = {};

  function play(name) {
    if (!enabled || !(SOUNDS[name] || SAMPLE.includes(name)) || !ensure()) return;
    const now = ac.currentTime;
    if (GAP[name] && now - (last[name] || -1) < GAP[name]) return;
    last[name] = now;
    try { if (!playBuf(name)) SOUNDS[name](); } catch { /* 오디오 오류는 무시 */ }
  }
  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 저장 불가 환경 */ }
    if (on) { ensure(); play('select'); if (bgmWant) startBgm(bgmWant); } else if (ac) stopBgm(0.3);
  }
  function setBgm(on) {
    bgmOn = on;
    try { localStorage.setItem(BKEY, on ? 'on' : 'off'); } catch { /* 저장 불가 환경 */ }
    if (!ac) return;
    if (on && bgmWant) startBgm(bgmWant); else stopBgm(0.3);
  }

  // 일반 버튼 클릭음 (배치 카드는 전투 코드에서 따로 냄)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, [data-go]');
    if (b && !b.classList.contains('card') && !b.disabled) play('click');
  }, true);

  window.SFX = {
    play,
    get enabled() { return enabled; },
    toggle() { setEnabled(!enabled); return enabled; },
    bgm,
    get bgmOn() { return bgmOn; },
    toggleBgm() { setBgm(!bgmOn); return bgmOn; },
  };
})();
