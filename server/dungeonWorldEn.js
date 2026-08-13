'use strict';

/**
 * 던전 월드 데이터의 영어 표시명.
 *
 * **데이터 자체는 번역하지 않는다.** dungeonWorld.js 의 한국어 문자열이 원문이고,
 * 세이브(캐릭터의 className·weapon.name·inventory)와 AI 프롬프트가 그 문자열로
 * 서로를 참조한다 — 예를 들어 aiGM.js 의 무기 태그 규칙은 '정밀' 이라는 글자에 걸려 있다.
 * 그래서 여기서는 **화면에 낼 때만 쓰는 대응표**를 따로 둔다.
 *
 * 클라이언트가 init 으로 이 표를 받아 dw(원문) 로 찾는다. 표에 없으면 원문이 그대로
 * 나오므로, 데이터에 항목을 새로 넣고 여기 번역을 빠뜨려도 화면이 비지 않는다.
 *
 * 무브·태그 이름은 던전 월드 원서의 영어 용어를 따랐다(Hack and Slash, Defy Danger 등).
 */

const DW_EN = {
  // ── 클래스 ──
  전사: 'Fighter',
  '근접 전투의 달인. 튼튼하고 강력한 일격을 자랑한다.':
    'A master of melee. Tough, and hits like a falling wall.',
  마법사: 'Wizard',
  '주문을 다루는 학자. 몸은 약하지만 지식과 마법이 무기다.':
    'A scholar of spells. Frail of body, armed with knowledge and magic.',
  성직자: 'Cleric',
  '신을 섬기는 사제. 치유와 신성한 힘으로 동료를 지킨다.':
    'A priest in service of a god. Guards allies with healing and divine power.',
  도적: 'Thief',
  '그림자 속의 전문가. 은신·기습·함정 해제에 능하다.':
    'A specialist in shadows — stealth, ambush and disarming traps.',
  레인저: 'Ranger',
  '야생의 사냥꾼. 활과 추적술, 동물 동료로 싸운다.':
    'A hunter of the wilds, fighting with bow, tracking and an animal companion.',
  음유시인: 'Bard',
  '이야기와 노래의 명인. 매혹과 전승 지식으로 상황을 이끈다.':
    'A master of song and story, steering events with charm and lore.',
  성기사: 'Paladin',
  '맹세로 무장한 성전사. 신앙과 강철로 악을 응징한다.':
    'A crusader armed with an oath, answering evil with faith and steel.',
  드루이드: 'Druid',
  '자연의 대변자. 야수로 변신하고 자연의 힘을 부린다.':
    "Nature's voice — shapeshifts into beasts and commands the wild.",

  // ── 장비 그룹 ──
  주무기: 'Main weapon',
  방어구: 'Armor',
  '추가 장비': 'Extra gear',

  // ── 무기 태그 (규칙 엔진·프롬프트가 참조하는 원문은 한국어 쪽이다) ──
  근접: 'close',
  '손닿는 거리': 'hand',
  간격: 'reach',
  '가까운 원거리': 'near',
  '먼 원거리': 'far',
  지저분: 'messy',
  '강하게 밀침': 'forceful',
  정밀: 'precise',
  양손: 'two-handed',
  재장전: 'reload',
  '피해 +1': '+1 damage',

  // ── 기본 장비 ──
  '던전 배낭': 'dungeon rations pack',
  '여행 식량 5일분': '5 days of travel rations',
  주문서: 'spellbook',
  '성징(신앙의 상징)': 'holy symbol',
  성징: 'holy symbol',
  '도둑 도구': 'thieves’ tools',
  '사냥 도구': 'hunting tools',
  악기: 'instrument',
  '자연의 징표': 'token of the wild',

  // ── 무기 ──
  '장검(균형 잡힌)': 'long sword (balanced)',
  '전투 도끼(강력한)': 'battle axe (powerful)',
  '워해머(둔중하나 묵직한)': 'warhammer (slow but heavy)',
  '지팡이(원거리 마력)': 'staff (ranged magic)',
  '단검(호신용)': 'dagger (for defense)',
  철퇴: 'mace',
  '전투 망치': 'war hammer',
  '단검 두 자루': 'two daggers',
  '짧은 검': 'short sword',
  '손 석궁': 'hand crossbow',
  '장궁과 화살통': 'longbow and quiver',
  석궁: 'crossbow',
  창: 'spear',
  세검: 'rapier',
  단검: 'dagger',
  투석구: 'sling',
  대검: 'greatsword',
  지팡이: 'staff',
  낫: 'sickle',

  // ── 방어구 ──
  '사슬 갑옷 + 방패 (방어구 2)': 'chainmail + shield (armor 2)',
  '판금 갑옷 (방어구 2, 둔중)': 'plate (armor 2, clumsy)',
  '가죽 갑옷 + 방패 (방어구 1, 기민)': 'leather + shield (armor 1, nimble)',
  '마법사 로브 (방어구 0)': "wizard's robes (armor 0)",
  '가죽 갑옷 (방어구 1, 거추장)': 'leather armor (armor 1, cumbersome)',
  '사슬 갑옷 (방어구 1)': 'chainmail (armor 1)',
  '가죽 갑옷 + 나무 방패 (방어구 1)': 'leather + wooden shield (armor 1)',
  '사제복 (방어구 0)': 'vestments (armor 0)',
  '가죽 갑옷 (방어구 1)': 'leather armor (armor 1)',
  '어둠의 망토 (방어구 0, 은밀)': 'shadow cloak (armor 0, stealthy)',
  '가벼운 차림 (방어구 0, 민첩)': 'light garb (armor 0, agile)',
  '화려한 의복 (방어구 0)': 'fine clothes (armor 0)',
  '판금 갑옷 + 방패 (방어구 3)': 'plate + shield (armor 3)',
  '자연의 의복 (방어구 0)': 'garb of the wild (armor 0)',

  // ── 추가 장비 ──
  '치유 물약': 'healing potion',
  '투척용 단검 3자루': '3 throwing daggers',
  '밧줄과 갈고리': 'rope and grappling hook',
  '마법 재료 주머니': 'pouch of spell components',
  '고대 지식의 책': 'book of ancient lore',
  '성수 한 병': 'vial of holy water',
  '치유 약초': 'healing herbs',
  붕대: 'bandages',
  '독 묻은 침 3개': '3 poisoned needles',
  연막탄: 'smoke bomb',
  '정교한 자물쇠 도구': 'fine lockpicks',
  '사냥 덫': 'hunting trap',
  '훈련된 매': 'trained hawk',
  '추가 식량': 'extra rations',
  '값진 장신구': 'valuable trinket',
  '전설이 적힌 두루마리': 'scroll of legends',
  '두둑한 동전 주머니': 'heavy purse of coins',
  '성전의 깃발': 'crusade banner',
  성유물: 'holy relic',
  '희귀 약초 표본': 'rare herb specimens',
  토템: 'totem',
  '마법의 씨앗': 'enchanted seeds',

  // ── 상위 무브: 전사 ──
  강타: 'Bend Bars, Lift Gates',
  '손상 입히기에서 10+가 나오면 추가로 적을 넘어뜨리거나 밀쳐낸다.':
    'On a 10+ with Hack and Slash, you also knock the enemy down or shove them back.',
  불굴: 'Unyielding',
  '세션당 1회, STR/CON 위험에 맞서기에서 6-가 나와도 쓰러지지 않고 버틴다.':
    'Once per session, a 6- on a STR/CON Defy Danger leaves you standing anyway.',
  '무기 숙련': 'Signature Weapon',
  '애용하는 무기로 공격할 때 피해 주사위에 +1.':
    '+1 to your damage roll when you attack with your favored weapon.',
  휩쓸기: 'Cleave',
  '여러 적에 둘러싸였을 때 한 번의 공격으로 두 적을 노릴 수 있다.':
    'When surrounded, a single attack can target two enemies at once.',

  // ── 상위 무브: 마법사 ──
  '마력 집중': 'Empowered Magic',
  '주문 판정에서 10+가 나오면 그 주문을 대가 없이 유지한다.':
    'On a 10+ when casting, you sustain the spell at no cost.',
  '의식 마법': 'Ritual Magic',
  '시간과 재료를 들여 평소보다 강력한 마법 효과를 준비할 수 있다.':
    'Given time and components, you can prepare an effect far beyond an ordinary spell.',
  '반사 방어': 'Counter-Ward',
  '마법적 위협에 맞설 때 DEX 대신 INT로 위험에 맞서기를 할 수 있다.':
    'Against a magical threat you may Defy Danger with INT instead of DEX.',
  '비전 화살': 'Magic Missile',
  '단순한 마력 탄을 쏘는 신뢰할 만한 원거리 공격 수단을 얻는다(INT).':
    'You gain a reliable ranged attack — a simple bolt of force (INT).',

  // ── 상위 무브: 성직자 ──
  '치유의 기도': 'Cure Light Wounds',
  '신에게 기원해 대상의 부상을 회복시킨다(WIS).':
    'You beseech your god to mend a target’s wounds (WIS).',
  '신성한 응징': 'Divine Retribution',
  '신앙의 힘을 담아 적을 내리쳐 추가 피해를 준다.':
    'You strike with the weight of your faith behind it, dealing extra damage.',
  축복: 'Bless',
  '대상에게 신의 가호를 내려 다음 위험을 덜어준다.':
    'You lay your god’s favor on a target, easing the next danger they face.',
  '언데드 퇴치': 'Turn Undead',
  '신성한 기운으로 언데드를 물리치거나 붙잡아 둔다.':
    'Holy power drives back the undead or holds them fast.',

  // ── 상위 무브: 도적 ──
  급습: 'Backstab',
  '방심하거나 무방비한 적을 기습해 큰 피해를 준다(DEX).':
    'Ambush an unaware or defenseless foe for heavy damage (DEX).',
  '함정 감각': 'Trap Expert',
  '함정과 장치를 찾아내고 무력화한다(DEX).': 'You spot and disarm traps and devices (DEX).',
  '자물쇠 따기': 'Tricks of the Trade',
  '잠긴 문과 상자를 소리 없이 연다(DEX).': 'Locked doors and chests open silently for you (DEX).',
  손속임: 'Flexible Morals',
  '소매치기나 눈속임으로 물건을 몰래 다룬다(DEX).':
    'Pickpocketing and sleight of hand move objects unseen (DEX).',

  // ── 상위 무브: 레인저 ──
  '동물 동료': 'Animal Companion',
  '훈련된 야수 동료와 함께 싸우고 정찰한다.':
    'A trained beast fights and scouts alongside you.',
  추적: 'Hunt and Track',
  '흔적을 읽어 대상의 행방과 상태를 알아낸다(WIS).':
    'You read the signs to learn where your quarry went and how it fares (WIS).',
  정조준: 'Called Shot',
  '시간을 들여 겨누면 원거리 공격의 위력이 커진다(DEX).':
    'Take the time to aim and your ranged attack bites much deeper (DEX).',
  위장: 'Camouflage',
  '자연 지형에 몸을 숨겨 은신한다(DEX).': 'You melt into natural terrain and go unseen (DEX).',

  // ── 상위 무브: 음유시인 ──
  '매혹의 선율': 'Charming and Open',
  '공연과 연주로 상대의 태도를 누그러뜨린다(CHA).':
    'Performance softens how others regard you (CHA).',
  '전승 지식': 'Bardic Lore',
  '유명한 대상에 대해 알고 있는 사실을 하나 떠올린다.':
    'You recall one thing you know about something famous.',
  격려: 'Arcane Art',
  '동료나 자신에게 다음 판정에 도움이 되는 사기를 북돋운다.':
    'You raise the spirits of an ally (or yourself) for the next roll.',
  '날카로운 재담': 'Bless',
  '말로 상대를 흔들어 빈틈을 만든다(CHA).':
    'A cutting remark rattles your target and opens a gap (CHA).',

  // ── 상위 무브: 성기사 ──
  안수: 'Lay on Hands',
  '손을 얹어 신앙의 힘으로 상처를 치유한다.': 'Your touch and your faith close wounds.',
  '성전 서약': 'Quest',
  '목표를 정해 맹세하면 그에 관한 판정에 힘이 실린다.':
    'Swear an oath to a goal and your rolls toward it carry extra weight.',
  '수호의 기운': 'Bloodied Aura',
  '주변 아군이 받는 위협을 대신 짊어진다.': 'You take on the danger aimed at those beside you.',
  '신성 강타': 'Smite',
  '사악한 적에게 신성한 힘으로 추가 피해를 입힌다.':
    'Divine power adds extra damage against a wicked foe.',

  // ── 상위 무브: 드루이드 ──
  '야수 변신': 'Shapeshifter',
  '익숙한 동물의 형상으로 변해 그 능력을 얻는다.':
    'You take the shape of a familiar animal and gain its capabilities.',
  '자연과의 교감': 'Spirit Tongue',
  '동식물이나 정령과 소통해 정보를 얻는다(WIS).':
    'You speak with plants, beasts or spirits to learn what they know (WIS).',
  '얽매는 덩굴': 'Entangling Vines',
  '주변 식물을 조종해 적을 붙잡는다.': 'You command nearby plants to seize your enemies.',
  '자연 예지': "Nature's Reprisal",
  '자연의 징후를 읽어 앞일을 예측하거나 유리하게 이용한다.':
    'You read nature’s omens to foresee what comes, or turn it to your advantage.',
};

module.exports = { DW_EN };
