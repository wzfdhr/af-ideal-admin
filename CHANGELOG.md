# Changelog

本项目遵循 Conventional Commits 和语义化版本策略。每个版本必须记录变更说明、迁移说明和验证结果。

## [Unreleased]

### 变更说明

- 后续变更先记录到这里，发布时再归档到具体版本。

### 迁移说明

- 无。

### 验证

- 发布前必须执行 `npm run lint:check`、`npm run typecheck`、`npm run test`、`npm run build:prd`。

## [0.1.0-alpha.1] - 2026-10-01

### 变更说明

- 新增 R1 请假审批：真实草稿、组合发布和不可变快照、两级串行审批、驳回/撤回/复制、站内通知、服务端审计、租户与资源授权。
- 补齐会话失效后输入恢复、路由过渡保护、发布节点定位、列表响应竞争防护及确认弹窗键盘焦点。
- 新增参考 API、PostgreSQL、worker、演示/试点 Compose、私有初始化、恢复演练和源码/镜像修订标识。

### 迁移说明

- Node 24.17.0/npm 11.13.0；单一 workspace lockfile，先 build:shared，再构建全部 workspace。Axios 1.20.0、Vitest 3.2.6。
- 新 API 相对 /api，沿用成功 code 20000；401/403/404/409/422、Idempotency-Key 和 expectedRevision 见技术方案及 packages/contracts/openapi.json。
- 真实参考服务需执行 001/002 PostgreSQL 迁移、配置独立凭据，并显式初始化；生产不加载浏览器 Mock，已有演示口令不能用于试点。
- 实例固定发布快照，活动版回滚不改在途记录；未知未来 Schema 拒绝。原 Mock 模块保留演示语义，未承诺全部模块有真实后端。

### 验证

- 已有阶段证据：425 前端单测、8 契约及7领域/Mock、37 真实数据库集成、3旧 smoke、15真实页面 E2E。
- 含真实响应丢失、并发命令、worker SIGKILL、双租户、多账号、错误恢复、双分辨率和键盘焦点。
- 候选版本镜像、独立试点及恢复复验已通过；本地试点包导出、摘要核对及镜像实际导入通过；未公开发布。

### 发布证据

- 版本号：0.1.0-alpha.1；本地候选版本，不是公开 release。
- Git tag：尚未公开发布或合并，因此未创建正式 tag。
- 验证证据：test-results/r1-mock、r1-ux、r1-pilot、r1-recovery；M2 实现提交 ce299d6。
- 回滚方式：保留卷及私有备份，回退兼容镜像，不自动执行破坏性 down migration；详见 docs/deployment/leave-approval-r1.md。
- 后端 / 运维配合：参考 API、worker、PostgreSQL、初始化凭据、迁移与备份；外部试点入口的 HTTPS 由部署环境配置。远端 CI 未执行，不记录虚构链接。

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
