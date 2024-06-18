import { ref } from 'vue'

const useLoading = (initValue = false) => {
  const isLoading = ref(initValue)

  const setLoading = (val: boolean) => {
    isLoading.value = val
  }

  const toggle = () => {
    isLoading.value = !isLoading.value
  }

  return {
    isLoading,
    setLoading,
    toggle,
  }
}

export default useLoading
