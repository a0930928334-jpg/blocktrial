// 音效：全部用 WebAudio 现场合成，不加载外部资源。
// 移植微信时：wx.createWebAudioContext 接口基本相同，只需换创建方式。
(function () {
  'use strict';

  let ctx = null;
  let enabled = true;

  // 一个带音量包络的振荡器
  function tone(freq, startOffset, duration, opts) {
    const o = opts || {};
    const t0 = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.toFreq) osc.frequency.exponentialRampToValueAtTime(o.toFreq, t0 + duration);
    const peak = o.volume || 0.2;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  const sounds = {
    click: function () { tone(660, 0, 0.05, { type: 'triangle', volume: 0.12 }); },
    pick: function () { tone(420, 0, 0.07, { type: 'triangle', toFreq: 620, volume: 0.15 }); },
    drop: function () { tone(240, 0, 0.09, { type: 'sine', toFreq: 130, volume: 0.32 }); },
    back: function () { tone(360, 0, 0.1, { type: 'triangle', toFreq: 220, volume: 0.12 }); },
    // 线数越多音调越高
    clear: function (lines) {
      const base = 440 * Math.pow(1.122, Math.min(lines, 8) * 2);
      tone(base, 0, 0.16, { type: 'triangle', volume: 0.2 });
      tone(base * 1.5, 0.05, 0.18, { type: 'sine', volume: 0.16 });
    },
    combo: function (n) {
      const base = 520 * Math.pow(1.06, Math.min(n, 12));
      tone(base, 0.08, 0.1, { type: 'square', volume: 0.06 });
      tone(base * 1.26, 0.16, 0.14, { type: 'square', volume: 0.06 });
    },
    relic: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone(f, i * 0.07, 0.2, { type: 'triangle', volume: 0.16 });
      });
    },
    // 加分遗物生效，n 让每个遗物的音高不同
    relicHit: function (n) {
      const base = 660 * Math.pow(1.122, n * 2);
      tone(base, 0, 0.09, { type: 'square', volume: 0.07 });
      tone(base * 1.5, 0.07, 0.16, { type: 'triangle', volume: 0.2 });
    },
    bomb: function () { tone(160, 0, 0.28, { type: 'sawtooth', toFreq: 50, volume: 0.22 }); },
    fail: function () {
      [392, 330, 262].forEach(function (f, i) {
        tone(f, i * 0.15, 0.28, { type: 'triangle', volume: 0.18 });
      });
    },
    win: function () {
      [523, 659, 784, 1047, 1319].forEach(function (f, i) {
        tone(f, i * 0.09, 0.3, { type: 'triangle', volume: 0.17 });
      });
    }
  };

  BG.Audio = {
    // 浏览器要求用户操作后才能发声，每次触摸都调用一下
    unlock: function () {
      try {
        if (!ctx) {
          const Ctor = window.AudioContext || window.webkitAudioContext;
          if (!Ctor) return;
          ctx = new Ctor();
        }
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) {
        ctx = null;
      }
    },

    setEnabled: function (value) {
      enabled = value;
    },

    play: function (name, param) {
      if (!enabled || !ctx || ctx.state !== 'running' || !sounds[name]) return;
      try {
        sounds[name](param);
      } catch (e) {
        // 音效失败不影响游戏
      }
    }
  };
})();
