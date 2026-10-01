import { invalid, onlyKeys, positiveInteger, record } from './schemas'
import { privatePassword } from './users'

export const SELF_PASSWORD_PERMISSION = 'account:password:update'
export interface PasswordChange {
  oldPassword: string
  newPassword: string
  expectedRevision: number
}
export const parsePasswordChange = (input: unknown): PasswordChange => {
  const body = record(input)
  onlyKeys(body, ['oldPassword', 'newPassword', 'expectedRevision'])
  if (
    typeof body.oldPassword !== 'string' ||
    !body.oldPassword ||
    body.oldPassword.length > 200
  )
    invalid('oldPassword', '请输入当前密码')
  const newPassword = privatePassword(body.newPassword)
  if (body.oldPassword === newPassword)
    invalid('newPassword', '新密码不能与当前密码相同')
  return {
    oldPassword: body.oldPassword as string,
    newPassword,
    expectedRevision: positiveInteger(body.expectedRevision),
  }
}
