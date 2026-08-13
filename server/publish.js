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

// 파싱한 db 를 메모리에 들고 있는다. 갤러리 화면 한 번에 listPublic·listTags 처럼
// 여러 번 부르고, 그때마다 published.json 전체를 읽어 파싱하면 항목이 늘수록 그대로
// 비용이 된다. 파일이 밖에서 바뀌었을 때도 따라가야 하므로 mtime+size 를 키로 둔다
// (statSync 는 파싱보다 훨씬 싸다).
let cache = null;
let cacheKey = '';

function fileKey() {
  try {
    const st = fs.statSync(FILE);
    return `${st.mtimeMs}:${st.size}`;
  } catch (_) {
    return '';
  }
}

/**
 * 저장소 전체. **돌려준 객체는 캐시 그 자체다** — 고쳤으면 반드시 saveAll 로 저장해야
 * 디스크와 어긋나지 않는다(이 파일 안의 모든 변경 함수가 그렇게 하고 있다).
 */
function loadAll() {
  const key = fileKey();
  if (cache && key === cacheKey) return cache;
  if (!key) {
    cache = { entries: {} };
    cacheKey = key;
    return cache;
  }
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cacheKey = key;
  } catch (e) {
    // 읽기·파싱 실패는 캐시하지 않는다. 캐시하면 파일이 다시 바뀌기 전까지
    // 빈 저장소가 굳어져, 일시적인 오류가 갤러리를 통째로 비워버린다.
    console.error('published.json 로드 실패:', e.message);
    cache = null;
    cacheKey = '';
    return { entries: {} };
  }
  return cache;
}

function saveAll(db) {
  ensureDir();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
  cache = db;
  cacheKey = fileKey();
}

function newPubId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * 정의를 공개(또는 갱신)한다. pubId가 있으면 같은 항목을 갱신(소유자만).
 * @returns {object} 저장된 항목
 */
function publish({ pubId, ownerId, ownerName, def, defEn, visibility, title, lang }) {
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
    // 이 세계관이 쓰인 언어. 본문을 번역하지 않으므로, 갤러리 카드에 뱃지로
    // 알려주기 위해 기록만 한다. 한 번 공개한 뒤에는 갱신해도 유지된다
    // (본문을 통째로 다시 쓰는 일은 드물고, 흔들리면 카드가 오락가락한다).
    lang: (entry && entry.lang) || (lang === 'en' ? 'en' : 'ko'),
    // 같은 세계관의 영어판(샘플에만 있다). 사용자 창작물은 원문 하나뿐이고,
    // 그쪽은 번역하는 대신 카드에 원문 언어 뱃지를 붙인다.
    // 넘기지 않으면 기존 값을 그대로 둔다 — 정의만 고치는 갱신에서 영어판이 날아가지 않게.
    defEn: defEn === undefined ? entry && entry.defEn : defEn,
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
  const { sort = 'recent', tag = '', limit = 60, lang } = opts;
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
  return list.sort(by[sort] || by.recent).slice(0, limit).map((e) => summarize(e, lang));
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
function listMine(ownerId, lang) {
  const db = loadAll();
  return Object.values(db.entries)
    .filter((e) => e.ownerId === ownerId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((e) => summarize(e, lang));
}

/**
 * 갤러리 카드에 쓸 대표 이미지를 고른다.
 * 제작자가 지정한 것이 있으면 그것을 쓰고, 없으면 등록된 이미지에서 자동 선별한다.
 *
 * 자동 선별은 인물 컷보다 장면 컷을 앞세운다. 카드가 커지면서 이미지가 카드의
 * 대부분을 차지하는데, 잘린 인물 얼굴보다 배경이 있는 장면이 작품 분위기를 훨씬
 * 잘 전달한다. 인물 컷은 태그를 "루나-미소"처럼 등장인물 이름으로 시작하는
 * 관례를 따르므로(설정 폼의 태그 예시가 그렇게 안내한다) 그걸로 판별한다.
 * @returns {string|null} 이미지 id. 등록된 이미지가 없으면 null.
 */
function pickCover(def) {
  const d = def || {};
  const images = Array.isArray(d.images) ? d.images : [];
  if (!images.length) return null;

  const chosen = d.coverId && images.find((im) => im.id === d.coverId);
  if (chosen) return chosen.id;

  const names = (Array.isArray(d.characters) ? d.characters : [])
    .map((c) => String((c && c.name) || '').trim())
    .filter(Boolean);
  const isPortrait = (im) => {
    const tag = String(im.tag || '').trim();
    return names.some((n) => tag === n || tag.startsWith(n + '-') || tag.startsWith(n + ' '));
  };

  const scene = images.find((im) => !isPortrait(im));
  return (scene || images[0]).id;
}

/**
 * 보는 사람의 언어에 맞는 정의. 영어판이 없으면 원문을 그대로 돌려준다
 * (그 경우 카드에 원문 언어 뱃지가 붙는다).
 */
function defFor(e, lang) {
  if (!e) return null;
  return lang === 'en' && e.defEn ? e.defEn : e.def;
}

/** 이 항목을 그 언어로 보여줄 때, 실제로 쓰이는 정의의 언어. */
function shownLang(e, lang) {
  if (lang === 'en' && e.defEn) return 'en';
  return e.lang === 'en' ? 'en' : 'ko';
}

/**
 * 목록 표시용 요약(정의 전문은 제외, 대표 이미지 1장만).
 * @param {string} [lang] 보는 사람의 화면 언어. 영어판이 있으면 그쪽으로 보여준다.
 */
function summarize(e, lang) {
  const d = defFor(e, lang) || {};
  const chars = (d.characters || []).map((c) => c.name).filter(Boolean);
  return {
    id: e.id,
    title: d.worldTitle || e.title,
    ownerName: e.ownerName,
    // 실제로 보여주는 정의의 언어. 화면 언어와 다를 때만 카드에 뱃지가 붙으므로,
    // 영어판이 있는 샘플에는 뱃지가 뜨지 않는다.
    lang: shownLang(e, lang),
    visibility: e.visibility,
    plays: e.plays || 0,
    updatedAt: e.updatedAt,
    characters: chars,
    characterCount: chars.length,
    imageCount: (d.images || []).length,
    coverImageId: pickCover(d),
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
function markSeed(key, value) {
  const db = loadAll();
  db.seeded = db.seeded || {};
  db.seeded[key] = value || new Date().toISOString();
  saveAll(db);
}
/** 시딩 때 저장해둔 값(예: 샘플 항목 id). */
function getSeed(key) {
  const db = loadAll();
  return (db.seeded || {})[key] || null;
}
/** 모든 항목(내부용 — 시더가 소유권과 무관하게 샘플을 찾을 때). */
function listAll() {
  return Object.values(loadAll().entries);
}

module.exports = {
  defFor,
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
  getSeed,
  listAll,
  VISIBILITIES,
};
