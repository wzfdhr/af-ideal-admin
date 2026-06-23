/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import DictRadio from '@/components/dict/dict-radio.vue'
import DictSelect from '@/components/dict/dict-select.vue'
import type { PropType } from 'vue'

const mocks = vi.hoisted(() => ({
  getOptions: vi.fn(),
}))

vi.mock('@/services/dictionary', () => ({
  dictionaryService: {
    getOptions: mocks.getOptions,
    getState: vi.fn(() => ({ loading: false, error: '', options: [] })),
  },
}))

vi.mock('@/components/pro-ui', () => ({
  adminUi: {
    Select: defineComponent({
      name: 'MockDictSelect',
      props: {
        modelValue: {
          type: [String, Number],
          default: '',
        },
        options: {
          type: Array as PropType<Array<{ label: string; value: string }>>,
          default: () => [],
        },
        loading: {
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
              'data-testid': 'dict-select',
              'value': props.modelValue,
              'data-loading': String(props.loading),
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
    RadioGroup: defineComponent({
      name: 'MockDictRadioGroup',
      props: {
        modelValue: {
          type: [String, Number],
          default: '',
        },
      },
      emits: ['update:modelValue'],
      setup(_, { slots }) {
        return () =>
          h('div', { 'data-testid': 'dict-radio' }, slots.default?.())
      },
    }),
    Radio: defineComponent({
      name: 'MockDictRadio',
      props: {
        value: {
          type: [String, Number],
          required: true,
        },
      },
      setup(props, { slots }) {
        return () =>
          h('label', { 'data-value': props.value }, [
            h('input', { type: 'radio', value: props.value }),
            slots.default?.(),
          ])
      },
    }),
  },
}))

const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('dictionary components', () => {
  beforeEach(() => {
    mocks.getOptions.mockReset()
  })

  it('renders DictSelect options from the shared dictionary service', async () => {
    mocks.getOptions.mockResolvedValueOnce([{ label: '男', value: 'male' }])

    const wrapper = mount(DictSelect, {
      props: {
        dictKey: 'gender',
        modelValue: '',
      },
    })
    await settle()

    expect(mocks.getOptions).toHaveBeenCalledWith('gender')
    expect(wrapper.find('option').text()).toBe('男')
  })

  it('renders DictRadio options from the same dictionary service', async () => {
    mocks.getOptions.mockResolvedValueOnce([
      { label: '启用', value: 'enabled' },
    ])

    const wrapper = mount(DictRadio, {
      props: {
        dictKey: 'status',
        modelValue: '',
      },
    })
    await settle()

    expect(mocks.getOptions).toHaveBeenCalledWith('status')
    expect(wrapper.find('[data-value="enabled"]').text()).toContain('启用')
  })

  it('renders DictSelect loading errors and emits loadError', async () => {
    mocks.getOptions.mockRejectedValueOnce(new Error('字典 gender 加载失败'))

    const wrapper = mount(DictSelect, {
      props: {
        dictKey: 'gender',
        modelValue: '',
      },
    })
    await settle()

    expect(wrapper.find('.dict-select__error').text()).toBe(
      '字典 gender 加载失败'
    )
    expect(wrapper.emitted('loadError')?.[0]).toEqual(['字典 gender 加载失败'])
  })

  it('renders DictRadio loading errors and emits loadError', async () => {
    mocks.getOptions.mockRejectedValueOnce(new Error('字典 status 加载失败'))

    const wrapper = mount(DictRadio, {
      props: {
        dictKey: 'status',
        modelValue: '',
      },
    })
    await settle()

    expect(wrapper.find('.dict-radio__error').text()).toBe(
      '字典 status 加载失败'
    )
    expect(wrapper.emitted('loadError')?.[0]).toEqual(['字典 status 加载失败'])
  })
})
