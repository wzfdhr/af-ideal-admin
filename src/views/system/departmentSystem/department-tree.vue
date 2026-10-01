<template>
  <ul class="organization-tree">
    <li v-for="node in nodes" :key="node.id" :data-department-id="node.id">
      <details open>
        <summary>
          {{ node.departmentName }}
          <span v-if="node.status === 'disabled'">（停用）</span>
        </summary>
        <DepartmentTree v-if="node.children.length" :nodes="node.children" />
      </details>
    </li>
  </ul>
</template>
<script setup lang="ts">
import type { DepartmentNode } from '@af-admin/contracts'

defineProps<{ nodes: DepartmentNode[] }>()
</script>
<style scoped>
.organization-tree {
  padding-left: 24px;
}
summary {
  padding: 5px 0;
  cursor: pointer;
}
summary:focus-visible {
  outline: 2px solid var(--color-primary-6);
  outline-offset: 2px;
}
</style>
