'use strict';

/**
 * 캐릭터 챗(자유 롤플레이) 도우미.
 * 규칙엔진/주사위 없이, 사용자가 정의한 페르소나로 시스템 프롬프트를 만든다.
 */

const MAX_CHAT_HISTORY = 30; // API에 보내는 최근 메시지 수

/** 페르소나(사용자 정의)를 시스템 프롬프트 문자열로. 빈 필드는 생략. */
function buildSystemPrompt(persona) {
  const p = persona || {};
  const lines = [
    '너는 아래에 정의된 캐릭터를 연기하는 롤플레이 상대다. 캐릭터로서 1인칭으로 자연스럽게 대화하라.',
    '네가 AI/언어모델/시스템임을 드러내지 말고, 설정과 말투를 일관되게 유지하라. 특별한 지시가 없으면 한국어로, 몰입감 있게 답하라.',
  ];
  if (p.name) lines.push(`\n[캐릭터 이름]\n${p.name}`);
  if (p.description) lines.push(`\n[캐릭터 설명 · 성격 · 말투 · 배경]\n${p.description}`);
  if (p.scenario) lines.push(`\n[현재 상황 / 시나리오]\n${p.scenario}`);
  if (p.exampleDialogue) lines.push(`\n[예시 대화 — 말투·톤 참고용, 그대로 반복하지는 말 것]\n${p.exampleDialogue}`);
  if (p.userPersona) lines.push(`\n[상대(사용자) 페르소나]\n${p.userPersona}`);
  lines.push(
    '\n[규칙]\n- 사용자의 대사·행동을 존중하되, 사용자 캐릭터를 대신 말하거나 조종하지 마라.\n- 캐릭터의 성격에서 벗어나지 마라(OOC 금지).\n- 응답은 대화가 이어지도록 적당한 길이로. 필요하면 행동/묘사는 *별표* 안에 넣어도 좋다.'
  );
  return lines.join('\n');
}

/** 페르소나 입력 정규화(길이 제한). name은 필수. */
function normalizePersona(raw) {
  const p = raw || {};
  return {
    name: String(p.name || '').trim().slice(0, 60),
    description: String(p.description || '').slice(0, 4000),
    scenario: String(p.scenario || '').slice(0, 3000),
    exampleDialogue: String(p.exampleDialogue || '').slice(0, 3000),
    greeting: String(p.greeting || '').slice(0, 2000),
    userPersona: String(p.userPersona || '').slice(0, 2000),
  };
}

module.exports = { buildSystemPrompt, normalizePersona, MAX_CHAT_HISTORY };
