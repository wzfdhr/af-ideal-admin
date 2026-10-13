import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import AudiencePicker from '@/components/messaging/audience-picker.vue'
import DeliveryPicker from '@/components/messaging/delivery-picker.vue'

const catalogue = {
  people: [
    { id: 'member-1', name: '张三' },
    { id: 'member-2', name: '李四' },
  ],
  roles: [{ id: 'role-1', name: '审批人' }],
  departments: [{ id: 'department-1', name: '运营部' }],
}

describe('messaging audience picker', () => {
  it('uses a labeled native select and leaves native keyboard behavior available', () => {
    const wrapper = mount(AudiencePicker, {
      props: { modelValue: { scope: 'self' }, ...catalogue },
    })
    const select = wrapper.get('select').element as HTMLSelectElement
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })

    expect(wrapper.get('legend').text()).toBe('当前租户接收范围')
    expect(select.closest('label')?.textContent).toContain('接收范围')
    expect(select.tabIndex).toBe(0)
    expect(select.dispatchEvent(event)).toBe(true)
    expect(event.defaultPrevented).toBe(false)
    expect(wrapper.find('input[type="text"]').exists()).toBe(false)
    expect(wrapper.find('[role="combobox"]').exists()).toBe(false)
  })

  it.each(['self', 'all', 'role', 'department', 'users'] as const)(
    'changes to %s without carrying stale target or explicit identities',
    async (scope) => {
      const current = {
        scope: 'users' as const,
        targetId: 'stale-role',
        userIds: ['member-1'],
      }
      const wrapper = mount(AudiencePicker, {
        props: { modelValue: current, ...catalogue },
      })

      await wrapper
        .get('[data-testid="messaging-audience-scope"]')
        .setValue(scope)

      expect(wrapper.emitted('update:modelValue')).toEqual([[{ scope }]])
      expect(current.userIds).toEqual(['member-1'])
      expect(current.targetId).toBe('stale-role')
    }
  )

  it.each([
    ['role', 'role-1', '审批人'],
    ['department', 'department-1', '运营部'],
  ] as const)(
    'limits %s choices to catalogue IDs and emits the selected identity',
    async (scope, targetId, name) => {
      const wrapper = mount(AudiencePicker, {
        props: { modelValue: { scope }, ...catalogue },
      })
      const target = wrapper.get('[data-testid="messaging-audience-target"]')

      expect(
        target.findAll('option').map((option) => option.attributes('value'))
      ).toEqual(['', targetId])
      expect(target.findAll('option')[1].text()).toBe(name)
      await target.setValue(targetId)

      expect(wrapper.emitted('update:modelValue')).toEqual([
        [{ scope, targetId }],
      ])
      expect(wrapper.findAll('select')).toHaveLength(2)
      expect(wrapper.find('input').exists()).toBe(false)
    }
  )

  it('selects and clears explicit catalogue members without mutating its input', async () => {
    const current = { scope: 'users' as const, userIds: ['member-1'] }
    const wrapper = mount(AudiencePicker, {
      props: { modelValue: current, ...catalogue },
    })
    const inputs = wrapper.findAll('input[type="checkbox"]')

    expect(inputs).toHaveLength(2)
    expect((inputs[0].element as HTMLInputElement).checked).toBe(true)
    expect(inputs[1].element.closest('label')?.textContent).toContain('李四')
    await inputs[1].setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([
      { scope: 'users', userIds: ['member-1', 'member-2'] },
    ])
    expect(current.userIds).toEqual(['member-1'])

    await wrapper.setProps({
      modelValue: { scope: 'users', userIds: ['member-1', 'member-2'] },
    })
    await inputs[0].setValue(false)
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([
      { scope: 'users', userIds: ['member-2'] },
    ])
  })

  it('preserves selected IDs outside the search while changing another visible member', async () => {
    const current = { scope: 'users' as const, userIds: ['member-1'] }
    const wrapper = mount(AudiencePicker, {
      props: { modelValue: current, ...catalogue },
    })
    await wrapper
      .get('[data-testid="messaging-audience-search"]')
      .setValue('李四')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('当前已选择 1 人')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.get('input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([
      { scope: 'users', userIds: ['member-1', 'member-2'] },
    ])
    await wrapper.setProps({
      modelValue: { scope: 'users', userIds: ['member-1', 'member-2'] },
    })
    await wrapper
      .get('[data-testid="messaging-audience-search"]')
      .setValue('无匹配的名字')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('当前已选择 2 人')
    await wrapper.get('button').trigger('click')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2)
    wrapper
      .findAll('input[type="checkbox"]')
      .forEach((input) =>
        expect((input.element as HTMLInputElement).checked).toBe(true)
      )
    expect(current.userIds).toEqual(['member-1'])
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  it('prevents search Enter submitting a native parent form while Space and hidden selections remain usable', async () => {
    const submitted = vi.fn((event: Event) => event.preventDefault())
    const current = ref({ scope: 'users' as const, userIds: ['member-1'] })
    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h('form', { onSubmit: submitted }, [
              h(AudiencePicker, {
                ...catalogue,
                'modelValue': current.value,
                'onUpdate:modelValue': (value: typeof current.value) => {
                  current.value = value
                },
              }),
            ])
        },
      }),
      { attachTo: document.body }
    )
    const search = wrapper.get('[data-testid="messaging-audience-search"]')
    await search.setValue('李四')
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    const defaultAllowed = search.element.dispatchEvent(enter)
    // Synthetic JSDOM keys have no implicit form action; requestSubmit exercises
    // the real parent form only when the key has not cancelled that action.
    if (defaultAllowed)
      (wrapper.get('form').element as HTMLFormElement).requestSubmit()
    expect(enter.defaultPrevented).toBe(true)
    expect(submitted).not.toHaveBeenCalled()
    const member = wrapper.get('input[type="checkbox"]')
    const space = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    })
    expect(member.element.dispatchEvent(space)).toBe(true)
    expect(space.defaultPrevented).toBe(false)
    // Complete the native checkbox activation that JSDOM does not synthesize.
    const memberInput = member.element as HTMLInputElement
    memberInput.click()
    await wrapper.vm.$nextTick()
    expect(current.value.userIds).toEqual(['member-1', 'member-2'])
    await search.setValue('无匹配成员')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
    expect(current.value.userIds).toEqual(['member-1', 'member-2'])
    await wrapper.get('button').trigger('click')
    wrapper
      .findAll('input[type="checkbox"]')
      .forEach((input) =>
        expect((input.element as HTMLInputElement).checked).toBe(true)
      )
    expect(submitted).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('explains an empty explicit audience without offering arbitrary identity input', () => {
    const wrapper = mount(AudiencePicker, {
      props: {
        modelValue: { scope: 'users', userIds: [] },
        ...catalogue,
        people: [],
      },
    })

    expect(wrapper.text()).toContain('当前没有可选的启用成员')
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.text()).toContain('服务器重新核对实际接收成员')
  })

  it('disables its native select and member controls through the fieldset', () => {
    const wrapper = mount(AudiencePicker, {
      props: {
        modelValue: { scope: 'users', userIds: [] },
        ...catalogue,
        disabled: true,
      },
    })

    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    wrapper.findAll('select, input').forEach((control) => {
      expect(control.element.matches(':disabled')).toBe(true)
    })
    ;(wrapper.get('input').element as HTMLInputElement).click()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('messaging delivery picker', () => {
  it('provides labeled native checkbox choices with keyboard focus', () => {
    const wrapper = mount(DeliveryPicker, {
      props: { modelValue: ['in-app'], emailEnabled: true, label: '接收通道' },
    })
    const inputs = wrapper.findAll('input[type="checkbox"]')

    expect(wrapper.get('legend').text()).toBe('接收通道')
    expect(inputs).toHaveLength(3)
    expect(
      inputs.map((input) => input.element.closest('label')?.textContent?.trim())
    ).toEqual(['站内信', 'WebSocket', '邮件'])
    inputs.forEach((input) => {
      expect((input.element as HTMLInputElement).tabIndex).toBe(0)
    })
  })

  it('adds and removes selected modes without mutating or duplicating input choices', async () => {
    const current = ['in-app', 'in-app']
    const wrapper = mount(DeliveryPicker, {
      props: { modelValue: current, emailEnabled: true },
    })
    const inputs = wrapper.findAll('input[type="checkbox"]')

    await inputs[1].setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([
      ['in-app', 'websocket'],
    ])
    expect(current).toEqual(['in-app', 'in-app'])

    await wrapper.setProps({ modelValue: ['in-app', 'websocket'] })
    await inputs[1].setValue(false)
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([['in-app']])
  })

  it('disables email using the server reason and ignores its native click', () => {
    const reason = '当前租户未配置邮件凭据'
    const wrapper = mount(DeliveryPicker, {
      props: {
        modelValue: ['in-app'],
        emailEnabled: false,
        emailReason: reason,
      },
    })
    const inputs = wrapper.findAll('input[type="checkbox"]')
    const email = inputs[2].element as HTMLInputElement

    expect(email.disabled).toBe(true)
    expect(inputs[0].element.matches(':disabled')).toBe(false)
    expect(inputs[1].element.matches(':disabled')).toBe(false)
    expect(wrapper.get('.messaging-muted').text()).toBe(reason)
    email.click()
    expect(email.checked).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('defaults email to unavailable until the server returns channel availability', () => {
    const wrapper = mount(DeliveryPicker, { props: { modelValue: ['in-app'] } })
    const email = wrapper.findAll('input[type="checkbox"]')[2]
      .element as HTMLInputElement

    expect(email.disabled).toBe(true)
    expect(wrapper.text()).toContain(
      '邮件服务不可用，请等待服务器返回通道配置。'
    )
  })

  it('allows email after server availability changes and hides the unavailable reason', async () => {
    const wrapper = mount(DeliveryPicker, {
      props: {
        modelValue: ['in-app'],
        emailEnabled: false,
        emailReason: '当前租户未配置邮件凭据',
      },
    })

    await wrapper.setProps({ emailEnabled: true })
    await wrapper.findAll('input[type="checkbox"]')[2].setValue(true)

    expect(wrapper.find('.messaging-muted').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toEqual([
      [['in-app', 'email']],
    ])
  })

  it('disables every native choice while the owning command is pending', () => {
    const wrapper = mount(DeliveryPicker, {
      props: { modelValue: ['in-app'], emailEnabled: true, disabled: true },
    })
    const inputs = wrapper.findAll('input[type="checkbox"]')

    inputs.forEach((input) => {
      expect(input.element.matches(':disabled')).toBe(true)
      ;(input.element as HTMLInputElement).click()
    })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})

it('bounds send choices by the immutable approved version modes', () => {
  const wrapper = mount(DeliveryPicker, {
    props: {
      modelValue: ['in-app'],
      allowedModes: ['in-app'],
      emailEnabled: true,
    },
  })
  const inputs = wrapper.findAll('input[type=checkbox]')
  expect((inputs[0].element as HTMLInputElement).disabled).toBe(false)
  expect((inputs[1].element as HTMLInputElement).disabled).toBe(true)
  expect((inputs[2].element as HTMLInputElement).disabled).toBe(true)
  ;(inputs[1].element as HTMLInputElement).click()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})
