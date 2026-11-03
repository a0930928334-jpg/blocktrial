// 单局状态机。所有操作都把结果写进事件队列，由场景转成动画和音效。
// phase：
//   playing   正常游戏
//   relicPick 等待遗物三选一
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
      this.rewardIndex = 0;
      this.rewardsGained = {};
      this.rewardsUsed = {};
      this.freeSwaps = 0;
      this.freeRevives = 0;

      this.hold = null;
      this.holdUnlocked = false;
      this.holdLeft = 0;
      this.smallLeft = 0;
      this.itemUsedUp = {};
      this.bombs = 0;
      this.bombsGained = 0;
      this.bombsUsed = 0;
      this.lastPlaceCleared = false;

      this.swapsUsed = 0;
      this.revivesUsed = 0;
      this.stuckLog = [];
      this.currentStuck = null;
      this.firstRelicStep = null;
      this.firstRelicMs = null;
      this.rushStartStep = null;
      this.rushStartMs = 0;
      this.revivePhase = null;
      this.placementsAtRevive = 0;
      this.ads = BG.Stats.emptyAds();

      this.milestones = [];
      this.recordBroken = false;
      this.relaxedDeals = 0;
      this.piecesDealt = 0;
      this.szDealt = 0;
      this.lateDealt = 0;
      this.lateSzDealt = 0;
      this.lastSzGroup = -1000;
      this.bufferLeft = 0;
      this.oneDealt = 0;

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
      const count = this.cfg.board.traySize;
      const g = this.cfg.generator;
      return {
        score: this.score,
        groupIndex: this.groupIndex,
        has: this._hasFn(),
        placements: this.placements,
        szAllowed: this._szAllowed(false),
        szBoard: this.board,
        // 开局一块都没发过时比例没有意义，不能因此挡掉第一个 1×1
        oneAllowed: this.oneDealt === 0 || (this.oneDealt + 1) / (this.piecesDealt + count) <= g.oneMaxRatio
      };
    }

    // S/Z 这一组能不能出现：两次之间要隔够组数，比例不超过上限
    _szAllowed(late) {
      const sz = this.cfg.generator.sz;
      const count = this.cfg.board.traySize;
      if (this.groupIndex - this.lastSzGroup < sz.minGapGroups) return false;
      if ((this.szDealt + 1) / (this.piecesDealt + count) > sz.maxRatio) return false;
      return !late || (this.lateSzDealt + 1) / (this.lateDealt + count) <= sz.lateMaxRatio;
    }

    // 这一阶段的发牌条件。动态发牌只发现在放得下的形状，棋盘太挤或复活缓冲时不发大方块
    _dealCtx(phase) {
      const late = BG.Dealer.isLate(phase, this.placements, this.cfg, this.mode);
      const ctx = this._ctx();
      if (late) ctx.szAllowed = this._szAllowed(true);
      if (phase !== 'daily' && phase !== 'off') {
        ctx.board = this.board;
        ctx.bigAllowed = phase !== 'buffer' && this.board.emptyCount() >= this.cfg.dealer.bigMinEmpty;
      }
      if (phase === 'warmup' || phase === 'bonus' || phase === 'buffer') ctx.szAllowed = false;
      return ctx;
    }

    // 复活缓冲：不看棋盘的发牌（每日挑战、关闭动态发牌）按固定的表替换，同一组所有人结果相同
    _applyBufferSwap() {
      const swap = this.cfg.ads.revive.swap;
      this.tray.forEach(function (p, i) {
        if (p && swap[p.shape.id]) this.tray[i] = { shape: BG.Shapes.byId[swap[p.shape.id]], color: p.color };
      }, this);
    }

    // 统计已发方块，给 S/Z 和 1×1 的比例上限用
    _countDealt(late) {
      const szIds = this.cfg.generator.sz.ids;
      this.tray.forEach(function (p) {
        if (!p || p.gift) return;
        const isSz = szIds.indexOf(p.shape.id) !== -1;
        this.piecesDealt++;
        if (late) this.lateDealt++;
        if (isSz) {
          this.szDealt++;
          if (late) this.lateSzDealt++;
          this.lastSzGroup = this.groupIndex;
        }
        if (p.shape.id === '1x1') this.oneDealt++;
      }, this);
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
      const buffer = this.bufferLeft > 0;
      if (buffer) this.bufferLeft--;
      const phase = this.director.next(this.placements, this.score, buffer);
      const count = this.cfg.board.traySize;
      let picked = null;
      const dynamic = phase !== 'daily' && phase !== 'off';
      if (dynamic) picked = this._pickDynamic(phase, count);
      if (picked) {
        this.tray = picked.pieces;
      } else {
        // 动态发牌找不到 3 块都能放、有解的组时发保底的小方块，这种组一定存在
        this.tray = dynamic
          ? this.gen.drawSmallGuaranteed(this.board, count, this.cfg.dealer.fallbackMaxCells, this.groupIndex)
          : this.gen.draw(this.board, count, 'group', this.groupIndex, this._dealCtx(phase));
      }
      if (buffer) this._applyBufferSwap();
      const gifted = this._tickSmallPiece();
      // 小块换掉的那块可能正是消线腾位置要用的，换完没解就改发保底的小方块，送的 1×1 照样留着
      if (gifted && dynamic && BG.Dealer.evaluate(this.board, this.tray, this.cfg).solvable === false) {
        this.tray = this.gen.drawSmallGuaranteed(this.board, count - 1, this.cfg.dealer.fallbackMaxCells, this.groupIndex)
          .concat([this.gen.giftPiece(this.groupIndex)]);
      }
      const late = BG.Dealer.isLate(phase, this.placements, this.cfg, this.mode);
      this._countDealt(late);
      const metrics = picked && !gifted && !buffer ? picked.metrics : BG.Dealer.evaluate(this.board, this.tray, this.cfg);
      const relaxed = dynamic && (metrics.fits < metrics.count || metrics.solvable === false);
      if (relaxed) this.relaxedDeals++;
      this.currentDeal = {
        phase: phase,
        stage: this.stageNumber(),
        big: this.tray.filter(function (p) { return p.shape.count >= this.cfg.generator.bigCells; }, this).length,
        moves: Math.round(metrics.moves.reduce(function (a, b) { return a + b; }, 0) / metrics.count * 10) / 10,
        difficulty: metrics.difficulty,
        fits: metrics.fits,
        solvable: metrics.solvable,
        maxLines: metrics.maxLines,
        relaxed: relaxed,
        buffer: buffer
      };
      this.dealLog.push(Object.assign({}, this.currentDeal));
      this.groupIndex++;
      this._emit('dealt', {});
    }

    // 小块遗物：接下来几组牌各有一块 1×1。不加块，把最大的一块换掉；已经有 1×1 就不用换。
    _tickSmallPiece() {
      if (this.smallLeft <= 0) return false;
      this.smallLeft--;
      this._noteItemLeft('smallPiece', this.smallLeft);
      let slot = this.tray.findIndex(function (p) { return p.shape.id === '1x1'; });
      const replaced = slot === -1;
      if (replaced) {
        slot = 0;
        this.tray.forEach(function (p, i) {
          if (p.shape.count > this.tray[slot].shape.count) slot = i;
        }, this);
      }
      this.tray[slot] = this.gen.giftPiece(this.groupIndex);
      this._trigger('smallPiece', { at: 'tray' });
      return replaced;
    }

    // 道具类遗物的剩余次数，加分类遗物返回 null
    itemLeft(id) {
      if (id === 'timeBomb') return this.bombs;
      if (id === 'holdSlot') return this.holdLeft;
      if (id === 'smallPiece') return this.smallLeft;
      return null;
    }

    // 记下第一次用完是第几步
    _noteItemLeft(id, left) {
      if (left === 0 && this.itemUsedUp[id] === undefined) this.itemUsedUp[id] = this.placements;
    }

    // rerollNo：换一组时传入，用另一条随机流，不发 S/Z
    _pickDynamic(phase, count, rerollNo) {
      const d = this.cfg.dealer;
      const ctx = this._dealCtx(phase);
      if (rerollNo) ctx.szAllowed = false;
      const salt = rerollNo ? ':' + rerollNo : '';
      const budget = { left: d.dealNodeBudget };
      const candidates = [];
      const roll = function (self, tag, weights, total, plan) {
        for (let i = 0; i < total; i++) {
          const rng = new BG.RNG(BG.RNG.derive(self.seed, tag, self.groupIndex, i));
          const pieces = self.gen.rollGroup(rng, weights, count, plan);
          candidates.push({ pieces: pieces, metrics: BG.Dealer.evaluate(self.board, pieces, self.cfg, budget) });
        }
      };
      // 热身和复活缓冲本来就选最容易的，大方块不会变多，不用计划
      const easy = phase === 'warmup' || phase === 'buffer';
      const stage = this.stageNumber();
      const planRng = new BG.RNG(BG.RNG.derive(this.seed, 'bigPlan' + salt, this.groupIndex));
      const plan = easy ? null : this.gen.bigPlan(planRng, this.gen.weights(ctx), count);
      if (phase === 'normal' || phase === 'sprint' || phase === 'trial') ctx.awkwardMult = BG.Dealer.normalAwkwardMult(stage, this.cfg, this.mode);
      const weights = this.gen.weights(ctx);
      roll(this, 'dynamic' + salt, easy ? weights : this.gen.withoutBig(weights), d.candidates, plan);
      // 候选都不合格时，先用小方块再试一轮，给这一轮留出搜索预算
      if (!candidates.some(BG.Dealer.fullFit)) {
        const small = this.gen.weights(ctx);
        BG.Shapes.list.forEach(function (s) { if (s.count > d.smallRetryCells) small[s.id] = 0; });
        budget.left = Math.max(budget.left, d.candidateNodeBudget * 4);
        roll(this, 'dynamicSmall' + salt, small, Math.ceil(d.candidates / 3));
      }
      const pickRng = new BG.RNG(BG.RNG.derive(this.seed, 'dynamicPick' + salt, this.groupIndex));
      return BG.Dealer.select(phase, candidates, pickRng, this.cfg, this.mode, stage);
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
      if (source === 'hold') this._emptyHold();
      else this.tray[source] = null;
    }

    // 次数用完后，里面的方块取走，暂存位就关闭
    _emptyHold() {
      this.hold = null;
      if (this.holdLeft <= 0) this.holdUnlocked = false;
    }

    _rerollTray() {
      // 小块遗物送的 1×1 不算在换牌里，保留下来
      const gifts = this.tray.filter(function (p) { return p && p.gift; });
      const normal = this.tray.filter(function (p) { return p && !p.gift; }).length;
      const count = normal > 0 ? normal : gifts.length;
      this.rerollNo++;
      // 缓冲期里换牌（包括刚复活、缓冲还没开始用的那一组）也要守缓冲的规矩。换一组不发 S/Z
      const buffer = this.currentDeal.buffer || this.bufferLeft > 0;
      const phase = buffer && this.director.dynamic ? 'buffer' : this.currentDeal.phase;
      if (this.director.dynamic) {
        // 换出来的牌和正常发牌同样难，也一样 3 块都能放、有解
        const picked = this._pickDynamic(phase, count, this.rerollNo);
        this.tray = picked ? picked.pieces : this.gen.drawSmallGuaranteed(this.board, count, this.cfg.dealer.fallbackMaxCells, this.groupIndex + ':' + this.rerollNo);
      } else {
        const ctx = this._dealCtx(phase);
        ctx.szAllowed = false;
        this.tray = this.gen.draw(this.board, count, 'reroll', this.groupIndex + ':' + this.rerollNo, ctx);
      }
      if (buffer) this._applyBufferSwap();
      if (normal > 0) this.tray = this.tray.concat(gifts);
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

      this._updateCombo(lines.length);
      const result = BG.Scoring.compute({
        cellCount: shape.count,
        lines: lines,
        combo: this.combo,
        prevCleared: this.lastPlaceCleared,
        has: this._hasFn()
      }, this.cfg);
      const prevScore = this.score;
      this.score += result.total;
      this.linesCleared += lines.length;
      this.director.onScore(prevScore, this.score);
      this.lastPlaceCleared = lines.length > 0;

      if (lines.length > 0) {
        this._emit('cleared', {
          lines: lines,
          removed: removed,
          combo: this.combo,
          total: result.total
        });
      }
      this._emit('scored', { total: result.total, detail: result });
      this._emitScoreTriggers(result.triggers, result.details, lines, removed);
      this._checkMilestones(prevScore);

      this._normalizeTray();

      // 先看有没有过阶梯：选完遗物再发牌，遗物和考验期才能作用到这组牌
      this._checkTiers();
      if (this._trayEmpty()) {
        if (this.phase === 'relicPick') this.dealPending = true;
        else this._deal();
      }
      this._afterChange();
      return true;
    }

    // 分数台阶和新纪录。一次加分跨过多个时全部记入统计，但只播一次，优先新纪录
    _checkMilestones(prev) {
      const step = this.cfg.milestone.scoreStep;
      const level = Math.floor(this.score / step);
      for (let k = Math.floor(prev / step) + 1; k <= level; k++) this.milestones.push(k * step);
      const crossed = level > Math.floor(prev / step);
      const broke = !this.recordBroken && this.best > 0 && this.score > this.best;
      if (broke) {
        this.recordBroken = true;
        this.milestones.push('record');
      }
      if (broke) this._emit('milestone', { kind: 'record', score: this.score, level: Math.max(1, level) });
      else if (crossed) this._emit('milestone', { kind: 'score', score: level * step, level: level });
    }

    // 阶段序号，从 1 开始：遗物模式按阶梯，过了最后一档按分数；经典和每日挑战按分数台阶
    stageNumber() {
      if (this.mode !== 'relic') return Math.floor(this.score / this.cfg.milestone.scoreStep) + 1;
      const tiers = this.cfg.relic.tiers;
      if (this.tierIndex < tiers.length) return this.tierIndex + 1;
      return tiers.length + 1 + Math.floor((this.score - tiers[tiers.length - 1]) / this.cfg.relic.stageStepAfter);
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
        // 到达最后一档不结束，玩到卡死，用最终分数比较。遗物模式叫奖励阶段，每日挑战叫冲分
        if (this.tierIndex === last) {
          this.rushStartStep = this.placements;
          this.rushStartMs = this.elapsedMs;
          this._emit('rushStart', {});
        }
        if (this.firstRelicStep === null) {
          this.firstRelicStep = this.placements;
          this.firstRelicMs = Math.round(this.elapsedMs);
        }
        this.pendingTiers.push(this.tierIndex);
        this.tierIndex++;
      }
      this._checkRewards();
      if (this.pendingTiers.length > 0 && this.phase !== 'relicPick') this._nextOffer();
    }

    // 第 index 个奖励：{ score, id }
    rewardAt(index) {
      const r = this.cfg.relic.reward;
      if (index < r.fixed.length) return { score: r.fixed[index][0], id: r.fixed[index][1] };
      return { score: r.fixed[r.fixed.length - 1][0] + r.every * (index - r.fixed.length + 1), id: r.everyId };
    }

    // 到达时直接发放
    _checkRewards() {
      if (this.mode !== 'relic') return;
      for (let next = this.rewardAt(this.rewardIndex); this.score >= next.score; next = this.rewardAt(this.rewardIndex)) {
        this.rewardIndex++;
        this.rewardsGained[next.id] = (this.rewardsGained[next.id] || 0) + 1;
        if (next.id === 'swap') this.freeSwaps++;
        else this.freeRevives++;
        this._emit('rewardGranted', { id: next.id, score: next.score });
      }
    }

    _nextOffer() {
      while (this.pendingTiers.length > 0) {
        const tier = this.pendingTiers.shift();
        const ids = this.gen.offer(tier, this.relics, this.relicPool);
        if (ids.length > 0) {
          this.offer = { tier: tier, ids: ids };
          this.phase = 'relicPick';
          this._emit('relicOffer', { tier: tier });
          return true;
        }
      }
      return false;
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

    _noteRewardUsed(id) {
      this.rewardsUsed[id] = (this.rewardsUsed[id] || 0) + 1;
    }

    _grantRelic(id) {
      const r = this.cfg.relic;
      this.relics.push(id);
      if (id === 'holdSlot') {
        this.holdUnlocked = true;
        this.holdLeft = r.holdUses;
      } else if (id === 'smallPiece') {
        this.smallLeft = r.smallGroups;
      } else if (id === 'timeBomb') {
        const gain = Math.min(r.bombGrant, r.bombMax - this.bombs);
        this.bombs += gain;
        this.bombsGained += gain;
        this._trigger('timeBomb', { at: 'tray' });
      }
      this._emit('relicGained', { id: id });
    }

    // ---------- 道具 ----------

    // 还能不能往暂存格放方块
    canStash() {
      return this.holdUnlocked && this.holdLeft > 0;
    }

    // 把托盘里的方块放进暂存格，算用掉 1 次；暂存格有方块时互换
    stash(trayIndex) {
      if (!this.canAct() || !this.canStash() || !this.tray[trayIndex]) return false;
      const piece = this.tray[trayIndex];
      this.tray[trayIndex] = this.hold;
      this.hold = piece;
      this.holdLeft--;
      this._noteItemLeft('holdSlot', this.holdLeft);
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
      this._emptyHold();
      this._afterChange();
      return true;
    }

    useBomb(r, c) {
      if (!this.canAct() || this.bombs <= 0) return false;
      this.bombs--;
      this.bombsUsed++;
      this._noteItemLeft('timeBomb', this.bombs);
      this._noteStuckChoice('bomb');
      const removed = this.board.clearArea(r, c, this.cfg.relic.bombRadius);
      this._emit('bombed', { r: r, c: c, removed: removed });
      this._afterChange();
      return true;
    }

    swapsLeft() {
      return this.cfg.ads.swapTrayLimit - this.swapsUsed;
    }

    // 看完激励视频后调用。free：用奖励的免费次数，不看广告，也不占广告次数
    swapTray(free) {
      if (!this.canAct() || (free ? this.freeSwaps : this.swapsLeft()) <= 0 || this._trayEmpty()) return false;
      if (free) {
        this.freeSwaps--;
        this._noteRewardUsed('swap');
        this._noteStuckChoice('freeSwap');
      } else {
        this.swapsUsed++;
        this._noteStuckChoice('swap');
      }
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
      if (this.freeSwaps > 0) out.push({ id: 'freeSwap', left: this.freeSwaps });
      if (this.freeRevives > 0) out.push({ id: 'freeRevive', left: this.freeRevives, works: this.reviveClearWorks() });
      if (this.swapsLeft() > 0 && !tried.swap) out.push({ id: 'swap', left: this.swapsLeft() });
      if (this.revivesLeft() > 0 && !tried.revive) {
        out.push({ id: 'revive', left: this.revivesLeft(), works: this.reviveClearWorks() });
      }
      out.push({ id: 'giveUp' });
      return out;
    }

    hasStuckRescue() {
      return this.stuckOptions().some(function (o) {
        return o.id === 'bomb' || o.id === 'swap' || o.id === 'freeSwap' || o.works === true;
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

    canRevive(free) {
      if (this.phase !== 'stuck') return false;
      if (free) return this.freeRevives > 0;
      return this.revivesLeft() > 0 && !(this.currentStuck && this.currentStuck.tried.revive);
    }

    // 清完之后是否真的能放下，界面用它决定要不要置灰
    reviveClearWorks() {
      const test = this.board.clone();
      const revive = this.cfg.ads.revive;
      const center = test.densestCenter(revive.areaRadius);
      test.clearArea(center.r, center.c, revive.areaRadius);
      // 复活时手里的大方块会被替换，要按替换后的形状判断
      return this.tray.concat([this.hold]).filter(Boolean).some(function (p) {
        return test.hasPlacement(BG.Shapes.byId[revive.swap[p.shape.id] || p.shape.id]);
      });
    }

    // 看完激励视频后调用：清除最密集的 3×3。free：用奖励的免费次数，不看广告，也不占广告次数
    revive(free) {
      if (!this.canRevive(free) || !this.reviveClearWorks()) return false;
      if (free) {
        this.freeRevives--;
        this._noteRewardUsed('revive');
        this._noteStuckChoice('freeRevive');
      } else {
        this.revivesUsed++;
        this._noteStuckChoice('revive');
      }
      this.revivePhase = this.currentDeal.phase;
      this.bufferLeft = this.cfg.ads.revive.bufferGroups;
      // 手里剩的大方块也换掉，否则放完一块就又卡死，下一组缓冲的牌都等不到
      this._applyBufferSwap();
      this.placementsAtRevive = this.placements;
      const radius = this.cfg.ads.revive.areaRadius;
      const center = this.board.densestCenter(radius);
      const removed = this.board.clearArea(center.r, center.c, radius);
      this._emit('bombed', { r: center.r, c: center.c, removed: removed });
      this.currentDeal.solvable = BG.Dealer.evaluate(this.board, this.tray.filter(Boolean), this.cfg).solvable;
      this._afterChange();
      return true;
    }

    // reason：stuck 无处可放 / abandon 主动放弃
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
        milestones: this.milestones.slice(),
        stage: this.stageNumber(),
        relaxedDeals: this.relaxedDeals,
        bombsGained: this.bombsGained,
        bombsUsed: this.bombsUsed,
        itemRelics: this._itemRecord(),
        rewardsGained: this.rewardsGained,
        rewardsUsed: this.rewardsUsed,
        sprintEntries: this.director.entries.sprint || 0,
        bonusEntries: this.director.entries.bonus || 0,
        diedInSprint: this.endReason === 'stuck' && this.director.dynamic && this.director.inSprintWindow(this.score),
        endReason: this.endReason,
        endType: this.endType,
        endPhase: this.currentDeal.phase,
        revived: this.revivePhase !== null,
        revivePhase: this.revivePhase,
        placementsAfterRevive: this.revivePhase !== null ? this.placements - this.placementsAtRevive : null,
        stuckPanels: this.stuckLog.filter(function (x) { return x.panel; }).length,
        stuckChoices: this.stuckLog.map(function (x) { return x.choices.slice(); }),
        ads: this.ads,
        dynamicDeal: this.director.dynamic,
        deals: this.dealLog.map(function (d) {
          return { phase: d.phase, stage: d.stage, difficulty: d.difficulty, fits: d.fits, big: d.big, moves: d.moves, lines: d.maxLines };
        }),
        phaseEntries: this.director.entries,
        phaseGroups: this.director.groups
      };
    }

    // 这局拿到的道具类遗物：{ 遗物: { left: 剩余次数, usedUpStep: 用完时是第几步，没用完是 null } }
    _itemRecord() {
      const out = {};
      this.relics.forEach(function (id) {
        const left = this.itemLeft(id);
        if (left === null) return;
        const step = this.itemUsedUp[id];
        out[id] = { left: left, usedUpStep: step === undefined ? null : step };
      }, this);
      return out;
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

    // 下一个阶梯，过了最后一档就是下一个奖励台阶
    debugNextTier() {
      const tiers = this.cfg.relic.tiers;
      if (!this.relicMode) return;
      if (this.tierIndex < tiers.length) this.score = Math.max(this.score, tiers[this.tierIndex]);
      else if (this.mode === 'relic') this.score = Math.max(this.score, this.rewardAt(this.rewardIndex).score);
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
