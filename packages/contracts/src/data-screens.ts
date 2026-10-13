import { invalid, onlyKeys, positiveInteger, record, text } from './schemas'
import {
  parseReportingFieldReference,
  REPORTING_BUSINESS_STATUSES,
} from './reporting'
import type {
  BusinessRecordStatus,
  ReportingFieldReference,
  ReportingQueryResultV1,
  ReportingQueryV1,
} from './reporting'

export const DATA_SCREEN_VERSION = 1 as const
export const DATA_SCREEN_CANVAS_WIDTH = 1920
export const DATA_SCREEN_CANVAS_HEIGHT = 1080
export const DATA_SCREEN_MIN_WIDTH = 160
export const DATA_SCREEN_MIN_HEIGHT = 96
export const DATA_SCREEN_MAX_WIDGETS = 30
export const DATA_SCREEN_MAX_SOURCES = 10
export const DATA_SCREEN_MAX_TABLE_COLUMNS = 20
export const DATA_SCREEN_MAX_RESULT_ROWS = 100
export const DATA_SCREEN_MIN_REFRESH_SECONDS = 15
export const DATA_SCREEN_MAX_REFRESH_SECONDS = 300
export const DATA_SCREEN_MAX_ALERT_COUNT = 1000000

export const DATA_SCREEN_PERMISSIONS = {
  list: 'screen:list',
  create: 'screen:create',
  update: 'screen:update',
  publish: 'screen:publish',
  rollback: 'screen:rollback',
  toggle: 'screen:toggle',
  archive: 'screen:archive',
  run: 'screen:run',
} as const

export const DATA_SCREEN_DATE_WINDOWS = [
  'today',
  'last-7-days',
  'current-month',
  'previous-month',
] as const
export const DATA_SCREEN_THEME_PRESETS = [
  'dark',
  'enterprise',
  'ocean',
] as const
export const DATA_SCREEN_WIDGET_KINDS = [
  'line',
  'bar',
  'pie',
  'ranking',
  'metric',
  'table',
  'map',
] as const
export const DATA_SCREEN_TEMPLATE_KEYS = [
  'operations',
  'sales',
  'equipment',
] as const
export const DATA_SCREEN_RUN_STATUSES = ['ready', 'empty', 'error'] as const
export const DATA_SCREEN_RUN_ERROR_CODES = [
  'permission-denied',
  'source-disabled',
  'source-unavailable',
  'network-error',
  'query-failed',
] as const

type DataScreenOption<T extends readonly string[]> = T[number]
export type DataScreenDateWindow = DataScreenOption<
  typeof DATA_SCREEN_DATE_WINDOWS
>
export type DataScreenThemePreset = DataScreenOption<
  typeof DATA_SCREEN_THEME_PRESETS
>
export type DataScreenWidgetKind = DataScreenOption<
  typeof DATA_SCREEN_WIDGET_KINDS
>
export type DataScreenTemplateKey = DataScreenOption<
  typeof DATA_SCREEN_TEMPLATE_KEYS
>
export type DataScreenRunStatus = DataScreenOption<
  typeof DATA_SCREEN_RUN_STATUSES
>
export type DataScreenRunErrorCode = DataScreenOption<
  typeof DATA_SCREEN_RUN_ERROR_CODES
>

export interface DataScreenTheme {
  preset: DataScreenThemePreset
  brandColor: string
}

export interface DataScreenSourceV1 {
  sourceKey: string
  reportDefinitionVersionId: string
  dateWindow: DataScreenDateWindow
  statuses: BusinessRecordStatus[]
  refreshSeconds: number
}

export interface DataScreenLayout {
  x: number
  y: number
  width: number
  height: number
  z: number
}

interface DataScreenWidgetBase {
  id: string
  title: string
  sourceKey: string
  layout: DataScreenLayout
}

export interface DataScreenLineWidget extends DataScreenWidgetBase {
  kind: 'line'
  props: { view: 'trend'; showValues: boolean }
}
export interface DataScreenBarWidget extends DataScreenWidgetBase {
  kind: 'bar'
  props: { view: 'trend' | 'distribution'; showValues: boolean }
}
export interface DataScreenPieWidget extends DataScreenWidgetBase {
  kind: 'pie'
  props: { view: 'distribution'; showLegend: boolean }
}
export interface DataScreenRankingWidget extends DataScreenWidgetBase {
  kind: 'ranking'
  props: { view: 'distribution'; limit: number }
}
export interface DataScreenMetricWidget extends DataScreenWidgetBase {
  kind: 'metric'
  props: { view: 'count'; showTrend: boolean }
}
export interface DataScreenTableWidget extends DataScreenWidgetBase {
  kind: 'table'
  props: {
    view: 'detail'
    columns: ReportingFieldReference[]
    maxRows: number
    scrollingPaused: boolean
  }
}
export interface DataScreenMapWidget extends DataScreenWidgetBase {
  kind: 'map'
  props: {
    view: 'coordinates'
    longitudeField: ReportingFieldReference
    latitudeField: ReportingFieldReference
    maxPoints: number
  }
}
export type DataScreenWidgetV1 =
  | DataScreenLineWidget
  | DataScreenBarWidget
  | DataScreenPieWidget
  | DataScreenRankingWidget
  | DataScreenMetricWidget
  | DataScreenTableWidget
  | DataScreenMapWidget

export interface DataScreenAlertV1 {
  enabled: boolean
  statuses: BusinessRecordStatus[]
  countThreshold: number
  scrollingPaused: boolean
}

export interface DataScreenDefinitionV1 {
  version: 1
  title: string
  theme: DataScreenTheme
  sources: DataScreenSourceV1[]
  widgets: DataScreenWidgetV1[]
  alert: DataScreenAlertV1
}

const dataScreenObject = (input: unknown, field = 'body') => {
  const value = record(input, field)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null)
    invalid(field, '大屏契约必须是明确的数据对象')
  return value
}

const enumValue = <T extends string>(
  input: unknown,
  allowed: readonly T[],
  field: string
): T => {
  if (typeof input !== 'string' || !allowed.includes(input as T))
    invalid(field, '值不属于当前受控格式')
  return input as T
}

const safeId = (input: unknown, field: string): string => {
  const value = text(input, field, 100)
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) ||
    ['__proto__', 'prototype', 'constructor'].includes(value.toLowerCase())
  )
    invalid(field, '只允许安全登记标识，不接受路径或表达式')
  return value
}

const plainText = (input: unknown, field: string, max = 100): string => {
  const value = text(input, field, max)
  const hasControlCharacter = Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
  if (
    hasControlCharacter ||
    /<\s*\/?\s*[A-Za-z][^>]*>/u.test(value) ||
    /<!--|-->/u.test(value)
  )
    invalid(field, '只能使用单行纯文本，不接受HTML或控制字符')
  return value
}

const booleanValue = (input: unknown, field: string): boolean => {
  if (typeof input !== 'boolean') invalid(field, '必须明确为布尔值')
  return input as boolean
}

const boundedInteger = (
  input: unknown,
  field: string,
  min: number,
  max: number
): number => {
  if (
    typeof input !== 'number' ||
    !Number.isSafeInteger(input) ||
    input < min ||
    input > max
  )
    invalid(field, `必须为${min}至${max}的安全整数`)
  return input as number
}

const finiteNumber = (input: unknown, field: string): number => {
  if (typeof input !== 'number' || !Number.isFinite(input))
    invalid(field, '必须为有限数字')
  return input as number
}

const parseStatuses = (
  input: unknown,
  field: string
): BusinessRecordStatus[] => {
  if (
    !Array.isArray(input) ||
    input.length > REPORTING_BUSINESS_STATUSES.length
  )
    invalid(field, '业务状态必须为有界数组')
  const statuses = Array.from(input as unknown[]).map((status) =>
    enumValue(status, REPORTING_BUSINESS_STATUSES, field)
  )
  if (new Set(statuses).size !== statuses.length)
    invalid(field, '业务状态不能重复')
  return statuses
}

const fieldIdentity = (field: ReportingFieldReference) =>
  `${field.kind}:${field.id}`

const parseTheme = (input: unknown): DataScreenTheme => {
  const body = dataScreenObject(input, 'theme')
  onlyKeys(body, ['preset', 'brandColor'])
  const { brandColor } = body
  if (typeof brandColor !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(brandColor))
    invalid('theme.brandColor', '品牌色必须为#RRGGBB')
  return {
    preset: enumValue(body.preset, DATA_SCREEN_THEME_PRESETS, 'theme.preset'),
    brandColor: (brandColor as string).toUpperCase(),
  }
}

const parseLayout = (input: unknown, field = 'layout'): DataScreenLayout => {
  const body = dataScreenObject(input, field)
  onlyKeys(body, ['x', 'y', 'width', 'height', 'z'])
  const layout = {
    x: finiteNumber(body.x, `${field}.x`),
    y: finiteNumber(body.y, `${field}.y`),
    width: finiteNumber(body.width, `${field}.width`),
    height: finiteNumber(body.height, `${field}.height`),
    z: boundedInteger(body.z, `${field}.z`, 0, DATA_SCREEN_MAX_WIDGETS - 1),
  }
  if (
    layout.width < DATA_SCREEN_MIN_WIDTH ||
    layout.height < DATA_SCREEN_MIN_HEIGHT
  )
    invalid(field, '组件尺寸不能小于160×96')
  if (
    layout.x < 0 ||
    layout.y < 0 ||
    layout.x + layout.width > DATA_SCREEN_CANVAS_WIDTH ||
    layout.y + layout.height > DATA_SCREEN_CANVAS_HEIGHT
  )
    invalid(field, '组件必须位于1920×1080画布内')
  return layout
}

const parseSource = (input: unknown): DataScreenSourceV1 => {
  const body = dataScreenObject(input, 'source')
  onlyKeys(body, [
    'sourceKey',
    'reportDefinitionVersionId',
    'dateWindow',
    'statuses',
    'refreshSeconds',
  ])
  return {
    sourceKey: safeId(body.sourceKey, 'source.sourceKey'),
    reportDefinitionVersionId: safeId(
      body.reportDefinitionVersionId,
      'source.reportDefinitionVersionId'
    ),
    dateWindow: enumValue(
      body.dateWindow,
      DATA_SCREEN_DATE_WINDOWS,
      'source.dateWindow'
    ),
    statuses: parseStatuses(body.statuses, 'source.statuses'),
    refreshSeconds: boundedInteger(
      body.refreshSeconds,
      'source.refreshSeconds',
      DATA_SCREEN_MIN_REFRESH_SECONDS,
      DATA_SCREEN_MAX_REFRESH_SECONDS
    ),
  }
}

const parseTableColumns = (input: unknown) => {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.length > DATA_SCREEN_MAX_TABLE_COLUMNS
  )
    invalid(
      'widget.props.columns',
      `表格列必须为1至${DATA_SCREEN_MAX_TABLE_COLUMNS}个登记字段`
    )
  const fields = Array.from(input as unknown[]).map(
    parseReportingFieldReference
  )
  if (new Set(fields.map(fieldIdentity)).size !== fields.length)
    invalid('widget.props.columns', '表格列引用不能重复')
  return fields
}

const parseWidget = (input: unknown): DataScreenWidgetV1 => {
  const body = dataScreenObject(input, 'widget')
  onlyKeys(body, ['id', 'kind', 'title', 'sourceKey', 'layout', 'props'])
  const base = {
    id: safeId(body.id, 'widget.id'),
    title: plainText(body.title, 'widget.title'),
    sourceKey: safeId(body.sourceKey, 'widget.sourceKey'),
    layout: parseLayout(body.layout),
  }
  const kind = enumValue(body.kind, DATA_SCREEN_WIDGET_KINDS, 'widget.kind')
  const props = dataScreenObject(body.props, 'widget.props')
  if (kind === 'line') {
    onlyKeys(props, ['view', 'showValues'])
    if (props.view !== 'trend')
      invalid('widget.props.view', '折线图仅展示真实趋势')
    return {
      ...base,
      kind,
      props: {
        view: 'trend',
        showValues: booleanValue(props.showValues, 'widget.props.showValues'),
      },
    }
  }
  if (kind === 'bar') {
    onlyKeys(props, ['view', 'showValues'])
    return {
      ...base,
      kind,
      props: {
        view: enumValue(
          props.view,
          ['trend', 'distribution'] as const,
          'widget.props.view'
        ),
        showValues: booleanValue(props.showValues, 'widget.props.showValues'),
      },
    }
  }
  if (kind === 'pie') {
    onlyKeys(props, ['view', 'showLegend'])
    if (props.view !== 'distribution')
      invalid('widget.props.view', '饼图仅展示真实状态分布')
    return {
      ...base,
      kind,
      props: {
        view: 'distribution',
        showLegend: booleanValue(props.showLegend, 'widget.props.showLegend'),
      },
    }
  }
  if (kind === 'ranking') {
    onlyKeys(props, ['view', 'limit'])
    if (props.view !== 'distribution')
      invalid('widget.props.view', '排行仅展示真实状态分布')
    return {
      ...base,
      kind,
      props: {
        view: 'distribution',
        limit: boundedInteger(
          props.limit,
          'widget.props.limit',
          1,
          REPORTING_BUSINESS_STATUSES.length
        ),
      },
    }
  }
  if (kind === 'metric') {
    onlyKeys(props, ['view', 'showTrend'])
    if (props.view !== 'count')
      invalid('widget.props.view', '指标卡仅展示真实记录数量')
    return {
      ...base,
      kind,
      props: {
        view: 'count',
        showTrend: booleanValue(props.showTrend, 'widget.props.showTrend'),
      },
    }
  }
  if (kind === 'table') {
    onlyKeys(props, ['view', 'columns', 'maxRows', 'scrollingPaused'])
    if (props.view !== 'detail')
      invalid('widget.props.view', '表格仅展示受权明细')
    return {
      ...base,
      kind,
      props: {
        view: 'detail',
        columns: parseTableColumns(props.columns),
        maxRows: boundedInteger(
          props.maxRows,
          'widget.props.maxRows',
          1,
          DATA_SCREEN_MAX_RESULT_ROWS
        ),
        scrollingPaused: booleanValue(
          props.scrollingPaused,
          'widget.props.scrollingPaused'
        ),
      },
    }
  }
  onlyKeys(props, ['view', 'longitudeField', 'latitudeField', 'maxPoints'])
  if (props.view !== 'coordinates')
    invalid('widget.props.view', '地图仅展示已登记坐标点位')
  const longitudeField = parseReportingFieldReference(props.longitudeField)
  const latitudeField = parseReportingFieldReference(props.latitudeField)
  if (fieldIdentity(longitudeField) === fieldIdentity(latitudeField))
    invalid('widget.props.latitudeField', '经纬度必须绑定两个不同字段')
  return {
    ...base,
    kind,
    props: {
      view: 'coordinates',
      longitudeField,
      latitudeField,
      maxPoints: boundedInteger(
        props.maxPoints,
        'widget.props.maxPoints',
        1,
        DATA_SCREEN_MAX_RESULT_ROWS
      ),
    },
  }
}

const validateContiguousLayers = (
  layouts: readonly { layout: DataScreenLayout }[],
  field: string
) => {
  const layers = layouts.map((item) => item.layout.z).sort((a, b) => a - b)
  if (layers.some((z, index) => z !== index))
    invalid(field, '层级必须唯一且连续为0..n-1')
}

/**
 * Validates the persisted v1 syntax. Published report state, selected fields,
 * numeric coordinate types and viewer ACLs remain authoritative server checks.
 */
export const parseDataScreenDefinition = (
  input: unknown
): DataScreenDefinitionV1 => {
  const body = dataScreenObject(input, 'definition')
  onlyKeys(body, ['version', 'title', 'theme', 'sources', 'widgets', 'alert'])
  if (body.version !== DATA_SCREEN_VERSION)
    invalid('version', '真实大屏仅支持明确v1格式')
  if (
    !Array.isArray(body.sources) ||
    body.sources.length > DATA_SCREEN_MAX_SOURCES
  )
    invalid('sources', `来源数量不能超过${DATA_SCREEN_MAX_SOURCES}`)
  const sources = Array.from(body.sources as unknown[]).map(parseSource)
  if (
    new Set(sources.map((source) => source.sourceKey)).size !== sources.length
  )
    invalid('sources', '来源标识不能重复')
  if (
    !Array.isArray(body.widgets) ||
    body.widgets.length > DATA_SCREEN_MAX_WIDGETS
  )
    invalid('widgets', `组件数量不能超过${DATA_SCREEN_MAX_WIDGETS}`)
  const widgets = Array.from(body.widgets as unknown[]).map(parseWidget)
  if (new Set(widgets.map((widget) => widget.id)).size !== widgets.length)
    invalid('widgets', '组件标识不能重复')
  const sourceKeys = new Set(sources.map((source) => source.sourceKey))
  if (widgets.some((widget) => !sourceKeys.has(widget.sourceKey)))
    invalid('widgets', '组件必须引用当前大屏已声明的来源')
  validateContiguousLayers(widgets, 'widgets')
  const alertBody = dataScreenObject(body.alert, 'alert')
  onlyKeys(alertBody, [
    'enabled',
    'statuses',
    'countThreshold',
    'scrollingPaused',
  ])
  const alert: DataScreenAlertV1 = {
    enabled: booleanValue(alertBody.enabled, 'alert.enabled'),
    statuses: parseStatuses(alertBody.statuses, 'alert.statuses'),
    countThreshold: boundedInteger(
      alertBody.countThreshold,
      'alert.countThreshold',
      1,
      DATA_SCREEN_MAX_ALERT_COUNT
    ),
    scrollingPaused: booleanValue(
      alertBody.scrollingPaused,
      'alert.scrollingPaused'
    ),
  }
  if (alert.enabled && !alert.statuses.length)
    invalid('alert.statuses', '启用告警时必须选择登记业务状态')
  return {
    version: DATA_SCREEN_VERSION,
    title: plainText(body.title, 'title'),
    theme: parseTheme(body.theme),
    sources,
    widgets,
    alert,
  }
}

export const parsePublishableDataScreenDefinition = (
  input: unknown
): DataScreenDefinitionV1 => {
  const schema = parseDataScreenDefinition(input)
  if (!schema.sources.length) invalid('sources', '发布必须至少绑定一个真实来源')
  if (!schema.widgets.length)
    invalid('widgets', '发布必须至少包含一个可运行组件')
  const used = new Set(schema.widgets.map((widget) => widget.sourceKey))
  if (schema.sources.some((source) => !used.has(source.sourceKey)))
    invalid('sources', '发布定义不能保留未被组件使用的来源')
  return schema
}

export interface CreateDataScreenInput {
  draft: DataScreenDefinitionV1
}
export interface UpdateDataScreenInput extends CreateDataScreenInput {
  expectedRevision: number
}
export interface DataScreenRevisionCommand {
  expectedRevision: number
}
export interface RollbackDataScreenInput extends DataScreenRevisionCommand {
  releaseId: string
}
export interface ToggleDataScreenInput extends DataScreenRevisionCommand {
  enabled: boolean
}
export interface RunDataScreenInput {
  releaseId: string
}
export interface PreviewDataScreenInput {
  draft: DataScreenDefinitionV1
}

export const parseCreateDataScreen = (
  input: unknown
): CreateDataScreenInput => {
  const body = dataScreenObject(input)
  onlyKeys(body, ['draft'])
  return { draft: parseDataScreenDefinition(body.draft) }
}

export const parseUpdateDataScreen = (
  input: unknown
): UpdateDataScreenInput => {
  const body = dataScreenObject(input)
  onlyKeys(body, ['draft', 'expectedRevision'])
  return {
    draft: parseDataScreenDefinition(body.draft),
    expectedRevision: positiveInteger(body.expectedRevision),
  }
}

export const parseDataScreenRevisionCommand = (
  input: unknown
): DataScreenRevisionCommand => {
  const body = dataScreenObject(input)
  onlyKeys(body, ['expectedRevision'])
  return { expectedRevision: positiveInteger(body.expectedRevision) }
}

export const parsePublishDataScreen = parseDataScreenRevisionCommand
export const parseArchiveDataScreen = parseDataScreenRevisionCommand

export const parseRollbackDataScreen = (
  input: unknown
): RollbackDataScreenInput => {
  const body = dataScreenObject(input)
  onlyKeys(body, ['releaseId', 'expectedRevision'])
  return {
    releaseId: safeId(body.releaseId, 'releaseId'),
    expectedRevision: positiveInteger(body.expectedRevision),
  }
}

export const parseToggleDataScreen = (
  input: unknown
): ToggleDataScreenInput => {
  const body = dataScreenObject(input)
  onlyKeys(body, ['enabled', 'expectedRevision'])
  return {
    enabled: booleanValue(body.enabled, 'enabled'),
    expectedRevision: positiveInteger(body.expectedRevision),
  }
}

export const parseRunDataScreen = (input: unknown): RunDataScreenInput => {
  const body = dataScreenObject(input)
  onlyKeys(body, ['releaseId'])
  return { releaseId: safeId(body.releaseId, 'releaseId') }
}

export const parsePreviewDataScreen = (
  input: unknown
): PreviewDataScreenInput => {
  const body = dataScreenObject(input)
  onlyKeys(body, ['draft'])
  return { draft: parseDataScreenDefinition(body.draft) }
}

export type DataScreenAllowedAction =
  | 'update'
  | 'publish'
  | 'rollback'
  | 'toggle'
  | 'archive'
  | 'run'

export interface DataScreenSourceBindingSnapshot {
  sourceKey: string
  reportDefinitionId: string
  reportDefinitionVersionId: string
  reportDefinitionVersion: number
  reportContentHash: string
  sourceReleaseId: string
  sourceReleaseVersion: number
  sourceContentHash: string
}

export interface DataScreenPublishedVersion {
  id: string
  dataScreenId: string
  version: number
  snapshot: DataScreenDefinitionV1
  contentHash: string
  sourceBindings: DataScreenSourceBindingSnapshot[]
  publishedBy: string
  publishedAt: string
}

export interface DataScreenDetails {
  id: string
  draft: DataScreenDefinitionV1
  revision: number
  enabled: boolean
  archived: boolean
  activeReleaseId: string | null
  versions: DataScreenPublishedVersion[]
  allowedActions: DataScreenAllowedAction[]
  createdAt: string
  updatedAt: string
}

export interface DataScreenSourceRunResultV1 {
  sourceKey: string
  reportDefinitionVersionId: string
  actualQuery: ReportingQueryV1 | null
  status: DataScreenRunStatus
  errorCode: DataScreenRunErrorCode | null
  queriedAt: string
  dataCutoffAt: string | null
  result: ReportingQueryResultV1 | null
}

export interface DataScreenRunResultV1 {
  version: 1
  dataScreenId: string
  releaseId: string
  releaseVersion: number
  sources: DataScreenSourceRunResultV1[]
}

export interface DataScreenTemplateLayoutItem {
  widgetKey: string
  kind: DataScreenWidgetKind
  title: string
  layout: DataScreenLayout
}

export type DataScreenTemplateBindingRecipe =
  | {
      widgetKey: string
      sourceSlot: string
      view: 'count' | 'trend' | 'distribution'
    }
  | {
      widgetKey: string
      sourceSlot: string
      view: 'detail'
      columnSlots: string[]
    }
  | {
      widgetKey: string
      sourceSlot: string
      view: 'coordinates'
      longitudeSlot: string
      latitudeSlot: string
    }

export interface DataScreenTemplateV1 {
  version: 1
  key: DataScreenTemplateKey
  name: string
  theme: DataScreenTheme
  layout: DataScreenTemplateLayoutItem[]
  bindingRecipe: DataScreenTemplateBindingRecipe[]
}

const templateViewAllowed = (
  kind: DataScreenWidgetKind,
  view: DataScreenTemplateBindingRecipe['view']
) =>
  (kind === 'line' && view === 'trend') ||
  (kind === 'bar' && ['trend', 'distribution'].includes(view)) ||
  (kind === 'pie' && view === 'distribution') ||
  (kind === 'ranking' && view === 'distribution') ||
  (kind === 'metric' && view === 'count') ||
  (kind === 'table' && view === 'detail') ||
  (kind === 'map' && view === 'coordinates')

export const parseDataScreenTemplate = (
  input: unknown
): DataScreenTemplateV1 => {
  const body = dataScreenObject(input, 'template')
  onlyKeys(body, ['version', 'key', 'name', 'theme', 'layout', 'bindingRecipe'])
  if (body.version !== DATA_SCREEN_VERSION)
    invalid('template.version', '大屏模板仅支持明确v1格式')
  if (
    !Array.isArray(body.layout) ||
    !body.layout.length ||
    body.layout.length > DATA_SCREEN_MAX_WIDGETS
  )
    invalid('template.layout', '模板布局必须包含1至30个组件')
  const layout = Array.from(body.layout as unknown[]).map((raw) => {
    const item = dataScreenObject(raw, 'template.layout')
    onlyKeys(item, ['widgetKey', 'kind', 'title', 'layout'])
    return {
      widgetKey: safeId(item.widgetKey, 'template.layout.widgetKey'),
      kind: enumValue(
        item.kind,
        DATA_SCREEN_WIDGET_KINDS,
        'template.layout.kind'
      ),
      title: plainText(item.title, 'template.layout.title'),
      layout: parseLayout(item.layout, 'template.layout.layout'),
    }
  })
  if (new Set(layout.map((item) => item.widgetKey)).size !== layout.length)
    invalid('template.layout', '模板组件标识不能重复')
  validateContiguousLayers(layout, 'template.layout')
  if (
    !Array.isArray(body.bindingRecipe) ||
    body.bindingRecipe.length !== layout.length
  )
    invalid('template.bindingRecipe', '每个模板组件必须有且仅有一个绑定配方')
  const bindingRecipe = Array.from(body.bindingRecipe as unknown[]).map(
    (raw): DataScreenTemplateBindingRecipe => {
      const recipe = dataScreenObject(raw, 'template.bindingRecipe')
      const view = enumValue(
        recipe.view,
        ['count', 'trend', 'distribution', 'detail', 'coordinates'] as const,
        'template.bindingRecipe.view'
      )
      const base = {
        widgetKey: safeId(recipe.widgetKey, 'template.bindingRecipe.widgetKey'),
        sourceSlot: safeId(
          recipe.sourceSlot,
          'template.bindingRecipe.sourceSlot'
        ),
      }
      if (view === 'detail') {
        onlyKeys(recipe, ['widgetKey', 'sourceSlot', 'view', 'columnSlots'])
        if (
          !Array.isArray(recipe.columnSlots) ||
          !recipe.columnSlots.length ||
          recipe.columnSlots.length > DATA_SCREEN_MAX_TABLE_COLUMNS
        )
          invalid(
            'template.bindingRecipe.columnSlots',
            '明细模板必须声明有限字段槽位'
          )
        const columnSlots = Array.from(recipe.columnSlots as unknown[]).map(
          (slot) => safeId(slot, 'template.bindingRecipe.columnSlots')
        )
        if (new Set(columnSlots).size !== columnSlots.length)
          invalid('template.bindingRecipe.columnSlots', '字段槽位不能重复')
        return { ...base, view, columnSlots }
      }
      if (view === 'coordinates') {
        onlyKeys(recipe, [
          'widgetKey',
          'sourceSlot',
          'view',
          'longitudeSlot',
          'latitudeSlot',
        ])
        const longitudeSlot = safeId(
          recipe.longitudeSlot,
          'template.bindingRecipe.longitudeSlot'
        )
        const latitudeSlot = safeId(
          recipe.latitudeSlot,
          'template.bindingRecipe.latitudeSlot'
        )
        if (longitudeSlot === latitudeSlot)
          invalid(
            'template.bindingRecipe.latitudeSlot',
            '模板经纬度必须使用不同字段槽位'
          )
        return { ...base, view, longitudeSlot, latitudeSlot }
      }
      onlyKeys(recipe, ['widgetKey', 'sourceSlot', 'view'])
      return { ...base, view }
    }
  )
  if (
    new Set(bindingRecipe.map((recipe) => recipe.widgetKey)).size !==
    bindingRecipe.length
  )
    invalid('template.bindingRecipe', '模板组件绑定不能重复')
  const layoutByKey = new Map(layout.map((item) => [item.widgetKey, item]))
  bindingRecipe.forEach((recipe) => {
    const item =
      layoutByKey.get(recipe.widgetKey) ??
      invalid('template.bindingRecipe.widgetKey', '绑定组件不在模板布局中')
    if (!templateViewAllowed(item.kind, recipe.view))
      invalid('template.bindingRecipe.view', '绑定视图与组件种类不相容')
  })
  if (
    new Set(bindingRecipe.map((recipe) => recipe.sourceSlot)).size >
    DATA_SCREEN_MAX_SOURCES
  )
    invalid('template.bindingRecipe.sourceSlot', '模板来源槽位不能超过10个')
  return {
    version: DATA_SCREEN_VERSION,
    key: enumValue(body.key, DATA_SCREEN_TEMPLATE_KEYS, 'template.key'),
    name: plainText(body.name, 'template.name'),
    theme: parseTheme(body.theme),
    layout,
    bindingRecipe,
  }
}
