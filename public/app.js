/* global io */
'use strict';

const socket = io();

// DOM
const setupEl = document.getElementById('setup');
const gameEl = document.getElementById('game');
const classListEl = document.getElementById('classList');
const charNameEl = document.getElementById('charName');
const startBtn = document.getElementById('startBtn');

const logEl = document.getElementById('log');
const thinkingEl = document.getElementById('thinking');
const inputForm = document.getElementById('inputForm');
const actionInput = document.getElementById('actionInput');
const sendBtn = document.getElementById('sendBtn');
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

let selectedClass = null;
let luAbility = null; // 선택한 능력치 key
let luMove = null; // 선택한 무브 id
let luNeedStat = false;
let luNeedMove = false;

// ---------- 초기화 ----------
socket.on('init', (data) => {
  modelNote.textContent = `모델: ${data.model}`;
  renderClasses(data.classes);
  if (data.hasCharacter) {
    showGame();
    if (data.character) updateStatus(data.character);
    logEl.innerHTML = '';
    (data.log || []).forEach(renderLogEntry);
    scrollLog();
  } else {
    showSetup();
  }
});

socket.on('reset', () => {
  logEl.innerHTML = '';
  closeLevelUp();
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

// ---------- 캐릭터 생성 ----------
function renderClasses(classes) {
  classListEl.innerHTML = '';
  classes.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'class-card';
    div.dataset.id = c.id;
    const statLine = Object.entries(c.stats)
      .map(([k, v]) => `${k} ${v >= 0 ? '+' + v : v}`)
      .join('  ');
    div.innerHTML = `<div class="cname">${c.name}</div>
      <div class="cdesc">${c.description}</div>
      <div class="cstats">HP ${c.maxHp} · ${statLine}</div>`;
    div.addEventListener('click', () => {
      document
        .querySelectorAll('.class-card')
        .forEach((el) => el.classList.remove('selected'));
      div.classList.add('selected');
      selectedClass = c.id;
    });
    classListEl.appendChild(div);
  });
}

startBtn.addEventListener('click', () => {
  const name = charNameEl.value.trim();
  if (!name) return alert('캐릭터 이름을 입력하세요.');
  if (!selectedClass) return alert('클래스를 선택하세요.');
  startBtn.disabled = true;
  showGame();
  logEl.innerHTML = '';
  socket.emit('createCharacter', { name, classId: selectedClass });
});

// ---------- 플레이어 입력 ----------
inputForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = actionInput.value.trim();
  if (!text) return;
  actionInput.value = '';
  socket.emit('playerAction', { text });
});

newGameBtn.addEventListener('click', () => {
  if (confirm('현재 진행을 지우고 새 게임을 시작할까요?')) {
    selectedClass = null;
    charNameEl.value = '';
    startBtn.disabled = false;
    document
      .querySelectorAll('.class-card')
      .forEach((el) => el.classList.remove('selected'));
    socket.emit('resetGame');
  }
});

function setBusy(busy) {
  sendBtn.disabled = busy;
  actionInput.disabled = busy;
  if (!busy) actionInput.focus();
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
