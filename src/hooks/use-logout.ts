import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { useUserStore } from '@/store'

const useLogout = () => {
  const router = useRouter()
  const userStore = useUserStore()

  const logout = async (to?: string) => {
    await userStore.logout()
    Message.success('登出成功')
    const currentRoute = router.currentRoute.value
    router.push({
      name: to || 'login',
      query: {
        ...router.currentRoute.value.query,
        redirect: currentRoute.name as string,
      },
    })
  }

  return {
    logout,
  }
}

export default useLogout
