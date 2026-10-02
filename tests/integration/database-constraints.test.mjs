import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { randomUUID } from 'node:crypto'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'

const pool = db.createPool()
after(() => pool.end())

const fixtures = async (client) => {
  const p = randomUUID()
  const a = `${p}-a`, b = `${p}-b`, actor = `${p}-actor`
  await client.query('INSERT INTO tenants (id,name) VALUES ($1,$1),($2,$2)', [a,b])
  await client.query('INSERT INTO users (id,username,name,password_hash) VALUES ($1,$1,$1,$2)', [actor,'non-authenticating-fixture'])
  await client.query("INSERT INTO memberships (tenant_id,user_id,department_name,role,permissions) VALUES ($1,$3,'业务部','user','[]'),($2,$3,'业务部','user','[]')", [a,b,actor])
  await client.query("INSERT INTO applications (tenant_id,id,code,name) VALUES ($1,'leave','leave','请假'),($2,'leave','leave','请假')", [a,b])
  await client.query("INSERT INTO application_releases (tenant_id,id,application_id,release_version,form_snapshot,workflow_snapshot,content_hash,published_by) VALUES ($1,'release','leave',1,'{}','{}','fixture',$2)", [a,actor])
  return {a,b,actor}
}
const rejected = async (client, sql, params, code) => {
  await client.query('SAVEPOINT rejected_command')
  await assert.rejects(client.query(sql,params), (error) => error.code === code)
  await client.query('ROLLBACK TO SAVEPOINT rejected_command')
}
const isolated = async (run) => {
  const client=await pool.connect()
  try { await client.query('BEGIN'); await run(client) }
  finally { await client.query('ROLLBACK'); client.release() }
}

test('migrations are checksum verified and repeatable against real PostgreSQL', async () => {
  await migrations.migrate(pool)
  await migrations.migrate(pool)
  const result=await pool.query('SELECT name FROM schema_migrations ORDER BY name')
  assert.deepEqual(result.rows.map((row)=>row.name),['001_leave_approval.sql','002_audit_and_telemetry.sql','003_organization.sql','004_positions.sql','005_member_profiles.sql','006_credential_revisions.sql','007_roles_and_permissions.sql'])
})
test('database rejects cross-tenant references and published release mutation', async () => {
  await isolated(async(client)=>{
    const {a,b,actor}=await fixtures(client)
    await rejected(client,"INSERT INTO leave_requests (tenant_id,id,application_release_id,applicant_id,applicant_name,department_snapshot,fields,half_day_units) VALUES ($1,'request','release',$2,'员工','部门','{}',2)",[b,actor],'23503')
    await rejected(client,"UPDATE application_releases SET content_hash='changed' WHERE tenant_id=$1",[a],'23514')
    await rejected(client,"DELETE FROM application_releases WHERE tenant_id=$1",[a],'23514')
    const row=await client.query('SELECT content_hash FROM application_releases WHERE tenant_id=$1',[a])
    assert.equal(row.rows[0].content_hash,'fixture')
  })
})
test('database uniqueness prevents a second instance or repeated node task',async()=>{
  await isolated(async(client)=>{
    const {a,actor}=await fixtures(client)
    await client.query("INSERT INTO leave_requests (tenant_id,id,application_release_id,applicant_id,applicant_name,department_snapshot,fields,half_day_units) VALUES ($1,'request','release',$2,'员工','部门','{}',2)",[a,actor])
    await client.query("INSERT INTO workflow_instances (tenant_id,id,request_id,release_id,status) VALUES ($1,'instance','request','release','running')",[a])
    await rejected(client,"INSERT INTO workflow_instances (tenant_id,id,request_id,release_id,status) VALUES ($1,'duplicate','request','release','running')",[a],'23505')
    await client.query("INSERT INTO workflow_tasks (tenant_id,id,instance_id,node_id,node_name,assignee_id) VALUES ($1,'task','instance','approval','审批',$2)",[a,actor])
    await rejected(client,"INSERT INTO workflow_tasks (tenant_id,id,instance_id,node_id,node_name,assignee_id) VALUES ($1,'duplicate-task','instance','approval','审批',$2)",[a,actor],'23505')
  })
})
