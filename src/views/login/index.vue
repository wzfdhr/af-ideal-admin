<template>
  <div class="page">
    <header>AF-Ideal-Admin {{ version }}</header>
    <main>
      <h1>
        <img src="@/assets/logo-temp.svg" class="w-10 h-10 mr-4" />
        AF-Ideal-Admin
      </h1>

      <a-tabs class="login-tabs">
        <a-tab-pane key="password-login" title="账号密码登录">
          <login-form />
        </a-tab-pane>
        <a-tab-pane key="mobile-login" title="手机验证码登录">
          <mobile-login-form />
        </a-tab-pane>
      </a-tabs>
    </main>

    <footer>
      &copy; 2024 Created with
      <s-icon :name="HeartFill" class="text-red-500" />
      by 王宗凡
    </footer>
  </div>
</template>

<script lang="ts" setup>
import { HeartFill } from '@salmon-ui/icons'
import pkg from '../../../package.json'
import LoginForm from './widgets/normal-form.vue'
import MobileLoginForm from './widgets/mobile-form.vue'

const { version } = pkg
</script>

<style lang="scss" scoped>
.page {
  @apply min-w-full min-h-screen px-8 py-6 flex flex-col;
  background: url('@/assets/bg-login.svg') center no-repeat;
  background-size: 100%;
}
header {
  @apply text-right text-gray-500;
}
main {
  @apply min-w-[340px] w-[340px] max-w-lg mx-auto text-center mt-20 flex-1;
  h1 {
    @apply text-gray-800 font-bold text-3xl flex items-center justify-center;
    background: -webkit-linear-gradient(315deg, #330ddc 25%, #20a2ff);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  p {
    @apply mb-12 text-gray-500;
  }
}
footer {
  @apply flex-grow-0 flex-shrink-0 text-center mt-16 text-gray-500;
}
.login-tabs {
  :deep(.arco-tabs-nav-tab) {
    justify-content: center;
  }
}
</style>
