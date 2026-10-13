<template>
  <main class="persistent-designer" data-testid="persistent-low-code-designer">
    <h1>低代码页面配置</h1>
    <p>来源、页面和业务记录分别保存；发布后使用固定配置运行。</p>
    <p v-if="error" role="alert" data-testid="persistent-page-error">
      {{ error }}
    </p>
    <p v-if="message" role="status">{{ message }}</p>
    <section class="generation" aria-label="生成业务管理页">
      <label>
        页面名称
        <input v-model="newName" aria-label="生成页面名称" maxlength="100" />
      </label>
      <label>
        查找已发布业务应用
        <input
          v-model.trim="applicationKeyword"
          aria-label="查找生成页面业务应用"
          data-testid="persistent-application-keyword"
          maxlength="100"
          @keydown.enter.prevent="searchApplications"
        />
      </label>
      <a-button
        :disabled="applicationLoading"
        data-testid="persistent-application-search"
        @click="searchApplications"
      >
        查询应用
      </a-button>
      <label>
        每页数量
        <select
          v-model.number="applicationPageSize"
          aria-label="生成页面应用目录每页数量"
          @change="changeApplicationPageSize"
        >
          <option :value="20">20</option>
          <option :value="100">100</option>
        </select>
      </label>
      <label>
        已发布业务应用
        <select
          :value="applicationReleaseId"
          aria-label="生成页面业务发布版"
          @change="changeApplicationSelection"
        >
          <option value="">选择业务应用发布版</option>
          <option
            v-for="app in applications"
            :key="app.id"
            :value="app.activeReleaseId || ''"
          >
            {{ app.name }}
          </option>
        </select>
      </label>
      <p data-testid="persistent-application-directory-state">
        当前目录第 {{ applicationPage }} / {{ applicationPageCount }} 页，共
        {{ applicationTotal }} 条
      </p>
      <div class="directory-actions">
        <a-button
          :disabled="applicationLoading || applicationPage <= 1"
          data-testid="persistent-application-previous"
          @click="changeApplicationPage(-1)"
        >
          上一页
        </a-button>
        <a-button
          :disabled="
            applicationLoading ||
            applicationPage * applicationPageSize >= applicationTotal
          "
          data-testid="persistent-application-next"
          @click="changeApplicationPage(1)"
        >
          下一页
        </a-button>
      </div>
      <p
        v-if="selectedApplication"
        data-testid="persistent-application-selection"
      >
        当前已选：{{ selectedApplication.name }} ·
        {{ selectedApplication.code }}
      </p>
      <a-button
        :disabled="busy || !applicationReleaseId || !selectedApplication"
        data-testid="persistent-page-generate"
        @click="generate"
      >
        生成管理页
      </a-button>
    </section>
    <ProTable
      ref="table"
      :columns="pageColumns"
      :fetch-data="fetchPages"
      row-key="id"
      empty-text="当前权限范围内暂无页面"
    />
    <section
      v-if="current && draft"
      class="page-editor"
      data-testid="persistent-page-editor"
    >
      <h2>{{ current.name }} · 配置草稿</h2>
      <p>
        最后保存 {{ current.updatedAt }}
        <span v-if="dirty">· 有未保存配置</span>
      </p>
      <label>
        配置名称
        <input v-model="name" aria-label="低代码配置名称" maxlength="100" />
      </label>
      <label>
        页面标题
        <input
          v-model="draft.title"
          aria-label="低代码页面标题"
          maxlength="100"
        />
      </label>
      <div class="property-grid">
        <section>
          <h3>物料配置</h3>
          <label>
            选择物料
            <select v-model="selectedMaterialId" aria-label="低代码物料选择">
              <option
                v-for="material in draft.materials"
                :key="material.id"
                :value="material.id"
              >
                {{ material.name }}
              </option>
            </select>
          </label>
          <template v-if="selectedMaterial">
            <label>
              物料名称
              <input
                v-model="selectedMaterial.name"
                aria-label="低代码物料名称"
                maxlength="100"
              />
            </label>
            <label>
              布局宽度
              <select
                v-model.number="selectedMaterial.span"
                aria-label="低代码布局宽度"
              >
                <option :value="6">四分之一</option>
                <option :value="12">二分之一</option>
                <option :value="24">整行</option>
              </select>
            </label>
            <label>
              受控来源
              <select
                :value="selectedMaterial.sourceId"
                aria-label="低代码物料来源"
                @change="changeSource"
              >
                <option
                  v-if="
                    !sources.some(
                      (source) => source.id === selectedMaterial?.sourceId
                    )
                  "
                  :value="selectedMaterial.sourceId"
                >
                  当前固定来源
                </option>
                <option
                  v-for="source in sources"
                  :key="source.id"
                  :value="source.id"
                >
                  {{ source.name
                  }}{{ source.status === 'disabled' ? ' · 已停用' : '' }}
                </option>
              </select>
            </label>
            <label>
              额外显示权限
              <input
                :value="selectedMaterial.permissionCode || ''"
                aria-label="低代码物料权限"
                @input="changePermission($event)"
              />
            </label>
            <label v-if="selectedMaterial.type === 'ChartCard'">
              统计口径
              <select
                v-model="selectedMaterial.metric"
                aria-label="低代码图表口径"
              >
                <option value="status-distribution">授权业务状态分布</option>
                <option value="created-day">按北京时间创建日趋势</option>
              </select>
            </label>
          </template>
        </section>
        <section>
          <h3>动作配置</h3>
          <article
            v-for="action in draft.actions"
            :key="action.id"
            class="action-row"
            :data-config-action="action.id"
          >
            <label>
              {{ actionTypeLabels[action.type] }}按钮名称
              <input
                v-model="action.label"
                :aria-label="`动作名称-${action.id}`"
                maxlength="100"
              />
            </label>
            <label>
              目标物料
              <select
                v-model="action.targetId"
                :aria-label="`动作目标-${action.id}`"
              >
                <option
                  v-for="material in draft.materials"
                  :key="material.id"
                  :value="material.id"
                >
                  {{ material.name }}
                </option>
              </select>
            </label>
            <small v-if="action.operation">
              业务操作：{{ operationLabels[action.operation] }}
            </small>
          </article>
        </section>
      </div>
      <details>
        <summary>配置导入导出</summary>
        <p>只保存配置和来源引用，业务数据不进入此配置。</p>
        <textarea v-model="jsonText" aria-label="低代码配置JSON" rows="8" />
        <a-button :disabled="busy" @click="importJson">校验并载入配置</a-button>
        <a-button @click="exportJson">查看当前配置JSON</a-button>
      </details>
      <div class="editor-actions">
        <a-button
          :disabled="busy"
          data-testid="persistent-page-save"
          @click="save"
        >
          保存配置
        </a-button>
        <a-button
          :disabled="busy"
          data-testid="persistent-page-preview"
          @click="preview"
        >
          预览当前配置
        </a-button>
        <a-button
          type="primary"
          :disabled="busy || dirty"
          data-testid="persistent-page-publish"
          @click="publish"
        >
          发布页面
        </a-button>
        <a-button
          v-if="current.activeReleaseId"
          :disabled="busy"
          @click="openRuntime(current)"
        >
          运行已发布页
        </a-button>
      </div>
      <section v-if="current.releases?.length" aria-label="版本与灰度">
        <h3>运行版本与灰度</h3>
        <label>
          主发布版
          <select v-model="baseReleaseId" aria-label="低代码主发布版">
            <option
              v-for="release in current.releases"
              :key="release.id"
              :value="release.id"
            >
              v{{ release.releaseVersion }} · {{ release.schema.title }}
            </option>
          </select>
        </label>
        <label>
          灰度发布版
          <select v-model="rolloutReleaseId" aria-label="低代码灰度发布版">
            <option value="">不使用灰度</option>
            <option
              v-for="release in current.releases.filter(
                (value) => value.id !== baseReleaseId
              )"
              :key="release.id"
              :value="release.id"
            >
              v{{ release.releaseVersion }} · {{ release.schema.title }}
            </option>
          </select>
        </label>
        <label>
          灰度比例
          <input
            v-model.number="percent"
            type="number"
            min="0"
            max="100"
            step="1"
            aria-label="低代码灰度比例"
          />
        </label>
        <a-button
          :disabled="busy || dirty"
          data-testid="persistent-page-rollout"
          @click="rollout"
        >
          应用运行版本
        </a-button>
      </section>
      <section v-if="previewDefinition" class="preview-section">
        <h2>当前配置预览</h2>
        <PersistentRuntime
          :key="previewKey"
          :page-id="current.id"
          :definition="previewDefinition"
          :preview-schema="previewSchema"
        />
      </section>
    </section>
  </main>
</template>
<script setup lang="ts">
import { ref, computed, h, onMounted, watch, onUnmounted } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { useUserStore } from '@/store'
import { adminUi } from '@/components/pro-ui'
import ProTable from '@/components/pro-table/index.vue'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import { getApplication, listApplications } from '@/api/application-center'
import {
  fetchPersistentPages,
  getPersistentPage,
  generatePersistentPage,
  savePersistentPage,
  publishPersistentPage,
  previewPersistentPage,
  rolloutPersistentPage,
  archivePersistentPage,
  persistentLowCodeSources,
} from '@/api/low-code-runtime'
import type {
  PersistentPage,
  LowCodeRuntimeDefinition,
} from '@/api/low-code-runtime'
import { createCommandRetry } from '@/services/command-retry'
import { confirmR1Action } from '@/services/r1-confirm'
import { getToken } from '@/services/auth'
import { tenantScope } from '@/services/tenant-context'
import { errorMessage, stableSignature } from '@/views/leave/shared'
import { hasPermission } from '@/services/ui-permissions'
import { parseLowCodePage } from '@af-admin/contracts'
import PersistentRuntime from './runtime-persistent.vue'
import type { VNode } from 'vue'
import type { TableColumnData } from '@arco-design/web-vue'
import type {
  LowCodePageV2,
  LowCodeSource,
  ManagedApplication,
} from '@af-admin/contracts'

const router = useRouter()
const route = useRoute()
const user = useUserStore()
const table = ref<ProTableExpose>()
const current = ref<PersistentPage>()
const draft = ref<LowCodePageV2>()
const name = ref('')
const newName = ref('业务管理页')
const applicationReleaseId = ref('')
const applications = ref<ManagedApplication[]>([])
const selectedApplication = ref<ManagedApplication>()
const applicationKeyword = ref('')
const applicationSearch = ref('')
const applicationPage = ref(1)
const applicationPageSize = ref<20 | 100>(20)
const applicationTotal = ref(0)
const applicationLoading = ref(false)
const sources = ref<LowCodeSource[]>([])
const busy = ref(false)
const error = ref('')
const message = ref('')
const selectedMaterialId = ref('')
const jsonText = ref('')
const baseReleaseId = ref('')
const rolloutReleaseId = ref('')
const percent = ref(0)
const previewDefinition = ref<LowCodeRuntimeDefinition>()
const previewSchema = ref<LowCodePageV2>()
const previewKey = ref(0)
const retry = createCommandRetry()
const contextGeneration = ref(0)
let ticket = 0
let applicationRequest = 0
let operationGeneration = 0
let previewGeneration = 0
const captureScope = () => ({
  context: contextGeneration.value,
  token: getToken(),
  tenant: tenantScope.snapshot(),
  userId: user.id,
  tenantId: user.tenantId,
  permissions: user.permissions.join('|'),
})
const currentScope = (captured: ReturnType<typeof captureScope>) =>
  captured.context === contextGeneration.value &&
  captured.token === getToken() &&
  captured.userId === user.id &&
  captured.tenantId === user.tenantId &&
  captured.permissions === user.permissions.join('|') &&
  tenantScope.isCurrent(captured.tenant)
const applicationPageCount = computed(() =>
  Math.max(1, Math.ceil(applicationTotal.value / applicationPageSize.value))
)
const dirty = computed(() =>
  Boolean(
    current.value &&
      draft.value &&
      (name.value !== current.value.name ||
        stableSignature(draft.value) !== stableSignature(current.value.schema))
  )
)
const selectedMaterial = computed(() =>
  draft.value?.materials.find(
    (material) => material.id === selectedMaterialId.value
  )
)
const actionTypeLabels: Record<string, string> = {
  query: '查询',
  submit: '提交',
  navigate: '跳转',
  openModal: '弹窗',
  refreshBlock: '刷新区块',
}
const operationLabels: Record<string, string> = {
  create: '创建草稿',
  save: '保存修改',
  start: '提交审批',
}
const can = (code: string) => hasPermission(user.permissions, code)
const fetchPages = async ({ current: page, pageSize }: ProTableFetchParams) => {
  const captured = captureScope()
  try {
    const result = await fetchPersistentPages(page, pageSize)
    if (!currentScope(captured)) return { list: [], total: 0 }
    return {
      list: result.list.map((item) => ({ ...item })),
      total: result.total,
    }
  } catch (failure) {
    if (!currentScope(captured)) return { list: [], total: 0 }
    throw failure
  }
}
const openRuntime = (page?: PersistentPage) => {
  if (page) router.push(`/low-code/pages/${encodeURIComponent(page.id)}/run`)
}
const pageColumns: TableColumnData[] = [
  { title: '页面名称', dataIndex: 'name' },
  {
    title: '状态',
    render: ({ record }) => (record.status === 'enabled' ? '可配置' : '已归档'),
  },
  { title: '配置版本', dataIndex: 'revision' },
  {
    title: '操作',
    render: ({ record }) => {
      const page = record as PersistentPage
      const buttons: VNode[] = []
      if (can('low-code:page:update'))
        buttons.push(
          h(adminUi.Button, { onClick: () => edit(page.id) }, () => '编辑配置')
        )
      if (page.activeReleaseId && can('low-code:page:run'))
        buttons.push(
          h(
            adminUi.Button,
            { onClick: () => openRuntime(page) },
            () => '运行页面'
          )
        )
      if (can('low-code:page:archive'))
        buttons.push(
          h(adminUi.Button, { onClick: () => archive(page) }, () =>
            page.status === 'enabled' ? '归档' : '恢复'
          )
        )
      return h('div', { class: 'editor-actions' }, buttons)
    },
  },
]
const changeSource = (event: Event) => {
  if (!selectedMaterial.value || !draft.value) return
  selectedMaterial.value.sourceId = (event.target as HTMLSelectElement).value
  draft.value.sources = [
    ...new Set(draft.value.materials.map((material) => material.sourceId)),
  ]
}
const changePermission = (event: Event) => {
  if (!selectedMaterial.value) return
  const value = (event.target as HTMLInputElement).value.trim()
  if (value) selectedMaterial.value.permissionCode = value
  else delete selectedMaterial.value.permissionCode
}
const loadApplicationDirectory = async (
  captured = captureScope()
): Promise<boolean> => {
  const request = ++applicationRequest
  if (!currentScope(captured)) return false
  applicationLoading.value = true
  try {
    const result = await listApplications({
      current: applicationPage.value,
      pageSize: applicationPageSize.value,
      keyword: applicationSearch.value,
      status: 'enabled',
    })
    if (request !== applicationRequest || !currentScope(captured)) return false
    applications.value = result.list.filter(
      (app) => app.businessKind === 'generic' && Boolean(app.activeReleaseId)
    )
    applicationTotal.value = result.total
    return true
  } catch (failure) {
    if (request === applicationRequest && currentScope(captured))
      error.value = errorMessage(failure)
    return false
  } finally {
    if (request === applicationRequest) applicationLoading.value = false
  }
}
const searchApplications = async () => {
  applicationSearch.value = applicationKeyword.value.trim()
  applicationPage.value = 1
  await loadApplicationDirectory()
}
const changeApplicationPage = async (change: -1 | 1) => {
  const next = applicationPage.value + change
  if (next < 1 || next > applicationPageCount.value) return
  applicationPage.value = next
  await loadApplicationDirectory()
}
const changeApplicationPageSize = async () => {
  applicationPage.value = 1
  await loadApplicationDirectory()
}
const applicationAvailable = (app: ManagedApplication) =>
  app.tenantId === user.tenantId &&
  app.status === 'enabled' &&
  app.businessKind === 'generic' &&
  Boolean(app.activeReleaseId)
const changeApplicationSelection = async (event: Event) => {
  const releaseId = (event.target as HTMLSelectElement).value
  applicationReleaseId.value = releaseId
  selectedApplication.value = applications.value.find(
    (app) => app.activeReleaseId === releaseId
  )
  const query = { ...route.query }
  if (selectedApplication.value)
    query.applicationId = selectedApplication.value.id
  else delete query.applicationId
  await router.replace({ query })
}
const importJson = () => {
  try {
    draft.value = parseLowCodePage(JSON.parse(jsonText.value))
    selectedMaterialId.value = draft.value.materials[0].id
    error.value = ''
    previewDefinition.value = undefined
  } catch (failure) {
    error.value = errorMessage(failure)
  }
}
const exportJson = () => {
  jsonText.value = JSON.stringify(draft.value, null, 2)
}
async function edit(id: string, force = false, captured = captureScope()) {
  if (!currentScope(captured)) return
  if (
    !force &&
    dirty.value &&
    !(await confirmR1Action('当前有未保存配置，确认切换页面？'))
  )
    return
  if (!currentScope(captured)) return
  const seq = ++ticket
  error.value = ''
  try {
    const page = await getPersistentPage(id)
    if (!currentScope(captured) || seq !== ticket) return
    current.value = page
    draft.value = JSON.parse(JSON.stringify(page.schema))
    name.value = page.name
    selectedMaterialId.value = page.schema.materials[0].id
    baseReleaseId.value = page.activeReleaseId || ''
    rolloutReleaseId.value = page.rolloutReleaseId || ''
    percent.value = page.rolloutPercent
    previewDefinition.value = undefined
    retry.clear()
  } catch (failure) {
    if (currentScope(captured) && seq === ticket)
      error.value = errorMessage(failure)
  }
}
const execute = async (
  operation: string,
  body: unknown,
  fn: (
    key: string,
    captured: ReturnType<typeof captureScope>,
    generation: number
  ) => Promise<void>
) => {
  if (busy.value) return
  const captured = captureScope()
  const generation = ++operationGeneration
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    await fn(retry.key(operation, body), captured, generation)
    if (!currentScope(captured) || generation !== operationGeneration) return
    retry.complete(operation)
  } catch (failure) {
    if (currentScope(captured) && generation === operationGeneration)
      error.value = errorMessage(failure)
  } finally {
    if (generation === operationGeneration) busy.value = false
  }
}
const generate = () =>
  execute(
    'generate',
    { name: newName.value, applicationReleaseId: applicationReleaseId.value },
    async (key, captured, generation) => {
      if (!selectedApplication.value)
        throw new Error('请选择真实业务应用发布版')
      if (!currentScope(captured)) return
      const selected = await getApplication(selectedApplication.value.id)
      if (
        !currentScope(captured) ||
        !applicationAvailable(selected) ||
        selected.activeReleaseId !== applicationReleaseId.value
      )
        throw new Error('所选业务应用发布版已变化，请重新查询并选择')
      if (!currentScope(captured)) return
      const page = await generatePersistentPage(
        newName.value,
        selected.activeReleaseId,
        key
      )
      if (!currentScope(captured)) return
      await table.value?.reload()
      if (!currentScope(captured)) return
      await initializeSources(captured)
      if (!currentScope(captured)) return
      await edit(page.id, true, captured)
      if (!currentScope(captured)) return
      await router.replace({
        query: {
          ...route.query,
          applicationId: selected.id,
          pageId: page.id,
        },
      })
      if (!currentScope(captured) || generation !== operationGeneration) return
      message.value = '已生成独立业务管理页草稿'
    }
  )
const save = async () => {
  if (!current.value || !draft.value) return
  const page = current.value
  const body = {
    name: name.value,
    schema: draft.value,
    expectedRevision: page.revision,
  }
  await execute('save', body, async (key, captured) => {
    await savePersistentPage(page, name.value, draft.value, key)
    if (!currentScope(captured)) return
    await edit(page.id, true, captured)
    if (!currentScope(captured)) return
    await table.value?.reload()
    if (currentScope(captured)) message.value = '配置已保存'
  })
}
const publish = async () => {
  if (!current.value || dirty.value) return
  if (
    !(await confirmR1Action(
      '确认发布固定页面配置？后续草稿修改不改变此发布版。'
    ))
  )
    return
  const page = current.value
  await execute(
    'publish',
    { revision: page.revision },
    async (key, captured) => {
      const release = await publishPersistentPage(page, key)
      if (!currentScope(captured)) return
      await edit(page.id, true, captured)
      if (!currentScope(captured)) return
      await table.value?.reload()
      if (currentScope(captured))
        message.value = `页面发布成功，v${release.releaseVersion}`
    }
  )
}
const preview = async () => {
  if (!current.value || !draft.value) return
  const captured = captureScope()
  const generation = ++previewGeneration
  error.value = ''
  try {
    const schema = parseLowCodePage(draft.value)
    const result = await previewPersistentPage(current.value.id, schema)
    if (!currentScope(captured) || generation !== previewGeneration) return
    previewDefinition.value = result
    previewSchema.value = JSON.parse(JSON.stringify(schema))
    previewKey.value += 1
  } catch (failure) {
    if (currentScope(captured) && generation === previewGeneration)
      error.value = errorMessage(failure)
  }
}
const rollout = async () => {
  if (!current.value) return
  if (
    !(await confirmR1Action(
      '确认切换运行版本和灰度比例？已发布配置及旧业务记录保留。'
    ))
  )
    return
  const page = current.value
  await execute(
    'rollout',
    {
      releaseId: baseReleaseId.value,
      rolloutReleaseId: rolloutReleaseId.value,
      percent: percent.value,
      revision: page.revision,
    },
    async (key, captured) => {
      await rolloutPersistentPage(
        page,
        baseReleaseId.value,
        rolloutReleaseId.value || null,
        rolloutReleaseId.value ? percent.value : 0,
        key
      )
      if (!currentScope(captured)) return
      await edit(page.id, true, captured)
      if (currentScope(captured)) message.value = '运行版本已应用'
    }
  )
}
async function archive(page: PersistentPage) {
  if (
    !(await confirmR1Action(
      page.status === 'enabled'
        ? '确认归档此页面？运行入口将不可访问。'
        : '确认恢复此页面？'
    ))
  )
    return
  await execute(
    'archive',
    { id: page.id, revision: page.revision },
    async (key, captured) => {
      await archivePersistentPage(
        page,
        page.status === 'enabled' ? 'archived' : 'enabled',
        key
      )
      if (!currentScope(captured)) return
      if (current.value?.id === page.id) {
        current.value = undefined
        draft.value = undefined
      }
      await table.value?.reload()
    }
  )
}
async function initializeSources(captured = captureScope()) {
  if (!currentScope(captured)) return false
  const result = await persistentLowCodeSources()
  if (!currentScope(captured)) return false
  sources.value = result.list
  return true
}
const initialize = async () => {
  const captured = captureScope()
  const seq = ++ticket
  current.value = undefined
  draft.value = undefined
  previewDefinition.value = undefined
  error.value = ''
  retry.clear()
  try {
    const pageId =
      typeof route.query.pageId === 'string' ? route.query.pageId : ''
    const selectedId =
      typeof route.query.applicationId === 'string'
        ? route.query.applicationId
        : ''
    const [, catalogue, restoredSelection] = await Promise.all([
      loadApplicationDirectory(captured),
      persistentLowCodeSources(),
      selectedId ? getApplication(selectedId) : Promise.resolve(undefined),
    ])
    if (!currentScope(captured) || seq !== ticket) return
    sources.value = catalogue.list
    if (restoredSelection) {
      if (!applicationAvailable(restoredSelection))
        throw new Error('已保存的业务应用选择当前不可用')
      selectedApplication.value = restoredSelection
      applicationReleaseId.value = restoredSelection.activeReleaseId || ''
    }
    const openedPageId = (current.value as PersistentPage | undefined)?.id
    if (pageId && pageId !== openedPageId) await edit(pageId, true, captured)
  } catch (failure) {
    if (currentScope(captured) && seq === ticket)
      error.value = errorMessage(failure)
  }
}
watch(
  () => [user.id, user.tenantId, user.permissions.join('|')],
  () => {
    contextGeneration.value += 1
    ticket += 1
    applicationRequest += 1
    operationGeneration += 1
    previewGeneration += 1
    busy.value = false
    applicationLoading.value = false
    applicationKeyword.value = ''
    applicationSearch.value = ''
    applicationPage.value = 1
    applicationTotal.value = 0
    applications.value = []
    applicationReleaseId.value = ''
    selectedApplication.value = undefined
    initialize()
  }
)
watch(
  () => route.query.pageId,
  (id) => {
    if (typeof id === 'string' && id !== current.value?.id) edit(id)
  }
)
onBeforeRouteLeave(
  async () =>
    !dirty.value || confirmR1Action('当前有未保存页面配置，确认离开？')
)
onMounted(initialize)
onUnmounted(() => {
  contextGeneration.value += 1
  ticket += 1
  applicationRequest += 1
  operationGeneration += 1
  previewGeneration += 1
  busy.value = false
  applicationLoading.value = false
  retry.clear()
})
</script>
<style scoped>
.persistent-designer {
  padding: 24px;
  max-width: 1440px;
  margin: auto;
}
.generation,
.editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  margin: 16px 0;
}
.page-editor {
  padding: 24px;
  margin: 24px 0;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-2);
}
.property-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
label {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}
input,
select,
textarea {
  padding: 8px;
  width: 100%;
  max-width: 100%;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
  background: var(--color-bg-2);
  color: var(--color-text-1);
}
.action-row {
  padding: 8px;
  border-bottom: 1px solid var(--color-border-2);
}
.preview-section {
  margin-top: 24px;
}
[role='alert'] {
  color: var(--color-danger-6);
}
@media (max-width: 900px) {
  .property-grid {
    grid-template-columns: 1fr;
  }
}
</style>
