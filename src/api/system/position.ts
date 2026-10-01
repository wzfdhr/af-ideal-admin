import request from '@/api/request'
import type {
  Position,
  PositionInput,
  DepartmentNode,
} from '@af-admin/contracts'

export interface OrganizationMember {
  id: string
  name: string
  departmentId: string | null
  positionId: string | null
  positionName: string | null
  revision: number
  status: string
}
export const fetchPositions = async (params: {
  current: number
  pageSize: number
  departmentId?: string
}) =>
  (
    await request.get<{ list: Position[]; total: number }>(
      '/system/positions',
      { params }
    )
  ).data
export const savePosition = async (
  id: string | undefined,
  body: PositionInput,
  key: string
) =>
  (id
    ? await request.put<Position>(`/system/positions/${id}`, body, {
        headers: { 'Idempotency-Key': key },
      })
    : await request.post<Position>('/system/positions', body, {
        headers: { 'Idempotency-Key': key },
      })
  ).data
export const removePosition = async (value: Position, key: string) =>
  request.delete(`/system/positions/${value.id}`, {
    data: { expectedRevision: value.revision },
    headers: { 'Idempotency-Key': key },
  })
export const fetchOrganizationMembers = async (params: {
  current: number
  pageSize: number
}) =>
  (
    await request.get<{ list: OrganizationMember[]; total: number }>(
      '/system/organization-members',
      { params }
    )
  ).data
export const assignOrganization = async (
  value: OrganizationMember,
  departmentId: string,
  positionId: string | null,
  key: string
) =>
  (
    await request.post(
      `/system/organization-members/${value.id}/assign`,
      { departmentId, positionId, expectedRevision: value.revision },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const positionDepartmentTree = async () =>
  (await request.get<DepartmentNode[]>('/system/departments/tree')).data
