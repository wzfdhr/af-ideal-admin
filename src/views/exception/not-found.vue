<template>
  <main
    class="h-screen w-screen overflow-hidden flex items-center justify-center"
  >
    <a-result status="404" class="!p-0">
      <template #subtitle>页面不存在或已失效</template>
      <template #extra>
        <a-button type="primary" @click="$router.go(-1)">返回上一页</a-button>
      </template>
    </a-result>
  </main>
</template>
