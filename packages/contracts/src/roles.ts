import { invalid, onlyKeys, positiveInteger, record, text } from './schemas'

export const ROLE_PERMISSIONS = {
  list: 'system:role:list',
  detail: 'system:role:detail',
  create: 'system:role:create',
  update: 'system:role:update',
  delete: 'system:role:delete',
  permissions: 'system:role:permissions',
  assign: 'system:role:assign',
} as const
export interface ManagedRole {
  id: string
  roleName: string
  roleKey: string
  roleSort: number
  status: 'enabled' | 'disabled'
  remark: string
  permissions: string[]
  revision: number
  createdAt: string
  updatedAt: string
}
export interface RoleInput {
  roleName: string
  roleKey: string
  roleSort: number
  status: 'enabled' | 'disabled'
  remark: string
  permissions: string[]
  expectedRevision?: number
}
export const permissionCodes = (value: unknown): string[] => {
  if (
    !Array.isArray(value) ||
    value.length > 200 ||
    value.some(
      (code) =>
        typeof code !== 'string' || !/^[a-z][a-z0-9:-]{1,119}$/.test(code)
    )
  )
    invalid('permissions', '权限必须来自受控目录，不能使用通配或表达式')
  const codes = value as string[]
  if (new Set(codes).size !== codes.length)
    invalid('permissions', '权限不能重复')
  return [...codes].sort()
}
export const roleIds = (value: unknown): string[] => {
  if (
    !Array.isArray(value) ||
    value.length > 30 ||
    value.some((id) => typeof id !== 'string' || !id || id.length > 100) ||
    new Set(value).size !== value.length
  )
    invalid('roleIds', '角色列表无效或重复')
  return [...(value as string[])].sort()
}
export const parseRole = (input: unknown, update = false): RoleInput => {
  const body = record(input)
  onlyKeys(body, [
    'roleName',
    'roleKey',
    'roleSort',
    'status',
    'remark',
    'permissions',
    ...(update ? ['expectedRevision'] : []),
  ])
  const roleKey = text(body.roleKey, 'roleKey', 64)
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/.test(roleKey))
    invalid('roleKey', '角色标识需要2至64个字母、数字、_或-')
  if (
    typeof body.roleSort !== 'number' ||
    !Number.isSafeInteger(body.roleSort) ||
    body.roleSort < 0 ||
    body.roleSort > 100000
  )
    invalid('roleSort', '排序需要0至100000的整数')
  if (body.status !== 'enabled' && body.status !== 'disabled')
    invalid('status', '角色状态无效')
  if (
    body.remark !== undefined &&
    (typeof body.remark !== 'string' || body.remark.length > 500)
  )
    invalid('remark', '备注不能超过500字')
  return {
    roleName: text(body.roleName, 'roleName', 100),
    roleKey,
    roleSort: body.roleSort as number,
    status: body.status as RoleInput['status'],
    remark: String(body.remark || ''),
    permissions: permissionCodes(body.permissions),
    ...(update
      ? { expectedRevision: positiveInteger(body.expectedRevision) }
      : {}),
  }
}
