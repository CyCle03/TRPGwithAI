'use strict';

const { MOVES_SUMMARY } = require('./dungeonWorld');
const { ABILITIES } = require('./rulesEngine');

/**
 * AI GM — 서사/연출/무브 판단 담당.
 * 프롬프트·스키마 구성은 여기서 하고, 실제 모델 호출은 provider에 위임한다.
 * .env의 AI_PROVIDER 로 anthropic(Claude) / gemini(무료) 를 토글한다.
 */

const PROVIDER_NAME = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

function loadProvider() {
  switch (PROVIDER_NAME) {
    case 'anthropic':
    case 'claude':
      return require('./providers/anthropicProvider');
    case 'gemini':
    case 'google':
      return require('./providers/geminiProvider');
    default:
      throw new Error(`알 수 없는 AI_PROVIDER: ${PROVIDER_NAME} (anthropic | gemini)`);
  }
}

const provider = loadProvider();
const MODEL = provider.MODEL;

// 정적 규칙/역할 지시 (매 턴 동일 — Claude에서는 프롬프트 캐시 대상).
const STATIC_SYSTEM = `너는 1인용 던전 월드(PbtA) 게임의 게임 마스터(GM)다. 플레이어 한 명과 함께 짧은 판타지 모험을 진행한다.

[역할 분리 — 매우 중요]
- 서사·장면 묘사·NPC 연출은 네가 담당한다.
- 그러나 주사위, 수치 계산, HP/인벤토리 같은 상태 관리는 절대 네가 직접 하지 않는다. 시스템(코드)이 담당한다.
- 판정이 필요하면 action.type="roll"로 "요청"만 하라. 실제 주사위 결과는 시스템이 굴려서 다시 너에게 알려준다.
- 상태 변경이 필요하면(피해/회복/아이템 획득·소모) action.type="update_state"로 요청하라. 시스템이 검증 후 반영한다.
- 절대 서사 안에서 "주사위가 10이 나왔다" 같은 숫자를 네 마음대로 지어내지 마라.

[무브 판단]
- 플레이어의 자유 서술을 아래 무브 중 하나로 유연하게 해석하고, 어떤 능력치를 쓸지 판단하라.
- 판정이 필요 없는 순수 대화·이동·묘사라면 action.type="none".

[판정 결과 서사화]
- 시스템이 주사위 결과(strong=10+, weak=7-9, miss=6-)를 알려주면, 그 결과에 맞는 서사를 만들어라.
  - 10+ : 의도한 대로 성공.
  - 7-9 : 성공하지만 대가·합병증·어려운 선택이 따른다.
  - 6-  : 실패하고 상황이 나빠진다(GM이 상황을 악화시킬 기회).
- 피해가 발생하면 그 서사와 함께 action.type="update_state", hpDelta에 음수를 넣어 시스템에 반영을 요청하라.

[톤]
- 한국어로, 몰입감 있게. 매 응답은 2~4문장 정도로 간결하게. 플레이어의 다음 행동을 유도하는 질문이나 여지로 끝내라.

${MOVES_SUMMARY}

응답은 반드시 지정된 JSON 스키마(narration + action)로만 출력하라.`;

/** 현재 상태 요약 (동적) — GM이 맥락을 잃지 않도록. */
function buildStateSummary(session) {
  const c = session.character;
  const statLine = ABILITIES.map((k) => `${k} ${fmtMod(c.stats[k])}`).join(' ');
  return `[현재 캐릭터 상태 — 시스템이 관리하는 실제 수치]
이름: ${c.name} / 클래스: ${c.className}
HP: ${c.hp}/${c.maxHp}  방어구: ${c.armor}
능력치: ${statLine}
인벤토리: ${c.inventory.length ? c.inventory.join(', ') : '(비어 있음)'}

[진행 맥락]
${session.summary || '(모험 시작 직후)'}`;
}

function fmtMod(m) {
  return m >= 0 ? `+${m}` : `${m}`;
}

/**
 * 선택된 provider로 { narration, action } 을 받아온다.
 * @param {object} session
 * @param {Array}  messages
 */
async function callGM(session, messages) {
  const jsonText = await provider.generate({
    staticSystem: STATIC_SYSTEM,
    dynamicSystem: buildStateSummary(session),
    messages,
  });

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error('AI GM 응답 JSON 파싱 실패: ' + e.message);
  }
  return normalize(parsed);
}

/** 스키마 밖의 값이 들어와도 안전하게 정규화. */
function normalize(parsed) {
  const a = parsed.action || {};
  const type = ['roll', 'update_state', 'none'].includes(a.type) ? a.type : 'none';
  return {
    narration: String(parsed.narration || '').trim(),
    action: {
      type,
      move: a.move || null,
      stat: ABILITIES.includes(a.stat) ? a.stat : null,
      reason: a.reason || null,
      hpDelta: Number.isFinite(a.hpDelta) ? Math.trunc(a.hpDelta) : null,
      addItems: Array.isArray(a.addItems) ? a.addItems.map(String) : [],
      removeItems: Array.isArray(a.removeItems) ? a.removeItems.map(String) : [],
    },
  };
}

module.exports = { callGM, MODEL, PROVIDER: provider.name };
