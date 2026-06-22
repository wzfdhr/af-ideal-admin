<template>
  <main class="p-6 h-full w-full">
    <s-navs :navs="['menu.Scalability', 'menu.Scalability.workflowDesign']" />
    <workflow-designer class="mt-4" />
  </main>
</template>

<script setup lang="ts">
import WorkflowDesigner from '@/components/workflow-designer/index.vue'
</script>
