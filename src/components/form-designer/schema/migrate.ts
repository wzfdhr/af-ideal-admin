import {
  CURRENT_FORM_SCHEMA_VERSION,
  DEFAULT_FORM_CONFIG,
  type LegacyFormSchema,
  type NormalizedDataSources,
  type NormalizedWidgetsConfig,
  type VersionedFormSchema,
  type WidgetRecord,
} from './types'
import type { DataSourceConfig, FormConfig, WidgetsConfig } from '../types'

const FORM_SIZES: FormConfig['size'][] = ['mini', 'small', 'medium', 'large']
const FORM_LAYOUTS: FormConfig['layout'][] = ['horizontal', 'vertical']
const LABEL_ALIGNS: FormConfig['labelAlign'][] = ['left', 'right']

const WIDGET_CONFIG_DEFAULTS: Record<string, Record<string, unknown>> = {
  checkbox: {
    optionsType: 'fixed',
    options: [],
  },
  radio: {
    type: 'radio',
    optionsType: 'fixed',
    options: [],
  },
  select: {
    optionsType: 'fixed',
    options: [],
  },
}

type NormalizeWidgets = (widgetsConfig: unknown) => NormalizedWidgetsConfig

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFormSize = (value: unknown): value is FormConfig['size'] =>
  typeof value === 'string' && FORM_SIZES.includes(value as FormConfig['size'])

const isFormLayout = (value: unknown): value is FormConfig['layout'] =>
  typeof value === 'string' &&
  FORM_LAYOUTS.includes(value as FormConfig['layout'])

const isLabelAlign = (value: unknown): value is FormConfig['labelAlign'] =>
  typeof value === 'string' &&
  LABEL_ALIGNS.includes(value as FormConfig['labelAlign'])

const normalizeVersion = (version: unknown) => {
  if (version === undefined) {
    return CURRENT_FORM_SCHEMA_VERSION
  }

  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return CURRENT_FORM_SCHEMA_VERSION
  }

  if (version > CURRENT_FORM_SCHEMA_VERSION) {
    throw new Error('不支持的表单 schema 版本')
  }

  return CURRENT_FORM_SCHEMA_VERSION
}

const normalizeFormConfig = (schema: LegacyFormSchema): FormConfig => {
  let rawConfig: Record<string, unknown> = {}

  if (isRecord(schema.formConfig)) {
    rawConfig = schema.formConfig
  } else if (isRecord(schema.config)) {
    rawConfig = schema.config
  }

  return {
    size: isFormSize(rawConfig.size)
      ? rawConfig.size
      : DEFAULT_FORM_CONFIG.size,
    layout: isFormLayout(rawConfig.layout)
      ? rawConfig.layout
      : DEFAULT_FORM_CONFIG.layout,
    labelAlign: isLabelAlign(rawConfig.labelAlign)
      ? rawConfig.labelAlign
      : DEFAULT_FORM_CONFIG.labelAlign,
  }
}

const normalizeDataSources = (dataSources: unknown): NormalizedDataSources => {
  if (dataSources === undefined) {
    return []
  }

  if (!Array.isArray(dataSources)) {
    throw new Error('非法表单 schema')
  }

  return dataSources.reduce<DataSourceConfig[]>((sources, source, index) => {
    if (!isRecord(source)) {
      return sources
    }

    const key = typeof source.key === 'string' ? source.key : `source-${index}`
    const name = typeof source.name === 'string' ? source.name : key
    const url = typeof source.url === 'string' ? source.url : ''
    const normalizedSource: DataSourceConfig = { key, name, url }

    if (typeof source.timeout === 'number' && source.timeout > 0) {
      normalizedSource.timeout = source.timeout
    }

    if (isRecord(source.params)) {
      normalizedSource.params = Object.entries(source.params).reduce<
        Record<string, string>
      >((params, [paramKey, fieldName]) => {
        if (typeof fieldName === 'string') {
          params[paramKey] = fieldName
        }

        return params
      }, {})
    }

    if (isRecord(source.responseAdapter)) {
      normalizedSource.responseAdapter = {
        listPath:
          typeof source.responseAdapter.listPath === 'string'
            ? source.responseAdapter.listPath
            : undefined,
        labelField:
          typeof source.responseAdapter.labelField === 'string'
            ? source.responseAdapter.labelField
            : undefined,
        valueField:
          typeof source.responseAdapter.valueField === 'string'
            ? source.responseAdapter.valueField
            : undefined,
      }
    }

    sources.push(normalizedSource)
    return sources
  }, [])
}

const normalizeWidgetConfig = (
  widget: WidgetRecord,
  type: string,
  name: string
) => {
  const rawConfig = isRecord(widget.config) ? widget.config : {}

  return {
    ...WIDGET_CONFIG_DEFAULTS[type],
    ...rawConfig,
    label: typeof rawConfig.label === 'string' ? rawConfig.label : name,
  }
}

function normalizeGridCols(
  cols: unknown,
  normalizeNestedWidgets: NormalizeWidgets
): unknown[] {
  if (!Array.isArray(cols)) {
    return []
  }

  return cols.map((col) => {
    if (!isRecord(col)) {
      return {
        span: 24,
        widgets: [],
      }
    }

    return {
      ...col,
      span: typeof col.span === 'number' ? col.span : 24,
      widgets: normalizeNestedWidgets(col.widgets),
    }
  })
}

function normalizeTabPanes(
  panes: unknown,
  normalizeNestedWidgets: NormalizeWidgets
): unknown[] {
  if (!Array.isArray(panes)) {
    return []
  }

  return panes.map((pane, index) => {
    if (!isRecord(pane)) {
      return {
        name: `标签页${index + 1}`,
        widgets: [],
      }
    }

    return {
      ...pane,
      name: typeof pane.name === 'string' ? pane.name : `标签页${index + 1}`,
      widgets: normalizeNestedWidgets(pane.widgets),
    }
  })
}

function normalizeWidget(
  widget: unknown,
  index: number,
  normalizeNestedWidgets: NormalizeWidgets
): WidgetsConfig {
  if (!isRecord(widget)) {
    throw new Error('非法表单 schema')
  }

  const widgetRecord = widget as WidgetRecord
  const type =
    typeof widgetRecord.type === 'string' ? widgetRecord.type : 'input'
  const name = typeof widgetRecord.name === 'string' ? widgetRecord.name : type
  const uid =
    typeof widgetRecord.uid === 'string' && widgetRecord.uid.length > 0
      ? widgetRecord.uid
      : `${type}-${index + 1}`

  const normalizedWidget: WidgetRecord = {
    ...widgetRecord,
    type,
    uid,
    name,
    config: normalizeWidgetConfig(widgetRecord, type, name),
  }

  if (type === 'grid') {
    normalizedWidget.cols = normalizeGridCols(
      widgetRecord.cols,
      normalizeNestedWidgets
    )
  }

  if (type === 'tab') {
    normalizedWidget.panes = normalizeTabPanes(
      widgetRecord.panes,
      normalizeNestedWidgets
    )
  }

  return normalizedWidget as WidgetsConfig
}

function normalizeWidgets(widgetsConfig: unknown): NormalizedWidgetsConfig {
  if (widgetsConfig === undefined) {
    return []
  }

  if (!Array.isArray(widgetsConfig)) {
    throw new Error('非法表单 schema')
  }

  return widgetsConfig.map((widget, index) =>
    normalizeWidget(widget, index, normalizeWidgets)
  )
}

const migrateFormSchema = (schema: unknown): VersionedFormSchema => {
  if (!isRecord(schema)) {
    throw new Error('非法表单 schema')
  }

  const legacySchema = schema as LegacyFormSchema

  return {
    version: normalizeVersion(legacySchema.version),
    formConfig: normalizeFormConfig(legacySchema),
    dataSources: normalizeDataSources(legacySchema.dataSources),
    widgetsConfig: normalizeWidgets(legacySchema.widgetsConfig),
  }
}

export { migrateFormSchema }
export default migrateFormSchema
