import { record, onlyKeys, text, positiveInteger, invalid } from './schemas'

export const FORM_DATA_SOURCE_PERMISSIONS = {
  list: 'form-source:list',
  create: 'form-source:create',
  update: 'form-source:update',
  read: 'form-source:read',
} as const
export interface FormDataSource {
  id: string
  code: string
  name: string
  kind: 'dictionary'
  dictionaryId: string
  status: 'enabled' | 'disabled'
  description: string
  revision: number
  updatedAt: string
}
export interface FormDataSourceInput {
  code: string
  name: string
  kind: 'dictionary'
  dictionaryId: string
  status: 'enabled' | 'disabled'
  description: string
  expectedRevision?: number
}
export const parseFormDataSource = (
  input: unknown,
  update = false
): FormDataSourceInput => {
  const body = record(input)
  onlyKeys(body, [
    'code',
    'name',
    'kind',
    'dictionaryId',
    'status',
    'description',
    ...(update ? ['expectedRevision'] : []),
  ])
  const code = text(body.code, 'code', 60)
  if (!/^[a-z][a-z0-9-]*$/.test(code))
    invalid('code', '数据源编码必须由小写字母、数字和短横线组成')
  if (body.kind !== 'dictionary')
    invalid('kind', '数据源类型尚未登记，不能使用配置URL或脚本查询')
  if (!['enabled', 'disabled'].includes(String(body.status)))
    invalid('status', '数据源状态无效')
  if (typeof body.description !== 'string' || body.description.length > 500)
    invalid('description', '数据源说明不能超过500字')
  return {
    code,
    name: text(body.name, 'name', 100),
    kind: 'dictionary',
    dictionaryId: text(body.dictionaryId, 'dictionaryId', 100),
    status: body.status as FormDataSourceInput['status'],
    description: (body.description as string).trim(),
    ...(update
      ? { expectedRevision: positiveInteger(body.expectedRevision) }
      : {}),
  }
}
