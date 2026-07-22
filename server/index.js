'use strict';

require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { GameSession } = require('./gameSession');
const { listClasses } = require('./dungeonWorld');
const { MODEL, PROVIDER } = require('./aiGM');
const store = require('./store');

const PORT = process.env.PORT || 3000;

// provider에 맞는 API 키가 있는지 확인
const KEY_ENV = PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
const hasKey = !!process.env[KEY_ENV];
if (!hasKey) {
  console.warn(
    `\n⚠️  ${KEY_ENV} 가 설정되지 않았습니다. .env 파일에 키를 넣어야 AI GM이 동작합니다.\n`
  );
}

// MVP: 단일 세션(솔로 전용). 서버 시작 시 저장본 복원.
const session = new GameSession(store.load());

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, provider: PROVIDER, model: MODEL, hasKey });
});

io.on('connection', (socket) => {
  const emit = (event, payload) => socket.emit(event, payload);

  // 접속 시 현재 상태 스냅샷 전달 (이어하기)
  socket.emit('init', {
    model: MODEL,
    classes: listClasses(),
    hasCharacter: session.hasCharacter(),
    character: session.character,
    log: session.log,
  });

  socket.on('createCharacter', async (payload) => {
    if (session.busy) return emit('error', { message: '처리 중입니다. 잠시 기다려주세요.' });
    session.busy = true;
    try {
      await session.createCharacter(emit, payload || {});
    } catch (e) {
      console.error(e);
      emit('error', { message: '캐릭터 생성 실패: ' + e.message });
    } finally {
      session.busy = false;
    }
  });

  socket.on('playerAction', async (payload) => {
    if (session.busy) return emit('error', { message: 'GM이 아직 응답 중입니다.' });
    session.busy = true;
    try {
      await session.playerAction(emit, payload?.text);
    } catch (e) {
      console.error(e);
      emit('error', { message: '행동 처리 실패: ' + e.message });
    } finally {
      session.busy = false;
    }
  });

  // 새 게임(저장본 삭제 후 초기화)
  socket.on('resetGame', () => {
    store.clear();
    session.character = null;
    session.messages = [];
    session.log = [];
    session.summary = '';
    emit('reset', {});
  });
});

server.listen(PORT, () => {
  console.log(`\n🎲 AI GM 던전 월드 실행 중: http://localhost:${PORT}`);
  console.log(`   provider: ${PROVIDER} / 모델: ${MODEL}\n`);
});
