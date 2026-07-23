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
    "coinDelta": 정수(돈 획득 +, 소모 −, 없으면 0),
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

async function chat(baseURL, apiKey, model, defaultModel, systemText, messages, jsonMode = true) {
  let res;
  try {
    const body = {
      model: model || defaultModel,
      messages: toOpenAIMessages(systemText, messages),
    };
    if (jsonMode) body.response_format = { type: 'json_object' };
    res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
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

/** baseURL 정규화: 뒤 슬래시 제거. */
function normBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * 하나의 OpenAI 호환 provider 객체를 만든다.
 * @param {object} p
 * @param {string|null} p.baseURL  고정 엔드포인트. dynamicBaseURL=true면 호출 시 인자로 받음.
 * @param {boolean} [p.dynamicBaseURL]  Ollama·자체 호스팅처럼 사용자가 baseURL을 지정하는 경우.
 */
function makeProvider({ name, baseURL, defaultModel, dynamicBaseURL = false }) {
  // dynamic이면 키 없이도 허용(로컬 Ollama 등). 아니면 키 필수.
  const resolveBase = (callBaseURL) => {
    const b = dynamicBaseURL ? normBase(callBaseURL) : baseURL;
    if (!b) throw new Error(`${name} 엔드포인트 주소(baseURL)를 설정에서 입력하세요. 예: http://호스트:11434/v1`);
    return b;
  };
  const resolveKey = (apiKey) => {
    if (dynamicBaseURL) return apiKey || 'local'; // Ollama 등은 인증 불필요 → 더미 토큰
    if (!apiKey) throw new Error(`${name} API 키가 없습니다. 설정에서 본인 키를 등록하세요.`);
    return apiKey;
  };
  return {
    name,
    DEFAULT_MODEL: defaultModel,
    async generate({ apiKey, model, baseURL: cbu, staticSystem, dynamicSystem, messages }) {
      const system = `${staticSystem}\n\n${dynamicSystem}\n\n${GM_JSON_HINT}`;
      return chat(resolveBase(cbu), resolveKey(apiKey), model, defaultModel, system, messages);
    },
    async generateSuggestions({ apiKey, model, baseURL: cbu, staticSystem, dynamicSystem, messages }) {
      const system = `${staticSystem}\n\n${dynamicSystem}\n\n${SUGGEST_JSON_HINT}`;
      const text = await chat(resolveBase(cbu), resolveKey(apiKey), model, defaultModel, system, messages);
      try {
        const obj = JSON.parse(text);
        return JSON.stringify(obj.suggestions || []);
      } catch (_) {
        return '[]';
      }
    },
    // 캐릭터 챗: JSON 모드 없이 일반 텍스트
    async generateChat({ apiKey, model, baseURL: cbu, system, messages }) {
      return chat(resolveBase(cbu), resolveKey(apiKey), model, defaultModel, system, messages, false);
    },
  };
}

module.exports = { makeProvider };
