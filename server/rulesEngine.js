'use strict';

/**
 * 규칙 엔진 (코드) — 던전 월드 메커니즘의 단일 원천(source of truth).
 * 주사위 굴림, 2d6 판정 계산, 상태(HP/인벤토리 등) 변경 검증을 담당한다.
 * LLM은 여기에 "요청"만 하고, 실제 난수/계산/상태는 이 모듈이 결정한다.
 */

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

// ---------- 인벤토리 수량(스택) 처리 ----------
// 아이템은 "이름" 또는 "이름 ×N" 문자열로 저장한다. 같은 이름은 개수로 합친다.
const QTY_RE = /^(.*?)\s*[×xX]\s*(\d+)\s*$/;

/** "치유 물약 ×3" → { base:'치유 물약', qty:3 }. 수량 없으면 qty:1. */
function parseItem(str) {
  const s = String(str || '').trim();
  const m = s.match(QTY_RE);
  if (m) return { base: m[1].trim(), qty: Math.max(1, parseInt(m[2], 10) || 1) };
  return { base: s, qty: 1 };
}

/** base/qty → 표시 문자열. qty>1이면 "이름 ×N". */
function formatItem(base, qty) {
  return qty > 1 ? `${base} ×${qty}` : base;
}

/** 인벤토리에서 같은 이름(대소문자 무시) 항목 인덱스. */
function findItemIndex(inventory, base) {
  const key = base.toLowerCase();
  return inventory.findIndex((i) => parseItem(i).base.toLowerCase() === key);
}

/** 인벤토리에 아이템을 수량만큼 추가(같은 이름은 합침). @returns 추가 로그 문자열 */
function addItem(inventory, rawName, addQty = 1) {
  const { base, qty } = parseItem(rawName);
  const n = qty * Math.max(1, addQty);
  const idx = findItemIndex(inventory, base);
  if (idx === -1) {
    inventory.push(formatItem(base, n));
  } else {
    const cur = parseItem(inventory[idx]);
    inventory[idx] = formatItem(cur.base, cur.qty + n);
  }
  return n > 1 ? `${base} ×${n}` : base;
}

/** 인벤토리에서 아이템을 수량만큼 제거(0이 되면 삭제). @returns 제거 로그 문자열 또는 null */
function removeItem(inventory, rawName, remQty = 1) {
  const { base, qty } = parseItem(rawName);
  const n = qty * Math.max(1, remQty);
  const idx = findItemIndex(inventory, base);
  if (idx === -1) return null;
  const cur = parseItem(inventory[idx]);
  const left = cur.qty - n;
  if (left > 0) {
    inventory[idx] = formatItem(cur.base, left);
  } else {
    inventory.splice(idx, 1);
  }
  return n > 1 ? `${cur.base} ×${Math.min(n, cur.qty)}` : cur.base;
}

/** 기존 인벤토리(중복 문자열 다수)를 이름별 수량으로 합쳐 정규화. 저장본 정리에 사용. */
function normalizeInventory(inventory) {
  if (!Array.isArray(inventory)) return [];
  const merged = [];
  for (const raw of inventory) addItem(merged, raw, 1);
  return merged;
}

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
  const applied = { hpDelta: 0, added: [], removed: [], rawDamage: null, armorBlocked: 0, coinDelta: 0 };

  // HP 변경. 피해(음수)는 방어구만큼 자동 차감(던전 월드 규칙), 회복(양수)은 그대로.
  if (typeof action.hpDelta === 'number' && action.hpDelta !== 0) {
    const before = character.hp;
    if (action.hpDelta < 0) {
      const raw = -action.hpDelta; // 방어구 적용 전 원피해
      const armor = character.armor || 0;
      const blocked = Math.min(raw, armor);
      const dealt = raw - blocked; // max(0, raw - armor)
      character.hp = clamp(character.hp - dealt, 0, character.maxHp);
      applied.hpDelta = character.hp - before; // 음수 또는 0
      applied.rawDamage = raw;
      applied.armorBlocked = blocked;
    } else {
      character.hp = clamp(character.hp + action.hpDelta, 0, character.maxHp);
      applied.hpDelta = character.hp - before;
    }
  }

  // 소지금(coin) 변경. 정수 델타(획득 +, 소모 −). 0 미만으로 내려가지 않음.
  if (typeof action.coinDelta === 'number' && action.coinDelta !== 0) {
    const before = character.coin || 0;
    character.coin = Math.max(0, before + Math.trunc(action.coinDelta));
    applied.coinDelta = character.coin - before;
  }

  // 아이템 획득 (같은 이름은 수량으로 합침)
  if (Array.isArray(action.addItems)) {
    for (const raw of action.addItems) {
      const item = String(raw || '').trim();
      if (item) applied.added.push(addItem(character.inventory, item, 1));
    }
  }

  // 아이템 소모/제거 (수량 차감, 0이면 삭제)
  if (Array.isArray(action.removeItems)) {
    for (const raw of action.removeItems) {
      const item = String(raw || '').trim();
      if (!item) continue;
      const removed = removeItem(character.inventory, item, 1);
      if (removed) applied.removed.push(removed);
    }
  }

  return applied;
}

/** 적용된 상태 변경을 사람이 읽을 로그 문자열로. 변경 없으면 null. */
function formatStateChange(applied) {
  const parts = [];
  if (applied.rawDamage != null) {
    // 피해: 방어구 차감 계산을 투명하게 표시
    if (applied.hpDelta < 0) {
      parts.push(`HP ${applied.hpDelta} (피해 ${applied.rawDamage} − 방어구 ${applied.armorBlocked})`);
    } else {
      parts.push(`방어구가 피해 ${applied.rawDamage}을(를) 모두 막음`);
    }
  } else if (applied.hpDelta > 0) {
    parts.push(`HP +${applied.hpDelta} (회복)`);
  }
  if (applied.coinDelta) {
    parts.push(applied.coinDelta > 0 ? `💰 +${applied.coinDelta} coin` : `💰 ${applied.coinDelta} coin`);
  }
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
  normalizeInventory,
  TIER_LABEL,
};
