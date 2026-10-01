<template>
  <main
    class="password-page"
    data-testid="own-password-page"
    :aria-busy="loading || saving"
  >
    <h1>修改本人密码</h1>
    <p>密码修改会使本账号在所有租户的旧会话失效，修改成功后需要重新登录。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="!revision && !loading" type="button" @click="load">
      重试加载
    </button>
    <form v-if="revision" @submit.prevent="submit">
      <label>
        当前密码
        <input
          v-model="oldPassword"
          aria-label="当前密码"
          type="password"
          autocomplete="current-password"
          maxlength="200"
          required
          :disabled="saving"
        />
      </label>
      <label>
        新密码
        <input
          v-model="newPassword"
          aria-label="新密码"
          type="password"
          autocomplete="new-password"
          minlength="16"
          maxlength="200"
          required
          :disabled="saving"
        />
      </label>
      <label>
        确认新密码
        <input
          v-model="confirmation"
          aria-label="确认新密码"
          type="password"
          autocomplete="new-password"
          minlength="16"
          maxlength="200"
          required
          :disabled="saving"
        />
      </label>
      <p>新密码至少16个字符；凭据只在当前输入中使用，不保存在页面草稿中。</p>
      <button type="submit" :disabled="saving">修改密码并重新登录</button>
      <RouterLink to="/dashboard/workplace">返回工作台</RouterLink>
    </form>
  </main>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { credentialState, changeOwnPassword } from '@/api/credentials'
import { createCommandRetry } from '@/services/command-retry'
import { clearAuth } from '@/services/auth'
import {
  registerDirtyCheck,
  resetTenantContext,
} from '@/services/tenant-context'
import { parsePasswordChange } from '@af-admin/contracts'

const revision = ref(0)
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const confirmation = ref('')
const error = ref('')
const retry = createCommandRetry()
const unregister = registerDirtyCheck(
  () => !!oldPassword.value || !!newPassword.value || !!confirmation.value
)
onUnmounted(() => {
  oldPassword.value = ''
  newPassword.value = ''
  confirmation.value = ''
  retry.clear()
  unregister()
})
const load = async () => {
  loading.value = true
  error.value = ''
  try {
    revision.value = (await credentialState()).credentialRevision
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : '密码信息加载失败'
  } finally {
    loading.value = false
  }
}
const submit = async () => {
  if (saving.value) return
  error.value = ''
  if (newPassword.value !== confirmation.value) {
    error.value = '两次新密码不一致'
    return
  }
  saving.value = true
  try {
    const body = parsePasswordChange({
      oldPassword: oldPassword.value,
      newPassword: newPassword.value,
      expectedRevision: revision.value,
    })
    await changeOwnPassword(body, retry.key('self-password', body))
    retry.complete('self-password')
    oldPassword.value = ''
    newPassword.value = ''
    confirmation.value = ''
    clearAuth()
    resetTenantContext()
    await router.replace({ name: 'login', query: { passwordChanged: '1' } })
  } catch (failure) {
    error.value =
      failure instanceof Error
        ? failure.message
        : '密码修改失败。如果会话已失效，请用新密码重新登录确认结果。'
  } finally {
    saving.value = false
  }
}
onMounted(load)
</script>
<style scoped>
.password-page {
  max-width: 680px;
  margin: 24px auto;
  padding: 24px;
  color: var(--color-text-1);
  background: var(--color-bg-2);
  border-radius: 8px;
}
h1 {
  font-size: 22px;
  margin-bottom: 16px;
}
p {
  margin: 12px 0;
}
label {
  display: block;
  margin: 16px 0;
}
input {
  display: block;
  width: 100%;
  padding: 10px;
  margin-top: 8px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
  color: var(--color-text-1);
  background: var(--color-bg-2);
}
button {
  padding: 8px 16px;
  margin-right: 16px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
}
[role='alert'] {
  color: var(--color-danger-6);
}
:focus-visible {
  outline: 2px solid var(--color-primary-6);
  outline-offset: 2px;
}
</style>
