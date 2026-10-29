<template>
  <a-config-provider :locale="locale">
    <aside
      v-if="brandRuntime.error"
      class="tenant-brand-runtime-error"
      data-testid="tenant-brand-runtime-error"
      role="alert"
    >
      <span>{{ brandRuntime.error }}</span>
      <button type="button" @click="refreshBrand">重试品牌运行态</button>
    </aside>
    <router-view />
  </a-config-provider>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import enUS from '@arco-design/web-vue/es/locale/lang/en-us'
import zhCN from '@arco-design/web-vue/es/locale/lang/zh-cn'
import { TENANT_BRANDING_REFRESH_EVENT } from '@/api/tenant-branding'
import useUserStore from '@/store/modules/user'
import useTenantStore from '@/store/modules/tenant'
import {
  clearTenantBrandRuntime,
  refreshTenantBrandRuntime,
  setTenantBrandIdentityProvider,
  tenantBrandRuntime,
} from '@/services/tenant-brand-runtime'
import { dataMode } from '../config/data-mode'
import useLocale from './hooks/use-locale'
import '@/styles/tenant-brand-runtime.scss'

const user = useUserStore()
const tenant = useTenantStore()
const brandRuntime = tenantBrandRuntime
const { currentLocale, setRuntimeLocale } = useLocale()
const locale = computed(() => {
  switch (currentLocale.value) {
    case 'zh-CN':
      return zhCN
    case 'en-US':
      return enUS
    default:
      return enUS
  }
})
const identity = computed(() => ({
  userId: user.id || null,
  tenantId: user.tenantId || null,
  permissions: [...user.permissions],
}))
const identityKey = computed(() =>
  JSON.stringify({
    ...identity.value,
    permissions: [...identity.value.permissions].sort(),
  })
)
const refreshBrand = () => refreshTenantBrandRuntime(identity.value)
const changed = () => refreshBrand()
setTenantBrandIdentityProvider(() => identity.value)

watch(
  [identityKey, () => tenant.switching],
  ([, switching]) => {
    clearTenantBrandRuntime()
    if (dataMode === 'reference' && !switching) refreshBrand()
  },
  { immediate: true }
)
watch(
  () => brandRuntime.locale,
  (value) => {
    if (dataMode === 'reference') setRuntimeLocale(value)
  },
  { immediate: true }
)
onMounted(() => {
  if (dataMode === 'reference')
    window.addEventListener(TENANT_BRANDING_REFRESH_EVENT, changed)
})
onBeforeUnmount(() => {
  if (dataMode === 'reference')
    window.removeEventListener(TENANT_BRANDING_REFRESH_EVENT, changed)
  clearTenantBrandRuntime()
  setTenantBrandIdentityProvider(() => ({
    userId: null,
    tenantId: null,
    permissions: [],
  }))
})
</script>

<style scoped>
.tenant-brand-runtime-error {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 1000;
  display: flex;
  gap: 12px;
  align-items: center;
  max-width: min(520px, calc(100vw - 32px));
  padding: 12px 16px;
  color: rgb(var(--danger-6));
  border: 1px solid rgb(var(--danger-3));
  border-radius: 8px;
  background: var(--color-bg-2);
}
</style>
