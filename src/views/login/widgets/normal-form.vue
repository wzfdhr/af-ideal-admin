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
    <a-form-item
      field="captcha"
      :rules="rules.captchas"
      validate-trigger="blur"
      hide-label
    >
      <a-input v-model="loginInfo.code" placeholder="验证码">
        <template #prefix>
          <s-icon :name="EmotionHappy" :size="20" />
        </template>
        <template #append>
          <img
            :src="imgUrl"
            style="height: 100%"
            @click="refreshVerification()"
          />
        </template>
      </a-input>
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
    <!-- <guided-tour v-model:show-tour="showGuidedTour">12312312312312</guided-tour> -->
  </a-form>
</template>

<script lang="ts" setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { UserFill, LockFill, EmotionHappy } from '@salmon-ui/icons'
import { FieldRule, Message, ValidatedError } from '@arco-design/web-vue'
import { useStorage } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store'
import useLoading from '@/hooks/use-loading'
import { encrypt } from '@/utils/encryption'
import { LoginData, getCode } from '@/api/user'
// import guidedTour from '@/components/tour/guidedTour.vue'

const { isLoading, setLoading } = useLoading()
const errorMessage = ref('')
const userStore = useUserStore()
const router = useRouter()
const loginForm = ref()

const loginInfo = reactive({
  username: 'admin',
  password: 'admin',
  code: '',
})
const showGuidedTour = ref()
const imgUrl = ref()
const loginConfig = useStorage('login-config', {
  shouldStorePassword: false,
  username: '',
  password: '',
})
watch(showGuidedTour, () => {
  console.log(showGuidedTour.value)
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
  // captchas: {
  //   required: true,
  //   message: '请填写验证码',
  // },
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
      // console.log(loginConfig.value)
      loginConfig.value.username = shouldStorePassword
        ? encrypt(username)
        : ('' as any)
      loginConfig.value.password = shouldStorePassword
        ? encrypt(password)
        : ('' as any)
    } catch (err) {
      console.error(err)
      errorMessage.value = (err as Error).message
      setLoading(false)
    }
  }
}
// 切换验证码图片
const refreshVerification = async () => {
  // 接收后端接口返回
  const result = await getCode()
  // 接收后转为blob对象
  const blob = new Blob([result], { type: 'image/png' })
  // 转换为url对象
  const url = window.URL.createObjectURL(blob)

  imgUrl.value = url
}
onMounted(() => {
  refreshVerification()
})
const setRememberPassword = (val: boolean) => {
  loginConfig.value.shouldStorePassword = val
}
</script>
