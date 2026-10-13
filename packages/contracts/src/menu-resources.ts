import { createR1Menu } from './menu'
import { DomainError, record, onlyKeys, text, positiveInteger } from './schemas'

export const MENU_PERMISSIONS = {
  list: 'system:menu:list',
  detail: 'system:menu:detail',
  create: 'system:menu:create',
  update: 'system:menu:update',
  delete: 'system:menu:delete',
} as const
export interface MenuRouteDefinition {
  key: string
  path: string
  componentKey: string
  parentKey: string | null
  locale: string
  permissions: string[]
  mode: 'any' | 'all'
  type: 'catalog' | 'menu'
  order: number
  protected: boolean
}
const catalogue: MenuRouteDefinition[] = []
const collect = (
  nodes: ReturnType<typeof createR1Menu>,
  parent: MenuRouteDefinition | null
) => {
  nodes.forEach((node) => {
    const path = node.path.startsWith('/')
      ? node.path
      : `${parent?.path || ''}/${node.path}`
    const item: MenuRouteDefinition = {
      key: node.name,
      path,
      componentKey: node.componentKey,
      parentKey: parent?.key || null,
      locale: node.meta.locale,
      permissions: node.meta.access?.permissions || [],
      mode: node.meta.access?.mode || 'any',
      type: node.children?.length ? 'catalog' : 'menu',
      order: node.meta.order || 0,
      protected: [
        'dashboard',
        'workplace',
        'system',
        'menuSystem',
        'user',
        'accountPassword',
      ].includes(node.name),
    }
    catalogue.push(item)
    if (node.children) collect(node.children, item)
  })
}
collect(createR1Menu(['*']), null)
export const MENU_ROUTE_CATALOGUE: ReadonlyArray<MenuRouteDefinition> =
  catalogue
export const MENU_ROUTE_ALIASES: Readonly<
  Record<string, { routeKey: string; permissions: string[] }>
> = {
  applicationConfiguration: {
    routeKey: 'applicationCenter',
    permissions: ['application:configure'],
  },
  businessRecordDetail: {
    routeKey: 'businessRecordsList',
    permissions: [
      'business:read:self',
      'workflow:todo',
      'workflow:approve',
      'workflow:reject',
    ],
  },
  leaveDetail: {
    routeKey: 'leaveRequests',
    permissions: ['leave:read:self', 'workflow:todo'],
  },
  formDesign: {
    routeKey: 'leaveApplication',
    permissions: ['application:configure'],
  },
  workflowDesign: {
    routeKey: 'leaveApplication',
    permissions: ['application:configure'],
  },
  lowCodeRuntime: {
    routeKey: 'lowCodeRuntimePages',
    permissions: ['low-code:page:run'],
  },
}
export interface MenuResourceInput {
  menuName: string
  menuType: 'catalog' | 'menu' | 'button'
  routeKey?: string
  parentId: string | null
  permission: string
  sort: number
  status: 'enabled' | 'disabled'
  expectedRevision?: number
}
export const parseMenuResource = (
  input: unknown,
  update = false
): MenuResourceInput => {
  const body = record(input)
  onlyKeys(body, [
    'menuName',
    'menuType',
    'routeKey',
    'parentId',
    'permission',
    'sort',
    'status',
    ...(update ? ['expectedRevision'] : []),
  ])
  const menuName = text(body.menuName, 'menuName', 100)
  if (
    !['catalog', 'menu', 'button'].includes(String(body.menuType)) ||
    !['enabled', 'disabled'].includes(String(body.status))
  )
    throw new DomainError(422, 'MENU_INVALID', '菜单类型或状态无效')
  const menuType = body.menuType as MenuResourceInput['menuType']
  const parentId =
    body.parentId === null ? null : text(body.parentId, 'parentId', 100)
  const { sort } = body
  if (!Number.isSafeInteger(sort) || Number(sort) < 0 || Number(sort) > 100000)
    throw new DomainError(422, 'MENU_INVALID', '排序必须为0至100000整数')
  const routeKey =
    body.routeKey === undefined
      ? undefined
      : text(body.routeKey, 'routeKey', 100)
  const permission = body.permission === undefined ? '' : body.permission
  if (
    typeof permission !== 'string' ||
    permission.length > 100 ||
    permission === '*'
  )
    throw new DomainError(422, 'MENU_INVALID', '权限字符无效')
  if (
    !update &&
    routeKey &&
    MENU_ROUTE_CATALOGUE.some(
      (route) => route.key === routeKey && route.protected
    )
  )
    throw new DomainError(
      422,
      'MENU_GOVERNANCE_PROTECTED',
      '保护入口不能重复登记'
    )
  if (menuType === 'menu') {
    if (
      !MENU_ROUTE_CATALOGUE.some(
        (route) => route.key === routeKey && route.type === 'menu'
      )
    )
      throw new DomainError(422, 'MENU_ROUTE_UNREGISTERED', '仅允许已登记页面')
    if (permission)
      throw new DomainError(
        422,
        'MENU_PERMISSION_IMMUTABLE',
        '页面基础权限由登记目录固定'
      )
  } else if (menuType === 'catalog') {
    if (
      (routeKey &&
        !MENU_ROUTE_CATALOGUE.some(
          (route) => route.key === routeKey && route.type === 'catalog'
        )) ||
      permission
    )
      throw new DomainError(422, 'MENU_INVALID', '自定义目录不能声明组件或权限')
  } else if (routeKey || !permission || !parentId)
    throw new DomainError(
      422,
      'MENU_INVALID',
      '按钮必须属于菜单并引用已登记权限'
    )
  return {
    menuName,
    menuType,
    routeKey,
    parentId,
    permission,
    sort: Number(sort),
    status: body.status as MenuResourceInput['status'],
    ...(update
      ? { expectedRevision: positiveInteger(body.expectedRevision) }
      : {}),
  }
}
export interface MenuResourceRecord extends MenuResourceInput {
  id: string
  revision: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  protected: boolean
  path: string
  componentKey: string
  permissions: string[]
}
