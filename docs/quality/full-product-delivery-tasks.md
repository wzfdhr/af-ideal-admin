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
