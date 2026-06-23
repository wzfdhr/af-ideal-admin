# Changelog

本项目遵循 Conventional Commits 和语义化版本策略。每个版本必须记录变更说明、迁移说明和验证结果。

## [Unreleased]

### 变更说明

- 后续变更先记录到这里，发布时再归档到具体版本。

### 迁移说明

- 无。

### 验证

- 发布前必须执行 `npm run lint:check`、`npm run typecheck`、`npm run test`、`npm run build:prd`。

## [0.0.1-alpha] - 2026-06-23

### 变更说明

- 建立企业级中后台框架基础能力：认证、权限、请求层、服务端菜单、系统管理 CRUD、表单设计器、流程设计器、低代码、大屏、报表、审计、可观测性、部署模板和开发文档中心。
- 建立 Mock-first 开发闭环，核心页面可在无后端环境下完成演示和单元测试。
- 建立 PR 模板、代码评审清单、风险等级说明和发布前 checklist。

### 迁移说明

- 当前版本为 alpha 基线版本，不保证与早期临时原型完全兼容。
- 接入真实后端时需要按 `docs/development/backend-integration.md` 对齐响应结构、认证头和服务端菜单 `componentKey`。
- 新增业务页面应按 `docs/development/crud-page-guide.md` 使用 Pro 组件、权限码和 Mock 数据闭环。

### 发布证据

- 版本号：`0.0.1-alpha`，与 `package.json` version 一致。
- Git tag：`v0.0.1-alpha`，正式发布时创建并指向 release 提交或合并提交。
- 验证证据：发布前必须保留 `npm run lint:check`、`npm run typecheck`、`npm run test`、`npm run build:prd` 的通过结果或 CI 链接。
- 回滚方式：优先 Git revert 对应 release 或阶段提交；运行时配置异常时恢复 `runtime-config.js` 或环境变量；菜单异常时临时关闭服务端菜单。

### 验证

- `npm run lint:check`
- `npm run typecheck`
- `npm run test`
- `npm run build:prd`
