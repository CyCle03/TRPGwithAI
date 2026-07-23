'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 사용자별 게임 슬롯 영속화 (JSON 파일).
 * data/sessions/<userId>.json 에 { activeId, slots } 구조로 저장한다.
 * 각 슬롯: { id, ai:{provider,model}, session:<GameSession.toJSON()> }.
 * 구버전(단일 세션 평면 객체)은 로드 시 슬롯 1개로 자동 마이그레이션한다.
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const SESS_DIR = path.join(DATA_DIR, 'sessions');
const MAX_SLOTS = 3;

function ensureDir() {
  if (!fs.existsSync(SESS_DIR)) fs.mkdirSync(SESS_DIR, { recursive: true });
}

function fileFor(userId) {
  const safe = path.basename(String(userId));
  return path.join(SESS_DIR, `${safe}.json`);
}

function save(userId, data) {
  ensureDir();
  const f = fileFor(userId);
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, f); // 원자적 교체
}

function loadRaw(userId) {
  try {
    const f = fileFor(userId);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    console.error('세션 로드 실패:', e.message);
    return null;
  }
}

/**
 * 저장 원본을 { activeId, slots:{id:{id, ai, session}} } 형태로 정규화한다.
 * 구버전(평면 세션)은 슬롯 1개로 래핑한다.
 * @param {object|null} raw
 * @param {{provider:string, model:string}} defaultAi  마이그레이션 슬롯 기본 모델
 */
function normalize(raw, defaultAi) {
  if (raw && raw.slots && typeof raw.slots === 'object') {
    return {
      activeId: raw.activeId && raw.slots[raw.activeId] ? raw.activeId : Object.keys(raw.slots)[0] || null,
      slots: raw.slots,
    };
  }
  if (raw && (raw.character || raw.messages || raw.log)) {
    const id = 'slot1';
    return { activeId: id, slots: { [id]: { id, ai: { ...defaultAi }, session: raw } } };
  }
  return { activeId: null, slots: {} };
}

function clear(userId) {
  try {
    const f = fileFor(userId);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch (e) {
    console.error('세션 삭제 실패:', e.message);
  }
}

module.exports = { save, loadRaw, normalize, clear, MAX_SLOTS };
