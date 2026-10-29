import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import useUserStore from '@/store/modules/user'
import { updateTenantBrandLocale } from '@/services/tenant-brand-runtime'
import { dataMode } from '../../config/data-mode'
import type { TenantBrandLocale } from '@af-admin/contracts'

const useLocale = () => {
  const i18n = useI18n()
  const user = useUserStore()
  const currentLocale = computed(() => i18n.locale.value)

  const setRuntimeLocale = (val: TenantBrandLocale) => {
    i18n.locale.value = val
    document.documentElement.lang = val
  }
  const changeLocale = async (val: TenantBrandLocale) => {
    if (dataMode === 'mock') {
      setRuntimeLocale(val)
      localStorage.setItem('locale', val)
      return
    }
    await updateTenantBrandLocale(
      {
        userId: user.id || null,
        tenantId: user.tenantId || null,
        permissions: user.permissions,
      },
      val
    )
  }

  return {
    currentLocale,
    changeLocale,
    setRuntimeLocale,
  }
}

export default useLocale
