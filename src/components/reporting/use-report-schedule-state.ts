import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useUserStore } from '@/store'
import { ApiRequestError } from '@/api/request-client'
import {
  commandReportScheduleRun,
  fetchReportScheduleRecipientOptions,
  fetchReportScheduleRuns,
  fetchReportSchedules,
  getReportSchedule,
  getReportScheduleRun,
  previewReportSchedule,
  saveReportSchedule,
  setReportScheduleEnabled,
} from '@/api/reporting-schedules'
import { fetchPublishedReportingDefinitions } from '@/api/reporting'
import { fetchReportExportCapabilities } from '@/api/reporting-exports'
import { createCommandRetry } from '@/services/command-retry'
import { confirmR1Action } from '@/services/r1-confirm'
import { registerDirtyCheck, tenantScope } from '@/services/tenant-context'
import { hasPermission } from '@/services/ui-permissions'
import { errorMessage } from '@/views/leave/shared'
import {
  REPORT_EXPORT_PERMISSIONS as EP,
  REPORTING_PERMISSIONS as RP,
  REPORT_SCHEDULE_PERMISSIONS as P,
  parseReportScheduleDefinition,
} from '@af-admin/contracts'
import type {
  ReportSchedule,
  ReportScheduleDefinitionV1,
  ReportScheduleRun,
  ReportScheduleRunStatus,
  ReportScheduleTiming,
  ReportScheduleWindow,
  ReportExportFormat,
  ReportingDefinitionVersion,
  ReportingExportCapability,
  ReportSchedulePreview,
  ReportScheduleRecipientOptions,
} from '@af-admin/contracts'

interface ScheduleDraft {
  name: string
  definitionVersionId: string
  frequency: ReportScheduleTiming['frequency']
  timeZone: string
  time: string
  weekday: number
  dayOfMonth: number
  dataWindow: ReportScheduleWindow
  recipientKind: 'tenant' | 'role' | 'department'
  roleId: string
  departmentId: string
  format: ReportExportFormat
}
const emptyDraft = (): ScheduleDraft => ({
  name: '',
  definitionVersionId: '',
  frequency: 'daily',
  timeZone: 'Asia/Shanghai',
  time: '09:00',
  weekday: 1,
  dayOfMonth: 1,
  dataWindow: 'previous-period',
  recipientKind: 'tenant',
  roleId: '',
  departmentId: '',
  format: 'csv',
})
const fromSchema = (schema: ReportScheduleDefinitionV1): ScheduleDraft => ({
  name: schema.name,
  definitionVersionId: schema.definitionVersionId,
  frequency: schema.timing.frequency,
  timeZone: schema.timing.timeZone,
  time: schema.timing.time,
  weekday: schema.timing.frequency === 'weekly' ? schema.timing.weekday : 1,
  dayOfMonth:
    schema.timing.frequency === 'monthly' ? schema.timing.dayOfMonth : 1,
  dataWindow: schema.dataWindow,
  recipientKind: schema.recipients.kind,
  roleId: schema.recipients.kind === 'role' ? schema.recipients.roleId : '',
  departmentId:
    schema.recipients.kind === 'department'
      ? schema.recipients.departmentId
      : '',
  format: schema.format,
})

export const useReportScheduleState = () => {
  const user = useUserStore()
  const schedules = ref<ReportSchedule[]>([])
  const selected = ref<ReportSchedule>()
  const editingId = ref('')
  const editorOpen = ref(false)
  const draft = ref(emptyDraft())
  const enabledOnCreate = ref(false)
  const baseline = ref(JSON.stringify(draft.value))
  const dirty = computed(
    () => editorOpen.value && baseline.value !== JSON.stringify(draft.value)
  )
  const schedulePage = ref(1)
  const scheduleTotal = ref(0)
  const scheduleKeyword = ref('')
  const scheduleStatus = ref<'' | 'enabled' | 'disabled'>('')
  const scheduleFrequency = ref<'' | 'daily' | 'weekly' | 'monthly'>('')
  const reports = ref<ReportingDefinitionVersion[]>([])
  const reportPage = ref(1)
  const reportTotal = ref(0)
  const reportKeyword = ref('')
  const options = ref<ReportScheduleRecipientOptions>()
  const capabilities = ref<ReportingExportCapability[]>([])
  const preview = ref<ReportSchedulePreview>()
  const runs = ref<ReportScheduleRun[]>([])
  const selectedRun = ref<ReportScheduleRun>()
  const runPage = ref(1)
  const runTotal = ref(0)
  const runScheduleId = ref('')
  const runStatus = ref<ReportScheduleRunStatus | ''>('')
  const loading = ref(false)
  const directoryLoading = ref(false)
  const runLoading = ref(false)
  const detailLoading = ref(false)
  const previewing = ref(false)
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  const retry = createCommandRetry()
  let generation = 0
  let scheduleSequence = 0
  let runSequence = 0
  let directorySequence = 0
  let detailSequence = 0
  let previewSequence = 0
  let runDetailSequence = 0
  let poll: ReturnType<typeof setInterval> | undefined
  const allowed = (permission: string) =>
    hasPermission(user.permissions, permission)
  const ticket = () => {
    const value = generation
    const scope = tenantScope.snapshot()
    return () => value === generation && tenantScope.isCurrent(scope)
  }
  const canAuthor = computed(
    () =>
      allowed(EP.create) &&
      allowed(RP.query) &&
      (allowed(P.create) || allowed(P.update))
  )
  const canEdit = computed(
    () =>
      canAuthor.value &&
      (editingId.value
        ? !!selected.value &&
          allowed(P.update) &&
          selected.value.allowedActions.includes('update')
        : allowed(P.create))
  )
  const chosenReport = computed(() =>
    reports.value.find(
      (report) => report.id === draft.value.definitionVersionId
    )
  )
  const chosenFormat = computed(() =>
    capabilities.value.find(
      (capability) => capability.format === draft.value.format
    )
  )
  const canToggle = (schedule: ReportSchedule) =>
    allowed(P.toggle) && schedule.allowedActions.includes('toggle')
  const canRunAction = (run: ReportScheduleRun, action: 'retry' | 'cancel') =>
    allowed(action === 'retry' ? P.retry : P.cancel) &&
    run.allowedActions.includes(action)
  const schema = () => {
    const { value } = draft
    if (
      chosenReport.value &&
      value.timeZone !== chosenReport.value.schema.timeZone
    )
      throw new Error('定时规则时区必须与固定报表版本相同。')
    return parseReportScheduleDefinition({
      version: 1,
      name: value.name,
      definitionVersionId: value.definitionVersionId,
      timing: {
        frequency: value.frequency,
        timeZone: value.timeZone,
        time: value.time,
        ...(value.frequency === 'weekly' ? { weekday: value.weekday } : {}),
        ...(value.frequency === 'monthly'
          ? { dayOfMonth: value.dayOfMonth }
          : {}),
      },
      dataWindow: value.dataWindow,
      recipients: {
        kind: value.recipientKind,
        ...(value.recipientKind === 'role' ? { roleId: value.roleId } : {}),
        ...(value.recipientKind === 'department'
          ? { departmentId: value.departmentId }
          : {}),
      },
      format: value.format,
    })
  }
  const applySchedule = (schedule: ReportSchedule) => {
    selected.value = schedule
    editingId.value = schedule.id
    draft.value = fromSchema(schedule.schema)
    baseline.value = JSON.stringify(draft.value)
    enabledOnCreate.value = schedule.enabled
    editorOpen.value = true
    preview.value = undefined
    schedules.value = schedules.value.map((item) =>
      item.id === schedule.id ? schedule : item
    )
  }
  const loadSchedules = async () => {
    if (!allowed(P.list)) return
    const current = ticket()
    const sequence = ++scheduleSequence
    loading.value = true
    try {
      const result = await fetchReportSchedules({
        current: schedulePage.value,
        pageSize: 20,
        keyword: scheduleKeyword.value,
        status: scheduleStatus.value,
        frequency: scheduleFrequency.value,
      })
      if (!current() || sequence !== scheduleSequence) return
      schedules.value = result.list
      scheduleTotal.value = result.total
    } catch (failure) {
      if (current() && sequence === scheduleSequence) {
        schedules.value = []
        error.value = errorMessage(failure)
      }
    } finally {
      if (current() && sequence === scheduleSequence) loading.value = false
    }
  }
  const loadRuns = async (quiet = false) => {
    if (!allowed(P.runRead)) return
    const current = ticket()
    const sequence = ++runSequence
    if (!quiet) runLoading.value = true
    try {
      const result = await fetchReportScheduleRuns({
        current: runPage.value,
        pageSize: 20,
        scheduleId: runScheduleId.value,
        status: runStatus.value,
      })
      if (!current() || sequence !== runSequence) return
      runs.value = result.list
      runTotal.value = result.total
      if (selectedRun.value) {
        const { id } = selectedRun.value
        const detail = runDetailSequence
        selectedRun.value = undefined
        const fresh = await getReportScheduleRun(id)
        if (
          current() &&
          sequence === runSequence &&
          detail === runDetailSequence
        )
          selectedRun.value = fresh
      }
    } catch (failure) {
      if (current() && sequence === runSequence) {
        runs.value = []
        selectedRun.value = undefined
        error.value = errorMessage(failure)
      }
    } finally {
      if (current() && sequence === runSequence) runLoading.value = false
    }
  }
  const loadDirectories = async () => {
    reports.value = []
    options.value = undefined
    capabilities.value = []
    if (
      !canAuthor.value ||
      (editingId.value ? !allowed(P.update) : !allowed(P.create))
    )
      return
    const current = ticket()
    const sequence = ++directorySequence
    directoryLoading.value = true
    try {
      const [library, recipients, formats] = await Promise.all([
        fetchPublishedReportingDefinitions({
          current: reportPage.value,
          pageSize: 20,
          keyword: reportKeyword.value,
        }),
        fetchReportScheduleRecipientOptions(
          editingId.value ? 'update' : 'create',
          editingId.value || undefined
        ),
        fetchReportExportCapabilities(),
      ])
      if (!current() || sequence !== directorySequence) return
      reports.value = library.list
      reportTotal.value = library.total
      options.value = recipients
      capabilities.value = formats.formats
    } catch (failure) {
      if (current() && sequence === directorySequence)
        error.value = errorMessage(failure)
    } finally {
      if (current() && sequence === directorySequence)
        directoryLoading.value = false
    }
  }
  const reload = () => {
    error.value = ''
    loadSchedules()
    loadRuns()
    loadDirectories()
  }
  const edit = async (id: string) => {
    if (!allowed(P.list) || busy.value) return
    const current = ticket()
    if (
      dirty.value &&
      !(await confirmR1Action('当前定时规则有未保存修改，确认切换配置？'))
    )
      return
    if (!current()) return
    const sequence = ++detailSequence
    detailLoading.value = true
    try {
      const record = await getReportSchedule(id)
      if (current() && sequence === detailSequence) {
        applySchedule(record)
        await loadDirectories()
      }
    } catch (failure) {
      if (current() && sequence === detailSequence)
        error.value = errorMessage(failure)
    } finally {
      if (current() && sequence === detailSequence) detailLoading.value = false
    }
  }
  const newSchedule = async () => {
    if (!allowed(P.create) || !canAuthor.value || busy.value) return
    const current = ticket()
    if (
      dirty.value &&
      !(await confirmR1Action('当前定时规则有未保存修改，确认新增配置？'))
    )
      return
    if (!current()) return
    selected.value = undefined
    editingId.value = ''
    draft.value = emptyDraft()
    enabledOnCreate.value = false
    baseline.value = JSON.stringify(draft.value)
    editorOpen.value = true
    preview.value = undefined
    error.value = ''
    loadDirectories()
  }
  const chooseReport = (id: string) => {
    const report = reports.value.find((item) => item.id === id)
    if (report) {
      draft.value.definitionVersionId = id
      draft.value.timeZone = report.schema.timeZone
    }
  }
  const previewSchedule = async () => {
    if (!canEdit.value || previewing.value || busy.value) return
    const current = ticket()
    const sequence = ++previewSequence
    previewing.value = true
    preview.value = undefined
    error.value = ''
    try {
      if (!chosenFormat.value?.available)
        throw new Error('当前导出格式不可用，请重新读取服务器目录。')
      const input = schema()
      const result = await previewReportSchedule(input, selected.value?.id)
      if (current() && sequence === previewSequence) preview.value = result
    } catch (failure) {
      if (current() && sequence === previewSequence)
        error.value = errorMessage(failure)
    } finally {
      if (current() && sequence === previewSequence) previewing.value = false
    }
  }
  const save = async () => {
    if (!canEdit.value || busy.value) return
    const current = ticket()
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      if (!chosenFormat.value?.available)
        throw new Error('当前导出格式不可用。输入已保留。')
      const input = schema()
      const record = selected.value
      const operation = record ? `save:${record.id}` : 'create'
      const body = {
        schema: input,
        ...(record
          ? { expectedRevision: record.revision }
          : { enabled: enabledOnCreate.value }),
      }
      const result = await saveReportSchedule(
        input,
        enabledOnCreate.value,
        retry.key(operation, body),
        record
      )
      if (!current()) return
      retry.complete(operation)
      applySchedule(result)
      notice.value = '规则已由服务器保存并固定为新版本。'
      await loadSchedules()
    } catch (failure) {
      if (current()) {
        error.value = errorMessage(failure)
        const record = selected.value
        if (
          record &&
          failure instanceof ApiRequestError &&
          failure.context.httpStatus === 409
        ) {
          try {
            const fresh = await getReportSchedule(record.id)
            if (current()) {
              selected.value = fresh
              schedules.value = schedules.value.map((item) =>
                item.id === fresh.id ? fresh : item
              )
            }
          } catch {
            if (current()) selected.value = undefined
          }
        }
      }
    } finally {
      if (current()) busy.value = false
    }
  }
  const toggle = async (schedule: ReportSchedule) => {
    if (
      busy.value ||
      !canToggle(schedule) ||
      (selected.value?.id === schedule.id && dirty.value)
    )
      return
    const current = ticket()
    busy.value = true
    error.value = ''
    try {
      const body = {
        enabled: !schedule.enabled,
        expectedRevision: schedule.revision,
      }
      const operation = `toggle:${schedule.id}`
      const result = await setReportScheduleEnabled(
        schedule,
        !schedule.enabled,
        retry.key(operation, body)
      )
      if (!current()) return
      retry.complete(operation)
      schedules.value = schedules.value.map((item) =>
        item.id === result.id ? result : item
      )
      if (selected.value?.id === result.id) applySchedule(result)
      notice.value = result.enabled
        ? '已从服务器当前时刻后的下一个有效时段启用。'
        : '已关闭后续启用区间；已到期计划及已生成任务仍保留。'
      await loadSchedules()
    } catch (failure) {
      if (current()) {
        error.value = errorMessage(failure)
        await loadSchedules()
      }
    } finally {
      if (current()) busy.value = false
    }
  }
  const inspectRun = async (id: string) => {
    if (!allowed(P.runRead)) return
    const current = ticket()
    const sequence = ++runDetailSequence
    selectedRun.value = undefined
    try {
      const result = await getReportScheduleRun(id)
      if (current() && sequence === runDetailSequence)
        selectedRun.value = result
    } catch (failure) {
      if (current() && sequence === runDetailSequence)
        error.value = errorMessage(failure)
    }
  }
  const clearRunSelection = () => {
    runDetailSequence += 1
    selectedRun.value = undefined
  }
  const commandRun = async (
    run: ReportScheduleRun,
    action: 'retry' | 'cancel'
  ) => {
    if (busy.value || !canRunAction(run, action)) return
    const current = ticket()
    busy.value = true
    error.value = ''
    try {
      const operation = `${action}:${run.id}`
      const result = await commandReportScheduleRun(
        run,
        action,
        retry.key(operation, { expectedRevision: run.revision })
      )
      if (!current()) return
      retry.complete(operation)
      selectedRun.value = result
      notice.value = '服务器已更新运行状态，原版本和收件身份保持固定。'
      await loadRuns()
    } catch (failure) {
      if (current()) {
        error.value = errorMessage(failure)
        await inspectRun(run.id)
      }
    } finally {
      if (current()) busy.value = false
    }
  }
  const searchSchedules = () => {
    schedulePage.value = 1
    loadSchedules()
  }
  const changeSchedulePage = (delta: number) => {
    schedulePage.value += delta
    loadSchedules()
  }
  const searchReports = () => {
    reportPage.value = 1
    loadDirectories()
  }
  const changeReportPage = (delta: number) => {
    reportPage.value += delta
    loadDirectories()
  }
  const searchRuns = () => {
    runPage.value = 1
    loadRuns()
  }
  const changeRunPage = (delta: number) => {
    runPage.value += delta
    loadRuns()
  }
  watch(
    draft,
    () => {
      previewSequence += 1
      preview.value = undefined
      previewing.value = false
    },
    { deep: true, flush: 'sync' }
  )
  watch(
    () => [user.id, user.tenantId, user.availablePermissions.join('|')],
    (value, before) => {
      generation += 1
      retry.clear()
      schedules.value = []
      selected.value = undefined
      reports.value = []
      options.value = undefined
      capabilities.value = []
      runs.value = []
      selectedRun.value = undefined
      preview.value = undefined
      loading.value = false
      directoryLoading.value = false
      runLoading.value = false
      detailLoading.value = false
      previewing.value = false
      busy.value = false
      scheduleTotal.value = 0
      runTotal.value = 0
      reportTotal.value = 0
      error.value = ''
      notice.value = ''
      if (value[0] !== before[0] || value[1] !== before[1]) {
        editorOpen.value = false
        editingId.value = ''
        draft.value = emptyDraft()
        baseline.value = JSON.stringify(draft.value)
        scheduleKeyword.value = ''
        scheduleStatus.value = ''
        scheduleFrequency.value = ''
        reportKeyword.value = ''
        runScheduleId.value = ''
        runStatus.value = ''
        schedulePage.value = 1
        reportPage.value = 1
        runPage.value = 1
      }
      reload()
    },
    { flush: 'sync' }
  )
  const unregister = registerDirtyCheck(() => dirty.value)
  onBeforeRouteLeave(
    () => !dirty.value || confirmR1Action('定时规则有未保存输入，确认离开？')
  )
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty.value) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', beforeUnload)
  onMounted(() => {
    reload()
    poll = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        !busy.value &&
        !runLoading.value
      )
        loadRuns(true)
    }, 5000)
  })
  onUnmounted(() => {
    generation += 1
    retry.clear()
    unregister()
    window.removeEventListener('beforeunload', beforeUnload)
    if (poll) clearInterval(poll)
  })
  return {
    P,
    user,
    schedules,
    selected,
    editorOpen,
    draft,
    enabledOnCreate,
    dirty,
    schedulePage,
    scheduleTotal,
    scheduleKeyword,
    scheduleStatus,
    scheduleFrequency,
    reports,
    reportPage,
    reportTotal,
    reportKeyword,
    options,
    capabilities,
    preview,
    runs,
    selectedRun,
    runPage,
    runTotal,
    runScheduleId,
    runStatus,
    loading,
    directoryLoading,
    runLoading,
    detailLoading,
    previewing,
    busy,
    error,
    notice,
    allowed,
    canAuthor,
    canEdit,
    chosenReport,
    chosenFormat,
    canToggle,
    canRunAction,
    loadSchedules,
    loadRuns,
    loadDirectories,
    reload,
    edit,
    newSchedule,
    chooseReport,
    previewSchedule,
    save,
    toggle,
    inspectRun,
    clearRunSelection,
    commandRun,
    searchSchedules,
    changeSchedulePage,
    searchReports,
    changeReportPage,
    searchRuns,
    changeRunPage,
  }
}
export type ReportScheduleState = ReturnType<typeof useReportScheduleState>
export default useReportScheduleState
