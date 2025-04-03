<template>
  <a-alert v-if="errorMessage" type="error">{{ errorMessage }}</a-alert>
  <a-form
    ref="loginForm"
    :model="loginInfo"
    class="mt-4"
    layout="vertical"
    size="large"
    @submit="onSubmit"
  >
    <a-form-item
      field="username"
      :rules="rules.username"
      validate-trigger="blur"
      hide-label
    >
      <a-input v-model="loginInfo.username" placeholder="用户名">
        <template #prefix>
          <s-icon :name="UserFill" :size="20" />
        </template>
      </a-input>
    </a-form-item>
    <a-form-item
      field="password"
      :rules="rules.password"
      validate-trigger="blur"
      hide-label
    >
      <a-input-password v-model="loginInfo.password" placeholder="密码">
        <template #prefix>
          <s-icon :name="LockFill" :size="20" />
        </template>
      </a-input-password>
    </a-form-item>
    <div class="flex items-center justify-between">
      <a-checkbox
        v-model="loginConfig.shouldStorePassword"
        @change="setRememberPassword as any"
      >
        记住密码
      </a-checkbox>
      <a-link>忘记密码</a-link>
    </div>
    <div class="mt-6">
      <a-button
        type="primary"
        long
        size="large"
        html-type="submit"
        :loading="isLoading"
      >
        登录
      </a-button>
    </div>
  </a-form>
</template>

<script lang="ts" setup>
import { ref, reactive } from 'vue'
import { UserFill, LockFill } from '@salmon-ui/icons'
import { FieldRule, Message, ValidatedError } from '@arco-design/web-vue'
import { useStorage } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store'
import useLoading from '@/hooks/use-loading'
import { encrypt } from '@/utils/encryption'
import { LoginData } from '@/api/user'

const { isLoading, setLoading } = useLoading()
const errorMessage = ref('')
const userStore = useUserStore()
const router = useRouter()
const loginForm = ref()

const loginInfo = reactive({
  username: '',
  password: '',
})
const loginConfig = useStorage('login-config', {
  shouldStorePassword: false,
  username: '',
  password: '',
})

const rules: Record<string, FieldRule> = {
  username: {
    required: true,
    message: '请填写用户名',
  },
  password: {
    required: true,
    message: '请填写密码',
  },
}

const onSubmit = async ({
  errors,
  values,
}: {
  errors: Record<string, ValidatedError> | undefined
  values: Record<string, any>
}) => {
  if (isLoading.value) return
  await loginForm.value.validate()
  if (!errors) {
    setLoading(true)
    try {
      await userStore.login(values as LoginData)
      // check for redirect
      const { redirect, ...otherParams } = router.currentRoute.value.query
      router.push({
        name: (redirect as string) || 'workplace',
        query: {
          ...otherParams,
        },
      })
      // display successful hint
      Message.success('登录成功')
      // process login for post-login
      const { shouldStorePassword } = loginConfig.value
      const { password, username } = values

      loginConfig.value.username = shouldStorePassword ? encrypt(username) : ''
      loginConfig.value.password = shouldStorePassword ? encrypt(password) : ''
    } catch (err) {
      console.error(err)
      errorMessage.value = (err as Error).message
      setLoading(false)
    }
  }
}

const setRememberPassword = (val: boolean) => {
  loginConfig.value.shouldStorePassword = val
}
</script>
