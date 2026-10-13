<template>
  <ReferenceAuditExports v-if="dataMode === 'reference'" />
  <main v-else class="audit-export-mock" data-testid="audit-export-mock">
    <h1>审计导出</h1>
    <p>开发 Mock 模式不提供审计导出任务、文件或生命周期状态。</p>
    <p>这里没有服务端事实，也不会生成模拟下载文件。</p>
  </main>
</template>

<script setup lang="ts">
import { dataMode } from '../../../../config/data-mode'
import ReferenceAuditExports from './reference.vue'
</script>

<style scoped>
.audit-export-mock {
  min-height: 100%;
  padding: 32px;
  color: #92400e;
  background: #fffbeb;
}
</style>
