<template>
  <LeaveRuntime v-if="user.tenants.length" />
  <main v-else class="p-6 h-full w-full">
    <s-navs :navs="['menu.Scalability', 'menu.Scalability.workflowCenter']" />
    <workflow-runtime class="mt-4" />
  </main>
</template>

<script setup lang="ts">
import WorkflowRuntime from '@/components/workflow-runtime/index.vue'
import LeaveRuntime from '@/components/workflow-runtime/leave-runtime.vue'
import useUserStore from '@/store/modules/user'

const user = useUserStore()
</script>
