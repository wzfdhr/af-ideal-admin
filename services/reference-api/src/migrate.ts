import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { createPool, transaction } from './database'
import type { Pool } from 'pg'

export const verifyMigrationReadiness = async (pool: Pool) => {
  const directory = path.resolve(__dirname, '../migrations')
  const files = (await readdir(directory)).filter((name) =>
    /^\d+_[\w-]+\.sql$/.test(name)
  )
  const applied = await pool.query<{ name: string; checksum: string }>(
    'SELECT name,checksum FROM schema_migrations'
  )
  const checksums = new Map(applied.rows.map((row) => [row.name, row.checksum]))
  await Promise.all(
    files.map(async (name) => {
      const checksum = createHash('sha256')
        .update(await readFile(path.join(directory, name), 'utf8'))
        .digest('hex')
      if (checksums.get(name) !== checksum)
        throw new Error('Database migration readiness check failed')
    })
  )
}

export const migrate = async (pool: Pool) => {
  await transaction(pool, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('af-admin-migrations', 0))"
    )
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())'
    )
    const directory = path.resolve(__dirname, '../migrations')
    const files = (await readdir(directory))
      .filter((name) => /^\d+_[\w-]+\.sql$/.test(name))
      .sort()
    await files.reduce(async (previousMigration, name) => {
      await previousMigration
      const sql = await readFile(path.join(directory, name), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const previous = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE name=$1',
        [name]
      )
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`)
      } else {
        await client.query(sql)
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [name, checksum]
        )
      }
    }, Promise.resolve())
  })
}

if (require.main === module) {
  const pool = createPool()
  migrate(pool)
    .then(() => process.stdout.write('Database migrations applied\n'))
    .finally(() => pool.end())
}

export default migrate
