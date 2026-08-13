/* global App, I18N */
'use strict';

/**
 * 캐릭터 챗 페이지 — 세계관/캐릭터 설정, 대화, 공개 갤러리, 내 프로필.
 * 계정·설정·모델 모달은 common.js(App)가 담당한다.
 *
 * **세계관·캐릭터·대화 본문은 번역하지 않는다.** 사용자가 쓴 원문이 곧 저장값이라
 * 화면 언어를 바꿔도 그대로 두고, 갤러리 카드에 원문 언어 뱃지만 붙인다.
 * 번역되는 건 이 파일이 만들어 내는 UI 문구뿐이다.
 */

const t = I18N.t;

let socket = null;

// 대화
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

// 설정 폼 (세계관 + 다중 캐릭터)
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
const cpTagsEl = document.getElementById('cpTags');
const cpTagSuggestEl = document.getElementById('cpTagSuggest');
const cpVisibilityEl = document.getElementById('cpVisibility');
const cpPublishBtn = document.getElementById('cpPublish');
const cpPublishHintEl = document.getElementById('cpPublishHint');
const cpLengthEl = document.getElementById('cpLength');
const cpImagesEl = document.getElementById('cpImages');
const cpImageFileEl = document.getElementById('cpImageFile');
const cpAddImageBtn = document.getElementById('cpAddImage');
const cpCoverHintEl = document.getElementById('cpCoverHint');

// 갤러리 · 프로필 · 상세
const galleryEl = document.getElementById('gallery');
const galleryListEl = document.getElementById('galleryList');
const gallerySortEl = document.getElementById('gallerySort');
const galleryTagsEl = document.getElementById('galleryTags');
const adminPanelEl = document.getElementById('adminPanel');
const adminListEl = document.getElementById('adminList');
const statTodayEl = document.getElementById('statToday');
const statChartEl = document.getElementById('statChart');
const statTotalsEl = document.getElementById('statTotals');
const profileEl = document.getElementById('profile');
const profileSubEl = document.getElementById('profileSub');
const profileTotalsEl = document.getElementById('profileTotals');
const profileListEl = document.getElementById('profileList');
const profileSettingsBtn = document.getElementById('profileSettingsBtn');
const profileLogoutBtn = document.getElementById('profileLogoutBtn');

// 앱 셸 (하단 탭 · 내 대화 목록)
const tabbarEl = document.getElementById('tabbar');
const chatsEl = document.getElementById('chats');
const chatsListEl = document.getElementById('chatsList');
const chatsEmptyEl = document.getElementById('chatsEmpty');
const chatBackBtn = document.getElementById('chatBackBtn');
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

// 태그 '값'은 언제나 원문이다 — 저장되고, 갤러리 필터가 그 문자열로 묶는다.
// 언어별로 다른 값을 저장하면 같은 장르가 둘로 쪼개진다. 화면 표시만 사전을 탄다.
const GENRE_SUGGEST = ['판타지', '로맨스', '미스터리', '호러', 'SF', '학원', '무협', '일상', '느와르', '코미디'];
const tagLabel = (tag) => I18N.tOr('tag.' + tag, tag);
const visLabel = (v) => t('vis.' + v);
// 커버 이미지를 등록하지 않은 항목이 쓸 기본 커버.
const DEFAULT_COVER = '/assets/cover-default.svg';

let currentChat = null; // 활성 챗 상태 {chatId, def, configured, messages, ai, ...}
let currentChatAi = { provider: 'gemini', model: '' };
let chatBusy = false;
let streamBubble = null; // 스트리밍 중인 말풍선 요소
let streamText = ''; // 스트리밍 누적 텍스트
let chatChars = [{ name: '', description: '' }]; // 설정 폼의 캐릭터 편집 상태
let chatImages = []; // 설정 폼의 이미지 편집 상태 [{id, tag, description}]
let chatCoverId = ''; // 제작자가 고른 대표 이미지 id. '' 이면 서버가 자동 선별한다.
let pendingSetupAction = null; // 'save' | 'publish' | null — 설정 화면 이탈 여부 결정
let cancelling = false; // 설정 안 된 새 대화를 취소하는 중
let gallerySort = 'recent';
let galleryTag = '';
let detailItem = null;
let pendingShowProfile = false; // ?view=profile 로 들어온 경우
let lastChatList = { chats: [], activeId: null, max: 12 }; // '내 대화' 탭이 그릴 목록
let bootHome = true; // 첫 chatState 는 대화로 튀지 않고 홈(둘러보기)에 머문다

// 공유 링크(/chat?play=<id>)로 들어오면 해당 정의를 바로 가져와 플레이한다.
const params = new URLSearchParams(location.search);
let bootPlayId = params.get('play');
const bootView = params.get('view');
if (bootPlayId || bootView) history.replaceState(null, '', location.pathname); // 주소 정리(새로고침 시 중복 실행 방지)

const escapeHtml = App.escapeHtml;

// ---------- 소켓 핸들러 ----------
function wireSocket(s) {
  s.on('chats', (data) => renderChatBar(data));
  s.on('chatState', (data) => applyChatState(data));
  // 스트리밍: 빈 말풍선을 만들고 조각이 올 때마다 이어 붙인다.
  s.on('chatStreamStart', () => {
    streamBubble = appendChatMsg('assistant', '');
    streamText = '';
    scrollChat();
  });
  s.on('chatChunk', ({ text }) => {
    if (!streamBubble) {
      streamBubble = appendChatMsg('assistant', '');
      streamText = '';
    }
    streamText += text;
    setBubbleText(streamBubble, streamText);
    scrollChat();
  });
  s.on('chatMessage', (m) => {
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
  s.on('chatThinking', ({ on }) => {
    chatThinkingEl.classList.toggle('hidden', !on);
    if (on) App.startThinking(chatThinkingEl, t('chat.typing'), currentChatAi.provider);
    else App.stopThinking();
    setChatBusy(on);
  });
  s.on('chatModelUpdated', (ai) => {
    currentChatAi = ai || currentChatAi;
    updateChatModelLabel();
  });
  s.on('chatRollback', () => removeLastChatUserMsg());
  s.on('reportDone', ({ count }) => alert(t('gal.reported', { n: count })));
  s.on('adminReports', ({ items }) => renderAdminReports(items));
  s.on('adminStats', (data) => renderAdminStats(data));
  s.on('profile', (data) => {
    renderProfile(data);
    if (pendingShowProfile) {
      pendingShowProfile = false;
      showProfile();
    }
  });
  s.on('comments', ({ id, items, me }) => renderComments(id, items, me));
  s.on('likeUpdated', ({ id, likes, liked }) => {
    if (detailItem && detailItem.id === id) {
      detailItem.likes = likes;
      dtLikeCountEl.textContent = likes;
      dtLikeBtn.classList.toggle('liked', liked);
    }
    requestGallery();
  });
  s.on('gallery', (data) => {
    if (data.sort) gallerySort = data.sort;
    if (typeof data.tag === 'string') galleryTag = data.tag;
    if (gallerySortEl) gallerySortEl.value = gallerySort;
    renderTagFilter(data.tags);
    renderGalleryList(galleryListEl, data.items, false);
    // 목록 데이터가 도착했다고 화면을 뺏지 않는다. 화면 전환은 탭이 책임진다 —
    // 추천(likeUpdated)처럼 다른 화면에서 갱신을 부르는 경로가 있기 때문이다.
  });
  s.on('error', ({ message }) => {
    App.stopThinking();
    chatThinkingEl.classList.add('hidden');
    if (streamBubble) {
      streamBubble.remove(); // 실패한 부분 응답 제거
      streamBubble = null;
      streamText = '';
    }
    setChatBusy(false);
    if (chatEl.classList.contains('hidden')) {
      alert('⚠️ ' + message); // 대화 화면이 아니면 로그에 넣어도 안 보인다
      return;
    }
    const div = document.createElement('div');
    div.className = 'entry system';
    div.textContent = '⚠️ ' + message;
    chatLogInnerEl.appendChild(div);
    scrollChat();
  });
}

// ---------- 화면 전환 ----------
// ?view=profile 로 들어오면 프로필과 챗 상태가 거의 동시에 도착하는데, 챗 상태가 늦게 오면
// 프로필 화면을 밀어낸다. 그래서 부팅 직후엔 잠가 두고, 사용자가 무언가를 누르는 순간
// (= 스스로 화면을 바꾸려는 순간) 잠금을 푼다.
let bootScreenLock = false;
document.addEventListener('click', () => (bootScreenLock = false), { capture: true, once: true });

function hideAllScreens() {
  [chatSetupEl, chatEl, galleryEl, profileEl, chatsEl].forEach((e) => e && e.classList.add('hidden'));
}

/**
 * 화면을 하나만 띄우고 앱 셸(탭바)을 그에 맞춘다.
 * @param {HTMLElement} el 띄울 화면
 * @param {'home'|'chats'|'create'|'profile'|null} tab 활성 탭. null 이면 대화 화면(탭바 숨김).
 */
function showScreen(el, tab) {
  hideAllScreens();
  el.classList.remove('hidden');
  // 챗은 배경 영상을 쓰지 않는다 — 카드가 떠 보이는 원인이었다.
  App.setLandingBg(false);
  // 대화 중에는 탭바를 감춰 화면을 온전히 대화에 준다.
  document.body.classList.toggle('chat-open', tab === null);
  tabbarEl.classList.toggle('hidden', tab === null);
  tabbarEl.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
}

function showChatSetup() {
  if (bootScreenLock) return;
  showScreen(chatSetupEl, 'create');
}
function showChat() {
  if (bootScreenLock) return;
  showScreen(chatEl, null);
}
function showGallery() {
  showScreen(galleryEl, 'home');
}
function showProfile() {
  showScreen(profileEl, 'profile');
}
function showChats() {
  renderChatsList();
  showScreen(chatsEl, 'chats');
}
/** 대화 화면에서 뒤로 — 목록으로 돌아간다. */
function backToChat() {
  if (currentChat && currentChat.configured) showChat();
  else if (currentChat) openChatSetupForm(currentChat);
  else location.href = '/';
}

// ---------- 대화 ----------
function updateChatModelLabel() {
  chatModelLabelEl.textContent = App.modelLabel(currentChatAi);
  chatModelBtn.classList.toggle('warn', !App.providerReady(currentChatAi.provider || 'gemini'));
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
    img.alt = t('chat.sceneImage');
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
    img.alt = t('chat.sceneImage');
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
/**
 * 대화 목록 상태를 받아 두 곳에 반영한다.
 * - 대화 화면 헤더: 지금 상대의 이름만 (칩 랙은 '내 대화' 탭으로 옮겼다)
 * - '내 대화' 탭: 전체 목록
 */
function renderChatBar(data) {
  if (!data) return;
  lastChatList = { chats: data.chats || [], activeId: data.activeId, max: data.max || 12 };
  if (chatBarEl) {
    const active = lastChatList.chats.find((c) => c.id === lastChatList.activeId);
    chatBarEl.textContent = active ? (active.configured ? active.name : t('chats.unnamed')) : '';
  }
  renderChatsList();
}

/** '내 대화' 탭의 목록을 그린다. */
function renderChatsList() {
  if (!chatsListEl) return;
  const { chats, activeId, max } = lastChatList;
  chatsListEl.innerHTML = '';
  chats.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'chat-row' + (c.id === activeId ? ' active' : '');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cr-main';
    btn.textContent = c.configured ? c.name : t('chats.unnamed');
    btn.addEventListener('click', () => {
      if (c.id !== activeId) {
        socket.emit('switchChat', { id: c.id }); // 전환 응답(chatState)이 대화를 연다
      } else if (currentChat && currentChat.configured) {
        showChat();
      } else if (currentChat) {
        openChatSetupForm(currentChat);
      }
    });
    row.appendChild(btn);

    if (chats.length > 1) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'cr-del';
      del.textContent = '✕';
      del.title = t('chats.deleteThis');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(t('chats.deleteAsk', { name: c.name || t('chats.thisChar') }))) {
          socket.emit('deleteChat', { id: c.id });
        }
      });
      row.appendChild(del);
    }
    chatsListEl.appendChild(row);
  });

  if (chatsEmptyEl) chatsEmptyEl.classList.toggle('hidden', chats.length > 0);
  const full = chats.length >= max;
  newChatBtn.disabled = full;
  newChatBtn.textContent = full ? t('chats.max', { max }) : t('chats.new');
}

/** 활성 챗 상태를 반영. data가 null이면 챗 없음. */
function applyChatState(data) {
  currentChat = data;
  if (data) {
    currentChatAi = data.ai || currentChatAi;
    updateChatModelLabel();
  }
  if (!data) {
    // 마지막 남은 대화를 '취소'로 지웠다 → 목록으로 (예전엔 사이트 루트로 튕겼다)
    if (cancelling) {
      cancelling = false;
      showChats();
      return;
    }
    if (bootPlayId) return; // 공유 링크로 들어옴 — playPublished 응답을 기다린다
    // 대화가 없어도 새 대화를 자동 생성하지 않는다. 빈 설정 폼으로 시작하는 대신
    // 둘러보기(홈)를 먼저 보여주고, 만들기는 탭에서 명시적으로 고르게 한다.
    if (bootHome) {
      bootHome = false;
      if (!bootScreenLock) showGallery();
    } else {
      showChats();
    }
    return;
  }
  bootPlayId = null;
  // 설정 화면에서 '공개 적용' 중이면 화면을 유지하고 공개 상태만 갱신(공유 링크 확인용)
  if (!cancelling && !chatSetupEl.classList.contains('hidden') && pendingSetupAction !== 'save') {
    updatePublishHint(data.published);
    return;
  }
  cancelling = false;
  pendingSetupAction = null;
  if (!data.configured) {
    openChatSetupForm(data);
  } else {
    chatLogInnerEl.innerHTML = '';
    (data.messages || []).forEach((m) => appendChatMsg(m.role, m.content, m.imageId));
    setChatBusy(false);
    // 남이 만든 세계관은 설정을 수정할 수 없음 → 편집 버튼 숨김
    chatEditBtn.classList.toggle('hidden', !!data.readOnly);
    // 첫 진입은 이어보던 대화로 튀지 않고 홈에 머문다 — 대화는 목록에서 고른다.
    if (bootHome) {
      bootHome = false;
      if (!bootScreenLock) showGallery();
      return;
    }
    showChat();
    scrollChat();
  }
}

// ---------- 설정 폼 ----------
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
    nameIn.placeholder = t('cp.charName', { n: i + 1 });
    nameIn.value = ch.name;
    nameIn.addEventListener('input', () => (chatChars[i].name = nameIn.value));
    head.appendChild(nameIn);
    if (chatChars.length > 1) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'cp-char-del';
      del.textContent = '✕';
      del.title = t('cp.charDelete');
      del.addEventListener('click', () => {
        chatChars.splice(i, 1);
        renderCharEditors();
      });
      head.appendChild(del);
    }
    const desc = document.createElement('textarea');
    desc.rows = 3;
    desc.placeholder = t('cp.charDesc');
    desc.value = ch.description;
    desc.addEventListener('input', () => (chatChars[i].description = desc.value));
    row.appendChild(head);
    row.appendChild(desc);
    cpCharactersEl.appendChild(row);
  });
}

/** 업로드된 이미지 목록(썸네일 + 태그 + 설명 + 삭제) 렌더. */
function renderImageEditors() {
  cpImagesEl.innerHTML = '';
  chatImages.forEach((im, i) => {
    const row = document.createElement('div');
    row.className = 'cp-image';
    const thumb = document.createElement('img');
    thumb.src = `/img/${im.id}`;
    thumb.alt = im.tag || t('cp.imageAlt');
    row.appendChild(thumb);

    const fields = document.createElement('div');
    fields.className = 'cp-image-fields';
    const tagIn = document.createElement('input');
    tagIn.type = 'text';
    tagIn.maxLength = 40;
    tagIn.placeholder = t('cp.imageTag');
    tagIn.value = im.tag;
    tagIn.addEventListener('input', () => (chatImages[i].tag = tagIn.value));
    const descIn = document.createElement('input');
    descIn.type = 'text';
    descIn.maxLength = 200;
    descIn.placeholder = t('cp.imageWhen');
    descIn.value = im.description;
    descIn.addEventListener('input', () => (chatImages[i].description = descIn.value));
    fields.appendChild(tagIn);
    fields.appendChild(descIn);
    row.appendChild(fields);

    // 갤러리 카드에 쓸 대표 이미지 지정(선택). 다시 누르면 해제하고 자동 선별로 돌아간다.
    const cover = document.createElement('button');
    cover.type = 'button';
    const isCover = chatCoverId === im.id;
    cover.className = 'cp-cover-btn' + (isCover ? ' on' : '');
    cover.textContent = isCover ? t('cp.coverOn') : t('cp.coverOff');
    cover.title = isCover ? t('cp.coverOnTitle') : t('cp.coverOffTitle');
    cover.addEventListener('click', () => {
      chatCoverId = isCover ? '' : im.id;
      renderImageEditors();
    });
    row.appendChild(cover);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'cp-char-del';
    del.textContent = '✕';
    del.title = t('cp.imageRemove');
    del.addEventListener('click', () => {
      // 대표로 지정한 걸 빼면 지정도 함께 해제한다(서버도 걸러내지만 폼 표시를 맞춘다)
      if (chatCoverId === chatImages[i].id) chatCoverId = '';
      chatImages.splice(i, 1);
      renderImageEditors();
    });
    row.appendChild(del);
    cpImagesEl.appendChild(row);
  });
  if (cpCoverHintEl) {
    cpCoverHintEl.classList.toggle('hidden', !chatImages.length);
    cpCoverHintEl.textContent = chatCoverId ? t('cp.coverHintPicked') : t('cp.coverHintAuto');
  }
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
        const data = await App.api('/api/upload', { dataUrl: reader.result });
        chatImages.push({ id: data.id, tag: '', description: '' });
        renderImageEditors();
      } catch (e) {
        chatSetupErrorEl.textContent = t('cp.uploadFailed', { msg: e.message });
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
  chatCoverId = chatImages.some((im) => im.id === d.coverId) ? d.coverId : '';
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
    // 대표 이미지. 태그가 비어 걸러진 이미지를 고른 경우까지 여기서 정리한다.
    coverId: chatImages.some((im) => im.id === chatCoverId && (im.tag || '').trim()) ? chatCoverId : '',
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
    b.textContent = `#${tagLabel(g)}`;
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

/** 설정 폼의 공개 상태 표시 갱신. */
function updatePublishHint(published) {
  if (published && published.visibility && published.visibility !== 'private') {
    cpVisibilityEl.value = published.visibility;
    const link = `${location.origin}/chat?play=${published.id}`;
    cpPublishHintEl.innerHTML =
      t('cp.published', { vis: visLabel(published.visibility), n: published.plays || 0 }) +
      '<br />' +
      t('cp.shareLink', { link: escapeHtml(link) });
  } else {
    cpVisibilityEl.value = 'private';
    cpPublishHintEl.textContent = t('cp.publishHint');
  }
}

// ---------- 갤러리 ----------
/** 갤러리 카드 목록 렌더. mine=true면 내 항목(공개 범위 표시). */
function renderGalleryList(el, items, mine) {
  el.innerHTML = '';
  if (!items || !items.length) {
    const d = document.createElement('div');
    d.className = 'gallery-empty';
    d.textContent = mine ? t('gal.emptyMine') : t('gal.emptyAll');
    el.appendChild(d);
    return;
  }
  items.forEach((it) => {
    const card = document.createElement('div');
    card.className = 'gallery-card-item';
    // 커버가 없어도 이미지 자리는 항상 채운다. 없을 때만 카드가 납작해지면
    // 피드가 들쭉날쭉해 보여서(커버 있는 카드 581px, 없는 카드 135px) 기본 커버를 깐다.
    const img = document.createElement('img');
    img.src = it.coverImageId ? `/img/${it.coverImageId}` : DEFAULT_COVER;
    img.alt = it.title;
    img.loading = 'lazy';
    // 등록된 이미지가 지워졌을 때도 빈 칸 대신 기본 커버로 떨어지게 한다.
    img.addEventListener('error', () => {
      if (img.src.endsWith(DEFAULT_COVER)) return;
      img.src = DEFAULT_COVER;
    });
    card.appendChild(img);
    const body = document.createElement('div');
    body.className = 'gi-body';
    const meta = [
      `by ${it.ownerName}`,
      `♥ ${it.likes || 0}`,
      `💬 ${it.commentCount || 0}`,
      t('gal.plays', { n: it.plays }),
      // 원문 언어 뱃지 — 세계관 본문은 번역하지 않으므로 무슨 언어로 쓰였는지 알려준다.
      it.lang && it.lang !== I18N.lang ? t('lang.badge.' + it.lang) : null,
      it.tags && it.tags.length ? it.tags.map((x) => '#' + tagLabel(x)).join(' ') : null,
      mine ? visLabel(it.visibility) : null,
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
    play.textContent = t('gal.play');
    play.addEventListener('click', () => socket.emit('playPublished', { id: it.id }));
    card.appendChild(play);
    const detail = document.createElement('button');
    detail.className = 'ghost gi-play';
    detail.textContent = t('gal.detail');
    detail.title = t('gal.detailTitle');
    detail.addEventListener('click', () => openDetail(it));
    card.appendChild(detail);
    if (!mine) {
      const rep = document.createElement('button');
      rep.className = 'ghost gi-play';
      rep.textContent = t('gal.report');
      rep.title = t('gal.reportTitle');
      rep.addEventListener('click', () => {
        const reason = prompt(t('gal.reportAsk', { title: it.title }));
        if (reason === null) return;
        socket.emit('reportPublished', { id: it.id, reason });
      });
      card.appendChild(rep);
    }
    if (mine) {
      const un = document.createElement('button');
      un.className = 'ghost gi-play';
      un.textContent = t('gal.unpublish');
      un.addEventListener('click', () => {
        if (confirm(t('gal.unpublishAsk', { title: it.title }))) {
          socket.emit('unpublishById', { id: it.id });
        }
      });
      card.appendChild(un);
    }
    el.appendChild(card);
  });
}

/** 갤러리 태그 필터 칩 렌더. */
function renderTagFilter(tags) {
  if (!galleryTagsEl) return;
  galleryTagsEl.innerHTML = '';
  const all = document.createElement('button');
  all.className = 'tag-chip' + (galleryTag ? '' : ' active');
  all.textContent = t('gal.tagAll');
  all.addEventListener('click', () => {
    galleryTag = '';
    requestGallery();
  });
  galleryTagsEl.appendChild(all);
  (tags || []).forEach((x) => {
    const b = document.createElement('button');
    b.className = 'tag-chip' + (galleryTag === x.tag ? ' active' : '');
    b.textContent = `#${tagLabel(x.tag)} ${x.count}`;
    b.addEventListener('click', () => {
      galleryTag = galleryTag === x.tag ? '' : x.tag;
      requestGallery();
    });
    galleryTagsEl.appendChild(b);
  });
}

function requestGallery() {
  socket.emit('galleryList', { sort: gallerySort, tag: galleryTag });
}

function openGallery() {
  requestGallery();
  if (App.isAdmin) {
    socket.emit('adminReports');
    socket.emit('adminStats', { days: 14 });
  }
}

/** 내 프로필 렌더. */
function renderProfile(data) {
  if (!profileListEl) return;
  profileSubEl.textContent = t('prof.sub', { name: data.username || '' });
  if (data.totals) {
    profileTotalsEl.innerHTML = '';
    [
      [t('prof.works'), data.totals.works],
      [t('prof.likes'), data.totals.likes],
      [t('prof.plays'), data.totals.plays],
      [t('prof.comments'), data.totals.comments],
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
    it.characterCount ? t('gal.charCount', { n: it.characterCount }) : null,
    it.imageCount ? t('gal.imageCount', { n: it.imageCount }) : null,
    t('gal.plays', { n: it.plays }),
  ]
    .filter(Boolean)
    .join(' · ');
  dtTagsEl.innerHTML = '';
  (it.tags || []).forEach((x) => {
    const s = document.createElement('span');
    s.className = 'tag-chip static';
    s.textContent = `#${tagLabel(x)}`;
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
    p.textContent = t('dt.noComments');
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
    if (c.userId === me || App.isAdmin || (detailItem && detailItem.ownerName === App.username)) {
      const del = document.createElement('button');
      del.className = 'c-del';
      del.textContent = t('common.delete');
      del.addEventListener('click', () => {
        if (confirm(t('dt.commentDeleteAsk'))) {
          socket.emit('deleteComment', { id, commentId: c.id });
        }
      });
      d.appendChild(del);
    }
    dtCommentsEl.appendChild(d);
  });
}

/** 운영자용 접속 통계 렌더(오늘 요약 + 최근 n일 막대). */
function renderAdminStats(data) {
  if (!statTodayEl || !data) return;
  const today = data.today || {};

  const cards = [
    [t('adm.visitors'), today.visitors, t('adm.visitorsDesc')],
    [t('adm.pages'), today.pages, t('adm.pagesDesc')],
    [t('adm.users'), today.users, t('adm.usersDesc')],
    [t('adm.signups'), today.signups, t('adm.signupsDesc')],
    [t('adm.chatCalls'), today.chatMsgs, t('adm.chatCallsDesc')],
    [t('adm.gameCalls'), today.gameMsgs, t('adm.gameCallsDesc')],
  ];
  statTodayEl.innerHTML = '';
  cards.forEach(([label, value, tip]) => {
    const box = document.createElement('div');
    box.className = 'stat-card';
    box.title = tip;
    const n = document.createElement('strong');
    n.textContent = String(value || 0);
    const l = document.createElement('span');
    l.textContent = label;
    box.append(n, l);
    statTodayEl.appendChild(box);
  });

  // 최근 n일 방문자 막대 그래프
  const days = Array.isArray(data.days) ? data.days : [];
  const max = Math.max(1, ...days.map((d) => d.visitors || 0));
  statChartEl.innerHTML = '';
  days.forEach((d) => {
    const col = document.createElement('div');
    col.className = 'stat-bar';
    col.title = t('adm.bar', { day: d.day, visitors: d.visitors, pages: d.pages, users: d.users });
    const fill = document.createElement('i');
    fill.style.height = `${Math.round(((d.visitors || 0) / max) * 100)}%`;
    const cap = document.createElement('span');
    cap.textContent = d.day.slice(8); // 일자만
    col.append(fill, cap);
    statChartEl.appendChild(col);
  });

  const tot = data.totals || {};
  const ai = Object.entries(today.ai || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
  statTotalsEl.textContent =
    t('adm.totals', {
      users: tot.users || 0,
      publicEntries: tot.publicEntries || 0,
      published: tot.published || 0,
      chats: tot.chats || 0,
      games: tot.games || 0,
      reported: tot.reported || 0,
    }) + (ai ? t('adm.byModel', { ai }) : '');
}

/** 운영자용 신고 목록 렌더. */
function renderAdminReports(items) {
  if (!adminListEl) return;
  adminListEl.innerHTML = '';
  if (!items || !items.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t('adm.noReports');
    adminListEl.appendChild(p);
    return;
  }
  items.forEach((it) => {
    const card = document.createElement('div');
    card.className = 'gallery-card-item';
    const body = document.createElement('div');
    body.className = 'gi-body';
    body.innerHTML = `<div class="gi-title"></div><div class="gi-meta"></div><div class="gi-sum"></div>`;
    body.querySelector('.gi-title').textContent = t('adm.reportCount', {
      n: it.reportCount,
      title: it.title,
    });
    body.querySelector('.gi-meta').textContent =
      t('adm.by', { owner: it.ownerName, vis: visLabel(it.visibility) }) +
      (it.blocked ? t('adm.blockedSuffix') : '');
    body.querySelector('.gi-sum').textContent = (it.reasons || []).join(' / ') || t('adm.noReason');
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
    if (it.blocked) act(t('adm.unblock'), 'unblock');
    else act(t('adm.block'), 'block', t('adm.blockAsk', { title: it.title }));
    act(t('common.delete'), 'delete', t('adm.deleteAsk', { title: it.title }));
    act(t('adm.ignore'), 'clear');
    adminListEl.appendChild(card);
  });
}

/**
 * 언어 전환. UI 문구만 다시 그린다.
 *
 * **대화 로그와 설정 폼의 입력값은 건드리지 않는다** — 사용자가 쓴 원문이자
 * 저장값이라, 번역했다가 되돌릴 수 없는 값이다. 갤러리 카드의 제목·소개도 같다
 * (대신 원문 언어 뱃지가 붙는다).
 */
document.addEventListener('i18n:change', () => {
  renderChatBar({
    chats: lastChatList.chats,
    activeId: lastChatList.activeId,
    max: lastChatList.max,
  });
  updateChatModelLabel();
  if (!chatSetupEl.classList.contains('hidden')) {
    renderCharEditors();
    renderImageEditors();
    renderTagSuggestions();
    updatePublishHint(currentChat && currentChat.published);
  }
  if (socket) {
    requestGallery();
    if (!profileEl.classList.contains('hidden')) socket.emit('profileList');
    if (App.isAdmin) {
      socket.emit('adminReports');
      socket.emit('adminStats', { days: 14 });
    }
  }
  if (detailItem && !detailModal.classList.contains('hidden')) openDetail(detailItem);
});

// ---------- 이벤트 ----------
newChatBtn.addEventListener('click', () => {
  if (newChatBtn.disabled) return;
  socket.emit('newChat');
});
chatEditBtn.addEventListener('click', () => {
  if (currentChat) openChatSetupForm(currentChat);
});
chatModelBtn.addEventListener('click', () => {
  App.openModelModal({
    ai: currentChatAi,
    length: {
      recommended: (currentChat && currentChat.responseLength) || 'medium',
      override: (currentChat && currentChat.lengthOverride) || '',
    },
    onSave: ({ provider, model, length }) => {
      socket.emit('setChatModel', { provider, model });
      socket.emit('setChatLength', { length: length || null });
    },
  });
});

cpCancelBtn.addEventListener('click', () => {
  // 설정 안 된 새 캐릭터를 취소하면 삭제, 편집 취소면 대화로 복귀
  if (currentChat && !currentChat.configured) {
    cancelling = true;
    socket.emit('deleteChat', { id: currentChat.chatId });
  } else if (currentChat && currentChat.configured) {
    showChat();
  } else {
    location.href = '/';
  }
});
cpAddCharBtn.addEventListener('click', () => {
  if (chatChars.length >= 8) return;
  chatChars.push({ name: '', description: '' });
  renderCharEditors();
});
cpAddImageBtn.addEventListener('click', () => cpImageFileEl.click());
cpImageFileEl.addEventListener('change', () => {
  uploadImageFiles(cpImageFileEl.files);
  cpImageFileEl.value = ''; // 같은 파일 다시 선택 가능하게
});
cpSaveBtn.addEventListener('click', () => {
  const def = collectDef();
  if (!def.characters.length) {
    chatSetupErrorEl.textContent = t('cp.needChar');
    chatSetupErrorEl.classList.remove('hidden');
    return;
  }
  if (def.characters.some((c) => !c.description)) {
    chatSetupErrorEl.textContent = t('cp.needCharDesc');
    chatSetupErrorEl.classList.remove('hidden');
    return;
  }
  chatSetupErrorEl.classList.add('hidden');
  pendingSetupAction = 'save';
  socket.emit('saveChatDef', { def });
});
cpPublishBtn.addEventListener('click', () => {
  const def = collectDef();
  if (!def.characters.length) {
    chatSetupErrorEl.textContent = t('cp.needCharPublish');
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

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || chatBusy) return;
  chatInput.value = '';
  appendChatMsg('user', text); // 사용자 메시지 즉시 표시
  scrollChat();
  socket.emit('chatSend', { text });
});

if (gallerySortEl) {
  gallerySortEl.addEventListener('change', () => {
    gallerySort = gallerySortEl.value;
    requestGallery();
  });
}

// ---------- 앱 셸: 하단 탭 · 뒤로가기 · 프로필 안의 계정 행 ----------
tabbarEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  switch (btn.dataset.tab) {
    case 'home':
      openGallery();
      showGallery();
      break;
    case 'chats':
      showChats();
      break;
    case 'create':
      // 설정 안 된 빈 대화가 이미 있으면 그걸 재사용한다(빈 껍데기 양산 방지)
      if (currentChat && !currentChat.configured) openChatSetupForm(currentChat);
      else if (!newChatBtn.disabled) socket.emit('newChat');
      else showChats();
      break;
    case 'profile':
      socket.emit('profileList');
      showProfile();
      break;
  }
});
chatBackBtn.addEventListener('click', showChats);
profileSettingsBtn.addEventListener('click', () => App.openSettings(false));
// 로그아웃 로직은 common.js 가 갖고 있다 — 숨겨둔 원래 버튼을 그대로 누른다.
profileLogoutBtn.addEventListener('click', () => document.getElementById('logoutBtn').click());

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

// ---------- 부트 ----------
App.onSettingsSaved = updateChatModelLabel;
App.onProfileClick = () => {
  socket.emit('profileList');
  showProfile();
};

App.start({
  app: 'chat',
  socket: true,
  onSocket: (s) => {
    socket = s;
    wireSocket(s);
  },
  onReady: () => {
    if (adminPanelEl) adminPanelEl.classList.toggle('hidden', !App.isAdmin);
    // 공유 링크·프로필 링크로 들어왔으면 목적지가 이미 정해져 있다 → 홈에 머물지 않는다.
    if (bootPlayId || bootView) bootHome = false;
    // 첫 화면은 둘러보기(홈). 챗 상태는 뒤따라와 목록만 채운다.
    if (bootHome) {
      showGallery();
      openGallery();
    }
    socket.emit('chatInit');
    // 공유 링크는 정의를 내 대화로 복사해 바로 플레이한다.
    if (bootPlayId) socket.emit('playPublished', { id: bootPlayId });
    if (bootView === 'profile') {
      pendingShowProfile = true;
      bootScreenLock = true; // 뒤늦은 챗 상태가 프로필을 밀어내지 않게
      socket.emit('profileList');
    }
  },
});
