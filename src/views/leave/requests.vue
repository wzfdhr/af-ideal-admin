<template>
  <main class="leave-page" data-testid="leave-requests">
    <div class="leave-header">
      <div>
        <p>业务应用 / 请假审批</p>
        <h1>我的申请</h1>
      </div>
      <a-button
        v-if="canCreate"
        type="primary"
        data-testid="leave-create"
        @click="router.push('/leave/requests/new')"
      >
        新建申请
      </a-button>
    </div>
    <a-space class="leave-filters">
      <label for="leave-status">申请状态</label>
      <select
        id="leave-status"
        v-model="status"
        data-testid="leave-status-filter"
        @change="reload"
      >
        <option value="">全部状态</option>
        <option
          v-for="(label, value) in statusLabels"
          :key="value"
          :value="value"
        >
          {{ label }}
        </option>
      </select>
      <a-button @click="reload">刷新</a-button>
    </a-space>
    <a-alert v-if="error" type="error" :title="error" class="leave-alert" />
    <ProTable
      ref="table"
      :columns="columns"
      :fetch-data="fetchRows"
      row-key="id"
      empty-text="暂无申请，可以新建一份请假申请"
    />
  </main>
</template>
<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ProTable from '@/components/pro-table/index.vue'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import useUserStore from '@/store/modules/user'
import { fetchLeaveRequests } from '@/api/leave'
import { hasPermission } from '@af-admin/workflow-core'
import { statusLabels, errorMessage } from './shared'

const router = useRouter()
const user = useUserStore()
const canCreate = computed(() =>
  hasPermission(user.permissions, 'leave:create')
)
const status = ref('')
const table = ref<ProTableExpose>()
const error = ref('')
const columns = [
  {
    title: '申请时间',
    dataIndex: 'createdAt',
    render: ({ record }: { record: Record<string, unknown> }) =>
      new Date(String(record.createdAt)).toLocaleString('zh-CN'),
  },
  {
    title: '请假日期',
    render: ({ record }: { record: Record<string, unknown> }) =>
      `${record.startDate} 至 ${record.endDate}`,
  },
  {
    title: '天数',
    render: ({ record }: { record: Record<string, unknown> }) =>
      `${Number(record.halfDayUnits) / 2} 天`,
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
        { to: `/leave/requests/${encodeURIComponent(String(record.id))}` },
        () => (record.status === 'draft' ? '继续编辑' : '查看详情')
      ),
  },
]
const fetchRows = async ({ current, pageSize }: ProTableFetchParams) => {
  error.value = ''
  try {
    const result = await fetchLeaveRequests({
      current,
      pageSize,
      status: status.value,
    })
    return { ...result, list: result.list.map((item) => ({ ...item })) }
  } catch (failure) {
    error.value = errorMessage(failure)
    throw failure
  }
}
const reload = () => table.value?.reset().catch(() => undefined)
</script>
<style src="./style.css"></style>
