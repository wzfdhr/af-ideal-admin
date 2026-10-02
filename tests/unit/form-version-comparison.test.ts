import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Comparison from '@/components/form-version-comparison.vue'
import { EQUIPMENT_FORM } from '@af-admin/contracts'
import type { Release } from '@af-admin/contracts'

const release = (id: string, version: number): Release => ({
  id,
  releaseVersion: version,
  tenantId: 'tenant-a',
  applicationId: 'app-1',
  formSnapshot: structuredClone(EQUIPMENT_FORM),
  workflowSnapshot: { version: 1, nodes: [], edges: [] },
  contentHash: 'hash',
  publishedBy: 'admin',
  publishedAt: '2026-10-03T00:00:00Z',
})
describe('immutable published form comparison', () => {
  it('distinguishes empty history, unchanged definitions and unsaved editing content', async () => {
    const wrapper = mount(Comparison, {
      props: {
        releases: [],
        activeReleaseId: null,
        draft: EQUIPMENT_FORM,
        dirty: false,
      },
    })
    expect(
      wrapper.get('[data-testid="form-comparison-empty"]').text()
    ).toContain('尚无发布版本')
    const first = release('release-1', 1)
    await wrapper.setProps({
      releases: [first],
      activeReleaseId: first.id,
      draftRevision: 1,
    })
    expect(
      wrapper.get('[data-testid="form-comparison-equal"]').text()
    ).toContain('无变化')
    const edited = structuredClone(EQUIPMENT_FORM)
    edited.widgetsConfig[0].config.label = 'input'
    await wrapper.setProps({ draft: edited, dirty: true })
    expect(wrapper.get('[role="status"]').text()).toContain('未保存修改')
    expect(wrapper.get('[data-change-key="itemName"]').text()).toContain(
      'input'
    )
    expect(wrapper.get('[data-change-key="itemName"]').text()).not.toContain(
      '字段标签输入框'
    )
    wrapper.unmount()
  })
  it('switches published pairs without changing input and reports invalid future schemas', async () => {
    const first = release('release-1', 1)
    const second = release('release-2', 2)
    second.formSnapshot.widgetsConfig[0].config.required = false
    const wrapper = mount(Comparison, {
      props: {
        releases: [second, first],
        activeReleaseId: second.id,
        draft: second.formSnapshot,
        dirty: false,
      },
    })
    await wrapper.get('[aria-label="表单对比基准版本"]').setValue(first.id)
    await wrapper.get('[aria-label="表单对比目标版本"]').setValue(second.id)
    expect(wrapper.get('[data-change-key="itemName"]').text()).toContain('必填')
    expect(first.formSnapshot.widgetsConfig[0].config.required).toBe(true)
    await wrapper
      .get('[aria-label="表单对比目标版本"]')
      .setValue('editing-draft')
    await wrapper.setProps({ draft: { ...EQUIPMENT_FORM, version: 3 } })
    expect(
      wrapper.get('[data-testid="form-comparison-error"]').text()
    ).toContain('无法对比')
    expect(wrapper.find('[data-testid="form-comparison-equal"]').exists()).toBe(
      false
    )
    wrapper.unmount()
  })
})
