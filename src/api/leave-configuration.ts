import request from '@/api/request'
import type {
  Draft,
  FormSchema,
  WorkflowSchema,
  PageResult,
} from '@af-admin/contracts'

export type ConfigurationDraft = Draft<FormSchema | WorkflowSchema>
export interface ConfigurationMember {
  id: string
  name: string
  canApprove: boolean
}
export const fetchConfigurationDrafts = async (kind: 'form' | 'workflow') =>
  (
    await request.get<PageResult<ConfigurationDraft>>(
      kind === 'form' ? '/form-schemas' : '/workflows',
      { params: { current: 1, pageSize: 100 } }
    )
  ).data
export const fetchConfigurationDraft = async (
  kind: 'form' | 'workflow',
  id: string
) =>
  (
    await request.get<ConfigurationDraft>(
      `${kind === 'form' ? '/form-schemas' : '/workflows'}/${encodeURIComponent(
        id
      )}`
    )
  ).data
export const saveConfigurationDraft = async (
  kind: 'form' | 'workflow',
  id: string,
  schema: unknown,
  expectedRevision: number
) =>
  (
    await request.put<ConfigurationDraft>(
      `${kind === 'form' ? '/form-schemas' : '/workflows'}/${encodeURIComponent(
        id
      )}`,
      { schema, expectedRevision }
    )
  ).data
export const fetchConfigurationMembers = async (tenantId: string) =>
  (
    await request.get<ConfigurationMember[]>(
      `/tenants/${encodeURIComponent(tenantId)}/members`
    )
  ).data
