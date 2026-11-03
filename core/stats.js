// 统计的纯数据处理。读写存储在 main.js。
(function () {
  'use strict';

  function emptyAds() {
    return { triggered: {}, completed: {}, abandoned: {} };
  }

  function bump(map, key) {
    map[key] = (map[key] || 0) + 1;
  }

  function noteAd(ads, type, status) {
    if (status === 'trigger') bump(ads.triggered, type);
    else if (status === 'complete') bump(ads.completed, type);
    else if (status === 'abandon') bump(ads.abandoned, type);
  }

  function sumMap(map) {
    return Object.keys(map).reduce(function (sum, key) { return sum + map[key]; }, 0);
  }

  // 新记录放最前面
  function addRecord(records, record, keep) {
    return [record].concat(records).slice(0, keep);
  }

  function filterByVersion(records, version) {
    return records.filter(function (r) { return r.version === version; });
  }

  // 只删除非当前版本的记录，没有版本号的旧记录也算
  function removeOldVersions(records, version) {
    return filterByVersion(records, version);
  }

  function summarize(records) {
    const n = records.length;
    const avg = function (key) {
      if (!n) return 0;
      return records.reduce(function (sum, r) { return sum + r[key]; }, 0) / n;
    };
    return {
      count: n,
      score: avg('score'),
      durationMs: avg('durationMs'),
      placements: avg('placements'),
      linesCleared: avg('linesCleared'),
      maxCombo: avg('maxCombo'),
      tierReached: avg('tierReached')
    };
  }

  // 发牌明细按阶段汇总：{ 阶段: [次数, 难度均值, 难度最大值] }
  function summarizeDeals(deals) {
    const out = {};
    (deals || []).forEach(function (d) {
      const row = out[d.phase] || (out[d.phase] = { n: 0, sum: 0, max: 0 });
      row.n++;
      row.sum += d.difficulty;
      if (d.difficulty > row.max) row.max = d.difficulty;
    });
    Object.keys(out).forEach(function (k) {
      const row = out[k];
      out[k] = [row.n, Math.round(row.sum / row.n), row.max];
    });
    return out;
  }

  const CHOICE_CODES = { bomb: 'b', swap: 's', revive: 'r', giveUp: 'g', swapAbandoned: 'sx', reviveAbandoned: 'rx', freeSwap: 'fs', freeRevive: 'fr' };

  // 卡死面板的选择压成短字符串，每次卡死用 | 分开，例如 "s|b,r|g"
  function compactChoices(list) {
    return (list || []).map(function (one) {
      return one.map(function (c) { return CHOICE_CODES[c] || c; }).join(',');
    }).join('|');
  }

  function rewardCounts(map) {
    return ['swap', 'revive'].map(function (id) { return (map && map[id]) || 0; });
  }

  // 精简版的一局记录，键名含义见 README
  function compactRecord(r, maxChars) {
    const ads = r.ads || emptyAds();
    const relicStats = r.relicStats || { triggered: {} };
    const out = {
      v: r.version || null,
      m: r.mode,
      s: r.score,
      sec: Math.round((r.durationMs || 0) / 1000),
      n: r.placements,
      tier: r.tierReached,
      first: r.firstRelicStep === undefined ? null : r.firstRelicStep,
      relics: r.relicOrder || [],
      trig: relicStats.triggered,
      bomb: [r.bombsGained || 0, r.bombsUsed || 0],
      end: r.endReason,
      type: r.endType === undefined ? null : r.endType,
      ph: r.endPhase === undefined ? null : r.endPhase,
      rev: r.revived ? 1 : 0,
      rs: r.placementsAfterRevive === undefined ? null : r.placementsAfterRevive,
      stuck: compactChoices(r.stuckChoices),
      ads: [sumMap(ads.triggered), sumMap(ads.completed), sumMap(ads.abandoned)],
      deal: summarizeDeals(r.deals),
      ms: r.milestones || [],
      stage: r.stage === undefined ? null : r.stage,
      rlx: r.relaxedDeals || 0,
      spr: r.sprintEntries || 0,
      bon: r.bonusEntries || 0,
      sd: r.diedInSprint ? 1 : 0
    };
    // 奖励 [换一组, 复活]，没有奖励的局不写这两个键
    if (Object.keys(r.rewardsGained || {}).length > 0) {
      out.rw = rewardCounts(r.rewardsGained);
      out.rwu = rewardCounts(r.rewardsUsed);
    }
    if (r.rushSteps !== null && r.rushSteps !== undefined) out.rush = r.rushSteps;
    // 卡死次数特别多时只保留次数，保证不超长
    if (JSON.stringify(out).length > maxChars) {
      out.stuck = '共' + (r.stuckChoices || []).length + '次';
    }
    return out;
  }

  // 复制用的精简 JSON：最近几局、不缩进
  function exportCompact(records, statsCfg) {
    return JSON.stringify(records.slice(0, statsCfg.compactGames).map(function (r) {
      return compactRecord(r, statsCfg.compactMaxChars);
    }));
  }

  // 回到菜单时要不要播插屏。开关关闭时永远不播。
  function shouldPlayInterstitial(gamesSinceAd, adsCfg) {
    return adsCfg.interstitialEnabled && gamesSinceAd >= adsCfg.interstitialEvery;
  }

  BG.Stats = {
    shouldPlayInterstitial: shouldPlayInterstitial,
    summarizeDeals: summarizeDeals,
    compactRecord: compactRecord,
    exportCompact: exportCompact,
    emptyAds: emptyAds,
    noteAd: noteAd,
    sumMap: sumMap,
    addRecord: addRecord,
    summarize: summarize,
    filterByVersion: filterByVersion,
    removeOldVersions: removeOldVersions
  };
})();
