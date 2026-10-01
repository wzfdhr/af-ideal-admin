import { digest } from './security'
import { rows, sequential } from './support'
import type { Actor } from './auth'
import type { Database } from './support'

export const alertConfigurationAdmins = async (db: Database, actor: Actor) => {
  const admins = await rows<{ user_id: string }>(
    db,
    "SELECT user_id FROM memberships WHERE tenant_id=$1 AND status='enabled' AND (permissions @> '[\"application:configure\"]'::jsonb OR permissions @> '[\"*\"]'::jsonb)",
    [actor.tenantId]
  )
  await sequential(admins, async (admin) => {
    const id = digest(`${actor.traceId}:${admin.user_id}`)
    await db.query(
      'INSERT INTO outbox (tenant_id,id,recipient_id,payload) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [
        actor.tenantId,
        id,
        admin.user_id,
        JSON.stringify({
          title: '流程处理人需要恢复',
          content: '请检查流程引用人员的状态和审批权限',
          category: 'alert',
          link: '/leave/application',
          traceId: actor.traceId,
          access: 'none',
        }),
      ]
    )
  })
}

export default alertConfigurationAdmins
