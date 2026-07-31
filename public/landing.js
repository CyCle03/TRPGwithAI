/* global App */
'use strict';

/**
 * 랜딩 페이지 — 로그인/회원가입 + 모드 선택.
 * 소켓을 쓰지 않는다(게임/챗 데이터가 필요 없음).
 */

const authEl = document.getElementById('auth');
const homeEl = document.getElementById('home');
const authUserEl = document.getElementById('authUser');
const authPassEl = document.getElementById('authPass');
const authErrorEl = document.getElementById('authError');
const authSubmitEl = document.getElementById('authSubmit');
const authSwitchEl = document.getElementById('authSwitch');
const authSubtitleEl = document.getElementById('authSubtitle');
const authToggleTextEl = document.getElementById('authToggleText');

let authMode = 'login'; // 'login' | 'signup'

const params = new URLSearchParams(location.search);

// 예전에 뿌린 공유 링크는 "/?play=<id>" 형태다 → 챗 페이지로 넘겨준다.
const playId = params.get('play');

/**
 * 로그인하지 않은 채 /play·/chat 을 열면 common.js 가 "/?next=<원래 경로>" 로 보낸다.
 * 로그인이 끝나면 그 경로로 돌려보내되, 열린 리다이렉트가 되지 않게
 * 같은 오리진의 아는 경로만 통과시킨다.
 */
function safeNext(raw) {
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw, location.origin);
  } catch (_) {
    return null; // 파싱 불가 → 무시
  }
  if (url.origin !== location.origin) return null; // "//evil.com" 류를 걸러낸다
  if (url.pathname !== '/play' && url.pathname !== '/chat') return null;
  return url.pathname + url.search;
}

const next = safeNext(params.get('next'));
const afterLogin = playId ? `/chat?play=${encodeURIComponent(playId)}` : next || '/';

function showAuth() {
  homeEl.classList.add('hidden');
  authEl.classList.remove('hidden');
  App.setLandingBg(true);
}

function showHome() {
  authEl.classList.add('hidden');
  homeEl.classList.remove('hidden');
  App.setLandingBg(true);
}

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
    // 가입·로그인은 통합 인증이 처리하고, 쿠키는 .elcherlab.com 으로 발급된다.
    await App.authApi(authMode === 'signup' ? '/api/signup' : '/api/login', { username, password });
    authPassEl.value = '';
    location.href = afterLogin; // 새로 받은 쿠키로 다시 부트
  } catch (e) {
    authErrorEl.textContent = e.message;
    authErrorEl.classList.remove('hidden');
    authSubmitEl.disabled = false;
  }
}
authSubmitEl.addEventListener('click', submitAuth);
authPassEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitAuth();
});

document.getElementById('homeGameBtn').addEventListener('click', () => (location.href = '/play'));
document.getElementById('homeChatBtn').addEventListener('click', () => (location.href = '/chat'));

App.start({
  app: 'landing',
  socket: false,
  onAnon: () => {
    setAuthMode('login');
    showAuth();
  },
  onReady: () => {
    // 공유 링크로 들어왔으면 바로 그 세계관을 여는 챗 페이지로.
    // 로그인 전에 열려던 페이지가 있으면 거기로. (afterLogin 은 이때 '/' 가 아니다)
    if (playId || next) return location.replace(afterLogin);
    showHome();
  },
});
