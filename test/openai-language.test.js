'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeProvider } = require('../server/providers/openaiCompatProvider');
const { callGM } = require('../server/aiGM');

function responseWith(content) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

async function captureRequest(run, response) {
  const originalFetch = global.fetch;
  let body;
  global.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return responseWith(response);
  };
  try {
    await run();
    return body;
  } finally {
    global.fetch = originalFetch;
  }
}

function provider() {
  return makeProvider({
    name: 'OpenAI test',
    baseURL: 'https://example.invalid/v1',
    defaultModel: 'test-model',
  });
}

test('English GM requests end with an English JSON instruction', async () => {
  const body = await captureRequest(
    () =>
      provider().generate({
        apiKey: 'test-key',
        staticSystem: 'Write in English.',
        dynamicSystem: 'Current state.',
        messages: [{ role: 'user', content: 'Begin.' }],
        lang: 'en',
      }),
    '{"narration":"An English opening.","action":{"type":"none"}}'
  );

  const system = body.messages[0].content;
  assert.match(system, /Narration shown to the player \(in English\)/);
  assert.match(system, /raw JSON only/);
  assert.doesNotMatch(system, /플레이어에게 보여줄 서사\(한국어\)/);
});

test('callGM carries the saved English session language into the OpenAI request', async () => {
  const session = {
    lang: 'en',
    aiConfig: { provider: 'openai', apiKey: 'test-key', model: 'test-model' },
    character: {
      name: 'Aria',
      className: '전사',
      level: 1,
      hp: 10,
      maxHp: 10,
      armor: 1,
      damageDie: 10,
      weapon: null,
      stats: { STR: 1, DEX: 0, CON: 1, INT: -1, WIS: 0, CHA: 1 },
      coin: 0,
      inventory: [],
      moves: [],
    },
    enemies: [],
    companions: [],
    summary: '',
  };

  const body = await captureRequest(
    () => callGM(session, [{ role: 'user', content: 'Begin.' }]),
    '{"narration":"An English opening.","action":{"type":"none"}}'
  );

  const system = body.messages[0].content;
  assert.match(system, /Write in English, immersively/);
  assert.match(system, /Narration shown to the player \(in English\)/);
  assert.doesNotMatch(system, /플레이어에게 보여줄 서사\(한국어\)/);
});

test('English suggestion requests keep the final output instruction in English', async () => {
  const body = await captureRequest(
    () =>
      provider().generateSuggestions({
        apiKey: 'test-key',
        staticSystem: 'Suggest actions in English.',
        dynamicSystem: 'Current state.',
        messages: [{ role: 'user', content: 'What can I do?' }],
        lang: 'en',
      }),
    '{"suggestions":["Open the door","Question the guard","Wait quietly"]}'
  );

  const system = body.messages[0].content;
  assert.match(system, /action 1 in English/);
  assert.doesNotMatch(system, /행동1/);
});

test('Korean remains the safe default for OpenAI-compatible providers', async () => {
  const body = await captureRequest(
    () =>
      provider().generate({
        apiKey: 'test-key',
        staticSystem: '한국어로 작성하라.',
        dynamicSystem: '현재 상태.',
        messages: [{ role: 'user', content: '시작해.' }],
      }),
    '{"narration":"모험이 시작된다.","action":{"type":"none"}}'
  );

  assert.match(body.messages[0].content, /플레이어에게 보여줄 서사\(한국어\)/);
});
