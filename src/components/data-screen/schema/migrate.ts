import {
  CURRENT_DATA_SCREEN_SCHEMA_VERSION,
  type DataScreenDataSource,
  type DataScreenSchema,
  type DataScreenTheme,
  type DataScreenWidget,
  type DataScreenWidgetType,
  type LegacyDataScreenDataSource,
  type LegacyDataScreenSchema,
  type LegacyDataScreenWidget,
} from './types'

const DATA_SCREEN_SCHEMA_ERROR = '非法大屏 schema'
const DATA_SCREEN_WIDGET_TYPES: DataScreenWidgetType[] = [
  'LineChart',
  'BarChart',
  'PieChart',
  'RankingList',
  'MetricCard',
  'ScrollTable',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeOptionalText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const normalizeVersion = (version: unknown) =>
  typeof version === 'number' && Number.isInteger(version) && version > 0
    ? version
    : CURRENT_DATA_SCREEN_SCHEMA_VERSION

const normalizeDimension = (dimension: unknown, fallback: number) =>
  typeof dimension === 'number' && Number.isInteger(dimension) && dimension > 0
    ? dimension
    : fallback

const normalizeTheme = (theme: unknown): DataScreenTheme => {
  if (!isRecord(theme)) {
    return {
      mode: 'dark',
      brandColor: '#00D5FF',
    }
  }

  return {
    mode: theme.mode === 'light' ? 'light' : 'dark',
    brandColor:
      typeof theme.brandColor === 'string' && theme.brandColor.trim()
        ? theme.brandColor.trim()
        : '#00D5FF',
  }
}

const normalizeDataSources = (dataSources: unknown): DataScreenDataSource[] => {
  if (dataSources === undefined) {
    return []
  }

  if (!Array.isArray(dataSources)) {
    throw new Error(DATA_SCREEN_SCHEMA_ERROR)
  }

  return dataSources.map((source, index) => {
    if (!isRecord(source)) {
      throw new Error(DATA_SCREEN_SCHEMA_ERROR)
    }

    const legacySource = source as LegacyDataScreenDataSource
    const key = normalizeOptionalText(legacySource.key) || `source-${index + 1}`
    const refreshInterval =
      typeof legacySource.refreshInterval === 'number' &&
      Number.isInteger(legacySource.refreshInterval)
        ? legacySource.refreshInterval
        : 5000

    return {
      key,
      name: normalizeOptionalText(legacySource.name) || key,
      url:
        normalizeOptionalText(legacySource.url) || '/api/data-screens/realtime',
      refreshInterval,
    }
  })
}

const normalizeWidgets = (widgets: unknown): DataScreenWidget[] => {
  if (!Array.isArray(widgets)) {
    throw new Error(DATA_SCREEN_SCHEMA_ERROR)
  }

  return widgets.map((widget, index) => {
    if (!isRecord(widget)) {
      throw new Error(DATA_SCREEN_SCHEMA_ERROR)
    }

    const legacyWidget = widget as LegacyDataScreenWidget
    const type = normalizeOptionalText(legacyWidget.type)
    if (
      !type ||
      !DATA_SCREEN_WIDGET_TYPES.includes(type as DataScreenWidgetType)
    ) {
      throw new Error(DATA_SCREEN_SCHEMA_ERROR)
    }

    return {
      id: normalizeOptionalText(legacyWidget.id) || `${type}-${index + 1}`,
      type: type as DataScreenWidgetType,
      name: normalizeOptionalText(legacyWidget.name) || type,
      x: normalizeDimension(legacyWidget.x, 0),
      y: normalizeDimension(legacyWidget.y, 0),
      w: normalizeDimension(legacyWidget.w, 320),
      h: normalizeDimension(legacyWidget.h, 180),
      dataSourceKey: normalizeOptionalText(legacyWidget.dataSourceKey),
      permissionCode: normalizeOptionalText(legacyWidget.permissionCode),
      props: isRecord(legacyWidget.props) ? { ...legacyWidget.props } : {},
    }
  })
}

export const migrateDataScreenSchema = (schema: unknown): DataScreenSchema => {
  if (!isRecord(schema)) {
    throw new Error(DATA_SCREEN_SCHEMA_ERROR)
  }

  const legacySchema = schema as LegacyDataScreenSchema

  return {
    version: normalizeVersion(legacySchema.version),
    title: normalizeOptionalText(legacySchema.title) || '企业运营大屏',
    width: normalizeDimension(legacySchema.width, 1920),
    height: normalizeDimension(legacySchema.height, 1080),
    theme: normalizeTheme(legacySchema.theme),
    permissionCode: normalizeOptionalText(legacySchema.permissionCode),
    dataSources: normalizeDataSources(legacySchema.dataSources),
    widgets: normalizeWidgets(legacySchema.widgets),
  }
}

export const validateDataScreenSchema = (schema: unknown): DataScreenSchema => {
  const migrated = migrateDataScreenSchema(schema)
  const dataSourceKeys = new Set(
    migrated.dataSources.map((source) => source.key)
  )
  const widgetIds = new Set<string>()

  if (migrated.width !== 1920 || migrated.height !== 1080) {
    throw new Error(DATA_SCREEN_SCHEMA_ERROR)
  }

  migrated.dataSources.forEach((source) => {
    if (
      source.refreshInterval < 1000 ||
      !Number.isInteger(source.refreshInterval)
    ) {
      throw new Error(DATA_SCREEN_SCHEMA_ERROR)
    }
  })

  migrated.widgets.forEach((widget) => {
    if (widgetIds.has(widget.id)) {
      throw new Error(DATA_SCREEN_SCHEMA_ERROR)
    }
    widgetIds.add(widget.id)

    if (widget.dataSourceKey && !dataSourceKeys.has(widget.dataSourceKey)) {
      throw new Error(DATA_SCREEN_SCHEMA_ERROR)
    }
  })

  return migrated
}

export const createEnterpriseDataScreenSchema = (): DataScreenSchema =>
  validateDataScreenSchema({
    title: '企业运营大屏',
    width: 1920,
    height: 1080,
    theme: {
      mode: 'dark',
      brandColor: '#00D5FF',
    },
    permissionCode: 'data-screen:ops:view',
    dataSources: [
      {
        key: 'realtime',
        name: '运营实时数据',
        url: '/api/data-screens/realtime',
        refreshInterval: 5000,
      },
    ],
    widgets: [
      {
        id: 'today-metrics',
        type: 'MetricCard',
        name: '核心指标',
        x: 40,
        y: 40,
        w: 540,
        h: 180,
        dataSourceKey: 'realtime',
        permissionCode: 'data-screen:ops:metrics',
        props: {
          metricKeys: ['gmv', 'orders', 'conversion'],
        },
      },
      {
        id: 'trend-line',
        type: 'LineChart',
        name: '成交趋势',
        x: 600,
        y: 40,
        w: 620,
        h: 320,
        dataSourceKey: 'realtime',
        permissionCode: 'data-screen:ops:trend',
        props: {
          xField: 'time',
          yField: 'value',
        },
      },
      {
        id: 'region-bar',
        type: 'BarChart',
        name: '区域业绩',
        x: 1240,
        y: 40,
        w: 640,
        h: 320,
        dataSourceKey: 'realtime',
        permissionCode: 'data-screen:ops:region',
        props: {
          xField: 'name',
          yField: 'value',
        },
      },
      {
        id: 'channel-pie',
        type: 'PieChart',
        name: '渠道分布',
        x: 40,
        y: 400,
        w: 460,
        h: 300,
        dataSourceKey: 'realtime',
        permissionCode: 'data-screen:ops:channel',
        props: {
          nameField: 'name',
          valueField: 'value',
        },
      },
      {
        id: 'branch-ranking',
        type: 'RankingList',
        name: '分部排行',
        x: 520,
        y: 400,
        w: 500,
        h: 300,
        dataSourceKey: 'realtime',
        permissionCode: 'data-screen:ops:ranking',
        props: {
          max: 5,
        },
      },
      {
        id: 'order-table',
        type: 'ScrollTable',
        name: '实时订单',
        x: 1040,
        y: 400,
        w: 840,
        h: 560,
        dataSourceKey: 'realtime',
        permissionCode: 'data-screen:ops:orders',
        props: {
          columns: ['name', 'amount', 'status'],
        },
      },
    ],
  })

export default migrateDataScreenSchema
