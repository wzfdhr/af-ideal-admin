import type { AuditEventType, AuditSelectedDetailV1 } from '@af-admin/contracts'

type DetailKind = 'id' | 'code' | 'integer' | 'boolean' | 'word' | 'percent'
interface AuditRule {
  module: string
  action: string
  eventType: AuditEventType
  detail: Record<string, DetailKind>
  failure: boolean
  ownerKind: '' | 'schedule' | 'export' | 'message' | 'timer'
}
const rules: AuditRule[] = []
const register = (
  module: string,
  actions: string[],
  detail: Record<string, DetailKind> = {},
  eventType: AuditEventType = 'operation',
  ownerKind: AuditRule['ownerKind'] = '',
  failure = false
) => {
  actions.forEach((action) =>
    rules.push({ module, action, detail, eventType, ownerKind, failure })
  )
}
register('auth', ['login', 'logout', 'password.change'], {}, 'security')
register(
  'authorization',
  ['data-scope.update'],
  { dataScope: 'word' },
  'permission'
)
register(
  'system',
  [
    'role.create',
    'role.update',
    'role.delete',
    'authorization.update',
    'organization.assign',
    'menu.create',
    'menu.update',
    'menu.delete',
    'menu.reorder',
  ],
  {},
  'permission'
)
register('system', ['user.password-reset'], {}, 'security')
register(
  'system',
  [
    'user.create',
    'user.update',
    'user.delete',
    'department.create',
    'department.update',
    'department.delete',
    'position.create',
    'position.update',
    'position.delete',
    'dictionary.create',
    'dictionary.update',
    'dictionary.items-update',
    'dictionary.delete',
  ],
  { revision: 'integer', parentId: 'id', previousParentId: 'id' }
)
register(
  'application',
  [
    'application.create',
    'application.metadata',
    'application.archive',
    'application.restore',
    'save-draft',
    'form-source.create',
    'form-source.update',
  ],
  { revision: 'integer' }
)
register('application', ['application.copy'], {
  sourceApplicationId: 'id',
  sourceReleaseId: 'id',
})
register('application', ['publish', 'activate-release'], {
  releaseId: 'id',
  releaseVersion: 'integer',
})
register('application', ['package.pages-staged', 'package.pages-bound'], {
  applicationId: 'id',
  applicationReleaseId: 'id',
})
register(
  'application',
  ['application.package-export'],
  { formatVersion: 'integer' },
  'export'
)
register('application', ['application.package-import'], {
  formatVersion: 'integer',
})
register('leave', ['create-draft', 'save-draft', 'submit', 'withdraw'])
register('business', ['create', 'update'])
register('business', ['submit'], { instanceId: 'id' })
register('workflow', ['approve', 'reject'], {
  requestId: 'id',
  instanceId: 'id',
})
register('workflow', ['transfer', 'recover', 'recover-next'], {
  taskId: 'id',
  nodeId: 'id',
})
register('workflow', ['route'], { nodeId: 'id', branch: 'word' })
register('workflow', ['timer.retry'], { instanceId: 'id', nodeId: 'id' })
register(
  'workflow',
  ['timer.resume', 'timer.deadline', 'timer.failure'],
  { instanceId: 'id', attempt: 'integer', businessCode: 'code' },
  'operation',
  'timer'
)
register('file', [
  'file.upload-init',
  'file.upload-cancel',
  'file.scan-retry',
  'file.upload-complete',
  'file.preview',
  'file.download',
  'file.delete',
  'file.scan-clean',
  'file.scan-infected',
  'file.scan-failed',
])
register('low-code', [
  'page.create',
  'page.generate',
  'page.save',
  'page.status',
  'source.create',
  'source.update',
])
register('low-code', ['page.publish', 'page.rollout'], {
  releaseId: 'id',
  percent: 'percent',
})
register(
  'low-code',
  [
    'runtime.create',
    'runtime.update',
    'runtime.submit',
    'runtime.withdraw',
    'runtime.copy',
  ],
  { actionId: 'id', releaseId: 'id', recordId: 'id', operation: 'word' }
)
register(
  'report',
  [
    'definition.create',
    'definition.update',
    'definition.publish',
    'definition.enable',
    'definition.disable',
    'query',
  ],
  {
    sourceApplicationId: 'id',
    versionId: 'id',
    sourceReleaseId: 'id',
    sourceReleaseVersion: 'integer',
  }
)
register(
  'report-export',
  [
    'report-export.created',
    'report-export.claimed',
    'report-export.completed',
    'report-export.infected',
    'report-export.failed',
    'report-export.blocked',
    'report-export.retry-scheduled',
    'report-export.attempts-exhausted',
    'report-export.expired',
    'report-export.retry',
    'report-export.cancel',
    'report-export.archive',
    'report-export.download',
  ],
  {
    code: 'code',
    stage: 'word',
    attempt: 'integer',
    format: 'word',
    definitionVersionId: 'id',
    archived: 'boolean',
    scheduleRunId: 'id',
  },
  'export',
  'export'
)
register(
  'report-schedule',
  [
    'created',
    'version.updated',
    'enabled',
    'disabled',
    'run.retry',
    'run.cancel',
    'run.materialized',
    'run.waiting-exports',
    'run.completed',
    'run.cancelled',
    'recipients.fixed',
    'recipient.plan-created',
    'recipient.completed',
    'run.alert-persisted',
  ].map((action) => `report-schedule.${action}`),
  { code: 'code', status: 'word', exportJobId: 'id' },
  'operation',
  'schedule'
)
register(
  'report-schedule',
  [
    'run.failed',
    'run.blocked',
    'run.partial-failed',
    'run.resolve-failed',
    'run.attempts-exhausted',
    'recipient.failed',
    'recipient.blocked',
    'recipient.attempts-exhausted',
  ].map((action) => `report-schedule.${action}`),
  { code: 'code', status: 'word' },
  'operation',
  'schedule',
  true
)
register(
  'data-screen',
  [
    'created',
    'copied',
    'updated',
    'published',
    'rolled-back',
    'toggled',
    'archived',
  ].map((action) => `data-screen.${action}`),
  { originalId: 'id', releaseId: 'id', version: 'integer', enabled: 'boolean' }
)
register(
  'messaging',
  [
    'template.create',
    'template.update',
    'template.submit',
    'template.approve',
    'template.reject',
    'template.enable',
    'template.disable',
    'template.restore',
    'template.archive',
    'send.create',
    'send.retry',
    'send.cancel',
    'announcement.create',
    'announcement.update',
    'announcement.publish',
    'announcement.revoke',
    'subscription.update',
  ],
  {
    reviewId: 'id',
    templateId: 'id',
    versionId: 'id',
    jobId: 'id',
    subscribed: 'boolean',
  }
)
register(
  'messaging',
  ['delivery.sent', 'delivery.failure'],
  { jobId: 'id', attempt: 'integer', businessCode: 'code' },
  'operation',
  'message'
)
// Failure paths are registered routes, never a client-controlled actual URL or JSON path.
register(
  'request',
  [
    '/api/audit/events',
    '/api/leave-requests/:id/submit',
    '/api/workflow-tasks/:id/approve',
    '/api/workflow-tasks/:id/reject',
    '/api/business/records/:id/submit',
    '/api/reporting/versions/:id/query',
  ],
  { businessCode: 'code' }
)
register(
  'request',
  [
    '/api/system/users/:id/authorization',
    '/api/system/roles/:id',
    '/api/data-scopes/roles/:id',
  ],
  { businessCode: 'code' },
  'permission'
)

export const auditPolicyRows = rules.map((rule) => ({
  ...rule,
  detailKeys: Object.keys(rule.detail),
}))
const moduleLabels: Record<string, string> = {
  'auth': '身份安全',
  'authorization': '数据权限',
  'system': '系统治理',
  'application': '应用配置',
  'leave': '请假申请',
  'business': '业务申请',
  'workflow': '流程执行',
  'file': '文件管理',
  'low-code': '低代码页面',
  'report': '真实报表',
  'report-export': '报表导出',
  'report-schedule': '报表调度',
  'data-screen': '真实大屏',
  'messaging': '消息治理',
  'request': '请求失败',
}
export const auditCatalogue = Array.from(
  new Set(rules.map((rule) => rule.module))
)
  .sort()
  .map((module) => ({
    module,
    label: moduleLabels[module] || module,
    actions: rules
      .filter((rule) => rule.module === module)
      .map((rule) => ({ action: rule.action, eventType: rule.eventType })),
  }))
const byIdentity = new Map(
  rules.map((rule) => [`${rule.module}\0${rule.action}`, rule])
)
const validScalar = (kind: DetailKind, value: unknown) => {
  if (kind === 'boolean') return typeof value === 'boolean'
  if (kind === 'integer' || kind === 'percent')
    return (
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= (kind === 'percent' ? 100 : 1000000000)
    )
  if (typeof value !== 'string') return false
  if (kind === 'code') return /^[A-Z][A-Z0-9_]{0,99}$/.test(value)
  if (kind === 'id') return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(value)
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)
}
/** Never return arbitrary old detail objects, free text, credentials, hashes or captured rows/counts. */
export const projectAuditDetail = (
  module: string,
  action: string,
  input: unknown
): AuditSelectedDetailV1 => {
  const rule = byIdentity.get(`${module}\0${action}`)
  if (!rule || !input || typeof input !== 'object' || Array.isArray(input))
    return {}
  return Object.fromEntries(
    Object.entries(rule.detail).flatMap(([key, kind]) => {
      const value = (input as Record<string, unknown>)[key]
      return validScalar(kind, value)
        ? [[key, value as string | number | boolean]]
        : []
    })
  )
}
