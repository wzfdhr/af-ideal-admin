<template>
  <ReferenceAuditRetention v-if="dataMode === 'reference'" />
  <main v-else class="audit-retention-mock" data-testid="audit-retention-mock">
    <h1>审计事件归档与保留</h1>
    <p>开发 Mock 模式不提供保留策略、逻辑归档运行或归档文件。</p>
    <p>这里不会生成模拟进度、候选数量或下载文件。</p>
  </main>
</template>

<script setup lang="ts">
import { dataMode } from '../../../../config/data-mode'
import ReferenceAuditRetention from './reference.vue'
</script>

<style scoped>
.audit-retention-mock {
  min-height: 100%;
  padding: 32px;
  color: #92400e;
  background: #fffbeb;
}
</style>
