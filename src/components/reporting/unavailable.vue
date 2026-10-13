<template>
  <main class="reporting-page" data-testid="real-report-schedules-pending">
    <section class="reporting-panel">
      <h1>定时报表</h1>
      <p>当前尚未提供定时报表，暂不能创建调度任务或安排自动发送。</p>
      <p>当前支持按权限查询报表，文件生成、下载和归档尚不可用。</p>
      <router-link to="/visualization/reportCenter">
        打开真实报表查询
      </router-link>
    </section>
  </main>
</template>
<script setup lang="ts">
import './reporting.css'
</script>
