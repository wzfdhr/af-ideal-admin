import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import PermissionButton from '@/components/permission-button.vue'
import useUserStore from '@/store/modules/user'

const buttonStub = {
  template: '<button v-bind="$attrs"><slot /></button>',
}

const mountButton = (props: Record<string, unknown> = {}) =>
  mount(PermissionButton, {
    props,
    slots: {
      default: '新增用户',
    },
    global: {
      stubs: {
        AButton: buttonStub,
      },
    },
  })

describe('PermissionButton', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders when the user owns the required permission', () => {
    const userStore = useUserStore()
    userStore.setInfo({
      role: 'user',
      permissions: ['user:create'],
    })

    const wrapper = mountButton({
      permission: 'user:create',
    })

    expect(wrapper.text()).toContain('新增用户')
  })

  it('hides by default when the user misses the required permission', () => {
    const userStore = useUserStore()
    userStore.setInfo({
      role: 'user',
      permissions: ['user:update'],
    })

    const wrapper = mountButton({
      permission: 'user:create',
    })

    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('can render disabled with a reason when denied', () => {
    const userStore = useUserStore()
    userStore.setInfo({
      role: 'user',
      permissions: [],
    })

    const wrapper = mountButton({
      permission: 'user:create',
      hideWhenDenied: false,
      disabledReason: '缺少 user:create 权限',
    })

    const button = wrapper.get('button')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toBe('缺少 user:create 权限')
  })

  it('renders for wildcard permissions', () => {
    const userStore = useUserStore()
    userStore.setInfo({
      role: 'user',
      permissions: ['*'],
    })

    const wrapper = mountButton({
      permission: 'user:create',
    })

    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('renders when no permission requirement is provided', () => {
    const wrapper = mountButton()

    expect(wrapper.find('button').exists()).toBe(true)
  })
})
