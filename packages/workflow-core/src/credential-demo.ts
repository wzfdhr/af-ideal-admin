import { DomainError, parsePasswordChange } from '@af-admin/contracts'
import { assertRevision } from './workflow'

/** Explicit development memory only; it is not a password hash or session store. */
class CredentialDemo {
  private revision = 1

  private replays = new Map<
    string,
    { signature: string; data: { credentialRevision: number } }
  >()

  private password: string

  private onChange?: (value: string) => void

  constructor(initialPassword: string, changed?: (value: string) => void) {
    this.password = initialPassword
    this.onChange = changed
  }

  state() {
    return { credentialRevision: this.revision }
  }

  change(body: unknown, key: string | undefined, tenantId: string) {
    const input = parsePasswordChange(body)
    if (!key || key.length < 8 || key.length > 200)
      throw new DomainError(
        422,
        'VALIDATION_ERROR',
        '写命令必须提供有效的 Idempotency-Key'
      )
    const id = JSON.stringify([tenantId, key])
    const signature = JSON.stringify(input)
    const old = this.replays.get(id)
    if (old) {
      if (old.signature !== signature)
        throw new DomainError(
          409,
          'IDEMPOTENCY_CONFLICT',
          '同一个重试标识不能用于不同内容'
        )
      return { ...old.data }
    }
    assertRevision(this.revision, input.expectedRevision)
    if (input.oldPassword !== this.password)
      throw new DomainError(422, 'OLD_PASSWORD_INVALID', '当前密码不正确', {
        oldPassword: ['请输入正确的当前密码'],
      })
    this.password = input.newPassword
    this.revision += 1
    this.onChange?.(input.newPassword)
    const data = this.state()
    this.replays.set(id, { signature, data })
    return { ...data }
  }
}
export default CredentialDemo
