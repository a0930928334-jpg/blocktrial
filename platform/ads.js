// 广告接口。试玩版是模拟广告：全屏遮罩加倒计时。
// 移植微信时：showRewarded 内部换成 wx.createRewardedVideoAd，
// 在 onClose 里 resolve(res.isEnded)；tick、draw、handle 变成空函数即可。
(function () {
  'use strict';

  let current = null;
  let countdownOn = true;
  let fast = false;

  function closeRect(screen) {
    return { x: screen.width - 92 - screen.safe.right, y: 12 + screen.safe.top, w: 80, h: 44 };
  }

  function show(kind, type) {
    return new Promise(function (resolve) {
      if (!countdownOn) {
        resolve(true);
        return;
      }
      current = {
        kind: kind,
        type: type,
        remainingMs: (fast ? BG.Config.ads.countdownFastSec : BG.Config.ads.countdownSec) * 1000,
        resolve: resolve
      };
    });
  }

  function finish(result) {
    const done = current;
    current = null;
    done.resolve(result);
  }

  BG.Ads = {
    // 看完返回 true，中途关闭返回 false
    showRewarded: function (type) {
      return show('rewarded', type);
    },

    showInterstitial: function () {
      return show('interstitial', 'interstitial');
    },

    active: function () {
      return !!current;
    },

    // 调试面板用：开关模拟广告的倒计时
    setCountdownEnabled: function (value) {
      countdownOn = value;
    },

    countdownEnabled: function () {
      return countdownOn;
    },

    // 调试面板用：切到快速倒计时，方便测试
    setFast: function (value) {
      fast = value;
    },

    isFast: function () {
      return fast;
    },

    tick: function (dtMs) {
      if (!current) return;
      current.remainingMs -= dtMs;
      if (current.remainingMs <= 0) finish(true);
    },

    // 遮罩画在 canvas 上，微信版不需要
    draw: function (ctx, screen) {
      if (!current) return;
      const font = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.save();
      ctx.fillStyle = 'rgba(6, 8, 12, 0.96)';
      ctx.fillRect(0, 0, screen.width, screen.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px ' + font;
      ctx.fillText('【模拟广告】', screen.width / 2, screen.height / 2 - 40);
      ctx.font = 'bold 48px ' + font;
      ctx.fillText(String(Math.ceil(current.remainingMs / 1000)), screen.width / 2, screen.height / 2 + 16);
      ctx.fillStyle = '#a9b3c2';
      ctx.font = '16px ' + font;
      const tip = current.kind === 'rewarded' ? '看完可以获得奖励，中途关闭没有奖励' : '倒计时结束后自动关闭';
      ctx.fillText(tip, screen.width / 2, screen.height / 2 + 64);

      const r = closeRect(screen);
      // 线宽取整到物理像素，让线条整个落在像素格内
      const snap = function (v) { return Math.round(v * screen.dpr) / screen.dpr; };
      const lw = Math.max(snap(1), 1 / screen.dpr);
      const x0 = snap(r.x);
      const y0 = snap(r.y);
      ctx.strokeStyle = '#a9b3c2';
      ctx.lineWidth = lw;
      ctx.strokeRect(x0 + lw / 2, y0 + lw / 2, snap(r.w) - lw, snap(r.h) - lw);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('关闭', r.x + r.w / 2, r.y + r.h / 2);
      ctx.restore();
    },

    // 广告显示时吞掉所有输入
    handle: function (ev, screen) {
      if (!current || ev.type !== 'up') return;
      const r = closeRect(screen);
      if (ev.x >= r.x && ev.x <= r.x + r.w && ev.y >= r.y && ev.y <= r.y + r.h) finish(false);
    }
  };
})();
