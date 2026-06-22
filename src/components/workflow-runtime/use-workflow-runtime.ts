import { getCurrentInstance, onMounted, ref } from 'vue'
import {
  approveWorkflowTask,
  fetchWorkflowDefinitions,
  fetchWorkflowDone,
  fetchWorkflowHistory,
  fetchWorkflowTodos,
  rejectWorkflowTask,
  startWorkflowInstance,
  transferWorkflowTask,
  withdrawWorkflowInstance,
  type WorkflowDefinitionRecord,
  type WorkflowHistoryRecord,
  type WorkflowInstanceRecord,
  type WorkflowTaskRecord,
} from '@/api/workflow'

const DEFAULT_START_PAYLOAD = {
  businessKey: 'mock-business-001',
  formId: 'form-leave',
  values: {
    days: 2,
    reason: 'Mock 流程发起',
  },
}

export const useWorkflowRuntime = () => {
  const actionMessage = ref('')
  const currentInstance = ref<WorkflowInstanceRecord>()
  const definitions = ref<WorkflowDefinitionRecord[]>([])
  const doneTasks = ref<WorkflowTaskRecord[]>([])
  const history = ref<WorkflowHistoryRecord[]>([])
  const loading = ref(false)
  const selectedWorkflowId = ref('')
  const todos = ref<WorkflowTaskRecord[]>([])

  const loadDefinitions = async () => {
    const result = await fetchWorkflowDefinitions({
      current: 1,
      pageSize: 20,
      status: 'published',
    })
    definitions.value = result.list

    if (!selectedWorkflowId.value && result.list.length > 0) {
      selectedWorkflowId.value = result.list[0].id
    }
  }

  const loadTodos = async () => {
    const result = await fetchWorkflowTodos({
      current: 1,
      pageSize: 20,
    })
    todos.value = result.list
  }

  const loadDone = async () => {
    const result = await fetchWorkflowDone({
      current: 1,
      pageSize: 20,
    })
    doneTasks.value = result.list
  }

  const loadHistory = async (instanceId: string) => {
    history.value = await fetchWorkflowHistory(instanceId)
  }

  const refreshTasks = async () => {
    await Promise.all([loadTodos(), loadDone()])
  }

  const loadInitialData = async () => {
    loading.value = true
    try {
      await loadDefinitions()
      await refreshTasks()
    } finally {
      loading.value = false
    }
  }

  const startSelectedWorkflow = async () => {
    if (!selectedWorkflowId.value) {
      actionMessage.value = '请选择流程'
      return
    }

    const instance = await startWorkflowInstance(
      selectedWorkflowId.value,
      DEFAULT_START_PAYLOAD
    )
    currentInstance.value = instance
    actionMessage.value = '流程已发起'
    await Promise.all([refreshTasks(), loadHistory(instance.id)])
  }

  const approveTask = async (task: WorkflowTaskRecord) => {
    await approveWorkflowTask(task.id, {
      comment: '同意',
    })
    actionMessage.value = '审批通过'
    await Promise.all([refreshTasks(), loadHistory(task.instanceId)])
  }

  const rejectTask = async (task: WorkflowTaskRecord) => {
    await rejectWorkflowTask(task.id, {
      comment: '驳回',
    })
    actionMessage.value = '已驳回'
    await Promise.all([refreshTasks(), loadHistory(task.instanceId)])
  }

  const transferTask = async (task: WorkflowTaskRecord, targetUserId = '2') => {
    await transferWorkflowTask(task.id, {
      targetUserId,
      comment: '转交',
    })
    actionMessage.value = '已转交'
    await Promise.all([refreshTasks(), loadHistory(task.instanceId)])
  }

  const withdrawCurrentInstance = async () => {
    if (!currentInstance.value) {
      actionMessage.value = '暂无可撤回流程'
      return
    }

    const instance = await withdrawWorkflowInstance(currentInstance.value.id, {
      comment: '撤回',
    })
    currentInstance.value = instance
    actionMessage.value = '流程已撤回'
    await Promise.all([refreshTasks(), loadHistory(instance.id)])
  }

  const viewHistory = async (instanceId: string) => {
    await loadHistory(instanceId)
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      loadInitialData()
    })
  }

  return {
    actionMessage,
    approveTask,
    currentInstance,
    definitions,
    doneTasks,
    history,
    loadDone,
    loadHistory,
    loadInitialData,
    loading,
    loadTodos,
    rejectTask,
    refreshTasks,
    selectedWorkflowId,
    startSelectedWorkflow,
    todos,
    transferTask,
    viewHistory,
    withdrawCurrentInstance,
  }
}

export default useWorkflowRuntime
