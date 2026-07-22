'use strict';

const { callGM, suggestGmActions } = require('./aiGM');
const rules = require('./rulesEngine');
const {
  createCharacter,
  ensureCharacterFields,
  getLevelUpOptions,
  applyLevelUp,
  xpToLevel,
} = require('./dungeonWorld');
const store = require('./store');

/**
 * 게임 세션 오케스트레이션.
 * MVP의 심장: "AI가 무브 판단 → 코드가 2d6 굴림 → 결과를 AI가 서사화" 2-패스 루프.
 *
 * emit(event, payload)는 소켓으로 실시간 전달하는 콜백.
 * 이벤트 종류: 'gmThinking', 'narration', 'dice', 'stateUpdate', 'systemLog', 'error'
 */

const MAX_HISTORY = 24; // API에 보내는 최근 메시지 수 (컨텍스트/토큰 관리)

class GameSession {
  constructor(userId, data) {
    this.userId = userId;
    // data: 저장본에서 복원하거나 null
    this.character = ensureCharacterFields(data?.character || null);
    this.messages = data?.messages || []; // Anthropic 형식 대화 이력
    this.log = data?.log || []; // 화면 표시용 로그 [{kind, text}]
    this.summary = data?.summary || ''; // 진행 상황 요약(현재는 최근 서사 기반)
    this.pendingLevelUp = data?.pendingLevelUp || null; // 레벨업 선택 대기 옵션
    this.enemies = data?.enemies || []; // 현재 장면의 적 NPC
    this.companions = data?.companions || []; // 현재 장면의 동료 NPC
    this.aiConfig = null; // 런타임 전용: {provider, model, apiKey} — 저장 안 함(보안)
    this.busy = false;
    // 보너스 XP 남발 방지용 (저장 안 함)
    this._turnCount = 0;
    this._lastBonusTurn = -99;
    this._missThisTurn = false;
  }

  static BONUS_XP_COOLDOWN = 5; // 성취 보너스 XP 최소 간격(턴)

  /** 사용자 AI 설정 주입 (매 요청 전 최신값으로 갱신). */
  setAiConfig(cfg) {
    this.aiConfig = cfg;
  }

  hasCharacter() {
    return !!this.character;
  }

  toJSON() {
    return {
      character: this.character,
      messages: this.messages,
      log: this.log,
      summary: this.summary,
      pendingLevelUp: this.pendingLevelUp,
      enemies: this.enemies,
      companions: this.companions,
    };
  }

  /** 화면 로그에 추가하고 이벤트로도 내보낸다. extra는 엔트리에 병합(예: {tier}). */
  _pushLog(emit, kind, text, event = 'systemLog', extra = null) {
    const entry = extra ? { kind, text, ...extra } : { kind, text };
    this.log.push(entry);
    emit(event, entry);
  }

  _recentMessages() {
    return this.messages.slice(-MAX_HISTORY);
  }

  /** 진행 요약을 최근 GM 서사로 갱신 (LLM 기억 한계를 코드가 보완). */
  _updateSummary(narration) {
    // 간단한 MVP 방식: 최근 서사 몇 개를 요약 슬롯에 유지.
    this.summary = narration.slice(0, 400);
  }

  /** 캐릭터 생성 + AI GM 오프닝 장면. */
  async createCharacter(emit, { name, classId, stats, look, gear }) {
    this.character = createCharacter(name, classId, { stats, look, gear });
    this.messages = [];
    this.log = [];
    this.summary = '';
    this.pendingLevelUp = null;
    this.enemies = [];
    this.companions = [];

    emit('stateUpdate', this.character);
    emit('fieldUpdate', { enemies: this.enemies, companions: this.companions });
    this._pushLog(
      emit,
      'system',
      `${this.character.name} (${this.character.className}) 의 모험이 시작됩니다.`
    );

    const lookLine = this.character.look ? ` 캐릭터 소개: "${this.character.look}".` : '';
    const kickoff = {
      role: 'user',
      content: `새로운 모험을 시작한다. 플레이어 캐릭터는 ${this.character.name}(${this.character.className})다.${lookLine} 이 캐릭터의 소개를 반영해 흥미로운 첫 장면을 묘사하고, 플레이어가 바로 행동할 수 있는 상황을 제시하라. 첫 장면에는 판정이 필요 없다.`,
    };
    this.messages.push(kickoff);

    await this._runGMTurn(emit, this._recentMessages(), { allowRollFollowup: false });
    store.save(this.userId, this.toJSON());
  }

  /** 플레이어 행동 처리 — 핵심 루프 진입점. */
  async playerAction(emit, text) {
    if (!this.character) {
      emit('error', { message: '먼저 캐릭터를 생성하세요.' });
      return;
    }
    if (this.pendingLevelUp) {
      emit('levelUp', this.pendingLevelUp);
      emit('error', { message: '레벨업 선택을 먼저 완료하세요.' });
      return;
    }
    const clean = String(text || '').trim();
    if (!clean) return;

    this._pushLog(emit, 'player', clean, 'narration');
    this.messages.push({ role: 'user', content: clean });

    this._turnCount += 1;
    this._missThisTurn = false;

    await this._runGMTurn(emit, this._recentMessages(), { allowRollFollowup: true });
    this._checkLevelUp(emit);
    store.save(this.userId, this.toJSON());
  }

  /** 현재 상황에서 취할 만한 행동 몇 가지를 AI에게 받아 제안한다(이야기 진행 안 함). */
  async suggestActions(emit) {
    if (!this.character) {
      emit('error', { message: '먼저 캐릭터를 생성하세요.' });
      return;
    }
    if (this.pendingLevelUp) {
      emit('levelUp', this.pendingLevelUp);
      return;
    }
    emit('gmThinking', { on: true });
    try {
      const suggestions = await suggestGmActions(this, this._recentMessages());
      emit('suggestions', { items: suggestions });
    } catch (e) {
      console.error('행동 제안 실패:', e);
      emit('error', { message: '행동 제안 실패: ' + e.message });
    } finally {
      emit('gmThinking', { on: false });
    }
  }

  /** XP가 임계값 이상이면 레벨업 선택지를 띄운다(선택 완료 전까지 행동 차단). */
  _checkLevelUp(emit) {
    if (this.pendingLevelUp) return;
    if (this.character.xp >= xpToLevel(this.character.level)) {
      this.pendingLevelUp = getLevelUpOptions(this.character);
      this._pushLog(emit, 'system', '⭐ 레벨업! 성장 방향을 선택하세요.');
      emit('levelUp', this.pendingLevelUp);
    }
  }

  /** 플레이어의 레벨업 선택을 검증·반영. */
  levelUpChoice(emit, { ability, moveId }) {
    if (!this.pendingLevelUp) return;
    const result = applyLevelUp(this.character, { ability, moveId });
    this.pendingLevelUp = null;
    if (result) {
      const parts = [`레벨 ${result.level} 달성`];
      if (result.statUp) parts.push(`${result.statUp} +1`);
      if (result.move) parts.push(`무브 습득: ${result.move.name}`);
      this._pushLog(emit, 'state', `⭐ ${parts.join(' · ')}`);
    }
    emit('stateUpdate', this.character);
    emit('levelUpDone', {});
    // 남은 XP로 연속 레벨업이 가능하면 다시 띄운다.
    this._checkLevelUp(emit);
    store.save(this.userId, this.toJSON());
  }

  /**
   * GM 한 턴 실행. 필요 시 주사위 판정 → 2차 서사화까지 진행.
   * @param {boolean} allowRollFollowup  roll 요청 시 판정+2차 서사를 수행할지
   */
  async _runGMTurn(emit, messages, { allowRollFollowup }) {
    emit('gmThinking', { on: true });
    let result;
    try {
      result = await callGM(this, messages);
    } catch (e) {
      emit('gmThinking', { on: false });
      console.error('AI GM 호출 실패:', e);
      emit('error', { message: 'AI GM 호출 실패: ' + e.message });
      return;
    }
    emit('gmThinking', { on: false });

    // 1차 서사 출력
    if (result.narration) {
      this._pushLog(emit, 'gm', result.narration, 'narration');
      this.messages.push({ role: 'assistant', content: result.narration });
      this._updateSummary(result.narration);
    }

    const action = result.action;

    // 적/동료 목록 변화 반영 (모든 응답 유형에서 가능)
    this._applyFieldUpdate(emit, action);

    // GM 성취 보너스 XP — 실패 턴엔 금지 + 최소 간격(쿨다운)으로 남발 방지
    if (
      action.xpGain &&
      action.xpGain > 0 &&
      !this._missThisTurn &&
      this._turnCount - this._lastBonusTurn >= GameSession.BONUS_XP_COOLDOWN
    ) {
      this._lastBonusTurn = this._turnCount;
      this.character.xp += action.xpGain;
      emit('stateUpdate', this.character);
      this._pushLog(emit, 'state', `✨ 경험치 +${action.xpGain} (성취)`);
    }

    if (action.type === 'update_state') {
      this._applyAndEmit(emit, action);
      return;
    }

    if (action.type === 'roll' && allowRollFollowup) {
      await this._resolveRoll(emit, action);
      return;
    }
    // type === 'none' 또는 roll 미허용: 종료
  }

  /** 적/동료 목록 변화를 반영한다. null이면 유지, 배열이면 교체. */
  _applyFieldUpdate(emit, action) {
    let changed = false;
    if (Array.isArray(action.enemies)) {
      this.enemies = action.enemies;
      changed = true;
    }
    if (Array.isArray(action.companions)) {
      this.companions = action.companions;
      changed = true;
    }
    if (changed) {
      emit('fieldUpdate', { enemies: this.enemies, companions: this.companions });
    }
  }

  /** 판정 요청을 코드가 굴리고, 결과를 다시 AI에 먹여 서사화한다. */
  async _resolveRoll(emit, action) {
    const roll = rules.resolveMove(action.stat, this.character);
    const moveName = action.move || '판정';

    // 주사위 결과를 로그에 구분 표시 (tier/주사위눈 포함 → 클라 애니메이션)
    this._pushLog(
      emit,
      'dice',
      `${moveName} — ${rules.formatRoll(roll)}`,
      'dice',
      { tier: roll.tier, dice: roll.dice }
    );

    // 던전 월드: 6- 실패에서 경험치 획득 ("실패에서 배운다")
    if (roll.tier === 'miss') {
      this._missThisTurn = true; // 이 턴엔 보너스 XP 금지(중복 방지)
      this.character.xp += 1;
      emit('stateUpdate', this.character);
      this._pushLog(emit, 'state', '✨ 경험치 +1 (실패에서 배운다)');
    }

    // 2차 패스: 판정 결과를 시스템 메시지로 AI에 전달 → 결과 서사 요청
    const rollInfo =
      `[시스템 판정 결과] 무브: ${moveName}, 능력치: ${roll.stat || '없음'}, ` +
      `굴림: 2d6+(${roll.mod}) = [${roll.dice.join(',')}] = ${roll.total}, ` +
      `구간: ${roll.tier} (${roll.tierLabel}). ` +
      `이 결과에 맞는 서사를 만들어라. 피해/회복/아이템 변화가 있으면 action.type="update_state"로 요청하라. 추가 판정은 요청하지 마라(action.type은 update_state 또는 none).`;

    this.messages.push({ role: 'user', content: rollInfo });

    // 2차 서사는 추가 roll을 허용하지 않는다(무한 루프 방지).
    await this._runGMTurn(emit, this._recentMessages(), { allowRollFollowup: false });
  }

  /** 상태 변경을 검증·반영하고 상태창 갱신 + 로그. */
  _applyAndEmit(emit, action) {
    const applied = rules.applyStateUpdate(this.character, action);
    const changeText = rules.formatStateChange(applied);
    emit('stateUpdate', this.character);
    if (changeText) {
      this._pushLog(emit, 'state', changeText, 'systemLog');
    }
    if (this.character.hp <= 0) {
      this._pushLog(emit, 'system', '⚠️ HP가 0이 되었습니다. 위태로운 상황입니다...');
    }
  }
}

module.exports = { GameSession };
