'use strict';

const path = require('path');
const publish = require('./publish');
const chat = require('./chat');
const uploads = require('./uploads');
const auth = require('./auth');

/** 저장소에 포함된 샘플 이미지 → 고정 id로 등록해 정의에 넣는다. */
const SAMPLE_IMAGES = [
  {
    id: '5a11e0ba51a00001',
    file: 'harbor.png',
    tag: '안개 부두',
    description: '부두·항구 야외 장면',
  },
  {
    id: '5a11e0ba51a00002',
    file: 'lighthouse.png',
    tag: '등대',
    description: '등대가 보이거나 등대로 향할 때',
  },
  {
    id: '5a11e0ba51a00003',
    file: 'tavern.png',
    tag: '젖은 등불',
    description: '선술집 실내 장면',
  },
  {
    id: '5a11e0ba51a00004',
    file: 'nightsea.png',
    tag: '밤바다',
    description: '밤바다·파도·검은 수면',
  },
  {
    id: '5a11e0ba51a00005',
    file: 'lian.png',
    tag: '리안',
    description: '리안이 대화의 중심일 때',
  },
  {
    id: '5a11e0ba51a00006',
    file: 'marta.png',
    tag: '마르타',
    description: '마르타가 대화의 중심일 때',
  },
  {
    id: '5a11e0ba51a00007',
    file: 'seren.png',
    tag: '세렌',
    description: '세렌이 대화의 중심일 때',
  },
  {
    id: '5a11e0ba51a00008',
    file: 'seasong.png',
    tag: '바다의 노래',
    description: '바다의 노래가 들리거나 홀리는 순간',
  },
  {
    id: '5a11e0ba51a00009',
    file: 'ghostship.png',
    tag: '사라진 배',
    description: '실종된 배·유령선이 나올 때',
  },
];

/**
 * 갤러리 샘플 세계관을 최초 1회만 등록한다.
 * 사용자가 나중에 지우면 seeded 플래그 때문에 다시 생기지 않는다.
 * (지우려면 data/published.json 에서 해당 entries 항목만 삭제하면 된다.)
 */

const SEED_KEY = 'sampleV1';
// v1은 배경 4장까지만 넣었다. 인물·연출 5장을 추가하려면 새 키가 필요하다.
const IMAGE_SEED_KEY = 'sampleImagesV2';
const OWNER_SEED_KEY = 'sampleOwnerV1';
const SAMPLE_ID_KEY = 'sampleEntryId'; // 소유권이 바뀌어도 샘플을 찾기 위한 id 기록
const DESC_SEED_KEY = 'sampleImageDescV1'; // 겹치던 태그 설명 정정
// 샘플을 넘겨줄 실제 계정 아이디 (.env의 SAMPLE_OWNER로 변경 가능)
const SAMPLE_OWNER = process.env.SAMPLE_OWNER || 'elcher';

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

/**
 * 샘플 공개 항목을 찾는다. 소유권이 실제 계정으로 넘어간 뒤에도 찾을 수 있도록
 * 기록해둔 id → 제목 → 대표 이미지 id 순으로 시도한다.
 */
function findSampleEntry() {
  const all = publish.listAll();
  const savedId = publish.getSeed(SAMPLE_ID_KEY);
  let e = savedId && all.find((x) => x.id === savedId);
  if (e) return e;
  e = all.find((x) => x.def && x.def.worldTitle === SAMPLE_DEF.worldTitle);
  if (e) return e;
  return all.find(
    (x) => x.def && (x.def.images || []).some((im) => im.id === SAMPLE_IMAGES[0].id)
  );
}

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
  importSampleImages(); // 파일은 매번 확인(없거나 바뀌었으면 복사)
  ensureSampleEntry(); // 등록 / 이미지 back-fill
  refreshImageDescriptions(); // 태그 설명 정정(겹치는 설명이 오작동을 유발했음)
  transferSampleOwner(); // 실제 계정으로 소유권 이관
}

/**
 * 샘플 이미지의 태그 설명을 최신값으로 한 번 갱신한다.
 * 초기 설명이 서로 겹쳐서("선술집…마르타와 대화할 때") AI가 인물 태그 대신
 * 장소 이미지를 계속 고르는 문제가 있었다. 다른 필드는 건드리지 않는다.
 */
function refreshImageDescriptions() {
  try {
    if (publish.hasSeed(DESC_SEED_KEY)) return;
    const entry = findSampleEntry();
    if (!entry || !entry.def) return;
    const canon = new Map(SAMPLE_IMAGES.map((im) => [im.id, im]));
    let changed = 0;
    const images = (entry.def.images || []).map((im) => {
      const c = canon.get(im.id);
      if (!c || (im.tag === c.tag && im.description === c.description)) return im;
      changed++;
      return { id: im.id, tag: c.tag, description: c.description };
    });
    if (!changed) {
      publish.markSeed(DESC_SEED_KEY);
      return;
    }
    publish.publish({
      pubId: entry.id,
      ownerId: entry.ownerId,
      ownerName: entry.ownerName,
      def: chat.normalizeDef({ ...entry.def, images }),
      visibility: entry.visibility,
      title: entry.title,
    });
    publish.markSeed(DESC_SEED_KEY);
    console.log('🏷️  샘플 이미지 태그 설명', changed, '건을 정정했습니다.');
  } catch (e) {
    console.error('샘플 태그 설명 갱신 실패:', e.message);
  }
}

/** 샘플 공개 항목을 등록하거나, 이미지가 빠져 있으면 채운다. */
function ensureSampleEntry() {
  try {
    // 1) 최초 등록
    if (!publish.hasSeed(SEED_KEY)) {
      const def = chat.normalizeDef(SAMPLE_DEF);
      if (!chat.isConfigured(def)) return;
      const created = publish.publish({
        ownerId: '__sample__',
        ownerName: '샘플',
        def,
        visibility: 'public',
        title: def.worldTitle,
      });
      publish.markSeed(SEED_KEY);
      publish.markSeed(SAMPLE_ID_KEY, created.id);
      console.log('🌐 갤러리 샘플 세계관을 등록했습니다:', def.worldTitle);
      return;
    }

    // 2) 샘플에 빠진 이미지가 있으면 채워 넣는다(소유권이 넘어간 뒤에도 동작).
    //    사용자가 편집했을 수 있으므로 없는 것만 더하고 나머지는 건드리지 않는다.
    if (publish.hasSeed(IMAGE_SEED_KEY)) return;
    const entry = findSampleEntry();
    if (!entry) return;
    const have = new Set(((entry.def && entry.def.images) || []).map((im) => im.id));
    const missing = SAMPLE_IMAGES.filter((im) => !have.has(im.id));
    if (!missing.length) {
      publish.markSeed(IMAGE_SEED_KEY);
      return;
    }
    const def = chat.normalizeDef({
      ...entry.def,
      images: [
        ...((entry.def && entry.def.images) || []),
        ...missing.map((im) => ({ id: im.id, tag: im.tag, description: im.description })),
      ],
    });
    publish.publish({
      pubId: entry.id,
      ownerId: entry.ownerId,
      ownerName: entry.ownerName,
      def,
      visibility: entry.visibility,
      title: entry.title,
    });
    publish.markSeed(IMAGE_SEED_KEY);
    console.log('🖼️  샘플 세계관에 이미지', missing.length, '장을 추가했습니다(총', def.images.length + '장).');
  } catch (e) {
    console.error('갤러리 샘플 등록 실패:', e.message);
  }
}

/** 샘플의 소유자를 '__sample__' → 실제 계정으로 이관(계정이 생긴 뒤 최초 1회). */
function transferSampleOwner() {
  try {
    if (publish.hasSeed(OWNER_SEED_KEY)) return;
    const owned = publish.listMine('__sample__');
    if (!owned.length) return;
    const user = auth.findByUsername(SAMPLE_OWNER);
    if (!user) return; // 계정이 아직 없으면 다음 기동 때 재시도
    owned.forEach((s) => publish.transferOwner(s.id, user.id, user.username));
    publish.markSeed(OWNER_SEED_KEY);
    console.log(`👤 샘플 세계관 소유자를 '${user.username}' 계정으로 이관했습니다.`);
  } catch (e) {
    console.error('샘플 소유자 이관 실패:', e.message);
  }
}

module.exports = { seed };
