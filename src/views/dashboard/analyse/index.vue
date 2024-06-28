<template>
  <main class="px-6 pb-6">
    <s-navs :navs="['menu.dashboard', 'menu.dashboard.analyse']" />

    <a-row :gutter="16" class="w-full">
      <a-col :span="7">
        <div class="s-section">左侧区域</div>
      </a-col>
      <a-col :span="10" class="w-full">
        <div class="s-section">
          <icebergDiagram />
        </div>
        <div class="s-section mt-4">
          <donutChart />
        </div>
      </a-col>
      <a-col :span="7">
        <div class="s-section">
          <siteLogs />
        </div>
      </a-col>
    </a-row>
  </main>
</template>

<script lang="ts" setup>
import icebergDiagram from './widgets/IcebergDiagram.vue'
import donutChart from './widgets/donutChart.vue'
import siteLogs from './widgets/siteLogs.vue'
</script>
