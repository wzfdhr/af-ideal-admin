# 文件资源中心

文件资源中心用于演示企业中后台的统一文件资源管理。当前 MVP 不处理真实二进制文件，只提交文件元数据并通过 Mock 模拟上传成功、失败、超限、格式错误、下载、预览和权限拒绝。

## 页面入口

- 路由：`/resource/files`
- 页面：`src/views/resource/files/index.vue`
- API：`src/api/file-resource.ts`
- Mock：`src/mock/modules/file-resource.ts`

页面支持：

- 查询文件资源列表。
- 按文件名、负责人、租户关键词筛选。
- 按文件类型和权限状态筛选。
- 模拟上传文件元数据。
- 生成下载访问地址。
- 生成预览访问地址。
- 展示权限拒绝资源。

## API 契约

文件资源列表：

```ts
GET /files/resources
```

上传模拟：

```ts
POST /files/resources/upload
```

请求体：

```ts
interface FileUploadPayload {
  fileName: string
  size: number
  mimeType: string
  owner: string
  tenantId: string
}
```

下载访问：

```ts
POST /files/resources/:id/download
```

预览访问：

```ts
POST /files/resources/:id/preview
```

## 权限码

权限码定义在 `src/constants/file-resource.ts`：

- `file:list`：查看文件资源中心。
- `file:upload`：上传文件。
- `file:download`：下载文件。
- `file:preview`：预览文件。

当前路由入口使用 `file:list` 控制。后续可把上传、下载和预览按钮分别接入 `PermissionButton`，并与真实后端资源 ACL 对齐。

## Mock 场景

Mock 数据覆盖：

- 上传成功：允许的图片、PDF、Excel、Word、zip 元数据。
- 超限：超过 20MB 返回失败。
- 格式错误：不在白名单中的 MIME 返回失败。
- 下载：返回临时下载地址。
- 预览：返回临时预览地址。
- 权限拒绝：受限资源返回权限拒绝原因。

## 后续增强

- 接入真实对象存储，例如 S3、OSS 或 MinIO。
- 支持分片上传、断点续传和上传进度。
- 支持病毒扫描、内容安全检测和敏感信息识别。
- 支持图片、PDF、Office 文档在线预览。
- 支持租户级空间配额、资源 ACL 和审计日志联动。
