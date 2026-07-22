'use strict';

/**
 * 던전 월드 기본 데이터 (MVP: 2개 클래스).
 * 저작권 주의: 룰북 텍스트를 그대로 복제하지 않고 메커니즘/요지만 직접 요약했다.
 */

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
    maxHp: cls.maxHp,
    hp: cls.maxHp,
    armor: cls.armor,
    stats: { ...cls.stats },
    inventory: [...cls.inventory],
    damageDie: cls.damageDie,
  };
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

module.exports = { CLASSES, MOVES_SUMMARY, createCharacter, listClasses };
