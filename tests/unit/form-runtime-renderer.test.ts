/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import FormRuntimeRenderer, {
  CURRENT_FORM_SCHEMA_VERSION,
  FormRenderer,
  migrateFormSchema,
} from '@/components/form-runtime'
import type { VersionedFormSchema } from '@/components/form-runtime'

const formSchema = migrateFormSchema({
  widgetsConfig: [
    {
      type: 'input',
      uid: 'customerName',
      name: '客户名称',
      config: {
        label: '客户名称',
        placeholder: '请输入客户名称',
        defaultValue: 'Alice',
        width: '100%',
      },
    },
  ],
})

const settle = async () => {
  await Promise.resolve()
  await nextTick()
}

const mountRenderer = (schema: VersionedFormSchema = formSchema) =>
  mount(FormRenderer, {
    props: {
      ast: schema,
    },
    global: {
      stubs: {
        'a-form': defineComponent({
          name: 'AForm',
          setup(_, { slots, expose }) {
            expose({
              validate: () => Promise.resolve(undefined),
            })

            return () =>
              h('form', { 'data-testid': 'runtime-form' }, slots.default?.())
          },
        }),
        'a-form-item': defineComponent({
          name: 'AFormItem',
          props: {
            label: {
              type: String,
              default: '',
            },
            field: {
              type: String,
              default: '',
            },
          },
          setup(props, { slots }) {
            return () =>
              h('label', { 'data-field': props.field }, [
                h(
                  'span',
                  { 'data-testid': `label-${props.field}` },
                  props.label
                ),
                slots.default?.(),
              ])
          },
        }),
        'a-input': defineComponent({
          name: 'AInput',
          props: {
            modelValue: {
              type: [String, Number, Boolean],
              default: '',
            },
            placeholder: {
              type: String,
              default: '',
            },
          },
          setup(props) {
            return () =>
              h('input', {
                'data-testid': 'runtime-input',
                'data-model-value': String(props.modelValue),
                'placeholder': props.placeholder,
              })
          },
        }),
        'a-row': defineComponent({
          name: 'ARow',
          setup(_, { slots }) {
            return () =>
              h('div', { 'data-testid': 'runtime-row' }, slots.default?.())
          },
        }),
        'a-col': defineComponent({
          name: 'ACol',
          setup(_, { slots }) {
            return () =>
              h('div', { 'data-testid': 'runtime-col' }, slots.default?.())
          },
        }),
        'a-tabs': true,
        'a-tab-pane': true,
        'a-input-number': true,
        'a-checkbox-group': true,
        'a-checkbox': true,
        'a-select': true,
        'a-option': true,
        'a-radio-group': true,
        'a-radio': true,
        'a-slider': true,
        'a-switch': true,
        'a-date-picker': true,
        'a-week-picker': true,
        'a-month-picker': true,
        'a-quarter-picker': true,
        'a-year-picker': true,
        'a-range-picker': true,
        'a-rate': true,
        'a-time-picker': true,
        'a-cascader': true,
        'a-textarea': true,
        'a-upload': true,
      },
    },
  })

describe('FormRuntimeRenderer', () => {
  it('exports a stable renderer entry for business pages', () => {
    expect(FormRuntimeRenderer).toBe(FormRenderer)
  })

  it('exports schema migration helpers from the runtime boundary', () => {
    expect(CURRENT_FORM_SCHEMA_VERSION).toBe(1)
    expect(migrateFormSchema({ widgetsConfig: [] })).toMatchObject({
      version: CURRENT_FORM_SCHEMA_VERSION,
      widgetsConfig: [],
    })
  })

  it('renders core input widgets from versioned schemas', () => {
    const wrapper = mountRenderer()

    expect(wrapper.find('[data-testid="runtime-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="label-customerName"]').text()).toBe(
      '客户名称'
    )
    expect(
      wrapper.find('[data-testid="runtime-input"]').attributes('placeholder')
    ).toBe('请输入客户名称')
  })

  it('renders every widget nested inside runtime grid columns', () => {
    const wrapper = mountRenderer(
      migrateFormSchema({
        widgetsConfig: [
          {
            type: 'grid',
            uid: 'contactGrid',
            name: '联系信息',
            config: {},
            cols: [
              {
                span: 24,
                widgets: [
                  {
                    type: 'input',
                    uid: 'contactName',
                    name: '联系人',
                    config: {
                      label: '联系人',
                      defaultValue: 'Alice',
                    },
                  },
                  {
                    type: 'input',
                    uid: 'contactPhone',
                    name: '联系电话',
                    config: {
                      label: '联系电话',
                      defaultValue: '17600000000',
                    },
                  },
                ],
              },
            ],
          },
        ],
      })
    )

    expect(wrapper.find('[data-testid="label-contactName"]').text()).toBe(
      '联系人'
    )
    expect(wrapper.find('[data-testid="label-contactPhone"]').text()).toBe(
      '联系电话'
    )
  })

  it('does not render raw runtime data debug output', () => {
    const wrapper = mountRenderer()

    expect(wrapper.find('pre').exists()).toBe(false)
  })

  it('exposes validation and submit methods for production usage', async () => {
    const wrapper = mountRenderer()
    const runtime = wrapper.vm as unknown as {
      getValues: () => Record<string, unknown>
      submit: () => Promise<boolean>
      validate: () => Promise<boolean>
    }

    expect(runtime.getValues()).toEqual({
      customerName: 'Alice',
    })
    await expect(runtime.validate()).resolves.toBe(true)
    await expect(runtime.submit()).resolves.toBe(true)
    expect(wrapper.emitted('submit')?.[0]).toEqual([
      {
        customerName: 'Alice',
      },
    ])
  })

  it('recovers from blocked remote option urls without breaking the form', async () => {
    const wrapper = mountRenderer(
      migrateFormSchema({
        dataSources: [
          {
            key: 'external',
            name: '外部接口',
            url: 'https://example.com/options',
          },
        ],
        widgetsConfig: [
          {
            type: 'select',
            uid: 'owner',
            name: '负责人',
            config: {
              label: '负责人',
              optionsType: 'remote',
              optionsUrl: 'https://example.com/options',
              options: [],
            },
          },
        ],
      })
    )

    await settle()

    expect(wrapper.find('[data-testid="runtime-form"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('未授权的远程数据源')
  })
  it('renders legacy date fields that omit an explicit picker mode', () => {
    const schema = migrateFormSchema({
      widgetsConfig: [
        {
          type: 'date-picker',
          uid: 'startDate',
          name: '开始日期',
          config: { label: '开始日期', required: true },
        },
      ],
    })
    const wrapper = mountRenderer(schema)
    expect(wrapper.find('a-date-picker-stub').exists()).toBe(true)
  })
  it('clears hidden editing values and reflects the shared conditional required rule after driver changes', async () => {
    const schema = migrateFormSchema({
      version: 2,
      formConfig: { size: 'medium', layout: 'vertical', labelAlign: 'right' },
      dataSources: [],
      widgetsConfig: [
        {
          type: 'input',
          uid: 'kind',
          name: '范围',
          config: { defaultValue: 'internal' },
        },
        {
          type: 'input',
          uid: 'email',
          name: '联系邮箱',
          config: {
            validation: { format: 'email' },
            behavior: {
              visibleWhen: { field: 'kind', operator: 'eq', value: 'external' },
              requiredWhen: {
                field: 'kind',
                operator: 'eq',
                value: 'external',
              },
            },
          },
        },
      ],
    })
    const wrapper = mountRenderer(schema)
    const runtime = wrapper.vm as unknown as {
      setValues: (values: Record<string, unknown>) => void
      getValues: () => Record<string, unknown>
    }
    expect(wrapper.find('[data-field="email"]').exists()).toBe(false)
    runtime.setValues({ kind: 'external', email: 'old@example.test' })
    await settle()
    expect(wrapper.find('[data-field="email"]').attributes('required')).toBe(
      'true'
    )
    runtime.setValues({ kind: 'internal', email: 'old@example.test' })
    await settle()
    expect(runtime.getValues()).toEqual({ kind: 'internal' })
    expect(wrapper.find('[data-field="email"]').exists()).toBe(false)
    runtime.setValues({ kind: 'external' })
    await settle()
    expect(wrapper.find('[data-field="email"]').exists()).toBe(true)
    expect(runtime.getValues().email).toBeUndefined()
    wrapper.unmount()
  })
  it('preserves intentionally absent editing fields across schema rebuild instead of restoring configured defaults', async () => {
    const schema = migrateFormSchema({
      widgetsConfig: [
        {
          type: 'input',
          uid: 'email',
          name: '邮箱',
          config: { defaultValue: 'old@example.test' },
        },
      ],
    })
    const wrapper = mountRenderer(schema)
    await wrapper.setProps({ modelValue: {} })
    await wrapper.setProps({ ast: migrateFormSchema(schema) })
    await settle()
    const runtime = wrapper.vm as unknown as {
      getValues: () => Record<string, unknown>
    }
    expect(runtime.getValues()).toEqual({})
    wrapper.unmount()
  })
})
