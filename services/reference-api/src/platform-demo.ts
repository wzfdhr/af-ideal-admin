import {
  DEPARTMENT_PERMISSIONS,
  POSITION_PERMISSIONS,
  USER_PERMISSIONS,
  ROLE_PERMISSIONS,
  LEAVE_PERMISSIONS,
  DATA_SCOPE_PERMISSIONS,
  APPLICATION_PERMISSIONS,
} from '@af-admin/contracts'
import { createPool, transaction } from './database'
import { seedDemo } from './seed'
import type { Pool } from 'pg'

export const initializePlatformDemo = async (pool: Pool) => {
  if (process.env.APP_MODE !== 'demo')
    throw new Error('Explicit demo mode required')
  const database = await pool.query<{ name: string }>(
    'SELECT current_database() AS name'
  )
  if (!database.rows[0].name.endsWith('_demo'))
    throw new Error('A dedicated demo database is required')
  await seedDemo(pool)
  await transaction(pool, async (client) => {
    await client.query(
      "INSERT INTO departments (tenant_id,id,department_name) SELECT DISTINCT m.tenant_id,'legacy-dept-'||md5(m.tenant_id||':'||m.department_name),m.department_name FROM memberships m WHERE NOT EXISTS (SELECT 1 FROM departments d WHERE d.tenant_id=m.tenant_id AND d.parent_id IS NULL AND d.department_name=m.department_name AND d.deleted_at IS NULL) ON CONFLICT DO NOTHING"
    )
    await client.query(
      'UPDATE memberships m SET department_id=d.id FROM departments d WHERE m.tenant_id=d.tenant_id AND m.department_name=d.department_name AND m.department_id IS NULL AND d.parent_id IS NULL AND d.deleted_at IS NULL'
    )
    await client.query(
      "UPDATE memberships m SET permissions=(SELECT jsonb_agg(DISTINCT capability) FROM jsonb_array_elements(m.permissions || $1::jsonb) AS capability),revision=revision+1 WHERE m.user_id IN ('a-admin','b-admin') AND m.role='admin' AND m.status='enabled' AND NOT m.permissions @> $1::jsonb",
      [
        JSON.stringify([
          ...Object.values(DEPARTMENT_PERMISSIONS),
          ...Object.values(POSITION_PERMISSIONS),
          ...Object.values(USER_PERMISSIONS).filter(
            (permission) => permission !== USER_PERMISSIONS.readContacts
          ),
          ...Object.values(ROLE_PERMISSIONS),
          ...Object.values(LEAVE_PERMISSIONS),
          ...Object.values(DATA_SCOPE_PERMISSIONS),
          ...Object.values(APPLICATION_PERMISSIONS),
        ]),
      ]
    )
  })
}
if (require.main === module) {
  const pool = createPool()
  initializePlatformDemo(pool)
    .then(() =>
      process.stdout.write('Dedicated platform demo capabilities initialized\n')
    )
    .catch(() => {
      process.stderr.write('Platform demo initialization refused or failed\n')
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
export default initializePlatformDemo
