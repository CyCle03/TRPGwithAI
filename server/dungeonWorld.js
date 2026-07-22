'use strict';

/**
 * 던전 월드 기본 데이터 (MVP: 2개 클래스).
 * 저작권 주의: 룰북 텍스트를 그대로 복제하지 않고 메커니즘/요지만 직접 요약했다.
 */

const STAT_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** 클래스 프리셋. stats 값은 능력치 "보정치"(-1~+2)를 직접 저장한다. */
const CLASSES = {
  fighter: {
    id: 'fighter',
    name: '전사',
    description: '근접 전투의 달인. 튼튼하고 강력한 일격을 자랑한다.',
    maxHp: 22,
    armor: 1,
    stats: { STR: 2, DEX: 1, CON: 2, INT: -1, WIS: 0, CHA: 1 },
    inventory: ['장검', '사슬 갑옷', '방패', '여행 식량 5일분', '동전 몇 닢'],
    damageDie: 10,
  },
  wizard: {
    id: 'wizard',
    name: '마법사',
    description: '주문을 다루는 학자. 몸은 약하지만 지식과 마법이 무기다.',
    maxHp: 16,
    armor: 0,
    stats: { STR: -1, DEX: 0, CON: 1, INT: 2, WIS: 1, CHA: 0 },
    inventory: ['지팡이', '주문서', '단검', '여행 식량 5일분', '동전 몇 닢'],
    damageDie: 4,
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
};

const HP_PER_LEVEL = 3; // 레벨업 시 최대 HP 증가량 (단순화 규칙)
const STAT_CAP = 3; // 능력치 보정 상한

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

/** 클래스 프리셋으로 새 캐릭터 상태 객체를 만든다. */
function createCharacter(name, classId) {
  const cls = CLASSES[classId] || CLASSES.fighter;
  return {
    name: String(name || '이름 없는 모험가').slice(0, 40),
    classId: cls.id,
    className: cls.name,
    level: 1,
    xp: 0,
    maxHp: cls.maxHp,
    hp: cls.maxHp,
    armor: cls.armor,
    stats: { ...cls.stats },
    inventory: [...cls.inventory],
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
    stats: c.stats,
  }));
}

module.exports = {
  CLASSES,
  MOVES_SUMMARY,
  ADVANCED_MOVES,
  createCharacter,
  ensureCharacterFields,
  listClasses,
  xpToLevel,
  getLevelUpOptions,
  applyLevelUp,
};
