# R1 请假审批部署、初始化和恢复

范围为请假应用的串行审批、站内通知和服务端审计。原有低代码、文件、短信等演示模块不属于真实参考 API 能力。配套 [技术方案](../architecture/leave-approval-delivery-design.md)、[任务清单](../quality/leave-approval-delivery-tasks.md)、[Goal 提示词](../collaboration/leave-approval-goal-prompt.md)。

## 环境与镜像

Node 24.17.0、npm 11.13.0、PostgreSQL 16。Compose 使用固定镜像摘要，迁移成功、数据库和 API 就绪后才启动 worker 与 Nginx。当前验证基底为官方 Playwright 镜像，内含匹配的 Node/npm；体积较大，后续可在兼容验证后更换精简运行基底。

```sh
npm ci
npm run build:all
node scripts/build-r1-images.mjs
```

构建脚本只复制 Git 管理及未忽略的源文件到临时目录，排除 `._*` 与 `*.local`，解决外置 ExFAT 的 Docker xattr 错误，完成后清理自身临时目录。不会发送本地密钥、依赖或测试产物。常规文件系统也可直接 `docker compose --env-file .env.r1-compose.local -f deploy/compose/compose.yml build`。

建立仅本机可读的 `.env.r1-compose.local`，内容如下；密码必须自行生成，不使用文档示例口令：

```dotenv
R1_DB_PASSWORD=<独立随机密码，采用至少32位十六进制字符>
R1_APP_MODE=demo
R1_API_PORT=11888
R1_WEB_PORT=4185
```

在 Unix 文件系统执行 `chmod 600 .env.r1-compose.local`。该文件已被 Git 和 Docker 忽略。不要输出展开后的 Compose config，它含数据库凭据。

## 持久化演示

```sh
docker compose --env-file .env.r1-compose.local -f deploy/compose/compose.yml up -d --no-build
docker compose --env-file .env.r1-compose.local -f deploy/compose/compose.yml --profile demo run --rm seed
```

打开 `http://127.0.0.1:4185`。仅演示使用 `a-employee`、`a-manager-1`、`a-manager-2`、`a-admin`、`a-auditor`，B 租户对应前缀 `b-`，另有 `cross-tenant-employee`；演示口令与账号名相同。数据存入 Compose 专属持久卷，重启不自动重置。生产前端显示持久化演示标识，浏览器不加载 Mock。

```sh
R1_WEB_URL=http://127.0.0.1:4185 R1_API_URL=http://127.0.0.1:11888 npm run test:e2e:real
```

开发 Mock 使用 `npm run dev -- --mode mock`，内存状态和固定场景时钟仅证明开发交互。正式 API 故障不会回退 Mock。

重置采用本机离线命令，没有公开 reset HTTP 路由。命令只允许显式 demo 模式、固定演示库及 A/B 演示租户；先停 API/worker、生成私有备份，再清空合成数据并重新种子：

```sh
R1_RESET_CONFIRM=reset-isolated-compose-demo node scripts/reset-r1-demo.mjs
```

重置会使旧会话失效，应重新登录。不要对试点库执行该命令；试点及演示 API 上 `/api/demo/reset`、`/api/reset`、`/api/mock/reset` 均不存在。

## 试点初始化

试点必须使用**新的部署项目和空数据库卷**；不要把已有演示库改名作为试点库。使用私有 `pilot.env.local` 设置 `R1_PROJECT_NAME=af-admin-r1-pilot`、`R1_DB_NAME=af_admin_r1_pilot`、`R1_DB_USER=af_admin`、`R1_APP_MODE=pilot`、不同于演示的端口和独立 `R1_DB_PASSWORD`，并设置 `R1_BOOTSTRAP_FILE` 为私有 JSON 的绝对路径。Compose project name 会隔离数据卷和网络，不执行演示 seed。外部接入仍须按组织网络规范配置 HTTPS、访问入口及备份保管。

创建权限为 0600 的 JSON 文件，最多 100 个账号，包含至少一个管理员和两个审批人。示例中的占位符须替换为真实独立凭据（至少 16 字符，不能等于用户名）：

```json
{
  "tenantId": "company-01",
  "tenantName": "试点单位",
  "members": [
    { "username": "pilot-admin", "name": "配置管理员", "department": "管理部", "kind": "admin", "password": "<独立密码>" },
    { "username": "pilot-reviewer-1", "name": "第一主管", "department": "业务部", "kind": "manager", "password": "<独立密码>" },
    { "username": "pilot-reviewer-2", "name": "第二主管", "department": "业务部", "kind": "manager", "password": "<独立密码>" },
    { "username": "pilot-employee", "name": "员工", "department": "业务部", "kind": "employee", "password": "<独立密码>" },
    { "username": "pilot-auditor", "name": "审计员", "department": "管理部", "kind": "auditor", "password": "<独立密码>" }
  ]
}
```

运行一次性初始化服务（替换私有配置文件路径）：

```sh
docker compose --env-file /absolute/private/pilot.env.local -f deploy/compose/compose.yml up -d --no-build
docker compose --env-file /absolute/private/pilot.env.local -f deploy/compose/compose.yml --profile pilot run --rm initialize
```

初始化 profile 将 JSON 只读挂载，不会因文件缺失创建目录。演示种子拒绝非演示库名，即使误执行 demo profile，也不能写入名为 `af_admin_r1_pilot` 的试点库。

初始化是空库一次性事务；失败全部回滚，重复初始化拒绝，不自动修改现有账号。凭据以 scrypt 哈希存储，初始化不打印明文。初始化后管理员登录“请假应用配置”，核对表单及两位串行主管，显式发布组合版本后员工才可申请。管理员配置权限不自动赋予申请事由读取权。

## 备份和恢复

备份包含敏感业务数据和身份哈希，应存入受控目录；日志与 Git 只保留摘要，不提交 dump 或 private env。以下演练命令仅用于本 Goal 创建的隔离演示环境：

```sh
R1_RECOVERY_CONFIRM=isolated-compose-demo node scripts/verify-r1-recovery.mjs
```

它生成草稿及在途申请，重启 API/worker/数据库，检查会话、内容及 Nginx 重连；暂停 worker 后以 `pg_dump -Fc` 备份。恢复使用新 PostgreSQL 容器和新持久卷，不覆盖源库；19 张表逐行摘要核对后，用兼容 API 镜像完成恢复库中的审批，确认源申请仍在途。报告在 `test-results/r1-recovery/report.json`，dump 和私有 env 均被忽略。完成后停止恢复容器，保留新卷和备份以便复核。

实际试点维护使用同样的 `pg_dump -Fc`／`pg_restore --exit-on-error` 流程，先暂停写入和 worker，并在新实例验证版本、申请、任务、历史、审计及通知关联。未经核对不要覆盖有效库或自动清理恢复卷。

## 回滚

部署新镜像前记录 API、web 镜像 ID，并保留旧镜像标签和备份。应用配置回滚只切换活动发布指针，不修改已发布快照和在途申请。

服务回滚使用上一兼容 API/web 镜像重新创建服务，保留数据库卷；不执行破坏性 down migration。恢复演练可通过 `R1_RESTORE_API_IMAGE=af-admin-r1-api:recovery-baseline` 指定保留的前一镜像，检查其能读取新备份并继续审批。若迁移与旧镜像不兼容，停止回滚，先在新实例核验恢复方案。

## 验证与 CI

本地运行 lint、全部 workspace typecheck、前端单测、共享契约/领域测试、真实数据库 integration、生产 build、旧登录权限 smoke、真实多账号 E2E。CI 新增独立 PostgreSQL service 和真实业务 job，归档 `test-results/` 中的非敏感报告；私有备份及 env 不能上传 CI artifact。当前仓库内配置完成不等于远端 CI 已执行成功。

readiness 检查已应用迁移及其校验和；`/health` 仅代表进程存活。Nginx 使用 Docker DNS 动态解析，API 容器地址变化后能重新连接。运行日志只包含 traceId、路由模板、HTTP 状态和时间，不输出请求体、token、数据库 URL 或完整请假事由。
