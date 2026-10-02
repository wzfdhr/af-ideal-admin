import { invalid, onlyKeys, record, text, positiveInteger } from './schemas'

export const APPLICATION_PERMISSIONS = {
  list: 'application:list',
  create: 'application:create',
  copy: 'application:copy',
  archive: 'application:archive',
} as const
export interface ManagedApplication {
  id: string
  tenantId: string
  code: string
  name: string
  description: string
  businessKind: 'leave' | 'generic'
  status: 'enabled' | 'archived'
  revision: number
  formDraftId: string | null
  workflowDraftId: string | null
  activeReleaseId: string | null
  formRevision: number | null
  workflowRevision: number | null
  createdAt: string
  updatedAt: string
}
const metadata = (body: Record<string, unknown>) => {
  const code = text(body.code, 'code', 64)
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(code))
    invalid('code', '应用标识需为3至64位小写字母、数字或连字符，以字母开头')
  if (
    body.description !== undefined &&
    (typeof body.description !== 'string' || body.description.length > 500)
  )
    invalid('description', '说明需为500字以内文本')
  return {
    code,
    name: text(body.name, 'name', 100),
    description:
      typeof body.description === 'string' ? body.description.trim() : '',
  }
}
export const parseApplicationCreate = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, ['code', 'name', 'description', 'template'])
  if (!['blank', 'leave'].includes(String(body.template)))
    invalid('template', '请选择受支持的应用模板')
  return { ...metadata(body), template: body.template as 'blank' | 'leave' }
}
export const parseApplicationCopy = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, [
    'code',
    'name',
    'description',
    'expectedRevision',
    'formRevision',
    'workflowRevision',
  ])
  return {
    ...metadata(body),
    expectedRevision: positiveInteger(body.expectedRevision),
    formRevision:
      body.formRevision === undefined
        ? undefined
        : positiveInteger(body.formRevision),
    workflowRevision:
      body.workflowRevision === undefined
        ? undefined
        : positiveInteger(body.workflowRevision),
  }
}
