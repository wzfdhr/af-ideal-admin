import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useUserStore } from '@/store'
import {
  archiveReportExport,
  commandReportExport,
  createReportExport,
  downloadReportExport,
  fetchReportExportCapabilities,
  fetchReportExports,
  getReportExport,
} from '@/api/reporting-exports'
import { getReportingVersionCatalogue } from '@/api/reporting'
import { createCommandRetry } from '@/services/command-retry'
import { tenantScope } from '@/services/tenant-context'
import { hasPermission } from '@/services/ui-permissions'
import { errorMessage } from '@/views/leave/shared'
import {
  REPORT_EXPORT_MAX_FILE_BYTES,
  REPORT_EXPORT_PERMISSIONS as P,
  REPORTING_PERMISSIONS,
  parseReportExportCreate,
  parseReportingQuery,
} from '@af-admin/contracts'
import type {
  ReportExportFormat,
  ReportingDefinitionVersion,
  ReportingExportCapability,
  ReportingExportJob,
  ReportingExportStatus,
  ReportingFieldReference,
  ReportingQueryV1,
} from '@af-admin/contracts'

const keyOf = (field: ReportingFieldReference) => `${field.kind}:${field.id}`
const mediaType = (value: string) => value.split(';')[0].trim().toLowerCase()
const actionPermission = {
  cancel: P.cancel,
  retry: P.retry,
  archive: P.archive,
  unarchive: P.archive,
  download: P.download,
}
export const saveExportBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = Array.from(fileName)
    .map((character) =>
      character.charCodeAt(0) < 32 || ['/', '\\'].includes(character)
        ? '_'
        : character
    )
    .join('')
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const useReportExportState = () => {
  const user = useUserStore()
  const jobs = ref<ReportingExportJob[]>([])
  const selected = ref<ReportingExportJob>()
  const capabilities = ref<ReportingExportCapability[]>([])
  const format = ref<ReportExportFormat>('csv')
  const currentPage = ref(1)
  const total = ref(0)
  const pageSize = 20
  const keyword = ref('')
  const status = ref<ReportingExportStatus | ''>('')
  const archived = ref<'all' | 'active' | 'archived'>('active')
  const loading = ref(false)
  const capabilityLoading = ref(false)
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  const retry = createCommandRetry()
  let generation = 0
  let listSequence = 0
  let detailSequence = 0
  let poll: ReturnType<typeof setInterval> | undefined
  const allowed = (permission: string) =>
    hasPermission(user.permissions, permission)
  const ticket = () => {
    const value = generation
    const scope = tenantScope.snapshot()
    return () => value === generation && tenantScope.isCurrent(scope)
  }
  const canCreate = computed(
    () => allowed(P.create) && allowed(REPORTING_PERMISSIONS.query)
  )
  const availableFormat = computed(() =>
    capabilities.value.find((item) => item.format === format.value)
  )
  const canAction = (
    job: ReportingExportJob,
    action: ReportingExportJob['allowedActions'][number]
  ) =>
    allowed(actionPermission[action]) &&
    job.allowedActions.includes(action) &&
    (action !== 'download' ||
      (allowed(REPORTING_PERMISSIONS.query) &&
        job.status === 'completed' &&
        !job.restricted &&
        job.artifact?.status === 'ready'))
  const apply = (job: ReportingExportJob) => {
    selected.value = job
    jobs.value = jobs.value.map((item) => (item.id === job.id ? job : item))
  }
  const loadCapabilities = async () => {
    capabilities.value = []
    if (!canCreate.value) return
    const current = ticket()
    capabilityLoading.value = true
    try {
      const result = await fetchReportExportCapabilities()
      if (current()) capabilities.value = result.formats
    } catch (failure) {
      if (current()) error.value = errorMessage(failure)
    } finally {
      if (current()) capabilityLoading.value = false
    }
  }
  const load = async (quiet = false) => {
    if (!allowed(P.list)) return
    const current = ticket()
    const sequence = ++listSequence
    if (!quiet) {
      loading.value = true
      error.value = ''
    }
    try {
      const result = await fetchReportExports({
        current: currentPage.value,
        pageSize,
        keyword: keyword.value,
        status: status.value,
        archived: archived.value,
      })
      if (!current() || sequence !== listSequence) return
      jobs.value = result.list
      total.value = result.total
      if (selected.value) {
        const projected = jobs.value.find(
          (item) => item.id === selected.value?.id
        )
        // A fresh projection replaces all prior sensitive fields immediately.
        if (projected) selected.value = projected
        else selected.value = undefined
      }
    } catch (failure) {
      if (current() && sequence === listSequence) {
        jobs.value = []
        selected.value = undefined
        total.value = 0
        error.value = errorMessage(failure)
      }
    } finally {
      if (current() && sequence === listSequence) loading.value = false
    }
  }
  const inspect = async (id: string) => {
    if (!allowed(P.list)) return
    const current = ticket()
    const sequence = ++detailSequence
    selected.value = undefined
    try {
      const job = await getReportExport(id)
      if (current() && sequence === detailSequence) apply(job)
    } catch (failure) {
      if (current() && sequence === detailSequence)
        error.value = errorMessage(failure)
    }
  }
  const create = async (
    version: ReportingDefinitionVersion,
    query: ReportingQueryV1
  ) => {
    if (busy.value || !canCreate.value || !availableFormat.value?.available)
      return
    const current = ticket()
    const fixedVersion: ReportingDefinitionVersion = JSON.parse(
      JSON.stringify(version)
    )
    const fixedQuery: ReportingQueryV1 = JSON.parse(JSON.stringify(query))
    const fixedFormat = format.value
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      const catalogue = await getReportingVersionCatalogue(fixedVersion.id)
      if (!current()) return
      const visible = catalogue.visibleFields.filter((field) =>
        fixedVersion.schema.fields.some(
          (chosen) => keyOf(chosen) === keyOf(field.reference)
        )
      )
      const lookup = (field: ReportingFieldReference) =>
        visible.find((item) => keyOf(item.reference) === keyOf(field))
      if (
        !lookup(fixedQuery.sort.field)?.sortable ||
        fixedQuery.searchFields.some((field) => !lookup(field)?.searchable)
      )
        throw new Error(
          '导出筛选字段当前不可用或未授权。筛选输入已保留，请重新查询并调整字段。'
        )
      const input = parseReportExportCreate({
        definitionVersionId: fixedVersion.id,
        query: parseReportingQuery(
          { ...fixedQuery, current: 1 },
          fixedVersion.schema
        ),
        format: fixedFormat,
      })
      const job = await createReportExport(input, retry.key('create', input))
      if (!current()) return
      retry.complete('create')
      selected.value = job
      notice.value = `服务器已创建 ${job.format.toUpperCase()} 导出任务 ${
        job.id
      }；完成并通过扫描后可下载。`
      currentPage.value = 1
      if (allowed(P.list)) await load()
    } catch (failure) {
      if (current()) error.value = errorMessage(failure)
    } finally {
      if (current()) busy.value = false
    }
  }
  const command = async (
    job: ReportingExportJob,
    action: 'cancel' | 'retry' | 'archive' | 'unarchive'
  ) => {
    if (busy.value || !canAction(job, action)) return
    const current = ticket()
    const operation = `${action}:${job.id}`
    busy.value = true
    error.value = ''
    notice.value = ''
    const input = { expectedRevision: job.revision, action }
    try {
      const key = retry.key(operation, input)
      const result =
        action === 'archive' || action === 'unarchive'
          ? await archiveReportExport(job, action === 'archive', key)
          : await commandReportExport(job, action, key)
      if (!current()) return
      retry.complete(operation)
      apply(result)
      notice.value = '任务状态已由服务器更新。'
      await load()
    } catch (failure) {
      if (current()) {
        error.value = errorMessage(failure)
        // Includes optimistic conflicts and authorization changes. Refresh facts
        // without replaying the command or replacing the user's list filters.
        await inspect(job.id)
      }
    } finally {
      if (current()) busy.value = false
    }
  }
  const download = async (job: ReportingExportJob) => {
    if (busy.value || !canAction(job, 'download')) return
    const current = ticket()
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      const fresh = await getReportExport(job.id)
      if (!current()) return
      apply(fresh)
      if (!canAction(fresh, 'download'))
        throw new Error('当前权限或文件状态已变化，下载不可用。')
      const { artifact } = fresh
      if (!artifact) throw new Error('服务器未提供可用导出文件。')
      const content = await downloadReportExport(job.id)
      if (!current()) return
      if (
        !mediaType(content.mimeType) ||
        mediaType(content.mimeType) !== mediaType(artifact.mimeType) ||
        content.blob.size !== artifact.size ||
        content.blob.size > REPORT_EXPORT_MAX_FILE_BYTES
      )
        throw new Error('下载文件与服务器文件记录不符，未保存文件。')
      const digest = await crypto.subtle.digest(
        'SHA-256',
        await content.blob.arrayBuffer()
      )
      if (!current()) return
      const sha256 = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
      if (sha256 !== artifact.sha256)
        throw new Error('下载文件摘要校验失败，未保存文件。')
      saveExportBlob(content.blob, artifact.fileName)
      notice.value = `已下载并校验 ${artifact.fileName}，${artifact.size} 字节。`
    } catch (failure) {
      if (current()) {
        selected.value = undefined
        jobs.value = jobs.value.filter((item) => item.id !== job.id)
        error.value = errorMessage(failure)
      }
    } finally {
      if (current()) busy.value = false
    }
  }
  const search = () => {
    currentPage.value = 1
    load()
  }
  const changePage = (delta: number) => {
    currentPage.value += delta
    load()
  }
  watch(
    () => [user.id, user.tenantId, user.availablePermissions.join('|')],
    (value, before) => {
      generation += 1
      listSequence += 1
      detailSequence += 1
      retry.clear()
      jobs.value = []
      selected.value = undefined
      total.value = 0
      capabilities.value = []
      error.value = ''
      notice.value = ''
      busy.value = false
      loading.value = false
      capabilityLoading.value = false
      if (value[0] !== before[0] || value[1] !== before[1]) {
        keyword.value = ''
        status.value = ''
        archived.value = 'active'
        currentPage.value = 1
      }
      loadCapabilities()
      load()
    },
    { flush: 'sync' }
  )
  onMounted(() => {
    loadCapabilities()
    load()
    poll = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        !busy.value &&
        !loading.value &&
        jobs.value.some((job) => ['queued', 'processing'].includes(job.status))
      )
        load(true)
    }, 5000)
  })
  onUnmounted(() => {
    generation += 1
    retry.clear()
    if (poll) clearInterval(poll)
  })
  return {
    P,
    jobs,
    selected,
    capabilities,
    format,
    currentPage,
    pageSize,
    total,
    keyword,
    status,
    archived,
    loading,
    capabilityLoading,
    busy,
    error,
    notice,
    allowed,
    canCreate,
    availableFormat,
    canAction,
    load,
    loadCapabilities,
    inspect,
    create,
    command,
    download,
    search,
    changePage,
  }
}
export type ReportExportState = ReturnType<typeof useReportExportState>
export default useReportExportState
