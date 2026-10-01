import { hasPermission } from '@af-admin/workflow-core'
import type { MenuLikeNode } from './access'

const pagePermissions: Record<string, string[]> = {
  workplace: [],
  leaveRequests: ['leave:read:self'],
  leaveDetail: ['leave:read:self', 'workflow:todo'],
  leaveApplication: ['application:configure'],
  workflowCenter: ['workflow:todo'],
  messageCenter: ['message:list'],
  auditLogs: ['audit:read'],
  formDesign: ['application:configure'],
  workflowDesign: ['application:configure'],
  departmentSystem: ['system:department:list'],
  positionSystem: ['system:position:list', 'system:organization:assign'],
  userSystem: ['system:user:list'],
}
export const canVisitR1Page = (
  name: string | symbol | null | undefined,
  permissions: string[]
) => {
  const required = typeof name === 'string' ? pagePermissions[name] : undefined
  return (
    required !== undefined &&
    (!required.length ||
      required.some((code) => hasPermission(permissions, code)))
  )
}
export const filterR1Menus = (
  nodes: MenuLikeNode[],
  permissions: string[]
): MenuLikeNode[] =>
  nodes.flatMap((node) => {
    const children = node.children
      ? filterR1Menus(node.children, permissions)
      : []
    if (!children.length && !canVisitR1Page(node.name, permissions)) return []
    if (node.name === 'formDesign' || node.name === 'workflowDesign') return []
    return [{ ...node, ...(node.children ? { children } : {}) }]
  })
