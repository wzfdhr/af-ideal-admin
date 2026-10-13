import request from './request'
import type {
  DataScreenDefinitionV1,
  DataScreenDetails,
  DataScreenRunResultV1,
  DataScreenTemplateV1,
} from '@af-admin/contracts'

export interface DataScreenPage {
  list: DataScreenDetails[]
  total: number
  current: number
  pageSize: number
}

export interface DataScreenListQuery {
  current?: number
  pageSize?: number
  keyword?: string
}

const encoded = (id: string) => encodeURIComponent(id)
const command = (key: string) => ({
  headers: { 'Idempotency-Key': key },
})

export const fetchDataScreenTemplates = async () =>
  (await request.get<DataScreenTemplateV1[]>('/data-screens/templates')).data

export const fetchDataScreenDefinitions = async (
  params: DataScreenListQuery = { current: 1, pageSize: 50, keyword: '' }
) =>
  (
    await request.get<DataScreenPage>('/data-screens/definitions', {
      params,
    })
  ).data

export const getDataScreenDefinition = async (id: string) =>
  (
    await request.get<DataScreenDetails>(
      `/data-screens/definitions/${encoded(id)}`
    )
  ).data

export const createDataScreenDefinition = async (
  draft: DataScreenDefinitionV1,
  key: string
) =>
  (
    await request.post<DataScreenDetails>(
      '/data-screens/definitions',
      { draft },
      command(key)
    )
  ).data

export const copyDataScreenDefinition = async (
  id: string,
  draft: DataScreenDefinitionV1,
  key: string
) =>
  (
    await request.post<DataScreenDetails>(
      `/data-screens/definitions/${encoded(id)}/copy`,
      { draft },
      command(key)
    )
  ).data

export const updateDataScreenDefinition = async (
  record: DataScreenDetails,
  draft: DataScreenDefinitionV1,
  key: string
) =>
  (
    await request.put<DataScreenDetails>(
      `/data-screens/definitions/${encoded(record.id)}`,
      { draft, expectedRevision: record.revision },
      command(key)
    )
  ).data

const revisionCommand = async (
  id: string,
  action: 'publish' | 'archive',
  expectedRevision: number,
  key: string
) =>
  (
    await request.post<DataScreenDetails>(
      `/data-screens/definitions/${encoded(id)}/${action}`,
      { expectedRevision },
      command(key)
    )
  ).data

export const publishDataScreenDefinition = async (
  record: DataScreenDetails,
  key: string
) => revisionCommand(record.id, 'publish', record.revision, key)

export const archiveDataScreenDefinition = async (
  record: DataScreenDetails,
  key: string
) => revisionCommand(record.id, 'archive', record.revision, key)

export const rollbackDataScreenDefinition = async (
  record: DataScreenDetails,
  releaseId: string,
  key: string
) =>
  (
    await request.post<DataScreenDetails>(
      `/data-screens/definitions/${encoded(record.id)}/rollback`,
      { releaseId, expectedRevision: record.revision },
      command(key)
    )
  ).data

export const toggleDataScreenDefinition = async (
  record: DataScreenDetails,
  enabled: boolean,
  key: string
) =>
  (
    await request.post<DataScreenDetails>(
      `/data-screens/definitions/${encoded(record.id)}/toggle`,
      { enabled, expectedRevision: record.revision },
      command(key)
    )
  ).data

export const previewDataScreen = async (draft: DataScreenDefinitionV1) =>
  (
    await request.post<DataScreenRunResultV1>('/data-screens/preview', {
      draft,
    })
  ).data

export const runDataScreen = async (id: string, releaseId: string) =>
  (
    await request.post<DataScreenRunResultV1>(
      `/data-screens/definitions/${encoded(id)}/run`,
      { releaseId }
    )
  ).data
