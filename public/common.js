/* global io, I18N */
'use strict';

/**
 * 세 페이지(랜딩 · 던전 월드 · 캐릭터 챗)가 공유하는 뼈대.
 *
 * - 배경 영상 / 상단 사용자 바 / ⚙ 설정 모달 / 🧠 모델 모달 마크업을 여기서 DOM에 주입한다.
 *   (페이지 HTML마다 같은 마크업을 복사해 두면 한쪽만 고치는 사고가 나므로)
 * - 계정·API 키·모델 후보 같은 공용 상태는 /api/me + /api/config로 받는다. 소켓이 필요 없는
 *   랜딩 페이지에서도 설정 모달이 그대로 동작하도록 REST로 분리했다.
 * - 언어는 i18n.js 가 정하고, 서버에는 X-Lang 헤더 / 소켓 query 로 알려 준다
 *   (오류 메시지와 AI 서사의 언어를 맞추기 위해서다).
 *
 * 페이지 스크립트는 App.start({ app, socket, onSocket, onReady })로 시작한다.
 */
(function () {
  const t = I18N.t;
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
    socket: null,
    onSettingsSaved: null, // 페이지가 모델 라벨을 다시 그리도록 하는 훅
    onProfileClick: null, // 챗 페이지는 이동 대신 프로필 화면을 연다
  };
  window.App = App;

  // 무료 체험 중단 안내는 서버도 같은 문구를 갖고 있지만(한국어 원문), 화면에는
  // 현재 언어 사전을 쓴다. 서버 값은 사전에 없는 상황에서의 최후 수단.
  Object.defineProperty(App, 'freeOffMessage', {
    get() {
      return I18N.t('free.offMessage');
    },
  });

  // ---------- 공용 유틸 ----------
  async function api(path, body) {
    // X-Lang: 서버가 오류 메시지를 어느 언어로 돌려줄지 정하는 데 쓴다.
    const headers = { 'X-Lang': I18N.lang };
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('common.requestFailed'));
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
          throw new Error(t('common.authOriginFailed'));
        });
    }
    return authOriginPromise;
  }
  async function authApi(path, body) {
    const origin = await authOrigin();
    const headers = { 'X-Lang': I18N.lang };
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(origin + path, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('common.requestFailed'));
    return data;
  }
  App.authApi = authApi;

  App.escapeHtml = function (s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
    );
  };

  // 브랜드명은 번역하지 않는다 — 커스텀·무료 체험만 사전을 탄다.
  const BRAND_LABELS = {
    gemini: 'Gemini',
    anthropic: 'Claude',
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    xai: 'Grok',
    qwen: 'Qwen',
  };
  function providerLabel(prov) {
    return BRAND_LABELS[prov] || I18N.tOr('provLabel.' + prov, prov);
  }
  App.providerLabel = providerLabel;

  // href가 있으면 클릭 가능한 링크로 보여준다(없으면 그냥 텍스트).
  // 주소는 언어와 무관하고, 설명(note)만 사전을 탄다.
  const KEY_URLS = {
    gemini: { url: 'aistudio.google.com/apikey', href: 'https://aistudio.google.com/apikey' },
    anthropic: {
      url: 'console.anthropic.com/settings/keys',
      href: 'https://console.anthropic.com/settings/keys',
    },
    openai: { url: 'platform.openai.com/api-keys', href: 'https://platform.openai.com/api-keys' },
    deepseek: {
      url: 'platform.deepseek.com/api_keys',
      href: 'https://platform.deepseek.com/api_keys',
    },
    xai: { url: 'console.x.ai', href: 'https://console.x.ai' },
    qwen: {
      url: 'bailian.console.alibabacloud.com',
      href: 'https://bailian.console.alibabacloud.com',
    },
    custom: {},
    free: {},
  };

  /** 제공자별 키 발급처. url·note 는 언어에 따라 달라질 수 있어 호출 시점에 만든다. */
  function keyInfo(prov) {
    const base = KEY_URLS[prov] || KEY_URLS.gemini;
    return {
      href: base.href,
      url: base.url || t('key.' + prov + '.url'),
      note: t('key.' + prov + '.note'),
    };
  }

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
      t('free.off.title') +
      '<br />' +
      t('free.off.body') +
      '<br />' +
      `<span class="fn-good">${t('free.off.gemini')}</span>`
    );
  }

  /** 설정 모달의 키 발급 안내 박스. 키가 없을 때만 단계 안내를 붙인다. */
  function keyGuideHtml(prov, hasKey) {
    if (prov === 'free' || prov === 'custom') return '';
    const parts = [];
    if (!hasKey && prov === 'gemini') {
      parts.push(
        t('guide.gemini.title') +
          '<ul>' +
          `<li>${t('guide.gemini.s1')}</li>` +
          `<li>${t('guide.gemini.s2')}</li>` +
          `<li>${t('guide.gemini.s3')}</li>` +
          '</ul>',
      );
    } else if (!hasKey) {
      const k = keyInfo(prov);
      if (k.href) {
        parts.push(t('guide.generic', { url: keyUrlHtml(k), note: k.note }));
      }
    }
    if (prov === 'gemini') {
      // 무료 등급을 권하는 만큼 데이터 취급 차이는 알려야 한다(유료 등급은 학습에 쓰이지 않음).
      parts.push(`<span class="fn-warn">${t('guide.geminiFreeTier')}</span>`);
    }
    return parts.join('<br />');
  }

  /** 무료 체험 모드 유의사항 문구. */
  function freeNoticeHtml() {
    return (
      t('free.notice.title') +
      '<br />' +
      t('free.notice.lead') +
      '<ul>' +
      `<li>${t('free.notice.slow')}</li>` +
      `<li>${t('free.notice.limit', { n: App.freeLimitPerHour })}</li>` +
      `<li>${t('free.notice.quality')}</li>` +
      `<li>${t('free.notice.trial')}</li>` +
      '</ul>' +
      t('free.notice.tail') +
      '<br />' +
      `<span class="fn-good">${t('free.notice.local')}</span>`
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
    const model = (ai && ai.model) || App.defaultModels[prov] || t('common.default');
    return `${providerLabel(prov)} · ${model}`;
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
      let txt = t('think.elapsed', { frame: frames[i], base: baseText, sec });
      if (provider === 'free') {
        if (sec >= 8) txt += t('think.freeSlow');
      } else if (sec >= 25) {
        txt += t('think.slow');
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
      <button id="homeBtn" class="ghost" data-i18n-title="bar.home" title="홈으로">🏠</button>
      <div class="mode-toggle">
        <button id="modeGameBtn" class="mode-btn" data-i18n-title="bar.gameTitle" data-i18n="bar.game">🎲 게임</button>
        <button id="modeChatBtn" class="mode-btn" data-i18n-title="bar.chatTitle" data-i18n="bar.chat">💬 챗</button>
      </div>
      <button id="profileBtn" class="ghost" data-i18n-title="bar.profile"><span id="userName"></span></button>
      <button id="langBtn" class="ghost" data-i18n-title="lang.switchTitle" data-i18n="lang.other">English</button>
      <button id="settingsBtn" class="ghost" data-i18n-title="bar.settingsTitle" data-i18n="bar.settings">⚙ 설정</button>
      <button id="logoutBtn" class="ghost" data-i18n="bar.logout">로그아웃</button>
    </div>

    <div id="gameModelModal" class="modal-overlay hidden">
      <div class="modal-card">
        <h2 data-i18n="gm.title">🧠 이 게임의 AI 모델</h2>
        <p class="modal-sub" data-i18n-html="gm.sub">
          게임마다 다른 모델을 쓸 수 있고 <b>진행 중에도</b> 바꿀 수 있어요. API 키는 ⚙ 설정에서 제공자별로 등록합니다.
        </p>
        <label data-i18n="set.provider">AI 제공자</label>
        <select id="gmProvider">
          <option value="gemini" data-i18n="prov.gemini">Google Gemini (무료 등급 가능)</option>
          <option value="anthropic" data-i18n="prov.anthropic">Anthropic Claude</option>
          <option value="openai" data-i18n="prov.openai">OpenAI (GPT)</option>
          <option value="deepseek" data-i18n="prov.deepseek">DeepSeek (저렴)</option>
          <option value="xai" data-i18n="prov.xai">xAI Grok</option>
          <option value="qwen" data-i18n="prov.qwen">Qwen (Alibaba)</option>
          <option value="custom" data-i18n="prov.custom">커스텀 (Ollama / OpenAI 호환)</option>
          <option value="free" id="gmFreeOpt" hidden data-i18n="prov.free">무료 체험 (서버 AI · 키 불필요 · 느림)</option>
        </select>
        <label><span data-i18n="set.model">모델</span> <span class="opt" data-i18n="set.modelOpt">(비우면 기본값 사용)</span></label>
        <input id="gmModel" type="text" data-i18n-ph="common.defaultValue" placeholder="기본값" autocomplete="off" list="gmModelList" />
        <datalist id="gmModelList"></datalist>
        <div class="model-actions">
          <button type="button" id="gmFetchModels" class="ghost" data-i18n="gm.fetchModels">📋 사용 가능한 모델 불러오기</button>
          <button type="button" id="gmTestModel" class="ghost" data-i18n="gm.testModel">🔌 연결 테스트</button>
        </div>
        <p class="hint" id="gmModelsHint"></p>
        <p class="hint" id="gmKeyHint"></p>
        <div class="free-notice hidden" id="gmFreeNotice"></div>

        <div id="gmLengthRow" class="hidden">
          <label><span data-i18n="gm.lengthLabel">응답 길이</span> <span class="opt" data-i18n="gm.lengthOpt">(이 대화에만 적용)</span></label>
          <select id="gmLength">
            <option value="" data-i18n="gm.lengthDefault">제작자 권장 따르기</option>
            <option value="veryshort" data-i18n="len.opt.veryshort">아주 짧게 (1~2문장 · 메신저형)</option>
            <option value="short" data-i18n="len.opt.short">짧게 (2~4문장)</option>
            <option value="medium" data-i18n="len.opt.medium">보통 (1~2문단)</option>
            <option value="long" data-i18n="len.opt.long">길게 (3~4문단)</option>
            <option value="verylong" data-i18n="len.opt.verylong">아주 길게 (250~300단어 · 소설형)</option>
          </select>
        </div>
        <div id="gameModelError" class="auth-error hidden"></div>
        <div class="wizard-nav">
          <button id="gmCancel" class="ghost" data-i18n="common.close">닫기</button>
          <button id="gmSave" class="primary" data-i18n="common.apply">적용</button>
        </div>
      </div>
    </div>

    <div id="settingsModal" class="modal-overlay hidden">
      <div class="modal-card">
        <h2 data-i18n="set.title">⚙ 설정</h2>
        <p class="modal-sub" data-i18n-html="set.sub">
          제공자별 <b>본인 API 키</b>를 등록하세요(암호화 저장, 타인에게 노출 안 됨). 여기서 고른 제공자·모델은
          <b>새 게임의 기본값</b>이며, 게임별 모델은 🧠 버튼으로 따로 바꿀 수 있어요.
        </p>

        <label data-i18n="set.provider">AI 제공자</label>
        <select id="setProvider">
          <option value="gemini" data-i18n="prov.gemini">Google Gemini (무료 등급 가능)</option>
          <option value="anthropic" data-i18n="prov.anthropic">Anthropic Claude</option>
          <option value="openai" data-i18n="prov.openai">OpenAI (GPT)</option>
          <option value="deepseek" data-i18n="prov.deepseek">DeepSeek (저렴)</option>
          <option value="xai" data-i18n="prov.xai">xAI Grok</option>
          <option value="qwen" data-i18n="prov.qwen">Qwen (Alibaba)</option>
          <option value="custom" data-i18n="prov.custom">커스텀 (Ollama / OpenAI 호환)</option>
          <option value="free" id="setFreeOpt" hidden data-i18n="prov.free">무료 체험 (서버 AI · 키 불필요 · 느림)</option>
        </select>

        <div id="baseUrlRow" class="hidden">
          <label><span data-i18n="set.baseUrl">엔드포인트 주소</span> <span class="opt">(baseURL)</span></label>
          <input id="setBaseUrl" type="text" data-i18n-ph="set.baseUrlPlaceholder" placeholder="예: http://호스트:11434/v1" autocomplete="off" />
          <p class="hint" id="baseUrlHelp" data-i18n-html="set.baseUrlHelp">
            OpenAI 호환 <code>/chat/completions</code> 를 제공하는 주소. <b>이 서버(클라우드)에서 접근 가능한 공개 주소</b>여야 합니다 — 내 PC의 localhost Ollama는 직접 연결되지 않습니다.
          </p>
        </div>

        <label><span data-i18n="set.model">모델</span> <span class="opt" data-i18n="set.modelOpt">(비우면 기본값 사용)</span></label>
        <input id="setModel" type="text" data-i18n-ph="common.defaultValue" placeholder="기본값" autocomplete="off" />

        <label><span data-i18n="set.apiKey">API 키</span> <span class="opt" id="keyStatus"></span></label>
        <input id="setKey" type="password" placeholder="키를 붙여넣기 (변경할 때만 입력)" autocomplete="off" />
        <p class="hint" id="keyHelp"></p>
        <div class="free-notice hidden" id="setKeyGuide"></div>
        <div class="free-notice hidden" id="setFreeNotice"></div>

        <div class="disclaimer" id="xferConsentBox">
          <b data-i18n="set.xfer.title">🌏 국외 이전 동의 (API 키 등록 시 필수)</b><br />
          <span data-i18n="set.xfer.lead">키를 등록하면 AI 기능을 쓸 때마다 아래 정보가 이용자가 고른 AI 사업자에게 국외로 전송됩니다.</span>
          <ul class="consent-list">
            <li data-i18n-html="set.xfer.items"><b>이전 항목</b> — 입력한 대화 내용, 세계관·캐릭터 설정, 앞선 대화 맥락, 등록한 API 키</li>
            <li data-i18n-html="set.xfer.who"><b>이전받는 자·국가</b> — 미국(Google·Anthropic·OpenAI·xAI), 중국(DeepSeek), 싱가포르 등(Alibaba Cloud). 커스텀은 직접 입력한 주소의 운영자</li>
            <li data-i18n-html="set.xfer.when"><b>시기·방법</b> — AI를 호출할 때마다 암호화된 연결(TLS)로 전송</li>
            <li data-i18n-html="set.xfer.why"><b>목적·보유기간</b> — AI 응답 생성. 전송 이후의 보관·이용은 각 사업자의 정책을 따르며 운영자는 통제할 수 없습니다</li>
            <li data-i18n-html="set.xfer.optout"><b>거부 방법·효과</b> — 동의하지 않거나 등록한 키를 삭제하면 전송되지 않습니다. AI 기능만 쓸 수 없고 계정·다른 서비스 이용에는 영향이 없습니다</li>
          </ul>
          <p id="xferConsentNeed" class="hidden" data-i18n-html="set.xfer.need">
            <b>이미 등록해 둔 키가 있습니다.</b> AI 기능을 계속 쓰시려면 아래에 동의하고 저장해 주세요.
            동의하지 않으시려면 그대로 두시면 됩니다 — 전송이 일어나지 않습니다.
          </p>
          <label class="consent-line">
            <input type="checkbox" id="setXferConsent" />
            <span data-i18n-html="set.xfer.agree">위 국외 이전에 동의합니다 —
              <a href="https://elcherlab.com/privacy.html#s6" target="_blank" rel="noopener">개인정보처리방침 7장</a></span>
          </label>
        </div>

        <div class="disclaimer">
          <b data-i18n="set.disclaimer.title">⚠️ 면책 조항</b><br />
          <span data-i18n="set.disclaimer.body">본 서비스는 개인이 만든 비상업 취미 프로젝트입니다. 등록하신 API 키의 사용량과 그에 따른 모든
          요금·과금은 전적으로 사용자 본인의 책임입니다. 키는 암호화되어 저장되지만, 운영자는 데이터의
          보안·무결성·가용성을 어떠한 형태로도 보증하지 않습니다. 서비스 이용 과정에서 발생하는 요금,
          데이터 손실, 계정·키 유출, 서비스 중단 등 일체의 직간접적 손해에 대해 운영자는 법적 책임을 지지
          않습니다. 이에 동의하지 않으시면 API 키를 등록하지 마세요. API 키 등록 및 게임 이용은 위 내용에
          동의하는 것으로 간주됩니다.</span>
        </div>

        <div id="settingsError" class="auth-error hidden"></div>
        <div class="wizard-nav">
          <button id="settingsCancel" class="ghost" data-i18n="common.close">닫기</button>
          <button id="settingsSave" class="primary" data-i18n="common.save">저장</button>
        </div>
      </div>
    </div>`;

  const chrome = document.createElement('div');
  chrome.innerHTML = CHROME_HTML;
  while (chrome.firstChild) document.body.appendChild(chrome.firstChild);

  // 페이지 HTML + 방금 주입한 공용 마크업을 한 번에 현재 언어로 맞춘다.
  I18N.apply(document);

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
    el.querySelector('.ln-text').setAttribute('data-i18n', 'legacy.notice');
    el.querySelector('.ln-text').textContent = t('legacy.notice');
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
  // 언어 전환. 정적 문구는 즉시 바뀌고, 목록처럼 스크립트가 그린 부분은
  // 각 페이지가 'i18n:change' 를 듣고 다시 그린다.
  $('langBtn').addEventListener('click', () => I18N.setLang(I18N.other()));
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
  const xferConsentBoxEl = $('xferConsentBox');
  const xferConsentNeedEl = $('xferConsentNeed');
  const setXferConsentEl = $('setXferConsent');

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
    // 이미 동의한 사용자는 체크된 채로 열린다. 방침이 바뀌면 서버가 false를 준다.
    setXferConsentEl.checked = !!(App.settings && App.settings.xferConsent);
    updateSettingsHints();
    settingsModal.classList.remove('hidden');
    if (stale) {
      settingsErrorEl.textContent = App.freeOffMessage;
      settingsErrorEl.classList.remove('hidden');
    } else if (firstTime) {
      settingsErrorEl.textContent = t('set.firstTime');
      settingsErrorEl.classList.remove('hidden');
    }
  }
  App.openSettings = openSettings;
  App.closeSettings = function () {
    settingsModal.classList.add('hidden');
  };

  function updateSettingsHints() {
    const prov = setProviderEl.value;
    setModelEl.placeholder = App.defaultModels[prov] || t('common.defaultValue');
    const hasKey = !!(App.settings && App.settings.keys && App.settings.keys[prov]);
    keyStatusEl.textContent = hasKey ? t('set.keyRegistered') : t('set.keyMissing');
    const k = keyInfo(prov);
    keyHelpEl.innerHTML = t('set.keyIssue', { url: keyUrlHtml(k), note: k.note });
    const guide = keyGuideHtml(prov, hasKey);
    setKeyGuideEl.innerHTML = guide;
    setKeyGuideEl.classList.toggle('hidden', !guide);
    // 커스텀 제공자일 때만 엔드포인트 주소 입력란 표시
    baseUrlRowEl.classList.toggle('hidden', prov !== 'custom');
    // 무료 체험은 키 입력이 필요 없음 + 유의사항 표시 (닫혔으면 일반 제공자처럼 키 입력 허용)
    const freeLive = prov === 'free' && App.freeAvailable;
    setKeyEl.disabled = freeLive;
    setKeyEl.placeholder = freeLive ? t('set.keyFreePlaceholder') : t('set.keyPlaceholder');
    // 무료 체험(서버 내부 모델)은 외부로 나가지 않으므로 국외 이전 고지가 필요 없다.
    xferConsentBoxEl.classList.toggle('hidden', freeLive);
    // 방침 시행 전에 등록해 둔 키가 있는 경우 — 동의를 받기 전까지 AI 호출이 막힌다.
    const consented = !!(App.settings && App.settings.xferConsent);
    xferConsentNeedEl.classList.toggle('hidden', freeLive || !hasKey || consented);
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
      if (setKeyEl.value.trim()) {
        // 서버도 같은 조건으로 막지만, 여기서 걸러야 키를 들고 왕복하지 않는다.
        if (!setXferConsentEl.checked) {
          throw new Error(t('set.needXferConsent'));
        }
        body.apiKey = setKeyEl.value.trim();
      }
      // 고지가 화면에 떠 있을 때 체크한 것만 동의로 기록한다.
      if (!xferConsentBoxEl.classList.contains('hidden') && setXferConsentEl.checked) {
        body.xferConsent = true;
      }
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

  /** 길이 이름은 화면에만 쓰는 표시값이다 — 저장되는 건 id(veryshort…). */
  App.lengthLabel = function (id) {
    return I18N.tOr('len.' + id, id);
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
      gmLengthEl.options[0].textContent = t('gm.lengthDefaultWith', { label: App.lengthLabel(rec) });
      gmLengthEl.value = len.override || '';
    }
    updateGameModelHint();
    gameModelModal.classList.remove('hidden');
  };

  function updateGameModelHint() {
    const prov = gmProviderEl.value;
    gmModelEl.placeholder = App.defaultModels[prov] || t('common.defaultValue');
    // 제공자가 바뀌면 추천 후보로 초기화(키 없이도 뭘 쓸 수 있는지 보이게)
    fillModelDatalist(App.knownModels[prov] || []);
    const n = (App.knownModels[prov] || []).length;
    gmModelsHintEl.textContent = n ? t('gm.modelsHint', { n }) : t('gm.modelsHintEmpty');
    const ready = App.providerReady(prov);
    const pname = providerLabel(prov);
    gmKeyHintEl.innerHTML =
      prov === 'free'
        ? App.freeAvailable
          ? t('gm.keyFree')
          : `⚠ ${App.freeOffMessage}`
        : ready
          ? t('gm.keyReady', { prov: pname })
          : t('gm.keyMissing', {
              prov: pname,
              extra: prov === 'custom' ? t('gm.keyMissingCustom') : '',
            });
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
    gmModelsHintEl.textContent = t('gm.loading');
    try {
      const data = await api('/api/models', { provider: prov });
      const models = data.models || [];
      fillModelDatalist(models);
      gmModelsHintEl.textContent = models.length
        ? t('gm.modelsFound', { n: models.length })
        : t('gm.modelsNone');
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
    gmModelsHintEl.textContent = t('gm.testing');
    try {
      const data = await api('/api/model-test', { provider: prov, model: gmModelEl.value.trim() });
      gmModelsHintEl.textContent = t('gm.testOk', { sample: data.sample || 'OK' });
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

  // 언어가 바뀌면 스크립트가 채워 넣은 안내문(키 발급처·무료 체험 유의사항 등)도
  // 다시 만든다. data-i18n 이 붙은 정적 문구는 I18N.apply 가 이미 처리했다.
  document.addEventListener('i18n:change', () => {
    // 서버에 알리는 언어도 갱신 — 다음 오류 메시지부터 새 언어로 온다.
    if (App.socket) App.socket.emit('setLang', { lang: I18N.lang });
    if (!settingsModal.classList.contains('hidden')) updateSettingsHints();
    if (!gameModelModal.classList.contains('hidden')) updateGameModelHint();
  });

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
    // cfg.freeOffMessage 는 쓰지 않는다 — 같은 안내를 사전(free.offMessage)이 갖고 있고,
    // 그쪽이 현재 언어를 따른다.
    // 서버에 로컬 AI가 설정된 경우에만 '무료 체험' 선택지를 노출
    App.freeAvailable = App.providers.includes('free');
    ['setFreeOpt', 'gmFreeOpt'].forEach((id) => {
      const o = $(id);
      if (o) o.hidden = !App.freeAvailable;
    });

    userNameEl.textContent = App.username;
    userBarEl.classList.remove('hidden');

    if (opts.socket) {
      // lang: 서버가 오류 메시지를 어느 언어로 보낼지 정하는 데 쓴다.
      // AI 서사의 언어는 이것과 별개로 게임/대화마다 고정된다.
      App.socket = io({ query: { app, lang: I18N.lang } });
      if (opts.onSocket) opts.onSocket(App.socket);
    }
    if (opts.onReady) opts.onReady();

    // 키가 하나도 없으면(또는 쓰던 무료 체험이 닫혔으면) 설정을 먼저 열어 안내
    if (!Object.keys(App.settings.keys).length || freeTrialStale()) openSettings(true);
  };
})();
