import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useUserStore } from '@/store'
import { getToken } from '@/services/auth'
import { hasPermission } from '@/services/ui-permissions'
import { tenantScope } from '@/services/tenant-context'
import { requestBaseUrl } from '@config'
import { dataMode } from '../../../config/data-mode'

/** Authenticated invalidations share own-inbox reads; durable receipts ACK only after a successful read. */
export const useMessagingRealtime = (
  refreshOwnInbox: () => Promise<boolean>
) => {
  const user = useUserStore()
  const status = ref<'off' | 'connecting' | 'ready' | 'error'>('off')
  const reason = ref('')
  let socket: WebSocket | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  let contextTimer: ReturnType<typeof setInterval> | undefined
  let generation = 0
  let stopped = false
  let retryDelay = 2000
  let activeScope = tenantScope.snapshot()
  const eligible = () =>
    dataMode === 'reference' &&
    !!user.tenants.length &&
    !!user.id &&
    !!getToken() &&
    !!tenantScope.snapshot().tenantId &&
    hasPermission(user.permissions, 'message:list')
  const stopSocket = () => {
    generation += 1
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = undefined
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = undefined
    socket?.close(1000, 'context changed')
    socket = undefined
  }
  const connect = () => {
    stopSocket()
    activeScope = tenantScope.snapshot()
    if (stopped || !eligible()) {
      status.value = 'off'
      reason.value = ''
      return
    }
    const currentGeneration = generation
    const scope = tenantScope.snapshot()
    activeScope = scope
    const actorId = user.id
    const current = () =>
      !stopped &&
      currentGeneration === generation &&
      user.id === actorId &&
      tenantScope.isCurrent(scope)
    const base = new URL(requestBaseUrl || '/api', window.location.origin)
    base.pathname = `${base.pathname.replace(/\/$/, '')}/messaging/realtime`
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
    base.search = ''
    base.hash = ''
    status.value = 'connecting'
    reason.value = ''
    let connection: WebSocket
    try {
      connection = new WebSocket(base.toString())
    } catch {
      status.value = 'error'
      reason.value = '实时连接不可用，可继续刷新站内消息'
      return
    }
    socket = connection
    const pending = new Set<string>()
    const awaitingAck = new Set<string>()
    const confirmed = new Set<string>()
    let refreshing = false
    let authenticated = false
    let invalidationRevision = 0
    let consumedInvalidationRevision = 0
    let refreshRetryDelay = 1000
    const hasPendingRead = () =>
      pending.size > 0 || invalidationRevision > consumedInvalidationRevision
    const flush = async () => {
      if (
        refreshing ||
        !authenticated ||
        !current() ||
        connection.readyState !== WebSocket.OPEN ||
        !hasPendingRead()
      )
        return
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = undefined
      refreshing = true
      const receipts = [...pending]
      const readInvalidationRevision = invalidationRevision
      let refreshed = false
      try {
        refreshed = await refreshOwnInbox()
        if (
          !refreshed ||
          !current() ||
          connection.readyState !== WebSocket.OPEN
        )
          return
        consumedInvalidationRevision = readInvalidationRevision
        reason.value = ''
        refreshRetryDelay = 1000
        receipts.forEach((receiptId) => {
          if (!confirmed.has(receiptId)) {
            connection.send(JSON.stringify({ type: 'ack', receiptId }))
            awaitingAck.add(receiptId)
          }
          pending.delete(receiptId)
        })
      } catch {
        refreshed = false
      } finally {
        refreshing = false
        if (
          current() &&
          connection.readyState === WebSocket.OPEN &&
          hasPendingRead()
        ) {
          if (refreshed) await flush()
          else {
            reason.value = '站内消息读取失败，正在重试；实时回执尚未确认'
            refreshTimer = setTimeout(() => {
              refreshTimer = undefined
              flush()
            }, refreshRetryDelay)
            refreshRetryDelay = Math.min(15000, refreshRetryDelay * 2)
          }
        }
      }
    }
    connection.addEventListener('open', () => {
      if (!current()) {
        connection.close()
        return
      }
      connection.send(
        JSON.stringify({
          type: 'auth',
          token: getToken(),
          tenantId: scope.tenantId,
        })
      )
    })
    connection.addEventListener('message', (event) => {
      if (!current()) {
        connection.close()
        return
      }
      let payload: {
        type?: string
        tenantId?: string
        receiptId?: string
        notificationId?: string
      }
      try {
        payload = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (payload.type === 'ready' && payload.tenantId === scope.tenantId) {
        authenticated = true
        status.value = 'ready'
        reason.value = ''
        retryDelay = 2000
        return
      }
      if (
        payload.type === 'acknowledged' &&
        authenticated &&
        typeof payload.receiptId === 'string' &&
        awaitingAck.has(payload.receiptId)
      ) {
        awaitingAck.delete(payload.receiptId)
        confirmed.add(payload.receiptId)
        if (confirmed.size > 1000) confirmed.delete([...confirmed][0])
        return
      }
      if (authenticated && payload.type === 'notifications.changed') {
        invalidationRevision += 1
        flush()
        return
      }
      if (
        !authenticated ||
        payload.type !== 'message.receipt' ||
        typeof payload.receiptId !== 'string' ||
        typeof payload.notificationId !== 'string' ||
        confirmed.has(payload.receiptId) ||
        awaitingAck.has(payload.receiptId)
      )
        return
      pending.add(payload.receiptId)
      flush()
    })
    connection.addEventListener('error', () => {
      if (current()) {
        status.value = 'error'
        reason.value = '实时连接失败，可继续读取服务器站内消息'
      }
    })
    connection.addEventListener('close', (event) => {
      if (!current()) return
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = undefined
      status.value = 'error'
      reason.value = [4401, 4403].includes(event.code)
        ? '实时会话或权限已失效，请重新登录或刷新授权'
        : '实时连接已断开，正在重连；站内消息可手动刷新'
      if ([4401, 4403].includes(event.code)) return
      reconnectTimer = setTimeout(connect, retryDelay)
      retryDelay = Math.min(30000, retryDelay * 2)
    })
  }
  watch(
    () => [
      user.id,
      user.tenantId,
      user.tenants.length,
      user.availablePermissions.join('|'),
    ],
    connect
  )
  onMounted(() => {
    connect()
    contextTimer = setInterval(() => {
      if (!tenantScope.isCurrent(activeScope)) connect()
    }, 1000)
  })
  onUnmounted(() => {
    stopped = true
    stopSocket()
    if (contextTimer) clearInterval(contextTimer)
  })
  return { status, reason, reconnect: connect }
}

export default useMessagingRealtime
