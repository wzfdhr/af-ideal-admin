import request from './request'
import type {
  ApplicationPackage,
  ManagedApplication,
} from '@af-admin/contracts'

export const exportApplicationPackage = async (app: ManagedApplication) =>
  (
    await request.post<ApplicationPackage>(
      `/application-center/${encodeURIComponent(app.id)}/package`,
      {
        expectedRevision: app.revision,
        formRevision: app.formRevision,
        workflowRevision: app.workflowRevision,
      }
    )
  ).data
export const packageBindingPeople = async () =>
  (
    await request.get<{ id: string; name: string; canApprove: boolean }[]>(
      '/application-packages/people'
    )
  ).data
export const importApplicationPackage = async (body: unknown, key: string) =>
  (
    await request.post<{
      application: ManagedApplication
      referenceMap: Record<string, string>
    }>('/application-packages/import', body, {
      headers: { 'Idempotency-Key': key },
    })
  ).data

export const packageBindingSources = async () =>
  (
    await request.get<
      { id: string; name: string; code: string; kind: 'dictionary' }[]
    >('/application-packages/sources')
  ).data
