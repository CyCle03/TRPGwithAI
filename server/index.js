'use strict';

require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { GameSession } = require('./gameSession');
const { listClasses, STANDARD_ARRAY, STAT_KEYS } = require('./dungeonWorld');
const { DW_EN } = require('./dungeonWorldEn');
const aiGM = require('./aiGM');
const auth = require('./auth');
const store = require('./store');
const chatStore = require('./chatStore');
const chat = require('./chat');
const uploads = require('./uploads');
const publish = require('./publish');
const purge = require('./purge');
const metrics = require('./metrics');
const messages = require('./messages');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
// 리버스 프록시(Caddy)가 localhost 로 프록시하는 것을 전제로 루프백에만 바인딩한다.
// 0.0.0.0 이면 공인 인터페이스에 그대로 붙어, 방화벽 규칙만이 유일한 방어선이 된다.
// 컨테이너처럼 외부 인터페이스가 필요한 환경에서는 HOST=0.0.0.0 으로 덮어쓸 것.
const HOST = process.env.HOST || '127.0.0.1';
const IS_PROD = process.env.NODE_ENV === 'production';
// 통합 인증(auth.elcherlab.com)이 .elcherlab.com 도메인으로 발급하는 세션 쿠키.
const COOKIE = process.env.SESSION_COOKIE_NAME || 'elab_session';
// 클라이언트가 가입·로그인·로그아웃을 호출할 주소. /api/config 로 내려준다.
const AUTH_ORIGIN = process.env.AUTH_ORIGIN || 'https://auth.elcherlab.com';

const app = express();
app.disable('x-powered-by'); // 서버 정보 노출 최소화

/**
 * 오류 메시지 번역을 응답 경계 한 곳에서 처리한다.
 * 라우트마다 언어를 신경 쓰지 않아도 되고, 사전에 없는 새 메시지는 한국어 원문이
 * 그대로 나간다(messages.js 참고). 클라이언트는 X-Lang 헤더로 언어를 알려준다.
 */
app.use((req, res, next) => {
  const lang = messages.langFromReq(req);
  const json = res.json.bind(res);
  res.json = (body) =>
    json(
      body && typeof body.error === 'string'
        ? { ...body, error: messages.translate(body.error, lang) }
        : body
    );
  next();
});

// 보안 헤더 (모든 응답)
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=()'
  );
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // cloudflareinsights 예외는 Cloudflare Web Analytics 비콘용 — CF가 엣지에서
      // HTML에 자동 주입한다. 없으면 비콘이 차단돼 분석이 안 잡히고 방문자 콘솔에
      // 오류가 남는다(pc·pet 은 Caddy 쪽 CSP 에 같은 예외가 있다).
      "script-src 'self' https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "media-src 'self'", // 랜딩 배경 영상(assets/intro.mp4)
      // 같은 출처 WebSocket(Socket.io) 포함. 가입·로그인은 통합 인증으로
      // 교차 출처 요청을 보내야 하므로 그 주소만 예외로 연다.
      `connect-src 'self' ${AUTH_ORIGIN} https://cloudflareinsights.com`,
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
    ].join('; ')
  );
  next();
});

/**
 * 실제 클라이언트 IP. 프록시 뒤에 있으므로 헤더를 봐야 한다.
 * Cloudflare를 거치면 CF-Connecting-IP가 원본 주소이고(엣지에서 항상 덮어쓴다),
 * 그렇지 않으면 Caddy가 넘긴 X-Forwarded-For의 첫 항목이 클라이언트다.
 * 통계 용도로만 쓰므로 위조되어도 집계가 흐려질 뿐 권한과는 무관하다.
 */
function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '';
}

// 접속 통계 수집(운영자 패널용). 헬스체크는 감시 봇이 분당 호출하므로 제외한다.
app.use((req, res, next) => {
  if (req.path !== '/api/health') {
    const isPage =
      req.method === 'GET' &&
      (req.path === '/' || String(req.headers.accept || '').includes('text/html'));
    metrics.hit(clientIp(req), isPage);
  }
  next();
});

app.use(express.json({ limit: '8mb' })); // 이미지 업로드(base64) 여유
const server = http.createServer(app);
const io = new Server(server);

// ---------- 쿠키 유틸 ----------
function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
/** 통합 인증이 발급한 세션 쿠키를 검증한다. → {uid, username} | null */
function sessionFromReq(req) {
  return auth.verifySession(parseCookies(req.headers.cookie)[COOKIE]);
}
function userIdFromReq(req) {
  const s = sessionFromReq(req);
  return s ? s.uid : null;
}

// ---------- 인증 ----------
// 가입·로그인·로그아웃은 통합 인증(auth.elcherlab.com)이 소유한다.
// 이 앱은 발급된 쿠키를 검증만 하므로 해당 라우트를 두지 않는다.
// 클라이언트는 AUTH_ORIGIN 으로 직접 호출한다(/api/config 가 주소를 내려준다).

/**
 * 로그인 폼이 요청을 보낼 주소. 비로그인 상태에서 필요하므로 공개한다
 * (/api/config 는 로그인해야 열리는데, 로그인 전에 알아야 하는 값이다).
 */
app.get('/api/auth-origin', (_req, res) => res.json({ authOrigin: AUTH_ORIGIN }));

app.get('/api/me', (req, res) => {
  const s = sessionFromReq(req);
  if (!s) return res.json({ user: null });
  // 다른 서비스에서 먼저 가입한 사람이 처음 들어오면 여기서 gm 프로필이 생긴다.
  const before = auth.getUserById(s.uid);
  const user = auth.ensureUser(s.uid, s.username);
  if (!before) metrics.recordSignup(s.uid); // gm 기준 신규
  metrics.recordLogin(s.uid);
  res.json({ user });
});

/**
 * 페이지 공통 설정 — 제공자 목록·기본/추천 모델·무료 체험 상태·운영자 여부.
 * 소켓을 열지 않는 랜딩 페이지에서도 ⚙ 설정 모달이 동작해야 해서 REST로 뺐다.
 */
app.get('/api/config', (req, res) => {
  const uid = userIdFromReq(req);
  if (!uid) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const user = auth.getUserById(uid);
  res.json({
    authOrigin: AUTH_ORIGIN, // 로그인·로그아웃을 보낼 곳
    username: user ? user.username : null,
    isAdmin: isAdmin(user),
    freeLimit: FREE_LIMIT_PER_HOUR,
    freeOffMessage: aiGM.FREE_ENABLED ? null : aiGM.FREE_OFF_MESSAGE,
    providers: aiGM.PROVIDER_NAMES,
    defaultModels: Object.fromEntries(aiGM.PROVIDER_NAMES.map((n) => [n, aiGM.defaultModel(n)])),
    knownModels: aiGM.KNOWN_MODELS, // 키 없이도 보여줄 추천 모델 후보
  });
});

app.post('/api/settings', (req, res) => {
  const uid = userIdFromReq(req);
  if (!uid) return res.status(401).json({ error: '로그인이 필요합니다.' });
  try {
    const { provider, model, apiKey, baseURL, xferConsent } = req.body || {};
    // 무료 체험이 닫혀 있으면 새로 선택할 수 없다(예전 설정에서 빠져나오게).
    if (provider === 'free' && !aiGM.FREE_ENABLED) {
      return res.status(400).json({ error: aiGM.FREE_OFF_MESSAGE });
    }
    const user = auth.updateSettings(uid, { provider, model, apiKey, baseURL, xferConsent });
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * 통합 인증(auth.elcherlab.com)이 탈퇴 처리 중에 부르는 내부 엔드포인트.
 * Caddy 가 이 호스트의 모든 경로를 프록시하므로 공개 주소로도 닿는다 —
 * 공유 시크릿에서 유도한 토큰을 반드시 확인한다.
 * 실패는 삼키지 않는다. auth 는 여기가 성공해야 계정을 지운다.
 */
app.post('/internal/delete-user', (req, res) => {
  if (!auth.verifyInternal(req.headers['x-internal-auth'])) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const userId = req.body && req.body.userId;
  if (typeof userId !== 'string' || !userId) return res.status(400).json({ error: 'userId 가 필요합니다.' });
  try {
    const removed = purge.purgeUser(userId, auth.deleteUser);
    // 아직 열려 있는 소켓이 방금 지운 파일을 다시 쓰지 않도록 끊는다.
    let closed = 0;
    for (const s of io.sockets.sockets.values()) {
      if (s.userId === userId) {
        s.disconnect(true);
        closed += 1;
      }
    }
    console.log(`[delete-user] ${userId} → ${JSON.stringify(removed)} (소켓 ${closed}개 종료)`);
    res.json({ ok: true, removed });
  } catch (e) {
    console.error('[delete-user]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** 열람권(제35조) — 통합 인증의 "내 데이터 내려받기"가 부른다. 같은 토큰으로 확인한다. */
app.post('/internal/export-user', (req, res) => {
  if (!auth.verifyInternal(req.headers['x-internal-auth'])) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const userId = req.body && req.body.userId;
  if (typeof userId !== 'string' || !userId) return res.status(400).json({ error: 'userId 가 필요합니다.' });
  try {
    res.json(purge.exportUser(userId, auth.getUserById(userId)));
  } catch (e) {
    console.error('[export-user]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 실제 사용 가능한 모델 목록 (등록된 키로 조회, 과금 없음)
app.post('/api/models', async (req, res) => {
  const uid = userIdFromReq(req);
  if (!uid) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const { provider } = req.body || {};
  if (!aiGM.PROVIDER_NAMES.includes(provider)) {
    return res.status(400).json({ error: '알 수 없는 제공자입니다.' });
  }
  try {
    const cfg = auth.getAiConfig(uid, provider);
    const blocked = auth.xferBlockMessage(provider, cfg);
    if (blocked) return res.status(400).json({ error: blocked });
    const models = await aiGM.listModels(provider, cfg);
    res.json({ models });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 연결 테스트: 아주 짧은 요청 1회로 실제 호출 가능 여부(크레딧·한도 포함) 확인
app.post('/api/model-test', async (req, res) => {
  const uid = userIdFromReq(req);
  if (!uid) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const { provider, model } = req.body || {};
  if (!aiGM.PROVIDER_NAMES.includes(provider)) {
    return res.status(400).json({ error: '알 수 없는 제공자입니다.' });
  }
  try {
    const cfg = auth.getAiConfig(uid, provider);
    const blocked = auth.xferBlockMessage(provider, cfg);
    if (blocked) return res.status(400).json({ error: blocked });
    const sample = await aiGM.testModel({
      provider,
      model: typeof model === 'string' ? model.trim() : '',
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
    });
    res.json({ ok: true, sample });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 이미지 업로드 (base64 data URL). 로그인 필요.
app.post('/api/upload', (req, res) => {
  const uid = userIdFromReq(req);
  if (!uid) return res.status(401).json({ error: '로그인이 필요합니다.' });
  try {
    const { dataUrl } = req.body || {};
    const { id } = uploads.saveDataUrl(dataUrl);
    res.json({ id, url: `/img/${id}` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 업로드 이미지 서빙. 공유된 정의를 다른 사용자가 플레이할 수 있어야 하므로
// id를 아는 사람은 접근 가능(추측 불가한 랜덤 id).
app.get('/img/:id', (req, res) => {
  const f = uploads.resolve(req.params.id);
  if (!f) return res.status(404).end();
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(f.path).pipe(res);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// ---------- 페이지 ----------
// 같은 서버·같은 출처에 세 페이지를 둔다(쿠키·소켓 인증이 그대로 동작).
//   /      랜딩 — 로그인/회원가입 + 모드 선택
//   /play  AI GM 던전 월드
//   /chat  캐릭터 챗 + 갤러리
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const page = (file) => (req, res) => res.sendFile(path.join(PUBLIC_DIR, file));
app.get('/', page('index.html'));
app.get('/play', page('play.html'));
app.get('/chat', page('chat.html'));

app.use(express.static(PUBLIC_DIR));

// ---------- 소켓 인증 ----------
io.use((socket, next) => {
  const uid = auth.verifyToken(parseCookies(socket.request.headers.cookie)[COOKIE]);
  if (!uid) return next(new Error('unauthorized'));
  socket.userId = uid;
  next();
});

// 사용자별 게임 슬롯 캐시 (메모리). userId -> { activeId, slots:{id:{id, ai, game}} }
const userGames = new Map();
const crypto = require('crypto');
function newId() {
  return crypto.randomUUID().slice(0, 8);
}
function defaultAiFor(user) {
  return { provider: user?.settings?.provider || 'gemini', model: user?.settings?.model || '' };
}

/** 사용자의 모든 슬롯을 로드(없으면 빈 슬롯 1개 생성). */
function loadUserGames(userId, user) {
  if (userGames.has(userId)) return userGames.get(userId);
  const dAi = defaultAiFor(user);
  const norm = store.normalize(store.loadRaw(userId), dAi);
  const slots = {};
  for (const [id, s] of Object.entries(norm.slots)) {
    slots[id] = { id, ai: s.ai || { ...dAi }, game: new GameSession(userId, s.session) };
  }
  let activeId = norm.activeId && slots[norm.activeId] ? norm.activeId : Object.keys(slots)[0] || null;
  if (!activeId) {
    const id = newId();
    slots[id] = { id, ai: { ...dAi }, game: new GameSession(userId, null) };
    activeId = id;
  }
  const ug = { activeId, slots };
  userGames.set(userId, ug);
  return ug;
}

function persist(userId, ug) {
  const slots = {};
  for (const [id, s] of Object.entries(ug.slots)) {
    slots[id] = { id, ai: s.ai, session: s.game.toJSON() };
  }
  store.save(userId, { activeId: ug.activeId, slots });
}

/** 슬롯 목록(클라 표시용 메타). */
function slotList(ug) {
  return {
    activeId: ug.activeId,
    max: store.MAX_SLOTS,
    slots: Object.values(ug.slots).map((s) => ({
      id: s.id,
      hasCharacter: s.game.hasCharacter(),
      name: s.game.character ? s.game.character.name : null,
      className: s.game.character ? s.game.character.className : null,
      level: s.game.character ? s.game.character.level || 1 : null,
      dead: !!s.game.dead,
      ai: { provider: s.ai.provider || 'gemini', model: s.ai.model || '' },
    })),
  };
}

// ---------- 무료 체험(서버 로컬 LLM) 사용 제한 ----------
// CPU 추론이라 동시에 여러 명이 쓰면 서버 전체가 느려진다 → 한 번에 1명 + 사용자별 시간당 횟수 제한.
const FREE_LIMIT_PER_HOUR = Number(process.env.FREE_LIMIT_PER_HOUR || 30);
const freeUsage = new Map(); // userId -> { count, resetAt }
let freeBusy = false;

/** 사용 가능하면 null, 아니면 사용자에게 보여줄 사유 문자열. */
function freeGateReason(userId) {
  if (freeBusy) return '무료 체험은 한 번에 한 분씩만 쓸 수 있어요. 잠시 후 다시 시도해주세요.';
  const now = Date.now();
  let u = freeUsage.get(userId);
  if (!u || now > u.resetAt) {
    u = { count: 0, resetAt: now + 3600000 };
    freeUsage.set(userId, u);
  }
  if (u.count >= FREE_LIMIT_PER_HOUR) {
    const min = Math.ceil((u.resetAt - now) / 60000);
    return `무료 체험은 시간당 ${FREE_LIMIT_PER_HOUR}회까지예요(${min}분 후 초기화). ⚙ 설정에서 본인 API 키를 등록하면 제한 없이 쓸 수 있습니다.`;
  }
  return null;
}

/** provider가 'free'면 제한을 걸고 실행. 아니면 그대로 실행. */
async function withFreeGate(provider, userId, emit, fn) {
  if (provider !== 'free') return fn();
  const reason = freeGateReason(userId);
  if (reason) {
    emit('error', { message: reason });
    return;
  }
  freeBusy = true;
  freeUsage.get(userId).count += 1;
  try {
    return await fn();
  } finally {
    freeBusy = false;
  }
}

// 통계용 데이터 폴더(사용자당 파일 1개 → 파일 수 = 이용자 수).
const chatDirPath = path.join(__dirname, '..', 'data', 'chats');
const sessionDirPath = path.join(__dirname, '..', 'data', 'sessions');
function countFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0; // 폴더가 아직 없으면 0
  }
}

// 운영자 계정(신고 처리 권한). .env의 ADMIN_USER로 변경 가능.
const ADMIN_USER = (process.env.ADMIN_USER || 'elcher').toLowerCase();
function isAdmin(user) {
  return !!(user && String(user.username || '').toLowerCase() === ADMIN_USER);
}

// ---------- 캐릭터 챗 (게임 슬롯과 별도) ----------
const userChats = new Map(); // userId -> { activeId, chats:{id:{id, ai, persona, messages}} }

function loadUserChats(userId, user) {
  if (userChats.has(userId)) return userChats.get(userId);
  const raw = chatStore.loadRaw(userId);
  const chats = {};
  if (raw && raw.chats) {
    for (const [id, c] of Object.entries(raw.chats)) {
      chats[id] = {
        id,
        ai: c.ai || defaultAiFor(user),
        def: chat.migrateDef(c), // 구버전 persona 자동 변환
        messages: Array.isArray(c.messages) ? c.messages : [],
        // 이 대화에 고정된 AI 응답 언어. 예전 대화에는 없으니 한국어로 본다.
        lang: chat.normalizeLang(c.lang),
        lengthOverride: c.lengthOverride || null, // 플레이어가 지정한 출력량
        publishedId: c.publishedId || null, // 내가 공개한 항목 id
        sourceId: c.sourceId || null, // 갤러리에서 가져온 원본
        sourceOwner: c.sourceOwner || null,
        sourceOwnerId: c.sourceOwnerId || null, // 원작자 id (수정 차단 판단용)
      };
    }
  }
  // 소유권 이전 보정: 이제 내가 원작자인 대화는 내 것으로 되돌리고 공개 항목과 연결한다.
  Object.values(chats).forEach((c) => {
    if (!c.sourceId) return;
    if (publish.ownerOf(c.sourceId) === userId) {
      c.sourceOwnerId = userId;
      if (!c.publishedId) c.publishedId = c.sourceId;
    }
  });
  const activeId = raw && raw.activeId && chats[raw.activeId] ? raw.activeId : Object.keys(chats)[0] || null;
  const uc = { activeId, chats };
  userChats.set(userId, uc);
  return uc;
}

function persistChats(userId, uc) {
  const chats = {};
  for (const [id, c] of Object.entries(uc.chats)) {
    chats[id] = {
      id,
      ai: c.ai,
      def: c.def,
      messages: c.messages,
      lang: chat.normalizeLang(c.lang),
      lengthOverride: c.lengthOverride || null,
      publishedId: c.publishedId || null,
      sourceId: c.sourceId || null,
      sourceOwner: c.sourceOwner || null,
      sourceOwnerId: c.sourceOwnerId || null,
    };
  }
  chatStore.save(userId, { activeId: uc.activeId, chats });
}

function chatListPayload(uc) {
  return {
    activeId: uc.activeId,
    max: chatStore.MAX_CHATS,
    chats: Object.values(uc.chats).map((c) => ({
      id: c.id,
      name: chat.displayName(c.def),
      configured: chat.isConfigured(c.def),
      ai: { provider: c.ai.provider || 'gemini', model: c.ai.model || '' },
    })),
  };
}

/**
 * 남이 만든 세계관을 가져온 대화인가(정의 수정·재공개 금지).
 * 소유권이 이전됐을 수 있으므로 기록된 원작자보다 "현재 소유자"를 우선 판단한다.
 * (예: 샘플이 __sample__ → 실제 계정으로 넘어간 경우, 그 계정에겐 내 작품이 된다)
 */
function isBorrowed(c, userId) {
  if (!c || !c.sourceId) return false;
  const currentOwner = publish.ownerOf(c.sourceId);
  if (currentOwner) return currentOwner !== userId;
  return !!(c.sourceOwnerId && c.sourceOwnerId !== userId); // 원본이 삭제됐으면 기록 기준
}

/**
 * 남의 세계관은 정의(프롬프트)를 클라이언트로 보내지 않는다.
 * 표시에 꼭 필요한 제목·등장인물 이름만 남기고 설정·시나리오·이미지태그는 제거.
 */
function redactDef(def) {
  const d = def || {};
  return {
    worldTitle: d.worldTitle || '',
    worldLore: '',
    characters: (d.characters || []).map((c) => ({ name: c.name, description: '' })),
    images: [],
    scenario: '',
    greeting: '',
    userPersona: '',
    responseLength: d.responseLength || 'medium',
  };
}

function chatStatePayload(c, ownerId) {
  if (!c) return null;
  const entry = c.publishedId ? publish.get(c.publishedId, ownerId) : null;
  const borrowed = isBorrowed(c, ownerId);
  return {
    chatId: c.id,
    ai: { provider: c.ai.provider || 'gemini', model: c.ai.model || '' },
    def: borrowed ? redactDef(c.def) : c.def || chat.normalizeDef({}),
    configured: chat.isConfigured(c.def),
    messages: c.messages || [],
    responseLength: (c.def && c.def.responseLength) || 'medium', // 제작자 권장 출력량
    lengthOverride: c.lengthOverride || null, // 플레이어 설정(null=권장 따름)
    published: entry ? { id: entry.id, visibility: entry.visibility, plays: entry.plays || 0 } : null,
    source: c.sourceId ? { id: c.sourceId, ownerName: c.sourceOwner } : null,
    readOnly: borrowed, // 남의 세계관 → 정의 수정 불가 + 프롬프트 비공개
  };
}

/** 한 슬롯의 전체 게임 상태(전환/초기화 시 클라 재렌더용). */
function gameState(slot) {
  const g = slot.game;
  return {
    slotId: slot.id,
    ai: { provider: slot.ai.provider || 'gemini', model: slot.ai.model || '' },
    hasCharacter: g.hasCharacter(),
    character: g.character,
    log: g.log,
    enemies: g.enemies,
    companions: g.companions,
    dead: g.dead,
    pendingLevelUp: g.pendingLevelUp,
  };
}

io.on('connection', (socket) => {
  const userId = socket.userId;
  const user = auth.getUserById(userId);
  metrics.recordActive(userId); // 오늘 실제로 접속한 사용자
  const ug = loadUserGames(userId, user);
  // 화면 언어. 접속할 때 query 로 받고, 사용자가 전환하면 setLang 으로 갱신된다.
  // 오류 메시지에만 쓴다 — AI 서사의 언어는 게임/대화마다 따로 고정된다.
  let uiLang = messages.langFromSocket(socket);
  socket.on('setLang', ({ lang } = {}) => {
    if (lang === 'ko' || lang === 'en') uiLang = lang;
  });
  const emit = (event, payload) =>
    socket.emit(
      event,
      event === 'error' && payload && typeof payload.message === 'string'
        ? { ...payload, message: messages.translate(payload.message, uiLang) }
        : payload
    );
  const active = () => ug.slots[ug.activeId];
  const activeGame = () => active() && active().game;

  // AI 액션 전에 활성 게임의 모델 + 사용자 키를 주입하고 키/주소를 확인.
  function ensureAi() {
    const slot = active();
    if (!slot) {
      emit('error', { message: '활성 게임이 없습니다.' });
      return false;
    }
    const provider = slot.ai.provider || 'gemini';
    const cfg = auth.getAiConfig(userId, provider);
    slot.game.setAiConfig({ provider, model: slot.ai.model || '', apiKey: cfg.apiKey, baseURL: cfg.baseURL });
    // 무료 체험이 닫힌 뒤에도 예전 설정이 'free'로 남아 있을 수 있다.
    if (provider === 'free' && !aiGM.FREE_ENABLED) {
      emit('error', { message: aiGM.FREE_OFF_MESSAGE });
      return false;
    }
    const xferBlocked = auth.xferBlockMessage(provider, cfg);
    if (xferBlocked) {
      emit('error', { message: xferBlocked });
      return false;
    }
    // 'free'(서버 로컬 모델)는 사용자 키가 필요 없다.
    if (provider === 'custom') {
      if (!cfg.baseURL) {
        emit('error', { message: '커스텀 엔드포인트 주소가 없습니다. ⚙ 설정에서 입력하세요.' });
        return false;
      }
    } else if (provider !== 'free' && !cfg.apiKey) {
      emit('error', { message: `현재 게임의 제공자(${provider}) API 키가 없습니다. ⚙ 설정에서 등록하세요.` });
      return false;
    }
    metrics.recordAi(provider, 'game');
    return true;
  }

  // 챗 페이지는 게임 상태가 필요 없다 — 로그 전체를 보내지 않는다.
  // (공통 설정은 /api/config가 이미 내려줬으므로 여기선 게임 데이터만 보낸다)
  if (socket.handshake.query.app !== 'chat') {
    socket.emit('init', {
      classes: listClasses(),
      statKeys: STAT_KEYS,
      standardArray: STANDARD_ARRAY,
      // 클래스·장비·무브 이름의 영어 표시명 대응표. 데이터 자체는 한국어 원문
      // 그대로 내려가고(세이브·프롬프트가 그 문자열을 참조한다), 화면에 낼 때만 쓴다.
      dwEn: DW_EN,
      ...gameState(active()),
    });
    emit('slots', slotList(ug));
    if (activeGame().pendingLevelUp) emit('levelUp', activeGame().pendingLevelUp);
    if (activeGame().dead) emit('gameOver', { reason: 'dead' });
  }

  socket.on('createCharacter', async (payload) => {
    const g = activeGame();
    if (!g) return emit('error', { message: '활성 게임이 없습니다.' });
    if (g.busy) return emit('error', { message: '처리 중입니다. 잠시 기다려주세요.' });
    if (!ensureAi()) return;
    g.busy = true;
    try {
      await withFreeGate(active().ai.provider, userId, emit, () =>
        g.createCharacter(emit, payload || {})
      );
    } catch (e) {
      console.error(e);
      emit('error', { message: '캐릭터 생성 실패: ' + e.message });
    } finally {
      g.busy = false;
    }
    persist(userId, ug);
    emit('slots', slotList(ug));
  });

  socket.on('playerAction', async (payload) => {
    const g = activeGame();
    if (!g) return emit('error', { message: '활성 게임이 없습니다.' });
    if (g.busy) return emit('error', { message: 'GM이 아직 응답 중입니다.' });
    if (!ensureAi()) return;
    g.busy = true;
    try {
      await withFreeGate(active().ai.provider, userId, emit, () =>
        g.playerAction(emit, payload && payload.text)
      );
    } catch (e) {
      console.error(e);
      emit('error', { message: '행동 처리 실패: ' + e.message });
    } finally {
      g.busy = false;
    }
    persist(userId, ug);
    emit('slots', slotList(ug));
  });

  socket.on('suggestActions', async () => {
    const g = activeGame();
    if (!g || g.busy) return;
    if (!ensureAi()) return;
    g.busy = true;
    try {
      await g.suggestActions(emit);
    } catch (e) {
      console.error(e);
      emit('error', { message: '행동 제안 실패: ' + e.message });
    } finally {
      g.busy = false;
    }
  });

  socket.on('levelUpChoice', (payload) => {
    const g = activeGame();
    if (!g) return;
    try {
      g.levelUpChoice(emit, payload || {});
    } catch (e) {
      console.error(e);
      emit('error', { message: '레벨업 처리 실패: ' + e.message });
    }
    persist(userId, ug);
    emit('slots', slotList(ug));
  });

  // 새 게임 슬롯 생성(기존 게임 유지). 최대 MAX_SLOTS.
  socket.on('newGame', () => {
    if (Object.keys(ug.slots).length >= store.MAX_SLOTS) {
      return emit('error', { message: `게임은 최대 ${store.MAX_SLOTS}개까지 저장돼요. 기존 게임을 지운 뒤 만드세요.` });
    }
    const id = newId();
    // 게임 언어는 만드는 시점의 화면 언어로 정해지고 그 뒤로 바뀌지 않는다 —
    // 중간에 바뀌면 한 게임의 로그와 서사가 두 언어로 갈라진다.
    ug.slots[id] = {
      id,
      ai: defaultAiFor(user),
      game: new GameSession(userId, { lang: uiLang }),
    };
    ug.activeId = id;
    persist(userId, ug);
    emit('slotSwitched', gameState(ug.slots[id]));
    emit('slots', slotList(ug));
  });

  // 다른 저장 게임으로 전환.
  socket.on('switchSlot', (payload) => {
    const id = payload && payload.id;
    if (!ug.slots[id]) return emit('error', { message: '없는 게임입니다.' });
    ug.activeId = id;
    persist(userId, ug);
    const slot = ug.slots[id];
    emit('slotSwitched', gameState(slot));
    emit('slots', slotList(ug));
    if (slot.game.pendingLevelUp) emit('levelUp', slot.game.pendingLevelUp);
  });

  // 저장 게임 삭제. 활성이 지워지면 다른 슬롯으로, 하나도 없으면 빈 슬롯 생성.
  socket.on('deleteSlot', (payload) => {
    const id = payload && payload.id;
    if (!ug.slots[id]) return;
    delete ug.slots[id];
    if (ug.activeId === id) ug.activeId = Object.keys(ug.slots)[0] || null;
    if (!ug.activeId) {
      const nid = newId();
      ug.slots[nid] = {
        id: nid,
        ai: defaultAiFor(user),
        game: new GameSession(userId, { lang: uiLang }),
      };
      ug.activeId = nid;
    }
    persist(userId, ug);
    emit('slotSwitched', gameState(active()));
    emit('slots', slotList(ug));
  });

  // 현재 게임의 AI 모델 변경(진행 중에도 가능).
  socket.on('setGameModel', (payload) => {
    const slot = active();
    if (!slot) return;
    const { provider, model } = payload || {};
    if (aiGM.PROVIDER_NAMES.includes(provider)) slot.ai.provider = provider;
    if (typeof model === 'string') slot.ai.model = model.trim().slice(0, 60);
    persist(userId, ug);
    emit('gameModelUpdated', { provider: slot.ai.provider || 'gemini', model: slot.ai.model || '' });
    emit('slots', slotList(ug));
  });

  // ===== 캐릭터 챗 =====
  const uc = loadUserChats(userId, user);
  const activeChat = () => uc.chats[uc.activeId];
  let chatBusy = false;

  socket.on('chatInit', () => {
    emit('chats', chatListPayload(uc));
    emit('chatState', chatStatePayload(activeChat(), userId));
  });

  socket.on('newChat', () => {
    if (Object.keys(uc.chats).length >= chatStore.MAX_CHATS) {
      return emit('error', { message: `캐릭터 챗은 최대 ${chatStore.MAX_CHATS}개까지 저장돼요.` });
    }
    const id = newId();
    // 대화 언어도 만드는 시점에 고정된다(설명은 GameSession 쪽 주석 참고).
    uc.chats[id] = {
      id,
      ai: defaultAiFor(user),
      def: chat.normalizeDef({}),
      messages: [],
      lang: uiLang,
    };
    uc.activeId = id;
    persistChats(userId, uc);
    emit('chatState', chatStatePayload(uc.chats[id], userId));
    emit('chats', chatListPayload(uc));
  });

  socket.on('saveChatDef', (payload) => {
    const c = activeChat();
    if (!c) return emit('error', { message: '활성 챗이 없습니다.' });
    if (isBorrowed(c, userId)) {
      return emit('error', {
        message: `이 세계관은 ${c.sourceOwner || '다른 사용자'}님이 만든 것이라 수정할 수 없습니다.`,
      });
    }
    const def = chat.normalizeDef(payload && payload.def);
    if (!chat.isConfigured(def)) return emit('error', { message: '이름 있는 캐릭터가 최소 1명 필요합니다.' });
    c.def = def;
    // 첫 인사말을 대화 시작으로 시드(메시지가 비어 있을 때만)
    if (!c.messages.length && def.greeting) {
      c.messages.push({ role: 'assistant', content: def.greeting });
    }
    // 이미 공개한 항목이면 갤러리 쪽도 최신 정의로 갱신
    if (c.publishedId) {
      const cur = publish.get(c.publishedId, userId);
      if (cur) {
        try {
          publish.publish({
            pubId: c.publishedId,
            ownerId: userId,
            ownerName: user ? user.username : '익명',
            def,
            visibility: cur.visibility,
            title: chat.displayName(def) || '제목 없음',
            lang: c.lang, // 이미 기록돼 있으면 publish() 가 유지한다
          });
        } catch (e) {
          console.error('공개 항목 갱신 실패:', e.message);
        }
      }
    }
    persistChats(userId, uc);
    emit('chatState', chatStatePayload(c, userId));
    emit('chats', chatListPayload(uc));
  });

  socket.on('switchChat', (payload) => {
    const id = payload && payload.id;
    if (!uc.chats[id]) return emit('error', { message: '없는 챗입니다.' });
    uc.activeId = id;
    persistChats(userId, uc);
    emit('chatState', chatStatePayload(uc.chats[id], userId));
    emit('chats', chatListPayload(uc));
  });

  socket.on('deleteChat', (payload) => {
    const id = payload && payload.id;
    if (!uc.chats[id]) return;
    delete uc.chats[id];
    if (uc.activeId === id) uc.activeId = Object.keys(uc.chats)[0] || null;
    persistChats(userId, uc);
    emit('chats', chatListPayload(uc));
    emit('chatState', chatStatePayload(activeChat(), userId));
  });

  socket.on('setChatModel', (payload) => {
    const c = activeChat();
    if (!c) return;
    const { provider, model } = payload || {};
    if (aiGM.PROVIDER_NAMES.includes(provider)) c.ai.provider = provider;
    if (typeof model === 'string') c.ai.model = model.trim().slice(0, 60);
    persistChats(userId, uc);
    emit('chatModelUpdated', { provider: c.ai.provider || 'gemini', model: c.ai.model || '' });
    emit('chats', chatListPayload(uc));
  });

  // ----- 공유/퍼블리시 -----
  socket.on('publishChat', (payload) => {
    const c = activeChat();
    if (!c) return emit('error', { message: '활성 챗이 없습니다.' });
    if (!chat.isConfigured(c.def)) return emit('error', { message: '먼저 캐릭터를 설정하세요.' });
    if (isBorrowed(c, userId)) {
      return emit('error', { message: '가져온 세계관은 내 것으로 다시 공개할 수 없습니다.' });
    }
    const visibility = (payload && payload.visibility) || 'public';
    try {
      const entry = publish.publish({
        pubId: c.publishedId || null,
        ownerId: userId,
        ownerName: user ? user.username : '익명',
        def: c.def,
        visibility,
        title: chat.displayName(c.def) || '제목 없음',
        // 세계관 본문의 언어 = 이 대화를 만든 언어. 카드 뱃지에 쓰인다.
        lang: c.lang,
      });
      c.publishedId = entry.id;
      persistChats(userId, uc);
      emit('chatState', chatStatePayload(c, userId));
    } catch (e) {
      emit('error', { message: e.message });
    }
  });

  socket.on('unpublishChat', () => {
    const c = activeChat();
    if (!c || !c.publishedId) return;
    try {
      publish.unpublish(c.publishedId, userId);
    } catch (e) {
      return emit('error', { message: e.message });
    }
    c.publishedId = null;
    persistChats(userId, uc);
    emit('chatState', chatStatePayload(c, userId));
  });

  socket.on('galleryList', (payload) => {
    const sort = (payload && payload.sort) || 'recent';
    const tag = (payload && payload.tag) || '';
    emit('gallery', {
      items: publish.listPublic({ sort, tag }),
      tags: publish.listTags(),
      sort,
      tag,
    });
  });

  // 내 프로필: 내가 공개한 작품 + 합계
  socket.on('profileList', () => {
    const mine = publish.listMine(userId);
    emit('profile', {
      username: user ? user.username : '',
      mine,
      totals: {
        works: mine.length,
        likes: mine.reduce((s, x) => s + (x.likes || 0), 0),
        plays: mine.reduce((s, x) => s + (x.plays || 0), 0),
        comments: mine.reduce((s, x) => s + (x.commentCount || 0), 0),
      },
    });
  });

  // 추천(좋아요) 토글
  socket.on('toggleLike', (payload) => {
    try {
      const r = publish.toggleLike(payload && payload.id, userId);
      emit('likeUpdated', { id: payload.id, ...r });
    } catch (e) {
      emit('error', { message: e.message });
    }
  });

  // 댓글 조회 / 작성 / 삭제
  socket.on('loadComments', (payload) => {
    const id = payload && payload.id;
    emit('comments', { id, items: publish.listComments(id), me: userId });
  });
  socket.on('addComment', (payload) => {
    try {
      const items = publish.addComment(
        payload && payload.id,
        userId,
        user ? user.username : '익명',
        payload && payload.text
      );
      emit('comments', { id: payload.id, items, me: userId });
    } catch (e) {
      emit('error', { message: e.message });
    }
  });
  socket.on('deleteComment', (payload) => {
    try {
      const items = publish.deleteComment(
        payload && payload.id,
        payload && payload.commentId,
        userId,
        isAdmin(user)
      );
      emit('comments', { id: payload.id, items, me: userId });
    } catch (e) {
      emit('error', { message: e.message });
    }
  });

  // 신고 접수 (본인 작품·중복 신고 불가)
  socket.on('reportPublished', (payload) => {
    try {
      const n = publish.addReport(payload && payload.id, userId, payload && payload.reason);
      emit('reportDone', { id: payload.id, count: n });
    } catch (e) {
      emit('error', { message: e.message });
    }
  });

  // 운영자: 신고 목록 조회
  socket.on('adminReports', () => {
    if (!isAdmin(user)) return emit('error', { message: '권한이 없습니다.' });
    emit('adminReports', { items: publish.listReported() });
  });

  // 운영자: 접속 통계
  socket.on('adminStats', (payload) => {
    if (!isAdmin(user)) return emit('error', { message: '권한이 없습니다.' });
    const n = Math.min(Math.max(Number(payload && payload.days) || 14, 1), 90);
    const all = publish.listAll();
    emit('adminStats', {
      ...metrics.summary(n),
      totals: {
        users: auth.countUsers(),
        published: all.length,
        publicEntries: all.filter((e) => e.visibility === 'public' && !e.blocked).length,
        reported: publish.listReported().length,
        chats: countFiles(chatDirPath),
        games: countFiles(sessionDirPath),
      },
    });
  });

  // 운영자: 차단 / 차단해제 / 삭제 / 신고기록 삭제
  socket.on('adminAction', (payload) => {
    if (!isAdmin(user)) return emit('error', { message: '권한이 없습니다.' });
    const { id, action } = payload || {};
    if (!id) return;
    try {
      if (action === 'block') publish.blockEntry(id);
      else if (action === 'unblock') publish.unblockEntry(id);
      else if (action === 'delete') publish.removeEntry(id);
      else if (action === 'clear') publish.clearReports(id);
      else return emit('error', { message: '알 수 없는 조치입니다.' });
    } catch (e) {
      return emit('error', { message: e.message });
    }
    emit('adminReports', { items: publish.listReported() });
    emit('gallery', { items: publish.listPublic(), tags: publish.listTags(), sort: 'recent', tag: '' });
    emit('profile', { username: user ? user.username : '', mine: publish.listMine(userId), totals: null });
  });

  // 갤러리의 '내가 공개한 것'에서 바로 공개 중단(연결된 챗이 없어도 가능)
  socket.on('unpublishById', (payload) => {
    try {
      publish.unpublish(payload && payload.id, userId);
    } catch (e) {
      return emit('error', { message: e.message });
    }
    // 이 항목과 연결된 내 챗이 있으면 연결 해제
    Object.values(uc.chats).forEach((c) => {
      if (c.publishedId === (payload && payload.id)) c.publishedId = null;
    });
    persistChats(userId, uc);
    emit('gallery', { items: publish.listPublic(), tags: publish.listTags(), sort: 'recent', tag: '' });
    emit('profile', { username: user ? user.username : '', mine: publish.listMine(userId), totals: null });
  });

  // 갤러리 항목을 내 대화로 가져와 플레이 (정의는 복사, 대화는 각자 별도)
  socket.on('playPublished', (payload) => {
    const entry = publish.get(payload && payload.id, userId);
    if (!entry) return emit('error', { message: '공개된 항목을 찾을 수 없습니다.' });
    if (Object.keys(uc.chats).length >= chatStore.MAX_CHATS) {
      return emit('error', { message: `캐릭터 챗은 최대 ${chatStore.MAX_CHATS}개까지 저장돼요.` });
    }
    const cid = newId();
    const def = chat.normalizeDef(entry.def);
    uc.chats[cid] = {
      id: cid,
      ai: defaultAiFor(user),
      def,
      messages: def.greeting ? [{ role: 'assistant', content: def.greeting }] : [],
      // 세계관은 원문 그대로 가져오되, **AI가 답하는 언어는 플레이어의 화면 언어**로 잡는다.
      // 한국어로 쓰인 세계관을 영어로 플레이하는 게 이 기능의 핵심이다.
      lang: uiLang,
      // 내가 만든 걸 내가 플레이하면 공개 항목과 연결(수정 시 갤러리도 갱신)
      publishedId: entry.ownerId === userId ? entry.id : null,
      sourceId: entry.id,
      sourceOwner: entry.ownerName,
      sourceOwnerId: entry.ownerId,
    };
    uc.activeId = cid;
    if (entry.ownerId !== userId) publish.bumpPlays(entry.id);
    persistChats(userId, uc);
    emit('chatState', chatStatePayload(uc.chats[cid], userId));
    emit('chats', chatListPayload(uc));
  });

  // 플레이어가 자기 대화의 출력량을 덮어쓴다(null이면 제작자 권장값 사용).
  socket.on('setChatLength', (payload) => {
    const c = activeChat();
    if (!c) return;
    const v = payload && payload.length;
    c.lengthOverride = chat.LENGTHS.includes(v) ? v : null;
    persistChats(userId, uc);
    emit('chatState', chatStatePayload(c, userId));
  });

  socket.on('chatSend', async (payload) => {
    const c = activeChat();
    if (!c) return emit('error', { message: '활성 챗이 없습니다.' });
    if (!chat.isConfigured(c.def)) return emit('error', { message: '먼저 캐릭터를 설정하세요.' });
    if (chatBusy) return emit('error', { message: '응답 중입니다. 잠시만요.' });
    const text = String((payload && payload.text) || '').trim();
    if (!text) return;

    const provider = c.ai.provider || 'gemini';
    const cfg = auth.getAiConfig(userId, provider);
    if (provider === 'free') {
      // 서버 로컬 모델 — 키 불필요, 대신 사용량 제한
      if (!aiGM.FREE_ENABLED) return emit('error', { message: aiGM.FREE_OFF_MESSAGE });
    } else if (provider === 'custom') {
      if (!cfg.baseURL) return emit('error', { message: '커스텀 엔드포인트 주소가 없습니다. ⚙ 설정에서 입력하세요.' });
    } else if (!cfg.apiKey) {
      return emit('error', { message: `현재 챗의 제공자(${provider}) API 키가 없습니다. ⚙ 설정에서 등록하세요.` });
    }
    const xferBlocked = auth.xferBlockMessage(provider, cfg);
    if (xferBlocked) return emit('error', { message: xferBlocked });
    const gate = provider === 'free' ? freeGateReason(userId) : null;
    if (gate) return emit('error', { message: gate });

    c.messages.push({ role: 'user', content: text }); // 사용자 메시지는 클라가 즉시 렌더
    metrics.recordAi(provider, 'chat');
    chatBusy = true;
    if (provider === 'free') {
      freeBusy = true;
      freeUsage.get(userId).count += 1;
    }
    emit('chatThinking', { on: true });
    try {
      // 무료 체험(CPU 로컬 모델)은 초당 생성 토큰이 적어 길이를 최소로 제한한다.
      const len =
        provider === 'free' ? 'veryshort' : chat.effectiveLength(c.def, c.lengthOverride);
      // 무료 체험은 CPU 추론이라 입력 토큰(프롬프트 읽기)이 병목 → 지시문 압축
      const system = chat.buildSystemPrompt(c.def, len, {
        compact: provider === 'free',
        lang: chat.normalizeLang(c.lang),
      });
      const recent = c.messages.slice(-chat.MAX_CHAT_HISTORY);
      const aiCfg = { provider, model: c.ai.model || '', apiKey: cfg.apiKey, baseURL: cfg.baseURL };
      const maxTok = chat.maxTokensFor(len);
      let reply;
      if (aiGM.canStream(provider)) {
        // 생성되는 대로 흘려보내 체감 대기시간을 줄인다(느린 로컬 모델에 특히 효과적).
        emit('chatStreamStart', {});
        reply = await aiGM.chatReplyStream(aiCfg, system, recent, maxTok, (piece) =>
          emit('chatChunk', { text: piece })
        );
      } else {
        reply = await aiGM.chatReply(aiCfg, system, recent, maxTok);
      }
      // [img:태그] 마커를 뽑아 이미지로 치환(본문에서는 제거)
      const { text: clean, imageId } = chat.extractImage(reply, c.def.images);
      // 직전에 보여준 이미지와 같으면 생략한다(같은 그림이 계속 반복되는 것 방지)
      let lastImg = null;
      for (let i = c.messages.length - 1; i >= 0; i--) {
        const m = c.messages[i];
        if (m.role === 'assistant' && m.imageId) {
          lastImg = m.imageId;
          break;
        }
      }
      const msg = { role: 'assistant', content: clean };
      if (imageId && imageId !== lastImg) msg.imageId = imageId;
      c.messages.push(msg);
      emit('chatMessage', msg);
    } catch (e) {
      console.error(e);
      c.messages.pop(); // 실패 시 방금 넣은 사용자 메시지 롤백(재전송 가능)
      emit('error', { message: '응답 실패: ' + e.message });
      emit('chatRollback', {});
    } finally {
      chatBusy = false;
      if (provider === 'free') freeBusy = false;
      emit('chatThinking', { on: false });
      persistChats(userId, uc);
    }
  });
});

require('./seedGallery').seed(); // 갤러리 샘플 세계관 최초 1회 등록

server.listen(PORT, HOST, () => {
  console.log(`\n🎲 AI GM 던전 월드 실행 중: http://${HOST}:${PORT}`);
  console.log(`   계정 기반 · 사용자별 API 키\n`);
});
