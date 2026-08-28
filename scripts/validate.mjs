import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "project.html", "project.css", "readme.html", "tianshi.html", "index.html", "styles.css", "app.js",
  "data/history-baked.js", "data/market-analysis.js", "data/user-backtest-data.js", "data/v2-enhanced-weekly-data.csv",
  "config/data-source.example.json", "README.md", "LICENSE"
];

for (const file of requiredFiles) await readFile(resolve(root, file));

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(await readFile(resolve(root, "data/history-baked.js"), "utf8"), sandbox);
vm.runInContext(await readFile(resolve(root, "data/market-analysis.js"), "utf8"), sandbox);
vm.runInContext(await readFile(resolve(root, "data/user-backtest-data.js"), "utf8"), sandbox);

const history = sandbox.window.BAKED_HISTORY;
const marketAnalysis = sandbox.window.MARKET_ANALYSIS;
const backtest = sandbox.window.USER_BACKTEST;
const expectedCodes = ["000016", "000300", "000905", "000852", "399006", "000688"];
if (!history || !Array.isArray(history.dates) || history.dates.length < 24) throw new Error("历史周线少于24个共同交易周");
if (history.count !== history.dates.length) throw new Error("history.count 与 dates 长度不一致");
if (history.start !== history.dates[0] || history.asof !== history.dates.at(-1)) throw new Error("历史数据起止元数据不一致");
if (!String(history.adjust || "").includes("原始指数点位")) throw new Error("指数数据口径必须明确标注为原始指数点位");
if (history.weekState !== "rolling" && history.weekState !== "completed") throw new Error("weekState 必须为 rolling 或 completed");
if (!/^\d{4}-\d{2}-\d{2}$/.test(history.asofWeekEnd || "")) throw new Error("缺少 asofWeekEnd（该周周五）元数据");
if (typeof history.incompleteWeekIncluded !== "boolean") throw new Error("incompleteWeekIncluded 必须为布尔值");
{
  // 校验 asofWeekEnd 确为 asof 所在周的周五
  const anchor = new Date(`${history.asof}T12:00:00+08:00`);
  const diffToFriday = (5 - anchor.getUTCDay() + 7) % 7;
  anchor.setUTCDate(anchor.getUTCDate() + diffToFriday);
  if (anchor.toISOString().slice(0, 10) !== history.asofWeekEnd) throw new Error("asofWeekEnd 不是 asof 所在周的周五");
}
if (new Set(history.dates).size !== history.dates.length) throw new Error("历史数据日期重复");
for (const code of expectedCodes) {
  const rows = history.close?.[code];
  if (!Array.isArray(rows) || rows.length !== history.dates.length) throw new Error(`${code} 长度与共同日期不一致`);
  if (rows.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error(`${code} 含无效收盘价`);
}
if (!marketAnalysis || !Array.isArray(marketAnalysis.indices) || marketAnalysis.indices.length !== 7) throw new Error("市场分析指数快照必须包含7个指数");
if (!/^\d{4}-\d{2}-\d{2}$/.test(marketAnalysis.quoteDate || "")) throw new Error("市场分析缺少有效指数日期");
if (marketAnalysis.indices.some((item) => item.date !== marketAnalysis.quoteDate || !Number.isFinite(item.close) || item.close <= 0 || !Number.isFinite(item.changePct))) throw new Error("市场分析指数日期或数值无效");
if (!Array.isArray(marketAnalysis.news) || marketAnalysis.news.some((item) => !item.title || !item.source || !/^https:\/\//.test(item.url) || !/^\d{4}-\d{2}-\d{2}/.test(item.publishedAt))) throw new Error("市场分析新闻缺少标题、来源、日期或HTTPS原文链接");
if (!backtest || !Array.isArray(backtest.rows) || backtest.rows.length !== 187) throw new Error("V2静态样例必须恰好包含187周");
if (backtest.start !== "2023-01-02" || backtest.asof !== "2026-08-24") throw new Error("V2静态样例区间必须明确为2023-01-02至2026-08-24");
if (backtest.rows.some((row) => !Number.isFinite(row.nav) || row.nav <= 0)) throw new Error("样例回测净值无效");

const htmlFiles = ["project.html", "readme.html", "tianshi.html", "index.html"];
for (const file of htmlFiles) {
  const html = await readFile(resolve(root, file), "utf8");
  for (const match of html.matchAll(/(?:src|href)="([^"?#]+)[^"]*"/g)) {
    const rawTarget = match[1];
    if (/^(?:https?:|mailto:|data:|javascript:)/.test(rawTarget)) continue;
    const target = rawTarget.replace(/^\.\//, "");
    try { await readFile(resolve(root, target)); }
    catch { throw new Error(`${file} 引用了不存在的本地文件：${target}`); }
  }
}

const screenshotFiles = ["energy-console.png", "strategy-overview.png", "strategy-guide.png", "market-analysis.png", "performance.png"];
const screenshotHashes = new Set();
for (const file of screenshotFiles) {
  const content = await readFile(resolve(root, "assets/screenshots", file));
  if (content.length < 20_000) throw new Error(`${file} 文件异常小，可能是空白或损坏截图`);
  screenshotHashes.add(createHash("sha256").update(content).digest("hex"));
}
if (screenshotHashes.size !== screenshotFiles.length) throw new Error("项目截图存在重复文件，可能引用了错误内容");

console.log(`校验通过：${history.count} 个共同周（${history.weekState === "rolling" ? "滚动周·未收线" : "完成周"}，截至 ${history.asof}），${marketAnalysis.indices.length} 个指数快照，${marketAnalysis.news.length} 条可追溯新闻，${backtest.rows.length} 条静态样例回测记录，${requiredFiles.length} 个核心文件，${screenshotFiles.length} 张独立截图。`);
