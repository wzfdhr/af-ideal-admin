<template>
  <div class="px-4">
    <div class="flex">
      <span class="label">营业执照</span>
      <a-upload class="upload-wrapper flex-grow" :limit="2">
        <template #upload-button>
          <div class="mb-2">
            <a-button type="outline">选择文件</a-button>
            <span class="text-gray-500 inline-block text-sm ml-4">
              允许的格式：jpg, png, pdf
            </span>
          </div>
        </template>
      </a-upload>
    </div>

    <div class="flex mt-4">
      <span class="label">完税证明</span>
      <a-upload class="upload-wrapper flex-grow">
        <template #upload-button>
          <div class="mb-2">
            <a-button type="outline">选择文件</a-button>
            <span class="text-gray-500 inline-block text-sm ml-4">
              允许的格式：jpg, png, pdf
            </span>
          </div>
        </template>
      </a-upload>
    </div>

    <div class="mt-4">
      <span class="label">发票截图</span>
      <a-upload :list-type="'picture-card'" image-preview />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.upload-wrapper {
  :deep(.arco-upload-list-item) {
    margin-top: 0px !important;
  }
  :deep(.arco-upload-list-item + .arco-upload-list-item) {
    margin-top: 8px !important;
  }
}
.label {
  @apply w-20 leading-[32px];
}
</style>
