import { describe, expect, it } from 'vitest'
import { createPluginMockStore } from '@/mock/modules/plugin'

describe('plugin mock store', () => {
  it('seeds plugin manifests and filters by extension type and status', () => {
    const store = createPluginMockStore({
      now: () => '2026-06-23 10:00:00',
    })
    const result = store.queryPlugins({
      current: 1,
      pageSize: 20,
      status: 'enabled',
      extensionType: 'material',
    })

    expect(result.total).toBeGreaterThan(0)
    result.list.forEach((plugin) => {
      expect(plugin.status).toBe('enabled')
      expect(plugin.extensionTypes).toContain('material')
      expect(plugin.manifest.permissions.length).toBeGreaterThan(0)
    })
  })

  it('loads manifest with route, menu, permission, mock and material registration', () => {
    const store = createPluginMockStore()
    const manifest = store.getManifest('workflow-plugin')

    expect(manifest?.routes[0].path).toBe('/workflow')
    expect(manifest?.menus[0].locale).toBe('menu.Scalability.workflowCenter')
    expect(manifest?.permissions).toContain('workflow:todo')
    expect(manifest?.mockModules).toContain('workflow')
    expect(manifest?.materials).toContain('WorkflowPanel')
  })

  it('toggles plugin lifecycle and rejects unknown plugins', () => {
    const store = createPluginMockStore({
      now: () => '2026-06-23 10:00:00',
    })

    const disabled = store.togglePlugin('workflow-plugin', false)
    const missing = store.togglePlugin('missing-plugin', true)

    expect(disabled).toEqual({
      success: true,
      id: 'workflow-plugin',
      status: 'disabled',
      changedAt: '2026-06-23 10:00:00',
    })
    expect(missing).toEqual({
      success: false,
      reason: '插件不存在',
    })
  })
})
