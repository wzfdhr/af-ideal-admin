import { invalid, onlyKeys, record, text, positiveInteger } from './schemas'

export const USER_PERMISSIONS = {
  list: 'system:user:list',
  detail: 'system:user:detail',
  create: 'system:user:create',
  update: 'system:user:update',
  delete: 'system:user:delete',
  resetPassword: 'system:user:reset-password',
  readContacts: 'system:user:read-contacts',
} as const
export interface UserCreate {
  username: string
  name: string
  phone: string
  email: string
  initialPassword: string
  status: 'enabled' | 'disabled'
}
export interface UserUpdate {
  name?: string
  phone?: string
  email?: string
  status?: 'enabled' | 'disabled'
  expectedRevision: number
}
export const privatePassword = (value: unknown) => {
  if (typeof value !== 'string' || value.length < 16 || value.length > 200)
    invalid('initialPassword', '密码需要16至200个字符')
  return value as string
}
const contact = (value: unknown, key: 'phone' | 'email') => {
  if (typeof value !== 'string') invalid(key, '联系资料无效')
  const result = (value as string).trim()
  if (
    result.length > (key === 'phone' ? 30 : 254) ||
    (result &&
      (key === 'phone'
        ? !/^\+?[\d ()-]{6,30}$/.test(result)
        : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)))
  )
    invalid(key, '联系资料格式无效')
  return result
}
const status = (value: unknown) => {
  if (value !== 'enabled' && value !== 'disabled')
    invalid('status', '成员状态无效')
  return value as 'enabled' | 'disabled'
}
export const parseUserCreate = (input: unknown): UserCreate => {
  const body = record(input)
  onlyKeys(body, [
    'username',
    'name',
    'phone',
    'email',
    'initialPassword',
    'status',
  ])
  const username = text(body.username, 'username', 64)
  if (!/^[A-Za-z0-9_.-]{3,64}$/.test(username))
    invalid('username', '用户名需要3至64个字母、数字或 . _ -')
  return {
    username,
    name: text(body.name, 'name', 100),
    phone: contact(body.phone ?? '', 'phone'),
    email: contact(body.email ?? '', 'email'),
    initialPassword: privatePassword(body.initialPassword),
    status: status(body.status),
  }
}
export const parseUserUpdate = (input: unknown): UserUpdate => {
  const body = record(input)
  onlyKeys(body, ['name', 'phone', 'email', 'status', 'expectedRevision'])
  if (
    !['name', 'phone', 'email', 'status'].some((key) => body[key] !== undefined)
  )
    invalid('profile', '至少提供一个资料变更')
  return {
    expectedRevision: positiveInteger(body.expectedRevision),
    ...(body.name === undefined ? {} : { name: text(body.name, 'name', 100) }),
    ...(body.phone === undefined
      ? {}
      : { phone: contact(body.phone, 'phone') }),
    ...(body.email === undefined
      ? {}
      : { email: contact(body.email, 'email') }),
    ...(body.status === undefined ? {} : { status: status(body.status) }),
  }
}
export const maskPhone = (value: string) =>
  value
    ? `${value.slice(0, 2)}${'*'.repeat(
        Math.max(1, value.length - 4)
      )}${value.slice(-2)}`
    : ''
export const maskEmail = (value: string) =>
  value ? `${value.slice(0, 1)}***@${value.split('@')[1] || '***'}` : ''
