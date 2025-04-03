<template>
  <div class="flex items-center">
    <a-avatar :image-url="userInfo.avatar"></a-avatar>
    <div class="flex justify-between items-center flex-1">
      <div class="text-xl ml-4">
        欢迎回来，{{ userInfo.name }}开始您一天的工作吧！
      </div>
      <div class="flex items-center">
        <div class="Todo">
          <div>待办</div>
          <div>10</div>
        </div>
        <div class="Todo">
          <div>项目</div>
          <div>8</div>
        </div>
        <div class="Todo">
          <div>团队</div>
          <div>200</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useUserStore } from '@/store'

const { userInfo } = useUserStore()
</script>

<style lang="scss" scoped>
.Todo {
  @apply flex justify-center items-center flex-wrap text-center;
  div {
    @apply w-full;
  }
  :nth-child(1) {
    @apply text-[#00000073];
  }
  :nth-child(2) {
    @apply mt-2 text-xl;
  }
}
</style>
