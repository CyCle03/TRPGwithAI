'use strict';

/**
 * 규칙 엔진 (코드) — 던전 월드 메커니즘의 단일 원천(source of truth).
 * 주사위 굴림, 2d6 판정 계산, 상태(HP/인벤토리 등) 변경 검증을 담당한다.
 * LLM은 여기에 "요청"만 하고, 실제 난수/계산/상태는 이 모듈이 결정한다.
 */

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** 서버에서 주사위 하나를 굴린다 (1..sides). */
function rollDie(sides = 6) {
  return Math.floor(Math.random() * sides) + 1;
}

/** n개의 주사위를 굴려 배열로 반환. */
function rollDice(n = 2, sides = 6) {
  const dice = [];
  for (let i = 0; i < n; i++) dice.push(rollDie(sides));
  return dice;
}

/**
 * 판정 구간 결정: 2d6 + 보정 → 10+ / 7-9 / 6-.
 * @returns {'strong'|'weak'|'miss'}
 */
function classifyTotal(total) {
  if (total >= 10) return 'strong';
  if (total >= 7) return 'weak';
  return 'miss';
}

const TIER_LABEL = {
  strong: '완전 성공 (10+)',
  weak: '대가가 있는 성공 (7-9)',
  miss: '실패와 악화 (6-)',
};

/**
 * 무브 판정을 수행한다. 반드시 서버에서 호출.
 * @param {string} stat  능력치 키 (STR..CHA). 유효하지 않으면 보정 0.
 * @param {object} character  현재 캐릭터 상태 (보정치 조회용)
 * @returns {object} 구조화된 판정 결과
 */
function resolveMove(stat, character) {
  const key = ABILITIES.includes(stat) ? stat : null;
  const mod = key ? (character.stats?.[key] ?? 0) : 0;
  const dice = rollDice(2, 6);
  const diceSum = dice[0] + dice[1];
  const total = diceSum + mod;
  const tier = classifyTotal(total);
  return {
    stat: key,
    mod,
    dice,
    diceSum,
    total,
    tier,
    tierLabel: TIER_LABEL[tier],
  };
}

/** 판정 결과를 로그/서사용 한 줄 문자열로 포맷. 예: 🎲 2d6+1 = [4,5]+1 = 10 → 완전 성공 (10+) */
function formatRoll(result) {
  const sign = result.mod >= 0 ? `+${result.mod}` : `${result.mod}`;
  const statPart = result.stat ? ` (${result.stat})` : '';
  return `🎲 2d6${sign}${statPart} = [${result.dice.join(',')}]${sign} = ${result.total} → ${result.tierLabel}`;
}

/**
 * 상태 변경을 검증 후 캐릭터에 반영한다. 캐릭터 객체를 직접 변경(mutate)한다.
 * LLM이 말한 값이 아니라, 여기서 클램프/검증한 값만 상태가 된다.
 * @returns {object} 실제 적용된 변경 요약 (로그용)
 */
function applyStateUpdate(character, action) {
  const applied = { hpDelta: 0, added: [], removed: [] };

  // HP 변경 (음수=피해, 양수=회복). 0..maxHp 범위로 클램프.
  if (typeof action.hpDelta === 'number' && action.hpDelta !== 0) {
    const before = character.hp;
    const after = clamp(character.hp + action.hpDelta, 0, character.maxHp);
    character.hp = after;
    applied.hpDelta = after - before;
  }

  // 아이템 획득
  if (Array.isArray(action.addItems)) {
    for (const raw of action.addItems) {
      const item = String(raw || '').trim();
      if (item) {
        character.inventory.push(item);
        applied.added.push(item);
      }
    }
  }

  // 아이템 소모/제거 (첫 일치 항목 1개 제거)
  if (Array.isArray(action.removeItems)) {
    for (const raw of action.removeItems) {
      const item = String(raw || '').trim();
      if (!item) continue;
      const idx = character.inventory.findIndex(
        (i) => i.toLowerCase() === item.toLowerCase()
      );
      if (idx !== -1) {
        applied.removed.push(character.inventory[idx]);
        character.inventory.splice(idx, 1);
      }
    }
  }

  return applied;
}

/** 적용된 상태 변경을 사람이 읽을 로그 문자열로. 변경 없으면 null. */
function formatStateChange(applied) {
  const parts = [];
  if (applied.hpDelta < 0) parts.push(`HP ${applied.hpDelta}`);
  if (applied.hpDelta > 0) parts.push(`HP +${applied.hpDelta}`);
  if (applied.added.length) parts.push(`획득: ${applied.added.join(', ')}`);
  if (applied.removed.length) parts.push(`소모: ${applied.removed.join(', ')}`);
  return parts.length ? `📋 ${parts.join(' · ')}` : null;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

module.exports = {
  ABILITIES,
  rollDice,
  resolveMove,
  classifyTotal,
  applyStateUpdate,
  formatRoll,
  formatStateChange,
  TIER_LABEL,
};
