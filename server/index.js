'use strict';

require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { GameSession } = require('./gameSession');
const { listClasses, STANDARD_ARRAY, STAT_KEYS } = require('./dungeonWorld');
const aiGM = require('./aiGM');
const auth = require('./auth');
const store = require('./store');

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE = 'trpg_token';

const app = express();
app.disable('x-powered-by'); // 서버 정보 노출 최소화

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
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'", // 같은 출처 WebSocket(Socket.io) 포함
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
    ].join('; ')
  );
  next();
});

app.use(express.json());
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
function setAuthCookie(res, token) {
  const parts = [
    `${COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 30}`,
  ];
  if (IS_PROD) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
}
function userIdFromReq(req) {
  return auth.verifyToken(parseCookies(req.headers.cookie)[COOKIE]);
}

// ---------- 인증 API ----------
app.post('/api/signup', (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = auth.createUser(username, password);
    setAuthCookie(res, auth.signToken(user.id));
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = auth.verifyLogin(username, password);
  if (!user) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  setAuthCookie(res, auth.signToken(user.id));
  res.json({ user });
});

app.post('/api/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const uid = userIdFromReq(req);
  res.json({ user: uid ? auth.getUserById(uid) : null });
});

app.post('/api/settings', (req, res) => {
  const uid = userIdFromReq(req);
  if (!uid) return res.status(401).json({ error: '로그인이 필요합니다.' });
  try {
    const { provider, model, apiKey, baseURL } = req.body || {};
    const user = auth.updateSettings(uid, { provider, model, apiKey, baseURL });
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- 소켓 인증 ----------
io.use((socket, next) => {
  const uid = auth.verifyToken(parseCookies(socket.request.headers.cookie)[COOKIE]);
  if (!uid) return next(new Error('unauthorized'));
  socket.userId = uid;
  next();
});

// 사용자별 세션 캐시 (메모리)
const sessions = new Map();
function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, new GameSession(userId, store.load(userId)));
  return sessions.get(userId);
}

io.on('connection', (socket) => {
  const userId = socket.userId;
  const session = getSession(userId);
  const emit = (event, payload) => socket.emit(event, payload);
  const user = auth.getUserById(userId);

  // AI 액션 전에 최신 설정 주입 + 키 확인
  function ensureAi() {
    session.setAiConfig(auth.getAiConfig(userId));
    if (!session.aiConfig || !session.aiConfig.apiKey) {
      emit('error', { message: 'AI API 키가 없습니다. 우측 상단 ⚙ 설정에서 본인 키를 등록하세요.' });
      return false;
    }
    return true;
  }

  socket.emit('init', {
    username: user ? user.username : null,
    settings: user ? user.settings : null,
    defaultModels: Object.fromEntries(
      aiGM.PROVIDER_NAMES.map((n) => [n, aiGM.defaultModel(n)])
    ),
    classes: listClasses(),
    statKeys: STAT_KEYS,
    standardArray: STANDARD_ARRAY,
    hasCharacter: session.hasCharacter(),
    character: session.character,
    log: session.log,
    enemies: session.enemies,
    companions: session.companions,
    dead: session.dead,
  });
  if (session.pendingLevelUp) socket.emit('levelUp', session.pendingLevelUp);
  if (session.dead) socket.emit('gameOver', { reason: 'dead' });

  socket.on('createCharacter', async (payload) => {
    if (session.busy) return emit('error', { message: '처리 중입니다. 잠시 기다려주세요.' });
    if (!ensureAi()) return;
    session.busy = true;
    try {
      await session.createCharacter(emit, payload || {});
    } catch (e) {
      console.error(e);
      emit('error', { message: '캐릭터 생성 실패: ' + e.message });
    } finally {
      session.busy = false;
    }
  });

  socket.on('playerAction', async (payload) => {
    if (session.busy) return emit('error', { message: 'GM이 아직 응답 중입니다.' });
    if (!ensureAi()) return;
    session.busy = true;
    try {
      await session.playerAction(emit, payload?.text);
    } catch (e) {
      console.error(e);
      emit('error', { message: '행동 처리 실패: ' + e.message });
    } finally {
      session.busy = false;
    }
  });

  socket.on('suggestActions', async () => {
    if (session.busy) return;
    if (!ensureAi()) return;
    session.busy = true;
    try {
      await session.suggestActions(emit);
    } catch (e) {
      console.error(e);
      emit('error', { message: '행동 제안 실패: ' + e.message });
    } finally {
      session.busy = false;
    }
  });

  socket.on('levelUpChoice', (payload) => {
    try {
      session.levelUpChoice(emit, payload || {});
    } catch (e) {
      console.error(e);
      emit('error', { message: '레벨업 처리 실패: ' + e.message });
    }
  });

  socket.on('resetGame', () => {
    store.clear(userId);
    session.character = null;
    session.messages = [];
    session.log = [];
    session.summary = '';
    session.pendingLevelUp = null;
    session.enemies = [];
    session.companions = [];
    emit('reset', {});
  });
});

server.listen(PORT, () => {
  console.log(`\n🎲 AI GM 던전 월드 실행 중: http://localhost:${PORT}`);
  console.log(`   계정 기반 · 사용자별 API 키\n`);
});
