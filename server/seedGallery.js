'use strict';

const path = require('path');
const publish = require('./publish');
const chat = require('./chat');
const uploads = require('./uploads');

/** 저장소에 포함된 샘플 이미지 → 고정 id로 등록해 정의에 넣는다. */
const SAMPLE_IMAGES = [
  {
    id: '5a11e0ba51a00001',
    file: 'harbor.png',
    tag: '안개 부두',
    description: '부두·항구 야외 장면. 도착하거나 배를 보거나 리안과 부두에서 대화할 때',
  },
  {
    id: '5a11e0ba51a00002',
    file: 'lighthouse.png',
    tag: '등대',
    description: '등대가 언급되거나 등대로 향할 때, 등대 불빛의 비밀이 드러날 때',
  },
  {
    id: '5a11e0ba51a00003',
    file: 'tavern.png',
    tag: '젖은 등불',
    description: '선술집 안으로 들어가거나 마르타와 대화할 때',
  },
  {
    id: '5a11e0ba51a00004',
    file: 'nightsea.png',
    tag: '밤바다',
    description: '바다·바다의 노래·배의 실종 등 불길한 장면',
  },
];

/**
 * 갤러리 샘플 세계관을 최초 1회만 등록한다.
 * 사용자가 나중에 지우면 seeded 플래그 때문에 다시 생기지 않는다.
 * (지우려면 data/published.json 에서 해당 entries 항목만 삭제하면 된다.)
 */

const SEED_KEY = 'sampleV1';
const IMAGE_SEED_KEY = 'sampleImagesV1';

const SAMPLE_DEF = {
  worldTitle: '잿빛 항구, 세이렌',
  worldLore: `안개가 걷히지 않는 항구도시 "베일포트".
바다 밑에서 무언가가 노래하고, 보름이 가까워질수록 밤마다 배가 한 척씩 사라진다.
도시를 실질적으로 지배하는 것은 시의회가 아니라 '등대지기 길드'다. 그들은 불빛으로 배를 인도한다고 하지만,
어떤 배는 일부러 인도하지 않는다는 소문이 있다.
밀수, 오래된 주술, 침묵의 계약이 안개 속에 뒤엉켜 있다.
사람들은 바다의 노래를 들었다고 말하는 자를 피한다 — 그 사람은 곧 사라지기 때문이다.`,
  characters: [
    {
      name: '리안',
      description: `등대지기. 30대 후반, 소금기에 절은 코트와 굳은살 박인 손.
말수가 극도로 적고 감정을 드러내지 않는다. 필요한 말만 짧게, 단정적으로 한다.
도시에서 유일하게 "바다의 노래"를 직접 듣고도 살아남은 사람. 그 대가로 한쪽 귀가 들리지 않는다.
길드의 비밀을 알고 있지만 먼저 말하지 않는다. 신뢰를 얻으면 아주 조금씩 흘린다.
말투: 건조한 반말. "쓸데없는 걸 묻는군." "저 불빛은 배를 부르는 게 아니야."`,
    },
    {
      name: '마르타',
      description: `항구 선술집 '젖은 등불'의 주인. 40대, 넉살 좋고 능청스럽다.
도시의 모든 소문이 그녀를 거쳐 간다. 정보를 공짜로 주는 법은 없지만, 술값이나 재미있는 이야기면 충분하다.
겉으로는 유쾌하지만 위험한 화제가 나오면 순식간에 목소리를 낮춘다.
말투: 친근한 존댓말에 농담을 섞음. "어머, 그 얘긴 여기서 하면 안 되지." "한 잔 더 하고 말해요, 손님."`,
    },
    {
      name: '세렌',
      description: `보름 전 바다에서 떠밀려 온 정체불명의 소녀. 열대여섯쯤으로 보인다.
자기 이름 말고는 아무것도 기억하지 못한다. 젖은 머리는 아무리 말려도 마르지 않는다.
가끔 무의식적으로 낯선 선율을 흥얼거리는데, 그 노래를 들은 사람은 밤에 바다 꿈을 꾼다.
순수하고 겁이 많지만, 노래를 부를 때만은 전혀 다른 사람처럼 차분해진다.
말투: 조심스러운 존댓말, 자주 말끝을 흐림. "…저, 제가 여기 있어도 되나요?" "이 노래… 어디서 들었더라."`,
    },
  ],
  images: SAMPLE_IMAGES.map((im) => ({ id: im.id, tag: im.tag, description: im.description })),
  scenario: `당신은 반년 전 베일포트로 떠난 뒤 소식이 끊긴 형제를 찾아 이 도시에 막 도착한 외지인이다.
마지막 편지에는 이렇게 적혀 있었다. "등대 불빛이 이상해. 저건 우리를 부르는 게 아니야."
지금은 안개 낀 늦은 저녁. 부두에 발을 디딘 참이고, 저 멀리 등대가 느리게 회전하고 있다.`,
  greeting: `짠내와 비린내가 뒤섞인 안개가 얼굴에 달라붙는다. 부두의 판자가 발밑에서 삐걱거리고,
멀리 등대 불빛이 안개를 가르며 느리게 한 바퀴 돌아간다 — 그런데 그 리듬이, 어딘가 어긋나 있다.

부두 끝 창고 그늘에서 담배 불빛 하나가 붉게 타오른다. 코트 깃을 세운 남자가 당신을 오래 쳐다본다.

리안: "…처음 보는 얼굴이군. 오늘 밤엔 배가 안 떠. 여관을 찾는 거라면 저 골목 끝 '젖은 등불'로 가."

그가 턱짓한 방향에서, 노란 불빛이 새어 나오는 낡은 간판이 안개 속에 흔들린다.`,
  userPersona: '실종된 형제를 찾아 베일포트에 온 외지인. 이 도시에 연고도, 아는 사람도 없다.',
};

/** 샘플 이미지 파일을 uploads에 고정 id로 등록. */
function importSampleImages() {
  const dir = path.join(__dirname, '..', 'assets', 'sample');
  let n = 0;
  for (const im of SAMPLE_IMAGES) {
    if (uploads.importFile(path.join(dir, im.file), im.id, 'png')) n++;
  }
  return n;
}

function seed() {
  try {
    importSampleImages(); // 파일은 매번 확인(없으면 복사, 있으면 건너뜀)

    // 1) 최초 등록
    if (!publish.hasSeed(SEED_KEY)) {
      const def = chat.normalizeDef(SAMPLE_DEF);
      if (!chat.isConfigured(def)) return;
      publish.publish({
        ownerId: '__sample__',
        ownerName: '샘플',
        def,
        visibility: 'public',
        title: def.worldTitle,
      });
      publish.markSeed(SEED_KEY);
      console.log('🌐 갤러리 샘플 세계관을 등록했습니다:', def.worldTitle);
      return;
    }

    // 2) 이미 등록된 샘플에 이미지가 없으면 채워 넣는다(이미지 추가 배포 대응)
    if (publish.hasSeed(IMAGE_SEED_KEY)) return;
    const mine = publish.listMine('__sample__');
    if (!mine.length) return;
    const entry = publish.get(mine[0].id, '__sample__');
    if (!entry) return;
    const def = chat.normalizeDef({ ...entry.def, images: SAMPLE_DEF.images });
    publish.publish({
      pubId: entry.id,
      ownerId: '__sample__',
      ownerName: '샘플',
      def,
      visibility: entry.visibility,
      title: entry.title,
    });
    publish.markSeed(IMAGE_SEED_KEY);
    console.log('🖼️  샘플 세계관에 이미지', def.images.length, '장을 추가했습니다.');
  } catch (e) {
    console.error('갤러리 샘플 등록 실패:', e.message);
  }
}

module.exports = { seed };
