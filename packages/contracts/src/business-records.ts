import { DomainError, record, invalid, parseForm } from './schemas'
import type { FormSchema, JsonObject, LeaveStatus } from './schemas'

export const BUSINESS_PERMISSIONS = {
  read: 'business:read:self',
  create: 'business:create',
  update: 'business:update:self',
  submit: 'business:submit',
  withdraw: 'business:withdraw:self',
} as const
export interface BusinessRecord {
  id: string
  tenantId: string
  applicationReleaseId: string
  applicantId: string
  applicantName: string
  fields: JsonObject
  status: LeaveStatus
  revision: number
  instanceId: string | null
  createdAt: string
  updatedAt: string
  allowedActions: string[]
}
export const validateBusinessFields = (
  schemaInput: unknown,
  input: unknown,
  complete = true
): JsonObject => {
  const schema = parseForm(schemaInput)
  const body = record(input, 'fields')
  const result: JsonObject = {}
  const ids = new Set(schema.widgetsConfig.map((widget) => widget.uid))
  if (Object.keys(body).some((key) => !ids.has(key)))
    invalid('fields', '业务字段不在已发布表单中')
  schema.widgetsConfig.forEach((widget) => {
    const { config } = widget
    let value = body[widget.uid]
    const label = String(config.label || widget.name)
    if (config.readonly === true || config.disabled === true) {
      if (
        value !== undefined &&
        JSON.stringify(value) !== JSON.stringify(config.defaultValue)
      )
        invalid(widget.uid, `${label}为只读字段`)
      value = config.defaultValue
    }
    if (value === undefined || value === null || value === '') {
      if (complete && config.required === true)
        invalid(widget.uid, `${label}为必填项`)
      return
    }
    if (
      ['integer', 'decimal'].includes(String(config.valueType)) &&
      !['string', 'number'].includes(typeof value)
    )
      invalid(widget.uid, `${label}数值类型无效`)
    if (config.valueType === 'integer') {
      const raw = String(value)
      if (!/^\d{1,9}$/.test(raw)) invalid(widget.uid, `${label}需为非负整数`)
      const number = Number(raw)
      const min = typeof config.min === 'number' ? config.min : 0
      const max = typeof config.max === 'number' ? config.max : 100000000
      if (number < min || number > max)
        invalid(widget.uid, `${label}超出允许范围`)
      result[widget.uid] = number
      return
    }
    if (config.valueType === 'decimal') {
      const raw = String(value)
      if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw))
        invalid(widget.uid, `${label}需为最多两位小数的非负金额`)
      const [whole, fraction = ''] = raw.split('.')
      const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
      const min =
        typeof config.min === 'number' ? Math.round(config.min * 100) : 0
      const max =
        typeof config.max === 'number'
          ? Math.round(config.max * 100)
          : 100000000
      if (!Number.isSafeInteger(cents) || cents < min || cents > max)
        invalid(widget.uid, `${label}超出允许范围`)
      result[widget.uid] = `${Math.floor(cents / 100)}.${String(
        cents % 100
      ).padStart(2, '0')}`
      return
    }
    if (
      typeof value !== 'string' ||
      value.length > Number(config.maxLength || 2000)
    )
      invalid(widget.uid, `${label}文本无效或超长`)
    if (['select', 'radio'].includes(widget.type)) {
      const source = schema.dataSources.find(
        (binding) => binding.key === config.optionsSourceKey
      )
      const choices =
        config.optionsType === 'registered'
          ? source?.optionsSnapshot
          : config.options
      const options = Array.isArray(choices) ? choices : []
      if (
        !options.some(
          (option) =>
            option &&
            typeof option === 'object' &&
            !Array.isArray(option) &&
            String(option.value) === value
        )
      )
        invalid(widget.uid, `${label}选项无效`)
    }
    if (
      widget.type === 'date-picker' &&
      !/^\d{4}-\d{2}-\d{2}$/.test(value as string)
    )
      invalid(widget.uid, `${label}日期无效`)
    result[widget.uid] = value as string
  })
  return result
}
export const EQUIPMENT_FORM: FormSchema = {
  version: 1,
  formConfig: {
    size: 'medium',
    layout: 'vertical',
    labelAlign: 'right',
    computedFields: [
      {
        id: 'totalAmount',
        operation: 'quantity-times-price',
        quantity: 'quantity',
        price: 'unitPrice',
      },
    ],
  },
  dataSources: [],
  widgetsConfig: [
    {
      uid: 'itemName',
      type: 'input',
      name: '设备名称',
      config: {
        id: 'itemName',
        label: '设备名称',
        required: true,
        maxLength: 100,
      },
    },
    {
      uid: 'quantity',
      type: 'input',
      name: '领用数量',
      config: {
        id: 'quantity',
        label: '领用数量',
        required: true,
        valueType: 'integer',
        min: 1,
        max: 10000,
        defaultValue: '1',
      },
    },
    {
      uid: 'unitPrice',
      type: 'input',
      name: '参考单价',
      config: {
        id: 'unitPrice',
        label: '参考单价（元）',
        required: false,
        valueType: 'decimal',
        min: 0.01,
        max: 100000,
      },
    },
    {
      uid: 'reason',
      type: 'textarea',
      name: '领用用途',
      config: {
        id: 'reason',
        label: '领用用途',
        required: true,
        maxLength: 500,
      },
    },
  ],
}
export const multiplyMoney = (fields: JsonObject) => {
  const cents =
    Math.round(Number(fields.unitPrice) * 100) * Number(fields.quantity)
  if (!Number.isSafeInteger(cents))
    throw new DomainError(422, 'VALIDATION_ERROR', '计算总额超出范围')
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

export const computeBusinessFields = (
  schemaInput: unknown,
  fields: JsonObject
): JsonObject => {
  const schema = parseForm(schemaInput)
  const result: JsonObject = {}
  schema.formConfig.computedFields?.forEach((rule) => {
    if (fields[rule.quantity] !== undefined && fields[rule.price] !== undefined)
      result[rule.id] = multiplyMoney({
        quantity: fields[rule.quantity],
        unitPrice: fields[rule.price],
      })
  })
  return result
}
