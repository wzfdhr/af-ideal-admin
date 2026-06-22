import { useUserStore } from '@/store'
import { canAccessByRequirement, toAccessRequirement } from '@/services/access'
import type { DirectiveBinding } from 'vue'

const checkPermission = (el: HTMLElement, binding: DirectiveBinding) => {
  const { value } = binding
  const userStore = useUserStore()
  const requirement = toAccessRequirement(value)

  if (!requirement) {
    return
  }

  const hasAccess = canAccessByRequirement(requirement, {
    roles: userStore.role ? [userStore.role] : [],
    permissions: userStore.permissions,
  })
  if (!hasAccess && el.parentNode) {
    el.parentNode.removeChild(el)
  }
}

export default {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    checkPermission(el, binding)
  },
  updated(el: HTMLElement, binding: DirectiveBinding) {
    checkPermission(el, binding)
  },
}
