<template>
  <div class="workflow-runtime">
    <a-layout class="runtime-layout">
      <a-layout-sider :width="288" class="runtime-panel">
        <section class="runtime-section">
          <h2>流程发起</h2>
          <p>选择已发布流程，使用 Mock 表单数据发起实例。</p>
          <a-select
            v-model="selectedWorkflowId"
            class="w-full"
            data-testid="workflow-runtime-definition"
          >
            <a-option
              v-for="definition in definitions"
              :key="definition.id"
              :value="definition.id"
            >
              {{ definition.name }}
            </a-option>
          </a-select>
          <a-button
            type="primary"
            long
            class="mt-3"
            data-testid="workflow-runtime-start"
            @click="startSelectedWorkflow"
          >
            发起流程
          </a-button>
          <a-button long class="mt-2" @click="withdrawCurrentInstance">
            撤回当前实例
          </a-button>
          <div v-if="currentInstance" class="current-instance">
            当前实例：{{ currentInstance.businessKey || currentInstance.id }}
          </div>
          <div v-if="actionMessage" class="runtime-message">
            {{ actionMessage }}
          </div>
        </section>
      </a-layout-sider>

      <a-layout-content class="runtime-main">
        <section class="runtime-list-section">
          <div class="section-header">
            <h2>我的待办</h2>
            <a-button size="small" @click="loadTodos">刷新</a-button>
          </div>
          <div v-if="todos.length === 0" class="empty-state">暂无待办</div>
          <div
            v-for="task in todos"
            :key="task.id"
            class="task-row"
            data-testid="workflow-runtime-todo"
          >
            <div>
              <strong>{{ task.workflowName }}</strong>
              <span>{{ task.nodeName }}</span>
              <small>{{ task.businessKey || task.instanceId }}</small>
            </div>
            <a-space>
              <a-button
                size="small"
                type="primary"
                data-testid="workflow-runtime-approve"
                @click="approveTask(task)"
              >
                审批
              </a-button>
              <a-button size="small" @click="rejectTask(task)">驳回</a-button>
              <a-button size="small" @click="transferTask(task)">转交</a-button>
              <a-button size="small" @click="viewHistory(task.instanceId)">
                历史
              </a-button>
            </a-space>
          </div>
        </section>

        <section class="runtime-list-section">
          <div class="section-header">
            <h2>我的已办</h2>
            <a-button size="small" @click="loadDone">刷新</a-button>
          </div>
          <div v-if="doneTasks.length === 0" class="empty-state">暂无已办</div>
          <div
            v-for="task in doneTasks"
            :key="task.id"
            class="task-row compact"
            data-testid="workflow-runtime-done"
          >
            <div>
              <strong>{{ task.workflowName }}</strong>
              <span>{{ task.nodeName }}</span>
              <small>{{ task.status }}</small>
            </div>
            <a-button size="small" @click="viewHistory(task.instanceId)">
              查看历史
            </a-button>
          </div>
        </section>
      </a-layout-content>

      <a-layout-sider :width="320" class="runtime-panel right">
        <section class="runtime-section">
          <h2>审批历史</h2>
          <div v-if="history.length === 0" class="empty-state">暂无历史</div>
          <div
            v-for="item in history"
            :key="item.id"
            class="history-row"
            data-testid="workflow-runtime-history"
          >
            <strong>{{ actionText[item.action] || item.action }}</strong>
            <span>操作人：{{ item.operatorId }}</span>
            <small>{{ item.comment || item.createdAt }}</small>
          </div>
        </section>
      </a-layout-sider>
    </a-layout>
  </div>
</template>

<script setup lang="ts">
import { useWorkflowRuntime } from './use-workflow-runtime'

const {
  actionMessage,
  approveTask,
  currentInstance,
  definitions,
  doneTasks,
  history,
  loadDone,
  loadTodos,
  rejectTask,
  selectedWorkflowId,
  startSelectedWorkflow,
  todos,
  transferTask,
  viewHistory,
  withdrawCurrentInstance,
} = useWorkflowRuntime()

const actionText: Record<string, string> = {
  approve: '审批通过',
  reject: '驳回',
  start: '发起',
  transfer: '转交',
  withdraw: '撤回',
}
</script>

<style scoped>
.workflow-runtime {
  width: 100%;
  min-height: calc(100vh - 120px);
}

.runtime-layout {
  min-height: calc(100vh - 120px);
  background: #f7f8fa;
}

.runtime-panel {
  background: #ffffff;
  border-right: 1px solid #e5e6eb;
}

.runtime-panel.right {
  border-right: 0;
  border-left: 1px solid #e5e6eb;
}

.runtime-section {
  padding: 16px;
}

.runtime-section h2,
.runtime-list-section h2 {
  margin: 0;
  color: #1d2129;
  font-size: 16px;
  font-weight: 600;
}

.runtime-section p {
  margin: 8px 0 16px;
  color: #4e5969;
  font-size: 13px;
  line-height: 1.6;
}

.runtime-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 16px;
}

.runtime-list-section {
  min-height: 240px;
  padding: 16px;
  background: #ffffff;
  border: 1px solid #e5e6eb;
}

.section-header,
.task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-header {
  margin-bottom: 12px;
}

.task-row {
  padding: 12px 0;
  border-top: 1px solid #f2f3f5;
}

.task-row:first-of-type {
  border-top: 0;
}

.task-row strong,
.task-row span,
.task-row small,
.history-row strong,
.history-row span,
.history-row small {
  display: block;
}

.task-row strong {
  color: #1d2129;
  font-size: 14px;
}

.task-row span,
.history-row span {
  margin-top: 4px;
  color: #4e5969;
  font-size: 13px;
}

.task-row small,
.history-row small {
  margin-top: 4px;
  color: #86909c;
  font-size: 12px;
}

.history-row {
  padding: 12px 0;
  border-bottom: 1px solid #f2f3f5;
}

.current-instance,
.runtime-message {
  margin-top: 12px;
  font-size: 12px;
}

.current-instance {
  color: #4e5969;
}

.runtime-message {
  color: #00b42a;
}

.empty-state {
  padding: 24px 0;
  color: #86909c;
  font-size: 13px;
  text-align: center;
}
</style>
