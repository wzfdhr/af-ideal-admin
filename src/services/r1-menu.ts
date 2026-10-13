import { hasPermission } from '@af-admin/workflow-core'
import type { MenuLikeNode } from './access'

const pagePermissions: Record<string, string[]> = {
  workplace: [],
  lowCodeBuilder: ['low-code:page:list'],
  lowCodeRuntimePages: ['low-code:page:run'],
  lowCodeRuntime: ['low-code:page:run'],
  fileResourceCenter: ['file:list'],
  businessRecordsList: ['business:read:self'],
  businessRecordDetail: [
    'business:read:self',
    'workflow:todo',
    'workflow:approve',
    'workflow:reject',
  ],
  applicationCenter: ['application:list'],
  applicationConfiguration: ['application:configure'],
  accountPassword: ['account:password:update'],
  leaveRequests: ['leave:read:self'],
  leaveDetail: ['leave:read:self', 'workflow:todo'],
  leaveApplication: ['application:configure'],
  workflowCenter: ['workflow:todo', 'workflow:recover', 'workflow:timer:read'],
  messageCenter: ['message:list'],
  reportCenter: ['report:list', 'report:query', 'report:export:list'],
  reportSchedules: ['report:schedule:list', 'report:schedule:run:read'],
  dataScreen: ['screen:list', 'screen:run'],
  messageTemplates: [
    'message:template:list',
    'message:template:approve',
    'message:send:list',
    'message:send:create',
  ],
  messageSubscriptions: ['message:subscription:read'],
  messageAnnouncements: [
    'message:announcement:list',
    'message:announcement:read',
  ],
  auditLogs: ['audit:read'],
  auditRetention: [
    'audit:retention:manage',
    'audit:read',
    'audit:export:create',
    'audit:export:archive',
  ],
  auditExportJobs: [
    'audit:export:list',
    'audit:export:create',
    'audit:export:cancel',
    'audit:export:retry',
    'audit:export:archive',
    'audit:export:download',
  ],
  formDesign: ['application:configure'],
  workflowDesign: ['application:configure'],
  departmentSystem: ['system:department:list'],
  dictSystem: ['system:dict:list'],
  positionSystem: ['system:position:list', 'system:organization:assign'],
  userSystem: ['system:user:list'],
  menuSystem: ['system:menu:list'],
  roleSystem: ['system:role:list'],
  dataPermissionCenter: ['data-permission:view'],
}
export const canVisitR1Page = (
  name: string | symbol | null | undefined,
  permissions: string[]
) => {
  const required = typeof name === 'string' ? pagePermissions[name] : undefined
  if (required === undefined) return false
  if (!required.length) return true
  return name === 'auditRetention'
    ? required.every((code) => hasPermission(permissions, code))
    : required.some((code) => hasPermission(permissions, code))
}
export const filterR1Menus = (
  nodes: MenuLikeNode[],
  permissions: string[]
): MenuLikeNode[] =>
  nodes.flatMap((node) => {
    const children = node.children
      ? filterR1Menus(node.children, permissions)
      : []
    if (
      !children.length &&
      !canVisitR1Page(node.meta?.targetRouteName || node.name, permissions)
    )
      return []
    if (node.name === 'formDesign' || node.name === 'workflowDesign') return []
    return [{ ...node, ...(node.children ? { children } : {}) }]
  })
