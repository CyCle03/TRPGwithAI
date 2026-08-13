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
    instructionEn:
      'Keep it to 1-2 sentences. Terse, like a text message. No lengthy description.',
    maxTokens: 250,
  },
  short: {
    label: '짧게',
    instruction: '응답은 2~4문장으로 짧게. 군더더기 없이 핵심만.',
    instructionEn: 'Keep it to 2-4 sentences. Just the essentials, no padding.',
    maxTokens: 500,
  },
  medium: {
    label: '보통',
    instruction: '응답은 1~2문단(4~6문장) 정도로. 장면 묘사와 대사를 적절히 섞어라.',
    instructionEn:
      'Write 1-2 paragraphs (4-6 sentences), mixing scene description and dialogue.',
    maxTokens: 900,
  },
  long: {
    label: '길게',
    instruction:
      '응답은 3~4문단으로 충분히. 장면·분위기·감정 묘사를 풍부하게 하고 대사도 넉넉히 넣어라.',
    instructionEn:
      'Write 3-4 full paragraphs. Rich description of scene, mood and feeling, with plenty of dialogue.',
    maxTokens: 1600,
  },
  verylong: {
    label: '아주 길게',
    instruction:
      '응답은 250~300단어 분량의 긴 서사로. 장면·심리·대사를 소설처럼 깊이 있게 전개하되, 300단어를 넘기지는 마라.',
    instructionEn:
      'Write 250-300 words of sustained prose — scene, interiority and dialogue developed like a novel. Do not exceed 300 words.',
    maxTokens: 2500,
  },
};

/** 응답 언어. 대화마다 하나로 고정된다(index.js 가 대화에 저장해 둔다). */
const LANGS_OUT = ['ko', 'en'];
function normalizeLang(v) {
  return LANGS_OUT.includes(v) ? v : 'ko';
}

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
  // 갤러리 카드에 쓸 대표 이미지(선택). 등록된 이미지 중 하나여야 한다 —
  // 지웠거나 남의 이미지 id를 넣으면 버리고, 자동 선별에 맡긴다.
  const coverIdRaw = String(d.coverId || '').replace(/[^a-f0-9]/gi, '').slice(0, 40);
  const coverId = images.some((im) => im.id === coverIdRaw) ? coverIdRaw : '';
  // 장르·태그 (검색/분류용). 최대 6개, 각 20자.
  const tags = (Array.isArray(d.tags) ? d.tags : [])
    .map((t) => String(t || '').trim().replace(/^#/, '').slice(0, 20))
    .filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, 6);
  return {
    worldTitle: String(d.worldTitle || '').trim().slice(0, 80),
    worldLore: String(d.worldLore || '').slice(0, 6000),
    characters,
    images,
    coverId,
    tags,
    responseLength: normalizeLength(d.responseLength), // 제작자 권장 출력량
    scenario: String(d.scenario || '').slice(0, 3000),
    greeting: String(d.greeting || '').slice(0, 2000),
    userPersona: String(d.userPersona || '').slice(0, 2000),
  };
}

/**
 * 추론형 모델(qwen3 등)이 남기는 <think>…</think> 블록을 제거한다.
 * 닫는 태그가 없으면(토큰이 끊긴 경우) 그 뒤만 살린다.
 */
function stripThink(text) {
  let s = String(text || '');
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (/<think>/i.test(s)) s = s.replace(/[\s\S]*<think>[\s\S]*$/i, '');
  return s.replace(/^\s*<\/think>\s*/i, '').trim();
}

/**
 * AI 응답에서 [img:태그] 마커를 뽑아 이미지 id로 바꾸고, 본문에서는 마커를 제거한다.
 * @returns {{text:string, imageId:string|null}}
 */
function extractImage(text, images) {
  const raw = stripThink(text);
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
 *
 * **세계관·캐릭터 설명은 사용자가 쓴 원문 그대로 넣는다** — 번역하지 않는다.
 * 모델은 한국어로 쓰인 설정을 읽고 지정된 언어로 답할 수 있다. 미리 번역해 두면
 * 고유명사가 턴마다 흔들리고, 저장값과도 어긋난다.
 *
 * **이미지 태그만은 언어와 무관하게 원문 그대로 출력하게 한다.** extractImage 가
 * 태그 문자열을 완전일치로 찾기 때문에, 모델이 태그까지 영어로 옮기면 매칭이
 * 조용히 실패해 이미지가 사라진다.
 *
 * @param {string} [lengthOverride] 플레이어가 지정한 출력량(없으면 제작자 권장값)
 * @param {{compact?:boolean, lang?:string}} [opts] lang 은 이 대화에 고정된 응답 언어
 */
function buildSystemPrompt(def, lengthOverride, opts) {
  const d = def || {};
  const compact = !!(opts && opts.compact); // 느린 로컬 모델용: 지시문을 최소화해 입력 토큰 절약
  const lang = normalizeLang(opts && opts.lang);
  const chars = (d.characters || []).filter((c) => c.name);
  const multi = chars.length > 1;
  const meta = LENGTH_META[effectiveLength(d, lengthOverride)];

  const lines = [];

  if (lang === 'en') {
    if (compact) {
      lines.push(
        multi
          ? 'You are the narrator of the world below and play every character in it. Format dialogue as "Name: line".'
          : 'You play the character defined below, in first person.',
        'Never reveal that you are an AI. Reply in English.'
      );
    } else {
      lines.push(
        multi
          ? 'You are the narrator carrying the story of the world below, and you play every character in it.'
          : 'You are a roleplay partner playing the character defined below. Stay in first person and speak naturally as them.'
      );
      if (multi) {
        lines.push(
          'Describe the situation, and always mark character dialogue as "Name: line" so it is clear who speaks.',
          'Do not have everyone speak at once — bring characters in as the scene calls for them.'
        );
      }
      lines.push(
        'Never reveal that you are an AI, a language model or a system. Keep the setting and each voice consistent. ' +
          'Reply in English, immersively — even though the setting below may be written in another language.'
      );
    }
  } else if (compact) {
    lines.push(
      multi
        ? '너는 아래 세계관의 내레이터이자 등장인물 전원을 연기한다. 대사는 "이름: 대사" 형식.'
        : '너는 아래 캐릭터를 1인칭으로 연기한다.',
      'AI임을 드러내지 말고 한국어로 답하라.'
    );
  } else {
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
    lines.push(
      '네가 AI/언어모델/시스템임을 드러내지 말고, 설정과 말투를 일관되게 유지하라. 특별한 지시가 없으면 한국어로, 몰입감 있게 답하라.'
    );
  }

  // 아래 설정 본문은 언어와 무관하게 사용자가 쓴 원문 그대로 들어간다.
  const H = lang === 'en' ? EN_HEADINGS : KO_HEADINGS;
  if (d.worldTitle) lines.push(`\n[${H.title}]\n${d.worldTitle}`);
  if (d.worldLore) lines.push(`\n[${H.lore}]\n${d.worldLore}`);
  if (chars.length === 1) {
    lines.push(`\n[${H.character}]\n${chars[0].name}: ${chars[0].description}`);
  } else if (chars.length > 1) {
    lines.push(`\n[${H.cast}]\n` + chars.map((c) => `● ${c.name}: ${c.description}`).join('\n'));
  }
  if (d.scenario) lines.push(`\n[${H.scenario}]\n${d.scenario}`);
  if (d.userPersona) lines.push(`\n[${H.persona}]\n${d.userPersona}`);

  const imgs = (d.images || []).filter((im) => im.tag);
  if (imgs.length) {
    const list = imgs
      .map(
        (im) =>
          `- ${im.tag}${im.description ? `: ${compact ? im.description.slice(0, 24) : im.description}` : ''}`
      )
      .join('\n');
    if (lang === 'en') {
      // 예시 태그는 실제 목록의 첫 항목을 쓴다. 다른 언어의 태그를 예시로 박아 두면
      // 모델이 그쪽을 흉내 내 목록에 없는 태그를 만들어 낸다.
      lines.push(
        `\n[${H.images}]\n` +
          list +
          `\nWhen an image fits this reply, include [img:tag] exactly once (e.g. [img:${imgs[0].tag}]).` +
          ' Pick the location tag when the scene moves, or a character tag when that character is the focus.' +
          ' Do not repeat the tag you used in the previous reply.' +
          ' Never invent a tag that is not on the list above.' +
          '\nIMPORTANT: copy the tag **exactly as written above, character for character** — do not translate it,' +
          ' romanize it, or change its spacing. The tag is an internal key and is never shown to the reader.'
      );
    } else {
      lines.push(
        compact
          ? '\n[이미지 태그]\n' +
              list +
              '\n장소가 바뀌거나 특정 인물이 말의 중심일 때, 어울리는 [img:태그]를 한 번 넣어라.' +
              ' 직전에 쓴 것과 같은 태그는 반복하지 마라. 목록에 없는 태그는 쓰지 마라.'
          : '\n[사용할 수 있는 이미지]\n' +
              list +
              '\n이번 응답에 어울리는 이미지가 있으면 [img:태그] 를 정확히 한 번 넣어라(예: [img:밤바다]).' +
              ' 장소를 옮겼으면 그 장소 태그를, 특정 인물이 대화의 중심이면 그 인물 태그를 골라라.' +
              ' 직전 응답에서 쓴 것과 같은 태그는 반복하지 마라(같은 장소에 머물면 생략해도 좋다).' +
              ' 위 목록에 없는 태그는 절대 지어내지 마라. 태그는 위에 적힌 글자 그대로 옮겨 적어라(번역 금지).'
      );
    }
  }

  if (lang === 'en') {
    lines.push(
      compact
        ? '\nIMPORTANT: never invent the user’s dialogue or actions. Never drop a character into the scene who was not there.'
        : '\n[Rules]\n- Respect the user’s lines and actions; never speak or act for the user’s character.\n' +
            '- Never break character (no OOC).\n- Description in prose, dialogue in quotes.'
    );
    lines.push(`\n[Reply length]\n${meta.instructionEn}`);
  } else {
    lines.push(
      compact
        ? // 소형 모델이 가장 자주 어기는 두 가지만 콕 집어 강조(토큰 대비 효과가 크다)
          '\n중요: 사용자의 대사와 행동을 절대 지어내지 마라. 그 장면에 없던 인물을 갑자기 등장시키지 마라.'
        : '\n[규칙]\n- 사용자의 대사·행동을 존중하되, 사용자 캐릭터를 대신 말하거나 조종하지 마라.\n- 각 캐릭터의 성격에서 벗어나지 마라(OOC 금지).\n- 장면 묘사는 서술로, 대사는 따옴표로.'
    );
    lines.push(`\n[응답 길이]\n${meta.instruction}`);
  }
  return lines.join('\n');
}

const KO_HEADINGS = {
  title: '제목',
  lore: '세계관 설정',
  character: '캐릭터 — 성격·말투·배경',
  cast: '등장인물',
  scenario: '현재 상황 / 시나리오',
  persona: '상대(사용자) 페르소나',
  images: '사용할 수 있는 이미지',
};
const EN_HEADINGS = {
  title: 'Title',
  lore: 'World setting',
  character: 'Character — personality, voice, background',
  cast: 'Cast',
  scenario: 'Current situation / scenario',
  persona: 'The user’s persona',
  images: 'Available images',
};

module.exports = {
  buildSystemPrompt,
  normalizeLang,
  normalizeDef,
  migrateDef,
  isConfigured,
  displayName,
  extractImage,
  stripThink,
  normalizeLength,
  effectiveLength,
  maxTokensFor,
  LENGTHS,
  LENGTH_META,
  MAX_CHAT_HISTORY,
  MAX_CHARACTERS,
  MAX_IMAGES,
};
