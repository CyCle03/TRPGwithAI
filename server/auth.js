'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * 인증 + 사용자 저장 + 비밀 암호화.
 * 추가 npm 의존성 없이 Node 내장 crypto만 사용한다 (ARM 배포 안전).
 * - 비밀번호: scrypt 해싱
 * - 세션: HMAC 서명 토큰(쿠키)
 * - API 키: AES-256-GCM 암호화 저장
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, '.app_secret');
const TOKEN_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30일

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// APP_SECRET: 환경변수 우선, 없으면 생성 후 파일에 저장(재시작해도 토큰/키 유지).
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

// ---------- 사용자 저장 ----------
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

// ---------- 비밀번호 (scrypt) ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(pw, stored) {
  try {
    const [saltHex, hashHex] = stored.split(':');
    const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
    return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
  } catch (_) {
    return false;
  }
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

// ---------- 세션 토큰 (HMAC) ----------
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function hmac(data) {
  return b64url(crypto.createHmac('sha256', SECRET).update(data).digest());
}

function signToken(userId) {
  const payload = b64url(JSON.stringify({ uid: userId, iat: Date.now() }));
  return `${payload}.${hmac(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = hmac(payload);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (Date.now() - data.iat > TOKEN_MAX_AGE) return null;
    return data.uid;
  } catch (_) {
    return null;
  }
}

// ---------- 사용자 API ----------
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function createUser(username, password) {
  username = String(username || '').trim();
  if (!USERNAME_RE.test(username)) throw new Error('아이디는 영문/숫자/밑줄 3~20자여야 합니다.');
  if (String(password || '').length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.');
  const db = loadUsers();
  const key = username.toLowerCase();
  if (db.byName[key]) throw new Error('이미 사용 중인 아이디입니다.');
  const id = crypto.randomUUID();
  db.users[id] = {
    id,
    username,
    passHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    settings: { provider: 'gemini', model: '', baseURL: '', keys: {} },
  };
  db.byName[key] = id;
  saveUsers(db);
  return publicUser(db.users[id]);
}

function verifyLogin(username, password) {
  const db = loadUsers();
  const id = db.byName[String(username || '').trim().toLowerCase()];
  if (!id) return null;
  const u = db.users[id];
  if (!u || !verifyPassword(password, u.passHash)) return null;
  return publicUser(u);
}

/** 아이디(사용자명)로 사용자 조회. 없으면 null. */
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

/** 제공자별 암호화 키 맵을 반환(구버전 apiKeyEnc는 provider 키로 폴백). */
function keysOf(s) {
  if (s.keys && typeof s.keys === 'object') return s.keys;
  if (s.apiKeyEnc) return { [s.provider || 'gemini']: s.apiKeyEnc };
  return {};
}

/**
 * AI 호출용: 특정 제공자의 복호화 키 + baseURL 반환 (내부 전용, 클라 노출 금지).
 * @param {string} id 사용자 id
 * @param {string} provider 게임이 선택한 제공자
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
  };
}

const VALID_PROVIDERS = ['gemini', 'anthropic', 'openai', 'deepseek', 'xai', 'qwen', 'custom', 'free'];

/**
 * 설정 갱신. provider/model/baseURL은 "새 게임 기본값", apiKey는 선택한 provider의 키.
 */
function updateSettings(id, { provider, model, apiKey, baseURL }) {
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
  // 선택한 제공자의 키를 등록/삭제
  const p = VALID_PROVIDERS.includes(provider) ? provider : s.provider;
  if (typeof apiKey === 'string' && apiKey.trim()) {
    s.keys[p] = encrypt(apiKey.trim());
  } else if (apiKey === null) {
    delete s.keys[p];
  }
  u.settings = s;
  saveUsers(db);
  return publicUser(u);
}

/** 클라이언트에 안전하게 노출할 사용자 정보 (비밀번호·키 제외, 제공자별 키 존재 여부만). */
function publicUser(u) {
  const s = u.settings || {};
  const keys = keysOf(s);
  return {
    id: u.id,
    username: u.username,
    settings: {
      provider: s.provider || 'gemini', // 새 게임 기본 제공자
      model: s.model || '', // 새 게임 기본 모델
      baseURL: s.baseURL || '', // 비밀 아님(엔드포인트 주소)
      // 제공자별 키 등록 여부만(값은 절대 안 보냄). 예: {gemini:true, anthropic:false...}
      keys: Object.fromEntries(Object.keys(keys).map((p) => [p, true])),
    },
  };
}

module.exports = {
  createUser,
  verifyLogin,
  findByUsername,
  getUserById,
  getAiConfig,
  updateSettings,
  signToken,
  verifyToken,
};
