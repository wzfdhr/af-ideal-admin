# AF-workflows

AF-workflows 是vue3解决可视化工作流的项目，使用了如下的技术构建：

- [Vue 3](https://cn.vuejs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite 4](https://cn.vitejs.dev/)
- [TailwindCSS 3](https://tailwindcss.com/)
- [Sass](https://sass-lang.com/)
- [Pinia](https://pinia.web3doc.top/)
- [Arco Design](https://github.com/arco-design/arco-design-vue)

## 推荐开发环境

推荐使用 [VS Code](https://code.visualstudio.com/) 作为编辑器/IED。在 VSCode 中安装以下扩展：

- **必需**：[Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
- **推荐**：[eslint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- **推荐**：[Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)

> **注意：** 不要使用 vuter 插件，该扩展专为 Vue 2 开发，现已不再维护。官方推荐使用 Volar 代替。

## 命令说明

安装项目依赖（仅当首次下载项目和当`package.json`文件更新时,注意需要node版本在16以上）：

```sh
npm install
```

运行服务：

```sh
npm run dev --开发环境
npm run test --生产环境

# 如需运行服务并暴露到局域网，则使用`--host`参数：
npm run dev -- --host
```

检查和自动修正代码：

> 说明：项目集成了[ESLint](https://eslint.org/)、[Prettier](https://prettier.io/)和[Husky](https://typicode.github.io/husky/#/)。使用 Git 上传代码时，将会自动检查和修正需要上传的代码；如果出现无法自动修正的问题则会报告错误或警告。因此此命令一般无需手动执行。

```sh
npm run lint
```

编译打包：

```sh
npm run build
```

## ✨ 后期规划

- **Themes** - 基于「[风格配置平台](https://arco.design/themes)」丰富的主题市场，让你的项目千变万化。
- **Dark Theme**  -  一键丝滑切换暗黑风格。
- **Config** - 灵活配置页面配色、布局等。
- **Templates** - 16+ 页面模版，覆盖表格、列表、表单、工作台、可视化等场景。