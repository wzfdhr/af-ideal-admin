import request from './request'
import type { CapabilityMenuNode } from '@af-admin/contracts'

export const navigationState = async () =>
  (
    await request.get<{
      menus: CapabilityMenuNode[]
      disabledButtons: { parentRoute: string; permission: string }[]
    }>('/navigation/state')
  ).data
export const navigationAccess = async (name: string) =>
  (
    await request.get<{ allowed: boolean }>(
      `/navigation/access/${encodeURIComponent(name)}`
    )
  ).data.allowed
