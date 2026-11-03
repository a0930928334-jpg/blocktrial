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
  function interference(rows, shapes, moves, n, samples) {
    const next = stackAt(0, n);
    let sum = 0;
    let pairs = 0;
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
            sum += Math.max(0, 1 - countMoves(next, shapes[j], n) / moves[j]);
            pairs++;
          }
        }
      }
    }
    return pairs ? sum / pairs : 0;
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

    const metrics = {
      moves: moves,
      fits: fitCount,
      count: shapes.length,
      solvable: solvable,
      maxLines: maxLines,
      cells: cells,
      interference: interference(rows, shapes, moves, n, d.interferenceSamples)
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

  // 平常期此刻的选牌范围，随已放置步数变难，曲线按模式区分
  function normalBand(placements, cfg, mode) {
    const center = BG.Generator.interpolate(normalCurve(mode, cfg).center, placements);
    const half = cfg.dealer.normal.halfWidth;
    return [Math.max(0, center - half), Math.min(1, center + half)];
  }

  // 平常期大方块进入候选的权重倍率
  function normalBigMult(placements, cfg, mode) {
    return BG.Generator.interpolate(normalCurve(mode, cfg).bigMult, placements);
  }

  // 后期规则是否适用：平常期后段、冲刺期、考验期
  function isLate(phase, placements, cfg, mode) {
    if (phase === 'sprint' || phase === 'trial') return true;
    return phase === 'normal' && placements >= cfg.dealer.lateFromStep[mode];
  }

  function fullFit(x) {
    return x.metrics.solvable === true && x.metrics.fits === x.metrics.count;
  }

  // candidates：[{ pieces, metrics }]。返回选中的候选，没有合适的返回 null。
  // 后期规则下优先从 3 块都有位置的候选里选，一个都没有时才退到原来的范围。
  function select(phase, candidates, rng, cfg, placements, mode) {
    const d = cfg.dealer;
    if (isLate(phase, placements, cfg, mode) && candidates.some(fullFit)) {
      candidates = candidates.filter(fullFit);
    }
    const byDifficulty = function (list) {
      return list.slice().sort(function (a, b) { return a.metrics.difficulty - b.metrics.difficulty; });
    };
    const solvable = byDifficulty(candidates.filter(function (x) { return x.metrics.solvable === true; }));
    const placeable = byDifficulty(candidates.filter(function (x) { return x.metrics.fits > 0; }));

    if (phase === 'warmup') {
      const pool = solvable.filter(function (x) { return x.metrics.fits === x.metrics.count; });
      if (pool.length === 0) return null;
      return pickFromBand(pool, [0, d.warmupRatio], rng);
    }
    if (phase === 'trial') {
      return solvable.length ? pickFromBand(solvable, d.trial.band, rng) : null;
    }
    if (phase === 'sprint') {
      return solvable.length ? solvable[solvable.length - 1] : null;
    }
    if (phase === 'bonus') {
      // 优先选有解又能消的组，奖励不能变成陷阱
      const mostLines = function (list) {
        let best = null;
        list.forEach(function (x) {
          if (!best || x.metrics.maxLines > best.metrics.maxLines) best = x;
        });
        return best;
      };
      const safe = mostLines(solvable);
      if (safe && safe.metrics.maxLines > 0) return safe;
      return mostLines(placeable);
    }
    // 难但有解：候选里有能全部放下的组时，不发放不完的组
    const pool = solvable.length ? solvable : placeable;
    return pool.length ? pickFromBand(pool, normalBand(placements, cfg, mode), rng) : null;
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
      this.sprintLeft = 0;
      this.sprintUsed = 0;
      this.sprintCooldown = 0;
      this.current = null;
      this.entries = {};
      this.groups = {};
    }

    setDynamic(value) {
      if (!this.daily) this.dynamic = value;
    }

    onScore(prev, score) {
      if (!this.dynamic) return;
      const every = this.cfg.dealer.bonus.thousandEvery;
      const brokeBest = this.best > 0 && prev <= this.best && score > this.best;
      const passedThousand = Math.floor(score / every) > Math.floor(prev / every);
      if (brokeBest || passedThousand) this.bonusLeft = this.cfg.dealer.bonus.groups;
    }

    onTier() {
      if (this.dynamic) this.bonusLeft = this.cfg.dealer.bonus.groups;
    }

    onRelicPicked(groups) {
      if (this.dynamic) this.trialLeft = groups;
    }

    _inSprintWindow(score) {
      const s = this.cfg.dealer.sprint;
      if (this.best > 0) return score >= this.best * s.bestRatio && score <= this.best;
      if (this.mode !== 'classic') return false;
      const into = score % s.noBestEvery;
      return score > 0 && into >= s.noBestEvery * s.noBestRatio;
    }

    _decide(placements, score) {
      if (this.daily) return 'daily';
      if (!this.dynamic) return 'off';
      const d = this.cfg.dealer;
      if (placements < d.warmupSteps) {
        this.trialLeft = 0;
        this.bonusLeft = 0;
        return 'warmup';
      }
      if (this.trialLeft > 0) {
        this.trialLeft--;
        return 'trial';
      }
      if (this.bonusLeft > 0) {
        this.bonusLeft--;
        return 'bonus';
      }
      if (this.sprintLeft > 0 && this._inSprintWindow(score)) {
        this.sprintLeft--;
        return 'sprint';
      }
      this.sprintLeft = 0;
      if (this.sprintCooldown > 0) {
        this.sprintCooldown--;
      } else if (this.sprintUsed < d.sprint.maxTriggers && this._inSprintWindow(score)) {
        this.sprintUsed++;
        this.sprintLeft = d.sprint.maxGroups - 1;
        this.sprintCooldown = d.sprint.cooldownGroups;
        return 'sprint';
      }
      return 'normal';
    }

    // 决定下一组牌的阶段，并记录触发次数
    next(placements, score) {
      const phase = this._decide(placements, score);
      this.groups[phase] = (this.groups[phase] || 0) + 1;
      if (phase !== this.current) this.entries[phase] = (this.entries[phase] || 0) + 1;
      this.current = phase;
      return phase;
    }
  }

  BG.Dealer = {
    evaluate: evaluate, select: select, isLate: isLate, fullFit: fullFit,
    normalBand: normalBand, normalBigMult: normalBigMult, boardRows: boardRows
  };
  BG.DealDirector = DealDirector;
})();
