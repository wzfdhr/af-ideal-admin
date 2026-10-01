import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import {
  DomainError,
  LEAVE_FORM,
  LEAVE_PERMISSIONS,
  onlyKeys,
  record,
  serialWorkflow,
  text,
} from '@af-admin/contracts'
import { createPool, transaction } from './database'
import { hashPassword } from './security'
import type { Pool } from 'pg'

/** One-time offline initialization. No bootstrap or reset HTTP endpoint exists. */
export const initializePilot = async (pool: Pool, input: unknown) => {
  if (process.env.APP_MODE !== 'pilot')
    throw new Error('Pilot initialization requires explicit APP_MODE=pilot')
  const body = record(input)
  onlyKeys(body, ['tenantId', 'tenantName', 'members'])
  const tenantId = text(body.tenantId, 'tenantId', 100)
  const tenantName = text(body.tenantName, 'tenantName', 100)
  if (
    !Array.isArray(body.members) ||
    body.members.length < 3 ||
    body.members.length > 100
  )
    throw new DomainError(
      422,
      'INVALID_INITIALIZATION',
      '需要管理员及两位审批人'
    )
  const capabilities = {
    employee: [
      LEAVE_PERMISSIONS.read,
      LEAVE_PERMISSIONS.create,
      LEAVE_PERMISSIONS.update,
      LEAVE_PERMISSIONS.submit,
      LEAVE_PERMISSIONS.withdraw,
    ],
    manager: [
      LEAVE_PERMISSIONS.todo,
      LEAVE_PERMISSIONS.approve,
      LEAVE_PERMISSIONS.reject,
    ],
    admin: [
      LEAVE_PERMISSIONS.configure,
      LEAVE_PERMISSIONS.publish,
      LEAVE_PERMISSIONS.rollback,
    ],
    auditor: [LEAVE_PERMISSIONS.audit],
  }
  const members = await Promise.all(
    body.members.map(async (inputMember) => {
      const member = record(inputMember)
      onlyKeys(member, ['username', 'name', 'department', 'password', 'kind'])
      const username = text(member.username, 'username', 100)
      const name = text(member.name, 'name', 100)
      const department = text(member.department, 'department', 100)
      const kind = text(member.kind, 'kind') as keyof typeof capabilities
      if (
        !Object.hasOwn(capabilities, kind) ||
        typeof member.password !== 'string' ||
        member.password.length < 16 ||
        member.password.length > 200 ||
        member.password === username ||
        /^(?:[ab]-(?:employee|manager-[12]|admin|auditor)|cross-tenant-employee)$/.test(
          username
        )
      )
        throw new DomainError(
          422,
          'INVALID_INITIALIZATION',
          '身份类型或独立凭据无效'
        )
      return {
        id: randomUUID(),
        username,
        name,
        department,
        kind,
        passwordHash: await hashPassword(member.password),
      }
    })
  )
  const managers = members.filter((member) => member.kind === 'manager')
  if (
    !members.some((member) => member.kind === 'admin') ||
    managers.length < 2 ||
    new Set(members.map((member) => member.username)).size !== members.length
  )
    throw new DomainError(
      422,
      'INVALID_INITIALIZATION',
      '需要唯一账号、管理员及两位审批人'
    )
  await transaction(pool, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('af-admin-initialization',0))"
    )
    const existing = await client.query('SELECT id FROM tenants LIMIT 1')
    if (existing.rowCount)
      throw new DomainError(409, 'ALREADY_INITIALIZED', '仅允许初始化空库')
    await client.query('INSERT INTO tenants (id,name) VALUES ($1,$2)', [
      tenantId,
      tenantName,
    ])
    await members.reduce(async (previous, member) => {
      await previous
      await client.query(
        'INSERT INTO users (id,username,name,password_hash) VALUES ($1,$2,$3,$4)',
        [member.id, member.username, member.name, member.passwordHash]
      )
      await client.query(
        'INSERT INTO memberships (tenant_id,user_id,department_name,role,permissions) VALUES ($1,$2,$3,$4,$5)',
        [
          tenantId,
          member.id,
          member.department,
          {
            admin: 'admin',
            manager: 'operator',
            employee: 'user',
            auditor: 'user',
          }[member.kind],
          JSON.stringify(
            member.kind === 'manager'
              ? [...capabilities.employee, ...capabilities.manager]
              : capabilities[member.kind]
          ),
        ]
      )
    }, Promise.resolve())
    await client.query(
      "INSERT INTO applications (tenant_id,id,code,name) VALUES ($1,'leave','leave','请假审批')",
      [tenantId]
    )
    await client.query(
      "INSERT INTO form_drafts (tenant_id,id,name,schema) VALUES ($1,'form-leave','请假表单',$2)",
      [tenantId, JSON.stringify(LEAVE_FORM)]
    )
    await client.query(
      "INSERT INTO workflow_drafts (tenant_id,id,name,schema) VALUES ($1,'workflow-leave','请假审批',$2)",
      [
        tenantId,
        JSON.stringify(
          serialWorkflow(
            managers[0].id,
            managers[1].id,
            members.find((member) => member.kind === 'auditor')?.id ||
              members.find((member) => member.kind === 'admin')?.id
          )
        ),
      ]
    )
  })
}

if (require.main === module) {
  const pool = createPool()
  const run = async () => {
    const file = process.env.R1_BOOTSTRAP_FILE
    if (!file) throw new Error('Configure a private R1_BOOTSTRAP_FILE')
    const metadata = await stat(file)
    if (
      !metadata.isFile() ||
      metadata.size > 65536 ||
      (process.platform !== 'win32' && metadata.mode % 64 !== 0)
    )
      throw new Error('Bootstrap file must be private, regular and bounded')
    await initializePilot(pool, JSON.parse(await readFile(file, 'utf8')))
    process.stdout.write(
      'Pilot initialized; sign in and publish the application before use\n'
    )
  }
  run()
    .catch(() => {
      process.stderr.write(
        'Pilot initialization refused; check mode, private configuration and empty database\n'
      )
      process.exitCode = 1
    })
    .finally(() => pool.end())
}

export default initializePilot
