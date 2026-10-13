import request from './request'
import type {
  ReportingDefinitionRecord,
  ReportingDefinitionV1,
  ReportingDefinitionVersion,
  ReportingQueryResultV1,
  ReportingQueryV1,
  ReportingSourceCatalogue,
  ReportingSourceCataloguePage,
} from '@af-admin/contracts'

export interface ReportingPage<T> {
  list: T[]
  total: number
}
export interface ReportingListQuery {
  current: number
  pageSize: number
  keyword?: string
}
export interface ReportingSourcesQuery extends ReportingListQuery {
  applicationId?: string
}
const path = (id: string) => encodeURIComponent(id)
const commandHeaders = (key: string) => ({
  headers: { 'Idempotency-Key': key },
})
export const fetchReportingSources = async (
  params: ReportingSourcesQuery = { current: 1, pageSize: 20, keyword: '' }
) =>
  (
    await request.get<ReportingSourceCataloguePage>('/reporting/sources', {
      params,
    })
  ).data
export const fetchReportingDefinitions = async (params: ReportingListQuery) =>
  (
    await request.get<ReportingPage<ReportingDefinitionRecord>>(
      '/reporting/definitions',
      { params }
    )
  ).data
export const fetchPublishedReportingDefinitions = async (
  params: ReportingListQuery
) =>
  (
    await request.get<ReportingPage<ReportingDefinitionVersion>>(
      '/reporting/definitions/published',
      { params }
    )
  ).data
export const getReportingDefinition = async (id: string) =>
  (
    await request.get<ReportingDefinitionRecord>(
      `/reporting/definitions/${path(id)}`
    )
  ).data
export const saveReportingDefinition = async (
  schema: ReportingDefinitionV1,
  key: string,
  record?: ReportingDefinitionRecord
) =>
  (record
    ? await request.put<ReportingDefinitionRecord>(
        `/reporting/definitions/${path(record.id)}`,
        { schema, expectedRevision: record.revision },
        commandHeaders(key)
      )
    : await request.post<ReportingDefinitionRecord>(
        '/reporting/definitions',
        { schema },
        commandHeaders(key)
      )
  ).data
export const publishReportingDefinition = async (
  record: ReportingDefinitionRecord,
  key: string
) =>
  (
    await request.post<ReportingDefinitionRecord>(
      `/reporting/definitions/${path(record.id)}/publish`,
      { expectedRevision: record.revision },
      commandHeaders(key)
    )
  ).data
export const setReportingDefinitionEnabled = async (
  record: ReportingDefinitionRecord,
  enabled: boolean,
  key: string
) =>
  (
    await request.post<ReportingDefinitionRecord>(
      `/reporting/definitions/${path(record.id)}/enabled`,
      { expectedRevision: record.revision, enabled },
      commandHeaders(key)
    )
  ).data
export const getReportingVersionCatalogue = async (versionId: string) =>
  (
    await request.get<ReportingSourceCatalogue>(
      `/reporting/versions/${path(versionId)}/catalogue`
    )
  ).data
export const queryReportingVersion = async (
  versionId: string,
  query: ReportingQueryV1
) =>
  (
    await request.post<ReportingQueryResultV1>(
      `/reporting/versions/${path(versionId)}/query`,
      { query }
    )
  ).data
