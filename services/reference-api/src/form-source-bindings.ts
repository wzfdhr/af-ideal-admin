import {
  DomainError,
  FORM_DATA_SOURCE_PERMISSIONS,
  DICTIONARY_PERMISSIONS,
  invalid,
  parseForm,
} from '@af-admin/contracts'
import { requirePermission, hasPermission } from '@af-admin/workflow-core'
import { rows, one, sequential } from './support'
import type { FormSchema } from '@af-admin/contracts'
import type { Actor } from './auth'
import type { PoolClient } from 'pg'

export const canReadFormSources = (actor: Actor) =>
  hasPermission(actor.permissions, FORM_DATA_SOURCE_PERMISSIONS.read) &&
  hasPermission(actor.permissions, DICTIONARY_PERMISSIONS.read)
export const requireFormSourceRead = (actor: Actor, schema: FormSchema) => {
  if (schema.dataSources.length && !canReadFormSources(actor))
    throw new DomainError(
      403,
      'DATA_SOURCE_FORBIDDEN',
      '缺少表单数据源及底层字典读取权限'
    )
}
export const cleanDraftSourceSnapshots = (input: FormSchema) => {
  const schema = parseForm(input)
  schema.dataSources.forEach((binding) => {
    delete binding.registryRevision
    delete binding.dictionaryRevision
    delete binding.optionsSnapshot
  })
  schema.widgetsConfig
    .filter((widget) => widget.config.optionsType === 'registered')
    .forEach((widget) => {
      widget.config.options = []
    })
  return schema
}
export const projectRecordSourceOptions = (
  actor: Actor,
  input: FormSchema,
  fields: Record<string, unknown>
) => {
  if (canReadFormSources(actor)) return input
  const schema = parseForm(input)
  schema.widgetsConfig
    .filter((widget) => widget.config.optionsType === 'registered')
    .forEach((widget) => {
      const source = schema.dataSources.find(
        (binding) => binding.key === widget.config.optionsSourceKey
      )
      const options = Array.isArray(source?.optionsSnapshot)
        ? source.optionsSnapshot
        : []
      widget.config.options = options.filter(
        (option) =>
          option &&
          typeof option === 'object' &&
          !Array.isArray(option) &&
          option.value === fields[widget.uid]
      )
      widget.config.optionsType = 'fixed'
      delete widget.config.optionsSourceKey
    })
  schema.dataSources = []
  return schema
}
const querySource = async (client: PoolClient, actor: Actor, id: string) => {
  requirePermission(actor.permissions, FORM_DATA_SOURCE_PERMISSIONS.read)
  requirePermission(actor.permissions, DICTIONARY_PERMISSIONS.read)
  const source = one(
    await rows<{ revision: number; status: string; dictionary_id: string }>(
      client,
      'SELECT revision,status,dictionary_id FROM form_data_sources WHERE tenant_id=$1 AND id=$2 FOR SHARE',
      [actor.tenantId, id]
    )
  )
  const dictionary = one(
    await rows<{ revision: number; status: string; deleted_at: Date | null }>(
      client,
      'SELECT revision,status,deleted_at FROM dictionaries WHERE tenant_id=$1 AND id=$2 FOR SHARE',
      [actor.tenantId, source.dictionary_id]
    )
  )
  if (
    source.status !== 'enabled' ||
    dictionary.status !== 'enabled' ||
    dictionary.deleted_at
  )
    throw new DomainError(
      409,
      'DATA_SOURCE_UNAVAILABLE',
      '表单关联的数据源或字典已停用'
    )
  return { source, dictionary }
}
export const assertFormSourcesAvailable = async (
  client: PoolClient,
  actor: Actor,
  schema: FormSchema,
  fields?: Record<string, unknown>
) => {
  requireFormSourceRead(actor, schema)
  await sequential(schema.dataSources, async (binding) => {
    const { source } = await querySource(
      client,
      actor,
      String(binding.registryId)
    )
    if (fields) {
      const values = await rows<{ value: string | number | boolean }>(
        client,
        'SELECT value FROM dictionary_items WHERE tenant_id=$1 AND dictionary_id=$2 AND NOT disabled ORDER BY ordinal',
        [actor.tenantId, source.dictionary_id]
      )
      const active = new Set(values.map((item) => String(item.value)))
      if (active.size !== values.length)
        invalid('dataSources', '来源选项规范化后有重复值，需重新配置')
      schema.widgetsConfig
        .filter((widget) => widget.config.optionsSourceKey === binding.key)
        .forEach((widget) => {
          const value = fields[widget.uid]
          if (
            value !== undefined &&
            value !== null &&
            value !== '' &&
            !active.has(String(value))
          )
            invalid(widget.uid, '选项已停用或移除，请刷新选择后保存')
        })
    }
  })
}
export const validateDraftSources = async (
  client: PoolClient,
  actor: Actor,
  schema: FormSchema
) => {
  schema.dataSources.forEach((source) => {
    if (
      source.registryRevision !== undefined ||
      source.dictionaryRevision !== undefined ||
      source.optionsSnapshot !== undefined
    )
      invalid('dataSources', '草稿不能伪造数据源快照版本')
  })
  schema.widgetsConfig.forEach((widget) => {
    if (
      widget.config.optionsType === 'registered' &&
      Array.isArray(widget.config.options) &&
      widget.config.options.length
    )
      invalid(widget.uid, '登记选项由服务端发布时生成，草稿不能注入选项快照')
  })
  await assertFormSourcesAvailable(client, actor, schema)
}
export const captureFormSources = async (
  client: PoolClient,
  actor: Actor,
  input: FormSchema
) => {
  const schema = parseForm(input)
  await validateDraftSources(client, actor, schema)
  await sequential(schema.dataSources, async (binding) => {
    const { source, dictionary } = await querySource(
      client,
      actor,
      String(binding.registryId)
    )
    const list = await rows<{
      label: string
      value: string | number | boolean
    }>(
      client,
      'SELECT label,value FROM dictionary_items WHERE tenant_id=$1 AND dictionary_id=$2 AND NOT disabled ORDER BY ordinal',
      [actor.tenantId, source.dictionary_id]
    )
    const options = list.map((item) => ({
      label: item.label,
      value: String(item.value),
    }))
    if (!options.length)
      invalid('dataSources', '不能发布没有可选值的数据源绑定')
    if (
      options.length > 100 ||
      new Set(options.map((option) => option.value)).size !== options.length
    )
      invalid(
        'dataSources',
        '此表单最多100个选项，且字符串规范化后不能有重复值'
      )
    binding.optionsSnapshot = options
    binding.registryRevision = source.revision
    binding.dictionaryRevision = dictionary.revision
  })
  return parseForm(schema)
}
export const persistDraftSources = async (
  client: PoolClient,
  tenant: string,
  id: string,
  schema: FormSchema
) => {
  await client.query(
    'DELETE FROM form_draft_sources WHERE tenant_id=$1 AND form_draft_id=$2',
    [tenant, id]
  )
  await sequential(schema.dataSources, async (binding) => {
    await client.query(
      'INSERT INTO form_draft_sources(tenant_id,form_draft_id,source_key,source_id) VALUES($1,$2,$3,$4)',
      [tenant, id, binding.key, binding.registryId]
    )
  })
}
export const persistReleaseSources = async (
  client: PoolClient,
  tenant: string,
  id: string,
  schema: FormSchema
) => {
  await sequential(schema.dataSources, async (binding) => {
    await client.query(
      'INSERT INTO release_form_sources(tenant_id,release_id,source_key,source_id,source_revision,dictionary_revision) VALUES($1,$2,$3,$4,$5,$6)',
      [
        tenant,
        id,
        binding.key,
        binding.registryId,
        binding.registryRevision,
        binding.dictionaryRevision,
      ]
    )
  })
}
