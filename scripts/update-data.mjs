import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv.find((value) => value.startsWith("--config="));
const configPath = resolve(root, arg ? arg.slice("--config=".length) : "config/data-source.json");

async function loadConfig() {
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const examplePath = resolve(root, "config/data-source.example.json");
    console.warn("config/data-source.json 不存在，使用示例配置运行。需要自定义时请先复制示例文件。");
    return JSON.parse(await readFile(examplePath, "utf8"));
  }
}

function shanghaiNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

function shanghaiDate() {
  return shanghaiNow().date;
}

function validateConfig(config) {
  if (config.provider !== "tencent-fqkline") throw new Error(`不支持的数据源：${config.provider}`);
  if (config.frequency !== "week") throw new Error("当前适配器仅支持 week 周线");
  if (!Array.isArray(config.symbols) || config.symbols.length !== 6) throw new Error("symbols 必须恰好包含6只宽基");
  const codes = new Set(config.symbols.map((item) => item.code));
  if (codes.size !== config.symbols.length) throw new Error("symbols.code 存在重复");
}

async function fetchKline(config, symbol, frequency, startDate, endDate, rowsRequested = 1000) {
  const adjustParam = config.adjust === "none" ? "" : config.adjust;
  const param = [symbol.requestCode, frequency, startDate, endDate, rowsRequested, adjustParam].join(",");
  const url = new URL(config.endpoint);
  url.searchParams.set("param", param);
  const response = await fetch(url, { signal: AbortSignal.timeout(config.timeoutMs || 15000) });
  if (!response.ok) throw new Error(`${symbol.name} 请求失败：HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(`${symbol.name} 接口返回错误：${payload.msg || payload.code}`);
  const node = payload.data?.[symbol.requestCode];
  const rows = node?.[frequency] || node?.[`qfq${frequency}`];
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${symbol.name} 未返回${frequency}线数据`);
  return rows.map((row) => {
    const close = Number(row[2]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row[0]) || !Number.isFinite(close) || close <= 0) {
      throw new Error(`${symbol.name} 含无效记录：${JSON.stringify(row)}`);
    }
    return { date: row[0], close };
  });
}

async function fetchSymbol(config, symbol, endDate) {
  return fetchKline(config, symbol, config.frequency, config.startDate, endDate, 1000);
}

async function fetchIndexSnapshot(config, symbol, endDate) {
  const market = config.marketAnalysis;
  const startDate = new Date(`${endDate}T12:00:00+08:00`);
  startDate.setUTCDate(startDate.getUTCDate() - 21);
  const start = startDate.toISOString().slice(0, 10);
  const rows = await fetchKline(config, symbol, market.quoteFrequency || "day", start, endDate, market.quoteRows || 10);
  if (rows.length < 2) throw new Error(`${symbol.name} 日线不足2条，无法计算涨跌幅`);
  const latest = rows.at(-1);
  const previous = rows.at(-2);
  return {
    code: symbol.code,
    name: symbol.name,
    date: latest.date,
    close: latest.close,
    changePct: latest.close / previous.close - 1
  };
}

function normalizeNewsItem(item, source) {
  if (source.provider === "govcn-json") {
    return {
      id: item.URL,
      title: String(item.TITLE || "").trim(),
      url: String(item.URL || "").trim(),
      publishedAt: String(item.DOCRELPUBTIME || "").trim(),
      source: source.name,
      sourceType: "一手政务发布"
    };
  }
  throw new Error(`不支持的新闻源：${source.provider}`);
}

async function fetchNewsSource(config, source) {
  const response = await fetch(source.endpoint, { signal: AbortSignal.timeout(config.timeoutMs || 15000) });
  if (!response.ok) throw new Error(`${source.name} 新闻请求失败：HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error(`${source.name} 新闻返回结构无效`);
  return payload.map((item) => normalizeNewsItem(item, source))
    .filter((item) => item.title && /^https:\/\//.test(item.url) && /^\d{4}-\d{2}-\d{2}/.test(item.publishedAt));
}

async function readPreviousMarketAnalysis(outputPath) {
  try {
    const text = await readFile(outputPath, "utf8");
    const match = text.match(/window\.MARKET_ANALYSIS\s*=\s*([\s\S]*);\s*$/);
    return match ? JSON.parse(match[1]) : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function buildMarketAnalysis(config, endDate) {
  const market = config.marketAnalysis;
  if (!market) return null;
  if (!Array.isArray(market.quoteSymbols) || market.quoteSymbols.length < 1) throw new Error("marketAnalysis.quoteSymbols 不能为空");
  const indices = await Promise.all(market.quoteSymbols.map((symbol) => fetchIndexSnapshot(config, symbol, endDate)));
  const quoteDates = [...new Set(indices.map((item) => item.date))];
  if (quoteDates.length !== 1) throw new Error(`指数快照交易日不一致：${quoteDates.join(", ")}`);
  const outputPath = resolve(root, market.output || "data/market-analysis.js");
  const previous = await readPreviousMarketAnalysis(outputPath);
  let news = [];
  let newsStatus = "updated";
  const newsErrors = [];
  for (const source of market.newsSources || []) {
    try { news.push(...await fetchNewsSource(config, source)); }
    catch (error) { newsErrors.push(`${source.name}: ${error.message}`); }
  }
  const uniqueNews = [...new Map(news.map((item) => [item.url, item])).values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, market.newsLimit || 4);
  if (uniqueNews.length) news = uniqueNews;
  else if (previous?.news?.length) {
    news = previous.news;
    newsStatus = "cached";
  } else {
    newsStatus = "unavailable";
  }
  return {
    outputPath,
    artifact: {
      version: 1,
      generatedAt: new Date().toISOString(),
      quoteSource: "腾讯行情公开接口·指数日线",
      quoteDate: quoteDates[0],
      indices,
      newsSourceMode: "标题与链接聚合，不复制新闻正文",
      newsStatus,
      newsErrors,
      news
    }
  };
}

function align(series, symbols, minimumCommonRows, includeIncompleteWeek) {
  const dateSets = symbols.map((symbol) => new Set(series[symbol.code].map((row) => row.date)));
  let commonDates = [...dateSets[0]].filter((date) => dateSets.every((set) => set.has(date))).sort();
  if (!includeIncompleteWeek && commonDates.length && commonDates.at(-1) === shanghaiDate()) {
    const latestDate = commonDates.at(-1);
    const weekday = new Date(`${latestDate}T12:00:00+08:00`).getUTCDay();
    const now = shanghaiNow();
    const fridayClosed = weekday === 5 && (now.hour > 15 || (now.hour === 15 && now.minute >= 5));
    if ((weekday >= 1 && weekday <= 4) || (weekday === 5 && !fridayClosed)) commonDates = commonDates.slice(0, -1);
  }
  if (commonDates.length < minimumCommonRows) {
    throw new Error(`共同交易周仅 ${commonDates.length}，少于要求的 ${minimumCommonRows}`);
  }
  const close = {};
  for (const symbol of symbols) {
    const byDate = new Map(series[symbol.code].map((row) => [row.date, row.close]));
    close[symbol.code] = commonDates.map((date) => byDate.get(date));
  }
  return { dates: commonDates, close };
}

const config = await loadConfig();
validateConfig(config);
const endDate = config.endDate === "auto" ? shanghaiDate() : config.endDate;
const marketAnalysis = await buildMarketAnalysis(config, endDate);
const entries = await Promise.all(config.symbols.map(async (symbol) => [symbol.code, await fetchSymbol(config, symbol, endDate)]));
const aligned = align(Object.fromEntries(entries), config.symbols, config.minimumCommonRows || 24, config.includeIncompleteWeek === true);
const artifact = {
  freq: "weekly",
  source: "腾讯行情公开接口·宽基指数周线",
  provider: config.provider,
  adjust: "原始指数点位（指数无需复权）",
  incompleteWeekIncluded: config.includeIncompleteWeek === true,
  asof: aligned.dates.at(-1),
  start: aligned.dates[0],
  count: aligned.dates.length,
  generatedAt: new Date().toISOString(),
  dates: aligned.dates,
  close: aligned.close
};
const outputPath = resolve(root, config.output || "data/history-baked.js");
await writeFile(outputPath, `window.BAKED_HISTORY = ${JSON.stringify(artifact)};\n`, "utf8");
console.log(`已更新 ${outputPath}`);
console.log(`共同周线：${artifact.count} 条，${artifact.start} 至 ${artifact.asof}`);
if (marketAnalysis) {
  await writeFile(marketAnalysis.outputPath, `window.MARKET_ANALYSIS = ${JSON.stringify(marketAnalysis.artifact)};\n`, "utf8");
  console.log(`已更新 ${marketAnalysis.outputPath}`);
  console.log(`指数快照：${marketAnalysis.artifact.indices.length} 个，日期 ${marketAnalysis.artifact.quoteDate}`);
  console.log(`新闻标题：${marketAnalysis.artifact.news.length} 条，状态 ${marketAnalysis.artifact.newsStatus}`);
  if (marketAnalysis.artifact.newsErrors.length) console.warn(`新闻源异常：${marketAnalysis.artifact.newsErrors.join("；")}`);
}
