import {
  DomainError,
  record,
  onlyKeys,
  text,
  parseForm,
  parseWorkflow,
} from './schemas'
import type { FormSchema, WorkflowSchema } from './schemas'

export const PACKAGE_PERMISSIONS = {
  export: 'application:export',
  import: 'application:import',
} as const
export interface ApplicationPackage {
  format: 'af-admin-application'
  version: 1
  dependencies: { key: 'form-contract' | 'serial-workflow'; version: 1 }[]
  application: {
    name: string
    description: string
    businessKind: 'leave' | 'generic'
  }
  references: { application: 'application'; form: 'form'; workflow: 'workflow' }
  people: { key: string; kind: 'approver' | 'copy' }[]
  form: FormSchema
  workflow: WorkflowSchema
  redactions: { path: string; reason: 'default-value-removed' }[]
  checksum: string
}
export const parseApplicationPackage = (input: unknown): ApplicationPackage => {
  const body = record(input)
  onlyKeys(body, [
    'format',
    'version',
    'dependencies',
    'application',
    'references',
    'people',
    'form',
    'workflow',
    'redactions',
    'checksum',
  ])
  if (body.format !== 'af-admin-application' || body.version !== 1)
    throw new DomainError(
      422,
      'PACKAGE_VERSION_UNSUPPORTED',
      '应用包格式或版本不受支持'
    )
  if (JSON.stringify(body).length > 262144)
    throw new DomainError(422, 'PACKAGE_TOO_LARGE', '应用定义包不能超过256KiB')
  if (!Array.isArray(body.dependencies) || body.dependencies.length !== 2)
    throw new DomainError(422, 'PACKAGE_DEPENDENCY_INVALID', '依赖清单无效')
  const dependencies = body.dependencies.map((raw) => {
    const item = record(raw)
    onlyKeys(item, ['key', 'version'])
    if (
      !['form-contract', 'serial-workflow'].includes(String(item.key)) ||
      item.version !== 1
    )
      throw new DomainError(
        422,
        'PACKAGE_DEPENDENCY_INVALID',
        '包依赖版本不兼容'
      )
    return {
      key: item.key as 'form-contract' | 'serial-workflow',
      version: 1 as const,
    }
  })
  if (new Set(dependencies.map((item) => item.key)).size !== 2)
    throw new DomainError(422, 'PACKAGE_DEPENDENCY_INVALID', '依赖重复')
  const app = record(body.application)
  onlyKeys(app, ['name', 'description', 'businessKind'])
  if (!['leave', 'generic'].includes(String(app.businessKind)))
    throw new DomainError(422, 'PACKAGE_KIND_INVALID', '业务类型无效')
  const description = app.description === undefined ? '' : app.description
  if (typeof description !== 'string' || description.length > 500)
    throw new DomainError(422, 'PACKAGE_INVALID', '应用说明无效')
  const refs = record(body.references)
  onlyKeys(refs, ['application', 'form', 'workflow'])
  if (
    refs.application !== 'application' ||
    refs.form !== 'form' ||
    refs.workflow !== 'workflow'
  )
    throw new DomainError(
      422,
      'PACKAGE_REFERENCE_INVALID',
      '仅允许包内规范引用'
    )
  if (!Array.isArray(body.people) || body.people.length > 100)
    throw new DomainError(422, 'PACKAGE_REFERENCE_INVALID', '人员槽位无效')
  const people = body.people.map((raw) => {
    const item = record(raw)
    onlyKeys(item, ['key', 'kind'])
    const key = text(item.key, 'person.key', 50)
    if (
      !/^person-\d+$/.test(key) ||
      !['approver', 'copy'].includes(String(item.kind))
    )
      throw new DomainError(
        422,
        'PACKAGE_REFERENCE_INVALID',
        '人员槽位必须为符号及受控类型'
      )
    return { key, kind: item.kind as 'approver' | 'copy' }
  })
  if (new Set(people.map((item) => item.key)).size !== people.length)
    throw new DomainError(422, 'PACKAGE_REFERENCE_INVALID', '人员槽位重复')
  const form = parseForm(body.form)
  if (form.dataSources.length)
    throw new DomainError(
      422,
      'PACKAGE_SOURCE_MAPPING_REQUIRED',
      '当前包格式没有数据源重绑声明，不能携带原租户引用'
    )
  const workflow = parseWorkflow(body.workflow)
  const used = new Set<string>()
  if (
    form.widgetsConfig.some(
      (widget) => widget.config.defaultValue !== undefined
    )
  )
    throw new DomainError(
      422,
      'PACKAGE_DATA_FORBIDDEN',
      '可移植包不允许携带字段默认内容'
    )
  workflow.nodes.forEach((node) => {
    if (node.config.formId !== undefined && node.config.formId !== 'form')
      throw new DomainError(
        422,
        'PACKAGE_REFERENCE_INVALID',
        '流程引用了包外表单'
      )
    ;[...(node.config.approvers || []), ...(node.config.ccUsers || [])].forEach(
      (key) => {
        const slot = people.find((item) => item.key === key)
        if (!slot)
          throw new DomainError(
            422,
            'PACKAGE_REFERENCE_INVALID',
            '流程引用了包外人员'
          )
        if (
          node.type === 'approval' &&
          node.config.approvers?.includes(key) &&
          slot.kind !== 'approver'
        )
          throw new DomainError(
            422,
            'PACKAGE_REFERENCE_INVALID',
            '审批槽位类型不符'
          )
        used.add(key)
      }
    )
  })
  if (used.size !== people.length)
    throw new DomainError(
      422,
      'PACKAGE_REFERENCE_INVALID',
      '槽位清单与实际引用不一致'
    )
  if (!Array.isArray(body.redactions) || body.redactions.length > 50)
    throw new DomainError(422, 'PACKAGE_INVALID', '脱敏清单无效')
  const redactions = body.redactions.map((raw) => {
    const item = record(raw)
    onlyKeys(item, ['path', 'reason'])
    if (item.reason !== 'default-value-removed')
      throw new DomainError(422, 'PACKAGE_INVALID', '脱敏规则无效')
    return {
      path: text(item.path, 'redaction.path', 200),
      reason: 'default-value-removed' as const,
    }
  })
  const checksum = text(body.checksum, 'checksum', 64)
  if (!/^[a-f0-9]{64}$/.test(checksum))
    throw new DomainError(422, 'PACKAGE_CHECKSUM_INVALID', '应用包摘要格式无效')
  return {
    format: 'af-admin-application',
    version: 1,
    dependencies,
    application: {
      name: text(app.name, 'name', 100),
      description,
      businessKind: app.businessKind as 'leave' | 'generic',
    },
    references: {
      application: 'application',
      form: 'form',
      workflow: 'workflow',
    },
    people,
    form,
    workflow,
    redactions,
    checksum,
  }
}
