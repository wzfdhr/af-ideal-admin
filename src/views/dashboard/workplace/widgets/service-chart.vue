<template>
  <div class="s-section">
    <h2 class="text-base">服务类型分布</h2>

    <div class="mt-4">
      <SChart :height="230" :option="option" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import SChart from '@/components/s-chart.vue'
import type { EChartsOption } from 'echarts'

const option = ref<EChartsOption>({
  legend: {
    bottom: 0,
    left: 'center',
    data: ['人事档案', '政策兑现', '职称评定', '人才黑卡'],
    icon: 'circle',
    itemWidth: 8,
    textStyle: {
      color: '#4E5969',
    },
    itemStyle: {
      borderWidth: 0,
    },
  },
  title: {
    text: '总服务人次',
    subtext: '93,463',
    top: '37%',
    left: 'center',
    textStyle: {
      fontSize: 14,
      color: '#272E3B',
    },
    subtextStyle: {
      fontSize: 16,
      color: '#4E5969',
    },
  },
  tooltip: {
    className: 's-chart-tooltip',
  },
  series: [
    {
      type: 'pie',
      radius: ['50%', '70%'],
      center: ['50%', '47%'],
      label: {
        formatter: '{b}\n{d}%',
        fontSize: 12,
        color: '#4E5969',
        alignTo: 'edge',
        edgeDistance: 24,
      },
      data: [
        {
          value: 1023,
          name: '人事档案',
          itemStyle: { color: '#249EFF' },
        },
        {
          value: 743,
          name: '政策兑现',
          itemStyle: { color: '#313CA9' },
        },
        {
          value: 201,
          name: '人才黑卡',
          itemStyle: { color: '#21CCFF' },
        },
        {
          value: 260,
          name: '职称评定',
          itemStyle: { color: '#3D72F6' },
        },
      ],
    },
  ],
})
</script>
