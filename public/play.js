/* global App, I18N */
'use strict';

/**
 * 던전 월드(AI GM) 페이지 — 캐릭터 생성 위저드 + 게임 화면.
 * 계정·설정·모델 모달은 common.js(App)가 담당한다.
 *
 * 클래스·장비·무브 이름은 서버가 한국어 원문으로 내려준다(세이브에도 그대로 들어간다).
 * 화면에 낼 때만 dw() 로 사전을 찾고, 번역이 없으면 원문이 그대로 나온다.
 */

const t = I18N.t;

// 클래스·장비·무브의 영어 표시명 대응표. 서버가 init 으로 내려준다(dungeonWorldEn.js).
let dwEn = {};

/** 던전 월드 데이터의 표시명. 대응표에 없으면 서버가 준 한국어 원문 그대로. */
function dw(name) {
  return I18N.lang === 'en' ? dwEn[name] || name : name;
}

let socket = null;

// DOM
const setupEl = document.getElementById('setup');
const gameEl = document.getElementById('game');
const classListEl = document.getElementById('classList');
const charNameEl = document.getElementById('charName');
const charLookEl = document.getElementById('charLook');
const startBtn = document.getElementById('startBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const modeRecommend = document.getElementById('modeRecommend');
const modeCustom = document.getElementById('modeCustom');
const statAssignEl = document.getElementById('statAssign');
const statHintEl = document.getElementById('statHint');
const baseGearEl = document.getElementById('baseGear');
const gearOptionsEl = document.getElementById('gearOptions');
const gearCountEl = document.getElementById('gearCount');
const gearHintEl = document.getElementById('gearHint');
const learnMovesEl = document.getElementById('learnMoves');
const sheetSummaryEl = document.getElementById('sheetSummary');

const logEl = document.getElementById('log');
const logInnerEl = document.getElementById('logInner');
const enemiesEl = document.getElementById('enemies');
const companionsEl = document.getElementById('companions');
const thinkingEl = document.getElementById('thinking');
const inputForm = document.getElementById('inputForm');
const actionInput = document.getElementById('actionInput');
const sendBtn = document.getElementById('sendBtn');
const suggestBtn = document.getElementById('suggestBtn');
const suggestionsEl = document.getElementById('suggestions');
const newGameBtn = document.getElementById('newGameBtn');

const charTitle = document.getElementById('charTitle');
const levelText = document.getElementById('levelText');
const xpText = document.getElementById('xpText');
const xpBar = document.getElementById('xpBar');
const hpText = document.getElementById('hpText');
const hpBar = document.getElementById('hpBar');
const armorText = document.getElementById('armorText');
const weaponBoxEl = document.getElementById('weaponBox');
const coinTextEl = document.getElementById('coinText');
const statsEl = document.getElementById('stats');
const inventoryEl = document.getElementById('inventory');
const movesEl = document.getElementById('moves');
const modelNote = document.getElementById('modelNote');

// 슬롯(저장 게임) + 게임별 모델
const slotBarEl = document.getElementById('slotBar');
const gameModelBtn = document.getElementById('gameModelBtn');
const gameModelLabelEl = document.getElementById('gameModelLabel');

// 레벨업 모달
const levelupModal = document.getElementById('levelupModal');
const luStats = document.getElementById('luStats');
const luMoves = document.getElementById('luMoves');
const luConfirm = document.getElementById('luConfirm');

let currentGameAi = { provider: 'gemini', model: '' }; // 활성 게임의 모델

// 위저드 상태
let classesData = [];
let statKeys = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
let standardArray = [2, 1, 1, 0, -1, -1];
let currentStep = 1;
let selectedClass = null;
let statMode = 'recommend'; // 'recommend' | 'custom'
let customStats = null; // {STR:.., ...}
let selectedGearChoices = {}; // { groupId: optionId } 무기/방어구/장비 선택
const TOTAL_STEPS = 4;
let prevHp = null; // HP 변화 애니메이션용
// 언어 전환 때 다시 그리려고 마지막으로 받은 값을 들고 있는다.
// 로그(서사)는 다시 그리지 않는다 — AI가 그 대화의 언어로 이미 쓴 원문이다.
let lastCharacter = null;
let lastEnemies = [];
let lastCompanions = [];
let lastSlots = null;

let luAbility = null; // 선택한 능력치 key
let luMove = null; // 선택한 무브 id
let luNeedStat = false;
let luNeedMove = false;

const escapeHtml = App.escapeHtml;

// ---------- 소켓 핸들러 ----------
function wireSocket(s) {
  s.on('init', (data) => {
    classesData = data.classes || [];
    dwEn = data.dwEn || {};
    if (Array.isArray(data.statKeys)) statKeys = data.statKeys;
    if (Array.isArray(data.standardArray)) standardArray = data.standardArray;
    renderClasses(classesData);
    applyGameState(data);
  });

  // 활성 게임의 전체 상태를 화면에 반영(init/슬롯 전환/새 게임/삭제 공용).
  s.on('slotSwitched', (data) => {
    closeLevelUp();
    clearSuggestions();
    App.closeSettings();
    App.closeModelModal();
    applyGameState(data);
  });
  s.on('slots', (data) => renderSlots(data));
  s.on('gameModelUpdated', (ai) => {
    currentGameAi = ai || currentGameAi;
    updateGameModelLabel();
    updateModelNote();
  });

  s.on('narration', (entry) => {
    afterDice(() => {
      renderLogEntry(entry);
      scrollLog();
    });
  });
  s.on('dice', (entry) => animateDiceRoll(entry));
  s.on('systemLog', (entry) => {
    afterDice(() => {
      renderLogEntry(entry);
      scrollLog();
    });
  });
  s.on('stateUpdate', (character) => afterDice(() => updateStatus(character)));
  s.on('fieldUpdate', ({ enemies, companions }) =>
    afterDice(() => renderField(enemies, companions))
  );
  s.on('gmThinking', ({ on }) => {
    thinkingEl.classList.toggle('hidden', !on);
    if (on) App.startThinking(thinkingEl, t('game.thinking'), currentGameAi.provider);
    else App.stopThinking();
    setBusy(on);
  });
  s.on('levelUp', (options) => openLevelUp(options));
  s.on('levelUpDone', () => closeLevelUp());
  s.on('gameOver', () => setGameOver(true));
  s.on('suggestions', ({ items }) => renderSuggestions(items || []));
  s.on('error', ({ message }) => {
    App.stopThinking();
    thinkingEl.classList.add('hidden');
    renderLogEntry({ kind: 'system', text: '⚠️ ' + message });
    scrollLog();
    setBusy(false);
  });
}

function updateModelNote() {
  const prov = currentGameAi.provider || 'gemini';
  const warn = App.providerReady(prov) ? '' : prov === 'free' ? t('game.stopped') : t('game.noKey');
  modelNote.textContent = App.modelLabel(currentGameAi) + warn;
}

/** 로그 헤더의 🧠 버튼 라벨 = 현재 게임의 제공자·모델. */
function updateGameModelLabel() {
  gameModelLabelEl.textContent = App.modelLabel(currentGameAi);
  gameModelBtn.classList.toggle('warn', !App.providerReady(currentGameAi.provider || 'gemini'));
}

/** init/slotSwitched 공용: 한 게임의 전체 상태를 렌더. */
function applyGameState(data) {
  prevHp = null;
  // 주사위 보류 상태 초기화(다른 게임의 잔여 큐가 섞이지 않도록)
  diceAnimating = false;
  postDiceQueue.length = 0;
  currentGameAi = data.ai || currentGameAi;
  updateGameModelLabel();
  updateModelNote();
  closeLevelUp();
  clearSuggestions();
  if (data.hasCharacter) {
    if (data.character) updateStatus(data.character);
    renderField(data.enemies || [], data.companions || []);
    logInnerEl.innerHTML = '';
    (data.log || []).forEach(renderLogEntry);
    scrollLog();
    setGameOver(!!data.dead);
    if (data.pendingLevelUp) openLevelUp(data.pendingLevelUp);
    showGame();
  } else {
    setGameOver(false);
    resetWizard();
    showSetup();
  }
}

/** 슬롯 칩들을 렌더. */
function renderSlots(data) {
  if (data) lastSlots = data;
  if (!data || !slotBarEl) return;
  slotBarEl.innerHTML = '';
  (data.slots || []).forEach((s) => {
    const chip = document.createElement('div');
    chip.className = 'slot-chip' + (s.id === data.activeId ? ' active' : '');
    const label = s.hasCharacter
      ? `${s.name || t('game.adventurer')}${s.dead ? ' ☠️' : ''} · ${dw(s.className || '')} Lv${s.level || 1}`
      : t('game.slotEmpty');
    const btn = document.createElement('button');
    btn.className = 'slot-main';
    btn.textContent = label;
    btn.title = t('game.slotSwitch');
    btn.addEventListener('click', () => {
      if (s.id !== data.activeId) socket.emit('switchSlot', { id: s.id });
    });
    chip.appendChild(btn);
    // 삭제 버튼 (슬롯이 2개 이상일 때만 노출)
    if ((data.slots || []).length > 1) {
      const del = document.createElement('button');
      del.className = 'slot-del';
      del.textContent = '✕';
      del.title = t('game.slotDelete');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        const nm = s.hasCharacter ? `"${s.name || t('game.slotThis')}"` : t('game.slotThisEmpty');
        if (confirm(t('game.slotDeleteAsk', { name: nm }))) socket.emit('deleteSlot', { id: s.id });
      });
      chip.appendChild(del);
    }
    slotBarEl.appendChild(chip);
  });
  // 새 게임 버튼 활성/비활성 (최대치)
  const full = (data.slots || []).length >= (data.max || 3);
  newGameBtn.disabled = full;
  newGameBtn.title = full ? t('game.slotMax', { max: data.max || 3 }) : t('game.newGameTitle');
}

// ---------- 화면 전환 ----------
function showSetup() {
  gameEl.classList.add('hidden');
  setupEl.classList.remove('hidden');
  App.setLandingBg(true);
}
function showGame() {
  setupEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  App.setLandingBg(false);
}

// ---------- 캐릭터 생성 (위저드) ----------
function getClass(id) {
  return classesData.find((c) => c.id === id);
}

function resetWizard() {
  currentStep = 1;
  selectedClass = null;
  statMode = 'recommend';
  customStats = null;
  selectedGearChoices = {};
  charNameEl.value = '';
  charLookEl.value = '';
  startBtn.disabled = false;
  document
    .querySelectorAll('.class-card')
    .forEach((el) => el.classList.remove('selected'));
  goToStep(1);
}

function renderClasses(classes) {
  classListEl.innerHTML = '';
  classes.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'class-card';
    div.dataset.id = c.id;
    const statLine = statKeys
      .map((k) => `${k} ${fmtMod(c.stats[k])}`)
      .join('  ');
    const moveNames = (c.moves || []).map((m) => dw(m.name)).join(', ');
    div.innerHTML = `<div class="cname">${escapeHtml(dw(c.name))}</div>
      <div class="cdesc">${escapeHtml(dw(c.description))}</div>
      <div class="cstats">HP ${c.maxHp} · ${t('sheet.damage')} d${c.damageDie} · ${statLine}</div>
      <div class="cmoves">${t('sheet.learnMoves')}: ${escapeHtml(moveNames)}</div>`;
    div.addEventListener('click', () => {
      document
        .querySelectorAll('.class-card')
        .forEach((el) => el.classList.remove('selected'));
      div.classList.add('selected');
      selectedClass = c.id;
      customStats = null; // 클래스 바뀌면 배분 초기화
      selectedGearChoices = {}; // 클래스 바뀌면 장비 선택 초기화
      updateNav();
    });
    classListEl.appendChild(div);
  });
}

function goToStep(step) {
  currentStep = step;
  document.querySelectorAll('.step-panel').forEach((p) => {
    p.classList.toggle('hidden', Number(p.dataset.panel) !== step);
  });
  document.querySelectorAll('.step').forEach((s) => {
    const n = Number(s.dataset.step);
    s.classList.toggle('active', n === step);
    s.classList.toggle('done', n < step);
  });
  if (step === 2) renderStatAssign();
  if (step === 3) renderGear();
  if (step === 4) renderSheetSummary();
  updateNav();
}

function updateNav() {
  prevBtn.classList.toggle('hidden', currentStep === 1);
  nextBtn.classList.toggle('hidden', currentStep === TOTAL_STEPS);
  startBtn.classList.toggle('hidden', currentStep !== TOTAL_STEPS);

  let ok = true;
  if (currentStep === 1) ok = !!selectedClass;
  if (currentStep === 2) ok = statMode === 'recommend' || isCustomValid();
  if (currentStep === 3) {
    const groups = getClass(selectedClass)?.gearChoices || [];
    ok = groups.every((g) => selectedGearChoices[g.id]);
  }
  if (currentStep === 4) ok = charNameEl.value.trim().length > 0;
  nextBtn.disabled = !ok;
  startBtn.disabled = !ok;
}

// --- 장비 선택 (무기/방어구/장비 그룹) + 배울 기술 ---
function computeArmor(cls) {
  let armor = 0;
  (cls.gearChoices || []).forEach((g) => {
    const opt = g.options.find((o) => o.id === selectedGearChoices[g.id]);
    if (opt && typeof opt.armor === 'number') armor += opt.armor;
  });
  return armor;
}

function renderGear() {
  const cls = getClass(selectedClass);
  if (!cls) return;

  // 각 그룹 기본 선택(첫 옵션)
  (cls.gearChoices || []).forEach((g) => {
    if (!selectedGearChoices[g.id]) selectedGearChoices[g.id] = g.options[0].id;
  });

  baseGearEl.innerHTML = t('play.baseGear', {
    list: escapeHtml(cls.baseGear.map(dw).join(', ')),
  });
  gearHintEl.textContent = t('play.gearPickHint');
  gearCountEl.textContent = '';

  gearOptionsEl.innerHTML = '';
  (cls.gearChoices || []).forEach((group) => {
    const wrap = document.createElement('div');
    wrap.className = 'gear-group';
    const title = document.createElement('div');
    title.className = 'gear-group-title';
    title.textContent = dw(group.label);
    wrap.appendChild(title);
    const opts = document.createElement('div');
    opts.className = 'gear-group-opts';
    group.options.forEach((o) => {
      const chip = document.createElement('div');
      const picked = selectedGearChoices[group.id] === o.id;
      chip.className = 'gear-chip' + (picked ? ' selected' : '');
      const tagHtml =
        o.tags && o.tags.length
          ? `<div class="gear-tags">${o.tags.map((x) => escapeHtml(dw(x))).join(' · ')}</div>`
          : '';
      chip.innerHTML = escapeHtml(dw(o.name)) + tagHtml;
      chip.addEventListener('click', () => {
        selectedGearChoices[group.id] = o.id;
        renderGear();
        updateNav();
      });
      opts.appendChild(chip);
    });
    wrap.appendChild(opts);
    gearOptionsEl.appendChild(wrap);
  });

  // 현재 방어력 미리보기
  const armorNote = document.createElement('div');
  armorNote.className = 'gear-armor-note';
  armorNote.textContent = t('play.currentArmor', { n: computeArmor(cls) });
  gearOptionsEl.appendChild(armorNote);

  // 배울 수 있는 기술
  learnMovesEl.innerHTML = '';
  (cls.moves || []).forEach((m) => {
    const div = document.createElement('div');
    div.className = 'learn-move';
    div.innerHTML = `<div class="lm-name">${escapeHtml(dw(m.name))}</div><div class="lm-desc">${escapeHtml(dw(m.desc))}</div>`;
    learnMovesEl.appendChild(div);
  });
}

// --- 능력치 배분 ---
function renderStatAssign() {
  const cls = getClass(selectedClass);
  if (!cls) return;
  const recommend = statMode === 'recommend';
  modeRecommend.classList.toggle('active', recommend);
  modeCustom.classList.toggle('active', !recommend);

  if (recommend) {
    statHintEl.classList.remove('error');
    statHintEl.textContent = t('play.recommendHint', { cls: dw(cls.name) });
    statAssignEl.innerHTML = '';
    statKeys.forEach((k) => {
      const row = document.createElement('div');
      row.className = 'srow';
      row.innerHTML = `<div class="k">${k}</div><div class="v">${fmtMod(cls.stats[k])}</div>`;
      statAssignEl.appendChild(row);
    });
    return;
  }

  // custom: 표준 배열을 각 능력치에 배치
  if (!customStats) customStats = { ...cls.stats };
  const distinct = [...new Set(standardArray)].sort((a, b) => b - a);
  statAssignEl.innerHTML = '';
  statKeys.forEach((k) => {
    const row = document.createElement('div');
    row.className = 'srow';
    const opts = distinct
      .map((v) => `<option value="${v}"${customStats[k] === v ? ' selected' : ''}>${fmtMod(v)}</option>`)
      .join('');
    row.innerHTML = `<div class="k">${k}</div><select data-k="${k}">${opts}</select>`;
    row.querySelector('select').addEventListener('change', (e) => {
      customStats[k] = Number(e.target.value);
      updateCustomHint();
      updateNav();
    });
    statAssignEl.appendChild(row);
  });
  updateCustomHint();
}

function neededCounts() {
  const counts = {};
  standardArray.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
  return counts;
}

function isCustomValid() {
  if (!customStats) return false;
  const need = neededCounts();
  const have = {};
  statKeys.forEach((k) => (have[customStats[k]] = (have[customStats[k]] || 0) + 1));
  return Object.keys(need).every((v) => have[v] === need[v]) &&
    Object.keys(have).length === Object.keys(need).length;
}

function updateCustomHint() {
  const need = neededCounts();
  const have = {};
  statKeys.forEach((k) => (have[customStats[k]] = (have[customStats[k]] || 0) + 1));
  if (isCustomValid()) {
    statHintEl.classList.remove('error');
    statHintEl.textContent = t('play.customOk');
  } else {
    const parts = Object.keys(need)
      .sort((a, b) => b - a)
      .map((v) => `${fmtMod(Number(v))}×${need[v]}`)
      .join(', ');
    statHintEl.classList.add('error');
    statHintEl.textContent = t('play.customBad', { parts });
  }
}

modeRecommend.addEventListener('click', () => {
  statMode = 'recommend';
  renderStatAssign();
  updateNav();
});
modeCustom.addEventListener('click', () => {
  statMode = 'custom';
  renderStatAssign();
  updateNav();
});

// --- 시트 요약 ---
function renderSheetSummary() {
  const cls = getClass(selectedClass);
  if (!cls) return;
  const stats = statMode === 'custom' && customStats ? customStats : cls.stats;
  const statLine = statKeys.map((k) => `${k} ${fmtMod(stats[k])}`).join('  ');
  const chosenNames = (cls.gearChoices || [])
    .map((g) => g.options.find((o) => o.id === selectedGearChoices[g.id]))
    .filter(Boolean)
    .map((o) => dw(o.name));
  const allGear = [...cls.baseGear.map(dw), ...chosenNames];
  const moveNames = (cls.moves || []).map((m) => dw(m.name)).join(', ');
  const weaponGroup = (cls.gearChoices || []).find((g) => g.id === 'weapon');
  const weaponOpt = weaponGroup
    ? weaponGroup.options.find((o) => o.id === selectedGearChoices.weapon)
    : null;
  const weaponLine =
    weaponOpt && weaponOpt.tags && weaponOpt.tags.length
      ? `<div><span class="lbl">${t('sheet.weaponTags')}</span> ${weaponOpt.tags.map((x) => escapeHtml(dw(x))).join(' · ')}</div>`
      : '';
  sheetSummaryEl.innerHTML =
    `<div><span class="lbl">${t('sheet.class')}</span> ${escapeHtml(dw(cls.name))}</div>` +
    `<div><span class="lbl">${t('sheet.hp')}</span> ${cls.maxHp} · <span class="lbl">${t('sheet.armor')}</span> ${computeArmor(cls)} · <span class="lbl">${t('sheet.damage')}</span> d${cls.damageDie}</div>` +
    `<div><span class="lbl">${t('sheet.stats')}</span> ${statLine}</div>` +
    `<div><span class="lbl">${t('sheet.gear')}</span> ${escapeHtml(allGear.join(', '))}</div>` +
    weaponLine +
    `<div><span class="lbl">${t('sheet.learnMoves')}</span> ${escapeHtml(moveNames)}</div>`;
}

// --- 네비게이션 ---
nextBtn.addEventListener('click', () => {
  if (nextBtn.disabled) return;
  goToStep(currentStep + 1);
});
prevBtn.addEventListener('click', () => goToStep(currentStep - 1));
charNameEl.addEventListener('input', updateNav);

startBtn.addEventListener('click', () => {
  const name = charNameEl.value.trim();
  if (!name || !selectedClass) return;
  startBtn.disabled = true;
  prevHp = null;
  showGame();
  logInnerEl.innerHTML = '';
  renderField([], []);
  const payload = {
    name,
    classId: selectedClass,
    look: charLookEl.value.trim(),
    choices: selectedGearChoices,
  };
  if (statMode === 'custom' && isCustomValid()) payload.stats = customStats;
  socket.emit('createCharacter', payload);
});

// ---------- 플레이어 입력 ----------
inputForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = actionInput.value.trim();
  if (!text) return;
  actionInput.value = '';
  clearSuggestions();
  socket.emit('playerAction', { text });
});

suggestBtn.addEventListener('click', () => {
  if (suggestBtn.disabled) return;
  clearSuggestions();
  socket.emit('suggestActions');
});

newGameBtn.addEventListener('click', () => {
  if (newGameBtn.disabled) return;
  clearSuggestions();
  socket.emit('newGame'); // 기존 게임 유지 + 새 슬롯 생성
});

gameModelBtn.addEventListener('click', () => {
  App.openModelModal({
    ai: currentGameAi,
    onSave: ({ provider, model }) => socket.emit('setGameModel', { provider, model }),
  });
});

let gameOver = false;
function setBusy(busy) {
  if (gameOver) return; // 사망 상태에서는 입력 비활성 유지
  sendBtn.disabled = busy;
  suggestBtn.disabled = busy;
  actionInput.disabled = busy;
  if (!busy) actionInput.focus();
}

/** 캐릭터 사망(죽음의 문턱 6-) 시 입력을 잠그고 새 게임을 유도. */
function setGameOver(on) {
  gameOver = on;
  sendBtn.disabled = on;
  suggestBtn.disabled = on;
  actionInput.disabled = on;
  if (on) {
    actionInput.placeholder = t('game.dead');
    newGameBtn.classList.add('pulse');
  } else {
    actionInput.placeholder = t('game.inputPlaceholder');
    newGameBtn.classList.remove('pulse');
  }
}

function fmtMod(v) {
  return v >= 0 ? '+' + v : '' + v;
}

// ---------- 행동 제안 ----------
function renderSuggestions(items) {
  suggestionsEl.innerHTML = '';
  if (!items.length) {
    suggestionsEl.classList.add('hidden');
    return;
  }
  items.forEach((text) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'suggestion-chip';
    chip.textContent = text;
    chip.addEventListener('click', () => {
      actionInput.value = text;
      actionInput.focus();
      clearSuggestions();
    });
    suggestionsEl.appendChild(chip);
  });
  suggestionsEl.classList.remove('hidden');
}

function clearSuggestions() {
  suggestionsEl.innerHTML = '';
  suggestionsEl.classList.add('hidden');
}

// ---------- 렌더 ----------
const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
function dieFace(v) {
  return DIE_FACES[v >= 1 && v <= 6 ? v - 1 : 0];
}

// 주사위 굴리는 동안 결과(서사·경험치·상태)를 잠시 보류 → 착지 후 공개(스포일러 방지)
let diceAnimating = false;
const postDiceQueue = [];
function afterDice(fn) {
  if (diceAnimating) postDiceQueue.push(fn);
  else fn();
}
function flushPostDice() {
  diceAnimating = false;
  while (postDiceQueue.length) postDiceQueue.shift()();
}

function renderLogEntry(entry) {
  if (entry.kind === 'dice') {
    // 저장 로그 재생: 주사위 눈 + 결과 (애니메이션 없이)
    const div = document.createElement('div');
    div.className = 'entry dice settled' + (entry.tier ? ' tier-' + entry.tier : '');
    const d = entry.dice || [];
    const faces = d.length
      ? `<div class="dice-faces"><span class="die">${dieFace(d[0])}</span><span class="die">${dieFace(d[1])}</span></div>`
      : '';
    div.innerHTML = faces + `<div class="dice-caption">${escapeHtml(entry.text)}</div>`;
    logInnerEl.appendChild(div);
    return;
  }
  const div = document.createElement('div');
  div.className = 'entry ' + (entry.kind || 'gm');
  div.textContent = entry.text;
  logInnerEl.appendChild(div);
}

// 주사위 굴림 연출: 두 개의 주사위 눈이 구르다가 결과로 착지
function animateDiceRoll(entry) {
  const div = document.createElement('div');
  div.className = 'entry dice rolling';
  div.innerHTML =
    '<div class="dice-faces"><span class="die">⚂</span><span class="die">⚄</span></div>' +
    `<div class="dice-caption">${t('game.rolling')}</div>`;
  logInnerEl.appendChild(div);
  scrollLog();
  const faces = div.querySelectorAll('.die');
  const caption = div.querySelector('.dice-caption');
  diceAnimating = true; // 착지할 때까지 이후 결과(서사·경험치)를 보류
  let ticks = 0;
  const iv = setInterval(() => {
    faces[0].textContent = dieFace(1 + Math.floor(Math.random() * 6));
    faces[1].textContent = dieFace(1 + Math.floor(Math.random() * 6));
    if (++ticks >= 11) {
      clearInterval(iv);
      const d = entry.dice || [1, 1];
      faces[0].textContent = dieFace(d[0]);
      faces[1].textContent = dieFace(d[1]);
      div.classList.remove('rolling');
      div.classList.add('settled');
      if (entry.tier) div.classList.add('tier-' + entry.tier);
      caption.textContent = entry.text;
      scrollLog();
      // 착지 후 짧은 여운 뒤에 보류해둔 결과를 공개
      setTimeout(flushPostDice, 350);
    }
  }, 80);
}

// ---------- 적/동료 필드 ----------
function renderField(enemies, companions) {
  lastEnemies = enemies || [];
  lastCompanions = companions || [];
  renderNpcList(enemiesEl, lastEnemies, 'enemy');
  renderNpcList(companionsEl, lastCompanions, 'ally');
}

function renderNpcList(el, list, kind) {
  el.innerHTML = '';
  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = kind === 'enemy' ? t('game.noEnemies') : t('game.noCompanions');
    el.appendChild(d);
    return;
  }
  list.forEach((n) => {
    const d = document.createElement('div');
    d.className = 'npc ' + kind;
    let html = `<div class="n-name">${escapeHtml(n.name)}</div>`;
    if (n.hp) html += `<div class="n-hp">${escapeHtml(n.hp)}</div>`;
    if (n.note) html += `<div class="n-note">${escapeHtml(n.note)}</div>`;
    d.innerHTML = html;
    el.appendChild(d);
  });
}

function scrollLog() {
  logEl.scrollTop = logEl.scrollHeight;
}

function updateStatus(c) {
  lastCharacter = c; // 언어를 바꾸면 이 값으로 상태 패널을 다시 그린다
  if (prevHp !== null && c.hp !== prevHp) flashHp(c.hp - prevHp);
  prevHp = c.hp;

  charTitle.textContent = `${c.name} · ${dw(c.className)}`;

  const level = c.level || 1;
  const xp = c.xp || 0;
  const threshold = level + 7; // 서버 xpToLevel과 동일
  levelText.textContent = level;
  xpText.textContent = `${xp}/${threshold}`;
  xpBar.style.width = Math.min(100, (xp / threshold) * 100) + '%';

  hpText.textContent = `${c.hp}/${c.maxHp}`;
  const pct = c.maxHp > 0 ? Math.max(0, (c.hp / c.maxHp) * 100) : 0;
  hpBar.style.width = pct + '%';
  armorText.textContent = t('game.armorText', { n: c.armor });

  // 장착 무기 + 태그
  if (c.weapon && c.weapon.name) {
    const tags = (c.weapon.tags || []).length
      ? `<span class="wb-tags">${c.weapon.tags.map((x) => escapeHtml(dw(x))).join(' · ')}</span>`
      : '';
    weaponBoxEl.innerHTML = `<span class="wb-label">${t('game.weapon')}</span> ${escapeHtml(dw(c.weapon.name))} ${tags}`;
    weaponBoxEl.classList.remove('hidden');
  } else {
    weaponBoxEl.classList.add('hidden');
  }

  if (coinTextEl) coinTextEl.textContent = c.coin || 0;

  statsEl.innerHTML = '';
  Object.entries(c.stats).forEach(([k, v]) => {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<div class="k">${k}</div><div class="v">${v >= 0 ? '+' + v : v}</div>`;
    statsEl.appendChild(d);
  });

  inventoryEl.innerHTML = '';
  if (!c.inventory.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = t('common.empty');
    inventoryEl.appendChild(li);
  } else {
    c.inventory.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = dw(item);
      inventoryEl.appendChild(li);
    });
  }

  // 습득 무브
  movesEl.innerHTML = '';
  const moves = c.moves || [];
  if (!moves.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = t('common.notYet');
    movesEl.appendChild(li);
  } else {
    moves.forEach((m) => {
      const li = document.createElement('li');
      li.innerHTML = `<div class="mname">${escapeHtml(dw(m.name))}</div><div class="mdesc">${escapeHtml(dw(m.desc))}</div>`;
      movesEl.appendChild(li);
    });
  }
}

// HP 변화 시 부동 숫자 + 흔들림/번쩍 효과
function flashHp(delta) {
  const statusPane = document.querySelector('.status-pane');
  const hpBlock = document.querySelector('.hp-block');
  if (hpBlock) {
    const f = document.createElement('div');
    f.className = 'float-num ' + (delta < 0 ? 'dmg' : 'heal');
    f.textContent = (delta < 0 ? '' : '+') + delta;
    hpBlock.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }
  hpBar.classList.remove('flash-dmg', 'flash-heal');
  void hpBar.offsetWidth; // 리플로우로 애니메이션 재시작
  hpBar.classList.add(delta < 0 ? 'flash-dmg' : 'flash-heal');
  if (delta < 0 && statusPane) {
    statusPane.classList.remove('shake');
    void statusPane.offsetWidth;
    statusPane.classList.add('shake');
    setTimeout(() => statusPane.classList.remove('shake'), 460);
  }
}

// ---------- 레벨업 모달 ----------
function openLevelUp(options) {
  luAbility = null;
  luMove = null;
  const improvable = (options.stats || []).filter((s) => s.canImprove);
  const moves = options.moves || [];
  luNeedStat = improvable.length > 0;
  luNeedMove = moves.length > 0;

  // 능력치 선택지
  luStats.innerHTML = '';
  (options.stats || []).forEach((s) => {
    const div = document.createElement('div');
    div.className = 'lu-stat' + (s.canImprove ? '' : ' disabled');
    div.innerHTML = `<div class="k">${s.key}</div><div class="v">${
      s.value >= 0 ? '+' + s.value : s.value
    }${s.canImprove ? ' → +' + (s.value + 1) : ''}</div>`;
    if (s.canImprove) {
      div.addEventListener('click', () => {
        luAbility = s.key;
        document
          .querySelectorAll('.lu-stat')
          .forEach((el) => el.classList.remove('selected'));
        div.classList.add('selected');
        refreshLuConfirm();
      });
    }
    luStats.appendChild(div);
  });
  if (!luNeedStat) {
    const note = document.createElement('div');
    note.style.cssText = 'color:var(--muted);font-size:0.82rem;grid-column:1/-1;';
    note.textContent = t('lu.statMax');
    luStats.appendChild(note);
  }

  // 무브 선택지
  luMoves.innerHTML = '';
  if (!luNeedMove) {
    const div = document.createElement('div');
    div.className = 'lu-move none';
    div.textContent = t('lu.moveMax');
    luMoves.appendChild(div);
  } else {
    moves.forEach((m) => {
      const div = document.createElement('div');
      div.className = 'lu-move';
      div.innerHTML = `<div class="mname">${escapeHtml(dw(m.name))}</div><div class="mdesc">${escapeHtml(dw(m.desc))}</div>`;
      div.addEventListener('click', () => {
        luMove = m.id;
        document
          .querySelectorAll('.lu-move')
          .forEach((el) => el.classList.remove('selected'));
        div.classList.add('selected');
        refreshLuConfirm();
      });
      luMoves.appendChild(div);
    });
  }

  refreshLuConfirm();
  levelupModal.classList.remove('hidden');
}

function refreshLuConfirm() {
  const ok = (!luNeedStat || luAbility) && (!luNeedMove || luMove);
  luConfirm.disabled = !ok;
}

function closeLevelUp() {
  levelupModal.classList.add('hidden');
}

luConfirm.addEventListener('click', () => {
  luConfirm.disabled = true;
  socket.emit('levelUpChoice', { ability: luAbility, moveId: luMove });
});

/**
 * 언어 전환. 스크립트가 그린 부분만 다시 그린다 —
 * **로그(서사)는 건드리지 않는다.** AI 가 그 게임의 언어로 이미 쓴 원문이고,
 * 서버에도 그대로 저장돼 있다.
 */
document.addEventListener('i18n:change', () => {
  if (classesData.length) renderClasses(classesData);
  if (selectedClass) {
    if (currentStep === 2) renderStatAssign();
    if (currentStep === 3) renderGear();
    if (currentStep === 4) renderSheetSummary();
  }
  if (lastCharacter) updateStatus(lastCharacter);
  renderNpcList(enemiesEl, lastEnemies, 'enemy');
  renderNpcList(companionsEl, lastCompanions, 'ally');
  setGameOver(gameOver);
  updateModelNote();
  updateGameModelLabel();
  if (lastSlots) renderSlots(lastSlots);
});

// ---------- 부트 ----------
App.onSettingsSaved = () => {
  updateModelNote();
  updateGameModelLabel();
};

App.start({
  app: 'play',
  socket: true,
  onSocket: (s) => {
    socket = s;
    wireSocket(s);
  },
});
