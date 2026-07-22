'use strict';

const Anthropic = require('@anthropic-ai/sdk');

/**
 * Anthropic (Claude) provider.
 * Structured Outputs(JSON 스키마)로 { narration, action } JSON 텍스트를 반환한다.
 */

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

let client = null;
function getClient() {
  if (!client) client = new Anthropic(); // ANTHROPIC_API_KEY 자동 사용
  return client;
}

// NPC(적/동료) 항목 스키마 — 이름 + 상태(체력 서술) + 특징.
const NPC_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'hp', 'note'],
  properties: {
    name: { type: 'string' },
    hp: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
  },
};

// Anthropic JSON Schema (strict 호환: 모든 필드 required + nullable).
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['narration', 'action'],
  properties: {
    narration: { type: 'string' },
    action: {
      type: 'object',
      additionalProperties: false,
      required: [
        'type', 'move', 'stat', 'reason', 'hpDelta',
        'addItems', 'removeItems', 'enemies', 'companions', 'xpGain',
      ],
      properties: {
        type: { type: 'string', enum: ['roll', 'update_state', 'none'] },
        move: { type: ['string', 'null'] },
        stat: { type: ['string', 'null'] },
        reason: { type: ['string', 'null'] },
        hpDelta: { type: ['integer', 'null'] },
        addItems: { type: 'array', items: { type: 'string' } },
        removeItems: { type: 'array', items: { type: 'string' } },
        enemies: { type: ['array', 'null'], items: NPC_ITEM },
        companions: { type: ['array', 'null'], items: NPC_ITEM },
        xpGain: { type: ['integer', 'null'] },
      },
    },
  },
};

/**
 * @param {object} p
 * @param {string} p.staticSystem  정적 시스템 프롬프트 (캐시 대상)
 * @param {string} p.dynamicSystem 동적 상태 요약
 * @param {Array}  p.messages      [{role:'user'|'assistant', content:string}]
 * @returns {Promise<string>} JSON 텍스트
 */
async function generate({ staticSystem, dynamicSystem, messages }) {
  const resp = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    system: [
      { type: 'text', text: staticSystem, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicSystem },
    ],
    messages,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  });
  const textBlock = resp.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Claude 응답에 텍스트 블록이 없습니다.');
  return textBlock.text;
}

// 행동 제안: 문자열 배열 스키마
const SUGGEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: { type: 'array', items: { type: 'string' } },
  },
};

async function generateSuggestions({ staticSystem, dynamicSystem, messages }) {
  const resp = await getClient().messages.create({
    model: MODEL,
    max_tokens: 512,
    thinking: { type: 'disabled' },
    system: [
      { type: 'text', text: staticSystem },
      { type: 'text', text: dynamicSystem },
    ],
    messages,
    output_config: { format: { type: 'json_schema', schema: SUGGEST_SCHEMA } },
  });
  const textBlock = resp.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Claude 제안 응답에 텍스트 블록이 없습니다.');
  // aiGM은 배열을 기대하므로 suggestions 배열만 꺼내 문자열화
  const obj = JSON.parse(textBlock.text);
  return JSON.stringify(obj.suggestions || []);
}

module.exports = { generate, generateSuggestions, MODEL, name: 'anthropic' };
