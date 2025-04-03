import { provide, ref, Ref } from 'vue'
import { cloneDeep } from 'lodash'
import { generateUID } from '@/utils'
import { AST, WidgetsConfig, FormDesignerContext, contextSymbol } from './types'

// widget actions injected to widget-form-items
export const useWidgetActions = (ast: Ref<AST>) => {
  const selectedWidget = ref<WidgetsConfig>()

  const setSelectedWidget = (widget: WidgetsConfig) => {
    selectedWidget.value = widget
  }

  const cloneWidgetConfigFromRaw = (config: WidgetsConfig) => {
    const uid = generateUID()
    config.uid = uid
    return cloneDeep(config)
  }

  const duplicateWidget = (idx: number) => {
    const newWidgetConfig = { ...ast.value.widgetsConfig[idx] }
    ast.value.widgetsConfig.splice(idx, 0, newWidgetConfig)
  }

  const addWidget = (widget: WidgetsConfig, idx?: number) => {
    if (!idx) {
      ast.value.widgetsConfig.push(widget)
    } else {
      ast.value.widgetsConfig.splice(idx, 0, widget)
    }
  }

  provide<FormDesignerContext>(contextSymbol, {
    selectedWidget,
    setSelectedWidget,
    addWidget,
    duplicateWidget,
    ast,
  })

  return { cloneWidgetConfigFromRaw, selectedWidget }
}

/**
 * input
 * input-number
 * select
 * checkbox-group
 * radio-group
 * slider
 * switch
 * cascader
 * date-picker
 * rate
 * textarea
 * time-picker
 * upload
 */

export const fieldsMap: Record<string, WidgetsConfig> = {
  grid: {
    type: 'grid',
    name: '栅格布局',
    cols: [
      {
        span: 12,
        widgets: [],
      },
      {
        span: 12,
        widgets: [],
      },
    ],
    uid: '',
    config: {
      width: '100%',
      gutter: 16,
      justify: 'start',
      align: 'start',
    },
  },
  tab: {
    type: 'tab',
    name: '标签页',
    uid: '',
    panes: [
      {
        name: '标签页1',
        widgets: [],
      },
      {
        name: '标签页2',
        widgets: [],
      },
    ],
    config: {
      type: 'line',
      width: '100%',
    },
  },
  input: {
    type: 'input',
    name: '输入框',
    uid: '',
    config: {
      width: '100%',
      label: '输入框',
      allowClear: false,
      defaultValue: '',
      disabled: false,
      maxLength: 10,
      placeholder: '',
      readonly: false,
      required: false,
      showWordLimit: false,
    },
  },
  checkbox: {
    type: 'checkbox',
    name: '复选框',
    uid: '',
    config: {
      label: '复选框',
      width: '100%',
      defaultValue: [],
      disabled: false,
      direction: 'horizontal',
      optionsType: 'fixed',
      indeterminate: false,
      options: [
        { label: '选项1', value: '0' },
        { label: '选项2', value: '1' },
        { label: '选项3', value: '3' },
      ],
    },
  },
  inputNumber: {
    type: 'inputNumber',
    name: '数字输入框',
    uid: '',
    config: {
      width: '100%',
      label: '数字输入框',
      allowClear: false,
      readonly: false,
      required: false,
      placeholder: '',
      disabled: false,
      error: false,
      size: 'medium',
      precision: 1,
      step: 1,
    },
  },
  inputTag: {
    type: 'inputTag',
    name: '标签输入框',
    uid: '',
    config: {
      label: '标签输入框',
      width: '100%',
      defaultValue: ['123', '456'],
    },
  },
  select: {
    type: 'select',
    name: '下拉选择器',
    uid: '',
    config: {
      width: '100%',
      label: '下拉选择器',
      allowClear: false,
      allowCreate: false,
      allowSearch: false,
      defaultValue: '',
      disabled: false,
      limit: 0,
      placeholder: '',
      required: false,
      optionsType: 'fixed',
      options: [
        { label: '选项1', value: '1' },
        { label: '选项2', value: '2' },
        { label: '选项3', value: '3' },
      ],
    },
  },
  radio: {
    type: 'radio',
    name: '单选框',
    uid: '',
    config: {
      label: '单选框',
      disabled: false,
      direction: 'horizontal',
      defaultValue: '',
      type: 'radio',
      width: '100%',
      optionsType: 'fixed',
      options: [
        { label: '选项0', value: '0' },
        { label: '选项1', value: '1' },
        { label: '选项2', value: '2' },
        { label: '选项3', value: '3' },
      ],
    },
  },
  slider: {
    type: 'slider',
    name: '滑动输入条',
    uid: '',
    config: {
      label: '滑动输入条',
      defaultValue: undefined,
      step: 1,
      min: 0,
      marks: '',
      max: 100,
      direction: 'horizontal',
      disabled: false,
      showTicks: false,
      showInput: false,
      range: false,
      width: '99%',
    },
  },
  switch: {
    type: 'switch',
    name: '开关',
    uid: '',
    config: {
      label: '开关',
      defaultChecked: false,
      type: 'circle',
      size: 'medium',
      checkedValue: true,
      uncheckedValue: false,
      disabled: false,
    },
  },
  textArea: {
    type: 'textarea',
    name: '文本域',
    uid: '',
    config: {
      label: '文本域',
      width: '100%',
      placeholder: '',
      disabled: false,
      maxLength: 100,
      showWordLimit: false,
      allowClear: false,
      autoSize: false,
    },
  },
  cascader: {
    type: 'cascader',
    name: '级联选择器',
    uid: '',
    config: {
      label: '级联选择器',
      width: '100%',
      placeholder: '',
      defaultValue: '',
      disabled: false,
      allowSearch: false,
      allowClear: false,
      multiple: false,
      checkStrictly: false,
      expandTrigger: 'click',
      optionsType: 'fixed',
      options:
        '[{"value":"beijing","label":"Beijing","children":[{"value":"chaoyang","label":"ChaoYang","children":[{"value":"datunli","label":"Datunli"}]}]}]',
    },
  },
  datePicker: {
    type: 'date-picker',
    name: '日期选择器',
    uid: '',
    config: {
      label: '日期选择器',
      width: '100%',
      allowClear: true,
      readonly: false,
      error: false,
      disabled: false,
      showTime: false,
      modeSelection: 'date',
    },
  },
  rate: {
    type: 'rate',
    name: '评分',
    uid: '',
    config: {
      label: '评分',
      count: 5,
      color: 'orange',
      allowHalf: false,
      grading: false,
      readonly: false,
      disabled: false,
    },
  },
  timePicker: {
    type: 'time-picker',
    name: '时间选择器',
    uid: '',
    config: {
      label: '时间选择器',
      width: '100%',
      type: 'time',
      disabled: false,
      allowClear: true,
      readonly: false,
      error: false,
      size: 'medium',
      format: 'HH:mm:ss',
      step: {
        hour: 1,
        minute: 1,
        second: 1,
      },
    },
  },
  upload: {
    type: 'upload',
    name: '上传',
    uid: '',
    config: {
      label: '上传',
      action: '',
      disabled: false,
      multiple: false,
      limit: 9,
    },
  },
}

export const fields = Object.values(fieldsMap)
