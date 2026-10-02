import { invalid, parseForm } from './schemas'
import { isCalendarDate } from './form-behavior'
import type {
  FormSchema,
  WorkflowCondition,
  WorkflowPredicate,
  WorkflowSchema,
} from './schemas'

export const workflowConditionFields = (input: unknown) => {
  const form = parseForm(input)
  return [
    ...form.widgetsConfig.map((field) => ({
      id: field.uid,
      label: String(field.config.label || field.name),
      valueType:
        field.type === 'date-picker'
          ? ('date' as const)
          : ((field.config.valueType ||
              'text') as WorkflowPredicate['valueType']),
    })),
    ...(form.formConfig.computedFields || []).map((rule) => ({
      id: rule.id,
      label: `计算金额 ${rule.id}`,
      valueType: 'decimal' as const,
    })),
  ]
}
const typedValue = (
  type: WorkflowPredicate['valueType'],
  value: unknown
): string | number => {
  if (type === 'integer') {
    if (
      !['string', 'number'].includes(typeof value) ||
      !/^\d{1,9}$/.test(String(value))
    )
      invalid('condition', '条件整数值无效')
    return Number(value)
  }
  if (type === 'decimal') {
    if (typeof value !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value))
      invalid('condition', '条件金额值无效')
    const [whole, fraction = ''] = String(value).split('.')
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  }
  if (typeof value !== 'string' || value.length > 2000)
    invalid('condition', '条件文本值无效')
  if (type === 'date' && !isCalendarDate(value))
    invalid('condition', '条件日期值无效')
  return value as string
}
export const validateWorkflowConditionBindings = (
  workflow: WorkflowSchema,
  formInput: FormSchema | unknown
) => {
  const fields = new Map(
    workflowConditionFields(formInput).map((field) => [field.id, field])
  )
  workflow.nodes.forEach((node) =>
    node.config.condition?.predicates.forEach((rule) => {
      if (fields.get(rule.field)?.valueType !== rule.valueType)
        invalid(node.id, '条件字段不存在或类型与表单不一致')
      typedValue(rule.valueType, rule.value)
    })
  )
}
export const evaluateWorkflowCondition = (
  condition: WorkflowCondition,
  values: Record<string, unknown>
) => {
  // Evaluate every predicate before combining, so an invalid operand never hides behind short circuit.
  const results = condition.predicates.map((rule) => {
    const raw = values[rule.field]
    const right = typedValue(rule.valueType, rule.value)
    if (raw === undefined || raw === null || raw === '') return false
    const left = typedValue(rule.valueType, raw)
    switch (rule.operator) {
      case 'eq':
        return left === right
      case 'neq':
        return left !== right
      case 'gt':
        return left > right
      case 'gte':
        return left >= right
      case 'lt':
        return left < right
      case 'lte':
        return left <= right
      default:
        return invalid('condition', '不支持的判断方式')
    }
  })
  return condition.mode === 'all'
    ? results.every(Boolean)
    : results.some(Boolean)
}
