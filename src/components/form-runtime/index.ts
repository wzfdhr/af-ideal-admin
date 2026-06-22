import FormRenderer from '@/components/s-form/index.vue'

export { FormRenderer }
export { loadRemoteOptions } from './remote-options'
export default FormRenderer

export type { LoadRemoteOptionsParams, RemoteOption } from './remote-options'
export type {
  DataSourceConfig,
  FormConfig,
  IConfigGrid,
  IConfigTab,
  NormalFormWidget,
  VersionedFormSchema,
  WidgetsConfig,
} from '@/components/form-designer/schema'
