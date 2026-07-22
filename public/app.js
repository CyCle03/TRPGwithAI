/* global io */
'use strict';

const socket = io();

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
const sheetSummaryEl = document.getElementById('sheetSummary');

const logEl = document.getElementById('log');
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
const statsEl = document.getElementById('stats');
const inventoryEl = document.getElementById('inventory');
const movesEl = document.getElementById('moves');
const modelNote = document.getElementById('modelNote');

// 레벨업 모달
const levelupModal = document.getElementById('levelupModal');
const luStats = document.getElementById('luStats');
const luMoves = document.getElementById('luMoves');
const luConfirm = document.getElementById('luConfirm');

// 위저드 상태
let classesData = [];
let statKeys = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
let standardArray = [2, 1, 1, 0, -1, -1];
let currentStep = 1;
let selectedClass = null;
let statMode = 'recommend'; // 'recommend' | 'custom'
let customStats = null; // {STR:.., ...}

let luAbility = null; // 선택한 능력치 key
let luMove = null; // 선택한 무브 id
let luNeedStat = false;
let luNeedMove = false;

// ---------- 초기화 ----------
socket.on('init', (data) => {
  modelNote.textContent = `모델: ${data.model}`;
  classesData = data.classes || [];
  if (Array.isArray(data.statKeys)) statKeys = data.statKeys;
  if (Array.isArray(data.standardArray)) standardArray = data.standardArray;
  renderClasses(classesData);
  if (data.hasCharacter) {
    showGame();
    if (data.character) updateStatus(data.character);
    logEl.innerHTML = '';
    (data.log || []).forEach(renderLogEntry);
    scrollLog();
  } else {
    resetWizard();
    showSetup();
  }
});

socket.on('reset', () => {
  logEl.innerHTML = '';
  closeLevelUp();
  clearSuggestions();
  resetWizard();
  showSetup();
});

// ---------- 스트리밍 이벤트 ----------
socket.on('narration', (entry) => {
  renderLogEntry(entry);
  scrollLog();
});
socket.on('dice', (entry) => {
  renderLogEntry(entry);
  scrollLog();
});
socket.on('systemLog', (entry) => {
  renderLogEntry(entry);
  scrollLog();
});
socket.on('stateUpdate', (character) => {
  updateStatus(character);
});
socket.on('gmThinking', ({ on }) => {
  thinkingEl.classList.toggle('hidden', !on);
  setBusy(on);
});
socket.on('levelUp', (options) => {
  openLevelUp(options);
});
socket.on('levelUpDone', () => {
  closeLevelUp();
});
socket.on('suggestions', ({ items }) => {
  renderSuggestions(items || []);
});
socket.on('error', ({ message }) => {
  renderLogEntry({ kind: 'system', text: '⚠️ ' + message });
  scrollLog();
  setBusy(false);
  thinkingEl.classList.add('hidden');
});

// ---------- 화면 전환 ----------
function showSetup() {
  setupEl.classList.remove('hidden');
  gameEl.classList.add('hidden');
}
function showGame() {
  setupEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
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
    div.innerHTML = `<div class="cname">${c.name}</div>
      <div class="cdesc">${c.description}</div>
      <div class="cstats">HP ${c.maxHp} · 방어구 ${c.armor} · d${c.damageDie} · ${statLine}</div>`;
    div.addEventListener('click', () => {
      document
        .querySelectorAll('.class-card')
        .forEach((el) => el.classList.remove('selected'));
      div.classList.add('selected');
      selectedClass = c.id;
      customStats = null; // 클래스 바뀌면 배분 초기화
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
  if (step === 3) renderSheetSummary();
  updateNav();
}

function updateNav() {
  prevBtn.classList.toggle('hidden', currentStep === 1);
  nextBtn.classList.toggle('hidden', currentStep === 3);
  startBtn.classList.toggle('hidden', currentStep !== 3);

  let ok = true;
  if (currentStep === 1) ok = !!selectedClass;
  if (currentStep === 2) ok = statMode === 'recommend' || isCustomValid();
  if (currentStep === 3) ok = charNameEl.value.trim().length > 0;
  nextBtn.disabled = !ok;
  startBtn.disabled = !ok;
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
    statHintEl.textContent = `${cls.name}의 추천 능력치입니다.`;
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
    statHintEl.textContent = '유효한 배치입니다. (표준 배열 사용)';
  } else {
    const parts = Object.keys(need)
      .sort((a, b) => b - a)
      .map((v) => `${fmtMod(Number(v))}×${need[v]}`)
      .join(', ');
    statHintEl.classList.add('error');
    statHintEl.textContent = `표준 배열을 정확히 사용하세요: ${parts}`;
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
  sheetSummaryEl.innerHTML =
    `<div><span class="lbl">클래스</span> ${cls.name}</div>` +
    `<div><span class="lbl">HP</span> ${cls.maxHp} · <span class="lbl">방어구</span> ${cls.armor} · <span class="lbl">피해</span> d${cls.damageDie}</div>` +
    `<div><span class="lbl">능력치</span> ${statLine}</div>` +
    `<div><span class="lbl">시작 장비</span> ${cls.inventory.join(', ')}</div>`;
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
  showGame();
  logEl.innerHTML = '';
  const payload = { name, classId: selectedClass, look: charLookEl.value.trim() };
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
  if (confirm('현재 진행을 지우고 새 게임을 시작할까요?')) {
    clearSuggestions();
    socket.emit('resetGame');
  }
});

function setBusy(busy) {
  sendBtn.disabled = busy;
  suggestBtn.disabled = busy;
  actionInput.disabled = busy;
  if (!busy) actionInput.focus();
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
function renderLogEntry(entry) {
  const div = document.createElement('div');
  div.className = 'entry ' + (entry.kind || 'gm');
  div.textContent = entry.text;
  logEl.appendChild(div);
}

function scrollLog() {
  logEl.scrollTop = logEl.scrollHeight;
}

function updateStatus(c) {
  charTitle.textContent = `${c.name} · ${c.className}`;

  const level = c.level || 1;
  const xp = c.xp || 0;
  const threshold = level + 7; // 서버 xpToLevel과 동일
  levelText.textContent = level;
  xpText.textContent = `${xp}/${threshold}`;
  xpBar.style.width = Math.min(100, (xp / threshold) * 100) + '%';

  hpText.textContent = `${c.hp}/${c.maxHp}`;
  const pct = c.maxHp > 0 ? Math.max(0, (c.hp / c.maxHp) * 100) : 0;
  hpBar.style.width = pct + '%';
  armorText.textContent = `방어구 ${c.armor}`;

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
    li.textContent = '(비어 있음)';
    inventoryEl.appendChild(li);
  } else {
    c.inventory.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      inventoryEl.appendChild(li);
    });
  }

  // 습득 무브
  movesEl.innerHTML = '';
  const moves = c.moves || [];
  if (!moves.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '(아직 없음)';
    movesEl.appendChild(li);
  } else {
    moves.forEach((m) => {
      const li = document.createElement('li');
      li.innerHTML = `<div class="mname">${m.name}</div><div class="mdesc">${m.desc}</div>`;
      movesEl.appendChild(li);
    });
  }

  // 변경 강조
  hpText.classList.add('flash');
  setTimeout(() => hpText.classList.remove('flash'), 900);
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
    note.textContent = '모든 능력치가 최대치입니다.';
    luStats.appendChild(note);
  }

  // 무브 선택지
  luMoves.innerHTML = '';
  if (!luNeedMove) {
    const div = document.createElement('div');
    div.className = 'lu-move none';
    div.textContent = '더 습득할 무브가 없습니다.';
    luMoves.appendChild(div);
  } else {
    moves.forEach((m) => {
      const div = document.createElement('div');
      div.className = 'lu-move';
      div.innerHTML = `<div class="mname">${m.name}</div><div class="mdesc">${m.desc}</div>`;
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
