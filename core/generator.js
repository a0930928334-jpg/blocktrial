// 方块生成：按权重抽取，保证每组至少一块能放下。
(function () {
  'use strict';

  function interpolate(curve, x) {
    if (x <= curve[0][0]) return curve[0][1];
    for (let i = 1; i < curve.length; i++) {
      if (x <= curve[i][0]) {
        const a = curve[i - 1];
        const b = curve[i];
        return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      }
    }
    return curve[curve.length - 1][1];
  }

  class Generator {
    // fixedSequence：每日挑战用，权重不受分数和遗物影响
    constructor(seed, fixedSequence, cfg) {
      this.seed = seed;
      this.fixed = fixedSequence;
      this.cfg = cfg;
    }

    // ctx: { score, groupIndex, has(id), bigMult? }，返回 { 形状id: 权重 }
    weights(ctx) {
      const g = this.cfg.generator;
      const out = {};
      if (this.fixed) {
        const step = ctx.groupIndex * this.cfg.board.traySize;
        const hard = interpolate(g.dailyHardCurve, step);
        BG.Shapes.list.forEach(function (shape) {
          const w = g.shapeWeights[shape.id] || 0;
          out[shape.id] = g.dailyHardShapes.indexOf(shape.id) !== -1 ? w * hard : w;
        });
        return out;
      }
      const boost = interpolate(g.bigCurve, ctx.score) * (ctx.bigMult || 1);
      BG.Shapes.list.forEach(function (shape) {
        const w = g.shapeWeights[shape.id] || 0;
        out[shape.id] = shape.count >= g.bigCells ? w * boost : w;
      });
      return out;
    }

    _pick(rng, weights) {
      let total = 0;
      BG.Shapes.list.forEach(function (s) { total += weights[s.id]; });
      let roll = rng.next() * total;
      for (let i = 0; i < BG.Shapes.list.length; i++) {
        const shape = BG.Shapes.list[i];
        roll -= weights[shape.id];
        if (roll < 0 && weights[shape.id] > 0) return shape;
      }
      return BG.Shapes.byId['1x1'];
    }

    _piece(rng, shape) {
      return { shape: shape, color: rng.int(this.cfg.board.colorCount) };
    }

    // 按权重随机一组。有"小块"遗物时最后一块固定是 1×1。
    rollGroup(rng, weights, count, ctx) {
      const pieces = [];
      for (let i = 0; i < count; i++) pieces.push(this._piece(rng, this._pick(rng, weights)));
      if (ctx.has('smallPiece') && count > 0) {
        pieces[count - 1] = { shape: BG.Shapes.byId['1x1'], color: pieces[count - 1].color };
      }
      return pieces;
    }

    // 抽 count 块，至少一块能放下。tag 和 index 决定所用的随机流。
    draw(board, count, tag, index, ctx) {
      const weights = this.weights(ctx);
      let pieces = [];
      for (let attempt = 0; attempt <= this.cfg.generator.maxRetries; attempt++) {
        const rng = new BG.RNG(BG.RNG.derive(this.seed, tag, index, attempt));
        pieces = this.rollGroup(rng, weights, count, ctx);
        if (pieces.some(function (p) { return board.hasPlacement(p.shape); })) return pieces;
      }
      // 满线都会被消除，棋盘不会全满，所以 1×1 一定放得下
      pieces[0] = { shape: BG.Shapes.byId['1x1'], color: pieces[0].color };
      return pieces;
    }

    // 保底发牌：逐块在模拟棋盘上试放，保证这组小方块按顺序都能放下
    drawSmallGuaranteed(board, count, maxCells, index) {
      const rng = new BG.RNG(BG.RNG.derive(this.seed, 'revive', index));
      const sim = board.clone();
      const small = BG.Shapes.list.filter(function (s) { return s.count <= maxCells; });
      const pieces = [];
      for (let i = 0; i < count; i++) {
        const fits = small.filter(function (s) { return sim.hasPlacement(s); });
        const shape = fits[rng.int(fits.length)];
        pieces.push(this._piece(rng, shape));
        this._simulate(sim, shape);
      }
      return pieces;
    }

    _simulate(sim, shape) {
      for (let r = 0; r <= sim.size - shape.h; r++) {
        for (let c = 0; c <= sim.size - shape.w; c++) {
          if (sim.canPlace(shape, r, c)) {
            sim.place(shape, r, c, 0);
            sim.clearLines(sim.findFullLines());
            return;
          }
        }
      }
    }

    // 三选一候选：每个阶梯一张固定排序表，取未拥有的，刷新时顺延到后面几个。
    // 两种类型都还有剩余时，必须同时包含加分型和道具型。
    offer(tierIndex, refreshNo, owned, pool) {
      const rng = new BG.RNG(BG.RNG.derive(this.seed, 'offer', tierIndex));
      const avail = rng.shuffle(pool).filter(function (id) { return owned.indexOf(id) === -1; });
      const n = Math.min(this.cfg.relic.choices, avail.length);
      if (n === 0) return [];
      const start = (refreshNo * n) % avail.length;
      const rotated = avail.slice(start).concat(avail.slice(0, start));
      const out = rotated.slice(0, n);
      const typeOf = function (id) { return BG.Relics.byId[id].type; };
      if (n >= 2 && out.every(function (id) { return typeOf(id) === typeOf(out[0]); })) {
        const other = rotated.find(function (id) { return typeOf(id) !== typeOf(out[0]); });
        if (other) out[n - 1] = other;
      }
      return out;
    }
  }

  Generator.interpolate = interpolate;
  BG.Generator = Generator;
})();
