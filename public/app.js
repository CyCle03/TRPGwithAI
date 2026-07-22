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
let selectedGear = []; // 선택한 장비 id 배열
const TOTAL_STEPS = 4;

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
    renderField(data.enemies, data.companions);
    logInnerEl.innerHTML = '';
    (data.log || []).forEach(renderLogEntry);
    scrollLog();
  } else {
    resetWizard();
    showSetup();
  }
});

socket.on('reset', () => {
  logInnerEl.innerHTML = '';
  renderField([], []);
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
socket.on('fieldUpdate', ({ enemies, companions }) => {
  renderField(enemies, companions);
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
  selectedGear = [];
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
    const moveNames = (c.moves || []).map((m) => m.name).join(', ');
    div.innerHTML = `<div class="cname">${c.name}</div>
      <div class="cdesc">${c.description}</div>
      <div class="cstats">HP ${c.maxHp} · 방어구 ${c.armor} · d${c.damageDie} · ${statLine}</div>
      <div class="cmoves">배울 기술: ${moveNames}</div>`;
    div.addEventListener('click', () => {
      document
        .querySelectorAll('.class-card')
        .forEach((el) => el.classList.remove('selected'));
      div.classList.add('selected');
      selectedClass = c.id;
      customStats = null; // 클래스 바뀌면 배분 초기화
      selectedGear = []; // 클래스 바뀌면 장비 초기화
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

function gearPicksFor() {
  const cls = getClass(selectedClass);
  return cls ? cls.gearPicks || 2 : 2;
}

function updateNav() {
  prevBtn.classList.toggle('hidden', currentStep === 1);
  nextBtn.classList.toggle('hidden', currentStep === TOTAL_STEPS);
  startBtn.classList.toggle('hidden', currentStep !== TOTAL_STEPS);

  let ok = true;
  if (currentStep === 1) ok = !!selectedClass;
  if (currentStep === 2) ok = statMode === 'recommend' || isCustomValid();
  if (currentStep === 3) ok = selectedGear.length === gearPicksFor();
  if (currentStep === 4) ok = charNameEl.value.trim().length > 0;
  nextBtn.disabled = !ok;
  startBtn.disabled = !ok;
}

// --- 장비 선택 + 배울 기술 ---
function renderGear() {
  const cls = getClass(selectedClass);
  if (!cls) return;
  const picks = gearPicksFor();

  // 기본(고정) 장비
  baseGearEl.innerHTML = `<span class="bg-label">기본 장비:</span> ${cls.inventory.join(', ')}`;

  // 선택 장비 후보
  gearHintEl.textContent = `기본 장비에 더해 아래에서 ${picks}개를 고르세요.`;
  gearOptionsEl.innerHTML = '';
  (cls.gearOptions || []).forEach((g) => {
    const chip = document.createElement('div');
    const picked = selectedGear.includes(g.id);
    const full = selectedGear.length >= picks && !picked;
    chip.className = 'gear-chip' + (picked ? ' selected' : full ? ' disabled' : '');
    chip.textContent = g.name;
    if (!full || picked) {
      chip.addEventListener('click', () => {
        if (selectedGear.includes(g.id)) {
          selectedGear = selectedGear.filter((x) => x !== g.id);
        } else if (selectedGear.length < picks) {
          selectedGear.push(g.id);
        }
        renderGear();
        updateNav();
      });
    }
    gearOptionsEl.appendChild(chip);
  });
  gearCountEl.textContent = `(${selectedGear.length}/${picks})`;

  // 배울 수 있는 기술
  learnMovesEl.innerHTML = '';
  (cls.moves || []).forEach((m) => {
    const div = document.createElement('div');
    div.className = 'learn-move';
    div.innerHTML = `<div class="lm-name">${m.name}</div><div class="lm-desc">${m.desc}</div>`;
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
  const pickedNames = selectedGear
    .map((id) => (cls.gearOptions || []).find((o) => o.id === id))
    .filter(Boolean)
    .map((o) => o.name);
  const allGear = [...cls.inventory, ...pickedNames];
  const moveNames = (cls.moves || []).map((m) => m.name).join(', ');
  sheetSummaryEl.innerHTML =
    `<div><span class="lbl">클래스</span> ${cls.name}</div>` +
    `<div><span class="lbl">HP</span> ${cls.maxHp} · <span class="lbl">방어구</span> ${cls.armor} · <span class="lbl">피해</span> d${cls.damageDie}</div>` +
    `<div><span class="lbl">능력치</span> ${statLine}</div>` +
    `<div><span class="lbl">장비</span> ${allGear.join(', ')}</div>` +
    `<div><span class="lbl">배울 기술</span> ${moveNames}</div>`;
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
  logInnerEl.innerHTML = '';
  renderField([], []);
  const payload = {
    name,
    classId: selectedClass,
    look: charLookEl.value.trim(),
    gear: selectedGear,
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
  logInnerEl.appendChild(div);
}

// ---------- 적/동료 필드 ----------
function renderField(enemies, companions) {
  renderNpcList(enemiesEl, enemies || [], 'enemy');
  renderNpcList(companionsEl, companions || [], 'ally');
}

function renderNpcList(el, list, kind) {
  el.innerHTML = '';
  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = kind === 'enemy' ? '(적 없음)' : '(동료 없음)';
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
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
