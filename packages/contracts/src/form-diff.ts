import { parseForm } from './schemas'
import type { FormSchema, FormWidget, Json, JsonObject } from './schemas'

export interface FormPropertyChange {
  property: string
  before?: Json
  after?: Json
}
export interface FormDefinitionChange {
  key: string
  label: string
  kind: 'added' | 'removed' | 'changed'
  properties: FormPropertyChange[]
}
export interface FormDefinitionDiff {
  fields: FormDefinitionChange[]
  settings: FormPropertyChange[]
  sources: FormDefinitionChange[]
  total: number
}
// Object key order is irrelevant; array order remains meaningful for field/option display.
const canonical = (value: Json | undefined): string => {
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}
const properties = (
  before: JsonObject,
  after: JsonObject
): FormPropertyChange[] =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .flatMap((property) =>
      canonical(before[property]) === canonical(after[property])
        ? []
        : [{ property, before: before[property], after: after[property] }]
    )
const fieldObject = (field: FormWidget, position: number): JsonObject => ({
  ...field.config,
  widgetType: field.type,
  widgetName: field.name,
  position: position + 1,
})
const definitionChanges = (
  before: { key: string; label: string; value: JsonObject }[],
  after: { key: string; label: string; value: JsonObject }[]
): FormDefinitionChange[] => {
  const previous = new Map(before.map((item) => [item.key, item]))
  const current = new Map(after.map((item) => [item.key, item]))
  return [...new Set([...previous.keys(), ...current.keys()])].flatMap(
    (key) => {
      const old = previous.get(key)
      const next = current.get(key)
      const changed = properties(old?.value || {}, next?.value || {})
      if (!changed.length && old && next) return []
      let kind: FormDefinitionChange['kind'] = 'changed'
      if (!old) kind = 'added'
      else if (!next) kind = 'removed'
      return [
        {
          key,
          label: next?.label || old?.label || key,
          kind,
          properties: changed,
        },
      ]
    }
  )
}
export const compareFormDefinitions = (
  beforeInput: unknown,
  afterInput: unknown
): FormDefinitionDiff => {
  const before = parseForm(beforeInput)
  const after = parseForm(afterInput)
  const fields = definitionChanges(
    before.widgetsConfig.map((field, index) => ({
      key: field.uid,
      label: String(field.config.label || field.name),
      value: fieldObject(field, index),
    })),
    after.widgetsConfig.map((field, index) => ({
      key: field.uid,
      label: String(field.config.label || field.name),
      value: fieldObject(field, index),
    }))
  )
  const sourceItems = (items: JsonObject[]) =>
    items.map((item) => ({
      key: String(item.key),
      label: String(item.name),
      value: item,
    }))
  const sources = definitionChanges(
    sourceItems(before.dataSources),
    sourceItems(after.dataSources)
  )
  const settingsObject = (schema: FormSchema): JsonObject => ({
    version: schema.version,
    size: schema.formConfig.size,
    layout: schema.formConfig.layout,
    labelAlign: schema.formConfig.labelAlign,
    ...(schema.formConfig.computedFields === undefined
      ? {}
      : {
          computedFields: schema.formConfig.computedFields.map((rule) => ({
            ...rule,
          })),
        }),
  })
  const settings = properties(settingsObject(before), settingsObject(after))
  return {
    fields,
    settings,
    sources,
    total: fields.length + sources.length + settings.length,
  }
}
