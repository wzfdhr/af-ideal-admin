import { parseLowCodePage, parseLowCodeRuntimeInput } from '@af-admin/contracts'
import request from './request'
import type {
  LowCodePageV2,
  FormSchema,
  JsonObject,
  LowCodeSource,
} from '@af-admin/contracts'

export interface PersistentPageRelease {
  id: string
  pageId: string
  releaseVersion: number
  schema: LowCodePageV2
  contentHash: string
  publishedAt: string
}
export interface PersistentPage {
  id: string
  name: string
  schema: LowCodePageV2
  revision: number
  status: 'enabled' | 'archived'
  activeReleaseId: string | null
  rolloutReleaseId: string | null
  rolloutPercent: number
  updatedAt: string
  releases?: PersistentPageRelease[]
}
export interface LowCodeRuntimeDefinition {
  schema: LowCodePageV2
  releaseId: string
  releaseVersion: number
  pageRevision: number
  preview: boolean
  forms: Record<string, FormSchema>
  sourceErrors: Record<string, string>
  dataAvailable: Record<string, boolean>
}
export interface LowCodeDataResult {
  columns: { key: string; title: string }[]
  list: Record<string, unknown>[]
  total: number
  distribution: { name: string; value: number }[]
  trend: { day: string; value: number }[]
  refreshedAt: string
}
export interface LowCodeActionResult {
  kind: 'data' | 'navigate' | 'modal' | 'submit'
  targetId: string
  data?: LowCodeDataResult
  to?: string
  mode?: 'create' | 'edit'
  formSnapshot?: FormSchema
  record?: {
    id: string
    revision: number
    status: string
    fields?: JsonObject
    instanceId?: string
  }
}
export const fetchPersistentPages = async (
  current = 1,
  pageSize = 20,
  keyword = ''
) =>
  (
    await request.get<{ list: PersistentPage[]; total: number }>(
      '/low-code/pages',
      { params: { current, pageSize, keyword } }
    )
  ).data
export const getPersistentPage = async (id: string) =>
  (
    await request.get<PersistentPage>(
      `/low-code/pages/${encodeURIComponent(id)}`
    )
  ).data
export const generatePersistentPage = async (
  name: string,
  applicationReleaseId: string,
  key: string
) =>
  (
    await request.post<PersistentPage>(
      '/low-code/pages/from-application',
      { name, applicationReleaseId },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const savePersistentPage = async (
  page: PersistentPage,
  name: string,
  schema: unknown,
  key: string
) =>
  (
    await request.put<PersistentPage>(
      `/low-code/pages/${encodeURIComponent(page.id)}`,
      {
        name,
        schema: parseLowCodePage(schema),
        expectedRevision: page.revision,
      },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const publishPersistentPage = async (
  page: PersistentPage,
  key: string
) =>
  (
    await request.post<PersistentPageRelease>(
      `/low-code/pages/${encodeURIComponent(page.id)}/publish`,
      { expectedRevision: page.revision },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const rolloutPersistentPage = async (
  page: PersistentPage,
  releaseId: string,
  rolloutReleaseId: string | null,
  percent: number,
  key: string
) =>
  (
    await request.post<PersistentPage>(
      `/low-code/pages/${encodeURIComponent(page.id)}/rollout`,
      { expectedRevision: page.revision, releaseId, rolloutReleaseId, percent },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const archivePersistentPage = async (
  page: PersistentPage,
  status: PersistentPage['status'],
  key: string
) =>
  (
    await request.post<PersistentPage>(
      `/low-code/pages/${encodeURIComponent(page.id)}/status`,
      { expectedRevision: page.revision, status },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const getRuntimePage = async (id: string) =>
  (
    await request.get<LowCodeRuntimeDefinition>(
      `/low-code/runtime/${encodeURIComponent(id)}`
    )
  ).data
export const previewPersistentPage = async (id: string, schema: unknown) =>
  (
    await request.post<LowCodeRuntimeDefinition>(
      `/low-code/pages/${encodeURIComponent(id)}/preview`,
      { schema: parseLowCodePage(schema) }
    )
  ).data
export const runLowCodeAction = async (
  id: string,
  actionId: string,
  input: unknown,
  key: string,
  previewSchema?: LowCodePageV2
) => {
  const base = previewSchema
    ? `/low-code/pages/${encodeURIComponent(id)}/preview`
    : `/low-code/runtime/${encodeURIComponent(id)}`
  const parsed = parseLowCodeRuntimeInput(input)
  return (
    await request.post<LowCodeActionResult>(
      `${base}/actions/${encodeURIComponent(actionId)}`,
      previewSchema ? { schema: previewSchema, input: parsed } : parsed,
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
}
export const queryLowCodeMaterial = async (
  id: string,
  materialId: string,
  input: unknown,
  previewSchema?: LowCodePageV2
) => {
  const base = previewSchema
    ? `/low-code/pages/${encodeURIComponent(id)}/preview`
    : `/low-code/runtime/${encodeURIComponent(id)}`
  return (
    await request.post<LowCodeDataResult>(
      `${base}/data/${encodeURIComponent(materialId)}`,
      previewSchema
        ? { schema: previewSchema, input: parseLowCodeRuntimeInput(input) }
        : parseLowCodeRuntimeInput(input)
    )
  ).data
}
export const persistentLowCodeSources = async () =>
  (
    await request.get<{ list: LowCodeSource[]; total: number }>(
      '/low-code/sources',
      { params: { current: 1, pageSize: 100 } }
    )
  ).data
export const listRuntimePages = async () =>
  (
    await request.get<{
      list: {
        id: string
        name: string
        title: string
        releaseVersion: number
      }[]
      total: number
    }>('/low-code/runtime-pages')
  ).data
