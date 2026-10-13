import { randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import {
  DomainError,
  MESSAGING_PERMISSIONS as P,
  record,
  onlyKeys,
  text,
} from '@af-admin/contracts'
import { requirePermission, hasPermission } from '@af-admin/workflow-core'
import { authenticate } from './auth'
import { authorizedTransaction, rows, one, sequential } from './support'
import {
  messageDeliveryEvent,
  messagingSubscription,
  messagingAnnouncementVisible,
} from './messaging'
import type { Actor } from './auth'
import type { MessageRecipientRow, MessageJobRow } from './messaging'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

interface Identity {
  token: string
  tenantId: string
  userId: string
}
const authenticateSocket = async (
  pool: Pool,
  identity: Pick<Identity, 'token' | 'tenantId'>
) =>
  authenticate(pool, {
    headers: {
      'x-access-token': identity.token,
      'x-tenant-id': identity.tenantId,
    },
    id: randomUUID(),
  } as unknown as FastifyRequest)
const send = (socket: WebSocket, message: unknown) => {
  if (socket.readyState !== WebSocket.OPEN) return
  if (socket.bufferedAmount > 65536) {
    socket.close(4408, 'Consumer too slow')
    return
  }
  socket.send(JSON.stringify(message))
}
const reject = (socket: WebSocket, error: unknown) => {
  const code =
    error instanceof DomainError
      ? error.businessCode
      : 'MESSAGING_REALTIME_UNAVAILABLE'
  send(socket, { type: 'error', businessCode: code })
  socket.close(
    error instanceof DomainError && error.status === 403 ? 4403 : 4401,
    'Current authorization unavailable'
  )
}

export const registerMessagingRealtime = (
  server: FastifyInstance,
  pool: Pool
) => {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    perMessageDeflate: false,
  })
  let closing = false
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    let url: URL
    try {
      url = new URL(request.url || '/', 'http://localhost')
    } catch {
      socket.destroy()
      return
    }
    if (url.pathname !== '/api/messaging/realtime') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    if (closing || url.search || wss.clients.size >= 1000) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, (connection) =>
      wss.emit('connection', connection, request)
    )
  }
  server.server.on('upgrade', upgrade)
  wss.on('connection', (socket) => {
    let identity: Identity | undefined
    let closed = false
    let busy = false
    let messages: Promise<void> = Promise.resolve()
    const advertised = new Map<string, number>()
    let signature = ''
    const timeout = setTimeout(() => {
      if (!identity) socket.close(4401, 'Authentication required')
    }, 5000)
    const currentActor = async (): Promise<Actor> => {
      if (!identity) throw new DomainError(401, 'UNAUTHORIZED', '需要登录认证')
      const actor = await authenticateSocket(pool, identity)
      if (
        actor.userId !== identity.userId ||
        actor.tenantId !== identity.tenantId
      )
        throw new DomainError(
          403,
          'TENANT_FORBIDDEN',
          '连接绑定的身份或租户发生变化'
        )
      requirePermission(actor.permissions, 'message:list')
      return actor
    }
    const tick = async () => {
      if (!identity || busy || closed) return
      busy = true
      try {
        const actor = await currentActor()
        await authorizedTransaction(
          pool,
          actor,
          'message:list',
          async (db, current) => {
            const receipts = await rows<
              MessageRecipientRow & {
                source_kind: MessageJobRow['source_kind']
                announcement_version_id: string | null
                channel: MessageJobRow['channel']
              }
            >(
              db,
              "SELECT r.*,j.source_kind,j.announcement_version_id,j.channel FROM message_recipients r JOIN message_send_jobs j ON j.tenant_id=r.tenant_id AND j.id=r.job_id LEFT JOIN message_subscriptions s ON s.tenant_id=r.tenant_id AND s.user_id=r.user_id AND s.channel=j.channel WHERE r.tenant_id=$1 AND r.user_id=$2 AND r.status='sent' AND r.realtime_ack_at IS NULL AND r.delivery_modes ? 'websocket' AND COALESCE(s.subscribed,true) AND (s.delivery_modes IS NULL OR s.delivery_modes ? 'websocket') AND af_messaging_notification_visible(r.tenant_id,r.user_id,r.notification_id) ORDER BY r.completed_at,r.id LIMIT 100",
              [current.tenantId, current.userId]
            )
            await sequential(receipts, async (receipt) => {
              const subscription = await messagingSubscription(
                db,
                current.tenantId,
                current.userId,
                receipt.channel
              )
              if (
                !subscription.subscribed ||
                !subscription.deliveryModes.includes('websocket')
              )
                return
              if (
                receipt.source_kind === 'announcement' &&
                (!hasPermission(current.permissions, P.announcementRead) ||
                  !(await messagingAnnouncementVisible(
                    db,
                    current,
                    receipt.announcement_version_id || ''
                  )))
              )
                return
              const now = Date.now()
              if (now - (advertised.get(receipt.id) || 0) >= 5000) {
                advertised.set(receipt.id, now)
                send(socket, {
                  type: 'message.receipt',
                  receiptId: receipt.id,
                  notificationId: receipt.notification_id,
                })
              }
            })
            advertised.forEach((at, id) => {
              if (Date.now() - at > 60000) advertised.delete(id)
            })
            if (advertised.size > 4096)
              Array.from(advertised.keys())
                .slice(0, advertised.size - 4096)
                .forEach((id) => advertised.delete(id))
            // Only an invalidation hint is broadcast; all notification content remains behind authenticated HTTP reads.
            const state = one(
              await rows<{ signature: string }>(
                db,
                "SELECT md5(COALESCE(string_agg(id||':'||created_at::text||':'||COALESCE(read_at::text,''),',' ORDER BY id),'')) AS signature FROM notifications WHERE tenant_id=$1 AND recipient_id=$2 AND af_messaging_notification_visible(tenant_id,recipient_id,id)",
                [current.tenantId, current.userId]
              )
            )
            const next = state.signature
            if (signature !== next) {
              signature = next
              send(socket, { type: 'notifications.changed' })
            }
          }
        )
      } catch (error) {
        reject(socket, error)
      } finally {
        busy = false
      }
    }
    const timer = setInterval(() => {
      tick().catch(() => undefined)
    }, 500)
    socket.on('message', (data) => {
      messages = messages
        .then(async () => {
          if (closed) return
          const input = record(JSON.parse(data.toString()))
          if (input.type === 'auth') {
            onlyKeys(input, ['type', 'token', 'tenantId'])
            const proposed = {
              token: text(input.token, 'token', 200),
              tenantId: text(input.tenantId, 'tenantId', 100),
            }
            const actor = await authenticateSocket(pool, proposed)
            requirePermission(actor.permissions, 'message:list')
            if (
              identity &&
              (identity.userId !== actor.userId ||
                identity.tenantId !== actor.tenantId)
            )
              throw new DomainError(
                403,
                'TENANT_FORBIDDEN',
                '实时连接不能切换身份或租户'
              )
            identity = { ...proposed, userId: actor.userId }
            clearTimeout(timeout)
            send(socket, { type: 'ready', tenantId: actor.tenantId })
            await tick()
            return
          }
          const actor = await currentActor()
          if (input.type === 'ping') {
            onlyKeys(input, ['type'])
            send(socket, { type: 'pong' })
            return
          }
          if (input.type !== 'ack')
            throw new DomainError(
              422,
              'MESSAGING_REALTIME_INVALID',
              '实时协议无效'
            )
          onlyKeys(input, ['type', 'receiptId'])
          const receiptId = text(input.receiptId, 'receiptId', 100)
          if (!advertised.has(receiptId))
            throw new DomainError(404, 'NOT_FOUND', '资源不存在')
          await authorizedTransaction(
            pool,
            actor,
            'message:read',
            async (db, current) => {
              const receipt = one(
                await rows<
                  MessageRecipientRow & {
                    source_kind: MessageJobRow['source_kind']
                    announcement_version_id: string | null
                    channel: MessageJobRow['channel']
                  }
                >(
                  db,
                  "SELECT r.*,j.source_kind,j.announcement_version_id,j.channel FROM message_recipients r JOIN message_send_jobs j ON j.tenant_id=r.tenant_id AND j.id=r.job_id WHERE r.tenant_id=$1 AND r.id=$2 AND r.user_id=$3 AND r.status='sent' AND r.delivery_modes ? 'websocket' AND af_messaging_notification_visible(r.tenant_id,r.user_id,r.notification_id) FOR UPDATE OF r",
                  [current.tenantId, receiptId, current.userId]
                )
              )
              const subscription = await messagingSubscription(
                db,
                current.tenantId,
                current.userId,
                receipt.channel
              )
              if (
                !subscription.subscribed ||
                !subscription.deliveryModes.includes('websocket')
              )
                throw new DomainError(
                  403,
                  'MESSAGING_UNSUBSCRIBED',
                  '当前通道实时订阅已关闭'
                )
              if (
                receipt.source_kind === 'announcement' &&
                (!hasPermission(current.permissions, P.announcementRead) ||
                  !(await messagingAnnouncementVisible(
                    db,
                    current,
                    receipt.announcement_version_id || ''
                  )))
              )
                throw new DomainError(404, 'NOT_FOUND', '资源不存在')
              if (!receipt.realtime_ack_at) {
                await db.query(
                  'UPDATE message_recipients SET realtime_ack_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2',
                  [current.tenantId, receiptId]
                )
                await messageDeliveryEvent(
                  db,
                  current,
                  receipt.job_id,
                  receipt.id,
                  'realtime.acknowledged'
                )
              }
            }
          )
          send(socket, { type: 'acknowledged', receiptId })
        })
        .catch((error) => reject(socket, error))
    })
    socket.on('error', () => {
      socket.close()
    })
    socket.on('close', () => {
      closed = true
      clearTimeout(timeout)
      clearInterval(timer)
    })
  })
  server.addHook('onClose', async () => {
    closing = true
    server.server.off('upgrade', upgrade)
    wss.clients.forEach((socket) => socket.terminate())
    await new Promise<void>((resolve) => {
      wss.close(() => resolve())
    })
  })
}
export default registerMessagingRealtime
