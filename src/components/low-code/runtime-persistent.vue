<template>
  <main class="persistent-runtime" data-testid="persistent-low-code-runtime">
    <h1>{{ context?.schema.title || '低代码业务页' }}</h1>
    <p v-if="context">
      {{
        context.preview
          ? '正在预览未发布配置，业务操作会保存到当前环境。'
          : `已发布页面 v${context.releaseVersion}`
      }}
    </p>
    <p v-if="loading" role="status">正在读取运行配置…</p>
    <p v-if="error" role="alert" data-testid="low-code-runtime-error">
      {{ error }}
    </p>
    <p v-if="message" role="status">{{ message }}</p>
    <template v-if="context">
      <section class="runtime-query" aria-label="查询条件">
        <label>
          关键词
          <input
            v-model="query.keyword"
            aria-label="低代码关键词"
            maxlength="100"
          />
        </label>
        <label>
          业务状态
          <select v-model="query.status" aria-label="低代码业务状态">
            <option value="">全部状态</option>
            <option
              v-for="(label, key) in statusLabels"
              :key="key"
              :value="key"
            >
              {{ label }}
            </option>
          </select>
        </label>
      </section>
      <nav class="runtime-actions" aria-label="页面操作">
        <a-button
          v-for="action in toolbar"
          :key="action.id"
          :data-testid="`persistent-action-${action.id}`"
          :disabled="busy"
          @click="run(action)"
        >
          {{ action.label }}
        </a-button>
        <a-button :disabled="busy" @click="load()">重新读取页面版本</a-button>
      </nav>
      <div class="material-grid">
        <section
          v-for="material in inlineMaterials"
          :key="material.id"
          :style="{ gridColumn: `span ${material.span}` }"
          class="material-card"
          :data-material-id="material.id"
        >
          <h2>{{ material.name }}</h2>
          <p v-if="staleMaterials.has(material.id)" role="status">
            业务数据已变化，此区块待刷新。
          </p>
          <p v-if="materialErrors[material.id]" role="alert">
            {{ materialErrors[material.id] }}
          </p>
          <p
            v-if="
              material.type !== 'ProForm' && !context.dataAvailable[material.id]
            "
            role="alert"
          >
            {{ context.sourceErrors[material.id] || '该来源缺少当前读取权限' }}
          </p>
          <ProTable
            v-else-if="material.type === 'ProTable'"
            :ref="(instance) => setTable(material.id, instance)"
            :columns="columns(material)"
            :fetch-data="(params) => fetchRows(material, params)"
            row-key="id"
            empty-text="授权范围内暂无业务记录"
          />
          <template v-else-if="material.type === 'StatCard'">
            <strong v-if="datasets[material.id]" class="stat-value">
              {{ datasets[material.id].total }}
            </strong>
            <p v-else>尚未查询真实数据。</p>
            <small v-if="datasets[material.id]">
              当前查询范围内记录数，{{
                time(datasets[material.id].refreshedAt)
              }}
              刷新
            </small>
          </template>
          <template v-else-if="material.type === 'ChartCard'">
            <VueECharts
              v-if="datasets[material.id] && datasets[material.id].total"
              :option="chartOption(material)"
              autoresize
              class="runtime-chart"
            />
            <p v-else-if="datasets[material.id]">
              当前查询范围内没有统计数据。
            </p>
            <p v-else>尚未查询真实数据。</p>
            <small v-if="datasets[material.id]">
              按授权记录的状态或北京时间创建日统计。
            </small>
          </template>
          <template v-else>
            <FormRenderer
              v-if="forms[material.id]"
              v-model="formValues[material.id]"
              :ast="forms[material.id]"
            />
            <p v-else role="alert">
              {{ context.sourceErrors[material.id] || '表单来源暂时不可用' }}
            </p>
            <a-button
              v-for="action in formActions(material.id)"
              :key="action.id"
              :disabled="busy || !canOperateForm(action)"
              @click="run(action)"
            >
              {{ action.label }}
            </a-button>
          </template>
        </section>
      </div>
    </template>
    <a-modal
      :visible="Boolean(modalTarget)"
      :title="modalMaterial?.name || '业务表单'"
      :footer="false"
      :mask-closable="false"
      unmount-on-close
      @cancel="closeModal"
    >
      <section v-if="modalTarget" data-testid="persistent-business-modal">
        <p v-if="modalError" role="alert">{{ modalError }}</p>
        <ul v-if="Object.keys(validation).length" role="alert">
          <li v-for="(messages, key) in validation" :key="key">
            {{ fieldLabel(String(key)) }}：{{ messages.join('；') }}
          </li>
        </ul>
        <FormRenderer
          v-if="forms[modalTarget]"
          v-model="formValues[modalTarget]"
          :ast="forms[modalTarget]"
        />
        <p v-else role="alert">
          {{ context?.sourceErrors[modalTarget] || '表单来源暂时不可用' }}
        </p>
        <p v-if="currentRecords[modalTarget]">
          已保存记录 ·
          {{
            statusLabels[currentRecords[modalTarget].status] ||
            currentRecords[modalTarget].status
          }}
          <span v-if="dirty(modalTarget)">· 有未保存输入</span>
        </p>
        <div class="runtime-actions">
          <a-button
            v-for="action in formActions(modalTarget)"
            :key="action.id"
            :data-testid="`persistent-action-${action.id}`"
            :disabled="busy || !canOperateForm(action)"
            @click="run(action)"
          >
            {{ action.label }}
          </a-button>
          <a-button :disabled="busy" @click="closeModal">关闭表单</a-button>
        </div>
        <StoredFiles
          v-if="currentRecords[modalTarget]"
          :record-id="currentRecords[modalTarget].id"
          :editable="currentRecords[modalTarget].status === 'draft'"
        />
      </section>
    </a-modal>
  </main>
</template>
<script setup lang="ts">
import { ref, reactive, computed, h, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, LineChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import VueECharts from 'vue-echarts'
import { useUserStore } from '@/store'
import { adminUi } from '@/components/pro-ui'
import ProTable from '@/components/pro-table/index.vue'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import { FormRenderer, migrateFormSchema } from '@/components/form-runtime'
import type { VersionedFormSchema } from '@/components/form-designer/schema'
import StoredFiles from '@/components/stored-files.vue'
import {
  getRuntimePage,
  runLowCodeAction,
  queryLowCodeMaterial,
} from '@/api/low-code-runtime'
import type {
  LowCodeRuntimeDefinition,
  LowCodeDataResult,
} from '@/api/low-code-runtime'
import { createCommandRetry } from '@/services/command-retry'
import { confirmR1Action } from '@/services/r1-confirm'
import {
  errorMessage,
  statusLabels,
  fieldErrors,
  stableSignature,
} from '@/views/leave/shared'
import type {
  LowCodePageV2,
  LowCodeMaterialV2,
  LowCodeActionV2,
  FormSchema,
} from '@af-admin/contracts'
import type { TableColumnData } from '@arco-design/web-vue'

use([CanvasRenderer, PieChart, LineChart, TooltipComponent, GridComponent])

const props = defineProps<{
  pageId: string
  definition?: LowCodeRuntimeDefinition
  previewSchema?: LowCodePageV2
}>()
const router = useRouter()
const user = useUserStore()
const context = ref<LowCodeRuntimeDefinition>()
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const message = ref('')
const modalTarget = ref('')
const modalError = ref('')
const validation = ref<Record<string, string[]>>({})
const query = reactive({ keyword: '', status: '' })
const datasets = reactive<Record<string, LowCodeDataResult>>({})
const staleMaterials = reactive(new Set<string>())
const materialErrors = reactive<Record<string, string>>({})
const forms = reactive<Record<string, VersionedFormSchema>>({})
const formValues = reactive<Record<string, Record<string, unknown>>>({})
const savedSignatures = reactive<Record<string, string>>({})
interface RuntimeRecord {
  id: string
  revision: number
  status: string
}
const currentRecords = reactive<Record<string, RuntimeRecord>>({})
const tables = new Map<string, ProTableExpose>()
const pendingData = new Map<string, LowCodeDataResult>()
const pagination = new Map<string, { current: number; pageSize: number }>()
const retry = createCommandRetry()
let ticket = 0
const toolbar = computed(
  () =>
    context.value?.schema.actions.filter(
      (action) => action.placement === 'toolbar'
    ) || []
)
const inlineMaterials = computed(
  () =>
    context.value?.schema.materials.filter(
      (material) => material.display === 'inline'
    ) || []
)
const modalMaterial = computed(() =>
  context.value?.schema.materials.find(
    (material) => material.id === modalTarget.value
  )
)
const formActions = (target: string) =>
  context.value?.schema.actions.filter(
    (action) => action.placement === 'form' && action.targetId === target
  ) || []
const dirty = (target: string) =>
  stableSignature(formValues[target] || {}) !==
  (savedSignatures[target] || stableSignature({}))
const fieldLabel = (field: string) =>
  (modalMaterial.value &&
    context.value?.forms[modalMaterial.value.id]?.widgetsConfig.find(
      (widget) => widget.uid === field
    )?.config.label) ||
  field
const time = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
const setTable = (id: string, instance: unknown) => {
  if (instance) tables.set(id, instance as ProTableExpose)
  else tables.delete(id)
}
const display = (value: unknown) => {
  if (value === null || value === undefined) return '未填写'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
const renderCell = (key: string, record: Record<string, unknown>) => {
  if (key === 'status')
    return statusLabels[String(record[key])] || display(record[key])
  return display(record[key])
}
const columns = (material: LowCodeMaterialV2) => {
  const sourceColumns = datasets[material.id]?.columns || []
  let visible = sourceColumns.filter(
    (column) => column.key !== 'id' && column.key !== 'revision'
  )
  if (material.columns)
    visible = sourceColumns.filter((column) =>
      material.columns?.includes(column.key)
    )
  const result: TableColumnData[] = visible.map((column) => ({
    title: column.title,
    dataIndex: column.key,
    render: ({ record }: { record: Record<string, unknown> }) =>
      renderCell(column.key, record),
  }))
  const actions =
    context.value?.schema.actions.filter(
      (action) => action.placement === 'row' && action.originId === material.id
    ) || []
  if (actions.length)
    result.push({
      title: '操作',
      dataIndex: '__actions',
      render: ({ record }: { record: Record<string, unknown> }) =>
        h(
          'div',
          { class: 'runtime-actions' },
          actions.map((action) =>
            h(
              adminUi.Button,
              {
                disabled:
                  busy.value ||
                  (action.mode === 'edit' && record.status !== 'draft'),
                onClick: () => run(action, record),
              },
              () => action.label
            )
          )
        ),
    })
  return result
}
const params = (materialId: string, first = false) => ({
  current: first ? 1 : pagination.get(materialId)?.current || 1,
  pageSize: pagination.get(materialId)?.pageSize || 20,
  keyword: query.keyword,
  status: query.status,
})
const fetchRows = async (
  material: LowCodeMaterialV2,
  page: ProTableFetchParams
) => {
  pagination.set(material.id, {
    current: page.current,
    pageSize: page.pageSize,
  })
  const current = ticket
  try {
    const result =
      pendingData.get(material.id) ||
      (await queryLowCodeMaterial(
        props.pageId,
        material.id,
        {
          releaseId: context.value?.releaseId,
          params: {
            ...params(material.id),
            current: page.current,
            pageSize: page.pageSize,
          },
        },
        props.previewSchema
      ))
    pendingData.delete(material.id)
    if (current !== ticket) return { list: [], total: 0 }
    datasets[material.id] = result
    staleMaterials.delete(material.id)
    materialErrors[material.id] = ''
    return { list: result.list, total: result.total }
  } catch (failure) {
    if (current === ticket) materialErrors[material.id] = errorMessage(failure)
    throw failure
  }
}
const refreshCards = async () => {
  const current = ticket
  await Promise.all(
    (context.value?.schema.materials || [])
      .filter(
        (material) =>
          ['StatCard', 'ChartCard'].includes(material.type) &&
          context.value?.dataAvailable[material.id]
      )
      .map(async (material) => {
        try {
          const result = await queryLowCodeMaterial(
            props.pageId,
            material.id,
            {
              releaseId: context.value?.releaseId,
              params: params(material.id, true),
            },
            props.previewSchema
          )
          if (current === ticket) {
            datasets[material.id] = result
            staleMaterials.delete(material.id)
            materialErrors[material.id] = ''
          }
        } catch (failure) {
          if (current === ticket)
            materialErrors[material.id] = errorMessage(failure)
        }
      })
  )
}
const initializeForm = (
  id: string,
  schema: FormSchema,
  values?: Record<string, unknown>
) => {
  forms[id] = migrateFormSchema(schema)
  formValues[id] =
    values ||
    Object.fromEntries(
      schema.widgetsConfig
        .filter((widget) => widget.config.defaultValue !== undefined)
        .map((widget) => [widget.uid, widget.config.defaultValue])
    )
  savedSignatures[id] = stableSignature(formValues[id])
}
const load = async (discard = false) => {
  if (
    !discard &&
    modalTarget.value &&
    dirty(modalTarget.value) &&
    !(await confirmR1Action('重新读取页面会丢弃未保存输入，确认继续？'))
  )
    return
  const current = ++ticket
  loading.value = true
  error.value = ''
  context.value = undefined
  modalTarget.value = ''
  retry.clear()
  Object.keys(datasets).forEach((key) => delete datasets[key])
  Object.keys(forms).forEach((key) => delete forms[key])
  Object.keys(formValues).forEach((key) => delete formValues[key])
  Object.keys(currentRecords).forEach((key) => delete currentRecords[key])
  pendingData.clear()
  staleMaterials.clear()
  try {
    const result = props.definition || (await getRuntimePage(props.pageId))
    if (current !== ticket) return
    context.value = result
    Object.entries(result.forms).forEach(([id, schema]) =>
      initializeForm(id, schema)
    )
    await refreshCards()
  } catch (failure) {
    if (current === ticket) error.value = errorMessage(failure)
  } finally {
    if (current === ticket) loading.value = false
  }
}
const chartOption = (material: LowCodeMaterialV2) => {
  const data = datasets[material.id]
  if (material.metric === 'created-day')
    return {
      animation: false,
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: data?.trend.map((item) => item.day) || [],
      },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        { type: 'line', data: data?.trend.map((item) => item.value) || [] },
      ],
    }
  return {
    animation: false,
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['35%', '65%'],
        data:
          data?.distribution.map((item) => ({
            name: statusLabels[item.name] || item.name,
            value: item.value,
          })) || [],
      },
    ],
  }
}
const canOperateForm = (action: LowCodeActionV2) => {
  const record = currentRecords[action.targetId]
  if (action.operation === 'create') return !record
  if (!record || record.status !== 'draft') return false
  return action.operation !== 'start' || !dirty(action.targetId)
}
async function run(action: LowCodeActionV2, row?: Record<string, unknown>) {
  if (!context.value || busy.value) return
  const current = ticket
  error.value = ''
  modalError.value = ''
  validation.value = {}
  message.value = ''
  const selected = currentRecords[action.targetId]
  const input: {
    releaseId: string
    params: ReturnType<typeof params>
    recordId?: string
    expectedRevision?: number
    fields?: Record<string, unknown>
  } = {
    releaseId: context.value.releaseId,
    params: params(action.targetId, action.type === 'query'),
  }
  if (row) {
    input.recordId = String(row.id)
    input.expectedRevision = Number(row.revision)
  }
  if (action.type === 'submit') {
    if (
      !(await confirmR1Action(
        action.operation === 'start'
          ? '确认按已保存内容提交审批？'
          : '确认保存此业务表单？'
      ))
    )
      return
    if (selected) {
      input.recordId = selected.id
      input.expectedRevision = selected.revision
    }
    if (action.operation !== 'start')
      input.fields = formValues[action.targetId] || {}
  }
  busy.value = true
  try {
    const result = await runLowCodeAction(
      props.pageId,
      action.id,
      input,
      retry.key(action.id, input),
      props.previewSchema
    )
    if (current !== ticket) return
    retry.complete(action.id)
    if (result.kind === 'data' && result.data) {
      datasets[result.targetId] = result.data
      staleMaterials.delete(result.targetId)
      pendingData.set(result.targetId, result.data)
      if (tables.has(result.targetId))
        await tables.get(result.targetId)?.reset()
    }
    if (result.kind === 'navigate' && result.to) await router.push(result.to)
    if (result.kind === 'modal' && result.formSnapshot) {
      modalTarget.value = result.targetId
      initializeForm(
        result.targetId,
        result.formSnapshot,
        result.record?.fields
      )
      if (result.record) currentRecords[result.targetId] = result.record
      else delete currentRecords[result.targetId]
    }
    if (result.kind === 'submit' && result.record) {
      context.value.schema.materials
        .filter((material) => material.type !== 'ProForm')
        .forEach((material) => staleMaterials.add(material.id))
      currentRecords[result.targetId] = result.record
      savedSignatures[result.targetId] = stableSignature(
        formValues[result.targetId] || {}
      )
      message.value =
        action.operation === 'start' ? '已提交真实审批' : '业务草稿已保存'
      if (action.operation === 'start') modalTarget.value = ''
    }
  } catch (failure) {
    if (current === ticket) {
      if (action.placement === 'form') {
        modalError.value = errorMessage(failure)
        validation.value = fieldErrors(failure)
      } else error.value = errorMessage(failure)
    }
  } finally {
    if (current === ticket) busy.value = false
  }
}
const closeModal = async () => {
  if (busy.value) return
  if (
    modalTarget.value &&
    dirty(modalTarget.value) &&
    !(await confirmR1Action('表单有未保存输入，确认关闭？'))
  )
    return
  modalTarget.value = ''
  modalError.value = ''
  validation.value = {}
}
watch(
  () => [props.pageId, props.definition, user.id, user.tenantId],
  () => {
    ticket += 1
    busy.value = false
    load(true)
  }
)
onBeforeRouteLeave(
  async () =>
    !modalTarget.value ||
    !dirty(modalTarget.value) ||
    confirmR1Action('表单有未保存输入，确认离开？')
)
onMounted(() => load())
onUnmounted(() => {
  ticket += 1
  retry.clear()
})
</script>
<style scoped>
.persistent-runtime {
  padding: 24px;
  max-width: 1440px;
  margin: auto;
}
.runtime-query,
.runtime-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin: 16px 0;
}
label {
  display: grid;
  gap: 6px;
}
input,
select {
  padding: 8px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
  background: var(--color-bg-2);
  color: var(--color-text-1);
}
.material-grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 16px;
}
.material-card {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-2);
}
.runtime-chart {
  height: 280px;
}
.stat-value {
  font-size: 36px;
}
[role='alert'] {
  color: var(--color-danger-6);
}
@media (max-width: 900px) {
  .material-card {
    grid-column: span 24 !important;
  }
}
</style>
