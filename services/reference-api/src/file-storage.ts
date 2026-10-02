import { createHash } from 'node:crypto'
import {
  mkdir,
  readFile,
  writeFile,
  unlink,
  readdir,
  stat,
} from 'node:fs/promises'
import path from 'node:path'
import { DomainError } from '@af-admin/contracts'

export const fileDigest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex')
export class LocalObjectStore {
  readonly root: string

  constructor(root: string) {
    this.root = path.resolve(root)
  }

  private objectPath(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key))
      throw new DomainError(422, 'INVALID_OBJECT_KEY', '对象标识无效')
    return path.join(this.root, key)
  }

  async put(bytes: Buffer, key: string) {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    try {
      await writeFile(this.objectPath(key), bytes, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (fileDigest(await this.get(key)) !== fileDigest(bytes))
        throw new DomainError(409, 'STORAGE_CONFLICT', '对象数据与既有摘要冲突')
    }
  }

  async get(key: string) {
    try {
      return await readFile(this.objectPath(key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new DomainError(503, 'STORAGE_UNAVAILABLE', '文件数据暂不可用')
      throw error
    }
  }

  async remove(key: string) {
    await unlink(this.objectPath(key)).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    })
  }

  async objectsOlderThan(before: Date) {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const names = (await readdir(this.root)).filter((name) =>
      /^[a-f0-9]{64}$/.test(name)
    )
    const values = await Promise.all(
      names.map(async (key) => ({
        key,
        mtime: (await stat(this.objectPath(key))).mtime,
      }))
    )
    return values
      .filter((value) => value.mtime < before)
      .map((value) => value.key)
  }
}
