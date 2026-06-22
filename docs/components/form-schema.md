# Form Schema

表单设计器 schema 是设计器、运行时渲染器、导入导出和后续发布回滚能力的稳定契约。所有进入运行时的 schema 都必须先经过 `migrateFormSchema`。

## 当前版本

当前版本号为 `1`，由 `CURRENT_FORM_SCHEMA_VERSION` 导出。

```ts
import { CURRENT_FORM_SCHEMA_VERSION } from '@/components/form-designer/schema'
```

## 标准结构

```ts
export interface VersionedFormSchema {
  version: number
  formConfig: {
    size: 'mini' | 'small' | 'medium' | 'large'
    layout: 'horizontal' | 'vertical'
    labelAlign: 'left' | 'right'
  }
  widgetsConfig: WidgetsConfig[]
  dataSources: DataSourceConfig[]
}
```

## 默认值

缺失字段会补齐为运行时安全的默认值：

```ts
{
  version: 1,
  formConfig: {
    size: 'medium',
    layout: 'vertical',
    labelAlign: 'right',
  },
  widgetsConfig: [],
  dataSources: [],
}
```

旧 schema 的根字段 `config` 会迁移为 `formConfig`，用于兼容早期计划和历史导出数据。

## 迁移入口

```ts
import { migrateFormSchema } from '@/components/form-designer/schema'

const schema = migrateFormSchema(rawSchema)
```

迁移会执行以下处理：

- 为缺少 `version` 的 legacy schema 补当前版本号。
- 合并 `formConfig` 默认值。
- 缺少 `widgetsConfig` 或 `dataSources` 时补空数组。
- 为 widget 补齐 `type`、`uid`、`name` 和 `config`。
- 为缺少 `config.label` 的 widget 使用 `name` 作为显示标签。
- 递归迁移 grid/tab 里的嵌套 widgets。

## 非法输入

以下输入会被视为非法 schema，并抛出 `非法表单 schema`：

- 根节点不是对象。
- `widgetsConfig` 存在但不是数组。
- `dataSources` 存在但不是数组。
- widget 条目不是对象。

导入、预览、发布和运行时渲染前必须捕获该错误，并向用户展示明确失败原因，不能污染当前表单状态。
