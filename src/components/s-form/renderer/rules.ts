import type { FieldRule } from '@arco-design/web-vue'

const isPlainRule = (value: unknown): value is FieldRule => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  const rule = value as Record<string, unknown>
  const allowedKeys = new Set([
    'required',
    'message',
    'type',
    'length',
    'maxLength',
    'minLength',
    'match',
    'uppercase',
    'lowercase',
    'positive',
    'negative',
    'true',
    'false',
    'number',
    'email',
    'url',
  ])

  return Object.keys(rule).every((key) => allowedKeys.has(key))
}

export const parseWidgetRules = (rules?: string): FieldRule[] | undefined => {
  if (!rules || rules.trim() === '') return undefined

  try {
    const parsed = JSON.parse(rules)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    const safeRules = list.filter(isPlainRule)

    return safeRules.length > 0 ? safeRules : undefined
  } catch {
    return undefined
  }
}
