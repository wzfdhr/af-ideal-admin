/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import FormRuntimeRenderer, { FormRenderer } from '@/components/form-runtime'
import { migrateFormSchema } from '@/components/form-designer/schema'
import type { VersionedFormSchema } from '@/components/form-designer/schema'

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
            placeholder: {
              type: String,
              default: '',
            },
          },
          setup(props) {
            return () =>
              h('input', {
                'data-testid': 'runtime-input',
                'placeholder': props.placeholder,
              })
          },
        }),
        'a-row': true,
        'a-col': true,
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
})
