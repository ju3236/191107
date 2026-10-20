'use strict';
// =====================================================================
//  게임 데이터 파일
//  오퍼레이터 · 세계관 · 적 · 스테이지 · 스토리는 전부 여기서 고칩니다.
//  적 이름·스탯·능력은 원작 데이터(Aceship AN-EN-Tags 적 도감)를 참고했고,
//  적 그림은 원작 아이콘(© Hypergryph / Yostar, Aceship Arknight-Images)입니다. 비상업 팬 게임 용도로만 쓰세요.
// =====================================================================

const GAME_INFO = {
  title: '잿빛 등대',
  subtitle: 'ARKNIGHTS OC AU · RHODES ISLAND',
  commander: '박사',                 // 플레이어 호칭
  chapter: 'EP 01 · 잿빛 등대',      // 작전 목록 화면 제목
  synopsis:
    '천재지변과 광석병이 뒤덮은 대지, 테라.\n' +
    '제약회사 로도스 아일랜드는 감염자 문제를 해결하기 위해 싸우고 있다.\n' +
    '체르노보그 사건 이후, 리유니온 무브먼트의 잔당이 폐허 도시 곳곳에서 움직이기 시작했다.\n' +
    '박사는 새로 꾸려진 소수 정예 행동대 「등대」를 이끌고 그 뒤를 쫓는다.',
};

// 직군 — tile: ground(지면, 근접) / high(고지대, 원거리). trait: 세부 직군이 없을 때 쓰는 기본 특성
const CLASSES = {
  vanguard:   { name: '뱅가드',     tile: 'ground', trait: '적 1명 저지' },
  guard:      { name: '가드',       tile: 'ground', trait: '적 1~2명 저지' },
  defender:   { name: '디펜더',     tile: 'ground', trait: '적 3명 저지' },
  sniper:     { name: '스나이퍼',   tile: 'high',   trait: '공중 목표 우선 공격' },
  caster:     { name: '캐스터',     tile: 'high',   trait: '공격 시 마법 대미지' },
  medic:      { name: '메딕',       tile: 'high',   trait: '아군 HP 회복' },
  specialist: { name: '스페셜리스트', tile: 'ground', trait: '특수한 능력을 가진 직군' },
};

// 세부 직군(원작의 아키타입). 특성 효과는 게임 엔진에 구현되어 있습니다.
const ARCHETYPES = {
  marksman:  { name: '명사수', trait: '공중 목표 우선 공격' },
  guardian:  { name: '가디언', trait: '적 3명 저지 가능, 스킬로 아군 HP 회복' },
  executor:  { name: '처형자', trait: '재배치 시간 대폭 감소, 배치 즉시 스킬 발동' },
  centurion: { name: '공격수', trait: '저지 중인 모든 적 동시 공격' },
};

// 공격 범위 도우미: 오른쪽을 바라볼 때 기준 상대 좌표 (x: 앞쪽 +, y: 아래쪽 +)
function area(x0, x1, y0, y1) {
  const r = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) r.push([x, y]);
  return r;
}

// ---------------------------------------------------------------------
//  오퍼레이터
//  cost: 배치 코스트 / redeploy: 재배치(초) / block: 저지 수 / interval: 공격 간격(초)
//  talents: 재능. effect 키 — atk, hp, def(배율), speed(공격 간격 배율), dodge(물리 회피 확률),
//           firstStrike(배치 후 첫 공격 배율), crit({rate, mul}), auraDef({radius, def}: 주변 아군 방어력 +),
//           guard({below, taken}: HP가 below 이하일 때 받는 대미지 배율), lastStand({below, heal}: 1회 회복)
//  skills: 스킬 최대 3개. 오퍼레이터 상세 화면에서 고릅니다.
//    sp: 필요 SP / initSp: 시작 SP / duration: 지속(초, 0=즉시, -1=무한)
//    spType: 'time'(자동 회복) | 'attack'(공격 회복) | 'hit'(피격 회복) | 'deploy'(배치 즉시)
//    trigger: 'manual'(직접 발동) | 'auto'(자동 발동)
//    effect 키 — atk/def/interval(배율), targets(동시 공격 수), splash(범위 피해 반경),
//      hits({count, mul}: 공격 1회가 여러 발로), nextHit(다음 공격 배율), charges(효과가 유지되는 공격 횟수),
//      strike({mul, radius, stun}: 즉시 주변 적에게 피해·기절), heal(자기 즉시 회복 비율), regen(초당 회복 비율),
//      allyHeal({mul, radius}: 주변 아군 즉시 회복), allyRegen({mul, radius}: 지속 중 초당 회복),
//      shield(최대 HP 대비 보호막), dodge(물리 회피), block(저지 수 +), range(지속 중 공격 범위),
//      endBlast({mul, radius, selfDmg}: 종료 시 주변 폭발), dp(즉시 코스트)
//  image: 'img/파일명.png' — 넣으면 임시 일러스트 대신 그림이 쓰입니다.
//  starter: true — 처음부터 보유. 그 외 오퍼레이터는 헤드헌팅으로 얻습니다.
//  voice: 음성 기록 (원작과 같은 구분) — obtain 획득 / assistant 비서 임명 / talk 대화 1~3 /
//         trust100·trust200 신뢰도 대사 / squad 편성 / leader 대장 임명 / depart 작전 출발 / start 작전 개시 /
//         select 선택 [ ] / deploy 배치 [ ] / combat 전투 중 [ ] / clear 3성 작전 완료 / fail 작전 실패
//         voice가 없으면 voices(비서 대사)와 quote(배치 대사)를 씁니다.
// ---------------------------------------------------------------------
const OPERATORS = [
  // ================= 행동대 「등대」 (박사님의 자캐) =================
  {
    id: 'byeol', name: '천사별', class: 'sniper', archetype: 'marksman', race: '산크타', color: '#8fc9f0',
    en: 'Cheonsabyeol', rarity: 6, tags: ['원거리', '대공', '화력'], faction: '로도스 아일랜드 · 행동대 등대',
    voice: {
      obtain: '아, 안녕하세요…… 천사별이라고 합니다. 스나이퍼 오퍼레이터로 배속되었어요. ……사격 실력은 걱정하지 않으셔도 돼요. 아, 물론 아직 부족한 점도 많지만요…….',
      assistant: '여기 앉아 있어도 될까요……? 아, 조용히 있을게요. ……저기, 혹시 인터넷 연결은…… 아, 아무것도 아니에요.',
      talk: [
        '라테라노에서는 총을 다루는 게 그리 특별한 일은 아니에요. 저도 어릴 때부터 배웠고요. ……후후, 의외인가요? 저도 나름 자신 있는 일이 있답니다.',
        '전투할 때는 오히려 마음이 편해요. 해야 할 일이 분명하니까요. 목표와의 거리, 바람의 방향, 탄도의 편차…… 그런 것들을 계산하다 보면 다른 생각은 들지 않거든요.',
        '저…… 안심해 씨와는 예전부터 알던 사이예요. 같은 학교에 다녔거든요. 그때도 지금처럼…… 아니, 지금보다는 조금…… 으으, 죄송해요. 무슨 말을 하는 건지 모르겠네요.',
      ],
      trust100: '사실 저는 인터넷에서 말이 좀 많은 편이에요. 현실에서는 말 한마디 꺼내는 것도 어려운데…… 이상하죠? 아, 제 계정이요? 그, 그건 비밀이에요. 절대로 알려 드릴 수 없어요……!',
      trust200: '박사님은 누군가를 아주 오랫동안 좋아해 보신 적 있으세요? ……저는 있어요. 그 사람이 모르는 곳에서 아주 오랫동안요. 이제는 바로 옆에 있는데도…… 여전히 말하지 못하는 게 많네요.',
      squad: '네, 엄호하겠습니다.',
      leader: '제, 제가요……? 노력할게요.',
      depart: '탄약 확인…… 이상 없습니다.',
      start: '사격 지점 확보하겠습니다.',
      select: ['네, 박사님.', '조준하고 있어요.'],
      deploy: ['시야 확보했어요.', '……놓치지 않을게요.'],
      combat: ['목표 확인.', '……맞힐 수 있어요.', '거기서 멈춰 주세요!', '제 뒤에 있는 사람은…… 못 건드려요!'],
      clear: '전원 무사…… 다행이에요. 이제 긴장이 풀리네요…….',
      fail: '아직…… 아직 제가 엄호할 수 있어요……!',
    },
    image: 'img/byeol.png',
    profile: '라테라노 출신 산크타 저격수. 말수가 적고 수줍음이 많지만, 어릴 때부터 총을 다뤄 온 만큼 사격 실력만큼은 확실하다. 전투에 들어가면 오히려 침착해진다. 안심해와는 학창 시절부터 알던 사이.',
    quote: '시야 확보했어요.',
    cost: 13, redeploy: 35, block: 1,
    hp: 1673, atk: 540, def: 161, res: 0, interval: 1.0,
    range: area(0, 3, -1, 1),
    talents: [
      { name: '별빛 장전', desc: '공격 속도 +15%', effect: { speed: 0.87 } },
      { name: '천사의 가호', desc: '공격력 +8%, 최대 HP +13%', effect: { atk: 1.08, hp: 1.13 } },
    ],
    skills: [
      { name: '트윙클 샷', desc: '다음 공격이 3연발 사격이 되며, 한 발마다 공격력의 145% 물리 대미지', sp: 4, initSp: 0, duration: 0, spType: 'attack', trigger: 'auto', effect: { hits: { count: 3, mul: 1.45 } } },
      { name: '유성우', desc: '15초간 공격이 4연발 사격이 되며, 한 발마다 공격력의 125% 물리 대미지', sp: 35, initSp: 25, duration: 15, trigger: 'manual', effect: { hits: { count: 4, mul: 1.25 } } },
      { name: '별이 쏟아지는 밤', desc: '15초간 공격이 5연발 사격이 되고 공격 간격 감소, 공격력 +10%', sp: 30, initSp: 20, duration: 15, trigger: 'auto', effect: { hits: { count: 5, mul: 1 }, interval: 0.8, atk: 1.1 } },
    ],
  },
  {
    id: 'simhae', name: '안심해', class: 'defender', archetype: 'guardian', race: '리베리', color: '#c9ced6',
    en: 'Ahn Simhae', rarity: 6, tags: ['근거리', '방어', '치료'], faction: '로도스 아일랜드 · 행동대 등대',
    voice: {
      obtain: '안녕하세요, 박사님. 안심해라고 합니다. 이름이 좀 특이하죠? 하하, 진짜로 안심하셔도 되냐고요? 글쎄요. 적어도 제 뒤에 서 계시는 동안에는요.',
      assistant: '어라, 저를 비서로요? 박사님, 이거 정말 뜻밖인데. 뭐, 좋습니다. 자, 오늘은 어떤 사고를 수습해 드리면 될까요?',
      talk: [
        '디펜더가 적의 공격을 전부 받아 낼 필요는 없죠. 피할 수 있는 건 피하고, 흘릴 수 있는 건 흘리고. 정말 막아야 할 것만 막으면 되는 겁니다. ……물론 말처럼 쉽지는 않지만.',
        '방송이요? 아, 예전에 좀 했었죠. 지금도 가끔 하고요. ……유명했냐고요? 에이, 그 정도는 아니고. 그냥 심심한 사람들끼리 모여서 놀던 거죠. 재밌었어요. 꽤.',
        '천사별 씨요? 아, 그 친구! 학교 다닐 때부터 알던 사이죠. 말수가 적어서 처음에는 저를 싫어하는 줄 알았는데…… 하하. 아니더라고요. 꽤 좋은 사람이에요. ……네? 그게 다냐고요? 뭘 더 말씀드려요?',
      ],
      trust100: '제 이름이 안심해잖아요. 그래서 그런가, 사람들이 저한테는 걱정을 잘 안 하더라고요. ……아, 농담입니다. 굳이 걱정하실 필요 없어요. 전 원래 이런 사람이니까.',
      trust200: '제가 누군가를 지키려고 디펜더가 된 거냐고요? 하하, 멋진 이유네요. 그렇게 말하면 좀 폼 나려나. ……음. 사실 딱 한 사람 정도는, 제가 앞에 있어 줬으면 하는 사람이 있긴 해요. 누구인지는…… 비밀.',
      squad: '자, 오늘도 몸 좀 써 볼까요?',
      leader: '제 지휘에 불만 있으신 분? 없죠? 좋습니다!',
      depart: '다들 제 뒤만 잘 따라오세요.',
      start: '이쪽은 통행금지입니다~.',
      select: ['예이, 듣고 있습니다.', '저 부르셨어요?'],
      deploy: ['여기부터는 못 지나갑니다.', '자, 다들 뒤로 빠지시고.'],
      combat: ['어이쿠, 아프겠네.', '그 정도로는 어림없죠!', '여기! 여기라고!', '……내 뒤로 가.'],
      clear: '와, 이건 좀 아슬아슬했는데? 다들 살아 있죠? 좋습니다!',
      fail: '……먼저 가세요. 여기까지는 제가 어떻게든 막을 테니까.',
    },
    image: 'img/simhae.png',
    profile: '리베리 출신 가디언. 능청스럽고 장난기 많은 성격으로, 예전에는 방송을 하기도 했다. 모든 공격을 받아 내기보다 피할 건 피하고 흘릴 건 흘리는 노련한 디펜더. 천사별과는 학창 시절부터 알던 사이.',
    quote: '여기부터는 못 지나갑니다.',
    cost: 20, redeploy: 45, block: 3,
    hp: 3150, atk: 485, def: 595, res: 10, interval: 1.2,
    range: area(0, 0, 0, 0),
    talents: [
      { name: '괜찮아, 안심해', desc: '배치 중 주변 8칸 아군의 방어력 +8%', effect: { auraDef: { radius: 1.5, def: 0.08 } } },
      { name: '졸린 방패', desc: 'HP가 50% 이하일 때 받는 대미지 -20%', effect: { guard: { below: 0.5, taken: 0.8 } } },
    ],
    skills: [
      { name: '토닥토닥', desc: '주변 8칸 아군의 HP를 공격력의 180%만큼 회복 (다친 아군이 있을 때 자동 발동)', sp: 5, initSp: 0, duration: 0, trigger: 'auto', effect: { allyHeal: { mul: 1.8, radius: 1.5 } } },
      { name: '안심해', desc: '즉시 자신의 HP 30% 회복, 20초간 방어력 +60%, 매초 최대 HP의 3% 회복', sp: 30, initSp: 20, duration: 20, trigger: 'manual', effect: { def: 1.6, heal: 0.3, regen: 0.03 } },
      { name: '잠들 때까지 지켜줄게', desc: '25초간 주변 아군의 HP를 매초 공격력의 35%만큼 회복, 방어력 +40%', sp: 50, initSp: 35, duration: 25, trigger: 'manual', effect: { allyRegen: { mul: 0.35, radius: 1.5 }, def: 1.4 } },
    ],
  },
  {
    id: 'iai', name: '이아이', class: 'specialist', archetype: 'executor', race: '사르카즈', color: '#7a8796',
    en: 'Iai', rarity: 6, tags: ['근거리', '빠른 재배치', '폭발력'], faction: '로도스 아일랜드 · 행동대 등대',
    voices: ['…부르셨어요?', '금방 끝내고 올게요.', '조용한 게 좋아요.', '카즈델 얘기는… 다음에 할게요.'],
    image: 'img/iai.png',
    profile: '카즈델 출신 사르카즈 처형자. 칼집에서 칼을 뽑는 한순간에 모든 것을 끝내는 발도술의 달인. 말수가 적고, 필요한 곳에 몇 번이고 다시 나타난다.',
    quote: '…베고, 돌아갈게요.',
    cost: 9, redeploy: 18, block: 1,
    hp: 1645, atk: 558, def: 322, res: 0, interval: 0.93,
    range: area(0, 1, 0, 0),
    talents: [
      { name: '발도술', desc: '배치 후 첫 공격의 대미지 250%', effect: { firstStrike: 2.5 } },
      { name: '그림자 걸음', desc: '물리 회피 25%', effect: { dodge: 0.25 } },
    ],
    skills: [
      { name: '칼집 속의 고요', desc: '배치 즉시 10초간 물리 회피 50%, 최대 HP 60%의 보호막 획득', sp: 0, initSp: 0, duration: 10, spType: 'deploy', trigger: 'auto', effect: { dodge: 0.5, shield: 0.6 } },
      { name: '연속 발도', desc: '배치 즉시 다음 10회 공격의 공격력 +60%', sp: 0, initSp: 0, duration: -1, spType: 'deploy', trigger: 'auto', effect: { atk: 1.6, charges: 10 } },
      { name: '일섬', desc: '배치 즉시 주변 모든 적에게 공격력 300% 물리 대미지, 2초간 기절', sp: 0, initSp: 0, duration: 0, spType: 'deploy', trigger: 'auto', effect: { strike: { mul: 3, radius: 1.6, stun: 2 } } },
    ],
  },
  {
    id: 'gaeul', name: '김가을', class: 'guard', archetype: 'centurion', race: '페린', color: '#4f7fd1',
    en: 'Kim Gaeul', rarity: 6, tags: ['근거리', '화력', '생존'], faction: '로도스 아일랜드 · 행동대 등대',
    voices: ['보고서는… 나중에 쓸게요.', '박사님, 제 안경 어디 갔는지 보셨어요?', '맡겨 주세요. 정리할게요.', '리유니온 동향은 정리해서 책상에 올려뒀어요.'],
    image: 'img/gaeul.png',
    profile: '페린 출신 공격수. 행동대 「등대」의 대장 역할을 맡고 있다. 차분하고 꼼꼼해서 작전 보고서를 도맡아 쓰지만, 전장에서는 저지한 적을 한꺼번에 정리해 버린다.',
    quote: '하나씩, 정리하겠습니다.',
    cost: 20, redeploy: 45, block: 3,
    hp: 2821, atk: 765, def: 370, res: 0, interval: 1.2,
    range: area(0, 1, 0, 0),
    talents: [
      { name: '마지막 정리', desc: 'HP가 25% 이하가 되면 1회 한정 HP를 50% 회복', effect: { lastStand: { below: 0.25, heal: 0.5 } } },
      { name: '꼼꼼한 성격', desc: '공격 시 20% 확률로 대미지 160%', effect: { crit: { rate: 0.2, mul: 1.6 } } },
    ],
    skills: [
      { name: '강타', desc: '다음 공격의 공격력 290%', sp: 2, initSp: 0, duration: 0, spType: 'attack', trigger: 'auto', effect: { nextHit: 2.9 } },
      { name: '낙엽 쓸기', desc: '20초간 공격력 +60%, 공격 범위 1칸 증가', sp: 40, initSp: 20, duration: 20, trigger: 'manual', effect: { atk: 1.6, range: area(0, 2, 0, 0) } },
      { name: '가을 폭풍', desc: '10초간 공격력·방어력 +60%. 종료 시 주변 적에게 공격력 350% 물리 대미지, 자신은 HP 20% 소모', sp: 35, initSp: 25, duration: 10, trigger: 'manual', effect: { atk: 1.6, def: 1.6, endBlast: { mul: 3.5, radius: 1.4, selfDmg: 0.2 } } },
    ],
  },

  // ================= 지원 오퍼레이터 (임시 캐릭터 — 필요 없으면 지우세요) =================
  {
    id: 'rea', starter: true, name: '레아', class: 'vanguard', race: '페로', color: '#f2a541',
    en: 'Rhea', rarity: 5, tags: ['근거리', '코스트 회복'], faction: '로도스 아일랜드 · 지원',
    voices: ['박사! 오늘도 같이 가자!', '선봉은 언제나 내 자리야.'],
    profile: '로도스 아일랜드 소속 뱅가드. 밝고 시끄럽지만, 동료가 다치는 걸 누구보다 두려워한다.',
    quote: '선두는 내가 맡을게!',
    cost: 10, redeploy: 25, block: 1,
    hp: 1600, atk: 450, def: 290, res: 0, interval: 1.0,
    range: area(0, 1, 0, 0),
    skills: [
      { name: '돌격 신호', desc: '즉시 배치 코스트 +12', sp: 25, initSp: 12, duration: 0, trigger: 'manual', effect: { dp: 12 } },
    ],
  },
  {
    id: 'khan', starter: true, name: '칸', class: 'guard', race: '사르카즈', color: '#d9534f',
    en: 'Khan', rarity: 5, tags: ['근거리', '화력'], faction: '로도스 아일랜드 · 지원',
    voices: ['…명령을.', '칼은 손질해 뒀다.'],
    profile: '용병 출신 사르카즈 검사. 로도스 아일랜드와 계약한 뒤로 말없이 일을 처리한다.',
    quote: '…베면 되는 거지.',
    cost: 15, redeploy: 35, block: 2,
    hp: 2400, atk: 640, def: 360, res: 0, interval: 1.2,
    range: area(0, 1, 0, 0),
    skills: [
      { name: '붉은 칼날', desc: '15초간 공격력 +80%', sp: 30, initSp: 10, duration: 15, trigger: 'auto', effect: { atk: 1.8 } },
    ],
  },
  {
    id: 'mujin', starter: true, name: '무진', class: 'defender', race: '우르수스', color: '#8d6e63',
    en: 'Mujin', rarity: 5, tags: ['근거리', '방어'], faction: '로도스 아일랜드 · 지원',
    voices: ['뒤는 걱정 말고.', '…차 한 잔 하겠나.'],
    profile: '전직 광산 경비대장. 느릿한 말투와 달리 그 방패는 단 한 번도 뚫린 적이 없다.',
    quote: '뒤는 걱정 말고.',
    cost: 18, redeploy: 40, block: 3,
    hp: 3200, atk: 360, def: 650, res: 10, interval: 1.2,
    range: area(0, 0, 0, 0),
    skills: [
      { name: '철벽', desc: '즉시 HP 30% 회복, 20초간 방어력 +80%', sp: 30, initSp: 15, duration: 20, spType: 'hit', trigger: 'manual', effect: { def: 1.8, heal: 0.3 } },
    ],
  },
  {
    id: 'noa', starter: true, name: '노아', class: 'caster', race: '불포', color: '#a970ff',
    en: 'Noa', rarity: 5, tags: ['원거리', '범위 공격'], faction: '로도스 아일랜드 · 지원',
    voices: ['실험… 아니, 작전 개시!', '오리지늄 아츠는 예술이라고!'],
    profile: '로도스 아일랜드 연구부 소속 캐스터. 호기심이 너무 많아 자주 사고를 친다. 방어력 높은 적에게 강하다.',
    quote: '실험… 아니, 작전 개시!',
    cost: 19, redeploy: 40, block: 1,
    hp: 1200, atk: 680, def: 100, res: 20, interval: 1.6,
    range: area(0, 3, -1, 1),
    skills: [
      { name: '아츠 폭발', desc: '10초간 공격력 +60%, 주변에 범위 피해', sp: 35, initSp: 15, duration: 10, trigger: 'manual', effect: { atk: 1.6, splash: 1.1 } },
    ],
  },
  {
    id: 'hayul', starter: true, name: '하율', class: 'medic', race: '산크타', color: '#f7d774',
    en: 'Hayul', rarity: 5, tags: ['원거리', '치료'], faction: '로도스 아일랜드 · 지원',
    voices: ['다치면 혼날 줄 알아요?', '오늘도 무사히 돌아와요.'],
    profile: '로도스 아일랜드 의료부 소속 메딕. 늘 웃고 있지만 치료 중에는 누구보다 무섭다.',
    quote: '다치면 혼날 줄 알아요?',
    cost: 16, redeploy: 35, block: 1,
    hp: 1300, atk: 430, def: 110, res: 0, interval: 2.0,
    range: area(0, 3, -1, 1),
    skills: [
      { name: '축복', desc: '12초간 치유량 +60%, 동시에 3명 치료', sp: 30, initSp: 10, duration: 12, trigger: 'auto', effect: { atk: 1.6, targets: 3 } },
    ],
  },
  {
    id: 'ciel', starter: true, name: '시엘', class: 'sniper', race: '리베리', color: '#5cb85c',
    en: 'Ciel', rarity: 4, tags: ['원거리', '대공'], faction: '로도스 아일랜드 · 지원',
    voices: ['보여. 전부.', '망루는… 조용해서 좋아.'],
    profile: '말수가 적은 저격수. 로도스 아일랜드 함선 갑판 망루가 지정석이다.',
    quote: '보여. 전부.',
    cost: 11, redeploy: 30, block: 1,
    hp: 1100, atk: 500, def: 120, res: 0, interval: 1.0,
    range: area(0, 3, -1, 1),
    skills: [
      { name: '연사', desc: '15초간 공격 속도 +66%, 공격력 +20%', sp: 25, initSp: 8, duration: 15, trigger: 'auto', effect: { interval: 0.6, atk: 1.2 } },
    ],
  },
  {
    id: 'vito', starter: true, name: '비토', class: 'guard', race: '루포', color: '#7fb3d5',
    en: 'Vito', rarity: 4, tags: ['근거리', '다중 공격'], faction: '로도스 아일랜드 · 지원',
    voices: ['느려 터졌네, 다들.', '정찰은 끝났어.'],
    profile: '빠른 발과 쌍단검이 자랑인 로도스 아일랜드 정찰병.',
    quote: '느려 터졌네, 다들.',
    cost: 13, redeploy: 30, block: 1,
    hp: 1850, atk: 400, def: 230, res: 0, interval: 0.7,
    range: area(0, 1, 0, 0),
    skills: [
      { name: '질풍', desc: '10초간 공격 속도 2배, 동시에 2명 공격', sp: 20, initSp: 5, duration: 10, trigger: 'manual', effect: { interval: 0.5, targets: 2 } },
    ],
  },
];

// ---------------------------------------------------------------------
//  적 — 원작 적 도감 수치 참고 (이동 속도는 이 게임 기준으로 환산)
//  speed: 타일/초 / range: 0이면 근접 / arts: 마법 피해 / fly: 비행(직선 이동, 저지 불가, 근접 공격 불가)
//  lifeCost: 돌파 시 깎이는 목숨 / 특수 능력 —
//    aoe(공격 범위 피해 반경), unblockable(저지 불가), enrage({below, atk}), revive({atk}: 1회 부활),
//    healer({count}: 공격 대신 주변 적 치료), blink(저지당하면 1회 뒤로 순간이동), chill(명중 시 공격 속도 감소),
//    regen(초당 HP 회복 비율), healAura(모든 적의 HP 회복 속도 배율)
// ---------------------------------------------------------------------
const ENEMIES = {
  slug:        { code: 'B1', name: '원석충', hp: 550, atk: 130, def: 0, res: 0, speed: 0.5, interval: 1.7, range: 0, color: '#d08c4a', desc: '야생의 감염 생물. 적의 캐스터에게 조종당해 무리지어 공격한다.' },
  slug_a:      { code: 'B2', name: '원석충 α', hp: 1050, atk: 185, def: 0, res: 0, speed: 0.5, interval: 1.7, range: 0, color: '#e0a060', desc: '일반 원석충보다 위험도가 높은 종.' },
  hound:       { code: 'O1', name: '사냥개', hp: 820, atk: 190, def: 0, res: 20, speed: 0.95, interval: 1.4, range: 0, color: '#c79a5d', desc: '리유니온이 조종하는 생물. 행동 속도가 몹시 빠르다.' },
  hound_pro:   { code: 'O2', name: '사냥개 Pro', hp: 1700, atk: 260, def: 0, res: 20, speed: 0.95, interval: 1.4, range: 0, color: '#d9a066', desc: '강화된 사냥개. 빠르고 공격적이다.' },
  soldier:     { code: '1', name: '병사', hp: 1650, atk: 200, def: 100, res: 0, speed: 0.55, interval: 2.0, range: 0, color: '#c0504d', desc: '리유니온 무브먼트의 일반 병사.' },
  mob:         { code: '17', name: '폭도', hp: 1700, atk: 250, def: 50, res: 0, speed: 0.55, interval: 2.0, range: 0, color: '#b5523b', desc: '리유니온에 가담한 폭도.' },
  dual:        { code: '4', name: '쌍검사', hp: 2000, atk: 350, def: 100, res: 0, speed: 0.55, interval: 1.2, range: 0, color: '#d35f5f', desc: '두 자루의 칼로 빠르게 공격한다.' },
  airborne:    { code: '2', name: '공수부대병', hp: 1450, atk: 220, def: 100, res: 0, speed: 0.5, interval: 1.9, range: 0, color: '#c86a6a', desc: '공중에서 강하해 전장에 투입되는 병사.' },
  crossbow:    { code: 'A1', name: '석궁병', hp: 1400, atk: 240, def: 100, res: 0, speed: 0.45, interval: 2.4, range: 1.9, color: '#e07b39', desc: '멀리서 오퍼레이터를 공격한다.' },
  crossbow_l:  { code: 'A2', name: '석궁병 리더', hp: 1900, atk: 310, def: 150, res: 0, speed: 0.45, interval: 2.4, range: 1.9, color: '#f08c45', desc: '석궁병 부대의 리더.' },
  caster:      { code: 'A3', name: '캐스터', hp: 1600, atk: 200, def: 50, res: 50, speed: 0.4, interval: 4.0, range: 1.8, arts: true, color: '#9b59b6', desc: '아츠로 마법 피해를 주며 마법 저항이 높다.' },
  caster_l:    { code: 'A4', name: '캐스터 리더', hp: 2400, atk: 300, def: 80, res: 50, speed: 0.4, interval: 4.0, range: 2.0, arts: true, color: '#b06ad0', desc: '캐스터 부대의 리더.' },
  molotov:     { code: 'A9', name: '화염병 투척병', hp: 1550, atk: 180, def: 50, res: 0, speed: 0.5, interval: 2.7, range: 1.75, aoe: 0.8, color: '#ff7a2f', desc: '화염병을 던져 좁은 범위에 피해를 준다.' },
  shieldguard: { code: '19', name: '기동방패병', hp: 2050, atk: 240, def: 250, res: 0, speed: 0.5, interval: 2.0, range: 0, color: '#8e9aa6', desc: '방패를 든 병사.' },
  light_armor: { code: '6', name: '경기갑병', hp: 2500, atk: 250, def: 400, res: 0, speed: 0.5, interval: 2.0, range: 0, color: '#7f8c8d', desc: '방어력이 높다.' },
  heavy:       { code: '8', name: '중기갑병', hp: 6000, atk: 600, def: 800, res: 0, speed: 0.375, interval: 2.6, range: 0, elite: true, color: '#95a5a6', desc: '방어력이 매우 높다. 캐스터의 마법 공격으로 상대하자.' },
  drone:       { code: 'D2', name: '요마 MKII', hp: 1550, atk: 220, def: 50, res: 0, speed: 0.45, interval: 3.0, range: 2.0, fly: true, color: '#5dade2', desc: '비행 유닛. 저지할 수 없고 곧장 날아온다.' },
  frostfang:   { code: 'O4', name: '프로스트팽', hp: 3150, atk: 350, def: 0, res: 30, speed: 0.95, interval: 1.4, range: 0, color: '#9fd6ff', desc: '설원의 사냥개. 매우 빠르다.' },
  yeti:        { code: 'Y1', name: '눈의 악마 소대', hp: 3400, atk: 360, def: 100, res: 0, speed: 0.55, interval: 2.0, range: 0, color: '#bcd7ea', desc: '프로스트노바가 이끄는 정예 부대.' },
  yeti_sniper: { code: 'Y2', name: '눈의 악마 스나이퍼', hp: 2500, atk: 290, def: 80, res: 0, speed: 0.45, interval: 2.4, range: 1.9, color: '#a9c8de', desc: '눈의 악마 소대의 저격수.' },
  yeti_caster: { code: 'Y4', name: '눈의 악마 캐스터', hp: 5000, atk: 320, def: 200, res: 50, speed: 0.4, interval: 4.5, range: 2.2, arts: true, chill: true, color: '#7fb6e0', desc: '냉기 아츠로 오퍼레이터의 공격 속도를 늦춘다.' },
  host:        { code: 'P1', name: '숙주 병사', hp: 2500, atk: 250, def: 100, res: 30, speed: 0.45, interval: 1.8, range: 0, regen: 0.01, color: '#6fae6f', desc: '광석병에 잠식된 병사. HP가 서서히 회복된다.' },
  sarkaz:      { code: 'S1', name: '살카즈 대검사', hp: 7500, atk: 600, def: 230, res: 50, speed: 0.425, interval: 2.0, range: 0, elite: true, color: '#c0392b', desc: '사르카즈 용병. 공격력이 높다.' },
  sarkaz_caster: { code: 'S5', name: '살카즈 캐스터', hp: 12000, atk: 500, def: 200, res: 50, speed: 0.4, interval: 4.0, range: 2.5, arts: true, elite: true, color: '#8e44ad', desc: '강력한 아츠를 쓰는 사르카즈 용병.' },
  // ---- 보스 (리유니온 간부) ----
  skull:     { code: 'SS', name: '스컬슈레더', hp: 10500, atk: 1000, def: 150, res: 30, speed: 0.3, interval: 3.0, range: 2.6, aoe: 1.0, enrage: { below: 0.5, atk: 1.5 }, lifeCost: 2, boss: true, color: '#e67e22',
               desc: '리유니온 돌격부대 간부. 저지당하지 않으면 유탄을 쏘아 범위 피해를 주고, HP 50% 이하에서 공격력이 크게 오른다.' },
  crown:     { code: 'CS', name: '크라운슬레이어', hp: 6000, atk: 400, def: 120, res: 50, speed: 0.7, interval: 2.8, range: 0, blink: true, lifeCost: 2, boss: true, color: '#e74c3c',
               desc: '리유니온 간부. 기습 암살에 능하며, 저지당하면 목표의 뒤로 고속 이동한다.' },
  mephisto:  { code: 'MP', name: '메피스토', hp: 20000, atk: 500, def: 200, res: 60, speed: 0.25, interval: 4.0, range: 3.0, healer: { count: 3 }, healAura: 2, lifeCost: 2, boss: true, color: '#d4ac0d',
               desc: '리유니온 간부. 공격 대신 주변 적을 최대 3명까지 치료하고, 모든 적의 HP 회복 속도를 2배로 만든다.' },
  faust:     { code: 'FA', name: '파우스트', hp: 18000, atk: 800, def: 350, res: 35, speed: 0.3, interval: 5.0, range: 4.0, unblockable: true, lifeCost: 2, boss: true, color: '#c9a227',
               desc: '리유니온 간부. 저지당하지 않으며, 초원거리에서 강력한 크로스보우로 공격한다.' },
  frostnova: { code: 'FN', name: '프로스트노바', hp: 25000, atk: 420, def: 250, res: 50, speed: 0.25, interval: 3.7, range: 2.0, arts: true, aoe: 1.0, chill: true, revive: { atk: 1.3 }, lifeCost: 2, boss: true, color: '#aee3ff',
               desc: '리유니온 아츠부대 간부. 냉기 아츠로 주변에 마법 피해를 주고 공격 속도를 늦춘다. 첫 사망 시 부활하며 공격력이 오른다.' },
};

// 적 그림: img/enemy/<적 id>.png (원작 적 도감 아이콘). 다른 그림을 쓰려면 적마다 image: '경로'를 넣으세요.
for (const [id, e] of Object.entries(ENEMIES)) if (e.image === undefined) e.image = `img/enemy/${id}.png`;

// ---------------------------------------------------------------------
//  스테이지
//  sanity: 소모 이성 (작전 실패·포기 시 1만 소모하고 나머지는 돌려받음)
//  map 기호: # 벽 · . 지면(배치 가능) · - 지면(배치 불가 통로) · ^ 고지대 · R 침입 지점 · B 방어 지점
//  waves: { t: 시작(초), enemy, count, gap: 간격(초), spawn: 침입 지점 번호(위→아래, 왼→오른쪽 순) }
//  스토리: { who: 오퍼레이터 id, text } / { name: '이름', text } / { text } (나레이션)
// ---------------------------------------------------------------------
const STAGES = [
  {
    code: '1-1', sanity: 6, name: '첫 출격', desc: '체르노보그 외곽 폐허. 리유니온 잔당과 원석충을 정리하라.',
    life: 3, startDp: 10, deployLimit: 8,
    map: ['############', '#^^^^#^^^^^#', 'R-........^#', '#^^^.^^^^.^#', '#^...^#^...B', '#^^^^^#^^^^#', '############'],
    waves: [
      { t: 3, enemy: 'slug', count: 3, gap: 3 },
      { t: 15, enemy: 'soldier', count: 2, gap: 4 },
      { t: 28, enemy: 'slug_a', count: 3, gap: 2.5 },
      { t: 42, enemy: 'soldier', count: 3, gap: 3.5 },
      { t: 58, enemy: 'crossbow', count: 2, gap: 4 },
      { t: 70, enemy: 'soldier', count: 3, gap: 3 },
    ],
    before: [
      { text: '로도스 아일랜드 본함. 작전 브리핑실.' },
      { name: '아미야', text: '박사, 새로 편성된 행동대 「등대」의 첫 작전이에요. 체르노보그 외곽에 리유니온 잔당이 나타났다는 보고가 들어왔어요.' },
      { who: 'gaeul', text: '행동대 「등대」 대장 김가을입니다. 작전 계획은 정리해 두었습니다. 박사님의 지휘를 따르겠습니다.' },
      { who: 'byeol', text: '첫 출격…… 열심히 할게요. 아, 엄호는 맡겨 주세요.' },
      { who: 'simhae', text: '자자, 긴장 풀고. 박사님, 앞은 제가 막을 테니 안심하셔도 됩니다. 이름값은 해야죠.' },
      { who: 'iai', text: '…준비됐어요.' },
      { text: '[작전 안내] 아래 카드를 누른 뒤 노란 줄무늬 칸(근접) 또는 솟은 고지대(원거리)를 누르고, 방향을 정해 배치하세요.' },
    ],
    after: [
      { who: 'byeol', text: '전원 무사…… 다행이에요.' },
      { who: 'gaeul', text: '피해 없음. 보고서에는 「완벽」이라고 적겠습니다.' },
      { who: 'iai', text: '…저쪽에, 사냥개 발자국이 있었어요. 많이.' },
    ],
  },
  {
    code: '1-2', sanity: 6, name: '폐허의 사냥개', desc: '빠르게 달려드는 사냥개 무리. 양쪽 입구를 동시에 막아라.',
    life: 3, startDp: 12, deployLimit: 8,
    map: ['R-...^^^^^^#', '#^^^.^#...-R', '#^^^...^.^^#', '##^^^.^..^^#', '#^^^.....^##', '#^^^.^^^^^^#', '####B#######'],
    waves: [
      { t: 3, enemy: 'hound', count: 3, gap: 1.5, spawn: 0 },
      { t: 10, enemy: 'hound', count: 3, gap: 1.5, spawn: 1 },
      { t: 22, enemy: 'soldier', count: 2, gap: 3, spawn: 0 },
      { t: 26, enemy: 'crossbow', count: 2, gap: 3, spawn: 1 },
      { t: 40, enemy: 'hound_pro', count: 2, gap: 2, spawn: 0 },
      { t: 44, enemy: 'hound_pro', count: 2, gap: 2, spawn: 1 },
      { t: 58, enemy: 'dual', count: 2, gap: 4, spawn: 0 },
      { t: 64, enemy: 'soldier', count: 3, gap: 3, spawn: 1 },
      { t: 80, enemy: 'hound_pro', count: 3, gap: 1.5, spawn: 0 },
      { t: 82, enemy: 'hound_pro', count: 3, gap: 1.5, spawn: 1 },
    ],
    before: [
      { who: 'iai', text: '…와요. 빨라요.' },
      { who: 'gaeul', text: '사냥개는 빠르지만 약합니다. 길목을 막고 한꺼번에 정리하죠.' },
      { who: 'simhae', text: '두 방향이네. 합류하는 곳은 제가 맡죠. 이쪽은 통행금지입니다~.' },
    ],
    after: [
      { who: 'byeol', text: '너무 빨라서…… 조준이 힘들었어요. 그래도 전부 맞혔어요.' },
      { who: 'iai', text: '…강아지라고 하기엔, 이빨이 컸어요.' },
      { name: '아미야', text: '수고했어요. 그런데 정찰 드론이 그 근처 하늘에서 포착됐어요. 조심해 주세요.' },
    ],
  },
  {
    code: '1-3', sanity: 9, name: '하늘의 눈', desc: '비행 유닛 요마가 정찰한다. 비행 유닛은 길을 따르지 않고 곧장 날아온다.',
    life: 3, startDp: 12, deployLimit: 8,
    map: ['#R##########', '#-^^^^^^^^^#', '#........^^#', '#^^^^^^^.^^#', '#^.......^^#', '#^.^^^^^^^^#', '#^.......--B', '############'],
    waves: [
      { t: 3, enemy: 'soldier', count: 3, gap: 3 },
      { t: 14, enemy: 'drone', count: 2, gap: 4 },
      { t: 26, enemy: 'caster', count: 2, gap: 4 },
      { t: 36, enemy: 'drone', count: 3, gap: 3 },
      { t: 50, enemy: 'airborne', count: 4, gap: 2 },
      { t: 64, enemy: 'caster_l', count: 1 },
      { t: 68, enemy: 'drone', count: 3, gap: 2.5 },
      { t: 82, enemy: 'soldier', count: 3, gap: 2.5 },
      { t: 90, enemy: 'drone', count: 2, gap: 2 },
    ],
    before: [
      { who: 'byeol', text: '박사님, 하늘에…… 드론이에요. 고도는 낮고, 바람은 약하고요.' },
      { who: 'gaeul', text: '요마 MKII. 저지할 수 없으니, 천사별의 사격에 맡기겠습니다.' },
      { who: 'byeol', text: '……네. 하늘에 있는 건, 놓치지 않을게요.' },
    ],
    after: [
      { who: 'byeol', text: '목표 전부 확인…… 명중이에요.' },
      { who: 'simhae', text: '와, 역시. 학교 다닐 때부터 사격 하나는 끝내줬다니까.' },
      { who: 'gaeul', text: '다음 구역에 리유니온의 중장갑 부대가 진지를 구축하고 있습니다.' },
    ],
  },
  {
    code: '1-4', sanity: 9, name: '철벽', desc: '방어력이 매우 높은 중기갑병. 물리 공격이 잘 통하지 않는다.',
    life: 3, startDp: 14, deployLimit: 8,
    map: ['############', 'R....^^^^^^#', '#^^^.^^^^^^#', '#^^^......^#', '#^^^^^^^^.^#', 'R-.......-.B', '############'],
    waves: [
      { t: 3, enemy: 'shieldguard', count: 2, gap: 4, spawn: 0 },
      { t: 10, enemy: 'soldier', count: 3, gap: 3, spawn: 1 },
      { t: 24, enemy: 'light_armor', count: 2, gap: 5, spawn: 0 },
      { t: 34, enemy: 'caster', count: 2, gap: 4, spawn: 1 },
      { t: 46, enemy: 'heavy', count: 1, spawn: 0 },
      { t: 54, enemy: 'dual', count: 3, gap: 3, spawn: 1 },
      { t: 70, enemy: 'light_armor', count: 2, gap: 4, spawn: 1 },
      { t: 76, enemy: 'heavy', count: 1, spawn: 0 },
      { t: 92, enemy: 'crossbow_l', count: 2, gap: 3, spawn: 0 },
      { t: 96, enemy: 'heavy', count: 1, spawn: 1 },
    ],
    before: [
      { who: 'gaeul', text: '중기갑병. 칼로는 흠집도 안 날 겁니다.' },
      { who: 'iai', text: '…베기 어려운 건, 싫어요.' },
      { who: 'simhae', text: '그럼 제가 오래 붙잡고 있죠. 그동안 아츠로 녹여 주세요.' },
      { text: '[작전 안내] 방어력이 높은 적에게는 캐스터의 마법 공격이 효과적입니다.' },
    ],
    after: [
      { who: 'simhae', text: '어이쿠, 팔이야. 오늘 방송은 쉬어야겠네.' },
      { who: 'gaeul', text: '그 전에 나쁜 소식입니다. 이 진지를 지휘한 건 리유니온 간부, 「스컬슈레더」입니다.' },
    ],
  },
  {
    code: '1-5', sanity: 12, name: '유탄의 거리', desc: '리유니온 간부 스컬슈레더 출현. 저지하지 않으면 유탄을 퍼붓는다.',
    life: 3, startDp: 15, deployLimit: 8,
    map: ['#############', '#^^^^^^^^^^^#', 'R---.....^^^#', '#^^^^^^^.^^^#', '#^^^.....^^^#', '#^^^.^^^^^^^#', '#^^^.......-B', '#############'],
    waves: [
      { t: 3, enemy: 'mob', count: 3, gap: 3 },
      { t: 14, enemy: 'molotov', count: 2, gap: 4 },
      { t: 26, enemy: 'soldier', count: 3, gap: 2.5 },
      { t: 38, enemy: 'crossbow_l', count: 2, gap: 4 },
      { t: 50, enemy: 'mob', count: 4, gap: 2 },
      { t: 64, enemy: 'skull', count: 1 },
      { t: 70, enemy: 'molotov', count: 2, gap: 5 },
      { t: 80, enemy: 'soldier', count: 3, gap: 4 },
    ],
    before: [
      { name: '스컬슈레더', text: '로도스 아일랜드… 감염자를 위한답시고 감염자를 사냥하는 위선자들!' },
      { who: 'gaeul', text: '저지당하지 않으면 유탄을 쏩니다. 반드시 근접 오퍼레이터로 붙잡아야 합니다.' },
      { who: 'simhae', text: '그럼 제가 붙죠. 그 정도로는 어림없으니까.' },
    ],
    after: [
      { name: '스컬슈레더', text: '크윽… 이걸로 끝이라고 생각하지 마라…!' },
      { who: 'byeol', text: '도, 도망쳤어요……! 쫓아갈까요……?' },
      { who: 'iai', text: '…아니요. 누가 우릴 보고 있어요. 그림자 속에서.' },
    ],
  },
  {
    code: '1-6', sanity: 12, name: '그림자 습격', desc: '크라운슬레이어의 기습. 저지당하면 뒤로 순간이동한다.',
    life: 3, startDp: 15, deployLimit: 8,
    map: ['#############', 'R-......^^^^#', '#^^^^^^.^^^^#', '#^^^^^^.....B', '#^^^^^^.^^^^#', 'R-......^^^^#', '#############'],
    waves: [
      { t: 3, enemy: 'dual', count: 2, gap: 3, spawn: 0 },
      { t: 6, enemy: 'dual', count: 2, gap: 3, spawn: 1 },
      { t: 20, enemy: 'hound_pro', count: 3, gap: 1.5, spawn: 0 },
      { t: 26, enemy: 'crossbow_l', count: 2, gap: 3, spawn: 1 },
      { t: 40, enemy: 'caster_l', count: 2, gap: 4, spawn: 0 },
      { t: 48, enemy: 'drone', count: 3, gap: 2, spawn: 1 },
      { t: 60, enemy: 'crown', count: 1, spawn: 0 },
      { t: 64, enemy: 'dual', count: 3, gap: 3, spawn: 1 },
      { t: 80, enemy: 'hound_pro', count: 4, gap: 1.5, spawn: 0 },
    ],
    before: [
      { name: '크라운슬레이어', text: '…늦었어, 로도스. 너희 지휘관의 목은 내가 가져간다.' },
      { who: 'iai', text: '…빨라요. 저보다는, 아니지만.' },
      { who: 'gaeul', text: '한 번 막아도 뒤로 빠져나갈 겁니다. 뒤쪽에 한 겹 더 방어선을 두세요.' },
    ],
    after: [
      { name: '크라운슬레이어', text: '…칫. 오늘은 여기까지다.' },
      { who: 'iai', text: '…놓쳤어요. 다음엔, 안 놓쳐요.' },
      { name: '아미야', text: '모두 무사해서 다행이에요. 그런데… 근처 감염자 거주지에서 이상한 노랫소리가 들린다는 신고가 들어왔어요.' },
    ],
  },
  {
    code: '1-7', sanity: 15, name: '노래하는 자', desc: '메피스토가 숙주 병사를 치료하고, 파우스트는 저지되지 않은 채 멀리서 쏜다.',
    life: 3, startDp: 16, deployLimit: 8,
    map: ['#############', '#R-....^^^^^#', '#^^^^^.^^^^^#', '#^^.......^^#', '#^^.^^^^^.^^#', '#^^.^^^^^.^^#', '#^^....B....#', '#############'],
    waves: [
      { t: 3, enemy: 'host', count: 3, gap: 3 },
      { t: 16, enemy: 'caster', count: 2, gap: 4 },
      { t: 26, enemy: 'host', count: 4, gap: 2.5 },
      { t: 40, enemy: 'mephisto', count: 1 },
      { t: 44, enemy: 'host', count: 4, gap: 3 },
      { t: 62, enemy: 'faust', count: 1 },
      { t: 68, enemy: 'crossbow_l', count: 2, gap: 4 },
      { t: 80, enemy: 'host', count: 4, gap: 2.5 },
    ],
    before: [
      { name: '메피스토', text: '아아, 로도스 아일랜드! 나의 아이들이 너희를 위해 노래를 불러줄 거야!' },
      { name: '파우스트', text: '…메피스토. 쓸데없는 말은 그만해.' },
      { who: 'gaeul', text: '메피스토가 살아 있는 한 숙주 병사는 계속 회복합니다. 먼저 쓰러뜨려야 합니다.' },
      { who: 'byeol', text: '파우스트는…… 제가 견제할게요. 저지가 안 된다면, 맞히면 되니까요.' },
    ],
    after: [
      { name: '메피스토', text: '…이건 공연의 끝이 아니야. 겨울이 오면, 너희는 얼어붙을 거라고.' },
      { who: 'simhae', text: '어? 갑자기 왜 이렇게 추워.' },
      { who: 'iai', text: '눈… 이에요. 이 계절에.' },
    ],
  },
  {
    code: '1-8', sanity: 18, name: '겨울의 등대', desc: '프로스트노바와 눈의 악마 소대. 첫 사망 시 부활하니 끝까지 버텨라.',
    life: 3, startDp: 22, deployLimit: 8,
    map: ['##############', 'R-.....^^^^^^#', '#^^^^^.^^^^^^#', '#^^^^^......^#', '#^^^^^^^^^^.^#', '#^.........-^#', '#^.^^^^^^^^^^#', '#B...........R', '##############'],
    waves: [
      { t: 10, enemy: 'frostfang', count: 2, gap: 2, spawn: 1 },
      { t: 14, enemy: 'yeti', count: 3, gap: 3, spawn: 0 },
      { t: 24, enemy: 'yeti_sniper', count: 2, gap: 4, spawn: 1 },
      { t: 34, enemy: 'yeti_caster', count: 2, gap: 5, spawn: 0 },
      { t: 46, enemy: 'frostfang', count: 4, gap: 1.5, spawn: 1 },
      { t: 58, enemy: 'sarkaz', count: 1, spawn: 0 },
      { t: 66, enemy: 'yeti', count: 3, gap: 3, spawn: 1 },
      { t: 80, enemy: 'frostnova', count: 1, spawn: 0 },
      { t: 86, enemy: 'yeti_sniper', count: 2, gap: 4, spawn: 1 },
      { t: 100, enemy: 'yeti', count: 3, gap: 3, spawn: 0 },
      { t: 112, enemy: 'frostfang', count: 4, gap: 1.5, spawn: 1 },
    ],
    before: [
      { name: '프로스트노바', text: '로도스 아일랜드. 너희가 쫓아온 길 끝에는 눈밖에 없다.' },
      { who: 'gaeul', text: '눈의 악마 소대. 그리고 그들의 지도자, 프로스트노바입니다.' },
      { who: 'byeol', text: '박사님…… 손이 떨려요. 추워서 그런 거예요, 정말로요.' },
      { who: 'simhae', text: '괜찮아, 괜찮아. 내 뒤에 있으면 돼. 이름이 괜히 안심해겠어?' },
      { who: 'iai', text: '이 눈보라 속에서도, 등대는 꺼지지 않아요.' },
    ],
    after: [
      { name: '프로스트노바', text: '…따뜻한 불빛이군. 그 불빛이 언제까지 버틸 수 있을지… 지켜보지.' },
      { who: 'gaeul', text: '작전 종료. 행동대 「등대」, 전원 귀환합니다.' },
      { who: 'byeol', text: '박사님, 저희…… 다음 작전도 같이 가는 거죠?' },
      { text: '— EP 01 「잿빛 등대」 끝. (스토리는 data.js에서 자유롭게 바꿀 수 있습니다.)' },
    ],
  },
];

// ---------------------------------------------------------------------
//  아이템 · 구매센터 · 헤드헌팅 (원작 명칭)
// ---------------------------------------------------------------------
const ITEMS = {
  orundum:   { name: '합성옥', short: '합성옥', color: '#e8505b', desc: '헤드헌팅에 사용하는 재화. 600개로 헤드헌팅 1회를 진행할 수 있다.' },
  originite: { name: '오리지늄', short: '오리지늄', color: '#ffcf3a', desc: '오리지늄 결정체. 합성옥 180개로 교환하거나, 이성을 전부 회복할 수 있다.' },
  permit:    { name: '헤드헌팅 허가증', short: '허가증', color: '#f2a541', desc: '헤드헌팅 1회를 진행할 수 있는 허가증.' },
  permit10:  { name: '10회 헤드헌팅 허가증', short: '10회 허가증', color: '#ff7a2f', desc: '헤드헌팅 10회를 한 번에 진행할 수 있는 허가증.' },
  lmd:       { name: '용문폐', short: '용문폐', color: '#cfd3d6', desc: '용문에서 통용되는 화폐. 작전을 완료하면 얻을 수 있다.' },
  cert_hi:   { name: '고급 자격증', short: '고급 자격증', color: '#ffd23a', desc: '5·6성 오퍼레이터의 잠재력이 가득 찬 뒤 중복 획득하면 얻는다.' },
  cert_lo:   { name: '초급 자격증', short: '초급 자격증', color: '#9fd6ff', desc: '3·4성 오퍼레이터를 획득하면 얻는다.' },
};

// 처음 시작할 때 주는 재화
const STARTER_GIFT = { orundum: 6000, permit10: 1, lmd: 10000 };

// 구매센터 상품. price는 표시용(원)이며 실제 결제는 없습니다.
// 「결제 요청」을 보내면 관리자가 승인했을 때 items가 지급됩니다.
const SHOP = {
  originite: [
    { id: 'op1',   name: '오리지늄',  items: { originite: 1 },   price: 1200 },
    { id: 'op6',   name: '오리지늄',  items: { originite: 6 },   price: 6500 },
    { id: 'op20',  name: '오리지늄',  items: { originite: 20 },  price: 19000 },
    { id: 'op40',  name: '오리지늄',  items: { originite: 40 },  price: 38000 },
    { id: 'op66',  name: '오리지늄',  items: { originite: 66 },  price: 65000 },
    { id: 'op130', name: '오리지늄',  items: { originite: 130 }, price: 119000 },
  ],
  packages: [
    { id: 'monthly',  name: '월간 보급 카드',       desc: '오리지늄 6 + 합성옥 6000', items: { originite: 6, orundum: 6000 }, price: 5900 },
    { id: 'newbie',   name: '신규 박사 헤드헌팅 패키지', desc: '10회 헤드헌팅 허가증 1 + 오리지늄 10', items: { permit10: 1, originite: 10 }, price: 19000 },
    { id: 'hh_pack',  name: '헤드헌팅 패키지',       desc: '헤드헌팅 허가증 10 + 합성옥 6000', items: { permit: 10, orundum: 6000 }, price: 32000 },
    { id: 'big_pack', name: '정예 박사 패키지',      desc: '10회 헤드헌팅 허가증 3 + 오리지늄 40', items: { permit10: 3, originite: 40 }, price: 99000 },
  ],
};
const ORIGINITE_TO_ORUNDUM = 180;

// 헤드헌팅 확률 (원작 기준). 50회 연속 6성이 없으면 이후 1회마다 6성 확률 +2%
const GACHA = {
  cost: 600,
  rates: { 6: 0.02, 5: 0.08, 4: 0.5, 3: 0.4 },
  pityStart: 50, pityStep: 0.02,
  standardName: '표준 헤드헌팅',
};
