import { RoleDemoStore } from '@af-admin/workflow-core'
import {
  PLATFORM_PERMISSION_CATALOGUE,
  demoIdentities,
} from '@af-admin/contracts'
import { mockUsers } from './seed'

export const authorizationDemo = new RoleDemoStore(
  mockUsers.map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    tenantIds: demoIdentities.find((identity) => identity.id === user.id)
      ?.tenantIds || [user.tenantId],
    permissions: [
      ...new Set([
        ...user.permissions,
        ...(user.role === 'admin'
          ? PLATFORM_PERMISSION_CATALOGUE.filter(
              (value) => value.code !== 'system:user:read-contacts'
            ).map((value) => value.code)
          : []),
      ]),
    ],
  }))
)
export const mockEffectivePermissions = (userId: string, tenantId: string) =>
  authorizationDemo.permissions(userId, tenantId)
export const mockPermissionVersion = (userId: string, tenantId: string) =>
  authorizationDemo.permissionVersion(userId, tenantId)
