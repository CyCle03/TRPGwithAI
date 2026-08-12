'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * 계정 프로필 + 비밀 암호화.
 *
 * **신원은 이 앱이 갖지 않는다.** 아이디·비밀번호·세션은 통합 인증
 * (auth.elcherlab.com)이 소유하고, 여기서는 `.elcherlab.com` 도메인 쿠키를
 * 공유 시크릿(AUTH_SECRET)으로 **로컬 검증**만 한다. 네트워크 왕복이 없어
 * 인증 서버가 잠깐 죽어도 기존 세션은 그대로 동작한다.
 *
 * 이 파일이 계속 들고 있는 것은 **gm 전용 프로필**이다 — 제공자·모델·
 * 제공자별 API 키(AES-256-GCM). API 키는 APP_SECRET 으로 암호화돼 있고
 * 그 암호문을 다른 서비스로 옮기지 않는다(옮기면 복호화할 수 없다).
 *
 * data/users.json 의 키는 통합 계정 uuid 다. 예전 gm 자체 uuid 에서
 * 옮기는 일은 elcherlab-auth 의 scripts/rekeyGm.js 가 한 번 처리했다.
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, '.app_secret');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// APP_SECRET: API 키 암호화 전용. 이 값이 바뀌면 저장된 키를 복호화할 수 없다.
function loadSecret() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  ensureDir();
  try {
    if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch (_) {}
  const s = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  } catch (e) {
    console.error('APP_SECRET 저장 실패(메모리 사용):', e.message);
  }
  return s;
}

const SECRET = loadSecret();
const ENC_KEY = crypto.createHash('sha256').update(SECRET).digest(); // 32 bytes

// AUTH_SECRET: 통합 인증이 발급한 세션 쿠키를 검증하는 공유 시크릿.
// 없으면 아무도 로그인할 수 없으므로 조용히 넘어가지 않고 즉시 멈춘다.
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET || AUTH_SECRET.length < 32) {
  console.error('AUTH_SECRET 이 없거나 너무 짧습니다(32자 이상). 통합 인증과 같은 값을 .env 에 넣으세요.');
  process.exit(1);
}

// ---------- 프로필 저장 ----------
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    console.error('users.json 로드 실패:', e.message);
  }
  return { users: {}, byName: {} };
}

function saveUsers(db) {
  ensureDir();
  const tmp = USERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, USERS_FILE);
}

// ---------- API 키 암호화 (AES-256-GCM) ----------
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

function decrypt(enc) {
  try {
    const [ivH, tagH, ctH] = enc.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivH, 'hex'));
    decipher.setAuthTag(Buffer.from(tagH, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ctH, 'hex')), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('API 키 복호화 실패:', e.message);
    return null;
  }
}

// ---------- 통합 세션 쿠키 검증 ----------
// elcherlab-auth 의 src/token.js 와 같은 형식이다. 의존성 없이 검증만 하면 되므로
// 패키지로 빼지 않고 이 로직만 갖는다(형식이 바뀌면 양쪽을 함께 고쳐야 한다).
function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 세션 쿠키를 검증한다.
 * @returns {{uid:string, username:string}|null}
 */
function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.indexOf('.');
  if (i < 1) return null;
  const p = token.slice(0, i);
  const mac = token.slice(i + 1);

  const expected = b64url(crypto.createHmac('sha256', AUTH_SECRET).update(p).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(unb64url(p).toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number') return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!payload.uid) return null;
  return { uid: String(payload.uid), username: String(payload.u || '') };
}

/** 기존 호출부 호환 — 사용자 id 만 필요할 때. */
function verifyToken(token) {
  const s = verifySession(token);
  return s ? s.uid : null;
}

// ---------- 프로필 API ----------

/**
 * 통합 계정에 대응하는 gm 프로필을 보장한다.
 * 다른 서비스에서 먼저 가입한 사람이 gm 에 처음 들어오면 여기서 빈 프로필이 생긴다.
 */
function ensureUser(uid, username) {
  const db = loadUsers();
  let u = db.users[uid];
  if (!u) {
    u = {
      id: uid,
      username: username || uid.slice(0, 8),
      createdAt: new Date().toISOString(),
      settings: { provider: 'gemini', model: '', baseURL: '', keys: {} },
    };
    db.users[uid] = u;
    db.byName[String(u.username).toLowerCase()] = uid;
    saveUsers(db);
  } else if (username && u.username !== username) {
    // 통합 인증에서 아이디가 바뀐 경우 따라간다.
    delete db.byName[String(u.username).toLowerCase()];
    u.username = username;
    db.byName[String(username).toLowerCase()] = uid;
    saveUsers(db);
  }
  return publicUser(u);
}

/** 아이디(사용자명)로 조회. seedGallery 가 샘플 소유권을 넘길 때 쓴다. */
function findByUsername(name) {
  const db = loadUsers();
  const id = db.byName[String(name || '').trim().toLowerCase()];
  const u = id ? db.users[id] : null;
  return u ? { id: u.id, username: u.username } : null;
}

function getUserById(id) {
  const db = loadUsers();
  const u = db.users[id];
  return u ? publicUser(u) : null;
}

/** gm 을 한 번이라도 쓴 사람 수(운영자 통계용). 전체 가입자 수가 아니다. */
function countUsers() {
  const db = loadUsers();
  return Object.keys(db.users || {}).length;
}

/** 제공자별 암호화 키 맵을 반환(구버전 apiKeyEnc는 provider 키로 폴백). */
function keysOf(s) {
  if (s.keys && typeof s.keys === 'object') return s.keys;
  if (s.apiKeyEnc) return { [s.provider || 'gemini']: s.apiKeyEnc };
  return {};
}

/**
 * AI 호출용: 특정 제공자의 복호화 키 + baseURL 반환 (내부 전용, 클라 노출 금지).
 */
function getAiConfig(id, provider) {
  const db = loadUsers();
  const u = db.users[id];
  if (!u) return { provider, apiKey: null, baseURL: '' };
  const s = u.settings || {};
  const keys = keysOf(s);
  const enc = keys[provider];
  return {
    provider,
    apiKey: enc ? decrypt(enc) : null,
    baseURL: s.baseURL || '',
    // 'free'(서버 로컬 모델)를 뺀 나머지는 호출 자체가 국외 이전이라 동의를 확인한다.
    xferConsent: hasXferConsent(s),
  };
}

/** 국외 이전 동의가 필요한데 없을 때의 안내 문구. 없으면 null. */
function xferBlockMessage(provider, cfg) {
  if (provider === 'free' || cfg.xferConsent) return null;
  return 'AI 사업자로의 국외 이전 동의가 필요합니다. ⚙ 설정에서 동의란에 체크하고 저장해 주세요.';
}

const VALID_PROVIDERS = ['gemini', 'anthropic', 'openai', 'deepseek', 'xai', 'qwen', 'custom', 'free'];

/**
 * AI 사업자로의 국외 이전 별도 동의(개인정보 보호법 제28조의8 ①1호)의 기준 방침 시행일.
 * 방침의 7.2 내용이 바뀌면 이 값을 올린다 — 기존 동의가 무효가 되어 다시 받는다.
 */
const XFER_POLICY_VERSION = '2026-08-12';

function hasXferConsent(s) {
  return !!(s && s.xferConsent && s.xferConsent.ver === XFER_POLICY_VERSION);
}

/**
 * 설정 갱신. provider/model/baseURL은 "새 게임 기본값", apiKey는 선택한 provider의 키.
 * 키를 등록·변경하려면 국외 이전 동의가 있어야 한다(xferConsent).
 */
function updateSettings(id, { provider, model, apiKey, baseURL, xferConsent }) {
  const db = loadUsers();
  const u = db.users[id];
  if (!u) throw new Error('사용자를 찾을 수 없습니다.');
  const s = u.settings || {};
  // 구버전 단일 키 → 제공자별 키맵으로 마이그레이션
  if (!s.keys) s.keys = keysOf(s);
  delete s.apiKeyEnc;

  if (VALID_PROVIDERS.includes(provider)) s.provider = provider;
  if (typeof model === 'string') s.model = model.trim().slice(0, 60);
  // 커스텀 엔드포인트 주소(비밀 아님). http(s)만 허용.
  if (typeof baseURL === 'string') {
    const b = baseURL.trim().slice(0, 200);
    if (b === '' || /^https?:\/\//i.test(b)) s.baseURL = b;
    else throw new Error('엔드포인트 주소는 http:// 또는 https:// 로 시작해야 합니다.');
  }
  // 국외 이전 동의는 키가 실제로 저장되기 전에 확인한다.
  if (xferConsent === true) {
    s.xferConsent = { at: new Date().toISOString(), ver: XFER_POLICY_VERSION };
  }
  // 선택한 제공자의 키를 등록/삭제
  const p = VALID_PROVIDERS.includes(provider) ? provider : s.provider;
  if (typeof apiKey === 'string' && apiKey.trim()) {
    if (!hasXferConsent(s)) {
      throw new Error(
        'API 키를 등록하려면 AI 사업자로의 국외 이전에 동의해야 합니다. 설정 화면의 동의란을 확인해 주세요.'
      );
    }
    s.keys[p] = encrypt(apiKey.trim());
  } else if (apiKey === null) {
    delete s.keys[p];
  }
  u.settings = s;
  saveUsers(db);
  return publicUser(u);
}

/**
 * 통합 인증이 탈퇴 처리 중에 부르는 내부 호출의 신원 확인.
 * 세션 서명 비밀값 자체를 헤더에 싣지 않으려고, 거기서 유도한 토큰을 쓴다.
 */
const INTERNAL_TOKEN = crypto.createHash('sha256').update(`${AUTH_SECRET}:internal-delete`).digest('hex');
function verifyInternal(value) {
  if (typeof value !== 'string' || value.length !== INTERNAL_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(INTERNAL_TOKEN));
}

/**
 * 계정(설정·암호화된 API 키)을 지운다. 탈퇴 처리 전용.
 * 이미 없으면 false 를 돌려준다 — 재시도해도 실패하지 않아야 한다.
 */
function deleteUser(id) {
  const db = loadUsers();
  if (!db.users[id]) return false;
  delete db.users[id];
  saveUsers(db);
  return true;
}

/** 클라이언트에 안전하게 노출할 사용자 정보 (키 값 제외, 등록 여부만). */
function publicUser(u) {
  const s = u.settings || {};
  const keys = keysOf(s);
  return {
    id: u.id,
    username: u.username,
    settings: {
      provider: s.provider || 'gemini',
      model: s.model || '',
      baseURL: s.baseURL || '',
      keys: Object.fromEntries(Object.keys(keys).map((p) => [p, true])),
      // 값이 아니라 "현재 방침 기준으로 동의가 유효한지"만 내보낸다.
      xferConsent: hasXferConsent(s),
    },
  };
}

module.exports = {
  ensureUser,
  findByUsername,
  getUserById,
  countUsers,
  getAiConfig,
  xferBlockMessage,
  updateSettings,
  deleteUser,
  verifyInternal,
  verifySession,
  verifyToken,
};
