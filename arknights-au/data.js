'use strict';
// =====================================================================
//  게임 데이터 파일
//  자캐(오퍼레이터) · AU 세계관 · 적 · 스테이지 · 스토리는 전부 여기서 고칩니다.
//  지금 들어있는 캐릭터/설정은 전부 "임시" 예시입니다. 자유롭게 바꾸세요!
// =====================================================================

const GAME_INFO = {
  title: '잿빛 등대',
  subtitle: 'ARKNIGHTS OC AU · ASHEN BEACON',
  commander: '등대지기',          // 플레이어(지휘관) 호칭
  chapter: '제1장 잿빛 등대',     // 작전 목록 화면 제목
  synopsis:
    '천재지변이 멎지 않는 대지, 테라.\n' +
    '이 세계선에는 로도스 아일랜드가 존재하지 않는다.\n' +
    '대신 폐허가 된 도시 사이를 오가며 피난민의 길을 밝히는 작은 이동 함선,\n' +
    '「등대」와 그 지휘관 「등대지기」의 이야기가 시작된다.',
};

// 직군 정보 — tile: ground(지면, 근접) / high(고지대, 원거리)
const CLASSES = {
  vanguard: { name: '뱅가드', tile: 'ground', icon: '⚑' },
  guard:    { name: '가드',   tile: 'ground', icon: '⚔' },
  defender: { name: '디펜더', tile: 'ground', icon: '⛨' },
  sniper:   { name: '스나이퍼', tile: 'high', icon: '➶' },
  caster:   { name: '캐스터', tile: 'high', icon: '✦' },
  medic:    { name: '메딕',   tile: 'high', icon: '✚' },
  specialist: { name: '스페셜리스트', tile: 'ground', icon: '⚓' },
};

// 공격 범위 도우미: 오른쪽을 바라볼 때 기준 상대 좌표 (x: 앞쪽 +, y: 아래쪽 +)
function area(x0, x1, y0, y1) {
  const r = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) r.push([x, y]);
  return r;
}

// ---------------------------------------------------------------------
//  오퍼레이터 (자캐)
//  cost: 배치 코스트 / redeploy: 재배치 시간(초) / block: 저지 가능 수
//  interval: 공격 간격(초) / range: 공격 범위
//  skill.trigger: 'manual'(직접 발동) 또는 'auto'(SP가 차면 자동 발동)
//  skill.effect: atk/def/interval 배율, dp(즉시 코스트), heal(즉시 자기 회복 비율),
//                splash(범위 피해 반경, 타일), targets(동시 공격 수),
//                strike(발동 즉시 범위 안 모든 적에게 공격력×배율 피해), regen(지속 중 초당 최대 체력 비율 회복)
//  en: 영문 이름 / rarity: 레어도(별 1~6) / tags: 특성 태그 / voices: 메인 화면 비서 대사
//  image: 'img/파일명.png' 처럼 그림 경로를 넣으면 동그라미·임시 일러스트 대신 그림이 표시됩니다.
// ---------------------------------------------------------------------
const OPERATORS = [
  // ---------------- 등대지기님의 자캐 (프로필·대사·스킬 이름은 임시) ----------------
  {
    id: 'byeol', name: '천사별', class: 'sniper', race: '산크타', color: '#8fc9f0',
    en: 'Cheonsabyeol', rarity: 6, tags: ['원거리', '대공', '연사'],
    voices: ['등대지기, 오늘 하늘 맑아요!', '별이 보이는 밤엔 조준이 더 잘 돼요.', '헤헤, 저만 믿어요!'],
    image: 'img/byeol.png',
    profile: '산크타 출신 저격수. 반짝이는 눈만큼이나 조준도 정확하다. 비행 적을 우선으로 노린다.',
    quote: '반짝, 명중이에요!',
    cost: 14, redeploy: 35, block: 0,
    hp: 1500, atk: 620, def: 140, res: 0, interval: 1.0,
    range: [...area(0, 3, -1, 1), [4, 0]],
    skill: { name: '별빛 연사', desc: '15초간 공격 속도 2.5배, 공격력 +10%', sp: 30, initSp: 15, duration: 15, trigger: 'manual', effect: { interval: 0.4, atk: 1.1 } },
  },
  {
    id: 'simhae', name: '안심해', class: 'defender', race: '리베리', color: '#c9ced6',
    en: 'Ahn Simhae', rarity: 6, tags: ['근거리', '방어', '회복'],
    voices: ['…괜찮아. 안심해.', '내 뒤에 있으면 돼.', '졸리네. 그래도 지킬 건 지켜.'],
    image: 'img/simhae.png',
    profile: '리베리 출신 디펜더. 무심한 표정과 달리 한 번 맡은 자리는 끝까지 지킨다.',
    quote: '안심해. 여긴 안 뚫려.',
    cost: 20, redeploy: 45, block: 3,
    hp: 3800, atk: 400, def: 780, res: 10, interval: 1.2,
    range: area(0, 0, 0, 0),
    skill: { name: '안심해', desc: '즉시 체력 30% 회복, 20초간 방어력 +60%, 매초 체력 3% 회복', sp: 35, initSp: 20, duration: 20, trigger: 'manual', effect: { def: 1.6, heal: 0.3, regen: 0.03 } },
  },
  {
    id: 'iai', name: '이아이', class: 'specialist', race: '사르카즈', color: '#7a8796',
    en: 'Iai', rarity: 6, tags: ['근거리', '빠른 재배치', '폭발력'],
    voices: ['…부르셨어요?', '금방 끝내고 올게요.', '조용한 게 좋아요.'],
    image: 'img/iai.png',
    profile: '사르카즈 출신 스페셜리스트. 재배치가 매우 빨라 필요한 곳에 몇 번이고 다시 나타난다.',
    quote: '…베고, 돌아갈게요.',
    cost: 9, redeploy: 15, block: 1,
    hp: 1600, atk: 680, def: 260, res: 0, interval: 0.95,
    range: area(0, 1, 0, 0),
    skill: { name: '일섬', desc: '즉시 범위 안의 모든 적에게 공격력 250% 물리 피해', sp: 10, initSp: 10, duration: 0, trigger: 'manual', effect: { strike: 2.5 } },
  },
  {
    id: 'gaeul', name: '김가을', class: 'guard', race: '페린', color: '#4f7fd1',
    en: 'Kim Gaeul', rarity: 6, tags: ['근거리', '화력', '다중 공격'],
    voices: ['보고서는… 나중에 쓸게요.', '등대지기님, 안경 어디 갔는지 봤어요?', '맡겨 주세요. 정리할게요.'],
    image: 'img/gaeul.png',
    profile: '페린 출신 가드. 차분하고 꼼꼼한 성격으로, 전장에서도 할 일을 하나씩 정리해 나간다.',
    quote: '하나씩, 정리하겠습니다.',
    cost: 17, redeploy: 40, block: 2,
    hp: 2600, atk: 700, def: 380, res: 0, interval: 1.05,
    range: area(0, 1, 0, 0),
    skill: { name: '가을바람', desc: '12초간 공격력 +60%, 동시에 2명 공격', sp: 25, initSp: 10, duration: 12, trigger: 'auto', effect: { atk: 1.6, targets: 2 } },
  },

  // ---------------- 임시 캐릭터 (스토리에 등장 — 필요 없으면 지우고 스토리 대사도 바꾸세요) ----------------
  {
    id: 'rea', name: '레아', class: 'vanguard', race: '페로', color: '#f2a541',
    en: 'Rhea', rarity: 5, tags: ['근거리', '코스트 회복'], voices: ['등대지기! 오늘도 같이 가자!', '선봉은 언제나 내 자리야.', '비토 녀석, 또 늦잠이야?'],
    profile: '등대의 선봉대장. 늘 가장 먼저 뛰어나가 길을 연다. 밝고 시끄럽지만, 동료가 다치는 걸 누구보다 두려워한다.',
    quote: '선두는 내가 맡을게!',
    cost: 10, redeploy: 25, block: 1,
    hp: 1500, atk: 420, def: 270, res: 0, interval: 1.0,
    range: area(0, 1, 0, 0),
    skill: { name: '돌격 신호', desc: '즉시 배치 코스트 +12', sp: 25, initSp: 12, duration: 0, trigger: 'manual', effect: { dp: 12 } },
  },
  {
    id: 'khan', name: '칸', class: 'guard', race: '사르카즈', color: '#d9534f',
    en: 'Khan', rarity: 6, tags: ['근거리', '화력'], voices: ['…명령을.', '칼은 손질해 뒀다.', '이 배는, 나쁘지 않군.'],
    profile: '과묵한 용병 출신 검사. 등대에 빚이 있다며 계약 기간도 정하지 않고 머무르고 있다.',
    quote: '…베면 되는 거지.',
    cost: 15, redeploy: 35, block: 2,
    hp: 2300, atk: 600, def: 350, res: 0, interval: 1.2,
    range: area(0, 1, 0, 0),
    skill: { name: '붉은 칼날', desc: '15초간 공격력 +80%', sp: 30, initSp: 10, duration: 15, trigger: 'auto', effect: { atk: 1.8 } },
  },
  {
    id: 'vito', name: '비토', class: 'guard', race: '루포', color: '#7fb3d5',
    en: 'Vito', rarity: 5, tags: ['근거리', '다중 공격'], voices: ['느려 터졌네, 다들.', '레아? 몰라, 걔 얘긴 하지 마.', '정찰은 끝났어. 칭찬은 나중에.'],
    profile: '빠른 발과 쌍단검이 자랑인 정찰병. 레아와는 앙숙인 척하는 소꿉친구.',
    quote: '느려 터졌네, 다들.',
    cost: 13, redeploy: 30, block: 1,
    hp: 1800, atk: 380, def: 220, res: 0, interval: 0.7,
    range: area(0, 1, 0, 0),
    skill: { name: '질풍', desc: '10초간 공격 속도 2배, 동시에 2명 공격', sp: 20, initSp: 5, duration: 10, trigger: 'manual', effect: { interval: 0.5, targets: 2 } },
  },
  {
    id: 'mujin', name: '무진', class: 'defender', race: '우르수스', color: '#8d6e63',
    en: 'Mujin', rarity: 5, tags: ['근거리', '방어'], voices: ['뒤는 걱정 말고.', '천천히 가도 된다. 내가 막으니까.', '…차 한 잔 하겠나.'],
    profile: '전직 광산 경비대장. 느릿한 말투와 달리 그 방패는 단 한 번도 뚫린 적이 없다.',
    quote: '뒤는 걱정 말고.',
    cost: 18, redeploy: 40, block: 3,
    hp: 3200, atk: 340, def: 650, res: 10, interval: 1.2,
    range: area(0, 0, 0, 0),
    skill: { name: '철벽', desc: '즉시 체력 30% 회복, 20초간 방어력 +80%', sp: 30, initSp: 15, duration: 20, trigger: 'manual', effect: { def: 1.8, heal: 0.3 } },
  },
  {
    id: 'ciel', name: '시엘', class: 'sniper', race: '리베리', color: '#5cb85c',
    en: 'Ciel', rarity: 5, tags: ['원거리', '대공'], voices: ['보여. 전부.', '망루는… 조용해서 좋아.', '등대지기, 바람이 바뀌었어.'],
    profile: '말수가 적은 저격수. 등대 꼭대기 망루가 지정석이다. 비행 적을 우선 노린다.',
    quote: '보여. 전부.',
    cost: 11, redeploy: 30, block: 0,
    hp: 1000, atk: 480, def: 120, res: 0, interval: 1.0,
    range: area(0, 3, -1, 1),
    skill: { name: '연사', desc: '15초간 공격 속도 +66%, 공격력 +20%', sp: 25, initSp: 8, duration: 15, trigger: 'auto', effect: { interval: 0.6, atk: 1.2 } },
  },
  {
    id: 'noa', name: '노아', class: 'caster', race: '불포', color: '#a970ff',
    en: 'Noa', rarity: 6, tags: ['원거리', '범위 공격'], voices: ['실험… 아니, 작전 개시!', '이 잔향석 좀 봐! 반짝이지?', '폭발은 예술이라고!'],
    profile: '잔향석 연구자이자 아츠 술사. 호기심이 너무 많아 자주 사고를 친다. 방어력 높은 적에게 강하다.',
    quote: '실험… 아니, 작전 개시!',
    cost: 19, redeploy: 40, block: 0,
    hp: 1100, atk: 620, def: 90, res: 20, interval: 1.6,
    range: area(0, 3, -1, 1),
    skill: { name: '잔향 폭발', desc: '10초간 공격력 +60%, 주변에 범위 피해', sp: 35, initSp: 15, duration: 10, trigger: 'manual', effect: { atk: 1.6, splash: 1.1 } },
  },
  {
    id: 'hayul', name: '하율', class: 'medic', race: '산크타', color: '#f7d774',
    en: 'Hayul', rarity: 5, tags: ['원거리', '치료'], voices: ['다치면 혼날 줄 알아요?', '오늘도 무사히 돌아와요.', '약은 써도 몸에 좋아요.'],
    profile: '등대의 의무관. 늘 웃고 있지만 치료 중에는 누구보다 무섭다.',
    quote: '다치면 혼날 줄 알아요?',
    cost: 16, redeploy: 35, block: 0,
    hp: 1200, atk: 400, def: 100, res: 0, interval: 2.0,
    range: area(0, 3, -1, 1),
    skill: { name: '축복', desc: '12초간 치유량 +60%, 동시에 3명 치료', sp: 30, initSp: 10, duration: 12, trigger: 'auto', effect: { atk: 1.6, targets: 3 } },
  },
];

// ---------------------------------------------------------------------
//  적
//  speed: 이동 속도(타일/초) / range: 0이면 근접(저지당했을 때만 공격)
//  arts: true면 마법 피해 / flying: 비행(저지 불가, 근접 오퍼레이터가 공격 불가)
//  weight: 저지에 필요한 칸 수 / lifeCost: 방어선 돌파 시 깎이는 목숨
// ---------------------------------------------------------------------
const ENEMIES = {
  slug:    { name: '잔향 슬러그', hp: 650, atk: 200, def: 0, res: 0, speed: 0.5, interval: 1.7, range: 0, color: '#d08c4a', desc: '잔향석에 오염된 생물. 약하다.' },
  soldier: { name: '약탈자 병사', hp: 1650, atk: 380, def: 100, res: 0, speed: 0.55, interval: 2.0, range: 0, color: '#c0504d', desc: '평범한 약탈자.' },
  archer:  { name: '약탈자 석궁병', hp: 1300, atk: 330, def: 80, res: 0, speed: 0.5, interval: 2.4, range: 2.2, color: '#e07b39', desc: '멀리서 오퍼레이터를 공격한다.' },
  mage:    { name: '잿빛 술사', hp: 1400, atk: 280, def: 50, res: 50, speed: 0.5, interval: 3.0, range: 2.0, arts: true, color: '#9b59b6', desc: '마법 피해를 주며 마법 저항이 높다.' },
  drone:   { name: '정찰 드론', hp: 1100, atk: 160, def: 50, res: 0, speed: 0.85, interval: 2.0, range: 1.5, flying: true, color: '#5dade2', desc: '비행 유닛. 저지할 수 없다.' },
  heavy:   { name: '방패 중장병', hp: 3500, atk: 700, def: 500, res: 0, speed: 0.35, interval: 2.6, range: 0, color: '#7f8c8d', desc: '방어력이 매우 높다. 캐스터로 상대하자.' },
  boss:    { name: '「잿빛 기수」 오르텐', hp: 18000, atk: 1100, def: 350, res: 30, speed: 0.3, interval: 2.5, range: 0, weight: 2, lifeCost: 2, boss: true, color: '#e74c3c', desc: '저지에 2칸이 필요하다. 돌파 시 목숨 2 감소.' },
};

// ---------------------------------------------------------------------
//  스테이지
//  map 기호:  # 벽   . 지면(근접 배치)   ^ 고지대(원거리 배치)
//             R 적 침입 지점   B 방어 지점
//  waves: { t: 시작 시각(초), enemy: 적 id, count: 수, gap: 간격(초), spawn: 침입 지점 번호(0부터, 위→아래·왼→오른쪽 순) }
//  스토리 대사: { who: 오퍼레이터 id, text } / { name: '이름', text } / { text } (나레이션)
// ---------------------------------------------------------------------
const STAGES = [
  {
    code: '0-1', name: '첫 불빛',
    desc: '폐허 도시 외곽. 피난민 행렬을 노리는 약탈자들을 막아라.',
    life: 3, startDp: 10, deployLimit: 8,
    map: [
      '############',
      '#^^^^#^^^^^#',
      'R.........^#',
      '#^^^.^^^^.^#',
      '#^...^#^...B',
      '#^^^^^#^^^^#',
      '############',
    ],
    waves: [
      { t: 3,  enemy: 'slug',    count: 3, gap: 3 },
      { t: 16, enemy: 'soldier', count: 2, gap: 4 },
      { t: 30, enemy: 'slug',    count: 4, gap: 2 },
      { t: 45, enemy: 'soldier', count: 3, gap: 4 },
      { t: 60, enemy: 'archer',  count: 2, gap: 5 },
      { t: 75, enemy: 'soldier', count: 2, gap: 3 },
      { t: 80, enemy: 'slug',    count: 3, gap: 2 },
    ],
    before: [
      { text: '이동 함선 「등대」 함교. 경보음이 울린다.' },
      { who: 'rea', text: '등대지기! 일어났어? 외곽에 약탈자들이 몰려오고 있어!' },
      { who: 'hayul', text: '피난민 행렬이 아직 다 통과하지 못했어요. 시간을 벌어야 해요.' },
      { who: 'khan', text: '…명령만 내려.' },
      { text: '[튜토리얼] 아래 카드를 누른 뒤 타일을 눌러 배치하고, 방향을 정하세요.\n근접 직군은 지면(어두운 칸), 원거리 직군은 고지대(밝은 칸)에만 배치할 수 있습니다.' },
    ],
    after: [
      { who: 'rea', text: '휴, 다 막았다! 역시 우리 등대지기~' },
      { who: 'vito', text: '레아 넌 거의 맞기만 했잖아.' },
      { who: 'rea', text: '그게 뱅가드의 일이거든?!' },
    ],
  },
  {
    code: '0-2', name: '두 갈래 길',
    desc: '양쪽에서 동시에 진입하는 적. 비행 드론과 술사가 섞여 있다.',
    life: 3, startDp: 12, deployLimit: 8,
    map: [
      'R....^^^^^^#',
      '#^^^.^#....R',
      '#^^^...^.^^#',
      '##^^^.^..^^#',
      '#^^^.....^##',
      '#^^^.^^^^^^#',
      '####B#######',
    ],
    waves: [
      { t: 3,  enemy: 'slug',    count: 3, gap: 3, spawn: 0 },
      { t: 10, enemy: 'slug',    count: 3, gap: 3, spawn: 1 },
      { t: 22, enemy: 'soldier', count: 2, gap: 4, spawn: 0 },
      { t: 28, enemy: 'drone',   count: 2, gap: 4, spawn: 1 },
      { t: 40, enemy: 'mage',    count: 2, gap: 5, spawn: 0 },
      { t: 48, enemy: 'soldier', count: 3, gap: 4, spawn: 1 },
      { t: 60, enemy: 'drone',   count: 3, gap: 3, spawn: 0 },
      { t: 70, enemy: 'heavy',   count: 1, spawn: 1 },
      { t: 80, enemy: 'archer',  count: 2, gap: 4, spawn: 0 },
      { t: 90, enemy: 'heavy',   count: 1, spawn: 0 },
      { t: 92, enemy: 'soldier', count: 2, gap: 4, spawn: 1 },
    ],
    before: [
      { who: 'ciel', text: '…두 방향. 하늘에도 뭔가 있어.' },
      { who: 'noa', text: '저 방패병, 칼로는 안 들어갈 것 같은데? 내 아츠라면 얘기가 다르지!' },
      { who: 'mujin', text: '합류 지점은 내가 막지. 천천히 와라.' },
    ],
    after: [
      { who: 'noa', text: '봤어? 봤어?! 방패째로 녹아내렸다고!' },
      { who: 'ciel', text: '…드론, 하나도 안 놓쳤어.' },
      { name: '???', text: '……그 불빛. 아직도 꺼지지 않았나.' },
    ],
  },
  {
    code: '0-3', name: '등대의 밤',
    desc: '약탈자의 우두머리 「잿빛 기수」가 직접 나섰다. 끝까지 버텨라.',
    life: 3, startDp: 15, deployLimit: 8,
    map: [
      '#R##########',
      '#.^^^^^^^^^#',
      '#.......^..R',
      '#^^^^.^^^.^#',
      'B.....^^...#',
      '#^^^^.....^#',
      '############',
    ],
    waves: [
      { t: 3,   enemy: 'soldier', count: 2, gap: 4, spawn: 0 },
      { t: 8,   enemy: 'slug',    count: 3, gap: 2, spawn: 1 },
      { t: 22,  enemy: 'archer',  count: 2, gap: 4, spawn: 1 },
      { t: 30,  enemy: 'drone',   count: 2, gap: 3, spawn: 0 },
      { t: 40,  enemy: 'heavy',   count: 1, spawn: 0 },
      { t: 45,  enemy: 'mage',    count: 2, gap: 4, spawn: 1 },
      { t: 58,  enemy: 'soldier', count: 3, gap: 3, spawn: 1 },
      { t: 65,  enemy: 'drone',   count: 3, gap: 2, spawn: 1 },
      { t: 75,  enemy: 'heavy',   count: 2, gap: 6, spawn: 1 },
      { t: 95,  enemy: 'boss',    count: 1, spawn: 0 },
      { t: 100, enemy: 'soldier', count: 3, gap: 5, spawn: 0 },
      { t: 105, enemy: 'archer',  count: 2, gap: 5, spawn: 1 },
    ],
    before: [
      { text: '밤. 등대의 탐조등만이 폐허를 비춘다.' },
      { name: '오르텐', text: '불빛 따위로 이 대지의 어둠이 걷힐 거라 믿는 건가, 등대지기.' },
      { who: 'khan', text: '…저 녀석은 내가 안다. 정면으로 받으면 안 돼.' },
      { who: 'mujin', text: '그래서 내가 있는 거다.' },
      { who: 'rea', text: '다들, 오늘 밤도 무사히 돌아가는 거야. 알았지?' },
    ],
    after: [
      { name: '오르텐', text: '……이 정도인가. 그 불빛, 기억해 두지.' },
      { who: 'hayul', text: '다들 수고했어요. 이제 치료 받으러 오세요. 한 명도 빠짐없이!' },
      { who: 'rea', text: '등대지기. 우리… 계속 이 길을 밝힐 수 있겠지?' },
      { text: '— 1장 「잿빛 등대」 끝. (임시 스토리입니다. data.js에서 자유롭게 바꾸세요!)' },
    ],
  },
];
