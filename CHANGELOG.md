# Changelog

本项目遵循 Conventional Commits 和语义化版本策略。每个版本必须记录变更说明、迁移说明和验证结果。

## [Unreleased]

### 变更说明

- 参考后端新增本人审批转交、失权待办恢复及实际下一节点的实例级分配覆盖；原流程快照、签署票位和会签阈值保持固定。
- 审批中心按独立待办/恢复权限加载对应页面，修复普通主管误加载演示配置接口导致403跳转；通用业务通知由真实worker投递并去重。
- 新增v4定时等待与审批/会签期限提醒，持久计划、租约、一次效果、失权恢复及独立定时权限；设计、发布、运行和跨租户应用包使用同一配置。自动事实明确标记调度服务，不替代人类审批。
- 新增真实低代码页面：闭合v2配置、应用/字典受控来源、五种实际动作、不可变发布版/稳定灰度/回退，以及复用公共业务保存和审批的管理页生成。修复已发布业务目录超过100项后不可选择后续应用。

- 新增v3页面应用包：包内来源符号、目标业务发布后重绑、独立页面草稿与人工发布、即时撤权和事务回滚。人员/登记来源目录可完整分页读取，生成的页面可按实际ID直接重开。

### 迁移说明

- 全产品开发分支新增018工作流分配迁移及 `workflow:transfer/workflow:recover` 权限，保留001至017校验和。新增API、关闭入口和兼容回退规则见 `docs/architecture/full-product-workflow-recovery-design.md`；原R1交付包不随本增量改变。
- 新增019流程定时迁移、`workflow:timer:read/workflow:timer:retry`权限和`timed-workflow`包依赖，保留001至018校验和。HistoryRecord.operatorId可为空以表达系统事实；新客户端应兼容。v4实例的服务回退和定时恢复边界见 `docs/architecture/full-product-workflow-scheduling-design.md`。
- 新增020低代码来源/页面/发布迁移和low-code:page/source权限。原v1只用于显式Mock，真实v2拒绝未来v3及任意URL/脚本；原业务API保持，已发布业务目录增加分页，客户端完整读取。能力边界、固定来源及恢复/回退见 `docs/architecture/full-product-low-code-runtime-design.md`。

- 新增021待重绑页面集合与不可变映射事实，保留001至020；v1/v2兼容，v3声明页面/来源/受控物料依赖，包大小按UTF-8字节限制。迁移、权限、独立恢复及兼容回退见 `docs/architecture/full-product-page-package-design.md`。

### 验证

- 发布前必须执行 `npm run lint:check`、`npm run typecheck`、`npm run test`、`npm run build:prd`。
- 当前增量的真实数据库、浏览器、并发/重启及对应提交CI证据见 `docs/quality/full-product-delivery-tasks.md`；本栏为未发布开发能力，最终全产品交付门禁保持开放。

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
