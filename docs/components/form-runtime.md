# Form Runtime Renderer

`form-runtime` 是业务页面使用表单设计器产物的生产入口。业务页面不得直接引入 `form-designer/index.vue`、设计器配置面板或拖拽编辑能力。

## 使用方式

```ts
import FormRenderer, { FormRenderer as NamedFormRenderer } from '@/components/form-runtime'
import { migrateFormSchema } from '@/components/form-designer/schema'
```

```vue
<template>
  <form-renderer ref="rendererRef" :ast="schema" @submit="handleSubmit" />
</template>
```

## 运行时 API

组件暴露以下方法：

- `getValues()`：返回当前表单值。
- `validate()`：触发表单校验，返回 `true` 或 `false`。
- `submit()`：先校验，校验通过后触发 `submit` 事件并返回 `true`。

## Schema 要求

进入运行时前必须先调用 `migrateFormSchema`：

```ts
const schema = migrateFormSchema(rawSchema)
```

运行时只消费 schema、渲染 widget、执行校验和提交，不承担拖拽、属性编辑、数据源编辑或设计器状态管理。
