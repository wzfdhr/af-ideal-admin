import { Pool } from 'pg'
import type { PoolClient } from 'pg'

export const createPool = () => {
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL must be configured')
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  })
}

export const transaction = async <T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await run(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
