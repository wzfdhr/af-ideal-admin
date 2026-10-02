import {
  DomainError,
  ROLE_PERMISSIONS,
  USER_PERMISSIONS,
  PLATFORM_PERMISSION_CATALOGUE,
  parseRole,
  permissionCodes,
  roleIds,
  record,
  onlyKeys,
  positiveInteger,
  withSelfServicePermissions,
} from '@af-admin/contracts'
import { requirePermission, hasPermission, assertRevision } from './workflow'
import { assertDelegation } from './delegation'
import type { ManagedRole } from '@af-admin/contracts'

interface DemoMember {
  id: string
  username: string
  name: string
  tenantId: string
  status: string
  revision: number
  directPermissions: string[]
  roleIds: string[]
}
interface State {
  roles: (ManagedRole & { tenantId: string })[]
  members: DemoMember[]
  replays: Record<string, { signature: string; data: unknown }>
}
export interface DemoAuthorizationIdentity {
  id: string
  username: string
  name: string
  tenantIds: string[]
  permissions: string[]
}
const clone = <T>(value: T): T => structuredClone(value)
const fail = (code: string, message: string, status = 409): never => {
  throw new DomainError(status, code, message)
}
class RoleDemoStore {
  private state: State = { roles: [], members: [], replays: {} }

  constructor(identities: DemoAuthorizationIdentity[]) {
    identities.forEach((identity) =>
      identity.tenantIds.forEach((tenantId) =>
        this.state.members.push({
          id: identity.id,
          username: identity.username,
          name: identity.name,
          tenantId,
          status: 'enabled',
          revision: 1,
          directPermissions: [...identity.permissions],
          roleIds: [],
        })
      )
    )
  }

  private member(id: string, tenantId: string) {
    return (
      this.state.members.find(
        (value) => value.id === id && value.tenantId === tenantId
      ) || fail('NOT_FOUND', '资源不存在', 404)
    )
  }

  private role(id: string, tenantId: string) {
    return (
      this.state.roles.find(
        (value) => value.id === id && value.tenantId === tenantId
      ) || fail('NOT_FOUND', '资源不存在', 404)
    )
  }

  private rawPermissions(id: string, tenantId: string) {
    const member = this.member(id, tenantId)
    return [
      ...new Set([
        ...member.directPermissions,
        ...member.roleIds.flatMap(
          (roleId) =>
            this.state.roles.find(
              (value) =>
                value.id === roleId &&
                value.tenantId === tenantId &&
                value.status === 'enabled'
            )?.permissions || []
        ),
      ]),
    ].sort()
  }

  permissions(id: string, tenantId: string) {
    const member = this.member(id, tenantId)
    if (member.status !== 'enabled')
      fail('MEMBER_UNAVAILABLE', '成员已停用', 403)
    return withSelfServicePermissions(this.rawPermissions(id, tenantId))
  }

  permissionVersion(id: string, tenantId: string) {
    return this.member(id, tenantId).revision
  }

  private governance(tenantId: string) {
    const groups = [
      [
        USER_PERMISSIONS.create,
        USER_PERMISSIONS.update,
        USER_PERMISSIONS.delete,
      ],
      [ROLE_PERMISSIONS.assign],
      [ROLE_PERMISSIONS.update, ROLE_PERMISSIONS.permissions],
    ]
    return groups.map((group) =>
      this.state.members
        .filter(
          (member) =>
            member.tenantId === tenantId &&
            member.status === 'enabled' &&
            group.every((code) =>
              hasPermission(this.rawPermissions(member.id, tenantId), code)
            )
        )
        .map((member) => member.id)
    )
  }

  private guardGovernance(tenantId: string, before: string[][]) {
    const after = this.governance(tenantId)
    if (
      before.some((group, index) => group.length && after[index].length === 0)
    )
      fail(
        'LAST_ADMINISTRATOR',
        '必须保留有效用户管理、授权分配及角色权限维护能力'
      )
  }

  private managed(owned: string[], target: string[]) {
    if (target.some((code) => !hasPermission(owned, code)))
      fail('PRIVILEGE_BOUNDS', '不能管理超出自身授权的角色或成员', 403)
  }

  private known(codes: string[]) {
    if (
      codes.some(
        (code) =>
          !PLATFORM_PERMISSION_CATALOGUE.some((value) => value.code === code)
      )
    )
      fail('UNKNOWN_PERMISSION', '权限必须来自当前有效目录', 422)
  }

  private authorization(member: DemoMember) {
    return {
      id: member.id,
      revision: member.revision,
      directPermissions: [...member.directPermissions],
      effectivePermissions: this.rawPermissions(member.id, member.tenantId),
      roles: member.roleIds.map((id) => {
        const role = this.role(id, member.tenantId)
        return { id: role.id, roleName: role.roleName, status: role.status }
      }),
    }
  }

  request(
    method: string,
    target: string,
    userId: string,
    tenantId: string,
    body?: unknown,
    key?: string
  ): unknown {
    const owned = this.permissions(userId, tenantId)
    const url = new URL(target, 'http://demo.local')
    const path = url.pathname
    const verb = method.toLowerCase()
    const page = <T>(values: T[]) => {
      const current = Number(url.searchParams.get('current') || 1)
      const pageSize = Number(url.searchParams.get('pageSize') || 10)
      if (
        !Number.isSafeInteger(current) ||
        current < 1 ||
        !Number.isSafeInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100
      )
        fail('VALIDATION_ERROR', '分页参数无效', 422)
      return {
        list: values.slice((current - 1) * pageSize, current * pageSize),
        total: values.length,
      }
    }
    const mutate = (
      permission: string,
      payload: unknown,
      run: () => unknown
    ) => {
      requirePermission(owned, permission)
      if (!key || key.length < 8 || key.length > 200)
        fail('VALIDATION_ERROR', '写命令必须提供有效的 Idempotency-Key', 422)
      const id = JSON.stringify([tenantId, userId, verb, path, key])
      const signature = JSON.stringify(payload)
      const old = this.state.replays[id]
      if (old) {
        if (old.signature !== signature)
          fail('IDEMPOTENCY_CONFLICT', '同一个重试标识不能用于不同内容')
        return clone(old.data)
      }
      const original = clone(this.state)
      try {
        const data = run()
        this.state.replays[id] = { signature, data: clone(data) }
        return clone(data)
      } catch (error) {
        this.state = original
        throw error
      }
    }
    if (verb === 'get') {
      if (path === '/system/permissions') {
        requirePermission(owned, ROLE_PERMISSIONS.list)
        return PLATFORM_PERMISSION_CATALOGUE.map((value) => ({
          ...value,
          delegatable: hasPermission(owned, value.code),
        }))
      }
      if (path === '/system/roles') {
        requirePermission(owned, ROLE_PERMISSIONS.list)
        const name = url.searchParams.get('roleName') || ''
        return clone(
          page(
            this.state.roles
              .filter(
                (value) =>
                  value.tenantId === tenantId && value.roleName.includes(name)
              )
              .sort(
                (a, b) => a.roleSort - b.roleSort || a.id.localeCompare(b.id)
              )
          )
        )
      }
      if (/^\/system\/roles\/[^/]+$/.test(path)) {
        requirePermission(owned, ROLE_PERMISSIONS.detail)
        return clone(
          this.role(
            decodeURIComponent(path.split('/').pop() as string),
            tenantId
          )
        )
      }
      if (path === '/system/authorization-members') {
        requirePermission(owned, ROLE_PERMISSIONS.assign)
        const keyword = url.searchParams.get('keyword') || ''
        return clone(
          page(
            this.state.members
              .filter(
                (value) =>
                  value.tenantId === tenantId &&
                  value.username.includes(keyword)
              )
              .map(({ id, username, name, status, revision }) => ({
                id,
                username,
                name,
                status,
                revision,
              }))
          )
        )
      }
      if (/^\/system\/users\/[^/]+\/authorization$/.test(path)) {
        requirePermission(owned, ROLE_PERMISSIONS.assign)
        return clone(
          this.authorization(
            this.member(decodeURIComponent(path.split('/')[3]), tenantId)
          )
        )
      }
    }
    if (
      (path === '/system/roles' && verb === 'post') ||
      (/^\/system\/roles\/[^/]+$/.test(path) &&
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
          ROLE_PERMISSIONS.delete,
          { expectedRevision: revision },
          () => {
            const old = this.role(id as string, tenantId)
            assertRevision(old.revision, revision)
            this.managed(owned, old.permissions)
            if (
              this.state.members.some(
                (member) =>
                  member.tenantId === tenantId &&
                  member.roleIds.includes(id as string)
              )
            )
              fail('ROLE_REFERENCED', '角色仍绑定成员，请先明确调整成员授权')
            this.state.roles = this.state.roles.filter(
              (value) => !(value.id === id && value.tenantId === tenantId)
            )
            return null
          }
        )
      }
      const input = parseRole(body, !!id)
      return mutate(
        id ? ROLE_PERMISSIONS.update : ROLE_PERMISSIONS.create,
        input,
        () => {
          const old = id ? this.role(id, tenantId) : undefined
          if (old) {
            assertRevision(old.revision, input.expectedRevision as number)
            this.managed(owned, old.permissions)
          }
          if (input.permissions.length || old?.permissions.length)
            requirePermission(owned, ROLE_PERMISSIONS.permissions)
          this.known(input.permissions)
          assertDelegation(owned, input.permissions)
          if (
            this.state.roles.some(
              (value) =>
                value.tenantId === tenantId &&
                value.id !== id &&
                value.roleKey === input.roleKey
            )
          )
            fail('ROLE_KEY_EXISTS', '角色标识已使用')
          const before = this.governance(tenantId)
          const now = new Date().toISOString()
          const role = {
            tenantId,
            id: id || crypto.randomUUID(),
            roleName: input.roleName,
            roleKey: input.roleKey,
            roleSort: input.roleSort,
            status: input.status,
            remark: input.remark,
            permissions: input.permissions,
            revision: (old?.revision || 0) + 1,
            createdAt: old?.createdAt || now,
            updatedAt: now,
          }
          this.state.roles = [
            ...this.state.roles.filter(
              (value) => !(value.id === id && value.tenantId === tenantId)
            ),
            role,
          ]
          this.guardGovernance(tenantId, before)
          if (old)
            this.state.members
              .filter(
                (member) =>
                  member.tenantId === tenantId &&
                  member.roleIds.includes(role.id)
              )
              .forEach((member) => {
                member.revision += 1
              })
          return role
        }
      )
    }
    if (
      /^\/system\/users\/[^/]+\/authorization$/.test(path) &&
      verb === 'post'
    ) {
      const id = decodeURIComponent(path.split('/')[3])
      const input = record(body)
      onlyKeys(input, ['roleIds', 'directPermissions', 'expectedRevision'])
      const command = {
        roleIds: roleIds(input.roleIds),
        directPermissions: permissionCodes(input.directPermissions),
        expectedRevision: positiveInteger(input.expectedRevision),
      }
      return mutate(ROLE_PERMISSIONS.assign, command, () => {
        const member = this.member(id, tenantId)
        assertRevision(member.revision, command.expectedRevision)
        this.managed(owned, this.rawPermissions(id, tenantId))
        if (member.status !== 'enabled')
          fail('MEMBER_UNAVAILABLE', '成员已停用')
        this.known(command.directPermissions)
        assertDelegation(owned, command.directPermissions)
        command.roleIds.forEach((roleId) => {
          const role = this.role(roleId, tenantId)
          if (role.status !== 'enabled') fail('ROLE_UNAVAILABLE', '角色已停用')
          assertDelegation(owned, role.permissions)
        })
        const before = this.governance(tenantId)
        member.roleIds = command.roleIds
        member.directPermissions = command.directPermissions
        member.revision += 1
        this.guardGovernance(tenantId, before)
        return this.authorization(member)
      })
    }
    return fail('NOT_FOUND', '演示接口不存在', 404)
  }
}
export default RoleDemoStore
