/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import InputConfig from '@/components/form-designer/config/input-config.vue'
import FieldBehaviorEditor from '@/components/form-designer/field-behavior-editor.vue'
import FormWidgetRenderer from '@/components/s-form/renderer/form-widget-renderer.vue'
import {
  exportFormSchema,
  importFormSchema,
} from '@/components/form-designer/schema/io'
import { contextSymbol } from '@/components/form-designer/types'
import {
  formData,
  formDataSources,
} from '@/components/s-form/renderer/use-form-preview'
import type { IConfigInput } from '@/components/form-designer/types'
import { parseForm, validateBusinessFields } from '@af-admin/contracts'
import type { PropType } from 'vue'

const field = (uid: string): IConfigInput => ({
  uid,
  type: 'input',
  name: uid,
  config: { id: uid, label: uid, valueType: 'text' },
})
const stubs = {
  'a-form-item': defineComponent({
    name: 'AFormItem',
    props: { rules: { type: Array as PropType<any[]>, default: () => [] } },
    setup(_, { slots }) {
      return () => h('label', slots.default?.())
    },
  }),
  'a-input': defineComponent({
    name: 'AInput',
    props: { modelValue: { type: String, default: '' } },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          value: props.modelValue,
          onInput: (event: Event) =>
            emit('update:modelValue', (event.target as HTMLInputElement).value),
        })
    },
  }),
  'a-input-number': true,
  'a-switch': true,
  'a-select': true,
  'a-option': true,
  'a-textarea': true,
  ...Object.fromEntries(
    [
      'checkbox',
      'checkbox-group',
      'radio',
      'radio-group',
      'slider',
      'date-picker',
      'week-picker',
      'month-picker',
      'quarter-picker',
      'year-picker',
      'range-picker',
      'rate',
      'time-picker',
      'cascader',
      'upload',
    ].map((name) => [`a-${name}`, true])
  ),
}

describe('typed coordinate authoring and runtime', () => {
  it('opts into v2 through field type and preserves axis and coordinate on export/import and record reopen', async () => {
    const widget = field('location')
    const ast = ref({
      version: 1,
      formConfig: { size: 'medium', layout: 'vertical', labelAlign: 'right' },
      dataSources: [],
      widgetsConfig: [widget],
    })
    const editor = mount(InputConfig, {
      props: { widgetConfig: widget },
      global: { stubs, provide: { [contextSymbol as symbol]: { ast } } },
    })
    await editor.get('select[aria-label="字段类型"]').setValue('coordinate')
    expect(ast.value.version).toBe(2)
    expect(widget.config.coordinateAxis).toBe('longitude')
    await editor.get('select[aria-label="坐标轴"]').setValue('latitude')
    expect(widget.config.coordinateAxis).toBe('latitude')
    const reopened = importFormSchema(exportFormSchema(ast.value))
    expect(reopened.widgetsConfig[0].config.coordinateAxis).toBe('latitude')
    const saved = validateBusinessFields(parseForm(reopened), {
      location: '-33.868800',
    })
    expect(saved.location).toBe('-33.8688')
    expect(
      validateBusinessFields(reopened, JSON.parse(JSON.stringify(saved)))
    ).toEqual(saved)
    await editor.get('select[aria-label="字段类型"]').setValue('decimal')
    expect(widget.config.coordinateAxis).toBeUndefined()
  })

  it('keeps signed text in the runtime input and reports invalid coordinates before saving', async () => {
    const widget = field('longitude')
    Object.assign(widget.config, {
      valueType: 'coordinate',
      coordinateAxis: 'longitude',
    })
    const values = ref<Record<string, unknown>>({ longitude: '-73.985656' })
    const runtime = mount(FormWidgetRenderer, {
      props: { widget },
      global: {
        stubs,
        provide: {
          [formData as symbol]: values,
          [formDataSources as symbol]: ref([]),
        },
      },
    })
    expect((runtime.get('input').element as HTMLInputElement).value).toBe(
      '-73.985656'
    )
    const rules = runtime.getComponent({ name: 'AFormItem' }).props('rules')
    const validate = (value: unknown) => {
      let error: string | undefined
      rules[rules.length - 1].validator(value, (message?: string) => {
        error = message
      })
      return error
    }
    expect(runtime.get('input').attributes('max-length')).toBe('11')
    expect(validate('-180')).toBeUndefined()
    expect(validate('179.999999')).toBeUndefined()
    ;['180.000001', '1e2', '1.0000001', '1\n', 'alert(1)'].forEach((value) =>
      expect(validate(value)).toContain('经度')
    )
    await runtime.get('input').setValue('-0.000001')
    expect(values.value.longitude).toBe('-0.000001')
    Object.assign(widget.config, { coordinateAxis: 'latitude' })
    await runtime.setProps({
      widget: { ...widget, config: { ...widget.config } },
    })
    expect(validate('-90.000001')).toContain('纬度')
  })

  it('excludes coordinate fields from form condition and comparison controls', () => {
    const widget = field('text')
    const coordinate = field('lon')
    Object.assign(coordinate.config, {
      valueType: 'coordinate',
      coordinateAxis: 'longitude',
    })
    const ast = ref({ widgetsConfig: [widget, coordinate] })
    const editor = mount(FieldBehaviorEditor, {
      props: { widget },
      global: { provide: { [contextSymbol as symbol]: { ast } } },
    })
    expect(
      editor
        .findAll('option')
        .some((option) => option.attributes('value') === 'lon')
    ).toBe(false)
    const coordinateEditor = mount(FieldBehaviorEditor, {
      props: { widget: coordinate },
      global: { provide: { [contextSymbol as symbol]: { ast } } },
    })
    expect(coordinateEditor.find('[aria-label="比较字段"]').exists()).toBe(
      false
    )
  })
})
