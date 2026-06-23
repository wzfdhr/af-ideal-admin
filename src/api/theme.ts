import request from '@/api/request'

export interface ThemeAdapterTokens {
  colorPrimary: string
  borderRadius: number
  fontSizeBase: number
}

export interface ThemeBrandRecord {
  tenantId: string
  tenantName: string
  brandName: string
  appTitle: string
  logoUrl: string
  loginBackground: string
  primaryColor: string
  darkMode: boolean
  compactMode: boolean
  current: boolean
  updatedAt: string
  adapterTokens: ThemeAdapterTokens
}

export interface ThemeBrandQuery {
  current: number
  pageSize: number
  keyword?: string
}

export interface ThemeBrandPageResult {
  list: ThemeBrandRecord[]
  total: number
}

export interface ThemeUpdatePayload {
  appTitle?: string
  logoUrl?: string
  loginBackground?: string
  primaryColor?: string
  darkMode?: boolean
  compactMode?: boolean
}

export interface ThemeUpdateResult {
  success: boolean
  record?: ThemeBrandRecord
  reason?: string
}

export interface ThemePreviewResult {
  tenantId: string
  brandName: string
  appTitle: string
  logoUrl: string
  darkMode: boolean
  compactMode: boolean
  adapterTokens: ThemeAdapterTokens
}

export interface ThemeApplyResult {
  tenantId: string
  appliedAt: string
  adapterTokens: ThemeAdapterTokens
}

export const fetchThemeBrands = async (params: ThemeBrandQuery) => {
  const response = await request.get<ThemeBrandPageResult>('/themes/brands', {
    params,
  })
  return response.data
}

export const fetchThemePreview = async (tenantId: string) => {
  const response = await request.get<ThemePreviewResult>(
    `/themes/brands/${tenantId}`
  )
  return response.data
}

export const updateThemeBrand = async (
  tenantId: string,
  payload: ThemeUpdatePayload
) => {
  const response = await request.put<ThemeUpdateResult>(
    `/themes/brands/${tenantId}`,
    payload
  )
  return response.data
}

export const applyThemeBrand = async (tenantId: string) => {
  const response = await request.post<ThemeApplyResult>(
    `/themes/brands/${tenantId}/apply`
  )
  return response.data
}
