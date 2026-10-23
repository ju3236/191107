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
              desc: '심해 교회의 주교. 멀리서 범위 마법 피해와 신경 손상을 주고, 쓰러지면 한 번 부활한다. 돌파당하면 목표 HP 3 감소.' },
  syskad:   { code: 'SBX', name: '이샤믈라, 부식의 마음', hp: 34000, atk: 1100, def: 450, res: 45, speed: 0.22, interval: 5.0, range: 0, aoe: 1.0, weight: 3, revive: { atk: 1.5 }, summon: { enemy: 'syrott', every: 16, count: 2 }, lifeCost: 5, boss: true, sea: true, color: '#00bfa5',
              desc: '바다의 심장부에 자리한 거대한 시본. 주기적으로 「이샤믈라의 눈물」을 불러내고, 쓰러지면 더 강해져 다시 일어선다. 저지에 3칸이 필요하며 돌파당하면 목표 HP 5 감소.' },
};
for (const [id, e] of Object.entries(SEA_ENEMIES)) ENEMIES[id] = { image: `img/enemy/${id}.png`, ...e };

const IS_DATA = {
  title: '가라앉은 등대',
  code: '통합전략 #1',
  en: 'THE SUNKEN BEACON',
  intro: '이베리아 앞바다에서 꺼진 지 오래인 등대의 불빛이 다시 깜박이기 시작했다. 로도스 아일랜드 행동대 「등대」는 신호의 근원을 찾아 바다 아래로 향한다. 물러설 길은 없다. 가라앉은 등대에 닿을 때까지.',

  // 원작(미즈키 & 카이룰라 아버) 기준: 초기 희망 6
  start: { life: 10, ingot: 10, hope: 6 },
  // 희망 — 원작과 같이 모집과 랭크 상승에 씀 (레어도별). 임시 모집 오퍼레이터는 모집 희망 0
  hopeCost: { 6: 6, 5: 3, 4: 2, 3: 0, 2: 0, 1: 0 },
  promoteCost: { 6: 3, 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 },
  // 랭크 상승: 원작처럼 계정 육성 상태를 따르고, 랭크 상승 전에는 1차 정예화(스킬 레벨 7)까지만 적용.
  // 랭크 상승하면 계정의 2차 정예화 상태(특화 포함)를 그대로 씀 → 계정에서 2차 정예화한 오퍼레이터만 랭크 상승 가능
  // 임시 모집 오퍼레이터는 계정 육성과 관계없이 아래 상태로 합류 (원작 charUpgradeTable: 1정 스킬 7 / 2정 스킬 7 특화 3)
  tempProg: [{ elite: 1, level: 55, slv: 7, mst: [0, 0, 0] }, { elite: 2, level: 40, slv: 7, mst: [3, 3, 3] }],
  tempChance: 0.35,                  // 모집권을 쓸 때 임시 모집 오퍼레이터가 함께 나올 확률
  tempRarity: { 6: 20, 5: 40, 4: 40 },
  // 지휘 레벨 (exp: 그 레벨이 되는 누적 지휘 경험치). 보상은 원작 레벨표: hope 희망 / squad 편성 가능 인원수 / maxLife 최대 목표 HP
  levels: [
    { exp: 0 },
    { exp: 3, hope: 4 },
    { exp: 7, hope: 4, maxLife: 1 },
    { exp: 12, hope: 5 },
    { exp: 18, hope: 6 },
    { exp: 25, hope: 6, squad: 1, maxLife: 1 },
    { exp: 33, hope: 6 },
    { exp: 42, hope: 7 },
    { exp: 52, hope: 8, squad: 1, maxLife: 1 },
    { exp: 63, hope: 8, squad: 1, maxLife: 1 },
  ],
  floorScale: [0.6, 0.75, 0.9, 1.0], // 층마다 적 HP·공격력 배율
  emergencyScale: 1.25,              // 긴급 작전 적 능력치 추가 배율

  // 모집권 (원작 이름 그대로). classes: 모집할 수 있는 직군(null = 전 직군) / maxRarity / temp: 임시 모집 확정(4·5성, 'promoted' 랭크 상승한 임시 모집)
  tickets: (() => {
    const CL = { vanguard: '뱅가드', guard: '가드', defender: '디펜더', sniper: '스나이퍼', caster: '캐스터', medic: '메딕', supporter: '서포터', specialist: '스페셜리스트' };
    const t = {};
    for (const [c, n] of Object.entries(CL)) {
      t[c] = { name: `${n} 모집권`, classes: [c], desc: `${n} 오퍼레이터 1명 모집` };
      t[c + '_sp'] = { name: `고급 ${n} 모집권`, classes: [c], temp: 4, desc: `${n} 오퍼레이터 1명 모집 (4성 임시 모집 확정 등장)` };
      t[c + '_vip'] = { name: `정예 ${n} 모집권`, classes: [c], temp: 5, desc: `${n} 오퍼레이터 1명 모집 (5성 임시 모집 확정 등장)` };
    }
    Object.assign(t, {
      d_assault: { name: '돌격 협의 모집권', classes: ['vanguard', 'guard'], desc: '뱅가드 또는 가드 오퍼레이터 1명 모집' },
      d_defense: { name: '방어 협의 모집권', classes: ['defender', 'supporter'], desc: '디펜더 또는 서포터 오퍼레이터 1명 모집' },
      d_ranged: { name: '원거리 협의 모집권', classes: ['medic', 'sniper'], desc: '메딕 또는 스나이퍼 오퍼레이터 1명 모집' },
      d_destroy: { name: '파괴 협의 모집권', classes: ['caster', 'specialist'], desc: '캐스터 또는 스페셜리스트 오퍼레이터 1명 모집' },
      q_melee: { name: '전선 통합 모집권', classes: ['vanguard', 'guard', 'defender', 'specialist'], desc: '뱅가드, 가드, 디펜더 또는 스페셜리스트 오퍼레이터 1명 모집' },
      q_ranged: { name: '후방 협조 모집권', classes: ['medic', 'sniper', 'supporter', 'caster'], desc: '메딕, 스나이퍼, 서포터 또는 캐스터 오퍼레이터 1명 모집' },
      all: { name: '고급 인사배치서한', classes: null, desc: '임의의 오퍼레이터 1명 모집' },
      star5: { name: '인사배치서한', classes: null, maxRarity: 5, desc: '임의의 5성 이하 오퍼레이터 1명 모집' },
      premium: { name: '특별 인사배치서한', classes: null, temp: 'promoted', desc: '임의의 오퍼레이터 1명 모집 (랭크 상승한 임시 모집 오퍼레이터 확정 등장)' },
    });
    return t;
  })(),
  // 랭크 상승권 (희망 소모 없이 랭크 상승). 직군 id / 'all' 고급 물자배급권 / 'star5' 임시 물자배급권(5성 이하)
  upgradeName: (k) => (k === 'all' || !k ? '고급 물자배급권' : k === 'star5' ? '임시 물자배급권' : `${{ vanguard: '뱅가드', guard: '가드', defender: '디펜더', sniper: '스나이퍼', caster: '캐스터', medic: '메딕', supporter: '서포터', specialist: '스페셜리스트' }[k] || k} 랭크 상승권`),
  // 초기 모집 조합 (원작 그대로). random: 무작위 직군 모집권, 그중 1장은 4성 임시 모집 확정
  recruitGroups: [
    { id: 'g1', name: '선수필승', desc: '뱅가드, 스나이퍼, 스페셜리스트 모집권 각 1장', tickets: ['vanguard', 'sniper', 'specialist'] },
    { id: 'g2', name: '차근차근', desc: '디펜더, 캐스터, 스나이퍼 모집권 각 1장', tickets: ['defender', 'caster', 'sniper'] },
    { id: 'g3', name: '상호보완', desc: '가드, 서포터, 메딕 모집권 각 1장', tickets: ['guard', 'supporter', 'medic'] },
    { id: 'random', name: '원하는 대로', desc: '랜덤 모집권 3장, 그중 1장은 4★ 임시 모집 확정 출현', random: 3 },
  ],

  // 분대: 탐색 시작 시 하나 고름. fx는 소장품과 같은 형식
  squads: [
    { id: 'command', name: '지휘 분대', desc: '시작 희망 +2', fx: { gain: { hope: 2 } } },
    { id: 'logistic', name: '후방 지원 분대', desc: '시작 오리지늄각뿔 +10, 교역소 가격 -10%', fx: { gain: { ingot: 10 }, shopDiscount: 0.1 } },
    { id: 'assault', name: '돌격 전술 분대', desc: '뱅가드·가드 공격력 +15%', fx: { stat: { atk: 0.15 }, classes: ['vanguard', 'guard'] } },
    { id: 'bulwark', name: '보루 전술 분대', desc: '디펜더·메딕 HP +20%, 방어력 +10%', fx: { stat: { hp: 0.2, def: 0.1 }, classes: ['defender', 'medic'] } },
    { id: 'ranged', name: '원거리 전술 분대', desc: '스나이퍼·캐스터 공격력 +15%', fx: { stat: { atk: 0.15 }, classes: ['sniper', 'caster'] } },
    { id: 'research', name: '연구 분대', desc: '시작 시 무작위 소장품 2개, 시작 희망 -2', fx: { gain: { relic: 2, hope: -2 } } },
    { id: 'beacon', name: '등대 분대', desc: '시작 최대 목표 HP +4, 명흔에 의한 HP 감소 무시 (등대 AU 전용)', fx: { gain: { maxLife: 4 }, brandImmune: true } },
  ],

  // ---------------------------------------------------------------------
  //  소장품은 is-relics.js (원작 「쉐이의 기이한 계원」 목록). fx 키:
  //    stat { atk, hp, def(+비율), aspd(공격 속도 수치, 100 = 2배), cost(±), costMul(비율), redeploy(비율), res, dodge, artsDodge, block, spCost(비율), spInit, defFlat }
  //    classes / range('melee'|'ranged') / rarity — stat을 받는 조건, promotedStat — 랭크 상승한 오퍼레이터만
  //    cond('life1' 목표 HP 1 | 'lifeMax' 목표 HP 최대) — stat 조건, setBonus { set, n, stat } — 같은 세트 n개 이상
  //    squadCap(편성 가능 인원수), gain { hope, ingot, life, maxLife, shield, promote, promoteClass, double, relic, ticket }
  //    expRate, ingotRate, shopDiscount, endLife, extraTicket, extraRelic, floorTicket, revive, kingArmor,
  //    ingotAspd, ingotDp, squadDp, promotedCount, promotedCountStat, shieldHp, floorPenalty, gyesim, survivor, altar, level10ingot
  //    battle { … } — 전투 중 효과. 키는 game.js의 「소장품 효과」 구역 참고
  // ---------------------------------------------------------------------

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
  //  gain 키: ingot, hope, life, exp, relic: 개수 | 'rare' | 'special' | 소장품 id, ticket: 장수, promote: 고급 물자배급권 장수, promoteClass: 직군 랭크 상승권
  // ---------------------------------------------------------------------
  events: [
    { id: 'wreck', title: '좌초된 상선', text: '암초에 걸린 상선 한 척이 기울어져 있다. 짐칸은 아직 물에 잠기지 않았다.',
      choices: [
        { label: '짐칸을 뒤진다', desc: '60% 오리지늄각뿔 +7 / 40% 목표 HP -1, 오리지늄각뿔 +2', chance: 0.6, gain: { ingot: 7 }, fail: { life: -1, ingot: 2 }, result: '물에 젖은 상자 안에서 오리지늄각뿔를 찾았다.', failResult: '갑판 아래에 숨어 있던 무언가가 덤벼들었다. 겨우 몇 개만 챙겨 빠져나왔다.' },
        { label: '그냥 지나간다', desc: '지휘 경험치 +1', gain: { exp: 1 }, result: '불필요한 위험은 피했다.' },
      ] },
    { id: 'keeper', title: '등대지기의 노래', text: '안개 너머에서 낮은 노랫소리가 들려온다. 오래전 이 바다를 지키던 등대지기들의 노래다.',
      choices: [
        { label: '귀를 기울인다', desc: '희망 -1, 무작위 소장품 1개', cost: { hope: 1 }, gain: { relic: 1 }, result: '노래가 끝난 자리에 낡은 물건 하나가 남아 있었다.' },
        { label: '노래를 따라 부른다', desc: '목표 HP +2', gain: { life: 2 }, result: '모두의 마음이 조금 가벼워졌다.' },
      ] },
    { id: 'chest', title: '표류하는 상자', text: '파도에 떠밀려 온 상자 하나. 자세히 보니 뚜껑이 아주 조금씩 움직인다.',
      choices: [
        { label: '열어 본다', desc: '50% 희귀 소장품 / 50% 목표 HP -2', chance: 0.5, gain: { relic: 'rare' }, fail: { life: -2 }, result: '상자 안에는 귀한 물건이 들어 있었다.', failResult: '상자 시테러였다! 간신히 떼어 냈다.' },
        { label: '불태운다', desc: '오리지늄각뿔 +2', gain: { ingot: 2 }, result: '타고 남은 재 속에서 오리지늄각뿔를 건졌다.' },
      ] },
    { id: 'believer', title: '심해 교회의 신도', text: '해변에 무릎 꿇은 신도가 바다를 향해 기도하고 있다. 당신들을 보자 웃으며 손짓한다.',
      choices: [
        { label: '이야기를 듣는다', desc: '오리지늄각뿔 -4, 희망 +2', cost: { ingot: 4 }, gain: { hope: 2 }, result: '알아듣기 힘든 교리 속에서 쓸 만한 정보를 얻었다.' },
        { label: '경계하며 물러난다', desc: '지휘 경험치 +2', gain: { exp: 2 }, result: '뒤돌아보니 신도는 이미 바닷속으로 걸어 들어가고 있었다.' },
      ] },
    { id: 'diver', title: '길 잃은 잠수부', text: '부상당한 잠수부가 바위 틈에 숨어 있다. 소속을 묻자 고개를 저을 뿐이다.',
      choices: [
        { label: '치료해 준다', desc: '오리지늄각뿔 -3, 모집권 1장', cost: { ingot: 3 }, gain: { ticket: 1 }, result: '잠수부가 아는 사람을 소개해 주었다.' },
        { label: '장비를 넘겨받는다', desc: '오리지늄각뿔 +5, 목표 HP -1', gain: { ingot: 5, life: -1 }, result: '잠수부는 장비를 두고 사라졌다. 어딘가 꺼림칙하다.' },
      ] },
    { id: 'market', title: '해안가 어시장', text: '폐허가 된 항구에 아직 문을 연 노점이 하나 있다. 생선 냄새가 지독하다.',
      choices: [
        { label: '생선을 산다', desc: '오리지늄각뿔 -3, 목표 HP +3', cost: { ingot: 3 }, gain: { life: 3 }, result: '따뜻한 생선 수프로 몸을 녹였다.' },
        { label: '흥정한다', desc: '50% 오리지늄각뿔 +4 / 50% 아무 일도 없음', chance: 0.5, gain: { ingot: 4 }, fail: {}, result: '상인이 웃으며 덤을 얹어 주었다.', failResult: '상인은 고개를 저었다.' },
      ] },
    { id: 'mirror', title: '물에 비친 얼굴', floors: [2, 3, 4], text: '잔잔한 물웅덩이에 비친 얼굴이 조금 늦게 움직인다.',
      choices: [
        { label: '들여다본다', desc: '고급 물자배급권 1장 (오퍼레이터 1명 희망 소모 없이 랭크 상승)', gain: { promote: 1 }, result: '물속의 얼굴이 무언가를 속삭였다. 머릿속이 맑아진다.' },
        { label: '돌을 던진다', desc: '오리지늄각뿔 +3', gain: { ingot: 3 }, result: '물결이 퍼지자 바닥에 깔린 오리지늄각뿔가 보였다.' },
      ] },
    { id: 'storm', title: '다가오는 폭풍', floors: [2, 3, 4], text: '수평선 너머에서 검은 구름이 몰려온다. 폭풍의 중심에서 희미한 불빛이 보인다.',
      choices: [
        { label: '폭풍 속으로', desc: '희망 -2, 특별 소장품 1개', cost: { hope: 2 }, gain: { relic: 'special' }, result: '불빛이 있던 자리에서 무언가를 건져 올렸다.' },
        { label: '서둘러 피한다', desc: '목표 HP -1', gain: { life: -1 }, result: '간신히 폭풍을 피했지만 모두 지쳐 버렸다.' },
      ] },
  ],
};
