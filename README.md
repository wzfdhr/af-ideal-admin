# AF-Ideal-Admin

## More Docs

- [Auth and permission architecture](docs/architecture/auth-permission.md)
- [Deployment](docs/deployment.md)

AF-Ideal-Admin 是一个基于 Vue 3、TypeScript 和 Vite 的后台管理系统模板。项目内置登录鉴权、动态菜单、页面权限、按钮权限、可视化看板、表单页面、列表页面、系统管理页面和可拖拽表单设计器，适合作为中后台项目的二次开发基础。

## 项目概览

- 框架：Vue 3 + TypeScript + Vite 4
- UI：Arco Design Vue + Tailwind CSS + Sass
- 状态管理：Pinia
- 路由：Vue Router 4，路由模块按业务拆分
- 图表：ECharts、vue-echarts
- 流程/拖拽能力：AntV X6、vuedraggable
- 请求：Axios，全局请求/响应拦截器
- Mock：Mock.js，仅在开发环境启用
- 工程化：ESLint、Prettier、Husky、lint-staged

## 快速开始

环境建议：

- Node.js 20，建议通过 `.nvmrc` 固定本地版本
- 使用 npm，因为仓库已包含 `package-lock.json`
- 推荐编辑器：VS Code + Volar + ESLint + Tailwind CSS IntelliSense

安装依赖：

```bash
npm ci
```

启动开发服务：

```bash
npm run dev
```

局域网访问：

```bash
npm run dev -- --host
```

构建开发环境包：

```bash
npm run build:dev
```

构建生产环境包：

```bash
npm run build:prd
```

预览构建产物：

```bash
npm run preview
```

代码检查并自动修复：

```bash
npm run lint
```

## 本地登录账号

开发环境会自动加载 `src/mock` 下的 Mock 接口，可直接使用以下账号登录：

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 管理员 | `admin` | `admin` |
| 普通用户 | `user` | `user` |

登录成功后，Mock 会把用户角色写入 `localStorage.userRole`，权限判断依赖该角色。

## 目录结构

```text
.
├── config/                 # 全局公共配置，如菜单来源、权限策略、缓存路由
├── public/                 # 静态资源
├── src/
│   ├── api/                # Axios 请求封装与业务 API
│   ├── assets/             # 图片、SVG、样式资源
│   ├── components/         # 通用组件与表单设计器组件
│   ├── directives/         # 自定义指令，如按钮权限 v-allow
│   ├── hooks/              # 组合式函数
│   ├── layout/             # 页面布局
│   ├── locale/             # 国际化入口
│   ├── mock/               # 开发环境 Mock 数据
│   ├── router/             # 路由、菜单、守卫、路由国际化
│   ├── store/              # Pinia 状态模块
│   ├── styles/             # 全局样式与业务样式模块
│   ├── utils/              # 通用工具函数
│   └── views/              # 页面级业务模块
├── vite.config.ts          # Vite 配置
├── tailwind.config.js      # Tailwind 配置
└── package.json            # 项目脚本与依赖
```

## 核心模块

- 仪表盘：工作台、分析页，位于 `src/views/dashboard`
- 可视化：分析页、多维分析页，位于 `src/views/visualization`
- 表单：复杂步骤表单、高级表单、分步表单，位于 `src/views/form`
- 列表：卡片列表、普通列表，位于 `src/views/list`
- 权限：前端页面权限、按钮权限、后端菜单权限演示，位于 `src/views/permissions` 和 `src/views/backendPermissions`
- 系统管理：用户、角色、菜单、部门、字典页面，位于 `src/views/system`
- 用户中心：个人信息页，位于 `src/views/user`
- 扩展能力：表单设计器，位于 `src/views/formDesign` 和 `src/components/form-designer`

## 路由与权限

路由入口在 `src/router/index.ts`，业务路由集中在 `src/router/routes/modules`。新增页面时，通常新增或修改该目录下的模块即可。

权限判断主要由以下文件协作完成：

- `config/index.ts`：配置 `menuFromServer`、`toNoPermissionPage`、缓存路由等全局行为。
- `src/router/guards/permission.ts`：路由访问守卫。
- `src/hooks/use-permission.ts`：判断当前用户角色是否可访问路由。
- `src/directives/permission.ts`：按钮权限指令 `v-allow`。
- `src/store/modules/user.ts`：保存当前用户信息和角色。
- `src/store/modules/menu.ts`：保存服务端菜单、菜单折叠状态和缓存路由。

当前 `menuFromServer` 默认为 `false`，系统使用前端静态路由生成菜单。若切换为 `true`，会通过 `/api/user/menu` 获取服务端菜单。

路由权限字段统一使用 `meta.roles`。后续新增路由时应继续沿用该字段，避免出现权限钩子无法识别的自定义字段。

## 请求与环境变量

Axios 拦截器位于 `src/api/request.ts`：

- 请求时从本地存储读取 token，并写入 `X-Access-Token` 请求头。
- 响应约定 `code === 20000` 为成功，否则弹出错误提示并 reject。

环境变量文件：

- `.env.development`：开发环境配置
- `.env.production`：生产环境配置

当前可用变量：

| 变量 | 说明 |
| --- | --- |
| `VITE_APP_ENV` | 当前环境标识 |
| `VITE_BASE_URL` | 应用基础路径 |
| `VITE_API_BASE_URL` | API 请求前缀，Axios 会使用该值作为公共前缀 |
| `VITE_API_PROXY_TARGET` | 开发环境 API 代理目标 |
| `VITE_APP_TITLE` | 页面标题 |

请求公共前缀来自 `config/index.ts` 的 `import.meta.env.VITE_API_BASE_URL`。开发服务器会把该前缀代理到 `VITE_API_PROXY_TARGET`。

## 开发注意事项

- `src/mock` 只在 `import.meta.env.DEV` 为 `true` 时启用，生产构建不会自动启用 Mock。
- Vite 开发服务器使用 `VITE_API_BASE_URL` 和 `VITE_API_PROXY_TARGET` 配置 API 代理，见 `vite.config.ts`。
- `src/router/index.ts` 使用 `createWebHistory()`，部署到非根路径时需要同步确认前端路由与服务器回退配置。
- `package.json` 没有 `build` 脚本，请使用 `build:dev` 或 `build:prd`。

## 后续优化建议

- 统一路由权限字段，全部收敛为 `meta.roles`。
- 清理调试日志，例如权限守卫和菜单 store 中的 `console.log`。
- 根据真实后端接口确认 `VITE_API_BASE_URL` 和 `VITE_API_PROXY_TARGET` 的部署策略。
- 根据真实后端接口替换 Mock 数据，并补充接口契约文档。
- 为核心权限逻辑、登录流程和表单设计器补充最小化测试。
