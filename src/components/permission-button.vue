<template>
  <a-button
    v-if="allowed || !hideWhenDenied"
    v-bind="$attrs"
    :disabled="disabled"
    :title="title"
  >
    <slot />
  </a-button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from '@/store'
import { canAccessByRequirement } from '@/services/access'
import type { AccessRequirement } from '@/services/access'

const props = withDefaults(
  defineProps<{
    permission?: string | string[]
    permissions?: string[]
    roles?: string[]
    mode?: AccessRequirement['mode']
    hideWhenDenied?: boolean
    disabledReason?: string
  }>(),
  {
    permission: undefined,
    permissions: () => [],
    roles: () => [],
    hideWhenDenied: true,
    mode: 'any',
    disabledReason: '无操作权限',
  }
)

const userStore = useUserStore()

const getPermissionValues = () => {
  if (!props.permission) {
    return props.permissions
  }
  if (Array.isArray(props.permission)) {
    return [...props.permission, ...props.permissions]
  }

  return [props.permission, ...props.permissions]
}

const requirement = computed<AccessRequirement | undefined>(() => {
  const permissions = getPermissionValues()
  const { roles } = props

  if (!permissions.length && !roles.length) {
    return undefined
  }

  return {
    roles,
    permissions,
    mode: props.mode,
  }
})

const allowed = computed(() =>
  canAccessByRequirement(requirement.value, {
    roles: userStore.role ? [userStore.role] : [],
    permissions: userStore.permissions,
  })
)

const disabled = computed(() => !allowed.value)
const title = computed(() => (allowed.value ? undefined : props.disabledReason))
</script>
