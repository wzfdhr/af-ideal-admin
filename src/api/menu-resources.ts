import request from './request'
import type {
  MenuResourceInput,
  MenuResourceRecord,
  MenuRouteDefinition,
} from '@af-admin/contracts'

export const listMenuResources = async (params: {
  current: number
  pageSize: number
  menuName?: string
  status?: string
}) =>
  (
    await request.get<{ list: MenuResourceRecord[]; total: number }>(
      '/system/menus',
      { params }
    )
  ).data
export const menuCatalogue = async () =>
  (
    await request.get<{
      routes: MenuRouteDefinition[]
      parents: MenuResourceRecord[]
      permissions: { code: string; title: string }[]
    }>('/system/menus/catalogue')
  ).data
export const createMenuResource = async (
  body: MenuResourceInput,
  key: string
) =>
  (
    await request.post<MenuResourceRecord>('/system/menus', body, {
      headers: { 'Idempotency-Key': key },
    })
  ).data
export const updateMenuResource = async (
  id: string,
  body: MenuResourceInput,
  key: string
) =>
  (
    await request.put<MenuResourceRecord>(
      `/system/menus/${encodeURIComponent(id)}`,
      body,
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const menuResourceCommand = async (
  id: string,
  action: 'delete' | 'restore',
  expectedRevision: number,
  key: string
) => {
  const config = { headers: { 'Idempotency-Key': key } }
  const body = { expectedRevision }
  return action === 'delete'
    ? (
        await request.delete<MenuResourceRecord>(
          `/system/menus/${encodeURIComponent(id)}`,
          { ...config, data: body }
        )
      ).data
    : (
        await request.post<MenuResourceRecord>(
          `/system/menus/${encodeURIComponent(id)}/restore`,
          body,
          config
        )
      ).data
}
