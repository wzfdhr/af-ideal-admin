import { invalid, onlyKeys, record, text, positiveInteger } from './schemas'

export const DICTIONARY_PERMISSIONS = {
  list: 'system:dict:list',
  detail: 'system:dict:detail',
  create: 'system:dict:create',
  update: 'system:dict:update',
  delete: 'system:dict:delete',
  read: 'system:dict:read',
} as const
export const RESERVED_DICTIONARIES = [
  'dictStatus',
  'departmentStatus',
  'positionStatus',
  'userStatus',
  'roleStatus',
  'gender',
  'degree',
  'diploma',
  'field',
]
export interface DictionaryItem {
  label: string
  value: string | number | boolean
  disabled: boolean
}
export interface DictionaryInput {
  dictName: string
  dictType: string
  dictStatus: 'enabled' | 'disabled'
  description: string
  expectedRevision?: number
}
export const parseDictionary = (
  input: unknown,
  update = false
): DictionaryInput => {
  const body = record(input)
  onlyKeys(body, [
    'dictName',
    'dictType',
    'dictStatus',
    'description',
    ...(update ? ['expectedRevision'] : []),
  ])
  const dictType = text(body.dictType, 'dictType', 60)
  if (
    !/^[a-z][a-z0-9-]*$/.test(dictType) ||
    RESERVED_DICTIONARIES.includes(dictType)
  )
    invalid(
      'dictType',
      '字典类型必须为小写字母开头的字母、数字和短横线，且不能覆盖平台字典'
    )
  if (!['enabled', 'disabled'].includes(String(body.dictStatus)))
    invalid('dictStatus', '字典状态无效')
  if (typeof body.description !== 'string' || body.description.length > 500)
    invalid('description', '字典说明不能超过500字')
  return {
    dictName: text(body.dictName, 'dictName', 100),
    dictType,
    dictStatus: body.dictStatus as DictionaryInput['dictStatus'],
    description: (body.description as string).trim(),
    ...(update
      ? { expectedRevision: positiveInteger(body.expectedRevision) }
      : {}),
  }
}
export const parseDictionaryItems = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, ['expectedRevision', 'items'])
  if (!Array.isArray(body.items) || body.items.length > 200)
    invalid('items', '字典最多包含200项')
  const items = (body.items as unknown[]).map((raw): DictionaryItem => {
    const item = record(raw)
    onlyKeys(item, ['label', 'value', 'disabled'])
    const { value } = item
    if (
      !(
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 100
      ) &&
      !(
        typeof value === 'number' &&
        Number.isFinite(value) &&
        Math.abs(value) <= Number.MAX_SAFE_INTEGER
      ) &&
      typeof value !== 'boolean'
    )
      invalid('value', '选项值必须是有界字符串、数字或布尔值')
    if (typeof item.disabled !== 'boolean')
      invalid('disabled', '选项停用状态无效')
    return {
      label: text(item.label, 'label', 100),
      value: value as DictionaryItem['value'],
      disabled: item.disabled as boolean,
    }
  })
  if (
    new Set(items.map((item) => JSON.stringify(item.value))).size !==
    items.length
  )
    invalid('items', '字典选项值不能重复')
  return { expectedRevision: positiveInteger(body.expectedRevision), items }
}
