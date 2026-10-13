import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  open,
  rename,
  rm,
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
    const destination = this.objectPath(key)
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    // A completed nonempty directory cannot be replaced by rename. This gives
    // no-clobber atomic publication on both POSIX and ExFAT without hard links.
    // Old flat objects remain readable; only new objects use content directories.
    const staging = path.join(this.root, `.${key}.${randomUUID()}.staging`)
    await mkdir(staging, { mode: 0o700 })
    try {
      const handle = await open(path.join(staging, 'content'), 'wx', 0o600)
      try {
        await handle.writeFile(bytes)
        await handle.sync()
      } finally {
        await handle.close()
      }
      try {
        await rename(staging, destination)
      } catch (error) {
        if (
          !['EEXIST', 'ENOTEMPTY', 'ENOTDIR', 'EISDIR', 'EPERM'].includes(
            (error as NodeJS.ErrnoException).code || ''
          )
        )
          throw error
        if (fileDigest(await this.get(key)) !== fileDigest(bytes))
          throw new DomainError(
            409,
            'STORAGE_CONFLICT',
            '对象数据与既有摘要冲突'
          )
      }
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }

  async get(key: string) {
    try {
      const location = this.objectPath(key)
      return await readFile(
        (await stat(location)).isDirectory()
          ? path.join(location, 'content')
          : location
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new DomainError(503, 'STORAGE_UNAVAILABLE', '文件数据暂不可用')
      throw error
    }
  }

  async remove(key: string) {
    await rm(this.objectPath(key), { recursive: true, force: true })
  }

  async cleanupStaging(before: Date) {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const names = (await readdir(this.root)).filter((name) =>
      /^\.[a-f0-9]{64}\.[a-f0-9-]{36}\.staging$/.test(name)
    )
    const old = await Promise.all(
      names.map(async (name) => {
        const location = path.join(this.root, name)
        try {
          return { location, mtime: (await stat(location)).mtime }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
          throw error
        }
      })
    )
    const abandoned = old.filter(
      (item): item is { location: string; mtime: Date } =>
        !!item && item.mtime < before
    )
    await Promise.all(
      abandoned.map((item) =>
        rm(item.location, { recursive: true, force: true })
      )
    )
    return abandoned.length
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
