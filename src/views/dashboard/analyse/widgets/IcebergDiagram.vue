<template>
  <div class="s-section">
    <h2 class="text-base">往年财政对比</h2>

    <div>
      <SChart :height="230" :option="option" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { BarSeriesOption, PictorialBarSeriesOption } from 'echarts/charts'
import { EChartsOption, SeriesOption } from 'echarts'
import SChart from '@/components/s-chart.vue'

const seriesData = ref<Array<BarSeriesOption | PictorialBarSeriesOption>>([
  {
    name: '本年财力总额累计值',
    type: 'bar', // 或 'pictorialBar'
    barWidth: 65,
    data: [20, 18, 17, 24],
    itemStyle: {
      color: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(30, 236, 186, 1)' },
          { offset: 1, color: 'rgba(30, 236, 186, 0)' },
        ],
      },
    },
  },
  {
    name: '上年同期',
    type: 'bar', // 或 'pictorialBar'
    barWidth: 65,
    data: [20, 18, 17, 24],
    itemStyle: {
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
      },
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
      color: '#999',
      fontSize: 12,
    },
  },
  legend: {
    top: '10%',
    right: '10%',
    icon: 'circle',
    data: ['本年财力总额累计值', '上年同期'],
    textStyle: {
      // ✅ 正确位置
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
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.8)',
      },
      splitArea: {
        areaStyle: {
          color: ['rgba(255,255,255,.5)'],
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
  series: seriesData.value as SeriesOption[],
})
</script>

<style lang="scss" scoped></style>
