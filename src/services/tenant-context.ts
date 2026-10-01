export interface RequestScope {
  tenantId: string | null
  generation: number
}
const KEY = 'af-admin.tenant'
let generation = 0
let transitioning = false
const pending = new Set<AbortController>()
const dirtyChecks = new Set<() => boolean>()

export class ContextChangedError extends Error {
  constructor() {
    super('租户上下文已变化，请重新加载')
    this.name = 'ContextChangedError'
  }
}
export const tenantScope = {
  snapshot: (): RequestScope => ({
    tenantId: sessionStorage.getItem(KEY),
    generation,
  }),
  isCurrent: (scope: RequestScope) =>
    scope.generation === generation &&
    scope.tenantId === sessionStorage.getItem(KEY),
  track: (controller: AbortController) => {
    pending.add(controller)
    return () => pending.delete(controller)
  },
  isTransitioning: () => transitioning,
}
export const beginTenantTransition = () => {
  if (transitioning) throw new ContextChangedError()
  transitioning = true
}
export const cancelTenantTransition = () => {
  transitioning = false
}
export const commitTenantContext = (tenantId: string | null) => {
  generation += 1
  pending.forEach((controller) => controller.abort())
  pending.clear()
  if (tenantId) sessionStorage.setItem(KEY, tenantId)
  else sessionStorage.removeItem(KEY)
  transitioning = false
  return generation
}
export const resetTenantContext = () => commitTenantContext(null)
export const registerDirtyCheck = (check: () => boolean) => {
  dirtyChecks.add(check)
  return () => dirtyChecks.delete(check)
}
export const hasDirtyTenantPage = () =>
  [...dirtyChecks].some((check) => check())
