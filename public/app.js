/* global io */
'use strict';

let socket = null; // 로그인 후 연결

// DOM
const setupEl = document.getElementById('setup');
const gameEl = document.getElementById('game');
const classListEl = document.getElementById('classList');
const charNameEl = document.getElementById('charName');
const charLookEl = document.getElementById('charLook');
const startBtn = document.getElementById('startBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const modeRecommend = document.getElementById('modeRecommend');
const modeCustom = document.getElementById('modeCustom');
const statAssignEl = document.getElementById('statAssign');
const statHintEl = document.getElementById('statHint');
const baseGearEl = document.getElementById('baseGear');
const gearOptionsEl = document.getElementById('gearOptions');
const gearCountEl = document.getElementById('gearCount');
const gearHintEl = document.getElementById('gearHint');
const learnMovesEl = document.getElementById('learnMoves');
const sheetSummaryEl = document.getElementById('sheetSummary');

const logEl = document.getElementById('log');
const logInnerEl = document.getElementById('logInner');
const enemiesEl = document.getElementById('enemies');
const companionsEl = document.getElementById('companions');
const thinkingEl = document.getElementById('thinking');
const inputForm = document.getElementById('inputForm');
const actionInput = document.getElementById('actionInput');
const sendBtn = document.getElementById('sendBtn');
const suggestBtn = document.getElementById('suggestBtn');
const suggestionsEl = document.getElementById('suggestions');
const newGameBtn = document.getElementById('newGameBtn');

const charTitle = document.getElementById('charTitle');
const levelText = document.getElementById('levelText');
const xpText = document.getElementById('xpText');
const xpBar = document.getElementById('xpBar');
const hpText = document.getElementById('hpText');
const hpBar = document.getElementById('hpBar');
const armorText = document.getElementById('armorText');
const weaponBoxEl = document.getElementById('weaponBox');
const coinTextEl = document.getElementById('coinText');
const statsEl = document.getElementById('stats');
const inventoryEl = document.getElementById('inventory');
const movesEl = document.getElementById('moves');
const modelNote = document.getElementById('modelNote');

// 레벨업 모달
const levelupModal = document.getElementById('levelupModal');
const luStats = document.getElementById('luStats');
const luMoves = document.getElementById('luMoves');
const luConfirm = document.getElementById('luConfirm');

// 인증 / 사용자 바 / 설정
const authEl = document.getElementById('auth');
const authUserEl = document.getElementById('authUser');
const authPassEl = document.getElementById('authPass');
const authErrorEl = document.getElementById('authError');
const authSubmitEl = document.getElementById('authSubmit');
const authSwitchEl = document.getElementById('authSwitch');
const authSubtitleEl = document.getElementById('authSubtitle');
const authToggleTextEl = document.getElementById('authToggleText');
const userBarEl = document.getElementById('userBar');
const userNameEl = document.getElementById('userName');
const settingsBtn = document.getElementById('settingsBtn');
const logoutBtn = document.getElementById('logoutBtn');
const settingsModal = document.getElementById('settingsModal');
const setProviderEl = document.getElementById('setProvider');
const setModelEl = document.getElementById('setModel');
const baseUrlRowEl = document.getElementById('baseUrlRow');
const setBaseUrlEl = document.getElementById('setBaseUrl');
const setKeyEl = document.getElementById('setKey');
const keyStatusEl = document.getElementById('keyStatus');
const keyHelpEl = document.getElementById('keyHelp');
const settingsErrorEl = document.getElementById('settingsError');
const settingsSaveBtn = document.getElementById('settingsSave');
const settingsCancelBtn = document.getElementById('settingsCancel');

// 슬롯(저장 게임) + 게임별 모델
const slotBarEl = document.getElementById('slotBar');
const gameModelBtn = document.getElementById('gameModelBtn');
const gameModelLabelEl = document.getElementById('gameModelLabel');
const gameModelModal = document.getElementById('gameModelModal');
const gmProviderEl = document.getElementById('gmProvider');
const gmModelEl = document.getElementById('gmModel');
const gmKeyHintEl = document.getElementById('gmKeyHint');
const gmCancelBtn = document.getElementById('gmCancel');
const gmSaveBtn = document.getElementById('gmSave');
const gameModelErrorEl = document.getElementById('gameModelError');
const gmModelListEl = document.getElementById('gmModelList');
const gmFetchModelsBtn = document.getElementById('gmFetchModels');
const gmTestModelBtn = document.getElementById('gmTestModel');
const gmModelsHintEl = document.getElementById('gmModelsHint');
const gmFreeNoticeEl = document.getElementById('gmFreeNotice');
const setFreeNoticeEl = document.getElementById('setFreeNotice');
let freeLimitPerHour = 30;

/** 무료 체험 모드 유의사항 문구. */
function freeNoticeHtml() {
  return (
    '<b>⚠️ 무료 체험 모드 유의사항</b><br />' +
    '이 서버에 설치된 <b>작은 로컬 AI</b>로 동작합니다. API 키 없이 바로 쓸 수 있지만 아래 제한이 있어요.' +
    '<ul>' +
    '<li><b>느립니다</b> — CPU로 추론해서 한 응답에 수십 초가 걸릴 수 있어요.</li>' +
    `<li><b>사용량 제한</b> — 동시에 한 분만, 시간당 ${freeLimitPerHour}회까지.</li>` +
    '<li><b>품질이 낮습니다</b> — 소형 모델이라 말투·형식을 어기거나 설정을 놓칠 수 있어요. 세계관이 길수록 더 그렇습니다.</li>' +
    '<li><b>체험용</b> — 예고 없이 중단되거나 모델이 바뀔 수 있습니다.</li>' +
    '</ul>' +
    '제대로 즐기시려면 <b>본인 API 키 등록</b>을 권합니다(Gemini는 무료 등급으로도 훨씬 빠르고 품질이 좋습니다).<br />' +
    '<span class="fn-good">✅ 대화 내용이 외부 업체로 전송되지 않고 이 서버 안에서만 처리됩니다.</span>'
  );
}
function toggleFreeNotice(el, provider) {
  if (!el) return;
  const on = provider === 'free';
  el.classList.toggle('hidden', !on);
  if (on) el.innerHTML = freeNoticeHtml();
}

// 모드 토글 + 캐릭터 챗
const modeGameBtn = document.getElementById('modeGameBtn');
const modeChatBtn = document.getElementById('modeChatBtn');
const chatSetupEl = document.getElementById('chatSetup');
const chatEl = document.getElementById('chat');
const chatBarEl = document.getElementById('chatBar');
const chatModelBtn = document.getElementById('chatModelBtn');
const chatModelLabelEl = document.getElementById('chatModelLabel');
const chatEditBtn = document.getElementById('chatEditBtn');
const newChatBtn = document.getElementById('newChatBtn');
const chatLogEl = document.getElementById('chatLog');
const chatLogInnerEl = document.getElementById('chatLogInner');
const chatThinkingEl = document.getElementById('chatThinking');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
// 챗 설정 폼 (세계관 + 다중 캐릭터)
const cpTitleEl = document.getElementById('cpTitle');
const cpLoreEl = document.getElementById('cpLore');
const cpCharactersEl = document.getElementById('cpCharacters');
const cpAddCharBtn = document.getElementById('cpAddChar');
const cpScenarioEl = document.getElementById('cpScenario');
const cpGreetingEl = document.getElementById('cpGreeting');
const cpUserPersonaEl = document.getElementById('cpUserPersona');
const chatSetupErrorEl = document.getElementById('chatSetupError');
const cpCancelBtn = document.getElementById('cpCancel');
const cpSaveBtn = document.getElementById('cpSave');
// 공유/갤러리
const galleryEl = document.getElementById('gallery');
const galleryBtn = document.getElementById('galleryBtn');
const galleryListEl = document.getElementById('galleryList');
const adminPanelEl = document.getElementById('adminPanel');
const adminListEl = document.getElementById('adminList');
let amAdmin = false;

// 갤러리 정렬·태그 / 프로필 / 상세(댓글·추천)
const gallerySortEl = document.getElementById('gallerySort');
const galleryTagsEl = document.getElementById('galleryTags');
const profileEl = document.getElementById('profile');
const profileSubEl = document.getElementById('profileSub');
const profileTotalsEl = document.getElementById('profileTotals');
const profileListEl = document.getElementById('profileList');
const profileBtn = document.getElementById('profileBtn');
const profileCloseBtn = document.getElementById('profileClose');
const profileGalleryBtn = document.getElementById('profileGallery');
const detailModal = document.getElementById('detailModal');
const dtTitleEl = document.getElementById('dtTitle');
const dtMetaEl = document.getElementById('dtMeta');
const dtTagsEl = document.getElementById('dtTags');
const dtLikeBtn = document.getElementById('dtLike');
const dtLikeCountEl = document.getElementById('dtLikeCount');
const dtPlayBtn = document.getElementById('dtPlay');
const dtCommentsEl = document.getElementById('dtComments');
const dtCommentCountEl = document.getElementById('dtCommentCount');
const dtCommentInput = document.getElementById('dtCommentInput');
const dtCommentSend = document.getElementById('dtCommentSend');
const dtCloseBtn = document.getElementById('dtClose');
const cpTagsEl = document.getElementById('cpTags');
const cpTagSuggestEl = document.getElementById('cpTagSuggest');
let gallerySort = 'recent';
let galleryTag = '';
let detailItem = null;
const GENRE_SUGGEST = ['판타지', '로맨스', '미스터리', '호러', 'SF', '학원', '무협', '일상', '느와르', '코미디'];
const galleryCloseBtn = document.getElementById('galleryClose');
const cpVisibilityEl = document.getElementById('cpVisibility');
const cpPublishBtn = document.getElementById('cpPublish');
const cpPublishHintEl = document.getElementById('cpPublishHint');
const cpLengthEl = document.getElementById('cpLength');
const gmLengthRowEl = document.getElementById('gmLengthRow');
const gmLengthEl = document.getElementById('gmLength');
const cpImagesEl = document.getElementById('cpImages');
const cpImageFileEl = document.getElementById('cpImageFile');
const cpAddImageBtn = document.getElementById('cpAddImage');
let chatChars = [{ name: '', description: '' }]; // 설정 폼의 캐릭터 편집 상태
let chatImages = []; // 설정 폼의 이미지 편집 상태 [{id, tag, description}]
let pendingSetupAction = null; // 'save' | 'publish' | null — 설정 화면 이탈 여부 결정

let authMode = 'login'; // 'login' | 'signup'
let mySettings = null; // {provider, model, baseURL, keys:{provider:bool}}
let defaultModels = { gemini: '', anthropic: '' };
let knownModels = {}; // 제공자별 추천 모델 후보(키 없이도 표시)
let currentGameAi = { provider: 'gemini', model: '' }; // 활성 게임의 모델
let providersList = ['gemini', 'anthropic', 'openai', 'deepseek', 'xai', 'qwen', 'custom'];
let currentMode = null; // null(홈) | 'gm' | 'chat' — 접속 시 항상 홈에서 시작
let gmHasCharacter = false; // 게임 모드 화면 결정용
let currentChat = null; // 활성 챗 상태 {chatId, persona, configured, messages, ai}
let currentChatAi = { provider: 'gemini', model: '' };
let modelModalContext = 'gm'; // 모델 모달이 게임용인지 챗용인지
let chatBusy = false;
let chatInited = false; // 챗 데이터 최초 로드 여부
let streamBubble = null; // 스트리밍 중인 말풍선 요소
let streamText = ''; // 스트리밍 누적 텍스트

// 위저드 상태
let classesData = [];
let statKeys = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
let standardArray = [2, 1, 1, 0, -1, -1];
let currentStep = 1;
let selectedClass = null;
let statMode = 'recommend'; // 'recommend' | 'custom'
let customStats = null; // {STR:.., ...}
let selectedGearChoices = {}; // { groupId: optionId } 무기/방어구/장비 선택
const TOTAL_STEPS = 4;
let prevHp = null; // HP 변화 애니메이션용

let luAbility = null; // 선택한 능력치 key
let luMove = null; // 선택한 무브 id
let luNeedStat = false;
let luNeedMove = false;

// ---------- 소켓 핸들러 (로그인 후 연결) ----------
function wireSocket() {
  socket.on('init', (data) => {
    mySettings = data.settings || { provider: 'gemini', model: '', baseURL: '', keys: {} };
    if (!mySettings.keys) mySettings.keys = {};
    defaultModels = data.defaultModels || defaultModels;
    knownModels = data.knownModels || knownModels;
    if (Array.isArray(data.providers)) providersList = data.providers;
    if (data.freeLimit) freeLimitPerHour = data.freeLimit;
    // 서버에 로컬 AI가 설정된 경우에만 '무료 체험' 선택지를 노출
    const freeOn = providersList.includes('free');
    ['setFreeOpt', 'gmFreeOpt'].forEach((id) => {
      const o = document.getElementById(id);
      if (o) o.hidden = !freeOn;
    });
    if (data.username) userNameEl.textContent = data.username;
    amAdmin = !!data.isAdmin;
    if (adminPanelEl) adminPanelEl.classList.toggle('hidden', !amAdmin);
    userBarEl.classList.remove('hidden');
    // 모드/챗 상태 초기화(재접속·계정 전환 대비)
    currentMode = 'gm';
    chatInited = false;
    currentChat = null;
    modeGameBtn.classList.add('active');
    modeChatBtn.classList.remove('active');
    classesData = data.classes || [];
    if (Array.isArray(data.statKeys)) statKeys = data.statKeys;
    if (Array.isArray(data.standardArray)) standardArray = data.standardArray;
    renderClasses(classesData);
    applyGameState(data); // 상태만 반영(화면 전환은 안 함 — currentMode가 null이라)
    showHome(); // 접속/새로고침 시 항상 홈부터
    // 공유 링크(?play=<id>)로 들어온 경우 해당 정의를 바로 가져와 플레이
    const playId = new URLSearchParams(location.search).get('play');
    if (playId) {
      history.replaceState(null, '', location.pathname); // 주소 정리(중복 실행 방지)
      chatInited = true;
      setMode('chat');
      socket.emit('playPublished', { id: playId });
    }
    // 키가 하나도 없으면 설정을 먼저 열어 안내
    if (!Object.keys(mySettings.keys).length) openSettings(true);
  });

  // 활성 게임의 전체 상태를 화면에 반영(init/슬롯 전환/새 게임/삭제 공용).
  socket.on('slotSwitched', (data) => {
    closeLevelUp();
    clearSuggestions();
    closeSettings();
    gameModelModal.classList.add('hidden');
    applyGameState(data);
  });
  socket.on('slots', (data) => renderSlots(data));
  socket.on('gameModelUpdated', (ai) => {
    currentGameAi = ai || currentGameAi;
    updateGameModelLabel();
    updateModelNote();
  });

  // ===== 캐릭터 챗 =====
  socket.on('chats', (data) => renderChatBar(data));
  socket.on('chatState', (data) => applyChatState(data));
  // 스트리밍: 빈 말풍선을 만들고 조각이 올 때마다 이어 붙인다.
  socket.on('chatStreamStart', () => {
    streamBubble = appendChatMsg('assistant', '');
    streamText = '';
    scrollChat();
  });
  socket.on('chatChunk', ({ text }) => {
    if (!streamBubble) {
      streamBubble = appendChatMsg('assistant', '');
      streamText = '';
    }
    streamText += text;
    setBubbleText(streamBubble, streamText);
    scrollChat();
  });
  socket.on('chatMessage', (m) => {
    if (streamBubble) {
      // 최종본으로 교체(마커 제거·이미지 부착)
      finalizeBubble(streamBubble, m.content, m.imageId);
      streamBubble = null;
      streamText = '';
    } else {
      appendChatMsg(m.role, m.content, m.imageId);
    }
    scrollChat();
  });
  socket.on('chatThinking', ({ on }) => {
    chatThinkingEl.classList.toggle('hidden', !on);
    if (on) startThinking(chatThinkingEl, '상대가 입력 중', currentChatAi.provider);
    else stopThinking();
    setChatBusy(on);
  });
  socket.on('chatModelUpdated', (ai) => {
    currentChatAi = ai || currentChatAi;
    updateChatModelLabel();
  });
  socket.on('chatRollback', () => removeLastChatUserMsg());
  socket.on('reportDone', ({ count }) => alert(`신고가 접수되었습니다. (누적 ${count}건)`));
  socket.on('adminReports', ({ items }) => renderAdminReports(items));
  socket.on('profile', (data) => renderProfile(data));
  socket.on('comments', ({ id, items, me }) => renderComments(id, items, me));
  socket.on('likeUpdated', ({ id, likes, liked }) => {
    if (detailItem && detailItem.id === id) {
      detailItem.likes = likes;
      dtLikeCountEl.textContent = likes;
      dtLikeBtn.classList.toggle('liked', liked);
    }
    requestGallery();
  });
  socket.on('gallery', (data) => {
    if (data.sort) gallerySort = data.sort;
    if (typeof data.tag === 'string') galleryTag = data.tag;
    if (gallerySortEl) gallerySortEl.value = gallerySort;
    renderTagFilter(data.tags);
    renderGalleryList(galleryListEl, data.items, false);
    if (!profileEl.classList.contains('hidden')) return; // 프로필 보는 중이면 화면 유지
    showGallery();
  });

  socket.on('narration', (entry) => {
    afterDice(() => {
      renderLogEntry(entry);
      scrollLog();
    });
  });
  socket.on('dice', (entry) => animateDiceRoll(entry));
  socket.on('systemLog', (entry) => {
    afterDice(() => {
      renderLogEntry(entry);
      scrollLog();
    });
  });
  socket.on('stateUpdate', (character) => afterDice(() => updateStatus(character)));
  socket.on('fieldUpdate', ({ enemies, companions }) =>
    afterDice(() => renderField(enemies, companions))
  );
  socket.on('gmThinking', ({ on }) => {
    thinkingEl.classList.toggle('hidden', !on);
    if (on) startThinking(thinkingEl, 'GM이 이야기를 짜는 중', currentGameAi.provider);
    else stopThinking();
    setBusy(on);
  });
  socket.on('levelUp', (options) => openLevelUp(options));
  socket.on('levelUpDone', () => closeLevelUp());
  socket.on('gameOver', () => setGameOver(true));
  socket.on('suggestions', ({ items }) => renderSuggestions(items || []));
  socket.on('error', ({ message }) => {
    stopThinking();
    thinkingEl.classList.add('hidden');
    chatThinkingEl.classList.add('hidden');
    if (streamBubble) {
      streamBubble.remove(); // 실패한 부분 응답 제거
      streamBubble = null;
      streamText = '';
    }
    renderLogEntry({ kind: 'system', text: '⚠️ ' + message });
    scrollLog();
    setBusy(false);
    thinkingEl.classList.add('hidden');
  });
}

const PROVIDER_LABELS = {
  gemini: 'Gemini',
  anthropic: 'Claude',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  xai: 'Grok',
  qwen: 'Qwen',
  custom: '커스텀',
  free: '무료 체험',
};
const KEY_URLS = {
  gemini: { url: 'aistudio.google.com/apikey', note: '무료 키 발급 가능(카드 불필요)' },
  anthropic: { url: 'console.anthropic.com/settings/keys', note: '유료(선불 크레딧)' },
  openai: { url: 'platform.openai.com/api-keys', note: '유료' },
  deepseek: { url: 'platform.deepseek.com/api_keys', note: '유료(저렴)' },
  xai: { url: 'console.x.ai', note: '유료' },
  qwen: { url: 'bailian.console.alibabacloud.com', note: '유료(신규 무료 크레딧 제공)' },
  custom: { url: 'Ollama/LM Studio 등', note: '자체 호스팅은 키가 필요 없을 수 있음(비우면 됨)' },
  free: { url: '발급 불필요', note: '서버의 로컬 AI로 무료 체험 (느리고 사용량 제한 있음)' },
};

/** 활성 게임의 제공자에 키가 등록돼 있는지. custom은 baseURL 기준. */
function providerReady(prov) {
  if (!mySettings) return false;
  if (prov === 'custom') return !!(mySettings.baseURL && mySettings.baseURL.trim());
  return !!(mySettings.keys && mySettings.keys[prov]);
}

function updateModelNote() {
  const prov = currentGameAi.provider || 'gemini';
  const model = currentGameAi.model || defaultModels[prov] || '기본';
  const pname = PROVIDER_LABELS[prov] || prov;
  modelNote.textContent = `${pname} · ${model}${providerReady(prov) ? '' : ' · ⚠ 키 미등록'}`;
}

/** 로그 헤더의 🧠 버튼 라벨 = 현재 게임의 제공자·모델. */
function updateGameModelLabel() {
  const prov = currentGameAi.provider || 'gemini';
  const model = currentGameAi.model || defaultModels[prov] || '기본';
  gameModelLabelEl.textContent = `${PROVIDER_LABELS[prov] || prov} · ${model}`;
  gameModelBtn.classList.toggle('warn', !providerReady(prov));
}

/** init/slotSwitched 공용: 한 게임의 전체 상태를 렌더. */
function applyGameState(data) {
  prevHp = null;
  // 주사위 보류 상태 초기화(다른 게임의 잔여 큐가 섞이지 않도록)
  diceAnimating = false;
  postDiceQueue.length = 0;
  currentGameAi = data.ai || currentGameAi;
  updateGameModelLabel();
  updateModelNote();
  closeLevelUp();
  clearSuggestions();
  gmHasCharacter = !!data.hasCharacter;
  if (data.hasCharacter) {
    if (data.character) updateStatus(data.character);
    renderField(data.enemies || [], data.companions || []);
    logInnerEl.innerHTML = '';
    (data.log || []).forEach(renderLogEntry);
    scrollLog();
    setGameOver(!!data.dead);
    if (data.pendingLevelUp) openLevelUp(data.pendingLevelUp);
    if (currentMode === 'gm') showGame();
  } else {
    setGameOver(false);
    resetWizard();
    if (currentMode === 'gm') showSetup();
  }
}

/** 슬롯 칩들을 렌더. */
function renderSlots(data) {
  if (!data || !slotBarEl) return;
  slotBarEl.innerHTML = '';
  (data.slots || []).forEach((s) => {
    const chip = document.createElement('div');
    chip.className = 'slot-chip' + (s.id === data.activeId ? ' active' : '');
    const label = s.hasCharacter
      ? `${s.name || '모험가'}${s.dead ? ' ☠️' : ''} · ${s.className || ''} Lv${s.level || 1}`
      : '빈 슬롯 (새 모험)';
    const btn = document.createElement('button');
    btn.className = 'slot-main';
    btn.textContent = label;
    btn.title = '이 게임으로 전환';
    btn.addEventListener('click', () => {
      if (s.id !== data.activeId) socket.emit('switchSlot', { id: s.id });
    });
    chip.appendChild(btn);
    // 삭제 버튼 (슬롯이 2개 이상일 때만 노출)
    if ((data.slots || []).length > 1) {
      const del = document.createElement('button');
      del.className = 'slot-del';
      del.textContent = '✕';
      del.title = '이 게임 삭제';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        const nm = s.hasCharacter ? `"${s.name || '이 게임'}"` : '이 빈 슬롯';
        if (confirm(`${nm}을(를) 삭제할까요? 되돌릴 수 없습니다.`)) socket.emit('deleteSlot', { id: s.id });
      });
      chip.appendChild(del);
    }
    slotBarEl.appendChild(chip);
  });
  // 새 게임 버튼 활성/비활성 (최대치)
  const full = (data.slots || []).length >= (data.max || 3);
  newGameBtn.disabled = full;
  newGameBtn.title = full ? `게임은 최대 ${data.max || 3}개까지 저장됩니다` : '새 게임 슬롯 만들기';
}

// ---------- 캐릭터 챗 ----------
function updateChatModelLabel() {
  const prov = currentChatAi.provider || 'gemini';
  const model = currentChatAi.model || defaultModels[prov] || '기본';
  chatModelLabelEl.textContent = `${PROVIDER_LABELS[prov] || prov} · ${model}`;
  chatModelBtn.classList.toggle('warn', !providerReady(prov));
}

function setChatBusy(busy) {
  chatBusy = busy;
  chatSendBtn.disabled = busy;
  chatInput.disabled = busy;
  if (!busy) chatInput.focus();
}

function scrollChat() {
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

/** 챗 메시지 버블 추가. role: 'user' | 'assistant'. @returns 생성된 요소 */
function appendChatMsg(role, content, imageId) {
  const div = document.createElement('div');
  div.className = 'entry ' + (role === 'user' ? 'player' : 'gm');
  if (imageId) {
    const img = document.createElement('img');
    img.className = 'chat-img';
    img.src = `/img/${imageId}`;
    img.alt = '장면 이미지';
    img.loading = 'lazy';
    div.appendChild(img);
  }
  const p = document.createElement('div');
  p.className = 'msg-text';
  p.textContent = content;
  div.appendChild(p);
  chatLogInnerEl.appendChild(div);
  return div;
}

/** 스트리밍 중 본문만 갱신. */
function setBubbleText(bubble, text) {
  const p = bubble.querySelector('.msg-text');
  if (p) p.textContent = text;
}

/** 스트리밍 종료 — 정리된 본문으로 교체하고 필요하면 이미지를 붙인다. */
function finalizeBubble(bubble, content, imageId) {
  setBubbleText(bubble, content);
  if (imageId && !bubble.querySelector('.chat-img')) {
    const img = document.createElement('img');
    img.className = 'chat-img';
    img.src = `/img/${imageId}`;
    img.alt = '장면 이미지';
    img.loading = 'lazy';
    bubble.insertBefore(img, bubble.firstChild);
  }
}

/** 응답 실패 시 방금 보낸 사용자 버블 제거(재전송 가능). */
function removeLastChatUserMsg() {
  const kids = chatLogInnerEl.querySelectorAll('.entry.player');
  const last = kids[kids.length - 1];
  if (last) last.remove();
}

/** 챗 목록 칩 렌더. */
function renderChatBar(data) {
  if (!data || !chatBarEl) return;
  chatBarEl.innerHTML = '';
  (data.chats || []).forEach((c) => {
    const chip = document.createElement('div');
    chip.className = 'slot-chip' + (c.id === data.activeId ? ' active' : '');
    const btn = document.createElement('button');
    btn.className = 'slot-main';
    btn.textContent = c.configured ? c.name : '설정 안 된 캐릭터';
    btn.title = '이 캐릭터로 전환';
    btn.addEventListener('click', () => {
      if (c.id !== data.activeId) socket.emit('switchChat', { id: c.id });
    });
    chip.appendChild(btn);
    if ((data.chats || []).length > 1) {
      const del = document.createElement('button');
      del.className = 'slot-del';
      del.textContent = '✕';
      del.title = '이 캐릭터 삭제';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`"${c.name || '이 캐릭터'}"을(를) 삭제할까요? 대화도 함께 지워집니다.`)) {
          socket.emit('deleteChat', { id: c.id });
        }
      });
      chip.appendChild(del);
    }
    chatBarEl.appendChild(chip);
  });
  const full = (data.chats || []).length >= (data.max || 12);
  newChatBtn.disabled = full;
  newChatBtn.title = full ? `캐릭터는 최대 ${data.max || 12}개까지 저장됩니다` : '새 캐릭터 만들기';
}

/** 활성 챗 상태를 반영. data가 null이면 챗 없음. */
function applyChatState(data) {
  currentChat = data;
  if (data) {
    currentChatAi = data.ai || currentChatAi;
    updateChatModelLabel();
  }
  if (currentMode !== 'chat') return; // 챗 모드일 때만 화면 전환
  if (!data) {
    // 챗이 하나도 없음 → 새로 하나 만들어 설정 폼으로
    socket.emit('newChat');
    return;
  }
  // 설정 화면에서 '공개 적용' 중이면 화면을 유지하고 공개 상태만 갱신(공유 링크 확인용)
  if (!chatSetupEl.classList.contains('hidden') && pendingSetupAction !== 'save') {
    updatePublishHint(data.published);
    return;
  }
  pendingSetupAction = null;
  if (!data.configured) {
    openChatSetupForm(data);
  } else {
    chatLogInnerEl.innerHTML = '';
    (data.messages || []).forEach((m) => appendChatMsg(m.role, m.content, m.imageId));
    setChatBusy(false);
    // 남이 만든 세계관은 설정을 수정할 수 없음 → 편집 버튼 숨김
    chatEditBtn.classList.toggle('hidden', !!data.readOnly);
    showChat();
    scrollChat();
  }
}

/** 캐릭터 편집 행들을 렌더(이름 + 설명 + 삭제). */
function renderCharEditors() {
  cpCharactersEl.innerHTML = '';
  chatChars.forEach((ch, i) => {
    const row = document.createElement('div');
    row.className = 'cp-char';
    const head = document.createElement('div');
    head.className = 'cp-char-head';
    const nameIn = document.createElement('input');
    nameIn.type = 'text';
    nameIn.maxLength = 60;
    nameIn.placeholder = `캐릭터 ${i + 1} 이름`;
    nameIn.value = ch.name;
    nameIn.addEventListener('input', () => (chatChars[i].name = nameIn.value));
    head.appendChild(nameIn);
    if (chatChars.length > 1) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'cp-char-del';
      del.textContent = '✕';
      del.title = '이 캐릭터 삭제';
      del.addEventListener('click', () => {
        chatChars.splice(i, 1);
        renderCharEditors();
      });
      head.appendChild(del);
    }
    const desc = document.createElement('textarea');
    desc.rows = 3;
    desc.placeholder = '성격 · 말투 · 외형 · 배경';
    desc.value = ch.description;
    desc.addEventListener('input', () => (chatChars[i].description = desc.value));
    row.appendChild(head);
    row.appendChild(desc);
    cpCharactersEl.appendChild(row);
  });
}

const VIS_LABEL = { private: '🔒 비공개', link: '🔗 링크 공개', public: '🌐 전체 공개' };

/** 갤러리 카드 목록 렌더. mine=true면 내 항목(공개 범위 표시). */
function renderGalleryList(el, items, mine) {
  el.innerHTML = '';
  if (!items || !items.length) {
    const d = document.createElement('div');
    d.className = 'gallery-empty';
    d.textContent = mine ? '아직 공개한 것이 없어요.' : '아직 공개된 것이 없어요. 처음으로 공개해보세요!';
    el.appendChild(d);
    return;
  }
  items.forEach((it) => {
    const card = document.createElement('div');
    card.className = 'gallery-card-item';
    if (it.coverImageId) {
      const img = document.createElement('img');
      img.src = `/img/${it.coverImageId}`;
      img.alt = it.title;
      img.loading = 'lazy';
      card.appendChild(img);
    }
    const body = document.createElement('div');
    body.className = 'gi-body';
    const meta = [
      `by ${it.ownerName}`,
      `♥ ${it.likes || 0}`,
      `💬 ${it.commentCount || 0}`,
      `플레이 ${it.plays}`,
      it.tags && it.tags.length ? it.tags.map((t) => '#' + t).join(' ') : null,
      mine ? VIS_LABEL[it.visibility] : null,
    ]
      .filter(Boolean)
      .join(' · ');
    body.innerHTML =
      `<div class="gi-title"></div><div class="gi-meta"></div><div class="gi-sum"></div>`;
    body.querySelector('.gi-title').textContent = it.title;
    body.querySelector('.gi-meta').textContent = meta;
    body.querySelector('.gi-sum').textContent = (it.characters || []).join(', ');
    card.appendChild(body);
    const play = document.createElement('button');
    play.className = 'primary gi-play';
    play.textContent = '플레이';
    play.addEventListener('click', () => socket.emit('playPublished', { id: it.id }));
    card.appendChild(play);
    const detail = document.createElement('button');
    detail.className = 'ghost gi-play';
    detail.textContent = '💬 상세';
    detail.title = '태그 · 추천 · 댓글 보기';
    detail.addEventListener('click', () => openDetail(it));
    card.appendChild(detail);
    if (!mine) {
      const rep = document.createElement('button');
      rep.className = 'ghost gi-play';
      rep.textContent = '🚩 신고';
      rep.title = '부적절한 내용 신고';
      rep.addEventListener('click', () => {
        const reason = prompt(`"${it.title}"을(를) 신고하는 이유를 적어주세요.`);
        if (reason === null) return;
        socket.emit('reportPublished', { id: it.id, reason });
      });
      card.appendChild(rep);
    }
    if (mine) {
      const un = document.createElement('button');
      un.className = 'ghost gi-play';
      un.textContent = '공개 중단';
      un.addEventListener('click', () => {
        if (confirm(`"${it.title}" 공개를 중단할까요? 갤러리에서 사라집니다.`)) {
          socket.emit('unpublishById', { id: it.id });
        }
      });
      card.appendChild(un);
    }
    el.appendChild(card);
  });
}

// ---------- "응답 생성 중" 표시 (경과 시간 + 애니메이션) ----------
// 로컬 모델은 수십 초가 걸려서, 살아있다는 신호가 없으면 멈춘 것처럼 보인다.
let thinkTimer = null;
function startThinking(el, baseText, provider) {
  stopThinking();
  if (!el) return;
  const t0 = Date.now();
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const render = () => {
    const sec = Math.floor((Date.now() - t0) / 1000);
    i = (i + 1) % frames.length;
    let txt = `${frames[i]} ${baseText}… ${sec}초`;
    if (provider === 'free') {
      if (sec >= 8) txt += ' · 무료 체험(서버 로컬 AI)은 응답이 느립니다. 정상 동작 중이에요.';
    } else if (sec >= 25) {
      txt += ' · 평소보다 오래 걸리고 있어요.';
    }
    el.textContent = txt;
  };
  render();
  thinkTimer = setInterval(render, 120);
}
function stopThinking() {
  if (thinkTimer) {
    clearInterval(thinkTimer);
    thinkTimer = null;
  }
}

/** 갤러리 태그 필터 칩 렌더. */
function renderTagFilter(tags) {
  if (!galleryTagsEl) return;
  galleryTagsEl.innerHTML = '';
  const all = document.createElement('button');
  all.className = 'tag-chip' + (galleryTag ? '' : ' active');
  all.textContent = '전체';
  all.addEventListener('click', () => {
    galleryTag = '';
    requestGallery();
  });
  galleryTagsEl.appendChild(all);
  (tags || []).forEach((t) => {
    const b = document.createElement('button');
    b.className = 'tag-chip' + (galleryTag === t.tag ? ' active' : '');
    b.textContent = `#${t.tag} ${t.count}`;
    b.addEventListener('click', () => {
      galleryTag = galleryTag === t.tag ? '' : t.tag;
      requestGallery();
    });
    galleryTagsEl.appendChild(b);
  });
}

function requestGallery() {
  socket.emit('galleryList', { sort: gallerySort, tag: galleryTag });
}

/** 내 프로필 렌더. */
function renderProfile(data) {
  if (!profileListEl) return;
  profileSubEl.textContent = `${data.username || ''} 님이 공개한 작품입니다.`;
  if (data.totals) {
    profileTotalsEl.innerHTML = '';
    [
      ['작품', data.totals.works],
      ['♥ 추천', data.totals.likes],
      ['플레이', data.totals.plays],
      ['댓글', data.totals.comments],
    ].forEach(([k, v]) => {
      const d = document.createElement('div');
      d.className = 'pt-item';
      d.innerHTML = `<div class="pt-num"></div><div class="pt-key"></div>`;
      d.querySelector('.pt-num').textContent = v;
      d.querySelector('.pt-key').textContent = k;
      profileTotalsEl.appendChild(d);
    });
  }
  renderGalleryList(profileListEl, data.mine || [], true);
}

/** 작품 상세(태그·추천·댓글) 모달 열기. */
function openDetail(it) {
  detailItem = it;
  dtTitleEl.textContent = it.title;
  dtMetaEl.textContent = [
    `by ${it.ownerName}`,
    it.characterCount ? `캐릭터 ${it.characterCount}` : null,
    it.imageCount ? `이미지 ${it.imageCount}` : null,
    `플레이 ${it.plays}`,
  ]
    .filter(Boolean)
    .join(' · ');
  dtTagsEl.innerHTML = '';
  (it.tags || []).forEach((t) => {
    const s = document.createElement('span');
    s.className = 'tag-chip static';
    s.textContent = `#${t}`;
    dtTagsEl.appendChild(s);
  });
  dtLikeCountEl.textContent = it.likes || 0;
  detailModal.classList.remove('hidden');
  socket.emit('loadComments', { id: it.id });
}

/** 댓글 목록 렌더. */
function renderComments(id, items, me) {
  if (!detailItem || detailItem.id !== id) return;
  dtCommentCountEl.textContent = `(${items.length})`;
  dtCommentsEl.innerHTML = '';
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = '아직 댓글이 없습니다.';
    dtCommentsEl.appendChild(p);
    return;
  }
  items.forEach((c) => {
    const d = document.createElement('div');
    d.className = 'comment';
    const head = document.createElement('div');
    head.className = 'c-head';
    head.textContent = `${c.userName} · ${String(c.at).slice(0, 10)}`;
    const body = document.createElement('div');
    body.className = 'c-body';
    body.textContent = c.text;
    d.appendChild(head);
    d.appendChild(body);
    if (c.userId === me || amAdmin || (detailItem && detailItem.ownerName === userNameEl.textContent)) {
      const del = document.createElement('button');
      del.className = 'c-del';
      del.textContent = '삭제';
      del.addEventListener('click', () => {
        if (confirm('이 댓글을 삭제할까요?')) {
          socket.emit('deleteComment', { id, commentId: c.id });
        }
      });
      d.appendChild(del);
    }
    dtCommentsEl.appendChild(d);
  });
}

/** 운영자용 신고 목록 렌더. */
function renderAdminReports(items) {
  if (!adminListEl) return;
  adminListEl.innerHTML = '';
  if (!items || !items.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = '신고된 항목이 없습니다.';
    adminListEl.appendChild(p);
    return;
  }
  items.forEach((it) => {
    const card = document.createElement('div');
    card.className = 'gallery-card-item';
    const body = document.createElement('div');
    body.className = 'gi-body';
    body.innerHTML = `<div class="gi-title"></div><div class="gi-meta"></div><div class="gi-sum"></div>`;
    body.querySelector('.gi-title').textContent = `🚩 ${it.reportCount}건 · ${it.title}`;
    body.querySelector('.gi-meta').textContent =
      `by ${it.ownerName} · ${VIS_LABEL[it.visibility] || it.visibility}${it.blocked ? ' · 차단됨' : ''}`;
    body.querySelector('.gi-sum').textContent = (it.reasons || []).join(' / ') || '(사유 없음)';
    card.appendChild(body);
    const act = (label, action, confirmMsg) => {
      const b = document.createElement('button');
      b.className = 'ghost gi-play';
      b.textContent = label;
      b.addEventListener('click', () => {
        if (confirmMsg && !confirm(confirmMsg)) return;
        socket.emit('adminAction', { id: it.id, action });
      });
      card.appendChild(b);
    };
    if (it.blocked) act('차단 해제', 'unblock');
    else act('차단', 'block', `"${it.title}"을(를) 차단할까요? 비공개로 내려가고 재공개가 막힙니다.`);
    act('삭제', 'delete', `"${it.title}"을(를) 완전히 삭제할까요? 되돌릴 수 없습니다.`);
    act('신고 무시', 'clear');
    adminListEl.appendChild(card);
  });
}

/** 설정 폼의 공개 상태 표시 갱신. */
function updatePublishHint(published) {
  if (published && published.visibility && published.visibility !== 'private') {
    cpVisibilityEl.value = published.visibility;
    const link = `${location.origin}/?play=${published.id}`;
    cpPublishHintEl.innerHTML =
      `${VIS_LABEL[published.visibility]} 중 · 플레이 ${published.plays || 0}회<br />` +
      `공유 링크: <b>${escapeHtml(link)}</b>`;
  } else {
    cpVisibilityEl.value = 'private';
    cpPublishHintEl.textContent = '공개하면 다른 사용자가 각자 자기 대화로 플레이할 수 있어요.';
  }
}

/** 업로드된 이미지 목록(썸네일 + 태그 + 설명 + 삭제) 렌더. */
function renderImageEditors() {
  cpImagesEl.innerHTML = '';
  chatImages.forEach((im, i) => {
    const row = document.createElement('div');
    row.className = 'cp-image';
    const thumb = document.createElement('img');
    thumb.src = `/img/${im.id}`;
    thumb.alt = im.tag || '이미지';
    row.appendChild(thumb);

    const fields = document.createElement('div');
    fields.className = 'cp-image-fields';
    const tagIn = document.createElement('input');
    tagIn.type = 'text';
    tagIn.maxLength = 40;
    tagIn.placeholder = '태그 (예: 루나-미소)';
    tagIn.value = im.tag;
    tagIn.addEventListener('input', () => (chatImages[i].tag = tagIn.value));
    const descIn = document.createElement('input');
    descIn.type = 'text';
    descIn.maxLength = 200;
    descIn.placeholder = '언제 보여줄지 설명 (선택)';
    descIn.value = im.description;
    descIn.addEventListener('input', () => (chatImages[i].description = descIn.value));
    fields.appendChild(tagIn);
    fields.appendChild(descIn);
    row.appendChild(fields);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'cp-char-del';
    del.textContent = '✕';
    del.title = '이 이미지 빼기';
    del.addEventListener('click', () => {
      chatImages.splice(i, 1);
      renderImageEditors();
    });
    row.appendChild(del);
    cpImagesEl.appendChild(row);
  });
}

/** 파일을 data URL로 읽어 업로드하고 목록에 추가. */
function uploadImageFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  chatSetupErrorEl.classList.add('hidden');
  list.forEach((file) => {
    if (chatImages.length >= 16) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = await api('/api/upload', { dataUrl: reader.result });
        chatImages.push({ id: data.id, tag: '', description: '' });
        renderImageEditors();
      } catch (e) {
        chatSetupErrorEl.textContent = `이미지 업로드 실패: ${e.message}`;
        chatSetupErrorEl.classList.remove('hidden');
      }
    };
    reader.readAsDataURL(file);
  });
}

/** 챗 설정 폼을 현재 정의로 채우고 표시(편집/신규 공용). */
function openChatSetupForm(data) {
  const d = (data && data.def) || {};
  cpTitleEl.value = d.worldTitle || '';
  cpLoreEl.value = d.worldLore || '';
  chatChars = (d.characters && d.characters.length)
    ? d.characters.map((c) => ({ name: c.name || '', description: c.description || '' }))
    : [{ name: '', description: '' }];
  renderCharEditors();
  chatImages = (d.images || []).map((im) => ({
    id: im.id,
    tag: im.tag || '',
    description: im.description || '',
  }));
  renderImageEditors();
  cpScenarioEl.value = d.scenario || '';
  cpGreetingEl.value = d.greeting || '';
  cpUserPersonaEl.value = d.userPersona || '';
  cpLengthEl.value = d.responseLength || 'medium';
  cpTagsEl.value = (d.tags || []).join(', ');
  renderTagSuggestions();
  updatePublishHint(data && data.published);
  chatSetupErrorEl.classList.add('hidden');
  showChatSetup();
}

function collectDef() {
  return {
    worldTitle: cpTitleEl.value.trim(),
    worldLore: cpLoreEl.value.trim(),
    characters: chatChars
      .map((c) => ({ name: (c.name || '').trim(), description: (c.description || '').trim() }))
      .filter((c) => c.name),
    images: chatImages
      .map((im) => ({ id: im.id, tag: (im.tag || '').trim(), description: (im.description || '').trim() }))
      .filter((im) => im.id && im.tag),
    scenario: cpScenarioEl.value.trim(),
    greeting: cpGreetingEl.value.trim(),
    userPersona: cpUserPersonaEl.value.trim(),
    responseLength: cpLengthEl.value, // 제작자 권장 출력량
    tags: cpTagsEl.value
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean)
      .slice(0, 6),
  };
}

/** 장르 추천 칩 — 클릭하면 태그 입력에 추가. */
function renderTagSuggestions() {
  if (!cpTagSuggestEl) return;
  cpTagSuggestEl.innerHTML = '';
  GENRE_SUGGEST.forEach((g) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tag-chip';
    b.textContent = `#${g}`;
    b.addEventListener('click', () => {
      const cur = cpTagsEl.value.split(',').map((t) => t.trim()).filter(Boolean);
      if (cur.includes(g)) return;
      if (cur.length >= 6) return;
      cur.push(g);
      cpTagsEl.value = cur.join(', ');
    });
    cpTagSuggestEl.appendChild(b);
  });
}

// ---------- 화면 전환 ----------
const bgVideo = document.getElementById('bgVideo');
// 랜딩 배경 앰비언트 클립 4종 — 접속(로드)마다 랜덤 1개 선택.
const BG_VIDEOS = ['assets/intro1.mp4', 'assets/intro2.mp4', 'assets/intro3.mp4', 'assets/intro4.mp4'];
if (bgVideo) {
  bgVideo.src = BG_VIDEOS[Math.floor(Math.random() * BG_VIDEOS.length)];
  bgVideo.play().catch(() => {});
}
/** 랜딩(로그인·생성) 화면에서만 배경 영상 재생, 게임 중엔 정지. */
function setLandingBg(on) {
  document.body.classList.toggle('in-game', !on);
  if (!bgVideo) return;
  if (on) bgVideo.play().catch(() => {});
  else bgVideo.pause();
}
const homeEl = document.getElementById('home');
function hideAllScreens() {
  [authEl, setupEl, gameEl, chatSetupEl, chatEl, galleryEl, homeEl, profileEl].forEach(
    (e) => e && e.classList.add('hidden')
  );
}
/** 홈(모드 선택) — 로그인 후 항상 여기서 시작한다. */
function showHome() {
  currentMode = null;
  modeGameBtn.classList.remove('active');
  modeChatBtn.classList.remove('active');
  hideAllScreens();
  homeEl.classList.remove('hidden');
  setLandingBg(true);
}
function showGallery() {
  hideAllScreens();
  galleryEl.classList.remove('hidden');
  setLandingBg(true);
}
function showAuth() {
  hideAllScreens();
  authEl.classList.remove('hidden');
  userBarEl.classList.add('hidden');
  setLandingBg(true);
}
function showSetup() {
  hideAllScreens();
  setupEl.classList.remove('hidden');
  setLandingBg(true);
}
function showGame() {
  hideAllScreens();
  gameEl.classList.remove('hidden');
  setLandingBg(false);
}
function showChatSetup() {
  hideAllScreens();
  chatSetupEl.classList.remove('hidden');
  setLandingBg(true);
}
function showChat() {
  hideAllScreens();
  chatEl.classList.remove('hidden');
  setLandingBg(false);
}

/** 게임 ↔ 챗 모드 전환. */
function setMode(mode) {
  currentMode = mode;
  modeGameBtn.classList.toggle('active', mode === 'gm');
  modeChatBtn.classList.toggle('active', mode === 'chat');
  if (mode === 'gm') {
    if (gmHasCharacter) showGame();
    else showSetup();
  } else {
    // 챗 데이터는 처음 진입할 때 로드(지연). 이후엔 현재 상태로 화면 전환.
    if (!chatInited) {
      chatInited = true;
      socket.emit('chatInit');
    } else {
      applyChatState(currentChat);
    }
  }
}

// ---------- 캐릭터 생성 (위저드) ----------
function getClass(id) {
  return classesData.find((c) => c.id === id);
}

function resetWizard() {
  currentStep = 1;
  selectedClass = null;
  statMode = 'recommend';
  customStats = null;
  selectedGearChoices = {};
  charNameEl.value = '';
  charLookEl.value = '';
  startBtn.disabled = false;
  document
    .querySelectorAll('.class-card')
    .forEach((el) => el.classList.remove('selected'));
  goToStep(1);
}

function renderClasses(classes) {
  classListEl.innerHTML = '';
  classes.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'class-card';
    div.dataset.id = c.id;
    const statLine = statKeys
      .map((k) => `${k} ${fmtMod(c.stats[k])}`)
      .join('  ');
    const moveNames = (c.moves || []).map((m) => m.name).join(', ');
    div.innerHTML = `<div class="cname">${c.name}</div>
      <div class="cdesc">${c.description}</div>
      <div class="cstats">HP ${c.maxHp} · 피해 d${c.damageDie} · ${statLine}</div>
      <div class="cmoves">배울 기술: ${moveNames}</div>`;
    div.addEventListener('click', () => {
      document
        .querySelectorAll('.class-card')
        .forEach((el) => el.classList.remove('selected'));
      div.classList.add('selected');
      selectedClass = c.id;
      customStats = null; // 클래스 바뀌면 배분 초기화
      selectedGearChoices = {}; // 클래스 바뀌면 장비 선택 초기화
      updateNav();
    });
    classListEl.appendChild(div);
  });
}

function goToStep(step) {
  currentStep = step;
  document.querySelectorAll('.step-panel').forEach((p) => {
    p.classList.toggle('hidden', Number(p.dataset.panel) !== step);
  });
  document.querySelectorAll('.step').forEach((s) => {
    const n = Number(s.dataset.step);
    s.classList.toggle('active', n === step);
    s.classList.toggle('done', n < step);
  });
  if (step === 2) renderStatAssign();
  if (step === 3) renderGear();
  if (step === 4) renderSheetSummary();
  updateNav();
}

function updateNav() {
  prevBtn.classList.toggle('hidden', currentStep === 1);
  nextBtn.classList.toggle('hidden', currentStep === TOTAL_STEPS);
  startBtn.classList.toggle('hidden', currentStep !== TOTAL_STEPS);

  let ok = true;
  if (currentStep === 1) ok = !!selectedClass;
  if (currentStep === 2) ok = statMode === 'recommend' || isCustomValid();
  if (currentStep === 3) {
    const groups = getClass(selectedClass)?.gearChoices || [];
    ok = groups.every((g) => selectedGearChoices[g.id]);
  }
  if (currentStep === 4) ok = charNameEl.value.trim().length > 0;
  nextBtn.disabled = !ok;
  startBtn.disabled = !ok;
}

// --- 장비 선택 (무기/방어구/장비 그룹) + 배울 기술 ---
function computeArmor(cls) {
  let armor = 0;
  (cls.gearChoices || []).forEach((g) => {
    const opt = g.options.find((o) => o.id === selectedGearChoices[g.id]);
    if (opt && typeof opt.armor === 'number') armor += opt.armor;
  });
  return armor;
}

function renderGear() {
  const cls = getClass(selectedClass);
  if (!cls) return;

  // 각 그룹 기본 선택(첫 옵션)
  (cls.gearChoices || []).forEach((g) => {
    if (!selectedGearChoices[g.id]) selectedGearChoices[g.id] = g.options[0].id;
  });

  baseGearEl.innerHTML = `<span class="bg-label">기본 장비:</span> ${cls.baseGear.join(', ')}`;
  gearHintEl.textContent = '무기·방어구·추가 장비를 하나씩 고르세요. 방어구 선택에 따라 방어력이 달라집니다.';
  gearCountEl.textContent = '';

  gearOptionsEl.innerHTML = '';
  (cls.gearChoices || []).forEach((group) => {
    const wrap = document.createElement('div');
    wrap.className = 'gear-group';
    const title = document.createElement('div');
    title.className = 'gear-group-title';
    title.textContent = group.label;
    wrap.appendChild(title);
    const opts = document.createElement('div');
    opts.className = 'gear-group-opts';
    group.options.forEach((o) => {
      const chip = document.createElement('div');
      const picked = selectedGearChoices[group.id] === o.id;
      chip.className = 'gear-chip' + (picked ? ' selected' : '');
      const tagHtml =
        o.tags && o.tags.length
          ? `<div class="gear-tags">${o.tags.map(escapeHtml).join(' · ')}</div>`
          : '';
      chip.innerHTML = escapeHtml(o.name) + tagHtml;
      chip.addEventListener('click', () => {
        selectedGearChoices[group.id] = o.id;
        renderGear();
        updateNav();
      });
      opts.appendChild(chip);
    });
    wrap.appendChild(opts);
    gearOptionsEl.appendChild(wrap);
  });

  // 현재 방어력 미리보기
  const armorNote = document.createElement('div');
  armorNote.className = 'gear-armor-note';
  armorNote.textContent = `현재 방어력: ${computeArmor(cls)}`;
  gearOptionsEl.appendChild(armorNote);

  // 배울 수 있는 기술
  learnMovesEl.innerHTML = '';
  (cls.moves || []).forEach((m) => {
    const div = document.createElement('div');
    div.className = 'learn-move';
    div.innerHTML = `<div class="lm-name">${m.name}</div><div class="lm-desc">${m.desc}</div>`;
    learnMovesEl.appendChild(div);
  });
}

// --- 능력치 배분 ---
function renderStatAssign() {
  const cls = getClass(selectedClass);
  if (!cls) return;
  const recommend = statMode === 'recommend';
  modeRecommend.classList.toggle('active', recommend);
  modeCustom.classList.toggle('active', !recommend);

  if (recommend) {
    statHintEl.classList.remove('error');
    statHintEl.textContent = `${cls.name}의 추천 능력치입니다.`;
    statAssignEl.innerHTML = '';
    statKeys.forEach((k) => {
      const row = document.createElement('div');
      row.className = 'srow';
      row.innerHTML = `<div class="k">${k}</div><div class="v">${fmtMod(cls.stats[k])}</div>`;
      statAssignEl.appendChild(row);
    });
    return;
  }

  // custom: 표준 배열을 각 능력치에 배치
  if (!customStats) customStats = { ...cls.stats };
  const distinct = [...new Set(standardArray)].sort((a, b) => b - a);
  statAssignEl.innerHTML = '';
  statKeys.forEach((k) => {
    const row = document.createElement('div');
    row.className = 'srow';
    const opts = distinct
      .map((v) => `<option value="${v}"${customStats[k] === v ? ' selected' : ''}>${fmtMod(v)}</option>`)
      .join('');
    row.innerHTML = `<div class="k">${k}</div><select data-k="${k}">${opts}</select>`;
    row.querySelector('select').addEventListener('change', (e) => {
      customStats[k] = Number(e.target.value);
      updateCustomHint();
      updateNav();
    });
    statAssignEl.appendChild(row);
  });
  updateCustomHint();
}

function neededCounts() {
  const counts = {};
  standardArray.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
  return counts;
}

function isCustomValid() {
  if (!customStats) return false;
  const need = neededCounts();
  const have = {};
  statKeys.forEach((k) => (have[customStats[k]] = (have[customStats[k]] || 0) + 1));
  return Object.keys(need).every((v) => have[v] === need[v]) &&
    Object.keys(have).length === Object.keys(need).length;
}

function updateCustomHint() {
  const need = neededCounts();
  const have = {};
  statKeys.forEach((k) => (have[customStats[k]] = (have[customStats[k]] || 0) + 1));
  if (isCustomValid()) {
    statHintEl.classList.remove('error');
    statHintEl.textContent = '유효한 배치입니다. (표준 배열 사용)';
  } else {
    const parts = Object.keys(need)
      .sort((a, b) => b - a)
      .map((v) => `${fmtMod(Number(v))}×${need[v]}`)
      .join(', ');
    statHintEl.classList.add('error');
    statHintEl.textContent = `표준 배열을 정확히 사용하세요: ${parts}`;
  }
}

modeRecommend.addEventListener('click', () => {
  statMode = 'recommend';
  renderStatAssign();
  updateNav();
});
modeCustom.addEventListener('click', () => {
  statMode = 'custom';
  renderStatAssign();
  updateNav();
});

// --- 시트 요약 ---
function renderSheetSummary() {
  const cls = getClass(selectedClass);
  if (!cls) return;
  const stats = statMode === 'custom' && customStats ? customStats : cls.stats;
  const statLine = statKeys.map((k) => `${k} ${fmtMod(stats[k])}`).join('  ');
  const chosenNames = (cls.gearChoices || [])
    .map((g) => g.options.find((o) => o.id === selectedGearChoices[g.id]))
    .filter(Boolean)
    .map((o) => o.name);
  const allGear = [...cls.baseGear, ...chosenNames];
  const moveNames = (cls.moves || []).map((m) => m.name).join(', ');
  const weaponGroup = (cls.gearChoices || []).find((g) => g.id === 'weapon');
  const weaponOpt = weaponGroup
    ? weaponGroup.options.find((o) => o.id === selectedGearChoices.weapon)
    : null;
  const weaponLine =
    weaponOpt && weaponOpt.tags && weaponOpt.tags.length
      ? `<div><span class="lbl">무기 태그</span> ${weaponOpt.tags.join(' · ')}</div>`
      : '';
  sheetSummaryEl.innerHTML =
    `<div><span class="lbl">클래스</span> ${cls.name}</div>` +
    `<div><span class="lbl">HP</span> ${cls.maxHp} · <span class="lbl">방어구</span> ${computeArmor(cls)} · <span class="lbl">피해</span> d${cls.damageDie}</div>` +
    `<div><span class="lbl">능력치</span> ${statLine}</div>` +
    `<div><span class="lbl">장비</span> ${allGear.join(', ')}</div>` +
    weaponLine +
    `<div><span class="lbl">배울 기술</span> ${moveNames}</div>`;
}

// --- 네비게이션 ---
nextBtn.addEventListener('click', () => {
  if (nextBtn.disabled) return;
  goToStep(currentStep + 1);
});
prevBtn.addEventListener('click', () => goToStep(currentStep - 1));
charNameEl.addEventListener('input', updateNav);

startBtn.addEventListener('click', () => {
  const name = charNameEl.value.trim();
  if (!name || !selectedClass) return;
  startBtn.disabled = true;
  prevHp = null;
  showGame();
  logInnerEl.innerHTML = '';
  renderField([], []);
  const payload = {
    name,
    classId: selectedClass,
    look: charLookEl.value.trim(),
    choices: selectedGearChoices,
  };
  if (statMode === 'custom' && isCustomValid()) payload.stats = customStats;
  socket.emit('createCharacter', payload);
});

// ---------- 플레이어 입력 ----------
inputForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = actionInput.value.trim();
  if (!text) return;
  actionInput.value = '';
  clearSuggestions();
  socket.emit('playerAction', { text });
});

suggestBtn.addEventListener('click', () => {
  if (suggestBtn.disabled) return;
  clearSuggestions();
  socket.emit('suggestActions');
});

newGameBtn.addEventListener('click', () => {
  if (newGameBtn.disabled) return;
  clearSuggestions();
  socket.emit('newGame'); // 기존 게임 유지 + 새 슬롯 생성
});

// --- AI 모델 모달 (게임/챗 공용) ---
function openModelModal(context) {
  modelModalContext = context;
  const ai = context === 'chat' ? currentChatAi : currentGameAi;
  gameModelErrorEl.classList.add('hidden');
  gmProviderEl.value = ai.provider || 'gemini';
  gmModelEl.value = ai.model || '';
  // 응답 길이는 챗에서만 (제작자 권장 + 내 설정)
  const isChat = context === 'chat';
  gmLengthRowEl.classList.toggle('hidden', !isChat);
  if (isChat) {
    const rec = (currentChat && currentChat.responseLength) || 'medium';
    const recLabel =
      { veryshort: '아주 짧게', short: '짧게', medium: '보통', long: '길게', verylong: '아주 길게' }[
        rec
      ] || rec;
    gmLengthEl.options[0].textContent = `제작자 권장 따르기 (${recLabel})`;
    gmLengthEl.value = (currentChat && currentChat.lengthOverride) || '';
  }
  updateGameModelHint();
  gameModelModal.classList.remove('hidden');
}
function updateGameModelHint() {
  const prov = gmProviderEl.value;
  gmModelEl.placeholder = defaultModels[prov] || '기본값';
  // 제공자가 바뀌면 추천 후보로 초기화(키 없이도 뭘 쓸 수 있는지 보이게)
  fillModelDatalist(knownModels[prov] || []);
  const n = (knownModels[prov] || []).length;
  gmModelsHintEl.textContent = n
    ? `추천 모델 ${n}개를 넣어뒀어요(모델 칸 클릭). 키가 있으면 「불러오기」로 내 계정의 실제 목록을 볼 수 있어요.`
    : '모델 이름을 직접 입력하세요.';
  const ready = providerReady(prov);
  const pname = PROVIDER_LABELS[prov] || prov;
  gmKeyHintEl.innerHTML =
    prov === 'free'
      ? '키가 필요 없습니다 — 서버의 로컬 AI로 바로 플레이합니다.'
      : ready
        ? `${pname} 키 등록됨 ✓`
        : `⚠ ${pname} 키가 없습니다. <b>⚙ 설정</b>에서 먼저 등록하세요${prov === 'custom' ? '(커스텀은 엔드포인트 주소)' : ''}.`;
  toggleFreeNotice(gmFreeNoticeEl, prov);
}
/** 모델 자동완성(datalist) 채우기. */
function fillModelDatalist(models) {
  gmModelListEl.innerHTML = '';
  (models || []).forEach((m) => {
    const o = document.createElement('option');
    o.value = m;
    gmModelListEl.appendChild(o);
  });
}

/** 등록된 키로 실제 사용 가능한 모델 목록을 불러와 자동완성에 채운다. */
async function fetchModelList() {
  const prov = gmProviderEl.value;
  gmFetchModelsBtn.disabled = true;
  gmModelsHintEl.textContent = '불러오는 중…';
  try {
    const data = await api('/api/models', { provider: prov });
    const models = data.models || [];
    fillModelDatalist(models);
    gmModelsHintEl.textContent = models.length
      ? `사용 가능한 모델 ${models.length}개 — 모델 칸을 클릭하면 목록이 뜹니다.`
      : '사용 가능한 모델이 없습니다.';
  } catch (e) {
    gmModelsHintEl.textContent = '⚠ ' + e.message;
  } finally {
    gmFetchModelsBtn.disabled = false;
  }
}

/** 실제 호출이 되는지(크레딧·한도 포함) 짧은 요청으로 테스트. */
async function testModelConnection() {
  const prov = gmProviderEl.value;
  gmTestModelBtn.disabled = true;
  gmModelsHintEl.textContent = '연결 테스트 중…';
  try {
    const data = await api('/api/model-test', { provider: prov, model: gmModelEl.value.trim() });
    gmModelsHintEl.textContent = `✅ 연결 성공 (응답: ${data.sample || 'OK'})`;
  } catch (e) {
    gmModelsHintEl.textContent = '❌ ' + e.message;
  } finally {
    gmTestModelBtn.disabled = false;
  }
}

gameModelBtn.addEventListener('click', () => openModelModal('gm'));
chatModelBtn.addEventListener('click', () => openModelModal('chat'));
gmFetchModelsBtn.addEventListener('click', fetchModelList);
gmTestModelBtn.addEventListener('click', testModelConnection);
gmProviderEl.addEventListener('change', updateGameModelHint);
gmCancelBtn.addEventListener('click', () => gameModelModal.classList.add('hidden'));
gmSaveBtn.addEventListener('click', () => {
  const payload = { provider: gmProviderEl.value, model: gmModelEl.value.trim() };
  if (modelModalContext === 'chat') {
    socket.emit('setChatModel', payload);
    socket.emit('setChatLength', { length: gmLengthEl.value || null });
  } else {
    socket.emit('setGameModel', payload);
  }
  gameModelModal.classList.add('hidden');
});

// --- 모드 토글 + 챗 버튼/폼 ---
modeGameBtn.addEventListener('click', () => setMode('gm'));
modeChatBtn.addEventListener('click', () => setMode('chat'));
document.getElementById('homeBtn').addEventListener('click', showHome);
document.getElementById('homeGameBtn').addEventListener('click', () => setMode('gm'));
document.getElementById('homeChatBtn').addEventListener('click', () => setMode('chat'));
newChatBtn.addEventListener('click', () => {
  if (newChatBtn.disabled) return;
  socket.emit('newChat');
});
chatEditBtn.addEventListener('click', () => {
  if (currentChat) openChatSetupForm(currentChat);
});
cpCancelBtn.addEventListener('click', () => {
  // 설정 안 된 새 캐릭터를 취소하면 삭제하고 게임 모드로, 편집 취소면 대화로 복귀
  if (currentChat && !currentChat.configured) {
    socket.emit('deleteChat', { id: currentChat.chatId });
    setMode('gm');
  } else if (currentChat && currentChat.configured) {
    showChat();
  } else {
    setMode('gm');
  }
});
cpAddCharBtn.addEventListener('click', () => {
  if (chatChars.length >= 8) return;
  chatChars.push({ name: '', description: '' });
  renderCharEditors();
});
const cpGalleryBtn = document.getElementById('cpGallery');
function openGallery() {
  requestGallery();
  if (amAdmin) socket.emit('adminReports');
}
function showProfile() {
  hideAllScreens();
  profileEl.classList.remove('hidden');
  setLandingBg(true);
}
// 정렬 변경
if (gallerySortEl) {
  gallerySortEl.addEventListener('change', () => {
    gallerySort = gallerySortEl.value;
    requestGallery();
  });
}
// 프로필
profileBtn.addEventListener('click', () => {
  socket.emit('profileList');
  showProfile();
});
profileCloseBtn.addEventListener('click', () => setMode(currentMode));
profileGalleryBtn.addEventListener('click', openGallery);
// 상세 모달
dtCloseBtn.addEventListener('click', () => detailModal.classList.add('hidden'));
dtLikeBtn.addEventListener('click', () => {
  if (detailItem) socket.emit('toggleLike', { id: detailItem.id });
});
dtPlayBtn.addEventListener('click', () => {
  if (!detailItem) return;
  detailModal.classList.add('hidden');
  socket.emit('playPublished', { id: detailItem.id });
});
function sendComment() {
  const t = dtCommentInput.value.trim();
  if (!t || !detailItem) return;
  dtCommentInput.value = '';
  socket.emit('addComment', { id: detailItem.id, text: t });
}
dtCommentSend.addEventListener('click', sendComment);
dtCommentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendComment();
});
galleryBtn.addEventListener('click', openGallery);
cpGalleryBtn.addEventListener('click', openGallery);
galleryCloseBtn.addEventListener('click', () => setMode('chat'));
cpPublishBtn.addEventListener('click', () => {
  const def = collectDef();
  if (!def.characters.length) {
    chatSetupErrorEl.textContent = '공개하려면 이름 있는 캐릭터가 최소 1명 필요합니다.';
    chatSetupErrorEl.classList.remove('hidden');
    return;
  }
  chatSetupErrorEl.classList.add('hidden');
  pendingSetupAction = 'publish'; // 설정 화면에 머물러 공유 링크를 보여줌
  socket.emit('saveChatDef', { def }); // 최신 정의로 저장 후
  const v = cpVisibilityEl.value;
  if (v === 'private') socket.emit('unpublishChat');
  else socket.emit('publishChat', { visibility: v });
});
cpAddImageBtn.addEventListener('click', () => cpImageFileEl.click());
cpImageFileEl.addEventListener('change', () => {
  uploadImageFiles(cpImageFileEl.files);
  cpImageFileEl.value = ''; // 같은 파일 다시 선택 가능하게
});
cpSaveBtn.addEventListener('click', () => {
  const def = collectDef();
  if (!def.characters.length) {
    chatSetupErrorEl.textContent = '이름 있는 캐릭터가 최소 1명 필요합니다.';
    chatSetupErrorEl.classList.remove('hidden');
    return;
  }
  if (def.characters.some((c) => !c.description)) {
    chatSetupErrorEl.textContent = '각 캐릭터의 설명을 입력하세요.';
    chatSetupErrorEl.classList.remove('hidden');
    return;
  }
  chatSetupErrorEl.classList.add('hidden');
  pendingSetupAction = 'save';
  socket.emit('saveChatDef', { def });
});
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || chatBusy) return;
  chatInput.value = '';
  appendChatMsg('user', text); // 사용자 메시지 즉시 표시
  scrollChat();
  socket.emit('chatSend', { text });
});

let gameOver = false;
function setBusy(busy) {
  if (gameOver) return; // 사망 상태에서는 입력 비활성 유지
  sendBtn.disabled = busy;
  suggestBtn.disabled = busy;
  actionInput.disabled = busy;
  if (!busy) actionInput.focus();
}

/** 캐릭터 사망(죽음의 문턱 6-) 시 입력을 잠그고 새 게임을 유도. */
function setGameOver(on) {
  gameOver = on;
  sendBtn.disabled = on;
  suggestBtn.disabled = on;
  actionInput.disabled = on;
  if (on) {
    actionInput.placeholder = '캐릭터가 사망했습니다 — 새 게임으로 새 모험을 시작하세요.';
    newGameBtn.classList.add('pulse');
  } else {
    actionInput.placeholder = '행동을 서술하세요. 예: 고블린 뒤로 몰래 다가간다';
    newGameBtn.classList.remove('pulse');
  }
}

function fmtMod(v) {
  return v >= 0 ? '+' + v : '' + v;
}

// ---------- 행동 제안 ----------
function renderSuggestions(items) {
  suggestionsEl.innerHTML = '';
  if (!items.length) {
    suggestionsEl.classList.add('hidden');
    return;
  }
  items.forEach((text) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'suggestion-chip';
    chip.textContent = text;
    chip.addEventListener('click', () => {
      actionInput.value = text;
      actionInput.focus();
      clearSuggestions();
    });
    suggestionsEl.appendChild(chip);
  });
  suggestionsEl.classList.remove('hidden');
}

function clearSuggestions() {
  suggestionsEl.innerHTML = '';
  suggestionsEl.classList.add('hidden');
}

// ---------- 렌더 ----------
const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
function dieFace(v) {
  return DIE_FACES[v >= 1 && v <= 6 ? v - 1 : 0];
}

// 주사위 굴리는 동안 결과(서사·경험치·상태)를 잠시 보류 → 착지 후 공개(스포일러 방지)
let diceAnimating = false;
const postDiceQueue = [];
function afterDice(fn) {
  if (diceAnimating) postDiceQueue.push(fn);
  else fn();
}
function flushPostDice() {
  diceAnimating = false;
  while (postDiceQueue.length) postDiceQueue.shift()();
}

function renderLogEntry(entry) {
  if (entry.kind === 'dice') {
    // 저장 로그 재생: 주사위 눈 + 결과 (애니메이션 없이)
    const div = document.createElement('div');
    div.className = 'entry dice settled' + (entry.tier ? ' tier-' + entry.tier : '');
    const d = entry.dice || [];
    const faces = d.length
      ? `<div class="dice-faces"><span class="die">${dieFace(d[0])}</span><span class="die">${dieFace(d[1])}</span></div>`
      : '';
    div.innerHTML = faces + `<div class="dice-caption">${escapeHtml(entry.text)}</div>`;
    logInnerEl.appendChild(div);
    return;
  }
  const div = document.createElement('div');
  div.className = 'entry ' + (entry.kind || 'gm');
  div.textContent = entry.text;
  logInnerEl.appendChild(div);
}

// 주사위 굴림 연출: 두 개의 주사위 눈이 구르다가 결과로 착지
function animateDiceRoll(entry) {
  const div = document.createElement('div');
  div.className = 'entry dice rolling';
  div.innerHTML =
    '<div class="dice-faces"><span class="die">⚂</span><span class="die">⚄</span></div>' +
    '<div class="dice-caption">주사위를 굴리는 중…</div>';
  logInnerEl.appendChild(div);
  scrollLog();
  const faces = div.querySelectorAll('.die');
  const caption = div.querySelector('.dice-caption');
  diceAnimating = true; // 착지할 때까지 이후 결과(서사·경험치)를 보류
  let ticks = 0;
  const iv = setInterval(() => {
    faces[0].textContent = dieFace(1 + Math.floor(Math.random() * 6));
    faces[1].textContent = dieFace(1 + Math.floor(Math.random() * 6));
    if (++ticks >= 11) {
      clearInterval(iv);
      const d = entry.dice || [1, 1];
      faces[0].textContent = dieFace(d[0]);
      faces[1].textContent = dieFace(d[1]);
      div.classList.remove('rolling');
      div.classList.add('settled');
      if (entry.tier) div.classList.add('tier-' + entry.tier);
      caption.textContent = entry.text;
      scrollLog();
      // 착지 후 짧은 여운 뒤에 보류해둔 결과를 공개
      setTimeout(flushPostDice, 350);
    }
  }, 80);
}

// ---------- 적/동료 필드 ----------
function renderField(enemies, companions) {
  renderNpcList(enemiesEl, enemies || [], 'enemy');
  renderNpcList(companionsEl, companions || [], 'ally');
}

function renderNpcList(el, list, kind) {
  el.innerHTML = '';
  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = kind === 'enemy' ? '(적 없음)' : '(동료 없음)';
    el.appendChild(d);
    return;
  }
  list.forEach((n) => {
    const d = document.createElement('div');
    d.className = 'npc ' + kind;
    let html = `<div class="n-name">${escapeHtml(n.name)}</div>`;
    if (n.hp) html += `<div class="n-hp">${escapeHtml(n.hp)}</div>`;
    if (n.note) html += `<div class="n-note">${escapeHtml(n.note)}</div>`;
    d.innerHTML = html;
    el.appendChild(d);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

function scrollLog() {
  logEl.scrollTop = logEl.scrollHeight;
}

function updateStatus(c) {
  if (prevHp !== null && c.hp !== prevHp) flashHp(c.hp - prevHp);
  prevHp = c.hp;

  charTitle.textContent = `${c.name} · ${c.className}`;

  const level = c.level || 1;
  const xp = c.xp || 0;
  const threshold = level + 7; // 서버 xpToLevel과 동일
  levelText.textContent = level;
  xpText.textContent = `${xp}/${threshold}`;
  xpBar.style.width = Math.min(100, (xp / threshold) * 100) + '%';

  hpText.textContent = `${c.hp}/${c.maxHp}`;
  const pct = c.maxHp > 0 ? Math.max(0, (c.hp / c.maxHp) * 100) : 0;
  hpBar.style.width = pct + '%';
  armorText.textContent = `방어구 ${c.armor}`;

  // 장착 무기 + 태그
  if (c.weapon && c.weapon.name) {
    const tags = (c.weapon.tags || []).length
      ? `<span class="wb-tags">${c.weapon.tags.map(escapeHtml).join(' · ')}</span>`
      : '';
    weaponBoxEl.innerHTML = `<span class="wb-label">무기</span> ${escapeHtml(c.weapon.name)} ${tags}`;
    weaponBoxEl.classList.remove('hidden');
  } else {
    weaponBoxEl.classList.add('hidden');
  }

  if (coinTextEl) coinTextEl.textContent = c.coin || 0;

  statsEl.innerHTML = '';
  Object.entries(c.stats).forEach(([k, v]) => {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<div class="k">${k}</div><div class="v">${v >= 0 ? '+' + v : v}</div>`;
    statsEl.appendChild(d);
  });

  inventoryEl.innerHTML = '';
  if (!c.inventory.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '(비어 있음)';
    inventoryEl.appendChild(li);
  } else {
    c.inventory.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      inventoryEl.appendChild(li);
    });
  }

  // 습득 무브
  movesEl.innerHTML = '';
  const moves = c.moves || [];
  if (!moves.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '(아직 없음)';
    movesEl.appendChild(li);
  } else {
    moves.forEach((m) => {
      const li = document.createElement('li');
      li.innerHTML = `<div class="mname">${m.name}</div><div class="mdesc">${m.desc}</div>`;
      movesEl.appendChild(li);
    });
  }

}

// HP 변화 시 부동 숫자 + 흔들림/번쩍 효과
function flashHp(delta) {
  const statusPane = document.querySelector('.status-pane');
  const hpBlock = document.querySelector('.hp-block');
  if (hpBlock) {
    const f = document.createElement('div');
    f.className = 'float-num ' + (delta < 0 ? 'dmg' : 'heal');
    f.textContent = (delta < 0 ? '' : '+') + delta;
    hpBlock.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }
  hpBar.classList.remove('flash-dmg', 'flash-heal');
  void hpBar.offsetWidth; // 리플로우로 애니메이션 재시작
  hpBar.classList.add(delta < 0 ? 'flash-dmg' : 'flash-heal');
  if (delta < 0 && statusPane) {
    statusPane.classList.remove('shake');
    void statusPane.offsetWidth;
    statusPane.classList.add('shake');
    setTimeout(() => statusPane.classList.remove('shake'), 460);
  }
}

// ---------- 레벨업 모달 ----------
function openLevelUp(options) {
  luAbility = null;
  luMove = null;
  const improvable = (options.stats || []).filter((s) => s.canImprove);
  const moves = options.moves || [];
  luNeedStat = improvable.length > 0;
  luNeedMove = moves.length > 0;

  // 능력치 선택지
  luStats.innerHTML = '';
  (options.stats || []).forEach((s) => {
    const div = document.createElement('div');
    div.className = 'lu-stat' + (s.canImprove ? '' : ' disabled');
    div.innerHTML = `<div class="k">${s.key}</div><div class="v">${
      s.value >= 0 ? '+' + s.value : s.value
    }${s.canImprove ? ' → +' + (s.value + 1) : ''}</div>`;
    if (s.canImprove) {
      div.addEventListener('click', () => {
        luAbility = s.key;
        document
          .querySelectorAll('.lu-stat')
          .forEach((el) => el.classList.remove('selected'));
        div.classList.add('selected');
        refreshLuConfirm();
      });
    }
    luStats.appendChild(div);
  });
  if (!luNeedStat) {
    const note = document.createElement('div');
    note.style.cssText = 'color:var(--muted);font-size:0.82rem;grid-column:1/-1;';
    note.textContent = '모든 능력치가 최대치입니다.';
    luStats.appendChild(note);
  }

  // 무브 선택지
  luMoves.innerHTML = '';
  if (!luNeedMove) {
    const div = document.createElement('div');
    div.className = 'lu-move none';
    div.textContent = '더 습득할 무브가 없습니다.';
    luMoves.appendChild(div);
  } else {
    moves.forEach((m) => {
      const div = document.createElement('div');
      div.className = 'lu-move';
      div.innerHTML = `<div class="mname">${m.name}</div><div class="mdesc">${m.desc}</div>`;
      div.addEventListener('click', () => {
        luMove = m.id;
        document
          .querySelectorAll('.lu-move')
          .forEach((el) => el.classList.remove('selected'));
        div.classList.add('selected');
        refreshLuConfirm();
      });
      luMoves.appendChild(div);
    });
  }

  refreshLuConfirm();
  levelupModal.classList.remove('hidden');
}

function refreshLuConfirm() {
  const ok = (!luNeedStat || luAbility) && (!luNeedMove || luMove);
  luConfirm.disabled = !ok;
}

function closeLevelUp() {
  levelupModal.classList.add('hidden');
}

luConfirm.addEventListener('click', () => {
  luConfirm.disabled = true;
  socket.emit('levelUpChoice', { ability: luAbility, moveId: luMove });
});

// ================= 인증 / 설정 =================
async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '요청 실패');
  return data;
}

function connectAndStart() {
  if (socket) {
    socket.connect();
    return;
  }
  socket = io();
  wireSocket();
}

// --- 로그인/회원가입 ---
function setAuthMode(mode) {
  authMode = mode;
  authErrorEl.classList.add('hidden');
  if (mode === 'login') {
    authSubtitleEl.textContent = '로그인하고 모험을 시작하세요';
    authSubmitEl.textContent = '로그인';
    authToggleTextEl.textContent = '계정이 없나요?';
    authSwitchEl.textContent = '회원가입';
    authPassEl.setAttribute('autocomplete', 'current-password');
  } else {
    authSubtitleEl.textContent = '새 계정을 만들어 시작하세요';
    authSubmitEl.textContent = '회원가입';
    authToggleTextEl.textContent = '이미 계정이 있나요?';
    authSwitchEl.textContent = '로그인';
    authPassEl.setAttribute('autocomplete', 'new-password');
  }
}

authSwitchEl.addEventListener('click', (e) => {
  e.preventDefault();
  setAuthMode(authMode === 'login' ? 'signup' : 'login');
});

async function submitAuth() {
  const username = authUserEl.value.trim();
  const password = authPassEl.value;
  if (!username || !password) return;
  authSubmitEl.disabled = true;
  authErrorEl.classList.add('hidden');
  try {
    await api(authMode === 'signup' ? '/api/signup' : '/api/login', { username, password });
    authPassEl.value = '';
    connectAndStart();
  } catch (e) {
    authErrorEl.textContent = e.message;
    authErrorEl.classList.remove('hidden');
  } finally {
    authSubmitEl.disabled = false;
  }
}
authSubmitEl.addEventListener('click', submitAuth);
authPassEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitAuth();
});

// --- 로그아웃 ---
logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/logout', {});
  } catch (_) {}
  if (socket) socket.disconnect();
  userBarEl.classList.add('hidden');
  authUserEl.value = '';
  setAuthMode('login');
  showAuth();
});

// --- 설정 모달 ---
function openSettings(firstTime) {
  settingsErrorEl.classList.add('hidden');
  if (mySettings) {
    setProviderEl.value = mySettings.provider || 'gemini';
    setModelEl.value = mySettings.model || '';
    setBaseUrlEl.value = mySettings.baseURL || '';
  }
  setKeyEl.value = '';
  updateSettingsHints();
  settingsModal.classList.remove('hidden');
  if (firstTime) {
    settingsErrorEl.textContent = '먼저 AI API 키를 등록해야 게임을 시작할 수 있어요.';
    settingsErrorEl.classList.remove('hidden');
  }
}
function closeSettings() {
  settingsModal.classList.add('hidden');
}
function updateSettingsHints() {
  const prov = setProviderEl.value;
  setModelEl.placeholder = defaultModels[prov] || '기본값';
  const hasKey = !!(mySettings && mySettings.keys && mySettings.keys[prov]);
  keyStatusEl.textContent = hasKey ? '(등록됨 — 바꿀 때만 입력)' : '(미등록)';
  const k = KEY_URLS[prov] || KEY_URLS.gemini;
  keyHelpEl.innerHTML = `키 발급: <b>${k.url}</b> · ${k.note}`;
  // 커스텀 제공자일 때만 엔드포인트 주소 입력란 표시
  baseUrlRowEl.classList.toggle('hidden', prov !== 'custom');
  // 무료 체험은 키 입력이 필요 없음 + 유의사항 표시
  setKeyEl.disabled = prov === 'free';
  setKeyEl.placeholder = prov === 'free' ? '무료 체험은 키가 필요 없습니다' : '키를 붙여넣기 (변경할 때만 입력)';
  toggleFreeNotice(setFreeNoticeEl, prov);
}
setProviderEl.addEventListener('change', updateSettingsHints);
settingsBtn.addEventListener('click', () => openSettings(false));
settingsCancelBtn.addEventListener('click', closeSettings);

settingsSaveBtn.addEventListener('click', async () => {
  settingsSaveBtn.disabled = true;
  settingsErrorEl.classList.add('hidden');
  try {
    const body = { provider: setProviderEl.value, model: setModelEl.value.trim() };
    if (setProviderEl.value === 'custom') body.baseURL = setBaseUrlEl.value.trim();
    if (setKeyEl.value.trim()) body.apiKey = setKeyEl.value.trim();
    const data = await api('/api/settings', body);
    mySettings = data.user.settings;
    if (!mySettings.keys) mySettings.keys = {};
    setKeyEl.value = '';
    updateModelNote();
    updateGameModelLabel();
    closeSettings();
  } catch (e) {
    settingsErrorEl.textContent = e.message;
    settingsErrorEl.classList.remove('hidden');
  } finally {
    settingsSaveBtn.disabled = false;
  }
});

// --- 부트 ---
(async function boot() {
  try {
    const { user } = await api('/api/me');
    if (user) {
      mySettings = user.settings;
      connectAndStart();
    } else {
      setAuthMode('login');
      showAuth();
    }
  } catch (_) {
    setAuthMode('login');
    showAuth();
  }
})();
