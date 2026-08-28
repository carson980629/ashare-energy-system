"use strict";

const ETF_META = [
  { code: "000016", name: "上证50", color: "#e16b67", group: "defensive", desc: "超大盘蓝筹与高股息央企的代表，波动通常比小盘小。" },
  { code: "000300", name: "沪深300", color: "#4e7da7", group: "defensive", desc: "覆盖A股核心资产，是衡量大盘走势最常用的基准。" },
  { code: "000905", name: "中证500", color: "#bf8630", group: "growth", desc: "中盘成长与先进制造，弹性高于沪深300。" },
  { code: "000852", name: "中证1000", color: "#3fa894", group: "growth", desc: "小盘高弹性方向，行情好时涨得快、波动也更大。" },
  { code: "399006", name: "创业板指", color: "#8a6bc4", group: "growth", desc: "新能源、医药与科技成长，趋势转换时变化明显。" },
  { code: "000688", name: "科创50", color: "#d17b3e", group: "growth", desc: "半导体与硬科技集中地，波动与潜力都较大。" }
];

const VERIFIED_SNAPSHOT = {
  date: "2026-08-27",
  source: "腾讯行情·宽基指数原始周线（2026-08-27 周）",
  rows: [
    { code: "000016", close: 2930.31, ma20: 2923, ma60: 2918, ma120: 2916 },
    { code: "000300", close: 4630.28, ma20: 4652, ma60: 4716, ma120: 4722 },
    { code: "000905", close: 7946.33, ma20: 7943, ma60: 8087, ma120: 8136 },
    { code: "000852", close: 7732.95, ma20: 7696, ma60: 7868, ma120: 8056 },
    { code: "399006", close: 3473.35, ma20: 3552, ma60: 3717, ma120: 3689 },
    { code: "000688", close: 1693.48, ma20: 1702, ma60: 1800, ma120: 1660 }
  ]
};

const REGIME = {
  bull: { label: "多头进攻态", friendly: "回暖，可以积极一些", icon: "☀" },
  shock: { label: "中性震荡态", friendly: "冷暖交织，均衡为主", icon: "◐" },
  bear: { label: "弱势防守态", friendly: "偏冷，适合以守为主", icon: "☂" },
  crisis: { label: "极端空头态", friendly: "暴风雨，优先保护本金", icon: "ϟ" }
};

const state = {
  policy: "continuous",
  theme: "light",
  history: null,
  marketAnalysis: null,
  backtest: null,
  performanceBacktest: null,
  params: { crisisFloor: 0, costBps: 8, bufferPct: 5, stopPct: 8 }
};

const $ = (id) => document.getElementById(id);
const fmtPct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const fmtNum = (v, d = 3) => Number(v).toFixed(d);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function snapshotSignals() {
  const rows = VERIFIED_SNAPSHOT.rows.map((row) => ({
    ...row,
    short: row.close > row.ma20,
    mid: row.close > row.ma60,
    long: row.close > row.ma120
  }));
  const breadth = {
    short: rows.filter((x) => x.short).length / rows.length,
    mid: rows.filter((x) => x.mid).length / rows.length,
    long: rows.filter((x) => x.long).length / rows.length
  };
  breadth.comp = 0.35 * breadth.short + 0.45 * breadth.mid + 0.20 * breadth.long;
  return { rows, breadth };
}

function computeSnapshot() {
  if (state.history && state.history.dates && state.history.dates.length >= 24) {
    const idx = state.history.dates.length - 1;
    const rows = ETF_META.map((m) => {
      const arr = state.history.series[m.code];
      const close = arr[idx].close;
      const ma20 = meanClose(arr, idx, 4);
      const ma60 = meanClose(arr, idx, 12);
      const ma120 = meanClose(arr, idx, 24);
      return { code: m.code, close, ma20, ma60, ma120, short: close > ma20, mid: close > ma60, long: close > ma120 };
    });
    const breadth = {
      short: rows.filter((x) => x.short).length / rows.length,
      mid: rows.filter((x) => x.mid).length / rows.length,
      long: rows.filter((x) => x.long).length / rows.length
    };
    breadth.comp = 0.35 * breadth.short + 0.45 * breadth.mid + 0.20 * breadth.long;
    return {
      rows,
      breadth,
      date: state.history.dates[idx],
      weekState: state.history.weekState || "completed",
      asofWeekEnd: state.history.asofWeekEnd || "",
      source: "腾讯行情·宽基指数原始周线"
    };
  }
  const s = snapshotSignals();
  return { ...s, date: VERIFIED_SNAPSHOT.date, source: VERIFIED_SNAPSHOT.source, weekState: "completed", asofWeekEnd: "" };
}

// 周线时间口径文案：滚动周（未收线）表示周中按日更新得到的盘中状态；完成周表示周五收盘后的最终周线。
function weekCadenceText(weekState) {
  return weekState === "rolling" ? "本周周线未收线（滚动状态，盘中信号）" : "本周周线已收线（完成状态）";
}

function regimeOf(b) {
  if (b.mid === 0 || b.comp < 0.15) return "crisis";
  if (b.comp <= 0.35) return "bear";
  if (b.comp < 0.65) return "shock";
  return "bull";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function renderMarketAnalysis() {
  const data = state.marketAnalysis;
  const snap = computeSnapshot();
  const regime = regimeOf(snap.breadth);
  if (!data || !Array.isArray(data.indices) || !data.indices.length) {
    if ($("analysisAsOf")) $("analysisAsOf").textContent = "未载入市场分析数据 · 请运行更新脚本";
    return;
  }
  const quoteDate = data.quoteDate || data.indices[0].date;
  const generated = new Date(data.generatedAt);
  const generatedText = Number.isNaN(generated.getTime()) ? "生成时间未知" : generated.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  $("analysisAsOf").textContent = `指数截至 ${quoteDate} 收盘 · 数据生成 ${generatedText}`;
  $("analysisQuoteSource").textContent = `来源：${data.quoteSource} · 单日涨跌按相邻两个交易日收盘计算 · ${data.indices.length}个指数`;
  $("analysisIndexStrip").innerHTML = data.indices.map((item) => {
    const cls = item.changePct > 0 ? "rise" : item.changePct < 0 ? "fall" : "muted";
    const sign = item.changePct > 0 ? "+" : "";
    return `<div class="index-chip ${cls}"><span>${escapeHtml(item.name)}</span><b>${Number(item.close).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b><em>${sign}${fmtPct(item.changePct, 2)}</em></div>`;
  }).join("");
  const sorted = [...data.indices].sort((a, b) => b.changePct - a.changePct);
  const leader = sorted[0];
  const laggard = sorted.at(-1);
  const positive = sorted.filter((item) => item.changePct > 0).length;
  $("marketStructureTitle").textContent = positive === data.indices.length ? "指数结构：全线上涨" : positive === 0 ? "指数结构：普遍回落" : "指数结构：涨跌分化";
  $("marketStructureText").textContent = `${data.indices.length}个指数中${positive}个上涨。${leader.name}表现最强（${leader.changePct > 0 ? "+" : ""}${fmtPct(leader.changePct, 2)}），${laggard.name}相对最弱（${laggard.changePct > 0 ? "+" : ""}${fmtPct(laggard.changePct, 2)}）。这是收盘事实描述，不等同于板块主线或次日预测。`;
  $("marketStructureSource").textContent = `来源：${data.quoteSource} · ${quoteDate}收盘`;
  $("analysisModelText").textContent = `短期广度${Math.round(snap.breadth.short * 6)}/6，中期广度${Math.round(snap.breadth.mid * 6)}/6，长期广度${Math.round(snap.breadth.long * 6)}/6；综合温度${(snap.breadth.comp * 100).toFixed(1)}，状态为“${REGIME[regime].label}”。${narrativeOf(regime, snap.breadth)}`;
  $("analysisModelSource").textContent = `来源：A股精力管理系统模型 · 周线截至 ${snap.date}（${weekCadenceText(snap.weekState)}）`;
  const news = Array.isArray(data.news) ? data.news : [];
  $("newsGrid").innerHTML = news.length ? news.map((item) => `<article class="panel analysis-card news-card"><span class="news-type">${escapeHtml(item.sourceType || "公开信息")}</span><h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3><p>点击标题前往原始发布页面核验。本站不复制新闻正文，也不基于标题自动生成交易结论。</p><span class="src">来源：${escapeHtml(item.source)} · ${escapeHtml(item.publishedAt)} · <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">原文</a></span></article>`).join("") : `<article class="panel analysis-card"><h3>新闻源暂不可用</h3><p>没有可展示的缓存新闻。请检查网络或数据源配置后重新运行更新脚本。</p></article>`;
  const statusMap = { updated: "本次已更新", cached: "新闻源失败，沿用上次成功缓存", unavailable: "新闻源不可用且无缓存" };
  $("newsUpdateStatus").textContent = `${statusMap[data.newsStatus] || "新闻状态未知"} · ${news.length}条 · 仅标题、来源、日期与原文链接`;
}

function targetEquity(breadth) {
  const regime = regimeOf(breadth);
  if (regime === "bear" || regime === "crisis") return 0;
  if (regime === "shock") return clamp(0.40 + ((breadth.comp - 0.35) / 0.30) * 0.20, 0.40, 0.60);
  return clamp(0.75 + ((breadth.comp - 0.65) / 0.35) * 0.25, 0.75, 1.00);
}

function compositeMomentum(history, idx, code) {
  const arr = history.series[code];
  if (!arr || idx < 12) return -Infinity;
  const close = arr[idx].close;
  const ret4 = close / arr[idx - 4].close - 1;
  const ret12 = close / arr[idx - 12].close - 1;
  const ma12 = meanClose(arr, idx, 12);
  return 0.40 * ret4 + 0.60 * ret12 + 0.50 * (close / ma12 - 1);
}

function pickAssets(regime, scores = {}, eligibleCodes = ETF_META.map((x) => x.code)) {
  if (regime === "bear" || regime === "crisis") return [];
  return ETF_META.filter((x) => eligibleCodes.includes(x.code))
    .sort((a, b) => (scores[b.code] ?? -Infinity) - (scores[a.code] ?? -Infinity))
    .slice(0, 2).map((x) => x.code);
}

function holdingsToCodes(text = "") {
  const aliases = { "上证50": "000016", "沪深300": "000300", "中证500": "000905", "中证1000": "000852", "创业板指": "399006", "科创50": "000688" };
  return Object.entries(aliases).filter(([name]) => text.includes(name)).map(([, code]) => code);
}

function narrativeOf(regime, b) {
  if (regime === "crisis") return "多数宽基指数全面跌破中期趋势，是系统性的下跌风险阶段。此时最重要的不是抓住机会，而是保护本金、避免在下跌中接飞刀。";
  if (regime === "bear") return `市场有一些短线回暖，但多数宽基指数的中期趋势还没有转强（当前只有 ${Math.round(b.mid * 6)} 个方向站上季度平均价格）。现在更像雨后放晴的早期，不适合因为一天上涨就明显加仓。`;
  if (regime === "shock") return "市场一部分方向转强、一部分仍偏弱，热点轮动很快。这种环境下追高容易受伤，更稳妥的做法是均衡配置、控制总仓位。";
  return "多数宽基指数站上中短期趋势，市场风险偏好回升。这个阶段可以更积极，但也要注意单一风格过热后的回落风险。";
}

function renderSnapshot() {
  const snap = computeSnapshot();
  const regime = regimeOf(snap.breadth);
  if ($("snapshotDate")) $("snapshotDate").textContent = snap.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1年$2月$3日");
  if ($("snapshotSource")) $("snapshotSource").textContent = `数据：${snap.source} · ${weekCadenceText(snap.weekState)}`;
  const info = REGIME[regime];
  const dd = state.backtest?.currentDrawdown ?? 0;
  const latestV2 = state.performanceBacktest?.records?.at(-1);
  const equity = latestV2?.equity ?? targetEquity(snap.breadth);
  const eligibleCodes = regime === "shock"
    ? snap.rows.filter((row) => row.mid).map((row) => row.code)
    : ETF_META.map((m) => m.code);
  const picks = latestV2 ? holdingsToCodes(latestV2.holdings) : pickAssets(regime, latestMomentum(), eligibleCodes);
  const alloc = picks.map((code) => ({ code, weight: equity / Math.max(1, picks.length) }));
  alloc.push({ code: "CASH", weight: 1 - equity });

  $("regimeTitle").textContent = info.friendly;
  $("regimeNarrative").textContent = narrativeOf(regime, snap.breadth);
  $("scoreValue").textContent = (snap.breadth.comp * 100).toFixed(1);
  $("scoreBar").style.width = fmtPct(snap.breadth.comp);
  $("targetEquity").textContent = fmtPct(equity, 0);
  $("equityMoneyBar").style.width = fmtPct(equity);
  $("moneyEquity").textContent = `¥${Math.round(equity * 100)}`;
  $("moneyCash").textContent = `¥${Math.round((1 - equity) * 100)}`;
  $("donutEquity").textContent = fmtPct(equity, 0);
  $("cashWeight").textContent = fmtPct(1 - equity);
  const fuseActive = dd <= -state.params.stopPct / 100 && snap.breadth.comp < 0.65;
  if ($("fuseNote")) {
    if (latestV2) {
      $("fuseNote").style.display = "block";
      $("fuseNote").textContent = `V2最新完成记录（周标签 ${latestV2.date}）：${REGIME[latestV2.regime].label}，执行总仓位 ${fmtPct(latestV2.equity)}，${latestV2.holdings}。一般使用者周五14:45核对预估信号。`;
    } else if (fuseActive) {
      $("fuseNote").style.display = "block";
      $("fuseNote").textContent = `当前配置引擎回撤熔断已触发：内部周线回测自高点回撤 ${fmtPct(dd)}。`;
    } else {
      $("fuseNote").style.display = "none";
    }
  }
  if ($("drawdownGuard")) {
    $("drawdownGuard").textContent = latestV2 ? `V2当前 ${fmtPct(latestV2.equity)}` : (fuseActive ? "当前配置引擎已触发" : "当前配置引擎未触发");
    $("drawdownGuard").className = latestV2?.equity === 0 || fuseActive ? "fall" : "pass";
  }
  $("policyHint").textContent = "V2分段仓位映射";
  $("engineComp") && ($("engineComp").textContent = (snap.breadth.comp * 100).toFixed(1));
  $("engineRegime") && ($("engineRegime").textContent = info.label.replace("态", ""));
  $("shortBreadth").textContent = fmtPct(snap.breadth.short);
  $("midBreadth").textContent = fmtPct(snap.breadth.mid);
  $("longBreadth").textContent = fmtPct(snap.breadth.long);
  $("shortBar").style.width = fmtPct(snap.breadth.short);
  $("midBar").style.width = fmtPct(snap.breadth.mid);
  $("longBar").style.width = fmtPct(snap.breadth.long);

  const ringTrack = cssVar("--surface-3");
  $("scoreRing") && ($("scoreRing").style.background = `conic-gradient(${cssVar("--amber")} 0 ${snap.breadth.comp * 100}%, ${ringTrack} ${snap.breadth.comp * 100}% 100%)`);

  const cashColor = cssVar("--cash");
  const stops = alloc.map((a) => {
    if (a.code === "CASH") return cashColor;
    const m = ETF_META.find((x) => x.code === a.code);
    return m.color;
  });
  let cursor = 0;
  const segments = alloc.map((a, i) => {
    const s = cursor;
    cursor += a.weight;
    return `${stops[i]} ${(s * 100).toFixed(2)}% ${(cursor * 100).toFixed(2)}%`;
  });
  $("allocationDonut").style.background = `conic-gradient(${segments.join(",")})`;

  $("allocationList").innerHTML = alloc.map((a) => {
    if (a.code === "CASH") return `<div class="alloc-row"><i style="background:${cashColor}"></i><div><span>现金 / 货币工具</span><small>未计现金收益</small></div><b>${fmtPct(a.weight)}</b></div>`;
    const m = ETF_META.find((x) => x.code === a.code);
    return `<div class="alloc-row"><i style="background:${m.color}"></i><div><span>${m.name}</span><small>${m.code}</small></div><b>${fmtPct(a.weight)}</b></div>`;
  }).join("");

  renderSimpleAllocation(picks, equity);
  renderAnswers(regime);
  renderFriendlyEtf(snap.rows);
  renderProTable(snap.rows);
  renderTradeTicket(latestV2?.regime || regime, equity, picks);
  renderPerformance();
  renderMarketAnalysis();
}

function renderSimpleAllocation(picks, equity) {
  const c1 = $("pickCard1"), c2 = $("pickCard2");
  if (!c1 || !c2) return;
  if (picks.length === 0) { c1.style.display = "none"; c2.style.display = "none"; return; }
  const m1 = ETF_META.find((m) => m.code === picks[0]);
  const m2 = picks.length > 1 ? ETF_META.find((m) => m.code === picks[1]) : null;
  c1.style.display = ""; c2.style.display = m2 ? "" : "none";
  c1.style.borderTopColor = m1.group === "defensive" ? "var(--red)" : "var(--blue)";
  if (m2) c2.style.borderTopColor = m2.group === "defensive" ? "var(--red)" : "var(--blue)";
  $("pickSymbol1").textContent = m1.code.slice(-3);
  $("pickTag1").textContent = m1.group === "defensive" ? "稳健核心" : "成长方向";
  $("pickName1").innerHTML = `${m1.name} <small>${m1.code}</small>`;
  $("pickDesc1").textContent = m1.desc + " 当前目标约 " + fmtPct(equity / picks.length, 0) + "。";
  $("pickWeight1").textContent = fmtPct(equity / picks.length, 0);
  if (m2) {
    $("pickSymbol2").textContent = m2.code.slice(-3);
    $("pickTag2").textContent = m2.group === "defensive" ? "市场基石" : "成长弹性";
    $("pickName2").innerHTML = `${m2.name} <small>${m2.code}</small>`;
    $("pickDesc2").textContent = m2.desc + " 当前目标约 " + fmtPct(equity / picks.length, 0) + "。";
    $("pickWeight2").textContent = fmtPct(equity / picks.length, 0);
  }
}

const ANSWER_MAP = {
  bull:   ["全面走强，风险偏好扩张", "可适度积极，关注主线", "成长弹性优先", "多数宽基一起上涨，赚钱效应扩散。", "可适度加大风险敞口，跟随最强主线。", "聚焦成长方向（科技/硬科技/医药），让利润奔跑。"],
  shock:  ["部分回暖，部分仍弱", "均衡为主，保留灵活", "大盘 + 中盘均衡", "短线因科技方向走强而回暖，但多数宽基的中期趋势还没真正好转。", "用一半左右的资金参与，留够现金应对波动。", "沪深300 + 中证500 是当前组合的核心。"],
  bear:   ["弱修复，不是全面走强", "停止投入，等待右侧", "100%现金避险", "只有部分方向回暖，市场整体还没有形成一致上涨趋势。", "V2在弱势防守态将权益仓位降到0%，不在阴跌阶段硬抗。", "现金、货基或国债逆回购优先，等综合广度重新回到震荡区。"],
  crisis: ["系统全面承压", "保护本金，回避风险", "现金为王", "多数宽基跌破中期趋势，技术分析难以奏效。", "不再主观猜底，全部转现金或货币工具。", "暂不持有权益，等待右侧修复信号。"]
};

function renderAnswers(regime) {
  const m = ANSWER_MAP[regime];
  if (!m) return;
  $("answer1Title").textContent = m[0]; $("answer2Title").textContent = m[1]; $("answer3Title").textContent = m[2];
  $("answer1Desc").textContent = m[3]; $("answer2Desc").textContent = m[4]; $("answer3Desc").textContent = m[5];
}

function renderFriendlyEtf(rows) {
  $("friendlyEtfGrid").innerHTML = rows.map((row) => {
    const m = ETF_META.find((x) => x.code === row.code);
    const count = [row.short, row.mid, row.long].filter(Boolean).length;
    const badge = count === 3 ? ["strong", "强势"] : count === 0 ? ["weak", "偏弱"] : ["middle", "修复中"];
    const note = count === 3 ? "三条趋势线都在价格下方，处于上升结构。"
      : count === 0 ? "价格仍在中期趋势下方，需要更多时间修复。"
      : count === 1 ? "短线刚回暖，但中期趋势还没真正转强。"
      : "部分趋势已经转强，正处在修复过程中。";
    const dots = [row.short, row.mid, row.long].map((v) => `<i class="${v ? "on" : ""}"></i>`).join("");
    return `<div class="friendly-etf"><div class="friendly-etf-top"><div><h4>${m.name}</h4><small>${m.code}</small></div><span class="health-badge ${badge[0]}">${badge[1]}</span></div><div class="dot-line" title="短/中/长期趋势">${dots}</div><p>${m.desc} ${note}</p></div>`;
  }).join("");
}

function renderProTable(rows) {
  $("etfTableBody").innerHTML = rows.map((row) => {
    const m = ETF_META.find((x) => x.code === row.code);
    const count = [row.short, row.mid, row.long].filter(Boolean).length;
    const trend = count === 3 ? "多头排列" : count === 0 ? "全面承压" : count === 1 ? "弱修复" : "结构修复";
    const cls = count === 3 ? "strong" : count === 0 ? "weak" : "";
    const sig = (v) => `<span class="signal ${v ? "up" : "down"}">${v ? "↑" : "↓"}</span>`;
    return `<tr><td class="etf-name"><b>${m.name}</b><span>${m.code}</span></td><td>${fmtNum(row.close)}</td><td>${fmtNum(row.ma20)}</td><td>${fmtNum(row.ma60)}</td><td>${fmtNum(row.ma120)}</td><td>${sig(row.short)}</td><td>${sig(row.mid)}</td><td>${sig(row.long)}</td><td><span class="trend-tag ${cls}">${trend}</span></td></tr>`;
  }).join("");
}

function renderTradeTicket(regime, equity, picks) {
  const names = picks.map((c) => ETF_META.find((m) => m.code === c).name).join(" + ") || "现金 / 货币工具";
  $("tradeTicket").innerHTML = `<div class="ticket-status"><b>${REGIME[regime].friendly} · V2目标权益 ${fmtPct(equity)}</b><span>周五14:30起可手动更新滚动信号，14:45核对，14:56前完成；注意尾盘集合竞价订单规则</span></div><div class="ticket-grid"><div><span>持仓标的</span><b>${names}</b></div><div><span>单只目标</span><b>${picks.length ? fmtPct(equity / picks.length) : "0%"}</b></div><div><span>现金目标</span><b>${fmtPct(1 - equity)}</b></div><div><span>信号查看</span><b>周五14:30后（盘中滚动）</b></div><div><span>盘中路径</span><b>14:56前完成</b></div><div><span>盘后备选</span><b>15:05—15:30固定价</b></div></div>`;
}

function latestMomentum() {
  if (!state.history) return {};
  const idx = state.history.dates.length - 1;
  return Object.fromEntries(ETF_META.map((m) => [m.code, compositeMomentum(state.history, idx, m.code)]));
}

async function syncAndBacktest() {
  const btn = $("syncBtn");
  btn.disabled = true;
  btn.querySelector("span:last-child").textContent = "重新载入…";
  try {
    if (!loadBakedHistory()) throw new Error("未找到内嵌历史数据");
    const cadence = state.history?.weekState === "rolling" ? "滚动周·盘中信号" : "完成周";
    showToast(`已按最新烘焙数据重新载入并回测（${cadence}）`);
    renderSnapshot();
  } catch (err) {
    showToast(`载入失败：${err.message}`, true);
  } finally {
    btn.disabled = false;
    btn.querySelector("span:last-child").textContent = "更新数据";
  }
}

function alignHistory(series) {
  const sets = Object.values(series).map((arr) => new Set(arr.map((x) => x.date)));
  const dates = [...sets[0]].filter((d) => sets.every((s) => s.has(d))).sort();
  const aligned = {};
  ETF_META.forEach((m) => {
    const map = new Map(series[m.code].map((x) => [x.date, x]));
    aligned[m.code] = dates.map((d) => map.get(d));
  });
  return { dates, series: aligned };
}

function meanClose(arr, idx, n) {
  if (idx < n - 1) return null;
  let sum = 0;
  for (let i = idx - n + 1; i <= idx; i++) sum += arr[i].close;
  return sum / n;
}

function signalAt(history, idx) {
  const flags = ETF_META.map((m) => {
    const arr = history.series[m.code];
    const close = arr[idx].close;
    return { code: m.code, short: close > meanClose(arr, idx, 4), mid: close > meanClose(arr, idx, 12), long: close > meanClose(arr, idx, 24) };
  });
  const b = {
    short: flags.filter((x) => x.short).length / 6,
    mid: flags.filter((x) => x.mid).length / 6,
    long: flags.filter((x) => x.long).length / 6
  };
  b.comp = 0.35 * b.short + 0.45 * b.mid + 0.20 * b.long;
  return b;
}

function momentumAt(history, idx) {
  return Object.fromEntries(ETF_META.map((m) => [m.code, compositeMomentum(history, idx, m.code)]));
}

function runBacktest(history) {
  const start = 24;
  let nav = 1;
  let bench = 1;
  let peak = 1;
  let currentWeights = Object.fromEntries(ETF_META.map((m) => [m.code, 0]));
  let pending = null;
  let totalTurnover = 0;
  const records = [];
  const trades = [];
  const regimeDays = { crisis: 0, bear: 0, shock: 0, bull: 0 };

  for (let i = start; i < history.dates.length; i++) {
    const dailyReturns = Object.fromEntries(ETF_META.map((m) => {
      const arr = history.series[m.code];
      return [m.code, arr[i].close / arr[i - 1].close - 1];
    }));
    const portRet = ETF_META.reduce((s, m) => s + currentWeights[m.code] * dailyReturns[m.code], 0);
    nav *= 1 + portRet;
    bench *= 1 + ETF_META.reduce((s, m) => s + dailyReturns[m.code] / 6, 0);
    if (pending) {
      const turnover = ETF_META.reduce((s, m) => s + Math.abs((pending.weights[m.code] || 0) - (currentWeights[m.code] || 0)), 0);
      nav *= 1 - turnover * state.params.costBps / 10000;
      totalTurnover += turnover;
      currentWeights = pending.weights;
      trades.push({ ...pending, executeDate: history.dates[i], turnover });
      pending = null;
    }
    peak = Math.max(peak, nav);
    const dd = nav / peak - 1;
    const b = signalAt(history, i);
    const regime = regimeOf(b);
    regimeDays[regime]++;
    const equity = targetEquity(b);
    const eligibleCodes = regime === "shock"
      ? ETF_META.filter((m) => history.series[m.code][i].close > meanClose(history.series[m.code], i, 12)).map((m) => m.code)
      : ETF_META.map((m) => m.code);
    const picks = pickAssets(regime, momentumAt(history, i), eligibleCodes);
    const target = Object.fromEntries(ETF_META.map((m) => [m.code, 0]));
    picks.forEach((code) => { target[code] = equity / picks.length; });
    const targetTurnover = ETF_META.reduce((s, m) => s + Math.abs(target[m.code] - currentWeights[m.code]), 0);
    const changedAssets = ETF_META.some((m) => (target[m.code] > 0) !== (currentWeights[m.code] > 0));
    if (changedAssets || targetTurnover >= state.params.bufferPct / 100) {
      pending = { signalDate: history.dates[i], regime, breadth: b.comp, equity, picks, weights: target, reason: changedAssets ? "标的变化" : "仓位越阈" };
    }
    records.push({ date: history.dates[i], nav, bench, dd, regime, equity: Object.values(currentWeights).reduce((a, b) => a + b, 0) });
  }
  return summarizeBacktest(records, trades, regimeDays, totalTurnover);
}

function summarizeBacktest(records, trades, regimeDays, totalTurnover) {
  const n = records.length;
  const years = n / 52;
  const totalReturn = records.at(-1).nav - 1;
  const annualReturn = Math.pow(records.at(-1).nav, 1 / years) - 1;
  const daily = records.slice(1).map((r, i) => r.nav / records[i].nav - 1);
  const avg = daily.reduce((a, b) => a + b, 0) / daily.length;
  const variance = daily.reduce((s, x) => s + (x - avg) ** 2, 0) / Math.max(1, daily.length - 1);
  const annualVol = Math.sqrt(variance * 52);
  const sharpe = annualVol ? annualReturn / annualVol : 0;
  return {
    records, trades, regimeDays, totalReturn, annualReturn, annualVol, sharpe,
    maxDrawdown: Math.min(...records.map((r) => r.dd)),
    currentDrawdown: records.at(-1).dd,
    annualTurnover: totalTurnover / years,
    startDate: records[0].date,
    endDate: records.at(-1).date
  };
}

function renderPerformance() {
  const bt = state.performanceBacktest || state.backtest;
  if (!bt) return;
  $("totalReturn").textContent = fmtPct(bt.totalReturn);
  $("annualReturn").textContent = fmtPct(bt.annualReturn);
  $("maxDrawdown").textContent = fmtPct(bt.maxDrawdown);
  $("annualVol").textContent = fmtPct(bt.annualVol);
  $("sharpe").textContent = bt.sharpe.toFixed(2);
  $("turnover").textContent = bt.sourceType === "user-csv" ? bt.calmar.toFixed(2) : fmtPct(bt.annualTurnover, 0);
  $("performancePeriod").textContent = bt.sourceType === "user-csv"
    ? `静态回测样例 · ${bt.startDate} 至 ${bt.endDate} · 187周 · 不随公开行情自动更新`
    : `${bt.startDate} 至 ${bt.endDate} · 宽基指数原始周线 · 单边成本 ${state.params.costBps}bp`;
  if ($("perfBenchmarkSummary")) {
    if (bt.sourceType === "user-csv") {
      const v1Return = bt.records.at(-1).v1 / bt.records[0].v1 - 1;
      const equalReturn = bt.records.at(-1).bench / bt.records[0].bench - 1;
      const hs300Return = bt.records.at(-1).hs300 / bt.records[0].hs300 - 1;
      $("perfBenchmarkSummary").innerHTML = `<span>V2增强结果</span><p>V2累计 ${fmtPct(bt.totalReturn)}，较V1的 ${fmtPct(v1Return)} 提升 ${fmtPct(bt.totalReturn - v1Return)}；六宽基等权 ${fmtPct(equalReturn)}；沪深300 ${fmtPct(hs300Return)}。V2最大回撤 ${fmtPct(bt.maxDrawdown)}，卡玛 ${bt.calmar.toFixed(2)}。</p>`;
    } else {
      $("perfBenchmarkSummary").style.display = "none";
    }
  }
  $("navEmpty").style.display = "none";
  $("ddEmpty").style.display = "none";
  drawChart($("navChart"), bt.records, [
    { key: "nav", color: cssVar("--red"), width: 2.5 },
    ...(bt.sourceType === "user-csv" ? [{ key: "v1", color: cssVar("--blue"), width: 1.4 }] : []),
    { key: "bench", color: cssVar("--amber"), width: 1.4 },
    ...(bt.sourceType === "user-csv" ? [{ key: "hs300", color: cssVar("--cash"), width: 1.2 }] : [])
  ], { normalize: false, zeroLine: false });
  drawChart($("drawdownChart"), bt.records, [
    { key: "dd", color: cssVar("--green"), width: 1.8, fill: cssVar("--green-soft") }
  ], { normalize: false, zeroLine: true, fixedMin: Math.min(-0.10, bt.maxDrawdown * 1.1), fixedMax: 0 });
  if (bt.sourceType === "user-csv") renderUserHistory(bt.records);
  else renderTradeLog(bt.trades);
  renderRegimeStats(bt.regimeDays);
}

function drawChart(canvas, records, series, options = {}) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || rect.width < 100) return false;
  const cssWidth = Math.floor(rect.width);
  const cssHeight = Number(canvas.getAttribute("height")) || 300;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = { l: 54, r: 20, t: 18, b: 32 };
  const w = cssWidth - pad.l - pad.r;
  const h = cssHeight - pad.t - pad.b;
  const values = series.flatMap((s) => records.map((r) => r[s.key]));
  let min = options.fixedMin ?? Math.min(...values);
  let max = options.fixedMax ?? Math.max(...values);
  if (max === min) max = min + 1;
  const margin = options.fixedMin == null ? (max - min) * 0.08 : 0;
  min -= margin;
  max += options.fixedMax == null ? margin : 0;
  const x = (i) => pad.l + (i / Math.max(1, records.length - 1)) * w;
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * h;

  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.strokeStyle = cssVar("--line");
  ctx.fillStyle = cssVar("--chart-label");
  ctx.font = "10px Inter, sans-serif";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gy = pad.t + h * i / 4;
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(cssWidth - pad.r, gy); ctx.stroke();
    const val = max - (max - min) * i / 4;
    ctx.fillText(options.zeroLine ? `${(val * 100).toFixed(0)}%` : val.toFixed(2), 8, gy + 3);
  }
  if (options.zeroLine && min < -0.08) {
    ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = cssVar("--red");
    ctx.beginPath(); ctx.moveTo(pad.l, y(-0.08)); ctx.lineTo(cssWidth - pad.r, y(-0.08)); ctx.stroke(); ctx.restore();
  }
  const ticks = 5;
  for (let i = 0; i < ticks; i++) {
    const idx = Math.round(i * (records.length - 1) / (ticks - 1));
    ctx.fillText(records[idx].date.slice(0, 7), x(idx) - 18, cssHeight - 8);
  }
  series.forEach((s) => {
    ctx.beginPath();
    records.forEach((r, i) => i ? ctx.lineTo(x(i), y(r[s.key])) : ctx.moveTo(x(i), y(r[s.key])));
    if (s.fill) {
      ctx.lineTo(x(records.length - 1), y(0)); ctx.lineTo(x(0), y(0)); ctx.closePath();
      ctx.fillStyle = s.fill; ctx.fill();
      ctx.beginPath(); records.forEach((r, i) => i ? ctx.lineTo(x(i), y(r[s.key])) : ctx.moveTo(x(i), y(r[s.key])));
    }
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
  });
  return true;
}

function renderTradeLog(trades) {
  const rows = trades.slice(-12).reverse();
  $("tradeLogBody").innerHTML = rows.length ? rows.map((t) => {
    const assets = t.picks.map((c) => ETF_META.find((m) => m.code === c).name).join(" / ") || "现金";
    return `<tr><td>${t.signalDate}</td><td>${t.executeDate}</td><td>${REGIME[t.regime].label}</td><td>${fmtPct(t.breadth)}</td><td>${fmtPct(t.equity)}</td><td>${assets}</td><td>${fmtPct(t.turnover)}</td><td>${t.reason}</td></tr>`;
  }).join("") : `<tr><td colspan="8" class="empty">回测期内未触发调仓</td></tr>`;
}

function renderUserHistory(records) {
  const rows = records.slice(-12).reverse();
  $("tradeLogBody").innerHTML = rows.map((row) => `<tr><td>${row.date}</td><td>CSV周标签</td><td>${REGIME[row.regime].label}</td><td>${fmtPct(row.breadth)}</td><td>${fmtPct(row.equity)}</td><td>${row.holdings}</td><td>—</td><td>V2原始记录</td></tr>`).join("");
}

function renderRegimeStats(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const colors = { crisis: cssVar("--cash"), bear: cssVar("--green"), shock: cssVar("--amber"), bull: cssVar("--red") };
  $("regimeStats").innerHTML = ["bull", "shock", "bear", "crisis"].map((key) => {
    const pct = counts[key] / total;
    return `<div class="stat-row"><div><span>${REGIME[key].label}</span><b>${fmtPct(pct)} · ${counts[key]}周</b></div><div class="stat-track"><i style="width:${fmtPct(pct)};background:${colors[key]}"></i></div></div>`;
  }).join("");
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = lines.shift().split(",").map((x) => x.trim().toLowerCase());
  const dateIdx = headers.indexOf("date");
  const codeIdx = headers.indexOf("code");
  const closeIdx = headers.indexOf("close");
  if ([dateIdx, codeIdx, closeIdx].some((x) => x < 0)) throw new Error("CSV 必须包含 date, code, close 字段");
  const grouped = Object.fromEntries(ETF_META.map((m) => [m.code, []]));
  lines.forEach((line) => {
    const cols = line.split(",");
    const code = cols[codeIdx].trim().replace(/^(sh|sz)/i, "");
    if (!grouped[code]) return;
    const close = Number(cols[closeIdx]);
    if (!Number.isFinite(close) || close <= 0) return;
    grouped[code].push({ date: cols[dateIdx].trim(), close });
  });
  ETF_META.forEach((m) => grouped[m.code].sort((a, b) => a.date.localeCompare(b.date)));
  return alignHistory(grouped);
}

function downloadSnapshot() {
  const snap = snapshotSignals();
  const rows = ["date,code,name,close,ma20,ma60,ma120,above_ma20,above_ma60,above_ma120"];
  snap.rows.forEach((r) => {
    const m = ETF_META.find((x) => x.code === r.code);
    rows.push([VERIFIED_SNAPSHOT.date, r.code, m.name, r.close, r.ma20, r.ma60, r.ma120, r.short, r.mid, r.long].join(","));
  });
  const blob = new Blob([`\uFEFF${rows.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ashare-regime-snapshot-${VERIFIED_SNAPSHOT.date}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function applyParams() {
  state.params.crisisFloor = Number($("crisisFloor").value);
  state.params.costBps = Number($("costBps").value);
  state.params.bufferPct = Number($("bufferPct").value);
  state.params.stopPct = Number($("stopPct").value);
  if (state.history) state.backtest = runBacktest(state.history);
  renderSnapshot();
  showToast("参数已应用，组合与回测已重算");
}

function applyTheme(theme, persist = false) {
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  if (persist) { try { localStorage.setItem("regime-theme", theme); } catch (e) {} }
  renderSnapshot();
}

function showToast(message, isError = false) {
  const toast = $("toast");
  toast.textContent = message;
  toast.style.borderColor = isError ? "color-mix(in srgb, var(--red) 70%, var(--line))" : "color-mix(in srgb, var(--green) 60%, var(--line))";
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 4200);
}

function schedulePerformanceRedraw() {
  if (!state.performanceBacktest && !state.backtest) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const performance = $("performance");
    if (performance?.classList.contains("active-view")) renderPerformance();
  }));
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((x) => x.classList.toggle("active", x === btn));
    document.querySelectorAll(".view-section").forEach((x) => x.classList.toggle("active-view", x.id === btn.dataset.target));
    if (btn.dataset.target === "performance") schedulePerformanceRedraw();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  document.querySelectorAll(".jump-btn").forEach((btn) => btn.addEventListener("click", () => {
    const target = document.querySelector(`.nav-item[data-target="${btn.dataset.jump}"]`);
    target && target.click();
  }));
  document.querySelectorAll(".policy").forEach((btn) => btn.addEventListener("click", () => {
    state.policy = btn.dataset.policy;
    document.querySelectorAll(".policy").forEach((x) => x.classList.toggle("active", x === btn));
    if (state.history) state.backtest = runBacktest(state.history);
    renderSnapshot();
  }));
  $("themeToggle").addEventListener("click", () => applyTheme(state.theme === "light" ? "dark" : "light", true));
  $("syncBtn").addEventListener("click", syncAndBacktest);
  $("exportSnapshot").addEventListener("click", downloadSnapshot);
  $("csvInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      state.history = parseCsv(await file.text());
      if (state.history.dates.length < 24) throw new Error("共同交易周不足24周");
      state.backtest = runBacktest(state.history);
      $("dataModeLabel").textContent = "CSV 回测";
      $("historySource").textContent = `${file.name} · ${state.history.dates[0]} 至 ${state.history.dates.at(-1)}`;
      $("auditDataBadge").textContent = "已导入";
      $("auditDataBadge").className = "badge ok";
      renderSnapshot();
      showToast(`已导入 ${state.history.dates.length} 个共同交易周`);
    } catch (err) { showToast(`导入失败：${err.message}`, true); }
  });
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(schedulePerformanceRedraw, 120);
  });
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(() => schedulePerformanceRedraw());
    observer.observe($("performance"));
  }
}

(function initTheme() {
  let saved = "light";
  if (new URLSearchParams(location.search).has("dark")) saved = "dark";
  else { try { saved = localStorage.getItem("regime-theme") || "light"; } catch (e) {} }
  applyTheme(saved);
})();

function loadUserBacktest() {
  if (!window.USER_BACKTEST || !Array.isArray(window.USER_BACKTEST.rows) || window.USER_BACKTEST.rows.length < 2) return false;
  const regimeMap = { "多头进攻": "bull", "中性震荡": "shock", "弱势防守": "bear", "极端空头": "crisis" };
  let peak = -Infinity;
  const records = window.USER_BACKTEST.rows.map((row) => {
    peak = Math.max(peak, row.nav);
    return {
      date: row.date,
      nav: row.nav,
      v1: row.v1,
      bench: row.equalWeight,
      hs300: row.hs300,
      dd: row.nav / peak - 1,
      regime: regimeMap[row.regime],
      breadth: row.breadth,
      equity: row.equity,
      holdings: row.holdings
    };
  });
  const weeklyReturns = records.slice(1).map((row, i) => row.nav / records[i].nav - 1);
  const years = (new Date(`${records.at(-1).date}T00:00:00+08:00`) - new Date(`${records[0].date}T00:00:00+08:00`)) / (365.2425 * 86400000);
  const average = weeklyReturns.reduce((sum, value) => sum + value, 0) / weeklyReturns.length;
  const variance = weeklyReturns.reduce((sum, value) => sum + (value - average) ** 2, 0) / Math.max(1, weeklyReturns.length - 1);
  const totalReturn = records.at(-1).nav / records[0].nav - 1;
  const annualReturn = Math.pow(records.at(-1).nav / records[0].nav, 1 / years) - 1;
  const annualVol = Math.sqrt(variance * 52);
  const regimeDays = { crisis: 0, bear: 0, shock: 0, bull: 0 };
  records.forEach((row) => { if (row.regime) regimeDays[row.regime] += 1; });
  state.performanceBacktest = {
    sourceType: "user-csv",
    records,
    trades: [],
    regimeDays,
    totalReturn,
    annualReturn,
    annualVol,
    sharpe: annualVol ? (average * 52) / annualVol : 0,
    calmar: annualReturn / Math.abs(Math.min(...records.map((row) => row.dd))),
    maxDrawdown: Math.min(...records.map((row) => row.dd)),
    currentDrawdown: records.at(-1).dd,
    averageEquity: records.reduce((sum, row) => sum + row.equity, 0) / records.length,
    startDate: records[0].date,
    endDate: records.at(-1).date
  };
  return true;
}

function loadMarketAnalysis() {
  if (!window.MARKET_ANALYSIS || !Array.isArray(window.MARKET_ANALYSIS.indices)) return false;
  state.marketAnalysis = window.MARKET_ANALYSIS;
  return true;
}

function loadBakedHistory() {
  if (!window.BAKED_HISTORY || !window.BAKED_HISTORY.close) return false;
  const H = window.BAKED_HISTORY;
  const series = {};
  ETF_META.forEach((m) => {
    series[m.code] = H.dates.map((d, i) => ({ date: d, close: H.close[m.code][i] }));
  });
  state.history = { dates: H.dates, series, weekState: H.weekState || "completed", asofWeekEnd: H.asofWeekEnd || "" };
  state.backtest = runBacktest(state.history);
  loadUserBacktest();
  const weekTag = state.history.weekState === "rolling" ? "（滚动周·未收线）" : "";
  $("dataModeLabel").textContent = state.performanceBacktest ? "用户回测口径" : "周度回测";
  $("sideSyncTime").textContent = state.performanceBacktest ? `市场 ${H.asof}${weekTag} · V2样例 ${state.performanceBacktest.endDate}` : `市场截至 ${H.asof} 周${weekTag}`;
  $("historySource").textContent = state.performanceBacktest
    ? `用户提供周度回测 CSV · ${state.performanceBacktest.startDate} 至 ${state.performanceBacktest.endDate}`
    : `腾讯行情·宽基指数原始周线（6只宽基指数）· ${H.start} 至 ${H.asof}${weekTag}`;
  if ($("auditMarketSource")) $("auditMarketSource").textContent = `腾讯行情·六宽基周线 · ${H.start} 至 ${H.asof}${weekTag}`;
  $("auditDataBadge").textContent = state.performanceBacktest ? "用户回测已接入" : "已接入真实数据";
  $("auditDataBadge").className = "badge ok";
  return true;
}

bindEvents();
loadMarketAnalysis();
loadBakedHistory();
renderSnapshot();
const initialView = new URLSearchParams(location.search).get("view");
const initialNav = initialView && document.querySelector(`.nav-item[data-target="${initialView}"]`);
if (initialNav) initialNav.click();
