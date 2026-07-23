'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 캐릭터 챗 영속화 (게임 슬롯과 별도 파일).
 * data/chats/<userId>.json 에 { activeId, chats:{id:{id, ai, persona, messages}} } 저장.
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHAT_DIR = path.join(DATA_DIR, 'chats');
const MAX_CHATS = 12;

function ensureDir() {
  if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
}

function fileFor(userId) {
  return path.join(CHAT_DIR, `${path.basename(String(userId))}.json`);
}

function save(userId, data) {
  ensureDir();
  const f = fileFor(userId);
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, f);
}

function loadRaw(userId) {
  try {
    const f = fileFor(userId);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    console.error('챗 로드 실패:', e.message);
    return null;
  }
}

module.exports = { save, loadRaw, MAX_CHATS };
