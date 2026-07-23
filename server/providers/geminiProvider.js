'use strict';

const { GoogleGenAI, Type } = require('@google/genai');

/**
 * Google Gemini provider (무료 등급 사용 가능).
 * responseSchema로 { narration, action } JSON 텍스트를 반환한다.
 * Gemini 스키마는 nullable/propertyOrdering 등 자체 형식을 쓴다(Anthropic과 다름).
 */

const DEFAULT_MODEL = 'gemini-flash-lite-latest';

// apiKey별 클라이언트 캐시 (사용자마다 다른 키)
const clients = new Map();
function getClient(apiKey) {
  if (!apiKey) throw new Error('Gemini API 키가 없습니다. 설정에서 본인 키를 등록하세요.');
  if (!clients.has(apiKey)) clients.set(apiKey, new GoogleGenAI({ apiKey }));
  return clients.get(apiKey);
}

// NPC(적/동료) 항목 스키마
const NPC_ITEM = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    hp: { type: Type.STRING, nullable: true },
    note: { type: Type.STRING, nullable: true },
  },
  required: ['name', 'hp', 'note'],
  propertyOrdering: ['name', 'hp', 'note'],
};

const ACTION_FIELDS = [
  'type', 'move', 'stat', 'reason', 'hpDelta', 'coinDelta',
  'addItems', 'removeItems', 'enemies', 'companions', 'xpGain',
];

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    narration: { type: Type.STRING },
    action: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: ['roll', 'update_state', 'none'] },
        move: { type: Type.STRING, nullable: true },
        stat: { type: Type.STRING, nullable: true },
        reason: { type: Type.STRING, nullable: true },
        hpDelta: { type: Type.INTEGER, nullable: true },
        coinDelta: { type: Type.INTEGER, nullable: true },
        addItems: { type: Type.ARRAY, items: { type: Type.STRING } },
        removeItems: { type: Type.ARRAY, items: { type: Type.STRING } },
        enemies: { type: Type.ARRAY, nullable: true, items: NPC_ITEM },
        companions: { type: Type.ARRAY, nullable: true, items: NPC_ITEM },
        xpGain: { type: Type.INTEGER, nullable: true },
      },
      required: ACTION_FIELDS,
      propertyOrdering: ACTION_FIELDS,
    },
  },
  required: ['narration', 'action'],
  propertyOrdering: ['narration', 'action'],
};

/** 우리 메시지(role user/assistant)를 Gemini contents(role user/model)로 변환.
 *  연속된 동일 role은 병합해 교대 규칙을 지킨다. */
function toGeminiContents(messages) {
  const contents = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts.push({ text: m.content });
    } else {
      contents.push({ role, parts: [{ text: m.content }] });
    }
  }
  return contents;
}

/**
 * @param {object} p
 * @param {string} p.staticSystem
 * @param {string} p.dynamicSystem
 * @param {Array}  p.messages
 * @returns {Promise<string>} JSON 텍스트
 */
async function generate({ apiKey, model, staticSystem, dynamicSystem, messages }) {
  const resp = await getClient(apiKey).models.generateContent({
    model: model || DEFAULT_MODEL,
    contents: toGeminiContents(messages),
    config: {
      systemInstruction: `${staticSystem}\n\n${dynamicSystem}`,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
      // 참고: 최신 Gemini flash(3.x)는 thinkingBudget:0을 거부하므로 사고 설정을 두지 않는다.
    },
  });
  const text = resp.text;
  if (!text) throw new Error('Gemini 응답이 비어 있습니다.');
  return text;
}

// 행동 제안: 문자열 배열을 최상위 스키마로 반환
const SUGGEST_SCHEMA = { type: Type.ARRAY, items: { type: Type.STRING } };

async function generateSuggestions({ apiKey, model, staticSystem, dynamicSystem, messages }) {
  const resp = await getClient(apiKey).models.generateContent({
    model: model || DEFAULT_MODEL,
    contents: toGeminiContents(messages),
    config: {
      systemInstruction: `${staticSystem}\n\n${dynamicSystem}`,
      responseMimeType: 'application/json',
      responseSchema: SUGGEST_SCHEMA,
    },
  });
  const text = resp.text;
  if (!text) throw new Error('Gemini 제안 응답이 비어 있습니다.');
  return text;
}

module.exports = { generate, generateSuggestions, DEFAULT_MODEL, name: 'gemini' };
