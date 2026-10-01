# 请假审批应用闭环技术方案

本文面向 AF-Ideal-Admin 的前端、后端、测试和交付人员，定义从现有框架到首个可持久化、可审批、可部署业务应用的实施方案。第一交付目标是请假审批应用，后续以相同基础扩展应用模板、低代码和 AI 辅助配置。

- 编制日期：2026-10-01。
- 评估基线：`framework / 7194f59`，依据当前文档和源码阅读。
- 状态：实施中。本文中的新增目录、接口、模型和命令均为设计，不表示功能已经实现。
- 配套执行入口：[任务清单与验收用例](../quality/leave-approval-delivery-tasks.md)。
- 实施证据见 [R1 实施记录](../collaboration/2026-10-01-leave-approval-implementation.md)；仅在完整验收后声明可试点交付。

## 1 产品目标与交付范围

首批面向企业项目交付团队和内部开发人员。业务人员使用工作台、我的申请和审批待办；实施人员配置表单、流程和发布版本；管理员管理组织、权限、租户和审计。

第一版业务路径：管理员配置并发布请假应用，员工填写和保存草稿，提交后主管审批或驳回，员工查看结果，授权人员查询业务审计。刷新、关闭浏览器重开和服务重启后，已提交的数据保持一致。

| 版本 | 纳入范围 | 后续再建设 |
| --- | --- | --- |
| R1 首个业务闭环 | 请假表单、串行审批、驳回、撤回、我的申请、待办已办、站内消息、服务端审计、两个租户隔离、真实数据库、部署和恢复 | 复杂会签、条件表达式、转交、任意脚本、通用应用市场 |
| R2 应用交付能力 | 应用中心、低代码业务动作、受控数据绑定、模板复制与导入导出、真实附件、发布回滚 | 插件市场、复杂报表调度、多端自由布局 |
| R3 增强能力 | AI 生成可编辑配置、业务模板扩充、按客户需求接复杂流程引擎和调度器 | 由需求及验收成本决定，不作为 R1 前置条件 |

R1 请假字段固定为申请人、部门、请假类型、开始日期及上午/下午、结束日期及上午/下午、事由。申请人和部门由服务端身份确定。首版按自然日的半日单位计算，单次最多 366 天，不接考勤、节假日、假期余额和工资规则；发布说明必须明确此边界。真实附件列入 R2，首版界面不展示不可用的上传入口。

## 2 当前实现与主要差距

| 当前依据 | 已有能力 | 本轮需要补足 |
| --- | --- | --- |
| `src/services/access.ts`、`src/api/request-client.ts` | 统一访问判断和错误处理 | 服务端资源授权、租户隔离、幂等与冲突反馈 |
| `src/components/form-designer/`、`src/mock/modules/form-designer.ts` | Schema、迁移、导入导出、保存发布接口；Mock 以内存保存 | 数据库持久化、草稿冲突检测、固定发布版本 |
| `src/mock/modules/workflow.ts` | 发起、任务状态和历史记录 | 按连线推进、实例结束、撤回取消待办、并发控制 |
| `src/components/low-code/builder/index.vue` | 物料、保存、发布、查询与刷新 | 提交、跳转、弹窗和权限执行；安排在 R2 |
| `src/views/tenant/center/index.vue` | 当前页面的租户切换和上下文显示 | 全局上下文、缓存失效、切换中的旧响应隔离 |
| `src/views/dashboard/workplace/widgets/todo-panel.vue` | 固定待办示例 | 真实待办、详情跳转和操作后刷新 |
| `tests/e2e/auth-permission.spec.ts` | 3 条登录与权限测试 | 多账号业务链路、持久化、并发和跨租户测试 |
| `.nvmrc`、CI、Dockerfile | npm、CI、镜像构建 | Node 20 与 Docker Node 18 不一致，统一受支持版本 |

保留 Vue、Pinia、Arco、ProTable、ProForm、现有路由和请求体系。`aheart-ui` 仍按现有治理文件验证，R1 不以替换组件库为条件。现有文档中的“企业级基线完成”不等于本方案的真实业务验收已完成。

## 3 架构与技术选择

方案采用现有前端加独立参考 API 服务，服务端使用 TypeScript、Fastify 和 PostgreSQL 16。这是本方案的默认技术决策，不是当前已安装依赖；实施时冻结兼容版本和镜像摘要。Node 以 24 LTS 为升级目标，先验证现有工具链，再更新本地、CI、Docker 和文档。Node 的维护状态以[官方版本表](https://nodejs.org/en/about/previous-releases)为准。

参考后端负责身份适配、请假业务、工作流运行、持久化、消息和审计。客户可按相同契约接入 Java、.NET 或其他后端；前端不承载可信业务状态，客户业务数据和授权规则留在客户系统。R1 不引入消息中间件和独立微服务集群。

```text
Vue 页面及设计器
       │ 请求、权限反馈、租户上下文
       ▼
参考 API 服务或客户后端适配
       │ 身份与资源授权 → 业务命令 → 数据库事务
       ├── 工作流领域核心：校验、节点推进、状态转换
       ├── PostgreSQL：草稿、发布版本、申请、任务、审计
       └── Outbox worker：站内消息投递及失败重试

开发 Mock → 复用契约和领域核心，用于快速开发与故障模拟
```

推荐新增结构如下，保留根目录前端的位置，通过 npm workspaces 使用一份根 lockfile：

```text
packages/contracts/                 # DTO、开发者定义的校验规则、错误码
packages/workflow-core/             # 纯领域逻辑，无 Vue、HTTP、数据库依赖
services/reference-api/
  src/modules/auth/                # 会话、成员资格、权限
  src/modules/tenant/              # 租户上下文
  src/modules/application/         # R1 最小应用清单与发布服务
  src/modules/leave/               # 申请与校验
  src/modules/workflow/            # 命令编排与持久化
  src/modules/notification/        # Outbox 与站内消息
  src/modules/audit/               # 服务端事实审计
  migrations/                     # 可版本化 SQL 迁移
src/api/leave.ts                    # 请假 API
src/store/modules/tenant.ts         # 全局租户状态
src/views/leave/                    # 我的申请、新建、详情
tests/integration/                 # 真实 API 与 PostgreSQL 测试
tests/e2e/leave-approval.spec.ts     # 多账号操作
deploy/compose/                    # 演示和试点部署配置
```

共享包提供构建产物及声明文件，不要求现有 Vue 类型检查器直接编译服务端源文件。前端沿用 jsdom；领域核心和 API 测试使用独立 Node 环境，避免根 Vitest 默认收集所有 workspace 测试。

API DTO 校验由开发者编写并版本化。用户提交的表单和流程 Schema 作为受限数据进行白名单解释，禁止直接作为 Fastify 动态路由校验器编译。[Fastify 官方说明](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)明确提醒其 Schema 编译机制不适用于不可信用户定义。

## 4 三种运行模式

| 模式 | 数据来源 | 用途 | 可证明的结果 |
| --- | --- | --- | --- |
| 开发 Mock | 内存种子、可控时钟和故障场景 | 组件开发、契约测试、空态和错误态 | 页面与领域逻辑行为，不证明持久化和并发 |
| 持久化演示 | 参考 API 加 PostgreSQL，演示种子可显式重置 | 多账号演示、完整验收 | 跨会话、重启持久化及参考后端行为 |
| 试点或正式接入 | 客户后端或加固后的参考 API | 试点交付 | 指定部署环境中的业务及授权结果 |

生产前端不加载浏览器 Mock。演示环境也使用生产前端构建，通过 API 地址连接演示服务。登录页标明演示环境；重置入口只存在于显式开启的演示服务，正式部署不注册该路由。种子仅在初始化或显式重置时执行，重启不能覆盖数据库。

业务命令不能失败后自动回退到 Mock。所有环境必须保持相同的响应、错误及权限语义。R1 不另做一套 IndexedDB 持久化，以免同时维护两种跨会话状态模型。

## 5 数据模型与版本规则

业务数据均有 `tenant_id`、主键、创建时间、更新时间；可变记录有 `revision`。时间戳存储 UTC，日期型请假字段保留业务日期，日历解释使用租户时区，默认 Asia/Shanghai。下表为逻辑模型，字段类型、索引和迁移在 LA-010 落地。

| 实体 | 关键字段 | 约束 |
| --- | --- | --- |
| Tenant、User、Membership | tenantId、userId、departmentId、permissions、status | 用户跨租户访问必须有启用的成员关系 |
| Session | tokenHash、userId、expiresAt、revokedAt | 服务端可过期及撤销，不存明文 token |
| Application | id、code、name、activeReleaseId、revision | R1 仅请假应用，code 在租户内唯一 |
| FormDraft、WorkflowDraft | id、schemaVersion、schema、revision | 编辑用乐观锁，不覆盖并发修改 |
| ApplicationRelease | appId、releaseVersion、formSnapshot、workflowSnapshot、contentHash、publishedBy | 发布后不可变，租户内 appId 与版本唯一 |
| LeaveRequest | applicationReleaseId、applicantId、departmentSnapshot、leaveType、dateSlots、halfDayUnits、reason、status、revision、previousRequestId | 申请人和时长由服务端确认；终态只读 |
| WorkflowInstance | requestId、releaseId、status、currentNodeId、revision | R1 每个申请最多一个实例 |
| WorkflowTask | instanceId、nodeId、assigneeId、status、revision、completedAt | R1 同一实例同一节点只创建一次任务 |
| WorkflowHistory | instanceId、taskId、action、operatorId、comment、sequence | 追加记录，sequence 在实例内唯一 |
| AuditEvent | actorId、tenantId、target、action、result、traceId、occurredAt | 服务端事实来源；不记录完整请假事由和 token |
| Outbox、Notification | eventId、recipientId、status、attempts、nextAttemptAt | 通知以 eventId 与 recipientId 唯一去重 |
| IdempotencyRecord | tenantId、actorId、operation、key、requestHash、response | 作用域内唯一，保存与业务事务一致的结果 |

关联采用包含 `tenant_id` 的组合外键或等效数据库约束；不能仅靠前端过滤。查询索引至少覆盖申请人的列表、审批人的待办、实例历史、Outbox 下次重试时间。R1 用迁移 SQL 和参数化查询实现，事务只使用同一数据库连接。

三个版本概念分别处理：`schemaVersion` 是配置格式版本；`revision` 是可变记录的并发控制版本；`releaseVersion` 是业务发布版本。已有 Schema 中的 `version` 经适配映射到格式版本，已有记录的 `version` 不能直接当作新的不可变发布编号。

发布事务校验表单和流程，生成包含两个完整快照的 ApplicationRelease，最后更新应用活动指针。草稿创建时绑定活动发布版；若草稿编辑期间活动版本改变，提交返回版本过期提示，用户预览迁移并确认后重新绑定，不静默替换配置。已提交实例始终使用原快照。

发布回滚只改变后续新申请使用的活动版本，并增加审计事件，不修改历史版本和在途实例。演示种子迁移需要给旧版本生成明确发布记录；未来格式版本拒绝导入，不能降级丢弃字段后假装成功。

## 6 业务规则和流程状态机

R1 可执行节点限于开始、审批、抄送和结束。允许多个串行审批节点，每个节点一个明确审批人。发布校验要求单开始、单结束、全部节点可达、无环、审批节点恰有一个出边、无条件或并行节点、无失效的表单和人员引用。现有设计器可以保留高级节点编辑，但发布到 R1 运行时必须拒绝并说明不支持的节点。

申请状态：`draft → running → approved / rejected / withdrawn`。驳回和撤回后可“复制为新申请”，新记录带 previousRequestId，原记录及其历史保持不变；R1 不实现同一实例退回重提。流程实例对应 `running / completed / rejected / withdrawn`，任务对应 `pending / approved / rejected / cancelled`。

| 命令 | 前置条件 | 同一事务内的变化 |
| --- | --- | --- |
| 保存草稿 | 本人、draft、revision 一致 | 更新字段并增加 revision |
| 提交 | 本人、draft、有效发布版、表单合法、审批人有效且非本人 | 申请 running、创建实例与首个待办、历史、审计和 Outbox |
| 通过 | 本租户当前任务处理人、pending、实例 running | 任务 approved，沿连线推进；到下个审批创建任务，到结束置实例 completed 和申请 approved |
| 驳回 | 同上且必须有意见 | 任务 rejected，实例与申请 rejected，取消残留待办 |
| 撤回 | 发起人、申请 running、实例 running | 实例与申请 withdrawn，所有 pending 任务 cancelled |
| 抄送 | 推进到抄送节点 | 写 Outbox 后继续推进，不等待接收人阅读 |

请假类型白名单、必填、日期顺序、最大文本长度、半日时长均在服务端复验。半日单位按起止日期和上午/下午计算，首版计入周末；不得相信前端提交的申请人、部门、时长或终态。是否扣假期余额不在 R1 范围。

发布和提交时检查审批人有效；审批人运行中被停用时，前端显示不可处理原因并通知管理员。R1 恢复方式为管理员恢复原处理人的有效身份，或发起人撤回后重新申请，不允许直接改库强行完成。

### 6.1 并发与幂等

提交、审批、驳回、撤回、发布和回滚携带 `Idempotency-Key`，可变记录另携带 `expectedRevision`。相同用户、租户、操作、key 和请求体重放返回原结果；同 key 不同请求体返回 409。权限和成员资格仍需先校验，重放不能绕过撤权。

数据库中按固定顺序锁定申请、实例、任务，再检查状态和版本。首次提交锁定草稿，并用 requestId 唯一约束防止创建第二个实例。冲突失败回滚整笔事务，不在前端重试后强行覆盖。PostgreSQL 的行锁语义参考[官方锁机制文档](https://www.postgresql.org/docs/current/explicit-locking.html)。

当审批与撤回并发时，只允许一个命令先提交；后到者读取最新版本后返回 409。前端保留意见，提示刷新确认，不自动重新执行审批。因响应丢失重试时复用原 key。幂等记录首版保留至少 7 天，超过保留期仍由状态和唯一约束阻止重复生效。

业务更新、历史、成功审计及 Outbox 写入同一事务。拒绝访问等失败审计另行记录，不回滚成功业务。Outbox worker 使用有限批次、领取超时和重试退避；崩溃后可重新领取，超出重试上限进入失败列表。通知依靠唯一键幂等写入，不把“消息暂未送达”显示为“审批失败”。

## 7 API 契约

以下路径均相对 `/api`。保留现有 `code: 20000` 成功包裹和分页 `{ list, total }`，新增 DTO 集中管理。401 为会话失效，403 为当前租户内已知功能无权操作，跨租户或不可见资源统一返回 404，409 为版本、状态或幂等冲突，422 为字段校验失败。错误包含稳定业务码、可读 message、traceId 和字段 errors。

| 方法与路径 | 用途 | 关键输入或输出 |
| --- | --- | --- |
| POST `/user/login`、GET/POST `/user/info`、POST `/user/logout` | 兼容现有认证 | token、用户、permissions、可访问租户 |
| GET/POST `/user/menu` | 保持服务端菜单模式可接入 | 白名单 componentKey、权限码，不返回脚本 |
| GET `/tenants`、GET `/tenants/:id/context` | 租户列表与上下文 | 本人成员租户、组织和权限版本 |
| POST `/tenants/switch` | 校验目标租户并返回上下文 | tenantId；租户、权限和菜单所需信息 |
| GET `/applications/:id` | R1 请假应用入口 | 当前发布版、允许操作 |
| POST `/applications/:id/releases` | 原子发布表单和流程 | formDraftId、workflowDraftId、双方 revision、应用 revision |
| POST `/applications/:id/activate-release` | 发布回滚或启用指定版 | releaseId、expectedRevision |
| GET/POST `/form-schemas`、GET/PUT `/form-schemas/:id` | 延续设计器保存与读取 | schema、expectedRevision |
| GET/POST `/workflows`、GET/PUT `/workflows/:id` | 延续流程草稿管理 | schema、expectedRevision |
| POST `/leave-requests`、PATCH `/leave-requests/:id` | 建草稿、保存 | 字段、发布版、expectedRevision |
| GET `/leave-requests`、GET `/leave-requests/:id` | 我的申请、授权详情 | 分页、状态、申请快照、可用操作 |
| POST `/leave-requests/:id/submit` | 原子提交并启动流程 | expectedRevision；返回申请和 instanceId |
| GET `/workflow-todos`、GET `/workflow-done` | 当前用户待办已办 | 关联申请摘要、任务 revision |
| POST `/workflow-tasks/:id/approve`、POST `/workflow-tasks/:id/reject` | 审批 | comment、expectedRevision；返回任务、实例和申请状态 |
| POST `/workflow-instances/:id/withdraw` | 撤回 | comment、expectedRevision |
| GET `/workflow-instances/:id/history` | 时间线 | 有序历史及关联状态 |
| GET `/messages/notifications`、POST `/messages/notifications/:id/read` | 结果通知与已读 | 受控站内业务路由 |
| GET `/audit/events` | 授权审计查询 | 操作者、对象、时间、traceId |

客户端 DTO 中的 tenantId 或 X-Tenant-Id 都只表达请求上下文；后端按会话成员资格验证。R1 参考服务采用可撤销的不透明会话 token，兼容现有 X-Access-Token 注入；密码采用受支持的密码哈希实现，登录设置速率限制，会话到期后重新登录。SSO 和 cookie 模式通过后续 AuthProvider 适配，不在前端保存模型或后端服务密钥。

旧接口分阶段兼容：现有单表单/单流程发布继续服务原演示功能；请假应用必须调用组合发布接口，不能拼接两个最新版本。现有 `/form-runtime/:id/submit` 可用于表单预览；正式请假提交只走新业务端点，避免先保存表单再发起流程造成半成功。旧 `/workflow-instances` 通用发起接口在参考后端不得绕过请假业务事务，针对请假应用返回明确拒绝并指向业务提交入口。所有引用旧实例与任务状态的页面同步更新并补迁移测试。

前端请求层保留全局 401 处理，增加可供页面消费的字段错误和 409 冲突；不把业务冲突统一跳转登录或吞成普通网络异常。

## 8 权限与租户上下文

| 使用身份 | 示例权限 | 数据范围 |
| --- | --- | --- |
| 员工 | `leave:read:self`、`leave:create`、`leave:update:self`、`leave:submit`、`leave:withdraw:self` | 本人申请及关联流程 |
| 主管 | 员工权限、`workflow:todo`、`workflow:approve`、`workflow:reject` | 当前分配的任务和审批所需申请；历史范围按参与记录 |
| 配置管理员 | `application:configure`、`application:publish`、`application:rollback` | 当前租户的配置；不因配置权限自动获得请假事由访问权 |
| 审计员 | `audit:read` | 当前租户脱敏事件；无审批权 |

上述身份是业务权限组合，不依赖前端硬编码新增 role 字符串。当前 UserRole 与 MockRole 的类型差异先通过迁移测试统一；Mock 的 `*` 权限也不能在真实后端跳过租户边界。对象归属、处理人和当前状态逐请求校验，参考 [OWASP 授权指南](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)。

租户选择采用标签页独立上下文，避免一个标签页改变另一个标签页的业务对象。切换前处理未保存草稿；验证目标租户后，暂停写入、递增上下文代次、取消旧请求、清除业务与菜单缓存并重建权限。旧请求即使迟到，也不能写入新租户状态；切换失败保留原上下文。

查询条件必须有服务端验证的 tenantId；资源关联、消息、审计、导出和未来文件访问沿用同一规则。组件权限决定操作入口，服务端决定实际授权。已撤销角色、停用租户和过期会话的后续请求必须即时拒绝。

## 9 前端交互与配置体验

R1 增加“我的申请”和“审批待办”入口，复用现有工作流运行页面和表单运行时，避免再建一套状态来源。请假详情包含当前状态、申请内容、处理意见和时间线；工作台点击待办进入同一详情。列表和详情都显示 loading、空态、错误态及重试。

编辑页显示保存状态和最后保存时间，离开未保存页时提醒。保存失败保留输入，冲突提示比较或重新加载；提交、发布、撤回和审批期间禁用重复动作，最终防重仍由服务端完成。驳回意见必填。消息链接只能指向白名单站内路由，详情打开时重新鉴权。

R1 为请假应用提供最小发布面板：选择表单及流程草稿、显示校验结果、发布版本和回滚目标。完整应用中心、模板复制和低代码页面生成属于 R2，不能成为首个闭环的隐性前置工程。

R2 低代码动作采用 action registry，明确 query、submit、navigate、openModal、refreshBlock 的输入、结果、权限和目标。数据源以服务端登记 key 解析，不接受任意外部 URL 或脚本。导出包仅包含 Schema、依赖清单和迁移信息，不包含 token、用户隐私或业务生产数据。

## 10 测试与验收

测试证据分五类保存：领域单测、API 契约与数据库集成、多账号浏览器操作、部署持久化恢复、界面及键盘检查。任何单类通过都不替代其他类别。

关键用例及期望结果见配套清单 AC-01 至 AC-20。数据库集成测试必须用真实 PostgreSQL，幂等和并发至少覆盖两个独立请求同时处理同一对象；Browser E2E 必须连接参考 API，不能用 page.route 注入成功响应作为真实业务证据。

所有 R1 写操作至少验证成功、无权限、跨租户、非法状态、revision 冲突和幂等重试。持久化验证包括刷新、关闭重开、API 重启和数据库容器重启保留卷；另执行一次备份恢复到新库的核对。终态、历史、消息和审计关联必须一致。

现有检查继续保留：`npm run lint:check`、`npm run typecheck`、`npm run test`、`npm run build:prd`、`npm run test:e2e`。拟新增 `typecheck:all`、`test:contracts`、`test:integration`、`test:e2e:real` 和 `build:all`，在 LA-034 中实现后才可作为可执行命令引用。全 workspace 类型检查及构建必须覆盖服务端与共享包。

验收报告记录提交 SHA、运行版本、测试环境、种子版本、账号权限、操作步骤、结果、截图或 trace、未解决问题及回滚方式。测试产物放现有忽略目录 `test-results/`，在 CI 归档；仓库只提交精简报告及证据引用。

## 11 部署与回滚

交付单元是前端 Nginx、参考 API、worker 和 PostgreSQL。API 与 worker 可用同一镜像不同入口；演示 profile 提供显式种子和重置，试点 profile 使用独立凭据且关闭重置。补健康检查、readiness、迁移任务、持久卷、日志关联及服务重启验证。

首次部署流程为配置密钥、启动数据库、执行迁移、显式初始化、启动服务、执行 smoke。参考账号仅在演示环境提供；试点管理员在初始化时创建，不能沿用公开演示口令。

数据库变更先增字段和兼容读取，再迁移数据，最后在后续版本清理。应用回滚优先恢复上一镜像及兼容配置，不能自动运行破坏性 down migration。备份恢复到独立实例验证后再切换，保留恢复期间新写入的处理记录，避免直接覆盖有效数据。

## 12 与现有路线图的关系

本方案追加 LA 编号，不改写原 T 编号的历史状态。

| 原任务 | 本方案安排 |
| --- | --- |
| T-602、T-603 | 请假场景、双租户和多账号种子、稳定演示路径 |
| T-605、T-607 | 前移为 R1，提供真实持久化后端及部署样板 |
| T-608、T-609 | 前移为 R1，限定为该业务路径的租户隔离与表单流程联动 |
| T-614、T-615 | R1 归档质量证据、部署和恢复说明；完整商业包后续扩展 |
| T-610 | R2 低代码动作及应用交付能力 |
| T-611、T-612、T-613 | 后置，按真实需求分别验证大屏、插件和组件库适配 |
| T-604、T-606、T-616 | 按实际成熟度完善对外说明、版本权益和交付范围 |

## 13 实施决策和变更边界

默认按 Fastify 参考服务、PostgreSQL、串行审批、站内消息和双租户验收推进。团队已有指定后端时，替换参考服务实现，保持事务、权限、接口及验收要求不变。开始编码前在 LA-001 分配实际负责人，核对现有后端资源、数据规则和部署条件，并给出基于任务的工期。

R1 完成表示请假路径达到可试点交付，不表示所有既有模块均生产化。范围变化必须同步任务依赖、接口和验收，不以增加页面数量替代业务完成。后续 AI 先生成受约束、可编辑的配置，经人工预览和现有发布流程生效；模型、检索及任务执行可独立服务化，业务权限仍由宿主后端验证。
