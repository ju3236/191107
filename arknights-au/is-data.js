'use strict';
// =====================================================================
//  통합전략 데이터 — 「가라앉은 등대」 (바다 테마)
//  분대 · 모집권 · 층 · 작전 맵 · 소장품 · 불온한 조우는 전부 여기서 고칩니다.
//  시본 적 이름·능력은 원작 적 도감(Aceship AN-EN-Tags)을 참고했고,
//  적 그림은 원작 아이콘(© Hypergryph / Yostar)입니다. 비상업 팬 게임 용도로만 쓰세요.
// =====================================================================

// ---------------------------------------------------------------------
//  바다의 적 (ENEMIES에 추가). 능력 키는 data.js 적 구역 주석 + 아래:
//    sea: 시본(명흔 위에서 HP 회복) / neural: 공격 시 신경 손상 수치 / neuralAura({radius, amount}: 초당)
//    dodge: 회피 확률 / targets: 동시 공격 수 / lowHp: HP 비율 낮은 대상 우선
//    burst({step, mul, radius, neural}): HP를 step 비율 잃을 때마다 주변 마법 피해
//    brandOnDeath: 쓰러진 자리에 명흔 / brandTrail: HP 50% 미만이면 지나간 자리에 명흔
//    brandUnblockable: 명흔 위에서 저지 불가 / brandAtk: 명흔 위 공격력 배율
//    harden({below, def}): HP가 below 미만이면 방어력 배율 / summon({enemy, every, count}): 주기적으로 소환
//  신경 손상: 1000까지 쌓이면 오퍼레이터가 800 피해를 입고 6초 기절합니다.
//  명흔(맵 기호 ~): 위에 있는 오퍼레이터는 방어력 -30%, 초당 최대 HP 1% 감소. 시본은 초당 HP 1.5% 회복.
// ---------------------------------------------------------------------
const SEA_ENEMIES = {
  dshond:   { code: 'SB1', name: '해안의 폭주자', hp: 3000, atk: 280, def: 0, res: 20, speed: 0.95, interval: 1.3, range: 0, sea: true, color: '#3fb6a8', desc: '해안을 무리 지어 달리는 시테러. 매우 빠르다.' },
  dssbr:    { code: 'SB2', name: '저해의 활주자', hp: 2800, atk: 280, def: 130, res: 10, speed: 0.55, interval: 2.0, range: 0, sea: true, neural: 250, color: '#46a3b5', desc: '얕은 바다를 미끄러지듯 다가오는 시테러. 공격하면 신경 손상을 준다.' },
  dsbow:    { code: 'SB3', name: '바다의 분사자', hp: 4400, atk: 280, def: 160, res: 20, speed: 0.375, interval: 3.0, range: 2.5, sea: true, color: '#5c9fd6', desc: '바닷물을 고압으로 분사해 멀리서 공격한다.' },
  dsjely:   { code: 'SB4', name: '부해의 항해자', hp: 3000, atk: 220, def: 200, res: 20, speed: 0.375, interval: 3.0, range: 2.5, fly: true, sea: true, neural: 200, color: '#8fb8ff', desc: '바람을 타고 떠다니는 비행 시테러. 공격하면 신경 손상을 준다.' },
  syfish:   { code: 'SB5', name: '앙상한 표류체', hp: 4000, atk: 250, def: 150, res: 10, speed: 0.6, interval: 2.0, range: 0, sea: true, color: '#7aa6a1', desc: '살점이 거의 남지 않은 채 해류에 떠밀려 온 시테러.' },
  syzeni:   { code: 'SB6', name: '바다의 착석자', hp: 6000, atk: 300, def: 200, res: 10, speed: 0.45, interval: 2.5, range: 2.4, sea: true, color: '#5f8c9e', desc: '단단한 껍데기를 두른 시테러. 멀리서 적을 노린다.' },
  dsrunr:   { code: 'SB7', name: '심해의 포식자', hp: 4000, atk: 450, def: 50, res: 0, speed: 0.5, interval: 3.0, range: 0, sea: true, dodge: 0.3, brandUnblockable: true, color: '#2d8f86', desc: '갑각 머리로 들이받는 시테러. 공격을 30% 확률로 회피하고, 명흔 위에서는 저지되지 않는다.' },
  dsshtr:   { code: 'SB8', name: '심해의 분출자', hp: 4000, atk: 650, def: 100, res: 50, speed: 0.15, interval: 2.0, range: 1.1, targets: 3, sea: true, color: '#4f7cac', desc: '포자를 뿌리는 느린 시테러. 가까운 대상 3명을 동시에 공격한다.' },
  dsbudr:   { code: 'SB9', name: '심해의 정초자', hp: 7000, atk: 450, def: 200, res: 30, speed: 0.5, interval: 3.0, range: 0, elite: true, sea: true, brandOnDeath: true, color: '#1f7a7a', desc: '갑각 머리가 자란 시테러. 쓰러진 자리에 명흔이 생긴다.' },
  dsexcu:   { code: 'SB10', name: '태초 바다의 랜서', hp: 9000, atk: 550, def: 240, res: 20, speed: 0.375, interval: 3.5, range: 1.7, elite: true, sea: true, lowHp: true, color: '#3a6ea5', desc: '가시 돋친 고체 기관을 가진 시테러. HP 비율이 가장 낮은 대상을 노린다.' },
  dsurch:   { code: 'SB11', name: '낭해의 저항자', hp: 25000, atk: 300, def: 0, res: 0, speed: 0.2, interval: 3.0, range: 0, weight: 2, elite: true, sea: true, burst: { step: 0.25, mul: 2, radius: 1.5, neural: 300 }, color: '#6a5acd', desc: 'HP를 25% 잃을 때마다 주변에 큰 마법 피해와 신경 손상을 준다. 저지에 2칸이 필요하다.' },
  dslntc:   { code: 'SB12', name: '발해의 수확자', hp: 12000, atk: 400, def: 600, res: 60, speed: 0.15, interval: 3.0, range: 0, weight: 2, elite: true, sea: true, neuralAura: { radius: 1.6, amount: 60 }, color: '#2b5f75', desc: '주변의 오퍼레이터에게 계속해서 신경 손상을 준다. 방어력과 마법 저항이 모두 높다.' },
  dssalr:   { code: 'SB13', name: '심해의 인도자', hp: 14000, atk: 800, def: 450, res: 5, speed: 0.4, interval: 4.0, range: 0, weight: 3, elite: true, sea: true, brandTrail: true, harden: { below: 0.5, def: 1.5 }, color: '#14506b', desc: 'HP가 50% 미만이 되면 방어력이 오르고 지나간 자리에 명흔을 남긴다.' },
  dsubrl:   { code: 'SB14', name: '심해의 소용자', hp: 10000, atk: 220, def: 550, res: 60, speed: 0.4, interval: 1.0, range: 1.6, arts: true, elite: true, sea: true, neuralAura: { radius: 1.6, amount: 80 }, color: '#5b3f8c', desc: '주위의 미생물을 조종해 계속 마법 피해와 신경 손상을 준다.' },
  syufo:    { code: 'SB15', name: '부유의 표류체', hp: 20000, atk: 500, def: 250, res: 40, speed: 0.3, interval: 4.0, range: 2.6, fly: true, elite: true, sea: true, color: '#7f9fc8', desc: '하늘에 적응하기 시작한 거대한 비행 시테러.' },
  syrott:   { code: 'SB16', name: '이샤믈라의 눈물', hp: 3000, atk: 220, def: 100, res: 30, speed: 0.6, interval: 2.0, range: 0, sea: true, color: '#9ad1d4', desc: '이샤믈라에게서 떨어져 나온 작은 시본.' },
  divman:   { code: 'DV1', name: '잠수부', hp: 3300, atk: 240, def: 150, res: 20, speed: 0.45, interval: 2.7, range: 1.9, brandAtk: 1.5, color: '#c2a35a', desc: '심해 교회에 협력하는 잠수부. 명흔 위에서 공격력이 오른다.' },
  divman_l: { code: 'DV2', name: '잠수대장', hp: 4000, atk: 320, def: 200, res: 20, speed: 0.45, interval: 2.7, range: 1.9, brandAtk: 1.5, color: '#d4b26a', desc: '잠수부들의 대장. 명흔 위에서 공격력이 오른다.' },
  symon:    { code: 'SB17', name: '파도의 멸사체', hp: 8000, atk: 600, def: 600, res: 0, speed: 0.3, interval: 1.7, range: 0, elite: true, sea: true, revive: { atk: 1.2 }, color: '#356b8a', desc: '주교를 지키는 시본. 쓰러져도 한 번 다시 일어선다.' },
  // ---- 보스 ----
  syevil:   { code: 'SBB', name: '파도의 주교', hp: 28000, atk: 600, def: 300, res: 55, speed: 0.2, interval: 4.5, range: 3.5, arts: true, aoe: 1.0, neural: 200, revive: { atk: 1.3 }, lifeCost: 3, boss: true, sea: true, color: '#4fc3f7',
              desc: '심해 교회의 주교. 멀리서 범위 마법 피해와 신경 손상을 주고, 쓰러지면 한 번 부활한다. 돌파당하면 목숨 3 감소.' },
  syskad:   { code: 'SBX', name: '이샤믈라, 부식의 마음', hp: 34000, atk: 1100, def: 450, res: 45, speed: 0.22, interval: 5.0, range: 0, aoe: 1.0, weight: 3, revive: { atk: 1.5 }, summon: { enemy: 'syrott', every: 16, count: 2 }, lifeCost: 5, boss: true, sea: true, color: '#00bfa5',
              desc: '바다의 심장부에 자리한 거대한 시본. 주기적으로 「이샤믈라의 눈물」을 불러내고, 쓰러지면 더 강해져 다시 일어선다. 저지에 3칸이 필요하며 돌파당하면 목숨 5 감소.' },
};
for (const [id, e] of Object.entries(SEA_ENEMIES)) ENEMIES[id] = { image: `img/enemy/${id}.png`, ...e };

const IS_DATA = {
  title: '가라앉은 등대',
  code: '통합전략 #1',
  en: 'THE SUNKEN BEACON',
  intro: '이베리아 앞바다에서 꺼진 지 오래인 등대의 불빛이 다시 깜박이기 시작했다. 로도스 아일랜드 행동대 「등대」는 신호의 근원을 찾아 바다 아래로 향한다. 물러설 길은 없다. 가라앉은 등대에 닿을 때까지.',

  start: { life: 10, ingot: 10, hope: 8, tickets: 3 },
  // 모집·승진에 드는 희망 (레어도별)
  hopeCost: { 6: 3, 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 },
  promoteCost: { 6: 3, 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 },
  unpromoted: 0.8,                   // 승진 전 오퍼레이터 능력치 배율 (1스킬만 사용)
  levelExp: [0, 3, 7, 12, 18, 25],   // 지휘 레벨 n이 되는 누적 경험. 레벨이 오를 때마다 희망 +1
  floorScale: [0.6, 0.75, 0.9, 1.0], // 층마다 적 HP·공격력 배율
  emergencyScale: 1.25,              // 긴급 작전 적 능력치 추가 배율

  // 모집권: 두 직군 중 보유한 오퍼레이터를 1명 모집
  tickets: {
    vs:  { name: '뱅가드·서포터 모집권', classes: ['vanguard', 'supporter'] },
    gs:  { name: '가드·스페셜리스트 모집권', classes: ['guard', 'specialist'] },
    dm:  { name: '디펜더·메딕 모집권', classes: ['defender', 'medic'] },
    sc:  { name: '스나이퍼·캐스터 모집권', classes: ['sniper', 'caster'] },
    all: { name: '전 직군 모집권', classes: null },
  },

  // 분대: 탐색 시작 시 하나 고름. fx는 소장품과 같은 형식
  squads: [
    { id: 'command', name: '지휘 분대', desc: '시작 희망 +2', fx: { gain: { hope: 2 } } },
    { id: 'logistic', name: '후방 지원 분대', desc: '시작 원석 덩어리 +10, 교역소 가격 -10%', fx: { gain: { ingot: 10 }, shopDiscount: 0.1 } },
    { id: 'assault', name: '돌격 전술 분대', desc: '뱅가드·가드 공격력 +15%', fx: { stat: { atk: 0.15 }, classes: ['vanguard', 'guard'] } },
    { id: 'bulwark', name: '보루 전술 분대', desc: '디펜더·메딕 HP +20%, 방어력 +10%', fx: { stat: { hp: 0.2, def: 0.1 }, classes: ['defender', 'medic'] } },
    { id: 'ranged', name: '원거리 전술 분대', desc: '스나이퍼·캐스터 공격력 +15%', fx: { stat: { atk: 0.15 }, classes: ['sniper', 'caster'] } },
    { id: 'research', name: '연구 분대', desc: '시작 시 무작위 소장품 2개, 시작 희망 -2', fx: { gain: { relic: 2, hope: -2 } } },
    { id: 'beacon', name: '등대 분대', desc: '시작 목숨 +4, 명흔에 의한 HP 감소 무시 (등대 AU 전용)', fx: { gain: { life: 4 }, brandImmune: true } },
  ],

  // ---------------------------------------------------------------------
  //  소장품 (임시 목록 — 나중에 원작 목록으로 바꿔 넣으세요)
  //  { id, no: 번호, name, rarity: 'common'|'rare'|'special', price: 교역소 가격, desc, fx }
  //  fx 키:
  //    stat { atk, hp, def, aspd, cost, redeploy } — atk/hp/def/aspd는 +비율(0.1 = +10%), cost는 ±정수, redeploy는 비율(-0.3 = 30% 감소)
  //    classes: ['guard', ...] / rarity: [6] — stat을 받을 오퍼레이터 조건 (없으면 전원)
  //    battle { startDp, deployLimit, dpRate } — 시작 코스트, 배치 인원, 코스트 회복 속도(+비율)
  //    enemy { hp, atk, def, speed } — 적 능력치 비율 (-0.1 = 10% 감소)
  //    gain { ingot, hope, life, relic, ticket } — 얻는 순간 1회
  //    ingotRate(전투 원석 덩어리 +비율), shopDiscount(교역소 할인 비율), lowLife({ below, stat }): 목숨이 below 이하일 때 stat
  //    brandImmune: 명흔에 의한 HP 감소 무시
  // ---------------------------------------------------------------------
  relics: [
    { id: 'whistle', no: 1, name: '소라 껍데기 호루라기', rarity: 'common', price: 6, desc: '전투 시작 시 배치 코스트 +4', fx: { battle: { startDp: 4 } } },
    { id: 'rope', no: 2, name: '젖은 밧줄', rarity: 'common', price: 6, desc: '디펜더 HP +15%', fx: { stat: { hp: 0.15 }, classes: ['defender'] } },
    { id: 'lantern', no: 3, name: '꺼진 랜턴', rarity: 'common', price: 6, desc: '스나이퍼 공격력 +12%', fx: { stat: { atk: 0.12 }, classes: ['sniper'] } },
    { id: 'net', no: 4, name: '찢어진 그물', rarity: 'common', price: 7, desc: '적 이동 속도 -8%', fx: { enemy: { speed: -0.08 } } },
    { id: 'silver', no: 5, name: '녹슨 은화 꾸러미', rarity: 'common', price: 4, desc: '얻는 즉시 원석 덩어리 +8', fx: { gain: { ingot: 8 } } },
    { id: 'biscuit', no: 6, name: '건빵 통조림', rarity: 'common', price: 5, desc: '얻는 즉시 목숨 +2', fx: { gain: { life: 2 } } },
    { id: 'chart', no: 7, name: '해도 조각', rarity: 'common', price: 7, desc: '가드 공격력 +10%, 공격 속도 +5%', fx: { stat: { atk: 0.1, aspd: 0.05 }, classes: ['guard'] } },
    { id: 'gloves', no: 8, name: '방수 장갑', rarity: 'common', price: 7, desc: '뱅가드 배치 코스트 -1', fx: { stat: { cost: -1 }, classes: ['vanguard'] } },
    { id: 'kelp', no: 9, name: '말린 해초', rarity: 'common', price: 6, desc: '메딕 공격력(치료량) +15%', fx: { stat: { atk: 0.15 }, classes: ['medic'] } },
    { id: 'ink', no: 10, name: '문어 먹물 병', rarity: 'common', price: 6, desc: '캐스터 공격력 +12%', fx: { stat: { atk: 0.12 }, classes: ['caster'] } },
    { id: 'buoy', no: 11, name: '부표 종', rarity: 'common', price: 8, desc: '배치 가능 인원 +1', fx: { battle: { deployLimit: 1 } } },
    { id: 'salt', no: 12, name: '굵은 소금', rarity: 'common', price: 7, desc: '적 HP -5%', fx: { enemy: { hp: -0.05 } } },
    { id: 'lens', no: 13, name: '등대 렌즈 파편', rarity: 'rare', price: 12, desc: '모든 오퍼레이터 공격력 +8%', fx: { stat: { atk: 0.08 } } },
    { id: 'anchor', no: 14, name: '작은 닻', rarity: 'rare', price: 12, desc: '모든 오퍼레이터 방어력 +12%, HP +8%', fx: { stat: { def: 0.12, hp: 0.08 } } },
    { id: 'diary', no: 15, name: '등대지기의 일지', rarity: 'rare', price: 10, desc: '전투에서 얻는 원석 덩어리 +30%', fx: { ingotRate: 0.3 } },
    { id: 'scale', no: 16, name: '시본의 비늘', rarity: 'rare', price: 13, desc: '적 방어력 -10%', fx: { enemy: { def: -0.1 } } },
    { id: 'hook', no: 17, name: '갈고리 손', rarity: 'rare', price: 11, desc: '스페셜리스트·서포터 공격력 +15%, 재배치 시간 -30%', fx: { stat: { atk: 0.15, redeploy: -0.3 }, classes: ['specialist', 'supporter'] } },
    { id: 'tidetable', no: 18, name: '조수표', rarity: 'rare', price: 12, desc: '배치 코스트 회복 속도 +10%', fx: { battle: { dpRate: 0.1 } } },
    { id: 'badge', no: 19, name: '로도스 구조대 휘장', rarity: 'rare', price: 10, desc: '얻는 즉시 희망 +3', fx: { gain: { hope: 3 } } },
    { id: 'pearl', no: 20, name: '흑진주', rarity: 'rare', price: 9, desc: '교역소 가격 -20%', fx: { shopDiscount: 0.2 } },
    { id: 'whaleheart', no: 21, name: '고래의 심장', rarity: 'special', price: 16, desc: '목숨이 5 이하일 때 모든 오퍼레이터 공격력 +25%', fx: { lowLife: { below: 5, stat: { atk: 0.25 } } } },
    { id: 'coral', no: 22, name: '산호 왕관', rarity: 'special', price: 18, desc: '6성 오퍼레이터 공격력·HP +10%', fx: { stat: { atk: 0.1, hp: 0.1 }, rarity: [6] } },
    { id: 'ember', no: 23, name: '잿빛 등대의 불씨', rarity: 'special', price: 20, desc: '모든 오퍼레이터 공격력 +12%, 전투 시작 시 배치 코스트 +6', fx: { stat: { atk: 0.12 }, battle: { startDp: 6 } } },
    { id: 'blacksail', no: 24, name: '검은 돛', rarity: 'special', price: 18, desc: '적 공격력 -10%, 적 이동 속도 -5%', fx: { enemy: { atk: -0.1, speed: -0.05 } } },
  ],
  rarityName: { common: '일반', rare: '희귀', special: '특별' },

  // ---------------------------------------------------------------------
  //  층. battles: 이 층의 작전 id, gate: 층 마지막 작전 id
  // ---------------------------------------------------------------------
  floors: [
    { name: '얕은 여울', en: 'SHALLOWS', battles: ['tidemark', 'breakwater', 'sandbar'], gate: 'gate1' },
    { name: '잠긴 교회', en: 'DROWNED CHURCH', battles: ['chapel', 'saltway', 'reef'], gate: 'altar' },
    { name: '침몰선의 무덤', en: 'SHIP GRAVEYARD', battles: ['deck', 'hold', 'chain'], gate: 'gate3' },
    { name: '빛 없는 심해', en: 'LIGHTLESS DEEP', battles: ['abyss', 'brandfield', 'trench'], gate: 'heart' },
  ],
  cols: 5,   // 층마다 마지막 작전 앞의 칸 수

  // ---------------------------------------------------------------------
  //  작전 맵 (맵 기호는 data.js와 같고 ~ 명흔 추가)
  //  waves: 일반 작전 / extra: 긴급 작전일 때 추가되는 적
  // ---------------------------------------------------------------------
  battles: {
    // ===== 1층 얕은 여울 =====
    tidemark: {
      name: '밀물 자국', startDp: 10, deployLimit: 7,
      map: [
        '############',
        '#^^^^#^^^^^#',
        'R-.........#',
        '#^^^^.^^^.^#',
        '#^^^^.^^...B',
        '#^^^^^^^^^^#',
        '############',
      ],
      waves: [
        { t: 4, enemy: 'syfish', count: 3, gap: 4 },
        { t: 20, enemy: 'dshond', count: 3, gap: 2 },
        { t: 36, enemy: 'dssbr', count: 3, gap: 4 },
        { t: 55, enemy: 'dsbow', count: 2, gap: 6 },
        { t: 70, enemy: 'dshond', count: 4, gap: 2 },
      ],
      extra: [{ t: 45, enemy: 'syzeni', count: 2, gap: 6 }, { t: 80, enemy: 'dsbudr', count: 1 }],
    },
    breakwater: {
      name: '부서진 방파제', startDp: 12, deployLimit: 8,
      map: [
        '############',
        'R-...^^^^^^#',
        '#^^^.^^^^^^#',
        '#^^^.......B',
        '#^^^.^^^^^^#',
        'R-...^^^^^^#',
        '############',
      ],
      waves: [
        { t: 4, enemy: 'dssbr', count: 2, gap: 5, spawn: 0 },
        { t: 10, enemy: 'syfish', count: 2, gap: 5, spawn: 1 },
        { t: 28, enemy: 'dshond', count: 3, gap: 2, spawn: 0 },
        { t: 34, enemy: 'dshond', count: 3, gap: 2, spawn: 1 },
        { t: 50, enemy: 'divman', count: 2, gap: 5, spawn: 0 },
        { t: 60, enemy: 'dsbow', count: 2, gap: 5, spawn: 1 },
        { t: 78, enemy: 'dssbr', count: 3, gap: 3, spawn: 0 },
      ],
      extra: [{ t: 70, enemy: 'dsbudr', count: 1, spawn: 1 }, { t: 88, enemy: 'divman_l', count: 2, gap: 4, spawn: 0 }],
    },
    sandbar: {
      name: '등대 아래 모래톱', startDp: 10, deployLimit: 8,
      map: [
        '############',
        '#^^^^^^^^^^#',
        'R-...^...^.#',
        '#^^^.^.^.^.#',
        '#^^^...^...B',
        '#^^^^^^^^^^#',
        '############',
      ],
      waves: [
        { t: 4, enemy: 'syfish', count: 2, gap: 4 },
        { t: 16, enemy: 'divman', count: 2, gap: 5 },
        { t: 32, enemy: 'dshond', count: 4, gap: 2 },
        { t: 48, enemy: 'dssbr', count: 3, gap: 4 },
        { t: 66, enemy: 'syzeni', count: 2, gap: 6 },
        { t: 80, enemy: 'dshond', count: 3, gap: 2 },
      ],
      extra: [{ t: 58, enemy: 'divman_l', count: 2, gap: 5 }, { t: 90, enemy: 'dsbudr', count: 1 }],
    },
    gate1: {
      name: '물에 잠긴 계단', startDp: 14, deployLimit: 8, gate: true,
      map: [
        '#############',
        'R-...^^^^^^^#',
        '#^^^.^^^.^^^#',
        '#^^^......-.B',
        '#^^^.^^^.^^^#',
        'R-...^^^^^^^#',
        '#############',
      ],
      waves: [
        { t: 4, enemy: 'dshond', count: 3, gap: 2, spawn: 0 },
        { t: 8, enemy: 'dshond', count: 3, gap: 2, spawn: 1 },
        { t: 24, enemy: 'dssbr', count: 3, gap: 4, spawn: 0 },
        { t: 30, enemy: 'dsbow', count: 2, gap: 6, spawn: 1 },
        { t: 50, enemy: 'divman_l', count: 2, gap: 5, spawn: 0 },
        { t: 56, enemy: 'syzeni', count: 2, gap: 6, spawn: 1 },
        { t: 76, enemy: 'dsbudr', count: 1, spawn: 0 },
        { t: 80, enemy: 'dsbudr', count: 1, spawn: 1 },
        { t: 92, enemy: 'dshond', count: 4, gap: 2, spawn: 0 },
      ],
    },

    // ===== 2층 잠긴 교회 =====
    chapel: {
      name: '잠긴 예배당', startDp: 12, deployLimit: 8,
      map: [
        '############',
        '#^^^^^^^^^^#',
        'R-.....^^..#',
        '#^^.^^.^^.^#',
        '#^^.^^.....B',
        '#^^.......^#',
        '############',
      ],
      waves: [
        { t: 4, enemy: 'dssbr', count: 3, gap: 4 },
        { t: 22, enemy: 'dsjely', count: 2, gap: 6 },
        { t: 38, enemy: 'dsrunr', count: 3, gap: 3 },
        { t: 56, enemy: 'divman_l', count: 2, gap: 5 },
        { t: 72, enemy: 'dsbudr', count: 1 },
        { t: 82, enemy: 'dshond', count: 4, gap: 2 },
      ],
      extra: [{ t: 64, enemy: 'syzeni', count: 2, gap: 5 }, { t: 95, enemy: 'dsexcu', count: 1 }],
    },
    saltway: {
      name: '소금 회랑', startDp: 12, deployLimit: 8,
      map: [
        '############',
        'R-..~~..^^^#',
        '#^^.^^.^^^^#',
        '#^^.^^.~~..B',
        '#^^.^^.^^^^#',
        'R-..~~..^^^#',
        '############',
      ],
      waves: [
        { t: 4, enemy: 'syfish', count: 3, gap: 4, spawn: 0 },
        { t: 12, enemy: 'dssbr', count: 2, gap: 5, spawn: 1 },
        { t: 30, enemy: 'dsrunr', count: 3, gap: 3, spawn: 0 },
        { t: 44, enemy: 'dsbow', count: 2, gap: 6, spawn: 1 },
        { t: 60, enemy: 'dsbudr', count: 1, spawn: 0 },
        { t: 64, enemy: 'dsbudr', count: 1, spawn: 1 },
        { t: 80, enemy: 'dsrunr', count: 3, gap: 3, spawn: 1 },
      ],
      extra: [{ t: 72, enemy: 'dsexcu', count: 1, spawn: 0 }, { t: 92, enemy: 'dsjely', count: 3, gap: 4, spawn: 1 }],
    },
    reef: {
      name: '산호초 성가대석', startDp: 10, deployLimit: 8,
      map: [
        '############',
        '#^^^^^^^^^^#',
        'R-....^....#',
        '#^^^^...^^.#',
        'R-....^.^^.B',
        '#^^^^^^....#',
        '############',
      ],
      waves: [
        { t: 4, enemy: 'dshond', count: 3, gap: 2, spawn: 0 },
        { t: 10, enemy: 'dshond', count: 3, gap: 2, spawn: 1 },
        { t: 26, enemy: 'dsjely', count: 3, gap: 5, spawn: 0 },
        { t: 44, enemy: 'syzeni', count: 2, gap: 6, spawn: 1 },
        { t: 60, enemy: 'dsrunr', count: 4, gap: 3, spawn: 0 },
        { t: 80, enemy: 'divman_l', count: 3, gap: 4, spawn: 1 },
      ],
      extra: [{ t: 70, enemy: 'dsbudr', count: 2, gap: 8, spawn: 0 }, { t: 92, enemy: 'dsexcu', count: 1, spawn: 1 }],
    },
    altar: {
      name: '파도의 제단', startDp: 15, deployLimit: 9, gate: true, boss: true,
      map: [
        '#############',
        '#^^^^^^^^^^^#',
        'R-...~^^...^#',
        '#^^^.~~~.^.^#',
        '#^^^.^^^.^..B',
        '#^^^.....^^^#',
        '#############',
      ],
      waves: [
        { t: 4, enemy: 'dssbr', count: 3, gap: 4 },
        { t: 20, enemy: 'dsjely', count: 2, gap: 6 },
        { t: 34, enemy: 'symon', count: 2, gap: 8 },
        { t: 55, enemy: 'syevil', count: 1 },
        { t: 62, enemy: 'dsrunr', count: 3, gap: 4 },
        { t: 85, enemy: 'dsbudr', count: 2, gap: 8 },
        { t: 105, enemy: 'dssbr', count: 4, gap: 3 },
      ],
    },

    // ===== 3층 침몰선의 무덤 =====
    deck: {
      name: '기울어진 갑판', startDp: 12, deployLimit: 8,
      map: [
        '############',
        '#^^^^^^^^^^#',
        'R-..^...^..#',
        '#^^.^.^.^..#',
        '#^^...^...^#',
        '#^^^^^^^^..B',
        '############',
      ],
      waves: [
        { t: 4, enemy: 'dsrunr', count: 3, gap: 3 },
        { t: 22, enemy: 'dsshtr', count: 2, gap: 8 },
        { t: 40, enemy: 'dsexcu', count: 1 },
        { t: 50, enemy: 'dsjely', count: 3, gap: 4 },
        { t: 68, enemy: 'dsbudr', count: 2, gap: 6 },
        { t: 86, enemy: 'dshond', count: 5, gap: 2 },
      ],
      extra: [{ t: 60, enemy: 'dsurch', count: 1 }, { t: 98, enemy: 'syufo', count: 1 }],
    },
    hold: {
      name: '선창 깊은 곳', startDp: 12, deployLimit: 8,
      map: [
        '############',
        'R-..~^^^^^^#',
        '#^^.~^...^^#',
        '#^^......~.B',
        '#^^.~^...^^#',
        'R-..~^^^^^^#',
        '############',
      ],
      waves: [
        { t: 4, enemy: 'dssbr', count: 3, gap: 4, spawn: 0 },
        { t: 10, enemy: 'dssbr', count: 3, gap: 4, spawn: 1 },
        { t: 30, enemy: 'dslntc', count: 1, spawn: 0 },
        { t: 40, enemy: 'dsrunr', count: 3, gap: 3, spawn: 1 },
        { t: 58, enemy: 'dsshtr', count: 2, gap: 6, spawn: 0 },
        { t: 72, enemy: 'dsexcu', count: 1, spawn: 1 },
        { t: 88, enemy: 'dsrunr', count: 4, gap: 3, spawn: 0 },
      ],
      extra: [{ t: 66, enemy: 'dsurch', count: 1, spawn: 1 }, { t: 100, enemy: 'dsbudr', count: 2, gap: 6, spawn: 0 }],
    },
    chain: {
      name: '녹슨 닻줄', startDp: 10, deployLimit: 8,
      map: [
        '############',
        '#^^^^^^^^^^#',
        'R-.........B',
        '#^^^^.^^^^^#',
        '#^^^^.^^^^^#',
        '#^^^^^^^^^^#',
        '############',
      ],
      waves: [
        { t: 4, enemy: 'dsjely', count: 3, gap: 4 },
        { t: 20, enemy: 'dshond', count: 4, gap: 2 },
        { t: 36, enemy: 'syufo', count: 1 },
        { t: 50, enemy: 'dsjely', count: 4, gap: 3 },
        { t: 66, enemy: 'dsexcu', count: 2, gap: 8 },
        { t: 86, enemy: 'dsrunr', count: 4, gap: 3 },
      ],
      extra: [{ t: 76, enemy: 'syufo', count: 1 }, { t: 96, enemy: 'dslntc', count: 1 }],
    },
    gate3: {
      name: '부러진 용골', startDp: 14, deployLimit: 9, gate: true,
      map: [
        '#############',
        'R-...^^^^^^^#',
        '#^^^.^...^^^#',
        '#^^^...^...~B',
        '#^^^.^...^^^#',
        'R-...^^^^^^^#',
        '#############',
      ],
      waves: [
        { t: 4, enemy: 'dsrunr', count: 3, gap: 3, spawn: 0 },
        { t: 8, enemy: 'dsrunr', count: 3, gap: 3, spawn: 1 },
        { t: 26, enemy: 'dsshtr', count: 2, gap: 6, spawn: 0 },
        { t: 34, enemy: 'dsjely', count: 3, gap: 4, spawn: 1 },
        { t: 52, enemy: 'dsurch', count: 1, spawn: 0 },
        { t: 60, enemy: 'dsexcu', count: 2, gap: 8, spawn: 1 },
        { t: 82, enemy: 'syufo', count: 1, spawn: 0 },
        { t: 90, enemy: 'dsbudr', count: 2, gap: 6, spawn: 1 },
        { t: 104, enemy: 'dshond', count: 6, gap: 2, spawn: 0 },
      ],
    },

    // ===== 4층 빛 없는 심해 =====
    abyss: {
      name: '빛이 닿지 않는 곳', startDp: 12, deployLimit: 8,
      map: [
        '############',
        '#^^^^^^^^^^#',
        'R-..~...^..#',
        '#^^.^^^.^..#',
        '#^^...~...^#',
        '#^^^^^^^^..B',
        '############',
      ],
      waves: [
        { t: 4, enemy: 'dsrunr', count: 4, gap: 3 },
        { t: 24, enemy: 'dsubrl', count: 1 },
        { t: 36, enemy: 'dsshtr', count: 2, gap: 6 },
        { t: 52, enemy: 'dsexcu', count: 2, gap: 8 },
        { t: 70, enemy: 'dssalr', count: 1 },
        { t: 84, enemy: 'dsjely', count: 4, gap: 3 },
      ],
      extra: [{ t: 60, enemy: 'syufo', count: 1 }, { t: 96, enemy: 'dsurch', count: 1 }],
    },
    brandfield: {
      name: '명흔의 들판', startDp: 12, deployLimit: 8,
      map: [
        '############',
        'R-..~~^^^^^#',
        '#^^~..~^^^^#',
        '#^^.~^.~..~B',
        '#^^~..~^^^^#',
        'R-..~~^^^^^#',
        '############',
      ],
      waves: [
        { t: 4, enemy: 'dssbr', count: 4, gap: 3, spawn: 0 },
        { t: 10, enemy: 'dsrunr', count: 3, gap: 3, spawn: 1 },
        { t: 30, enemy: 'dsbudr', count: 2, gap: 6, spawn: 0 },
        { t: 44, enemy: 'dslntc', count: 1, spawn: 1 },
        { t: 60, enemy: 'dssalr', count: 1, spawn: 0 },
        { t: 74, enemy: 'dsrunr', count: 4, gap: 3, spawn: 1 },
        { t: 90, enemy: 'dsubrl', count: 1, spawn: 0 },
      ],
      extra: [{ t: 82, enemy: 'dsurch', count: 1, spawn: 1 }, { t: 100, enemy: 'dsexcu', count: 2, gap: 6, spawn: 0 }],
    },
    trench: {
      name: '해구의 입구', startDp: 12, deployLimit: 8,
      map: [
        '############',
        '#^^^^^^^^^^#',
        'R-....^^...#',
        '#^^^^.^^.^.#',
        'R-.......^.B',
        '#^^^^^^^^^^#',
        '############',
      ],
      waves: [
        { t: 4, enemy: 'dsjely', count: 3, gap: 4, spawn: 0 },
        { t: 10, enemy: 'dsrunr', count: 3, gap: 3, spawn: 1 },
        { t: 28, enemy: 'syufo', count: 1, spawn: 0 },
        { t: 42, enemy: 'dsexcu', count: 2, gap: 6, spawn: 1 },
        { t: 60, enemy: 'dsshtr', count: 2, gap: 6, spawn: 0 },
        { t: 76, enemy: 'dssalr', count: 1, spawn: 1 },
        { t: 92, enemy: 'dshond', count: 6, gap: 2, spawn: 0 },
      ],
      extra: [{ t: 70, enemy: 'dsubrl', count: 1, spawn: 0 }, { t: 100, enemy: 'syufo', count: 1, spawn: 1 }],
    },
    heart: {
      name: '부식의 심장', startDp: 18, deployLimit: 10, gate: true, boss: true, final: true,
      map: [
        '#############',
        '#^^^^^^^^^^^#',
        'R-..~^^^...^#',
        '#^^.~...^.^^#',
        '#^^.^^^.~...B',
        'R-..~.....^^#',
        '#############',
      ],
      waves: [
        { t: 4, enemy: 'dsrunr', count: 3, gap: 3, spawn: 0 },
        { t: 10, enemy: 'dsjely', count: 3, gap: 4, spawn: 1 },
        { t: 28, enemy: 'dsexcu', count: 2, gap: 8, spawn: 0 },
        { t: 45, enemy: 'syskad', count: 1, spawn: 0 },
        { t: 60, enemy: 'dsshtr', count: 2, gap: 8, spawn: 1 },
        { t: 80, enemy: 'dssalr', count: 1, spawn: 1 },
        { t: 100, enemy: 'dsrunr', count: 5, gap: 3, spawn: 0 },
      ],
    },
  },

  // ---------------------------------------------------------------------
  //  불온한 조우 (이벤트). floors: 나오는 층 (1부터, 없으면 전부)
  //  choices: { label, desc, cost: { ingot|hope|life }, gain: {...}, chance: 성공 확률, fail: 실패 시 gain, result, failResult }
  //  gain 키: ingot, hope, life, exp, relic: 개수 | 'rare' | 'special' | 소장품 id, ticket: 장수, promote: 무료 승진 횟수
  // ---------------------------------------------------------------------
  events: [
    { id: 'wreck', title: '좌초된 상선', text: '암초에 걸린 상선 한 척이 기울어져 있다. 짐칸은 아직 물에 잠기지 않았다.',
      choices: [
        { label: '짐칸을 뒤진다', desc: '60% 원석 덩어리 +7 / 40% 목숨 -1, 원석 덩어리 +2', chance: 0.6, gain: { ingot: 7 }, fail: { life: -1, ingot: 2 }, result: '물에 젖은 상자 안에서 원석 덩어리를 찾았다.', failResult: '갑판 아래에 숨어 있던 무언가가 덤벼들었다. 겨우 몇 개만 챙겨 빠져나왔다.' },
        { label: '그냥 지나간다', desc: '지휘 경험 +1', gain: { exp: 1 }, result: '불필요한 위험은 피했다.' },
      ] },
    { id: 'keeper', title: '등대지기의 노래', text: '안개 너머에서 낮은 노랫소리가 들려온다. 오래전 이 바다를 지키던 등대지기들의 노래다.',
      choices: [
        { label: '귀를 기울인다', desc: '희망 -1, 무작위 소장품 1개', cost: { hope: 1 }, gain: { relic: 1 }, result: '노래가 끝난 자리에 낡은 물건 하나가 남아 있었다.' },
        { label: '노래를 따라 부른다', desc: '목숨 +2', gain: { life: 2 }, result: '모두의 마음이 조금 가벼워졌다.' },
      ] },
    { id: 'chest', title: '표류하는 상자', text: '파도에 떠밀려 온 상자 하나. 자세히 보니 뚜껑이 아주 조금씩 움직인다.',
      choices: [
        { label: '열어 본다', desc: '50% 희귀 소장품 / 50% 목숨 -2', chance: 0.5, gain: { relic: 'rare' }, fail: { life: -2 }, result: '상자 안에는 귀한 물건이 들어 있었다.', failResult: '상자 시테러였다! 간신히 떼어 냈다.' },
        { label: '불태운다', desc: '원석 덩어리 +2', gain: { ingot: 2 }, result: '타고 남은 재 속에서 원석 덩어리를 건졌다.' },
      ] },
    { id: 'believer', title: '심해 교회의 신도', text: '해변에 무릎 꿇은 신도가 바다를 향해 기도하고 있다. 당신들을 보자 웃으며 손짓한다.',
      choices: [
        { label: '이야기를 듣는다', desc: '원석 덩어리 -4, 희망 +2', cost: { ingot: 4 }, gain: { hope: 2 }, result: '알아듣기 힘든 교리 속에서 쓸 만한 정보를 얻었다.' },
        { label: '경계하며 물러난다', desc: '지휘 경험 +2', gain: { exp: 2 }, result: '뒤돌아보니 신도는 이미 바닷속으로 걸어 들어가고 있었다.' },
      ] },
    { id: 'diver', title: '길 잃은 잠수부', text: '부상당한 잠수부가 바위 틈에 숨어 있다. 소속을 묻자 고개를 저을 뿐이다.',
      choices: [
        { label: '치료해 준다', desc: '원석 덩어리 -3, 모집권 1장', cost: { ingot: 3 }, gain: { ticket: 1 }, result: '잠수부가 아는 사람을 소개해 주었다.' },
        { label: '장비를 넘겨받는다', desc: '원석 덩어리 +5, 목숨 -1', gain: { ingot: 5, life: -1 }, result: '잠수부는 장비를 두고 사라졌다. 어딘가 꺼림칙하다.' },
      ] },
    { id: 'market', title: '해안가 어시장', text: '폐허가 된 항구에 아직 문을 연 노점이 하나 있다. 생선 냄새가 지독하다.',
      choices: [
        { label: '생선을 산다', desc: '원석 덩어리 -3, 목숨 +3', cost: { ingot: 3 }, gain: { life: 3 }, result: '따뜻한 생선 수프로 몸을 녹였다.' },
        { label: '흥정한다', desc: '50% 원석 덩어리 +4 / 50% 아무 일도 없음', chance: 0.5, gain: { ingot: 4 }, fail: {}, result: '상인이 웃으며 덤을 얹어 주었다.', failResult: '상인은 고개를 저었다.' },
      ] },
    { id: 'mirror', title: '물에 비친 얼굴', floors: [2, 3, 4], text: '잔잔한 물웅덩이에 비친 얼굴이 조금 늦게 움직인다.',
      choices: [
        { label: '들여다본다', desc: '오퍼레이터 1명 무료 승진', gain: { promote: 1 }, result: '물속의 얼굴이 무언가를 속삭였다. 머릿속이 맑아진다.' },
        { label: '돌을 던진다', desc: '원석 덩어리 +3', gain: { ingot: 3 }, result: '물결이 퍼지자 바닥에 깔린 원석 덩어리가 보였다.' },
      ] },
    { id: 'storm', title: '다가오는 폭풍', floors: [2, 3, 4], text: '수평선 너머에서 검은 구름이 몰려온다. 폭풍의 중심에서 희미한 불빛이 보인다.',
      choices: [
        { label: '폭풍 속으로', desc: '희망 -2, 특별 소장품 1개', cost: { hope: 2 }, gain: { relic: 'special' }, result: '불빛이 있던 자리에서 무언가를 건져 올렸다.' },
        { label: '서둘러 피한다', desc: '목숨 -1', gain: { life: -1 }, result: '간신히 폭풍을 피했지만 모두 지쳐 버렸다.' },
      ] },
  ],
};
