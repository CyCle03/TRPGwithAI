'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 사용자별 게임 세션 영속화 (JSON 파일).
 * data/sessions/<userId>.json 에 저장한다. 서버 재시작 후에도 복구.
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const SESS_DIR = path.join(DATA_DIR, 'sessions');

function ensureDir() {
  if (!fs.existsSync(SESS_DIR)) fs.mkdirSync(SESS_DIR, { recursive: true });
}

function fileFor(userId) {
  // userId는 서버가 생성한 UUID라 경로 조작 위험 없지만, 방어적으로 basename 처리
  const safe = path.basename(String(userId));
  return path.join(SESS_DIR, `${safe}.json`);
}

function save(userId, session) {
  ensureDir();
  const f = fileFor(userId);
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(session, null, 2), 'utf8');
  fs.renameSync(tmp, f); // 원자적 교체
}

function load(userId) {
  try {
    const f = fileFor(userId);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    console.error('세션 로드 실패:', e.message);
    return null;
  }
}

function clear(userId) {
  try {
    const f = fileFor(userId);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch (e) {
    console.error('세션 삭제 실패:', e.message);
  }
}

module.exports = { save, load, clear };
