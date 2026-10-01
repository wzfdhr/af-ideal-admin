import {
  DEPARTMENT_PERMISSIONS,
  POSITION_PERMISSIONS,
  DomainError,
  parseDepartment,
  parsePosition,
  onlyKeys,
  record,
  text,
  positiveInteger,
} from '@af-admin/contracts'
import { assertRevision, hasPermission, requirePermission } from './workflow'
import { departmentChoices, departmentTree } from './organization-tree'
import type { Department, Position } from '@af-admin/contracts'

export interface OrganizationDemoActor {
  userId: string
  tenantId: string
  permissions: string[]
}
interface Member {
  id: string
  name: string
  departmentId: string | null
  positionId: string | null
  revision: number
  status: string
}
interface State {
  departments: Department[]
  positions: Position[]
  members: Member[]
  replays: Record<string, { signature: string; data: unknown }>
}
const clone = <T>(value: T): T => structuredClone(value)
const fail = (code: string, message: string, status = 409): never => {
  throw new DomainError(status, code, message)
}
/** Development-only memory adapter. It never handles reference API failures. */
export class OrganizationDemoStore {
  private tenants = new Map<string, State>()

  constructor(members: { id: string; name: string; tenantIds: string[] }[]) {
    members.forEach((member) =>
      member.tenantIds.forEach((tenantId) => {
        if (!this.tenants.has(tenantId))
          this.tenants.set(tenantId, {
            departments: [
              {
                id: 'business',
                parentId: null,
                departmentName: '业务部',
                leader: '',
                sort: 1,
                status: 'enabled',
                revision: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            positions: [],
            members: [],
            replays: {},
          })
        this.tenants.get(tenantId)?.members.push({
          id: member.id,
          name: member.name,
          departmentId: 'business',
          positionId: null,
          revision: 1,
          status: 'enabled',
        })
      })
    )
  }

  request(
    method: string,
    url: string,
    actor: OrganizationDemoActor,
    body?: unknown,
    key?: string
  ): unknown {
    const state = this.tenants.get(actor.tenantId)
    if (!state?.members.some((member) => member.id === actor.userId))
      fail('TENANT_FORBIDDEN', '租户不可访问', 403)
    const selected = state as State
    const uri = new URL(url, 'http://demo.local')
    const path = uri.pathname
    const verb = method.toLowerCase()
    const paged = <T>(items: T[]) => {
      const current = Number(uri.searchParams.get('current') || 1)
      const pageSize = Number(uri.searchParams.get('pageSize') || 10)
      if (
        !Number.isSafeInteger(current) ||
        current < 1 ||
        !Number.isSafeInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100
      )
        fail('VALIDATION_ERROR', '分页参数无效', 422)
      return {
        list: items.slice((current - 1) * pageSize, current * pageSize),
        total: items.length,
      }
    }
    const lookupDepartment = (id: string) =>
      selected.departments.find((item) => item.id === id) ||
      fail('NOT_FOUND', '资源不存在', 404)
    const lookupPosition = (id: string) =>
      selected.positions.find((item) => item.id === id) ||
      fail('NOT_FOUND', '资源不存在', 404)
    const availableDepartment = (id: string) => {
      const item = lookupDepartment(id)
      if (
        departmentChoices(departmentTree(selected.departments)).find(
          (option) => option.value === id
        )?.disabled
      )
        fail('DEPARTMENT_UNAVAILABLE', '部门或上级部门已停用')
      return item
    }
    const mutate = (permission: string, input: unknown, run: () => unknown) => {
      requirePermission(actor.permissions, permission)
      if (!key || key.length < 8 || key.length > 200)
        fail('VALIDATION_ERROR', '写命令必须提供有效的 Idempotency-Key', 422)
      const replayId = JSON.stringify([actor.userId, verb, path, key])
      const signature = JSON.stringify(input)
      const previous = selected.replays[replayId]
      if (previous) {
        if (previous.signature !== signature)
          fail('IDEMPOTENCY_CONFLICT', '同一个重试标识不能用于不同内容')
        return clone(previous.data)
      }
      const original = clone(selected)
      try {
        const result = run()
        selected.replays[replayId] = { signature, data: clone(result) }
        return clone(result)
      } catch (error) {
        this.tenants.set(actor.tenantId, original)
        throw error
      }
    }
    if (verb === 'get') {
      if (path === '/system/departments/tree') {
        if (
          ![
            DEPARTMENT_PERMISSIONS.list,
            POSITION_PERMISSIONS.list,
            POSITION_PERMISSIONS.create,
            POSITION_PERMISSIONS.update,
            POSITION_PERMISSIONS.assign,
          ].some((permission) => hasPermission(actor.permissions, permission))
        )
          requirePermission(actor.permissions, DEPARTMENT_PERMISSIONS.list)
        return clone(departmentTree(selected.departments))
      }
      if (path === '/system/departments') {
        requirePermission(actor.permissions, DEPARTMENT_PERMISSIONS.list)
        const name = uri.searchParams.get('departmentName') || ''
        const status = uri.searchParams.get('status') || ''
        if (status && !['enabled', 'disabled'].includes(status))
          fail('VALIDATION_ERROR', '部门状态筛选无效', 422)
        return clone(
          paged(
            [...selected.departments]
              .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
              .filter(
                (item) =>
                  item.departmentName.includes(name) &&
                  (!status || item.status === status)
              )
          )
        )
      }
      if (/^\/system\/departments\/[^/]+$/.test(path)) {
        requirePermission(actor.permissions, DEPARTMENT_PERMISSIONS.detail)
        return clone(
          lookupDepartment(decodeURIComponent(path.split('/').pop() as string))
        )
      }
      if (path === '/system/positions') {
        if (!hasPermission(actor.permissions, POSITION_PERMISSIONS.assign))
          requirePermission(actor.permissions, POSITION_PERMISSIONS.list)
        return clone(
          paged(
            [...selected.positions]
              .sort(
                (a, b) =>
                  a.positionName.localeCompare(b.positionName) ||
                  a.id.localeCompare(b.id)
              )
              .filter(
                (item) =>
                  !uri.searchParams.get('departmentId') ||
                  item.departmentId === uri.searchParams.get('departmentId')
              )
          )
        )
      }
      if (path === '/system/organization-members') {
        requirePermission(actor.permissions, POSITION_PERMISSIONS.assign)
        return clone(
          paged(
            selected.members.map((member) => ({
              ...member,
              positionName:
                selected.positions.find(
                  (position) => position.id === member.positionId
                )?.positionName || null,
            }))
          )
        )
      }
    }
    if (
      (path === '/system/departments' && verb === 'post') ||
      (/^\/system\/departments\/[^/]+$/.test(path) &&
        ['put', 'delete'].includes(verb))
    ) {
      const id =
        verb === 'post'
          ? undefined
          : decodeURIComponent(path.split('/').pop() as string)
      if (verb === 'delete') {
        const input = record(body)
        onlyKeys(input, ['expectedRevision'])
        const revision = positiveInteger(input.expectedRevision)
        return mutate(
          DEPARTMENT_PERMISSIONS.delete,
          { expectedRevision: revision },
          () => {
            const old = lookupDepartment(id as string)
            assertRevision(old.revision, revision)
            if (
              selected.departments.some((item) => item.parentId === id) ||
              selected.positions.some((item) => item.departmentId === id) ||
              selected.members.some((item) => item.departmentId === id)
            )
              fail(
                'DEPARTMENT_REFERENCED',
                '部门有关联成员、子部门或岗位，不能删除'
              )
            selected.departments = selected.departments.filter(
              (item) => item.id !== id
            )
            return null
          }
        )
      }
      const input = parseDepartment(body, Boolean(id))
      return mutate(
        id ? DEPARTMENT_PERMISSIONS.update : DEPARTMENT_PERMISSIONS.create,
        input,
        () => {
          const old = id ? lookupDepartment(id) : undefined
          if (old)
            assertRevision(old.revision, input.expectedRevision as number)
          const parentId =
            input.parentId === undefined
              ? old?.parentId || null
              : input.parentId
          if (parentId) availableDepartment(parentId)
          const result: Department = {
            departmentName: input.departmentName,
            leader: input.leader,
            sort: input.sort,
            status: input.status,
            id: id || crypto.randomUUID(),
            parentId,
            revision: (old?.revision || 0) + 1,
            createdAt: old?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          if (
            selected.departments.some(
              (item) =>
                item.id !== id &&
                item.parentId === parentId &&
                item.departmentName === input.departmentName
            )
          )
            fail('DEPARTMENT_NAME_EXISTS', '同一父部门下已有此名称')
          const candidate = [
            ...selected.departments.filter((item) => item.id !== id),
            result,
          ]
          try {
            departmentTree(candidate)
          } catch {
            fail('DEPARTMENT_CYCLE', '父部门不能是自身或自己的子部门')
          }
          selected.departments = candidate
          return result
        }
      )
    }
    if (
      (path === '/system/positions' && verb === 'post') ||
      (/^\/system\/positions\/[^/]+$/.test(path) &&
        ['put', 'delete'].includes(verb))
    ) {
      const id =
        verb === 'post'
          ? undefined
          : decodeURIComponent(path.split('/').pop() as string)
      if (verb === 'delete') {
        const input = record(body)
        onlyKeys(input, ['expectedRevision'])
        const revision = positiveInteger(input.expectedRevision)
        return mutate(
          POSITION_PERMISSIONS.delete,
          { expectedRevision: revision },
          () => {
            const old = lookupPosition(id as string)
            assertRevision(old.revision, revision)
            if (selected.members.some((member) => member.positionId === id))
              fail('POSITION_REFERENCED', '岗位有关联成员，不能删除')
            selected.positions = selected.positions.filter(
              (item) => item.id !== id
            )
            return null
          }
        )
      }
      const input = parsePosition(body, Boolean(id))
      return mutate(
        id ? POSITION_PERMISSIONS.update : POSITION_PERMISSIONS.create,
        input,
        () => {
          const old = id ? lookupPosition(id) : undefined
          if (old)
            assertRevision(old.revision, input.expectedRevision as number)
          availableDepartment(input.departmentId)
          if (
            old &&
            old.departmentId !== input.departmentId &&
            selected.members.some((member) => member.positionId === id)
          )
            fail('POSITION_REFERENCED', '岗位有关联成员，不能移动到其他部门')
          if (
            selected.positions.some(
              (item) =>
                item.id !== id &&
                item.departmentId === input.departmentId &&
                item.positionName === input.positionName
            )
          )
            fail('POSITION_NAME_EXISTS', '该部门已有同名岗位')
          const result: Position = {
            departmentId: input.departmentId,
            positionName: input.positionName,
            status: input.status,
            id: id || crypto.randomUUID(),
            revision: (old?.revision || 0) + 1,
            createdAt: old?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          selected.positions = [
            ...selected.positions.filter((item) => item.id !== id),
            result,
          ]
          return result
        }
      )
    }
    if (
      /^\/system\/organization-members\/[^/]+\/assign$/.test(path) &&
      verb === 'post'
    ) {
      const parts = path.split('/')
      const id = decodeURIComponent(parts[parts.length - 2])
      const input = record(body)
      onlyKeys(input, ['departmentId', 'positionId', 'expectedRevision'])
      const command = {
        departmentId: text(input.departmentId, 'departmentId', 100),
        positionId:
          input.positionId === null
            ? null
            : text(input.positionId, 'positionId', 100),
        expectedRevision: positiveInteger(input.expectedRevision),
      }
      return mutate(POSITION_PERMISSIONS.assign, command, () => {
        const member =
          selected.members.find((item) => item.id === id) ||
          fail('NOT_FOUND', '资源不存在', 404)
        assertRevision(member.revision, command.expectedRevision)
        availableDepartment(command.departmentId)
        if (command.positionId) {
          const position = lookupPosition(command.positionId)
          if (position.departmentId !== command.departmentId)
            fail('POSITION_DEPARTMENT_MISMATCH', '岗位不属于所选部门', 422)
          if (position.status !== 'enabled')
            fail('POSITION_UNAVAILABLE', '岗位已停用')
        }
        Object.assign(member, {
          departmentId: command.departmentId,
          positionId: command.positionId,
          revision: member.revision + 1,
        })
        return {
          id,
          departmentId: command.departmentId,
          positionId: command.positionId,
          revision: member.revision,
        }
      })
    }
    return fail('NOT_FOUND', '演示接口不存在', 404)
  }
}
