<template>
  <div>
    <a-avatar
      image-url="https://p1-arco.byteimg.com/tos-cn-i-uwbnlip3yd/3ee5f13fb09879ecb5185e440cef6eb9.png~tplv-uwbnlip3yd-webp.webp"
    ></a-avatar>
    欢迎回来，{{ userInfo.name }}开始您一天的工作吧！
  </div>
</template>

<script setup>
import { useUserStore } from '@/store'

const { userInfo } = useUserStore()
</script>

<style lang="scss" scoped></style>
