# 数据接入说明

## 数据流

`config/data-source.json` 定义数据源与六只宽基，`scripts/update-data.mjs` 拉取周线、取共同交易日期、校验收盘价并生成 `data/history-baked.js`。浏览器只读取本地烘焙数据，不在页面运行时跨域请求行情。

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

## 样例回测数据

`data/user-backtest-data.js` 与 `data/v2-enhanced-weekly-data.csv` 是展示用样例。页面不会从市场周线重新生成这组 V2 净值，只按净值序列复算展示指标。若替换样例，应保持 `window.USER_BACKTEST` 字段契约并运行校验。

## 数据质量检查

```bash
node scripts/validate.mjs
```

校验覆盖核心文件、六宽基长度、日期唯一性、起止元数据、正收盘价、样例净值、本地资源引用与核心截图完整性。它不能替代供应商授权检查、接口稳定性监控或策略独立复算。

## 支持范围

- 开箱即用：Node.js 20+ + 可访问腾讯公开接口的网络环境，无需安装第三方包或申请密钥。
- 可配置：日期区间、是否保留未完成周、超时、输出路径和6个指数代码。
- 替换其他供应商：前端数据契约已公开，但当前脚本只内置 `tencent-fqkline` 适配器；接入其他供应商需要新增解析适配代码，不能只改 endpoint。
- 该公开接口无官方 SLA，可能被限流、改字段或停止服务。生产用途应换成获得授权且有稳定性承诺的数据源。
