<template>
  <template v-if="user.tenants.length">
    <LeaveRuntime v-if="canViewTasks" />
    <WorkflowRecoveryConsole v-if="canRecover" />
    <WorkflowTimerConsole v-if="canViewTimers" />
  </template>
  <main v-else class="p-6 h-full w-full">
    <s-navs :navs="['menu.Scalability', 'menu.Scalability.workflowCenter']" />
    <workflow-runtime class="mt-4" />
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WorkflowRuntime from '@/components/workflow-runtime/index.vue'
import LeaveRuntime from '@/components/workflow-runtime/leave-runtime.vue'
import useUserStore from '@/store/modules/user'
import WorkflowTimerConsole from '@/components/workflow-timer-console.vue'
import WorkflowRecoveryConsole from '@/components/workflow-recovery-console.vue'
import { hasPermission } from '@af-admin/workflow-core'

const user = useUserStore()
const canViewTimers = computed(() =>
  hasPermission(user.permissions, 'workflow:timer:read')
)
const canViewTasks = computed(() =>
  hasPermission(user.permissions, 'workflow:todo')
)
const canRecover = computed(() =>
  hasPermission(user.permissions, 'workflow:recover')
)
</script>
