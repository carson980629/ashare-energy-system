# 数据接入说明

## 数据流

`config/data-source.json` 定义数据源、六只宽基和市场分析更新配置。`scripts/update-data.mjs` 一次运行生成两份浏览器数据：`data/history-baked.js`（共同周线）与 `data/market-analysis.js`（7个指数收盘快照和可追溯新闻标题）。浏览器只读取本地烘焙数据，不在页面运行时跨域请求外部接口。

## 默认适配器

默认 `provider` 为 `tencent-fqkline`，使用腾讯公开行情接口。接口并非本项目维护，也没有官方 SLA，可能限流、调整字段或停止服务。生产用途应替换为获得授权的数据供应商。

接口周线数组按2026-08-27实际请求观测为：`[date, open, close, high, low, volume]`。脚本只使用日期和收盘价，并对格式、正数值和共同周数做检查。腾讯返回的最后一条可能是未完成的滚动周线，默认配置会在周一至周四以及周五15:05前剔除它。

## 配置字段

- `endpoint`：行情接口地址。
- `frequency`：默认 `week`。
- `adjust`：默认 `none`。当前6个标的是宽基指数，腾讯接口返回原始指数点位；指数不存在股票分红除权意义上的前复权。
- `includeIncompleteWeek`：默认 `false`。周一至周四以及周五收盘前更新时，剔除尚未完成的当周周线；设为 `true` 可保留滚动中的当周数据。
- `startDate` / `endDate`：请求区间，`endDate: auto` 使用 Asia/Shanghai 当天日期。
- `minimumCommonRows`：六个序列对齐后允许的最少共同周数。
- `timeoutMs`：单次请求超时。
- `output`：生成的浏览器数据文件。
- `symbols`：请求代码、内部代码和中文名称映射。
- `marketAnalysis.output`：市场分析浏览器数据输出路径。
- `marketAnalysis.quoteSymbols`：市场分析页展示的指数列表；默认7个主要指数。
- `marketAnalysis.newsLimit`：最多保留的新闻条数。
- `marketAnalysis.newsSources`：新闻适配器、来源名称和公开端点。默认使用中国政府网新闻发布JSON。

## 输出契约

生成文件设置 `window.BAKED_HISTORY`：

```js
{
  freq: "weekly",
  source: "...",
  provider: "...",
  adjust: "...",
  asof: "YYYY-MM-DD",
  start: "YYYY-MM-DD",
  count: 100,
  generatedAt: "ISO-8601",
  dates: ["YYYY-MM-DD"],
  close: { "000300": [1234.56] }
}
```

替换供应商时，只需生成同一契约，前端无需改动。

市场分析文件设置 `window.MARKET_ANALYSIS`，至少包含：

```js
{
  generatedAt: "ISO-8601",
  quoteSource: "...",
  quoteDate: "YYYY-MM-DD",
  indices: [{ code, name, date, close, changePct }],
  newsStatus: "updated | cached | unavailable",
  newsErrors: [],
  news: [{ title, url, publishedAt, source, sourceType }]
}
```

指数快照必须来自同一交易日。新闻只保存标题、HTTPS原文链接、发布时间与来源，不复制正文；新闻源失败时保留上次成功缓存并标记 `cached`。默认中国政府网源偏权威政策信息，不等同于盘中媒体快讯。若接入RSS或授权新闻API，需要新增对应解析适配器并遵守来源条款。

## 样例回测数据

`data/user-backtest-data.js` 与 `data/v2-enhanced-weekly-data.csv` 是静态展示样例，固定区间为2023-01-02至2026-08-24，共187周。页面不会从市场周线重新生成、延长或刷新这组V2净值和年度归因，只按既有净值序列复算展示指标。当前校验脚本会锁定该样例区间与记录数；若维护者主动替换样例，应同步修改契约、页面说明和校验规则，并独立审计生成链路。

## 数据质量检查

```bash
node scripts/validate.mjs
```

校验覆盖核心文件、六宽基长度、日期唯一性、起止元数据、正收盘价、7个指数快照的一致日期、新闻溯源字段、V2静态样例区间与记录数、本地资源引用及核心截图完整性。它不能替代供应商授权检查、接口稳定性监控、新闻事实核验或策略独立复算。

## 支持范围

- 开箱即用：Node.js 20+ + 可访问腾讯公开接口的网络环境，无需安装第三方包或申请密钥。
- 自动更新范围：六宽基周线、精力作息台市场状态、策略监测台市场诊断、内部对照回测、市场分析页7个指数快照、公开新闻标题和模型结构描述。
- 不自动更新：用户提供的V2静态样例净值与年度归因；固定截至2026-08-24。脚本也不会根据新闻标题生成投资观点或涨跌预测。
- 可配置：日期区间、是否保留未完成周、超时、输出路径、6个周线指数、市场分析指数和新闻来源。
- 替换其他供应商：前端数据契约已公开，但当前脚本只内置 `tencent-fqkline` 适配器；接入其他供应商需要新增解析适配代码，不能只改 endpoint。
- 该公开接口无官方 SLA，可能被限流、改字段或停止服务。生产用途应换成获得授权且有稳定性承诺的数据源。
