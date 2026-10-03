import request from './request'
import type {
  ApplicationPackage,
  ManagedApplication,
} from '@af-admin/contracts'

export const exportApplicationPackage = async (
  app: ManagedApplication,
  pageIds?: string[]
) =>
  (
    await request.post<ApplicationPackage>(
      `/application-center/${encodeURIComponent(app.id)}/package`,
      {
        expectedRevision: app.revision,
        formRevision: app.formRevision,
        workflowRevision: app.workflowRevision,
        ...(pageIds ? { pageIds } : {}),
      }
    )
  ).data
const packageDirectory = async <T>(
  endpoint: string,
  current = 1
): Promise<T[]> => {
  const page = (
    await request.get<T[]>(endpoint, { params: { current, pageSize: 100 } })
  ).data
  if (page.length < 100) return page
  return [...page, ...(await packageDirectory<T>(endpoint, current + 1))]
}
export const packageBindingPeople = () =>
  packageDirectory<{ id: string; name: string; canApprove: boolean }>(
    '/application-packages/people'
  )
export const importApplicationPackage = async (body: unknown, key: string) =>
  (
    await request.post<{
      application: ManagedApplication
      referenceMap: Record<string, string>
      pendingPages?: {
        id: string
        status: 'pending'
        revision: number
        pageCount: number
      }
    }>('/application-packages/import', body, {
      headers: { 'Idempotency-Key': key },
    })
  ).data

export const packageBindingSources = () =>
  packageDirectory<{
    id: string
    name: string
    code: string
    kind: 'dictionary'
  }>('/application-packages/sources')

export interface PackagePageSet {
  id: string
  status: 'pending' | 'bound'
  revision: number
  pageCount: number
  names: string[]
  referenceMap: Record<string, string>
  applicationReleaseId: string | null
}
export const packageExportPages = async (applicationId: string) =>
  (
    await request.get<{ id: string; name: string; revision: number }[]>(
      `/application-center/${encodeURIComponent(applicationId)}/export-pages`
    )
  ).data
export const applicationPackagePages = async (applicationId: string) =>
  (
    await request.get<PackagePageSet[]>(
      `/application-center/${encodeURIComponent(applicationId)}/package-pages`
    )
  ).data
export const bindApplicationPackagePages = async (
  set: PackagePageSet,
  applicationReleaseId: string,
  key: string
) =>
  (
    await request.post<{
      id: string
      status: 'bound'
      revision: number
      referenceMap: Record<string, string>
      pages: { id: string; key: string }[]
    }>(
      `/application-package-pages/${encodeURIComponent(set.id)}/bind`,
      { expectedRevision: set.revision, applicationReleaseId },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
