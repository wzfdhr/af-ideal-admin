export type ProFormFieldType = 'input' | 'select'

export interface ProFormOption {
  label: string
  value: string | number | boolean
  disabled?: boolean
}

export interface ProFormRule {
  required?: boolean
  message?: string
  validator?: (
    value: unknown,
    values: Record<string, unknown>
  ) => void | string | Promise<void | string>
}

export interface ProFormField {
  field: string
  label: string
  type: ProFormFieldType
  defaultValue?: unknown
  placeholder?: string
  readonly?: boolean
  options?: ProFormOption[]
  loadOptions?: () => Promise<ProFormOption[]>
  rules?: ProFormRule[]
  props?: Record<string, unknown>
}

export interface ProFormProps {
  schema: ProFormField[]
  modelValue?: Record<string, unknown>
  readonly?: boolean
  submitText?: string
  resetText?: string
  hideActions?: boolean
  submitter?: (values: Record<string, unknown>) => void | Promise<void>
}

export interface ProFormExpose {
  submit: () => Promise<boolean>
  reset: () => void
  validate: () => Promise<boolean>
  getValues: () => Record<string, unknown>
  setValues: (values: Record<string, unknown>) => void
}
