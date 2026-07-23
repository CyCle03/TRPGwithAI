'use strict';

/**
 * 캐릭터 챗 / 세계관(월드) 롤플레이 도우미.
 * 규칙엔진/주사위 없이, 사용자가 정의한 세계관·캐릭터로 시스템 프롬프트를 만든다.
 *
 * def(정의) = 공유 가능한 단위(추후 퍼블리시). 대화(messages)와 분리해 관리한다.
 *   { worldTitle, worldLore, characters:[{name,description}], scenario, greeting, userPersona }
 * 캐릭터가 1명이면 단일 캐릭터 챗, 여러 명이면 내레이터가 전원을 연기하는 월드 모드.
 */

const MAX_CHAT_HISTORY = 30; // API에 보내는 최근 메시지 수
const MAX_CHARACTERS = 8;

/** 정의 입력 정규화(길이 제한). 최소 1명의 이름 있는 캐릭터가 필요. */
function normalizeDef(raw) {
  const d = raw || {};
  let characters = Array.isArray(d.characters) ? d.characters : [];
  characters = characters
    .map((c) => ({
      name: String((c && c.name) || '').trim().slice(0, 60),
      description: String((c && c.description) || '').slice(0, 3000),
    }))
    .filter((c) => c.name)
    .slice(0, MAX_CHARACTERS);
  return {
    worldTitle: String(d.worldTitle || '').trim().slice(0, 80),
    worldLore: String(d.worldLore || '').slice(0, 6000),
    characters,
    scenario: String(d.scenario || '').slice(0, 3000),
    greeting: String(d.greeting || '').slice(0, 2000),
    userPersona: String(d.userPersona || '').slice(0, 2000),
  };
}

/** 구버전 단일 persona({name,description,...}) → def 로 변환. */
function migrateDef(chatLike) {
  if (chatLike.def) return chatLike.def;
  const p = chatLike.persona;
  if (p && (p.name || p.description)) {
    const desc = [p.description, p.exampleDialogue ? `예시 대화:\n${p.exampleDialogue}` : '']
      .filter(Boolean)
      .join('\n\n');
    return normalizeDef({
      worldTitle: p.name || '',
      worldLore: '',
      characters: [{ name: p.name || '캐릭터', description: desc }],
      scenario: p.scenario || '',
      greeting: p.greeting || '',
      userPersona: p.userPersona || '',
    });
  }
  return normalizeDef({});
}

/** 정의가 플레이 가능한 상태인지(이름 있는 캐릭터 1명 이상). */
function isConfigured(def) {
  return !!(def && Array.isArray(def.characters) && def.characters.some((c) => c.name));
}

/** 표시명: 월드 제목 > 첫 캐릭터 이름. */
function displayName(def) {
  if (!def) return null;
  if (def.worldTitle) return def.worldTitle;
  const c = (def.characters || []).find((x) => x.name);
  return c ? c.name : null;
}

/** def(사용자 정의)를 시스템 프롬프트 문자열로. 빈 필드는 생략. */
function buildSystemPrompt(def) {
  const d = def || {};
  const chars = (d.characters || []).filter((c) => c.name);
  const multi = chars.length > 1;

  const lines = [];
  if (multi) {
    lines.push(
      '너는 아래 세계관 속 이야기를 이끄는 내레이터이자, 등장인물 전원을 연기하는 롤플레이 상대다.',
      '상황을 서술하고, 등장인물의 대사는 반드시 "이름: 대사" 형식으로 표기하라(누가 말하는지 명확히).',
      '한 번에 모든 인물이 몰아서 말하지 말고, 장면에 맞게 자연스럽게 등장시켜라.'
    );
  } else {
    lines.push(
      '너는 아래에 정의된 캐릭터를 연기하는 롤플레이 상대다. 캐릭터로서 1인칭으로 자연스럽게 대화하라.'
    );
  }
  lines.push('네가 AI/언어모델/시스템임을 드러내지 말고, 설정과 말투를 일관되게 유지하라. 특별한 지시가 없으면 한국어로, 몰입감 있게 답하라.');

  if (d.worldTitle) lines.push(`\n[제목]\n${d.worldTitle}`);
  if (d.worldLore) lines.push(`\n[세계관 설정]\n${d.worldLore}`);
  if (chars.length === 1) {
    lines.push(`\n[캐릭터 — 성격·말투·배경]\n${chars[0].name}: ${chars[0].description}`);
  } else if (chars.length > 1) {
    lines.push('\n[등장인물]\n' + chars.map((c) => `● ${c.name}: ${c.description}`).join('\n'));
  }
  if (d.scenario) lines.push(`\n[현재 상황 / 시나리오]\n${d.scenario}`);
  if (d.userPersona) lines.push(`\n[상대(사용자) 페르소나]\n${d.userPersona}`);

  lines.push(
    '\n[규칙]\n- 사용자의 대사·행동을 존중하되, 사용자 캐릭터를 대신 말하거나 조종하지 마라.\n- 각 캐릭터의 성격에서 벗어나지 마라(OOC 금지).\n- 응답은 대화가 이어지도록 적당한 길이로. 장면 묘사는 서술로, 대사는 따옴표로.'
  );
  return lines.join('\n');
}

module.exports = {
  buildSystemPrompt,
  normalizeDef,
  migrateDef,
  isConfigured,
  displayName,
  MAX_CHAT_HISTORY,
  MAX_CHARACTERS,
};
