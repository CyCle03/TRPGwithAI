'use strict';

const { MOVES_SUMMARY } = require('./dungeonWorld');
const { ABILITIES } = require('./rulesEngine');

/**
 * AI GM — 서사/연출/무브 판단 담당.
 * 프롬프트·스키마 구성은 여기서 하고, 실제 모델 호출은 provider에 위임한다.
 * .env의 AI_PROVIDER 로 anthropic(Claude) / gemini(무료) 를 토글한다.
 */

// 사용자별 provider 선택 (세션의 aiConfig 사용)
const { makeProvider } = require('./providers/openaiCompatProvider');
const PROVIDERS = {
  gemini: require('./providers/geminiProvider'),
  anthropic: require('./providers/anthropicProvider'),
  openai: makeProvider({ name: 'OpenAI', baseURL: 'https://api.openai.com/v1', defaultModel: 'gpt-5-mini' }),
  deepseek: makeProvider({ name: 'DeepSeek', baseURL: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' }),
  xai: makeProvider({ name: 'xAI Grok', baseURL: 'https://api.x.ai/v1', defaultModel: 'grok-4-fast-non-reasoning' }),
  qwen: makeProvider({ name: 'Qwen', baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-plus' }),
  // 사용자가 baseURL을 직접 지정하는 커스텀 엔드포인트 (Ollama·LM Studio·자체 호스팅 등 OpenAI 호환)
  custom: makeProvider({ name: '커스텀', baseURL: null, defaultModel: 'llama3.1', dynamicBaseURL: true }),
};

const PROVIDER_NAMES = Object.keys(PROVIDERS);

function pickProvider(name) {
  return PROVIDERS[name] || PROVIDERS.gemini;
}

/** provider별 기본 모델 (설정 UI 표시용). */
function defaultModel(name) {
  return (PROVIDERS[name] || PROVIDERS.gemini).DEFAULT_MODEL;
}

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
- 피해가 발생하면 그 서사와 함께 action.type="update_state", hpDelta에 음수를 넣어라. 이때 hpDelta에는 "방어구 적용 전의 원래 피해량"을 음수로 넣는다. 시스템이 캐릭터의 방어구(armor)만큼 자동으로 줄여서 실제 HP에 반영하고, 그 계산(피해 X − 방어구 Y)을 화면에 보여준다. 피해량은 적의 위협 수준에 맞게 보통 2~8 사이로 정하라. 회복은 방어구와 무관하게 그대로 적용된다.

[경험치 — 매우 엄격하게]
- 판정에서 6-(실패)가 나오면 시스템이 자동으로 경험치를 준다. 이때 너는 절대 xpGain을 추가로 주지 마라(중복 금지).
- xpGain은 "아주 드물게"만 준다. 다음처럼 이야기의 큰 사건에만 xpGain=1:
  · 이름 있는/강력한 적(보스급)을 처치했을 때
  · 모험의 핵심 목표를 달성했을 때
  · 이야기를 크게 바꾸는 중대한 발견을 했을 때
- 다음에는 절대 xpGain을 주지 마라(반드시 0): 평범한 공격·방어, 피해를 입거나 회복한 것, 사소한 성공, 실패, 단순 이동·대화, 잡몹 한 마리 처치. 대부분의 턴은 xpGain=0이다.

[적/동료 정보 — 화면 좌측 패널에 표시됨]
- 장면에 적(enemy)이나 동료 NPC(companion)가 있으면 action.enemies / action.companions 에 "현재 전체 목록"을 넣어라.
- 각 항목: name(이름), hp(체력·상태 서술 — 예: "건강함", "부상", "빈사", "3/6"), note(짧은 특징이나 무장).
- 목록이 바뀔 때만(등장/처치/합류/이탈/부상 등) 전체 목록을 다시 넣어라. 변화가 없으면 null로 두면 시스템이 이전 목록을 유지한다.
- 적을 물리쳤으면 그 적을 목록에서 제외하고, 모든 적이 사라졌으면 빈 배열 []을 넣어라. 동료가 떠나면 companions에서 빼라.

[톤]
- 한국어로, 몰입감 있게. 매 응답은 2~4문장 정도로 간결하게. 플레이어의 다음 행동을 유도하는 질문이나 여지로 끝내라.

[무기 태그 — 던전 월드 규칙, 반드시 반영]
캐릭터의 장착 무기에는 태그가 붙어 있다(상태 정보에 표시됨). 데미지 주사위는 클래스가 정하며 무기가 바꾸지 않는다. 대신 태그를 판정·서사에 이렇게 반영하라:
- '정밀': 이 무기로 근접 공격 시 STR 대신 DEX로 손상 입히기 판정을 하라(action.stat="DEX").
- '먼 원거리'/'가까운 원거리': 원거리 무기다. 떨어진 적은 정밀 사격(Volley, DEX)으로 판정하라. 반대로 근접 전용 무기로는 떨어진 적을 칠 수 없다(먼저 접근해야 함).
- '간격': 한 걸음 떨어진 적을 칠 수 있다(상대가 근접만 가능하면 유리).
- '손닿는 거리'/'근접': 바짝 붙어야 공격 가능.
- '강하게 밀침': 성공 시 적을 밀치거나 넘어뜨릴 수 있다.
- '지저분': 상처가 크고 잔혹하다(피해를 약간 높게).
- '피해 +N': update_state의 hpDelta(원피해)에 N만큼 더해라.
- '양손'/'재장전'/'느림': 서사 제약으로 반영(재장전 무기는 연속 사격이 어렵다 등).

[야영/휴식 — Make Camp]
- 플레이어가 안전한 곳에서 야영·휴식·수면을 취하면, 그 서사와 함께 action.type="update_state"로 HP를 회복시켜라(hpDelta 양수). 보통 최대 HP의 절반 정도를 회복하되, 위험한 장소면 적게. 회복은 방어구와 무관하다.
- 야영에는 식량이 든다: 인벤토리에 "여행 식량"류가 있으면 removeItems로 1개 소모하라. 식량이 없으면 회복량을 크게 줄이고 굶주림의 위험을 서사에 넣어라.

[죽음의 문턱 — Last Breath, 시스템이 처리]
- 캐릭터의 HP가 0이 되면 시스템이 자동으로 "죽음의 문턱" 2d6을 굴리고 그 결과([시스템] 메시지)를 너에게 알려준다. 너는 그 지시에 따라 서사만 쓰고, HP나 생사를 네 마음대로 정하지 마라(시스템이 이미 처리함).

[소지금(돈) — coin]
- 캐릭터의 소지금은 시스템이 정수(coin)로 관리한다(상태 정보에 표시됨). 돈을 얻거나 쓰면 action.type="update_state"에 coinDelta(정수: 획득 +, 소모 −)를 넣어라.
- 절대 "은화 몇 닢", "동전 조금" 같은 막연한 표현을 addItems로 넣지 마라. 반드시 구체적 숫자로 coinDelta를 써라(예: 보물에서 은화 15닢 → coinDelta=15).
- 같은 소모품을 여러 개 줄 때는 addItems에 같은 이름을 개수만큼 넣어라(예: 화살 5 → ["화살","화살","화살","화살","화살"]). 시스템이 수량으로 합쳐 관리한다.

${MOVES_SUMMARY}

응답은 반드시 지정된 JSON 스키마(narration + action)로만 출력하라.`;

/** 현재 상태 요약 (동적) — GM이 맥락을 잃지 않도록. */
function buildStateSummary(session) {
  const c = session.character;
  const statLine = ABILITIES.map((k) => `${k} ${fmtMod(c.stats[k])}`).join(' ');
  const moveLine = (c.moves || []).length
    ? c.moves.map((m) => `${m.name}(${m.desc})`).join(' / ')
    : '(없음)';
  return `[현재 캐릭터 상태 — 시스템이 관리하는 실제 수치]
이름: ${c.name} / 클래스: ${c.className} / 레벨: ${c.level || 1}
HP: ${c.hp}/${c.maxHp}  방어구: ${c.armor}  피해주사위: d${c.damageDie}
장착 무기: ${c.weapon ? `${c.weapon.name} [${(c.weapon.tags || []).join(', ') || '태그 없음'}]` : '(맨손)'}
능력치: ${statLine}
소지금: ${c.coin || 0} coin
인벤토리: ${c.inventory.length ? c.inventory.join(', ') : '(비어 있음)'}
습득 무브: ${moveLine}

[현재 필드 — 시스템이 유지하는 적/동료]
적: ${fmtNpcs(session.enemies)}
동료: ${fmtNpcs(session.companions)}

[진행 맥락]
${session.summary || '(모험 시작 직후)'}`;
}

function fmtMod(m) {
  return m >= 0 ? `+${m}` : `${m}`;
}

function fmtNpcs(list) {
  if (!Array.isArray(list) || !list.length) return '(없음)';
  return list.map((n) => `${n.name}(${n.hp || '?'}${n.note ? ', ' + n.note : ''})`).join('; ');
}

/**
 * 선택된 provider로 { narration, action } 을 받아온다.
 * @param {object} session
 * @param {Array}  messages
 */
async function callGM(session, messages) {
  const cfg = session.aiConfig || {};
  const jsonText = await pickProvider(cfg.provider).generate({
    apiKey: cfg.apiKey,
    model: cfg.model,
    baseURL: cfg.baseURL,
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

// 행동 제안용 지시 프롬프트 (GM 스키마와 별개, 이야기 진행 없음).
const SUGGEST_SYSTEM = `너는 던전 월드 GM의 보조다. 현재 장면과 캐릭터 상태를 바탕으로, 플레이어가 지금 취할 만한 서로 다른 행동 3가지를 제안하라.
- 각 제안은 한국어로 12자~30자 내외의 구체적인 행동 서술("~한다" 형태).
- 캐릭터의 클래스·능력치·습득 무브를 활용하는 선택지를 섞어라.
- 안전한 선택과 과감한 선택을 다양하게. 스토리를 대신 진행하지 말고, 선택지만 제시하라.
JSON 문자열 배열로만 출력하라.`;

/**
 * 현재 상황에서 취할 만한 행동 제안 목록을 받아온다.
 * @returns {Promise<string[]>}
 */
async function suggestGmActions(session, messages) {
  const cfg = session.aiConfig || {};
  // 대화가 GM(model) 턴으로 끝나면 Gemini가 400을 낸다 → user 턴을 덧붙여 요청을 마무리.
  const msgs = messages.concat([
    { role: 'user', content: '지금 상황에서 내가 취할 만한 행동 몇 가지를 제안해줘.' },
  ]);
  const jsonText = await pickProvider(cfg.provider).generateSuggestions({
    apiKey: cfg.apiKey,
    model: cfg.model,
    baseURL: cfg.baseURL,
    staticSystem: SUGGEST_SYSTEM,
    dynamicSystem: buildStateSummary(session),
    messages: msgs,
  });
  let arr;
  try {
    arr = JSON.parse(jsonText);
  } catch (e) {
    throw new Error('행동 제안 JSON 파싱 실패: ' + e.message);
  }
  if (!Array.isArray(arr)) arr = [];
  return arr
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

/** NPC 배열 정규화. null이면 null(변화 없음), 배열이면 검증된 목록. */
function normalizeNpcs(arr) {
  if (!Array.isArray(arr)) return null;
  return arr
    .filter((n) => n && n.name)
    .map((n) => ({
      name: String(n.name).slice(0, 40),
      hp: n.hp ? String(n.hp).slice(0, 40) : '',
      note: n.note ? String(n.note).slice(0, 80) : '',
    }))
    .slice(0, 8);
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
      coinDelta: Number.isFinite(a.coinDelta) ? Math.trunc(a.coinDelta) : 0,
      addItems: Array.isArray(a.addItems) ? a.addItems.map(String) : [],
      removeItems: Array.isArray(a.removeItems) ? a.removeItems.map(String) : [],
      enemies: normalizeNpcs(a.enemies),
      companions: normalizeNpcs(a.companions),
      xpGain: Number.isFinite(a.xpGain) ? Math.max(0, Math.min(3, Math.trunc(a.xpGain))) : 0,
    },
  };
}

/**
 * 캐릭터 챗(자유 롤플레이) 응답 — 구조화 없이 일반 텍스트.
 * @param {{provider:string, model:string, apiKey:string, baseURL:string}} cfg
 * @param {string} system  캐릭터 설정 시스템 프롬프트
 * @param {Array}  messages [{role, content}]
 * @returns {Promise<string>}
 */
async function chatReply(cfg, system, messages) {
  return pickProvider(cfg.provider).generateChat({
    apiKey: cfg.apiKey,
    model: cfg.model,
    baseURL: cfg.baseURL,
    system,
    messages,
  });
}

module.exports = { callGM, suggestGmActions, chatReply, defaultModel, PROVIDER_NAMES };
