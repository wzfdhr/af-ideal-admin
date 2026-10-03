import {
  DomainError,
  record,
  onlyKeys,
  text,
  parseForm,
  parseWorkflow,
} from './schemas'
import { parseLowCodePage } from './low-code'
import type { LowCodePageV2 } from './low-code'
import type { FormSchema, WorkflowSchema } from './schemas'

export const PACKAGE_PERMISSIONS = {
  export: 'application:export',
  import: 'application:import',
} as const
export interface ApplicationPackage {
  format: 'af-admin-application'
  version: 1 | 2 | 3
  sources?: { key: string; name: string; kind: 'dictionary' }[]
  pageSources?: {
    key: string
    name: string
    kind: 'application-records' | 'registered-dictionary'
    binding: string
  }[]
  pages?: { key: string; name: string; schema: LowCodePageV2 }[]
  dependencies: {
    key:
      | 'form-contract'
      | 'serial-workflow'
      | 'conditional-workflow'
      | 'parallel-workflow'
      | 'timed-workflow'
      | 'registered-sources'
      | 'page-contract'
      | 'low-code-sources'
      | 'pro-materials'
    version: 1 | 2
  }[]
  application: {
    name: string
    description: string
    businessKind: 'leave' | 'generic'
  }
  references: { application: 'application'; form: 'form'; workflow: 'workflow' }
  people: { key: string; kind: 'approver' | 'copy' }[]
  form: FormSchema
  workflow: WorkflowSchema
  redactions: {
    path: string
    reason: 'default-value-removed' | 'source-snapshot-removed'
  }[]
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
    ...(Number(body.version) >= 2 ? ['sources'] : []),
    ...(body.version === 3 ? ['pages', 'pageSources'] : []),
  ])
  if (
    body.format !== 'af-admin-application' ||
    ![1, 2, 3].includes(body.version as number)
  )
    throw new DomainError(
      422,
      'PACKAGE_VERSION_UNSUPPORTED',
      '应用包格式或版本不受支持'
    )
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 262144)
    throw new DomainError(422, 'PACKAGE_TOO_LARGE', '应用定义包不能超过256KiB')
  let dependencyCount = 2
  if (body.version === 2) dependencyCount = 3
  if (body.version === 3) dependencyCount = 6
  if (
    !Array.isArray(body.dependencies) ||
    body.dependencies.length !== dependencyCount
  )
    throw new DomainError(422, 'PACKAGE_DEPENDENCY_INVALID', '依赖清单无效')
  const workflow = parseWorkflow(body.workflow)
  let workflowDependency = 'serial-workflow'
  if (workflow.version === 2) workflowDependency = 'conditional-workflow'
  if (workflow.version === 3) workflowDependency = 'parallel-workflow'
  if (workflow.version === 4) workflowDependency = 'timed-workflow'
  if (body.version === 1 && workflow.version >= 2)
    throw new DomainError(
      422,
      'PACKAGE_DEPENDENCY_INVALID',
      '条件流程需要v2包与明确依赖'
    )
  const dependencies = body.dependencies.map((raw) => {
    const item = record(raw)
    onlyKeys(item, ['key', 'version'])
    if (
      ![
        'form-contract',
        workflowDependency,
        ...(Number(body.version) >= 2 ? ['registered-sources'] : []),
        ...(body.version === 3
          ? ['page-contract', 'low-code-sources', 'pro-materials']
          : []),
      ].includes(String(item.key)) ||
      item.version !==
        ((item.key === 'form-contract' && Number(body.version) >= 2) ||
        item.key === 'page-contract'
          ? 2
          : 1)
    )
      throw new DomainError(
        422,
        'PACKAGE_DEPENDENCY_INVALID',
        '包依赖版本不兼容'
      )
    return {
      key: item.key as
        | 'form-contract'
        | 'serial-workflow'
        | 'conditional-workflow'
        | 'parallel-workflow'
        | 'timed-workflow'
        | 'registered-sources'
        | 'page-contract'
        | 'low-code-sources'
        | 'pro-materials',
      version: item.version as 1 | 2,
    }
  })
  if (new Set(dependencies.map((item) => item.key)).size !== dependencyCount)
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
  if (body.version === 1 && form.version !== 1)
    throw new DomainError(
      422,
      'PACKAGE_DEPENDENCY_INVALID',
      'v2表单需要明确的v2包依赖'
    )
  if (body.version === 1 && form.dataSources.length)
    throw new DomainError(
      422,
      'PACKAGE_SOURCE_MAPPING_REQUIRED',
      '当前包格式没有数据源重绑声明，不能携带原租户引用'
    )
  let sources: ApplicationPackage['sources']
  if (Number(body.version) >= 2) {
    if (
      !Array.isArray(body.sources) ||
      body.sources.length > (body.version === 3 ? 20 : 10) ||
      form.version !== 2
    )
      throw new DomainError(
        422,
        'PACKAGE_REFERENCE_INVALID',
        '数据源包必须包含明确槽位及v2表单'
      )
    sources = body.sources.map((raw) => {
      const slot = record(raw)
      onlyKeys(slot, ['key', 'name', 'kind'])
      const key = text(slot.key, 'source.key', 100)
      if (!/^source-\d+$/.test(key) || slot.kind !== 'dictionary')
        throw new DomainError(
          422,
          'PACKAGE_REFERENCE_INVALID',
          '数据源必须使用包内字典槽位'
        )
      return {
        key,
        name: text(slot.name, 'source.name', 100),
        kind: 'dictionary' as const,
      }
    })
    if (
      new Set(sources.map((slot) => slot.key)).size !== sources.length ||
      (body.version !== 3 && sources.length !== form.dataSources.length)
    )
      throw new DomainError(
        422,
        'PACKAGE_REFERENCE_INVALID',
        '数据源槽位与引用不一致'
      )
    form.dataSources.forEach((binding) => {
      if (
        !sources?.some((slot) => slot.key === binding.registryId) ||
        binding.optionsSnapshot !== undefined ||
        binding.registryRevision !== undefined ||
        binding.dictionaryRevision !== undefined
      )
        throw new DomainError(
          422,
          'PACKAGE_DATA_FORBIDDEN',
          '包不允许携带源快照、版本或原租户引用'
        )
    })
    if (
      body.version !== 3 &&
      new Set(form.dataSources.map((binding) => binding.registryId)).size !==
        sources.length
    )
      throw new DomainError(
        422,
        'PACKAGE_REFERENCE_INVALID',
        '每个数据源槽位必须有明确引用'
      )
    if (
      form.widgetsConfig.some(
        (widget) =>
          widget.config.optionsType === 'registered' &&
          Array.isArray(widget.config.options) &&
          widget.config.options.length
      )
    )
      throw new DomainError(
        422,
        'PACKAGE_DATA_FORBIDDEN',
        '包不允许携带登记选项数据'
      )
  }
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
  if (!Array.isArray(body.redactions) || body.redactions.length > 70)
    throw new DomainError(422, 'PACKAGE_INVALID', '脱敏清单无效')
  const redactions = body.redactions.map((raw) => {
    const item = record(raw)
    onlyKeys(item, ['path', 'reason'])
    if (
      item.reason !== 'default-value-removed' &&
      !(Number(body.version) >= 2 && item.reason === 'source-snapshot-removed')
    )
      throw new DomainError(422, 'PACKAGE_INVALID', '脱敏规则无效')
    return {
      path: text(item.path, 'redaction.path', 200),
      reason: item.reason as
        | 'default-value-removed'
        | 'source-snapshot-removed',
    }
  })
  let pageSources: ApplicationPackage['pageSources']
  let pages: ApplicationPackage['pages']
  if (body.version === 3) {
    if (
      !Array.isArray(body.pageSources) ||
      !body.pageSources.length ||
      body.pageSources.length > 20 ||
      !Array.isArray(body.pages) ||
      !body.pages.length ||
      body.pages.length > 20
    )
      throw new DomainError(
        422,
        'PACKAGE_REFERENCE_INVALID',
        '页面包必须有明确页面和来源槽位'
      )
    pageSources = body.pageSources.map((raw) => {
      const source = record(raw)
      onlyKeys(source, ['key', 'name', 'kind', 'binding'])
      const key = text(source.key, 'pageSource.key', 100)
      const binding = text(source.binding, 'pageSource.binding', 100)
      if (
        !/^page-source-\d+$/.test(key) ||
        !['application-records', 'registered-dictionary'].includes(
          String(source.kind)
        )
      )
        throw new DomainError(
          422,
          'PACKAGE_REFERENCE_INVALID',
          '页面来源必须为受控槽位'
        )
      if (
        source.kind === 'application-records'
          ? binding !== 'application'
          : !sources?.some((slot) => slot.key === binding)
      )
        throw new DomainError(
          422,
          'PACKAGE_REFERENCE_INVALID',
          '页面来源绑定不是明确包内资源'
        )
      return {
        key,
        name: text(source.name, 'name', 100),
        kind: source.kind as 'application-records' | 'registered-dictionary',
        binding,
      }
    })
    if (
      new Set(pageSources.map((source) => source.key)).size !==
      pageSources.length
    )
      throw new DomainError(
        422,
        'PACKAGE_REFERENCE_INVALID',
        '页面来源槽位重复'
      )
    const usedPageSources = new Set<string>()
    pages = body.pages.map((raw) => {
      const page = record(raw)
      onlyKeys(page, ['key', 'name', 'schema'])
      const key = text(page.key, 'page.key', 100)
      if (!/^page-\d+$/.test(key))
        throw new DomainError(
          422,
          'PACKAGE_REFERENCE_INVALID',
          '页面必须使用包内标识'
        )
      const schema = parseLowCodePage(page.schema)
      schema.sources.forEach((source) => {
        if (!pageSources?.some((slot) => slot.key === source))
          throw new DomainError(
            422,
            'PACKAGE_REFERENCE_INVALID',
            '页面引用包外来源'
          )
        usedPageSources.add(source)
      })
      return { key, name: text(page.name, 'name', 100), schema }
    })
    if (
      new Set(pages.map((page) => page.key)).size !== pages.length ||
      usedPageSources.size !== pageSources.length
    )
      throw new DomainError(
        422,
        'PACKAGE_REFERENCE_INVALID',
        '页面或来源清单与实际引用不一致'
      )
    const usedDictionarySources = new Set(
      form.dataSources.map((binding) => String(binding.registryId))
    )
    pageSources
      .filter((source) => source.kind === 'registered-dictionary')
      .forEach((source) => usedDictionarySources.add(source.binding))
    if (usedDictionarySources.size !== sources?.length)
      throw new DomainError(
        422,
        'PACKAGE_REFERENCE_INVALID',
        '字典槽位必须被表单或页面明确使用'
      )
  }
  const checksum = text(body.checksum, 'checksum', 64)
  if (!/^[a-f0-9]{64}$/.test(checksum))
    throw new DomainError(422, 'PACKAGE_CHECKSUM_INVALID', '应用包摘要格式无效')
  return {
    format: 'af-admin-application',
    version: body.version as 1 | 2 | 3,
    ...(sources ? { sources } : {}),
    ...(pages && pageSources ? { pages, pageSources } : {}),
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
