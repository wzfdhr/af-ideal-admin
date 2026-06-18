# AF-Ideal-Admin 工程化基线协作交接

日期：2026-06-18
当前工作分支：`codex/engineering-baseline`
远端仓库：`https://github.com/wzfdhr/af-ideal-admin`

## 当前进度

本轮目标是按路线 B 做“工程化基线”改造，让项目从可运行模板逐步升级为更安全、可测试、可 CI 验证的后台项目。

已经完成：

1. 更新并完善项目 README。
2. 新增完整实施计划：
   - `docs/superpowers/plans/2026-06-18-engineering-baseline.md`
3. 新增 worktree 忽略规则：
   - `.gitignore` 增加 `.worktrees/`
4. 创建隔离分支和工作区：
   - 分支：`codex/engineering-baseline`
   - 本地 worktree：`D:\个人产品\af-ideal-admin\.worktrees\engineering-baseline`
5. 完成 Task 1：测试工具基线。
   - 新增 Vitest 配置。
   - 新增 Playwright 配置。
   - 新增 `src/test/setup.ts`。
   - 新增真实测试脚本：`typecheck`、`test`、`test:watch`、`test:e2e`、`lint:check`。
   - 安装测试依赖：`vitest@0.34.6`、`@vue/test-utils@2.4.6`、`jsdom@22.1.0`、`@playwright/test@1.42.1`。
   - 最小修复 `src/utils/dynamicTitle.ts` 的既有类型错误。

当前相关提交：

```text
a413d5c test: add project test tooling
2d1508c docs: add engineering baseline plan
81c10f2 docs: update project README
```

## 当前验证结果

已验证：

```text
vue-tsc --noEmit: 通过
vitest run: 因当前还没有测试文件而退出 1
```

说明：Vitest 配置已经可用，但项目尚未添加 `*.test.ts` 文件，所以 `vitest run` 当前会输出 `No test files found`。这是 Task 2 之后会自然解决的问题。

安装测试依赖时 npm audit 提示当前依赖树存在漏洞：

```text
61 vulnerabilities (2 low, 29 moderate, 27 high, 3 critical)
```

这不是本轮 Task 1 引入的单点问题，更像旧依赖栈的整体治理项。建议在 CI 基线稳定后单独开任务评估升级范围。

## 后续继续做什么

按计划文档继续执行即可，建议顺序不要跳：

1. Task 2：统一路由权限字段
   - 把 `meta.role`、`meta.rules` 统一为 `meta.roles`。
   - 给权限判断补单测。
2. Task 3：替换字符串路由组件
   - 新增 `route-group-layout.vue`。
   - 把 `component: ''` 改成真实布局组件。
3. Task 4：移除保存密码和弱加密
   - 登录页只保留“记住用户名”。
   - 删除硬编码 AES ECB 加密工具。
4. Task 5：移除表单规则 `eval`
   - 用安全 JSON 规则解析替代动态代码执行。
5. Task 6：统一环境变量和 Axios baseURL
   - 收敛 `VITE_API_BASE_URL`、代理目标和请求前缀。
6. Task 7：添加 GitHub Actions CI
   - 跑 lint、typecheck、unit test、build、e2e。
7. Task 8：添加 E2E 登录和权限冒烟测试。
8. Task 9：清理调试日志和 lint 规则。
9. Task 10：补架构文档和部署文档。
10. Task 11：完整验证并发布。

详细执行步骤在：

```text
docs/superpowers/plans/2026-06-18-engineering-baseline.md
```

## 回家后怎么接着做

推荐从远端拉取分支：

```bash
git fetch origin
git switch codex/engineering-baseline
```

如果本地没有该分支：

```bash
git switch -c codex/engineering-baseline origin/codex/engineering-baseline
```

安装依赖：

```bash
npm install
```

先跑基线检查：

```bash
npm run typecheck
npm run test
```

注意：在 Task 2 还没添加单测前，`npm run test` 可能因为没有测试文件退出 1。添加 `tests/unit/permission.test.ts` 后再以它作为单测基线。

## 重要注意事项

- 不要直接在 `framework` 上继续大改，建议继续使用 `codex/engineering-baseline`。
- 后续每个 Task 做完后单独提交，方便回滚和 review。
- `gh` 当前本机不可用或不可稳定调用，所以这次只推 GitHub 分支，不自动创建 PR。
- 项目仍包含 `node_modules.zip` 和 `dist.zip`，后续可以单独决定是否从源码仓库移除。
- 不要把 `.worktrees/`、`.npm-cache/`、`node_modules/` 提交进仓库。

## 下一步建议

回家后优先做 Task 2、Task 3、Task 4。它们能把权限正确性和登录安全先稳住，收益最大。
