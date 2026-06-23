# 发布和版本管理规范

本文档对应 `T-503 建立发布和版本管理规范`，用于保证每次发布有可追踪版本号、变更说明、迁移说明和发布前验证结果。

## Conventional Commits

提交信息使用 Conventional Commits：

- `feat:` 新增用户可见能力。
- `fix:` 修复缺陷或行为回归。
- `docs:` 文档、规范、说明。
- `test:` 测试补充或测试修复。
- `refactor:` 不改变行为的结构调整。
- `chore:` 工程配置、依赖、脚本维护。
- `release:` 版本号、CHANGELOG 和发布元数据。

示例：

```text
feat: add audit log mock center
fix: keep server menu permission filtering stable
docs: add development documentation center
chore: update release metadata
release: 0.0.1-alpha
```

## 版本号策略

版本号遵循 SemVer，并允许 alpha 阶段预发布标识：

```text
MAJOR.MINOR.PATCH[-alpha.N]
```

- `MAJOR`：破坏性 API、权限模型、schema 或部署方式变化。
- `MINOR`：新增向后兼容的模块、页面、组件或 Mock 能力。
- `PATCH`：修复缺陷、补文档、补测试、低风险兼容调整。
- `alpha`：产品化前的内部验证版本。当前 `0.0.1-alpha` 是企业级框架基线版本。

发布时必须同步：

- `package.json` 的 `version`。
- `CHANGELOG.md` 中的版本条目。
- 需要时补充迁移说明和后端/运维配合项。

## Changelog 规则

`CHANGELOG.md` 保留 `Unreleased` 区域，新变更先写入 `Unreleased`。正式发布时：

1. 将 `Unreleased` 内容复制到新版本标题下。
2. 标题格式为 `## [version] - YYYY-MM-DD`。
3. 每个版本必须包含 `变更说明`、`迁移说明`、`验证`。
4. 没有迁移动作时写 `无`，不能留空。

## 发布前验证流程

发布前必须执行：

```bash
npm run lint:check
npm run typecheck
npm run test
npm run build:prd
```

涉及浏览器完整链路、登录、权限、菜单或部署行为时，补充：

```bash
npm run test:e2e
```

验证结果必须写入 PR 模板或发布说明。任何失败都必须修复或明确标注为阻塞，不能带失败项发布。

## 发布证据记录模板

每个正式版本必须在 `CHANGELOG.md` 的当前版本条目中补齐发布证据；PR 描述或发布说明中也必须保留同等信息，确保版本号、源码、验证结果和回滚方式可以互相追溯。

| 字段 | 企业级要求 |
| --- | --- |
| 版本号 | 与 `package.json` 的 `version` 完全一致，不允许只写口头版本。 |
| Git tag | 使用 `v<version>`，例如 `v0.0.1-alpha`，并指向对应 release 提交或合并提交。 |
| 变更说明 | 按业务能力、工程治理、Mock 交互、文档规范分类记录用户可感知变化。 |
| 迁移说明 | 说明接口、权限码、schema、运行时配置、菜单数据和后端配合项；无迁移时写 `无`。 |
| 验证证据 | 记录 `npm run lint:check`、`npm run typecheck`、`npm run test`、`npm run build:prd` 的通过结果或 CI 链接。 |
| 回滚方式 | 写明 Git revert、关闭菜单入口、恢复运行时配置、回退 schema 或停用 Mock 数据的可执行步骤。 |
| 后端 / 运维配合 | 标明是否需要接口发布、权限初始化、环境变量、CDN、Nginx 或灰度配置配合。 |

## 发布步骤

1. 确认工作区干净，远端分支已同步。
2. 确认 PR 模板中的变更范围、验证命令、风险等级、回滚方式已填写。
3. 更新 `package.json` 的版本号。
4. 更新 `CHANGELOG.md`，补齐变更说明和迁移说明。
5. 运行发布前验证流程。
6. 使用 `release:` 提交版本元数据。
7. 合并后创建 Git tag，tag 名称使用 `v<version>`。

## 回滚策略

- 代码发布失败：优先 Git revert 对应 release 或功能提交。
- 运行时配置错误：回滚 `runtime-config.js` 或部署环境变量。
- 服务端菜单异常：临时关闭 `menuFromServer`，回到本地路由菜单。
- 权限码异常：先下线菜单入口和按钮，再回滚接口行为。
- schema 迁移异常：停止发布，保留旧版本 schema，并补迁移测试后重发。
