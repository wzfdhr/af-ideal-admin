import { onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useUserStore } from '@/store'
import { createCommandRetry } from '@/services/command-retry'
import { confirmR1Action } from '@/services/r1-confirm'
import { registerDirtyCheck, tenantScope } from '@/services/tenant-context'
import { hasPermission } from '@/services/ui-permissions'
import { errorMessage } from '@/views/leave/shared'

export const useReportingContext = (
  dirty: () => boolean,
  reset: () => void
) => {
  const user = useUserStore()
  const error = ref('')
  const notice = ref('')
  const busy = ref(false)
  const retry = createCommandRetry()
  let generation = 0
  const ticket = () => {
    const seq = generation
    const scope = tenantScope.snapshot()
    return () => seq === generation && tenantScope.isCurrent(scope)
  }
  const allowed = (code: string) => hasPermission(user.permissions, code)
  const command = async <T>(
    operation: string,
    body: unknown,
    run: (key: string) => Promise<T>,
    accept: (result: T) => void | Promise<void>,
    confirmation?: string
  ) => {
    if (busy.value) return
    const current = ticket()
    if (confirmation && !(await confirmR1Action(confirmation))) return
    if (!current()) return
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      const result = await run(retry.key(operation, body))
      if (!current()) return
      retry.complete(operation)
      await accept(result)
    } catch (failure) {
      if (current()) error.value = errorMessage(failure)
    } finally {
      if (current()) busy.value = false
    }
  }
  const unregister = registerDirtyCheck(dirty)
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty()) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', beforeUnload)
  onBeforeRouteLeave(
    () => !dirty() || confirmR1Action('报表配置或查询有未保存输入，确认离开？')
  )
  watch(
    () => [user.id, user.tenantId, user.availablePermissions.join('|')],
    () => {
      generation += 1
      retry.clear()
      busy.value = false
      error.value = ''
      notice.value = ''
      reset()
    }
  )
  onUnmounted(() => {
    generation += 1
    unregister()
    retry.clear()
    window.removeEventListener('beforeunload', beforeUnload)
  })
  return { user, error, notice, busy, allowed, ticket, command }
}
export default useReportingContext
