import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  PluginExtensionType,
  PluginManifest,
  PluginPageResult,
  PluginQuery,
  PluginRecord,
  PluginStatus,
  PluginToggleResult,
} from '@/api/plugin'
import type { MockParams } from '../types'

export interface PluginMockStoreOptions {
  now?: () => string
}

const getNow = () => '2026-06-23 10:00:00'

const createManifest = (
  manifest: Omit<PluginManifest, 'lifecycle'> & {
    lifecycle?: PluginManifest['lifecycle']
  }
): PluginManifest => ({
  ...manifest,
  routes: manifest.routes.map((route) => ({ ...route })),
  menus: manifest.menus.map((menu) => ({ ...menu })),
  permissions: [...manifest.permissions],
  mockModules: [...manifest.mockModules],
  materials: [...manifest.materials],
  lifecycle: {
    installedAt: '2026-06-01 10:00:00',
    ...manifest.lifecycle,
  },
})

const seedPlugins = (): PluginRecord[] => {
  const workflowManifest = createManifest({
    id: 'workflow-plugin',
    name: 'Workflow Plugin',
    version: '1.0.0',
    description: '流程定义、待办和审批操作扩展',
    author: 'Aheart',
    routes: [
      { name: 'workflowCenter', path: '/workflow' },
      { name: 'workflowDesign', path: '/workflow/design' },
    ],
    menus: [
      {
        name: 'workflowCenter',
        locale: 'menu.Scalability.workflowCenter',
      },
    ],
    permissions: ['workflow:todo', 'workflow:approve', 'workflow:publish'],
    mockModules: ['workflow'],
    materials: ['WorkflowPanel'],
    lifecycle: {
      installedAt: '2026-06-01 10:00:00',
      enabledAt: '2026-06-23 09:00:00',
    },
  })
  const visualizationManifest = createManifest({
    id: 'visualization-plugin',
    name: 'Visualization Plugin',
    version: '1.1.0',
    description: '大屏、报表和图表物料扩展',
    author: 'Aheart',
    routes: [
      { name: 'dataScreen', path: '/visualization/dataScreen' },
      { name: 'reportCenter', path: '/visualization/reportCenter' },
    ],
    menus: [
      { name: 'dataScreen', locale: 'menu.visualization.dataScreen' },
      { name: 'reportCenter', locale: 'menu.visualization.reportCenter' },
    ],
    permissions: ['data-screen:view', 'report:view', 'report:export'],
    mockModules: ['data-screen', 'report'],
    materials: ['ChartCard', 'StatisticCard'],
    lifecycle: {
      installedAt: '2026-06-02 10:00:00',
      enabledAt: '2026-06-23 09:10:00',
    },
  })
  const auditManifest = createManifest({
    id: 'audit-plugin',
    name: 'Audit Plugin',
    version: '0.9.0',
    description: '审计日志和安全事件扩展',
    author: 'Aheart',
    routes: [{ name: 'auditLogs', path: '/audit/logs' }],
    menus: [{ name: 'auditLogs', locale: 'menu.audit.logs' }],
    permissions: ['audit:list', 'audit:export'],
    mockModules: ['audit'],
    materials: ['AuditTimeline'],
    lifecycle: {
      installedAt: '2026-06-03 10:00:00',
      disabledAt: '2026-06-23 09:20:00',
    },
  })

  return [
    {
      id: 'workflow-plugin',
      name: workflowManifest.name,
      version: workflowManifest.version,
      description: workflowManifest.description,
      author: workflowManifest.author,
      status: 'enabled',
      extensionTypes: ['route', 'menu', 'permission', 'mock', 'material'],
      manifest: workflowManifest,
      updatedAt: '2026-06-23 09:00:00',
    },
    {
      id: 'visualization-plugin',
      name: visualizationManifest.name,
      version: visualizationManifest.version,
      description: visualizationManifest.description,
      author: visualizationManifest.author,
      status: 'enabled',
      extensionTypes: ['route', 'menu', 'permission', 'mock', 'material'],
      manifest: visualizationManifest,
      updatedAt: '2026-06-23 09:10:00',
    },
    {
      id: 'audit-plugin',
      name: auditManifest.name,
      version: auditManifest.version,
      description: auditManifest.description,
      author: auditManifest.author,
      status: 'disabled',
      extensionTypes: ['route', 'menu', 'permission', 'mock', 'material'],
      manifest: auditManifest,
      updatedAt: '2026-06-23 09:20:00',
    },
  ]
}

const cloneManifest = (manifest: PluginManifest): PluginManifest => ({
  ...manifest,
  routes: manifest.routes.map((route) => ({ ...route })),
  menus: manifest.menus.map((menu) => ({ ...menu })),
  permissions: [...manifest.permissions],
  mockModules: [...manifest.mockModules],
  materials: [...manifest.materials],
  lifecycle: { ...manifest.lifecycle },
})

const clonePlugin = (plugin: PluginRecord): PluginRecord => ({
  ...plugin,
  extensionTypes: [...plugin.extensionTypes],
  manifest: cloneManifest(plugin.manifest),
})

const readString = (value: unknown) =>
  typeof value === 'string' ? value : undefined

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const parseQuery = (url: string): PluginQuery => {
  const { query } = qs.parseUrl(url)

  return {
    current: toPositiveNumber(query.current, 1),
    pageSize: toPositiveNumber(query.pageSize, 20),
    keyword: readString(query.keyword) || '',
    status: (readString(query.status) || '') as PluginStatus | '',
    extensionType: (readString(query.extensionType) || '') as
      | PluginExtensionType
      | '',
  }
}

const parseToggleBody = (body: string): { enabled?: boolean } => {
  try {
    return JSON.parse(body || '{}') as { enabled?: boolean }
  } catch {
    return {}
  }
}

const getPluginIdFromUrl = (url: string, suffix: 'manifest' | 'toggle') => {
  const match = url.match(new RegExp(`/api/plugins/([^/]+)/${suffix}$`))
  return decodeURIComponent(match?.[1] || '')
}

export const createPluginMockStore = (options: PluginMockStoreOptions = {}) => {
  const now = options.now || getNow
  let plugins = seedPlugins()

  const queryPlugins = (params: PluginQuery): PluginPageResult => {
    const current = params.current || 1
    const pageSize = params.pageSize || 20
    const keyword = params.keyword?.trim().toLowerCase() || ''
    const filtered = plugins.filter((plugin) => {
      const matchedKeyword = keyword
        ? `${plugin.name}${plugin.description}${plugin.author}`
            .toLowerCase()
            .includes(keyword)
        : true
      const matchedStatus = params.status
        ? plugin.status === params.status
        : true
      const matchedExtension = params.extensionType
        ? plugin.extensionTypes.includes(params.extensionType)
        : true

      return matchedKeyword && matchedStatus && matchedExtension
    })
    const start = (current - 1) * pageSize

    return {
      list: filtered.slice(start, start + pageSize).map(clonePlugin),
      total: filtered.length,
    }
  }

  const getManifest = (id: string) => {
    const plugin = plugins.find((item) => item.id === id)
    return plugin ? cloneManifest(plugin.manifest) : undefined
  }

  const togglePlugin = (id: string, enabled: boolean): PluginToggleResult => {
    const plugin = plugins.find((item) => item.id === id)
    if (!plugin) {
      return {
        success: false,
        reason: '插件不存在',
      }
    }

    const status: PluginStatus = enabled ? 'enabled' : 'disabled'
    const changedAt = now()
    plugins = plugins.map((item) => {
      if (item.id !== id) return item

      return {
        ...item,
        status,
        updatedAt: changedAt,
        manifest: {
          ...item.manifest,
          lifecycle: {
            ...item.manifest.lifecycle,
            enabledAt: enabled ? changedAt : item.manifest.lifecycle.enabledAt,
            disabledAt: enabled
              ? item.manifest.lifecycle.disabledAt
              : changedAt,
          },
        },
      }
    })

    return {
      success: true,
      id,
      status,
      changedAt,
    }
  }

  return {
    queryPlugins,
    getManifest,
    togglePlugin,
  }
}

const pluginStore = createPluginMockStore()

const setupPluginMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/plugins(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(pluginStore.queryPlugins(parseQuery(params.url)))
        }
      )

      Mock.mock(
        new RegExp('/api/plugins/[^/]+/manifest$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const manifest = pluginStore.getManifest(
            getPluginIdFromUrl(params.url, 'manifest')
          )

          return manifest
            ? responseWrap(manifest)
            : failedResponseWrap(null, '插件不存在', 404)
        }
      )

      Mock.mock(
        new RegExp('/api/plugins/[^/]+/toggle$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const { enabled = true } = parseToggleBody(params.body)

          return responseWrap(
            pluginStore.togglePlugin(
              getPluginIdFromUrl(params.url, 'toggle'),
              enabled
            )
          )
        }
      )
    },
  })
}

export default setupPluginMock
