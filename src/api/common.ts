import request from './request'
import type { SelectOptionData } from '@arco-design/web-vue/es/select'

export const getGenderOptions = async () =>
  request.get<SelectOptionData[]>('/sys/dic/gender')
export const getDegreeOptions = async () =>
  request.get<SelectOptionData[]>('/sys/dic/degree')
export const getDiplomaOptions = async () =>
  request.get<SelectOptionData[]>('/sys/dic/diploma')
export const getFieldOptions = async () =>
  request.get<SelectOptionData[]>('/sys/dic/field')

const toPrimitiveValue = (value: SelectOptionData['value']) => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  return ''
}

const normalizeOption = (
  item: SelectOptionData
): SelectOptionData & {
  label: string
  value: string | number | boolean
} => ({
  ...item,
  label: item.label || String(item.value ?? ''),
  value: toPrimitiveValue(item.value),
})

const toDictionaryOptions = async (
  loader: () => ReturnType<typeof getGenderOptions>
) => {
  const response = await loader()
  return response.data.map(normalizeOption)
}

const dictionaryLoaders: Record<
  string,
  () => Promise<
    Array<
      SelectOptionData & {
        label: string
        value: string | number | boolean
      }
    >
  >
> = {
  gender: () => toDictionaryOptions(getGenderOptions),
  degree: () => toDictionaryOptions(getDegreeOptions),
  diploma: () => toDictionaryOptions(getDiplomaOptions),
  field: () => toDictionaryOptions(getFieldOptions),
}

export const getDictionaryOptions = async (key: string) => {
  const loader = dictionaryLoaders[key]
  if (!loader) {
    const response = await request.get<SelectOptionData[]>(`/sys/dic/${key}`)
    return response.data.map(normalizeOption)
  }

  return loader()
}
