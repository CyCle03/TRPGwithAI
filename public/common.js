/* global io */
'use strict';

/**
 * 세 페이지(랜딩 · 던전 월드 · 캐릭터 챗)가 공유하는 뼈대.
 *
 * - 배경 영상 / 상단 사용자 바 / ⚙ 설정 모달 / 🧠 모델 모달 마크업을 여기서 DOM에 주입한다.
 *   (페이지 HTML마다 같은 마크업을 복사해 두면 한쪽만 고치는 사고가 나므로)
 * - 계정·API 키·모델 후보 같은 공용 상태는 /api/me + /api/config로 받는다. 소켓이 필요 없는
 *   랜딩 페이지에서도 설정 모달이 그대로 동작하도록 REST로 분리했다.
 *
 * 페이지 스크립트는 App.start({ app, socket, onSocket, onReady })로 시작한다.
 */
(function () {
  const App = {
    user: null,
    settings: null, // {provider, model, baseURL, keys:{provider:true}}
    username: '',
    isAdmin: false,
    providers: ['gemini', 'anthropic', 'openai', 'deepseek', 'xai', 'qwen', 'custom'],
    defaultModels: {},
    knownModels: {}, // 제공자별 추천 모델 후보(키 없이도 표시)
    freeAvailable: false, // 서버에 무료 체험(로컬 AI)이 열려 있는지
    freeLimitPerHour: 30,
    freeOffMessage:
      '무료 체험(서버 AI)은 현재 중단되었습니다. ⚙ 설정에서 다른 AI 제공자를 고르고 API 키를 등록해주세요.',
    socket: null,
    onSettingsSaved: null, // 페이지가 모델 라벨을 다시 그리도록 하는 훅
    onProfileClick: null, // 챗 페이지는 이동 대신 프로필 화면을 연다
  };
  window.App = App;

  // ---------- 공용 유틸 ----------
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
  App.api = api;

  /**
   * 통합 인증(auth.elcherlab.com) 호출.
   * 다른 출처라 credentials:'include' 가 있어야 쿠키를 주고받는다.
   * 주소는 서버가 내려준다(/api/auth-origin) — 하드코딩하면 개발 환경에서 어긋난다.
   */
  let authOriginPromise = null;
  async function authOrigin() {
    if (!authOriginPromise) {
      authOriginPromise = api('/api/auth-origin')
        .then((d) => d.authOrigin)
        .catch(() => {
          authOriginPromise = null; // 실패는 캐시하지 않는다
          throw new Error('인증 서버 주소를 가져오지 못했습니다.');
        });
    }
    return authOriginPromise;
  }
  async function authApi(path, body) {
    const origin = await authOrigin();
    const res = await fetch(origin + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '요청 실패');
    return data;
  }
  App.authApi = authApi;

  App.escapeHtml = function (s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
    );
  };

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
  App.PROVIDER_LABELS = PROVIDER_LABELS;

  // href가 있으면 클릭 가능한 링크로 보여준다(없으면 그냥 텍스트).
  const KEY_URLS = {
    gemini: {
      url: 'aistudio.google.com/apikey',
      href: 'https://aistudio.google.com/apikey',
      note: '무료 키 발급 가능(카드 불필요)',
    },
    anthropic: {
      url: 'console.anthropic.com/settings/keys',
      href: 'https://console.anthropic.com/settings/keys',
      note: '유료(선불 크레딧)',
    },
    openai: {
      url: 'platform.openai.com/api-keys',
      href: 'https://platform.openai.com/api-keys',
      note: '유료',
    },
    deepseek: {
      url: 'platform.deepseek.com/api_keys',
      href: 'https://platform.deepseek.com/api_keys',
      note: '유료(저렴)',
    },
    xai: { url: 'console.x.ai', href: 'https://console.x.ai', note: '유료' },
    qwen: {
      url: 'bailian.console.alibabacloud.com',
      href: 'https://bailian.console.alibabacloud.com',
      note: '유료(신규 무료 크레딧 제공)',
    },
    custom: { url: 'Ollama/LM Studio 등', note: '자체 호스팅은 키가 필요 없을 수 있음(비우면 됨)' },
    free: { url: '발급 불필요', note: '서버의 로컬 AI로 무료 체험 (느리고 사용량 제한 있음)' },
  };

  /** 키 발급처 표시 — href가 있으면 새 탭 링크. */
  function keyUrlHtml(k) {
    return k.href
      ? `<a href="${k.href}" target="_blank" rel="noopener noreferrer"><b>${k.url}</b></a>`
      : `<b>${k.url}</b>`;
  }

  /** 예전에 무료 체험을 쓰던 사용자인데 지금은 무료 체험이 닫혀 있는 상태. */
  function freeTrialStale() {
    return !App.freeAvailable && !!App.settings && App.settings.provider === 'free';
  }
  App.freeTrialStale = freeTrialStale;

  /** 무료 체험이 닫혔을 때 보여줄 안내 박스. */
  function freeOffHtml() {
    return (
      '<b>⚠️ 무료 체험이 중단되었습니다</b><br />' +
      '무료 체험을 돌리던 서버 AI를 내려서 지금은 쓸 수 없어요. ' +
      '아래에서 <b>다른 AI 제공자</b>를 고르고 <b>본인 API 키</b>를 등록하면 이어서 플레이할 수 있습니다.<br />' +
      '<span class="fn-good">✅ Google Gemini는 카드 없이 무료 키를 받을 수 있어요 — ' +
      '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a></span>'
    );
  }

  /** 설정 모달의 키 발급 안내 박스. 키가 없을 때만 단계 안내를 붙인다. */
  function keyGuideHtml(prov, hasKey) {
    if (prov === 'free' || prov === 'custom') return '';
    const parts = [];
    if (!hasKey && prov === 'gemini') {
      parts.push(
        '<b>🔑 Gemini 키 발급 — 1분이면 됩니다</b>' +
          '<ul>' +
          '<li><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> 접속 후 Google 계정으로 로그인</li>' +
          '<li><b>「API 키 만들기」</b> 클릭 (결제 카드 등록 없이 발급됩니다)</li>' +
          '<li>만들어진 키를 복사해 위 <b>API 키</b> 칸에 붙여넣고 저장</li>' +
          '</ul>',
      );
    } else if (!hasKey) {
      const k = KEY_URLS[prov];
      if (k && k.href) {
        parts.push(
          `<b>🔑 키 발급</b><br />${keyUrlHtml(k)} 에서 키를 만들어 위 칸에 붙여넣고 저장하세요. (${k.note})`,
        );
      }
    }
    if (prov === 'gemini') {
      // 무료 등급을 권하는 만큼 데이터 취급 차이는 알려야 한다(유료 등급은 학습에 쓰이지 않음).
      parts.push(
        '<span class="fn-warn">ℹ️ Google 무료 등급 키는 주고받은 내용이 Google의 제품 개선에 쓰이고 ' +
          '사람이 검토할 수 있습니다. 민감한 개인정보는 입력하지 마세요. ' +
          '(내 Google 계정에 결제 수단을 연결한 유료 등급 키는 학습에 쓰이지 않습니다.)</span>',
      );
    }
    return parts.join('<br />');
  }

  /** 무료 체험 모드 유의사항 문구. */
  function freeNoticeHtml() {
    return (
      '<b>⚠️ 무료 체험 모드 유의사항</b><br />' +
      '이 서버에 설치된 <b>작은 로컬 AI</b>로 동작합니다. API 키 없이 바로 쓸 수 있지만 아래 제한이 있어요.' +
      '<ul>' +
      '<li><b>느립니다</b> — CPU로 추론해서 한 응답에 수십 초가 걸릴 수 있어요.</li>' +
      `<li><b>사용량 제한</b> — 동시에 한 분만, 시간당 ${App.freeLimitPerHour}회까지.</li>` +
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
    if (on) el.innerHTML = App.freeAvailable ? freeNoticeHtml() : freeOffHtml();
  }

  /** 해당 제공자에 키가 등록돼 있는지. custom은 baseURL 기준. */
  App.providerReady = function (prov) {
    const s = App.settings;
    if (!s) return false;
    if (prov === 'free') return App.freeAvailable; // 무료 체험은 서버가 열어둔 동안만
    if (prov === 'custom') return !!(s.baseURL && s.baseURL.trim());
    return !!(s.keys && s.keys[prov]);
  };

  /** 제공자·모델을 사람이 읽는 한 줄로. */
  App.modelLabel = function (ai) {
    const prov = (ai && ai.provider) || 'gemini';
    const model = (ai && ai.model) || App.defaultModels[prov] || '기본';
    return `${PROVIDER_LABELS[prov] || prov} · ${model}`;
  };

  // ---------- "응답 생성 중" 표시 (경과 시간 + 애니메이션) ----------
  // 로컬 모델은 수십 초가 걸려서, 살아있다는 신호가 없으면 멈춘 것처럼 보인다.
  let thinkTimer = null;
  App.startThinking = function (el, baseText, provider) {
    App.stopThinking();
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
  };
  App.stopThinking = function () {
    if (thinkTimer) {
      clearInterval(thinkTimer);
      thinkTimer = null;
    }
  };

  // ---------- 공용 마크업 주입 ----------
  const CHROME_HTML = `
    <div id="legacyNotice" class="legacy-notice hidden">
      <span class="ln-text"></span>
      <button type="button" id="legacyNoticeClose" class="ln-close" aria-label="닫기">✕</button>
    </div>
    <video id="bgVideo" class="bg-video" autoplay muted loop playsinline preload="auto"></video>
    <div id="bgOverlay" class="bg-overlay"></div>

    <div id="userBar" class="user-bar hidden">
      <button id="homeBtn" class="ghost" title="홈으로">🏠</button>
      <div class="mode-toggle">
        <button id="modeGameBtn" class="mode-btn" title="AI GM 던전월드">🎲 게임</button>
        <button id="modeChatBtn" class="mode-btn" title="캐릭터 챗">💬 챗</button>
      </div>
      <button id="profileBtn" class="ghost" title="내 프로필"><span id="userName"></span></button>
      <button id="settingsBtn" class="ghost" title="설정">⚙ 설정</button>
      <button id="logoutBtn" class="ghost">로그아웃</button>
    </div>

    <div id="gameModelModal" class="modal-overlay hidden">
      <div class="modal-card">
        <h2>🧠 이 게임의 AI 모델</h2>
        <p class="modal-sub">
          게임마다 다른 모델을 쓸 수 있고 <b>진행 중에도</b> 바꿀 수 있어요. API 키는 ⚙ 설정에서 제공자별로 등록합니다.
        </p>
        <label>AI 제공자</label>
        <select id="gmProvider">
          <option value="gemini">Google Gemini (무료 등급 가능)</option>
          <option value="anthropic">Anthropic Claude</option>
          <option value="openai">OpenAI (GPT)</option>
          <option value="deepseek">DeepSeek (저렴)</option>
          <option value="xai">xAI Grok</option>
          <option value="qwen">Qwen (Alibaba)</option>
          <option value="custom">커스텀 (Ollama / OpenAI 호환)</option>
          <option value="free" id="gmFreeOpt" hidden>무료 체험 (서버 AI · 키 불필요 · 느림)</option>
        </select>
        <label>모델 <span class="opt">(비우면 기본값 사용)</span></label>
        <input id="gmModel" type="text" placeholder="기본값" autocomplete="off" list="gmModelList" />
        <datalist id="gmModelList"></datalist>
        <div class="model-actions">
          <button type="button" id="gmFetchModels" class="ghost">📋 사용 가능한 모델 불러오기</button>
          <button type="button" id="gmTestModel" class="ghost">🔌 연결 테스트</button>
        </div>
        <p class="hint" id="gmModelsHint"></p>
        <p class="hint" id="gmKeyHint"></p>
        <div class="free-notice hidden" id="gmFreeNotice"></div>

        <div id="gmLengthRow" class="hidden">
          <label>응답 길이 <span class="opt">(이 대화에만 적용)</span></label>
          <select id="gmLength">
            <option value="">제작자 권장 따르기</option>
            <option value="veryshort">아주 짧게 (1~2문장 · 메신저형)</option>
            <option value="short">짧게 (2~4문장)</option>
            <option value="medium">보통 (1~2문단)</option>
            <option value="long">길게 (3~4문단)</option>
            <option value="verylong">아주 길게 (250~300단어 · 소설형)</option>
          </select>
        </div>
        <div id="gameModelError" class="auth-error hidden"></div>
        <div class="wizard-nav">
          <button id="gmCancel" class="ghost">닫기</button>
          <button id="gmSave" class="primary">적용</button>
        </div>
      </div>
    </div>

    <div id="settingsModal" class="modal-overlay hidden">
      <div class="modal-card">
        <h2>⚙ 설정</h2>
        <p class="modal-sub">
          제공자별 <b>본인 API 키</b>를 등록하세요(암호화 저장, 타인에게 노출 안 됨). 여기서 고른 제공자·모델은
          <b>새 게임의 기본값</b>이며, 게임별 모델은 🧠 버튼으로 따로 바꿀 수 있어요.
        </p>

        <label>AI 제공자</label>
        <select id="setProvider">
          <option value="gemini">Google Gemini (무료 등급 가능)</option>
          <option value="anthropic">Anthropic Claude</option>
          <option value="openai">OpenAI (GPT)</option>
          <option value="deepseek">DeepSeek (저렴)</option>
          <option value="xai">xAI Grok</option>
          <option value="qwen">Qwen (Alibaba)</option>
          <option value="custom">커스텀 (Ollama / OpenAI 호환)</option>
          <option value="free" id="setFreeOpt" hidden>무료 체험 (서버 AI · 키 불필요 · 느림)</option>
        </select>

        <div id="baseUrlRow" class="hidden">
          <label>엔드포인트 주소 <span class="opt">(baseURL)</span></label>
          <input id="setBaseUrl" type="text" placeholder="예: http://호스트:11434/v1" autocomplete="off" />
          <p class="hint" id="baseUrlHelp">
            OpenAI 호환 <code>/chat/completions</code> 를 제공하는 주소. <b>이 서버(클라우드)에서 접근 가능한 공개 주소</b>여야 합니다 — 내 PC의 localhost Ollama는 직접 연결되지 않습니다.
          </p>
        </div>

        <label>모델 <span class="opt">(비우면 기본값 사용)</span></label>
        <input id="setModel" type="text" placeholder="기본값" autocomplete="off" />

        <label>API 키 <span class="opt" id="keyStatus"></span></label>
        <input id="setKey" type="password" placeholder="키를 붙여넣기 (변경할 때만 입력)" autocomplete="off" />
        <p class="hint" id="keyHelp"></p>
        <div class="free-notice hidden" id="setKeyGuide"></div>
        <div class="free-notice hidden" id="setFreeNotice"></div>

        <div class="disclaimer">
          <b>⚠️ 면책 조항</b><br />
          본 서비스는 개인이 만든 비상업 취미 프로젝트입니다. 등록하신 API 키의 사용량과 그에 따른 모든
          요금·과금은 전적으로 사용자 본인의 책임입니다. 키는 암호화되어 저장되지만, 운영자는 데이터의
          보안·무결성·가용성을 어떠한 형태로도 보증하지 않습니다. 서비스 이용 과정에서 발생하는 요금,
          데이터 손실, 계정·키 유출, 서비스 중단 등 일체의 직간접적 손해에 대해 운영자는 법적 책임을 지지
          않습니다. 이에 동의하지 않으시면 API 키를 등록하지 마세요. API 키 등록 및 게임 이용은 위 내용에
          동의하는 것으로 간주됩니다.
        </div>

        <div id="settingsError" class="auth-error hidden"></div>
        <div class="wizard-nav">
          <button id="settingsCancel" class="ghost">닫기</button>
          <button id="settingsSave" class="primary">저장</button>
        </div>
      </div>
    </div>`;

  const chrome = document.createElement('div');
  chrome.innerHTML = CHROME_HTML;
  while (chrome.firstChild) document.body.appendChild(chrome.firstChild);

  /**
   * 구 duckdns 주소 종료 안내.
   * ai-gm.duckdns.org 는 현재 이 주소로 301 리다이렉트되지만 2026-08-07 에 끊는다.
   * 그날이 지나면 스스로 사라지므로 따로 걷어낼 필요가 없다.
   */
  (function legacyNotice() {
    const CUTOFF = Date.UTC(2026, 7, 7); // 2026-08-07 (월은 0부터)
    const KEY = 'legacyDomainNoticeDismissed';
    // $ 는 이 아래에서 const 로 선언돼 여기선 아직 못 쓴다(TDZ).
    const el = document.getElementById('legacyNotice');
    if (!el) return;
    if (Date.now() >= CUTOFF) return; // 기한이 지나면 안내를 멈춘다
    try {
      if (localStorage.getItem(KEY) === '1') return;
    } catch (_) {}
    el.querySelector('.ln-text').textContent =
      '옛 주소(ai-gm.duckdns.org)는 8월 7일부터 접속할 수 없습니다. ' +
      '북마크를 gm.elcherlab.com 으로 바꿔주세요.';
    el.classList.remove('hidden');
    document.body.classList.add('has-legacy-notice');
    document.getElementById('legacyNoticeClose').addEventListener('click', () => {
      el.classList.add('hidden');
      document.body.classList.remove('has-legacy-notice');
      try { localStorage.setItem(KEY, '1'); } catch (_) {}
    });
  })();

  const $ = (id) => document.getElementById(id);

  // ---------- 배경 영상 ----------
  const bgVideo = $('bgVideo');
  // 랜딩 배경 앰비언트 클립 4종 — 접속(로드)마다 랜덤 1개 선택.
  const BG_VIDEOS = [
    '/assets/intro1.mp4',
    '/assets/intro2.mp4',
    '/assets/intro3.mp4',
    '/assets/intro4.mp4',
  ];
  if (bgVideo) {
    bgVideo.src = BG_VIDEOS[Math.floor(Math.random() * BG_VIDEOS.length)];
    bgVideo.play().catch(() => {});
  }
  /** 랜딩(로그인·생성) 화면에서만 배경 영상 재생, 게임/대화 중엔 정지. */
  App.setLandingBg = function (on) {
    document.body.classList.toggle('in-game', !on);
    if (!bgVideo) return;
    if (on) bgVideo.play().catch(() => {});
    else bgVideo.pause();
  };

  // ---------- 사용자 바 ----------
  const userBarEl = $('userBar');
  const userNameEl = $('userName');
  App.userNameEl = userNameEl;

  $('homeBtn').addEventListener('click', () => (location.href = '/'));
  $('modeGameBtn').addEventListener('click', () => (location.href = '/play'));
  $('modeChatBtn').addEventListener('click', () => (location.href = '/chat'));
  $('profileBtn').addEventListener('click', () => {
    if (App.onProfileClick) App.onProfileClick();
    else location.href = '/chat?view=profile';
  });
  $('settingsBtn').addEventListener('click', () => openSettings(false));
  $('logoutBtn').addEventListener('click', async () => {
    try {
      // 세션 쿠키는 .elcherlab.com 도메인이라 통합 인증이 지운다.
      await authApi('/api/logout', {});
    } catch (_) {}
    if (App.socket) App.socket.disconnect();
    location.href = '/';
  });

  // ---------- 설정 모달 ----------
  const settingsModal = $('settingsModal');
  const setProviderEl = $('setProvider');
  const setModelEl = $('setModel');
  const baseUrlRowEl = $('baseUrlRow');
  const setBaseUrlEl = $('setBaseUrl');
  const setKeyEl = $('setKey');
  const keyStatusEl = $('keyStatus');
  const keyHelpEl = $('keyHelp');
  const settingsErrorEl = $('settingsError');
  const settingsSaveBtn = $('settingsSave');
  const setFreeNoticeEl = $('setFreeNotice');
  const setKeyGuideEl = $('setKeyGuide');

  function openSettings(firstTime) {
    settingsErrorEl.classList.add('hidden');
    const stale = freeTrialStale();
    if (App.settings) {
      // 무료 체험이 닫혔으면 고를 수 없는 값 대신 Gemini를 미리 선택해 둔다.
      setProviderEl.value = stale ? 'gemini' : App.settings.provider || 'gemini';
      setModelEl.value = stale ? '' : App.settings.model || '';
      setBaseUrlEl.value = App.settings.baseURL || '';
    }
    setKeyEl.value = '';
    updateSettingsHints();
    settingsModal.classList.remove('hidden');
    if (stale) {
      settingsErrorEl.textContent = App.freeOffMessage;
      settingsErrorEl.classList.remove('hidden');
    } else if (firstTime) {
      settingsErrorEl.textContent =
        '먼저 AI API 키를 등록해야 게임을 시작할 수 있어요. 아래 안내를 따라 카드 없이 발급받을 수 있습니다.';
      settingsErrorEl.classList.remove('hidden');
    }
  }
  App.openSettings = openSettings;
  App.closeSettings = function () {
    settingsModal.classList.add('hidden');
  };

  function updateSettingsHints() {
    const prov = setProviderEl.value;
    setModelEl.placeholder = App.defaultModels[prov] || '기본값';
    const hasKey = !!(App.settings && App.settings.keys && App.settings.keys[prov]);
    keyStatusEl.textContent = hasKey ? '(등록됨 — 바꿀 때만 입력)' : '(미등록)';
    const k = KEY_URLS[prov] || KEY_URLS.gemini;
    keyHelpEl.innerHTML = `키 발급: ${keyUrlHtml(k)} · ${k.note}`;
    const guide = keyGuideHtml(prov, hasKey);
    setKeyGuideEl.innerHTML = guide;
    setKeyGuideEl.classList.toggle('hidden', !guide);
    // 커스텀 제공자일 때만 엔드포인트 주소 입력란 표시
    baseUrlRowEl.classList.toggle('hidden', prov !== 'custom');
    // 무료 체험은 키 입력이 필요 없음 + 유의사항 표시 (닫혔으면 일반 제공자처럼 키 입력 허용)
    const freeLive = prov === 'free' && App.freeAvailable;
    setKeyEl.disabled = freeLive;
    setKeyEl.placeholder = freeLive ? '무료 체험은 키가 필요 없습니다' : '키를 붙여넣기 (변경할 때만 입력)';
    toggleFreeNotice(setFreeNoticeEl, prov);
  }

  setProviderEl.addEventListener('change', updateSettingsHints);
  $('settingsCancel').addEventListener('click', App.closeSettings);
  settingsSaveBtn.addEventListener('click', async () => {
    settingsSaveBtn.disabled = true;
    settingsErrorEl.classList.add('hidden');
    try {
      const body = { provider: setProviderEl.value, model: setModelEl.value.trim() };
      if (setProviderEl.value === 'custom') body.baseURL = setBaseUrlEl.value.trim();
      if (setKeyEl.value.trim()) body.apiKey = setKeyEl.value.trim();
      const data = await api('/api/settings', body);
      App.settings = data.user.settings;
      if (!App.settings.keys) App.settings.keys = {};
      setKeyEl.value = '';
      if (App.onSettingsSaved) App.onSettingsSaved();
      App.closeSettings();
    } catch (e) {
      settingsErrorEl.textContent = e.message;
      settingsErrorEl.classList.remove('hidden');
    } finally {
      settingsSaveBtn.disabled = false;
    }
  });

  // ---------- 모델 모달 (게임/챗 공용) ----------
  const gameModelModal = $('gameModelModal');
  const gmProviderEl = $('gmProvider');
  const gmModelEl = $('gmModel');
  const gmKeyHintEl = $('gmKeyHint');
  const gameModelErrorEl = $('gameModelError');
  const gmModelListEl = $('gmModelList');
  const gmFetchModelsBtn = $('gmFetchModels');
  const gmTestModelBtn = $('gmTestModel');
  const gmModelsHintEl = $('gmModelsHint');
  const gmFreeNoticeEl = $('gmFreeNotice');
  const gmLengthRowEl = $('gmLengthRow');
  const gmLengthEl = $('gmLength');
  let modelSaveHandler = null;

  const LENGTH_LABELS = {
    veryshort: '아주 짧게',
    short: '짧게',
    medium: '보통',
    long: '길게',
    verylong: '아주 길게',
  };

  /**
   * 모델 선택 모달을 연다.
   * @param {{ai:{provider,model}, length?:{recommended:string, override:string}|null,
   *          onSave:(v:{provider:string, model:string, length:string|null})=>void}} opts
   */
  App.openModelModal = function (opts) {
    modelSaveHandler = opts.onSave;
    const ai = opts.ai || {};
    gameModelErrorEl.classList.add('hidden');
    // 무료 체험이 닫혔는데 예전 게임/챗이 'free'로 저장돼 있으면 고를 수 있는 값으로 바꿔 준다.
    const staleFree = ai.provider === 'free' && !App.freeAvailable;
    gmProviderEl.value = staleFree ? 'gemini' : ai.provider || 'gemini';
    gmModelEl.value = staleFree ? '' : ai.model || '';
    if (staleFree) {
      gameModelErrorEl.textContent = App.freeOffMessage;
      gameModelErrorEl.classList.remove('hidden');
    }
    // 응답 길이는 챗에서만 (제작자 권장 + 내 설정)
    const len = opts.length || null;
    gmLengthRowEl.classList.toggle('hidden', !len);
    if (len) {
      const rec = len.recommended || 'medium';
      gmLengthEl.options[0].textContent = `제작자 권장 따르기 (${LENGTH_LABELS[rec] || rec})`;
      gmLengthEl.value = len.override || '';
    }
    updateGameModelHint();
    gameModelModal.classList.remove('hidden');
  };

  function updateGameModelHint() {
    const prov = gmProviderEl.value;
    gmModelEl.placeholder = App.defaultModels[prov] || '기본값';
    // 제공자가 바뀌면 추천 후보로 초기화(키 없이도 뭘 쓸 수 있는지 보이게)
    fillModelDatalist(App.knownModels[prov] || []);
    const n = (App.knownModels[prov] || []).length;
    gmModelsHintEl.textContent = n
      ? `추천 모델 ${n}개를 넣어뒀어요(모델 칸 클릭). 키가 있으면 「불러오기」로 내 계정의 실제 목록을 볼 수 있어요.`
      : '모델 이름을 직접 입력하세요.';
    const ready = App.providerReady(prov);
    const pname = PROVIDER_LABELS[prov] || prov;
    gmKeyHintEl.innerHTML =
      prov === 'free'
        ? App.freeAvailable
          ? '키가 필요 없습니다 — 서버의 로컬 AI로 바로 플레이합니다.'
          : `⚠ ${App.freeOffMessage}`
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

  gmFetchModelsBtn.addEventListener('click', fetchModelList);
  gmTestModelBtn.addEventListener('click', testModelConnection);
  gmProviderEl.addEventListener('change', updateGameModelHint);
  $('gmCancel').addEventListener('click', () => gameModelModal.classList.add('hidden'));
  $('gmSave').addEventListener('click', () => {
    const payload = {
      provider: gmProviderEl.value,
      model: gmModelEl.value.trim(),
      length: gmLengthRowEl.classList.contains('hidden') ? null : gmLengthEl.value || null,
    };
    gameModelModal.classList.add('hidden');
    if (modelSaveHandler) modelSaveHandler(payload);
  });
  App.closeModelModal = function () {
    gameModelModal.classList.add('hidden');
  };

  // ---------- 부트 ----------
  /**
   * 페이지 공통 시작 절차.
   * @param {{app:'landing'|'play'|'chat', socket?:boolean,
   *          onAnon?:()=>void, onSocket?:(s:any)=>void, onReady?:()=>void}} opts
   */
  App.start = async function (opts) {
    const app = opts.app;
    // 현재 페이지를 사용자 바에 표시(랜딩에서는 🏠가 의미 없으니 감춘다)
    $('modeGameBtn').classList.toggle('active', app === 'play');
    $('modeChatBtn').classList.toggle('active', app === 'chat');
    $('homeBtn').classList.toggle('hidden', app === 'landing');

    let user = null;
    try {
      user = (await api('/api/me')).user;
    } catch (_) {}
    if (!user) {
      // 로그인 화면은 랜딩에만 있다 — 나머지 페이지는 랜딩으로 보낸다.
      if (app === 'landing') return opts.onAnon && opts.onAnon();
      // 로그인이 끝나면 원래 열려던 페이지로 돌아올 수 있게 목적지를 넘긴다.
      // (외부에서 /play·/chat 으로 바로 들어온 방문자가 홈에서 한 번 더 고르지 않도록)
      const back = encodeURIComponent(location.pathname + location.search);
      location.replace(`/?next=${back}`);
      return;
    }

    App.user = user;
    App.settings = user.settings || { provider: 'gemini', model: '', baseURL: '', keys: {} };
    if (!App.settings.keys) App.settings.keys = {};

    const cfg = await api('/api/config');
    App.username = cfg.username || '';
    App.isAdmin = !!cfg.isAdmin;
    if (Array.isArray(cfg.providers)) App.providers = cfg.providers;
    App.defaultModels = cfg.defaultModels || {};
    App.knownModels = cfg.knownModels || {};
    if (cfg.freeLimit) App.freeLimitPerHour = cfg.freeLimit;
    if (cfg.freeOffMessage) App.freeOffMessage = cfg.freeOffMessage;
    // 서버에 로컬 AI가 설정된 경우에만 '무료 체험' 선택지를 노출
    App.freeAvailable = App.providers.includes('free');
    ['setFreeOpt', 'gmFreeOpt'].forEach((id) => {
      const o = $(id);
      if (o) o.hidden = !App.freeAvailable;
    });

    userNameEl.textContent = App.username;
    userBarEl.classList.remove('hidden');

    if (opts.socket) {
      App.socket = io({ query: { app } });
      if (opts.onSocket) opts.onSocket(App.socket);
    }
    if (opts.onReady) opts.onReady();

    // 키가 하나도 없으면(또는 쓰던 무료 체험이 닫혔으면) 설정을 먼저 열어 안내
    if (!Object.keys(App.settings.keys).length || freeTrialStale()) openSettings(true);
  };
})();
