# 发布 Checklist

本 checklist 用于每个阶段提交、合并和发布前确认。它覆盖代码质量、Mock 演示、权限、安全、文档和回滚。

## 提交前

- 工作区只包含本阶段相关文件。
- 没有提交 `dist`、压缩包、依赖目录、临时日志或敏感信息，并符合 [仓库卫生规范](repository-hygiene.md)。
- 新功能已补 API、Mock、页面、路由、菜单和测试。
- 关键行为已有失败过的回归测试。

## 必跑命令

```bash
npm run lint:check
npm run typecheck
npm run test
npm run build:prd
```

涉及浏览器完整链路时，补充：

```bash
npm run test:e2e
```

## 版本号与发布证据

- `package.json` version 已与计划发布版本完全一致。
- `CHANGELOG.md` 当前版本条目已包含变更说明、迁移说明和发布证据。
- Git tag 使用 `v<version>` 命名，并在正式发布后指向对应 release 提交或合并提交。
- 验证证据已记录命令结果或 CI 链接，失败项不得进入发布。
- 后端、运维、权限初始化、运行时配置和 Mock 数据切换要求已明确为需要或不需要。

## 功能验收

- Mock 数据可完成无后端演示。
- 页面有 loading、空状态、错误态和权限态。
- 新增菜单在本地路由和服务端菜单 Mock 中一致。
- 权限码覆盖路由、菜单和按钮。
- 接口契约与 `src/api` 类型一致。

## 安全检查

- 不提交 token、密码、Authorization、身份证号等敏感信息。
- 审计日志、错误上报和 Mock 数据都必须脱敏。
- 后端菜单只返回 `componentKey`，不返回任意组件路径或脚本。
- 生产配置通过 `runtime-config.js` 或环境变量注入，不硬编码服务地址。

## 发布说明

每次阶段发布至少记录：

- 变更范围。
- 验证命令和结果。
- 风险点。
- 回滚方式。
- `CHANGELOG.md` 中的变更说明和迁移说明。
- 是否需要后端接口、权限码或部署配置配合。

正式版本发布还必须按 [发布和版本管理规范](release-management.md)
同步 `package.json` 版本号、`CHANGELOG.md` 和 release 提交。

## 回滚策略

- 前端代码通过 Git revert 回滚阶段提交。
- 运行时 API 前缀和标题通过 `runtime-config.js` 回滚。
- 服务端菜单异常时可临时关闭 `menuFromServer`，回到本地路由菜单。
- 新权限码上线失败时，优先回滚菜单入口和按钮展示，再回滚 API 行为。
