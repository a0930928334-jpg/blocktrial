// 动态发牌：评估候选组（Dealer）和决定当前阶段（DealDirector）。
// 搜索用节点预算限制，不看时钟，同一局面、同一种子的结果可复现。
(function () {
  'use strict';

  // ---------- 位运算棋盘：每行一个整数，第 c 列对应第 c 位 ----------

  function boardRows(board) {
    const rows = new Array(board.size);
    for (let r = 0; r < board.size; r++) {
      let mask = 0;
      for (let c = 0; c < board.size; c++) {
        if (board.get(r, c) !== -1) mask |= 1 << c;
      }
      rows[r] = mask;
    }
    return rows;
  }

  function fits(rows, shape, r, c) {
    const masks = shape.masks;
    for (let i = 0; i < masks.length; i++) {
      if (rows[r + i] & (masks[i] << c)) return false;
    }
    return true;
  }

  function countMoves(rows, shape, n) {
    let count = 0;
    for (let r = 0; r <= n - shape.h; r++) {
      for (let c = 0; c <= n - shape.w; c++) {
        if (fits(rows, shape, r, c)) count++;
      }
    }
    return count;
  }

  // 查表比逐位数快，棋盘边长不超过 16
  const POP = new Uint8Array(1 << 16);
  for (let i = 1; i < POP.length; i++) POP[i] = POP[i >> 1] + (i & 1);

  function popcount(v) {
    return POP[v];
  }

  // 把方块放到 src 上，结果写入 dst 并消除满线，返回消除线数
  function applyMove(src, dst, shape, r, c, n) {
    const full = (1 << n) - 1;
    for (let i = 0; i < n; i++) dst[i] = src[i];
    const masks = shape.masks;
    for (let i = 0; i < masks.length; i++) dst[r + i] |= masks[i] << c;
    let colsFull = full;
    for (let i = 0; i < n; i++) colsFull &= dst[i];
    let lines = popcount(colsFull);
    for (let i = 0; i < n; i++) {
      if (dst[i] === full) {
        lines++;
        dst[i] = 0;
      } else {
        dst[i] &= ~colsFull;
      }
    }
    return lines;
  }

  // 递归时复用的数组，避免频繁分配
  const stack = [];
  function stackAt(depth, n) {
    if (!stack[depth] || stack[depth].length !== n) stack[depth] = new Array(n);
    return stack[depth];
  }

  // ---------- 能否全部放下：深度优先，找到一个解就停 ----------

  function solve(rows, shapes, used, depth, n, st) {
    if (depth === shapes.length) return true;
    const next = stackAt(depth, n);
    for (let i = 0; i < shapes.length; i++) {
      if (used & (1 << i)) continue;
      const shape = shapes[i];
      // 相同形状换顺序结果一样，跳过
      let dup = false;
      for (let k = 0; k < i; k++) {
        if (!(used & (1 << k)) && shapes[k] === shape) dup = true;
      }
      if (dup) continue;
      for (let r = 0; r <= n - shape.h; r++) {
        for (let c = 0; c <= n - shape.w; c++) {
          if (!fits(rows, shape, r, c)) continue;
          if (st.nodes >= st.limit) {
            st.aborted = true;
            return false;
          }
          st.nodes++;
          applyMove(rows, next, shape, r, c, n);
          if (solve(next, shapes, used | (1 << i), depth + 1, n, st)) return true;
          if (st.aborted) return false;
        }
      }
    }
    return false;
  }

  // 有没有哪一行或哪一列缺的格子不超过这块的宽或高。没有的话这块放哪都消不了线。
  function canClearAny(rows, shape, n) {
    let colMissing = 0;
    for (let i = 0; i < n; i++) {
      if (n - popcount(rows[i]) <= shape.w) return true;
    }
    for (let c = 0; c < n; c++) {
      colMissing = 0;
      for (let i = 0; i < n; i++) {
        if (!(rows[i] & (1 << c))) colMissing++;
      }
      if (colMissing <= shape.h) return true;
    }
    return false;
  }

  // ---------- 最大消除线数：每块只展开最有希望的几个位置 ----------

  function bestLines(rows, shapes, used, depth, n, st) {
    if (depth === shapes.length) {
      st.complete = true;
      return 0;
    }
    const next = stackAt(depth, n);
    const isLast = depth === shapes.length - 1;
    const beam = isLast ? 1 : st.beam;
    let best = 0;
    for (let i = 0; i < shapes.length; i++) {
      if (used & (1 << i)) continue;
      const shape = shapes[i];
      const clearable = canClearAny(rows, shape, n);
      const top = [];
      for (let r = 0; r <= n - shape.h; r++) {
        for (let c = 0; c <= n - shape.w; c++) {
          if (!fits(rows, shape, r, c)) continue;
          // 这块不可能消线又是最后一块时，有地方放就够了
          if (isLast && !clearable) {
            st.complete = true;
            r = n;
            break;
          }
          let lines = 0;
          if (clearable) {
            if (st.nodes >= st.limit) {
              st.aborted = true;
              r = n;
              break;
            }
            st.nodes++;
            lines = applyMove(rows, next, shape, r, c, n);
          }
          // 消线优先，其次放在已经比较满的行上
          let fill = 0;
          for (let k = 0; k < shape.masks.length; k++) fill += popcount(rows[r + k]);
          const score = lines * 1000 + fill;
          if (top.length < beam || score > top[top.length - 1].score) {
            top.push({ r: r, c: c, score: score, lines: lines });
            top.sort(function (a, b) { return b.score - a.score; });
            if (top.length > beam) top.pop();
          }
        }
      }
      for (let m = 0; m < top.length; m++) {
        const move = top[m];
        applyMove(rows, next, shape, move.r, move.c, n);
        const total = move.lines + bestLines(next, shapes, used | (1 << i), depth + 1, n, st);
        if (total > best) best = total;
      }
    }
    return best;
  }

  // ---------- 互相挤占 ----------

  // 放下一块后，另外几块平均少掉多大比例的位置。每块抽样几个位置，算上消线腾出的空间。
  // 同时统计放下一块后，另一块一个位置都没有的比例（blocking）。
  function interference(rows, shapes, moves, n, samples) {
    const next = stackAt(0, n);
    let sum = 0;
    let pairs = 0;
    let blocked = 0;
    for (let i = 0; i < shapes.length; i++) {
      if (moves[i] === 0) continue;
      const stride = Math.max(1, Math.floor(moves[i] / samples));
      let seen = 0;
      for (let r = 0; r <= n - shapes[i].h; r++) {
        for (let c = 0; c <= n - shapes[i].w; c++) {
          if (!fits(rows, shapes[i], r, c)) continue;
          if (seen++ % stride !== 0) continue;
          applyMove(rows, next, shapes[i], r, c, n);
          for (let j = 0; j < shapes.length; j++) {
            if (j === i || moves[j] === 0) continue;
            const left = countMoves(next, shapes[j], n);
            sum += Math.max(0, 1 - left / moves[j]);
            if (left === 0) blocked++;
            pairs++;
          }
        }
      }
    }
    return { interference: pairs ? sum / pairs : 0, blocking: pairs ? blocked / pairs : 0 };
  }

  // ---------- 评估一组牌 ----------

  // budget：{ left } 这次发牌还剩多少节点，每组候选从中扣除
  function evaluate(board, pieces, cfg, budget) {
    const d = cfg.dealer;
    const n = board.size;
    const rows = boardRows(board);
    const shapes = pieces.map(function (p) { return p.shape; });
    const moves = shapes.map(function (s) { return countMoves(rows, s, n); });
    const fitCount = moves.filter(function (v) { return v > 0; }).length;
    let cells = 0;
    shapes.forEach(function (s) { cells += s.count; });

    const allowed = budget ? Math.min(d.candidateNodeBudget, budget.left) : d.candidateNodeBudget;
    const st = { nodes: 0, limit: allowed, beam: d.beamWidth, complete: false, aborted: false };
    const maxLines = fitCount > 0 ? bestLines(rows, shapes, 0, 0, n, st) : 0;

    let solvable = st.complete;
    if (!solvable) {
      if (fitCount === 0) {
        solvable = false;
      } else {
        st.aborted = false;
        const found = solve(rows, shapes, 0, 0, n, st);
        solvable = found ? true : (st.aborted ? null : false);
      }
    }
    if (budget) budget.left -= st.nodes;

    const crowding = interference(rows, shapes, moves, n, d.interferenceSamples);
    const metrics = {
      moves: moves,
      fits: fitCount,
      count: shapes.length,
      solvable: solvable,
      maxLines: maxLines,
      cells: cells,
      interference: crowding.interference,
      blocking: crowding.blocking
    };
    metrics.difficulty = Math.max(0, Math.min(100, Math.round(d.difficulty(metrics))));
    return metrics;
  }

  // ---------- 按阶段选牌 ----------

  function pickFromBand(sorted, band, rng) {
    const lo = Math.min(Math.floor(sorted.length * band[0]), sorted.length - 1);
    const hi = Math.max(lo + 1, Math.ceil(sorted.length * band[1]));
    return sorted[lo + rng.int(Math.min(hi, sorted.length) - lo)];
  }

  function normalCurve(mode, cfg) {
    return cfg.dealer.normal[mode] || cfg.dealer.normal.relic;
  }

  // 平常期此刻的选牌范围，随阶段变难，到 capStage 封顶，曲线按模式区分
  function normalBand(stage, cfg, mode) {
    const curve = normalCurve(mode, cfg);
    const center = BG.Generator.interpolate(curve.center, Math.min(stage, curve.capStage));
    const half = cfg.dealer.normal.halfWidth;
    return [Math.max(0, center - half), Math.min(1, center + half)];
  }

  // 中等别扭形状的权重倍率
  function normalAwkwardMult(stage, cfg, mode) {
    const curve = normalCurve(mode, cfg);
    return BG.Generator.interpolate(curve.awkwardMult, Math.min(stage, curve.capStage));
  }

  // 进入这个阶段时难度还会不会上升。到上限之后，横幅就不能再说"难度提升"
  function stageRaises(stage, cfg, mode) {
    return stage <= normalCurve(mode, cfg).capStage;
  }

  // 统计和 S/Z 后期上限用的"后期"：平常期后段、冲刺期、考验期、复活缓冲期
  function isLate(phase, placements, cfg, mode) {
    if (phase === 'sprint' || phase === 'trial' || phase === 'buffer') return true;
    return phase === 'normal' && placements >= cfg.dealer.lateFromStep[mode];
  }

  function fullFit(x) {
    return x.metrics.solvable === true && x.metrics.fits === x.metrics.count;
  }

  // candidates：[{ pieces, metrics }]。只从 3 块都能放、有解的组里选，一个都没有时返回 null，由调用方发保底的小方块。
  function select(phase, candidates, rng, cfg, mode, stage) {
    const d = cfg.dealer;
    const pool = candidates.filter(fullFit).sort(function (a, b) { return a.metrics.difficulty - b.metrics.difficulty; });
    if (pool.length === 0) return null;
    // 复活缓冲按热身期规则选牌
    if (phase === 'warmup' || phase === 'buffer') return pickFromBand(pool, [0, d.warmupRatio], rng);
    if (phase === 'trial') return pickFromBand(pool, d.trial.band, rng);
    if (phase === 'sprint') return pool[pool.length - 1];
    if (phase === 'bonus') {
      // pool 已按难度从低到高排好：能消够线的组里最好放的；都不够时取能消最多的
      let best = pool[0];
      for (let i = 0; i < pool.length && best.metrics.maxLines < d.bonus.minLines; i++) {
        if (pool[i].metrics.maxLines > best.metrics.maxLines) best = pool[i];
      }
      return best;
    }
    return pickFromBand(pool, normalBand(stage, cfg, mode), rng);
  }

  // ---------- 阶段状态 ----------

  class DealDirector {
    // opts: { dynamic, daily, mode, best }
    constructor(opts, cfg) {
      this.cfg = cfg;
      this.daily = opts.daily;
      this.dynamic = !opts.daily && opts.dynamic;
      this.mode = opts.mode;
      this.best = opts.best;
      this.trialLeft = 0;
      this.bonusLeft = 0;
      this.sprintKey = null;
      this.sprintGroups = 0;
      this.current = null;
      this.entries = {};
      this.groups = {};
    }

    setDynamic(value) {
      if (!this.daily) this.dynamic = value;
    }

    // 关键分：每档遗物阶梯、每个分数台阶、个人最高分。返回比 score 高的最近一个
    nextKey(score) {
      const step = this.cfg.milestone.scoreStep;
      let key = (Math.floor(score / step) + 1) * step;
      if (this.mode === 'relic') {
        this.cfg.relic.tiers.forEach(function (t) { if (t > score && t < key) key = t; });
      }
      if (this.best > score && this.best < key) key = this.best;
      return key;
    }

    // 从 prev 涨到 score 越过了哪些关键分，从低到高
    crossedKeys(prev, score) {
      const out = [];
      for (let key = this.nextKey(prev); key <= score; key = this.nextKey(key)) out.push(key);
      return out;
    }

    // 分数距下一个关键分不到 keyRatio
    inSprintWindow(score) {
      return score >= this.nextKey(score) * (1 - this.cfg.dealer.sprint.keyRatio);
    }

    onScore(prev, score) {
      if (!this.dynamic) return;
      const b = this.cfg.dealer.bonus;
      if (this.best > 0 && prev <= this.best && score > this.best) {
        this.bonusLeft = Math.max(this.bonusLeft, b.afterRecord);
      } else if (score >= this.nextKey(prev)) {
        this.bonusLeft = Math.max(this.bonusLeft, b.afterTier);
      }
    }

    onRelicPicked(groups) {
      if (this.dynamic) this.trialLeft = groups;
    }

    _decide(placements, score, buffer) {
      if (this.daily) return 'daily';
      if (!this.dynamic) return 'off';
      if (buffer) return 'buffer';
      const d = this.cfg.dealer;
      if (placements < d.warmupSteps) {
        this.trialLeft = 0;
        this.bonusLeft = 0;
        return 'warmup';
      }
      // 先给奖励期，再考验新遗物：刚冲过关键分要先松一口气
      if (this.bonusLeft > 0) {
        this.bonusLeft--;
        return 'bonus';
      }
      if (this.trialLeft > 0) {
        this.trialLeft--;
        return 'trial';
      }
      if (this.inSprintWindow(score)) {
        const key = this.nextKey(score);
        if (key !== this.sprintKey) {
          this.sprintKey = key;
          this.sprintGroups = 0;
        }
        if (this.sprintGroups < d.sprint.maxGroups) {
          this.sprintGroups++;
          return 'sprint';
        }
      }
      return 'normal';
    }

    // 决定下一组牌的阶段，并记录触发次数
    next(placements, score, buffer) {
      const phase = this._decide(placements, score, buffer);
      this.groups[phase] = (this.groups[phase] || 0) + 1;
      if (phase !== this.current) this.entries[phase] = (this.entries[phase] || 0) + 1;
      this.current = phase;
      return phase;
    }
  }

  BG.Dealer = {
    evaluate: evaluate, select: select, isLate: isLate, fullFit: fullFit,
    normalBand: normalBand, normalAwkwardMult: normalAwkwardMult, stageRaises: stageRaises, boardRows: boardRows
  };
  BG.DealDirector = DealDirector;
})();
