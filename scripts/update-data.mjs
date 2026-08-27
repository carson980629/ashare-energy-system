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

function shanghaiDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function validateConfig(config) {
  if (config.provider !== "tencent-fqkline") throw new Error(`不支持的数据源：${config.provider}`);
  if (!Array.isArray(config.symbols) || config.symbols.length !== 6) throw new Error("symbols 必须恰好包含6只宽基");
  const codes = new Set(config.symbols.map((item) => item.code));
  if (codes.size !== config.symbols.length) throw new Error("symbols.code 存在重复");
}

async function fetchSymbol(config, symbol, endDate) {
  const param = [symbol.requestCode, config.frequency, config.startDate, endDate, 1000, config.adjust].join(",");
  const url = new URL(config.endpoint);
  url.searchParams.set("param", param);
  const response = await fetch(url, { signal: AbortSignal.timeout(config.timeoutMs || 15000) });
  if (!response.ok) throw new Error(`${symbol.name} 请求失败：HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(`${symbol.name} 接口返回错误：${payload.msg || payload.code}`);
  const node = payload.data?.[symbol.requestCode];
  const rows = node?.[config.frequency] || node?.qfqweek || node?.week;
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${symbol.name} 未返回周线数据`);
  return rows.map((row) => {
    const close = Number(row[2]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row[0]) || !Number.isFinite(close) || close <= 0) {
      throw new Error(`${symbol.name} 含无效记录：${JSON.stringify(row)}`);
    }
    return { date: row[0], close };
  });
}

function align(series, symbols, minimumCommonRows) {
  const dateSets = symbols.map((symbol) => new Set(series[symbol.code].map((row) => row.date)));
  const commonDates = [...dateSets[0]].filter((date) => dateSets.every((set) => set.has(date))).sort();
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
const entries = await Promise.all(config.symbols.map(async (symbol) => [symbol.code, await fetchSymbol(config, symbol, endDate)]));
const aligned = align(Object.fromEntries(entries), config.symbols, config.minimumCommonRows || 24);
const artifact = {
  freq: "weekly",
  source: "腾讯行情公开接口·宽基指数周线",
  provider: config.provider,
  adjust: `前复权(${config.adjust})`,
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
