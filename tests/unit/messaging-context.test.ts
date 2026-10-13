import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, getActivePinia, setActivePinia } from 'pinia'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessagingContext } from '@/components/messaging/use-messaging-context'
import { useUserStore } from '@/store'
import { commitTenantContext } from '@/services/tenant-context'

const confirm = vi.hoisted(() => vi.fn().mockResolvedValue(true))
vi.mock('@/services/r1-confirm', () => ({ confirmR1Action: confirm }))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }))

beforeEach(() => {
  setActivePinia(createPinia())
  commitTenantContext('tenant-a')
  useUserStore().$patch({
    id: 'author',
    tenantId: 'tenant-a',
    permissions: ['message:template:create'],
  })
  confirm.mockClear()
})

const createHarness = () => {
  let state!: ReturnType<typeof useMessagingContext>
  let reset!: ReturnType<typeof vi.fn>
  const activePinia = getActivePinia()
  if (!activePinia) throw new Error('Pinia fixture missing')
  const wrapper = mount(
    defineComponent({
      setup() {
        const dirty = ref(true)
        reset = vi.fn()
        state = useMessagingContext(() => dirty.value, reset)
        return { state }
      },
      template: '<main><p>{{ state.error }}</p></main>',
    }),
    { global: { plugins: [activePinia] } }
  )
  return { wrapper, state, reset }
}

describe('persistent messaging context', () => {
  it('retains command key after a transport failure and rotates it after completion', async () => {
    const { wrapper, state } = createHarness()
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('网络不可用'))
      .mockResolvedValue({ revision: 1 })
    const accept = vi.fn()
    const body = { title: '保留的正文' }
    await state.command('save', body, run, accept)
    expect(state.error.value).toBe('网络不可用')
    expect(accept).not.toHaveBeenCalled()
    const failedKey = run.mock.calls[0][0]
    await state.command('save', body, run, accept)
    expect(run.mock.calls[1][0]).toBe(failedKey)
    expect(accept).toHaveBeenCalledOnce()
    await state.command('save', body, run, accept)
    expect(run.mock.calls[2][0]).not.toBe(failedKey)
    wrapper.unmount()
  })

  it('does not render or accept an old tenant command after a switch', async () => {
    const { wrapper, state, reset } = createHarness()
    let resolve!: (value: unknown) => void
    const run = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const accept = vi.fn()
    const pending = state.command('send', { title: 'old tenant' }, run, accept)
    expect(state.busy.value).toBe(true)
    commitTenantContext('tenant-b')
    useUserStore().$patch({ tenantId: 'tenant-b' })
    await flushPromises()
    expect(reset).toHaveBeenCalledOnce()
    resolve({ id: 'old-job' })
    await pending
    expect(accept).not.toHaveBeenCalled()
    expect(state.busy.value).toBe(false)
    wrapper.unmount()
  })

  it('does not run a command if context changes while confirmation is open', async () => {
    let acceptConfirmation!: (value: boolean) => void
    confirm.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acceptConfirmation = resolve
        })
    )
    const { wrapper, state } = createHarness()
    const run = vi.fn()
    const pending = state.command('publish', {}, run, vi.fn(), '确认发布？')
    commitTenantContext('tenant-b')
    useUserStore().$patch({ tenantId: 'tenant-b' })
    await flushPromises()
    acceptConfirmation(true)
    await pending
    expect(run).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
