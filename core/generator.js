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

    // ctx: { score, groupIndex, has(id), awkwardMult?, placements, szAllowed, szBoard?, oneAllowed, board?, bigAllowed? }
    // board 动态发牌时传入：放不下的形状权重为 0。szBoard：S/Z 合法位置太少时权重为 0。
    // 大方块和小方块的权重不随阶段、步数、分数变化，见 CLAUDE.md 的设计原则。
    // 返回 { 形状id: 权重 }
    weights(ctx) {
      const g = this.cfg.generator;
      const out = {};
      if (this.fixed) {
        const step = ctx.groupIndex * this.cfg.board.traySize;
        const awkward = interpolate(g.dailyAwkwardCurve, step);
        BG.Shapes.list.forEach(function (shape) {
          let w = g.sz.ids.indexOf(shape.id) !== -1 ? 0 : (g.shapeWeights[shape.id] || 0);
          if (shape.count >= g.bigCells) w *= g.dailyBigMult;
          if (g.awkwardShapes.indexOf(shape.id) !== -1) w *= awkward;
          out[shape.id] = w;
        });
        return out;
      }
      const sz = ctx.szAllowed === false ? 0 : interpolate(g.sz.curve, ctx.placements || 0);
      BG.Shapes.list.forEach(function (shape) {
        let w = g.shapeWeights[shape.id] || 0;
        if (shape.count >= g.bigCells && ctx.bigAllowed === false) w = 0;
        if (ctx.awkwardMult && g.awkwardShapes.indexOf(shape.id) !== -1) w *= ctx.awkwardMult;
        if (g.sz.ids.indexOf(shape.id) !== -1) {
          w *= sz;
          if (w > 0 && ctx.szBoard && ctx.szBoard.countPlacements(shape) < g.sz.minMoves) w = 0;
        }
        if (shape.id === '1x1' && ctx.oneAllowed === false) w = 0;
        if (ctx.board && !ctx.board.hasPlacement(shape)) w = 0;
        out[shape.id] = w;
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

    // 这一组的大方块先定下来：每个位置按固定权重抽一次，抽到大方块就留下。
    // 候选组共用这份计划，只在其他位置上比难度，这样选得再难，大方块也不会变多。
    bigPlan(rng, weights, count) {
      const plan = [];
      for (let i = 0; i < count; i++) {
        const shape = this._pick(rng, weights);
        plan.push(shape.count >= this.cfg.generator.bigCells ? this._piece(rng, shape) : null);
      }
      return plan;
    }

    // 去掉大方块的权重
    withoutBig(weights) {
      const out = Object.assign({}, weights);
      const big = this.cfg.generator.bigCells;
      BG.Shapes.list.forEach(function (s) { if (s.count >= big) out[s.id] = 0; });
      return out;
    }

    // 按权重随机一组，每组最多 1 块 S/Z。plan：已经定好的大方块，其他位置按 weights 抽
    rollGroup(rng, weights, count, plan) {
      const szIds = this.cfg.generator.sz.ids;
      const pieces = [];
      let w = weights;
      for (let i = 0; i < count; i++) {
        if (plan && plan[i]) {
          pieces.push(plan[i]);
          continue;
        }
        const shape = this._pick(rng, w);
        pieces.push(this._piece(rng, shape));
        if (szIds.indexOf(shape.id) !== -1) {
          w = Object.assign({}, w);
          szIds.forEach(function (id) { w[id] = 0; });
        }
      }
      return pieces;
    }

    // 每日挑战：大方块按第 0 组的权重先定下来，占比不随步数变。其他位置试几次，
    // 取总格数最接近当前权重平均值的一组。只看组号，不看棋盘
    _rollDaily(rng, weights, count, ctx) {
      const g = this.cfg.generator;
      const plan = this.bigPlan(rng, this.weights({ groupIndex: 0 }), count);
      const rest = this.withoutBig(weights);
      let sum = 0;
      let cellSum = 0;
      BG.Shapes.list.forEach(function (s) {
        sum += rest[s.id];
        cellSum += rest[s.id] * s.count;
      });
      let target = 0;
      plan.forEach(function (p) { target += p ? p.shape.count : cellSum / sum; });
      let best = null;
      let bestGap = Infinity;
      for (let i = 0; i < g.dailyCellsTries; i++) {
        const pieces = this.rollGroup(rng, rest, count, plan);
        const cells = pieces.reduce(function (sum, p) { return sum + p.shape.count; }, 0);
        const gap = Math.abs(cells - target);
        if (gap < bestGap) {
          best = pieces;
          bestGap = gap;
        }
        if (gap <= g.dailyCellsTolerance) break;
      }
      return best;
    }

    // 每日挑战：这一组有没有 S/Z 只看组号和种子，所有人相同
    dailySzGroup(groupIndex) {
      const sz = this.cfg.generator.sz;
      return groupIndex >= sz.dailyFromGroup && (groupIndex + this.seed) % sz.dailyEvery === 0;
    }

    // 把这一组的一块固定换成 S/Z，位置和形状也只看组号
    _injectDailySz(pieces, groupIndex) {
      const ids = this.cfg.generator.sz.ids;
      const rng = new BG.RNG(BG.RNG.derive(this.seed, 'dailySz', groupIndex));
      const slot = rng.int(pieces.length);
      pieces[slot] = { shape: BG.Shapes.byId[ids[rng.int(ids.length)]], color: pieces[slot].color };
    }

    // 小块遗物换入的 1×1
    giftPiece(index) {
      const rng = new BG.RNG(BG.RNG.derive(this.seed, 'gift', index));
      return Object.assign(this._piece(rng, BG.Shapes.byId['1x1']), { gift: true });
    }

    // 抽 count 块，至少一块能放下。tag 和 index 决定所用的随机流。
    draw(board, count, tag, index, ctx) {
      const weights = this.weights(ctx);
      let pieces = [];
      for (let attempt = 0; attempt <= this.cfg.generator.maxRetries; attempt++) {
        const rng = new BG.RNG(BG.RNG.derive(this.seed, tag, index, attempt));
        const daily = this.fixed && count === this.cfg.board.traySize;
        pieces = daily ? this._rollDaily(rng, weights, count, ctx) : this.rollGroup(rng, weights, count);
        if (daily && tag === 'group' && this.dailySzGroup(ctx.groupIndex)) this._injectDailySz(pieces, ctx.groupIndex);
        if (pieces.some(function (p) { return board.hasPlacement(p.shape); })) return pieces;
      }
      // 满线都会被消除，棋盘不会全满，所以 1×1 一定放得下
      pieces[0] = { shape: BG.Shapes.byId['1x1'], color: pieces[0].color };
      return pieces;
    }

    // 保底发牌：逐块在模拟棋盘上试放，保证这组小方块按顺序都能放下，而且发牌当下每块都有位置
    drawSmallGuaranteed(board, count, maxCells, index) {
      const rng = new BG.RNG(BG.RNG.derive(this.seed, 'revive', index));
      const sim = board.clone();
      const small = BG.Shapes.list.filter(function (s) { return s.count <= maxCells; });
      const pieces = [];
      for (let i = 0; i < count; i++) {
        const fits = small.filter(function (s) { return board.hasPlacement(s) && sim.hasPlacement(s); });
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

    // 三选一候选：每个阶梯一张固定排序表，取未拥有的。
    // 两种类型都还有剩余时，必须同时包含加分型和道具型。
    offer(tierIndex, owned, pool) {
      const rng = new BG.RNG(BG.RNG.derive(this.seed, 'offer', tierIndex));
      const avail = rng.shuffle(pool).filter(function (id) { return owned.indexOf(id) === -1; });
      const n = Math.min(this.cfg.relic.choices, avail.length);
      if (n === 0) return [];
      const out = avail.slice(0, n);
      const typeOf = function (id) { return BG.Relics.byId[id].type; };
      if (n >= 2 && out.every(function (id) { return typeOf(id) === typeOf(out[0]); })) {
        const other = avail.find(function (id) { return typeOf(id) !== typeOf(out[0]); });
        if (other) out[n - 1] = other;
      }
      return out;
    }
  }

  Generator.interpolate = interpolate;
  BG.Generator = Generator;
})();
