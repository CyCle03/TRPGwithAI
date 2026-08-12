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

module.exports = { purgeUser };
