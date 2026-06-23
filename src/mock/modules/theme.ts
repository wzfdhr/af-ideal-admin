import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  ThemeAdapterTokens,
  ThemeApplyResult,
  ThemeBrandPageResult,
  ThemeBrandQuery,
  ThemeBrandRecord,
  ThemePreviewResult,
  ThemeUpdatePayload,
  ThemeUpdateResult,
} from '@/api/theme'
import type { MockParams } from '../types'

export interface ThemeMockStoreOptions {
  now?: () => string
}

const getNow = () => '2026-06-23 10:00:00'

const buildAdapterTokens = (
  primaryColor: string,
  compactMode: boolean
): ThemeAdapterTokens => ({
  colorPrimary: primaryColor,
  borderRadius: compactMode ? 4 : 6,
  fontSizeBase: compactMode ? 13 : 14,
})

const seedBrands = (): ThemeBrandRecord[] => [
  {
    tenantId: 'tenant-a',
    tenantName: 'Aheart 科技',
    brandName: 'Aheart',
    appTitle: 'Aheart Admin',
    logoUrl: '/mock/theme/aheart.svg',
    loginBackground: '/mock/theme/login-aheart.png',
    primaryColor: '#165dff',
    darkMode: false,
    compactMode: false,
    current: true,
    updatedAt: '2026-06-23 09:00:00',
    adapterTokens: buildAdapterTokens('#165dff', false),
  },
  {
    tenantId: 'tenant-b',
    tenantName: 'Ideal 数据',
    brandName: 'Ideal',
    appTitle: 'Ideal Console',
    logoUrl: '/mock/theme/ideal.svg',
    loginBackground: '/mock/theme/login-ideal.png',
    primaryColor: '#0e9f6e',
    darkMode: true,
    compactMode: true,
    current: false,
    updatedAt: '2026-06-23 09:10:00',
    adapterTokens: buildAdapterTokens('#0e9f6e', true),
  },
  {
    tenantId: 'tenant-c',
    tenantName: 'Archive 演示租户',
    brandName: 'Archive',
    appTitle: 'Archive Admin',
    logoUrl: '/mock/theme/archive.svg',
    loginBackground: '/mock/theme/login-archive.png',
    primaryColor: '#667085',
    darkMode: false,
    compactMode: true,
    current: false,
    updatedAt: '2026-06-23 09:20:00',
    adapterTokens: buildAdapterTokens('#667085', true),
  },
]

const cloneBrand = (record: ThemeBrandRecord): ThemeBrandRecord => ({
  ...record,
  adapterTokens: { ...record.adapterTokens },
})

const readString = (value: unknown) =>
  typeof value === 'string' ? value : undefined

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const parseQuery = (url: string): ThemeBrandQuery => {
  const { query } = qs.parseUrl(url)

  return {
    current: toPositiveNumber(query.current, 1),
    pageSize: toPositiveNumber(query.pageSize, 20),
    keyword: readString(query.keyword) || '',
  }
}

const parseBody = (body: string): ThemeUpdatePayload => {
  try {
    return JSON.parse(body || '{}') as ThemeUpdatePayload
  } catch {
    return {}
  }
}

const getTenantIdFromUrl = (url: string, suffix = '') => {
  const match = url.match(new RegExp(`/api/themes/brands/([^/]+)${suffix}$`))
  return decodeURIComponent(match?.[1] || '')
}

const isHexColor = (color: string) => /^#[0-9a-f]{6}$/i.test(color)

export const createThemeMockStore = (options: ThemeMockStoreOptions = {}) => {
  const now = options.now || getNow
  let brands = seedBrands()

  const queryBrands = (params: ThemeBrandQuery): ThemeBrandPageResult => {
    const current = params.current || 1
    const pageSize = params.pageSize || 20
    const keyword = params.keyword?.trim().toLowerCase() || ''
    const filtered = brands.filter((item) =>
      keyword
        ? `${item.tenantName}${item.brandName}${item.appTitle}`
            .toLowerCase()
            .includes(keyword)
        : true
    )
    const start = (current - 1) * pageSize

    return {
      list: filtered.slice(start, start + pageSize).map(cloneBrand),
      total: filtered.length,
    }
  }

  const getBrand = (tenantId: string) =>
    brands.find((item) => item.tenantId === tenantId)

  const getPreview = (tenantId: string): ThemePreviewResult | undefined => {
    const brand = getBrand(tenantId)
    if (!brand) return undefined

    return {
      tenantId: brand.tenantId,
      brandName: brand.brandName,
      appTitle: brand.appTitle,
      logoUrl: brand.logoUrl,
      darkMode: brand.darkMode,
      compactMode: brand.compactMode,
      adapterTokens: { ...brand.adapterTokens },
    }
  }

  const updateBrand = (
    tenantId: string,
    payload: ThemeUpdatePayload
  ): ThemeUpdateResult => {
    const brand = getBrand(tenantId)
    if (!brand) {
      return {
        success: false,
        reason: '租户主题不存在',
      }
    }
    if (payload.primaryColor && !isHexColor(payload.primaryColor)) {
      return {
        success: false,
        reason: '主题色必须是 6 位十六进制颜色',
      }
    }

    const updated: ThemeBrandRecord = {
      ...brand,
      ...payload,
      primaryColor: payload.primaryColor || brand.primaryColor,
      darkMode:
        typeof payload.darkMode === 'boolean'
          ? payload.darkMode
          : brand.darkMode,
      compactMode:
        typeof payload.compactMode === 'boolean'
          ? payload.compactMode
          : brand.compactMode,
      updatedAt: now(),
      adapterTokens: buildAdapterTokens(
        payload.primaryColor || brand.primaryColor,
        typeof payload.compactMode === 'boolean'
          ? payload.compactMode
          : brand.compactMode
      ),
    }

    brands = brands.map((item) => (item.tenantId === tenantId ? updated : item))

    return {
      success: true,
      record: cloneBrand(updated),
    }
  }

  const applyBrand = (tenantId: string): ThemeApplyResult | undefined => {
    const preview = getPreview(tenantId)
    if (!preview) return undefined

    brands = brands.map((item) => ({
      ...item,
      current: item.tenantId === tenantId,
    }))

    return {
      tenantId,
      appliedAt: now(),
      adapterTokens: { ...preview.adapterTokens },
    }
  }

  return {
    queryBrands,
    getPreview,
    updateBrand,
    applyBrand,
  }
}

const themeStore = createThemeMockStore()

const setupThemeMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/themes/brands(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(themeStore.queryBrands(parseQuery(params.url)))
        }
      )

      Mock.mock(
        new RegExp('/api/themes/brands/[^/]+$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const preview = themeStore.getPreview(getTenantIdFromUrl(params.url))

          return preview
            ? responseWrap(preview)
            : failedResponseWrap(null, '租户主题不存在', 404)
        }
      )

      Mock.mock(
        new RegExp('/api/themes/brands/[^/]+$'),
        'put',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            themeStore.updateBrand(
              getTenantIdFromUrl(params.url),
              parseBody(params.body)
            )
          )
        }
      )

      Mock.mock(
        new RegExp('/api/themes/brands/[^/]+/apply$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const applied = themeStore.applyBrand(
            getTenantIdFromUrl(params.url, '/apply')
          )

          return applied
            ? responseWrap(applied)
            : failedResponseWrap(null, '租户主题不存在', 404)
        }
      )
    },
  })
}

export default setupThemeMock
