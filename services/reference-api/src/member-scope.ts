import {
  DomainError,
  MEMBER_SCOPE_FIELDS,
  USER_PERMISSIONS,
  maskPhone,
  maskEmail,
} from '@af-admin/contracts'
import { rows, one } from './support'
import type { Database } from './support'
import type { Actor } from './auth'

export const assertMemberScope = async (
  db: Database,
  actor: Actor,
  permission: string,
  targetId: string
) => {
  const visible = one(
    await rows<{ visible: boolean }>(
      db,
      'SELECT af_member_scope_visible($1,$2,$3,$4) AS visible',
      [actor.tenantId, actor.userId, permission, targetId]
    )
  )
  if (!visible.visible) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
}
export const projectMemberFields = async (
  db: Database,
  actor: Actor,
  permission: string,
  targetId: string,
  value: Record<string, unknown>
) => {
  const permitted = await rows<{ field: string }>(
    db,
    'SELECT field FROM unnest($5::text[]) field WHERE af_member_field_visible($1,$2,$3,$4,field)',
    [
      actor.tenantId,
      actor.userId,
      permission,
      targetId,
      [...MEMBER_SCOPE_FIELDS],
    ]
  )
  const names = new Set(permitted.map((row) => row.field))
  if (value.contactsMasked === false) {
    const raw = await rows<{ field: string }>(
      db,
      'SELECT field FROM unnest($5::text[]) field WHERE af_member_field_visible($1,$2,$3,$4,field)',
      [
        actor.tenantId,
        actor.userId,
        USER_PERMISSIONS.readContacts,
        targetId,
        ['phone', 'email'],
      ]
    )
    const rawFields = new Set(raw.map((row) => row.field))
    value = { ...value }
    if (typeof value.phone === 'string' && !rawFields.has('phone')) {
      value.phone = maskPhone(value.phone)
      value.contactsMasked = true
    }
    if (typeof value.email === 'string' && !rawFields.has('email')) {
      value.email = maskEmail(value.email)
      value.contactsMasked = true
    }
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      ([field]) =>
        !MEMBER_SCOPE_FIELDS.includes(
          field as typeof MEMBER_SCOPE_FIELDS[number]
        ) || names.has(field)
    )
  )
}
export const assertMemberFields = async (
  db: Database,
  actor: Actor,
  permission: string,
  targetId: string,
  fields: string[]
) => {
  const visible = await rows<{ field: string }>(
    db,
    'SELECT field FROM unnest($5::text[]) field WHERE af_member_field_visible($1,$2,$3,$4,field)',
    [actor.tenantId, actor.userId, permission, targetId, fields]
  )
  if (visible.length !== fields.length)
    throw new DomainError(403, 'FIELD_FORBIDDEN', '没有操作这些成员字段的权限')
}
