import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "project.html", "project.css", "tianshi.html", "index.html", "styles.css", "app.js",
  "data/history-baked.js", "data/user-backtest-data.js", "data/v2-enhanced-weekly-data.csv",
  "config/data-source.example.json", "README.md", "LICENSE"
];

for (const file of requiredFiles) await readFile(resolve(root, file));

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(await readFile(resolve(root, "data/history-baked.js"), "utf8"), sandbox);
vm.runInContext(await readFile(resolve(root, "data/user-backtest-data.js"), "utf8"), sandbox);

const history = sandbox.window.BAKED_HISTORY;
const backtest = sandbox.window.USER_BACKTEST;
const expectedCodes = ["000016", "000300", "000905", "000852", "399006", "000688"];
if (!history || !Array.isArray(history.dates) || history.dates.length < 24) throw new Error("历史周线少于24个共同交易周");
if (history.count !== history.dates.length) throw new Error("history.count 与 dates 长度不一致");
if (history.start !== history.dates[0] || history.asof !== history.dates.at(-1)) throw new Error("历史数据起止元数据不一致");
if (new Set(history.dates).size !== history.dates.length) throw new Error("历史数据日期重复");
for (const code of expectedCodes) {
  const rows = history.close?.[code];
  if (!Array.isArray(rows) || rows.length !== history.dates.length) throw new Error(`${code} 长度与共同日期不一致`);
  if (rows.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error(`${code} 含无效收盘价`);
}
if (!backtest || !Array.isArray(backtest.rows) || backtest.rows.length < 2) throw new Error("样例回测数据无效");
if (backtest.rows.some((row) => !Number.isFinite(row.nav) || row.nav <= 0)) throw new Error("样例回测净值无效");

const htmlFiles = ["project.html", "tianshi.html", "index.html"];
for (const file of htmlFiles) {
  const html = await readFile(resolve(root, file), "utf8");
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)[^\"]*"/g)) {
    const target = match[1].slice(2);
    if (/^https?:/.test(target) || target.endsWith(".md")) continue;
    try { await readFile(resolve(root, target)); }
    catch { throw new Error(`${file} 引用了不存在的本地文件：${target}`); }
  }
}

console.log(`校验通过：${history.count} 个共同周，${backtest.rows.length} 条样例回测记录，${requiredFiles.length} 个核心文件。`);
