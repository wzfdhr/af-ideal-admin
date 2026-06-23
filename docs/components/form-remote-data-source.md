# Form Remote Data Source

远程数据源只能通过 `form-runtime` 的 `loadRemoteOptions` 加载。运行时组件不得直接使用 schema 中的 URL 发起请求。

## 安全边界

运行时只允许请求当前 schema `dataSources` 中声明的数据源，并且 URL 必须是同源相对 API：

- `/api/...`
- `/mock/...`

以下地址即使写进 schema 也会被拦截：

- `https://example.com/options`
- `http://example.com/options`
- `//example.com/options`
- `javascript:...`

拦截错误信息为 `未授权的远程数据源`。组件会恢复为空选项并展示错误，不影响整个表单渲染。

## Schema 配置

```ts
{
  key: 'users',
  name: '用户列表',
  url: '/api/form-options/users',
  timeout: 2500,
  params: {
    tenantId: 'tenantId',
  },
  responseAdapter: {
    listPath: 'data.records',
    labelField: 'name',
    valueField: 'id',
  },
}
```

字段说明：

- `timeout`：请求超时时间，默认 `5000ms`。
- `params`：请求参数映射，左侧是请求参数名，右侧是当前表单字段名。
- `responseAdapter.listPath`：选项数组在响应里的路径，默认 `data`。
- `responseAdapter.labelField`：选项文案字段，默认 `label`。
- `responseAdapter.valueField`：选项值字段，默认 `value`。

## 响应要求

默认响应格式：

```json
{
  "data": [
    { "label": "启用", "value": "enabled" }
  ]
}
```

Mock 接口也支持标准 `responseWrap` 成功响应：

```json
{
  "code": 20000,
  "msg": "success",
  "data": [
    { "label": "张三", "value": "u-1" }
  ]
}
```

适配后的响应必须产生 `{ label, value }` 结构。格式不匹配会抛出 `远程选项响应格式错误`。

超时错误会统一转换为 `远程选项加载超时`。

Mock 场景见 [form-designer-mock.md](/Users/start/Desktop/af-ideal-admin/docs/components/form-designer-mock.md)。
