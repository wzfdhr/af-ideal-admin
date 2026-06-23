<template>
  <main class="file-resource" data-testid="file-resource-center">
    <div class="file-resource__header">
      <div>
        <p class="file-resource__breadcrumb">资源中心 / 文件资源</p>
        <h1>文件资源</h1>
      </div>
      <div class="file-resource__summary">共 {{ total }} 个资源</div>
    </div>

    <section class="file-resource__filters" aria-label="文件资源筛选">
      <label class="file-resource__field">
        <span>关键词</span>
        <input
          v-model.trim="filters.keyword"
          data-testid="file-keyword"
          placeholder="文件名、负责人或租户"
        />
      </label>
      <label class="file-resource__field">
        <span>类型</span>
        <select v-model="filters.category" data-testid="file-category">
          <option value="">全部类型</option>
          <option
            v-for="option in categoryOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="file-resource__field">
        <span>权限</span>
        <select v-model="filters.permissionStatus">
          <option value="">全部权限</option>
          <option value="allowed">允许访问</option>
          <option value="denied">权限拒绝</option>
        </select>
      </label>
      <div class="file-resource__actions">
        <button
          class="file-resource__button file-resource__button--primary"
          data-testid="file-query"
          :disabled="loading"
          type="button"
          @click="queryResources"
        >
          查询
        </button>
        <button
          class="file-resource__button"
          :disabled="loading"
          type="button"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </section>

    <section class="file-resource__upload" aria-label="Mock 文件上传">
      <div class="file-resource__panel-title">
        <h2>Mock 上传</h2>
        <span>只提交文件元数据，不写入真实文件</span>
      </div>
      <label class="file-resource__field">
        <span>文件名</span>
        <input
          v-model.trim="uploadForm.fileName"
          data-testid="file-upload-name"
        />
      </label>
      <label class="file-resource__field">
        <span>大小 byte</span>
        <input
          v-model.number="uploadForm.size"
          data-testid="file-upload-size"
          type="number"
        />
      </label>
      <label class="file-resource__field">
        <span>MIME</span>
        <input
          v-model.trim="uploadForm.mimeType"
          data-testid="file-upload-mime"
        />
      </label>
      <button
        class="file-resource__button file-resource__button--primary"
        data-testid="file-upload"
        :disabled="loading"
        type="button"
        @click="uploadMockFile"
      >
        上传模拟
      </button>
      <p v-if="actionMessage" class="file-resource__message">
        {{ actionMessage }}
      </p>
    </section>

    <section class="file-resource__table-wrap" aria-label="文件资源列表">
      <table class="file-resource__table">
        <thead>
          <tr>
            <th>文件名</th>
            <th>类型</th>
            <th>大小</th>
            <th>负责人</th>
            <th>租户</th>
            <th>权限</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!loading && records.length === 0">
            <td class="file-resource__empty" colspan="8">暂无文件资源</td>
          </tr>
          <tr
            v-for="record in records"
            :key="record.id"
            :class="{ 'is-denied': record.permissionStatus === 'denied' }"
          >
            <td>
              <strong>{{ record.fileName }}</strong>
              <span>{{ record.mimeType }}</span>
            </td>
            <td>{{ getCategoryLabel(record.category) }}</td>
            <td>{{ formatSize(record.size) }}</td>
            <td>{{ record.owner }}</td>
            <td>{{ record.tenantId }}</td>
            <td>
              {{
                record.permissionStatus === 'allowed' ? '允许访问' : '权限拒绝'
              }}
            </td>
            <td>{{ record.updatedAt }}</td>
            <td>
              <button
                class="file-resource__link-button"
                :data-testid="`file-preview-${record.id}`"
                :disabled="loading"
                type="button"
                @click="previewResource(record.id)"
              >
                预览
              </button>
              <button
                class="file-resource__link-button"
                :data-testid="`file-download-${record.id}`"
                :disabled="loading"
                type="button"
                @click="downloadResource(record.id)"
              >
                下载
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  createFilePreviewTask,
  createFileResourceDownload,
  fetchFileResources,
  uploadFileResource,
  type FileAccessResult,
  type FilePermissionStatus,
  type FileResourceCategory,
  type FileResourceQuery,
  type FileResourceRecord,
} from '@/api/file-resource'

const categoryOptions: Array<{ label: string; value: FileResourceCategory }> = [
  { label: '图片', value: 'image' },
  { label: 'PDF', value: 'pdf' },
  { label: 'Excel', value: 'excel' },
  { label: 'Word', value: 'word' },
  { label: '压缩包', value: 'archive' },
  { label: '其他', value: 'other' },
]

const records = ref<FileResourceRecord[]>([])
const total = ref(0)
const loading = ref(false)
const current = ref(1)
const pageSize = ref(20)
const actionMessage = ref('')

const filters = reactive({
  keyword: '',
  category: '' as FileResourceCategory | '',
  permissionStatus: '' as FilePermissionStatus | '',
})

const uploadForm = reactive({
  fileName: '客户清单.xlsx',
  size: 1024,
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
})

const buildQuery = (): FileResourceQuery => ({
  current: current.value,
  pageSize: pageSize.value,
  keyword: filters.keyword,
  category: filters.category,
  permissionStatus: filters.permissionStatus,
})

const loadResources = async () => {
  loading.value = true

  try {
    const result = await fetchFileResources(buildQuery())
    records.value = result.list
    total.value = result.total
  } finally {
    loading.value = false
  }
}

const queryResources = async () => {
  current.value = 1
  await loadResources()
}

const resetFilters = async () => {
  filters.keyword = ''
  filters.category = ''
  filters.permissionStatus = ''
  await queryResources()
}

const handleAccessResult = (result: FileAccessResult, action: string) => {
  if (result.denied) {
    actionMessage.value = result.reason || `${action}失败`
    return
  }

  actionMessage.value = `${action}地址：${result.url}`
}

const uploadMockFile = async () => {
  const result = await uploadFileResource({
    fileName: uploadForm.fileName,
    size: Number(uploadForm.size),
    mimeType: uploadForm.mimeType,
    owner: '系统管理员',
    tenantId: 'tenant-a',
  })

  actionMessage.value = result.success
    ? `上传成功：${result.record?.fileName}`
    : result.reason || '上传失败'

  await loadResources()
}

const previewResource = async (id: string) => {
  handleAccessResult(await createFilePreviewTask(id), '预览')
}

const downloadResource = async (id: string) => {
  handleAccessResult(await createFileResourceDownload(id), '下载')
}

const getCategoryLabel = (category: FileResourceCategory) =>
  categoryOptions.find((item) => item.value === category)?.label || category

const formatSize = (size: number) => {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  return `${(size / 1024).toFixed(1)} KB`
}

onMounted(loadResources)
</script>

<style scoped lang="scss">
.file-resource {
  min-height: 100%;
  padding: 24px;
  color: #1d2129;
  background: #f5f7fb;
}

.file-resource__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h1 {
    margin: 4px 0 0;
    font-size: 24px;
  }
}

.file-resource__breadcrumb,
.file-resource__summary,
.file-resource__panel-title span {
  margin: 0;
  color: #667085;
  font-size: 13px;
}

.file-resource__filters,
.file-resource__upload {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 180px 180px auto;
  gap: 12px;
  align-items: end;
  padding: 16px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.file-resource__upload {
  grid-template-columns: 220px 160px minmax(260px, 1fr) auto minmax(200px, 1fr);
}

.file-resource__panel-title {
  h2 {
    margin: 0;
    font-size: 16px;
  }
}

.file-resource__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #475467;
  font-size: 13px;

  input,
  select {
    height: 34px;
    padding: 0 10px;
    color: #1d2129;
    background: #fff;
    border: 1px solid #d0d5dd;
    border-radius: 6px;
  }
}

.file-resource__actions {
  display: flex;
  gap: 8px;
}

.file-resource__button,
.file-resource__link-button {
  height: 34px;
  padding: 0 12px;
  color: #344054;
  background: #fff;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.file-resource__button--primary {
  color: #fff;
  background: #165dff;
  border-color: #165dff;
}

.file-resource__message {
  margin: 0;
  color: #175cd3;
}

.file-resource__table-wrap {
  overflow: auto;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.file-resource__table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;

  th,
  td {
    padding: 12px 14px;
    text-align: left;
    border-bottom: 1px solid #eaecf0;
    vertical-align: top;
  }

  th {
    color: #667085;
    font-weight: 600;
    background: #f9fafb;
  }

  td strong,
  td span {
    display: block;
  }

  tr.is-denied td {
    background: #fff7ed;
  }
}

.file-resource__empty {
  padding: 24px;
  color: #667085;
  text-align: center;
}

.file-resource__link-button {
  display: inline-flex;
  align-items: center;
  margin-right: 8px;
  color: #165dff;
}

@media (max-width: 980px) {
  .file-resource {
    padding: 16px;
  }

  .file-resource__header,
  .file-resource__filters,
  .file-resource__upload {
    grid-template-columns: 1fr;
  }

  .file-resource__header {
    display: grid;
  }
}
</style>
