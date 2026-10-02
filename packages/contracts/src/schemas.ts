export type Json = null | boolean | number | string | Json[] | JsonObject
export interface JsonObject {
  [key: string]: Json
}
export type UserRole = '' | '*' | 'admin' | 'user' | 'operator' | 'restricted'
export type LeaveStatus =
  | 'draft'
  | 'running'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
export type InstanceStatus = 'running' | 'completed' | 'rejected' | 'withdrawn'
export type TaskStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type Slot = 'am' | 'pm'
export type LeaveType = 'personal' | 'sick' | 'annual'
export interface LeaveFields {
  leaveType: LeaveType
  startDate: string
  startSlot: Slot
  endDate: string
  endSlot: Slot
  reason: string
}
export interface Command {
  expectedRevision: number
  comment: string
}
export interface WorkflowNode {
  id: string
  type: 'start' | 'approval' | 'copy' | 'end' | 'condition' | 'parallel'
  name: string
  config: { approvers?: string[]; ccUsers?: string[]; formId?: string }
  x?: number
  y?: number
}
export interface WorkflowSchema {
  version: number
  nodes: WorkflowNode[]
  edges: { id: string; source: string; target: string; label: string }[]
}
export interface FormWidget {
  uid: string
  type: string
  name: string
  config: JsonObject
}
export interface ComputedMoneyField {
  id: string
  operation: 'quantity-times-price'
  quantity: string
  price: string
}
export interface FormSchema {
  version: number
  formConfig: {
    size: 'mini' | 'small' | 'medium' | 'large'
    layout: 'vertical' | 'horizontal'
    labelAlign: 'left' | 'right'
    computedFields?: ComputedMoneyField[]
  }
  widgetsConfig: FormWidget[]
  dataSources: JsonObject[]
}
export interface Release {
  id: string
  tenantId: string
  applicationId: string
  releaseVersion: number
  formSnapshot: FormSchema
  workflowSnapshot: WorkflowSchema
  contentHash: string
  publishedAt: string
  publishedBy: string
}
export interface Application {
  id: string
  tenantId: string
  code: string
  name: string
  activeReleaseId: string | null
  revision: number
  releases?: Release[]
  status?: 'enabled' | 'archived'
  businessKind?: 'leave' | 'generic'
  formDraftId?: string | null
  workflowDraftId?: string | null
}
export interface LeaveRequest extends LeaveFields {
  id: string
  tenantId: string
  applicationReleaseId: string
  applicantId: string
  applicantName: string
  departmentSnapshot: string
  halfDayUnits: number
  status: LeaveStatus
  revision: number
  previousRequestId: string | null
  instanceId: string | null
  createdAt: string
  updatedAt: string
  allowedActions: string[]
  release?: Release
  history?: HistoryRecord[]
  tasks?: WorkflowTask[]
}
export interface WorkflowTask {
  businessKind?: 'leave' | 'generic'
  recordLink?: string
  id: string
  tenantId: string
  instanceId: string
  requestId: string
  nodeId: string
  nodeName: string
  assigneeId: string
  status: TaskStatus
  revision: number
  createdAt: string
  completedAt: string | null
  applicantName?: string
  halfDayUnits?: number
}
export interface HistoryRecord {
  id: string
  instanceId: string
  taskId: string | null
  action: string
  operatorId: string
  operatorName: string
  comment: string
  sequence: number
  createdAt: string
}
export interface TenantContext {
  tenantId: string
  name: string
  permissions: string[]
  permissionVersion: number
}
export interface AuthUser {
  id: string
  name: string
  role: UserRole
  permissions: string[]
  dept: string
  avatar: string
  tenants: TenantContext[]
  tenantId: string
}
export interface Draft<T> {
  id: string
  name: string
  schema: T
  revision: number
  version: number
  status: 'draft' | 'published'
  createdAt: string
  updatedAt: string
}
export interface ApiResponse<T> {
  code: number
  data: T
  message?: string
  businessCode?: string
  traceId?: string
  errors?: Record<string, string[]>
}
export interface PageResult<T> {
  list: T[]
  total: number
}

export class DomainError extends Error {
  constructor(
    public status: number,
    public businessCode: string,
    message: string,
    public errors?: Record<string, string[]>
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
export const invalid = (field: string, message: string): never => {
  throw new DomainError(422, 'VALIDATION_ERROR', message, {
    [field]: [message],
  })
}
export const record = (
  input: unknown,
  field = 'body'
): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return invalid(field, '必须是对象')
  return input as Record<string, unknown>
}
export const onlyKeys = (input: Record<string, unknown>, allowed: string[]) => {
  Object.keys(input).forEach((key) => {
    if (!allowed.includes(key)) invalid(key, `不允许字段 ${key}`)
  })
}
export const text = (input: unknown, field: string, max = 200): string => {
  if (typeof input !== 'string' || !input.trim() || input.length > max)
    return invalid(field, `${field} 必填且长度不得超过 ${max}`)
  return input.trim()
}
export const positiveInteger = (
  input: unknown,
  field = 'expectedRevision'
): number => {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1)
    return invalid(field, `${field} 必须是正整数`)
  return input
}
const enumValue = <T extends string>(
  input: unknown,
  values: readonly T[],
  field: string
): T => {
  if (typeof input !== 'string' || !values.includes(input as T))
    return invalid(field, `${field} 值无效`)
  return input as T
}
const dateNumber = (input: unknown, field: string) => {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input))
    return invalid(field, '日期格式必须是 YYYY-MM-DD')
  const value = Date.parse(`${input}T00:00:00Z`)
  if (
    !Number.isFinite(value) ||
    new Date(value).toISOString().slice(0, 10) !== input ||
    input < '1900-01-01' ||
    input > '2200-12-31'
  )
    return invalid(field, '日期无效')
  return value / 86400000
}
export const calculateHalfDayUnits = (fields: LeaveFields): number => {
  const first =
    dateNumber(fields.startDate, 'startDate') * 2 +
    (fields.startSlot === 'pm' ? 1 : 0)
  const last =
    dateNumber(fields.endDate, 'endDate') * 2 +
    (fields.endSlot === 'pm' ? 1 : 0)
  const units = last - first + 1
  if (units < 1) return invalid('endDate', '结束时间不能早于开始时间')
  if (units > 732) return invalid('endDate', '单次请假不得超过 366 天')
  return units
}
export const parseLeaveFields = (
  input: unknown,
  allowEmptyReason = false
): LeaveFields => {
  const body = record(input)
  onlyKeys(body, [
    'leaveType',
    'startDate',
    'startSlot',
    'endDate',
    'endSlot',
    'reason',
  ])
  const fields: LeaveFields = {
    leaveType: enumValue(
      body.leaveType,
      ['personal', 'sick', 'annual'],
      'leaveType'
    ),
    startDate: text(body.startDate, 'startDate', 10),
    startSlot: enumValue(body.startSlot, ['am', 'pm'], 'startSlot'),
    endDate: text(body.endDate, 'endDate', 10),
    endSlot: enumValue(body.endSlot, ['am', 'pm'], 'endSlot'),
    reason:
      allowEmptyReason && body.reason === ''
        ? ''
        : text(body.reason, 'reason', 2000),
  }
  calculateHalfDayUnits(fields)
  return fields
}
export const parseCommand = (
  input: unknown,
  commentRequired = false
): Command => {
  const body = record(input)
  onlyKeys(body, ['expectedRevision', 'comment'])
  const comment = body.comment === undefined ? '' : body.comment
  if (typeof comment !== 'string' || comment.length > 2000)
    return invalid('comment', '处理意见长度不得超过 2000')
  if (commentRequired && !comment.trim())
    return invalid('comment', '驳回必须填写处理意见')
  return {
    expectedRevision: positiveInteger(body.expectedRevision),
    comment: comment.trim(),
  }
}
const formatVersion = (input: unknown) => {
  if (input !== undefined && input !== 1)
    return invalid('version', '不支持该配置格式版本')
  return 1
}
const strings = (input: unknown, field: string): string[] => {
  if (!Array.isArray(input) || input.length > 100)
    return invalid(field, `${field} 必须是有限的数组`)
  const result = input.map((value) => text(value, field, 100))
  if (new Set(result).size !== result.length)
    return invalid(field, `${field} 含重复人员`)
  return result
}
export const parseWorkflow = (input: unknown): WorkflowSchema => {
  const body = record(input, 'schema')
  onlyKeys(body, ['version', 'nodes', 'edges'])
  if (
    !Array.isArray(body.nodes) ||
    !Array.isArray(body.edges) ||
    body.nodes.length > 100 ||
    body.edges.length > 100
  )
    return invalid('nodes', '流程节点和连线必须是有限的数组')
  const nodes = body.nodes.map((item): WorkflowNode => {
    const node = record(item, 'node')
    onlyKeys(node, ['id', 'type', 'name', 'config', 'x', 'y'])
    const config = record(node.config || {}, 'config')
    onlyKeys(config, ['approvers', 'ccUsers', 'formId'])
    const parsed: WorkflowNode = {
      id: text(node.id, 'node.id', 100),
      type: enumValue(
        node.type,
        ['start', 'approval', 'copy', 'end', 'condition', 'parallel'],
        'node.type'
      ),
      name: text(node.name, 'node.name', 100),
      config: {},
    }
    if (config.approvers !== undefined)
      parsed.config.approvers = strings(config.approvers, 'approvers')
    if (config.ccUsers !== undefined)
      parsed.config.ccUsers = strings(config.ccUsers, 'ccUsers')
    if (config.formId !== undefined)
      parsed.config.formId = text(config.formId, 'formId', 100)
    if (typeof node.x === 'number' && Number.isFinite(node.x)) parsed.x = node.x
    if (typeof node.y === 'number' && Number.isFinite(node.y)) parsed.y = node.y
    return parsed
  })
  const edges = body.edges.map((item) => {
    const edge = record(item, 'edge')
    onlyKeys(edge, ['id', 'source', 'target', 'label'])
    return {
      id: text(edge.id, 'edge.id', 100),
      source: text(edge.source, 'edge.source', 100),
      target: text(edge.target, 'edge.target', 100),
      label: typeof edge.label === 'string' ? edge.label.slice(0, 100) : '',
    }
  })
  return { version: formatVersion(body.version), nodes, edges }
}
const jsonValue = (input: unknown, depth = 0): Json => {
  if (depth > 12) return invalid('schema', '配置嵌套过深')
  if (input === null || typeof input === 'boolean' || typeof input === 'string')
    return input
  if (typeof input === 'number' && Number.isFinite(input)) return input
  if (Array.isArray(input) && input.length <= 100)
    return input.map((v) => jsonValue(v, depth + 1))
  const value = record(input, 'schema')
  const result: JsonObject = {}
  Object.keys(value).forEach((key) => {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      invalid('schema', '禁止配置原型字段')
    result[key] = jsonValue(value[key], depth + 1)
  })
  return result
}
export const parseForm = (input: unknown): FormSchema => {
  const body = record(input, 'schema')
  onlyKeys(body, ['version', 'formConfig', 'widgetsConfig', 'dataSources'])
  const fc = record(body.formConfig || {}, 'formConfig')
  onlyKeys(fc, ['size', 'layout', 'labelAlign', 'computedFields'])
  if (!Array.isArray(body.widgetsConfig) || body.widgetsConfig.length > 50)
    return invalid('widgetsConfig', '表单控件必须是有限的数组')
  if (
    body.dataSources !== undefined &&
    (!Array.isArray(body.dataSources) || body.dataSources.length !== 0)
  )
    return invalid('dataSources', 'R1 请假表单不支持远程数据源')
  const widgetIds = new Set<string>()
  const widgetsConfig = body.widgetsConfig.map((item): FormWidget => {
    const widget = record(item, 'widget')
    onlyKeys(widget, ['uid', 'type', 'name', 'config'])
    const uid = text(widget.uid, 'widget.uid', 100)
    if (widgetIds.has(uid)) return invalid(uid, '控件标识重复')
    widgetIds.add(uid)
    const config = record(widget.config || {}, 'config')
    onlyKeys(config, [
      'id',
      'valueType',
      'min',
      'max',
      'label',
      'required',
      'disabled',
      'readonly',
      'placeholder',
      'width',
      'allowClear',
      'maxLength',
      'showWordLimit',
      'optionsType',
      'options',
      'type',
      'direction',
      'defaultValue',
      'format',
      'size',
      'showTime',
      'modeSelection',
      'error',
    ])
    if (
      config.valueType !== undefined &&
      !['text', 'integer', 'decimal'].includes(String(config.valueType))
    )
      invalid(uid, '字段数值类型不受支持')
    if (
      ['min', 'max'].some(
        (key) =>
          config[key] !== undefined &&
          (typeof config[key] !== 'number' ||
            !Number.isFinite(config[key]) ||
            Number(config[key]) < 0 ||
            Number(config[key]) > 1000000000)
      )
    )
      invalid(uid, '数值范围无效')
    if (
      typeof config.min === 'number' &&
      typeof config.max === 'number' &&
      config.min > config.max
    )
      invalid(uid, '数值上下限无效')
    if (config.id !== undefined && config.id !== uid)
      invalid(uid, 'R1 业务字段标识不能改变')
    if (config.optionsType !== undefined && config.optionsType !== 'fixed')
      return invalid('optionsType', 'R1 仅支持固定选项')
    return {
      uid,
      type: enumValue(
        widget.type,
        ['input', 'select', 'radio', 'date-picker', 'textarea'],
        'widget.type'
      ),
      name: text(widget.name, 'widget.name', 100),
      config: jsonValue(config) as JsonObject,
    }
  })
  let computedFields: ComputedMoneyField[] | undefined
  if (fc.computedFields !== undefined) {
    if (!Array.isArray(fc.computedFields) || fc.computedFields.length > 10)
      invalid('computedFields', '计算字段数量无效')
    const ids = new Set(widgetIds)
    computedFields = (fc.computedFields as unknown[]).map((calculation) => {
      const rule = record(calculation, 'computedField')
      onlyKeys(rule, ['id', 'operation', 'quantity', 'price'])
      const id = text(rule.id, 'computedField.id', 100)
      const quantity = text(rule.quantity, 'quantity', 100)
      const price = text(rule.price, 'price', 100)
      if (ids.has(id)) invalid(id, '计算字段标识重复')
      ids.add(id)
      if (
        rule.operation !== 'quantity-times-price' ||
        widgetsConfig.find((w) => w.uid === quantity)?.config.valueType !==
          'integer' ||
        widgetsConfig.find((w) => w.uid === price)?.config.valueType !==
          'decimal'
      )
        invalid(
          id,
          '仅支持已登记整数数量与金额的乘法，不能执行脚本或任意表达式'
        )
      return { id, operation: 'quantity-times-price' as const, quantity, price }
    })
  }
  return {
    version: formatVersion(body.version),
    formConfig: {
      ...(computedFields === undefined ? {} : { computedFields }),
      size: enumValue(
        fc.size || 'medium',
        ['mini', 'small', 'medium', 'large'],
        'size'
      ),
      layout: enumValue(
        fc.layout || 'vertical',
        ['vertical', 'horizontal'],
        'layout'
      ),
      labelAlign: enumValue(
        fc.labelAlign || 'right',
        ['left', 'right'],
        'labelAlign'
      ),
    },
    widgetsConfig,
    dataSources: [],
  }
}
export const validateLeaveForm = (schema: FormSchema) => {
  const choices: Record<string, string[]> = {
    leaveType: ['personal', 'sick', 'annual'],
    startSlot: ['am', 'pm'],
    endSlot: ['am', 'pm'],
  }
  const types: Record<string, string[]> = {
    leaveType: ['select', 'radio'],
    startDate: ['date-picker'],
    startSlot: ['select', 'radio'],
    endDate: ['date-picker'],
    endSlot: ['select', 'radio'],
    reason: ['textarea', 'input'],
  }
  Object.keys(types).forEach((key) => {
    const field = schema.widgetsConfig.find((widget) => widget.uid === key)
    if (
      !field ||
      !types[key].includes(field.type) ||
      field.config.required !== true ||
      field.config.disabled === true ||
      field.config.readonly === true
    )
      invalid(key, `请假表单缺少可填写的必填字段 ${key}`)
    if (
      field &&
      ['startDate', 'endDate'].includes(key) &&
      ((field.config.modeSelection !== undefined &&
        field.config.modeSelection !== 'date') ||
        field.config.showTime === true)
    )
      invalid(key, '请假日期字段必须按日选择')
    if (field && choices[key]) {
      const list = field.config.options
      if (
        !Array.isArray(list) ||
        field.config.optionsType !== 'fixed' ||
        list.length !== choices[key].length
      )
        invalid(key, '表单选项必须与业务定义一致')
      const values = (list as Json[]).map((option) => {
        if (
          !option ||
          typeof option !== 'object' ||
          Array.isArray(option) ||
          typeof option.value !== 'string' ||
          typeof option.label !== 'string' ||
          !option.label.trim()
        )
          return invalid(key, '表单选项无效')
        return option.value
      })
      if (
        new Set(values).size !== values.length ||
        choices[key].some((value) => !values.includes(value))
      )
        invalid(key, '表单选项必须与业务定义一致')
    }
    if (
      field &&
      key === 'reason' &&
      field.config.maxLength !== undefined &&
      (typeof field.config.maxLength !== 'number' ||
        !Number.isInteger(field.config.maxLength) ||
        field.config.maxLength < 1 ||
        field.config.maxLength > 2000)
    )
      invalid(key, '事由长度限制必须在 1 到 2000 之间')
  })
  if (schema.widgetsConfig.length !== Object.keys(types).length)
    invalid('widgetsConfig', 'R1 请假表单只支持约定业务字段')
}
export const SELF_SERVICE_PERMISSIONS = [
  'account:password:update',
  'message:list',
  'message:read',
  'message:batch-read',
]
export const withSelfServicePermissions = (owned: string[]) => [
  ...new Set([...owned, ...SELF_SERVICE_PERMISSIONS]),
]
export const LEAVE_PERMISSIONS = {
  read: 'leave:read:self',
  create: 'leave:create',
  update: 'leave:update:self',
  submit: 'leave:submit',
  withdraw: 'leave:withdraw:self',
  todo: 'workflow:todo',
  approve: 'workflow:approve',
  reject: 'workflow:reject',
  configure: 'application:configure',
  publish: 'application:publish',
  rollback: 'application:rollback',
  audit: 'audit:read',
} as const
const employeePermissions = [
  LEAVE_PERMISSIONS.read,
  LEAVE_PERMISSIONS.create,
  LEAVE_PERMISSIONS.update,
  LEAVE_PERMISSIONS.submit,
  LEAVE_PERMISSIONS.withdraw,
]
export interface DemoIdentity {
  id: string
  username: string
  name: string
  kind: 'employee' | 'manager' | 'administrator' | 'auditor'
  role: UserRole
  tenantIds: string[]
  permissions: string[]
}
export const demoIdentities: DemoIdentity[] = ['a', 'b'].flatMap((tenant) => [
  {
    id: `${tenant}-employee`,
    username: `${tenant}-employee`,
    name: `${tenant.toUpperCase()} 员工`,
    kind: 'employee' as const,
    role: 'user' as const,
    tenantIds: [`tenant-${tenant}`],
    permissions: [...employeePermissions],
  },
  ...[1, 2].map((i) => ({
    id: `${tenant}-manager-${i}`,
    username: `${tenant}-manager-${i}`,
    name: `${tenant.toUpperCase()} 主管 ${i}`,
    kind: 'manager' as const,
    role: 'operator' as const,
    tenantIds: [`tenant-${tenant}`],
    permissions: [
      ...employeePermissions,
      LEAVE_PERMISSIONS.todo,
      LEAVE_PERMISSIONS.approve,
      LEAVE_PERMISSIONS.reject,
    ],
  })),
  {
    id: `${tenant}-admin`,
    username: `${tenant}-admin`,
    name: `${tenant.toUpperCase()} 配置管理员`,
    kind: 'administrator' as const,
    role: 'admin' as const,
    tenantIds: [`tenant-${tenant}`],
    permissions: [
      LEAVE_PERMISSIONS.configure,
      LEAVE_PERMISSIONS.publish,
      LEAVE_PERMISSIONS.rollback,
    ],
  },
  {
    id: `${tenant}-auditor`,
    username: `${tenant}-auditor`,
    name: `${tenant.toUpperCase()} 审计员`,
    kind: 'auditor' as const,
    role: 'user' as const,
    tenantIds: [`tenant-${tenant}`],
    permissions: [LEAVE_PERMISSIONS.audit],
  },
])
demoIdentities.push({
  id: 'cross-tenant-employee',
  username: 'cross-tenant-employee',
  name: '跨租户演示员工',
  kind: 'employee',
  role: 'user',
  tenantIds: ['tenant-a', 'tenant-b'],
  permissions: [...employeePermissions],
})
demoIdentities.forEach((identity) => {
  identity.permissions = withSelfServicePermissions(identity.permissions)
})
export const serialWorkflow = (
  first: string,
  second: string,
  copied?: string
): WorkflowSchema => ({
  version: 1,
  nodes: [
    { id: 'start', type: 'start', name: '开始', config: {} },
    {
      id: 'approval-1',
      type: 'approval',
      name: '部门主管审批',
      config: { approvers: [first] },
    },
    {
      id: 'approval-2',
      type: 'approval',
      name: '复核主管审批',
      config: { approvers: [second] },
    },
    ...(copied
      ? [
          {
            id: 'copy',
            type: 'copy' as const,
            name: '抄送',
            config: { ccUsers: [copied] },
          },
        ]
      : []),
    { id: 'end', type: 'end', name: '结束', config: {} },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'approval-1', label: '' },
    { id: 'e2', source: 'approval-1', target: 'approval-2', label: '' },
    {
      id: 'e3',
      source: 'approval-2',
      target: copied ? 'copy' : 'end',
      label: '',
    },
    ...(copied ? [{ id: 'e4', source: 'copy', target: 'end', label: '' }] : []),
  ],
})
const options = (values: string[], labels: string[]) =>
  values.map((value, i) => ({ value, label: labels[i] }))
export const LEAVE_FORM: FormSchema = {
  version: 1,
  formConfig: { size: 'medium', layout: 'vertical', labelAlign: 'right' },
  dataSources: [],
  widgetsConfig: [
    {
      uid: 'leaveType',
      type: 'select',
      name: '请假类型',
      config: {
        label: '请假类型',
        required: true,
        optionsType: 'fixed',
        options: options(
          ['personal', 'sick', 'annual'],
          ['事假', '病假', '年假']
        ),
      },
    },
    {
      uid: 'startDate',
      type: 'date-picker',
      name: '开始日期',
      config: { label: '开始日期', required: true },
    },
    {
      uid: 'startSlot',
      type: 'radio',
      name: '开始时段',
      config: {
        label: '开始时段',
        required: true,
        type: 'radio',
        direction: 'horizontal',
        optionsType: 'fixed',
        options: options(['am', 'pm'], ['上午', '下午']),
      },
    },
    {
      uid: 'endDate',
      type: 'date-picker',
      name: '结束日期',
      config: { label: '结束日期', required: true },
    },
    {
      uid: 'endSlot',
      type: 'radio',
      name: '结束时段',
      config: {
        label: '结束时段',
        required: true,
        type: 'radio',
        direction: 'horizontal',
        optionsType: 'fixed',
        options: options(['am', 'pm'], ['上午', '下午']),
      },
    },
    {
      uid: 'reason',
      type: 'textarea',
      name: '请假事由',
      config: {
        label: '请假事由',
        required: true,
        maxLength: 2000,
        showWordLimit: true,
      },
    },
  ],
}
