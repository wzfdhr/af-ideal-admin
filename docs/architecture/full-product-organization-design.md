# 全产品组织管理第一条真实路径

对应 FP-002，承接全产品 Goal；R1 原包和分支保留。此阶段真实实现部门 CRUD 及后端树约束，完整树编辑、岗位和成员组织管理仍须继续，不把单页 CRUD 标为整个系统管理完成。

## 复用与职责

现有 departmentSystem 页面复用 ProForm、ProTable、权限按钮和 request-client。共享 contracts 定义 Department、输入校验、DEPARTMENT_PERMISSIONS；参考 API organization 模块负责真实资源查询和命令；003_organization.sql 建部门表及组合租户关联。没有替换组件库或引入通用无语义 JSON CRUD。

GET /system/departments 为当前租户列表、分页、名称和状态过滤；GET /system/departments/:id 为授权详情。POST、PUT、DELETE 均需 Idempotency-Key；PUT 和 DELETE 需 expectedRevision。成功沿用 code 20000 与 traceId。未知字段422、无功能权限403、不可见资源404、版本/状态/幂等/引用冲突409。父部门可缺省/为null，写入不能引用其他租户、停用或删除的父部门；移动不能形成环。

写事务复用已授权成员刷新、幂等和事实审计；按租户组织树 advisory lock 串行树修改，再锁资源版本。成功事实审计同事务提交，重放不产生第二份。删除用墓碑保留资源历史，但有关联成员或活动子部门时拒绝，不以级联删除抹掉人员或业务数据。

## 兼容与初始化

003 只增表和 memberships.department_id；现有成员按旧部门名称建立确定性 legacy-dept 标识，不改请假历史快照。旧字段保留，后续成员管理再统一组织关联和显示名称；当前不能声称岗位/完整组织授权已交付。

旧 Mock DTO 可无 revision，API helper 保留无新增参数调用；真实更新与删除必须带服务端返回版本。页面把编辑版本放在独立 ref 中，避免 ProForm 提交只保留 schema 字段时丢失版本；失败保留编辑内容。R1 参考服务没有 system 路由的历史版本不兼容新版页面，需要先执行迁移并更新 API。

platform-demo.js 仅允许 APP_MODE=demo 和专属 *_demo 数据库，显式初始化共享合成身份、真实部门及管理员五个部门权限；不自动运行，不修改现有 R1 凭据或生产库。没有将应用配置管理员隐式升级为全站通配管理员。生产授权和最后管理员保护仍在 FP-004/005。

固定部门状态 /sys/dic/departmentStatus 返回受控枚举，非完整持久化字典模块；FP-008 仍未完成。其他系统页仍不可因新增一个入口宣称真实接入。

## 当前证据和剩余门禁

test-results/full-product/organization-red.log 是真实404失败；department-http-green.log 记录41项数据库/HTTP回归，其中部门正负向4项。department-e2e.log 暴露编辑版本丢失，department-e2e-revision-fixed.log 使用独立管理员浏览器连接真实 API 后通过新增、重开、编辑、删除及租户隔离。department-ui-unit.log 六项、department-unit-full.log 425项前端单测通过；lint/typecheck/build 证据独立保存。

新开发环境为独立随机 *_demo 库，API 10890、前端真实网关4189；私有环境文件存入 APFS 临时目录，不写报告或 Git。旧 R1 Compose 和数据卷保留。原 GitHub CI 最后记录为失败，任务 API 显示失败步骤 Install Playwright browsers；历史日志已410过期，不能虚构具体原因。当前 GitHub 账号具管理员权限，新增 workflow_dispatch 和平台合成初始化，但远端新 CI 尚需实际运行。

回滚优先停用新增菜单/权限并回退本阶段代码，保留003新增数据，不自动删除部门表/成员关联。新迁移使新版 readiness 需要003，更新和回退都先按备份/兼容说明验证。全产品备份校验需新增组织实体，旧 R1 19表演练不能替代它。
