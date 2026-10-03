import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkflowCenter from '@/views/workflowCenter/index.vue'
import { canVisitR1Page, filterR1Menus } from '@/services/r1-menu'

const user = vi.hoisted(() => ({
  tenants: [] as { id: string }[],
  permissions: [] as string[],
}))

vi.mock('@/store/modules/user', () => ({ default: () => user }))

const openCenter = () =>
  mount(WorkflowCenter, {
    global: {
      stubs: {
        'LeaveRuntime': { template: '<div data-testid="real-tasks" />' },
        'WorkflowRuntime': { template: '<div data-testid="demo-tasks" />' },
        'WorkflowRecoveryConsole': {
          template: '<div data-testid="assignment-recovery" />',
        },
        's-navs': true,
      },
    },
  })

describe('workflow center with a real tenant context', () => {
  beforeEach(() => {
    user.tenants = [{ id: 'tenant-a' }]
    user.permissions = ['workflow:todo']
  })

  it('opens only real tasks for a reviewer without configuration permission', () => {
    const wrapper = openCenter()
    expect(wrapper.find('[data-testid="real-tasks"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="demo-tasks"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="assignment-recovery"]').exists()).toBe(
      false
    )
  })

  it('adds authorized recovery without opening the demo runtime', () => {
    user.permissions = ['workflow:todo', 'workflow:recover']
    const wrapper = openCenter()
    expect(wrapper.find('[data-testid="real-tasks"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="assignment-recovery"]').exists()).toBe(
      true
    )
    expect(wrapper.find('[data-testid="demo-tasks"]').exists()).toBe(false)
  })

  it('opens recovery with its own permission without requesting personal tasks', () => {
    user.permissions = ['workflow:recover']
    const wrapper = openCenter()
    expect(canVisitR1Page('workflowCenter', user.permissions)).toBe(true)
    const menus = [{ name: 'workflowCenter' }]
    expect(filterR1Menus(menus, user.permissions)).toEqual(menus)
    expect(wrapper.find('[data-testid="real-tasks"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="assignment-recovery"]').exists()).toBe(
      true
    )
    expect(wrapper.find('[data-testid="demo-tasks"]').exists()).toBe(false)
  })

  it('keeps the explicit demo runtime available without real tenants', () => {
    user.tenants = []
    const wrapper = openCenter()
    expect(wrapper.find('[data-testid="demo-tasks"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="real-tasks"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="assignment-recovery"]').exists()).toBe(
      false
    )
  })
})
