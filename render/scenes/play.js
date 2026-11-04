// 游戏主场景：棋盘、托盘、道具、拖拽，以及把 core 事件转成反馈。
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;
  const Kit = BG.UIKit;

  class PlayScene {
    constructor(mode, seed, opening) {
      this.best = BG.App.getBest(mode, seed);
      this.game = new BG.Game({ mode: mode, seed: seed, best: this.best, dynamic: BG.App.dynamicDeal, wallet: BG.Wallet, opening: opening });
      this.anim = new BG.Animator();
      this.ui = new BG.UI();
      this.tip = null;
      this.drag = null;
      this.aiming = false;
      this.queue = [];
      this.holdRect = null;
      this.L = null;
      this.fx = new BG.ScoreFx(BG.Config.anim.scoreJump);
      this.celebrate = new BG.Celebration(BG.Config.anim.celebrate);
      this.stage = new BG.StageView(this.game.stageNumber(), BG.Config.anim.stageFade);
      this.bannerStage = this.game.stageNumber();
      this.stageBanner = null;
      this.rewardToast = null;
      this.resize(BG.Screen);
    }

    resize(screen) {
      this.L = BG.Layout.compute(screen, this.game.relicMode);
    }

    back() {
      if (this.game.phase === 'over') return;
      this.drag = null;
      this.aiming = false;
      BG.App.push(new BG.PauseScene(this.game, { fromBackKey: true }));
    }

    // ---------- 更新 ----------

    // 庆祝、分数跳动和阶段过渡不等弹窗：三选一盖在上面时也接着走完。主循环在本场景不在最上层时单独调用
    updateFx(dt) {
      // 面板上想怎么选也算在玩，暂停不算
      const top = BG.App.top();
      if (top instanceof BG.StuckScene || top instanceof BG.RelicPickScene) this.game.tickActive(dt);
      this.fx.update(dt);
      this.celebrate.update(dt, this.L.board);
      this.stage.set(this.game.stageNumber());
      this.stage.update(dt);
    }

    update(dt) {
      this.game.tick(dt);
      this.game.tickActive(dt);
      this.anim.update(dt);
      this.updateFx(dt);
      this._updateStageBanner(dt);
      if (this.tip) {
        this.tip.left -= dt;
        if (this.tip.left <= 0) this.tip = null;
      }
      this._handleEvents();
      for (let i = 0; i < this.queue.length; i++) this.queue[i].wait -= dt;
      while (this.queue.length > 0 && this.queue[0].wait <= 0) {
        // 庆祝特效播完才弹需要玩家操作的面板
        if (this._effectsPlaying()) break;
        this.queue.shift().run();
        if (BG.App.top() !== this) break;
      }
    }

    // 每日挑战的序列固定，难度不跟阶段走，所以不显示
    _updateStageBanner(dt) {
      const g = this.game;
      if (this.stageBanner) {
        this.stageBanner.left -= dt;
        if (this.stageBanner.left <= 0) this.stageBanner = null;
      }
      if (this.rewardToast) {
        this.rewardToast.left -= dt;
        if (this.rewardToast.left <= 0) this.rewardToast = null;
      }
      const stage = g.stageNumber();
      if (stage === this.bannerStage) return;
      this.bannerStage = stage;
      if (g.fixedSequence) return;
      // 到了难度上限之后只报阶段，不能再说难度提升
      const raises = BG.Dealer.stageRaises(stage, BG.Config, g.mode);
      this.stageBanner = { text: '阶段 ' + stage + (raises ? ' · 难度提升' : ''), left: BG.Config.anim.stageBannerLife };
    }

    // 横幅、礼花、阶段切换、奖励提示还在播
    _effectsPlaying() {
      return this.celebrate.active() || !!this.stageBanner || !!this.stage.from || !!this.rewardToast;
    }

    _later(wait, run) {
      this.queue.push({ wait: wait, run: run });
    }

    _handleEvents() {
      const events = this.game.drainEvents();
      if (events.length === 0) return;
      const self = this;
      const app = BG.App;
      const board = this.L.board;
      const cfg = BG.Config;
      let sawClear = false;
      const triggerStack = { anchor: null, count: 0 };
      const hasStamp = events.some(function (e) { return e.type === 'relicTriggered' && e.stamp; });

      events.forEach(function (e) {
        switch (e.type) {
          case 'placed':
            self.anim.pop(e.cells);
            BG.Audio.play('drop');
            BG.Vibrate.short(cfg.feel.vibrateMs);
            break;
          case 'cleared':
            sawClear = true;
            self.anim.clear(e.removed, board);
            BG.Audio.play('clear', e.lines.length);
            if (e.lines.length >= cfg.anim.shakeLines) self.anim.shake();
            if (!hasStamp) self._floatScore(e);
            if (e.combo >= 2) {
              // 有印章时不再显示屏幕中央的连击字样，避免叠在一起；顶部仍显示连击数
              if (!hasStamp) self.anim.combo(e.combo);
              BG.Audio.play('combo', e.combo);
            }
            break;
          case 'bombed':
            sawClear = true;
            self.anim.clear(e.removed, board);
            self.anim.shake();
            BG.Audio.play('bomb');
            BG.Vibrate.short(cfg.feel.vibrateMs);
            break;
          case 'relicTriggered':
            self.anim.flashRelic(e.id);
            if (e.stamp) self._stampTrigger(e, triggerStack);
            else self._floatTrigger(e, triggerStack);
            break;
          case 'scored':
            self.fx.gain(e.total, self.game.score, e.detail.triggers.length > 0);
            break;
          case 'milestone':
            self._onMilestone(e);
            break;
          case 'relicGained':
            BG.Audio.play('relic');
            break;
          case 'crossGuard':
            BG.Audio.play('relic');
            BG.Vibrate.short(cfg.feel.vibrateMs);
            self._showToast('过线奖励');
            break;
          case 'rewardGranted':
            BG.Audio.play('relic');
            BG.Vibrate.short(cfg.feel.vibrateMs);
            self.rewardToast = { text: '奖励：' + BG.Rewards[e.id].toast, left: cfg.anim.rewardToastLife };
            break;
          case 'rushStart':
            BG.Audio.play('win');
            self._showToast(self.game.fixedSequence ? '进入冲分阶段' : '进入奖励阶段');
            break;
          default:
            break;
        }
      });

      const wait = sawClear ? cfg.anim.modalDelay : 0;
      events.forEach(function (e) {
        if (e.type === 'relicOffer') {
          self._later(wait, function () { app.push(new BG.RelicPickScene(self.game)); });
        } else if (e.type === 'stuck' || e.type === 'stuckReopen') {
          self._later(wait, function () { self._openStuckPanel(); });
        } else if (e.type === 'gameOver') {
          self._later(wait, function () { self._onGameOver(); });
        }
      });
    }

    _onMilestone(e) {
      const c = BG.Config.anim.celebrate;
      const record = e.kind === 'record';
      const level = Math.min(e.level, c.maxLevel);
      this.celebrate.fire({
        text: record ? '新纪录！' : e.score + '！',
        level: level, record: record,
        width: BG.Screen.width, height: BG.Screen.height, top: BG.Screen.safe.top
      });
      this.fx.boost(c.score, record ? c.maxLevel : level);
      BG.Audio.play(record ? 'record' : 'milestone', level);
      BG.Vibrate.short(c.vibrateMs + c.vibratePerLevel * (record ? c.maxLevel : level));
    }

    _floatScore(e) {
      let sumR = 0;
      let sumC = 0;
      e.removed.forEach(function (p) { sumR += p.r; sumC += p.c; });
      const b = this.L.board;
      const x = b.x + (sumC / e.removed.length + 0.5) * b.cell;
      const y = b.y + (sumR / e.removed.length + 0.5) * b.cell;
      this.anim.float('+' + e.total, x, y, { size: 26, color: T.gold });
    }

    // 遗物名和效果飘在触发位置。同一步在棋盘上触发多个时，以第一个为基准往上排开，避免重叠
    _floatTrigger(e, stack) {
      const b = this.L.board;
      let x;
      let y;
      if (e.at === 'tray') {
        x = this.L.tray.x + this.L.tray.w / 2;
        y = this.L.tray.y + 10;
      } else if (e.at === 'hold' && this.holdRect) {
        x = this.holdRect.x + this.holdRect.w / 2;
        y = this.holdRect.y - 10;
      } else {
        if (!stack.anchor) {
          stack.anchor = { x: b.x + (e.c + 0.5) * b.cell, y: b.y + (e.r + 0.5) * b.cell - 34 };
        }
        x = stack.anchor.x;
        y = stack.anchor.y - stack.count * 28;
        stack.count++;
      }
      const margin = 64;
      x = Math.max(margin, Math.min(BG.Screen.width - margin, x));
      this.anim.float(e.text, x, y, { size: 20, color: T.accent });
    }

    // 加分遗物：印章、算式、音效，同一步多个时往上排开。棋盘清空时加全屏庆祝。
    _stampTrigger(e, stack) {
      const b = this.L.board;
      if (!stack.anchor) {
        stack.anchor = { x: b.x + (e.c + 0.5) * b.cell, y: b.y + (e.r + 0.5) * b.cell };
      }
      const margin = 76;
      const x = Math.max(margin, Math.min(BG.Screen.width - margin, stack.anchor.x));
      const y = Math.max(b.y + 44, stack.anchor.y - stack.count * 112);
      stack.count++;
      const relic = BG.Relics.byId[e.id];
      this.anim.stamp(e.stamp, relic.name, x, y);
      this.anim.float(e.formula, x, y + 62, {
        size: 20, color: T.accent, life: BG.Config.anim.formulaLife, rise: 14
      });
      BG.Audio.play('relicHit', BG.Relics.list.indexOf(relic));
    }

    _showToast(text) {
      const b = this.L.board;
      this.anim.float(text, b.x + b.size / 2, b.y + b.size * 0.3, { size: 22, color: T.gold });
    }

    _openStuckPanel() {
      if (this.game.phase !== 'stuck' || this.aiming) return;
      BG.Audio.play('back');
      BG.App.push(new BG.StuckScene(this.game, this));
    }

    _onGameOver() {
      BG.Audio.play('fail');
      BG.App.showResult(this.game);
    }

    // ---------- 绘制 ----------

    draw(ctx, screen) {
      const ui = this.ui;
      ui.begin();
      this.stage.drawBackground(ctx, screen);
      this.celebrate.drawBehind(ctx);
      this._drawHeader(ctx);
      if (this.game.relicMode) this._drawRelicBar(ctx);

      const off = this.anim.shakeOffset();
      ctx.save();
      ctx.translate(BG.Layout.snap(off.x), BG.Layout.snap(off.y));
      this._drawBoard(ctx);
      ctx.restore();
      this.celebrate.drawOverBoard(ctx, this.L.board);

      this._drawTray(ctx);
      this._drawTools(ctx);
      this.celebrate.drawBanner(ctx, this.L.header, this.stage.color('glow'));
      this._drawStageBanner(ctx);
      this._drawRewardToast(ctx);
      this._drawBanners(ctx);
      this._drawRelicTip(ctx);
      this.anim.drawParticles(ctx);
      this.anim.drawFlybacks(ctx);
      this._drawDragPiece(ctx);
      this.anim.drawStamps(ctx);
      this.anim.drawFloats(ctx, screen);
    }

    // 叠在棋盘上方一点点，结束前淡出。不接管输入，和分数台阶的横幅（在分数区）不重叠
    _drawStageBanner(ctx) {
      const s = this.stageBanner;
      if (!s) return;
      const b = this.L.board;
      const k = s.left / BG.Config.anim.stageBannerLife;
      ctx.font = T.font(18, true);
      const w = ctx.measureText(s.text).width + 32;
      const x = b.x + (b.size - w) / 2;
      const y = b.y + 8;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 4);
      D.fillRound(ctx, x, y, w, 36, 18, 'rgba(11, 14, 19, 0.9)');
      D.strokeRound(ctx, x, y, w, 36, 18, 1.5, this.stage.color('glow'));
      D.text(ctx, s.text, x + w / 2, y + 18, { size: 18, bold: true, align: 'center', color: this.stage.color('glow') });
      ctx.restore();
    }

    // 显示在遗物图标那一行，不接管输入
    _drawRewardToast(ctx) {
      const s = this.rewardToast;
      if (!s) return;
      const r = this.L.relicRow;
      const k = s.left / BG.Config.anim.rewardToastLife;
      ctx.font = T.font(18, true);
      const w = ctx.measureText(s.text).width + 32;
      const x = r.x + (r.w - w) / 2;
      const y = r.y + (r.h - 38) / 2;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 4);
      D.fillRound(ctx, x, y, w, 38, 19, '#2a1e04');
      D.strokeRound(ctx, x, y, w, 38, 19, 2, T.gold);
      D.text(ctx, s.text, x + w / 2, y + 19, { size: 18, bold: true, align: 'center', color: T.gold });
      ctx.restore();
    }

    _drawHeader(ctx) {
      const h = this.L.header;
      const g = this.game;
      D.text(ctx, '分数', h.x + 4, h.y + 14, { size: 16, color: T.textDim });
      D.text(ctx, '阶段 ' + g.stageNumber(), h.x + 44, h.y + 14, { size: 16, bold: true, color: this.stage.color('glow') });
      this._drawScoreNumber(ctx, h);
      const best = Math.max(this.best, g.score);
      D.text(ctx, '最高分', h.x + h.w - 4, h.y + 14, { size: 16, color: T.textDim, align: 'right' });
      D.text(ctx, String(best), h.x + h.w - 4, h.y + 39, { size: 22, bold: true, color: T.gold, align: 'right' });
      const label = { classic: '经典模式', relic: '遗物模式', daily: '每日挑战' }[g.mode];
      if (BG.App.debug) {
        const self = this;
        this.ui.button(ctx, 'debug', h.x + h.w / 2 - 36, h.y + 6, 72, 44, '调试', {
          size: 16,
          onTap: function () { BG.App.push(new BG.DebugScene(self.game)); }
        });
      } else {
        D.text(ctx, label, h.x + h.w / 2, h.y + 14, { size: 16, color: T.textDim, align: 'center' });
        if (g.combo >= 2) {
          D.text(ctx, '连击 ×' + g.combo, h.x + h.w / 2, h.y + 39, { size: 18, bold: true, color: T.gold, align: 'center' });
        }
      }
    }

    // 分数数字：以左端为基点放大，大额时分数区轻微抖动，右边飘 "+N"
    _drawScoreNumber(ctx, h) {
      const fx = this.fx;
      const text = String(fx.display(this.game.score));
      // 字号直接按放大后的尺寸算，不用 ctx.scale，也不把小图拉大
      const size = 28 * fx.scale();
      const x = h.x + 4 + fx.shakeOffset();
      const y = h.y + 39;
      D.text(ctx, text, x, y, { size: size, bold: true, color: fx.color(T.text) });

      const f = fx.float;
      if (!f) return;
      ctx.font = T.font(size, true);
      const right = x + ctx.measureText(text).width;
      const k = f.t / fx.cfg.floatLife;
      ctx.save();
      ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      D.text(ctx, '+' + f.amount, right + 10, y - k * fx.cfg.floatRise, { size: f.size, bold: true, color: f.color });
      ctx.restore();
    }

    _drawRelicBar(ctx) {
      const g = this.game;
      const p = this.L.progress;
      const tiers = BG.Config.relic.tiers;
      const idx = Math.min(g.tierIndex, tiers.length - 1);
      const inRush = g.rushStartStep !== null;
      // 遗物模式过了最后一档，进度条改成走向下一个奖励，每日挑战是冲分，没有下一档
      const inReward = inRush && !g.fixedSequence;
      const next = inReward ? g.rewardAt(g.rewardIndex).score : tiers[idx];
      const lastTier = tiers[tiers.length - 1];
      const prev = inReward ? (g.rewardIndex > 0 ? g.rewardAt(g.rewardIndex - 1).score : lastTier) : (idx > 0 ? tiers[idx - 1] : 0);
      // 进度条和分数数字同步，跟着滚动的数值走
      const shown = this.fx.display(g.score);
      const left = Math.max(0, next - shown);
      let progressText = '冲分阶段，坚持到卡死';
      if (inReward) progressText = '距下一个奖励 ' + left + ' 分';
      else if (!inRush) progressText = '距下一个遗物 ' + left + ' 分';
      D.text(ctx, progressText, p.x + 4, p.y + 10, { size: 16, color: inRush ? T.gold : T.textDim });
      const rightText = inReward ? '奖励 ' + BG.Stats.sumMap(g.rewardsGained) : '阶梯 ' + g.tierIndex + '/' + tiers.length;
      D.text(ctx, rightText, p.x + p.w - 4, p.y + 10, { size: 16, color: inReward ? T.gold : T.textDim, align: 'right' });
      const barY = p.y + 22;
      D.fillRound(ctx, p.x, barY, p.w, 7, 3.5, this.stage.color('cellEmpty'));
      const k = inRush && !inReward ? 1 : Math.max(0, Math.min(1, (shown - prev) / (next - prev)));
      if (k > 0) this._drawProgressFill(ctx, p, barY, k, (!inRush || inReward) && g.phase !== 'over', inRush ? T.gold : T.accent);

      const r = this.L.relicRow;
      const pending = g.hasPendingRelic();
      if (g.relics.length === 0 && !pending) {
        D.text(ctx, '还没有遗物', r.x + 4, r.y + r.h / 2, { size: 16, color: T.textDim });
        return;
      }
      const self = this;
      const slots = g.relics.length + (pending ? 1 : 0);
      const size = Math.min(40, (r.w - 4 * (slots - 1)) / slots);
      if (pending) {
        const wave = 0.5 - 0.5 * Math.cos(2 * Math.PI * this.fx.time / BG.Config.anim.pendingRelicMs);
        D.relicIcon(ctx, 'pending', r.x + size / 2 + g.relics.length * (size + 4), r.y + r.h / 2 - 3 * wave, size * (0.8 + 0.08 * wave));
      }
      g.relics.forEach(function (id, i) {
        const cx = r.x + size / 2 + i * (size + 4);
        const cy = r.y + r.h / 2;
        const fx = self.anim.relicFlash(id);
        const left = g.itemLeft(id);
        ctx.save();
        if (left === 0) ctx.globalAlpha = 0.35;
        D.relicIcon(ctx, id, cx, cy, size * fx.scale, { flash: fx.flash });
        ctx.restore();
        if (id === 'timeBomb') self._drawBombStatus(ctx, cx, cy, size);
        else if (id === 'smallPiece') self._drawSmallProgress(ctx, cx, cy, size);
        else if (left !== null) self._drawItemLeft(ctx, left, cx, cy, size);
        self.ui.area('relic_' + id, cx - size / 2 - 2, r.y, size + 4, r.h, function () {
          const same = self.tip && self.tip.id === id;
          self.tip = same ? null : { id: id, x: cx, left: BG.Config.ui.relicTipMs };
        });
      });
    }

    // 接近下一档时轻微脉动：变高一点、变亮一点
    _drawProgressFill(ctx, p, barY, k, canPulse, color) {
      const cfg = BG.Config.anim.progressPulse;
      const w = Math.max(7, p.w * k);
      if (!canPulse || 1 - k >= cfg.remainRatio) {
        D.fillRound(ctx, p.x, barY, w, 7, 3.5, color);
        return;
      }
      const wave = 0.5 - 0.5 * Math.cos(2 * Math.PI * this.fx.time / cfg.periodMs);
      const extra = cfg.extraHeight * wave;
      D.fillRound(ctx, p.x, barY - extra / 2, w, 7 + extra, (7 + extra) / 2, color);
      ctx.save();
      ctx.globalAlpha = cfg.glow * wave;
      D.fillRound(ctx, p.x, barY - extra / 2, w, 7 + extra, (7 + extra) / 2, '#ffffff');
      ctx.restore();
    }

    // 炸弹图标：底部是获取进度，右上角是这局还能再获得几颗
    _drawBombStatus(ctx, cx, cy, size) {
      const g = this.game;
      const left = g.bombsLeftToGain();
      if (left > 0) {
        const p = g.bombProgress();
        const w = Math.max(30, size * 0.8);
        D.fillRound(ctx, cx - w / 2, cy + size / 2 - 18, w, 19, 6, 'rgba(11, 14, 19, 0.92)');
        D.text(ctx, p.full ? '满' : p.value + '/' + p.of, cx, cy + size / 2 - 8, { size: 16, bold: true, align: 'center', color: p.full ? T.gold : T.accent });
      }
      D.fillRound(ctx, cx + size / 2 - 11, cy - size / 2 - 3, 15, 19, 6, 'rgba(11, 14, 19, 0.92)');
      D.text(ctx, String(left), cx + size / 2 - 3.5, cy - size / 2 + 6.5, { size: 16, bold: true, align: 'center', color: left > 0 ? T.gold : T.textDim });
    }

    _drawSmallProgress(ctx, cx, cy, size) {
      const p = this.game.smallProgress();
      const w = Math.max(30, size * 0.8);
      D.fillRound(ctx, cx - w / 2, cy + size / 2 - 18, w, 19, 6, 'rgba(11, 14, 19, 0.92)');
      D.text(ctx, p.value + '/' + p.of, cx, cy + size / 2 - 8, { size: 16, bold: true, align: 'center', color: T.accent });
    }

    // 有次数的遗物，图标上的剩余次数
    _drawItemLeft(ctx, left, cx, cy, size) {
      const w = Math.max(22, size * 0.55);
      D.fillRound(ctx, cx - w / 2, cy + size / 2 - 18, w, 19, 6, 'rgba(11, 14, 19, 0.92)');
      D.text(ctx, String(left), cx, cy + size / 2 - 8, { size: 16, bold: true, align: 'center', color: left > 0 ? T.accent : T.textDim });
    }

    // 点击图标后显示名称和一句话说明
    _drawRelicTip(ctx) {
      if (!this.tip) return;
      const relic = BG.Relics.byId[this.tip.id];
      const r = this.L.relicRow;
      const w = Math.min(r.w, 220);
      const h = 58;
      const x = Math.max(r.x, Math.min(r.x + r.w - w, this.tip.x - w / 2));
      const y = r.y + r.h + 2;
      D.fillRound(ctx, x, y, w, h, 10, T.panelLight);
      D.text(ctx, relic.name, x + 12, y + 17, { size: 18, bold: true });
      const usedUp = this.game.itemLeft(this.tip.id) === 0;
      D.text(ctx, usedUp ? '已用完' : relic.short(), x + 12, y + 41, { size: 16, color: T.textDim });
    }

    _drawBoard(ctx) {
      const g = this.game;
      const b = this.L.board;
      const n = g.board.size;
      const cellEmpty = this.stage.color('cellEmpty');
      // 发光用几圈半透明描边，不用 shadowBlur：棋盘每帧都画，大面积模糊太慢
      const glow = this.stage.color('glow');
      ctx.save();
      [[6, 0.1], [4, 0.16], [2, 0.26]].forEach(function (ring) {
        ctx.globalAlpha = ring[1];
        D.strokeRound(ctx, b.x - 5 - ring[0], b.y - 5 - ring[0], b.size + 10 + ring[0] * 2, b.size + 10 + ring[0] * 2, 12 + ring[0], 2, glow);
      });
      ctx.restore();
      D.fillRound(ctx, b.x - 5, b.y - 5, b.size + 10, b.size + 10, 12, this.stage.color('boardBg'));
      D.strokeRound(ctx, b.x - 5, b.y - 5, b.size + 10, b.size + 10, 12, 1.5, this.stage.color('border'));
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const x = b.x + c * b.cell;
          const y = b.y + r * b.cell;
          D.fillRound(ctx, x + 1, y + 1, b.cell - 2, b.cell - 2, b.cell * 0.18, cellEmpty);
        }
      }

      const drag = this.drag;
      const target = drag && drag.target;
      if (target && target.lines.length > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        target.lines.forEach(function (line) {
          if (line.type === 'row') ctx.fillRect(b.x, b.y + line.index * b.cell, b.size, b.cell);
          else ctx.fillRect(b.x + line.index * b.cell, b.y, b.cell, b.size);
        });
        ctx.restore();
      }

      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const v = g.board.get(r, c);
          if (v === -1) continue;
          const lit = target && target.lines.some(function (line) {
            return line.type === 'row' ? line.index === r : line.index === c;
          });
          D.tile(ctx, b.x + c * b.cell, b.y + r * b.cell, b.cell, v, {
            scale: this.anim.popScale(r, c),
            flash: lit ? 0.28 : 0
          });
        }
      }

      if (target) {
        D.piece(ctx, drag.piece.shape, drag.piece.color, b.x + target.c * b.cell, b.y + target.r * b.cell, b.cell, {
          alpha: 0.5,
          flash: target.lines.length > 0 ? 0.25 : 0
        });
      }

      this.anim.drawGhosts(ctx, b);
    }

    _drawTray(ctx) {
      const g = this.game;
      const slots = BG.Layout.traySlots(this.L, g.tray.length);
      const drag = this.drag;
      const anim = this.anim;
      g.tray.forEach(function (p, i) {
        if (!p || (drag && drag.source === i) || anim.isFlying(p)) return;
        const s = slots[i];
        const x = s.x + (s.w - p.shape.w * s.cell) / 2;
        const y = s.y + (s.h - p.shape.h * s.cell) / 2;
        const dim = !g.board.hasPlacement(p.shape);
        D.piece(ctx, p.shape, p.color, x, y, s.cell, dim ? { alpha: 0.35 } : undefined);
      });
    }

    _toolList() {
      const g = this.game;
      const self = this;
      const app = BG.App;
      const can = g.canAct();
      const tools = [];
      if (g.hasBombTool()) {
        tools.push({
          id: 'bomb', label: '炸弹', sub: '×' + g.bombs, disabled: !can || g.bombs <= 0, style: self.aiming ? 'gold' : undefined,
          onTap: function () {
            self.aiming = !self.aiming;
            if (!self.aiming) self._openStuckPanel();
          }
        });
      }
      if (g.holdUnlocked) tools.push({ id: 'hold' });
      // 有奖励的免费次数时先用免费的，不看广告
      const free = g.freeSwaps > 0;
      tools.push({
        id: 'swap', label: '换组', sub: free ? '免费×' + g.freeSwaps : '×' + g.swapsLeft(), free: free,
        disabled: !can || g.phase === 'stuck' || (!free && g.swapsLeft() <= 0),
        style: free ? 'gold' : undefined,
        onTap: function () {
          if (free) {
            g.swapTray(true);
            return;
          }
          app.watchRewarded('swapTray', g).then(function (ok) {
            if (ok) g.swapTray();
          });
        }
      });
      // 免费复活只在卡死时用，这里只显示还有几次
      if (g.freeRevives > 0) tools.push({ id: 'freeRevive', label: '复活', sub: '免费×' + g.freeRevives, style: 'gold' });
      tools.push({
        id: 'pause', label: '暂停', disabled: g.phase === 'over',
        onTap: function () { app.push(new BG.PauseScene(g)); }
      });
      return tools;
    }

    _drawTools(ctx) {
      const r = this.L.tools;
      const tools = this._toolList();
      const gap = 6;
      const w = Math.min(72, (r.w - gap * (tools.length - 1)) / tools.length);
      const total = w * tools.length + gap * (tools.length - 1);
      let x = r.x + (r.w - total) / 2;
      this.holdRect = null;
      tools.forEach(function (t) {
        if (t.id === 'hold') {
          this.holdRect = { x: x, y: r.y, w: w, h: r.h };
          this._drawHold(ctx, this.holdRect);
        } else {
          this.ui.button(ctx, t.id, x, r.y, w, r.h, t.label, {
            sub: t.sub, size: 16, bold: false, disabled: t.disabled, style: t.style, onTap: t.onTap
          });
          if (t.id === 'swap' && !t.free) D.adIcon(ctx, x + w / 2 - 21, r.y + r.h / 2 + 12, 12, t.disabled);
        }
        x += w + gap;
      }, this);
    }

    _drawHold(ctx, r) {
      const g = this.game;
      const drag = this.drag;
      const over = drag && drag.source !== 'hold' && g.canStash() && Kit.inside(r, drag.x, drag.y);
      // 只剩暂存这条路时轻微发光、跳动。拖动时停下，放不下飞回来后接着提示
      const hint = !drag && g.holdOnlyPath() ? 0.5 - 0.5 * Math.cos(2 * Math.PI * this.fx.time / BG.Config.anim.holdHintMs) : -1;
      if (hint >= 0) {
        r = { x: r.x, y: r.y - 3 * hint, w: r.w, h: r.h };
        ctx.save();
        ctx.globalAlpha = 0.2 + 0.4 * hint;
        D.strokeRound(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 14, 3, T.accent);
        ctx.restore();
      }
      D.fillRound(ctx, r.x, r.y, r.w, r.h, 12, over ? T.accentDark : T.panel);
      ctx.save();
      ctx.setLineDash([5, 4]);
      D.strokeRound(ctx, r.x, r.y, r.w, r.h, 12, 1.5, T.accent);
      ctx.restore();
      const hold = g.hold;
      if (hold && !(drag && drag.source === 'hold')) {
        const cell = Math.min(r.h - 10, r.w - 10) / Math.max(hold.shape.w, hold.shape.h);
        const size = BG.Layout.snapDown(Math.min(cell, 14));
        D.piece(ctx, hold.shape, hold.color,
          r.x + (r.w - hold.shape.w * size) / 2, r.y + (r.h - hold.shape.h * size) / 2, size);
        D.fillRound(ctx, r.x + r.w - 26, r.y + 3, 23, 19, 6, 'rgba(11, 14, 19, 0.92)');
        D.text(ctx, String(g.holdLeft), r.x + r.w - 14.5, r.y + 12, { size: 16, bold: true, align: 'center', color: g.holdLeft > 0 ? T.accent : T.textDim });
      } else {
        D.text(ctx, '暂存', r.x + r.w / 2, r.y + r.h / 2 - 11, { size: 16, color: T.textDim, align: 'center' });
        D.text(ctx, '×' + g.holdLeft, r.x + r.w / 2, r.y + r.h / 2 + 12, { size: 16, color: T.textDim, align: 'center' });
      }
    }

    _drawBanners(ctx) {
      if (!this.aiming) return;
      // 显示在托盘上，不挡棋盘
      const r = { x: this.L.x, y: this.L.tray.y + (this.L.tray.h - 44) / 2, w: this.L.cw, h: 44 };
      D.fillRound(ctx, r.x, r.y, r.w, r.h, 10, 'rgba(30, 37, 49, 0.94)');
      D.text(ctx, '点棋盘放炸弹，点别处取消', r.x + r.w / 2, r.y + r.h / 2, { size: 16, align: 'center', color: T.gold });
    }

    _dragTopLeft() {
      const d = this.drag;
      const b = this.L.board;
      const lift = BG.Config.feel.dragLiftCells * b.cell;
      return {
        x: d.x - d.piece.shape.w * b.cell / 2,
        y: d.y - lift - d.piece.shape.h * b.cell
      };
    }

    _drawDragPiece(ctx) {
      if (!this.drag || !this.drag.moved) return;
      const pos = this._dragTopLeft();
      D.piece(ctx, this.drag.piece.shape, this.drag.piece.color, pos.x, pos.y, this.L.board.cell);
    }

    // ---------- 输入 ----------

    _boardCellAt(x, y) {
      const b = this.L.board;
      if (x < b.x || y < b.y || x >= b.x + b.size || y >= b.y + b.size) return null;
      return { r: Math.floor((y - b.y) / b.cell), c: Math.floor((x - b.x) / b.cell) };
    }

    down(x, y) {
      if (this.aiming) {
        const cell = this._boardCellAt(x, y);
        if (cell) {
          this.aiming = false;
          this.game.useBomb(cell.r, cell.c);
        } else if (!this.ui.down(x, y)) {
          this.aiming = false;
          this._openStuckPanel();
        }
        return;
      }
      const hit = this.ui.down(x, y);
      if (this.tip && !(hit && String(this.ui.pressedId).indexOf('relic_') === 0)) this.tip = null;
      if (hit) return;
      if (!this.game.canAct()) return;
      this.game.noteAction();

      if (this.holdRect && this.game.hold && Kit.inside(this.holdRect, x, y)) {
        this._startDrag('hold', this.game.hold, x, y, false);
        return;
      }
      const slots = BG.Layout.traySlots(this.L, this.game.tray.length);
      for (let i = 0; i < slots.length; i++) {
        if (this.game.tray[i] && Kit.inside(slots[i], x, y)) {
          this._startDrag(i, this.game.tray[i], x, y, true);
          return;
        }
      }
    }

    _startDrag(source, piece, x, y, moved) {
      this.drag = { source: source, piece: piece, x: x, y: y, startX: x, startY: y, moved: moved, target: null };
      BG.Audio.play('pick');
      this._updateTarget();
    }

    move(x, y) {
      const d = this.drag;
      if (!d) return;
      d.x = x;
      d.y = y;
      if (Math.abs(x - d.startX) + Math.abs(y - d.startY) > 10) d.moved = true;
      this._updateTarget();
    }

    _updateTarget() {
      const d = this.drag;
      d.target = null;
      if (!d.moved) return;
      const b = this.L.board;
      const pos = this._dragTopLeft();
      const r = Math.round((pos.y - b.y) / b.cell);
      const c = Math.round((pos.x - b.x) / b.cell);
      if (this.game.canPlace(d.source, r, c)) {
        d.target = { r: r, c: c, lines: this.game.previewLines(d.source, r, c) };
      }
    }

    up(x, y) {
      if (this.ui.up(x, y)) return;
      const d = this.drag;
      if (!d) return;
      this.drag = null;

      if (d.source === 'hold' && !d.moved) {
        this.game.unstash();
        return;
      }
      if (d.target && this.game.place(d.source, d.target.r, d.target.c)) return;
      if (d.source !== 'hold' && this.holdRect && Kit.inside(this.holdRect, x, y) && this.game.stash(d.source)) {
        BG.Audio.play('drop');
        return;
      }
      this._flyBack(d);
    }

    _flyBack(d) {
      BG.Audio.play('back');
      this.drag = d;
      const pos = this._dragTopLeft();
      this.drag = null;
      const from = { x: pos.x, y: pos.y, cell: this.L.board.cell };
      let to;
      if (d.source === 'hold') {
        const r = this.holdRect;
        to = { x: r.x + 4, y: r.y + 4, cell: 10 };
      } else {
        const s = BG.Layout.traySlots(this.L, this.game.tray.length)[d.source];
        to = {
          x: s.x + (s.w - d.piece.shape.w * s.cell) / 2,
          y: s.y + (s.h - d.piece.shape.h * s.cell) / 2,
          cell: s.cell
        };
      }
      this.anim.flyBack(d.piece, from, to);
    }
  }

  BG.PlayScene = PlayScene;
})();
