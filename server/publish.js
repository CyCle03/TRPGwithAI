'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 공개된 정의(세계관·캐릭터·이미지) 레지스트리.
 * data/published.json 에 저장한다. 대화(messages)는 포함하지 않는다 —
 * 플레이하는 사람은 각자 자기 대화 인스턴스를 갖는다.
 *
 * visibility: 'private'(안 보임) | 'link'(id를 아는 사람만) | 'public'(갤러리 노출)
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'published.json');
const VISIBILITIES = ['private', 'link', 'public'];

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAll() {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    console.error('published.json 로드 실패:', e.message);
  }
  return { entries: {} };
}

function saveAll(db) {
  ensureDir();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
}

function newPubId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * 정의를 공개(또는 갱신)한다. pubId가 있으면 같은 항목을 갱신(소유자만).
 * @returns {object} 저장된 항목
 */
function publish({ pubId, ownerId, ownerName, def, visibility, title }) {
  if (!VISIBILITIES.includes(visibility)) throw new Error('잘못된 공개 범위입니다.');
  const db = loadAll();
  let entry = pubId ? db.entries[pubId] : null;
  if (entry && entry.ownerId !== ownerId) throw new Error('본인이 공개한 항목만 수정할 수 있습니다.');
  if (entry && entry.blocked) throw new Error('운영자가 차단한 항목이라 다시 공개할 수 없습니다.');
  const id = entry ? entry.id : newPubId();
  const now = new Date().toISOString();
  entry = {
    id,
    ownerId,
    ownerName,
    title: String(title || '제목 없음').slice(0, 80),
    def,
    visibility,
    plays: entry ? entry.plays || 0 : 0,
    createdAt: entry ? entry.createdAt : now,
    updatedAt: now,
  };
  db.entries[id] = entry;
  saveAll(db);
  return entry;
}

/** 공개 중단(삭제). 소유자만. */
function unpublish(pubId, ownerId) {
  const db = loadAll();
  const e = db.entries[pubId];
  if (!e) return false;
  if (e.ownerId !== ownerId) throw new Error('본인이 공개한 항목만 삭제할 수 있습니다.');
  delete db.entries[pubId];
  saveAll(db);
  return true;
}

/**
 * 갤러리 목록(공개된 것만).
 * @param {object} opts { sort:'recent'|'likes'|'plays', tag:string, limit:number }
 */
function listPublic(opts = {}) {
  const { sort = 'recent', tag = '', limit = 60 } = opts;
  const db = loadAll();
  let list = Object.values(db.entries).filter((e) => e.visibility === 'public');
  if (tag) {
    const t = String(tag).toLowerCase();
    list = list.filter((e) => ((e.def && e.def.tags) || []).some((x) => String(x).toLowerCase() === t));
  }
  const by = {
    likes: (a, b) => (b.likes || 0) - (a.likes || 0) || String(b.updatedAt).localeCompare(String(a.updatedAt)),
    plays: (a, b) => (b.plays || 0) - (a.plays || 0) || String(b.updatedAt).localeCompare(String(a.updatedAt)),
    recent: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
  };
  return list.sort(by[sort] || by.recent).slice(0, limit).map(summarize);
}

/** 공개된 작품들에 쓰인 태그 목록(많이 쓰인 순). */
function listTags(limit = 24) {
  const db = loadAll();
  const counts = {};
  Object.values(db.entries)
    .filter((e) => e.visibility === 'public')
    .forEach((e) => ((e.def && e.def.tags) || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

/** 추천(좋아요) 토글. @returns {{likes:number, liked:boolean}} */
function toggleLike(pubId, userId) {
  const db = loadAll();
  const e = db.entries[pubId];
  if (!e) throw new Error('없는 항목입니다.');
  e.likedBy = e.likedBy || {};
  const liked = !!e.likedBy[userId];
  if (liked) delete e.likedBy[userId];
  else e.likedBy[userId] = true;
  e.likes = Object.keys(e.likedBy).length;
  saveAll(db);
  return { likes: e.likes, liked: !liked };
}

/** 댓글 목록. */
function listComments(pubId) {
  const db = loadAll();
  const e = db.entries[pubId];
  return e && Array.isArray(e.comments) ? e.comments : [];
}

/** 댓글 작성. */
function addComment(pubId, userId, userName, text) {
  const db = loadAll();
  const e = db.entries[pubId];
  if (!e) throw new Error('없는 항목입니다.');
  const body = String(text || '').trim().slice(0, 500);
  if (!body) throw new Error('댓글 내용을 입력하세요.');
  e.comments = e.comments || [];
  if (e.comments.length >= 300) e.comments.shift();
  e.comments.push({
    id: crypto.randomBytes(6).toString('hex'),
    userId,
    userName,
    text: body,
    at: new Date().toISOString(),
  });
  saveAll(db);
  return e.comments;
}

/** 댓글 삭제 — 작성자 본인, 작품 소유자, 운영자만. */
function deleteComment(pubId, commentId, userId, isAdmin) {
  const db = loadAll();
  const e = db.entries[pubId];
  if (!e || !Array.isArray(e.comments)) return [];
  const c = e.comments.find((x) => x.id === commentId);
  if (!c) return e.comments;
  if (c.userId !== userId && e.ownerId !== userId && !isAdmin) {
    throw new Error('삭제 권한이 없습니다.');
  }
  e.comments = e.comments.filter((x) => x.id !== commentId);
  saveAll(db);
  return e.comments;
}

/** 내가 공개한 목록. */
function listMine(ownerId) {
  const db = loadAll();
  return Object.values(db.entries)
    .filter((e) => e.ownerId === ownerId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(summarize);
}

/** 목록 표시용 요약(정의 전문은 제외, 대표 이미지 1장만). */
function summarize(e) {
  const d = e.def || {};
  const chars = (d.characters || []).map((c) => c.name).filter(Boolean);
  return {
    id: e.id,
    title: e.title,
    ownerName: e.ownerName,
    visibility: e.visibility,
    plays: e.plays || 0,
    updatedAt: e.updatedAt,
    characters: chars,
    characterCount: chars.length,
    imageCount: (d.images || []).length,
    coverImageId: (d.images || [])[0] ? d.images[0].id : null,
    // 세계관·시나리오 본문은 노출하지 않는다(프롬프트 유출 방지). 등장인물 이름만 미리보기.
    tags: d.tags || [],
    likes: e.likes || 0,
    commentCount: Array.isArray(e.comments) ? e.comments.length : 0,
    reports: e.reports || 0,
    blocked: !!e.blocked,
  };
}

/** 플레이용 조회. private은 소유자만. link/public은 id를 알면 가능. */
function get(pubId, requesterId) {
  const db = loadAll();
  const e = db.entries[pubId];
  if (!e) return null;
  if (e.visibility === 'private' && e.ownerId !== requesterId) return null;
  return e;
}

/** 플레이 횟수 +1. */
function bumpPlays(pubId) {
  const db = loadAll();
  const e = db.entries[pubId];
  if (!e) return;
  e.plays = (e.plays || 0) + 1;
  saveAll(db);
}

// ---------- 신고 / 운영자 조치 ----------

/** 신고 접수. 같은 사용자가 같은 항목을 중복 신고할 수 없다. */
function addReport(pubId, reporterId, reason) {
  const db = loadAll();
  const e = db.entries[pubId];
  if (!e) throw new Error('없는 항목입니다.');
  if (e.ownerId === reporterId) throw new Error('본인 작품은 신고할 수 없습니다.');
  db.reports = db.reports || {};
  const list = db.reports[pubId] || [];
  if (list.some((r) => r.userId === reporterId)) throw new Error('이미 신고한 항목입니다.');
  list.push({
    userId: reporterId,
    reason: String(reason || '').slice(0, 300),
    at: new Date().toISOString(),
  });
  db.reports[pubId] = list;
  e.reports = list.length;
  saveAll(db);
  return list.length;
}

/** 신고된 항목 목록(운영자용, 신고 많은 순). */
function listReported() {
  const db = loadAll();
  const reports = db.reports || {};
  return Object.keys(reports)
    .map((id) => {
      const e = db.entries[id];
      if (!e) return null;
      return {
        ...summarize(e),
        reportCount: reports[id].length,
        reasons: reports[id].map((r) => r.reason).filter(Boolean).slice(0, 10),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.reportCount - a.reportCount);
}

/** 차단: 비공개로 내리고 재공개를 막는다. */
function blockEntry(pubId) {
  const db = loadAll();
  const e = db.entries[pubId];
  if (!e) return null;
  e.blocked = true;
  e.visibility = 'private';
  e.updatedAt = new Date().toISOString();
  saveAll(db);
  return e;
}

/** 차단 해제. */
function unblockEntry(pubId) {
  const db = loadAll();
  const e = db.entries[pubId];
  if (!e) return null;
  e.blocked = false;
  saveAll(db);
  return e;
}

/** 운영자 삭제(신고 기록도 함께 제거). */
function removeEntry(pubId) {
  const db = loadAll();
  if (!db.entries[pubId]) return false;
  delete db.entries[pubId];
  if (db.reports) delete db.reports[pubId];
  saveAll(db);
  return true;
}

/** 신고 기록만 지우기(문제없다고 판단한 경우). */
function clearReports(pubId) {
  const db = loadAll();
  if (db.reports) delete db.reports[pubId];
  if (db.entries[pubId]) db.entries[pubId].reports = 0;
  saveAll(db);
  return true;
}

/** 공개 항목의 현재 소유자 id (공개 범위와 무관). 없으면 null. */
function ownerOf(pubId) {
  if (!pubId) return null;
  const db = loadAll();
  const e = db.entries[pubId];
  return e ? e.ownerId : null;
}

/** 공개 항목의 소유자를 변경한다(샘플 → 실제 계정 이관용). */
function transferOwner(pubId, newOwnerId, newOwnerName) {
  const db = loadAll();
  const e = db.entries[pubId];
  if (!e) return null;
  e.ownerId = newOwnerId;
  e.ownerName = newOwnerName;
  e.updatedAt = new Date().toISOString();
  saveAll(db);
  return e;
}

/** 시딩 중복 방지 플래그 (한 번 등록 후 사용자가 지우면 다시 생기지 않음). */
function hasSeed(key) {
  const db = loadAll();
  return !!(db.seeded && db.seeded[key]);
}
function markSeed(key) {
  const db = loadAll();
  db.seeded = db.seeded || {};
  db.seeded[key] = new Date().toISOString();
  saveAll(db);
}

module.exports = {
  publish,
  unpublish,
  listPublic,
  listMine,
  get,
  bumpPlays,
  transferOwner,
  ownerOf,
  listTags,
  toggleLike,
  listComments,
  addComment,
  deleteComment,
  addReport,
  listReported,
  blockEntry,
  unblockEntry,
  removeEntry,
  clearReports,
  hasSeed,
  markSeed,
  VISIBILITIES,
};
