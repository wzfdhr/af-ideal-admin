<template>
  <main class="reporting-page" data-testid="real-report-schedules-pending">
    <section class="reporting-panel">
      <h1>定时报表</h1>
      <p>当前尚未提供定时报表，暂不能创建调度任务或安排自动发送。</p>
      <p>
        报表中心提供授权查询与 CSV、XLSX、PDF
        导出，可查看任务、下载通过扫描的文件及归档。
      </p>
      <router-link to="/visualization/reportCenter">
        打开报表查询与导出
      </router-link>
    </section>
  </main>
</template>
<script setup lang="ts">
import './reporting.css'
</script>
