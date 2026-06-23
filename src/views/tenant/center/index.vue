<template>
  <main class="tenant-center" data-testid="tenant-center">
    <div class="tenant-center__header">
      <div>
        <p class="tenant-center__breadcrumb">多租户 / 租户中心</p>
        <h1>租户中心</h1>
      </div>
      <div v-if="context" class="tenant-center__current">
        <span>当前租户</span>
        <strong>{{ context.currentTenant.name }}</strong>
      </div>
    </div>

    <section class="tenant-center__filters" aria-label="租户筛选">
      <label class="tenant-center__field">
        <span>关键词</span>
        <input
          v-model.trim="filters.keyword"
          data-testid="tenant-keyword"
          placeholder="租户名称、编码或品牌"
        />
      </label>
      <label class="tenant-center__field">
        <span>租户状态</span>
        <select v-model="filters.status" data-testid="tenant-status">
          <option value="">全部状态</option>
          <option value="enabled">启用</option>
          <option value="disabled">停用</option>
        </select>
      </label>
      <div class="tenant-center__actions">
        <button
          class="tenant-center__button tenant-center__button--primary"
          data-testid="tenant-query"
          :disabled="loading"
          type="button"
          @click="queryTenants"
        >
          查询
        </button>
        <button
          class="tenant-center__button"
          :disabled="loading"
          type="button"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </section>

    <section class="tenant-center__layout">
      <div class="tenant-center__panel">
        <div class="tenant-center__panel-title">
          <h2>租户列表</h2>
          <span>共 {{ total }} 个</span>
        </div>
        <div class="tenant-center__tenant-list">
          <article
            v-for="tenant in tenants"
            :key="tenant.id"
            class="tenant-center__tenant"
            :class="{ 'is-current': tenant.current }"
          >
            <div class="tenant-center__tenant-brand">
              <span :style="{ backgroundColor: tenant.themeColor }"></span>
              <div>
                <strong>{{ tenant.name }}</strong>
                <small>{{ tenant.code }} / {{ tenant.brandName }}</small>
              </div>
            </div>
            <dl>
              <div>
                <dt>用户</dt>
                <dd>{{ tenant.userCount }}</dd>
              </div>
              <div>
                <dt>部门</dt>
                <dd>{{ tenant.departmentCount }}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{{ tenant.status === 'enabled' ? '启用' : '停用' }}</dd>
              </div>
            </dl>
            <button
              class="tenant-center__link-button"
              :data-testid="`tenant-switch-${tenant.id}`"
              :disabled="
                loading || tenant.current || tenant.status === 'disabled'
              "
              type="button"
              @click="handleSwitchTenant(tenant.id)"
            >
              {{ tenant.current ? '当前租户' : '切换租户' }}
            </button>
          </article>
          <div
            v-if="!loading && tenants.length === 0"
            class="tenant-center__empty"
          >
            暂无租户
          </div>
        </div>
      </div>

      <div class="tenant-center__panel">
        <div class="tenant-center__panel-title">
          <h2>组织树</h2>
          <span>Mock 数据权限范围</span>
        </div>
        <ul class="tenant-center__org-list">
          <li v-for="node in flattenedOrgTree" :key="node.id">
            <span :style="{ paddingLeft: `${node.depth * 18}px` }">
              {{ node.name }}
            </span>
            <small>{{ getOrgTypeLabel(node.type) }}</small>
            <strong>{{ getDataScopeLabel(node.dataScope) }}</strong>
            <em>{{ node.leader }}</em>
          </li>
        </ul>
        <div
          v-if="!loading && flattenedOrgTree.length === 0"
          class="tenant-center__empty"
        >
          暂无组织数据
        </div>
      </div>
    </section>

    <section class="tenant-center__panel tenant-center__scope-panel">
      <div class="tenant-center__panel-title">
        <h2>角色数据权限</h2>
        <span>预留真实后端数据权限接入边界</span>
      </div>
      <table class="tenant-center__table">
        <thead>
          <tr>
            <th>角色</th>
            <th>范围</th>
            <th>部门</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!loading && dataScopes.length === 0">
            <td class="tenant-center__empty" colspan="3">暂无数据权限</td>
          </tr>
          <tr v-for="scope in dataScopes" :key="scope.roleId">
            <td>{{ scope.roleName }}</td>
            <td>{{ getDataScopeLabel(scope.dataScope) }}</td>
            <td>{{ scope.departments.join('、') || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  fetchTenantContext,
  fetchTenants,
  switchTenant,
  type TenantContext,
  type TenantDataScope,
  type TenantOrgNode,
  type TenantOrgNodeType,
  type TenantQuery,
  type TenantRecord,
  type TenantStatus,
} from '@/api/tenant'

interface FlatOrgNode extends TenantOrgNode {
  depth: number
}

const tenants = ref<TenantRecord[]>([])
const context = ref<TenantContext>()
const total = ref(0)
const loading = ref(false)
const current = ref(1)
const pageSize = ref(20)

const filters = reactive({
  keyword: '',
  status: '' as TenantStatus | '',
})

const dataScopes = computed(() => context.value?.dataScopes || [])

const flattenOrgTree = (nodes: TenantOrgNode[], depth = 0): FlatOrgNode[] =>
  nodes.flatMap((node) => [
    { ...node, depth },
    ...flattenOrgTree(node.children || [], depth + 1),
  ])

const flattenedOrgTree = computed(() =>
  flattenOrgTree(context.value?.orgTree || [])
)

const buildQuery = (): TenantQuery => ({
  current: current.value,
  pageSize: pageSize.value,
  keyword: filters.keyword,
  status: filters.status,
})

const loadTenantContext = async (tenantId: string) => {
  context.value = await fetchTenantContext(tenantId)
}

const loadTenants = async () => {
  loading.value = true

  try {
    const result = await fetchTenants(buildQuery())
    tenants.value = result.list
    total.value = result.total

    const activeTenant = result.list.find((tenant) => tenant.current)
    if (activeTenant) {
      await loadTenantContext(activeTenant.id)
    }
  } finally {
    loading.value = false
  }
}

const queryTenants = async () => {
  current.value = 1
  await loadTenants()
}

const resetFilters = async () => {
  filters.keyword = ''
  filters.status = ''
  await queryTenants()
}

const handleSwitchTenant = async (tenantId: string) => {
  loading.value = true

  try {
    const result = await switchTenant(tenantId)
    tenants.value = tenants.value.map((tenant) => ({
      ...tenant,
      current: tenant.id === result.tenantId,
    }))
    await loadTenantContext(result.tenantId)
  } finally {
    loading.value = false
  }
}

const getOrgTypeLabel = (type: TenantOrgNodeType) => {
  const labels: Record<TenantOrgNodeType, string> = {
    company: '公司',
    department: '部门',
    team: '小组',
  }

  return labels[type]
}

const getDataScopeLabel = (scope: TenantDataScope) => {
  const labels: Record<TenantDataScope, string> = {
    'all': '全部数据',
    'tenant': '本租户',
    'department-and-children': '本部门及下级',
    'department': '本部门',
    'self': '本人',
  }

  return labels[scope]
}

onMounted(loadTenants)
</script>

<style scoped lang="scss">
.tenant-center {
  min-height: 100%;
  padding: 24px;
  color: #1d2129;
  background: #f5f7fb;
}

.tenant-center__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h1 {
    margin: 4px 0 0;
    font-size: 24px;
  }
}

.tenant-center__breadcrumb,
.tenant-center__current span,
.tenant-center__panel-title span {
  margin: 0;
  color: #667085;
  font-size: 13px;
}

.tenant-center__current {
  display: flex;
  flex-direction: column;
  align-items: flex-end;

  strong {
    color: #165dff;
  }
}

.tenant-center__filters {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 180px auto;
  gap: 12px;
  align-items: end;
  padding: 16px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.tenant-center__field {
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

.tenant-center__actions {
  display: flex;
  gap: 8px;
}

.tenant-center__button,
.tenant-center__link-button {
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

.tenant-center__button--primary {
  color: #fff;
  background: #165dff;
  border-color: #165dff;
}

.tenant-center__layout {
  display: grid;
  grid-template-columns: minmax(300px, 420px) minmax(0, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.tenant-center__panel {
  padding: 16px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.tenant-center__panel-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;

  h2 {
    margin: 0;
    font-size: 16px;
  }
}

.tenant-center__tenant-list {
  display: grid;
  gap: 12px;
}

.tenant-center__tenant {
  padding: 14px;
  border: 1px solid #eaecf0;
  border-radius: 8px;

  &.is-current {
    border-color: #165dff;
    background: #f8fbff;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 12px 0;
  }

  dt {
    color: #667085;
    font-size: 12px;
  }

  dd {
    margin: 0;
    font-weight: 600;
  }
}

.tenant-center__tenant-brand {
  display: flex;
  gap: 10px;
  align-items: center;

  > span {
    width: 12px;
    height: 40px;
    border-radius: 999px;
  }

  strong,
  small {
    display: block;
  }

  small {
    color: #667085;
  }
}

.tenant-center__org-list {
  display: grid;
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) 70px 120px 100px;
    gap: 8px;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid #eaecf0;
  }

  small,
  strong,
  em {
    font-style: normal;
    color: #667085;
  }
}

.tenant-center__table {
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 12px 10px;
    text-align: left;
    border-bottom: 1px solid #eaecf0;
  }

  th {
    color: #667085;
    font-weight: 600;
    background: #f9fafb;
  }
}

.tenant-center__empty {
  padding: 24px;
  color: #667085;
  text-align: center;
}

@media (max-width: 960px) {
  .tenant-center {
    padding: 16px;
  }

  .tenant-center__header,
  .tenant-center__current {
    align-items: flex-start;
  }

  .tenant-center__header,
  .tenant-center__filters,
  .tenant-center__layout {
    grid-template-columns: 1fr;
  }

  .tenant-center__header {
    display: grid;
  }
}
</style>
