<template>
  <chart
    v-if="renderChart"
    :option="option"
    :auto-resize="autoResize"
    :style="computedSize"
  />
</template>

<script lang="ts" setup>
import Chart from 'vue-echarts'
import { ref, computed, nextTick } from 'vue'
import { processSize } from '@/utils'

const props = defineProps({
  height: {
    type: [String, Number],
    default: '100%',
  },
  width: {
    type: [String, Number],
    default: '100%',
  },
  autoResize: {
    type: Boolean,
    default: true,
  },
  option: {
    type: Object,
    default: () => ({}),
  },
})

const renderChart = ref(false)

const computedSize = computed(() => {
  const h = processSize(props.height)
  const w = processSize(props.width)

  return {
    height: h,
    width: w,
  }
})

nextTick(() => {
  renderChart.value = true
})
</script>
