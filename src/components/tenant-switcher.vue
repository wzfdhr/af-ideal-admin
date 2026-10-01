<template>
  <div v-if="user.tenants.length" class="tenant-switcher">
    <label for="active-tenant">当前租户</label>
    <select
      id="active-tenant"
      :value="user.tenantId"
      :disabled="tenant.switching"
      data-testid="tenant-context-select"
      @change="change"
    >
      <option
        v-for="item in user.tenants"
        :key="item.tenantId"
        :value="item.tenantId"
      >
        {{ item.name }}
      </option>
    </select>
    <span v-if="tenant.switching" role="status">切换中…</span>
    <span v-if="error" role="alert">{{ error }}</span>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { confirmR1Action } from '@/services/r1-confirm'
import useUserStore from '@/store/modules/user'
import useTenantStore from '@/store/modules/tenant'
import { hasDirtyTenantPage } from '@/services/tenant-context'

const user = useUserStore()
const tenant = useTenantStore()
const router = useRouter()
const error = ref('')
const change = async (event: Event) => {
  const select = event.target as HTMLSelectElement
  if (
    hasDirtyTenantPage() &&
    !(await confirmR1Action('当前有未保存内容，切换租户将丢弃。是否继续？'))
  ) {
    select.value = user.tenantId || ''
    return
  }
  error.value = ''
  try {
    await tenant.switchTo(select.value)
    await router.replace('/dashboard/workplace')
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '切换失败'
    select.value = user.tenantId || ''
  }
}
</script>
<style scoped>
.tenant-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
select {
  max-width: 170px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
  padding: 6px;
  background: var(--color-bg-2);
  color: var(--color-text-1);
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
