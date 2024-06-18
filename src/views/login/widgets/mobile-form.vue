<template>
  <a-alert v-if="errorMessage" type="error">{{ errorMessage }}</a-alert>
  <a-form
    ref="loginForm"
    :model="loginInfo"
    class="mt-4"
    layout="vertical"
    size="large"
    :rules="rules"
    @submit="onSubmit"
  >
    <a-form-item field="mobile" validate-trigger="blur" hide-label>
      <a-input v-model="loginInfo.mobile" placeholder="手机号码">
        <template #prefix>
          <s-icon :name="SmartphoneFill" :size="20" />
        </template>
      </a-input>
    </a-form-item>
    <a-form-item field="verificationCode" validate-trigger="blur" hide-label>
      <div class="flex justify-between w-full gap-4">
        <a-input v-model="loginInfo.verificationCode" placeholder="短信验证码">
          <template #prefix>
            <s-icon :name="BarCode" :size="20" />
          </template>
        </a-input>

        <a-button :disabled="!!timer" @click="onVerificationCodeSend">
          {{ buttonLabel }}
        </a-button>
      </div>
    </a-form-item>
    <div class="mt-6">
      <a-button type="primary" long size="large" html-type="submit">
        登录
      </a-button>
    </div>
  </a-form>
</template>

<script lang="ts" setup>
import { ref, computed, reactive } from 'vue'
import { SmartphoneFill, BarCode } from '@salmon-ui/icons'
import { FieldRule, ValidatedError } from '@arco-design/web-vue'

const waitTime = 60

const errorMessage = ref('')
const loginForm = ref()

const timer = ref<number | null>(null)
const countDown = ref(waitTime)
const buttonLabel = computed(() =>
  timer.value ? `再次发送(${countDown.value})` : '发送验证码'
)

const loginInfo = reactive({
  mobile: '',
  verificationCode: '',
})

const rules: Record<string, FieldRule> = {
  mobile: {
    required: true,
    message: '请填写手机号',
  },
  verificationCode: {
    required: true,
    message: '请填写密码',
  },
}

const onVerificationCodeSend = async () => {
  if (timer.value) return
  const err = await loginForm.value.validateField('mobile')
  if (err) return

  timer.value = window.setInterval(() => {
    countDown.value -= 1
    if (countDown.value <= 0) {
      clearInterval(timer.value as number)
      timer.value = null
      countDown.value = waitTime
    }
  }, 1000)
}

const onSubmit = async ({
  errors,
  values,
}: {
  errors: Record<string, ValidatedError> | undefined
  values: Record<string, any>
}) => {
  console.log(loginForm)
  await loginForm.value.validate()
  if (!errors) {
    console.log(values)
  }
}
</script>
