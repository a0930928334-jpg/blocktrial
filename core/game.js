// 单局状态机。所有操作都把结果写进事件队列，由场景转成动画和音效。
// phase：
//   playing   正常游戏
//   relicPick 等待三选一
//   stuck     没有方块放得下，等玩家在面板上选择：炸弹、换一组、复活、放弃
//   over      本局结束
(function () {
  'use strict';

  class Game {
    // opts: { mode: 'classic'|'relic'|'daily', seed, config?, best?, dynamic? }
    // best：这个模式的个人最高分，dynamic：是否使用动态发牌
    constructor(opts) {
      this.mode = opts.mode;
      this.seed = opts.seed >>> 0;
      this.cfg = opts.config || BG.Config;
      this.relicMode = this.mode !== 'classic';
      this.fixedSequence = this.mode === 'daily';
      this.best = opts.best || 0;

      this.board = new BG.Board(this.cfg.board.size);
      this.gen = new BG.Generator(this.seed, this.fixedSequence, this.cfg);
      this.relicPool = BG.Relics.poolFor(this.fixedSequence);
      this.director = new BG.DealDirector({
        mode: this.mode,
        daily: this.fixedSequence,
        best: this.best,
        dynamic: opts.dynamic === undefined ? this.cfg.dealer.enabled : opts.dynamic
      }, this.cfg);

      this.phase = 'playing';
      this.events = [];
      this.score = 0;
      this.elapsedMs = 0;
      this.placements = 0;
      this.linesCleared = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.noClearStreak = 0;
      this.endReason = null;
      this.endType = null;

      this.relics = [];
      this.relicStats = { picked: {}, triggered: {} };
      this.tierIndex = 0;
      this.pendingTiers = [];
      this.offer = null;

      this.hold = null;
      this.holdUnlocked = false;
      this.bombs = 0;
      this.bombsGained = 0;
      this.bombsUsed = 0;
      this.clearsForBomb = 0;

      this.swapsUsed = 0;
      this.revivesUsed = 0;
      this.refreshesUsed = 0;
      this.stuckLog = [];
      this.currentStuck = null;
      this.firstRelicStep = null;
      this.firstRelicMs = null;
      this.rushStartStep = null;
      this.rushStartMs = 0;
      this.revivePhase = null;
      this.placementsAtRevive = 0;
      this.ads = BG.Stats.emptyAds();

      this.groupIndex = 0;
      this.rerollNo = 0;
      this.dealPending = false;
      this.dealLog = [];
      this.currentDeal = null;
      this.tray = [];
      this._deal();
    }

    has(id) {
      return this.relics.indexOf(id) !== -1;
    }

    _hasFn() {
      const self = this;
      return function (id) { return self.has(id); };
    }

    _ctx() {
      return { score: this.score, groupIndex: this.groupIndex, has: this._hasFn() };
    }

    currentWeights() {
      return this.gen.weights(this._ctx());
    }

    _emit(type, data) {
      this.events.push(Object.assign({ type: type }, data));
    }

    drainEvents() {
      const out = this.events;
      this.events = [];
      return out;
    }

    // 只有正常游戏时才累计用时
    tick(dtMs) {
      if (this.phase === 'playing' || this.phase === 'stuck') this.elapsedMs += dtMs;
    }

    canAct() {
      return this.phase === 'playing' || this.phase === 'stuck';
    }

    // ---------- 发牌 ----------

    _deal() {
      const phase = this.director.next(this.placements, this.score);
      const count = this.cfg.board.traySize;
      let picked = null;
      if (phase !== 'daily' && phase !== 'off') picked = this._pickDynamic(phase, count);
      if (picked) {
        this.tray = picked.pieces;
      } else {
        const needSafe = phase === 'warmup' || phase === 'trial' || phase === 'sprint';
        this.tray = needSafe
          ? this.gen.drawSmallGuaranteed(this.board, count, this.cfg.dealer.fallbackMaxCells, this.groupIndex)
          : this.gen.draw(this.board, count, 'group', this.groupIndex, this._ctx());
      }
      const metrics = picked ? picked.metrics : BG.Dealer.evaluate(this.board, this.tray, this.cfg);
      this.currentDeal = {
        phase: phase,
        difficulty: metrics.difficulty,
        fits: metrics.fits,
        solvable: metrics.solvable,
        maxLines: metrics.maxLines
      };
      this.dealLog.push(Object.assign({}, this.currentDeal));
      this.groupIndex++;
      this._emit('dealt', {});
      if (this.has('smallPiece')) this._trigger('smallPiece', { at: 'tray' });
    }

    _pickDynamic(phase, count) {
      const d = this.cfg.dealer;
      const ctx = this._ctx();
      if (phase === 'normal') ctx.bigMult = BG.Dealer.normalBigMult(this.placements, this.cfg, this.mode);
      const weights = this.gen.weights(ctx);
      const budget = { left: d.dealNodeBudget };
      const candidates = [];
      for (let i = 0; i < d.candidates; i++) {
        const rng = new BG.RNG(BG.RNG.derive(this.seed, 'dynamic', this.groupIndex, i));
        const pieces = this.gen.rollGroup(rng, weights, count, ctx);
        candidates.push({ pieces: pieces, metrics: BG.Dealer.evaluate(this.board, pieces, this.cfg, budget) });
      }
      const pickRng = new BG.RNG(BG.RNG.derive(this.seed, 'dynamicPick', this.groupIndex));
      return BG.Dealer.select(phase, candidates, pickRng, this.cfg, this.placements, this.mode);
    }

    // ---------- 托盘 ----------

    _trayEmpty() {
      return this.tray.every(function (p) { return !p; });
    }

    _normalizeTray() {
      while (this.tray.length > this.cfg.board.traySize && !this.tray[this.tray.length - 1]) {
        this.tray.pop();
      }
    }

    _addToTray(piece) {
      const slot = this.tray.indexOf(null);
      if (slot !== -1) this.tray[slot] = piece;
      else this.tray.push(piece);
    }

    _pieceFrom(source) {
      return source === 'hold' ? this.hold : this.tray[source];
    }

    _takeFrom(source) {
      if (source === 'hold') this.hold = null;
      else this.tray[source] = null;
    }

    _rerollTray() {
      const count = this.tray.filter(Boolean).length;
      this.rerollNo++;
      this.tray = this.gen.draw(this.board, count, 'reroll', this.groupIndex + ':' + this.rerollNo, this._ctx());
      const metrics = BG.Dealer.evaluate(this.board, this.tray, this.cfg);
      this.currentDeal.solvable = metrics.solvable;
      while (this.tray.length < this.cfg.board.traySize) this.tray.push(null);
      this._emit('rerolled', {});
    }

    // ---------- 放置 ----------

    canPlace(source, r, c) {
      const piece = this._pieceFrom(source);
      return !!piece && this.board.canPlace(piece.shape, r, c);
    }

    previewLines(source, r, c) {
      return this.board.previewLines(this._pieceFrom(source).shape, r, c);
    }

    // source：托盘下标，或 'hold'
    place(source, r, c) {
      if (!this.canAct() || !this.canPlace(source, r, c)) return false;
      const piece = this._pieceFrom(source);
      const shape = piece.shape;

      this.board.place(shape, r, c, piece.color);
      this._takeFrom(source);
      this.placements++;
      this._emit('placed', {
        color: piece.color,
        cells: shape.cells.map(function (p) { return { r: r + p[0], c: c + p[1] }; })
      });

      const lines = this.board.findFullLines();
      const removed = this.board.clearLines(lines);
      const emptied = lines.length > 0 && this.board.isEmpty();

      this._updateCombo(lines.length);
      const result = BG.Scoring.compute({
        cellCount: shape.count,
        lines: lines,
        combo: this.combo,
        emptied: emptied,
        has: this._hasFn()
      }, this.cfg);
      const prevScore = this.score;
      this.score += result.total;
      this.linesCleared += lines.length;
      this.director.onScore(prevScore, this.score);

      if (lines.length > 0) {
        this._emit('cleared', {
          lines: lines,
          removed: removed,
          combo: this.combo,
          emptied: emptied,
          total: result.total
        });
      }
      this._emit('scored', { total: result.total, detail: result });
      this._emitScoreTriggers(result.triggers, result.details, lines, removed);

      this._tickRelicCounters(lines.length, removed);
      this._normalizeTray();

      // 先看有没有过阶梯：选完遗物再发牌，遗物和考验期才能作用到这组牌
      this._checkTiers();
      if (this.phase === 'over') return true;
      if (this._trayEmpty()) {
        if (this.phase === 'relicPick') this.dealPending = true;
        else this._deal();
      }
      this._afterChange();
      return true;
    }

    _updateCombo(lineCount) {
      if (lineCount > 0) {
        this.combo++;
        this.noClearStreak = 0;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        return;
      }
      this.noClearStreak++;
      if (this.noClearStreak >= this.cfg.combo.graceNoClear) {
        this.combo = 0;
        this.noClearStreak = 0;
      }
    }

    _tickRelicCounters(lineCount, removed) {
      if (!this.has('timeBomb') || lineCount === 0 || this.bombsFull()) return;
      this.clearsForBomb++;
      if (this.clearsForBomb >= this.cfg.relic.bombEvery) {
        this.clearsForBomb = 0;
        this.bombs++;
        this.bombsGained++;
        this._trigger('timeBomb', this._centerOf(removed));
      }
    }

    // 持有满时获取进度暂停，用掉一颗后接着累计
    bombsFull() {
      return this.bombs >= this.cfg.relic.bombMax;
    }

    bombProgress() {
      return { value: this.clearsForBomb, of: this.cfg.relic.bombEvery, full: this.bombsFull() };
    }

    // ---------- 遗物生效 ----------

    _centerOf(cells) {
      let sumR = 0;
      let sumC = 0;
      cells.forEach(function (p) { sumR += p.r; sumC += p.c; });
      return { r: sumR / cells.length, c: sumC / cells.length };
    }

    _trigger(id, pos) {
      const stats = this.relicStats.triggered;
      stats[id] = (stats[id] || 0) + 1;
      this._emit('relicTriggered', Object.assign({ id: id, text: BG.Relics.byId[id].trigger() }, pos));
    }

    _emitScoreTriggers(ids, details, lines, removed) {
      const mid = (this.board.size - 1) / 2;
      ids.forEach(function (id) {
        let pos = removed.length > 0 ? this._centerOf(removed) : { r: mid, c: mid };
        if (id === 'edge') {
          const edge = lines.find(function (l) { return l.index === 0 || l.index === this.board.size - 1; }, this);
          pos = edge.type === 'row' ? { r: edge.index, c: mid } : { r: mid, c: edge.index };
        } else if (id === 'crossCut') {
          const row = lines.find(function (l) { return l.type === 'row'; });
          const col = lines.find(function (l) { return l.type === 'col'; });
          pos = { r: row.index, c: col.index };
        } else if (id === 'clearBoard') {
          pos = { r: mid, c: mid };
        }
        this._trigger(id, Object.assign({ stamp: details[id].stamp, formula: details[id].formula }, pos));
      }, this);
    }

    // ---------- 阶梯与遗物 ----------

    _checkTiers() {
      if (!this.relicMode) return;
      const tiers = this.cfg.relic.tiers;
      const last = tiers.length - 1;
      while (this.tierIndex <= last && this.score >= tiers[this.tierIndex]) {
        if (this.tierIndex === last) {
          this.tierIndex++;
          if (!this.fixedSequence) {
            this.endGame('clear');
            return;
          }
          // 每日挑战到达最后一档不结束，继续冲分直到卡死，用最终分数比较
          this.rushStartStep = this.placements;
          this.rushStartMs = this.elapsedMs;
          this._emit('rushStart', {});
          break;
        }
        if (this.firstRelicStep === null) {
          this.firstRelicStep = this.placements;
          this.firstRelicMs = Math.round(this.elapsedMs);
        }
        this.pendingTiers.push(this.tierIndex);
        this.tierIndex++;
        this.director.onTier();
      }
      if (this.pendingTiers.length > 0 && this.phase !== 'relicPick') this._nextOffer();
    }

    _nextOffer() {
      while (this.pendingTiers.length > 0) {
        const tier = this.pendingTiers.shift();
        const ids = this.gen.offer(tier, 0, this.relics, this.relicPool);
        if (ids.length > 0) {
          this.offer = { tier: tier, refreshNo: 0, ids: ids };
          this.phase = 'relicPick';
          this._emit('relicOffer', { tier: tier });
          return true;
        }
      }
      return false;
    }

    // 候选池里还有别的遗物时，刷新才有意义。每次三选一只给一次广告机会。
    canRefreshOffer() {
      if (!this.offer || this.offer.refreshTried) return false;
      if (this.offer.refreshNo >= this.cfg.ads.offerRefreshLimit) return false;
      if (this.refreshesUsed >= this.cfg.ads.offerRefreshPerGame) return false;
      const owned = this.relics;
      const avail = this.relicPool.filter(function (id) { return owned.indexOf(id) === -1; });
      return avail.length > this.offer.ids.length;
    }

    refreshOffer() {
      if (!this.canRefreshOffer()) return false;
      this.offer.refreshNo++;
      this.refreshesUsed++;
      this.offer.ids = this.gen.offer(this.offer.tier, this.offer.refreshNo, this.relics, this.relicPool);
      return true;
    }

    // 中途关闭了刷新广告
    noteRefreshAbandoned() {
      if (this.offer) this.offer.refreshTried = true;
    }

    pickRelic(id) {
      if (this.phase !== 'relicPick' || this.offer.ids.indexOf(id) === -1) return false;
      const tier = this.offer.tier;
      this._grantRelic(id);
      const picked = this.relicStats.picked;
      picked[id] = (picked[id] || 0) + 1;
      const t = this.cfg.dealer.trial;
      const rng = new BG.RNG(BG.RNG.derive(this.seed, 'trial', tier));
      this.director.onRelicPicked(t.minGroups + rng.int(t.maxGroups - t.minGroups + 1));
      this.offer = null;
      if (this._nextOffer()) return true;
      this.phase = 'playing';
      if (this.dealPending) {
        this.dealPending = false;
        this._deal();
      }
      this._afterChange();
      return true;
    }

    _grantRelic(id) {
      this.relics.push(id);
      if (id === 'holdSlot') this.holdUnlocked = true;
      this._emit('relicGained', { id: id });
    }

    // ---------- 道具 ----------

    // 把托盘里的方块放进暂存格；暂存格有方块时互换
    stash(trayIndex) {
      if (!this.canAct() || !this.holdUnlocked || !this.tray[trayIndex]) return false;
      const piece = this.tray[trayIndex];
      this.tray[trayIndex] = this.hold;
      this.hold = piece;
      this._trigger('holdSlot', { at: 'hold' });
      this._normalizeTray();
      if (this._trayEmpty()) this._deal();
      this._afterChange();
      return true;
    }

    // 把暂存的方块取回托盘
    unstash() {
      if (!this.canAct() || !this.hold) return false;
      this._addToTray(this.hold);
      this.hold = null;
      this._afterChange();
      return true;
    }

    useBomb(r, c) {
      if (!this.canAct() || this.bombs <= 0) return false;
      this.bombs--;
      this.bombsUsed++;
      this._noteStuckChoice('bomb');
      const removed = this.board.clearArea(r, c, this.cfg.relic.bombRadius);
      this._emit('bombed', { r: r, c: c, removed: removed });
      this._afterChange();
      return true;
    }

    swapsLeft() {
      return this.cfg.ads.swapTrayLimit - this.swapsUsed;
    }

    // 看完激励视频后调用
    swapTray() {
      if (!this.canAct() || this.swapsLeft() <= 0 || this._trayEmpty()) return false;
      this.swapsUsed++;
      this._noteStuckChoice('swap');
      this._rerollTray();
      this._afterChange();
      return true;
    }

    // ---------- 结束与复活 ----------

    _anyPieceFits() {
      const board = this.board;
      const pieces = this.tray.concat([this.hold]).filter(Boolean);
      return pieces.some(function (p) { return board.hasPlacement(p.shape); });
    }

    _afterChange() {
      if (!this.canAct()) return;
      if (this._anyPieceFits()) {
        this.phase = 'playing';
        this.currentStuck = null;
        return;
      }
      if (this.phase !== 'stuck') {
        this.currentStuck = { step: this.placements, panel: false, choices: [], tried: {} };
        this.stuckLog.push(this.currentStuck);
        this.phase = 'stuck';
      }
      this._showStuckPanel();
    }

    // 没有任何选项时直接结算。同一次卡死只计一次面板，炸弹没解围时回到同一个面板。
    _showStuckPanel() {
      if (!this.hasStuckRescue()) {
        this.endGame('stuck');
        return;
      }
      const first = !this.currentStuck.panel;
      this.currentStuck.panel = true;
      this._emit(first ? 'stuck' : 'stuckReopen', {});
    }

    _noteStuckChoice(choice) {
      if (this.phase === 'stuck' && this.currentStuck) this.currentStuck.choices.push(choice);
    }

    revivesLeft() {
      return this.cfg.ads.reviveLimit - this.revivesUsed;
    }

    // 面板上的选项，按显示顺序。revive 的 works 为 false 时显示但不能点。
    stuckOptions() {
      const tried = this.currentStuck ? this.currentStuck.tried : {};
      const out = [];
      if (this.bombs > 0) out.push({ id: 'bomb', count: this.bombs });
      if (this.swapsLeft() > 0 && !tried.swap) out.push({ id: 'swap', left: this.swapsLeft() });
      if (this.revivesLeft() > 0 && !tried.revive) {
        out.push({ id: 'revive', left: this.revivesLeft(), works: this.reviveClearWorks() });
      }
      out.push({ id: 'giveUp' });
      return out;
    }

    hasStuckRescue() {
      return this.stuckOptions().some(function (o) {
        return o.id === 'bomb' || o.id === 'swap' || (o.id === 'revive' && o.works);
      });
    }

    // 玩家选择放弃
    giveUpStuck() {
      if (this.phase !== 'stuck') return false;
      this._noteStuckChoice('giveUp');
      this.endGame('stuck');
      return true;
    }

    // 中途关闭了卡死面板上的广告（type：swap 或 revive）。这次卡死不再提供这个广告。
    noteStuckAdAbandoned(type) {
      if (this.phase !== 'stuck' || !this.currentStuck) return;
      this.currentStuck.tried[type] = true;
      this._noteStuckChoice(type + 'Abandoned');
      if (!this.hasStuckRescue()) this.endGame('stuck');
    }

    canRevive() {
      return this.phase === 'stuck' && this.revivesLeft() > 0 && !(this.currentStuck && this.currentStuck.tried.revive);
    }

    // 清完之后是否真的能放下，界面用它决定要不要置灰
    reviveClearWorks() {
      const test = this.board.clone();
      const radius = this.cfg.ads.revive.areaRadius;
      const center = test.densestCenter(radius);
      test.clearArea(center.r, center.c, radius);
      return this.tray.concat([this.hold]).filter(Boolean).some(function (p) {
        return test.hasPlacement(p.shape);
      });
    }

    // 看完激励视频后调用：清除最密集的 3×3
    revive() {
      if (!this.canRevive() || !this.reviveClearWorks()) return false;
      this._noteStuckChoice('revive');
      this.revivesUsed++;
      this.revivePhase = this.currentDeal.phase;
      this.placementsAtRevive = this.placements;
      const radius = this.cfg.ads.revive.areaRadius;
      const center = this.board.densestCenter(radius);
      const removed = this.board.clearArea(center.r, center.c, radius);
      this._emit('bombed', { r: center.r, c: center.c, removed: removed });
      this.currentDeal.solvable = BG.Dealer.evaluate(this.board, this.tray.filter(Boolean), this.cfg).solvable;
      this._afterChange();
      return true;
    }

    // reason：clear 通关 / stuck 无处可放 / abandon 主动放弃
    endGame(reason) {
      if (this.phase === 'over') return;
      this.phase = 'over';
      this.endReason = reason;
      if (reason === 'stuck') this.endType = this._stuckEndType();
      this._emit('gameOver', { reason: reason });
    }

    // 发牌即无解：这组牌发出时一块都放不下（保底规则下不应出现）
    // 整组放不完：能放下一部分，但没有任何顺序能全部放下
    // 放置后无解：本来能全部放下，是后续放置把路堵死了
    _stuckEndType() {
      const deal = this.currentDeal;
      if (deal.fits === 0) return '发牌即无解';
      return deal.solvable === false ? '整组放不完' : '放置后无解';
    }

    noteAd(type, status) {
      BG.Stats.noteAd(this.ads, type, status);
    }

    record() {
      return {
        version: BG.Version.name,
        build: BG.Version.build,
        mode: this.mode,
        seed: this.seed,
        score: this.score,
        durationMs: Math.round(this.elapsedMs),
        placements: this.placements,
        linesCleared: this.linesCleared,
        maxCombo: this.maxCombo,
        tierReached: this.tierIndex,
        firstRelicStep: this.firstRelicStep,
        firstRelicMs: this.firstRelicMs,
        relicOrder: this.relics.slice(),
        rushSteps: this.rushStartStep === null ? null : this.placements - this.rushStartStep,
        rushMs: this.rushStartStep === null ? null : Math.round(this.elapsedMs - this.rushStartMs),
        relicStats: this.relicStats,
        bombsGained: this.bombsGained,
        bombsUsed: this.bombsUsed,
        endReason: this.endReason,
        endType: this.endType,
        endPhase: this.currentDeal.phase,
        revived: this.revivesUsed > 0,
        revivePhase: this.revivePhase,
        placementsAfterRevive: this.revivesUsed > 0 ? this.placements - this.placementsAtRevive : null,
        stuckPanels: this.stuckLog.filter(function (x) { return x.panel; }).length,
        stuckChoices: this.stuckLog.map(function (x) { return x.choices.slice(); }),
        ads: this.ads,
        dynamicDeal: this.director.dynamic,
        deals: this.dealLog.map(function (d) {
          return { phase: d.phase, difficulty: d.difficulty, fits: d.fits };
        }),
        phaseEntries: this.director.entries,
        phaseGroups: this.director.groups
      };
    }

    // ---------- 调试面板用 ----------

    debugGrant(id) {
      if (!this.has(id)) {
        this._grantRelic(id);
        const picked = this.relicStats.picked;
        picked[id] = (picked[id] || 0) + 1;
      }
      this._afterChange();
    }

    debugNextTier() {
      if (!this.relicMode || this.tierIndex >= this.cfg.relic.tiers.length) return;
      this.score = Math.max(this.score, this.cfg.relic.tiers[this.tierIndex]);
      this._checkTiers();
    }

    debugFail() {
      if (!this.canAct() || this.phase === 'stuck') return;
      this.currentStuck = { step: this.placements, panel: false, choices: [], tried: {} };
      this.stuckLog.push(this.currentStuck);
      this.phase = 'stuck';
      this._showStuckPanel();
    }
  }

  BG.Game = Game;
})();
