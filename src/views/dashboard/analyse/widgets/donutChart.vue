<template>
  <div class="s-section">
    <h2 class="text-base">服务类型分布</h2>

    <div class="mt-4">
      <SChart :height="230" :option="option" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { EChartsOption } from 'echarts'
import SChart from '@/components/s-chart.vue'

const option = ref<EChartsOption>()
</script>

<style lang="scss" scoped></style>
