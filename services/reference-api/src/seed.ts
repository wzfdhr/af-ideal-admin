import { randomUUID } from 'node:crypto'
import { demoIdentities, LEAVE_FORM, serialWorkflow } from '@af-admin/contracts'
import { createPool, transaction } from './database'
import { digest, hashPassword } from './security'
import type { Pool } from 'pg'

export const seedDemo = async (pool: Pool) => {
  if (process.env.APP_MODE !== 'demo')
    throw new Error('Demo seeds require explicit APP_MODE=demo')
  const database = await pool.query<{ name: string }>(
    'SELECT current_database() AS name'
  )
  if (
    !database.rows[0].name.endsWith('_demo') &&
    database.rows[0].name !== 'af_admin_r1'
  )
    throw new Error('Demo seeds require an isolated demo database name')
  const identities = demoIdentities
  const hashes = await Promise.all(
    identities.map((identity) => hashPassword(identity.username))
  )
  await transaction(pool, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('af-admin-demo-seed',0))"
    )
    await client.query(
      "INSERT INTO tenants (id,name) VALUES ('tenant-a','演示集团 A'),('tenant-b','演示集团 B') ON CONFLICT DO NOTHING"
    )
    await identities.reduce(async (previous, identity, i) => {
      await previous
      await client.query(
        'INSERT INTO users (id,username,name,password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [identity.id, identity.username, identity.name, hashes[i]]
      )
      await identity.tenantIds.reduce(async (prior, tenantId) => {
        await prior
        await client.query(
          "INSERT INTO memberships (tenant_id,user_id,department_name,role,permissions) VALUES ($1,$2,'业务部',$3,$4) ON CONFLICT DO NOTHING",
          [
            tenantId,
            identity.id,
            identity.role,
            JSON.stringify(identity.permissions),
          ]
        )
      }, Promise.resolve())
    }, Promise.resolve())
    await ['a', 'b'].reduce(async (previous, suffix) => {
      await previous
      const tenantId = `tenant-${suffix}`
      const workflow = serialWorkflow(
        `${suffix}-manager-1`,
        `${suffix}-manager-2`,
        `${suffix}-auditor`
      )
      await client.query(
        "INSERT INTO applications (tenant_id,id,code,name) VALUES ($1,'leave','leave','请假审批') ON CONFLICT DO NOTHING",
        [tenantId]
      )
      await client.query(
        "INSERT INTO form_drafts (tenant_id,id,name,schema) VALUES ($1,'form-leave','请假表单',$2) ON CONFLICT DO NOTHING",
        [tenantId, JSON.stringify(LEAVE_FORM)]
      )
      await client.query(
        "INSERT INTO workflow_drafts (tenant_id,id,name,schema) VALUES ($1,'workflow-leave','请假审批',$2) ON CONFLICT DO NOTHING",
        [tenantId, JSON.stringify(workflow)]
      )
      await client.query(
        "UPDATE applications SET form_draft_id='form-leave',workflow_draft_id='workflow-leave' WHERE tenant_id=$1 AND id='leave' AND form_draft_id IS NULL AND workflow_draft_id IS NULL",
        [tenantId]
      )
      const existing = await client.query(
        'SELECT id FROM application_releases WHERE tenant_id=$1 AND application_id=$2',
        [tenantId, 'leave']
      )
      if (!existing.rowCount) {
        const id = randomUUID()
        await client.query(
          'INSERT INTO application_releases (tenant_id,id,application_id,release_version,form_snapshot,workflow_snapshot,content_hash,published_by) VALUES ($1,$2,$3,1,$4,$5,$6,$7)',
          [
            tenantId,
            id,
            'leave',
            JSON.stringify(LEAVE_FORM),
            JSON.stringify(workflow),
            digest(JSON.stringify({ form: LEAVE_FORM, workflow })),
            `${suffix}-admin`,
          ]
        )
        await client.query(
          "UPDATE applications SET active_release_id=$2 WHERE tenant_id=$1 AND id='leave'",
          [tenantId, id]
        )
      }
    }, Promise.resolve())
  })
}

if (require.main === module) {
  const pool = createPool()
  seedDemo(pool)
    .then(() =>
      process.stdout.write('Explicit demo initialization completed\n')
    )
    .finally(() => pool.end())
}

export default seedDemo
