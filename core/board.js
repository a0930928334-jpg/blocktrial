// 棋盘：放置合法性、行列消除、区域清除。
// 格子值：-1 为空，0 及以上为颜色编号。
(function () {
  'use strict';

  class Board {
    constructor(size) {
      this.size = size;
      this.cells = new Array(size * size).fill(-1);
    }

    clone() {
      const b = new Board(this.size);
      b.cells = this.cells.slice();
      return b;
    }

    get(r, c) {
      return this.cells[r * this.size + c];
    }

    set(r, c, v) {
      this.cells[r * this.size + c] = v;
    }

    canPlace(shape, r, c) {
      if (r < 0 || c < 0 || r + shape.h > this.size || c + shape.w > this.size) return false;
      for (let i = 0; i < shape.cells.length; i++) {
        if (this.get(r + shape.cells[i][0], c + shape.cells[i][1]) !== -1) return false;
      }
      return true;
    }

    hasPlacement(shape) {
      for (let r = 0; r <= this.size - shape.h; r++) {
        for (let c = 0; c <= this.size - shape.w; c++) {
          if (this.canPlace(shape, r, c)) return true;
        }
      }
      return false;
    }

    place(shape, r, c, color) {
      shape.cells.forEach(function (p) {
        this.set(r + p[0], c + p[1], color);
      }, this);
    }

    // 返回所有满线：[{ type: 'row'|'col', index, colors: [...] }]
    findFullLines() {
      const lines = [];
      const n = this.size;
      for (let r = 0; r < n; r++) {
        const colors = [];
        for (let c = 0; c < n; c++) colors.push(this.get(r, c));
        if (colors.indexOf(-1) === -1) lines.push({ type: 'row', index: r, colors: colors });
      }
      for (let c = 0; c < n; c++) {
        const colors = [];
        for (let r = 0; r < n; r++) colors.push(this.get(r, c));
        if (colors.indexOf(-1) === -1) lines.push({ type: 'col', index: c, colors: colors });
      }
      return lines;
    }

    // 假设在 (r, c) 放下，返回会被消除的线（不改动棋盘）
    previewLines(shape, r, c) {
      const test = this.clone();
      test.place(shape, r, c, 0);
      return test.findFullLines();
    }

    // 清除这些线，返回被清除的格子（行列交叉处只算一次）
    clearLines(lines) {
      const removed = [];
      const seen = {};
      const n = this.size;
      const take = function (board, r, c) {
        const key = r * n + c;
        if (seen[key]) return;
        seen[key] = true;
        removed.push({ r: r, c: c, color: board.get(r, c) });
      };
      lines.forEach(function (line) {
        for (let i = 0; i < n; i++) {
          if (line.type === 'row') take(this, line.index, i);
          else take(this, i, line.index);
        }
      }, this);
      removed.forEach(function (p) { this.set(p.r, p.c, -1); }, this);
      return removed;
    }

    // 以 (r, c) 为中心清除正方形区域，超出棋盘的部分忽略，返回被清除的格子
    clearArea(r, c, radius) {
      const removed = [];
      for (let i = r - radius; i <= r + radius; i++) {
        for (let k = c - radius; k <= c + radius; k++) {
          if (i < 0 || k < 0 || i >= this.size || k >= this.size) continue;
          const v = this.get(i, k);
          if (v !== -1) {
            removed.push({ r: i, c: k, color: v });
            this.set(i, k, -1);
          }
        }
      }
      return removed;
    }

    // 方块最密集的完整 3×3 区域的中心（半径可配），并列时取最靠左上的
    densestCenter(radius) {
      let best = { r: radius, c: radius, count: -1 };
      for (let r = radius; r < this.size - radius; r++) {
        for (let c = radius; c < this.size - radius; c++) {
          let count = 0;
          for (let i = r - radius; i <= r + radius; i++) {
            for (let k = c - radius; k <= c + radius; k++) {
              if (this.get(i, k) !== -1) count++;
            }
          }
          if (count > best.count) best = { r: r, c: c, count: count };
        }
      }
      return best;
    }

    isEmpty() {
      return this.cells.every(function (v) { return v === -1; });
    }
  }

  BG.Board = Board;
})();
