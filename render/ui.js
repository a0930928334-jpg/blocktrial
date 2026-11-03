// Canvas 上的按钮、弹窗、滚动。按钮每帧绘制时登记点击区域。
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;

  const STYLES = {
    primary: { bg: T.accent, pressed: T.accentDark, text: '#06201c' },
    secondary: { bg: T.panelLight, pressed: T.line, text: T.text },
    danger: { bg: '#4a2a2c', pressed: '#6a3638', text: '#ffb4ad' },
    gold: { bg: T.gold, pressed: '#c7901b', text: '#2a1e04' }
  };

  function inside(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  class UI {
    constructor() {
      this.items = [];
      this.pressedId = null;
      this.clip = null;
    }

    begin() {
      this.items = [];
      this.clip = null;
    }

    // 只登记点击区域，不绘制
    area(id, x, y, w, h, onTap) {
      this.items.push({ id: id, x: x, y: y, w: w, h: h, onTap: onTap, clip: this.clip });
    }

    // opts: { style, sub, onTap, disabled, size, bold }
    button(ctx, id, x, y, w, h, label, opts) {
      const o = opts || {};
      const style = STYLES[o.style || 'secondary'];
      const pressed = this.pressedId === id && !o.disabled;
      ctx.save();
      if (o.disabled) ctx.globalAlpha = 0.42;
      D.fillRound(ctx, x, y, w, h, 12, pressed ? style.pressed : style.bg);
      const size = o.size || 18;
      const bold = o.bold !== false;
      if (o.sub) {
        D.text(ctx, label, x + w / 2, y + h / 2 - 11, { size: size, bold: bold, color: style.text, align: 'center' });
        D.text(ctx, o.sub, x + w / 2, y + h / 2 + 12, { size: 16, color: style.text, align: 'center' });
      } else {
        D.text(ctx, label, x + w / 2, y + h / 2 + 1, { size: size, bold: bold, color: style.text, align: 'center' });
      }
      ctx.restore();
      if (!o.disabled && o.onTap) this.area(id, x, y, w, h, o.onTap);
    }

    _find(id) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        if (this.items[i].id === id) return this.items[i];
      }
      return null;
    }

    down(x, y) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        if (it.clip && !inside(it.clip, x, y)) continue;
        if (inside(it, x, y)) {
          this.pressedId = it.id;
          return true;
        }
      }
      return false;
    }

    cancel() {
      this.pressedId = null;
    }

    up(x, y) {
      const id = this.pressedId;
      this.pressedId = null;
      if (id === null) return false;
      const it = this._find(id);
      if (it && inside(it, x, y)) {
        BG.Audio.play('click');
        it.onTap();
      }
      return true;
    }
  }

  // 拖动滚动
  class Scroller {
    constructor() {
      this.y = 0;
      this.max = 0;
      this.dragging = false;
      this.lastY = 0;
      this.moved = 0;
    }

    setContent(contentH, viewH) {
      this.max = Math.max(0, contentH - viewH);
      this.y = Math.min(this.y, this.max);
    }

    start(y) {
      this.dragging = true;
      this.lastY = y;
      this.moved = 0;
    }

    drag(y) {
      if (!this.dragging) return;
      const dy = y - this.lastY;
      this.lastY = y;
      this.moved += Math.abs(dy);
      this.y = Math.max(0, Math.min(this.max, this.y - dy));
    }

    end() {
      this.dragging = false;
    }
  }

  function dim(ctx, screen) {
    ctx.fillStyle = T.dim;
    ctx.fillRect(0, 0, screen.width, screen.height);
  }

  function panel(ctx, r) {
    D.fillRound(ctx, r.x, r.y, r.w, r.h, 16, T.panel);
  }

  // 居中弹窗的矩形，不超出安全区
  function modalRect(screen, width, height) {
    const safe = screen.safe;
    const maxW = screen.width - safe.left - safe.right - 24;
    const maxH = screen.height - safe.top - safe.bottom - 24;
    const w = Math.min(width, maxW);
    const h = Math.min(height, maxH);
    return {
      x: safe.left + (screen.width - safe.left - safe.right - w) / 2,
      y: safe.top + (screen.height - safe.top - safe.bottom - h) / 2,
      w: w,
      h: h
    };
  }

  function clipTo(ctx, r) {
    const snap = BG.Layout.snap;
    const x = snap(r.x);
    const y = snap(r.y);
    ctx.beginPath();
    ctx.rect(x, y, snap(r.x + r.w) - x, snap(r.y + r.h) - y);
    ctx.clip();
  }

  BG.UI = UI;
  BG.Scroller = Scroller;
  BG.UIKit = { inside: inside, dim: dim, panel: panel, modalRect: modalRect, clipTo: clipTo };
})();
