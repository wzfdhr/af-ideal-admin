<template>
  <main class="data-permission" data-testid="data-permission-center">
    <div class="data-permission__header">
      <div>
        <p class="data-permission__breadcrumb">权限管理 / 数据权限</p>
        <h1>数据权限</h1>
      </div>
      <div class="data-permission__summary">共 {{ total }} 条规则</div>
    </div>

    <section class="data-permission__filters" aria-label="数据权限筛选">
      <label class="data-permission__field">
        <span>关键词</span>
        <input
          v-model.trim="filters.keyword"
          data-testid="data-permission-keyword"
          placeholder="角色、权限标识或租户"
        />
      </label>
      <label class="data-permission__field">
        <span>租户</span>
        <select v-model="filters.tenantId">
          <option value="">全部租户</option>
          <option value="tenant-a">Aheart 科技</option>
          <option value="tenant-b">Ideal 数据</option>
        </select>
      </label>
      <label class="data-permission__field">
        <span>范围</span>
        <select v-model="filters.dataScope" data-testid="data-permission-scope">
          <option value="">全部范围</option>
          <option
            v-for="option in scopeOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <div class="data-permission__actions">
        <button
          class="data-permission__button data-permission__button--primary"
          data-testid="data-permission-query"
          :disabled="loading"
          type="button"
          @click="queryRules"
        >
          查询
        </button>
        <button
          class="data-permission__button"
          :disabled="loading"
          type="button"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </section>

    <section class="data-permission__layout">
      <div class="data-permission__panel">
        <div class="data-permission__panel-title">
          <h2>角色规则</h2>
          <span>Mock 数据范围</span>
        </div>
        <div class="data-permission__rule-list">
          <article
            v-for="rule in rules"
            :key="rule.roleId"
            class="data-permission__rule"
          >
            <button
              class="data-permission__rule-button"
              type="button"
              @click="selectRule(rule)"
            >
              <strong>{{ rule.roleName }}</strong>
              <small>{{ rule.roleKey }} / {{ rule.tenantName }}</small>
            </button>
            <dl>
              <div>
                <dt>范围</dt>
                <dd>{{ getScopeLabel(rule.dataScope) }}</dd>
              </div>
              <div>
                <dt>部门</dt>
                <dd>{{ rule.departments.join('、') || '-' }}</dd>
              </div>
              <div>
                <dt>字段</dt>
                <dd>{{ rule.fieldPermissions.length }}</dd>
              </div>
            </dl>
          </article>
          <div
            v-if="!loading && rules.length === 0"
            class="data-permission__empty"
          >
            暂无数据权限规则
          </div>
        </div>
      </div>

      <div class="data-permission__panel">
        <div class="data-permission__panel-title">
          <h2>规则编辑</h2>
          <span>{{ selectedRule?.roleName || '请选择角色' }}</span>
        </div>
        <label class="data-permission__field">
          <span>数据范围</span>
          <select
            v-model="editForm.dataScope"
            data-testid="data-permission-edit-scope"
          >
            <option
              v-for="option in scopeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="data-permission__field">
          <span>部门 ID</span>
          <input v-model.trim="departmentText" placeholder="逗号分隔" />
        </label>
        <label class="data-permission__field">
          <span>本人用户 ID</span>
          <input v-model.trim="ownerText" placeholder="逗号分隔" />
        </label>
        <label class="data-permission__field">
          <span>字段权限</span>
          <input v-model.trim="fieldText" placeholder="逗号分隔" />
        </label>
        <div class="data-permission__actions">
          <button
            class="data-permission__button data-permission__button--primary"
            data-testid="data-permission-save"
            :disabled="loading || !selectedRule"
            type="button"
            @click="saveRule"
          >
            保存规则
          </button>
          <button
            class="data-permission__button"
            :disabled="loading || !selectedRule"
            type="button"
            @click="previewRule"
          >
            预览范围
          </button>
        </div>
        <p v-if="actionMessage" class="data-permission__message">
          {{ actionMessage }}
        </p>
      </div>
    </section>

    <section class="data-permission__panel">
      <div class="data-permission__panel-title">
        <h2>Mock 业务数据预览</h2>
        <span>
          可见 {{ preview.visibleRows.length }} / 隐藏
          {{ preview.hiddenRows.length }}
        </span>
      </div>
      <table class="data-permission__table">
        <thead>
          <tr>
            <th>客户</th>
            <th>租户</th>
            <th>部门</th>
            <th>负责人</th>
            <th>金额</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="preview.visibleRows.length === 0">
            <td class="data-permission__empty" colspan="5">
              当前规则暂无可见数据
            </td>
          </tr>
          <tr v-for="row in preview.visibleRows" :key="row.id">
            <td>{{ row.customerName }}</td>
            <td>{{ row.tenantName }}</td>
            <td>{{ row.departmentName }}</td>
            <td>{{ row.ownerName }}</td>
            <td>{{ row.amount }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  fetchDataPermissionRules,
  previewDataPermission,
  updateDataPermissionRule,
  type DataPermissionQuery,
  type DataPermissionRecord,
  type DataScopePreviewResult,
  type DataScopeType,
} from '@/api/data-permission'

const scopeOptions: Array<{ label: string; value: DataScopeType }> = [
  { label: '全部数据', value: 'all' },
  { label: '本租户', value: 'tenant' },
  { label: '本部门及下级', value: 'department-and-children' },
  { label: '本部门', value: 'department' },
  { label: '本人', value: 'self' },
]

const rules = ref<DataPermissionRecord[]>([])
const selectedRule = ref<DataPermissionRecord>()
const total = ref(0)
const loading = ref(false)
const current = ref(1)
const pageSize = ref(20)
const actionMessage = ref('')

const preview = reactive<DataScopePreviewResult>({
  visibleRows: [],
  hiddenRows: [],
})

const filters = reactive({
  keyword: '',
  tenantId: '',
  dataScope: '' as DataScopeType | '',
})

const editForm = reactive({
  dataScope: 'self' as DataScopeType,
})

const departmentText = ref('')
const ownerText = ref('')
const fieldText = ref('')

const splitText = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const buildQuery = (): DataPermissionQuery => ({
  current: current.value,
  pageSize: pageSize.value,
  keyword: filters.keyword,
  tenantId: filters.tenantId,
  dataScope: filters.dataScope,
})

const getScopeLabel = (scope: DataScopeType) =>
  scopeOptions.find((option) => option.value === scope)?.label || scope

const syncForm = (rule: DataPermissionRecord) => {
  editForm.dataScope = rule.dataScope
  departmentText.value = rule.departmentIds.join(',')
  ownerText.value = rule.ownerUserIds.join(',')
  fieldText.value = rule.fieldPermissions.join(',')
}

const previewRule = async () => {
  if (!selectedRule.value) return

  const result = await previewDataPermission({
    roleId: selectedRule.value.roleId,
    dataScope: editForm.dataScope,
    departmentIds: splitText(departmentText.value),
    ownerUserIds: splitText(ownerText.value),
  })
  preview.visibleRows = result.visibleRows
  preview.hiddenRows = result.hiddenRows
}

const selectRule = async (rule: DataPermissionRecord) => {
  selectedRule.value = rule
  syncForm(rule)
  await previewRule()
}

const loadRules = async () => {
  loading.value = true

  try {
    const result = await fetchDataPermissionRules(buildQuery())
    rules.value = result.list
    total.value = result.total
    if (result.list[0]) {
      await selectRule(result.list[0])
    } else {
      selectedRule.value = undefined
      preview.visibleRows = []
      preview.hiddenRows = []
    }
  } finally {
    loading.value = false
  }
}

const queryRules = async () => {
  current.value = 1
  await loadRules()
}

const resetFilters = async () => {
  filters.keyword = ''
  filters.tenantId = ''
  filters.dataScope = ''
  await queryRules()
}

const saveRule = async () => {
  if (!selectedRule.value) return

  const result = await updateDataPermissionRule(selectedRule.value.roleId, {
    dataScope: editForm.dataScope,
    departmentIds: splitText(departmentText.value),
    ownerUserIds: splitText(ownerText.value),
    fieldPermissions: splitText(fieldText.value),
  })

  if (!result.success || !result.record) {
    actionMessage.value = result.reason || '数据权限保存失败'
    return
  }

  selectedRule.value = result.record
  rules.value = rules.value.map((rule) =>
    rule.roleId === result.record?.roleId ? result.record : rule
  )
  actionMessage.value = '数据权限保存成功'
  await previewRule()
}

onMounted(loadRules)
</script>

<style scoped lang="scss">
.data-permission {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  color: #1d2939;
}

.data-permission__header,
.data-permission__filters,
.data-permission__layout,
.data-permission__panel-title {
  display: flex;
  gap: 16px;
}

.data-permission__header,
.data-permission__filters,
.data-permission__panel-title {
  align-items: center;
  justify-content: space-between;
}

.data-permission__breadcrumb {
  margin: 0 0 4px;
  color: #667085;
  font-size: 13px;
}

.data-permission h1,
.data-permission h2 {
  margin: 0;
}

.data-permission__summary,
.data-permission__filters,
.data-permission__panel {
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
}

.data-permission__summary {
  padding: 10px 14px;
  color: #475467;
}

.data-permission__filters,
.data-permission__panel {
  padding: 16px;
}

.data-permission__layout {
  align-items: flex-start;
}

.data-permission__layout > .data-permission__panel {
  flex: 1;
  min-width: 0;
}

.data-permission__field {
  display: flex;
  flex: 1;
  min-width: 180px;
  flex-direction: column;
  gap: 6px;
}

.data-permission__field span,
.data-permission__panel-title span {
  color: #667085;
  font-size: 13px;
}

.data-permission input,
.data-permission select {
  min-height: 34px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  padding: 0 10px;
  color: #1d2939;
}

.data-permission__actions {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.data-permission__button,
.data-permission__rule-button {
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #344054;
  cursor: pointer;
}

.data-permission__button {
  min-height: 34px;
  padding: 0 14px;
}

.data-permission__button--primary {
  border-color: #165dff;
  background: #165dff;
  color: #fff;
}

.data-permission__rule-list {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.data-permission__rule {
  display: grid;
  gap: 12px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  padding: 12px;
}

.data-permission__rule-button {
  display: flex;
  flex-direction: column;
  border: 0;
  padding: 0;
  text-align: left;
}

.data-permission__rule-button small {
  color: #667085;
}

.data-permission dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.data-permission dt {
  color: #667085;
  font-size: 12px;
}

.data-permission dd {
  margin: 2px 0 0;
  font-weight: 600;
}

.data-permission__table {
  width: 100%;
  margin-top: 14px;
  border-collapse: collapse;
}

.data-permission__table th,
.data-permission__table td {
  border-bottom: 1px solid #e4e7ec;
  padding: 10px;
  text-align: left;
}

.data-permission__message {
  margin: 12px 0 0;
  color: #165dff;
}

.data-permission__empty {
  padding: 18px;
  color: #667085;
  text-align: center;
}

@media (max-width: 980px) {
  .data-permission__header,
  .data-permission__filters,
  .data-permission__layout {
    flex-direction: column;
    align-items: stretch;
  }

  .data-permission dl {
    grid-template-columns: 1fr;
  }
}
</style>
