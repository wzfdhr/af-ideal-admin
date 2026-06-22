import type { DataSourceConfig } from '@/components/form-designer/schema'
import type { ComputedRef, InjectionKey, Ref } from 'vue'

export type FormRuntimeData = Record<string, any>

export const formData: InjectionKey<Ref<FormRuntimeData>> = Symbol('formData')

export const formDataSources: InjectionKey<ComputedRef<DataSourceConfig[]>> =
  Symbol('formDataSources')

export default formData
