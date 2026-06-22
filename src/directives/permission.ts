import { useUserStore } from '@/store'
import { canAccessByRequirement } from '@/services/access'
import type { DirectiveBinding } from 'vue'

const checkPermission = (el: HTMLElement, binding: DirectiveBinding) => {
  const { value } = binding
  const userStore = useUserStore()
  const { role } = userStore

  if (Array.isArray(value)) {
    if (value.length > 0) {
      const values = value

      const hasAccess = canAccessByRequirement(
        {
          roles: values,
        },
        {
          roles: role ? [role] : [],
          permissions: [],
        }
      )
      if (!hasAccess && el.parentNode) {
        el.parentNode.removeChild(el)
      }
    }
  } else {
    throw new Error('[AF-Admin] requires `v-allow=[]` to be set')
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
