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

## 导入和导出

设计器通过 schema 层的纯函数处理 JSON 导入导出：

```ts
import {
  applyImportedFormSchema,
  exportFormSchema,
  importFormSchema,
} from '@/components/form-designer/schema'
```

- `exportFormSchema(schema)`：导出格式化后的 JSON 字符串。
- `importFormSchema(source)`：解析 JSON 并执行 schema 迁移。
- `applyImportedFormSchema(astRef, source)`：先完成解析和迁移，成功后才替换当前 AST。

非法 JSON 会抛出 `表单 schema JSON 格式错误`，不会污染当前设计器状态。

## 发布和回滚

表单发布接口位于 `src/api/form-schema.ts`：

```ts
import {
  publishFormSchema,
  rollbackFormSchema,
  saveFormSchema,
} from '@/api/form-schema'
```

- `saveFormSchema(id, schema)`：保存草稿。
- `publishFormSchema(id, schema)`：发布前先执行 `migrateFormSchema` 校验。
- `rollbackFormSchema(id, version)`：预留回滚接口。

发布前 schema 校验失败时不会发起接口请求。
