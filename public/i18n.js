'use strict';

/**
 * 한국어 / 영어 전환.
 *
 * **이 서비스의 원문은 한국어다.** 그래서 키가 없을 때 en 이 아니라 **ko 로 되돌아간다** —
 * 번역이 빠져도 화면이 비지 않고 원문이 나온다. (pet 과 같은 규약)
 *
 * **언어 설정은 localStorage 에만 둔다. 쿠키를 쓰지 않는다.**
 * 개인정보처리방침 9.1 이 "쿠키는 로그인 유지 목적 하나만 씁니다"라고 못박고 있어서,
 * 언어 쿠키를 하나 더 심으면 그 문장이 거짓이 된다. 서브도메인끼리 자동으로 공유되지
 * 않는 대신 링크로 넘긴다(`?lang=en`).
 *
 * **세계관·캐릭터·대화 내용은 번역하지 않는다.** 사용자가 쓴 원문이 곧 저장값이라,
 * 화면 언어를 바꿔도 그대로 둔다. 갤러리 카드에는 원문 언어 뱃지만 붙인다.
 * AI 서사는 이 사전이 아니라 서버 프롬프트가 언어를 정한다(대화별로 고정).
 *
 * **던전 월드 데이터(클래스·장비·태그)는 번역하지 않고 id 를 유지한다.** 규칙 엔진과
 * 프롬프트가 그 문자열로 서로를 참조하기 때문이다. 화면에 낼 때만 id 로 사전을 찾는다(tOr).
 */
(function () {
  const STORE_KEY = 'ai-gm/lang/v1';
  const SOURCE = 'ko';
  const LANGS = ['ko', 'en'];

  const DICT = {
    ko: {
      'lang.other': 'English',
      'lang.switchTitle': '언어를 영어로 바꿉니다',
      'lang.badge.ko': '한국어 원문',
      'lang.badge.en': 'English',

      // ── 공용 ──
      'common.cancel': '취소',
      'common.close': '닫기',
      'common.save': '저장',
      'common.apply': '적용',
      'common.delete': '삭제',
      'common.prev': '이전',
      'common.next': '다음',
      'common.optional': '(선택)',
      'common.requestFailed': '요청 실패',
      'common.authOriginFailed': '인증 서버 주소를 가져오지 못했습니다.',
      'common.default': '기본',
      'common.defaultValue': '기본값',
      'common.none': '(없음)',
      'common.empty': '(비어 있음)',
      'common.notYet': '(아직 없음)',

      // ── 로그인 · 랜딩 ──
      'auth.title': '🎲 AI GM 솔로 던전 월드',
      'auth.subtitle.login': '로그인하고 모험을 시작하세요',
      'auth.subtitle.signup': '새 계정을 만들어 시작하세요',
      'auth.id': '아이디',
      'auth.idPlaceholder': '영문/숫자/밑줄 3~20자',
      'auth.pw': '비밀번호',
      'auth.pwPlaceholder': '6자 이상',
      'auth.consent':
        '만 14세 이상이며, ' +
        '<a href="https://elcherlab.com/terms.html" target="_blank" rel="noopener">이용약관</a>과 ' +
        '<a href="https://elcherlab.com/privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>에 ' +
        '동의합니다.',
      'auth.login': '로그인',
      'auth.signup': '회원가입',
      'auth.noAccount': '계정이 없나요?',
      'auth.hasAccount': '이미 계정이 있나요?',
      'auth.needConsent': '만 14세 이상 확인과 약관 동의에 체크해 주세요.',
      'auth.terms': '이용약관',
      'auth.privacy': '개인정보처리방침',
      'auth.myAccount': '내 계정',

      'home.title': '🎲 AI GM',
      'home.subtitle': '무엇을 하시겠어요?',
      'home.game': '던전 월드',
      'home.gameDesc': 'AI가 게임 마스터를 맡는 1인용 TRPG. 주사위·HP·아이템을 규칙대로 관리합니다.',
      'home.chat': '캐릭터 챗',
      'home.chatDesc': '세계관과 캐릭터를 직접 만들어 자유롭게 대화. 갤러리에서 남의 세계관도 플레이.',

      'meta.title.landing': 'AI GM · 던전 월드 & 캐릭터 챗',
      'meta.title.play': 'AI GM 던전 월드',
      'meta.title.chat': '캐릭터 챗',

      // ── 사용자 바 ──
      'bar.home': '홈으로',
      'bar.game': '🎲 게임',
      'bar.gameTitle': 'AI GM 던전월드',
      'bar.chat': '💬 챗',
      'bar.chatTitle': '캐릭터 챗',
      'bar.profile': '내 프로필',
      'bar.settings': '⚙ 설정',
      'bar.settingsTitle': '설정',
      'bar.logout': '로그아웃',

      'legacy.notice':
        '옛 주소(ai-gm.duckdns.org)는 8월 7일부터 접속할 수 없습니다. ' +
        '북마크를 gm.elcherlab.com 으로 바꿔주세요.',

      // ── 설정 모달 ──
      'set.title': '⚙ 설정',
      'set.sub':
        '제공자별 <b>본인 API 키</b>를 등록하세요(암호화 저장, 타인에게 노출 안 됨). 여기서 고른 제공자·모델은 ' +
        '<b>새 게임의 기본값</b>이며, 게임별 모델은 🧠 버튼으로 따로 바꿀 수 있어요.',
      'set.provider': 'AI 제공자',
      'set.baseUrl': '엔드포인트 주소',
      'set.baseUrlPlaceholder': '예: http://호스트:11434/v1',
      'set.baseUrlHelp':
        'OpenAI 호환 <code>/chat/completions</code> 를 제공하는 주소. <b>이 서버(클라우드)에서 접근 가능한 공개 주소</b>여야 합니다 — 내 PC의 localhost Ollama는 직접 연결되지 않습니다.',
      'set.model': '모델',
      'set.modelOpt': '(비우면 기본값 사용)',
      'set.apiKey': 'API 키',
      'set.keyPlaceholder': '키를 붙여넣기 (변경할 때만 입력)',
      'set.keyFreePlaceholder': '무료 체험은 키가 필요 없습니다',
      'set.keyRegistered': '(등록됨 — 바꿀 때만 입력)',
      'set.keyMissing': '(미등록)',
      'set.keyIssue': '키 발급: {url} · {note}',
      'set.firstTime':
        '먼저 AI API 키를 등록해야 게임을 시작할 수 있어요. 아래 안내를 따라 카드 없이 발급받을 수 있습니다.',
      'set.needXferConsent': 'API 키를 등록하려면 국외 이전 동의에 체크해 주세요.',

      'set.xfer.title': '🌏 국외 이전 동의 (API 키 등록 시 필수)',
      'set.xfer.lead':
        '키를 등록하면 AI 기능을 쓸 때마다 아래 정보가 이용자가 고른 AI 사업자에게 국외로 전송됩니다.',
      'set.xfer.items':
        '<b>이전 항목</b> — 입력한 대화 내용, 세계관·캐릭터 설정, 앞선 대화 맥락, 등록한 API 키',
      'set.xfer.who':
        '<b>이전받는 자·국가</b> — 미국(Google·Anthropic·OpenAI·xAI), 중국(DeepSeek), 싱가포르 등(Alibaba Cloud). 커스텀은 직접 입력한 주소의 운영자',
      'set.xfer.when': '<b>시기·방법</b> — AI를 호출할 때마다 암호화된 연결(TLS)로 전송',
      'set.xfer.why':
        '<b>목적·보유기간</b> — AI 응답 생성. 전송 이후의 보관·이용은 각 사업자의 정책을 따르며 운영자는 통제할 수 없습니다',
      'set.xfer.optout':
        '<b>거부 방법·효과</b> — 동의하지 않거나 등록한 키를 삭제하면 전송되지 않습니다. AI 기능만 쓸 수 없고 계정·다른 서비스 이용에는 영향이 없습니다',
      'set.xfer.need':
        '<b>이미 등록해 둔 키가 있습니다.</b> AI 기능을 계속 쓰시려면 아래에 동의하고 저장해 주세요. ' +
        '동의하지 않으시려면 그대로 두시면 됩니다 — 전송이 일어나지 않습니다.',
      'set.xfer.agree':
        '위 국외 이전에 동의합니다 — ' +
        '<a href="https://elcherlab.com/privacy.html#s6" target="_blank" rel="noopener">개인정보처리방침 7장</a>',

      'set.disclaimer.title': '⚠️ 면책 조항',
      'set.disclaimer.body':
        '본 서비스는 개인이 만든 비상업 취미 프로젝트입니다. 등록하신 API 키의 사용량과 그에 따른 모든 ' +
        '요금·과금은 전적으로 사용자 본인의 책임입니다. 키는 암호화되어 저장되지만, 운영자는 데이터의 ' +
        '보안·무결성·가용성을 어떠한 형태로도 보증하지 않습니다. 서비스 이용 과정에서 발생하는 요금, ' +
        '데이터 손실, 계정·키 유출, 서비스 중단 등 일체의 직간접적 손해에 대해 운영자는 법적 책임을 지지 ' +
        '않습니다. 이에 동의하지 않으시면 API 키를 등록하지 마세요. API 키 등록 및 게임 이용은 위 내용에 ' +
        '동의하는 것으로 간주됩니다.',

      // ── 제공자 이름 · 키 발급 안내 ──
      'prov.gemini': 'Google Gemini (무료 등급 가능)',
      'prov.anthropic': 'Anthropic Claude',
      'prov.openai': 'OpenAI (GPT)',
      'prov.deepseek': 'DeepSeek (저렴)',
      'prov.xai': 'xAI Grok',
      'prov.qwen': 'Qwen (Alibaba)',
      'prov.custom': '커스텀 (Ollama / OpenAI 호환)',
      'prov.free': '무료 체험 (서버 AI · 키 불필요 · 느림)',
      'provLabel.custom': '커스텀',
      'provLabel.free': '무료 체험',

      'key.gemini.note': '무료 키 발급 가능(카드 불필요)',
      'key.anthropic.note': '유료(선불 크레딧)',
      'key.openai.note': '유료',
      'key.deepseek.note': '유료(저렴)',
      'key.xai.note': '유료',
      'key.qwen.note': '유료(신규 무료 크레딧 제공)',
      'key.custom.url': 'Ollama/LM Studio 등',
      'key.custom.note': '자체 호스팅은 키가 필요 없을 수 있음(비우면 됨)',
      'key.free.url': '발급 불필요',
      'key.free.note': '서버의 로컬 AI로 무료 체험 (느리고 사용량 제한 있음)',

      'guide.gemini.title': '<b>🔑 Gemini 키 발급 — 1분이면 됩니다</b>',
      'guide.gemini.s1':
        '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> 접속 후 Google 계정으로 로그인',
      'guide.gemini.s2': '<b>「API 키 만들기」</b> 클릭 (결제 카드 등록 없이 발급됩니다)',
      'guide.gemini.s3': '만들어진 키를 복사해 위 <b>API 키</b> 칸에 붙여넣고 저장',
      'guide.generic': '<b>🔑 키 발급</b><br />{url} 에서 키를 만들어 위 칸에 붙여넣고 저장하세요. ({note})',
      'guide.geminiFreeTier':
        'ℹ️ Google 무료 등급 키는 주고받은 내용이 Google의 제품 개선에 쓰이고 ' +
        '사람이 검토할 수 있습니다. 민감한 개인정보는 입력하지 마세요. ' +
        '(내 Google 계정에 결제 수단을 연결한 유료 등급 키는 학습에 쓰이지 않습니다.)',

      'free.notice.title': '<b>⚠️ 무료 체험 모드 유의사항</b>',
      'free.notice.lead':
        '이 서버에 설치된 <b>작은 로컬 AI</b>로 동작합니다. API 키 없이 바로 쓸 수 있지만 아래 제한이 있어요.',
      'free.notice.slow': '<b>느립니다</b> — CPU로 추론해서 한 응답에 수십 초가 걸릴 수 있어요.',
      'free.notice.limit': '<b>사용량 제한</b> — 동시에 한 분만, 시간당 {n}회까지.',
      'free.notice.quality':
        '<b>품질이 낮습니다</b> — 소형 모델이라 말투·형식을 어기거나 설정을 놓칠 수 있어요. 세계관이 길수록 더 그렇습니다.',
      'free.notice.trial': '<b>체험용</b> — 예고 없이 중단되거나 모델이 바뀔 수 있습니다.',
      'free.notice.tail':
        '제대로 즐기시려면 <b>본인 API 키 등록</b>을 권합니다(Gemini는 무료 등급으로도 훨씬 빠르고 품질이 좋습니다).',
      'free.notice.local': '✅ 대화 내용이 외부 업체로 전송되지 않고 이 서버 안에서만 처리됩니다.',
      'free.offMessage':
        '무료 체험(서버 AI)은 현재 중단되었습니다. ⚙ 설정에서 다른 AI 제공자를 고르고 API 키를 등록해주세요. ' +
        '(Google Gemini는 카드 없이 무료 키를 받을 수 있어요: aistudio.google.com/apikey)',
      'free.off.title': '<b>⚠️ 무료 체험이 중단되었습니다</b>',
      'free.off.body':
        '무료 체험을 돌리던 서버 AI를 내려서 지금은 쓸 수 없어요. ' +
        '아래에서 <b>다른 AI 제공자</b>를 고르고 <b>본인 API 키</b>를 등록하면 이어서 플레이할 수 있습니다.',
      'free.off.gemini':
        '✅ Google Gemini는 카드 없이 무료 키를 받을 수 있어요 — ' +
        '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>',

      // ── 모델 모달 ──
      'gm.title': '🧠 이 게임의 AI 모델',
      'gm.sub':
        '게임마다 다른 모델을 쓸 수 있고 <b>진행 중에도</b> 바꿀 수 있어요. API 키는 ⚙ 설정에서 제공자별로 등록합니다.',
      'gm.fetchModels': '📋 사용 가능한 모델 불러오기',
      'gm.testModel': '🔌 연결 테스트',
      'gm.lengthLabel': '응답 길이',
      'gm.lengthOpt': '(이 대화에만 적용)',
      'gm.lengthDefault': '제작자 권장 따르기',
      'gm.lengthDefaultWith': '제작자 권장 따르기 ({label})',
      'gm.modelsHint': '추천 모델 {n}개를 넣어뒀어요(모델 칸 클릭). 키가 있으면 「불러오기」로 내 계정의 실제 목록을 볼 수 있어요.',
      'gm.modelsHintEmpty': '모델 이름을 직접 입력하세요.',
      'gm.loading': '불러오는 중…',
      'gm.modelsFound': '사용 가능한 모델 {n}개 — 모델 칸을 클릭하면 목록이 뜹니다.',
      'gm.modelsNone': '사용 가능한 모델이 없습니다.',
      'gm.testing': '연결 테스트 중…',
      'gm.testOk': '✅ 연결 성공 (응답: {sample})',
      'gm.keyFree': '키가 필요 없습니다 — 서버의 로컬 AI로 바로 플레이합니다.',
      'gm.keyReady': '{prov} 키 등록됨 ✓',
      'gm.keyMissing': '⚠ {prov} 키가 없습니다. <b>⚙ 설정</b>에서 먼저 등록하세요{extra}.',
      'gm.keyMissingCustom': '(커스텀은 엔드포인트 주소)',
      'gm.buttonTitle': '이 게임의 AI 모델 변경',
      'gm.buttonLabel': '모델',

      'len.veryshort': '아주 짧게',
      'len.short': '짧게',
      'len.medium': '보통',
      'len.long': '길게',
      'len.verylong': '아주 길게',
      'len.opt.veryshort': '아주 짧게 (1~2문장 · 메신저형)',
      'len.opt.short': '짧게 (2~4문장)',
      'len.opt.medium': '보통 (1~2문단)',
      'len.opt.long': '길게 (3~4문단)',
      'len.opt.verylong': '아주 길게 (250~300단어 · 소설형)',

      // ── 생각 중 표시 ──
      'think.elapsed': '{frame} {base}… {sec}초',
      'think.freeSlow': ' · 무료 체험(서버 로컬 AI)은 응답이 느립니다. 정상 동작 중이에요.',
      'think.slow': ' · 평소보다 오래 걸리고 있어요.',

      // ── 던전 월드: 캐릭터 생성 ──
      'play.title': '🎲 AI GM 솔로 던전 월드',
      'play.subtitle': '캐릭터 시트를 만들어 모험을 시작하세요',
      'play.step1': '1 · 클래스',
      'play.step2': '2 · 능력치',
      'play.step3': '3 · 장비',
      'play.step4': '4 · 마무리',
      'play.pickClass': '클래스 선택',
      'play.assignStats': '능력치 배분',
      'play.modeRecommend': '추천 배치',
      'play.modeCustom': '직접 배분',
      'play.recommendHint': '{cls}의 추천 능력치입니다.',
      'play.customOk': '유효한 배치입니다. (표준 배열 사용)',
      'play.customBad': '표준 배열을 정확히 사용하세요: {parts}',
      'play.startGear': '시작 장비 선택',
      'play.gearCount': '({n}/{max})',
      'play.gearHint': '기본 장비에 더해 아래에서 2개를 고르세요.',
      'play.gearPickHint': '무기·방어구·추가 장비를 하나씩 고르세요. 방어구 선택에 따라 방어력이 달라집니다.',
      'play.baseGear': '<span class="bg-label">기본 장비:</span> {list}',
      'play.currentArmor': '현재 방어력: {n}',
      'play.learnable': '이 클래스가 배울 수 있는 기술',
      'play.learnableHint': '레벨업 때 아래 기술 중 하나씩 습득합니다.',
      'play.charName': '캐릭터 이름',
      'play.charNamePlaceholder': '예: 아린',
      'play.charLook': '한 줄 소개',
      'play.charLookPlaceholder': '예: 상처투성이 갑옷을 걸친 과묵한 용병',
      'play.charLookHint': '외형·성격·배경을 적으면 GM이 첫 장면에 반영합니다.',
      'play.start': '모험 시작',

      'sheet.weaponTags': '무기 태그',
      'sheet.class': '클래스',
      'sheet.hp': 'HP',
      'sheet.armor': '방어구',
      'sheet.damage': '피해',
      'sheet.stats': '능력치',
      'sheet.gear': '장비',
      'sheet.learnMoves': '배울 기술',

      // ── 던전 월드: 게임 화면 ──
      'game.enemies': '⚔️ 적',
      'game.companions': '🤝 동료',
      'game.noEnemies': '(적 없음)',
      'game.noCompanions': '(동료 없음)',
      'game.thinking': 'GM이 이야기를 짜는 중',
      'game.suggest': '💡 제안',
      'game.suggestTitle': '행동 제안 받기',
      'game.inputPlaceholder': '행동을 서술하세요. 예: 고블린 뒤로 몰래 다가간다',
      'game.send': '전송',
      'game.newGame': '＋ 새 게임',
      'game.newGameTitle': '새 게임 슬롯 만들기',
      'game.charTitle': '캐릭터',
      'game.armorText': '방어구 {n}',
      'game.coin': '💰 소지금',
      'game.inventory': '인벤토리',
      'game.moves': '습득 무브',
      'game.weapon': '무기',
      'game.rolling': '주사위를 굴리는 중…',
      'game.dead': '캐릭터가 사망했습니다 — 새 게임으로 새 모험을 시작하세요.',
      'game.slotEmpty': '빈 슬롯 (새 모험)',
      'game.slotSwitch': '이 게임으로 전환',
      'game.slotDelete': '이 게임 삭제',
      'game.slotDeleteAsk': '{name}을(를) 삭제할까요? 되돌릴 수 없습니다.',
      'game.slotThis': '이 게임',
      'game.slotThisEmpty': '이 빈 슬롯',
      'game.slotMax': '게임은 최대 {max}개까지 저장됩니다',
      'game.adventurer': '모험가',
      'game.stopped': ' · ⚠ 중단됨',
      'game.noKey': ' · ⚠ 키 미등록',

      'lu.title': '⭐ 레벨업!',
      'lu.sub': '성장 방향을 선택하세요.',
      'lu.stat': '능력치 +1',
      'lu.move': '새 무브 습득',
      'lu.confirm': '선택 확정',
      'lu.statMax': '모든 능력치가 최대치입니다.',
      'lu.moveMax': '더 습득할 무브가 없습니다.',

      // ── 캐릭터 챗: 갤러리 ──
      'gal.title': '🌐 둘러보기',
      'gal.subtitle': '다른 사용자가 공개한 세계관·캐릭터를 각자 자기 대화로 플레이할 수 있어요.',
      'gal.sortRecent': '최신순',
      'gal.sortLikes': '추천순',
      'gal.sortPlays': '플레이순',
      'gal.tagAll': '전체',
      'gal.emptyMine': '아직 공개한 것이 없어요.',
      'gal.emptyAll': '아직 공개된 것이 없어요. 처음으로 공개해보세요!',
      'gal.plays': '플레이 {n}',
      'gal.play': '플레이',
      'gal.detail': '💬 상세',
      'gal.detailTitle': '태그 · 추천 · 댓글 보기',
      'gal.report': '🚩 신고',
      'gal.reportTitle': '부적절한 내용 신고',
      'gal.reportAsk': '"{title}"을(를) 신고하는 이유를 적어주세요.',
      'gal.reported': '신고가 접수되었습니다. (누적 {n}건)',
      'gal.unpublish': '공개 중단',
      'gal.unpublishAsk': '"{title}" 공개를 중단할까요? 갤러리에서 사라집니다.',
      'gal.charCount': '캐릭터 {n}',
      'gal.imageCount': '이미지 {n}',

      'vis.private': '🔒 비공개',
      'vis.link': '🔗 링크 공개',
      'vis.public': '🌐 전체 공개',

      'dt.title': '작품',
      'dt.like': '♥ 추천',
      'dt.play': '플레이',
      'dt.comments': '댓글',
      'dt.commentPlaceholder': '댓글을 입력하세요',
      'dt.commentSend': '등록',
      'dt.noComments': '아직 댓글이 없습니다.',
      'dt.commentDeleteAsk': '이 댓글을 삭제할까요?',

      // ── 캐릭터 챗: 내 대화 ──
      'chats.title': '💬 내 대화',
      'chats.subtitle': '저장한 캐릭터와 이어서 대화하세요.',
      'chats.empty': '아직 만든 캐릭터가 없어요. 둘러보기에서 마음에 드는 세계관을 플레이하거나, 직접 만들어 보세요.',
      'chats.new': '＋ 새 캐릭터 만들기',
      'chats.max': '캐릭터는 최대 {max}개까지 저장돼요',
      'chats.deleteThis': '이 캐릭터 삭제',
      'chats.deleteAsk': '"{name}"을(를) 삭제할까요? 대화도 함께 지워집니다.',
      'chats.thisChar': '이 캐릭터',
      'chats.unnamed': '설정 안 된 캐릭터',
      'chats.mine': '내 대화',

      // ── 캐릭터 챗: 대화 화면 ──
      'chat.back': '목록으로',
      'chat.edit': '캐릭터 설정 편집',
      'chat.thinking': '입력 중',
      'chat.typing': '상대가 입력 중',
      'chat.inputPlaceholder': '메시지를 입력하세요…',
      'chat.send': '전송',
      'chat.sceneImage': '장면 이미지',

      // ── 캐릭터 챗: 만들기 ──
      'cp.titleNew': '💬 캐릭터 · 세계관 만들기',
      'cp.titleEdit': '💬 캐릭터 · 세계관 편집',
      'cp.subtitle': '세계관과 여러 캐릭터를 직접 만들어 대화하세요. 캐릭터는 1명 이상 필요합니다.',
      'cp.title': '제목',
      'cp.titleOpt': '(선택 · 목록 표시명)',
      'cp.titlePlaceholder': '예: 안개 낀 마법 학원',
      'cp.lore': '세계관 설정',
      'cp.loreOpt': '(선택 · 여러 캐릭터일 때 유용)',
      'cp.lorePlaceholder': '배경 세계, 규칙, 분위기 등',
      'cp.characters': '등장인물 *',
      'cp.addChar': '＋ 캐릭터 추가',
      'cp.charName': '캐릭터 {n} 이름',
      'cp.charDesc': '성격 · 말투 · 외형 · 배경',
      'cp.charDelete': '이 캐릭터 삭제',
      'cp.images': '이미지',
      'cp.imagesOpt': '(선택 · 태그를 달면 AI가 상황에 맞춰 보여줍니다)',
      'cp.addImage': '＋ 이미지 추가',
      'cp.imageHint': '2MB 이하 png/jpg/webp/gif, 최대 16장. 태그 예: <b>루나-미소</b>, <b>밤의 탑</b>, <b>전투</b>',
      'cp.imageAlt': '이미지',
      'cp.imageTag': '태그 (예: 루나-미소)',
      'cp.imageWhen': '언제 보여줄지 설명 (선택)',
      'cp.coverOn': '★ 대표',
      'cp.coverOff': '☆ 대표',
      'cp.coverOnTitle': '대표 이미지로 지정됨 — 다시 누르면 자동 선택으로 돌아갑니다',
      'cp.coverOffTitle': '갤러리 카드에 쓸 대표 이미지로 지정',
      'cp.imageRemove': '이 이미지 빼기',
      'cp.coverHintPicked': '★ 표시한 이미지를 갤러리 카드에 씁니다.',
      'cp.coverHintAuto': '대표를 고르지 않으면 등록한 이미지 중 장면 컷을 골라 자동으로 씁니다.',
      'cp.uploadFailed': '이미지 업로드 실패: {msg}',
      'cp.scenario': '시작 상황 / 시나리오',
      'cp.scenarioPlaceholder': '첫 장면, 어디서 어떻게 시작하는지',
      'cp.greeting': '첫 인사말 / 오프닝',
      'cp.greetingPlaceholder': '대화 시작 시 먼저 보여줄 장면·대사',
      'cp.persona': '내 페르소나',
      'cp.personaPlaceholder': "상대가 '나'를 어떻게 인식할지 (이름·관계 등)",
      'cp.tags': '장르 · 태그',
      'cp.tagsOpt': '(선택 · 쉼표로 구분, 최대 6개)',
      'cp.tagsPlaceholder': '예: 판타지, 미스터리, 느와르',
      'cp.length': '권장 응답 길이',
      'cp.lengthOpt': '(플레이어가 각자 바꿀 수 있어요)',
      'cp.visibility': '공개 설정',
      'cp.visPrivate': '🔒 비공개 (나만)',
      'cp.visLink': '🔗 링크 아는 사람만',
      'cp.visPublic': '🌐 공개 (갤러리에 노출)',
      'cp.publishHint': '공개하면 다른 사용자가 각자 자기 대화로 플레이할 수 있어요.',
      'cp.publishApply': '공개 적용',
      'cp.published': '{vis} 중 · 플레이 {n}회',
      'cp.shareLink': '공유 링크: <b>{link}</b>',
      'cp.save': '저장하고 대화 시작',
      'cp.needChar': '이름 있는 캐릭터가 최소 1명 필요합니다.',
      'cp.needCharDesc': '각 캐릭터의 설명을 입력하세요.',
      'cp.needCharPublish': '공개하려면 이름 있는 캐릭터가 최소 1명 필요합니다.',

      'tag.판타지': '판타지',
      'tag.로맨스': '로맨스',
      'tag.미스터리': '미스터리',
      'tag.호러': '호러',
      'tag.학원': '학원',
      'tag.무협': '무협',
      'tag.일상': '일상',
      'tag.느와르': '느와르',
      'tag.코미디': '코미디',
      'tag.SF': 'SF',
      'tag.힐링': '힐링',
      'tag.범죄': '범죄',

      // ── 캐릭터 챗: 프로필 ──
      'prof.title': '👤 내 프로필',
      'prof.sub': '{name} 님이 공개한 작품입니다.',
      'prof.mine': '내가 공개한 작품',
      'prof.works': '작품',
      'prof.likes': '♥ 추천',
      'prof.plays': '플레이',
      'prof.comments': '댓글',
      'prof.other': '다른 서비스',
      'prof.toPlay': 'AI GM 던전 월드로 이동',
      'prof.toHome': '서비스 선택 화면',
      'prof.account': '계정',
      'prof.settings': '설정 · API 키',
      'prof.logout': '로그아웃',

      // ── 탭바 ──
      'tab.home': '둘러보기',
      'tab.chats': '내 대화',
      'tab.create': '만들기',
      'tab.profile': '프로필',
      'tab.aria': '주요 화면',

      // ── 운영자 ──
      'adm.stats': '📊 접속 통계',
      'adm.only': '(운영자 전용)',
      'adm.statsHint': '한국 시간 기준. 방문자는 IP를 되돌릴 수 없게 변환해 셉니다.',
      'adm.reports': '🛡 신고 관리',
      'adm.reportsHint': '신고가 들어온 항목입니다. 확인 후 조치하세요.',
      'adm.visitors': '방문자',
      'adm.visitorsDesc': '오늘 다녀간 서로 다른 접속자',
      'adm.pages': '페이지 진입',
      'adm.pagesDesc': '랜딩·게임·챗 페이지를 연 횟수',
      'adm.users': '접속 사용자',
      'adm.usersDesc': '로그인 상태로 실제 이용한 사람',
      'adm.signups': '신규 가입',
      'adm.signupsDesc': '오늘 새로 만든 계정',
      'adm.chatCalls': '챗 응답',
      'adm.chatCallsDesc': '캐릭터 챗 AI 호출',
      'adm.gameCalls': '게임 진행',
      'adm.gameCallsDesc': 'AI GM 호출',
      'adm.bar': '{day} · 방문자 {visitors} · 진입 {pages} · 사용자 {users}',
      'adm.totals':
        '누적 — 가입자 {users}명 · 공개 작품 {publicEntries}개(전체 {published}) · ' +
        '챗 이용자 {chats}명 · 게임 이용자 {games}명 · 신고 대기 {reported}건',
      'adm.byModel': ' / 오늘 모델별 호출 — {ai}',
      'adm.noReports': '신고된 항목이 없습니다.',
      'adm.reportCount': '🚩 {n}건 · {title}',
      'adm.by': 'by {owner} · {vis}',
      'adm.blockedSuffix': ' · 차단됨',
      'adm.noReason': '(사유 없음)',
      'adm.unblock': '차단 해제',
      'adm.block': '차단',
      'adm.blockAsk': '"{title}"을(를) 차단할까요? 비공개로 내려가고 재공개가 막힙니다.',
      'adm.deleteAsk': '"{title}"을(를) 완전히 삭제할까요? 되돌릴 수 없습니다.',
      'adm.ignore': '신고 무시',
    },

    en: {
      'lang.other': '한국어',
      'lang.switchTitle': 'Switch the interface to Korean',
      'lang.badge.ko': 'Korean original',
      'lang.badge.en': 'English',

      // ── common ──
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.save': 'Save',
      'common.apply': 'Apply',
      'common.delete': 'Delete',
      'common.prev': 'Back',
      'common.next': 'Next',
      'common.optional': '(optional)',
      'common.requestFailed': 'Request failed',
      'common.authOriginFailed': 'Could not reach the login server.',
      'common.default': 'default',
      'common.defaultValue': 'Default',
      'common.none': '(none)',
      'common.empty': '(empty)',
      'common.notYet': '(none yet)',

      // ── auth · landing ──
      'auth.title': '🎲 AI GM Solo Dungeon World',
      'auth.subtitle.login': 'Sign in and start your adventure',
      'auth.subtitle.signup': 'Create an account to begin',
      'auth.id': 'Username',
      'auth.idPlaceholder': '3–20 letters, digits or underscores',
      'auth.pw': 'Password',
      'auth.pwPlaceholder': '6 characters or more',
      'auth.consent':
        'I am 14 or older and agree to the ' +
        '<a href="https://elcherlab.com/terms.html" target="_blank" rel="noopener">Terms of Service</a> and ' +
        '<a href="https://elcherlab.com/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.',
      'auth.login': 'Sign in',
      'auth.signup': 'Sign up',
      'auth.noAccount': "Don't have an account?",
      'auth.hasAccount': 'Already have an account?',
      'auth.needConsent': 'Please confirm you are 14 or older and accept the terms.',
      'auth.terms': 'Terms',
      'auth.privacy': 'Privacy',
      'auth.myAccount': 'My account',

      'home.title': '🎲 AI GM',
      'home.subtitle': 'What would you like to do?',
      'home.game': 'Dungeon World',
      'home.gameDesc': 'A solo TRPG with the AI as game master. Dice, HP and items are handled by the rules engine.',
      'home.chat': 'Character Chat',
      'home.chatDesc': 'Build your own world and characters and talk freely. Play worlds other people published, too.',

      'meta.title.landing': 'AI GM · Dungeon World & Character Chat',
      'meta.title.play': 'AI GM Dungeon World',
      'meta.title.chat': 'Character Chat',

      // ── user bar ──
      'bar.home': 'Home',
      'bar.game': '🎲 Game',
      'bar.gameTitle': 'AI GM Dungeon World',
      'bar.chat': '💬 Chat',
      'bar.chatTitle': 'Character Chat',
      'bar.profile': 'My profile',
      'bar.settings': '⚙ Settings',
      'bar.settingsTitle': 'Settings',
      'bar.logout': 'Sign out',

      'legacy.notice':
        'The old address (ai-gm.duckdns.org) stops working on August 7. ' +
        'Please update your bookmark to gm.elcherlab.com.',

      // ── settings modal ──
      'set.title': '⚙ Settings',
      'set.sub':
        'Register <b>your own API key</b> for each provider (stored encrypted, never shown to anyone else). ' +
        'The provider and model you pick here are the <b>defaults for new games</b>; each game can use a different model via the 🧠 button.',
      'set.provider': 'AI provider',
      'set.baseUrl': 'Endpoint URL',
      'set.baseUrlPlaceholder': 'e.g. http://host:11434/v1',
      'set.baseUrlHelp':
        'An address serving an OpenAI-compatible <code>/chat/completions</code>. It must be <b>reachable from this server</b> — an Ollama on your own PC at localhost cannot be reached from here.',
      'set.model': 'Model',
      'set.modelOpt': '(leave blank for the default)',
      'set.apiKey': 'API key',
      'set.keyPlaceholder': 'Paste your key (only when changing it)',
      'set.keyFreePlaceholder': 'The free trial needs no key',
      'set.keyRegistered': '(registered — enter only to change)',
      'set.keyMissing': '(not registered)',
      'set.keyIssue': 'Get a key: {url} · {note}',
      'set.firstTime':
        'You need an AI API key before you can start a game. The guide below shows how to get one without a credit card.',
      'set.needXferConsent': 'To register an API key, please tick the overseas-transfer consent.',

      'set.xfer.title': '🌏 Consent to overseas transfer (required to register a key)',
      'set.xfer.lead':
        'Once a key is registered, the following is sent abroad to the AI provider you chose every time you use an AI feature.',
      'set.xfer.items':
        '<b>What is transferred</b> — your messages, world and character settings, prior conversation context, and the registered API key',
      'set.xfer.who':
        '<b>Recipients and countries</b> — United States (Google, Anthropic, OpenAI, xAI), China (DeepSeek), Singapore and others (Alibaba Cloud). For a custom endpoint, whoever operates the address you entered',
      'set.xfer.when': '<b>When and how</b> — on every AI call, over an encrypted connection (TLS)',
      'set.xfer.why':
        '<b>Purpose and retention</b> — generating the AI response. Once sent, storage and use follow each provider’s own policy and are outside this operator’s control',
      'set.xfer.optout':
        '<b>How to refuse</b> — nothing is transferred if you do not consent or if you delete your key. Only AI features stop working; your account and the other services are unaffected',
      'set.xfer.need':
        '<b>You already have a key registered.</b> To keep using AI features, please consent below and save. ' +
        'If you would rather not, simply leave it — nothing will be transferred.',
      'set.xfer.agree':
        'I consent to the overseas transfer described above — ' +
        '<a href="https://elcherlab.com/privacy.html#s6" target="_blank" rel="noopener">Privacy Policy, chapter 7</a>',

      'set.disclaimer.title': '⚠️ Disclaimer',
      'set.disclaimer.body':
        'This is a non-commercial hobby project built by one person. All usage of the API key you register, and every ' +
        'charge arising from it, is entirely your own responsibility. Keys are stored encrypted, but the operator makes ' +
        'no warranty of any kind as to the security, integrity or availability of your data. The operator accepts no ' +
        'legal liability for any direct or indirect damage — billing, data loss, account or key exposure, service ' +
        'interruption — arising from use of this service. If you do not agree, please do not register an API key. ' +
        'Registering a key and playing are taken as acceptance of the above.',

      // ── providers · key guides ──
      'prov.gemini': 'Google Gemini (free tier available)',
      'prov.anthropic': 'Anthropic Claude',
      'prov.openai': 'OpenAI (GPT)',
      'prov.deepseek': 'DeepSeek (cheap)',
      'prov.xai': 'xAI Grok',
      'prov.qwen': 'Qwen (Alibaba)',
      'prov.custom': 'Custom (Ollama / OpenAI-compatible)',
      'prov.free': 'Free trial (server AI · no key · slow)',
      'provLabel.custom': 'Custom',
      'provLabel.free': 'Free trial',

      'key.gemini.note': 'free key available (no card needed)',
      'key.anthropic.note': 'paid (prepaid credits)',
      'key.openai.note': 'paid',
      'key.deepseek.note': 'paid (inexpensive)',
      'key.xai.note': 'paid',
      'key.qwen.note': 'paid (free credits for new accounts)',
      'key.custom.url': 'Ollama / LM Studio etc.',
      'key.custom.note': 'self-hosted endpoints may need no key (leave it blank)',
      'key.free.url': 'no key needed',
      'key.free.note': "free trial on this server's local AI (slow, rate-limited)",

      'guide.gemini.title': '<b>🔑 Getting a Gemini key — about a minute</b>',
      'guide.gemini.s1':
        'Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> and sign in with your Google account',
      'guide.gemini.s2': 'Click <b>“Create API key”</b> (no payment card required)',
      'guide.gemini.s3': 'Copy the key, paste it into the <b>API key</b> box above and save',
      'guide.generic': '<b>🔑 Getting a key</b><br />Create one at {url}, paste it into the box above and save. ({note})',
      'guide.geminiFreeTier':
        'ℹ️ With a Google free-tier key, what you send and receive may be used to improve Google products and may be ' +
        'reviewed by humans. Do not enter sensitive personal information. ' +
        '(A paid-tier key, billed to your own Google account, is not used for training.)',

      'free.notice.title': '<b>⚠️ About the free trial</b>',
      'free.notice.lead':
        'This runs on a <b>small local AI</b> installed on this server. No API key needed, but note the limits below.',
      'free.notice.slow': '<b>Slow</b> — it infers on CPU, so a single reply can take tens of seconds.',
      'free.notice.limit': '<b>Rate-limited</b> — one person at a time, up to {n} replies per hour.',
      'free.notice.quality':
        '<b>Lower quality</b> — being a small model, it may break tone or format and miss parts of your setup. The longer the world, the more so.',
      'free.notice.trial': '<b>Trial only</b> — it may stop or change model without notice.',
      'free.notice.tail':
        'For the real experience we recommend <b>registering your own API key</b> (even Gemini’s free tier is much faster and better).',
      'free.notice.local': '✅ Nothing is sent to an outside company — it is all processed on this server.',
      'free.offMessage':
        'The free trial (server AI) is currently discontinued. Pick another AI provider in ⚙ Settings and register an API key. ' +
        '(Google Gemini hands out free keys without a card: aistudio.google.com/apikey)',
      'free.off.title': '<b>⚠️ The free trial has been discontinued</b>',
      'free.off.body':
        'The server AI behind the free trial has been taken down, so it is unavailable. ' +
        'Pick <b>another AI provider</b> below and register <b>your own API key</b> to keep playing.',
      'free.off.gemini':
        '✅ Google Gemini gives out free keys without a card — ' +
        '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>',

      // ── model modal ──
      'gm.title': '🧠 AI model for this game',
      'gm.sub':
        'Each game can use a different model, and you can change it <b>mid-game</b>. API keys are registered per provider in ⚙ Settings.',
      'gm.fetchModels': '📋 Load available models',
      'gm.testModel': '🔌 Test connection',
      'gm.lengthLabel': 'Reply length',
      'gm.lengthOpt': '(this conversation only)',
      'gm.lengthDefault': "Follow the creator's recommendation",
      'gm.lengthDefaultWith': "Follow the creator's recommendation ({label})",
      'gm.modelsHint': "{n} suggested models are ready (click the model box). With a key, “Load” shows your account's actual list.",
      'gm.modelsHintEmpty': 'Type a model name.',
      'gm.loading': 'Loading…',
      'gm.modelsFound': '{n} models available — click the model box to see the list.',
      'gm.modelsNone': 'No models available.',
      'gm.testing': 'Testing connection…',
      'gm.testOk': '✅ Connected (reply: {sample})',
      'gm.keyFree': "No key needed — you play on the server's local AI.",
      'gm.keyReady': '{prov} key registered ✓',
      'gm.keyMissing': '⚠ No {prov} key. Register one in <b>⚙ Settings</b> first{extra}.',
      'gm.keyMissingCustom': ' (for Custom, the endpoint URL)',
      'gm.buttonTitle': 'Change the AI model for this game',
      'gm.buttonLabel': 'Model',

      'len.veryshort': 'Very short',
      'len.short': 'Short',
      'len.medium': 'Medium',
      'len.long': 'Long',
      'len.verylong': 'Very long',
      'len.opt.veryshort': 'Very short (1–2 sentences · messenger style)',
      'len.opt.short': 'Short (2–4 sentences)',
      'len.opt.medium': 'Medium (1–2 paragraphs)',
      'len.opt.long': 'Long (3–4 paragraphs)',
      'len.opt.verylong': 'Very long (250–300 words · prose style)',

      // ── thinking indicator ──
      'think.elapsed': '{frame} {base}… {sec}s',
      'think.freeSlow': ' · the free trial (local server AI) is slow. It is working normally.',
      'think.slow': ' · this is taking longer than usual.',

      // ── dungeon world: character creation ──
      'play.title': '🎲 AI GM Solo Dungeon World',
      'play.subtitle': 'Build a character sheet and start your adventure',
      'play.step1': '1 · Class',
      'play.step2': '2 · Stats',
      'play.step3': '3 · Gear',
      'play.step4': '4 · Finish',
      'play.pickClass': 'Choose a class',
      'play.assignStats': 'Assign stats',
      'play.modeRecommend': 'Recommended',
      'play.modeCustom': 'Assign myself',
      'play.recommendHint': 'Recommended stats for the {cls}.',
      'play.customOk': 'Valid spread. (standard array)',
      'play.customBad': 'Use exactly the standard array: {parts}',
      'play.startGear': 'Choose starting gear',
      'play.gearCount': '({n}/{max})',
      'play.gearHint': 'On top of your base gear, pick 2 below.',
      'play.gearPickHint': 'Pick one weapon, one armor and one extra. Your armor rating depends on the armor you choose.',
      'play.baseGear': '<span class="bg-label">Base gear:</span> {list}',
      'play.currentArmor': 'Current armor: {n}',
      'play.learnable': 'Moves this class can learn',
      'play.learnableHint': 'On level-up you learn one of the moves below.',
      'play.charName': 'Character name',
      'play.charNamePlaceholder': 'e.g. Arin',
      'play.charLook': 'One-line description',
      'play.charLookPlaceholder': 'e.g. a taciturn mercenary in battered armor',
      'play.charLookHint': 'Looks, personality and background here get woven into the GM’s opening scene.',
      'play.start': 'Begin the adventure',

      'sheet.weaponTags': 'Weapon tags',
      'sheet.class': 'Class',
      'sheet.hp': 'HP',
      'sheet.armor': 'Armor',
      'sheet.damage': 'Damage',
      'sheet.stats': 'Stats',
      'sheet.gear': 'Gear',
      'sheet.learnMoves': 'Learnable moves',

      // ── dungeon world: game screen ──
      'game.enemies': '⚔️ Enemies',
      'game.companions': '🤝 Allies',
      'game.noEnemies': '(no enemies)',
      'game.noCompanions': '(no allies)',
      'game.thinking': 'The GM is spinning the tale',
      'game.suggest': '💡 Ideas',
      'game.suggestTitle': 'Suggest actions',
      'game.inputPlaceholder': 'Describe your action. e.g. sneak up behind the goblin',
      'game.send': 'Send',
      'game.newGame': '＋ New game',
      'game.newGameTitle': 'Create a new save slot',
      'game.charTitle': 'Character',
      'game.armorText': 'Armor {n}',
      'game.coin': '💰 Coin',
      'game.inventory': 'Inventory',
      'game.moves': 'Moves learned',
      'game.weapon': 'Weapon',
      'game.rolling': 'Rolling the dice…',
      'game.dead': 'Your character has died — start a new game for a new adventure.',
      'game.slotEmpty': 'Empty slot (new adventure)',
      'game.slotSwitch': 'Switch to this game',
      'game.slotDelete': 'Delete this game',
      'game.slotDeleteAsk': 'Delete {name}? This cannot be undone.',
      'game.slotThis': 'this game',
      'game.slotThisEmpty': 'this empty slot',
      'game.slotMax': 'Up to {max} games can be saved',
      'game.adventurer': 'Adventurer',
      'game.stopped': ' · ⚠ stopped',
      'game.noKey': ' · ⚠ no key',

      'lu.title': '⭐ Level up!',
      'lu.sub': 'Choose how you grow.',
      'lu.stat': 'Stat +1',
      'lu.move': 'Learn a new move',
      'lu.confirm': 'Confirm',
      'lu.statMax': 'Every stat is already at maximum.',
      'lu.moveMax': 'There are no more moves to learn.',

      // ── character chat: gallery ──
      'gal.title': '🌐 Browse',
      'gal.subtitle': 'Play worlds and characters other people published — each in your own private conversation.',
      'gal.sortRecent': 'Newest',
      'gal.sortLikes': 'Most liked',
      'gal.sortPlays': 'Most played',
      'gal.tagAll': 'All',
      'gal.emptyMine': "You haven't published anything yet.",
      'gal.emptyAll': 'Nothing published yet. Be the first!',
      'gal.plays': '{n} plays',
      'gal.play': 'Play',
      'gal.detail': '💬 Details',
      'gal.detailTitle': 'Tags, likes and comments',
      'gal.report': '🚩 Report',
      'gal.reportTitle': 'Report inappropriate content',
      'gal.reportAsk': 'Why are you reporting "{title}"?',
      'gal.reported': 'Your report has been received. ({n} total)',
      'gal.unpublish': 'Unpublish',
      'gal.unpublishAsk': 'Unpublish "{title}"? It will disappear from the gallery.',
      'gal.charCount': '{n} characters',
      'gal.imageCount': '{n} images',

      'vis.private': '🔒 Private',
      'vis.link': '🔗 Link only',
      'vis.public': '🌐 Public',

      'dt.title': 'Work',
      'dt.like': '♥ Like',
      'dt.play': 'Play',
      'dt.comments': 'Comments',
      'dt.commentPlaceholder': 'Write a comment',
      'dt.commentSend': 'Post',
      'dt.noComments': 'No comments yet.',
      'dt.commentDeleteAsk': 'Delete this comment?',

      // ── character chat: my chats ──
      'chats.title': '💬 My chats',
      'chats.subtitle': 'Pick up where you left off with a saved character.',
      'chats.empty': 'No characters yet. Play a world you like from Browse, or make your own.',
      'chats.new': '＋ New character',
      'chats.max': 'Up to {max} characters can be saved',
      'chats.deleteThis': 'Delete this character',
      'chats.deleteAsk': 'Delete "{name}"? The conversation goes with it.',
      'chats.thisChar': 'this character',
      'chats.unnamed': 'Unnamed character',
      'chats.mine': 'My chat',

      // ── character chat: conversation ──
      'chat.back': 'Back to list',
      'chat.edit': 'Edit character settings',
      'chat.thinking': 'Typing',
      'chat.typing': 'Typing',
      'chat.inputPlaceholder': 'Type a message…',
      'chat.send': 'Send',
      'chat.sceneImage': 'Scene image',

      // ── character chat: create ──
      'cp.titleNew': '💬 Create a character · world',
      'cp.titleEdit': '💬 Edit character · world',
      'cp.subtitle': 'Build your own world and cast. At least one character is required.',
      'cp.title': 'Title',
      'cp.titleOpt': '(optional · shown in lists)',
      'cp.titlePlaceholder': 'e.g. The Academy in the Mist',
      'cp.lore': 'World setting',
      'cp.loreOpt': '(optional · useful with several characters)',
      'cp.lorePlaceholder': 'Setting, rules, atmosphere…',
      'cp.characters': 'Cast *',
      'cp.addChar': '＋ Add character',
      'cp.charName': 'Character {n} name',
      'cp.charDesc': 'Personality · voice · looks · background',
      'cp.charDelete': 'Remove this character',
      'cp.images': 'Images',
      'cp.imagesOpt': '(optional · tag them and the AI shows them when they fit)',
      'cp.addImage': '＋ Add image',
      'cp.imageHint': 'png/jpg/webp/gif up to 2MB, 16 max. Example tags: <b>luna-smiling</b>, <b>night tower</b>, <b>battle</b>',
      'cp.imageAlt': 'Image',
      'cp.imageTag': 'Tag (e.g. luna-smiling)',
      'cp.imageWhen': 'When to show it (optional)',
      'cp.coverOn': '★ Cover',
      'cp.coverOff': '☆ Cover',
      'cp.coverOnTitle': 'Set as cover — press again to go back to automatic',
      'cp.coverOffTitle': 'Use as the cover image on the gallery card',
      'cp.imageRemove': 'Remove this image',
      'cp.coverHintPicked': 'The ★ image is used on the gallery card.',
      'cp.coverHintAuto': 'With no cover chosen, a scene shot is picked automatically from your images.',
      'cp.uploadFailed': 'Image upload failed: {msg}',
      'cp.scenario': 'Opening situation / scenario',
      'cp.scenarioPlaceholder': 'The first scene — where and how it starts',
      'cp.greeting': 'Opening line',
      'cp.greetingPlaceholder': 'The scene or line shown when the conversation opens',
      'cp.persona': 'My persona',
      'cp.personaPlaceholder': 'How the other side sees “me” (name, relationship…)',
      'cp.tags': 'Genre · tags',
      'cp.tagsOpt': '(optional · comma separated, 6 max)',
      'cp.tagsPlaceholder': 'e.g. fantasy, mystery, noir',
      'cp.length': 'Recommended reply length',
      'cp.lengthOpt': '(each player can override it)',
      'cp.visibility': 'Visibility',
      'cp.visPrivate': '🔒 Private (only me)',
      'cp.visLink': '🔗 Anyone with the link',
      'cp.visPublic': '🌐 Public (listed in the gallery)',
      'cp.publishHint': 'Once public, others can play it in their own private conversation.',
      'cp.publishApply': 'Apply',
      'cp.published': '{vis} · played {n} times',
      'cp.shareLink': 'Share link: <b>{link}</b>',
      'cp.save': 'Save and start chatting',
      'cp.needChar': 'At least one named character is required.',
      'cp.needCharDesc': 'Please describe each character.',
      'cp.needCharPublish': 'Publishing requires at least one named character.',

      'tag.판타지': 'Fantasy',
      'tag.로맨스': 'Romance',
      'tag.미스터리': 'Mystery',
      'tag.호러': 'Horror',
      'tag.학원': 'School',
      'tag.무협': 'Wuxia',
      'tag.일상': 'Slice of life',
      'tag.느와르': 'Noir',
      'tag.코미디': 'Comedy',
      'tag.SF': 'Sci-Fi',
      'tag.힐링': 'Cozy',
      'tag.범죄': 'Crime',

      // ── character chat: profile ──
      'prof.title': '👤 My profile',
      'prof.sub': 'Published by {name}.',
      'prof.mine': 'What I published',
      'prof.works': 'works',
      'prof.likes': '♥ likes',
      'prof.plays': 'plays',
      'prof.comments': 'comments',
      'prof.other': 'Other services',
      'prof.toPlay': 'Go to AI GM Dungeon World',
      'prof.toHome': 'Service picker',
      'prof.account': 'Account',
      'prof.settings': 'Settings · API key',
      'prof.logout': 'Sign out',

      // ── tab bar ──
      'tab.home': 'Browse',
      'tab.chats': 'My chats',
      'tab.create': 'Create',
      'tab.profile': 'Profile',
      'tab.aria': 'Main screens',

      // ── admin ──
      'adm.stats': '📊 Traffic',
      'adm.only': '(admin only)',
      'adm.statsHint': 'Korea time. Visitors are counted from irreversibly hashed IPs.',
      'adm.reports': '🛡 Reports',
      'adm.reportsHint': 'Reported items. Review and act.',
      'adm.visitors': 'Visitors',
      'adm.visitorsDesc': 'distinct visitors today',
      'adm.pages': 'Page views',
      'adm.pagesDesc': 'landing / game / chat pages opened',
      'adm.users': 'Active users',
      'adm.usersDesc': 'signed-in people who actually used it',
      'adm.signups': 'Sign-ups',
      'adm.signupsDesc': 'accounts created today',
      'adm.chatCalls': 'Chat replies',
      'adm.chatCallsDesc': 'Character Chat AI calls',
      'adm.gameCalls': 'Game turns',
      'adm.gameCallsDesc': 'AI GM calls',
      'adm.bar': '{day} · visitors {visitors} · views {pages} · users {users}',
      'adm.totals':
        'All time — {users} members · {publicEntries} public works (of {published}) · ' +
        '{chats} chat users · {games} game users · {reported} reports pending',
      'adm.byModel': ' / calls by model today — {ai}',
      'adm.noReports': 'No reported items.',
      'adm.reportCount': '🚩 {n} · {title}',
      'adm.by': 'by {owner} · {vis}',
      'adm.blockedSuffix': ' · blocked',
      'adm.noReason': '(no reason given)',
      'adm.unblock': 'Unblock',
      'adm.block': 'Block',
      'adm.blockAsk': 'Block "{title}"? It drops to private and cannot be republished.',
      'adm.deleteAsk': 'Permanently delete "{title}"? This cannot be undone.',
      'adm.ignore': 'Dismiss reports',
    },
  };

  // ---------- 언어 결정 ----------
  function stored() {
    try {
      const v = localStorage.getItem(STORE_KEY);
      return LANGS.includes(v) ? v : null;
    } catch (_) {
      return null; // 사파리 프라이빗 모드 등 — 저장 못 해도 동작은 해야 한다
    }
  }

  /**
   * 우선순위: ?lang= → 저장값 → 브라우저 언어 → 한국어.
   * 링크 파라미터는 저장까지 한다(서브도메인끼리 쿠키 대신 링크로 넘기므로,
   * 한 번 넘어오면 그 뒤로는 그대로 유지돼야 한다).
   */
  function initialLang() {
    let fromLink = null;
    try {
      fromLink = new URLSearchParams(location.search).get('lang');
    } catch (_) {}
    if (LANGS.includes(fromLink)) {
      save(fromLink);
      return fromLink;
    }
    const s = stored();
    if (s) return s;
    const nav = (navigator.language || '').toLowerCase();
    return nav.startsWith('ko') ? 'ko' : nav ? 'en' : SOURCE;
  }

  function save(lang) {
    try {
      localStorage.setItem(STORE_KEY, lang);
    } catch (_) {}
  }

  let lang = initialLang();

  // ---------- 번역 ----------
  function fill(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }

  /** 사전에서 찾는다. 없으면 원문(ko), 그것도 없으면 키 자체. */
  function t(key, vars) {
    const table = DICT[lang] || DICT[SOURCE];
    const raw = key in table ? table[key] : DICT[SOURCE][key];
    return fill(raw === undefined ? key : raw, vars);
  }

  /**
   * 사전에 없으면 주어진 원문을 그대로 쓴다.
   * 던전 월드 데이터처럼 서버가 한국어 원문을 내려주는 값에 쓴다 —
   * 번역이 준비된 항목만 갈아끼우고 나머지는 원문이 나온다.
   */
  function tOr(key, fallback) {
    const table = DICT[lang] || DICT[SOURCE];
    if (key in table) return table[key];
    return fallback;
  }

  // ---------- 정적 마크업 적용 ----------
  /**
   * data-i18n           → textContent
   * data-i18n-html      → innerHTML (링크가 들어간 문구용)
   * data-i18n-ph        → placeholder
   * data-i18n-title     → title
   * data-i18n-aria      → aria-label
   */
  const ATTRS = [
    ['data-i18n', (el, v) => (el.textContent = v)],
    ['data-i18n-html', (el, v) => (el.innerHTML = v)],
    ['data-i18n-ph', (el, v) => el.setAttribute('placeholder', v)],
    ['data-i18n-title', (el, v) => el.setAttribute('title', v)],
    ['data-i18n-aria', (el, v) => el.setAttribute('aria-label', v)],
  ];

  function apply(root) {
    const scope = root || document;
    ATTRS.forEach(([attr, set]) => {
      scope.querySelectorAll('[' + attr + ']').forEach((el) => {
        set(el, t(el.getAttribute(attr)));
      });
    });
    if (scope === document || scope === document.body) {
      document.documentElement.setAttribute('lang', lang);
      const titleKey = document.documentElement.getAttribute('data-i18n-doctitle');
      if (titleKey) document.title = t(titleKey);
    }
  }

  /**
   * 언어를 바꾼다. 정적 문구는 즉시 갈아끼우고, 동적으로 그린 목록은
   * 'i18n:change' 를 듣는 페이지가 다시 그린다.
   *
   * 대화 로그·세계관 본문은 다시 그리지 않는다 — 사용자가 쓴 원문이자 저장값이다.
   */
  function setLang(next) {
    if (!LANGS.includes(next) || next === lang) return;
    lang = next;
    save(next);
    apply(document);
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
  }

  /** 다른 elcherlab 서브도메인으로 넘어갈 때 언어를 물려주는 링크. */
  function withLang(href) {
    try {
      const u = new URL(href, location.origin);
      u.searchParams.set('lang', lang);
      return u.origin === location.origin ? u.pathname + u.search + u.hash : u.toString();
    } catch (_) {
      return href;
    }
  }

  window.I18N = {
    LANGS,
    t,
    tOr,
    apply,
    setLang,
    withLang,
    get lang() {
      return lang;
    },
    other() {
      return lang === 'ko' ? 'en' : 'ko';
    },
  };
  window.t = t;
})();
