export type FormCondition = {
  field: string
  operator: 'eq' | 'neq'
  value: string | number | boolean
}
export interface FormValidation {
  minLength?: number
  format?: 'email' | 'https-url' | 'phone'
  compare?: { field: string; operator: 'eq' | 'gte' | 'lte' }
}
export interface FormBehavior {
  visibleWhen?: FormCondition
  requiredWhen?: FormCondition
}
export const conditionMatches = (
  condition: FormCondition,
  values: Record<string, unknown>
) => {
  const value = values[condition.field]
  if (value === undefined || value === null || value === '') return false
  const equal =
    typeof condition.value === 'number'
      ? Number(value) === condition.value
      : String(value) === String(condition.value)
  return condition.operator === 'eq' ? equal : !equal
}
export const formFieldState = (
  config: { required?: unknown; behavior?: unknown },
  values: Record<string, unknown>
) => {
  const behavior = config.behavior as FormBehavior | undefined
  return {
    visible:
      !behavior?.visibleWhen || conditionMatches(behavior.visibleWhen, values),
    required:
      config.required === true ||
      Boolean(
        behavior?.requiredWhen &&
          conditionMatches(behavior.requiredWhen, values)
      ),
  }
}
export const isCalendarDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return (
    day <=
    [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  )
}
export const textValidationError = (
  rules: FormValidation,
  value: string
): string | undefined => {
  if (rules.minLength !== undefined && value.length < rules.minLength)
    return `至少填写${rules.minLength}个字符`
  if (
    rules.format === 'email' &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254)
  )
    return '邮箱格式无效'
  if (rules.format === 'https-url') {
    try {
      const url = new URL(value)
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        !url.hostname.includes('.')
      )
        return '需为不含凭据的HTTPS地址'
    } catch {
      return 'HTTPS地址格式无效'
    }
  }
  if (rules.format === 'phone' && !/^\+?[0-9][0-9 -]{5,19}$/.test(value))
    return '电话号码格式无效'
  return undefined
}

export const comparisonError = (
  rule: FormValidation['compare'],
  value: unknown,
  values: Record<string, unknown>,
  numeric: boolean,
  complete = true
): string | undefined => {
  if (!rule || value === undefined || value === null || value === '')
    return undefined
  const other = values[rule.field]
  if (other === undefined || other === null || other === '')
    return complete ? '请先填写比较字段' : undefined
  const left = numeric ? Number(value) : String(value)
  const right = numeric ? Number(other) : String(other)
  if (
    (rule.operator === 'eq' && left !== right) ||
    (rule.operator === 'gte' && left < right) ||
    (rule.operator === 'lte' && left > right)
  )
    return '字段比较不满足已发布规则'
  return undefined
}
