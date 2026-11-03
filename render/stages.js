// 阶段主题：背景、棋盘底色、边框和发光。方块颜色不变。
// 只画渐变和一条路径的简单图案，不用离屏画布。
(function () {
  'use strict';

  const THEMES = [
    { name: '夜蓝', top: '#12161d', bottom: '#1a2433', boardBg: '#0b0e13', cellEmpty: '#1a2029', border: '#3a4557', glow: '#2fc4b2', pattern: 'dots', ink: 'rgba(255, 255, 255, 0.05)' },
    { name: '深海', top: '#07202a', bottom: '#0c3440', boardBg: '#04141a', cellEmpty: '#0e2730', border: '#1f6f7a', glow: '#3de0d0', pattern: 'diagonal', ink: 'rgba(120, 240, 230, 0.06)' },
    { name: '紫夜', top: '#1a1030', bottom: '#2a1a48', boardBg: '#0f0820', cellEmpty: '#1f1536', border: '#6a4fb0', glow: '#b78cff', pattern: 'triangles', ink: 'rgba(200, 170, 255, 0.06)' },
    { name: '余烬', top: '#24100f', bottom: '#3a1a14', boardBg: '#160908', cellEmpty: '#2a1513', border: '#a0523a', glow: '#ff9a5c', pattern: 'chevron', ink: 'rgba(255, 180, 130, 0.06)' },
    { name: '松林', top: '#0e1f14', bottom: '#16301f', boardBg: '#07130c', cellEmpty: '#14261a', border: '#3f8a5a', glow: '#6fe39a', pattern: 'grid', ink: 'rgba(150, 240, 180, 0.05)' },
    { name: '暗金', top: '#1f1a0a', bottom: '#2f2810', boardBg: '#130f05', cellEmpty: '#27200f', border: '#a58a35', glow: '#ffd766', pattern: 'rings', ink: 'rgba(255, 225, 130, 0.06)' }
  ];

  function hexToRgb(hex) {
    return [1, 3, 5].map(function (i) { return parseInt(hex.substr(i, 2), 16); });
  }

  function mix(from, to, k) {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    return 'rgb(' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * k); }).join(',') + ')';
  }

  function rgbToHex(rgb) {
    return '#' + rgb.slice(4, -1).split(',').map(function (v) {
      const s = Number(v).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('');
  }

  // WCAG 对比度，测试用它检查每套主题下方块是否清晰
  function luminance(hex) {
    const c = hexToRgb(hex).map(function (v) {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrast(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  // 阶段序号从 1 开始，主题按顺序循环
  function themeOf(stage) {
    return THEMES[(stage - 1) % THEMES.length];
  }

  const PATTERNS = {
    dots: function (ctx, w, h) {
      for (let y = 22; y < h; y += 44) {
        for (let x = 22; x < w; x += 44) {
          ctx.moveTo(x + 2.5, y);
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    },
    diagonal: function (ctx, w, h) {
      for (let x = -h; x < w; x += 48) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
      }
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    triangles: function (ctx, w, h) {
      for (let y = 20; y < h; y += 64) {
        for (let x = 20; x < w; x += 64) {
          ctx.moveTo(x, y - 9);
          ctx.lineTo(x + 9, y + 7);
          ctx.lineTo(x - 9, y + 7);
          ctx.closePath();
        }
      }
      ctx.fill();
    },
    chevron: function (ctx, w, h) {
      for (let y = 16; y < h; y += 56) {
        for (let x = 0; x < w; x += 56) {
          ctx.moveTo(x, y + 14);
          ctx.lineTo(x + 28, y);
          ctx.lineTo(x + 56, y + 14);
        }
      }
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    grid: function (ctx, w, h) {
      for (let x = 0; x < w; x += 52) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += 52) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.lineWidth = 1;
      ctx.stroke();
    },
    rings: function (ctx, w, h) {
      for (let y = 40; y < h; y += 96) {
        for (let x = 40; x < w; x += 96) {
          ctx.moveTo(x + 18, y);
          ctx.arc(x, y, 18, 0, Math.PI * 2);
        }
      }
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  // 背景每帧都要铺满屏幕，整屏线性渐变太慢。这些颜色上下只差十几级，
  // 分成这么多条纯色带和真渐变看不出区别，纯色填充却快得多。
  const BANDS = 24;

  function paintBands(ctx, screen, colorAt) {
    const snap = BG.Layout.snap;
    let y = 0;
    for (let i = 0; i < BANDS; i++) {
      const next = i === BANDS - 1 ? screen.height : snap(screen.height * (i + 1) / BANDS);
      ctx.fillStyle = colorAt(i / (BANDS - 1));
      ctx.fillRect(0, y, screen.width, next - y);
      y = next;
    }
  }

  function paintPattern(ctx, screen, theme) {
    ctx.beginPath();
    ctx.fillStyle = theme.ink;
    ctx.strokeStyle = theme.ink;
    PATTERNS[theme.pattern](ctx, screen.width, screen.height);
  }

  // 当前阶段和切换过渡。不接管任何输入。
  class StageView {
    constructor(stage, fadeMs) {
      this.stage = stage;
      this.fadeMs = fadeMs;
      this.from = null;
      this.t = 0;
    }

    set(stage) {
      if (stage === this.stage) return;
      this.from = themeOf(this.stage);
      this.stage = stage;
      this.t = 0;
    }

    update(dt) {
      if (!this.from) return;
      this.t += dt;
      if (this.t >= this.fadeMs) this.from = null;
    }

    _k() {
      return this.from ? Math.min(1, this.t / this.fadeMs) : 1;
    }

    // 当前的棋盘配色，过渡中按比例混合
    color(key) {
      const to = themeOf(this.stage)[key];
      return this.from ? mix(this.from[key], to, this._k()) : to;
    }

    drawBackground(ctx, screen) {
      const to = themeOf(this.stage);
      const from = this.from;
      const k = this._k();
      paintBands(ctx, screen, function (t) {
        const end = mix(to.top, to.bottom, t);
        return from ? mix(rgbToHex(mix(from.top, from.bottom, t)), rgbToHex(end), k) : end;
      });
      ctx.save();
      if (from) {
        ctx.globalAlpha = 1 - k;
        paintPattern(ctx, screen, from);
      }
      ctx.globalAlpha = k;
      paintPattern(ctx, screen, to);
      ctx.restore();
    }
  }

  BG.Stages = { themes: THEMES, themeOf: themeOf, contrast: contrast };
  BG.StageView = StageView;
})();
