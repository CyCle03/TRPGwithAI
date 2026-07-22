'use strict';

/**
 * 던전 월드 기본 데이터 (MVP: 2개 클래스).
 * 저작권 주의: 룰북 텍스트를 그대로 복제하지 않고 메커니즘/요지만 직접 요약했다.
 */

const STAT_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

// 능력치 직접 배분 시 사용하는 표준 배열(보정치). 6칸에 하나씩 배치.
const STANDARD_ARRAY = [2, 1, 1, 0, -1, -1];

/**
 * 던전 월드 기본 8직업. 무기/방어구/추가장비를 그룹별로 선택한다(던전 월드식).
 * 방어구는 선택한 옵션의 armor 값으로 캐릭터 방어구가 결정된다.
 * stats 추천은 표준 배열(2,1,1,0,-1,-1)을 직업별로 배치한 것.
 */
const CLASSES = {
  fighter: {
    id: 'fighter', name: '전사', damageDie: 10, maxHp: 22,
    description: '근접 전투의 달인. 튼튼하고 강력한 일격을 자랑한다.',
    stats: { STR: 2, DEX: 1, CON: 1, INT: -1, WIS: 0, CHA: -1 },
    baseGear: ['던전 배낭', '여행 식량 5일분'],
    gearChoices: [
      { id: 'weapon', label: '주무기', options: [
        { id: 'sword', name: '장검(균형 잡힌)' },
        { id: 'axe', name: '전투 도끼(강력한)' },
        { id: 'hammer', name: '워해머(둔중하나 묵직한)' } ] },
      { id: 'armor', label: '방어구', options: [
        { id: 'chain_shield', name: '사슬 갑옷 + 방패 (방어구 2)', armor: 2 },
        { id: 'plate', name: '판금 갑옷 (방어구 2, 둔중)', armor: 2 },
        { id: 'leather_shield', name: '가죽 갑옷 + 방패 (방어구 1, 기민)', armor: 1 } ] },
      { id: 'kit', label: '추가 장비', options: [
        { id: 'potion', name: '치유 물약' },
        { id: 'throwing', name: '투척용 단검 3자루' },
        { id: 'rope', name: '밧줄과 갈고리' } ] },
    ],
  },
  wizard: {
    id: 'wizard', name: '마법사', damageDie: 4, maxHp: 16,
    description: '주문을 다루는 학자. 몸은 약하지만 지식과 마법이 무기다.',
    stats: { STR: -1, DEX: 0, CON: 1, INT: 2, WIS: 1, CHA: -1 },
    baseGear: ['주문서', '여행 식량 5일분'],
    gearChoices: [
      { id: 'weapon', label: '주무기', options: [
        { id: 'staff', name: '지팡이(원거리 마력)' },
        { id: 'dagger', name: '단검(호신용)' } ] },
      { id: 'armor', label: '방어구', options: [
        { id: 'robe', name: '마법사 로브 (방어구 0)', armor: 0 },
        { id: 'leather', name: '가죽 갑옷 (방어구 1, 거추장)', armor: 1 } ] },
      { id: 'kit', label: '추가 장비', options: [
        { id: 'materials', name: '마법 재료 주머니' },
        { id: 'book', name: '고대 지식의 책' },
        { id: 'potion', name: '치유 물약' } ] },
    ],
  },
  cleric: {
    id: 'cleric', name: '성직자', damageDie: 6, maxHp: 20,
    description: '신을 섬기는 사제. 치유와 신성한 힘으로 동료를 지킨다.',
    stats: { STR: 1, DEX: -1, CON: 1, INT: 0, WIS: 2, CHA: -1 },
    baseGear: ['성징(신앙의 상징)', '여행 식량 5일분'],
    gearChoices: [
      { id: 'weapon', label: '주무기', options: [
        { id: 'mace', name: '철퇴' },
        { id: 'hammer', name: '전투 망치' } ] },
      { id: 'armor', label: '방어구', options: [
        { id: 'chain', name: '사슬 갑옷 (방어구 1)', armor: 1 },
        { id: 'leather_shield', name: '가죽 갑옷 + 나무 방패 (방어구 1)', armor: 1 },
        { id: 'robe', name: '사제복 (방어구 0)', armor: 0 } ] },
      { id: 'kit', label: '추가 장비', options: [
        { id: 'holy_water', name: '성수 한 병' },
        { id: 'herbs', name: '치유 약초' },
        { id: 'bandages', name: '붕대' } ] },
    ],
  },
  thief: {
    id: 'thief', name: '도적', damageDie: 8, maxHp: 18,
    description: '그림자 속의 전문가. 은신·기습·함정 해제에 능하다.',
    stats: { STR: -1, DEX: 2, CON: 0, INT: 1, WIS: 1, CHA: -1 },
    baseGear: ['도둑 도구', '여행 식량 5일분'],
    gearChoices: [
      { id: 'weapon', label: '주무기', options: [
        { id: 'daggers', name: '단검 두 자루' },
        { id: 'short_sword', name: '짧은 검' },
        { id: 'crossbow', name: '손 석궁' } ] },
      { id: 'armor', label: '방어구', options: [
        { id: 'leather', name: '가죽 갑옷 (방어구 1)', armor: 1 },
        { id: 'cloak', name: '어둠의 망토 (방어구 0, 은밀)', armor: 0 } ] },
      { id: 'kit', label: '추가 장비', options: [
        { id: 'poison', name: '독 묻은 침 3개' },
        { id: 'smoke', name: '연막탄' },
        { id: 'lockpicks', name: '정교한 자물쇠 도구' } ] },
    ],
  },
  ranger: {
    id: 'ranger', name: '레인저', damageDie: 8, maxHp: 18,
    description: '야생의 사냥꾼. 활과 추적술, 동물 동료로 싸운다.',
    stats: { STR: 0, DEX: 2, CON: 1, INT: -1, WIS: 1, CHA: -1 },
    baseGear: ['사냥 도구', '여행 식량 5일분'],
    gearChoices: [
      { id: 'weapon', label: '주무기', options: [
        { id: 'bow', name: '장궁과 화살통' },
        { id: 'crossbow', name: '석궁' },
        { id: 'spear', name: '창' } ] },
      { id: 'armor', label: '방어구', options: [
        { id: 'leather', name: '가죽 갑옷 (방어구 1)', armor: 1 },
        { id: 'light', name: '가벼운 차림 (방어구 0, 민첩)', armor: 0 } ] },
      { id: 'kit', label: '추가 장비', options: [
        { id: 'trap', name: '사냥 덫' },
        { id: 'falcon', name: '훈련된 매' },
        { id: 'rations', name: '추가 식량' } ] },
    ],
  },
  bard: {
    id: 'bard', name: '음유시인', damageDie: 6, maxHp: 18,
    description: '이야기와 노래의 명인. 매혹과 전승 지식으로 상황을 이끈다.',
    stats: { STR: -1, DEX: 1, CON: 0, INT: 1, WIS: -1, CHA: 2 },
    baseGear: ['악기', '여행 식량 5일분'],
    gearChoices: [
      { id: 'weapon', label: '주무기', options: [
        { id: 'rapier', name: '세검' },
        { id: 'dagger', name: '단검' },
        { id: 'sling', name: '투석구' } ] },
      { id: 'armor', label: '방어구', options: [
        { id: 'leather', name: '가죽 갑옷 (방어구 1)', armor: 1 },
        { id: 'fine', name: '화려한 의복 (방어구 0)', armor: 0 } ] },
      { id: 'kit', label: '추가 장비', options: [
        { id: 'trinket', name: '값진 장신구' },
        { id: 'scroll', name: '전설이 적힌 두루마리' },
        { id: 'coins', name: '두둑한 동전 주머니' } ] },
    ],
  },
  paladin: {
    id: 'paladin', name: '성기사', damageDie: 10, maxHp: 22,
    description: '맹세로 무장한 성전사. 신앙과 강철로 악을 응징한다.',
    stats: { STR: 2, DEX: -1, CON: 1, INT: -1, WIS: 0, CHA: 1 },
    baseGear: ['성징', '여행 식량 5일분'],
    gearChoices: [
      { id: 'weapon', label: '주무기', options: [
        { id: 'sword', name: '대검' },
        { id: 'hammer', name: '전투 망치' },
        { id: 'lance', name: '창' } ] },
      { id: 'armor', label: '방어구', options: [
        { id: 'plate_shield', name: '판금 갑옷 + 방패 (방어구 3)', armor: 3 },
        { id: 'chain_shield', name: '사슬 갑옷 + 방패 (방어구 2)', armor: 2 } ] },
      { id: 'kit', label: '추가 장비', options: [
        { id: 'banner', name: '성전의 깃발' },
        { id: 'relic', name: '성유물' },
        { id: 'potion', name: '치유 물약' } ] },
    ],
  },
  druid: {
    id: 'druid', name: '드루이드', damageDie: 6, maxHp: 18,
    description: '자연의 대변자. 야수로 변신하고 자연의 힘을 부린다.',
    stats: { STR: 0, DEX: 1, CON: 1, INT: -1, WIS: 2, CHA: -1 },
    baseGear: ['자연의 징표', '여행 식량 5일분'],
    gearChoices: [
      { id: 'weapon', label: '주무기', options: [
        { id: 'staff', name: '지팡이' },
        { id: 'sickle', name: '낫' },
        { id: 'sling', name: '투석구' } ] },
      { id: 'armor', label: '방어구', options: [
        { id: 'hide', name: '가죽 갑옷 (방어구 1)', armor: 1 },
        { id: 'robe', name: '자연의 의복 (방어구 0)', armor: 0 } ] },
      { id: 'kit', label: '추가 장비', options: [
        { id: 'herbs', name: '희귀 약초 표본' },
        { id: 'totem', name: '토템' },
        { id: 'seeds', name: '마법의 씨앗' } ] },
    ],
  },
};

/** 클래스별 습득 가능한 상위 무브 (레벨업 시 택1). 직접 재작성한 요지. */
const ADVANCED_MOVES = {
  fighter: [
    { id: 'f_bash', name: '강타', desc: '손상 입히기에서 10+가 나오면 추가로 적을 넘어뜨리거나 밀쳐낸다.' },
    { id: 'f_endure', name: '불굴', desc: '세션당 1회, STR/CON 위험에 맞서기에서 6-가 나와도 쓰러지지 않고 버틴다.' },
    { id: 'f_master', name: '무기 숙련', desc: '애용하는 무기로 공격할 때 피해 주사위에 +1.' },
    { id: 'f_cleave', name: '휩쓸기', desc: '여러 적에 둘러싸였을 때 한 번의 공격으로 두 적을 노릴 수 있다.' },
  ],
  wizard: [
    { id: 'w_focus', name: '마력 집중', desc: '주문 판정에서 10+가 나오면 그 주문을 대가 없이 유지한다.' },
    { id: 'w_ritual', name: '의식 마법', desc: '시간과 재료를 들여 평소보다 강력한 마법 효과를 준비할 수 있다.' },
    { id: 'w_ward', name: '반사 방어', desc: '마법적 위협에 맞설 때 DEX 대신 INT로 위험에 맞서기를 할 수 있다.' },
    { id: 'w_bolt', name: '비전 화살', desc: '단순한 마력 탄을 쏘는 신뢰할 만한 원거리 공격 수단을 얻는다(INT).' },
  ],
  cleric: [
    { id: 'c_heal', name: '치유의 기도', desc: '신에게 기원해 대상의 부상을 회복시킨다(WIS).' },
    { id: 'c_smite', name: '신성한 응징', desc: '신앙의 힘을 담아 적을 내리쳐 추가 피해를 준다.' },
    { id: 'c_bless', name: '축복', desc: '대상에게 신의 가호를 내려 다음 위험을 덜어준다.' },
    { id: 'c_turn', name: '언데드 퇴치', desc: '신성한 기운으로 언데드를 물리치거나 붙잡아 둔다.' },
  ],
  thief: [
    { id: 't_backstab', name: '급습', desc: '방심하거나 무방비한 적을 기습해 큰 피해를 준다(DEX).' },
    { id: 't_trap', name: '함정 감각', desc: '함정과 장치를 찾아내고 무력화한다(DEX).' },
    { id: 't_pick', name: '자물쇠 따기', desc: '잠긴 문과 상자를 소리 없이 연다(DEX).' },
    { id: 't_sleight', name: '손속임', desc: '소매치기나 눈속임으로 물건을 몰래 다룬다(DEX).' },
  ],
  ranger: [
    { id: 'r_pet', name: '동물 동료', desc: '훈련된 야수 동료와 함께 싸우고 정찰한다.' },
    { id: 'r_track', name: '추적', desc: '흔적을 읽어 대상의 행방과 상태를 알아낸다(WIS).' },
    { id: 'r_aim', name: '정조준', desc: '시간을 들여 겨누면 원거리 공격의 위력이 커진다(DEX).' },
    { id: 'r_camo', name: '위장', desc: '자연 지형에 몸을 숨겨 은신한다(DEX).' },
  ],
  bard: [
    { id: 'b_charm', name: '매혹의 선율', desc: '공연과 연주로 상대의 태도를 누그러뜨린다(CHA).' },
    { id: 'b_lore', name: '전승 지식', desc: '유명한 대상에 대해 알고 있는 사실을 하나 떠올린다.' },
    { id: 'b_inspire', name: '격려', desc: '동료나 자신에게 다음 판정에 도움이 되는 사기를 북돋운다.' },
    { id: 'b_counter', name: '날카로운 재담', desc: '말로 상대를 흔들어 빈틈을 만든다(CHA).' },
  ],
  paladin: [
    { id: 'p_lay', name: '안수', desc: '손을 얹어 신앙의 힘으로 상처를 치유한다.' },
    { id: 'p_quest', name: '성전 서약', desc: '목표를 정해 맹세하면 그에 관한 판정에 힘이 실린다.' },
    { id: 'p_aura', name: '수호의 기운', desc: '주변 아군이 받는 위협을 대신 짊어진다.' },
    { id: 'p_smite', name: '신성 강타', desc: '사악한 적에게 신성한 힘으로 추가 피해를 입힌다.' },
  ],
  druid: [
    { id: 'd_shape', name: '야수 변신', desc: '익숙한 동물의 형상으로 변해 그 능력을 얻는다.' },
    { id: 'd_speak', name: '자연과의 교감', desc: '동식물이나 정령과 소통해 정보를 얻는다(WIS).' },
    { id: 'd_thorn', name: '얽매는 덩굴', desc: '주변 식물을 조종해 적을 붙잡는다.' },
    { id: 'd_weather', name: '자연 예지', desc: '자연의 징후를 읽어 앞일을 예측하거나 유리하게 이용한다.' },
  ],
};

const HP_PER_LEVEL = 3; // 레벨업 시 최대 HP 증가량 (단순화 규칙)
const STAT_CAP = 3; // 능력치 보정 상한

/** 클래스의 무기/방어구/추가장비 선택 그룹을 반환. */
function getGearChoices(classId) {
  const cls = CLASSES[classId] || CLASSES.fighter;
  return cls.gearChoices || [];
}

/** 레벨업 임계값: 현재 레벨 + 7 (던전 월드 방식). */
function xpToLevel(level) {
  return level + 7;
}

/** 현재 레벨업 선택지(개선 가능한 능력치 + 미습득 무브)를 반환. */
function getLevelUpOptions(character) {
  const owned = new Set((character.moves || []).map((m) => m.id));
  const moves = (ADVANCED_MOVES[character.classId] || []).filter((m) => !owned.has(m.id));
  const stats = STAT_KEYS.map((k) => ({
    key: k,
    value: character.stats[k],
    canImprove: character.stats[k] < STAT_CAP,
  }));
  return { threshold: xpToLevel(character.level), stats, moves };
}

/**
 * 레벨업을 적용한다(캐릭터 mutate). 검증은 여기서 수행.
 * @returns {object|null} 적용 요약, 조건 미달이면 null
 */
function applyLevelUp(character, { ability, moveId }) {
  const threshold = xpToLevel(character.level);
  if (character.xp < threshold) return null;

  character.xp -= threshold;
  character.level += 1;
  character.maxHp += HP_PER_LEVEL;
  character.hp += HP_PER_LEVEL; // 새 최대치만큼 현재 HP도 증가(완전 회복은 아님)

  const summary = { level: character.level, statUp: null, move: null };

  if (STAT_KEYS.includes(ability) && character.stats[ability] < STAT_CAP) {
    character.stats[ability] += 1;
    summary.statUp = ability;
  }

  const pool = ADVANCED_MOVES[character.classId] || [];
  const owned = new Set((character.moves || []).map((m) => m.id));
  const chosen = pool.find((m) => m.id === moveId && !owned.has(m.id));
  if (chosen) {
    character.moves = character.moves || [];
    character.moves.push(chosen);
    summary.move = chosen;
  }

  return summary;
}

/**
 * AI GM 프롬프트에 넣을 기본 무브 요약 (직접 재작성한 요지).
 * GM은 플레이어의 자유서술을 이 무브 중 하나로 해석하고, 어떤 능력치를 쓸지 판단한다.
 */
const MOVES_SUMMARY = `던전 월드 판정 규칙 요지 (원문 아님, 요약):
- 판정은 2d6 + 해당 능력치 보정으로 굴린다. 10+ = 완전 성공, 7-9 = 대가/조건이 따르는 성공, 6- = 실패하며 상황이 나빠진다.
- 위험에 맞서기(Defy Danger): 위험을 무릅쓰고 행동. 상황에 맞는 능력치 사용 — 민첩한 회피/은신은 DEX, 힘으로 버티기는 STR, 인내는 CON, 재빠른 판단은 INT, 침착함은 WIS, 배짱은 CHA.
- 손상 입히기(Hack & Slash): 근접 백병전으로 적을 공격. STR. 성공해도 적의 반격을 받을 수 있다.
- 정밀 사격(Volley): 원거리 무기로 공격. DEX.
- 위험 감지(Discern Realities): 주변을 유심히 관찰해 단서를 얻는다. WIS.
- 설득/교섭(Parley): 상대를 지렛대(leverage)로 움직인다. CHA.
- 근력 행사(Defy/힘쓰기): 무거운 것을 들거나 부수는 등 순수 힘. STR.
- 전투에서 피해를 입으면 코드가 HP를 깎는다. 갑옷(armor)은 받는 피해를 줄인다.`;

/** 배분된 stats가 표준 배열의 유효한 배치인지 검증(값의 다중집합 일치). */
function isValidStatArray(stats) {
  if (!stats || typeof stats !== 'object') return false;
  const vals = STAT_KEYS.map((k) => stats[k]);
  if (vals.some((v) => !Number.isInteger(v))) return false;
  const a = [...vals].sort((x, y) => x - y).join(',');
  const b = [...STANDARD_ARRAY].sort((x, y) => x - y).join(',');
  return a === b;
}

/**
 * 클래스 프리셋으로 새 캐릭터 상태 객체를 만든다.
 * @param {string} name
 * @param {string} classId
 * @param {object} [opts] { stats?: 직접 배분한 보정치, look?: 한 줄 소개,
 *                          choices?: {groupId: optionId} 무기/방어구/장비 선택 }
 */
function createCharacter(name, classId, opts = {}) {
  const cls = CLASSES[classId] || CLASSES.fighter;
  // 직접 배분한 stats가 유효하면 사용, 아니면 프리셋
  const stats = isValidStatArray(opts.stats)
    ? Object.fromEntries(STAT_KEYS.map((k) => [k, opts.stats[k]]))
    : { ...cls.stats };
  // 무기/방어구/장비 선택 적용 (그룹별 1개, 없으면 첫 옵션 기본). 방어구는 armor 합산.
  const choices = opts.choices || {};
  const chosenNames = [];
  let armor = 0;
  for (const group of cls.gearChoices || []) {
    const picked = group.options.find((o) => o.id === choices[group.id]) || group.options[0];
    if (picked) {
      chosenNames.push(picked.name);
      if (typeof picked.armor === 'number') armor += picked.armor;
    }
  }
  return {
    name: String(name || '이름 없는 모험가').slice(0, 40),
    classId: cls.id,
    className: cls.name,
    look: String(opts.look || '').slice(0, 200),
    level: 1,
    xp: 0,
    maxHp: cls.maxHp,
    hp: cls.maxHp,
    armor,
    stats,
    inventory: [...cls.baseGear, ...chosenNames],
    moves: [],
    damageDie: cls.damageDie,
  };
}

/** 저장본에서 불러온 오래된 캐릭터에 신규 필드(level/xp/moves)를 보정. */
function ensureCharacterFields(character) {
  if (!character) return character;
  if (typeof character.level !== 'number') character.level = 1;
  if (typeof character.xp !== 'number') character.xp = 0;
  if (!Array.isArray(character.moves)) character.moves = [];
  return character;
}

function listClasses() {
  return Object.values(CLASSES).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    maxHp: c.maxHp,
    damageDie: c.damageDie,
    stats: c.stats,
    baseGear: c.baseGear, // 기본(고정) 장비
    gearChoices: c.gearChoices, // 무기/방어구/장비 선택 그룹
    moves: ADVANCED_MOVES[c.id] || [], // 배울 수 있는 기술 (전체 {id,name,desc})
  }));
}

module.exports = {
  CLASSES,
  STAT_KEYS,
  STANDARD_ARRAY,
  MOVES_SUMMARY,
  ADVANCED_MOVES,
  createCharacter,
  ensureCharacterFields,
  isValidStatArray,
  getGearChoices,
  listClasses,
  xpToLevel,
  getLevelUpOptions,
  applyLevelUp,
};
