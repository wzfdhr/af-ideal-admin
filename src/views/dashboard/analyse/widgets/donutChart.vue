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
import SChart from '@/components/s-chart.vue'
import type { EChartsOption } from 'echarts'

const option = ref<EChartsOption>({
  series: [
    {
      type: 'pie',
      label: {
        show: true,
        position: 'center',
        formatter: '10.2%',
        color: 'rgba(0, 157, 255, 1)',
        fontFamily: 'DIN',
        fontWeight: 'bold',
        width: 70,
        height: 17,
      },
      center: ['50%', '50%'],
      radius: ['45%', '50%'],
      avoidLabelOverlap: false,
      data: [
        {
          name: '帅无敌',
          value: '10.2',
          itemStyle: {
            normal: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  // !! 在此添加想要的渐变过程色 !!
                  { offset: 0, color: 'rgba(0, 157, 255, 0)' },
                  { offset: 1, color: 'rgba(0, 157, 255, 1)' },
                ],
                global: false,
              },
            },
          },
        },
        {
          name: '下层',
          value: 100 - 10.2,
          label: {
            normal: {
              show: false,
              fontSize: 0,
            },
          },
          itemStyle: {
            normal: {
              color: 'rgba(0, 157, 255, 0.1)',
            },
          },
          hoverAnimation: false,
        },
      ],
    },
  ],
})
</script>

<style lang="scss" scoped></style>
