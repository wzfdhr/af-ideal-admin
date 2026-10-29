import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadStoredFile } from '@/api/stored-files'

const request = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))
vi.mock('@/api/request', () => ({ default: request }))

describe('stored file upload operation fence', () => {
  beforeEach(() => vi.resetAllMocks())

  it('sends no upload request when identity changes during deferred hashing', async () => {
    let resolveDigest!: (value: ArrayBuffer) => void
    const digest = vi.fn(
      () =>
        new Promise<ArrayBuffer>((resolve) => {
          resolveDigest = resolve
        })
    )
    vi.stubGlobal('crypto', {
      randomUUID: () => 'upload-key',
      subtle: { digest },
    })
    const file = {
      name: 'logo.png',
      size: 4,
      arrayBuffer: vi.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer),
    } as unknown as File
    let current = true
    const pending = uploadStoredFile(file, undefined, undefined, () => current)
    await vi.waitFor(() => expect(digest).toHaveBeenCalledTimes(1))
    current = false
    resolveDigest(new Uint8Array(32).buffer)
    await expect(pending).rejects.toThrow('身份或租户已变化')
    expect(request.post).not.toHaveBeenCalled()
    expect(request.put).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
