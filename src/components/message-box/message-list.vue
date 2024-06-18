<template>
  <a-list :bordered="false">
    <a-list-item
      v-for="item in list"
      :key="item.id"
      action-layout="vertical"
      @click="onClick(item)"
    >
      <a-list-item-meta :title="item.title" :description="item.content">
        <template #avatar>
          <a-avatar shape="circle">
            <img :src="item.avatar" />
          </a-avatar>
        </template>
      </a-list-item-meta>
      <span class="block text-xs text-gray-400 pl-[56px]">
        {{ fromNow(item.time) }}
      </span>
    </a-list-item>
  </a-list>
</template>

<script lang="ts" setup>
import { PropType } from 'vue'
import { MessageRecord } from '@/api/message'
import { fromNow } from '@/utils/time'

defineProps({
  list: {
    type: Array as PropType<MessageRecord[]>,
    required: true,
  },
})

const emit = defineEmits(['item-click'])

const onClick = (item: MessageRecord) => {
  emit('item-click', item)
}
</script>
