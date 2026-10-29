import type { Pool } from 'pg'

export interface FileScanScope {
  readonly tenantId: string
  readonly fileIds: readonly string[]
}

export const validatedFileScanScope = async (
  pool: Pool,
  input: FileScanScope | undefined
) => {
  if (input === undefined) return undefined
  const reject = () => {
    throw new Error('Invalid file scan maintenance scope')
  }
  if (
    !input ||
    typeof input !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    reject()
  Reflect.ownKeys(input).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)
    if (
      typeof key !== 'string' ||
      !['tenantId', 'fileIds'].includes(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    )
      reject()
  })
  const identifier = (value: unknown) =>
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,100}$/.test(value) &&
    !['__proto__', 'prototype', 'constructor'].includes(value.toLowerCase())
  const { tenantId } = input
  const ids = input.fileIds
  if (
    !identifier(tenantId) ||
    !Array.isArray(ids) ||
    Object.getPrototypeOf(ids) !== Array.prototype ||
    !ids.length ||
    ids.length > 200
  )
    reject()
  Reflect.ownKeys(ids).forEach((key) => {
    if (
      key !== 'length' &&
      (typeof key !== 'string' ||
        !/^(0|[1-9]\d*)$/.test(key) ||
        Number(key) >= ids.length)
    )
      reject()
  })
  const copied = Array.from({ length: ids.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(ids, String(index))
    if (
      !descriptor?.enumerable ||
      !('value' in descriptor) ||
      !identifier(descriptor.value)
    )
      reject()
    return descriptor?.value as string
  })
  if (new Set(copied).size !== copied.length) reject()
  const scope = Object.freeze({
    tenantId,
    fileIds: Object.freeze(copied),
  })
  const result = await pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM stored_files WHERE tenant_id=$1 AND id=ANY($2::text[])',
    [scope.tenantId, scope.fileIds]
  )
  if (result.rows[0].n !== scope.fileIds.length) reject()
  return scope
}
