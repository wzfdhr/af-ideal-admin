<template>
  <div>
    <div class="text-base flex justify-between items-center">
      <div>通知公告</div>
      <div class="text-blue-500 text-xs cursor-pointer">更多>></div>
    </div>
    <a-divider />
    <div>
      <div v-for="(item, index) in data" :key="index" class="flex mt-6 gap-2">
        <div>
          <a-avatar
            shape="circle"
            class="text-white"
            :style="{ backgroundColor: getFillColor(item.type) }"
          >
            <SIcon :name="getIcon(item.type)" :size="24" />
          </a-avatar>
        </div>
        <div>
          <div>{{ item.title }}</div>
          <div class="mt-2 text-xs">{{ item.content }}</div>
          <span class="block text-xs text-gray-400 mt-2">
            {{ fromNow(item.time) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Article } from '@salmon-ui/icons'
import { fromNow } from '@/utils/time'
import { noticeTypeMap } from '@config'

const data = ref([
  {
    title: '您还没有提交周报',
    time: '2024-6-18 16:00',
    content:
      '关于个人通知收到的信息,您这周还没有提交周报,请您于周末之前提交周报',
    type: 'report',
  },
  {
    title: '您有 5 条待审核的申报',
    time: '2024-6-18 16:00',
    content:
      '关于个人通知收到的信息,您这周还没有提交周报,请您于周末之前提交周报',
    type: 'audit',
  },
  {
    title: '系统将在2024年6月18日凌晨进行维护',
    time: '2024-6-18 16:00',
    content:
      '关于个人通知收到的信息,您这周还没有提交周报,请您于周末之前提交周报',
    type: 'normal',
  },
  {
    title: '系统将在2024年6月18日凌晨进行维护',
    time: '2024-6-18 16:00',
    content:
      '关于个人通知收到的信息,您这周还没有提交周报,请您于周末之前提交周报',
    type: 'normal',
  },
  {
    title: '系统将在2024年6月18日凌晨进行维护',
    time: '2024-6-18 16:00',
    content:
      '关于个人通知收到的信息,您这周还没有提交周报,请您于周末之前提交周报',
    type: 'normal',
  },
])
const getFillColor = (type: string) => {
  const typeConfig = noticeTypeMap.find((e) => e.type === type)
  return typeConfig?.bg || 'bg-gray-200'
}

const getIcon = (type: string) => {
  console.log(type)
  const typeConfig = noticeTypeMap.find((e) => e.type === type)
  return typeConfig?.icon
}
</script>

<style lang="scss" scoped>
.active {
  @apply bg-[#FF8247];
}
.active2 {
  @apply bg-blue-400;
}
.active1 {
  @apply bg-green-300;
}
</style>
