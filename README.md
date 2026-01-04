# AF-workflows

AF-workflows 是一个基于 Vue 3 的可视化工作流前端项目模板，旨在提供可拖拽的表单与流程设计能力，便于快速搭建业务工作流和可视化页面。

主要技术栈：

- [Vue 3](https://cn.vuejs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite 4](https://cn.vitejs.dev/)
- [TailwindCSS 3](https://tailwindcss.com/)
- [Sass](https://sass-lang.com/)
- [Pinia](https://pinia.web3doc.top/)
- [Arco Design](https://github.com/arco-design/arco-design-vue)

## 推荐开发环境

推荐使用 [VS Code](https://code.visualstudio.com/)。建议安装的扩展：

- **必需**：Volar（用于 Vue 3 + TypeScript）
- **推荐**：ESLint（代码质量检查）
- **推荐**：Tailwind CSS IntelliSense（Tailwind 辅助提示）

注意：不要使用仅支持 Vue 2 的旧插件（如 vetur），官方推荐在 Vue 3 项目中使用 Volar。

## 快速开始

先决条件：Node.js >= 16，推荐使用 npm、yarn 或 pnpm 管理依赖。

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

如需在局域网中访问开发服务：

```bash
npm run dev -- --host
```

构建生产包：

```bash
npm run build
```

代码检查与格式化：

项目集成了 ESLint、Prettier 与 Husky，Git 提交时会触发检查与自动修复。也可以手动运行：

```bash
npm run lint
```

## 项目规划（待办）

- Themes：集成更多主题与主题市场能力。
- Dark Theme：支持暗黑模式一键切换。
- Config：增强页面配色、布局等运行时配置能力。
- Templates：提供更多页面模版（表格、表单、列表、可视化等）。

欢迎根据项目需求进行扩展与定制化开发。