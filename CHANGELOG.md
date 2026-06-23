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

### 验证

- `npm run lint:check`
- `npm run typecheck`
- `npm run test`
- `npm run build:prd`
