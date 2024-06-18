import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const useLocale = () => {
  const i18n = useI18n()
  const currentLocale = computed(() => i18n.locale.value)

  const changeLocale = (val: string) => {
    i18n.locale.value = val
    localStorage.setItem('locale', val)
  }

  return {
    currentLocale,
    changeLocale,
  }
}

export default useLocale
