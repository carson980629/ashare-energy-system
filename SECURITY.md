# Security Policy

## Supported version

仅维护默认分支的最新版本。

## Reporting

请通过 GitHub Security Advisory 私下报告安全问题，不要在公开 Issue 中披露敏感细节。

## Scope

项目默认不收集数据、不连接证券账户、不保存密钥，也不执行交易。请勿在配置文件中加入账户凭证；`config/data-source.json` 已被忽略。若接入需要鉴权的数据源，应使用环境变量或本机密钥管理，并确保生成的前端文件不包含秘密。

公开行情接口的中断、限流或数据错误属于供应链与数据质量风险，应在使用端设置缓存、校验和降级策略。
