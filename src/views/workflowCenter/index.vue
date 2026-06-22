<template>
  <main class="p-6 h-full w-full">
    <s-navs :navs="['menu.Scalability', 'menu.Scalability.workflowCenter']" />
    <workflow-runtime class="mt-4" />
  </main>
</template>

<script setup lang="ts">
import WorkflowRuntime from '@/components/workflow-runtime/index.vue'
</script>
