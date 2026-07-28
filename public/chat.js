/* global App */
'use strict';

/**
 * 캐릭터 챗 페이지 — 세계관/캐릭터 설정, 대화, 공개 갤러리, 내 프로필.
 * 계정·설정·모델 모달은 common.js(App)가 담당한다.
 */

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
const cpGalleryBtn = document.getElementById('cpGallery');

// 갤러리 · 프로필 · 상세
const galleryEl = document.getElementById('gallery');
const galleryBtn = document.getElementById('galleryBtn');
const galleryListEl = document.getElementById('galleryList');
const galleryCloseBtn = document.getElementById('galleryClose');
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

const GENRE_SUGGEST = ['판타지', '로맨스', '미스터리', '호러', 'SF', '학원', '무협', '일상', '느와르', '코미디'];
const VIS_LABEL = { private: '🔒 비공개', link: '🔗 링크 공개', public: '🌐 전체 공개' };

let currentChat = null; // 활성 챗 상태 {chatId, def, configured, messages, ai, ...}
let currentChatAi = { provider: 'gemini', model: '' };
let chatBusy = false;
let streamBubble = null; // 스트리밍 중인 말풍선 요소
let streamText = ''; // 스트리밍 누적 텍스트
let chatChars = [{ name: '', description: '' }]; // 설정 폼의 캐릭터 편집 상태
let chatImages = []; // 설정 폼의 이미지 편집 상태 [{id, tag, description}]
let pendingSetupAction = null; // 'save' | 'publish' | null — 설정 화면 이탈 여부 결정
let cancelling = false; // 설정 안 된 새 대화를 취소하는 중
let gallerySort = 'recent';
let galleryTag = '';
let detailItem = null;
let pendingShowProfile = false; // ?view=profile 로 들어온 경우

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
    if (on) App.startThinking(chatThinkingEl, '상대가 입력 중', currentChatAi.provider);
    else App.stopThinking();
    setChatBusy(on);
  });
  s.on('chatModelUpdated', (ai) => {
    currentChatAi = ai || currentChatAi;
    updateChatModelLabel();
  });
  s.on('chatRollback', () => removeLastChatUserMsg());
  s.on('reportDone', ({ count }) => alert(`신고가 접수되었습니다. (누적 ${count}건)`));
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
    if (!profileEl.classList.contains('hidden')) return; // 프로필 보는 중이면 화면 유지
    showGallery();
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
  [chatSetupEl, chatEl, galleryEl, profileEl].forEach((e) => e && e.classList.add('hidden'));
}
function showChatSetup() {
  if (bootScreenLock) return;
  hideAllScreens();
  chatSetupEl.classList.remove('hidden');
  App.setLandingBg(true);
}
function showChat() {
  if (bootScreenLock) return;
  hideAllScreens();
  chatEl.classList.remove('hidden');
  App.setLandingBg(false);
}
function showGallery() {
  hideAllScreens();
  galleryEl.classList.remove('hidden');
  App.setLandingBg(true);
}
function showProfile() {
  hideAllScreens();
  profileEl.classList.remove('hidden');
  App.setLandingBg(true);
}
/** 현재 상태에 맞는 화면으로 돌아간다(갤러리·프로필 닫기 공용). */
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
  if (!data) {
    // 마지막 남은 대화를 '취소'로 지웠다 → 홈으로
    if (cancelling) {
      cancelling = false;
      location.href = '/';
      return;
    }
    if (bootPlayId) return; // 공유 링크로 들어옴 — playPublished 응답을 기다린다
    socket.emit('newChat'); // 대화가 하나도 없음 → 새로 만들어 설정 폼으로
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
        const data = await App.api('/api/upload', { dataUrl: reader.result });
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

/** 설정 폼의 공개 상태 표시 갱신. */
function updatePublishHint(published) {
  if (published && published.visibility && published.visibility !== 'private') {
    cpVisibilityEl.value = published.visibility;
    const link = `${location.origin}/chat?play=${published.id}`;
    cpPublishHintEl.innerHTML =
      `${VIS_LABEL[published.visibility]} 중 · 플레이 ${published.plays || 0}회<br />` +
      `공유 링크: <b>${escapeHtml(link)}</b>`;
  } else {
    cpVisibilityEl.value = 'private';
    cpPublishHintEl.textContent = '공개하면 다른 사용자가 각자 자기 대화로 플레이할 수 있어요.';
  }
}

// ---------- 갤러리 ----------
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
    if (c.userId === me || App.isAdmin || (detailItem && detailItem.ownerName === App.username)) {
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

/** 운영자용 접속 통계 렌더(오늘 요약 + 최근 n일 막대). */
function renderAdminStats(data) {
  if (!statTodayEl || !data) return;
  const t = data.today || {};

  const cards = [
    ['방문자', t.visitors, '오늘 다녀간 서로 다른 접속자'],
    ['페이지 진입', t.pages, '랜딩·게임·챗 페이지를 연 횟수'],
    ['접속 사용자', t.users, '로그인 상태로 실제 이용한 사람'],
    ['신규 가입', t.signups, '오늘 새로 만든 계정'],
    ['챗 응답', t.chatMsgs, '캐릭터 챗 AI 호출'],
    ['게임 진행', t.gameMsgs, 'AI GM 호출'],
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
    col.title = `${d.day} · 방문자 ${d.visitors} · 진입 ${d.pages} · 사용자 ${d.users}`;
    const fill = document.createElement('i');
    fill.style.height = `${Math.round(((d.visitors || 0) / max) * 100)}%`;
    const cap = document.createElement('span');
    cap.textContent = d.day.slice(8); // 일자만
    col.append(fill, cap);
    statChartEl.appendChild(col);
  });

  const tot = data.totals || {};
  const ai = Object.entries(t.ai || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
  statTotalsEl.textContent =
    `누적 — 가입자 ${tot.users || 0}명 · 공개 작품 ${tot.publicEntries || 0}개(전체 ${tot.published || 0}) · ` +
    `챗 이용자 ${tot.chats || 0}명 · 게임 이용자 ${tot.games || 0}명 · 신고 대기 ${tot.reported || 0}건` +
    (ai ? ` / 오늘 모델별 호출 — ${ai}` : '');
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

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || chatBusy) return;
  chatInput.value = '';
  appendChatMsg('user', text); // 사용자 메시지 즉시 표시
  scrollChat();
  socket.emit('chatSend', { text });
});

galleryBtn.addEventListener('click', openGallery);
cpGalleryBtn.addEventListener('click', openGallery);
galleryCloseBtn.addEventListener('click', backToChat);
if (gallerySortEl) {
  gallerySortEl.addEventListener('change', () => {
    gallerySort = gallerySortEl.value;
    requestGallery();
  });
}
profileCloseBtn.addEventListener('click', backToChat);
profileGalleryBtn.addEventListener('click', openGallery);

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
