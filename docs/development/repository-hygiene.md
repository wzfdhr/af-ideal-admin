# 仓库卫生规范

本规范用于阶段提交、PR 和发布前检查，目标是让仓库保持可审计、可复现、无敏感信息泄露。任何企业级任务在进入完成状态前，都必须确认本规范通过。

## 禁止提交内容

以下内容不得进入 Git 跟踪文件：

- 生成产物：`dist/`、`coverage/`、`test-results/`、`playwright-report/`。
- 依赖目录：`node_modules/`、`.cache/`、包管理器本地缓存。
- 依赖压缩包和构建压缩包：`dist.zip`、`node_modules.zip`、其他本地 `.zip` 临时包。
- 本地环境文件：`.env.local`、`.env.development.local`、`.env.production.local`、个人调试配置。
- 系统临时文件：`.DS_Store`、临时日志、调试报告。
- 敏感信息：访问 token、Authorization 凭证、密码、身份证号、手机号明文样例、生产数据库地址。

## 提交前检查

每次阶段提交前至少执行：

```bash
git status --short
git ls-files | rg "(^dist/|^node_modules/|^coverage/|^test-results/|^playwright-report/|\\.zip$|\\.DS_Store$)"
```

第一条命令用于确认工作区只包含本阶段相关文件。第二条命令应该无输出；如果有输出，说明生成产物或压缩包已经被跟踪，需要先从 Git 跟踪中移除。

敏感信息检查建议使用：

```bash
rg -n "Authorization: Bearer|x-access-token|personal access token|access token" docs src tests config public
```

如果命中的是协议说明或脱敏逻辑，需要确认没有真实凭证值。如果命中真实凭证，必须立即删除提交内容、轮换凭证，并在发布说明中记录风险处置。

## 开发约束

- Mock 数据可以包含测试用户名、测试手机号和测试邮箱，但不得使用真实客户或生产数据。
- 文档可以描述凭证类型，但不得写入真实 token、私钥、账号密码或生产连接串。
- 构建、测试和浏览器报告只作为本地或 CI 产物保存，不进入源码仓库。
- 新增工具脚本如果会生成文件，必须同步更新 `.gitignore` 和本规范。

## CI 和评审要求

仓库卫生门禁由 `tests/unit/repository-hygiene.test.ts` 覆盖。该测试会检查：

- Git 跟踪文件中没有生成产物、依赖目录、测试报告和压缩包。
- `.gitignore` 覆盖常见本地产物和临时文件。
- 开发文档中心和发布 checklist 链接本规范。
- 已跟踪文本文件中没有常见真实访问凭证。

代码评审时如发现上述问题，必须暂缓合并。修复方式优先使用普通提交或 revert，不允许用覆盖历史的方式处理协作分支，除非团队明确批准。
