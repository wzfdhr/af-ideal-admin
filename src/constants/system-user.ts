export const SYSTEM_USER_STATUS_KEY = 'userStatus'

export const SYSTEM_USER_PERMISSIONS = {
  list: 'system:user:list',
  create: 'system:user:create',
  update: 'system:user:update',
  delete: 'system:user:delete',
  detail: 'system:user:detail',
} as const
