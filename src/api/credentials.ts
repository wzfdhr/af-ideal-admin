import request from '@/api/request'
import type { PasswordChange } from '@af-admin/contracts'

export const credentialState = async () =>
  (await request.get<{ credentialRevision: number }>('/user/credential-state'))
    .data
export const changeOwnPassword = async (body: PasswordChange, key: string) =>
  (
    await request.post<{ credentialRevision: number }>('/user/password', body, {
      headers: { 'Idempotency-Key': key },
    })
  ).data
