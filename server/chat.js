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
const MAX_IMAGES = 16;

// AI가 장면에 맞는 이미지를 고를 때 쓰는 인라인 마커. 구조화 출력 대신 이 방식을 쓰면
// JSON 스키마를 지원하지 않는 제공자(Ollama 등)에서도 동일하게 동작한다.
const IMG_MARKER_RE = /\[img:\s*([^\]]{1,60})\]/i;

/**
 * 응답 길이(출력량). 제작자가 def.responseLength로 권장값을 정하고,
 * 플레이어는 자기 대화에서 따로 덮어쓸 수 있다.
 */
// 5단계. 크랙(롤플레이 응답 260~300단어가 통용) ~ 제타(모바일 채팅형 짧은 응답)의
// 실제 사용 범위를 양끝으로 잡아 calibration 했다.
// maxTokens는 지시한 분량이 잘리지 않도록 목표보다 넉넉하게 준다.
const LENGTHS = ['veryshort', 'short', 'medium', 'long', 'verylong'];
const LENGTH_META = {
  veryshort: {
    label: '아주 짧게',
    instruction:
      '응답은 1~2문장으로 아주 짧게. 메신저로 툭 던지듯 간결하게. 장황한 묘사는 넣지 마라.',
    maxTokens: 250,
  },
  short: {
    label: '짧게',
    instruction: '응답은 2~4문장으로 짧게. 군더더기 없이 핵심만.',
    maxTokens: 500,
  },
  medium: {
    label: '보통',
    instruction: '응답은 1~2문단(4~6문장) 정도로. 장면 묘사와 대사를 적절히 섞어라.',
    maxTokens: 900,
  },
  long: {
    label: '길게',
    instruction:
      '응답은 3~4문단으로 충분히. 장면·분위기·감정 묘사를 풍부하게 하고 대사도 넉넉히 넣어라.',
    maxTokens: 1600,
  },
  verylong: {
    label: '아주 길게',
    instruction:
      '응답은 250~300단어 분량의 긴 서사로. 장면·심리·대사를 소설처럼 깊이 있게 전개하되, 300단어를 넘기지는 마라.',
    maxTokens: 2500,
  },
};

/** 유효한 길이값으로 정규화. */
function normalizeLength(v, fallback = 'medium') {
  return LENGTHS.includes(v) ? v : fallback;
}

/** 실제 적용할 길이 = 플레이어 설정이 있으면 그것, 없으면 제작자 권장값. */
function effectiveLength(def, override) {
  if (LENGTHS.includes(override)) return override;
  return normalizeLength(def && def.responseLength);
}

/** 길이에 따른 최대 출력 토큰. */
function maxTokensFor(level) {
  return LENGTH_META[normalizeLength(level)].maxTokens;
}

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
  let images = Array.isArray(d.images) ? d.images : [];
  images = images
    .map((im) => ({
      id: String((im && im.id) || '').replace(/[^a-f0-9]/gi, '').slice(0, 40),
      tag: String((im && im.tag) || '').trim().slice(0, 40),
      description: String((im && im.description) || '').trim().slice(0, 200),
    }))
    .filter((im) => im.id && im.tag)
    .slice(0, MAX_IMAGES);
  return {
    worldTitle: String(d.worldTitle || '').trim().slice(0, 80),
    worldLore: String(d.worldLore || '').slice(0, 6000),
    characters,
    images,
    responseLength: normalizeLength(d.responseLength), // 제작자 권장 출력량
    scenario: String(d.scenario || '').slice(0, 3000),
    greeting: String(d.greeting || '').slice(0, 2000),
    userPersona: String(d.userPersona || '').slice(0, 2000),
  };
}

/**
 * AI 응답에서 [img:태그] 마커를 뽑아 이미지 id로 바꾸고, 본문에서는 마커를 제거한다.
 * @returns {{text:string, imageId:string|null}}
 */
function extractImage(text, images) {
  const raw = String(text || '');
  const m = IMG_MARKER_RE.exec(raw);
  if (!m) return { text: raw.trim(), imageId: null };
  const tag = m[1].trim().toLowerCase();
  const found = (images || []).find((im) => String(im.tag).trim().toLowerCase() === tag);
  return { text: raw.replace(IMG_MARKER_RE, '').replace(/\n{3,}/g, '\n\n').trim(), imageId: found ? found.id : null };
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

/**
 * def(사용자 정의)를 시스템 프롬프트 문자열로. 빈 필드는 생략.
 * @param {string} [lengthOverride] 플레이어가 지정한 출력량(없으면 제작자 권장값)
 */
function buildSystemPrompt(def, lengthOverride) {
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

  const imgs = (d.images || []).filter((im) => im.tag);
  if (imgs.length) {
    lines.push(
      '\n[사용할 수 있는 이미지]\n' +
        imgs.map((im) => `- ${im.tag}${im.description ? `: ${im.description}` : ''}`).join('\n') +
        '\n장면에 딱 맞는 이미지가 있으면 응답 안에 [img:태그] 를 정확히 한 번만 넣어라(예: [img:밤의 탑]).' +
        ' 위 목록에 없는 태그는 절대 지어내지 말고, 어울리는 게 없으면 아무것도 넣지 마라.' +
        ' 매 응답마다 넣을 필요는 없다 — 장면이 바뀌거나 인상적인 순간에만 써라.'
    );
  }

  lines.push(
    '\n[규칙]\n- 사용자의 대사·행동을 존중하되, 사용자 캐릭터를 대신 말하거나 조종하지 마라.\n- 각 캐릭터의 성격에서 벗어나지 마라(OOC 금지).\n- 장면 묘사는 서술로, 대사는 따옴표로.'
  );
  lines.push(`\n[응답 길이]\n${LENGTH_META[effectiveLength(d, lengthOverride)].instruction}`);
  return lines.join('\n');
}

module.exports = {
  buildSystemPrompt,
  normalizeDef,
  migrateDef,
  isConfigured,
  displayName,
  extractImage,
  normalizeLength,
  effectiveLength,
  maxTokensFor,
  LENGTHS,
  LENGTH_META,
  MAX_CHAT_HISTORY,
  MAX_CHARACTERS,
  MAX_IMAGES,
};
