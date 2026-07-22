'use strict';

const { GoogleGenAI, Type } = require('@google/genai');

/**
 * Google Gemini provider (무료 등급 사용 가능).
 * responseSchema로 { narration, action } JSON 텍스트를 반환한다.
 * Gemini 스키마는 nullable/propertyOrdering 등 자체 형식을 쓴다(Anthropic과 다름).
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';

let client = null;
function getClient() {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY 가 설정되지 않았습니다 (.env 확인).');
    client = new GoogleGenAI({ apiKey });
  }
  return client;
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
  'type', 'move', 'stat', 'reason', 'hpDelta',
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
async function generate({ staticSystem, dynamicSystem, messages }) {
  const resp = await getClient().models.generateContent({
    model: MODEL,
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

async function generateSuggestions({ staticSystem, dynamicSystem, messages }) {
  const resp = await getClient().models.generateContent({
    model: MODEL,
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

module.exports = { generate, generateSuggestions, MODEL, name: 'gemini' };
