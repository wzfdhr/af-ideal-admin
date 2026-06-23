import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PluginCenter from '@/views/plugin/center/index.vue'
import type {
  PluginManifest,
  PluginPageResult,
  PluginRecord,
} from '@/api/plugin'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  fetchPluginManifest: vi.fn(),
  fetchPlugins: vi.fn(),
  togglePluginStatus: vi.fn(),
}))

vi.mock('@/api/plugin', () => ({
  fetchPluginManifest: apiMocks.fetchPluginManifest,
  fetchPlugins: apiMocks.fetchPlugins,
  togglePluginStatus: apiMocks.togglePluginStatus,
}))

const manifest: PluginManifest = {
  id: 'workflow-plugin',
  name: 'Workflow Plugin',
  version: '1.0.0',
  description: '流程能力插件',
  author: 'Aheart',
  routes: [{ name: 'workflowCenter', path: '/Scalability/workflowCenter' }],
  menus: [
    { name: 'workflowCenter', locale: 'menu.Scalability.workflowCenter' },
  ],
  permissions: ['workflow:todo', 'workflow:approve'],
  mockModules: ['workflow'],
  materials: ['WorkflowPanel'],
  lifecycle: {
    installedAt: '2026-06-01 10:00:00',
    enabledAt: '2026-06-23 09:00:00',
  },
}

const plugin: PluginRecord = {
  id: 'workflow-plugin',
  name: 'Workflow Plugin',
  version: '1.0.0',
  description: '流程能力插件',
  author: 'Aheart',
  status: 'enabled',
  extensionTypes: ['route', 'menu', 'permission', 'mock', 'material'],
  manifest,
  updatedAt: '2026-06-23 09:00:00',
}

const pluginResult: PluginPageResult = {
  list: [plugin],
  total: 1,
}

describe('PluginCenter page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchPlugins.mockResolvedValue(pluginResult)
    apiMocks.fetchPluginManifest.mockResolvedValue(manifest)
    apiMocks.togglePluginStatus.mockResolvedValue({
      success: true,
      id: 'workflow-plugin',
      status: 'disabled',
      changedAt: '2026-06-23 10:00:00',
    })
  })

  it('loads plugins and selected manifest registration details', async () => {
    const wrapper = mount(PluginCenter)
    await flushPromises()
    await flushPromises()

    expect(apiMocks.fetchPlugins).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      keyword: '',
      status: '',
      extensionType: '',
    })
    expect(apiMocks.fetchPluginManifest).toHaveBeenCalledWith('workflow-plugin')
    expect(wrapper.find('[data-testid="plugin-center"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Workflow Plugin')
    expect(wrapper.text()).toContain('workflow:todo')
    expect(wrapper.text()).toContain('WorkflowPanel')
  })

  it('filters by keyword and toggles plugin lifecycle status', async () => {
    const wrapper = mount(PluginCenter)
    await flushPromises()

    await wrapper
      .find<HTMLInputElement>('[data-testid="plugin-keyword"]')
      .setValue('workflow')
    await wrapper
      .find<HTMLSelectElement>('[data-testid="plugin-extension-type"]')
      .setValue('route')
    await wrapper.find('[data-testid="plugin-query"]').trigger('click')
    await flushPromises()

    expect(apiMocks.fetchPlugins).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 20,
      keyword: 'workflow',
      status: '',
      extensionType: 'route',
    })

    await wrapper
      .find('[data-testid="plugin-toggle-workflow-plugin"]')
      .trigger('click')
    await flushPromises()

    expect(apiMocks.togglePluginStatus).toHaveBeenCalledWith(
      'workflow-plugin',
      false
    )
  })
})
