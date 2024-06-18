<template>
  <a-list :bordered="false">
    <a-list-item
      v-for="item in list"
      :key="item.id"
      action-layout="vertical"
      @click="onClick(item)"
    >
      <div class="flex items-center">
        <div class="mr-4">
          <a-avatar
            shape="circle"
            class="text-white"
            :style="{ backgroundColor: getFillColor(item.type) }"
          >
            <s-icon :name="getIcon(item.type)" :size="24" />
          </a-avatar>
        </div>
        <div>
          <div>{{ item.title }}</div>
          <span class="block text-xs text-gray-400">
            {{ fromNow(item.time) }}
          </span>
        </div>
      </div>
    </a-list-item>
  </a-list>
</template>

<script lang="ts" setup>
import { PropType } from 'vue'
import { NoticeRecord } from '@/api/message'
import { fromNow } from '@/utils/time'
import { noticeTypeMap } from '@config'

defineProps({
  list: {
    type: Array as PropType<NoticeRecord[]>,
    required: true,
  },
})

const getFillColor = (type: string) => {
  const typeConfig = noticeTypeMap.find((e) => e.type === type)
  return typeConfig?.bg || 'bg-gray-200'
}

const getIcon = (type: string) => {
  const typeConfig = noticeTypeMap.find((e) => e.type === type)
  return typeConfig?.icon
}

const emit = defineEmits(['item-click'])

const onClick = (item: NoticeRecord) => {
  emit('item-click', item)
}
</script>
