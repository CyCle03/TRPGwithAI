'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 회원 탈퇴 시 이 서비스가 가진 사용자 데이터를 지운다.
 *
 * 통합 인증(auth.elcherlab.com)이 계정을 지우기 전에 여기를 먼저 부른다.
 * 그래서 **멱등이어야 한다** — 이미 지워진 것은 조용히 넘어가고, 어느 단계에서
 * 실패해도 다시 부르면 이어서 지워진다. 하나라도 실패하면 auth 가 계정을
 * 남겨 두므로, 실패는 삼키지 말고 그대로 던진다.
 *
 * 업로드 이미지는 사용자별 폴더가 아니라 평면 저장이고 공개된 정의를 통해
 * 다른 사람이 볼 수도 있다. 그래서 "이 사용자의 데이터를 지운 뒤에도 아무도
 * 참조하지 않는 파일"만 지운다.
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHAT_DIR = path.join(DATA_DIR, 'chats');
const SESS_DIR = path.join(DATA_DIR, 'sessions');
const UP_DIR = path.join(DATA_DIR, 'uploads');
const PUBLISHED = path.join(DATA_DIR, 'published.json');

function safeName(userId) {
  return path.basename(String(userId));
}

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[purge] ${path.basename(file)} 읽기 실패: ${e.message}`);
  }
  return fallback;
}

function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function unlinkIfExists(file) {
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

/** 업로드 파일명(확장자 제외)이 문자열 어딘가에 등장하는지로 참조를 판정한다. */
function idsReferencedIn(text, ids) {
  const found = new Set();
  for (const id of ids) if (text.includes(id)) found.add(id);
  return found;
}

/** 지금 uploads 디렉터리에 있는 파일들의 { id → 파일명 } */
function uploadIndex() {
  const map = new Map();
  if (!fs.existsSync(UP_DIR)) return map;
  for (const name of fs.readdirSync(UP_DIR)) {
    const id = name.replace(/\.[^.]+$/, '');
    if (id) map.set(id, name);
  }
  return map;
}

/** 사용자를 뺀 나머지 데이터 전체를 한 덩어리 문자열로 — 업로드 참조 확인용 */
function remainingDataText(userId) {
  const uid = safeName(userId);
  const parts = [];
  for (const [dir, skip] of [
    [CHAT_DIR, `${uid}.json`],
    [SESS_DIR, `${uid}.json`],
  ]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name === skip) continue;
      try {
        parts.push(fs.readFileSync(path.join(dir, name), 'utf8'));
      } catch (_) {}
    }
  }
  if (fs.existsSync(PUBLISHED)) {
    try {
      parts.push(fs.readFileSync(PUBLISHED, 'utf8'));
    } catch (_) {}
  }
  return parts.join('\n');
}

/**
 * @param {string} userId 통합 계정 uuid
 * @param {(id:string)=>boolean} deleteAccount users.json 에서 계정을 지우는 함수
 * @returns {object} 무엇을 얼마나 지웠는지
 */
function purgeUser(userId, deleteAccount) {
  const uid = safeName(userId);
  const removed = { account: false, chats: false, sessions: false, published: 0, uploads: 0 };

  // 1) 이 사용자의 업로드 참조를 먼저 모아 둔다(지우고 나면 찾을 수 없다).
  const uploads = uploadIndex();
  const candidateIds = new Set();
  for (const dir of [CHAT_DIR, SESS_DIR]) {
    const f = path.join(dir, `${uid}.json`);
    if (!fs.existsSync(f)) continue;
    try {
      for (const id of idsReferencedIn(fs.readFileSync(f, 'utf8'), uploads.keys())) candidateIds.add(id);
    } catch (_) {}
  }

  // 2) 공개 항목 — 소유한 항목은 통째로, 남의 항목에 남긴 흔적(추천·댓글)은 골라서 지운다.
  const db = readJson(PUBLISHED, null);
  if (db && db.entries) {
    let changed = false;
    for (const [pubId, e] of Object.entries(db.entries)) {
      if (!e) continue;
      if (e.ownerId === userId) {
        for (const id of idsReferencedIn(JSON.stringify(e), uploads.keys())) candidateIds.add(id);
        delete db.entries[pubId];
        removed.published += 1;
        changed = true;
        continue;
      }
      if (e.likedBy && e.likedBy[userId]) {
        delete e.likedBy[userId];
        e.likes = Object.keys(e.likedBy).length;
        changed = true;
      }
      if (Array.isArray(e.comments)) {
        const before = e.comments.length;
        e.comments = e.comments.filter((c) => c && c.userId !== userId);
        if (e.comments.length !== before) changed = true;
      }
    }
    if (changed) writeJsonAtomic(PUBLISHED, db);
  }

  // 3) 대화·게임 세션 파일
  removed.chats = unlinkIfExists(path.join(CHAT_DIR, `${uid}.json`));
  removed.sessions = unlinkIfExists(path.join(SESS_DIR, `${uid}.json`));

  // 4) 계정(설정·암호화된 API 키)
  removed.account = !!deleteAccount(userId);

  // 5) 업로드 — 남은 데이터가 더 이상 참조하지 않는 것만
  if (candidateIds.size) {
    const stillUsed = idsReferencedIn(remainingDataText(userId), candidateIds);
    for (const id of candidateIds) {
      if (stillUsed.has(id)) continue;
      const name = uploads.get(id);
      if (name && unlinkIfExists(path.join(UP_DIR, name))) removed.uploads += 1;
    }
  }

  return removed;
}

/**
 * 열람권(개인정보 보호법 제35조) — 이 서비스가 이 사용자에 대해 가진 것을 모아 준다.
 *
 * 등록된 AI API 키의 **값은 넣지 않는다.** 방침 3.1 에 "한 번 저장한 키는 어떤
 * 경로로도 다시 내려받을 수 없다"고 적어 두었고, 세션이 탈취되면 그대로 키까지
 * 새어 나가기 때문이다. 어느 제공자에 등록돼 있는지만 알려준다.
 *
 * @param {string} userId 통합 계정 uuid
 * @param {object|null} account users.json 의 해당 항목(없으면 null)
 */
function exportUser(userId, account) {
  const uid = safeName(userId);
  const settings = (account && account.settings) || {};

  const published = [];
  const db = readJson(PUBLISHED, null);
  if (db && db.entries) {
    for (const [pubId, e] of Object.entries(db.entries)) {
      if (!e) continue;
      if (e.ownerId === userId) {
        published.push({ 공개id: pubId, ...e });
      } else if (Array.isArray(e.comments) && e.comments.some((c) => c && c.userId === userId)) {
        // 남의 공개물에 남긴 내 댓글도 내 개인정보다.
        published.push({
          공개id: pubId,
          남의항목: true,
          제목: e.title || null,
          내댓글: e.comments.filter((c) => c && c.userId === userId),
          내추천: !!(e.likedBy && e.likedBy[userId]),
        });
      } else if (e.likedBy && e.likedBy[userId]) {
        published.push({ 공개id: pubId, 남의항목: true, 제목: e.title || null, 내추천: true });
      }
    }
  }

  const chats = readJson(path.join(CHAT_DIR, `${uid}.json`), null);
  const sessions = readJson(path.join(SESS_DIR, `${uid}.json`), null);

  // 업로드한 이미지 — 파일 자체가 아니라 주소를 준다. 주소를 알면 볼 수 있다(capability URL).
  const uploads = uploadIndex();
  const mine = new Set();
  for (const blob of [chats, sessions, published]) {
    if (!blob) continue;
    for (const id of idsReferencedIn(JSON.stringify(blob), uploads.keys())) mine.add(id);
  }

  return {
    서비스: 'AI GM 던전 월드 · 캐릭터 챗 (gm.elcherlab.com)',
    설정: {
      선택한제공자: settings.provider || null,
      모델: settings.model || null,
      엔드포인트주소: settings.baseURL || null,
      // 값이 아니라 어디에 등록돼 있는지만.
      등록된API키: Object.keys(settings.keys || {}),
      국외이전동의: settings.xferConsent
        ? { 동의함: true, 동의시각: settings.xferConsentAt || null }
        : { 동의함: false },
    },
    캐릭터챗: chats,
    게임세션: sessions,
    갤러리: published,
    업로드이미지: [...mine].map((id) => `https://gm.elcherlab.com/img/${id}`),
    참고:
      'AI API 키의 값은 포함하지 않습니다. 한 번 저장한 키는 어떤 경로로도 다시 ' +
      '내려받을 수 없도록 만들어져 있습니다(개인정보처리방침 3.1).',
  };
}

module.exports = { purgeUser, exportUser };
