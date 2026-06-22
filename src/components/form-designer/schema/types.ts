import type {
  AST,
  DataSourceConfig,
  FormConfig,
  IConfigGrid,
  IConfigTab,
  NormalFormWidget,
  WidgetsConfig,
} from '../types'

export type {
  AST,
  DataSourceConfig,
  FormConfig,
  IConfigGrid,
  IConfigTab,
  NormalFormWidget,
  WidgetsConfig,
}

export const CURRENT_FORM_SCHEMA_VERSION = 1

export const DEFAULT_FORM_CONFIG: FormConfig = {
  size: 'medium',
  layout: 'vertical',
  labelAlign: 'right',
}

export interface VersionedFormSchema extends AST {
  version: number
}

export type LegacyFormSchema = {
  version?: unknown
  formConfig?: Partial<FormConfig>
  config?: Partial<FormConfig>
  widgetsConfig?: unknown
  dataSources?: unknown
}

export type WidgetRecord = Record<string, unknown> & {
  type?: unknown
  uid?: unknown
  name?: unknown
  config?: unknown
  cols?: unknown
  panes?: unknown
}

export type NormalizedWidgetsConfig = WidgetsConfig[]

export type NormalizedDataSources = DataSourceConfig[]
