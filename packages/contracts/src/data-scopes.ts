import { invalid, onlyKeys, positiveInteger, record } from './schemas'

export const DATA_SCOPE_PERMISSIONS = {
  view: 'data-permission:view',
  update: 'data-permission:update',
  preview: 'data-permission:preview',
} as const
export const MEMBER_SCOPE_FIELDS = [
  'username',
  'name',
  'dept',
  'status',
  'phone',
  'email',
] as const
export type RowScope =
  | 'all'
  | 'tenant'
  | 'department'
  | 'department-and-children'
  | 'self'
export interface MemberScopeRule {
  roleId: string
  roleName: string
  dataScope: RowScope
  departmentIds: string[]
  fieldPermissions: string[]
  revision: number
  updatedAt: string
}
export interface MemberScopeInput {
  dataScope: RowScope
  departmentIds: string[]
  fieldPermissions: string[]
  expectedRevision: number
}
export const parseMemberScope = (input: unknown): MemberScopeInput => {
  const body = record(input)
  onlyKeys(body, [
    'dataScope',
    'departmentIds',
    'fieldPermissions',
    'expectedRevision',
  ])
  if (
    ![
      'all',
      'tenant',
      'department',
      'department-and-children',
      'self',
    ].includes(String(body.dataScope))
  )
    invalid('dataScope', '数据范围无效')
  if (
    !Array.isArray(body.departmentIds) ||
    body.departmentIds.length > 100 ||
    body.departmentIds.some(
      (id) => typeof id !== 'string' || !id || id.length > 100
    ) ||
    new Set(body.departmentIds).size !== body.departmentIds.length
  )
    invalid('departmentIds', '部门选择无效或重复')
  if (
    !['department', 'department-and-children'].includes(
      String(body.dataScope)
    ) &&
    (body.departmentIds as string[]).length
  )
    invalid('departmentIds', '当前范围不能指定部门')
  if (
    !Array.isArray(body.fieldPermissions) ||
    body.fieldPermissions.some(
      (field) => !MEMBER_SCOPE_FIELDS.includes(field)
    ) ||
    new Set(body.fieldPermissions).size !== body.fieldPermissions.length
  )
    invalid('fieldPermissions', '字段必须来自当前成员资源目录')
  return {
    dataScope: body.dataScope as RowScope,
    departmentIds: [...(body.departmentIds as string[])].sort(),
    fieldPermissions: [...(body.fieldPermissions as string[])].sort(),
    expectedRevision: positiveInteger(body.expectedRevision),
  }
}
