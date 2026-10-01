import { invalid, onlyKeys, record, text, positiveInteger } from './schemas'

export const DEPARTMENT_PERMISSIONS = {
  list: 'system:department:list',
  detail: 'system:department:detail',
  create: 'system:department:create',
  update: 'system:department:update',
  delete: 'system:department:delete',
} as const

export interface Department {
  id: string
  parentId: string | null
  departmentName: string
  leader: string
  sort: number
  status: 'enabled' | 'disabled'
  revision: number
  createdAt: string
  updatedAt: string
}
export interface DepartmentInput {
  departmentName: string
  leader: string
  sort: number
  status: 'enabled' | 'disabled'
  parentId?: string | null
  expectedRevision?: number
}
export const parseDepartment = (
  input: unknown,
  update = false
): DepartmentInput => {
  const body = record(input)
  onlyKeys(body, [
    'departmentName',
    'leader',
    'sort',
    'status',
    'parentId',
    ...(update ? ['expectedRevision'] : []),
  ])
  const departmentName = text(body.departmentName, 'departmentName', 100)
  if (typeof body.leader !== 'string' || body.leader.length > 100)
    invalid('leader', '负责人名称无效')
  if (
    typeof body.sort !== 'number' ||
    !Number.isSafeInteger(body.sort) ||
    body.sort < 0 ||
    body.sort > 100000
  )
    invalid('sort', '排序必须是 0 到 100000 的整数')
  if (body.status !== 'enabled' && body.status !== 'disabled')
    invalid('status', '部门状态无效')
  return {
    departmentName,
    leader: (body.leader as string).trim(),
    sort: body.sort as number,
    status: body.status as DepartmentInput['status'],
    ...(body.parentId === undefined
      ? {}
      : {
          parentId:
            body.parentId === null
              ? null
              : text(body.parentId, 'parentId', 100),
        }),
    ...(update
      ? { expectedRevision: positiveInteger(body.expectedRevision) }
      : {}),
  }
}
