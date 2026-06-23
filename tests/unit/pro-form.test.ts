/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import ProForm from '@/components/pro-form/index.vue'
import type { PropType } from 'vue'

vi.mock('@/components/pro-ui', () => ({
  adminUi: {
    Form: defineComponent({
      name: 'MockAdminForm',
      props: {
        model: {
          type: Object as PropType<Record<string, unknown>>,
          default: () => ({}),
        },
      },
      setup(_, { slots }) {
        return () => h('form', { 'data-testid': 'form' }, slots.default?.())
      },
    }),
    FormItem: defineComponent({
      name: 'MockAdminFormItem',
      props: {
        label: {
          type: String,
          default: '',
        },
        field: {
          type: String,
          default: '',
        },
        validateStatus: {
          type: String,
          default: undefined,
        },
        help: {
          type: String,
          default: undefined,
        },
      },
      setup(props, { slots }) {
        return () =>
          h('label', { 'data-field': props.field }, [
            h('span', { 'data-testid': `label-${props.field}` }, props.label),
            slots.default?.(),
            props.help
              ? h(
                  'small',
                  { 'data-testid': `error-${props.field}` },
                  props.help
                )
              : null,
          ])
      },
    }),
    Input: defineComponent({
      name: 'MockAdminInput',
      props: {
        modelValue: {
          type: [String, Number],
          default: '',
        },
        disabled: {
          type: Boolean,
          default: false,
        },
      },
      emits: ['update:modelValue'],
      setup(props, { emit }) {
        return () =>
          h('input', {
            'value': props.modelValue,
            'disabled': props.disabled,
            'data-testid': 'input',
            'onInput': (event: Event) =>
              emit(
                'update:modelValue',
                (event.target as HTMLInputElement).value
              ),
          })
      },
    }),
    Select: defineComponent({
      name: 'MockAdminSelect',
      props: {
        modelValue: {
          type: [String, Number],
          default: '',
        },
        options: {
          type: Array as PropType<Array<{ label: string; value: string }>>,
          default: () => [],
        },
        disabled: {
          type: Boolean,
          default: false,
        },
      },
      emits: ['update:modelValue'],
      setup(props, { emit }) {
        return () =>
          h(
            'select',
            {
              'value': props.modelValue,
              'disabled': props.disabled,
              'data-testid': 'select',
              'onChange': (event: Event) =>
                emit(
                  'update:modelValue',
                  (event.target as HTMLSelectElement).value
                ),
            },
            props.options.map((option) =>
              h('option', { value: option.value }, option.label)
            )
          )
      },
    }),
    Button: defineComponent({
      name: 'MockAdminButton',
      props: {
        type: {
          type: String,
          default: undefined,
        },
        loading: {
          type: Boolean,
          default: false,
        },
      },
      setup(props, { slots }) {
        return () =>
          h(
            'button',
            {
              'type': 'button',
              'data-type': props.type,
              'data-loading': String(props.loading),
            },
            slots.default?.()
          )
      },
    }),
  },
}))

const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('ProForm', () => {
  it('initializes model from field default values', async () => {
    const wrapper = mount(ProForm, {
      props: {
        schema: [
          {
            field: 'name',
            label: 'Name',
            type: 'input',
            defaultValue: 'Alice',
          },
        ],
      },
    })

    await settle()

    expect(
      (
        wrapper.vm as unknown as { getValues: () => Record<string, unknown> }
      ).getValues()
    ).toEqual({
      name: 'Alice',
    })
  })

  it('blocks submit and exposes validation errors when required fields are empty', async () => {
    const wrapper = mount(ProForm, {
      props: {
        schema: [
          {
            field: 'name',
            label: 'Name',
            type: 'input',
            rules: [{ required: true, message: 'Name is required' }],
          },
        ],
      },
    })

    await (wrapper.vm as unknown as { submit: () => Promise<boolean> }).submit()

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.find('[data-testid="error-name"]').text()).toBe(
      'Name is required'
    )
  })

  it('emits submit with current values and toggles submit loading', async () => {
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 0)
        })
    )
    const wrapper = mount(ProForm, {
      props: {
        schema: [
          {
            field: 'name',
            label: 'Name',
            type: 'input',
            defaultValue: 'Alice',
          },
        ],
        submitter: onSubmit,
      },
    })

    const pending = (
      wrapper.vm as unknown as { submit: () => Promise<boolean> }
    ).submit()
    await nextTick()

    expect(
      wrapper.find('[data-type="primary"]').attributes('data-loading')
    ).toBe('true')
    await pending

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Alice' })
    expect(wrapper.emitted('submit')?.[0]).toEqual([{ name: 'Alice' }])
  })

  it('resets values and disables fields in readonly mode', async () => {
    const wrapper = mount(ProForm, {
      props: {
        readonly: true,
        schema: [
          {
            field: 'name',
            label: 'Name',
            type: 'input',
            defaultValue: 'Alice',
          },
        ],
      },
    })

    await wrapper.find('[data-testid="input"]').setValue('Bob')
    await (wrapper.vm as unknown as { reset: () => void }).reset()

    expect(
      wrapper.find('[data-testid="input"]').attributes('disabled')
    ).toBeDefined()
    expect(
      (
        wrapper.vm as unknown as { getValues: () => Record<string, unknown> }
      ).getValues()
    ).toEqual({
      name: 'Alice',
    })
  })

  it('loads async select options', async () => {
    const wrapper = mount(ProForm, {
      props: {
        schema: [
          {
            field: 'status',
            label: 'Status',
            type: 'select',
            loadOptions: vi
              .fn()
              .mockResolvedValue([{ label: 'Enabled', value: 'enabled' }]),
          },
        ],
      },
    })

    await settle()

    expect(wrapper.find('option').text()).toBe('Enabled')
  })

  it('normalizes submitter failures into a form error event', async () => {
    const submitter = vi.fn().mockRejectedValue(new Error('Network down'))
    const wrapper = mount(ProForm, {
      props: {
        submitErrorText: 'Save failed',
        schema: [
          {
            field: 'name',
            label: 'Name',
            type: 'input',
            defaultValue: 'Alice',
          },
        ],
        submitter,
      },
    })

    const result = await (
      wrapper.vm as unknown as { submit: () => Promise<boolean> }
    ).submit()
    await nextTick()

    expect(result).toBe(false)
    expect(wrapper.find('[data-testid="pro-form-submit-error"]').text()).toBe(
      'Save failed'
    )
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.emitted('submitError')?.[0]?.[0]).toMatchObject({
      message: 'Save failed',
      values: { name: 'Alice' },
    })
    expect(
      wrapper.find('[data-type="primary"]').attributes('data-loading')
    ).toBe('false')
  })

  it('keeps submitter error visible when action buttons are hidden', async () => {
    const wrapper = mount(ProForm, {
      props: {
        hideActions: true,
        submitErrorText: 'Background save failed',
        schema: [
          {
            field: 'name',
            label: 'Name',
            type: 'input',
            defaultValue: 'Alice',
          },
        ],
        submitter: vi.fn().mockRejectedValue(new Error('Server offline')),
      },
    })

    await (wrapper.vm as unknown as { submit: () => Promise<boolean> }).submit()
    await nextTick()

    expect(wrapper.find('[data-testid="pro-form-submit-error"]').text()).toBe(
      'Background save failed'
    )
  })
})
