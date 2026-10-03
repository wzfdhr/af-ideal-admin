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
        已发布业务应用
        <select v-model="applicationReleaseId" aria-label="生成页面业务发布版">
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
      <a-button
        :disabled="busy || !applicationReleaseId"
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
import { listApplications } from '@/api/application-center'
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
import { errorMessage, stableSignature } from '@/views/leave/shared'
import { parseLowCodePage } from '@af-admin/contracts'
import { hasPermission } from '@af-admin/workflow-core'
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
let ticket = 0
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
  const result = await fetchPersistentPages(page, pageSize)
  return { list: result.list.map((item) => ({ ...item })), total: result.total }
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
async function edit(id: string, force = false) {
  if (
    !force &&
    dirty.value &&
    !(await confirmR1Action('当前有未保存配置，确认切换页面？'))
  )
    return
  const seq = ++ticket
  error.value = ''
  try {
    const page = await getPersistentPage(id)
    if (seq !== ticket) return
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
    if (seq === ticket) error.value = errorMessage(failure)
  }
}
const execute = async (
  operation: string,
  body: unknown,
  fn: (key: string) => Promise<void>
) => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    await fn(retry.key(operation, body))
    retry.complete(operation)
  } catch (failure) {
    error.value = errorMessage(failure)
  } finally {
    busy.value = false
  }
}
const generate = () =>
  execute(
    'generate',
    { name: newName.value, applicationReleaseId: applicationReleaseId.value },
    async (key) => {
      const page = await generatePersistentPage(
        newName.value,
        applicationReleaseId.value,
        key
      )
      await table.value?.reload()
      await initializeSources()
      await edit(page.id, true)
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
  await execute('save', body, async (key) => {
    await savePersistentPage(page, name.value, draft.value, key)
    await edit(page.id, true)
    await table.value?.reload()
    message.value = '配置已保存'
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
  await execute('publish', { revision: page.revision }, async (key) => {
    const release = await publishPersistentPage(page, key)
    await edit(page.id, true)
    await table.value?.reload()
    message.value = `页面发布成功，v${release.releaseVersion}`
  })
}
const preview = async () => {
  if (!current.value || !draft.value) return
  error.value = ''
  try {
    const schema = parseLowCodePage(draft.value)
    previewDefinition.value = await previewPersistentPage(
      current.value.id,
      schema
    )
    previewSchema.value = JSON.parse(JSON.stringify(schema))
    previewKey.value += 1
  } catch (failure) {
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
    async (key) => {
      await rolloutPersistentPage(
        page,
        baseReleaseId.value,
        rolloutReleaseId.value || null,
        rolloutReleaseId.value ? percent.value : 0,
        key
      )
      await edit(page.id, true)
      message.value = '运行版本已应用'
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
    async (key) => {
      await archivePersistentPage(
        page,
        page.status === 'enabled' ? 'archived' : 'enabled',
        key
      )
      if (current.value?.id === page.id) {
        current.value = undefined
        draft.value = undefined
      }
      await table.value?.reload()
    }
  )
}
async function initializeSources() {
  sources.value = (await persistentLowCodeSources()).list
}
const initialize = async () => {
  const seq = ++ticket
  current.value = undefined
  draft.value = undefined
  previewDefinition.value = undefined
  error.value = ''
  retry.clear()
  try {
    const [apps, catalogue] = await Promise.all([
      listApplications({ current: 1, pageSize: 100 }),
      persistentLowCodeSources(),
    ])
    if (seq !== ticket) return
    applications.value = apps.list.filter(
      (app) =>
        app.businessKind === 'generic' &&
        app.status === 'enabled' &&
        app.activeReleaseId
    )
    sources.value = catalogue.list
    if (typeof route.query.pageId === 'string')
      await edit(route.query.pageId, true)
  } catch (failure) {
    if (seq === ticket) error.value = errorMessage(failure)
  }
}
watch(
  () => [user.id, user.tenantId],
  () => {
    ticket += 1
    busy.value = false
    initialize()
  }
)
watch(
  () => route.query.pageId,
  (id) => {
    if (typeof id === 'string') edit(id)
  }
)
onBeforeRouteLeave(
  async () =>
    !dirty.value || confirmR1Action('当前有未保存页面配置，确认离开？')
)
onMounted(initialize)
onUnmounted(() => {
  ticket += 1
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
