<template>
  <header>
    <div class="left-sec">
      <img src="@/assets/logo-temp.svg" />
      <h1>
        AF-Ideal-Admin
        <span v-if="title">
          <a-divider :direction="'vertical'" />
          <span>{{ title }}</span>
        </span>
      </h1>
    </div>
    <ul class="right-sec">
      <li>
        <a-popover
          position="br"
          trigger="click"
          arrow-class="!hidden"
          content-class="w-[400px]"
        >
          <div class="">
            <a-badge :count="9">
              <a-button type="outline" shape="circle" class="btn">
                <template #icon>
                  <icon-notification />
                </template>
              </a-button>
            </a-badge>
          </div>
          <template #content>
            <message-box />
          </template>
        </a-popover>
      </li>
      <li>
        <a-dropdown trigger="click">
          <a-tooltip position="bottom" content="语言">
            <a-button type="outline" shape="circle" class="btn">
              <icon-language />
            </a-button>
          </a-tooltip>
          <template #content>
            <a-doption @click="changeLocale('zh-CN')">中文</a-doption>
            <a-doption @click="changeLocale('en-US')">English</a-doption>
          </template>
        </a-dropdown>
      </li>
      <li>
        <a-dropdown trigger="click">
          <a-avatar :size="32" class="cursor-pointer mr-2">
            <img :src="avatar" />
          </a-avatar>
          <template #content>
            <a-doption @click="handUserInfo">
              <a-space>
                <s-icon :name="User" />
                <span>用户中心</span>
              </a-space>
            </a-doption>
            <a-doption>
              <a-space>
                <s-icon :name="Settings" />
                <span>用户设置</span>
              </a-space>
            </a-doption>
            <a-doption @click="handleLogout">
              <a-space>
                <s-icon :name="LogoutBox" />
                <span>注销登录</span>
              </a-space>
            </a-doption>
          </template>
        </a-dropdown>
      </li>
    </ul>
  </header>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { IconNotification, IconLanguage } from '@arco-design/web-vue/es/icon'
import { Settings, LogoutBox, User } from '@salmon-ui/icons'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store'
import useLogout from '@/hooks/use-logout'
import useLocale from '@/hooks/use-locale'
import MessageBox from './message-box/index.vue'

defineProps({
  title: {
    type: String,
    default: undefined,
  },
})
const router = useRouter()

const userStore = useUserStore()
const { changeLocale } = useLocale()
const avatar = computed(() => userStore.avatar)
const { logout } = useLogout()
const handleLogout = () => {
  logout()
}
const handUserInfo = () => {
  router.push('/user/info')
}
</script>

<style lang="scss" scoped>
header {
  @apply h-[60px] sticky top-0 w-full flex items-center justify-between px-6
    border-b border-gray-200 bg-white z-[51];
  .left-sec {
    @apply flex items-center;
    img {
      @apply w-6 h-6 mr-4;
    }
    h1 {
      @apply text-xl;
    }
  }
  .right-sec {
    @apply flex items-center;
    li {
      @apply ml-6;
      .btn {
        font-size: 16px;
        @apply border border-gray-200 text-base text-gray-600 hover:border-gray-300 hover:bg-gray-50;
      }
    }
  }
}
</style>
