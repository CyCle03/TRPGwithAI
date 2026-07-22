'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 경량 세션 영속화 (MVP: 단일 슬롯 JSON 파일).
 * 서버 재시작 후에도 상태·진행이 복구되도록 한다.
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const SLOT = process.env.SAVE_SLOT || 'default';
const FILE = path.join(DATA_DIR, `session-${SLOT}.json`);

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function save(session) {
  ensureDir();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(session, null, 2), 'utf8');
  fs.renameSync(tmp, FILE); // 원자적 교체로 손상 방지
}

function load() {
  try {
    if (!fs.existsSync(FILE)) return null;
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    console.error('세션 로드 실패:', e.message);
    return null;
  }
}

function clear() {
  try {
    if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  } catch (e) {
    console.error('세션 삭제 실패:', e.message);
  }
}

module.exports = { save, load, clear, FILE };
