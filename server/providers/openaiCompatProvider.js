'use strict';

/**
 * OpenAI 호환(chat/completions) provider 팩토리.
 * OpenAI, DeepSeek, xAI(Grok) 등 OpenAI 호환 엔드포인트를 base URL로 지원한다.
 * Node 20 내장 fetch 사용(추가 의존성 없음). Structured Outputs 대신
 * response_format=json_object + 프롬프트에 JSON 형식을 명시하는 방식.
 */

const GM_JSON_HINT = `반드시 아래 JSON 객체 하나로만 응답하라(설명·마크다운·코드블록 없이 순수 JSON):
{
  "narration": "플레이어에게 보여줄 서사(한국어)",
  "action": {
    "type": "roll | update_state | none 중 하나",
    "move": "무브 이름 문자열 또는 null",
    "stat": "STR/DEX/CON/INT/WIS/CHA 중 하나 또는 null",
    "reason": "짧은 이유 문자열 또는 null",
    "hpDelta": 정수 또는 null,
    "addItems": ["아이템 이름", ...],
    "removeItems": ["아이템 이름", ...],
    "enemies": [{"name":"이름","hp":"상태서술","note":"특징"}] 또는 null,
    "companions": [{"name":"이름","hp":"상태서술","note":"특징"}] 또는 null,
    "xpGain": 정수(대부분 0)
  }
}`;

const SUGGEST_JSON_HINT = `반드시 아래 JSON 형식으로만 응답하라: {"suggestions": ["행동1", "행동2", "행동3"]}`;

function toOpenAIMessages(system, messages) {
  return [
    { role: 'system', content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
}

async function chat(baseURL, apiKey, model, defaultModel, systemText, messages) {
  let res;
  try {
    res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || defaultModel,
        messages: toOpenAIMessages(systemText, messages),
        response_format: { type: 'json_object' },
      }),
    });
  } catch (e) {
    throw new Error('네트워크 오류: ' + e.message);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`API 오류 ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('응답이 비어 있습니다.');
  return content;
}

/** 하나의 OpenAI 호환 provider 객체를 만든다. */
function makeProvider({ name, baseURL, defaultModel }) {
  return {
    name,
    DEFAULT_MODEL: defaultModel,
    async generate({ apiKey, model, staticSystem, dynamicSystem, messages }) {
      if (!apiKey) throw new Error(`${name} API 키가 없습니다. 설정에서 본인 키를 등록하세요.`);
      const system = `${staticSystem}\n\n${dynamicSystem}\n\n${GM_JSON_HINT}`;
      return chat(baseURL, apiKey, model, defaultModel, system, messages);
    },
    async generateSuggestions({ apiKey, model, staticSystem, dynamicSystem, messages }) {
      if (!apiKey) throw new Error(`${name} API 키가 없습니다.`);
      const system = `${staticSystem}\n\n${dynamicSystem}\n\n${SUGGEST_JSON_HINT}`;
      const text = await chat(baseURL, apiKey, model, defaultModel, system, messages);
      try {
        const obj = JSON.parse(text);
        return JSON.stringify(obj.suggestions || []);
      } catch (_) {
        return '[]';
      }
    },
  };
}

module.exports = { makeProvider };
