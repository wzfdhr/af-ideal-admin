<template>
  <main class="business-list" data-testid="business-records-list">
    <h1>我的业务申请</h1>
    <p v-if="error" role="alert">{{ error }}</p>
    <label>
      业务应用
      <select v-model="applicationId" aria-label="业务应用">
        <option value="">请选择已发布应用</option>
        <option v-for="app in apps" :key="app.id" :value="app.id">
          {{ app.name }}
        </option>
      </select>
    </label>
    <PermissionButton
      permission="business:create"
      :disabled="!applicationId"
      @click="
        router.push({ path: '/business/records/new', query: { applicationId } })
      "
    >
      新建业务申请
    </PermissionButton>
    <a-button @click="table?.reload()">刷新</a-button>
    <ProTable ref="table" :fetch-data="load" :columns="columns" row-key="id" />
  </main>
</template>
<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ProTable from '@/components/pro-table/index.vue'
import PermissionButton from '@/components/permission-button.vue'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import {
  publishedBusinessApplications,
  listBusinessRecords,
} from '@/api/business-records'
import { statusLabels } from '@/views/leave/shared'

const router = useRouter()
const table = ref<ProTableExpose>()
const apps = ref<{ id: string; name: string }[]>([])
const applicationId = ref('')
const error = ref('')
const load = async ({ current, pageSize }: ProTableFetchParams) => {
  const result = await listBusinessRecords({ current, pageSize })
  return { ...result, list: result.list.map((row) => ({ ...row })) }
}
const columns = [
  {
    title: '申请内容',
    render: ({ record }: { record: Record<string, unknown> }) =>
      String(
        (record.fields as Record<string, unknown>)?.itemName || '业务申请'
      ),
  },
  {
    title: '状态',
    render: ({ record }: { record: Record<string, unknown> }) =>
      statusLabels[String(record.status)],
  },
  {
    title: '操作',
    render: ({ record }: { record: Record<string, unknown> }) =>
      h(
        RouterLink,
        { to: `/business/records/${encodeURIComponent(String(record.id))}` },
        { default: () => '查看' }
      ),
  },
]
onMounted(() =>
  publishedBusinessApplications()
    .then((result) => {
      apps.value = result
    })
    .catch((failure) => {
      error.value =
        failure instanceof Error ? failure.message : '业务应用加载失败'
    })
)
</script>
<style scoped>
.business-list {
  padding: 24px;
}
h1 {
  font-size: 24px;
  margin-bottom: 24px;
}
select {
  margin: 12px;
  padding: 8px;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
