<template>
  <a-card>
    <template v-if="loading">
      <a-skeleton animation>
        <a-skeleton-line :widths="['50%', '50%', '100%', '40%']" :rows="4" />
        <a-skeleton-line :widths="['30%']" :rows="1" />
      </a-skeleton>
    </template>
    <template v-else>
      <div class="flex items-center justify-between">
        <h3 class="mr-2 truncate text-base">{{ title }}</h3>
        <a-tag class="flex-shrink-0" :color="color">
          <template #icon>
            <icon-minus-circle-fill v-if="!active" />
            <icon-check-circle-fill v-else />
          </template>
          {{ active ? '可申报' : '未开放' }}
        </a-tag>
      </div>

      <div class="text-gray-500 mt-2">{{ timeInfo }}</div>

      <a-space class="mt-4 justify-end w-full">
        <a-button size="small">办理指南</a-button>
        <a-button type="primary" size="small" :disabled="!active">
          前往申报
        </a-button>
      </a-space>
    </template>
  </a-card>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import {
  IconMinusCircleFill,
  IconCheckCircleFill,
} from '@arco-design/web-vue/es/icon'
import { fromNow } from '@/utils/time'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  startTime: {
    type: String,
    default: undefined,
  },
  endTime: {
    type: String,
    default: undefined,
  },
  active: Boolean,
  loading: Boolean,
})

const color = computed(() => (props.active ? 'green' : 'gray'))
const timeInfo = computed(() => {
  if (props.active) {
    if (props.endTime) {
      return `申报截止于 ${fromNow(props.endTime)}`
    }
    return '常态化申报'
  }

  if (props.startTime) {
    return `申报开始于 ${fromNow(props.startTime)}`
  }
  return '暂未发布下一期申报计划'
})
</script>
