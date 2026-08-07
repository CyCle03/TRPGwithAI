# 샘플 세계관 이미지 — 생성 프롬프트

장르별 샘플 6종(`server/seedGallery.js` 의 `EXTRA_SAMPLES`)에 붙일 이미지의 생성 프롬프트다.
그림은 아직 없고, **파일만 만들어 넣으면 자동으로 붙는다.**

## 넣는 방법

1. 아래 프롬프트로 이미지를 만든다 (기존 샘플은 PixAI로 뽑았다).
2. **표에 적힌 파일명 그대로** `assets/sample/` 에 저장한다.
3. 서버를 재시작한다. `attachSampleImages()` 가 파일을 찾아 고정 id로 등록하고 해당 샘플에 붙인다.

코드는 고칠 필요 없다. 한 장만 만들어 넣어도 그 한 장만 붙고, 나머지는 나중에 채워도 된다.

주의할 점:

- 파일명·태그·id는 `EXTRA_SAMPLES[].images` 와 일대일이다. 파일명을 바꾸려면 코드도 같이 고쳐야 한다.
- 한 번 붙인 이미지를 앱에서 지우면 다시 살아나지 않는다(`sampleImg:<id>` seed 플래그). 지운 걸 되돌리려면 `data/published.json` 의 `seeded` 에서 해당 키를 지우면 된다.
- **표의 첫 줄이 갤러리 카드 커버**가 된다. 자동 선별이 인물 컷을 뒤로 미루므로 장면 컷을 앞에 뒀다. 다른 걸 커버로 쓰고 싶으면 앱의 이미지 행에서 `☆ 대표`를 토글하면 된다.
- 업로드 제한과 맞추기 위해 장당 **2MB 이하** 를 권장한다(기존 샘플은 1~1.7MB).

## 공통 규격

| 종류 | 해상도 | 비율 |
|---|---|---|
| 장면 컷 | 1280 × 720 | 16:9 |
| 인물 컷 | 960 × 1280 | 3:4 |

**공통 스타일 접미사** (모든 프롬프트 뒤에 붙인다):

```
moody painterly digital illustration, semi-realistic, soft visible brushwork,
cinematic lighting, muted desaturated palette, film-grain texture, no text
```

**공통 네거티브 프롬프트**:

```
text, letters, watermark, signature, logo, ui, frame, border,
extra fingers, deformed hands, extra limbs, distorted face,
lowres, blurry, jpeg artifacts, oversaturated, harsh neon, 3d render, photograph
```

기존 샘플(`harbor.png`, `lian.png` …)이 톤 기준점이다 — 채도가 낮고 광원이 하나뿐인 회화풍. 새 샘플도 그 결을 따르되 장르별로 색온도만 달리 잡았다.

---

## 1. 방과 후, 옥상의 라디오 — 학원 로맨스

톤: 따뜻하고 나른한 늦여름 오후. 이 세트만 유일하게 밝은 색조다.

| 파일명 | 태그 | id |
|---|---|---|
| `radio_roof.png` | 옥상 | `5a11e0ba51a01001` |
| `radio_booth.png` | 방송실 | `5a11e0ba51a01002` |
| `radio_sunset.png` | 노을 | `5a11e0ba51a01003` |
| `radio_hayun.png` | 서하윤 | `5a11e0ba51a01004` |

**옥상** (1280×720)
```
rooftop of a Korean high school on a late summer afternoon, chain-link fence,
concrete water tower casting a long shadow, two canned drinks left on the ledge,
distant sports field and low city skyline, warm hazy sunlight, empty and quiet,
no people
```

**방송실** (1280×720)
```
small school broadcasting room interior, mixing console and a microphone with
pop filter, glowing red ON AIR lamp, stacks of handwritten scripts, dusty
afternoon light through half-closed blinds, no people
```

**노을** (1280×720)
```
school rooftop at golden hour, orange and violet gradient sky, silhouetted
chain-link fence and water tower, long shadows across concrete, a single
paper script fluttering on the ledge, lyrical and wistful, no people
```

**서하윤** (960×1280)
```
portrait of a Korean high school senior in a summer uniform, short dark hair,
tired but gentle eyes, leaning back against a rooftop water tower, holding
a paper script, looking slightly away from the viewer, warm late-afternoon
backlight, chain-link fence blurred behind
```
> 서하윤은 설정에서 성별을 정해두지 않았다. 원하는 쪽으로 프롬프트를 바꿔 써도 세계관과 충돌하지 않는다.

---

## 2. 표류선 아르케 3호 — SF 미스터리

톤: 차가운 청록색 비상등, 절반만 들어온 조명, 금속과 성에.

| 파일명 | 태그 | id |
|---|---|---|
| `arche_bridge.png` | 함교 | `5a11e0ba51a02001` |
| `arche_cryo.png` | 냉동 수면실 | `5a11e0ba51a02002` |
| `arche_cargo3.png` | 3번 화물칸 | `5a11e0ba51a02003` |
| `arche_moth.png` | 모스 | `5a11e0ba51a02004` |
| `arche_kyle.png` | 카일 | `5a11e0ba51a02005` |
| `arche_nina.png` | 니나 박사 | `5a11e0ba51a02006` |

**함교** (1280×720)
```
bridge of a derelict cargo spaceship, worn control consoles with half the
displays dark, cracked viewport showing Jupiter far behind, cyan emergency
strip lighting, floating dust motes, cables hanging from an open ceiling panel,
no people
```

**냉동 수면실** (1280×720)
```
cryosleep bay of a spaceship, two rows of frost-covered stasis pods, nine of
them standing open and empty with thawed fluid pooled on the grated floor,
cold cyan light from within the pods, condensation on glass, unsettling, no people
```

**3번 화물칸** (1280×720)
```
dark cargo hold of a spaceship, towering stacks of strapped containers, one
bulkhead door sealed with yellow hazard markings, a single work lamp throwing a
long cone of light, frost creeping along the deck plating, something unseen
beyond the light, no people
```

**모스** (960×1280)
```
ship AI presence visualized as a tall pale holographic figure without a face,
a smooth luminous oval where the head should be, thin scan lines drifting across
its body, standing in a dim corridor, cold cyan glow lighting the walls around it,
serene and unreadable
```

**카일** (960×1280)
```
portrait of a man in his late thirties, ship mechanic, stubble, grease-smeared
jumpsuit with rolled sleeves, forearm tattoos, holding a worn wrench,
sardonic half-smile that does not reach his tired eyes, harsh work lamp from
below, cluttered engine bay behind him
```

**니나 박사** (960×1280)
```
portrait of a woman in her forties, ship biologist, dark hair pulled back
tightly, lab coat over a thermal layer, arms folded, cool appraising stare
directly at the viewer, holding a tablet with a temperature graph, cold blue
lab lighting, clinical and composed
```

---

## 3. 검을 묻은 객잔 — 무협

톤: 사흘째 내리는 비, 기름등 노란빛, 젖은 나무와 흙.

| 파일명 | 태그 | id |
|---|---|---|
| `inn_exterior.png` | 망월객잔 | `5a11e0ba51a03001` |
| `inn_hall.png` | 객잔 대청 | `5a11e0ba51a03002` |
| `inn_swordrack.png` | 칼걸이 | `5a11e0ba51a03003` |
| `inn_seorin.png` | 백서린 | `5a11e0ba51a03004` |
| `inn_gwak.png` | 곽 노인 | `5a11e0ba51a03005` |
| `inn_manbok.png` | 만복 | `5a11e0ba51a03006` |

**망월객잔** (1280×720)
```
old Chinese wuxia roadside inn at night seen through heavy rain, tiled upturned
eaves, weathered banner sign, warm lantern light spilling from paper windows,
a muddy crossroads of three flooded dirt roads, bare wet trees, no people
```

**객잔 대청** (1280×720)
```
interior main hall of a wuxia inn, low wooden tables and benches, travelers
hunched over noodle bowls, steam rising, oil lamps hanging from dark beams,
rain streaming past the open doorway, smoky warm atmosphere, faces indistinct
```

**칼걸이** (1280×720)
```
close view of a wooden weapon rack just inside an inn doorway, eight sheathed
jian and dao resting on it, rainwater dripping from the scabbards onto packed
earth, a single lantern above casting sharp shadows, quiet tension, no people
```

**백서린** (960×1280)
```
portrait of a Chinese wuxia woman in her early thirties, innkeeper and retired
swordfighter, black hair in a simple bun with a plain wooden pin, dark hanfu
robe with tightly bound sleeves, holding a writing brush over a ledger, calm
guarded expression, warm lantern light from one side, weapon rack blurred behind
```

**곽 노인** (960×1280)
```
portrait of an old Chinese cook past sixty, deeply lined face, thin white beard,
sleeves rolled to the elbow, stirring a steaming pot of noodles, listening
without looking up, steam catching the kitchen firelight, knowing half-smile
```

**만복** (960×1280)
```
portrait of a fourteen-year-old Chinese inn server boy, cropped hair, patched
short robe, cloth draped over one shoulder, carrying a tray of bowls, wide
curious eyes glancing sideways at something off-frame, warm lantern light,
lively and mischievous
```

---

## 4. 고양이 서점, 오후 세 시 — 일상 · 힐링

톤: 유일하게 완전히 따뜻한 세트. 종이·나무·비 오는 오후.

| 파일명 | 태그 | id |
|---|---|---|
| `book_shop.png` | 세 시 서점 | `5a11e0ba51a04001` |
| `book_window.png` | 빗물 창가 | `5a11e0ba51a04002` |
| `book_dust.png` | 먼지 | `5a11e0ba51a04003` |
| `book_yuha.png` | 도유하 | `5a11e0ba51a04004` |

**세 시 서점** (1280×720)
```
interior of a small old secondhand bookshop, floor-to-ceiling shelves crammed
with worn books, stacks on the floor, a wooden counter with a kettle and two
mismatched mugs, warm lamplight, rain visible through the front window,
cozy and lived-in, no people
```

**빗물 창가** (1280×720)
```
rain-streaked bookshop window seen from inside, blurred grey street and
umbrellas beyond the glass, a stack of books and a steaming mug on the sill,
soft warm interior light against cool exterior, quiet and contemplative, no people
```

**먼지** (1280×720)
```
a plump grey cat asleep on a bookshop counter beside an open ledger, one paw
tucked under its chin, dust motes drifting in a shaft of soft afternoon light,
shelves of books blurred behind, warm and peaceful
```

**도유하** (960×1280)
```
portrait of a bookshop owner in their late twenties, soft unhurried expression,
loose knit cardigan over a plain shirt, holding a mug in both hands, standing
behind a wooden counter with a grey cat asleep beside them, warm lamplight,
shelves of books blurred behind, gentle and welcoming
```
> 도유하도 성별을 정해두지 않았다. 원하는 쪽으로 바꿔 써도 된다.

---

## 5. 비 내리는 도시, 마지막 담배 — 느와르

톤: 1938년, 흑백에 가까운 저채도, 젖은 아스팔트 반사광, 담배 연기.

| 파일명 | 태그 | id |
|---|---|---|
| `noir_street.png` | 비 내리는 거리 | `5a11e0ba51a05001` |
| `noir_office.png` | 탐정 사무실 | `5a11e0ba51a05002` |
| `noir_club.png` | 푸른 나비 | `5a11e0ba51a05003` |
| `noir_dojin.png` | 한도진 | `5a11e0ba51a05004` |
| `noir_rise.png` | 리세 | `5a11e0ba51a05005` |
| `noir_manseok.png` | 오만석 | `5a11e0ba51a05006` |

**비 내리는 거리** (1280×720)
```
1930s East Asian port city street at night in heavy rain, wet asphalt mirroring
streetlamps and shop signs, cargo cranes and moored ships at the far end,
a lone parked car, drifting fog, near-monochrome palette with one warm light
source, film noir composition, no people
```

**탐정 사무실** (1280×720)
```
1930s private detective office at night, frosted glass door lettering seen in
reverse, cluttered desk with two cold coffee cups and an overflowing ashtray,
venetian blind shadows striped across the wall, single desk lamp, rain on the
window, near-monochrome, no people
```

**푸른 나비** (1280×720)
```
interior of a small 1930s jazz club, empty round tables with dim table lamps,
a lit stage with a standing microphone and a blue butterfly motif on the back
curtain, cigarette haze catching the spotlight, deep shadows, no people
```

**한도진** (960×1280)
```
portrait of a Korean man in his forties, 1930s private detective, worn trench
coat and loosened tie, unshaven, striking a match that lights only half his
face, cigarette between his lips, cynical exhausted eyes, venetian blind shadows
across him, near-monochrome with a warm match flame
```

**리세** (960×1280)
```
portrait of a Korean woman in her late twenties, 1930s jazz club singer,
finger-waved hair, dark satin dress and long gloves, leaning against a stage
microphone, languid knowing expression, cigarette smoke curling through a
spotlight, deep shadows, near-monochrome with one cool blue accent
```

**오만석** (960×1280)
```
portrait of a Korean man in his fifties, 1930s police detective, rumpled suit
and loosened collar, worn fedora pushed back, heavy tired eyes avoiding the
viewer's gaze, standing under a bare precinct bulb, cigarette burned down to
the filter, near-monochrome, weary and compromised
```

---

## 6. 마왕성 인사팀입니다 — 판타지 코미디

톤: 다른 세트보다 채도와 대비를 한 단계 높인다. 웅장한 마왕성 + 사무실 집기의 부조화가 개그 포인트.

| 파일명 | 태그 | id |
|---|---|---|
| `demon_hall.png` | 면접장 | `5a11e0ba51a06001` |
| `demon_corridor.png` | 마왕성 복도 | `5a11e0ba51a06002` |
| `demon_belzer.png` | 벨제르 | `5a11e0ba51a06003` |
| `demon_lilith.png` | 릴리스 | `5a11e0ba51a06004` |
| `demon_gorg.png` | 고르그 | `5a11e0ba51a06005` |

**면접장** (1280×720)
```
grand demon lord throne hall repurposed as a corporate interview room, a long
folding table with name plates and paper cups set in front of an enormous
obsidian throne, banners of a dark empire above, towering stacks of paperwork
and a filing cabinet beside the throne, purple flame braziers, absurd contrast
between grandeur and office furniture, no people
```

**마왕성 복도** (1280×720)
```
black marble corridor of a demon castle lined with gargoyle statues and purple
flame sconces, incongruous modern touches: a numbered ticket dispenser, a row
of plastic waiting chairs against the wall, a laminated notice taped to a
pillar, comedic contrast, no people
```

**벨제르** (960×1280)
```
portrait of a demon lord seated on an obsidian throne, imposing horns and a
heavy black-and-crimson mantle, glowing eyes, undercut by the reading glasses
perched on his nose and the clipboard of résumés in one clawed hand, faint
exhaustion behind the grandeur, purple flame light, comedic dignity
```

**릴리스** (960×1280)
```
portrait of a succubus HR manager, small elegant horns and neat dark wings,
sharp business suit, hair in a precise low bun, glasses, checking a wristwatch
with a clipboard tucked under one arm, brisk unimpressed expression, purple
office lighting, thoroughly professional
```

**고르그** (960×1280)
```
portrait of a hulking stone golem gatekeeper, moss in its cracked granite
seams, glowing amber runes for eyes, standing rigidly beside a doorway, an
absurdly small laminated ID badge clipped to its chest, purple torchlight,
deadpan and immovable
```
