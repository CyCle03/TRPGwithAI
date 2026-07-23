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

/** 갤러리 목록(공개된 것만, 최신순). def 본문은 빼고 요약만. */
function listPublic(limit = 60) {
  const db = loadAll();
  return Object.values(db.entries)
    .filter((e) => e.visibility === 'public')
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, limit)
    .map(summarize);
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
    summary: String(d.worldLore || d.scenario || '').slice(0, 120),
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
  hasSeed,
  markSeed,
  VISIBILITIES,
};
