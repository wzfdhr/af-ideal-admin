<template>
  <main class="px-6">
    <s-navs :navs="['menu.dashboard', 'menu.dashboard.analyse']" />

    <a-row :gutter="16" class="w-full">
      <a-col :span="7">
        <div class="s-section">
          <Notification />
        </div>
      </a-col>
      <a-col :span="10" class="w-full bg-white">
        <a-tabs default-active-key="2">
          <a-tab-pane key="1" title="财政收入">
            <div>
              <icebergDiagram />
            </div>
            <div class="mt-4">
              <donutChart />
            </div>
          </a-tab-pane>
          <a-tab-pane key="2" title="财政收入2">
            <div>
              <donutChart />
            </div>
            <div class="mt-4">
              <icebergDiagram />
            </div>
          </a-tab-pane>
        </a-tabs>
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
import Notification from './widgets/notification.vue'
</script>
