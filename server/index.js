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
const chatStore = require('./chatStore');
const chat = require('./chat');
const uploads = require('./uploads');
const publish = require('./publish');
const fs = require('fs');

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
      "media-src 'self'", // 랜딩 배경 영상(assets/intro.mp4)
      "connect-src 'self'", // 같은 출처 WebSocket(Socket.io) 포함
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
    ].join('; ')
  );
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

app.use(express.static(path.join(__dirname, '..', 'public')));

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
  const ug = loadUserGames(userId, user);
  const emit = (event, payload) => socket.emit(event, payload);
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
    if (provider === 'free') return true; // 서버 로컬 모델 — 사용자 키 불필요
    if (provider === 'custom') {
      if (!cfg.baseURL) {
        emit('error', { message: '커스텀 엔드포인트 주소가 없습니다. ⚙ 설정에서 입력하세요.' });
        return false;
      }
      return true;
    }
    if (!cfg.apiKey) {
      emit('error', { message: `현재 게임의 제공자(${provider}) API 키가 없습니다. ⚙ 설정에서 등록하세요.` });
      return false;
    }
    return true;
  }

  socket.emit('init', {
    username: user ? user.username : null,
    settings: user ? user.settings : null,
    isAdmin: isAdmin(user),
    freeLimit: FREE_LIMIT_PER_HOUR,
    providers: aiGM.PROVIDER_NAMES,
    defaultModels: Object.fromEntries(aiGM.PROVIDER_NAMES.map((n) => [n, aiGM.defaultModel(n)])),
    knownModels: aiGM.KNOWN_MODELS, // 키 없이도 보여줄 추천 모델 후보
    classes: listClasses(),
    statKeys: STAT_KEYS,
    standardArray: STANDARD_ARRAY,
    ...gameState(active()),
  });
  emit('slots', slotList(ug));
  if (activeGame().pendingLevelUp) emit('levelUp', activeGame().pendingLevelUp);
  if (activeGame().dead) emit('gameOver', { reason: 'dead' });

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
    ug.slots[id] = { id, ai: defaultAiFor(user), game: new GameSession(userId, null) };
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
      ug.slots[nid] = { id: nid, ai: defaultAiFor(user), game: new GameSession(userId, null) };
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
    uc.chats[id] = { id, ai: defaultAiFor(user), def: chat.normalizeDef({}), messages: [] };
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
    } else if (provider === 'custom') {
      if (!cfg.baseURL) return emit('error', { message: '커스텀 엔드포인트 주소가 없습니다. ⚙ 설정에서 입력하세요.' });
    } else if (!cfg.apiKey) {
      return emit('error', { message: `현재 챗의 제공자(${provider}) API 키가 없습니다. ⚙ 설정에서 등록하세요.` });
    }
    const gate = provider === 'free' ? freeGateReason(userId) : null;
    if (gate) return emit('error', { message: gate });

    c.messages.push({ role: 'user', content: text }); // 사용자 메시지는 클라가 즉시 렌더
    chatBusy = true;
    if (provider === 'free') {
      freeBusy = true;
      freeUsage.get(userId).count += 1;
    }
    emit('chatThinking', { on: true });
    try {
      const len = chat.effectiveLength(c.def, c.lengthOverride);
      const system = chat.buildSystemPrompt(c.def, len);
      const recent = c.messages.slice(-chat.MAX_CHAT_HISTORY);
      const reply = await aiGM.chatReply(
        { provider, model: c.ai.model || '', apiKey: cfg.apiKey, baseURL: cfg.baseURL },
        system,
        recent,
        chat.maxTokensFor(len)
      );
      // [img:태그] 마커를 뽑아 이미지로 치환(본문에서는 제거)
      const { text: clean, imageId } = chat.extractImage(reply, c.def.images);
      const msg = { role: 'assistant', content: clean };
      if (imageId) msg.imageId = imageId;
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

server.listen(PORT, () => {
  console.log(`\n🎲 AI GM 던전 월드 실행 중: http://localhost:${PORT}`);
  console.log(`   계정 기반 · 사용자별 API 키\n`);
});
