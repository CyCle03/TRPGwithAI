'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 접속 통계(일자별). 운영자 패널에서만 조회한다.
 *
 * 개인정보 보호: 원본 IP는 저장하지 않는다. 서버에만 있는 salt로 HMAC 한 뒤
 * 앞 12자만 남겨 "같은 방문자인지"만 구분할 수 있게 한다(역산 불가).
 * 날짜 경계는 서버 시간대와 무관하게 한국 시간(KST) 기준으로 끊는다.
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'metrics.json');
const TZ = 'Asia/Seoul';
const KEEP_DAYS = 90; // 보관 기간
const MAX_IPS_PER_DAY = 20000; // 폭주 시 메모리 방어
const FLUSH_MS = 5000; // 디스크 쓰기 최소 간격

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** KST 기준 YYYY-MM-DD. */
function dayKey(d = new Date()) {
  return dayFmt.format(d);
}

function emptyDay() {
  return {
    hits: 0, // 전체 요청 수
    pages: 0, // 페이지 진입(HTML) 수
    ips: new Set(), // 고유 방문자 해시
    users: new Set(), // 접속한 로그인 사용자 id
    logins: 0,
    signups: 0,
    ai: {}, // provider -> 호출 수
    chatMsgs: 0,
    gameMsgs: 0,
  };
}

const state = { salt: '', days: new Map() };
let dirty = false;
let timer = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      state.salt = typeof raw.salt === 'string' ? raw.salt : '';
      for (const [k, v] of Object.entries(raw.days || {})) {
        const d = emptyDay();
        d.hits = v.hits || 0;
        d.pages = v.pages || 0;
        d.logins = v.logins || 0;
        d.signups = v.signups || 0;
        d.chatMsgs = v.chatMsgs || 0;
        d.gameMsgs = v.gameMsgs || 0;
        d.ai = v.ai && typeof v.ai === 'object' ? { ...v.ai } : {};
        (v.ips || []).forEach((x) => d.ips.add(x));
        (v.users || []).forEach((x) => d.users.add(x));
        state.days.set(k, d);
      }
    }
  } catch (e) {
    console.error('[metrics] 불러오기 실패, 새로 시작합니다:', e.message);
  }
  if (!state.salt) {
    state.salt = crypto.randomBytes(32).toString('hex');
    dirty = true;
  }
}

function prune() {
  if (state.days.size <= KEEP_DAYS) return;
  const keys = [...state.days.keys()].sort();
  while (keys.length > KEEP_DAYS) state.days.delete(keys.shift());
}

function save() {
  if (!dirty) return;
  try {
    ensureDir();
    prune();
    const days = {};
    for (const [k, d] of state.days) {
      days[k] = {
        hits: d.hits,
        pages: d.pages,
        logins: d.logins,
        signups: d.signups,
        chatMsgs: d.chatMsgs,
        gameMsgs: d.gameMsgs,
        ai: d.ai,
        ips: [...d.ips],
        users: [...d.users],
      };
    }
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ salt: state.salt, days }));
    fs.renameSync(tmp, FILE);
    dirty = false;
  } catch (e) {
    console.error('[metrics] 저장 실패:', e.message);
  }
}

/** 변경 표시 + 디스크 쓰기 예약(짧은 간격으로 몰아서 기록). */
function touch() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    save();
  }, FLUSH_MS);
  if (timer.unref) timer.unref();
}

function today() {
  const k = dayKey();
  let d = state.days.get(k);
  if (!d) {
    d = emptyDay();
    state.days.set(k, d);
  }
  return d;
}

/** 원본 IP → 되돌릴 수 없는 짧은 해시. */
function hashIp(ip) {
  return crypto
    .createHmac('sha256', state.salt)
    .update(String(ip || ''))
    .digest('hex')
    .slice(0, 12);
}

/**
 * 요청 1건 기록. 리버스 프록시(Caddy) 뒤이므로 X-Forwarded-For의 첫 항목이 실제 클라이언트.
 * @param {string} ip  원본 IP 문자열
 * @param {boolean} isPage  HTML 페이지 진입 여부
 */
function hit(ip, isPage) {
  const d = today();
  d.hits += 1;
  if (isPage) d.pages += 1;
  if (ip && d.ips.size < MAX_IPS_PER_DAY) d.ips.add(hashIp(ip));
  touch();
}

function recordLogin(userId) {
  const d = today();
  d.logins += 1;
  if (userId) d.users.add(userId);
  touch();
}

function recordSignup(userId) {
  const d = today();
  d.signups += 1;
  if (userId) d.users.add(userId);
  touch();
}

/** 소켓 연결 등 "오늘 실제로 서비스를 쓴 사용자" 기록. */
function recordActive(userId) {
  if (!userId) return;
  const d = today();
  if (d.users.has(userId)) return;
  d.users.add(userId);
  touch();
}

/** AI 호출 1건. kind: 'chat' | 'game' */
function recordAi(provider, kind) {
  const d = today();
  const p = provider || 'unknown';
  d.ai[p] = (d.ai[p] || 0) + 1;
  if (kind === 'chat') d.chatMsgs += 1;
  else if (kind === 'game') d.gameMsgs += 1;
  touch();
}

function serialize(key) {
  const d = state.days.get(key);
  if (!d) {
    return { day: key, visitors: 0, pages: 0, hits: 0, users: 0, logins: 0, signups: 0, chatMsgs: 0, gameMsgs: 0, ai: {} };
  }
  return {
    day: key,
    visitors: d.ips.size,
    pages: d.pages,
    hits: d.hits,
    users: d.users.size,
    logins: d.logins,
    signups: d.signups,
    chatMsgs: d.chatMsgs,
    gameMsgs: d.gameMsgs,
    ai: { ...d.ai },
  };
}

/** 최근 n일 요약(오늘 포함, 과거→현재 순). */
function summary(n = 14) {
  const out = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    out.push(serialize(dayKey(new Date(now - i * 86400000))));
  }
  return { today: serialize(dayKey()), days: out, tz: TZ };
}

load();
process.on('exit', save);
process.on('SIGINT', () => {
  save();
  process.exit(0);
});
process.on('SIGTERM', () => {
  save();
  process.exit(0);
});

module.exports = { hit, recordLogin, recordSignup, recordActive, recordAi, summary, dayKey };
