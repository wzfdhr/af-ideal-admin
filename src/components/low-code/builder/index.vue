<template>
  <div class="low-code-builder" data-testid="low-code-builder">
    <a-layout class="low-code-layout">
      <a-layout-sider :width="256" class="low-code-panel">
        <a-scrollbar class="low-code-scroll">
          <div class="panel-section">
            <div class="panel-title">页面</div>
            <button
              v-for="page in pageList"
              :key="page.id"
              class="page-item"
              :class="{ active: page.id === currentPage?.id }"
              type="button"
              @click="selectPage(page)"
            >
              <span>{{ page.name }}</span>
              <small>
                {{ getStatusText(page.status) }} v{{ page.version }}
              </small>
            </button>
          </div>
          <a-divider />
          <div class="panel-section">
            <div class="panel-title">物料</div>
            <div class="material-palette">
              <a-button
                v-for="material in materialRegistry"
                :key="material.type"
                :data-testid="`low-code-material-${material.type}`"
                long
                @click="addMaterial(material.type)"
              >
                {{ material.label }}
              </a-button>
            </div>
          </div>
        </a-scrollbar>
      </a-layout-sider>

      <a-layout-content class="low-code-main">
        <div class="low-code-main-header">
          <div>
            <h2>{{ currentPage?.name || schema.title }}</h2>
            <p>
              {{ schema.materials.length }} 个区块 /
              {{ schema.dataSources.length }} 个数据源
            </p>
          </div>
          <div class="page-meta">
            <span>
              {{ currentPage ? getStatusText(currentPage.status) : '草稿' }}
            </span>
            <code>{{ schema.permissionCode }}</code>
          </div>
        </div>

        <div class="action-bar">
          <a-space>
            <a-button
              data-testid="low-code-save"
              :loading="saving"
              @click="saveCurrent"
            >
              保存
            </a-button>
            <a-button
              type="primary"
              data-testid="low-code-publish"
              :loading="publishing"
              @click="publishCurrent"
            >
              发布
            </a-button>
            <a-button
              data-testid="low-code-rollback"
              :loading="rollingBack"
              @click="rollbackCurrent"
            >
              回滚
            </a-button>
            <a-button
              :loading="previewLoading"
              @click="previewCurrentDataSource"
            >
              预览数据
            </a-button>
          </a-space>
          <span v-if="actionMessage" class="action-message">
            {{ actionMessage }}
          </span>
          <span v-if="actionError" class="action-error">
            {{ actionError }}
          </span>
        </div>

        <div class="low-code-canvas" data-testid="low-code-canvas">
          <section
            v-for="material in schema.materials"
            :key="material.id"
            class="canvas-block"
            :class="{ active: material.id === selectedMaterialId }"
            @click="selectMaterial(material.id)"
          >
            <header class="block-header">
              <div>
                <strong>{{ material.name }}</strong>
                <span>{{ material.type }}</span>
              </div>
              <code v-if="material.permissionCode">
                {{ material.permissionCode }}
              </code>
            </header>

            <ProForm
              v-if="material.type === 'ProForm'"
              :schema="queryFormFields"
              readonly
              hide-actions
            />
            <ProTable
              v-else-if="material.type === 'ProTable'"
              row-key="id"
              :columns="getTableColumns(material)"
              :fetch-data="fetchPreviewTableData"
            />
            <div v-else-if="material.type === 'StatCard'" class="stat-card">
              <span>{{ material.props.label || material.name }}</span>
              <strong>{{ material.props.value || previewData.total }}</strong>
            </div>
            <div v-else class="chart-card">
              <span>{{ material.props.chartType || 'chart' }}</span>
              <strong>{{ previewData.total }} 条 Mock 数据</strong>
            </div>

            <div
              v-if="getMaterialActions(material).length"
              class="block-actions"
            >
              <a-button
                v-for="action in getMaterialActions(material)"
                :key="action.id"
                size="small"
                :data-testid="`low-code-action-${action.type}`"
                :data-permission-code="action.permissionCode"
                @click.stop="runAction(action)"
              >
                {{ action.label }}
              </a-button>
            </div>
          </section>
        </div>

        <div class="data-preview" data-testid="low-code-data-preview">
          <div class="preview-title">数据预览</div>
          <div v-if="previewError" class="preview-error">
            {{ previewError }}
          </div>
          <table v-else>
            <thead>
              <tr>
                <th v-for="column in previewData.columns" :key="column">
                  {{ column }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in previewData.list" :key="String(item.id)">
                <td v-for="column in previewData.columns" :key="column">
                  {{ item[column] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </a-layout-content>

      <a-layout-sider :width="304" class="low-code-panel right-panel">
        <div class="panel-section" data-testid="low-code-property-panel">
          <div class="panel-title">属性</div>
          <template v-if="selectedMaterial">
            <div class="property-row">
              <span>区块</span>
              <strong>{{ selectedMaterial.name }}</strong>
            </div>
            <div class="property-row">
              <span>类型</span>
              <strong>{{ selectedMaterial.type }}</strong>
            </div>
            <label class="field-label" for="low-code-material-name">
              区块名称
            </label>
            <a-input
              id="low-code-material-name"
              v-model="selectedMaterialName"
            />
            <label class="field-label" for="low-code-material-permission">
              权限码
            </label>
            <a-input
              id="low-code-material-permission"
              v-model="selectedMaterialPermission"
            />
          </template>
          <div v-else class="empty-state">请选择区块</div>
        </div>
        <a-divider />
        <div class="panel-section">
          <div class="panel-title">页面权限</div>
          <code>{{ schema.permissionCode }}</code>
        </div>
      </a-layout-sider>
    </a-layout>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ProForm from '@/components/pro-form/index.vue'
import ProTable from '@/components/pro-table/index.vue'
import { LOW_CODE_MATERIALS } from '@/components/low-code/materials'
import {
  createLowCodePage,
  fetchLowCodePages,
  previewLowCodeDataSource,
  publishLowCodePage,
  rollbackLowCodePage,
  saveLowCodePage,
  type LowCodeDataSourcePreviewResult,
  type LowCodePageRecord,
} from '@/api/low-code'
import {
  createQueryTablePageSchema,
  validateLowCodePageSchema,
  type LowCodeAction,
  type LowCodeMaterial,
  type LowCodeMaterialType,
  type LowCodePageSchema,
} from '@/components/low-code/schema'
import type { ProFormField } from '@/components/pro-form/types'
import type {
  ProTableFetchParams,
  ProTableFetchResult,
} from '@/components/pro-table/types'

const materialRegistry = LOW_CODE_MATERIALS
const emptyPreview: LowCodeDataSourcePreviewResult = {
  columns: [],
  list: [],
  total: 0,
}

const pageList = ref<LowCodePageRecord[]>([])
const currentPage = ref<LowCodePageRecord | null>(null)
const schema = ref<LowCodePageSchema>(createQueryTablePageSchema())
const selectedMaterialId = ref('')
const previewData = ref<LowCodeDataSourcePreviewResult>(emptyPreview)
const previewError = ref('')
const actionMessage = ref('')
const actionError = ref('')
const saving = ref(false)
const publishing = ref(false)
const rollingBack = ref(false)
const previewLoading = ref(false)

const queryFormFields: ProFormField[] = [
  {
    field: 'keyword',
    label: '关键词',
    type: 'input',
    placeholder: '客户名称 / 负责人',
  },
  {
    field: 'status',
    label: '状态',
    type: 'select',
    options: [
      { label: '全部', value: '' },
      { label: '启用', value: 'active' },
      { label: '停用', value: 'inactive' },
    ],
  },
]

const selectedMaterial = computed(() =>
  schema.value.materials.find(
    (material) => material.id === selectedMaterialId.value
  )
)

function updateSelectedMaterial(patch: Partial<LowCodeMaterial>) {
  schema.value = validateLowCodePageSchema({
    ...schema.value,
    materials: schema.value.materials.map((material) =>
      material.id === selectedMaterialId.value
        ? { ...material, ...patch }
        : material
    ),
  })
}

const selectedMaterialName = computed({
  get: () => selectedMaterial.value?.name || '',
  set: (value: string) => {
    updateSelectedMaterial({ name: value })
  },
})

const selectedMaterialPermission = computed({
  get: () => selectedMaterial.value?.permissionCode || '',
  set: (value: string) => {
    updateSelectedMaterial({ permissionCode: value })
  },
})

const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'draft': '草稿',
    'published': '已发布',
    'rolled-back': '已回滚',
  }
  return statusMap[status] || status
}

const selectMaterial = (id: string) => {
  selectedMaterialId.value = id
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const getMaterialActions = (material: LowCodeMaterial): LowCodeAction[] =>
  Array.isArray(material.props.actions)
    ? (material.props.actions as LowCodeAction[])
    : []

const getPreviewDataSourceKey = () => {
  const material = schema.value.materials.find(
    (item) =>
      (item.type === 'ProTable' || item.type === 'ChartCard') &&
      typeof item.props.dataSourceKey === 'string'
  )
  return typeof material?.props.dataSourceKey === 'string'
    ? material.props.dataSourceKey
    : ''
}

const getTableColumns = (material: LowCodeMaterial) => {
  const configuredColumns = Array.isArray(material.props.columns)
    ? material.props.columns
    : previewData.value.columns

  return configuredColumns.map((column) => ({
    title: String(column),
    dataIndex: String(column),
  }))
}

const fetchPreviewTableData = async (
  params: ProTableFetchParams
): Promise<ProTableFetchResult<Record<string, unknown>>> => {
  const startIndex = (params.current - 1) * params.pageSize
  const endIndex = startIndex + params.pageSize

  return {
    list: previewData.value.list.slice(startIndex, endIndex),
    total: previewData.value.total,
  }
}

const previewCurrentDataSource = async () => {
  const dataSourceKey = getPreviewDataSourceKey()
  if (!dataSourceKey) {
    previewData.value = emptyPreview
    return
  }

  previewLoading.value = true
  previewError.value = ''
  try {
    previewData.value = await previewLowCodeDataSource({
      pageId: currentPage.value?.id,
      dataSourceKey,
      params: {},
    })
  } catch (error) {
    previewData.value = emptyPreview
    previewError.value =
      error instanceof Error ? error.message : '低代码数据源预览失败'
  } finally {
    previewLoading.value = false
  }
}

const selectPage = async (page: LowCodePageRecord) => {
  actionError.value = ''

  try {
    const validatedSchema = validateLowCodePageSchema(page.schema)
    currentPage.value = page
    schema.value = validatedSchema
    selectedMaterialId.value = schema.value.materials[0]?.id || ''
    await previewCurrentDataSource()
  } catch (error) {
    previewData.value = emptyPreview
    actionError.value = getErrorMessage(error, '低代码页面加载失败')
  }
}

const loadPages = async () => {
  actionError.value = ''

  try {
    const result = await fetchLowCodePages({ current: 1, pageSize: 20 })
    pageList.value = result.list

    if (result.list.length) {
      await selectPage(result.list[0])
      return
    }

    const defaultSchema = createQueryTablePageSchema()
    const created = await createLowCodePage({
      name: defaultSchema.title,
      schema: defaultSchema,
    })
    currentPage.value = {
      id: created.id,
      name: created.name || defaultSchema.title,
      schema: created.schema || defaultSchema,
      status: created.status || 'draft',
      version: created.version || 1,
      createdAt: '',
      updatedAt: '',
    }
    pageList.value = [currentPage.value]
    schema.value = validateLowCodePageSchema(currentPage.value.schema)
    selectedMaterialId.value = schema.value.materials[0]?.id || ''
    await previewCurrentDataSource()
  } catch (error) {
    previewData.value = emptyPreview
    actionError.value = getErrorMessage(error, '低代码页面加载失败')
  }
}

const createMaterial = (type: LowCodeMaterialType): LowCodeMaterial => {
  const definition = materialRegistry.find((material) => material.type === type)
  const id = `${type}-${schema.value.materials.length + 1}`
  const common = {
    id,
    type,
    name: definition?.label || type,
    permissionCode: 'low-code:customer-query:block',
  }

  if (type === 'ProTable') {
    return {
      ...common,
      props: {
        dataSourceKey: getPreviewDataSourceKey() || 'customers',
        columns: ['name', 'status', 'owner'],
        rowKey: 'id',
      },
    }
  }

  if (type === 'ProForm') {
    return {
      ...common,
      props: {
        fields: ['keyword', 'status'],
        actions: [
          {
            id: `${id}-query`,
            label: '查询',
            type: 'query',
            target: 'customer-table',
            permissionCode: 'low-code:customer-query:query',
          },
        ],
      },
    }
  }

  if (type === 'StatCard') {
    return {
      ...common,
      props: {
        label: '指标卡片',
        value: previewData.value.total,
      },
    }
  }

  return {
    ...common,
    props: {
      chartType: 'bar',
      dataSourceKey: getPreviewDataSourceKey() || 'customers',
    },
  }
}

const addMaterial = (type: LowCodeMaterialType) => {
  const material = createMaterial(type)
  schema.value = validateLowCodePageSchema({
    ...schema.value,
    materials: [...schema.value.materials, material],
  })
  selectedMaterialId.value = material.id
}

const mergeCurrentPage = (patch: Partial<LowCodePageRecord>) => {
  if (!currentPage.value) return
  currentPage.value = {
    ...currentPage.value,
    ...patch,
  }
  pageList.value = pageList.value.map((page) =>
    page.id === currentPage.value?.id ? currentPage.value : page
  )
}

const saveCurrent = async () => {
  if (!currentPage.value) return
  saving.value = true
  actionMessage.value = ''
  actionError.value = ''
  try {
    const validatedSchema = validateLowCodePageSchema(schema.value)
    schema.value = validatedSchema
    const result = await saveLowCodePage(currentPage.value.id, validatedSchema)
    mergeCurrentPage({
      schema: result.schema || schema.value,
      status: result.status || currentPage.value.status,
      version: result.version || currentPage.value.version,
    })
    actionMessage.value = '已保存'
  } catch (error) {
    actionError.value = getErrorMessage(error, '保存失败')
  } finally {
    saving.value = false
  }
}

const publishCurrent = async () => {
  if (!currentPage.value) return
  publishing.value = true
  actionMessage.value = ''
  actionError.value = ''
  try {
    const validatedSchema = validateLowCodePageSchema(schema.value)
    schema.value = validatedSchema
    const result = await publishLowCodePage(
      currentPage.value.id,
      validatedSchema
    )
    mergeCurrentPage({
      schema: result.schema || schema.value,
      status: result.status || 'published',
      version: result.version || currentPage.value.version,
    })
    actionMessage.value = '已发布'
  } catch (error) {
    actionError.value = getErrorMessage(error, '发布失败')
  } finally {
    publishing.value = false
  }
}

const rollbackCurrent = async () => {
  if (!currentPage.value) return
  rollingBack.value = true
  actionMessage.value = ''
  actionError.value = ''
  try {
    const rollbackVersion =
      currentPage.value.version > 1 ? currentPage.value.version - 1 : 1
    const result = await rollbackLowCodePage(
      currentPage.value.id,
      rollbackVersion
    )
    mergeCurrentPage({
      schema: result.schema || schema.value,
      status: result.status || 'rolled-back',
      version: result.version || rollbackVersion,
    })
    actionMessage.value = '已回滚'
  } catch (error) {
    actionError.value = getErrorMessage(error, '回滚失败')
  } finally {
    rollingBack.value = false
  }
}

const runAction = async (action: LowCodeAction) => {
  if (action.type === 'query' || action.type === 'refreshBlock') {
    await previewCurrentDataSource()
    actionMessage.value = `${action.label}完成`
    return
  }
  actionMessage.value = `${action.label}：${
    action.permissionCode || '无权限码'
  }`
}

onMounted(() => {
  loadPages()
})
</script>

<style scoped>
.low-code-builder {
  width: 100%;
  min-height: calc(100vh - 96px);
}

.low-code-layout {
  min-height: calc(100vh - 96px);
  background: #f7f8fa;
}

.low-code-panel {
  overflow: hidden;
  background: #ffffff;
  border-right: 1px solid #e5e6eb;
}

.right-panel {
  border-right: 0;
  border-left: 1px solid #e5e6eb;
}

.low-code-scroll {
  height: calc(100vh - 96px);
}

.panel-section {
  padding: 16px;
}

.panel-title {
  margin-bottom: 12px;
  color: #1d2129;
  font-size: 14px;
  font-weight: 600;
}

.page-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  margin-bottom: 8px;
  padding: 8px 10px;
  color: #1d2129;
  text-align: left;
  background: #f7f8fa;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  cursor: pointer;
}

.page-item.active {
  color: #165dff;
  background: #e8f3ff;
  border-color: #165dff;
}

.page-item small {
  flex: none;
  color: #86909c;
}

.material-palette {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.low-code-main {
  min-width: 0;
  padding: 16px;
}

.low-code-main-header,
.action-bar,
.block-header,
.property-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.low-code-main-header h2 {
  margin: 0 0 4px;
  color: #1d2129;
  font-size: 18px;
  font-weight: 600;
}

.low-code-main-header p,
.page-meta,
.property-row,
.empty-state {
  color: #4e5969;
  font-size: 13px;
}

.page-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.action-bar {
  margin: 16px 0;
}

.action-message {
  color: #00b42a;
  font-size: 12px;
}

.action-error {
  color: #f53f3f;
  font-size: 12px;
}

.low-code-canvas {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.canvas-block {
  padding: 14px;
  background: #ffffff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  cursor: pointer;
}

.canvas-block.active {
  border-color: #165dff;
  box-shadow: 0 0 0 2px rgba(22, 93, 255, 0.08);
}

.block-header {
  margin-bottom: 12px;
}

.block-header strong {
  margin-right: 8px;
  color: #1d2129;
  font-weight: 600;
}

.block-header span {
  color: #86909c;
  font-size: 12px;
}

.block-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.stat-card,
.chart-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 72px;
  padding: 16px;
  background: #f7f8fa;
  border-radius: 6px;
}

.stat-card strong,
.chart-card strong {
  color: #1d2129;
  font-size: 22px;
  font-weight: 600;
}

.data-preview {
  margin-top: 12px;
  padding: 14px;
  overflow: auto;
  background: #ffffff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
}

.preview-title {
  margin-bottom: 10px;
  color: #1d2129;
  font-size: 14px;
  font-weight: 600;
}

.preview-error {
  color: #f53f3f;
}

.data-preview table {
  width: 100%;
  border-collapse: collapse;
  color: #4e5969;
  font-size: 13px;
}

.data-preview th,
.data-preview td {
  padding: 8px;
  border-bottom: 1px solid #f2f3f5;
}

.data-preview th {
  color: #1d2129;
  text-align: left;
  background: #f7f8fa;
}

.property-row {
  margin-bottom: 14px;
}

.field-label {
  display: block;
  margin: 14px 0 6px;
  color: #4e5969;
  font-size: 13px;
}
</style>
