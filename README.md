# AI GM 솔로 던전 월드 (MVP)

AI가 GM(게임 마스터)을 맡는 1인용 던전 월드(PbtA) 웹 도구. 플레이어는 텍스트로 행동을 서술하고, AI GM이 상황을 묘사·전개하며, **주사위 판정과 수치 관리는 코드(규칙 엔진)가 담당**한다.

자세한 설계 배경은 [BRIEF.md](BRIEF.md) 참고.

## 핵심 설계 — 역할 분리

| 담당 | 책임 |
|------|------|
| **규칙 엔진 (코드)** | 2d6 주사위(서버 난수), 판정 구간(10+/7-9/6-), HP·인벤토리 등 상태의 단일 원천 |
| **AI GM (Claude API)** | 장면 묘사·NPC 연출, 자유서술 → 무브 해석, 판정 결과 서사화 |

핵심 루프: **AI가 무브 판단 → 코드가 2d6 굴림 → 결과를 다시 AI에 먹여 서사화** (2-패스).
AI 응답은 [Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)(JSON 스키마 강제)로 `narration` + `action`으로 분리해 받아, 규칙 엔진이 안전하게 처리한다.

## 실행 방법

1. 의존성 설치:
   ```bash
   npm install
   ```
2. `.env` 파일에 Anthropic API 키 입력 (`.env.example` 참고). 키는 **서버에서만** 사용되며 클라이언트에 노출되지 않는다.
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-sonnet-5   # 선택. 고품질을 원하면 claude-opus-4-8
   ```
3. 서버 실행:
   ```bash
   npm start
   ```
4. 브라우저에서 http://localhost:3000 접속 → 캐릭터 생성 후 모험 시작.

## 프로젝트 구조

```
server/
  index.js         Express + Socket.io 서버, 소켓 이벤트 라우팅
  gameSession.js   핵심 루프 오케스트레이션 (무브 판단 → 굴림 → 서사화)
  rulesEngine.js   주사위·판정·상태 변경 (결정론적 규칙 엔진)
  aiGM.js          Claude API 프록시, Structured Outputs 스키마
  dungeonWorld.js  클래스 프리셋(전사/마법사) + 무브 요약
  store.js         세션 저장/이어하기 (JSON 파일, data/)
public/
  index.html       서사 로그 + 상태창 + 입력창 UI
  style.css
  app.js           Socket.io 클라이언트, 렌더링
```

## 현재 범위 (MVP)

- 캐릭터 생성 (이름 + 클래스 프리셋 1개: 전사/마법사)
- AI GM과 자유 텍스트로 장면 진행
- 무브 판단 → 2d6 판정 → 결과 서사화 (핵심 루프)
- HP·인벤토리 상태창 실시간 표시·갱신
- 세션 저장/이어하기 (단일 슬롯, 서버 재시작 후 복구)

## 이번엔 제외

멀티플레이·로그인, 전체 클래스/무브, 이미지·음성, 정교한 전투 자동화. 확장 로드맵은 BRIEF.md 참고.

## 저작권

던전 월드의 규칙 메커니즘(2d6 판정)은 자유롭게 구현 가능하나, 룰북의 무브·클래스 설명 텍스트는 직접 요약·재작성했다(원문 복제 안 함). 배포 전 라이선스 확인 권장.
