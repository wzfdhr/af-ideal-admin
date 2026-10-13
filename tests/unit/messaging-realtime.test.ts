import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessagingRealtime } from '@/components/messaging/use-messaging-realtime'
import { useUserStore } from '@/store'
import type { VueWrapper } from '@vue/test-utils'

const environment = vi.hoisted(() => ({
  token: 'private-session-token' as string | null,
  tenantId: 'tenant-a' as string | null,
  generation: 1,
  mode: 'reference',
  baseUrl: 'https://api.example.test/api/?discard=query#discard-fragment',
}))

vi.mock('@/store', async () => {
  const { defineStore } = await import('pinia')
  return {
    useUserStore: defineStore('messaging-realtime-user', {
      state: () => ({
        id: 'actor-a' as string | undefined,
        tenantId: 'tenant-a' as string | undefined,
        tenants: [
          {
            tenantId: 'tenant-a',
            name: '租户 A',
            permissions: ['message:list'],
            permissionVersion: 1,
          },
        ],
        permissions: ['message:list'],
      }),
      getters: {
        availablePermissions: (state) => state.permissions,
      },
    }),
  }
})

vi.mock('@/services/auth', () => ({ getToken: () => environment.token }))
vi.mock('@/services/ui-permissions', () => ({
  hasPermission: (permissions: string[], code: string) =>
    permissions.includes(code),
}))
vi.mock('@/services/tenant-context', () => ({
  tenantScope: {
    snapshot: () => ({
      tenantId: environment.tenantId,
      generation: environment.generation,
    }),
    isCurrent: (scope: { tenantId: string | null; generation: number }) =>
      scope.tenantId === environment.tenantId &&
      scope.generation === environment.generation,
  },
}))
vi.mock('../../config/data-mode', () => ({
  get dataMode() {
    return environment.mode
  },
}))
vi.mock('@config', () => ({
  get requestBaseUrl() {
    return environment.baseUrl
  },
}))

interface Frame {
  type: string
  token?: string | null
  tenantId?: string | null
  receiptId?: string
}

class TestSocket extends EventTarget {
  static readonly CONNECTING = 0

  static readonly OPEN = 1

  static readonly CLOSED = 3

  static instances: TestSocket[] = []

  readyState = TestSocket.CONNECTING

  readonly send = vi.fn<(data: string) => void>()

  readonly close = vi.fn((code = 1000, reason = '') => {
    this.readyState = TestSocket.CLOSED
    this.dispatchEvent(new CloseEvent('close', { code, reason }))
  })

  constructor(readonly url: string) {
    super()
    TestSocket.instances.push(this)
  }

  open() {
    this.readyState = TestSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  receive(payload: unknown) {
    this.receiveRaw(JSON.stringify(payload))
  }

  receiveRaw(data: string) {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  serverClose(code: number) {
    this.readyState = TestSocket.CLOSED
    this.dispatchEvent(new CloseEvent('close', { code }))
  }

  frames(): Frame[] {
    return this.send.mock.calls.map(([data]) => JSON.parse(data) as Frame)
  }

  acknowledgements() {
    return this.frames().filter((frame) => frame.type === 'ack')
  }
}

const wrappers: VueWrapper[] = []
let pinia: ReturnType<typeof createPinia>
const createHarness = (
  refresh = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
) => {
  let state!: ReturnType<typeof useMessagingRealtime>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useMessagingRealtime(refresh)
        return () => h('main')
      },
    }),
    { global: { plugins: [pinia] } }
  )
  wrappers.push(wrapper)
  return {
    wrapper,
    state,
    refresh,
    socket: TestSocket.instances[TestSocket.instances.length - 1],
  }
}

const authenticate = (socket: TestSocket, tenantId = environment.tenantId) => {
  socket.open()
  socket.receive({ type: 'ready', tenantId })
}
const receipt = (socket: TestSocket, receiptId = 'receipt-1') =>
  socket.receive({
    type: 'message.receipt',
    receiptId,
    notificationId: `notification-${receiptId}`,
  })
const deferred = () => {
  let resolve!: (value: boolean) => void
  const promise = new Promise<boolean>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', TestSocket)
  pinia = createPinia()
  setActivePinia(pinia)
  TestSocket.instances = []
  environment.token = 'private-session-token'
  environment.tenantId = 'tenant-a'
  environment.generation = 1
  environment.mode = 'reference'
  environment.baseUrl =
    'https://api.example.test/api/?discard=query#discard-fragment'
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('persistent messaging realtime', () => {
  it('authenticates with a frame and strips URL query/hash instead of putting tokens in the URL', () => {
    const { state, socket, refresh } = createHarness()

    expect(state.status.value).toBe('connecting')
    expect(socket.url).toBe('wss://api.example.test/api/messaging/realtime')
    expect(socket.url).not.toContain(environment.token)
    expect(socket.send).not.toHaveBeenCalled()
    socket.open()

    expect(socket.frames()).toEqual([
      { type: 'auth', token: 'private-session-token', tenantId: 'tenant-a' },
    ])
    expect(refresh).not.toHaveBeenCalled()
    socket.receive({ type: 'ready', tenantId: 'tenant-a' })
    expect(state.status.value).toBe('ready')
  })

  it('waits for the matching authenticated ready frame before processing receipts', async () => {
    const { state, socket, refresh } = createHarness()
    socket.open()
    receipt(socket)
    socket.receive({ type: 'ready', tenantId: 'other-tenant' })
    receipt(socket)
    await settle()

    expect(state.status.value).toBe('connecting')
    expect(refresh).not.toHaveBeenCalled()
    expect(socket.acknowledgements()).toEqual([])

    socket.receive({ type: 'ready', tenantId: 'tenant-a' })
    receipt(socket)
    await settle()
    expect(refresh).toHaveBeenCalledOnce()
    expect(socket.acknowledgements()).toEqual([
      { type: 'ack', receiptId: 'receipt-1' },
    ])
  })

  it('ACKs only after its own inbox refresh resolves successfully', async () => {
    const pending = deferred()
    const refresh = vi.fn(() => pending.promise)
    const { socket } = createHarness(refresh)
    authenticate(socket)
    receipt(socket)

    expect(refresh).toHaveBeenCalledOnce()
    expect(socket.acknowledgements()).toEqual([])
    pending.resolve(true)
    await settle()

    expect(socket.acknowledgements()).toEqual([
      { type: 'ack', receiptId: 'receipt-1' },
    ])
  })

  it('keeps a failed refresh receipt unacknowledged and retries its read on redelivery', async () => {
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const { socket } = createHarness(refresh)
    authenticate(socket)
    receipt(socket)
    await settle()

    expect(socket.acknowledgements()).toEqual([])
    receipt(socket)
    await settle()
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(socket.acknowledgements()).toEqual([
      { type: 'ack', receiptId: 'receipt-1' },
    ])
  })

  it('does not ACK a rejected REST refresh and reports the read failure', async () => {
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValue(new Error('REST inbox unavailable'))
    const { state, socket } = createHarness(refresh)
    authenticate(socket)
    receipt(socket)
    await settle()

    expect(socket.acknowledgements()).toEqual([])
    expect(state.reason.value).toContain('站内消息读取失败')
  })

  it('deduplicates receipts while reading, while awaiting server ACK, and after server confirmation', async () => {
    const pending = deferred()
    const refresh = vi.fn(() => pending.promise)
    const { socket } = createHarness(refresh)
    authenticate(socket)
    receipt(socket)
    receipt(socket)
    expect(refresh).toHaveBeenCalledOnce()

    pending.resolve(true)
    await settle()
    receipt(socket)
    await settle()
    expect(refresh).toHaveBeenCalledOnce()
    expect(socket.acknowledgements()).toHaveLength(1)

    socket.receive({ type: 'acknowledged', receiptId: 'receipt-1' })
    receipt(socket)
    await settle()
    expect(refresh).toHaveBeenCalledOnce()
    expect(socket.acknowledgements()).toHaveLength(1)
  })

  it('does not treat an unsolicited server ACK as confirmation of an unseen receipt', async () => {
    const { socket, refresh } = createHarness()
    authenticate(socket)
    socket.receive({ type: 'acknowledged', receiptId: 'receipt-1' })
    receipt(socket)
    await settle()

    expect(refresh).toHaveBeenCalledOnce()
    expect(socket.acknowledgements()).toEqual([
      { type: 'ack', receiptId: 'receipt-1' },
    ])
  })

  it('refreshes again for a distinct receipt arriving during an earlier REST read', async () => {
    const first = deferred()
    const second = deferred()
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { socket } = createHarness(refresh)
    authenticate(socket)
    receipt(socket, 'receipt-1')
    receipt(socket, 'receipt-2')
    expect(refresh).toHaveBeenCalledOnce()

    first.resolve(true)
    await settle()
    expect(socket.acknowledgements()).toEqual([
      { type: 'ack', receiptId: 'receipt-1' },
    ])
    expect(refresh).toHaveBeenCalledTimes(2)

    second.resolve(true)
    await settle()
    expect(socket.acknowledgements()).toEqual([
      { type: 'ack', receiptId: 'receipt-1' },
      { type: 'ack', receiptId: 'receipt-2' },
    ])
  })

  it('ignores invalid JSON and receipts without both server identities', async () => {
    const { socket, refresh } = createHarness()
    authenticate(socket)
    socket.receiveRaw('{invalid JSON')
    socket.receive({ type: 'message.receipt', receiptId: 'receipt-1' })
    socket.receive({
      type: 'message.receipt',
      notificationId: 'notification-1',
    })
    socket.receive({
      type: 'message.receipt',
      receiptId: 1,
      notificationId: 'notification-1',
    })
    socket.receive({
      type: 'other.event',
      receiptId: 'receipt-1',
      notificationId: 'notification-1',
    })
    await settle()

    expect(refresh).not.toHaveBeenCalled()
    expect(socket.acknowledgements()).toEqual([])
  })

  it.each(['tenant', 'actor'] as const)(
    'closes a changed %s connection and discards its pending refresh and late events',
    async (change) => {
      const pending = deferred()
      const refresh = vi.fn(() => pending.promise)
      const { socket, state } = createHarness(refresh)
      authenticate(socket)
      receipt(socket)

      if (change === 'tenant') {
        environment.tenantId = 'tenant-b'
        environment.generation += 1
        useUserStore().$patch({ tenantId: 'tenant-b' })
      } else {
        useUserStore().$patch({ id: 'actor-b' })
      }
      await nextTick()
      const replacement = TestSocket.instances[1]
      expect(socket.close).toHaveBeenCalledWith(1000, 'context changed')
      expect(replacement).toBeDefined()

      pending.resolve(true)
      socket.receive({ type: 'ready', tenantId: 'tenant-a' })
      socket.receive({ type: 'acknowledged', receiptId: 'receipt-1' })
      receipt(socket, 'stale-receipt')
      await settle()
      expect(refresh).toHaveBeenCalledOnce()
      expect(socket.acknowledgements()).toEqual([])
      expect(replacement.send).not.toHaveBeenCalled()
      expect(state.status.value).toBe('connecting')

      authenticate(replacement)
      expect(replacement.frames()).toEqual([
        {
          type: 'auth',
          token: 'private-session-token',
          tenantId: environment.tenantId,
        },
      ])
    }
  )

  it('detects a tenant generation change even when the user store identity is unchanged', () => {
    const { socket } = createHarness()
    authenticate(socket)
    environment.generation += 1

    vi.advanceTimersByTime(1000)

    expect(socket.close).toHaveBeenCalledWith(1000, 'context changed')
    expect(TestSocket.instances).toHaveLength(2)
  })

  it('does not ACK a refresh that finishes after the socket closes', async () => {
    const pending = deferred()
    const { socket } = createHarness(vi.fn(() => pending.promise))
    authenticate(socket)
    receipt(socket)
    socket.serverClose(1006)
    pending.resolve(true)
    await settle()

    expect(socket.acknowledgements()).toEqual([])
  })

  it.each([
    ['permission', () => useUserStore().$patch({ permissions: [] })],
    ['actor', () => useUserStore().$patch({ id: undefined })],
    ['tenant memberships', () => useUserStore().$patch({ tenants: [] })],
    [
      'token',
      () => {
        environment.token = null
      },
    ],
    [
      'tenant scope',
      () => {
        environment.tenantId = null
      },
    ],
    [
      'reference data mode',
      () => {
        environment.mode = 'mock'
      },
    ],
  ] as const)('does not connect without %s eligibility', (_, deny) => {
    deny()
    const { state, refresh } = createHarness()

    expect(TestSocket.instances).toHaveLength(0)
    expect(state.status.value).toBe('off')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('closes an existing connection when message-list authorization is revoked', async () => {
    const { socket, state } = createHarness()
    authenticate(socket)
    useUserStore().$patch({ permissions: [] })
    await nextTick()
    receipt(socket)

    expect(socket.close).toHaveBeenCalledWith(1000, 'context changed')
    expect(state.status.value).toBe('off')
    expect(TestSocket.instances).toHaveLength(1)
  })

  it.each([4401, 4403])(
    'does not automatically reconnect a server-denied session (%s)',
    (code) => {
      const { socket, state } = createHarness()
      authenticate(socket)
      socket.serverClose(code)
      vi.advanceTimersByTime(30000)

      expect(state.status.value).toBe('error')
      expect(state.reason.value).toContain('实时会话或权限已失效')
      expect(TestSocket.instances).toHaveLength(1)
    }
  )

  it('reconnects a transport failure and authenticates the replacement connection', () => {
    const { socket } = createHarness()
    authenticate(socket)
    socket.serverClose(1006)
    vi.advanceTimersByTime(1999)
    expect(TestSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    const replacement = TestSocket.instances[1]
    authenticate(replacement)

    expect(replacement.frames()).toEqual([
      { type: 'auth', token: 'private-session-token', tenantId: 'tenant-a' },
    ])
  })

  it('unmounts by closing the socket, cancelling timers, and ignoring a late read or receipt', async () => {
    const pending = deferred()
    const refresh = vi.fn(() => pending.promise)
    const { wrapper, socket } = createHarness(refresh)
    authenticate(socket)
    receipt(socket)
    socket.serverClose(1006)
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    wrapper.unmount()
    pending.resolve(true)
    receipt(socket, 'late-receipt')
    await settle()
    vi.advanceTimersByTime(30000)

    expect(socket.close).toHaveBeenCalledWith(1000, 'context changed')
    expect(vi.getTimerCount()).toBe(0)
    expect(TestSocket.instances).toHaveLength(1)
    expect(refresh).toHaveBeenCalledOnce()
    expect(socket.acknowledgements()).toEqual([])
  })
})

describe('ordinary notification invalidations and read recovery', () => {
  it('refreshes authenticated own counts from REST for notifications.changed without an ACK', async () => {
    const { socket, refresh } = createHarness()
    socket.open()
    socket.receive({ type: 'notifications.changed', unreadTotal: 999 })
    await settle()
    expect(refresh).not.toHaveBeenCalled()
    socket.receive({ type: 'ready', tenantId: 'tenant-a' })
    socket.receive({ type: 'notifications.changed', unreadTotal: 999 })
    await settle()
    expect(refresh).toHaveBeenCalledOnce()
    expect(socket.acknowledgements()).toEqual([])
  })

  it('coalesces changes during a receipt read and rereads once for the later invalidation batch', async () => {
    const first = deferred()
    const second = deferred()
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { socket } = createHarness(refresh)
    authenticate(socket)
    receipt(socket)
    socket.receive({ type: 'notifications.changed' })
    socket.receive({ type: 'notifications.changed' })
    expect(refresh).toHaveBeenCalledOnce()
    first.resolve(true)
    await settle()
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(socket.acknowledgements()).toEqual([
      { type: 'ack', receiptId: 'receipt-1' },
    ])
    second.resolve(true)
    await settle()
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(socket.acknowledgements()).toHaveLength(1)
  })

  it('waits for a subsequent own read before ACKing a receipt arriving during an invalidation read', async () => {
    const first = deferred()
    const second = deferred()
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { socket } = createHarness(refresh)
    authenticate(socket)
    socket.receive({ type: 'notifications.changed' })
    receipt(socket)
    first.resolve(true)
    await settle()
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(socket.acknowledgements()).toEqual([])
    second.resolve(true)
    await settle()
    expect(socket.acknowledgements()).toEqual([
      { type: 'ack', receiptId: 'receipt-1' },
    ])
  })

  it('retries a failed ordinary invalidation read on the same connection with no receipt ACK', async () => {
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const { socket, state } = createHarness(refresh)
    authenticate(socket)
    socket.receive({ type: 'notifications.changed' })
    await settle()
    expect(state.reason.value).toContain('正在重试')
    await vi.advanceTimersByTimeAsync(999)
    expect(refresh).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(socket.acknowledgements()).toEqual([])
    expect(state.reason.value).toBe('')
    expect(TestSocket.instances).toHaveLength(1)
  })

  it('retains a durable receipt after rejected REST reads and ACKs only after timed recovery succeeds', async () => {
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('HTTP transport unavailable'))
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const { socket } = createHarness(refresh)
    authenticate(socket)
    receipt(socket)
    await settle()
    expect(socket.acknowledgements()).toEqual([])
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(socket.acknowledgements()).toEqual([])
    await vi.advanceTimersByTimeAsync(1999)
    expect(refresh).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(refresh).toHaveBeenCalledTimes(3)
    expect(socket.acknowledgements()).toEqual([
      { type: 'ack', receiptId: 'receipt-1' },
    ])
    await vi.advanceTimersByTimeAsync(30000)
    expect(refresh).toHaveBeenCalledTimes(3)
    expect(TestSocket.instances).toHaveLength(1)
  })

  it('clears the failed read retry on actor switch and discards late invalidations from the old connection', async () => {
    const refresh = vi.fn<() => Promise<boolean>>().mockResolvedValue(false)
    const { socket } = createHarness(refresh)
    authenticate(socket)
    socket.receive({ type: 'notifications.changed' })
    await settle()
    useUserStore().$patch({ id: 'new-actor' })
    await nextTick()
    socket.receive({ type: 'notifications.changed' })
    await vi.advanceTimersByTimeAsync(30000)
    expect(refresh).toHaveBeenCalledOnce()
    expect(socket.acknowledgements()).toEqual([])
    expect(TestSocket.instances).toHaveLength(2)
  })

  it('cancels the read retry on session rejection and unmount', async () => {
    const refresh = vi.fn<() => Promise<boolean>>().mockResolvedValue(false)
    const { wrapper, socket } = createHarness(refresh)
    authenticate(socket)
    receipt(socket)
    await settle()
    socket.serverClose(4401)
    await vi.advanceTimersByTimeAsync(30000)
    expect(refresh).toHaveBeenCalledOnce()
    expect(socket.acknowledgements()).toEqual([])
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
