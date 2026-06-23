# 开发文档中心

本文档中心面向新成员和模块开发者。目标是让一个标准企业中后台页面可以按固定路径完成：理解框架边界、补 API、补 Mock、接权限、写页面、写测试、跑发布门禁。

## 快速入口

- [新增 CRUD 页面指南](crud-page-guide.md)：从任务拆分到 API、Mock、路由、页面、权限和测试。
- [后端接入指南](backend-integration.md)：接口路径、响应结构、认证头、运行时配置和 Mock 对齐规则。
- [权限接入指南](permission-integration.md)：路由权限、菜单权限、按钮权限和服务端菜单约束。
- [发布 checklist](release-checklist.md)：提交、构建、验收、回滚和发布前检查。
- [Code review checklist](code-review-checklist.md)：Reviewer 合并前检查清单和暂缓合并标准。
- [风险等级说明](risk-levels.md)：P0-P3 风险分级、测试要求和回滚口径。

## 架构参考

- [认证与权限架构](../architecture/auth-permission.md)
- [部署说明](../deployment.md)
- [系统 CRUD 页面标准](../quality/system-crud-page-standard.md)
- [企业级任务清单](../quality/enterprise-admin-task-checklist.md)
- [能力地图](../architecture/enterprise-admin-capability-map.md)

## 标准开发顺序

1. 确认模块属于能力地图中的 MVP、增强能力或长期生态能力。
2. 在 `src/api` 定义类型和请求函数。
3. 在 `src/mock/modules` 增加同路径、同响应结构的 Mock 接口。
4. 在 `src/constants` 定义权限码。
5. 在 `src/router/routes/modules` 增加路由，并同步 `src/mock/seed.ts` 的服务端菜单。
6. 页面优先使用 `ProTable`、`ProForm`、`PermissionButton` 和字典组件。
7. 补单元测试，至少覆盖 API、Mock、路由菜单、权限按钮和核心页面交互。
8. 提交前运行发布 checklist。

## 本地验证命令

```bash
npm run lint:check
npm run typecheck
npm run test
npm run build:prd
```

涉及浏览器流程时，补充：

```bash
npm run test:e2e
```
