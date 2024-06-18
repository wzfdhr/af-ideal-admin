<template>
  <main
    class="h-screen w-screen overflow-hidden flex items-center justify-center"
  >
    <a-result status="403" class="!p-0">
      <template #subtitle>没有访问权限</template>
      <template #extra>
        <a-button type="primary" @click="$router.go(-1)">返回上一页</a-button>
      </template>
      <div class="bg-gray-100 max-w-xl mx-auto px-6 py-4">
        <p>您没有访问该页面的权限，请尝试：</p>
        <ul class="mt-4 list-inside list-disc">
          <li>联系系统管理员了解详情，或为您赋予权限。</li>
        </ul>
      </div>
    </a-result>
  </main>
</template>
