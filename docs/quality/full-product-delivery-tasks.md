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
| FP-007 | 菜单资源持久化、安全 componentKey、路由/按钮权限一致 | FP-005 | T-106/T-204 | 未开始 |
| FP-008 | 字典和项目持久化、版本、租户范围及缓存失效 | FP-005 | T-203/T-204 | 进行中 |
| FP-009 | 应用创建/复制/配置/发布/归档，独立 ID 和版本 | FP-005 | LA-037 | 进行中 |
| FP-010 | 通用业务记录、提交/详情/权限/快照/历史和 R1 适配 | FP-006/009 | LA-037/042 | 进行中 |
| FP-011 | 复杂表单校验/联动、安全数据源登记、映射、超时及恢复 | FP-008/010 | T-301/303 | 进行中 |
| FP-012 | 表单编辑重开、比较、发布运行一致、格式迁移和回滚 | FP-011 | T-304/LA-040 | 进行中 |
| FP-013 | 结构化条件 AST 的真实流程运行，确定路由、拒绝脚本和错误恢复 | FP-010 | LA-044 | 未开始 |
| FP-014 | 并行/会签、汇合规则、并发与重复处理、撤回清理 | FP-013 | LA-044 | 未开始 |
| FP-015 | 转交、无效身份、异常处理、授权/审计/任务幂等 | FP-014 | LA-044 | 未开始 |
| FP-016 | 耐久流程超时/调度、租约、重启和唯一执行 | FP-015 | LA-044 | 未开始 |
| FP-017 | query/submit/navigate/openModal/refreshBlock/受控发起流程实际执行 | FP-010/012 | LA-038 | 未开始 |
| FP-018 | 低代码权限、保存重开、发布/灰度/回滚及真实管理页生成或渲染 | FP-017 | LA-039/T-610 | 未开始 |
| FP-019 | 包格式/依赖/校验/引用迁移，新租户导入运行；无凭据/业务数据 | FP-012/018 | LA-040 | 进行中 |
| FP-020 | 对象存储、真实附件 bytes、上传/下载/预览/分片与授权绑定 | FP-004/010 | LA-041 | 进行中 |
| FP-021 | 扫描、隔离、失败/孤立清理和文件审计 | FP-020 | LA-041 | 进行中 |
| FP-022 | 设备领用第二模板，复用配置/审批/附件/通知/审计及记录增量 | FP-019/021 | LA-042 | 进行中 |
| FP-023 | 公告、订阅、模板/变量、审批及授权收件范围持久化 | FP-005 | 消息规划 | 未开始 |
| FP-024 | 发送任务、重试去重、实时推送重鉴权、重启及发送审计 | FP-016/023 | 消息规划 | 未开始 |
| FP-025 | 真实报表查询、字段口径/脱敏及趋势/分布/明细 | FP-006/010 | T-354 | 未开始 |
| FP-026 | 异步真实导出、授权下载、进度/失败、归档/审计 | FP-021/025 | T-354/614 | 未开始 |
| FP-027 | 可启停的定时报表、重启恢复、唯一执行及告警 | FP-016/026 | 报表规划 | 未开始 |
| FP-028 | 大屏画布/布局快照/主题、保存重开、预览/发布/回滚 | FP-018/025 | T-353 | 未开始 |
| FP-029 | 运营/销售/设备三套模板及真实刷新、过期/空/错误/全屏 | FP-028 | T-611 | 未开始 |
| FP-030 | 授权/发布/文件/导出/业务事实审计及失败/trace 检索 | FP-005/024/026 | T-402/404 | 未开始 |
| FP-031 | 审计保留、归档、授权导出和恢复关联 | FP-030 | 审计规划 | 未开始 |
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
