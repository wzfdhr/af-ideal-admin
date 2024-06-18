<template>
  <div class="flex items-center">
    <a-avatar :size="100" shape="circle" class="avatar">
      <img :src="userInfo.avatar" />
      <template #trigger-icon>
        <s-icon :name="CameraFill" />
      </template>
    </a-avatar>

    <a-descriptions
      :data="data"
      :label-style="{ textAlign: 'right' }"
      class="pl-28 flex-grow"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { CameraFill } from '@salmon-ui/icons'
import { useUserStore } from '@/store'

const { userInfo } = useUserStore()
const data = computed(() => [
  {
    label: '姓名',
    value: userInfo.name || '',
  },
  {
    label: '所在部门',
    value: userInfo.dept || '',
  },
  {
    label: '工作岗位',
    value: userInfo.job || '',
  },
  {
    label: '电子邮件',
    value: userInfo.email || '',
  },
])
</script>

<style lang="scss" scoped>
.avatar {
  :deep(.arco-avatar-trigger-icon-button) {
    @apply w-8 h-8 leading-none bg-blue-50;
    .sui-icon {
      @apply text-blue-500 text-base mt-2;
    }
  }
  &:hover {
    :deep(.arco-avatar-trigger-icon-button) {
      @apply bg-blue-100;
    }
  }
}
</style>
