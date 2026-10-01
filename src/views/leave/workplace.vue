<template>
  <main class="leave-page" data-testid="leave-workplace">
    <div class="leave-header">
      <div>
        <p>
          {{
            user.tenants.find((item) => item.tenantId === user.tenantId)?.name
          }}
        </p>
        <h1>{{ user.name }}，欢迎回来</h1>
      </div>
      <RouterLink to="/message/center">查看站内消息</RouterLink>
    </div>
    <a-alert v-if="error" type="error" :title="error" class="leave-alert" />
    <section class="leave-panel">
      <h2>常用入口</h2>
      <a-space wrap>
        <a-button
          v-if="can('leave:create')"
          type="primary"
          data-testid="workplace-create"
          @click="router.push('/leave/requests/new')"
        >
          新建请假申请
        </a-button>
        <a-button
          v-if="can('leave:read:self')"
          @click="router.push('/leave/requests')"
        >
          我的申请（{{ ownedCount }}）
        </a-button>
        <a-button
          v-if="can('application:configure')"
          @click="router.push('/leave/application')"
        >
          配置与发布应用
        </a-button>
        <a-button v-if="can('audit:read')" @click="router.push('/audit/logs')">
          查询服务端审计
        </a-button>
      </a-space>
    </section>
    <section v-if="can('workflow:todo')" class="leave-panel">
      <div class="leave-header">
        <h2>审批待办（{{ todoCount }}）</h2>
        <RouterLink to="/Scalability/workflowCenter">查看更多</RouterLink>
      </div>
      <ProTable
        ref="table"
        :fetch-data="fetchTodos"
        :columns="columns"
        row-key="id"
        :default-page-size="5"
        empty-text="当前没有待处理审批"
      />
    </section>
    <section v-else class="leave-panel">
      <h2>办理提示</h2>
      <p>
        申请提交后，可在申请详情查看当前节点、处理意见和结果。审批结果也会发送到站内消息。
      </p>
    </section>
  </main>
</template>
<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ProTable from '@/components/pro-table/index.vue'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import useUserStore from '@/store/modules/user'
import { fetchLeaveTasks, fetchLeaveRequests } from '@/api/leave'
import { hasPermission } from '@af-admin/workflow-core'
import { errorMessage } from './shared'

const user = useUserStore()
const router = useRouter()
const table = ref<ProTableExpose>()
const ownedCount = ref(0)
const todoCount = ref(0)
const error = ref('')
const can = (permission: string) => hasPermission(user.permissions, permission)
const columns = [
  { title: '申请人', dataIndex: 'applicantName' },
  { title: '节点', dataIndex: 'nodeName' },
  {
    title: '操作',
    render: ({ record }: { record: Record<string, unknown> }) =>
      h(
        RouterLink,
        {
          to: `/leave/requests/${encodeURIComponent(String(record.requestId))}`,
        },
        () => '查看并处理'
      ),
  },
]
const fetchTodos = async ({ current, pageSize }: ProTableFetchParams) => {
  const result = await fetchLeaveTasks({ current, pageSize })
  todoCount.value = result.total
  return { ...result, list: result.list.map((item) => ({ ...item })) }
}
onMounted(async () => {
  if (can('leave:read:self')) {
    try {
      ownedCount.value = (
        await fetchLeaveRequests({ current: 1, pageSize: 1 })
      ).total
    } catch (failure) {
      error.value = errorMessage(failure)
    }
  }
})
</script>
<style src="./style.css"></style>
