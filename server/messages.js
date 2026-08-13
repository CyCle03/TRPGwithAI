'use strict';

/**
 * 서버가 사용자에게 보내는 문구의 영어판.
 *
 * 오류 메시지는 코드 곳곳에서 한국어 문자열로 그 자리에서 만들어진다. 그걸 전부
 * 키로 바꾸는 대신, **응답 경계 한 곳에서** 원문을 보고 갈아끼운다 —
 * index.js 의 `fail()`(REST)과 `emitError()`(소켓) 두 군데뿐이다.
 *
 * 그래서 새 오류 메시지를 추가할 때 여기 번역을 빠뜨려도 동작은 그대로다.
 * 한국어 원문이 그대로 나갈 뿐이다(사전이 없으면 원문 — 화면 사전과 같은 규약).
 *
 * 세 갈래로 찾는다:
 *   EXACT   — 문자열이 통째로 같을 때
 *   PREFIX  — "행동 처리 실패: <원인>" 처럼 앞부분만 정해져 있을 때
 *   PATTERN — 숫자·이름이 박혀 있어 정규식이 필요할 때
 */

const EXACT = {
  '로그인이 필요합니다.': 'You need to be signed in.',
  'userId 가 필요합니다.': 'userId is required.',
  '알 수 없는 제공자입니다.': 'Unknown provider.',
  '활성 게임이 없습니다.': 'No active game.',
  '없는 게임입니다.': 'No such game.',
  '처리 중입니다. 잠시 기다려주세요.': 'Still working — please wait a moment.',
  'GM이 아직 응답 중입니다.': 'The GM is still responding.',
  '커스텀 엔드포인트 주소가 없습니다. ⚙ 설정에서 입력하세요.':
    'No custom endpoint URL. Enter one in ⚙ Settings.',
  '활성 챗이 없습니다.': 'No active chat.',
  '없는 챗입니다.': 'No such chat.',
  '먼저 캐릭터를 설정하세요.': 'Set up a character first.',
  '먼저 캐릭터를 생성하세요.': 'Create a character first.',
  '레벨업 선택을 먼저 완료하세요.': 'Finish your level-up choice first.',
  '응답 중입니다. 잠시만요.': 'A reply is in progress — one moment.',
  '이름 있는 캐릭터가 최소 1명 필요합니다.': 'At least one named character is required.',
  '가져온 세계관은 내 것으로 다시 공개할 수 없습니다.':
    'A world you imported cannot be republished as your own.',
  '권한이 없습니다.': 'You do not have permission.',
  '알 수 없는 조치입니다.': 'Unknown action.',
  '공개된 항목을 찾을 수 없습니다.': 'Published item not found.',
  '사용자를 찾을 수 없습니다.': 'User not found.',
  '엔드포인트 주소는 http:// 또는 https:// 로 시작해야 합니다.':
    'The endpoint URL must start with http:// or https://.',
  '잘못된 공개 범위입니다.': 'Invalid visibility setting.',
  '본인이 공개한 항목만 수정할 수 있습니다.': 'You can only edit items you published.',
  '본인이 공개한 항목만 삭제할 수 있습니다.': 'You can only delete items you published.',
  '운영자가 차단한 항목이라 다시 공개할 수 없습니다.':
    'This item was blocked by the operator and cannot be republished.',
  '없는 항목입니다.': 'No such item.',
  '댓글 내용을 입력하세요.': 'Please write a comment.',
  '삭제 권한이 없습니다.': 'You do not have permission to delete this.',
  '본인 작품은 신고할 수 없습니다.': 'You cannot report your own work.',
  '이미 신고한 항목입니다.': 'You have already reported this item.',
  '지원하지 않는 형식입니다. png/jpg/webp/gif 이미지만 올릴 수 있어요.':
    'Unsupported format. Only png/jpg/webp/gif images can be uploaded.',
  '이미지 데이터가 비어 있습니다.': 'The image data is empty.',
  '이 제공자는 목록 조회를 지원하지 않습니다.': 'This provider does not support listing models.',
  '무료 체험은 한 번에 한 분씩만 쓸 수 있어요. 잠시 후 다시 시도해주세요.':
    'The free trial serves one person at a time. Please try again shortly.',
  '요청 실패': 'Request failed',
};

/** 앞부분만 정해진 메시지. 뒤에 붙는 원인 문자열은 그대로 둔다. */
const PREFIX = {
  '캐릭터 생성 실패: ': 'Character creation failed: ',
  '행동 처리 실패: ': 'Could not process that action: ',
  '행동 제안 실패: ': 'Could not suggest actions: ',
  '레벨업 처리 실패: ': 'Level-up failed: ',
  '응답 실패: ': 'Reply failed: ',
  'AI GM 호출 실패: ': 'The AI GM call failed: ',
  'AI GM 응답 JSON 파싱 실패: ': 'Could not parse the AI GM response as JSON: ',
  '행동 제안 JSON 파싱 실패: ': 'Could not parse the suggestions as JSON: ',
  '이미지 업로드 실패: ': 'Image upload failed: ',
};

/** 숫자·이름이 끼어 있는 메시지. */
const PATTERN = [
  [
    /^무료 체험은 시간당 (\d+)회까지예요\((\d+)분 후 초기화\)\. ⚙ 설정에서 본인 API 키를 등록하면 제한 없이 쓸 수 있습니다\.$/,
    (m) =>
      `The free trial allows ${m[1]} replies per hour (resets in ${m[2]} min). Register your own API key in ⚙ Settings to remove the limit.`,
  ],
  [
    /^현재 (게임|챗)의 제공자\((.+)\) API 키가 없습니다\. ⚙ 설정에서 등록하세요\.$/,
    (m) =>
      `No API key for this ${m[1] === '게임' ? 'game' : 'chat'}'s provider (${m[2]}). Register one in ⚙ Settings.`,
  ],
  [
    /^이 세계관은 (.+)님이 만든 것이라 수정할 수 없습니다\.$/,
    (m) => `This world was created by ${m[1]}, so you cannot edit it.`,
  ],
  [
    /^무료 체험\(서버 AI\)은 현재 중단되었습니다\./,
    () =>
      'The free trial (server AI) is currently discontinued. Pick another AI provider in ⚙ Settings and register an API key. ' +
      '(Google Gemini hands out free keys without a card: aistudio.google.com/apikey)',
  ],
];

/**
 * 한국어 원문 메시지를 요청 언어로. 사전에 없으면 원문 그대로 돌려준다.
 * @param {string} msg
 * @param {string} lang 'ko' | 'en'
 */
function translate(msg, lang) {
  if (lang !== 'en' || typeof msg !== 'string' || !msg) return msg;
  if (EXACT[msg]) return EXACT[msg];
  for (const [ko, en] of Object.entries(PREFIX)) {
    if (msg.startsWith(ko)) return en + msg.slice(ko.length);
  }
  for (const [re, make] of PATTERN) {
    const m = re.exec(msg);
    if (m) return make(m);
  }
  return msg;
}

/** 요청/소켓에서 언어를 읽는다. 모르면 한국어(원문). */
function langFromReq(req) {
  const h = req && req.headers && req.headers['x-lang'];
  return h === 'en' ? 'en' : 'ko';
}

function langFromSocket(socket) {
  const q = (socket && socket.handshake && socket.handshake.query) || {};
  return q.lang === 'en' ? 'en' : 'ko';
}

module.exports = { translate, langFromReq, langFromSocket };
