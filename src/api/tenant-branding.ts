import request from '@/api/request'
import type {
  MembershipPreferencesUpdateV1,
  MembershipPreferencesV1,
  TenantBrandApplyV1,
  TenantBrandConfigurationV1,
  TenantBrandDraftSaveV1,
  TenantBrandRuntimeV1,
  TenantBrandVersionPageV1,
} from '@af-admin/contracts'

export const TENANT_BRANDING_REFRESH_EVENT = 'tenant-branding:refresh'

const commandHeaders = (key: string) => ({
  headers: { 'Idempotency-Key': key },
})

export const fetchTenantBrandRuntime = async () =>
  (await request.get<TenantBrandRuntimeV1>('/tenant-branding/runtime')).data

export const fetchTenantBrandConfiguration = async () =>
  (
    await request.get<TenantBrandConfigurationV1>(
      '/tenant-branding/configuration'
    )
  ).data

export const saveTenantBrandDraft = async (
  input: TenantBrandDraftSaveV1,
  key: string
) =>
  (
    await request.put<TenantBrandConfigurationV1>(
      '/tenant-branding/draft',
      input,
      commandHeaders(key)
    )
  ).data

export const applyTenantBrandDraft = async (
  input: TenantBrandApplyV1,
  key: string
) =>
  (
    await request.post<TenantBrandConfigurationV1>(
      '/tenant-branding/apply',
      input,
      commandHeaders(key)
    )
  ).data

export const fetchTenantBrandVersions = async (params: {
  current: number
  pageSize: number
}) =>
  (
    await request.get<TenantBrandVersionPageV1>('/tenant-branding/versions', {
      params,
    })
  ).data

export const fetchMembershipPreferences = async () =>
  (await request.get<MembershipPreferencesV1>('/membership-preferences')).data

export const updateMembershipPreferences = async (
  input: MembershipPreferencesUpdateV1,
  key: string
) =>
  (
    await request.patch<MembershipPreferencesV1>(
      '/membership-preferences',
      input,
      commandHeaders(key)
    )
  ).data

export const fetchTenantBrandLogo = async () => {
  const response = await request.get<ArrayBuffer>('/tenant-branding/logo', {
    responseType: 'arraybuffer',
  })
  const mimeType = String(
    response.headers['content-type'] || 'application/octet-stream'
  )
  return {
    blob: new Blob([response.data], { type: mimeType }),
    mimeType,
    size: String(response.headers['content-length'] || ''),
    sha256: String(response.headers['x-content-sha256'] || ''),
  }
}
