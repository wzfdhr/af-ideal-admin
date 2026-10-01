<template>
  <section class="leave-page" data-testid="leave-runtime">
    <div class="leave-header">
      <div>
        <p>请假审批 / 审批中心</p>
        <h1>我的审批</h1>
      </div>
      <a-button @click="reload">刷新</a-button>
    </div>
    <a-tabs v-model:active-key="tab">
      <a-tab-pane key="todo" title="待办" />
      <a-tab-pane key="done" title="已办" />
    </a-tabs>
    <ProTable
      :key="tab"
      ref="table"
      :fetch-data="fetchRows"
      :columns="columns"
      row-key="id"
      empty-text="暂无审批任务"
    />
  </section>
</template>
<script setup lang="ts">
import { h, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ProTable from '@/components/pro-table/index.vue'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import { fetchLeaveTasks } from '@/api/leave'

const tab = ref('todo')
const table = ref<ProTableExpose>()
const columns = [
  { title: '申请人', dataIndex: 'applicantName' },
  { title: '审批节点', dataIndex: 'nodeName' },
  {
    title: '天数',
    render: ({ record }: { record: Record<string, unknown> }) =>
      `${Number(record.halfDayUnits) / 2} 天`,
  },
  {
    title: '状态',
    render: ({ record }: { record: Record<string, unknown> }) =>
      ((
        { pending: '待处理', approved: '已通过', rejected: '已驳回' } as Record<
          string,
          string
        >
      )[String(record.status)]),
  },
  {
    title: '操作',
    render: ({ record }: { record: Record<string, unknown> }) =>
      h(
        RouterLink,
        {
          to: `/leave/requests/${encodeURIComponent(String(record.requestId))}`,
        },
        () => (record.status === 'pending' ? '查看并处理' : '查看记录')
      ),
  },
]
const fetchRows = async ({ current, pageSize }: ProTableFetchParams) => {
  const result = await fetchLeaveTasks(
    { current, pageSize },
    tab.value === 'done'
  )
  return { ...result, list: result.list.map((item) => ({ ...item })) }
}
const reload = () => table.value?.reload().catch(() => undefined)
</script>
<style src="../../views/leave/style.css"></style>
