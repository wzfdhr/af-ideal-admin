import {
  DomainError,
  REPORTING_METADATA_FIELDS,
  REPORTING_PERMISSIONS as P,
  parseForm,
} from '@af-admin/contracts'
import { hasPermission } from '@af-admin/workflow-core'
import { readRelease } from './application'
import { digest } from './security'
import { rows, one, contentHash } from './support'
import type {
  ReportingFieldReference,
  ReportingSourceCatalogue,
  ReportingVisibleField,
  ReportingValueType,
  Release,
} from '@af-admin/contracts'
import type { Actor } from './auth'
import type { Database } from './support'

export interface ReportingFieldBinding extends ReportingVisibleField {
  rawUid: string | null
  supported: boolean
  permission: string | null
  memberField: 'username' | 'name' | 'dept' | null
}
export interface ReportingSourceBinding {
  applicationId: string
  applicationName: string
  release: Release
  fields: ReportingFieldBinding[]
}
export type ReportingFieldMap = Record<
  string,
  { rawUid: string; valueType: ReportingValueType }
>
export const reportingFieldKey = (reference: ReportingFieldReference) =>
  `${reference.kind}:${reference.id}`
const identity = new Map<string, 'username' | 'name' | 'dept'>([
  ['applicantId', 'username'],
  ['applicantName', 'name'],
  ['departmentSnapshot', 'dept'],
])
const labels: Record<string, string> = {
  id: '记录标识',
  status: '状态',
  revision: '记录版本',
  applicationReleaseId: '来源发布标识',
  releaseVersion: '来源发布版本',
  applicantId: '申请人标识',
  applicantName: '申请人姓名',
  departmentSnapshot: '申请时部门',
  createdAt: '创建时间',
  updatedAt: '更新时间',
}
const metadataType = (id: string): ReportingValueType => {
  if (['revision', 'releaseVersion'].includes(id)) return 'integer'
  if (id === 'status') return 'status'
  if (['createdAt', 'updatedAt'].includes(id)) return 'datetime'
  return 'text'
}
const metadataFields = (): ReportingFieldBinding[] =>
  REPORTING_METADATA_FIELDS.map((id) => ({
    reference: { kind: 'metadata', id },
    key: `metadata:${id}`,
    label: labels[id],
    valueType: metadataType(id),
    searchable: ![
      'createdAt',
      'updatedAt',
      'revision',
      'releaseVersion',
    ].includes(id),
    sortable: true,
    rawUid: null,
    supported: true,
    permission: identity.has(id) ? P.fieldApplicant : null,
    memberField: identity.get(id) || null,
  }))
export const reportingFieldMap = (
  source: ReportingSourceBinding
): ReportingFieldMap =>
  Object.fromEntries(
    source.fields
      .filter(
        (field) =>
          field.reference.kind === 'field' &&
          field.supported &&
          field.rawUid !== null
      )
      .map((field) => [
        field.reference.id,
        { rawUid: field.rawUid as string, valueType: field.valueType },
      ])
  )
export const reportingFieldAvailable = (
  actor: Actor,
  field: ReportingFieldBinding
) =>
  field.supported &&
  (!field.permission || hasPermission(actor.permissions, field.permission))
export const reportingCatalogue = (
  source: ReportingSourceBinding,
  actor: Actor
): ReportingSourceCatalogue => ({
  source: { kind: 'application-records', applicationId: source.applicationId },
  applicationName: source.applicationName,
  sourceReleaseId: source.release.id,
  sourceReleaseVersion: source.release.releaseVersion,
  visibleFields: source.fields
    .filter((field) => reportingFieldAvailable(actor, field))
    .map((field) => ({
      reference: field.reference,
      key: field.key,
      label: field.label,
      valueType: field.valueType,
      searchable: field.searchable,
      sortable: field.sortable,
    })),
  hiddenFields: source.fields
    .filter((field) => !reportingFieldAvailable(actor, field))
    .map((field) => ({
      reference: field.reference,
      reason: field.supported ? 'permission-denied' : 'unsupported',
    })),
})
export const assertReportingSourceAccess = async (
  db: Database,
  actor: Actor,
  applicationId: string,
  selectedReleaseId: string
) => {
  if (hasPermission(actor.permissions, 'business:read:self')) return
  if (
    !['workflow:todo', 'workflow:approve', 'workflow:reject'].some(
      (permission) => hasPermission(actor.permissions, permission)
    )
  )
    throw new DomainError(
      403,
      'REPORT_SOURCE_FORBIDDEN',
      '当前没有来源记录读取权限'
    )
  const accessible = await rows(
    db,
    "SELECT r.id FROM business_records r JOIN application_releases a ON a.tenant_id=r.tenant_id AND a.id=r.application_release_id WHERE r.tenant_id=$1 AND r.record_kind='generic' AND a.application_id=$3 AND r.application_release_id=$4 AND af_record_visible($1,$2,r.id) LIMIT 1",
    [actor.tenantId, actor.userId, applicationId, selectedReleaseId]
  )
  if (!accessible.length) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
}
export const captureReportingSource = async (
  db: Database,
  actor: Actor,
  applicationId: string,
  fixedReleaseId?: string
): Promise<ReportingSourceBinding> => {
  const app = one(
    await rows<{
      id: string
      name: string
      status: string
      business_kind: string
      active_release_id: string | null
    }>(
      db,
      'SELECT * FROM applications WHERE tenant_id=$1 AND id=$2 FOR SHARE',
      [actor.tenantId, applicationId]
    )
  )
  if (
    app.status !== 'enabled' ||
    app.business_kind !== 'generic' ||
    !app.active_release_id
  )
    throw new DomainError(
      409,
      'REPORT_SOURCE_UNAVAILABLE',
      '来源应用未启用或没有真实通用发布版'
    )
  const release = await readRelease(
    db,
    actor.tenantId,
    fixedReleaseId || app.active_release_id
  )
  if (release.applicationId !== applicationId)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  await assertReportingSourceAccess(db, actor, applicationId, release.id)
  const form = parseForm(release.formSnapshot)
  const fields = metadataFields()
  const aliases = new Set<string>()
  form.widgetsConfig.forEach((widget) => {
    const alias = `f_${digest(
      JSON.stringify(['report-field-v1', applicationId, release.id, widget.uid])
    )}`
    if (aliases.has(alias))
      throw new DomainError(
        409,
        'REPORT_FIELD_MAPPING_CONFLICT',
        '来源字段映射发生冲突'
      )
    aliases.add(alias)
    const primitive = [
      'input',
      'textarea',
      'select',
      'radio',
      'date-picker',
    ].includes(widget.type)
    const registered =
      widget.config.optionsType !== undefined &&
      widget.config.optionsType !== 'static'
    const supported =
      primitive &&
      !registered &&
      [undefined, 'text', 'integer', 'decimal'].includes(
        widget.config.valueType as string | undefined
      )
    let valueType: ReportingValueType = 'text'
    if (widget.type === 'date-picker') valueType = 'date'
    else if (widget.config.valueType === 'integer') valueType = 'integer'
    else if (widget.config.valueType === 'decimal') valueType = 'decimal'
    fields.push({
      reference: { kind: 'field', id: alias },
      key: `field:${alias}`,
      label:
        typeof widget.config.label === 'string'
          ? widget.config.label.slice(0, 100)
          : widget.name,
      valueType,
      searchable: supported && valueType === 'text',
      sortable: supported,
      rawUid: widget.uid,
      supported,
      permission: P.fieldBusiness,
      memberField: null,
    })
  })
  return { applicationId, applicationName: app.name, release, fields }
}
export const assertReportingFields = (
  source: ReportingSourceBinding,
  actor: Actor,
  references: ReportingFieldReference[],
  requireCurrentPermissions = true
) => {
  return references.map((reference) => {
    const field = source.fields.find(
      (candidate) =>
        reportingFieldKey(candidate.reference) === reportingFieldKey(reference)
    )
    if (!field)
      throw new DomainError(
        422,
        'REPORT_FIELD_UNREGISTERED',
        '字段不属于当前固定来源版，请重新选择登记字段'
      )
    if (!field.supported)
      throw new DomainError(
        422,
        'REPORT_FIELD_UNSUPPORTED',
        '当前报表不支持文件、关联或复杂字段'
      )
    if (requireCurrentPermissions && !reportingFieldAvailable(actor, field))
      throw new DomainError(
        403,
        'REPORT_FIELD_FORBIDDEN',
        '当前没有所选字段的读取能力'
      )
    return field
  })
}
export const assertReportingMapping = (
  source: ReportingSourceBinding,
  mapping: ReportingFieldMap
) => {
  const actual = reportingFieldMap(source)
  if (contentHash(actual) !== contentHash(mapping))
    throw new DomainError(
      409,
      'REPORT_FIELD_MAPPING_CONFLICT',
      '固定发布版字段映射与来源不一致'
    )
}
