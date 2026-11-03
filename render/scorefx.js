// 顶部分数的跳动反馈：滚动、放大回弹、变色、抖动、飘字。只管状态不管绘制，方便测试。
// 连续加分时从当前状态接着走：放大不从 1 重来，颜色不闪，抖动不叠加，飘字合并。
(function () {
  'use strict';

  function easeOut(t) {
    return 1 - (1 - t) * (1 - t);
  }

  function hexToRgb(hex) {
    return [1, 3, 5].map(function (i) { return parseInt(hex.substr(i, 2), 16); });
  }

  // 按比例混合两个 #rrggbb 颜色
  function mixColor(from, to, k) {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    const c = a.map(function (v, i) { return Math.round(v + (b[i] - v) * k); });
    return 'rgb(' + c.join(',') + ')';
  }

  class ScoreFx {
    constructor(cfg) {
      this.cfg = cfg;
      this.time = 0;
      this.value = 0;
      this.roll = null;
      this.pulse = null;
      this.tint = null;
      this.shakeLeft = 0;
      this.shakeAmp = 0;
      this.float = null;
    }

    // 有遗物加成时，无论多少分都算大额
    tierOf(amount, hasRelic) {
      const c = this.cfg;
      if (hasRelic || amount >= c.bigMin) return c.big;
      return amount >= c.midMin ? c.mid : c.small;
    }

    gain(amount, target, hasRelic) {
      const tier = this.tierOf(amount, hasRelic);
      this._startRoll(target);
      this._startPulse(tier);
      this._startTint(tier);
      if (tier.shake && this.shakeLeft <= 0) {
        this.shakeLeft = tier.shakeMs;
        this.shakeAmp = tier.shake;
      }
      this._addFloat(amount, tier);
    }

    _startRoll(target) {
      const r = this.cfg.roll;
      const from = this.value;
      const ms = Math.max(r.minMs, Math.min(r.maxMs, (target - from) * r.msPerPoint));
      this.roll = { from: from, to: target, t: 0, ms: ms };
    }

    // 只有比当前更大的放大才重新开始，小额加分不会打断正在回弹的大额
    _startPulse(tier) {
      const now = this.scale();
      if (tier.scale <= now) return;
      this.pulse = { from: now, peak: tier.scale, t: 0, ms: tier.ms };
    }

    _startTint(tier) {
      if (!tier.strength || tier.strength < this.tintStrength()) return;
      this.tint = { color: tier.color, strength: tier.strength, t: 0, ms: tier.colorMs };
    }

    _addFloat(amount, tier) {
      const c = this.cfg;
      if (this.float && this.float.t < c.floatMerge) {
        this.float.amount += amount;
        this.float.size = Math.max(this.float.size, tier.floatSize);
        this.float.t = 0;
      } else if (tier.floatSize) {
        this.float = { amount: amount, size: tier.floatSize, color: tier.color, t: 0 };
      }
    }

    update(dt) {
      this.time += dt;
      if (this.roll) {
        this.roll.t += dt;
        const k = Math.min(1, this.roll.t / this.roll.ms);
        this.value = this.roll.from + (this.roll.to - this.roll.from) * easeOut(k);
        if (k >= 1) {
          this.value = this.roll.to;
          this.roll = null;
        }
      }
      if (this.pulse) {
        this.pulse.t += dt;
        if (this.pulse.t >= this.pulse.ms) this.pulse = null;
      }
      if (this.tint) {
        this.tint.t += dt;
        if (this.tint.t >= this.tint.ms) this.tint = null;
      }
      if (this.shakeLeft > 0) this.shakeLeft -= dt;
      if (this.float) {
        this.float.t += dt;
        if (this.float.t >= this.cfg.floatLife) this.float = null;
      }
    }

    // 显示的分数。target 变了但没有走 gain（调试面板改分）时直接跟上
    display(target) {
      if (!this.roll && this.value !== target) this.value = target;
      return Math.round(this.value);
    }

    scale() {
      const p = this.pulse;
      if (!p) return 1;
      const rise = this.cfg.riseRatio;
      const k = p.t / p.ms;
      if (k < rise) return p.from + (p.peak - p.from) * easeOut(k / rise);
      return p.peak + (1 - p.peak) * easeOut((k - rise) / (1 - rise));
    }

    tintStrength() {
      const t = this.tint;
      return t ? t.strength * (1 - t.t / t.ms) : 0;
    }

    color(base) {
      if (!this.tint) return base;
      return mixColor(base, this.tint.color, this.tintStrength());
    }

    // 一次平滑的左右抖动，幅度随时间衰减
    shakeX(ms) {
      if (this.shakeLeft <= 0) return 0;
      const passed = ms - this.shakeLeft;
      return Math.sin(passed / 22) * this.shakeAmp * (this.shakeLeft / ms);
    }

    shakeOffset() {
      return this.shakeLeft > 0 ? this.shakeX(this.cfg.big.shakeMs) : 0;
    }
  }

  BG.ScoreFx = ScoreFx;
})();
