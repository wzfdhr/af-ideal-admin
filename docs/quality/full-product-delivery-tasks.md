# 全产品实施范围和验收清单

目标来源：本任务全产品 Goal、现有路线图、能力地图及原 T/LA 清单。2026-10-01 冻结，分支 codex/full-product-completion，继承 cce16cb。R1 包 c5d7051b 保留回归，不用 R1 证据替代其他模块真实实现。

实际执行者为本任务 Codex，不虚构团队成员、客户或批准。以下每项只有代码提交、对应检查、真实验收及证据齐备才完成；文档、Mock、真实功能和部署四类状态分开。外部条件未满足不缩减最终范围。

## 当前差距

已核实参考 API 覆盖认证、成员、请假配置及事务、通知和审计；已补部门、岗位、用户生命周期、本人凭据、动态角色/成员授权的真实纵向路径。菜单资源、完整字典及其他平台模块仍须真实接入，已实现模块也各有部署/恢复门禁。原清单的演示或文档不会改成虚假的真实完成。

技术栈继续 Vue/Arco、Fastify/PostgreSQL、共享 contracts/workflow-core。新增领域按各自语义分表，不以一张通用 JSON 表伪装全产品实现。AI 是独立可替换服务，业务授权保留在服务端。

## 冻结的实现任务

各项实际执行者均为 Codex；未开始项无实现 SHA/验证结果。依赖采用 FP 编号，原 T/LA 用于追溯。

| 编号 | 模块、交付和验收边界 | 依赖 | 原需求 | 状态 |
| --- | --- | --- | --- | --- |
| FP-001 | 全量差距、原任务证据分级和 R1 包/回归核对 | 无 | 全部 | 进行中 |
| FP-002 | 部门/组织树真实 CRUD；版本、幂等、跨租户/环/引用删除拒绝及现有页面接入 | FP-001 | T-204/T-608 | 进行中 |
| FP-003 | 岗位及组织成员绑定、启停、合法关联和旧快照保留 | FP-002 | T-204/T-608 | 进行中 |
| FP-004 | 用户/成员生命周期、私有凭据、脱敏、停用及会话撤销 | FP-002 | T-204/T-607 | 进行中 |
| FP-005 | 动态角色、权限绑定、即时撤权、最后管理员保护及授权审计 | FP-004 | T-104/T-204 | 进行中 |
| FP-006 | 后端数据范围、字段投影/脱敏；all 只表示本租户 | FP-003/005 | T-608 | 进行中 |
| FP-007 | 菜单资源持久化、安全 componentKey、路由/按钮权限一致 | FP-005 | T-106/T-204 | 进行中 |
| FP-008 | 字典和项目持久化、版本、租户范围及缓存失效 | FP-005 | T-203/T-204 | 进行中 |
| FP-009 | 应用创建/复制/配置/发布/归档，独立 ID 和版本 | FP-005 | LA-037 | 进行中 |
| FP-010 | 通用业务记录、提交/详情/权限/快照/历史和 R1 适配 | FP-006/009 | LA-037/042 | 进行中 |
| FP-011 | 复杂表单校验/联动、安全数据源登记、映射、超时及恢复 | FP-008/010 | T-301/303 | 进行中 |
| FP-012 | 表单编辑重开、比较、发布运行一致、格式迁移和回滚 | FP-011 | T-304/LA-040 | 进行中 |
| FP-013 | 结构化条件 AST 的真实流程运行，确定路由、拒绝脚本和错误恢复 | FP-010 | LA-044 | 进行中 |
| FP-014 | 并行/会签、汇合规则、并发与重复处理、撤回清理 | FP-013 | LA-044 | 进行中 |
| FP-015 | 转交、无效身份、异常处理、授权/审计/任务幂等 | FP-014 | LA-044 | 进行中 |
| FP-016 | 耐久流程超时/调度、租约、重启和唯一执行 | FP-015 | LA-044 | 进行中 |
| FP-017 | query/submit/navigate/openModal/refreshBlock/受控发起流程实际执行 | FP-010/012 | LA-038 | 进行中 |
| FP-018 | 低代码权限、保存重开、发布/灰度/回滚及真实管理页生成或渲染 | FP-017 | LA-039/T-610 | 进行中 |
| FP-019 | 包格式/依赖/校验/引用迁移，新租户导入运行；无凭据/业务数据 | FP-012/018 | LA-040 | 进行中 |
| FP-020 | 对象存储、真实附件 bytes、上传/下载/预览/分片与授权绑定 | FP-004/010 | LA-041 | 进行中 |
| FP-021 | 扫描、隔离、失败/孤立清理和文件审计 | FP-020 | LA-041 | 进行中 |
| FP-022 | 设备领用第二模板，复用配置/审批/附件/通知/审计及记录增量 | FP-019/021 | LA-042 | 进行中 |
| FP-023 | 公告、订阅、模板/变量、审批及授权收件范围持久化 | FP-005 | 消息规划 | 进行中 |
| FP-024 | 发送任务、重试去重、实时推送重鉴权、重启及发送审计 | FP-016/023 | 消息规划 | 进行中 |
| FP-025 | 真实报表查询、字段口径/脱敏及趋势/分布/明细 | FP-006/010 | T-354 | 进行中 |
| FP-026 | 异步真实导出、授权下载、进度/失败、归档/审计 | FP-021/025 | T-354/614 | 进行中 |
| FP-027 | 可启停的定时报表、重启恢复、唯一执行及告警 | FP-016/026 | 报表规划 | 进行中 |
| FP-028 | 大屏画布/布局快照/主题、保存重开、预览/发布/回滚 | FP-018/025 | T-353 | 进行中 |
| FP-029 | 运营/销售/设备三套模板及真实刷新、过期/空/错误/全屏 | FP-028 | T-611 | 进行中 |
| FP-030 | 授权/发布/文件/导出/业务事实审计及失败/trace 检索 | FP-005/024/026 | T-402/404 | 进行中 |
| FP-031 | 审计保留、归档、授权导出和恢复关联 | FP-030 | 审计规划 | 进行中 |
| FP-032 | 品牌/Logo/主题/暗色/紧凑/语言偏好持久化及租户切换 | FP-020/005 | T-608/LA-045 | 未开始 |
| FP-033 | 关键业务语言、CJK、日期/数字、双主题/密度/分辨率和键盘 | FP-032 | 国际化规划 | 未开始 |
| FP-034 | 插件 manifest、可信来源/签名、兼容、安装/隔离/失败回滚 | FP-005/018 | T-612/LA-044 | 未开始 |
| FP-035 | 插件启停/卸载撤销注册、模板目录；不建交易平台 | FP-034/029 | T-612/LA-044 | 未开始 |
| FP-036 | 可替换真实模型服务、耐久任务/取消/恢复/费用；服务端凭据 | FP-019 | LA-043 | 未开始 |
| FP-037 | 需求/模板/生成/编辑/预览/重开/导出/人工发布及越权拒绝 | FP-036/012 | LA-043 | 未开始 |
| FP-038 | 成熟度治理、1-2 个真实业务页双 adapter、主题/错误/权限/键盘及回滚 | FP-004/033 | T-200A/613/LA-045 | 未开始 |
| FP-039 | 版本权益、授权/离线方案，可用能力开关真实生效且保留基础版 | FP-005/035 | T-601/606/LA-045 | 未开始 |
| FP-040 | 官网/二开/FAQ/稳定演示和报价维度；不虚构价格/签字 | FP-022/037/039 | T-602/604/616 | 未开始 |
| FP-041 | 全模块真实正负向、多账号/租户、重启回归和实际性能/恢复测量 | FP-001..040 | T-614 | 未开始 |
| FP-042 | 实际远端 CI、证据归档和安全门禁，不以配置代替运行 | FP-041 | T-005/614 | 未开始 |
| FP-043 | 全新环境全模块部署、迁移、初始化、备份恢复和兼容回滚 | FP-041 | T-605/615 | 未开始 |
| FP-044 | 干净源码/镜像/说明/报告/版本/摘要一致，导入启动的全产品包 | FP-042/043 | T-615 | 未开始 |
| FP-045 | 目标环境真实验收及授权的正式交付，缺外部条件不勾选 | FP-044 | 全产品 Goal | 未开始 |

## 接口与迁移决策

第一条路径复用 src/api/system/department.ts、departmentSystem、ProTable/ProForm。增 departments 独立表，tenant+id/parent 组合 FK、版本、状态、删除墓碑；树写入按租户序列化。PUT/DELETE 要求 expectedRevision，命令要求 Idempotency-Key；旧 Mock revision 可缺省，真实 API 必须有版本。环、跨租户和成员/子部门引用删除拒绝；成功审计同事务，失败不伪装空列表。

后续身份 users 与租户成员资料分离；动态角色 ID 与兼容 UserRole 展示字段分离。授权写入先按固定租户/成员/角色锁顺序设计，避免共享锁升级死锁。数据范围按本租户约束执行，字段通过服务端投影保护。LA-044 在此 Goal 拆为实际实现，不能仅做立项。原 T-001/T-003 的同步和清理不通过 reset 覆盖本地工作；远端操作按已验证状态及授权执行。

## 原任务复核与外部条件

原 T-001..616、T-200A 子项及 LA-037..045 逐项按文档/Mock/真实实现/部署证据复核；当前不覆盖其历史结论。真实系统管理/应用扩展/文件/报表/调度/插件/AI 仍有大量未完成，不能由前端页面数推断交付。

远端已确认为 github.com/wzfdhr/af-ideal-admin，账号有 ADMIN 权限。HTTPS OAuth 缺 workflow scope，直接推送被拒；已配置 SSH 访问验证后，新开发分支通过该合法凭据成功推送，未合并/发布。实际 CI 36864845224 已完成，验证提交4821701，verify 与 real-business 两个 job 均 success；证据链接 https://github.com/wzfdhr/af-ideal-admin/actions/runs/36864845224 。此为第一条真实路径的远端回归，不是全产品最终门禁。目标环境/域名、模型服务/私有配置和对象存储已异步询问。缺外部条件时继续独立本地工作；没有实际 CI/目标验收/正式交付，不完成 Goal。

## 完成记录要求

新的证据放 test-results/full-product/。每项完成追加：实际提交、模块与迁移、自动化/真实用户/恢复证据、环境、限制、回滚、自检执行者及日期。全产品最终报告不能沿用 R1 可试点结论。现阶段 R1 包/镜像/服务存在性已核实，完整回归仍须实际执行。

### FP-027 调度实施、迁移与恢复记录（2026-10-13）

- 原全产品 Goal 保持完整，当前基线 `8b702e1c7b427fd044d5d1477a1105dfadd3efe8`；新增调度契约、权限、纯日历、真实前端和后端实现正在本工作区推进，未应用 026，未宣称完整模块验收。
- 日历 12 项、共享新契约 6 项和前端相关 52 项通过；前端完整回归 `schedule-unit-first.log` 为 648 项通过，另有新增真实规则/运行菜单资格的 3 项路径测试通过。前端类型与所改文件 lint 通过；根接线依赖正在实现的后端模块，其全量类型、构建及真实执行门禁待完成。
- `test-results/full-product/report-schedules-20261013/before-026.dump` 为实际 PGDMP 备份，3,806,032 bytes，SHA256 `e540ffd111b6c68de476b4437f713adba96782ce80f8f0dde8afa1b616e9cf36`；来源为原专属 full-product 演示库，001–025 的全部迁移校验和与源码一致。此记录证明迁移前数据库保护，恢复和文件备份独立验证。原 R1 Docker API 11888 的 /ready 实际返回 200，未迁移其旧库或更换容器。
- 独立只读授权审查发现零行导出 grant SQL 对双方来源撤权检查不足，实际内容下载已有拒绝；后端继续修复和补真实数据库回归。worker 告警的不可达原主体候选可能使后续通知饥饿，也已交由实现修复。未以静态审查代替真实数据库/浏览器证据。
- 核心首次 API 编译成功；安全运行器实际创建随机数据库并成功应用 026，`report-schedules-20261013/integration-first.log` 为 248 项、247 通过、1 失败（118.0s）。失败是新增跨租户 PUT 测试错误带入创建专用 enabled 字段，更新解析返回 422，未进入其预期 404 授权断言；修正为合法更新请求并保持精确断言，失败日志保留。当前核心还在修复混合收件人重试及子导出取消/重试事件审计，必须重新编译和回归，不能沿用首轮结果支持最终实现。
- 下一任务的大屏只读调查和实施决策保存为 `docs/architecture/full-product-data-screen-design.md`；确认现有固定布局/静态数字均是 Mock，FP-028/029 功能实现及真实验收仍未完成。
- 第二轮 `integration-reviewed.log` 实际 258/258 通过（101.7s），含纯日历、当前来源双主体撤权、真实 ClamAV 文件及通知、并发/旧区间补跑/五次租约、三处实际 SIGKILL、混合恢复、子导出审计、告警公平性和到期行锁竞争。026 随后实际应用到专属 full-product demo，校验和 `e982560131cac3497c3534fcc021a24edb5517002c48e12cdfbeec8b4602c474` 从此冻结，001–026 均不改；菜单目录、默认资源、实际只读运行和导出元信息账号导航已接通并通过真实接口验证。
- 当前前端 `frontend-unit-menu-final.log` 676 项通过，72 契约及 25 领域通过，全 workspace 类型和生产构建通过，lint 零错误/19 原有警告。独立 Mock 与旧 smoke 各 3 条通过；smoke 的默认 10888 代理连接报错保留，不能把它作为真实 API 证据。
- 自然分钟浏览器前两次失败保留：`browser-first.log` 的创建响应缺 createdAt，由收件人真实 GET 详情取得时间事实；`browser-reviewed.log` 的 0 行证明发起者不能借权限读取另一人的未提交草稿，夹具通过实际审批配置/提交建立合法双方可见性，未降低 1 行及私有记录排除断言。`browser-intersection.log` 第三次通过，实际通知 DOM 点击、ClamAV 制品下载/摘要、真实审批行交集、撤字段后 404/隐藏以及双租户拒绝均完成。原有 R1 与全产品当前全部真实浏览器 `full-browser.log` 51/51 通过（7.5m）；原 R1 Docker 服务保持，以上演示 API 10890/预览 4189 与原 11888/4185 分开。
- 新 26 迁移恢复脚本尚未执行；独立审查发现全局 source cleanup worker 可在预检后处理并发外来任务，以及备份未覆盖 file_parts 字节，必须修复为严格 owned 范围并完整复制活跃分片后再执行。模块独立恢复、新物理实例/兼容回退及本增量对应远端 CI 尚未由以上局部门禁证明，FP-027 不勾全部完成。
- 后续维护范围修复采用 S/E 两个 worker 的严格 tenant+owned ID 限定，领取、过期、清理和锁后验证均覆盖；脚本写入前校验编译能力版本，避免旧 dist 忽略额外参数。`integration-export-scope-final.log` 260/260 实际通过（103.8s），含同租户/跨租户外来 job、待过期/待清理制品及实际 bytes 不受自有维护影响。
- 独立恢复最终实际通过，run `638c192c1a7948fe80e0c151f7efaefb`，`recovery-alias-final.log` 与 `database-and-file-copy/report.json`：70 public 表计数、26 迁移及校验和一致；复制 36 个实际 byte objects，共 433,825 bytes，包括 2 条 file_parts 引用的完整实际 bytes；恢复原 admin/creator 会话，在真实自然时段只产生 1 个 run/recipient/grant/export/扫描制品/完成事件审计/站内通知，重复执行 worker 不再产生效果。目标规则/报表改名不影响源；源原启用区间通过自有关闭/到期处理/取消事实安全收尾，目标库和存储实际移除后才写 verified。
- 恢复仍明确报告 55 条 stored-file 引用中历史 41 条 missing，`allPreexistingStoredFileBytesRecovered=false`，不得据此声称所有历史附件已修复。此为同一现有物理 PostgreSQL 的独立 DB/store 恢复，不等同新物理实例/新机器/客户部署或兼容二进制回退。两次失败保存为各自 UUID report：首次 waiting-exports 暴露瞬时循环不足，改为真实 nextAttempt/单调截止诊断轮询；第二次实际完成后 SQL 未引用大小写 alias 导致断言失败，修正 SQL 引号并保留严格数量断言。未伪造完成或重写原记录。
- 中断后原容器/卷原样启动、私有连接从既有容器配置重建，ClamAV 原签名库复制到 APFS 临时目录避开外卷 AppleDouble 文件，实际 1.5.4/28151 probe 通过。专属 worker 已恢复；最终源提交和远端 CI 仍需归档，整个 Goal 与后续模块不因本增量而完成。

### FP-028 画布坐标基础（2026-10-13）

- `canvas-geometry.ts` 提供 1920×1080、8px 吸附、160×96 最小尺寸、30 材料上限；实际缩放坐标转换、八向缩放、属性/键盘同算法、多选精确对齐和稳定层级重排均为纯算法。20 项边界测试、专项与完整前端类型、所改文件 lint 通过，证据 `test-results/data-screen-canvas-geometry/`。
- 尚未接真实画布页面、持久快照/发布 API、受权数据刷新、三套模板或全屏；不以算法和 Mock 截图代替 FP-028/029 的实际用户链路。后续继续按已保存实施决策接入。

### FP-027 远端失败修复与 FP-028/029 接续（2026-10-13）

- FP-027 实现已提交 `59d3289d1512c89e94172e37ab543b68acb6a8cf`，画布基础 `146a24673cf38a66e6eec34edfae0faefe8e6876`；兼容本地/锁定格式化器的修复为 `cbbb9a996a5166599e9d14e4c45cb5a19800c41a`。[CI 38407396372](https://github.com/wzfdhr/af-ideal-admin/actions/runs/38407396372) 的 verify 成功、real-business 失败；真实浏览器步骤被跳过，不将此运行写成通过。完整日志、headSha 和真实数据库 artifact 已存 `test-results/full-product/report-schedules-20261013/ci-38407396372/`。
- 精确失败是已有 2001 行真实导出上限测试：完整排序/序列化先耗尽 15 秒 SQL 超时，返回 500 而非既定 422。按同一行权限、字段投影及筛选谓词先执行有界 2001 行计数，完整查询仍保留最终上限断言，避免并发新增绕过。首轮本地修复引入 PostgreSQL 未使用参数类型问题以及隔离工作区缺 test-results 目录，失败日志保留；修正预检绑定顺序与运行目录后，在固定 cbbb 基线独立 npm ci/build 的隔离 checkout 上 `ci-query-bound-integration-reviewed.log` 全部 260 项通过，上限用例 4.90 秒返回精确 422，没有删改原断言。
- 此独立修复提交为 `8a84cb0e208a6ecd779c6a12228188a3f8db0b71`，已推送内部修复分支并真实触发 [CI 38411439858](https://github.com/wzfdhr/af-ideal-admin/actions/runs/38411439858)。最终 CI 结果尚待归档；该固定 FP-027 基线的门禁与尚未冻结的大屏实现分开。
- 后续该运行实际 completed/success，verify/real-business均成功：676单测、72契约/25领域、260数据库/API、51完整真实浏览器、Mock/smoke各3以及类型/lint/构建。最终JSON、完整workflow.log和real-business-evidence已下载至 `report-schedules-20261013/ci-38411439858/`；实际修复SHA已通过merge `3404217`并入持续交付分支，合并冲突仅坐标数值排序，保留新coordinate与已验证有界导出检查，文件内容与合并前一致。此成功不替代新增大屏的最终CI。
- FP-028 新闭合 v1 契约已提交 `3c0df34`，独立列表/运行和各治理命令的目录及入口提交 `4308367`。新增契约 11 项通过，连同既有契约共 83 项及 25 领域项通过。实际后端初轮 9 项中 8 项通过，唯一失败是测试直接写入应用不支持的 disabled 状态；改为合法 archived 状态并保留原来源错误断言。独立角色/部门范围及 typed 坐标补齐后，`integration-coordinate-first.log` 10/10 通过。独立只读审查又发现发布摘要只有格式校验，当前正在增加实际内容字节/摘要校验，不能沿用前述候选测试代替修复后结果。
- 027 仅在随机测试库执行，尚未迁移专属演示库。`data-screens-20261013/before-027.dump` 为同一只读 repeatable-read/pg_export_snapshot 实际备份，70 表计数、26 迁移，4,123,122 bytes，SHA256 `d72a9a401ff614273937274afdd75d392f6ec6132863dc4ec93c2a8aa5371d24`。001–026 已应用迁移保持冻结；原 R1 容器与数据卷保持。
- 新 coordinate 字段在 form v2 明确声明轴及六位小数，保留数量/金额原规则，拒绝将坐标放入现有金额计算或工作流条件。契约共 88 项及 25 领域项、坐标组件及真实生成文件测试已通过；数据库签名坐标、空值/隐藏值不造点的地图及前端完整保存/发布/轮询链路仍须统一最终门禁。三套真实业务模板、页面验收、独立恢复及本大屏增量的对应 CI 保持开放，整个 Goal 不标完成。

### FP-028/029 真实模板、交互与独立恢复增量

- Typed 坐标实现 `ed9e84a`、完整性保护的后端与027 `6f30728`、真实画布/模板来源 `4420b98`、独立恢复工具 `291d2b0`、实际 OS API 进程替换回归 `8464607` 已提交。027 实际应用专属 full-product demo 后冻结为 `28f8ba3eaa7c9c1887963af9ca61f00dab5ecfe091c4fa6d41897c056042a63e`，001–027 不改；原 R1 11888 与独立 10890 均实际 ready，原容器/卷保持。
- `integration-all-first.log` 为 273/273（158.9s），含12项屏领域/真实HTTP负向与坐标生成格式回归；另 `integration-process-final.log` 新增实际子进程 SIGKILL/退出确认/不同 PID 恢复，同 token 再读布局/摘要/当前受权行并拒跨租户、撤查询权后清空，13/13 通过。后续完整门禁须包含此第13项，不能把 API 对象重建作为 OS 进程替换。
- 独立审查发现027只验证摘要格式后，新增不可变 `content_canonical`，SQL验证它对应实际快照/绑定且 UTF-8 SHA256 一致，所有DTO/运行/回滚再验证规范字节。真实错摘要 INSERT、错内容配对摘要和非规范文本的HTTP详情/列表/运行/回滚409、`data:null`及事务无额外成功效果均通过；未重写历史迁移或历史发布内容。
- `seed-data-screen-demo.mjs` 在明确专属 demo/本机API、fresh session hash/scope/epoch匹配后实际建立三套独立 generic 应用：运营工单5条、销售订单6条、设备领用4条真实合成记录，各3个固定报表版本、各1个发布屏。销售源通过 blank/v2 表单/串行工作流配置真实发布，含六位带符号经纬；未用设备改名、固定GMV或成功响应注入。`demo-fixtures/bda807e2-f1e8-457e-9d5a-724e25e34ed6/report.json` 为 verified，保留以供用户查看。
- 两个真实目标浏览器 `browser-reviewed.log` 2/2（40.2s）：三模板真实选择、拖拽/八向缩放/属性/键盘、保存刷新/关闭重开、预览/发布v2/回滚/复制/主题、真实Fullscreen与退出还原、暂停、15秒真实新增记录轮询、只读观看者行/字段、空坐标不造点、网络stale、撤权/归档清空及双租户。首轮1/2失败的原因是 finally 用 admin 读取 reader 自己的 draft；改为创建者精确清理自己的行并保留主失败+清理失败，未扩大业务读取权限或吞404。
- 原生IAB点击实测销售屏真实6行/6点与1920全屏，发现三视图的告警重复累计成18，已按实际源/自然日期窗/状态筛选集合去重、不同集合分别报告，错误/失权来源无告警。全屏隐藏编辑器后真实可播放；加载已有屏同步真实绑定，旧catalogue迟到错误和旧停用banner不得覆盖新成功屏，后续专项单测已补。上述界面修复后的最终生产包和对应CI仍需归档。
- 恢复 `a053d34f306c45e6a8a9aeaec9205c3c` 实际 verified：73张public表逐表计数、27迁移校验和与导出快照一致，真实PGDMP 4,279,136 bytes；目标独立库保留原会话、读取3屏/9报表/15行/6坐标，仅目标销售草稿改名/主题/布局、发布v2/回滚v1、API重建再次运行。源屏/报表/记录及原leave基线未变，目标数据库和store移除后才写 verified。脚本执行前修正 docker restore stdin `-i` 和未知CREATE结果不自动删除；首次失败为错误要求已被010合并的 leave_requests 基表，保留失败报告并改为当前 business_records 模型。
- 此恢复仅验证现有物理 PostgreSQL 中的新独立库，不复制文件bytes、不称新物理机器/兼容二进制回退/客户部署；已知41个旧缺失文件仍开放。整个 Goal 及最终部署/发布门禁不标完成。
- 完整53条浏览器首轮 `full-browser.log` 44通过/9失败，历史恢复库存在比当前时钟靠后的原记录，默认第一页/前100目录假设失效。逐项定位修复真实查询和产品目录可达性；不重写时间、删除历史、扩大权限或降低原断言。低代码应用生成、表单草稿/来源目录和消息分页的真实缺口正在窄修，最终完整重验及对应SHA的CI未由此首轮证明。

### FP-002/003 树和岗位增量

- 实际执行/阶段自检者 Codex，2026-10-01；本轮提交记录在后续验收结果中追加。
- 部门树与父级编辑、完整父级选项、岗位CRUD、成员部门/岗位绑定、名称显示、严格组合FK、004迁移、租户锁顺序、事务审计和明确冲突恢复已实施。
- organization-restart-http.log：47项真实数据库/HTTP测试通过，新增进程替换恢复；organization-mock-domain.log：8契约+10领域/Mock通过；organization-with-mock-unit.log：425前端单测通过。
- organization-positions-browser-green.log：3条真实页面路径通过，含关闭重开、双租户、引用删除和父级循环选项；organization-mock-browser-fixed.log：显式Mock开发页面独立通过，未作为真实实现验收。
- 原R1全量真实页面新增用例后触发登录限流，随后发现失败登录的诊断401会重载登录页、清空输入；失败证据 organization-final-real-browser.log、organization-real-browser-throttle-fixed.log 保留。修复登录页上的401跳转、返回真实Retry-After后，organization-login-recovery-real-browser.log 的19项全部通过；不更改原安全阈值，不删除失败用例。新增登录错误/输入保留/正确重试用例为真实401及429链路。
- 最终前端425单测、47数据库/HTTP、8契约+10领域/Mock、3旧smoke、1独立Mock页面通过；lint无错误、全部workspace类型和构建通过。完整树/岗位增量的实际GitHub CI针对50b36df执行并通过，未沿用4821701结果。
- organization-keyboard-browser-fixed.log：新增树的键盘折叠/展开、岗位弹窗Escape取消与焦点返回后，3条组织页面再次通过。关闭Arco下拉后Escape曾被吞掉，保留失败 organization-keyboard-browser.log；修复为下拉打开时先由下拉处理，关闭时允许弹窗退出，提交期间禁止误取消。organization-mock-final-browser.log 的独立Mock页面再验通过，旧无租户部门Mock处理器已由共享受控适配器替换。
- 本阶段仍缺模块部署/备份/兼容回退和最终全产品验收，FP-002/003不勾完成。限制、固定枚举、Mock内存边界和回滚见 full-product-organization-design.md。

### FP-001/002 首轮实现记录

- 提交4821701，实际执行/阶段自检者 Codex，2026-10-01。
- 45项范围已拆分，原 R1 已在新专属演示库中回归。FP-001 的全原任务逐项审计仍进行中。
- 部门独立表、003迁移、共享契约、真实 CRUD/父引用/环/引用删除、版本和幂等、事实审计、现有页面及授权菜单接入。旧迁移001/002的完整性断言保留并新增003，不删除老用例。
- 本地425单测、41数据库/API回归、8契约+7领域/Mock、6部门API/页单测、16真实页面E2E含R1通过，lint无错误和全部workspace类型/构建通过。证据 department-http-green.log、department-unit-full.log、r1-and-department-browser.log 等。
- 实际页面编辑丢失revision因ProForm仅提交schema字段，department-e2e.log复现，独立editingRevision修复后真实重开/编辑/删除及双租户通过。
- 部门状态是固定枚举，非完整字典持久化；树可视交互、岗位/成员关联、真实角色授权和完整组织验收未完，所以FP-002保持进行中。
- 使用独立随机数据库、API10890、网关4189；私有env放APFS临时目录，未写入源码或报告。原R1服务/卷和交付包保留。回滚与兼容边界见 full-product-organization-design.md。

### 实际远端 CI 增量记录

- 源码提交50b36df8ad95480a959dd9c8aacbd74d89ed6adf，分支codex/full-product-completion，实际运行36879157316；verify和real-business均success。
- 证据链接 https://github.com/wzfdhr/af-ideal-admin/actions/runs/36879157316 ，artifact已下载到test-results/full-product/ci-36879157316，状态及SHA另存organization-remote-ci.json。
- 执行共享契约/领域、425前端单测、47真实数据库/HTTP、19真实浏览器、3旧smoke和显式开发Mock页面；包含真实进程替换、双租户、输入恢复与键盘场景。没有合并默认分支或宣告全产品发布。
- 后续用户生命周期增量不包含在该CI提交中，需要新的验证记录。FP-042最终全产品门禁仍未完成。

### FP-004 用户生命周期首批后端

- 实施者Codex，2026-10-01，当前增量尚未成为完整模块交付。users-lifecycle-red.log保留真实路由404失败。
- 005迁移、严格共享用户输入、真实创建/资料维护/停用/删除/受限密码重置、租户内姓名/联系资料、服务端脱敏、幂等版本与事实审计已实施。共享身份的全局资料/凭据不能被一个租户管理员改写。
- 按租户会话epoch保存登录授权范围；停用/删除推进epoch，重新启用不会使旧会话复活，其他租户的授权继续有效。旧有效会话按迁移时已授权成员建立兼容范围，不引入默认通配权限。
- users-member-protection-http.log：54项真实回归通过，包括双管理员同时自停用保留治理者、共享身份资料隔离、另一租户继续访问、旧会话拒绝、实际密码重置和历史保留、真实待办成员停用/删除拒绝。原R1和组织恢复用例保留。lint无错误和workspace类型检查通过。
- 用户页面、本人修改密码、完整角色授权、独立Mock、浏览器及部署/备份/回退仍须继续。此次数据库结果不替代这些门禁，FP-004不勾完成。
- 005已实际迁移到独立开发库，users-backend-r1-browser.log 的19项原有真实页面回归通过，users-staged-unit.log 的425项前端单测通过。这是原有路径在新鉴权后的回归，不是尚未接入用户页面的验收。新增用户共享输入/脱敏契约用例独立执行。
- 提交2231964为本阶段首批后端检查点；用户契约增至10项，领域/Mock10项。后续补充的撤销联系资料权限后重放旧命令用例，在users-contact-replay-red.log真实复现缓存返回原始电话；写命令响应改为始终脱敏，原值必须通过按当前权限持有租户共享锁的读取接口获得。users-contact-replay-green.log 的55项数据库回归已通过；该增量需独立提交及CI，不沿用2231964结果。
- 2231964的CI36885143026、隐私修复f15f9af的CI36889342543均实际通过，verify/real-business均success；artifact分别归档ci-36885143026、ci-36889342543。最新55项测试来自f15f9af，仍非最终全产品门禁。

### FP-004 真实用户页面增量（2026-10-02）

- 按dataMode选择真实reference.vue或原Mock页面，保留原有Mock单测；真实路径使用严格共享契约和独立成员API。新建身份填写私有初始密码，编辑姓名时留空联系资料不覆盖原值，清空联系资料须显式勾选；版本独立于ProForm字段保存。
- 用户列表/详情默认使用服务端掩码，密码字段关闭或组件退出即清理；命令重试只保存在当前内存。租户切换前登记未保存状态，历史成员撤销用墓碑而不删除身份/业务历史。
- users-page-browser.log复现停用后刷新仍反复查询失效身份：登录守卫未清理旧token。清理认证/租户/菜单并防止登录页自重定向后，新增2项守卫回归，users-page-guard-full-unit.log共427项通过。
- users-page-browser-fixed.log完成真实创建、校验失败保留输入、编辑/刷新、私有密码重置与旧会话拒绝、停用/再次拒绝、撤销及双租户隔离。users-page-all-real-browser.log共20项真实页面回归通过，含原R1；users-page-legacy-smoke.log原3项通过。没有注入成功响应。
- 真实参考页面、菜单/路由/按钮授权已接入；只在显式专属演示初始化中给两名合成管理员用户治理权限，未授联系资料原值读取和通配权限。原私有R1初始化权限不自动升级。
- 此增量仍需其自己的CI、本人修改密码、真实角色/权限、更新Mock闭环、部署/备份/回退和完整模块验收。FP-004保持进行中，不标为全部完成。
- c88035cd03df80f4b70fc2ae3bcde7402408b002的实际CI36892910191已通过，verify/real-business均success；源提交和状态保存users-ui-remote-ci.json，artifact归档ci-36892910191。这轮实际运行包含427单测、55数据库/HTTP、20真实浏览器及独立Mock/旧smoke；不是整体发布成功。

### FP-004 本人密码增量（2026-10-02）

- 执行者Codex。self-credentials-red.log保留真实缺失接口失败；006全局凭据版本、本人接口/页面、全局凭据锁、会话有效性重查、登录发放前二次校验与管理员双版本比较已实施。
- self-password-race-http.log：60项真实数据库/HTTP回归通过，含5项新增凭据安全测试。确定性登录交错使用实际阻塞在凭据锁上的请求，未替换成功响应。
- self-password-domain-fixed.log：11契约与11领域/Mock通过；self-password-unit.log仍427前端单测通过；types/lint无错误。
- self-password-real-browser.log本人修改及管理员重置2条真实页面通过，包含错误输入保持、1280键盘路径、新密码重新登录、两份旧浏览器会话拒绝；self-password-mock-browser.log独立2条开发Mock通过。原公共演示身份密码未改，新增测试只改变自己创建的合成身份。
- 私有密码仅用于当前输入，退出或成功即清理，不写草稿/本地存储；新页、菜单和接口按account:password:update统一授权，只作用于当前身份。完整Mock用户生命周期、部署/备份/回退与FP-005动态角色仍须继续，FP-004保持进行中。
- self-password-all-browser.log的21条真实路径、self-password-smoke.log的原3条smoke全部通过，包含原R1、组织、用户和本人密码；新增提交还须实际远端CI，不复用c88035c结果。
- 36a45c1的实际CI36940495467已通过，verify/real-business均success，artifact归档ci-36940495467；本人密码完成该提交的远端回归，仍不是整个产品完成。

### FP-005 动态角色首批纵向路径（2026-10-02）

- 007受控目录、角色/权限/成员关联、实时有效权限函数、版本和幂等、同事务事实审计已实施；兼容直接授权保留，不把角色权限复制进去。
- 认证、菜单、写命令、审批候选/发布/执行、通知链接选择及配置异常收件范围已统一读取有效权限。成员停用与角色变更共用用户管理、授权分配、角色权限维护的治理能力保留规则。
- roles-http-red.log是真实缺失路由失败；roles-workflow-http-fixed.log67项数据库回归通过，含6项角色正负向、并发/幂等、真正的角色审批和新增私有平台初始化。不可见历史详情依原规则精确404/NOT_FOUND，不返回业务信息。
- roles-real-browser.log和roles-all-browser.log验证角色绑定使旧会话获得入口，撤权后接口403、菜单/路由拒绝、双租户隔离及解绑删除；全量22真实页面通过。roles-full-unit.log428单测、roles-domain.log13契约/12领域通过；原3smoke、2现有Mock页面仍通过，lint/type/build无错误。
- 私有初始化新增显式platformGovernance:true，仅对新空库创建管理者，不升级旧初始化/已有成员，不使用通配权限。默认/false保留R1原行为。
- 生产reference角色页与原Mock角色页分开，旧Mock没有证明新授权生命周期。新Mock闭环、数据范围、键盘/分辨率完整验收、模块部署/备份/兼容回退和本轮新CI仍须继续。FP-005保持进行中；完整规则与限制见full-product-authorization-design.md。
- 65cd1d87f85d5e410d426299acc863eb58bae850的实际CI36944402964全部通过，artifact归档ci-36944402964；对应67数据库、22真实页面、428单测及既有Mock回归，不代替后续Mock增量CI。

### FP-005 授权Mock增量

- RoleDemoStore及共享permission-catalogue、authorization-state提供租户隔离、版本/幂等、失败回滚、委托上限、治理者保留和当前有效权限。R1身份/租户上下文/审批候选/通知路由、组织、权限码和角色接口使用同一来源，不依据角色展示值重新升级。
- 角色页面在真实/Mock模式共用；角色开发浏览器通过实际创建、绑定、SPA重新登录、目录读取、撤权及菜单移除。role-mock-provider-browser-clean.log3条独立Mock通过；role-mock-provider-domain.log15领域/Mock通过；role-mock-catalogue-http.log68真实数据库/API通过，新增目录词汇精确一致性检查。
- role-mock-final-unit.log仍428单测通过，类型/lint无错误、构建通过。热重载干扰的失败证据保留，顺序重验通过，未降低断言或提高超时。
- 内存状态不证明持久保存、跨浏览器、真实锁、生产哈希或服务恢复；FP-005的部署/完整恢复、角色数据范围及整体发布仍未完，保持进行中。
- 687c4dc2b96eb5ef0fd1e9668a875e9c488cd1b4的实际CI36949823738已通过，verify/real-business均success；报告role-mock-remote-ci.json，artifact归档ci-36949823738。后续优先推进FP-006真实数据范围，不把绿色CI解释为全产品完成。

### FP-006 成员范围首批纵向路径

- 实际执行和阶段自检：Codex。008迁移、成员SQL行范围、同角色字段投影、严格配置/已保存预览、真实页面及菜单已实施。新增角色默认本人，已有角色迁移保留原租户范围；all不跨租户。
- 后端授权同时覆盖成员详情/更新/删除/重置、授权分配和岗位成员目标；直接授权、分配更宽角色、已绑定角色权限编辑、配置字段扩权均拒绝。创建未分配成员必须有全部范围。最后全部成员数据治理者收紧范围时事务回滚规则和成员版本。
- data-scope-governance-http-final.log：76项真实数据库/HTTP通过。早期data-scope-governance-http.log的最后治理者用例存在其他前置测试治理者，未构成唯一治理者；显式隔离这些合成成员并恢复后，固定409及版本回滚断言通过。data-scope-governance-http-fixed.log保留首10条规则分页导致测试找不到新角色的失败；测试明确请求100条后再验通过，没有放宽业务断言。
- data-scope-current-unit.log：428前端单测通过；data-scope-current-contracts.log：14契约与15领域/Mock通过；data-scope-final-lint.log无错误，data-scope-final-types.log与data-scope-final-build.log通过。构建仍有既有大chunk、Sass、深度选择器和Mock依赖eval告警，未宣称性能目标已满足。
- data-scope-current-real-full.log：23项真实浏览器路径通过，含原R1、用户、密码、角色、部门、岗位和新增范围页。最后治理保护增量编译后替换专属API进程，data-scope-final-browser.log的范围/授权两条再次通过；配置保存重开、字段隐藏、同一会话即时收紧、实际预览和第二租户隔离均执行真实服务，未注入成功响应。截图data-scope-real-preview.png已检查。
- 008只应用到专属开发演示数据库、API10890/网关4189，保留原R1卷与交付包。范围规则的专项进程恢复、并发、完整键盘/分辨率、组织调动、选择器字段投影、业务记录/报表/附件/审计范围、Mock生命周期及部署/备份/兼容回退仍未完。FP-006保持进行中，完整边界和回滚风险见full-product-data-scope-design.md。此次本地结果不替代本轮远端CI或全产品交付。
- 随后补充预览与访问者选择器同时受配置者本人字段权限约束，禁止通过查看别人的预览恢复自己隐藏的姓名。data-scope-preview-http.log的77项数据库/API全部通过；范围页访问者目录已投影，其他组织/授权选择器仍待完成。独立Mock回归data-scope-final-mock-browser.log的3项及旧smoke data-scope-final-smoke.log的3项通过，Mock范围生命周期尚未实现。
- 源码检查点b757ce09868d88f47221f3262b1db18b7146a200已推送；手动触发CI36966746115，结果须等运行结束核实。额外专属API进程替换检查data-scope-process-persistence.log通过：3条已保存规则、字段与版本一致，旧会话有效。data-scope-keyboard-compact.log通过1280x720的原生选择器焦点、Tab进入字段选项、Escape取消和弹窗边界；不代表完整多分辨率/辅助技术验收。
- b757ce0的实际CI36966746115已通过，verify/real-business均success；下载证据ci-36966746115，状态data-scope-remote-ci.json。远端77项数据库/API和23条真实浏览器通过。
- 随后新增联系方式功能授权自身也必须覆盖目标成员行/字段的回归。data-scope-contact-boundary-red.log真实复现：仅本人read-contacts角色与全租户查询角色拼接后返回他人原始电话。服务端投影改为再次检查read-contacts目标行/字段，原始电话筛选也需要同样授权。data-scope-contact-boundary-green.log的78项通过，lint无错误及全部workspace类型通过；此修复不包含在b757ce0的CI结果里，必须以新提交重新运行CI。

### FP-006 组织选择器与调动边界增量

- 实施/阶段自检：Codex。联系方式修复ec27ec3782c55a386f168ab2d457cf970e5f5de3的CI36967243918实际通过，verify/real-business均success，远端78项数据库/API和23项真实页面通过；artifact归档ci-36967243918，状态data-scope-contact-remote-ci.json。
- 新增组织/授权成员逐字段投影、隐藏账号的筛选拒绝、部门/岗位字段映射、组织列表授权事务、组织调动前的目标部门与成员隐式角色范围检查。API依然独立检查字段写权限，页面显示“无字段权限”并隐藏不可执行的组织绑定。
- 幂等支持可选事务内响应投影；旧部门字段权限撤销后重试不能恢复旧回执中的部门/岗位，不重复推进成员版本或写事实审计。
- data-scope-selectors-placement-red.log真实复现目录字段暴露和越界调动；data-scope-selectors-placement-final.log的81项数据库/API通过，含合法下级调动、调动后的真实查询范围变化、失败不改成员版本和重试审计一次。data-scope-selector-ui-unit.log的428单测通过。早期静态类型及渲染lint失败保留；修复可投影回执类型和渲染分支后，data-scope-selectors-browser-build.log的完整workspace构建通过。
- data-scope-selectors-browser.log保留新用例同时选择外层/内层section以及旧岗位用例假设员工在首10条的失败。增加明确成员列表定位和真实分页后，data-scope-selectors-browser-fixed.log有5项通过；余下岗位用例在reload后需重新定位分页，修复后data-scope-selector-paging-reload-browser.log独立通过。原保存重开、引用删除、双租户、键盘和员工身份断言不变，没有清空演示成员或删减失败用例。
- FP-006继续进行中。角色目录Mock范围、部门树移动引发范围扩张的控制、跨模块业务范围、模块完整并发/恢复及部署回退仍未完成；不缩减冻结范围，不标记全产品交付完成。本增量须新的提交及远端CI，不能沿用ec27ec3的绿色结果。

### FP-006 调树与拒绝交互增量

- 实施/阶段自检：Codex。39ac65f388ac960425f220d9dd34daf84432c94c的实际CI36968927731已通过，verify/real-business均success；远端81项数据库/API和24条真实浏览器通过，归档ci-36968927731及data-scope-selectors-remote-ci.json。本轮增量不包含在这个CI提交中。
- 新增tree-scope在旧树检查移入引发的隐式/显式下级角色扩张，包括尚可重新启用的角色绑定；合法已覆盖子树的调整允许。显式角色范围引用阻止部门删除，清除配置引用后才可删除。
- 调树写入使用租户治理排他锁，父级变化推进租户权限版本，旧/新父级进入同事务事实审计。data-scope-tree-red.log复现越权移入及删除范围根失败；data-scope-tree-version-audit-http.log的85项真实数据库/API通过，包含受限/合法调整、竞争版本、幂等及版本/事实只推进一次。
- 首轮浏览器暴露缺少详情权限仍显示编辑按钮，以及业务范围403被通用处理器跳转导致输入丢失。编辑按钮现在要求详情+修改，表单展示后端提示；三个明确范围/字段拒绝保留页面，功能权限FORBIDDEN仍进入无权限页。data-scope-tree-domain-browser-green.log及data-scope-tree-final-browser.log验证真实拒绝保留输入、角色即时追加详情权限和随后撤销修改权限的两种行为；岗位持久化/引用删除也回归通过。早期失败data-scope-tree-browser.log、data-scope-tree-browser-fixed.log、data-scope-tree-browser-permissions-green.log保留，不能把这些文件名误作通过结果。
- 部门页单测保留两次详情API调用次数断言，并增加详情+修改权限组合及all模式断言，兼容stub的数组权限。data-scope-tree-final-unit.log的428项通过；data-scope-tree-domain-denial-build.log完整workspace构建通过，data-scope-tree-types.log类型通过，data-scope-tree-final-lint-clean.log无错误。data-scope-tree-mock-browser.log的3条原开发Mock路径通过，未据此宣称Mock范围完整或真实部署完成。
- 全产品45项冻结范围保持不变。FP-006还缺跨模块业务/附件/报表/审计范围、Mock范围生命周期、容量和完整部署/恢复/兼容回退；本增量需要新提交和新CI，不标记完整模块或全产品完成。

### FP-009 应用中心首批真实纵向路径

- 实施/阶段自检：Codex。36025c5cdf10c8060da250e492a8fbe549fec86a的实际CI36972459081已通过，verify/real-business均success，85项数据库/API及25条真实浏览器通过；归档ci-36972459081，状态data-scope-tree-remote-ci.json。本轮应用中心不包含在该CI里。
- 新增009迁移及应用中心创建、列表/查询、独立复制、元数据维护、归档/恢复接口。每个新应用有独立草稿引用和发布版本；复制实际重映射流程formId，已有不可变发布、人员校验、审批、历史及通知复用。模板复制不复制业务数据、会话或凭据。
- 应用配置页按当前应用加载自己的默认草稿；新应用发布禁止借用其他应用可变草稿。认证读取事务刷新权限；未发布或generic配置需要管理权限。归档阻止新业务和发布/切换，但真实在途审批可完成。
- application-lifecycle-first-http.log保留用例使用了错误审批URL的404；修正为现有workflow-tasks真实入口后，application-lifecycle-binding-http.log的91项数据库/API通过，包含独立发布v1、表单引用重映射、原模板不变、元数据冲突与标识不可变、双租户/原始非法输入、目录/复制但无配置权限的受控草稿复制，以及归档后既有两级审批完成。
- application-lifecycle-browser-fixed.log的应用中心真实页面闭环通过：创建请假模板、保存刷新、自己的草稿、两设计器保存、独立发布v1、运行提交、复制、归档/恢复和第二租户隔离。先前application-lifecycle-browser.log因把原生select的id当成testid而失败；改为语义label，并从真实元数据验证精确草稿ID，未弱化独立性断言。
- application-lifecycle-final-unit.log的428单测通过；application-lifecycle-final-build-fixed.log的workspace构建通过，application-lifecycle-page-types.log类型通过；application-lifecycle-commit-lint.log无错误。构建和格式早期失败保留。application-lifecycle-final-mock-browser.log的3条旧开发Mock路径通过，不证明新应用中心Mock生命周期。
- 原全量浏览器application-lifecycle-final-real-browser.log有23通过、3失败，原因是积累的演示记录不再在第一页；权限/业务断言均保留，改为真实分页/现有查询定位。application-lifecycle-paginated-browser.log的7条相关路径全部通过，完整26项再次回归另存application-lifecycle-complete-real-browser.log，须以该实际结果记录完成情况。
- 009只应用到专属开发演示库及API10890/网关4189，原R1环境、卷、包保持独立。通用记录/第二业务模板、应用中心完整Mock、失败注入/进程恢复、容量及部署备份回退仍需继续，FP-009保持进行中。不能将复制请假模板算成第二个不同业务模板，不能把空白generic配置当作通用业务运行完成。
- application-lifecycle-complete-real-browser.log 的完整26项真实浏览器回归已通过，包含原R1及新应用中心。application-lifecycle-command-contracts.log的16契约与15领域/Mock检查通过；这些结果仍非全产品最终门禁。

### FP-010/022 通用记录与设备领用首批

- 实施/阶段自检：Codex。86a2640f0afa6c10059480713db073c970592e0c的实际CI36979144668已通过，verify/real-business均success；91项数据库/API、26项真实浏览器通过，归档ci-36979144668及application-lifecycle-remote-ci.json。本次通用记录不包含在该CI中。
- 按冻结清单提供设备领用第二类型，保留可选参考价值的整数/金额校验，不新增采购平台范围。公共表单、不可变发布、权限、真实任务、串行决定、历史、通知和审计复用；应用包/附件部分继续按FP-019/021/022实施，不借此提前关闭任务。
- 010将原业务表演进为business_records，保留OID、数据与外键；可更新请假视图保持R1，generic记录没有伪造半天数，业务/发布类型及实例版本关联由数据库保护。早期business-record-r1-migration-http-fixed.log真实暴露新触发器先于FK返回23514；修复为缺失引用继续由原23503外键拒绝，原断言不改。
- 通用字段只接受发布目录里的数据，受控整数/两位金额规范、只读字段和有限金额乘法，不运行表达式/脚本。计算配置经已有设计器保存/迁移明确保留；早期空计算结果在business-record-first-http.log复现，模板补齐登记规则后通过。
- equipment-final-http.log的98项真实数据库/API通过，含独立设备类型、真实两级审批和抄送、错误字段/伪造总額/身份、双租户和未参与管理员拒绝、版本竞争、失败注入后的同key恢复、撤回、同应用显式迁移、旧实例快照不改，以及两个独立API子进程的停止替换后旧会话和完整记录仍一致。未用同进程server重建冒充进程替换。
- equipment-browser-reactive-fixed.log及equipment-readable-throttle-browser.log真实设备页面闭环通过，设备申请使用已有两个设计器、员工已发布目录、共享渲染器、保存刷新、真实主管任务入口、两级通过与历史；旧leave详情GET对其404。equipment-browser-first.log保留计算配置structuredClone遇Vue代理导致页面运行异常的失败；改为纯JSON保留并给前端迁移单测使用真实reactive对象。只读结果改成清晰文本，不以禁用输入的低对比度作为结果展示。
- equipment-readable-unit.log的429项单测通过，equipment-contracts.log的18契约+15领域/Mock通过；equipment-readable-detail-build.log完整workspace构建通过，business-record-types-fixed.log类型通过，equipment-readable-lint.log无错误。equipment-final-mock-browser.log的3条旧开发路径通过，不证明新通用业务Mock完成。
- equipment-final-real-browser.log有26通过、1失败：更多真实登录触发限流时，旧负向用例直接等待401。按真实Retry-After等待后仍断言401、遥测401、输入保留和正确密码登录，没有调整限流阈值；完整27项重验放equipment-complete-real-browser.log，须以最终实际结果记录。
- 010只应用到专属开发演示库、API10890/网关4189，已应用迁移不再修改；原R1容器/卷/包保留。通用业务拒绝重提/关联、细分业务字段范围、复杂校验/安全数据源、高级流程、设备附件/应用包、完整备份恢复/部署回退和容量仍未完成，FP-010/022保持进行中。未独立计量人工工时，不冒填复用工时；本次明确记录实际复用模块、代码增量和验收证据。
- equipment-complete-real-browser.log的完整27项真实页面回归最终全部通过。最终代码仍需独立提交和实际远端CI，不能沿用86a2640结果。

### FP-020/021 真实文件首批

- 实施/阶段自检：Codex。22b566e351b63c99a5e166674bf55cc75fcc3736的实际CI36988741845已通过，verify/real-business均success，98项数据库/API与27条真实浏览器通过；归档ci-36988741845及equipment-remote-ci.json。本轮文件增量需新提交/CI。
- 011上传会话、真实分片、对象元数据及扫描队列表；真实文件字节写入仓库外持久化本地对象驱动，服务端生成键，按实际大小、SHA256和类型校验，20MiB/1MiB上限。老元数据Mock保留开发用途，生产reference入口用真实文件组件。
- 下载与预览每次认证/刷新权限及业务可见范围，未绑定文件仅上传者可见；已提交业务附件不能修改。提交前检查未完成上传和未就绪文件，取消/删除不伪装上传成功。内容响应是真正二进制，保留租户上下文检查，安全处置头及不执行内容的预览。
- files-restart-http.log的104项真实数据库/API通过，含真实大分片、同内容重试、不覆盖不同内容、二进制一致、路径/身份/类型/大小/摘要拒绝、扫描错误隔离、感染拒绝、删除、过期/孤立清理、业务草稿绑定/提交阻止、撤权下载拒绝，以及两个独立API子进程之间分片恢复与完成。控制扫描适配器只证明状态机和权限，不算真实ClamAV验收。
- files-clamav-pull.log及files-clamav-install-current.log保留Docker代理拒绝。官方macOS包签名、公证及临时RPATH调整边界见file-storage设计。files-clamav-native-full-load.log真实加载3628114签名；files-real-clamav-protocol.log真实引擎1.5.4/daily28141正常样本clean、EICAR拒绝。files-real-browser.log使用真实扫描后台，通过浏览器文件选择、实际字节上传、扫描等待、精确下载、预览和感染隔离。
- files-unit.log的430前端单测通过，含真实ArrayBuffer保持字节与响应头的边界；files-final-build.log完整workspace构建通过，files-lint.log无错误。新CLI和二进制解析的早期类型/格式失败保留，未绕过病毒扫描把文件默认标ready。
- 专属演示库应用011并启用私有存储目录、API10890/网关4189及独立扫描器；原R1环境/卷/包保留。病毒库维护/告警、完整分片浏览器断点恢复、预览格式深度检查、扫描/清理容量及完整备份/新实例恢复/部署回退仍未完成。FP-020/021保持进行中，CI必须新增实际扫描服务，不以跳过文件用例获得绿色。
- files-final-real-browser.log新增文件后27项通过、登录恢复失败，实因IP窗口先返回Retry-After而账号窗口更晚。后端头改为相关已耗尽窗口的最大截止时间，阈值仍30/IP、10/账号。新增API真实注入双窗口及可控时钟回归，files-combined-throttle-http.log的105项通过；files-auth-fixed-real-browser.log完整28项真实页面最终全部通过，files-commit-unit.log的430单测与files-commit-lint.log无错误。本轮远端CI新增真实ClamAV服务，结果仍须运行核实。

### FP-019 应用定义包首批

- 实施/阶段自检：Codex。86776ab9c245f11c2017aa09faf4a7b709b96dd4的实际CI36995403479已通过，verify/real-business均success，105项数据库/API与28条真实浏览器通过；含远端官方ClamAV服务的真实文件扫描，证据ci-36995403479及files-remote-ci.json。本轮应用包需要新提交/CI。
- 012权限迁移、v1闭合包契约、依赖/格式检查、符号引用、明确默认值脱敏及SHA256；人员按目标租户重新绑定，表单引用生成新的独立草稿ID。包不含源租户/人员对象ID、发布者、会话、业务数据或真实附件。导入只创建独立草稿，不自动发布或执行。
- application-package-reference-http.log的108项真实数据库/API通过，含真实源设备定义导出、另一租户重绑/导入/发布/完成两级业务、原租户不可见、篡改摘要、未来格式、未知依赖、包外身份和默认数据拒绝、源/目标租户人员边界、失败注入事务回滚及同key恢复一次。
- application-package-browser.log真实浏览器闭环通过：下载实际定义JSON、目标租户选择文件、绑定B主管/审计员、导入后刷新重开、自有设计器保存/独立发布v1，B员工真实业务提交。未注入成功响应或复用原租户身份。
- application-package-final-real-browser.log有28通过、1失败：旧保存冲突用例在已登录后又额外登录，触发真实账号限流。改为用当前真实浏览器会话认证另一API客户端的真实更新，保留乐观版本冲突、输入不丢和显式重载断言；application-package-conflict-session-browser.log通过，完整application-package-complete-real-browser.log的29项全部通过。没有放宽限流或删减冲突断言。
- application-package-unit.log的430项单测通过，application-package-contracts.log为19契约+15领域/Mock通过；application-package-page-types.log和application-package-page-build.log通过，application-package-final-lint.log无错误。application-package-mock-browser.log的3条旧开发路径通过，不证明新定义包Mock完成。
- 012只应用专属演示库、API10890/网关4189，原R1包/卷/环境保留。低代码页面/物料/插件与数据源依赖的包扩展、完整新部署导入、兼容格式迁移、容量与最终备份/回退仍未完成。FP-019保持进行中，v1表单/串行流程包不替代冻结全产品包要求。

### 应用定义包远端验证

- 1e1c26706c316645ec53fc5f20d15bbc8c061565的实际CI37004915044已通过，verify/real-business均success；报告归档ci-37004915044，状态application-package-remote-ci.json。108项数据库/API和29条真实浏览器通过，本结果只覆盖该源码提交，不包含后续字典增量。

### FP-008 真实字典和字典项首批

- 实施/阶段自检：Codex，2026-10-02。范围为现有字典及其选项，不新增独立项目管理平台。013增加租户字典与有序选项表、组合FK、唯一类型/值及墓碑；元数据和选项共享revision。类型创建后固定且删除后不复用，平台状态字典不能由租户覆盖。
- 严格契约、有界原始值/数量、事务版本/幂等、失败回滚、事实审计与独立运行读取权限已实现。选项缓存按租户代次隔离、30秒过期、编辑/刷新失效；旧上下文/旧刷新返回不能覆盖新缓存。缓存不代替服务端提交授权与选项有效性校验。
- dictionaries-http-final.log的112项真实数据库/API通过，新增双租户相同类型隔离、停用/墓碑、跨租户FK/重复值/越界序号/对象值拒绝、并发同key一次、过期版本、撤权和失败恢复；服务实例关闭重建后使用原会话重读持久化选项。dictionaries-http-restart.log保留重建测试实例忘记重装失败注入器所致的失败，修正夹具后dictionaries-http-restart-final.log及最终全量通过，未削弱事务断言。
- dictionaries-browser.log真实复现旧reference页面白名单拒绝新字典页；补入口规则与独立正负向回归后继续验收。dictionaries-browser-route-fixed.log保留测试错误假定冲突文案包含“版本”的失败，改为同时断言真实409/REVISION_CONFLICT及实际提示，仍验证输入保留。dictionaries-browser-final.log保留查询/隐藏编辑表单共用placeholder导致的严格定位失败，改为定位真实查询区域并等待实际搜索响应。
- dictionaries-browser-complete.log完成真实创建、文本选项/停用过滤、保存、页面刷新/重开、实际并发版本冲突、本地值保留、显式重读恢复和另一租户不可见。dictionaries-full-real-browser.log的30条真实页面回归全部通过，包含R1、应用包、设备及真实ClamAV附件；未注入成功响应。dictionaries-options-runtime.png已检查，修正标签换行和控件边界布局。
- dictionaries-unit-final.log为433单测通过，dictionaries-contracts.log为21契约+15领域/Mock通过；dictionaries-all-types.log、dictionaries-all-build-final.log、最终页面重构建dictionaries-visual-build.log通过。dictionaries-final-lint-all.log无错误/6警告，其中2项为新选项编辑的明确丢弃确认。旧smoke3条和独立Mock3条分别通过，证据dictionaries-smoke-browser.log/dictionaries-mock-browser.log。
- 013仅应用专属开发演示库、API10890/网关4189。原R1包/卷/部署保留。引用保护与发布绑定、进程/数据库重启专项、完整字典项Mock、多分辨率/键盘及部署/备份恢复/兼容回退仍须继续，FP-008保持进行中。方案及回滚边界见full-product-dictionary-design.md，当前结果不替代新提交远端CI或全产品最终门禁。

### 字典远端验证

- f4aa56ded4ecf0285f1a4c1f47b6c64eba9f37d3的实际CI37007788125已通过，verify/real-business均success；归档ci-37007788125及dictionaries-remote-ci.json。远端112项数据库/API与30条真实浏览器通过。本结果不包含后续数据源登记增量，FP-008仍保留发布引用、恢复和部署等门禁。

### FP-011 受控数据源登记与查询首批

- 实施/阶段自检：Codex，2026-10-02。014新增form_data_sources独立登记表和四项权限，租户/字典组合FK、固定code/关联、版本、启停、幂等、失败回滚和事务事实审计。查询必须同时持有form-source:read及system:dict:read；只返回真实启用字典项的label/value与来源版本，不接受URL、脚本、任意查询参数或凭据。
- 内置字典查询设置5秒数据库语句超时及200项边界；外部HTTP白名单、响应适配和真实网络超时仍未实施，不以此内置查询替代。登记与编辑需要现有底层读取权，不能通过登记转授数据访问。应用配置页中的设计器现已提供真实登记、维护和查询预览；reference不回退旧裸URL Mock编辑器，无登记权限的R1账号不会自动请求该模块。
- form-sources-http-final.log的114项真实数据库/API通过，含双租户来源/底层引用拒绝、来源和字典停用、源编码/引用不可更换、未知参数/URL/类型拒绝、底层权限撤销、同key并发一次、失败回滚/恢复及服务实例关闭重建后重读。跨租户登记FK另由真实PostgreSQL约束验证。
- form-sources-application-browser.log及form-sources-context-browser.log完成实际应用配置中的登记、查询真实字典并过滤停用项、刷新重开、真实并发修改后的409/REVISION_CONFLICT、输入保留/显式重读恢复、启停与另一租户不可读；未注入成功响应。form-source-manager-runtime.png已检查实际界面。form-sources-full-real-browser.log的31条全量真实页面通过。
- 额外阻止旧查询覆盖新预览，并在账号/租户切换时清空编辑信息、预览和字典选择、重读当前列表；form-sources-context-unit-final.log用前一租户迟到响应验证不会显示旧标签。该单测使用模拟响应，仅证明客户端状态保护，不代替浏览器/数据库链路。保护后专属浏览器再验通过；新提交远端CI仍须覆盖完整回归。
- form-sources-unit-final.log为434单测通过，form-sources-contracts.log为22契约+15领域/Mock通过，form-sources-all-types-final.log、form-sources-all-build.log及后续form-sources-context-build.log通过。form-sources-lint-final.log无错误/6项既有警告，旧smoke3条/独立Mock3条分别通过（form-sources-smoke-browser.log/form-sources-mock-browser.log）。
- 首次类型检查发现DTO接口不符合ProTable的Record行类型，改为投影实际DTO字段后类型/构建通过，未使用any放过类型问题。form-sources-browser.log曾在旧独立设计器路径验证登记，截图暴露原Mock示例ID在真实服务不存在；正式路径改接实际应用配置的嵌入设计器。该独立设计器的草稿选择、真实版本保存与组合发布缺口列入FP-012，不能将本次数据源登记称作其修复。
- 014只应用专属开发演示库、API10890/网关4189，原R1包/卷/环境保留。本次尚未把登记ID写入表单字段/发布快照或执行业务提交选项校验；这些是下一步FP-011/012工作。复杂校验/联动、远程HTTP、包重绑、数据源Mock、真实进程/数据库重启、完整键盘/分辨率、备份/新部署/回退均保持开放；FP-011不勾完成。方案见full-product-form-data-source-design.md。

### 数据源登记远端验证

- 6b6878fe40aa9709561505c37bfe4cba08dedcdf的实际CI37012165408通过，verify/real-business均success；归档ci-37012165408/form-sources-remote-ci.json。远端114项数据库/API和31条真实浏览器通过，本结果不包含随后v2字段绑定增量。

### FP-011/012 受控字段绑定与真实草稿接入

- 实施/阶段自检：Codex，2026-10-02。015增加草稿/发布与登记源的租户组合FK。表单v2字段引用source key，登记ID由服务端验证，发布固定一次选项集合、来源/字典版本并进入不可变快照；v1历史继续读取，流程格式仍v1。单源发布最多100选项，规范化值冲突明确拒绝。生产业务数据、URL和凭据不作为源定义输入。
- 新保存/提交同时验证快照选择集合、当前源/字典可用性、使用/底层权限和选项仍启用；新增加的值须重新发布后才能用。原快照标签不被字典更新改写。发布命令旧receipt重放也重新检查源读取权；无使用权的历史读取仅投影已选值，移除源引用及未选内部选项，禁用edit/submit动作。审批者仍按已授权任务读取记录，不自动获底层数据源查询权。
- 真实草稿保存/重开、跨租户/伪造快照/无效选项/停用/撤权拒绝、当前角色与来源引用检查及事实审计已接入。复制定义去除旧源快照，重新检查并建立独立草稿引用。v1应用包明确拒绝尚未有重绑声明的来源引用；完整包来源重绑仍由FP-019继续，不能以拒绝功能代替最终交付。
- form-bindings-http-final.log与随后form-bindings-preview-http.log的116项数据库/API通过，含实际发布/引用持久化、固定集合、新值不可用于旧发布、真实提交、旧回执撤权、历史未选值不泄漏、跨租户及伪造/停用源拒绝。服务端预览对真实草稿和来源执行校验，预览不创建业务记录；非法选择实际422。
- 客户端保持v2来源及快照而不降级，未来v3拒绝；通过认证客户端查询登记源，发布运行仅使用快照与当前启用值的交集，保留原标签，失败不返回模拟选项。源选择配置及单选运行支持登记引用。form-bindings-runtime-unit.log/对应24契约+15领域检查验证格式、源读取/旧标签/规范化冲突与非法字段；具体文件为form-bindings-contracts-final.log。
- 独立设计器从真实草稿列表选择/重读，不再默认请求Mock示例ID；创建/保存使用实际revision及稳定命令key，输入错误保留；已关联表单进入实际应用组合发布页，未关联草稿明确提示先配置应用，未虚构独立发布成功。兼容旧不带key的草稿调用暂保留，统一迁移及未关联草稿到通用应用的完整关联/发布、分页/检索及版本比较仍待FP-012完善。
- form-bindings-browser.log保留Arco导入弹窗缺少测试假定dialog角色的失败，添加实际form-schema-import标识后操作继续。form-bindings-browser-import-fixed.log保留测试错误期待英文running、实际已是中文审批中的失败；改为匹配真实中文heading，不改变提交断言。form-bindings-browser-status-fixed.log及全量form-bindings-full-real-browser.log通过，后者32条；实际导入绑定/保存/刷新重开/发布、员工真实选择/保存/提交、独立草稿真实保存和进入组合发布均通过。form-binding-submitted-runtime.png已检查，显示原快照选项标签。
- form-bindings-preview-unit.log为437单测通过，form-bindings-contracts-final.log为24契约+15领域/Mock通过；form-bindings-types-final.log、form-bindings-preview-build.log通过，form-bindings-preview-lint.log无错误/6警告。Mock3条、旧smoke3条分别通过（form-bindings-mock-browser.log/form-bindings-smoke-browser.log）。首次详情标签格式调整的prettier失败保留于form-bindings-record-display-build.log，消除条件表达式缩进冲突后重建通过。
- 015已应用专属开发演示库，API10890/网关4189；R1原包/卷/部署保留。只在明确demo初始化中为两名合成员工授使用/字典读取权，审批者不自动授予。复杂校验/联动、外部HTTP、完整源配置Mock、包重绑、全部键盘/分辨率、真实进程/数据库恢复、部署/备份/回退仍未齐备，FP-011/012/019保持进行中。当前结果仍须新提交CI，不能替代全产品最终门禁。

- 随后补真实通用草稿预览：form-bindings-preview-http.log的116项再次通过，预览读取当前来源、校验真实字段/计算值，非法选项422且业务记录数不变。form-bindings-preview-unit.log的437项通过、form-bindings-preview-build.log完整构建通过，form-bindings-preview-lint.log无错误/6警告。预览按钮在reference显示服务端校验，不再使用“提交Mock”文案。

### 表单绑定远端验证

- 7734fff810fd7e39b28704cb6e7759f0ab796b7d的实际CI37037025632已通过，verify/real-business均success；归档ci-37037025632及form-bindings-remote-ci.json。远端116项数据库/API与32条真实浏览器通过。后续应用包来源重绑不包含于这个提交，FP-011/012保持进行中。

### FP-019 登记数据源应用包重绑增量

- 实施/阶段自检：Codex，2026-10-03。应用包v2包含来源槽位、form-contract v2/registered-sources v1依赖；保留v1。导出统一重映射来源ID、source key及字段引用，清除全部来源快照/版本和默认值。源成员、应用及登记ID不作为目标可执行引用；来源数据不随包携带，脱敏清单明确列出。
- 目标租户显式绑定人员和自身登记源，校验准确槽位集合/类型、格式/依赖/摘要、当前权限及底层可用性；同事务创建独立应用/草稿/引用，幂等恢复及审计。发布读取目标来源并生成目标快照，不复用源选项。导入仍不自动发布。
- package-sources-http.log的118项数据库/API通过，含真实源定义发布导出、去除原ID/原字典值/版本、目标重绑/独立发布/实际业务及两级审批通过、源值在目标业务拒绝、遗漏/多余/原租户绑定、伪造快照、来源权限撤销拒绝。package-sources-contracts.log的25契约+15领域/Mock通过，含v3/字符串版本/未知依赖/重复或悬空槽位/私有快照拒绝。
- package-sources-browser-label-fixed.log的v2/v1两个实际文件下载/上传/重绑/重开/配置/发布/业务提交路径通过；源包字节检查无源字段数据或ID，目标真实下拉使用目标字典，未注入成功响应。package-sources-full-browser.log的33项全量真实页面回归通过；application-package-sources-runtime.png已检查。
- package-sources-browser.log保留UI文案调整后旧测试假定“待绑定槽位”失败；恢复清楚的“人员待绑定槽位”文本同时保留新增数据源槽位，不删除旧v1断言。package-sources-browser-style.log保留新增测试for-of不符合lint的错误，改数组迭代后package-sources-browser-style-final.log无错误。
- package-sources-unit.log的437单测、package-sources-types-final.log的全部workspace类型、package-sources-all-build.log及后续package-sources-label-build.log构建通过；package-sources-lint.log无错误/6既有警告。旧smoke/独立Mock分别3项通过，证据package-sources-smoke-browser.log/package-sources-mock-browser.log。
- 本轮没有新增/改写数据库迁移，仍使用专属演示库和API10890/网关4189；原R1包/环境/卷保留。源/目标全新部署、完整格式迁移、HTTP/页面/物料/插件包、包容量/恢复及最终备份/回退等仍开放，FP-019保持进行中。当前结果仍需本轮新提交远端CI，不替代全产品最终交付。

### 应用包来源重绑远端验证

- d8c8eb7fbf6bd96b5b3b8cd6da6d9c7f4268d148的实际CI37050214019已通过，verify/real-business均success；证据归档ci-37050214019及package-sources-remote-ci.json。远端118项数据库/API、33条真实浏览器通过。此结果只对应该提交，不能证明后续表单规则或全产品交付完成。

### FP-011/012 结构化表单校验与单条件联动增量

- 实施/阶段自检：Codex，2026-10-03。方案见full-product-form-behavior-design.md。表单v2新增闭合validation/behavior：文本最小长度、邮箱/HTTPS/电话命名格式，同类型相等与日期/数值先后比较，单字段实际值驱动显示/条件必填。拒绝脚本/任意正则、未知规则、错误类型、悬空/自引用/联动字段级联、隐藏比较目标；整数条件按规范化数值匹配，日期验证真实Gregorian日历。固定R1请假契约拒绝新增此类规则，保持既有专用契约。
- 服务端草稿允许未填写字段，已填写字段执行校验；完整提交执行条件必填和比较。隐藏字段非空注入422，不以客户端隐藏代替接口校验。使用当前编辑值决定条件并清除隐藏值；历史只读详情不改写存储。规则保存并固定于发布快照，编辑后续草稿不改变运行实例。无数据库迁移，原R1交付包、部署及卷保留。
- 设计器提供结构化控件并写回真实AST；reference模式隐藏旧任意自定义规则编辑框。运行表单使用共享条件、格式、日历和比较函数。form-behavior-browser.log的实际编辑/保存/刷新重开/发布/员工填写/隐藏值清除/校验错误保留输入/缺必填提交拒绝/修正提交成功/另一租户详情拒绝通过，未注入成功响应。form-behavior-runtime.png已检查，发布后业务内容及提交历史可读。
- form-behavior-http.log的119项数据库/API通过，新增真实持久化规则、隐藏注入/非法日期/逆序比较/格式错误422、缺条件必填无流程副作用、更新幂等、双租户拒绝及真实子API进程替换后读原快照并提交。form-behavior-unit.log的438单测通过，含运行联动值清除；form-behavior-contracts-final.log的30契约+15领域/Mock通过，覆盖闭合规则与旧R1拒绝。form-behavior-all-types.log及form-behavior-build.log通过。form-behavior-lint.log保留新增单测未格式化的失败，修复后form-behavior-lint-final.log无错误/6既有警告。
- 多级联动、更多复杂控件、受控HTTP及参数数据源、版本比较/完整迁移、全部键盘/分辨率、新部署/备份/数据库恢复/回退和全产品正式交付仍开放。FP-011/012保持进行中，不因这批规则与阶段验证勾完成；本批源码仍须对应提交远端CI。

- form-behavior-full-browser.log的34项完整真实浏览器回归通过；独立Mock3项与旧smoke3项通过，证据form-behavior-mock-browser.log/form-behavior-smoke-browser.log。旧smoke仍有10888未运行的代理报错，不能用该Mock路径证明真实服务；实际后台证据是10890/4189及119项隔离数据库测试。
- 随后加入“隐藏字段配置默认值”的回归，在form-behavior-default-browser.log发现保存路由切换时编辑值被默认值重新填入并触发未保存提示，失败截图/上下文归档form-behavior-default-failure。修复运行时：已有modelValue使用其准确字段集；默认值只在未提供编辑数据时初始化，各控件不再次按default-value回填。form-behavior-unit-final.log的439单测通过，新增schema重建保留明确空值/省略字段的回归。最终默认值回归和源码提交的远端CI须单独确认，首次34项结果不代替最终变更验证。

- 默认值与modelValue恢复修复后，form-behavior-full-browser-final.log的34项完整真实页面重新全部通过，包含配置默认值后隐藏/再显示保持空值、保存无虚假未保存弹窗、缺条件必填被真实服务拒绝、修正并刷新后提交。form-behavior-default-central-build.log重建通过；form-behavior-central-runtime-unit.log的10项运行表单回归通过；form-behavior-lint-final2.log无错误/6既有警告；form-behavior-smoke-browser-final.log的旧3项再次通过。待本批提交对应远端CI确认。

### 表单规则与联动远端验证

- eac1e3481ff30fd87902c1b6ec6ced4422dbb21c的实际CI37061251992已通过，verify/real-business均success；归档ci-37061251992（实际数据库/API与浏览器报告，以及workflow.log）及form-behavior-remote-ci.json。远端439单测、30契约+15领域/Mock、119项数据库/API、34条真实浏览器通过。该提交不包含后续版本对比，仍非全产品最终交付。

### FP-012 发布版本对比与绑定草稿重开

- 实施/阶段自检：Codex，2026-10-03。方案见full-product-form-version-design.md。应用配置新增只读表单版本对比，支持发布版本→当前编辑/已保存草稿以及发布版本→发布版本；未保存状态、空历史、非法定义错误态明确。按字段uid对齐增删、控件/标签/顺序/必填/数值/选项/规则/联动/来源引用变化，独立比较布局/公式/格式以及登记来源和生成快照。对象键序不当成变化，字段和选项数组顺序保留；实际文本值不因碰巧等于枚举名被翻译。比较不执行脚本、不写定义/活动版本/业务数据。
- 沿用带租户条件及实时权限检查的真实应用/草稿API。配置页按应用实际绑定formDraftId/workflowDraftId直接读取，不再因首100条目录缺少旧草稿而无法配置，也不自动选其他应用草稿。R1保留目录选择并显式包含当前绑定；不存在/无权限明确错误。上下文变化/读取失败清除旧定义，加载ticket及账号/租户/应用匹配阻止旧响应覆盖。非法待编辑规则的预览用错误态保留输入，修正规则可恢复，不让异常渲染中断页面。对比tab固定注册，异步加载时只切换内容。
- form-versions-http.log的120项数据库/API通过，新增真实两次发布及旧快照保持、超过100条表单/流程目录后按绑定ID读取、跨租户/配置撤权拒绝；使用隔离测试库合成目录，不重置已有开发或R1数据。form-versions-contract-test.log的35契约通过，涵盖键序、增删改/位置、规则/选项顺序/来源快照/公式、输入不变、非法未来定义明确拒绝；form-versions-contracts-final.log还含15领域/Mock通过。form-versions-unit.log的441单测通过，包含版本选择、未保存标识、真实文本保持、非法定义错误且不伪称无变化。
- form-versions-browser-selector.log真实版本路径通过，随后form-versions-browser-final.log增加非法最小长度→明确对比/预览错误→输入保留→修正恢复后再次通过。真实API创建101条后续草稿，确认原绑定不在首100条仍重开；保存发布v2、比较v1/v2、刷新重开、1280键盘焦点、旧在途设备领用仍显示原标签、双租户拒绝均通过，无成功响应注入。form-version-comparison-runtime.png已检查，基准/目标及变化表格可读。form-versions-browser.log保留首次tab文字与标题重名的测试定位失败，改精确tab标题定位后重验。
- form-versions-shared-build.log保留首次ComputedMoneyField接口缺Json索引的类型失败，改显式投影合法JSON字段后form-versions-shared-build-final.log通过，未使用any绕过。form-versions-build.log完整构建、form-versions-preview-build-final.log后续前端构建、form-versions-all-types-final.log全部workspace类型通过；form-versions-lint.log无错误/6既有警告。首次嵌套返回的格式错误保留form-versions-style-next.log，改普通if后修复。
- 本次无新增迁移，版本与旧业务快照不改写；原R1包/环境/卷保留。多级联动、更多控件、受控HTTP参数源、完整格式迁移、独立设计器目录分页/关联发布、全套键盘/分辨率、新部署/备份/恢复/回退及全产品交付仍开放，FP-011/012保持进行中。本批完整回归及对应提交的远端CI仍须逐项确认，不能用此前提交绿色结果代替。

- form-versions-full-browser.log的35项完整真实页面回归通过，新增比较旧版本后活动版本选择仍为v2；R1在超过100条新增目录后仍完整通过。form-versions-unit-final.log的441单测通过；form-versions-smoke-browser.log及form-versions-mock-browser.log分别3项通过。旧smoke依然有10888未运行的代理报错，不视为真实后端证据。当前阶段仍需本批新提交对应远端CI，完整模块的部署/恢复等门禁保持开放。

### 表单版本对比远端验证

- 7a1168201d122da7aca6668fc1eb74441770af76的实际CI37064739337已通过，verify/real-business均success；归档ci-37064739337及form-versions-remote-ci.json。远端441单测、35契约+15领域/Mock、120项数据库/API与35条真实浏览器通过，未包含后续条件流程。

### FP-013 条件流程真实执行增量

- 实施/阶段自检：Codex，2026-10-03。方案full-product-conditional-workflow-design.md。工作流v2增加闭合all/any谓词、文本相等/不等及整数/精确分位金额/真实按日日期比较，发布绑定同批表单字段及已登记计算结果。未知引用/类型、脚本/多余属性/未来v3拒绝；v1串行保持原义，旧condition/parallel仍拒绝，真实parallel/会签不伪装已支持。
- 条件精确两条matched/fallback边，非条件单出边；拒绝循环/不可达/悬空/重复/缺默认分支/无审批路径。互斥路径可汇合，实例只有一条活动路径。服务端提交和审批后推进读取已固定业务字段及服务端计算结果；未填可选值不匹配，所有谓词先校验再组合。条件事件、history/outbox/任务/业务状态与审计在同一事务；审计及历史只记录节点/所选分支，不记录判断操作数原文。
- 新迁移016_conditional_history.sql扩展route事实类型，001至015不改写。只应用专属开发demo（conditions-demo-migrate.log），原R1包/部署/卷保留。先前数据库门禁精确名单未包含016，在conditions-http.log失败；更新明确预期迁移名单后conditions-http-fixed.log的124项通过，未删测试/降低断言。下一处理人停用或故障时原任务和分支均回滚；恢复并发重试只有一个下一任务及一次route。真实子API进程替换后按旧release阈值继续，后续草稿变化不改原实例，撤回取消已选分支任务。
- 真实设计器提供节点选择、下一节点、关联字段/操作数/组合及两个目标选择，保存重开后保留结构化规则。reference不展示任意表达式输入；Mock旧可视配置保持兼容，结构化迁移v2不丢分支且未来v3拒绝。用户可实际配置起点→条件→不同处理人→共同抄送→结束，非仅导入JSON模拟。
- 应用包v2明确conditional-workflow v1依赖、保留条件和表单字段引用，重绑所有分支处理人后目标租户独立发布运行；无来源槽位时不额外请求或要求字典来源权限。旧v1/v2串行包保留，v2表单或流程不能冒充v1依赖。conditions-package-http-fixed.log的125项数据库/API通过，含跨租户目标真实审批、两路金额边界、路由事实去重/无原值、越权拒绝、故障回滚/恢复/并发、进程替换、固定快照/撤回及发布拒绝且旧活动版本不变。
- conditions-contracts-corrected.log的36契约+18领域/Mock通过，新增DAG互斥汇合、顺序独立、all/any、缺值和错误操作数不被短路隐藏、真实日期/精确金额、脚本/错类型/绕过审批/缺边拒绝，以及条件包显式依赖。原未来格式测试从已支持v2改为未知v3，并新增v2正向，仍拒绝未知版本。conditions-unit-final.log的443单测通过，含结构化迁移、未来格式拒绝及新增节点不删其他分支连线。
- conditions-browser.log保留首次Arco输入wrapper不可fill的测试定位失败；精确到实际input后conditions-browser-selector.log通过。真实UI设计/保存重开/发布、99.99元普通与100.00元高额各实际审批通过、未选处理人不能处理、跨租户拒绝，无成功响应注入。condition-approved-runtime.png已检查，正确route与审批/抄送历史可读。condition-editor-runtime.png首版检查发现X6自动尺寸与最小布局循环将属性撑至15244px，改固定有界布局、侧栏滚动；conditions-browser-layout.log通过新增1280焦点及属性高度<1000检查。分支目标滚动/可见/键盘检查随后纳入全量回归，尚需确认最终结果。
- conditions-final-build.log完整构建、conditions-all-types.log全部workspace类型通过；conditions-lint.log无错误/6既有警告。conditions-shared-build.log保留Mock平铺DTO被误读成fields的类型失败，按真实DTO修复后构建通过。conditions-contracts-final.log保留新增断言误读DomainError字段的失败，依据实际businessCode修正后conditions-contracts-corrected.log通过。
- 条件运行中的完整Mock页面、更多包原生文件往返与容量/压力、全套键盘/主题/分辨率、新部署/备份/数据库恢复/兼容回退及正式交付仍开放，FP-013保持进行中。并行/会签、转交与异常/调度分别留在FP-014/015/016，不删除。当前36条全量真实浏览器及新提交远端CI仍待结果，先前绿色提交不能替代本批门禁。

- conditions-full-browser.log的36项完整真实页面通过，含侧栏分支目标滚动进入视口及1280键盘焦点；condition-editor-branches-runtime.png补齐目标选择证据。随后明确提示可选空值按不匹配处理，整数判断值清空/非法文本不被默认为0；错误草稿保留于实际编辑状态，服务端保存422且发布禁用，修正字段/值后保存发布恢复。conditions-browser-invalid-recovery.log的真实负向恢复通过，完整后续回归仍需确认。
- 进一步修正运行时人员语义：发布仍检查全部配置人员；已有固定记录按实际选中路径检查人员及自审，未选分支停用或包含申请人不会错误阻断有效分支，选中的停用/自审路径仍拒绝且无实例副作用。与数据库实现一致调整领域Mock的路径选择及route历史。conditions-selected-path-http.log的126项通过，随后conditions-self-route-http.log的127项通过，覆盖未选分支停用以及选中路径SELF_APPROVAL拒绝。conditions-release-build.log完整构建、conditions-all-types-release.log全workspace类型、conditions-unit-release-final.log443项、conditions-contracts-release.log36契约+18领域/Mock通过；conditions-lint-release.log无错误/6既有警告。

- 最后完成conditions-full-browser-final.log的36项全量真实回归（包含错误规则真实保存拒绝/输入保留/发布禁用及修正恢复），conditions-mock-browser-release.log/conditions-smoke-browser-release.log各3项通过，原Mock/权限回归保留。conditions-unit-release-final.log443项通过，conditions-release-build.log和conditions-all-types-release.log通过。本批仍须对应新提交远端CI；整个Goal及FP-013正式模块交付保持开放。

- 1622e2527d3e4e58ca65e65b7c8ac785cd652f1a提交后边界复核发现：自定义表单允许数量及单价各1000000并生成合法精确总额1000000000000.00，旧条件操作数十位整数位限制却拒绝该结果。修正运行操作数为最多14位整数位并检查安全整数分位，不缩窄既有计算范围；条件定义字面值仍按有界契约验证，超出9007199254740991分的操作数明确拒绝。新增领域和真实API用例保证大额计算总值进入实际高额任务；这项后续修复需独立证据及远端CI。
- conditions-money-range-build.log共享构建通过，conditions-money-domain.log19领域/Mock通过，conditions-money-http.log128项数据库/API通过，conditions-money-lint.log无错误/6既有警告。大额修复没有更改Schema版本、图或UI；最终提交仍需完整远端CI确认。

### 条件流程远端验证

- c34f718c80c399d0cfdf6572e7ab66bdc24f832d（含1622e252条件流程及大额边界修复）的实际CI37072155362已通过，verify/real-business均success；归档ci-37072155362及conditions-remote-ci.json。远端443单测、36契约+19领域/Mock、128项数据库/API与36条真实浏览器通过；本条不包含后续并行与会签。

### FP-014 耐久并行活动、配对汇合及会签增量

- 实施/阶段自检：Codex，2026-10-03。方案full-product-parallel-workflow-design.md。工作流v3明确parallel/join配对、branch-N通道及sign的all/any/quorum规则；保留v1串行/v2条件义，未知未来v4拒绝。最大100节点/200边、每fork2至10分支、每sign2至20名不同签署人。静态拒绝循环/悬空/不配对/分支交叉或提前结束，条件互斥合流及嵌套并行有明确活动归属，不把一份多人列表称作多个执行分支。
- 新迁移017_parallel_activities.sql保存每个审批/会签/分叉活动、父组与分支、实际到达集合、阈值、状态和revision，复合租户/实例FK。新任务绑定activity_id；遗留activity_id空值保留单节点唯一部分索引，新节点按签署人唯一，旧不可变release不重写。001至016校验和不修改，只应用专属demo（parallel-demo-migrate.log）；原R1包/环境/卷保留。
- 提交创建实际同时活动的分支及待办；票、活动、汇合、业务、任务、history/outbox/审计同事务。all/any/quorum按批准及剩余可能票数判断，达到批准阈值取消剩余签署，不可能达到阈值则整个实例拒绝并取消其他活动/待办。撤回取消所有活动。所有分支到达配对join才推进，嵌套join保留父分支归属；实例/记录锁及任务CAS/幂等确保一次效果，恢复读取数据库和原快照，不依赖内存计数。
- 事实写入抽取为workflow-effects.ts以避免leave与活动执行器的依赖环，沿用原通知/历史/审计写入；API详情提供实际活动进度及各签署计数，只给本人可处理任务。同一人多任务提供显式选择。设计器增加分叉+自动配对join、入口/下一节点、会签参与者及阈值；v3保存重开和包parallel-workflow依赖/目标人员重绑保留结构，旧v1/v2不冒充支持新格式。
- parallel-concurrency-http.log的137项数据库/API通过，包含同时创建多待办、all等待/any部分拒绝仍可批准/quorum精确票数、剩余取消/整流程拒绝/撤回、初始半分叉及最后汇合故障回滚/恢复、同一签署竞争key仅一次计票、最后票并发单join及单后续任务、真实子API进程替换、原快照保持、嵌套分叉到各自join、跨租户应用包重绑后独立活动及双租户拒绝。此前parallel-http.log133项、parallel-nested-http.log135项、parallel-package-http.log136项为渐进证据，不能替代最新137项。
- parallel-contracts-final.log36契约+22领域/Mock通过；新v3正向、all/any/quorum、嵌套/交叉/提前结束/环/阈值/缺配对拒绝。仅将已支持的workflow未来格式断言移到v4，form和package的未知版本仍保持各自门禁，不删负向。parallel-unit-release.log444项通过，含自定义结束ID的配对生成、v3添加条件不降版本、保存格式不丢channel以及未知版本拒绝。
- parallel-browser.log真实UI两分支与会签通过，parallel-browser-negative.log增加零票阈值→真实保存拒绝/原输入保留/发布禁用→修正后保存重开及实际三次签署完成再通过，无成功响应注入。两个审批人同时看见真实待办，先完成一分支保持1/2，签署1/2继续等待，最后署名才join/抄送完成；外租户详情/活动拒绝。parallel-approved-runtime.png已检查，完成状态及活动计数可读。parallel-build-all.log首次helper嵌套返回格式失败，修正普通if；parallel-build-recovery.log一度自定义endId未声明，补正确引用后parallel-build-all-final.log完整构建通过。parallel-all-types.log全workspace通过，parallel-lint-all.log无错误/6既有警告。
- 并行/会签完整Mock运行、更多原生文件包往返/容量/压力、所有分辨率/主题/键盘、数据库服务重启、新部署/备份恢复/兼容回退及正式环境交付仍开放；FP-014保持进行中，FP-015转交/异常、FP-016耐久调度不删除。本批37条全量真实浏览器及新提交远端CI仍须确认，先前提交绿色不能代替。

- parallel-full-browser.log的37项完整真实回归通过，原R1/条件/包/权限/文件均保留；parallel-mock-browser.log与parallel-smoke-browser.log各3项通过。旧smoke依然有10888未运行代理报错，不替代真实后台证据。parallel-schema-unit-final.log补直接channel重开保留断言通过；本批整体仍须新提交远端CI，正式模块部署/恢复等门禁保持开放。

### 并行与会签远端验证

- a70c801a34a1ab45081b5d90cfd0b5a6a29e29af的实际CI37077393324已通过，verify/real-business均success；此前归档parallel-remote-ci.json。2026-10-03接管时通过GitHub再次读取该提交的success，证据takeover-20261003/parallel-ci-confirmed.json。本条不包含后续转交/恢复。

### FP-015 转交、异常恢复及接管后的失败回归

- 实施/阶段自检：Codex，2026-10-03；接续p1的完整Goal，不改变冻结范围。分支codex/full-product-completion，继承a70c801。接管时保留13个已跟踪文件改动及12个未跟踪实现/测试/设计文件，快照takeover-20261003/inherited-working-tree.patch、inherited-untracked.tar.gz及baseline.json，未重置R1或开发数据。原目标全文仍位于用户附件goal-objective.md，当前Goal引用原文及本任务矩阵。
- 018_workflow_assignments.sql新增原签署票位、实例级下一节点覆盖和不可变分配事实，沿用复合租户/实例/任务FK及业务→实例→任务锁序。本人转交与管理恢复独立权限；目标启用/可审批/成员范围、自审、会签重复票位及运行状态由后端复验。转交保留task.id和原票位，旧人失去处理、新人取得真实待办；恢复只针对当前失效人或实际阻塞前沿，不改release、阈值和已签票，不代替原人批准。命令回执、任务/覆盖、history/audit/Outbox同事务。
- p1的recovery-full-browser.log为37通过/1失败，未被当成成功。接管后的reproduce-browser.log再次复现设备领用主管打开待办中心跳403；center-before-fix.log新增单测先失败。原因是恢复组件的v-else误归属，主管同时加载真实与演示运行时，演示配置请求403使页面离开。修复真实租户分支并保持原显式Mock入口，center-after-fix.log及center-browser-after-fix.log（设备领用与恢复两条）通过。
- 新增恢复单独权限回归在recovery-access-before-fix.log失败：前端路由/菜单及真实服务端菜单仅接受todo。修复为todo/recover任一入口，各自仅加载被授权的组件。extended-before-fix.log为147通过/2失败，另确认通用业务Outbox链接被旧worker白名单拒绝、不能真正生成消息；补受控business/records链接，保留外部/脚本/无关/路径穿越拒绝测试。
- takeover-20261003/integration-final.log的150项真实数据库/API通过，新增转交与批准竞争仅一次票位效果、转交与撤回后无pending、终态恢复拒绝、历史撤权后详情拒绝、真实worker投递/去重、非法通知链接拒绝，以及真实子API进程替换后读取覆盖、继续原人决策并创建目标任务。原有范围/双租户/停用/自审/重复会签票位/故障回滚/幂等/汇合前沿/不可变事实回归保留。
- takeover-20261003/unit.log的448单测通过，contracts.log为37契约+22领域/Mock通过；build-final.log完整workspace构建、types.log全部workspace类型通过。lint-final.log无错误/6既有警告，首次lint.log的新增单测key格式错误已修复，不删检查。
- takeover-20261003/full-browser.log的39项完整真实页面通过：原R1、设备领用、条件、并行、跨租户包、文件/扫描及权限等保留，新增本人转交→原人失权→实际目标审批、下一人撤权阻塞→管理恢复→原人重新决策→目标审批及原release固定，另验证只有恢复权限的新账号进入真实检查页且不请求个人待办/配置。mock-browser.log和smoke-browser.log各3项通过；旧smoke仍有10888未运行的代理错误，只作为Mock兼容证据。
- 运行环境为macOS arm64/Chromium、Node24.17.0/npm11.13.0/PostgreSQL16，本地专属demo API10890、生产前端预览4189及ClamAV13310。API和worker使用继承私有env重启，未重新种子；原R1容器/卷/包保留。更多转交/恢复的Mock一致性、全主题/分辨率/键盘、数据库容器重启、新部署/备份恢复/兼容回退及目标环境交付仍开放。关闭新增入口可撤销transfer/recover权限并保留兼容API及018，不自动down migration或删除分配事实。本批新提交远端CI须单独确认，FP-015及整个Goal保持进行中，FP-016继续作为下一项真实实施。

- recovery-1280-browser.log补最终1280×720恢复专权页面、实际Tab焦点位于视口以及原转交/恢复闭环，两条真实用例通过；recovery-only-runtime.png已检查，任务检查、错误/权限入口及文字可读。lint-release.log再次无错误/6既有警告。本地完整回归不替代当前提交的远端CI。

### 转交与恢复远端验证

- 实现提交0fcbb93a2ea28141a7175bad0d7e5ca1267f493e已推送开发分支；实际CI37095404333的verify/real-business均success，链接https://github.com/wzfdhr/af-ideal-admin/actions/runs/37095404333 。验证以该SHA为准，不使用旧并行提交的结果代替。
- 归档takeover-20261003/recovery-remote-ci.json、ci-37095404333-workflow.log及ci-37095404333/real-business-evidence。实际远端integration.log为150通过/0失败，browser.log为39条真实用例通过；verify的37契约+22领域/Mock、448前端单测、类型、构建和两组三条浏览器门禁通过。frontend-evidence未生成文件型artifact，前端步骤保留完整workflow日志；没有将空artifact称为已下载。
- 本地verification-manifest.json记录实现SHA与各验证日志摘要；后续本任务仅追加本条CI记录和FP-016设计，未改变0fcbb93的运行源码。未合并、创建正式tag、公开发布或部署客户生产。FP-015的完整部署/恢复/Mock一致性等门禁及整个Goal继续开放。

### FP-016 下一批耐久调度

- 方案已保存full-product-workflow-scheduling-design.md，FP-016-A至E明确闭合v4配置、期限提醒、等待活动、租约/唯一效果、受控恢复、原并行/会签归属及独立部署恢复证据。已核实多处version===3分流、包依赖和原事实主体约束，下一步先补契约/图校验失败回归，再接019持久化和worker。
- 当前为设计进展，无timer表、真实调度或验收结论，不将方案写成FP-016实现完成。实际执行者仍为本任务Codex，原冻结功能和成功标准保留。

### FP-016 定时等待、期限提醒与实际恢复增量

- 实施/阶段自检：Codex，2026-10-03，继承bb0e33b，未缩减全产品范围。方案full-product-workflow-scheduling-design.md从设计接入实际参考后端；v4显式wait/delaySeconds与approval/sign.deadlineSeconds，有界1秒至30天，所有完成路径仍需实际审批。v1至v3保持原义，未知未来v5拒绝。客户端、引擎、发布/提交/详情/恢复前沿、包依赖及设计器逐处接入v4，没有只放宽parser。
- 019_workflow_timers.sql保存固定版本/活动/计划时间、状态、revision、领取租约和有限重试，以及不可变定时事实。复合FK、唯一效果索引和计划身份触发器阻止跨租户、重复唤起和改写dueAt。001至018不变；独立开发库迁移前的私有备份before-019.dump与demo-migrate.log保留，原R1容器/卷/包未更新。
- 原worker增加定时循环。等待点没有伪审批任务，到期按原快照、字段和实例覆盖推进，保持父组/分支/join归属；期限只提醒实际pending票位的当前有效处理人，转交不重置期限，不改变投票。业务→实例→活动→timer锁序内复验claim及实际运行状态，唤起/任务/历史/审计/Outbox/完成同事务。终态/阈值/撤回取消不再需要的计划。暂时失败退避、失权/租户停用blocked、耗尽failed，原计划和失败事实保留。
- 自动事实使用NULL操作者与“流程调度服务”，HistoryRecord.operatorId放宽为可空。数据库约束禁止系统历史冒充approve/reject/withdraw等人类决策；定时事实/计划身份不可变。新增timer:read/timer:retry独立权限；替换实际下一票位同时要求workflow:recover与申请人/原人/目标范围。恢复命令闭合原因/版本/完整映射，幂等回执重放仍复验当前权限与范围。
- scheduling-20261003/domain-before.log保留初始v4不支持的失败；domain.log三项新增图/配置通过。contracts.log首次出现旧“未来v4”断言失败，仅将已支持的未来门禁移到v5，并保留v4正向及脚本/图/票数负向；contracts-final.log为38契约+25领域/Mock全部通过，不删除非法配置测试。types-ui.log及types-release.log全workspace通过；build.log完整前后端构建通过。lint.log保留新文件格式/导入和Vue嵌套缩进失败，采用普通if及明确body字段修正，lint-corrected/lint-complete.log无错误/6既有警告。
- integration.log首轮156、integration-immutable.log157项真实数据库/API通过；integration-recovery.log的160通过/1失败保留。故障注入原本可命中另一条先执行任务，修正为绑定目标timer ID；提交后注入只在实际效果事务成功后触发。integration-final.log最新161项/0失败，覆盖真实到期、两worker竞争、期限转交、原签署阈值、并行等待/join、当前/未来失权恢复、自审/跨租户/改dueAt拒绝、固定包重绑和原发布版、撤权回执拒绝、最终租约失败、事务回滚及目标timer真实SIGKILL领取后/效果提交前/提交后唯一效果。测试使用真实数据库时钟，未用改写dueAt伪造计划到期。
- 设计器可添加定时等待、配置期限、错误输入保留、保存重开/发布；运行页显示北京时间、计划/执行/失败状态和系统事实。管理页按timer:read独立加载，只读账号不挂载或调用个人待办/配置/恢复，原始retry请求403。browser.log两条新增真实路径通过，browser-permissions.log加入只读账号后3条通过；full-browser.log最新42条完整真实浏览器通过，原R1/第二模板/条件/并行/包/权限/文件保留。450单测通过于unit-final.log，含v4添加条件/会签/并行不降版本和定时专权入口。两个既有Mock/旧smoke各3项通过；旧10888代理报错仅是Mock路径，不冒充实际后台证据。
- timed-approved-runtime.png、timed-recovery-runtime.png及timed-recovery-controls.png实际像素已检查；1440设计/运行及1280恢复控件、错误原因保留和按钮焦点有具体证据，没有据此宣称全面无障碍。真实浏览器完成设计→发布→员工提交→等待唤起→实际期限消息→两人审批；另一条实际撤权→blocked→候选替换/原因确认→唤起/人工审批，原release保持；未注入成功响应。
- verify-workflow-timer-recovery.mjs使用实际pg_dump/pg_restore到新库。database-recovery-first.log保留初次主管会话在备份后才创建、恢复库401的失败；修正为备份前建立需验证的会话。database-recovery-final.log和database-copy-final/report.json通过，19份迁移及7关键表计数一致，恢复库沿原版本/计划唤起并批准一次，原库保持running/pending且无目标任务。演练只停止/恢复专属开发worker，自己的随机临时库已清理；dump私有、CI排除且未进入Git或应用包。本证据是现有本地PostgreSQL服务中的独立库恢复，不是新部署或客户环境验收。
- 更多嵌套等待/条件组合、全套主题/密度/键盘、Mock定时一致性、独立定时开关、容量/延迟及性能测量、数据库容器重启、新环境部署和v4兼容回退仍开放。FP-016保持进行中，本批新提交对应远端CI尚待实际执行；整个Goal不标完成。恢复部署保留019及v4兼容执行器，不能把v4在途实例交给只支持v3的旧服务或删除定时事实。

### 定时与期限恢复远端验证

- 实现提交87eaa025268293ee5f5f8317dce95468675ce904已推送开发分支，实际CI37099940512的verify/real-business均success，链接https://github.com/wzfdhr/af-ideal-admin/actions/runs/37099940512 。归档scheduling-20261003/remote-ci.json、ci-37099940512-workflow.log和ci-37099940512/real-business-evidence；实际远端161项数据库/API、42条真实浏览器、450单测、38契约+25领域/Mock、类型/构建及两组三条既有浏览器通过。
- 浏览器视觉复查后明确修正两个细节：勾选框与标签同行显示，恢复原因修正后清除原最小长度错误；browser-final.log三条重验通过，build-final.log重建、lint-final-all.log无错误/6既有警告。上述修正已包含在87eaa02及实际远端回归中；未使用旧转交提交的绿色结果替代。
- verification-manifest.json记录实现SHA及本地检查/恢复报告摘要。此为未公开发布的开发增量；新部署、物理数据库重启、v4兼容回退、完整定时Mock和容量等门禁仍开放，FP-016及整个Goal保持进行中。

### FP-017/018 低代码真实运行下一批

- 已读取当前builder/api/schema及LA-038/039对应规则，确认runAction只有查询/刷新共用预览，其余只显示提示，ProForm只读、reference-api未接入，v1开放url/props及未来格式未闭合。缺口作为源码事实记录，未把Mock管理页标成真实完成。
- 方案full-product-low-code-runtime-design.md明确五种动作、后台登记来源/权限及字段投影、闭合v2配置、独立页面/发布存储、版本/灰度/回退、真实设备领用管理页和后续统计/图表、跨租户包/物料链路及验收顺序。当前是差距及设计进展，无实际低代码实现或验收结论；下一步补契约/非法动作失败回归并接真实存储与来源。

### FP-017/018 真实低代码配置、五动作及管理页增量

- 实施/阶段自检：Codex，2026-10-03，继承5a6af46。低代码进入真实参考后端，未将原v1 Mock演示升级成虚假真实结论。方案full-product-low-code-runtime-design.md记录已实现边界；页面包/完整物料市场/更多来源及正式交付仍保留原FP任务。
- 020_low_code_pages.sql分别保存受控来源、页面草稿、不可变发布版和引用FK。来源只有application-records/registered-dictionary两种固定适配器，不接受url/method/headers；发布固定schema/source快照/hash，来源身份不可重定向，tenant FK防止外部引用。配置目录/对象/写入按创建者成员范围，幂等回执重放也检查当前范围；运行权限不授予业务或配置权限。
- v2物料、布局、列、统计口径、动作/目标/命令/路由闭合，未知v3拒绝，原v1显式Mock保留并拒绝未来格式。contracts-before.log为新契约不支持的实际失败；contracts-initial.log新增3契约通过。首次shared.log/类型检查发现不完整target收窄及共享事务函数client类型，按明确返回/PoolClient修正，没有any或删断言绕过。
- create/save/start从原business-records回调提取同一连接事务函数，业务角色/归属/字段/版本、附件就绪、发布快照、审批/历史/审计/Outbox保持原义。低代码命令在其幂等事务内检查当前页面、灰度选版、目标和来源，再调用这些领域函数；故障整体回滚，不用自发HTTP代理或另写专用设备系统。配置保存不能冒充业务保存，未保存fields不得直接start，旧页面版本写入409且无效果。
- query/refreshBlock执行实际来源并写明确目标，submit真实存储/审批，navigate重验所属记录后返回固定站内详情，openModal返回真实授权表单/草稿；生成管理页复用ProTable/FormRenderer/附件/审批。来源查询只给当前申请人授权记录，字典必须同时具备form-source:read与system:dict:read；5秒查询局部超时、分页有界。字段采用field:前缀避免覆盖记录身份/状态元数据。
- 页面预览使用同一受控执行器并明确未发布及写当前环境；设计、保存刷新重开、发布、主/灰度指针和0/100/稳定50选版可操作。模板复用已有真实业务发布版，一键生成表格、表单、数量/分布物料及五动作，不只是列表中的状态切换。来源停用/归档/撤权立即使后续访问失败；仅page:run账号显示来源无权状态，原始query403，不回退空数据或Mock。
- domain-refactor-regression.log为原161项实际数据库/API回归通过；integration-first.log保留新账号权限fixture不足的失败，按功能权限与对象范围分别配置并恢复，integration-role-fixed.log166项通过。integration-scopes.log保留配置元数据范围收窄后缓存回执仍200的失败，改真实page/source command回执投影；integration-replay-fixed.log及integration-latest.log168项通过，覆盖字典底层权限、来源字段非法/任意地址、对象目录过滤及当前/回执范围拒绝。
- 全量full-browser.log首次42通过/3失败保留：旧设备/表单入口的已发布应用列表按名称只返回100条，新应用不可选择；另真实文件扫描失败且本地13310已无监听。修复业务目录分页和客户端完整读取，不删旧断言；integration-directory.log最新169项通过，新增101后续应用及100/1分页真实HTTP证据。恢复原任务持有的ClamAV1.5.4配置/完整库，clamd-restored.log与scanner-protocol.json正常样本OK/EICAR FOUND，未改全局代理/原R1容器或用仅EICAR假库替代。
- browser-first.log首轮新页面因继承4189预览服务无监听而失败，确认句柄缺失后恢复preview服务；browser-preview-restored.log两条实际页面通过。补仅页面权限账号及数据源权限态后browser-three.log三条通过，原始命令权限拒绝真实403；没有route.fulfill注入成功。runtime-approved.png像素已检查；初次图表快照在过渡动画中显示空白，禁用图表动画后真实分布图可读，统计来源与刷新时间明确，业务变化后区块显示待刷新。
- full-browser-directory-fixed.log最新45条完整真实浏览器通过，含原R1/条件/并行/定时/包/字段权限/文件及新增低代码。员工经弹窗草稿→缺必填实际拒绝/输入保留→修正保存→真实提交→指定表格/统计/图表刷新→详情导航→两人审批；配置生成/JSON非法未来格式拒绝/保存重开/预览/发布以及0/100/回退、跨租户拒绝均通过。两个既有Mock/旧smoke各3项通过，10888未运行的代理错误仍仅作为Mock兼容边界。
- unit-directory.log为452前端单测，contracts-all.log41契约+25领域/Mock、types-directory.log全workspace类型、build-directory.log完整构建通过。lint-current/lint-latest/lint-directory.log无错误/10警告（6既有、4新增函数声明顺序）；style/lint/build初期格式、嵌套ternary、同连接循环及Vue缩进失败保留，改明确分支/顺序流并修复，没有降低门禁。
- 020仅在专属开发库应用，私有before-020.dump与demo-migrate/demo-initialize日志保留，原R1包/卷/容器未迁移。verify-low-code-recovery.mjs真实pg_dump/pg_restore到新库；database-recovery-first.log保留变量重名失败，修正且仅清理已核实无public表的自己空临时库。database-recovery-final.log和database-copy-final/report.json通过，20迁移、11关键表计数、会话、原页面/来源/业务版本一致，恢复库保存/提交/两人审批与0.30元计算正确，原库仍draft/数量2且无实例。私有dump不进入Git/可分享CI/应用包；这不是全新部署或客户验收。
- 页面包及跨租户低代码来源重绑、完整物料目录/复用市场、更多受控来源/参数绑定、全套主题/密度/键盘/布局、物理数据库重启、新部署/兼容回退/容量等仍开放；FP-017/018/019及整个Goal保持进行中。本批须实际提交远端CI，不用此前定时源码绿色结果替代。关闭能力通过撤销权限、归档页面或停用来源，保留020及兼容API、业务和事实历史，不自动down migration。

### 低代码五动作与发布运行远端验证

- 实现提交11b62411c0ee043bb967b0650ef695d1e009e8c8已推送开发分支，实际CI37107989937的verify/real-business均success，链接https://github.com/wzfdhr/af-ideal-admin/actions/runs/37107989937 。归档low-code-20261003/remote-ci.json、ci-37107989937-workflow.log及ci-37107989937/real-business-evidence。实际远端169项数据库/API、45条真实浏览器、452前端单测、41契约+25领域/Mock、类型/构建和两组三条既有浏览器均通过；源码SHA以此提交为准，不用旧定时结果替代。
- verification-manifest.json保存该实现及本地日志/恢复/扫描协议摘要；原库/原R1保留。页面包、更多来源/物料、完整物理重启/新部署/兼容回退/容量和全产品正式交付门禁继续开放，FP-017/018及整个Goal保持进行中。

### FP-019 页面包下一批

- 新增full-product-page-package-design.md，明确v3页面/来源/物料依赖、包内符号和来源脱敏。已核实当前包只含表单/流程/人员/表单来源；低代码来源绑定实际release且不可重定向，因此目标业务未发布时不能伪造来源或复用原租户release。
- 下一步实施受控待绑定页面定义、目标业务实际发布后的页面来源重绑和页面草稿/发布闭环；分别验证权限/字段/来源映射、原key/并发/恢复及实际跨租户文件导入。当前只有方案，没有页面包实现或验收结论，原v1/v2包与FP-019全部冻结范围保留。


### FP-019 v3页面包与目标发布后重绑增量

- 新增v3页/来源符号及page-contract v2、low-code-sources/受控Pro物料依赖。保留v1/v2路径；导出拒绝其他根应用、未发布页面及与导出业务定义不等价的固定发布版，去除源UUID/选项快照/默认值/业务数据。256KiB按UTF-8字节测量，未知未来格式/脚本/依赖/缺引用拒绝。
- 021追加pending/bound页面集合与不可变定义/目标映射，应用、发布、成员、页面用租户复合FK。导入只生成独立业务草稿与待重绑定义；目标业务真实发布后由版本/幂等命令同事务创建来源、页面草稿、绑定事实及审计，不伪造发布指针。字典逐项重绑并复查启用/当前底层权限；回执重放也复验配置/页面/来源及当前创建者范围。
- 实际配置页在目标业务发布前禁用重绑；生成页按pageId直接打开，刷新读取真实对象。原无页面包直接下载路径保留。人员/来源目录支持分页，UI完整获取且后续页拒绝时不返回截断结果；目录超过100条的双租户API和前端失败回归通过。
- test-results/full-product/page-package-20261003/保留渐进失败：browser-first.log中员工详情跳转未等待路由导致主管打开错误路径，补实际详情URL等待后browser-route-fixed.log通过；integration-security.log中的字典跨租户负向先因漏抄送槽得到422，补完整人员映射后才验证真实404；database-copy.log保留恢复脚本命名导入不匹配的失败，修正实际模块导入后database-copy-final.log通过。integration-release-final.log保留故障断言将失败审计误算为成功事实的失败，改为检查成功事实回滚及失败审计保留；失败请求仍需可审计。未改变业务成功断言或注入成功响应。
- database-copy/report.json记录实际pg_dump/pg_restore、21迁移及13表计数相同、原会话保持。独立恢复库继续待重绑→业务发布→来源/页生成→页面发布→员工真实创建/提交→两人审批，金额0.30；原库仍pending/空映射/无目标发布及页面。仅为原本地PostgreSQL实例内独立库恢复，不能替代新机器部署/全产品物理回退。
- 本批unit-release-final.log的454单测、contracts-final.log的44契约/25领域、integration-release-success-facts.log的176真实数据库/API、integration-page-facts-final.log的7项新增专项、full-browser.log的46条完整真实浏览器通过；build-bytes-final.log/typecheck全workspace通过，lint-final.log无错误/10既有警告，新增脚本命名导入修正后style-release-final.log无错误。两个既有Mock/smoke各3条通过，旧10888代理报错只属于Mock路径，不当作真实服务证据。新增页面截图已检查，目标员工真实记录与已通过图表可读。对应新提交远端CI尚待实际执行。原R1包/卷/服务不改；更多跨应用/插件物料/受控HTTP依赖、全套主题键盘布局、容量、新部署/兼容回退及正式交付继续开放，FP-019和整个Goal不勾完成。

### FP-007 下一批真实菜单资源

- 已核实现状：system/menuSystem及其API只有Mock写入/浏览器上报审计；真实/user/menu调用createR1Menu固定能力树；config.menuFromServer默认false，真实前端也只过滤静态路由。不能因当前返回固定componentKey而写菜单已持久化。
- 下一批先提取共享受控路由目录（固定name/path/componentKey、布局、基础权限集合），支持租户独立资源、目录/菜单/按钮、父引用、排序、启停、revision及删除墓碑。API拒绝任意URL、组件代码、模板字符串、未登记权限与基础权限削弱；按钮登记只表达现有能力，不授予业务权限。目录变更带本租户FK、环/引用检查及租户写锁，事务内写资源/审计/回执。
- 保留当前正式入口及R1路径。实际菜单按当前成员有效权限和资源祖先启用状态投影，all不跨租户；停用只影响导航与相应路由准入，后台授权继续独立复验，不能靠隐藏按钮授权。至少保留当前有权管理员可达的菜单管理/凭据恢复入口，拒绝会锁死租户管理能力的命令。
- 真实前端应读取真实菜单事实并保持响应式更新，元数据标题按纯文本渲染，图标/组件仅受控目录提供。当前组件在setup复制menuPreset.value、config默认关服务端菜单的细节必须修复并回归；旧显式Mock入口保留。切换账号/租户及读取失败清除旧菜单，异步ticket阻止旧响应覆盖，直达路由仍检查实时能力。
- 按顺序验证契约失败回归→022追加迁移/真实API→管理页与当前会话导航→双租户/即时撤权/版本竞争/故障幂等→保存刷新/进程和独立备份恢复→全量门禁/对应SHA远端CI。022尚未编写或执行，本条是实施拆分，FP-007仍未开始，未给菜单模块补虚假实现结论。


### FP-019 页面包提交及实际远端CI

- 实现SHA bbe6907cf7bafd938afa31700f3134295a96d942已推送codex/full-product-completion。实际CI 37114264940的headSha精确相同，verify/real-business均success： https://github.com/wzfdhr/af-ideal-admin/actions/runs/37114264940 。后续文档补充及FP-007拆分不改变该实现源码。
- 已下载ci-37114264940/real-business-evidence并保存完整ci-37114264940-workflow.log及remote-ci.json。远端integration.log为176通过/0失败，browser.log为46通过，原R1、条件/并行/转交/定时、两个租户应用包、低代码及真实文件扫描路径保留。远端verify实际执行lint/typecheck/454单测、44契约/25领域、完整构建和两个3条Mock/smoke套件，不以文件配置代替实际运行。
- verification-manifest.json记录实施SHA与本地/远端日志及独立恢复报告摘要。021仅应用本地专属开发demo；原R1库/卷/交付包保留。本批没有合并、正式tag、公开发布或客户生产部署；全产品新部署/兼容回退及正式交付仍开放。下一批接FP-007的真实菜单资源，原冻结范围不缩减。


### FP-007 持久菜单资源、即时导航及页面按钮增量

- 新增共享受控路由目录和闭合菜单资源输入；页面引用固定name/path/componentKey及基础权限，目录/菜单/按钮分别校验。022追加租户资源、登记路由、父FK、按钮唯一性、版本/墓碑、不可变绑定及数据库环/保护入口约束，保留001至021校验和。已有租户迁移建立默认资源，新demo/空平台初始化按同一目录建立资源；未在读请求中自动生成或覆盖用户配置。
- /system/menus及catalogue/detail/restore为实际API，tenant写锁、expectedRevision、Idempotency-Key、状态和成功审计同事务，失败事实单独记录。父资源必须同租户且类型合法；基础权限/组件/路径不能由请求重写，不接受任意URL或组件代码。管理、工作台和本人凭据入口及包含这些入口的祖先不能停用、移动或删除；普通删除保留墓碑与恢复路径。
- /navigation/state及/access按当前会话/有效权限、资源及祖先启停投影，不依赖旧固定树。一个登记页可以有多个资源引用，只要仍有启用引用就保留直达准入；全部引用不可用后拒绝直达。目录启停影响下属导航，按钮按所引用页面合并可见性控制。按钮配置不授予或删改后端业务授权，实际接口继续独立检查当前权限/对象范围。
- 真实前端读取持久导航并保持响应式，标题纯文本渲染，去除菜单标题/图标的模板编译；别名按登记目标路由跳转。当前原始授权权限state仍兼容既有setInfo/$patch，页面按钮另按导航事实计算。切换身份/租户及失败清空旧树和按钮状态，ticket阻止旧响应覆盖。显式Mock仍使用原菜单和页面，不用不支持的新/navigation接口；真实数据模式不会静默回退Mock。
- 真实页面提供资源创建/编辑、父目录/登记页面/按钮权限选择、启停、搜索/分页、删除与恢复；错误保留输入，命令使用原key复试与实际revision。首轮浏览器因为恢复验证也创建了同一路由的启用引用，停用部分入口仍可访问是正确行为；browser-all-aliases.log按完整实际引用停用并finally恢复后通过。像素复核又发现空查询误走必填校验，已修正并增加初始真实行/无错误态断言，full-browser-final.log最新47条完整真实浏览器全部通过。full-browser.log保留46通过/1失败，新增用例再次运行时原父页面/权限的按钮唯一约束正确返回409；改为每次创建独立页面引用作为按钮夹具，未弱化唯一规则或期望状态。首次Mock三条因租户context误选真实导航协议失败，明确reference/Mock分流后mock-mode-fixed.log三条通过。
- integration-object-scopes.log最新182项真实数据库/API全部通过，包括同租户FK/目录环/固定绑定、跨租户、保护入口、祖先/全部别名、并发1次成功/冲突、导入式目录故障无半个资源/原key恢复、撤权回执拒绝与真实API替换；另验证创建者范围、默认共享资源需要本租户完整范围、父目录/受影响子树范围、列表/选择器/原始写入及缓存回执即时重验。个人范围不能创建或更改租户级按钮策略，不让导航配置扩大其权限范围。contracts-final.log46契约/25领域通过。unit-final.log457项通过，包括旧公开state兼容、导航替换/错误清空、旧租户响应丢弃及按钮原授权保持。旧菜单Mock单测独立保留在mock.vue，未删除或减少原断言。build-keyboard-final.log完整构建、types-final-scopes.log全workspace类型通过；lint-final-scopes.log无错误/10既有警告，新增脚本style-recovery.log无错误；两组旧Mock/smoke各3项保留通过。对应提交远端CI仍待实际运行。
- before-022.dump仅来自既有本地专属full_demo，022只应用该库；原R1容器/API11888/前端4185及卷未改。verify-menu-recovery.mjs真实pg_dump/pg_restore到随机新库，22迁移与15关键表计数相同，原会话、菜单层级/组件/路径保持；恢复库修改标题后仅恢复库导航变化，原库标题不变。此为同一本地PostgreSQL内独立库恢复，不是新机器部署或全产品文件字节恢复。
- 运行服务的临时目录已消失，已恢复既有开发Postgres及重新准备私有API配置/存储；没有改全局Docker代理。官方1.5.4 macOS包签名/公证检查成功，任务目录中修改可执行副本RPATH并做ad-hoc签名，不能称修改副本仍是厂商签名。FreshClam加载官方完整库、daily28151；外置卷AppleDouble元文件导致数据库加载失败后，仅将实际CVD和证书复制至任务APFS目录；scanner-protocol.log实测正常OK/EICAR FOUND。开发临时旧文件存储消失不能当作旧字节已恢复；保留元数据并使用新的专属目录，不伪造原对象或删除历史事实。
- lint曾扫描test-results中的历史构建副本，已将本来不入Git的生成证据/coverage目录从源码lint排除；当前src/packages/services/tests/scripts均保留检查。API导入环、TS循环推断/DTO行类型、Vue格式及UI权限重导出冲突均保留失败日志，修正实现后重验，不降低源码门禁。
- 整个Goal及菜单完整交付保持开放：全套主题/密度/键盘、容量/延迟测量、物理数据库/新环境部署、兼容回退与未来插件注册仍需独立证据。本批新源码须新提交CI，不引用此前页面包提交绿色结果代替。


- 本批最终完整浏览器包含真实初始行/空搜索无报错、保存刷新/重开、导航立即更新、多个页面引用准入、全引用停用拒绝直达、父目录停用、管理入口拒绝/原输入保留、按钮隐藏/复原、个人角色无管理API权与两个租户隔离。新增菜单编辑输入焦点/Tab及1280×720操作在实际页面通过；persistent-menu-state.png已再次检查，无空搜索报错提示，状态/版本/操作和导航一致。没有据此宣称全部主题、键盘或物理平台覆盖。

- navigation-latency.json实测当前tenant-a共47资源、100次串行真实/navigation/state读取：P50 8.03ms、P95 11.20ms、最大13.56ms，macOS arm64/Node24及本地专属PostgreSQL16/loopback。该结果仅覆盖当前资源量，不代表并发吞吐、深层目录上限或全产品容量。

### FP-023/024 下一批消息、公告及真实投递

- 已核实真实后端目前只有个人workflow通知的读取/标记与耐久Outbox；公告、订阅、模板预览/发送任务及推送仍属于原Mock页，前端把邮件/websocket写入模拟选项不等于真实通道。下一批不能让旧success:boolean回执假装已投递。
- 按独立领域状态拆分：消息模板草稿/不可变审批发布版、指定非作者审批人及授权动作；公告草稿/发布/到期/撤销；本人按通道订阅；发送计划/实际收件快照/单收件投递事实/重试失败。模板变量是闭合字符串替换，不接受代码、URL工具或任意表达式；实际发送从批准版本和变量重建内容，不信任客户端title/content或recipientCount。
- 收件all/tenant只表示当前租户；role/department使用当前启用成员及实际成员范围，不把历史删除或其他租户成员混入。创建/预览/审批/发送/发布各自权限，元数据当前创建者范围与当前会话复验；作者不能自批或借批准旧版自动发布新内容。存量流程通知保持同一业务/权限和原固定链接，订阅不得绕过必要待办及详情撤权。
- FP-023先实现配置/审批/公告/订阅与实际站内消息纵向链路，FP-024随后补耐久计划/租约/单效果投递、失败查询重试及实时连接重鉴权。可复用原Outbox事实/worker基础，但模板发送任务及接收事实必须有独立状态；不能用发送总数等于0伪造成功，取消、修改后必须保留原发送记录。
- 真实推送通过授权连接只投递当前租户本人事实，连接/补发/断线/租户切换/撤权持续重鉴权；未获邮件供应商凭据和外部发送授权时禁用该通道并明确原因，继续完成站内及本地合成账户WebSocket验证，不把模拟邮件列作已完成。
- 下一步先定义共享模板/变量/审批/收件/计划契约及失败回归，再追加迁移/真实API、接现有消息页，验证多个合成账号/两个租户、审批准入、数据范围、原key/并发/故障/重启及全量门禁/对应SHA远端CI。本条是实施拆分，尚无新模板/公告表或真实通道结论；原FP-023/024冻结范围和正式发送授权边界保留。


### FP-007 菜单实现提交与实际远端门禁

- 实现SHA f3f7871427b7bd1619ec693f323a642b4f228152已推送开发分支。实际CI38340886866的headSha精确匹配，verify/real-business均success： https://github.com/wzfdhr/af-ideal-admin/actions/runs/38340886866 。后续只补证据/文档，不改该实现源码。
- 已下载ci-38340886866/real-business-evidence、保存完整workflow.log及remote-ci.json，远端182项真实数据库/API、47条完整真实浏览器通过；verify实际执行457单测、46契约/25领域、类型/构建/lint（无错误/10既有警告）及两组三项Mock/smoke。包含新菜单全部引用/个人范围/原key/真实进程替换/初始空查询和原R1、工作流、低代码、应用包与真实文件扫描回归，未注入成功响应。
- verification-manifest.json保存精确实施SHA、本地/远端检查及独立恢复/扫描/延迟证据摘要。原R1 readiness当前仍正常；此为未正式发布的开发增量，不是全产品最终部署、商业授权或客户验收。全产品Goal维持active，下一批按已冻结FP-023/024实施真实消息/公告/模板审批和耐久实时投递，剩余门禁不缩减。


### FP-023/024 模板审批、公告、订阅及耐久实际投递增量

- 023追加模板草稿、指定审核任务、不可变批准版本、公告草稿/不可变发布版、本人订阅、固定发送计划、单收件实际事实及不可变事件。既有001至022校验和保留；复合tenant/身份/版本FK、一个pending审核、实际非作者审核决定与快照相等才能建版本、发送计划/效果身份及送达事实不可改写。新增目录/权限同共享契约，默认资源初始化不覆盖旧配置。
- 模板变量仅允许已登记的{{key}}字符串替换；未知变量/表达式/脚本/客户端approved状态、客户端生成内容/人数及任意租户引用拒绝。日期含明确时区，非法日历/24点及无时区拒绝，规范化UTC。模板作者/提交人不能自审，当前指定审核人及当前审批权复查，固定已批准版本在新草稿待审时仍可使用；启停/归档不删除历史版本，恢复不会自动重启审核或代人批准。
- 配置元数据按当前创建者范围；批准版本明确是本租户授权发送者可使用的共享库，不暴露草稿/审核配置。审核对象由指定审核任务持有人拥有，当前审核权限及精确身份复验；发送者选择全租户/角色/精确部门/本人/显式成员，每一实际收件成员都必须在当前授权范围，不能悄悄截成更小的all。send-only/review-only/subscription-only界面各自不读无权配置/名录。
- 公告保存新草稿仍保留旧有效发布指针与固定内容，另行发布才换版；撤销/到期/当前受众变化或阅读权失效立即拒绝正文。已合法发布的事实不会仅因发布者以后失去发布权而自动召回；待投递任务仍复查原发布者当前权利。历史通知只给公告提示，读取正文走当前授权版本。普通模板站内快照投递不产生workflow requestId/access=copy授权字段；所有源由服务端生成，不伪造流程通知。
- 本人订阅缺省返回revision0/storedfalse，首次保存真实持久化，版本竞争/原key恢复受控。模板/公告的可选投递尊重订阅，原工作流待办/提醒投递不受静音开关影响。当前支持in-app和需保留站内事实的websocket；未配置/未授权邮件通道明确拒绝，不能将模拟邮件写已送。
- 独立worker按实际计划时间、租约和固定收件事实推进；效果前重新检查原发送者当前启用/权限/成员范围、来源启停/公告有效性、接收资格及订阅，管理人重试不会借其权力替代失权发送者。一次收件effect的Outbox(sent)/notification/收件完成/事件/任务汇总同事务，原Outbox处理/故障点保持；失权blocked、失败有限退避、终态租约失败同事务记事实，取消保留已送效果及未送取消事实。sent只代表站内事实已持久化。
- 真实WebSocket /api/messaging/realtime第一帧鉴权，不把token放URL；持续重鉴权、本人/租户隔离、当前可见事实、稳定收件ID、REST重读成功后实际客户端ACK才写realtime_ack_at。离线/未ACK不算实时确认。500ms轮询已提交事实可跨独立worker进程，不用仅内存回调；固定id5秒未ACK重发、静音/无权限先过滤后LIMIT、当前通知集合签名触发旧流程消息和未读变化刷新。客户端重连/反压/错误与授权断开明确显示，丢弃旧身份/租户/旧连接响应，普通notifications.changed只触发真实REST读不伪造未读事实。
- 原模板/订阅/中心Mock组件完整保留，真实模式严格走新API，不回退演示成功。页面支持创建/保存重开/非作者审批/批准版本预览发送、计划取消/失败重试边界、公告草稿/发布/撤销阅读、订阅刷新与错误输入保留；实时显示和任务事实分开。消息命令403保留当前组件输入，401仍按会话失效处理；请求错误只加脱敏path不保留查询凭据。Vite/生产本地preview/Nginx升级转发显式连接真实WS，没有用成功响应替身。
- backend及frontend分别实施/单测，另有只读独立核对；原审核指出的部门可用性、最后租约失败非原子、旧无效回执阻挡、同连接未ACK不重发、旧workflow刷新hint未处理及净未读不变漏刷新已修复并补实际回归。共享批准库和指定审核任务所有权是明确政策，不把配置创建者范围错误套用到发布库或任务指派。
- test-results/full-product/messaging-20261013/integration-first及reviewed保留投递失败：旧测试数据库Outbox积压批量10未走到本例，未finally恢复静音使后续被正确skipped。改实际批量处理和finally清理，仍断言一次真实效果；integration-stage2-final.log最新196项真实数据库/API全部通过。14项消息专项包括同key/并发/故障/进程死亡租约/最后租约事务失败/原发送者撤权恢复/部门停用/实际WS鉴权ACK与撤权/100条实际旧静音事件/同连接5秒重发/未读数量及UUID最大值不变的旧workflow刷新，未直接伪造成功收件行。
- unit-final.log548单测通过，contracts-first49契约及25领域/Mock通过，types-final/build-final通过；lint-final无错误/17警告（原10及7新组件函数声明顺序）。旧两组三条Mock/smoke通过，旧10888代理错误仅为Mock兼容边界。browser-e2e.log四个真实账号经实际UI创建→非作者审核→固定旧版发送→站内查询/WS/ACK→阅读，以及公告旧版保留/新发布/撤销、订阅保存刷新、本人审核422/无管理403/外租户404和1280键盘通过；完整真实浏览器仍在执行，不用此一条替代全量。
- 独立恢复脚本verify-messaging-recovery.mjs真实pg_dump/pg_restore到随机新库，23迁移及24关键表计数相同/会话保持；恢复库接续pending模板实际审批、变量生成站内消息、真实WS接收/ACK且仅一次notification，原库模板仍pending/无批准版本且无恢复库job。只在原本地PostgreSQL中独立库验证，不当作全新部署或全部文件字节恢复。before-023.dump为原专属demo备份，023只在该库应用；原R1运行服务/卷/包未改。
- 邮件供应商/正式发送授权、全部品牌语言/主题/键盘、受众容量/长期计划/实际压力、物理数据库/新环境部署/兼容回退及全产品交付仍开放。关闭配置入口可撤权/禁用/归档并保留23及兼容服务，已送事实不可擦除；只回退到旧服务不支持新版本/计划不算兼容。FP-023/024及完整Goal均不标完成，须新提交实际CI后归档。

- 最终只读复核确认上述六项修补，又发现未登记WebSocket路径Upgrade未关闭原始连接；upgrade-before-fix.log真实失败（等待后超时而非400/404），服务端显式404关闭后integration-release-final.log最新197项通过/0失败，消息专项15项。原查询凭据拒绝也保留，当前API重新启动后ready正常，原R1 API11888仍ready正常。
- 收件人选择器按授权姓名搜索，显示完整人数/已选数量并使用240px可滚动区域，过滤不截断目录或清除隐藏选择；新原生父form单测确认搜索Enter取消默认提交、Space与完整选择保持。unit-keyboard-final.log最终551项通过，build-release-final.log完整构建、types-release-final.log全workspace类型通过，lint-keyboard-final.log无错误/17警告；新增声明顺序已只读核对，无初始化前调用。原完整门禁full-browser-release-final.log的48条全部通过，最后Enter修补需另跑消息目标用例并由本次远端完整CI确认。
- database-copy-release-final.log再次真实恢复23迁移/24表、接续pending审核、持久化一次消息并实际WS ACK，原库仍pending且无恢复库job。并行撞上浏览器登录限流的恢复尝试429保留在database-copy-overlapped-rate-limit.log；完整浏览器结束后独立重跑成功，未放宽限流或重置业务数据。额外对Node integration .mjs施加浏览器ESLint配置的试查存在CommonJS导入/循环风格错误，保留upgrade-style-final.log；未改现有门禁配置，正常源码门禁和新恢复脚本/WS源码独立检查通过。
- browser-keyboard-final.log最终消息用例再次通过，实际搜索Enter后无确认弹窗且真实GET任务总数/ID未变，清除搜索仍保留勾选；再完成真实审核/发送/ACK/公告/订阅闭环。最终sender-delivery-1280、sender-composer-1280、receiver-center-1280及reader-revoked-1280按实际浏览器截图保存，已核对实际站内/实时事实及输入/列表可读。完整48条本地回归在这项键盘修补前通过，对应最终源码还须本次远端完整48条确认。

### FP-023/024 实现提交与实际远端门禁

- 实现SHA `2e31e470897f7cd6b1ad0341f136dd9b8ba5e5b0` 已推送开发分支。实际CI38346937816的headSha精确匹配，verify/real-business均success：[对应CI](https://github.com/wzfdhr/af-ideal-admin/actions/runs/38346937816)。远端完整48条真实浏览器包含最后搜索Enter/任务ID不变检查，197项数据库/API、551单测、49契约/25领域、类型/构建/lint（0错误/17警告）及两组三项Mock/smoke实际通过，没有引用旧菜单提交结果替代。
- 已归档 `test-results/full-product/messaging-20261013/remote-ci.json`、完整workflow.log、artifact元数据及 `ci-38346937816/real-business-evidence`，包含真实integration/browser日志与最终四张消息页面截图。此次只有real-business-evidence文件artifact；frontend未产生独立artifact，其实际verify步骤由完整workflow日志保留，未将空artifact称为已下载。verification-manifest.json保存匹配实现SHA、检查边界及本地/远端/恢复证据摘要。
- 后续文档提交仅追加证据和报表方案，不修改该消息实现。未合并、创建正式tag、公开发布或部署客户生产；邮件、全套视觉/容量、物理数据库/新部署/兼容回退与正式交付保持开放，FP-023/024及全产品Goal继续进行中。

### FP-025/026/027 下一批真实报表

- 已保存 `docs/architecture/full-product-reporting-design.md`，独立只读调研确认现有reports/export/schedule仅Mock，无真实API/表/文件；原占位下载及客户端scenario不能作为验收。拆为受控真实查询/固定与自定义快照、真实生成/扫描/授权下载/归档、持久周期运行/恢复/告警，CSV首条路径不删除后续XLSX/PDF及原冻结要求。
- 首源为真实generic业务记录；将抽取record-access当前授权谓词，让本人/真实审核参与/抄送三条路径与撤权规则统一作用于明细和聚合。来源同租户release绑定、旧字段按原快照解释；应用管理/报告权限不扩大记录权，关键词/分组/排序/导出不得利用隐藏字段。
- 文件字节可复用LocalObjectStore，但普通owner-only附件会绕过报表/字段撤权，必须增加专属制品授权或完整文件绑定，并扩展对象清理引用避免合法归档误删。实际export审计由服务端事务产生，原telemetry不当作导出事实；定时接收者不得下载发起者更宽范围文件。
- 已开始 `packages/contracts/src/reporting.ts` 的闭合v1定义/查询契约，当前未提交、未接共享index/API/UI；独立临时目录编译和11项真实日历/时区/未知键/未来格式/字段表达式/分页/稀疏数组边界回归通过，证据 `test-results/full-product/reporting-20261013/contracts-scoped.log` 及源码摘要manifest。不能据此称真实报表已可查询。FP-025标进行中，FP-026/027仍未开始实现；下一步接共享契约、服务端当前授权查询及真实页面，再沿依赖推进导出和调度。

### FP-025 真实配置、固定发布源及授权查询增量

- 024新增报告草稿/控制版本、不可变发布版、固定来源复合FK/字段别名映射与当前记录授权函数。发布版须匹配实际草稿/revision、当前启用generic应用的有效发布版与真实source版本；active指针绑定同租户同报告，不改历史发布。001至023校验和保留，024在独立新库实际应用两次，后已用于原专属demo，禁止再改该文件校验和。
- 记录详情与报表共用af_record_visible：本人当前业务读、当前审核能力及真实任务/转交历史、当前读/审核及真实copy事实三条路径保持，历史任务不加终态过滤，当前成员/用户/租户及权限复验。业务资料管理/报告权限不扩大源记录访问。普通消息不产生copy授权。
- 真实配置API实现创建、保存重开、版本/幂等/并发、发布/比较及启停；治理使用当前历史创建者范围，query-only只读本租户发布库，不能取得私有草稿。sourceReleaseId/字段alias→rawUID/type固定，来源以后换版不重解释旧报告，当前首版明确只统计固定来源版。
- 来源目录最初无分页LIMIT100使完整库中新建来源被遗漏，integration-first.log保留197通过/8失败；改正式current/pageSize/keyword/精确applicationId及同可见集合计数/分页，不改夹具名称凑前100。前端搜索/翻页保留已选源与字段，保存重开精确查源，query-only不猜active源。独立复核还确认旧版唯一审核参与不能借旧记录查看新源字段目录；修成同一release实际参与，新版只有真正生成新task后才准入，旧固定版仍可读。
- applicant身份字段需独立字段能力及当前成员字段范围，业务字段需独立能力及当前成员行范围；不获准值在服务端先投影/标记hiddenFieldKeys，关键词和排序使用投影值，不能按隐藏原JSON筛出数量。未知字段/表达式/JSONPath/未来schema拒绝，decimal保留原字符串与数值排序，LIKE显式literal转义。明细/count/按IANA日历趋势/状态分布来自同一SQL快照，返回实际查询/截止时间及口径版本。
- integration-paging.log最新207项数据库/API通过，其中10项报告覆盖原key/冲突/故障/撤权、来源/字段/角色范围、literal输入、固定旧版、正式分页、真实API两次替换；原197项R1/流程/消息/文件等保留。contracts-first.log为60契约/25领域；unit-first.log594前端单测，types-final全workspace类型及build-first完整构建通过，lint-final无错误/19警告（原17加2提升函数顺序）。纯文案调整的Prettier构建失败保留，修正后build-copy-repaired.log前端再次通过。
- before-024.dump实际备份原专属demo，demo-migrate/demo-initialize仅应用该库并显式初始化合成账户权限；新API10890和前端4189运行，原R1 API11888/容器/卷保留且ready正常。无客户部署、正式tag或发布结论。真实浏览器及独立恢复仍需结果，目标环境/全主题容量/跨版本统计、真实文件导出/归档与周期调度仍开放，FP-025及整个Goal不标完成。

- 目标真实浏览器首轮完成三视图/来源换版/字段撤权后发现停用catalogue误落Gov守卫返回403，browser-first-failure.log及四账户截图保留。修为有query能力时先明确REPORT_DISABLED409，不改数据授权；integration-disabled-final.log最终207项全部通过，browser-disabled-final.log加强实际catalogue/direct-query状态码后18.2秒通过，未删原停用文案、清空结果/日期保留断言。
- 四账户实际UI保存重开、三个发布版本/趋势/分布/10+2明细、源升级v2不混旧v1、字段撤权/隐藏过滤/真实403、查询撤权路由拒绝、跨租户404、键盘来源Enter搜索与原R1 release/revision保持已通过。三张reporting-trend/distribution/detail-1280最终截图已检查并另存browser-target-final-evidence：实际数据只有1天，趋势为当天12条单点，分布草稿12条，不伪造历史趋势/销售数据。完整49条回归仍须结果，独立恢复脚本准备中，对应提交远端CI尚未运行。

- full-browser.log完整49条真实浏览器通过，包含本次报告及原R1/应用/流程/消息/菜单/文件扫描/权限回归；mock-browser和smoke-browser各3通过。旧10888未运行代理错误仍只属于Mock边界，不当作真实API结果。lint-release保持0错误/19警告。当前需提交该实现并实际运行对应远端CI。
- verify-reporting-recovery.mjs实际在明确预期本地专属库、API10890下创建合成设备源/真实draft业务记录及未发布报告，再用pg_export_snapshot一致性快照执行pg_dump/pg_restore。recovery-database.log及database-copy/report.json证明37表计数和24迁移校验和一致、原session保持；仅恢复库保存/发布/查询1条真实记录，12.34金额字符串及固定别名未丢，改名/停用/启用后原库原名/未发布/无恢复版保持。随机恢复库清理后才写成功报告。拒绝URL query/hash覆盖连接host，源库名须匹配明确预期，禁止原af_admin_r1库；未改其他源数据库。此是现有PostgreSQL内独立库恢复，不是新机器或完整文件bytes恢复。

### FP-025 实现提交与实际远端门禁

- 实现 SHA `ae3a6135a7f1ec115e6016202c94520eed73100e` 已推送开发分支。实际 [CI 38354881054](https://github.com/wzfdhr/af-ideal-admin/actions/runs/38354881054) 的 headSha 精确匹配，verify 与 real-business 均 success：594 单测、60 契约/25 领域、207 数据库/API、49 完整真实浏览器、两组三项 Mock/smoke、类型/构建/lint 实际通过。当前保留 19 项 lint 警告，未将原 Mock 代理错误作为真实后端结果。
- 已下载 `test-results/full-product/reporting-20261013/ci-38354881054/real-business-evidence`，保存最终 remote-ci.json、artifact 元数据、完整 workflow.log；verification-manifest.json 记录实际提交、检查边界及日志 SHA256。此次只有 real-business-evidence artifact；frontend 空 artifact 未称为下载完成，其 verify 步骤由 workflow 日志保留。
- 后续证据文档提交不改该报告查询实现。继续 FP-026 的耐久实际 CSV/XLSX/PDF 导出、扫描、授权下载与归档，再推进 FP-027 持久调度；固定来源版、完整视觉/容量、新部署/兼容回退、外部条件及正式交付保持开放，整个 Goal 维持 active。

### FP-026 真实导出、扫描、授权字节、归档与恢复增量

- 025 独立持久化固定报告/来源/查询/字段及实际投影行、原创建者、授权清单、对象键、租约、有限尝试、真实制品和不可变事件。客户端不能提交 rows/count/status/producerVersion/scan/path；真实查询一次捕获全部匹配记录，上限 2000 行/2MiB，超限 422 而非分页截断。执行与下载复验原主体及当前访问者、固定来源和逐行/逐字段当前准入，治理范围不扩大源数据权。隐藏列真正无捕获值可保留受限文本，筛选/排序字段仍需当前授权。
- 独立 worker 90 秒租约、续租和唯一 claim fence；生成/实际扫描在事务外，取消/过期/失权不能在最终提交后伪装完成。真实字节、大小/SHA256/ClamAV 身份、制品/完成事件/事实审计同事务提交；5 次有限退避、最后死亡失败及重试可查询。取消保留历史，已完成/感染效果不重写；归档至创建后 365 天，未归档至第 7 天，过期不可复活，实际删除字节而保留扫描/任务事实。普通文件接口不能读取报告制品；审计仅显示操作事实，捕获数量/文件摘要走独立授权任务 API。
- CSV UTF-8 BOM/RFC4180 与公式注入防护，XLSX 真正 typed 数字/日期及文字、PDF 嵌入固定 Noto CJK 许可字体并分页。生成器首轮发现 PDFKit 二次自动换行产生重叠，已修；独立复核发现直接正式路径写入在中途死亡留下残缺对象，改 content 目录完整写入/sync/原子发布，真实 APFS 临时路径和 ExFAT 工作区 SIGKILL/后进程恢复、相同并发/不同字节冲突及旧平面文件兼容均通过。旧平面缺失/残缺对象未覆盖或伪造。
- 首轮完整测试 `export-integration-first.log` 为 224/230：旧迁移清单/权限标题、无文件能力的 403 夹具、目录当平面文件读取、未获业务创建权限的工作流夹具及嵌入 CSV 的 EICAR 假设失败；保留日志，修正真实夹具和表示后 `export-integration-reviewed.log` 230/230。真实裸 EICAR 由 ClamAV 判感染；隔离分支用明确的受控负向扫描边界验证，不称生成 CSV 真正感染。所有正向导出字节由实际 ClamAV 扫描。
- 真实三格式目标浏览器发现 HTTP CSV MIME 带 charset 与元数据比较不一致，合法字节误拒；首轮日志/截图保留。媒体类型规范化后仍核验 ACL/MIME/实际大小/10MiB/SHA256，新增正确参数和错误类型负向，`export-unit-mime-final.log` 623 单测通过。`export-full-browser.log` 完整 50 条通过（在 producer2 说明修正前），包含原 R1/其他模块；旧 Mock/smoke 各 3 通过，不把 10888 Mock 代理错误称为真实 API 成功。
- 实际 XLSX 显示 PostgreSQL 六位微秒时间为原始带偏移文本，旧说明错误概括为全部按查询时区显示。可信计划 producerVersion 缺省/1 保持原字节，新计划固定 2 明确毫秒数值时间与高精度原文，未来版本拒绝；不开放客户端选择。旧四个样例 SHA 不变，7 项生成测试含 native XML/真实格式再读、字体缺失/损坏、精度/脱敏/选择字段、确定性及跨 TZ；当前 `export-integration-producer-final.log` 最终 232 项全通过（14 导出、7 格式、4 原子文件，207 既有），含旧计划写后死亡按旧字节恢复及未来3不生成/不下载。`export-browser-producer-final.log` 新生成规则实际三格式/12行下载、归档重开、字段撤权、跨租户及键盘再次通过，实际文件/PDF/XLSX 渲染证据保留；新规则最终全50须本次对应远端 CI 确认。
- `export-contracts-final.log` 66 契约/25 领域、`export-types-release-final.log` 全 workspace 类型、`export-build-producer-final.log` 全构建、`export-lint-release-final.log` 0 错误/19 既有警告及新恢复脚本检查通过。新增依赖实际 workspace audit 为 0，并在独立生产依赖 npm ci 验证 uuid 覆盖真正生效；根项目旧依赖仍有安全告警，最终安全门禁未完成。
- `before-025.dump` 为真实原专属 demo 备份，025 SHA256 `a5b8d384f833e13828d635c93582e01468fa5d272376cc3e1996c9bc88c3f192` 已应用后冻结，001 至 024 校验和保持。新 API10890/worker及前端4189可用，原 R1 API11888 仍 ready，原容器/卷未改。
- `verify-report-export-recovery.mjs` 独立只读复核修正目录 realpath 别名和丢响应后晚提交清理屏障：源库/HTTP严格限定，fresh session 与实际源库绑定后才业务写入；源 worker 暂停，失败只禁用/取消本 run 资源并等命令 gate。实际 `export-recovery-first.log` 及 `test-results/full-product/report-exports-20261013/database-and-file-copy/report.json` 证明一致 pg_export_snapshot/pg_dump/pg_restore、63 全表计数/25 校验和、24 对象共 326225 bytes 校验恢复、原会话下载既有 CSV/XLSX，恢复库接续一个 queued 导出仅一次真实制品/完成事件/审计，12.34 与映射保留；目标独立改名/pubv2，原库保持原名/无目标版本，原 queued fixture 确认无目标效果后以 API 取消，目标库和 store 清理后才 verified。
- 恢复报告明确 41 个既有演示库 stored_files 对象原本缺字节，`allPreexistingStoredFileBytesRecovered=false`，不伪造修复、不称恢复全部历史附件。此次为现有本地 PostgreSQL 中独立库及独立 store 恢复；全新机器/物理实例、长期容量、原生 Excel 客户端全兼容、兼容回退、外部条件和正式交付仍开放，FP-026 和完整 Goal 不勾全部完成。下一步提交该实现并实际对应 CI 后归档，再接 FP-027。

### FP-026 实现提交与实际远端门禁

- 干净实现 SHA `d44fe5cceb9bccb430a1ec8c003559f28b2ca5b4` 已推送开发分支，实际 [CI 38369201950](https://github.com/wzfdhr/af-ideal-admin/actions/runs/38369201950) headSha 精确匹配；verify/real-business 均 success。远端最终新生成规则全部 50 条真实浏览器、232 数据库/API、623 单测、66 契约/25 领域、Mock/smoke 各 3、类型/构建/lint实际通过，没有用旧生成规则本地全量结果代替。
- 已下载 `test-results/full-product/reporting-20261013/ci-38369201950/real-business-evidence`，保存完整 export-workflow.log、最终 export-remote-ci.json 和 artifact 元数据；export-verification-manifest.json 保存对应实现 SHA、实际检查及日志摘要。仍只有 real-business-evidence artifact，frontend 空 artifact 不称为已下载。
- 后续文档和 FP-027 开发不改此提交的证据；无正式 tag/合并/公开发布/客户部署结论，41 历史缺失对象和最终安全/新部署/回退/正式交付仍在全产品已知门禁内。完整 Goal 保持 active。

### FP-027 闭合周期与收件权限实施启动

- 已保存 `docs/architecture/full-product-report-scheduling-design.md`，明确日/周/月、HH:mm/IANA、月缺日跳过/DST gap 跳过与 fold 首次、前一自然期/当前期日期窗，以及 immutable rule/activation period/cursor/slot 事实。编辑/停用关闭旧期间，保留已经到期的旧版运行，不补停用区间或删历史。
- 创建者与每个收件人的当前行/字段交集独立导出，专属 grant/current role/department 复验、通知唯一真实效果和失败/部分成功事实；不共享宽权限文件、不共享私有关键词、不发未配置外部邮件。当前只有未提交契约和纯日历实现，耐久后端/UI/026 迁移/真实调度尚在实现，不以该方案或 Mock 种子称运行成功。

### FP-028/029 最终回归及 FP-030 检索接续（2026-10-13）

- 最终本地完整真实浏览器 `data-screens-20261013/full-browser-final.log` 53/53（8.1m），前端726单测、88契约/25领域、274数据库/API、Mock/smoke各3及类型/lint/生产构建通过。旧清单/页面首次44通过9失败日志保留；修复实际搜索与有限分页、异步身份/租户代次和低代码输入忙态后完整重跑，保留精确成功及权限负向断言。
- 三套实际合成业务最新保留run `b79e36ed-5537-4763-8152-5f347b35c81e`，15真实记录/9报告/3发布屏；日期窗明确为last-7-days，跨自然日仍可查询。早先today夹具和历史时间不改，不静默改历史记录使测试通过。
- 独立数据库恢复 `a053d34f306c45e6a8a9aeaec9205c3c` 实际验证73表/27迁移、4,279,136byte dump、3屏与15行/9报告/6有效带符号点，恢复库修改发布/回滚与API重建不改变源。此脚本只备份数据库，不声称复制文件bytes、新物理实例或客户部署；目标库/store确认移除后才verified。
- CI38433268052在951beb7上被锁定旧vue-tsc的回调类型收窄差异阻断；4e040ab加入运行时widget kind检查，本地锁定与当前依赖类型/lint均通过。CI38434703546精确4e040abb6af0bbc85e217e3c749653957d78637a，verify成功，274数据库/API通过，真实浏览器52/53；设备待办查找在干净CI首轮尚未加载时错误判断末页，正在修复。完整run.json/workflow.log/real-business-evidence保留，未写远端全绿。
- FP-030开始实施：共享闭合查询/投影契约15项、catalogue DTO与架构边界已提交3a552f6/0b7bcb5。新后端采用同一受权SQL事实集合完成投影/筛选/count/page，未知详情默认空、浏览器POST只telemetry；前端独立真实分页/trace/时区/错误态正在接续。隔离库首轮发现Fastify query专用原型被共享plain-object规则拒绝；仅HTTP bridge验证own data properties后复制普通对象，共享契约保持严格。首轮失败和后续验证分别保留；028只索引候选仍pending，未修改001–027、原R1或宣称完整审计验收。

- 设备待办修复61e1987514fefbf7b921d922b1891fdabd1f245a已在真实页面13.3秒通过，等待授权服务器第一页、按实际recordId/link/kind定位同页行，只有server total明确有后页才翻页；权限/任务缺失/链接错仍失败。对应CI38438660479已启动，结果待归档。
- 审计独立review发现同token权限变化、非法URL默认查询、事实显示时区及新E2E身份断言四项问题，前端正在修复，不能以18项初版单测标验收。backend11项真实隔离库通过；新增bounded audit-persist-failure诊断的真实故障测试通过，原422及data:null不改变，不记录原错误/token/body。首轮该故障测试夹具未获audit:read、恢复GET正确403，修为明确授予并finally恢复自身fixture权限，失败日志保留。
- pre028真实repeatable-read/export_snapshot备份为73表/27校验和、5,016,731bytes，SHA2566761e13167d5607bc24720c4ffc753b526cfb5a1e7c316a977d80352a6e7e903。只向原专属full-product demo应用028，四个读索引，checksum1915f5f4862c2d38fa993735d6830333d9dc4953b217ad0e8ec5f84439af1d26从此冻结；001–027保持。新API/worker已启动，10890与原R111888均ready200；未迁移原R1库、未更换容器/卷。历史25/26/27恢复脚本保留其固定基线限制，不用旧脚本声称覆盖28。

- 大屏最终CI38438660479实际completed/success，精确61e1987514fefbf7b921d922b1891fdabd1f245a，两个job均success；远端53完整真实浏览器（8.1m）、274数据库/API（114.5s）通过。最终run.json/workflow.log及real-business-evidence已下载，verification-final.json保存14份证据摘要、七日真实模板和独立数据库恢复边界；正式发布、新物理部署/兼容回退、历史41个缺字节对象和全产品后续能力保持开放。
- 审计全量第一轮289项中288通过，唯一迁移名称断言仍列到027；补028明确名称而保留两次真实migrate/精确列表断言，第二轮正在重跑。消息fixture先因self创建权限不能选择a-admin审核者404，改独立仅message-template创建/submit的tenant角色，audit:read仍self；未放宽当前审计行权限。
- 审计目标浏览器首轮两项失败保留browser-target-first：旧trace结果的瞬时loading判断、负向abort绑定错迟到请求和own部门解除引用清理409正在修复；不删20条分页、真实错误清空及准确授权断言。非法URL刷新/重试仍能查询默认条件的复核缺陷也在修复。FP030未按单测或静态审查标验收。

- FP030后端c0c7e98、15项真实审计测试1565707已提交；最终完整数据库/API integration-all-process-final.log为290/290（171.5s），包括真实SIGKILL/不同PID/同session与trace事实恢复、后台export/message/timer实际源关系、两级子部门重新挂树即时失权、原事实不改及日志失败不泄露。专项integration-process-final.log16/16。旧锁定Vue依赖上的新审计types/lint通过，已把共享/类型/lint日志拷入证据目录；首次copy取错cwd导致未复制，旧检查不作为新候选证据，纠正后重新copy并执行。
- 浏览器第二轮分页/单边日期/重开22.5s通过；负向暴露inner-layout以fullPath-key重新创建页面，旧实例afterEach先发请求、新实例mounted再次请求，消费单次abort并覆盖错误。删除旧实例routeafterEach，变化由新实例onMounted读取，同URL显式刷新仍当前实例load；单测改为生产相同的keyed RouterView。网络负向持续中止精确GET至error/清空成立，解除后必须真实刷新200和原trace恢复，不伪成功、不降低错误/权限断言。最终页面重建/真实全量仍待结果。
- FP031已开始独立治理契约1d7d13f：创建/版本/取消重试/归档、独立权限、server snapshot与任务/制品投影，临时编译16项通过。2000rows/2MiB/10MiB和7天/365天为导出制品运营默认，后端尚须真实执行；未声称审计事件物理删除/法定期限。现有002 append-only保持，逻辑归档将用同租户新成员关系；实际扫描制品成功后才能建立，制品过期不把事实变回hot，默认检索保持all，当前后台生成器在独立实现。扫描/任务/下载授权/GC引用/恢复清单和正式运维门禁未由契约证明。

- 最终页面9c5a6e8已提交，browser-target-key-final.log两条真实路径13.2秒通过：精确服务端响应/DOM分页、单边日期刷新重开、literal姓名+trace、当前成员字段脱敏、真实网络失败清空与解除后恢复、伪server telemetry不产生fact、双租户及撤权。新UI完整55条浏览器正在运行，最终对应远端CI与28恢复验证保持待结果。
- 当前最终740单测（unit-all-key-final.log）、119契约（含下一阶段独立导出16项）/25领域、290数据库/API、生产构建、当前及锁定旧Vue类型/lint通过；Mock/smoke仍在运行。下一阶段生成器/恢复脚本只是未接线候选，不以类型、契约或renderer可用性代替扫描/授权/耐久任务/恢复/正式交付。

- 审计最终完整浏览器full-browser-final.log实际55/55（8.3m），包含原R1审批/消息/审计及当前所有模块；Mock3/3（28s）与smoke3/3（2.6s）通过，smoke仍保留10888代理拒连且不作为真实API证据。0200052ac7ce72e7cc84bf9b9805847edbde7b6a已推送并启动CI38442802453，结果待归档。
- 新28独立数据库恢复脚本静态审查阻止首候选的异常清理：杀docker客户端不能证明容器restore已停、Pool.query事务不能保证同连接。改为单checkout事务及关闭失败屏障；复核又发现尚未连PG的容器命令不能靠瞬时0 backend证明停止，正在改为异常exec结果不确定就保留targetDB/store。脚本尚未执行，不把静态检查/备份当恢复成功。

- 审计恢复run d14bdf01-c934-4291-b970-1bd1ca5d301e 实际verified-after-cleanup，73全表计数与摘要/28迁移、5,338,158byte dump（SHA2560da9d4cd14533fabe6a298442df4c823756a5a0c154e1293c14f96632a1fb02c）；目标原会话/原fact/projection一致、字段mask/nullactor/撤权/API对象重启、源原会话/fact/projection不改，targetDB/store删除确认后verified。只DB、同一物理PG，不称文件bytes或新机器/二进制回退；首次a129guards因硬编码envfileflag拒绝无业务效果，兼容显式非空--env-file但实际所有source/session/migguard保持后通过。恢复工具6a22a68已提交。
- CI38442802453精确0200052，verify/290SQL通过，浏览器54/55，equipment首次等待误抓首页pageSize5旧响应造成CDPbody已丢；9921809精确匹配workflowCenter current/pageSize10并即时捕获完成响应body，原ID/link/kind/UI/审批断言保留，单项真实12.8s通过。CI38446409131精确9921809b0ec7e70da642330c50046082248064a1实际全绿，远端303数据库/API（含独立formatter13）与55完整真实浏览器（9.6m）；run.json/workflow.log/real-business-evidence已归档。
- FP031真实CSV/XLSX/PDF renderer15d0b33已提交，Root临时独立CJS编译/原字体license/13实际bytes测试全部通过，临时目录回收。当前durable backend和029pending尚候选；独立复核修空结果姓名query元数据的字段绕过（绑定capture principal当前namegrant）和目录list/count同SQL快照。first15候选被PLpgSQL IF内CASE无括号语法阻断，所有失败日志保留、randomDB确认移除；仅pending SQL补括号后重跑，未应用source29、未把artifact归档标志当原审计事件归档。

- FP031实际15/15数据库/API（21.9s）、完整318/318（146.7s）、全站首轮752单测和types/lint/生产构建通过。029仅在pre29一致备份后应用专属demo，SHA a2e3b9095c63a7416dffdf9261c21bf1268ad38428f1be395d3b0e69a3f1d30f冻结，001–028不改；GC保留audit job/artifact未purge预留key，审计登记仅受控标量，后台按同tenant同job creator当前scope复验，不借报告ACL。
- 新privileges演示初始化最初误取authorization.roleIds而实际DTO提供roles，修形状后普通HTTP管理员仍正确403 PRIVILEGE_BOUNDS阻止自增新权限。保留两次失败；仅对专属合成a-admin/b-admin用部署bootstrap追加6新导出码并保留全部原direct/roles，同事务写service-actor事实，不降低线上delegate bounds；普通角色/权限API不变。
- 首轮真实浏览器两个失败保留browser-target-first：系统事实2974超过2000cap，改唯一实际操作者创建/修改12角色并按literal姓名scope筛选>20完整事实，不删历史不升cap；另一条新page被真实navigation拒绝，因持久menu_route_catalogue漏注册。029已冻结不回写，pre30备份后追加030_audit_export_menu，SHA de317d346acdedfd72f50f55ab3917179f8ff95a5d51de44b41a1243db2e4d22冻结，注册controlledcomponent及当前租户资源，保留原菜单/tombstone/权限。原R1与专属API/worker正常，页面重建后重跑。
- 前端review修复异步hash后身份复验、旧selected私密详情刷新、invalidURL迟到cap禁止宽创建、create-only和显式offpage job详情刷新/轮询/命令连续性。单测17通过，真实PDF现在验中文标题/完整ID；当前/锁定Vue兼容nullablecallback已用显式runtime guard修复。该源码修复不等于浏览器/当前增量CI/实际audit filebytes恢复全部完成；逻辑event归档/保留policy仍需后续FP031实现。

- FP031导出后台48f83f4及真实前端9d9b508已提交。最终browser-target-pdf-decoder-final两条29.4s通过：三真实格式实际native saved file、SHA/size/MIME/全部>20事实ID/中文、空CSV0rows、归档与撤权/跨租户/错误恢复。CDP CSVresponse.body会移除BOM的失败保留；改为实际saved bytes验证且仅允许HTTPbody精确相差BOM。PDF测试reader误将任意hex作为CMap覆盖字形映射，改xref指定Type0 ToUnicode+正文BT..ET后现存真实PDF正确重读，不改producer或削弱中文/完整ID断言。全量57浏览器和本增量CI已启动，结果尚待归档，逻辑原始事件归档/保留policy及30版一致实际auditbytes恢复仍未完成。

### FP-031 导出回归失败定位与修复接续

- 首轮完整57浏览器实际55通过/2失败，`full-browser-final.log` 保留。审计事实由服务端 `newToken()` 生成的 base64url ID 可合法以 `-` 或 `_` 开头，但旧捕获复核/生成器首字符限制拒绝了实际登录事实。仅在事件、操作者、对象和trace的不透明ID分支接受这两个首字符，保留100字符、安全字符集及精确保留名称限制；模块和对象类型仍使用原语义校验。不重写旧事实、不缩小查询夹具绕过。
- `opaque-id-contract-generators.log` 实际45/45、`opaque-id-integration.log` 16/16，通过真实用户创建/口令验证/登录事务，仅控制ID熵源确定触发两种前缀，核验原始事实→固定捕获→复核→实际CSV/ClamAV/下载与原始行未改。CSV公式防护和三种实际文件格式仍成立；`browser-opaque-id-final.log` 两条真实浏览器30.1秒通过。
- 请假失败的只读事实 `leave-flow-diagnosis/ea2595b4-readonly.json` 证明原申请固定v89、真实manager1→manager2任务、第一主管待办rank7/210，产品分配正确。旧测试误抓首页pageSize5响应且在组件未挂载时把loading元素0视为完成，跳过第1页。精确等待workflowCenter的current/pageSize10响应并保留已完成响应body、可见组件和表格aria-busy，再按真实requestId/recordLink/kind逐页定位；两主管、通知和审计断言不改。真实专项1条8.5秒通过。
- [CI38457066817](https://github.com/wzfdhr/af-ideal-admin/actions/runs/38457066817) 精确9d9b508，verify因menu缩进与旧Prettier类型索引写法两处失败；real-business的318项数据库全部通过、57浏览器55通过/2失败，均为新环境platform-demo遗漏六项P6导出权限导致403。最终run.json、workflow.log和实际artifact已存 `audit-exports-20261013/ci-38457066817/`。初始化器仅在明确demo数据库对tenant-a/a-admin及tenant-b/b-admin追加缺失码，保留原权限/角色，每次实际增加与revision/空服务主体审计同事务；重复无新增事实，普通HTTP授权边界不降低。
- 初始化专项 `demo-init-integration-reviewed.log` 17/17。初轮新增测试误用不存在的role_ids列，修为实际member_roles子查询，失败日志保留。随后完整321首轮318通过/3失败：测试调用既有全平台初始化留下主管演示字段权限，导致两个后续报表脱敏负向失败及一个后续worker用例失败。仅修测试完整成员状态还原并断言，不放松产品权限或原断言；第二轮完整数据库与修复后57浏览器仍在运行，未据专项结果宣称全量或CI通过。
- 独立只读安全复核未发现ID/P6初始化/请假等待修复的阻断问题。实际30版文件字节恢复工具仍在候选审查：六类引用锁与真实size/SHA、精确既有41缺失ID、未知CREATE/容器/关闭结果保留屏障；尚未执行，不把静态检查写成恢复成功。逻辑事件归档契约与后端另行实现，001–030已应用迁移原字节保持冻结，整个Goal维持active。
- 修复后 `repairs-integration-all-isolation.log` 实际321/321（148.9秒），报表脱敏与worker负向恢复全部通过；`repairs-full-browser.log` 实际57/57（8.3分钟），包含原R1及当前所有真实模块。独立复核发现测试把JS Date写回会丢PG微秒，后仅恢复初始化实际改动的权限/部门/revision，以updated_at::text比较原精度且不写回；`demo-init-isolation-precision-final.log` 最终17/17（22.1秒）。生产变更全workspace类型、所改生产文件lint和锁定Prettier2检查通过。本次源码修复的远程CI尚待触发/结果，原始事件逻辑归档、保留策略、实际30版文件恢复和全产品最终门禁继续开放。
- 修复提交 `ce63ca619c5f761be83abd70501696e000552e35` 已推送，实际 [CI38461733470](https://github.com/wzfdhr/af-ideal-admin/actions/runs/38461733470) 已启动；最终结论待归档。本增量继续修复恢复审查发现的通用GC缺口：报表制品即使已过期，在purged_at仍为空时仍属于引用，不能绕过制品锁删除实际字节。`gc-backup-integration.log` 20/20（12.9秒），含真实生成/扫描制品在过期状态提交、删除字节前死亡的窗口，持制品FOR SHARE时通用GC保留原SHA，随后正式expiry确实删除字节。候选新归档renderer类型暂时阻断首轮build，失败保留；修复新模块类型后 `gc-backup-build-api-final.log` 整体编译成功，实际API与worker随后重启加载GC修复，原11888仍ready。
- `verify-audit-export-recovery.mjs` 独立只读审查的四项问题均修复：拥有分片的upload父行先于part加锁；通用GC保留未purge制品；未知创建HTTP仅在阳性durable回执时清除不确定标记；历史缺失使用hash固定证据的tenant/id/key/size/SHA五元组。未知CREATE/容器/目标服务或连接关闭结果、源任务竞态均阻止删除目标；源控制连接池在已确认目标删除后关闭，不能概括为所有源池关闭错误都能保留已删除目标。
- 实际恢复run `b95562b3-b40b-441f-ac06-780f9f710f54` verified：76张表计数/摘要与30迁移校验和一致，真实PGDMP 6,090,716 bytes，SHA256 `cd0f23bce6c7ec754c86ec4d895b143788707cb2c78e447c7cb3ae39ca03a28a`；六类引用去重复制98对象、1,782,549 bytes，含6条活跃file_parts。报告SHA256 `a6075b600e08a274e1889bd832adbbed62243bb6b4b3ce5166f04081fdda69bf`，证据 `database-and-file-copy/b95562b3-b40b-441f-ac06-780f9f710f54/`。
- 本次新建三项合成源端CSV/XLSX/PDF见证，通过正常源worker真实扫描/下载，仍按7天生命周期保留；恢复后同原会话、同任务/制品ID、size/MIME/SHA及实际字节一致。第四项自有排队任务在单行锁确认queued/attempt0后延后，只在恢复库精确owned scope续跑且重复无第二效果，源库未出现目标制品，最后按当前revision取消源自有任务。目标库/store确认移除后才verified。首个run因漏传R1_API_URL在guard阶段拒绝，未创建源任务或目标库；传明确10890后成功，失败报告保留。
- 两个仅预留key无字节对象单列；既有41缺失文件与固定历史五元组完全一致，未称全部历史字节已恢复。此证据是同一物理PG中的独立库/store恢复，不是新物理服务器、客户部署、兼容二进制回退或全产品最终验收。事件归档与策略继续接续，001–030冻结，Goal维持active。
- CI38461733470最终精确ce63ca6，verify与real-business均success：757单测、119契约/25领域、321数据库/API（169.2秒）和57完整真实浏览器（8.5分钟），另Mock/smoke、类型/lint/构建通过。`ci-38461733470/{run.json,workflow.log,artifacts}`已实际归档；不把此SHA的成功移用到后续GC/恢复/归档实现。恢复工具/GC提交2562110，独立归档契约e86245b（16项实际通过），保留请假原“查看更多”真实点击的35a54e4（专项1条8.7秒）已推送并触发CI38464969679，结果待归档。
- 原事件归档的031与服务/worker/producer2独立批次候选尚未接线、未迁移Source；完整候选一条当前受权SQL固定manifest，100000为明确资源上限、超过拒绝而非截断，单批2000/2MiB/10MiB；新v2查询保持archiveState缺席，不改旧v1规范字节。首个15项候选数据库运行全部因测试新角色未授manage正确403，未降低服务边界；夹具修复和独立安全审查正在推进，失败日志及随机库移除确认保留。真实进程中断、制品实际到期后成员仍在、执行者换绑/恢复和最终UI/查询筛选/恢复/CI保持待验。
- CI38464969679最终精确35a54e4a2cf5277fe9dadf3456c277f945b39610，verify/real-business均success：757单测、135契约/25领域、321数据库/API（260.6秒）与57真实浏览器（8.9分钟），完整日志及artifact已归档。这证明恢复/GC、独立契约及原请假导航增量，不移用到未提交的031实现。
- 归档候选独立复核发现的非空角色分区、调度锁序、文件purge行锁、五次失租约仍可无效重试均已修复；前端修统一隐私代际、策略dirty草稿保护、201批分页/第101批精确读取、命令与URL连续性、页外运行20轮有限轮询。主站和锁定旧Vue3.2分别18项归档页面/API通过；连同V2检索与ALL权限入口，Root专项37项通过。
- `retention-integration-lifecycle.log` 实际24/24（85.6秒），包含三种真实格式/扫描/字节、2001完整候选、100001整体拒绝、并发永久成员首次唯一、事务/取消/失租约、策略锁并发、持备份行锁的实际到期删除、cancelled/failed未登记文件的365天退休与foreign scope不变、V1/all/hot/archived当前授权及清理后成员永久保留、实际子进程SIGKILL/退出确认/不同PID恢复和原执行人换绑/还原固定manifest。测试临时库已确认移除；Source未借此迁移。
- 第五版失败事实绑定固定本次旧executor的membership（actor仍null/result仍failure），避免使用已变更的策略主体。首次全量 `retention-integration-all-first.log` 346项345通过/1失败（247.8秒），新增25项均通过；唯一旧负向将现在支持的version2当未来版本，改为version3并保留V1/V2省略字段/同集合对照后正在重跑。全站 `retention-unit-all-first.log` 782/782，类型与生产构建成功，lint零错误/26既有警告；不称候选API/SQL阶段已完成真实UI或对应CI。
- `before-031.dump` 已实际通过同一repeatable-read/pg_export_snapshot完成：Source76表、30迁移与001–030全部文件校验和一致，6,093,278 bytes，SHA256 `6043ad776f7e53c6b05bc00f6ad0723e43393000fa6a450d5fc80517dfb02dc7`。独立随机全量库显式预应用031.pending并使用自有临时store，Source库和原R1仍ready；实际31部署、真实浏览器、31恢复/最终CI仍待执行，整个Goal保持active。
- `retention-integration-all-reviewed.log` 最终346/346（248.8秒），包括新增25项归档/权限/文件/进程回归及原R1全部模块；随机库确认移除，单测782/类型/构建/lint保持通过。随后只对专属Source执行已审查031，`source-031.json/log` 实际83表/31迁移，SHA256 `b8a8290720509617a87987615db074696701f2f0329785d5aeaa31c33ae6e1b7` 从此冻结，001–030未改。controlled菜单ALL四权限及预留/制品引用、实际worker接线已启用；管理权限仅对精确合成管理员audited CLI追加，不降低普通授权API边界。
- 新Source API/worker重启加载实际31接线后10890与原R1 11888均ready200。真实归档UI两条候选开始验收；它们由实际角色操作产生22/2/1不同源事实，三个格式分别验证hot→archived成员、all仍在、真实下载与权限撤销，不能把Source迁移或单测写成UI通过。83表31版文件/成员关联恢复工具独立编写审查中，未执行；新物理环境、兼容回退、客户/正式交付仍开放。
