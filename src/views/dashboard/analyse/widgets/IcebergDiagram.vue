<template>
  <div class="s-section">
    <h2 class="text-base">往年财政对比</h2>

    <div class="mt-4">
      <SChart :height="230" :option="option" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SChart from '@/components/s-chart.vue'
import type { EChartsOption } from 'echarts'

const seriesData = ref([
  {
    name: '本年财力总额累计值',
    type: 'pictorialBar',
    barCategoryGap: 20,
    symbol: 'path://d="M150 50 L130 130 L170 130  Z"',
    barWidth: 65,
    symbolOffset: [15, 0],
    data: [20, 18, 17, 24],
    itemStyle: {
      normal: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            {
              offset: 0,
              color: 'rgba(30, 236, 186, 1)',
            },
            {
              offset: 1,
              color: 'rgba(30, 236, 186, 0)',
            },
          ],
          global: false,
        },
      },
      emphasis: {},
    },
  },
  {
    name: '上年同期',
    type: 'pictorialBar',
    barCategoryGap: 20,
    symbol: 'path://d="M150 50 L130 130 L170 130  Z"',
    barWidth: 65,
    symbolOffset: [-15, 0],
    data: [15, 12, 11, 19],
    itemStyle: {
      normal: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            {
              offset: 0,
              color: 'rgba(0, 157, 255, 1)',
            },
            {
              offset: 1,
              color: 'rgba(0, 157, 255, 0)',
            },
          ],
          global: false,
        },
      },
      emphasis: {},
    },
  },
])
const option = ref<EChartsOption>({
  xAxis: {
    data: ['安亭地区', '白鹤地区', '外港地区', '江亭地区'],
    axisTick: {
      show: false,
    },
    axisLine: {
      lineStyle: {
        color: 'rgba(255, 129, 109,.1)',
        width: 1, // 这里是为了突出显示加上的
      },
    },
    axisLabel: {
      textStyle: {
        color: '#999',
        fontSize: 12,
      },
    },
  },
  legend: {
    top: '10%',
    right: '10%',
    icon: 'circle',
    data: ['本年财力总额累计值', '上年同期'],
    textStyle: {
      color: 'rgba(152, 174, 186, 1)',
      fontSize: 14,
    },
  },
  yAxis: [
    {
      name: '万元',
      nameTextStyle: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 10,
      },
      axisTick: {
        show: false,
      },

      axisLabel: {
        textStyle: {
          fontSize: 10,
          color: 'rgba(255, 255, 255, 0.8)',
        },
      },
      splitArea: {
        areaStyle: {
          color: 'rgba(255,255,255,.5)',
        },
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(255, 129, 109, 0.1)',
          width: 0.5,
          type: 'solid',
        },
      },
    },
  ],
  series: seriesData,
})
</script>

<style lang="scss" scoped></style>
