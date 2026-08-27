# Contributing

感谢对项目的改进。提交变更前请保持以下边界：

1. 不把投资建议、收益承诺或自动下单能力混入界面。
2. 新数据源必须说明授权、复权、时区、字段与失败行为。
3. 策略变更必须同步更新规则文档，并提供可复核样例或测试。
4. 涉及收益、回撤或基准的变更必须标注口径，不能只改展示数字。
5. 保持无构建依赖的默认运行方式；若引入工具链，需保留已编译静态产物。

提交前运行：

```bash
node --check app.js
node --check scripts/update-data.mjs
node --check scripts/validate.mjs
node scripts/validate.mjs
```

请在 Pull Request 中写明问题、实现、数据来源、验证结果和剩余风险。
