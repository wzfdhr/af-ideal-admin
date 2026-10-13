import { computed, onMounted, ref, watch } from 'vue'
import {
  fetchPublishedReportingDefinitions,
  fetchReportingDefinitions,
  fetchReportingSources,
  getReportingDefinition,
  getReportingVersionCatalogue,
  publishReportingDefinition,
  queryReportingVersion,
  saveReportingDefinition,
  setReportingDefinitionEnabled,
} from '@/api/reporting'
import { confirmR1Action } from '@/services/r1-confirm'
import { errorMessage } from '@/views/leave/shared'
import {
  REPORTING_PERMISSIONS as P,
  parseReportingDefinition,
  parseReportingQuery,
} from '@af-admin/contracts'
import { useReportingContext } from './use-reporting-context'
import type {
  ReportingDefinitionRecord,
  ReportingDefinitionV1,
  ReportingDefinitionVersion,
  ReportingFieldReference,
  ReportingKind,
  ReportingQueryResultV1,
  ReportingQueryV1,
  ReportingSourceCatalogue,
  ReportingVisibleField,
} from '@af-admin/contracts'

export const reportingReferenceKey = (field: ReportingFieldReference) =>
  `${field.kind}:${field.id}`
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}
const emptyDefinition = (): ReportingDefinitionV1 => ({
  version: 1,
  name: '',
  source: { kind: 'application-records', applicationId: '' },
  kind: 'trend',
  metric: 'count',
  factTime: 'createdAt',
  timeZone: 'Asia/Shanghai',
  fields: [],
})
const today = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}
const emptyQuery = (): ReportingQueryV1 => {
  const end = today('Asia/Shanghai')
  return {
    version: 1,
    timeZone: 'Asia/Shanghai',
    dateRange: { from: `${end.slice(0, 7)}-01`, to: end },
    statuses: [],
    keyword: '',
    searchFields: [],
    sort: { field: { kind: 'metadata', id: 'createdAt' }, direction: 'desc' },
    current: 1,
    pageSize: 10,
  }
}
const querySignature = (query: ReportingQueryV1) =>
  JSON.stringify({ ...query, current: 1 })

export const useReportingState = () => {
  const definitions = ref<ReportingDefinitionRecord[]>([])
  const definitionPage = ref(1)
  const definitionTotal = ref(0)
  const definitionKeyword = ref('')
  const sources = ref<ReportingSourceCatalogue[]>([])
  const sourcePage = ref(1)
  const sourceTotal = ref(0)
  const sourcePageSize = ref(20)
  const sourceKeyword = ref('')
  const sourceLoading = ref(false)
  const selectedSource = ref<ReportingSourceCatalogue>()
  const sourceLookupLoading = ref(false)
  const selected = ref<ReportingDefinitionRecord>()
  const editorOpen = ref(false)
  const detailLoading = ref(false)
  const draft = ref(emptyDefinition())
  const savedDraft = ref(JSON.stringify(draft.value))
  const templateKind = ref<ReportingKind>('trend')
  const comparisonId = ref('')
  const published = ref<ReportingDefinitionVersion[]>([])
  const publishedPage = ref(1)
  const publishedTotal = ref(0)
  const publishedKeyword = ref('')
  const selectedVersionId = ref('')
  const versionCatalogue = ref<ReportingSourceCatalogue>()
  const queryDraft = ref(emptyQuery())
  const lastQuery = ref<ReportingQueryV1>()
  const queryBaseline = ref(querySignature(queryDraft.value))
  const result = ref<ReportingQueryResultV1>()
  const loading = ref(false)
  const querying = ref(false)
  const draftDirty = computed(
    () => editorOpen.value && savedDraft.value !== JSON.stringify(draft.value)
  )
  const queryDirty = computed(
    () =>
      !!selectedVersionId.value &&
      querySignature(queryDraft.value) !==
        (lastQuery.value
          ? querySignature(lastQuery.value)
          : queryBaseline.value)
  )
  let sourceSequence = 0
  let sourceLookupSequence = 0
  let listSequence = 0
  let librarySequence = 0
  let detailSequence = 0
  let querySequence = 0
  let catalogueSequence = 0
  const { user, error, notice, busy, allowed, ticket, command } =
    useReportingContext(
      () => draftDirty.value || queryDirty.value,
      () => {
        definitions.value = []
        definitionPage.value = 1
        definitionTotal.value = 0
        definitionKeyword.value = ''
        sources.value = []
        sourcePage.value = 1
        sourceTotal.value = 0
        sourcePageSize.value = 20
        sourceKeyword.value = ''
        sourceLoading.value = false
        selectedSource.value = undefined
        sourceLookupLoading.value = false
        sourceLookupSequence += 1
        selected.value = undefined
        editorOpen.value = false
        detailLoading.value = false
        draft.value = emptyDefinition()
        savedDraft.value = JSON.stringify(draft.value)
        comparisonId.value = ''
        published.value = []
        publishedPage.value = 1
        publishedTotal.value = 0
        publishedKeyword.value = ''
        selectedVersionId.value = ''
        versionCatalogue.value = undefined
        queryDraft.value = emptyQuery()
        queryBaseline.value = querySignature(queryDraft.value)
        lastQuery.value = undefined
        result.value = undefined
        querying.value = false
        loading.value = false
        querySequence += 1
        catalogueSequence += 1
        load()
      }
    )
  const canEdit = computed(
    () =>
      !detailLoading.value &&
      !sourceLookupLoading.value &&
      allowed(selected.value ? P.update : P.create)
  )
  const currentSource = computed(() =>
    selectedSource.value?.source.applicationId ===
    draft.value.source.applicationId
      ? selectedSource.value
      : undefined
  )
  const selectedSourceOutsidePage = computed(
    () =>
      !!draft.value.source.applicationId &&
      !sources.value.some(
        (source) =>
          source.source.applicationId === draft.value.source.applicationId
      )
  )
  const currentVersion = computed(() =>
    published.value.find((version) => version.id === selectedVersionId.value)
  )
  const comparisonVersion = computed(() =>
    selected.value?.versions?.find(
      (version) => version.id === comparisonId.value
    )
  )
  const chosenVersionFields = computed(() => {
    const chosen = new Set(
      (currentVersion.value?.schema.fields || []).map(reportingReferenceKey)
    )
    return (versionCatalogue.value?.visibleFields || []).filter((field) =>
      chosen.has(reportingReferenceKey(field.reference))
    )
  })
  const searchableFields = computed(() =>
    chosenVersionFields.value.filter((field) => field.searchable)
  )
  const sortableFields = computed(() =>
    chosenVersionFields.value.filter((field) => field.sortable)
  )
  const currentSortKey = computed(() =>
    reportingReferenceKey(queryDraft.value.sort.field)
  )
  const unavailableDraftFields = computed(() => {
    const allowedFields = new Set(
      (currentSource.value?.visibleFields || []).map((field) =>
        reportingReferenceKey(field.reference)
      )
    )
    return draft.value.fields.filter(
      (field) => !allowedFields.has(reportingReferenceKey(field))
    )
  })
  const unavailableSearchFields = computed(() => {
    const available = new Set(
      searchableFields.value.map((field) =>
        reportingReferenceKey(field.reference)
      )
    )
    return queryDraft.value.searchFields.filter(
      (field) => !available.has(reportingReferenceKey(field))
    )
  })
  const sortUnavailable = computed(
    () =>
      !sortableFields.value.some(
        (field) =>
          reportingReferenceKey(field.reference) === currentSortKey.value
      )
  )
  const defaults = (source: ReportingSourceCatalogue, kind: ReportingKind) => {
    let chosen = ['id', 'status', 'createdAt']
    if (kind === 'distribution') chosen = ['status', 'createdAt']
    if (kind === 'trend') chosen = ['createdAt', 'status']
    const fields = source.visibleFields.filter(
      (field) =>
        field.reference.kind === 'metadata' &&
        chosen.includes(field.reference.id)
    )
    return fields.length
      ? fields.map((field) => ({ ...field.reference }))
      : source.visibleFields
          .slice(0, 1)
          .map((field) => ({ ...field.reference }))
  }
  function useRecord(record: ReportingDefinitionRecord) {
    selected.value = record
    editorOpen.value = true
    draft.value = clone(record.schema)
    savedDraft.value = JSON.stringify(draft.value)
    comparisonId.value =
      record.activeVersionId || record.versions?.[0]?.id || ''
    loadSelectedSource(record.schema.source.applicationId)
  }
  async function loadSelectedSource(applicationId: string) {
    const current = ticket()
    const seq = ++sourceLookupSequence
    selectedSource.value = undefined
    sourceLookupLoading.value = true
    try {
      const page = await fetchReportingSources({
        current: 1,
        pageSize: 1,
        applicationId,
      })
      if (
        !current() ||
        seq !== sourceLookupSequence ||
        draft.value.source.applicationId !== applicationId
      )
        return
      selectedSource.value = page.list.find(
        (source) => source.source.applicationId === applicationId
      )
    } catch (failure) {
      if (current() && seq === sourceLookupSequence)
        error.value = errorMessage(failure)
    } finally {
      if (current() && seq === sourceLookupSequence)
        sourceLookupLoading.value = false
    }
  }
  async function loadSources() {
    if (![P.create, P.update, P.publish].some(allowed)) return
    const current = ticket()
    const seq = ++sourceSequence
    sourceLoading.value = true
    try {
      const page = await fetchReportingSources({
        current: sourcePage.value,
        pageSize: sourcePageSize.value,
        keyword: sourceKeyword.value,
      })
      if (!current() || seq !== sourceSequence) return
      sources.value = page.list
      sourcePage.value = page.current
      sourceTotal.value = page.total
      sourcePageSize.value = page.pageSize
    } catch (failure) {
      if (current() && seq === sourceSequence) {
        sources.value = []
        error.value = errorMessage(failure)
      }
    } finally {
      if (current() && seq === sourceSequence) sourceLoading.value = false
    }
  }
  const searchSources = () => {
    sourcePage.value = 1
    loadSources()
  }
  const changeSourcePage = (delta: number) => {
    if (sourceLoading.value) return
    sourcePage.value += delta
    loadSources()
  }
  async function loadDefinitions() {
    if (!allowed(P.list)) return
    const current = ticket()
    const seq = ++listSequence
    try {
      const page = await fetchReportingDefinitions({
        current: definitionPage.value,
        pageSize: 20,
        keyword: definitionKeyword.value,
      })
      if (current() && seq === listSequence) {
        definitions.value = page.list
        definitionTotal.value = page.total
      }
    } catch (failure) {
      if (current() && seq === listSequence) error.value = errorMessage(failure)
    }
  }
  async function loadPublished() {
    if (!allowed(P.query)) return
    const current = ticket()
    const seq = ++librarySequence
    try {
      const page = await fetchPublishedReportingDefinitions({
        current: publishedPage.value,
        pageSize: 20,
        keyword: publishedKeyword.value,
      })
      if (!current() || seq !== librarySequence) return
      published.value = page.list
      publishedTotal.value = page.total
      if (!page.list.some((version) => version.id === selectedVersionId.value))
        selectedVersionId.value = page.list[0]?.id || ''
    } catch (failure) {
      if (current() && seq === librarySequence) {
        published.value = []
        selectedVersionId.value = ''
        result.value = undefined
        error.value = errorMessage(failure)
      }
    }
  }
  async function load() {
    const current = ticket()
    loading.value = true
    error.value = ''
    const tasks: Promise<unknown>[] = [loadDefinitions(), loadPublished()]
    if ([P.create, P.update, P.publish].some(allowed)) tasks.push(loadSources())
    try {
      await Promise.all(tasks)
    } catch (failure) {
      if (current()) error.value = errorMessage(failure)
    } finally {
      if (current()) loading.value = false
    }
  }
  const mayDiscard = async () =>
    !draftDirty.value ||
    confirmR1Action('报表草稿有未保存修改，确认丢弃并继续？')
  const edit = async (id: string) => {
    if (busy.value || detailLoading.value) return
    const current = ticket()
    if (!(await mayDiscard()) || !current()) return
    const seq = ++detailSequence
    detailLoading.value = true
    error.value = ''
    try {
      const record = await getReportingDefinition(id)
      if (current() && seq === detailSequence) useRecord(record)
    } catch (failure) {
      if (current() && seq === detailSequence)
        error.value = errorMessage(failure)
    } finally {
      if (current() && seq === detailSequence) detailLoading.value = false
    }
  }
  const newDefinition = async () => {
    if (busy.value || detailLoading.value || !allowed(P.create)) return
    const current = ticket()
    if (!(await mayDiscard()) || !current()) return
    selected.value = undefined
    selectedSource.value = undefined
    sourceLookupSequence += 1
    sourceLookupLoading.value = false
    draft.value = emptyDefinition()
    editorOpen.value = true
    savedDraft.value = ''
    const [firstSource] = sources.value
    if (firstSource) {
      selectedSource.value = firstSource
      draft.value.source = { ...firstSource.source }
      draft.value.fields = defaults(firstSource, draft.value.kind)
    }
    comparisonId.value = ''
  }
  const changeSource = (applicationId: string) => {
    const source = sources.value.find(
      (item) => item.source.applicationId === applicationId
    )
    if (
      !source ||
      source.source.applicationId === draft.value.source.applicationId
    )
      return
    sourceLookupSequence += 1
    sourceLookupLoading.value = false
    selectedSource.value = source
    draft.value.source = { ...source.source }
    draft.value.fields = defaults(source, draft.value.kind)
  }
  const applyTemplate = () => {
    if (!canEdit.value || !currentSource.value) return
    draft.value.kind = templateKind.value
    draft.value.metric = 'count'
    draft.value.factTime = 'createdAt'
    draft.value.fields = defaults(currentSource.value, templateKind.value)
    notice.value =
      '已将固定数量模板应用到当前草稿，请检查字段并保存；没有创建查询结果。'
  }
  const toggleDraftField = (field: ReportingVisibleField, checked: boolean) => {
    const key = reportingReferenceKey(field.reference)
    draft.value.fields = checked
      ? [
          ...draft.value.fields.filter(
            (item) => reportingReferenceKey(item) !== key
          ),
          { ...field.reference },
        ]
      : draft.value.fields.filter((item) => reportingReferenceKey(item) !== key)
  }
  const clearUnavailableDraftFields = () => {
    const keys = new Set(
      (currentSource.value?.visibleFields || []).map((field) =>
        reportingReferenceKey(field.reference)
      )
    )
    draft.value.fields = draft.value.fields.filter((field) =>
      keys.has(reportingReferenceKey(field))
    )
  }
  const save = () => {
    if (!canEdit.value) return
    let schema: ReportingDefinitionV1
    try {
      schema = parseReportingDefinition(draft.value)
      if (unavailableDraftFields.value.length)
        throw new Error(
          '当前草稿包含不可用或未授权的字段，请显式移除并重新选择登记字段'
        )
    } catch (failure) {
      error.value = errorMessage(failure)
      return
    }
    const record = selected.value
    command(
      `reporting-save:${record?.id || 'new'}`,
      { schema, expectedRevision: record?.revision },
      (key) => saveReportingDefinition(schema, key, record),
      async (value) => {
        useRecord(value)
        notice.value = '报表配置已由服务器保存，刷新后可重新打开'
        await loadDefinitions()
      }
    )
  }
  const publish = () => {
    const record = selected.value
    if (
      !record ||
      detailLoading.value ||
      draftDirty.value ||
      !allowed(P.publish)
    )
      return
    command(
      `reporting-publish:${record.id}`,
      { expectedRevision: record.revision },
      (key) => publishReportingDefinition(record, key),
      async (value) => {
        useRecord(value)
        notice.value = '服务器已保存不可变发布快照与固定来源发布版'
        await loadDefinitions()
        await loadPublished()
      },
      '确认发布当前已保存的报表配置？来源发布版和字段含义将由服务器固定，查询仍按当前授权执行。'
    )
  }
  const setEnabled = () => {
    const record = selected.value
    if (
      !record ||
      detailLoading.value ||
      draftDirty.value ||
      !allowed(P.disable)
    )
      return
    command(
      `reporting-enabled:${record.id}`,
      { expectedRevision: record.revision, enabled: !record.enabled },
      (key) => setReportingDefinitionEnabled(record, !record.enabled, key),
      async (value) => {
        useRecord(value)
        notice.value = value.enabled
          ? '报表已启用有效发布版本'
          : '报表已停用，后续查询由服务器拒绝'
        await loadDefinitions()
        await loadPublished()
      },
      record.enabled
        ? '确认停用此报表的后续查询？历史发布版本保留。'
        : '确认启用此报表的有效发布版本？'
    )
  }
  const closeEditor = async () => {
    const current = ticket()
    if (
      busy.value ||
      detailLoading.value ||
      !(await mayDiscard()) ||
      !current()
    )
      return
    editorOpen.value = false
    selected.value = undefined
  }
  const reload = async () => {
    const current = ticket()
    if (
      busy.value ||
      detailLoading.value ||
      !(await mayDiscard()) ||
      !current()
    )
      return
    const id = selected.value?.id
    await load()
    if (id && current()) await edit(id)
  }
  const selectPublished = async (id: string) => {
    const current = ticket()
    if (
      queryDirty.value &&
      !(await confirmR1Action('查询筛选有未执行修改，确认切换固定报表版本？'))
    )
      return
    if (current()) selectedVersionId.value = id
  }
  const resetQueryForVersion = async () => {
    querySequence += 1
    result.value = undefined
    lastQuery.value = undefined
    versionCatalogue.value = undefined
    querying.value = false
    const version = currentVersion.value
    if (!version) return
    const current = ticket()
    const seq = ++catalogueSequence
    error.value = ''
    try {
      const catalogue = await getReportingVersionCatalogue(version.id)
      if (
        !current() ||
        seq !== catalogueSequence ||
        currentVersion.value?.id !== version.id
      )
        return
      versionCatalogue.value = catalogue
      const end = today(version.schema.timeZone)
      const fields = catalogue.visibleFields.filter((field) =>
        version.schema.fields.some(
          (item) =>
            reportingReferenceKey(item) ===
            reportingReferenceKey(field.reference)
        )
      )
      const sort =
        fields.find(
          (field) =>
            field.reference.kind === 'metadata' &&
            field.reference.id === 'createdAt' &&
            field.sortable
        ) || fields.find((field) => field.sortable)
      queryDraft.value = {
        ...emptyQuery(),
        timeZone: version.schema.timeZone,
        dateRange: { from: `${end.slice(0, 7)}-01`, to: end },
        sort: {
          field: sort ? { ...sort.reference } : { ...version.schema.fields[0] },
          direction: 'desc',
        },
      }
      queryBaseline.value = querySignature(queryDraft.value)
    } catch (failure) {
      if (current() && seq === catalogueSequence)
        error.value = errorMessage(failure)
    }
  }
  const toggleSearchField = (
    field: ReportingVisibleField,
    checked: boolean
  ) => {
    const key = reportingReferenceKey(field.reference)
    queryDraft.value.searchFields = checked
      ? [
          ...queryDraft.value.searchFields.filter(
            (item) => reportingReferenceKey(item) !== key
          ),
          { ...field.reference },
        ]
      : queryDraft.value.searchFields.filter(
          (item) => reportingReferenceKey(item) !== key
        )
  }
  const setSort = (key: string) => {
    const field = sortableFields.value.find(
      (item) => reportingReferenceKey(item.reference) === key
    )
    if (field) queryDraft.value.sort.field = { ...field.reference }
  }
  const removeUnavailableSearch = () => {
    const available = new Set(
      searchableFields.value.map((field) =>
        reportingReferenceKey(field.reference)
      )
    )
    queryDraft.value.searchFields = queryDraft.value.searchFields.filter(
      (field) => available.has(reportingReferenceKey(field))
    )
  }
  const executeQuery = async (currentPage = 1) => {
    if (
      querying.value ||
      busy.value ||
      !allowed(P.query) ||
      !currentVersion.value
    )
      return
    const current = ticket()
    const seq = ++querySequence
    const version = currentVersion.value
    const input = clone(
      currentPage === 1 || !lastQuery.value ? queryDraft.value : lastQuery.value
    )
    input.current = currentPage
    querying.value = true
    error.value = ''
    result.value = undefined
    try {
      const catalogue = await getReportingVersionCatalogue(version.id)
      if (
        !current() ||
        seq !== querySequence ||
        currentVersion.value?.id !== version.id
      )
        return
      versionCatalogue.value = catalogue
      const visible = catalogue.visibleFields.filter((field) =>
        version.schema.fields.some(
          (chosen) =>
            reportingReferenceKey(chosen) ===
            reportingReferenceKey(field.reference)
        )
      )
      const find = (reference: ReportingFieldReference) =>
        visible.find(
          (field) =>
            reportingReferenceKey(field.reference) ===
            reportingReferenceKey(reference)
        )
      if (
        !find(input.sort.field)?.sortable ||
        input.searchFields.some((field) => !find(field)?.searchable)
      )
        throw new Error(
          '搜索或排序选择当前不可用或未授权。输入已保留，请调整所选登记字段后再查询。'
        )
      const query = parseReportingQuery(input, version.schema)
      const response = await queryReportingVersion(version.id, query)
      if (
        !current() ||
        seq !== querySequence ||
        currentVersion.value?.id !== version.id
      )
        return
      result.value = response
      lastQuery.value = clone(query)
      queryDraft.value.current = query.current
    } catch (failure) {
      if (current() && seq === querySequence)
        error.value = errorMessage(failure)
    } finally {
      if (current() && seq === querySequence) querying.value = false
    }
  }
  const searchDefinitions = () => {
    definitionPage.value = 1
    loadDefinitions()
  }
  const changeDefinitionPage = (delta: number) => {
    definitionPage.value += delta
    loadDefinitions()
  }
  const searchPublished = async () => {
    const current = ticket()
    if (
      queryDirty.value &&
      !(await confirmR1Action(
        '共享发布库查询会重新选择报表，确认丢弃未执行的筛选修改？'
      ))
    )
      return
    if (current()) {
      publishedPage.value = 1
      loadPublished()
    }
  }
  const changePublishedPage = async (delta: number) => {
    const current = ticket()
    if (
      queryDirty.value &&
      !(await confirmR1Action(
        '切换共享发布库分页会重新选择查询版本，确认继续？'
      ))
    )
      return
    if (current()) {
      publishedPage.value += delta
      loadPublished()
    }
  }
  watch(selectedVersionId, resetQueryForVersion)
  onMounted(load)
  return {
    P,
    user,
    definitions,
    definitionPage,
    definitionTotal,
    definitionKeyword,
    sources,
    sourcePage,
    sourceTotal,
    sourcePageSize,
    sourceKeyword,
    sourceLoading,
    sourceLookupLoading,
    selectedSourceOutsidePage,
    selected,
    editorOpen,
    detailLoading,
    draft,
    draftDirty,
    templateKind,
    comparisonId,
    comparisonVersion,
    published,
    publishedPage,
    publishedTotal,
    publishedKeyword,
    selectedVersionId,
    currentVersion,
    versionCatalogue,
    chosenVersionFields,
    searchableFields,
    sortableFields,
    currentSortKey,
    sortUnavailable,
    unavailableDraftFields,
    unavailableSearchFields,
    currentSource,
    canEdit,
    queryDraft,
    lastQuery,
    queryDirty,
    result,
    loading,
    querying,
    error,
    notice,
    busy,
    allowed,
    edit,
    newDefinition,
    changeSource,
    searchSources,
    changeSourcePage,
    applyTemplate,
    toggleDraftField,
    clearUnavailableDraftFields,
    save,
    publish,
    setEnabled,
    closeEditor,
    reload,
    selectPublished,
    toggleSearchField,
    setSort,
    removeUnavailableSearch,
    executeQuery,
    searchDefinitions,
    changeDefinitionPage,
    searchPublished,
    changePublishedPage,
  }
}
export default useReportingState
