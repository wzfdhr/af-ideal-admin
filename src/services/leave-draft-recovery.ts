import { parseLeaveFields } from '@af-admin/contracts'
import type { LeaveFields } from '@af-admin/contracts'

const retainers = new Set<() => void>()
const keyFor = (userId: string, tenantId: string, requestId: string) =>
  `r1-leave-recovery:${JSON.stringify([userId, tenantId, requestId])}`

export const registerLeaveRecovery = (retain: () => void) => {
  retainers.add(retain)
  return () => retainers.delete(retain)
}
export const retainLeaveDrafts = () => {
  retainers.forEach((retain) => {
    try {
      retain()
    } catch {
      /* storage failure must not prevent reauthentication */
    }
  })
}
export const saveLeaveRecovery = (
  userId: string | undefined,
  tenantId: string | undefined,
  requestId: string,
  fields: unknown
) => {
  if (!userId || !tenantId) return
  sessionStorage.setItem(
    keyFor(userId, tenantId, requestId),
    JSON.stringify({ at: Date.now(), fields: parseLeaveFields(fields, true) })
  )
}
export const readLeaveRecovery = (
  userId: string | undefined,
  tenantId: string | undefined,
  requestId: string
): LeaveFields | undefined => {
  if (!userId || !tenantId) return undefined
  const key = keyFor(userId, tenantId, requestId)
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw || raw.length > 10000) return undefined
    const value = JSON.parse(raw) as { at: number; fields: unknown }
    if (
      !Number.isFinite(value.at) ||
      value.at > Date.now() ||
      Date.now() - value.at > 86400000
    ) {
      sessionStorage.removeItem(key)
      return undefined
    }
    return parseLeaveFields(value.fields, true)
  } catch {
    return undefined
  }
}
export const clearLeaveRecovery = (
  userId: string | undefined,
  tenantId: string | undefined,
  requestId: string
) => {
  if (!userId || !tenantId) return
  try {
    sessionStorage.removeItem(keyFor(userId, tenantId, requestId))
  } catch {
    /* optional recovery storage */
  }
}
