'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 사용자 업로드 이미지 저장/조회.
 * data/uploads/<id>.<ext> 로 평면 저장한다(공유된 정의를 다른 사용자가 플레이할 때도
 * 같은 id로 접근해야 하므로 사용자별 폴더로 나누지 않는다).
 * id는 추측 불가한 랜덤값이며, id를 아는 사람은 이미지를 볼 수 있다(capability URL).
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const UP_DIR = path.join(DATA_DIR, 'uploads');
const MAX_BYTES = 2 * 1024 * 1024; // 이미지 1장 최대 2MB
const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

function ensureDir() {
  if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });
}

/** data URL(base64)을 저장하고 { id, ext } 반환. */
function saveDataUrl(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('지원하지 않는 형식입니다. png/jpg/webp/gif 이미지만 올릴 수 있어요.');
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (!buf.length) throw new Error('이미지 데이터가 비어 있습니다.');
  if (buf.length > MAX_BYTES) {
    throw new Error(`이미지는 ${Math.round(MAX_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있어요.`);
  }
  ensureDir();
  const id = crypto.randomBytes(9).toString('hex'); // 18자 hex
  const ext = EXT_BY_MIME[m[1]];
  fs.writeFileSync(path.join(UP_DIR, `${id}.${ext}`), buf);
  return { id, ext };
}

/** 이미지 id → { path, mime }. 없으면 null. 경로 조작 방어 포함. */
function resolve(id) {
  const safe = String(id || '').replace(/[^a-f0-9]/gi, '');
  if (!safe) return null;
  for (const ext of Object.keys(MIME_BY_EXT)) {
    const p = path.join(UP_DIR, `${safe}.${ext}`);
    if (fs.existsSync(p)) return { path: p, mime: MIME_BY_EXT[ext] };
  }
  return null;
}

module.exports = { saveDataUrl, resolve, MAX_BYTES };
