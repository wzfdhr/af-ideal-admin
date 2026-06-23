<template>
  <main data-testid="visual-analysis-page" class="analysis-page">
    <s-navs :navs="['menu.visualization', 'menu.visualization.analysis']" />

    <section class="s-section analysis-hero">
      <div>
        <p class="eyebrow">Mock 数据周期：2026-06-01 至 2026-06-23</p>
        <h2>舆情分析</h2>
        <p class="summary">
          聚合站内消息、内容发布、搜索热词和告警事件，帮助运营团队快速判断声量、情绪和风险变化。
        </p>
      </div>
      <div class="hero-status">
        <span>今日同步</span>
        <strong>12:30</strong>
      </div>
    </section>

    <section class="metric-grid">
      <article
        v-for="metric in metrics"
        :key="metric.label"
        class="metric-card"
      >
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
        <em :class="metric.trendType">{{ metric.trend }}</em>
      </article>
    </section>

    <section class="analysis-layout">
      <div class="s-section panel">
        <div class="section-title">
          <h3>声量趋势</h3>
          <span>按周汇总</span>
        </div>
        <div class="trend-list">
          <div v-for="item in trendData" :key="item.label" class="trend-row">
            <span>{{ item.label }}</span>
            <div class="trend-track">
              <div class="trend-bar" :style="{ width: `${item.percent}%` }" />
            </div>
            <strong>{{ item.value }}</strong>
          </div>
        </div>
      </div>

      <div class="s-section panel">
        <div class="section-title">
          <h3>内容发布比例</h3>
          <span>Mock 渠道分布</span>
        </div>
        <div class="channel-list">
          <div v-for="item in channelData" :key="item.name" class="channel-row">
            <span class="channel-dot" :style="{ background: item.color }" />
            <span>{{ item.name }}</span>
            <strong>{{ item.percent }}%</strong>
          </div>
        </div>
      </div>
    </section>

    <section class="analysis-layout bottom">
      <div class="s-section panel">
        <div class="section-title">
          <h3>热点主题</h3>
          <span>TOP 5</span>
        </div>
        <ul class="topic-list">
          <li v-for="topic in topics" :key="topic.name">
            <span>{{ topic.name }}</span>
            <strong>{{ topic.count }}</strong>
          </li>
        </ul>
      </div>

      <div class="s-section panel">
        <div class="section-title">
          <h3>风险预警</h3>
          <span>需跟进</span>
        </div>
        <ul class="risk-list">
          <li v-for="risk in risks" :key="risk.title">
            <div>
              <strong>{{ risk.title }}</strong>
              <span>{{ risk.owner }} / {{ risk.time }}</span>
            </div>
            <a-tag :color="risk.level === '高' ? 'red' : 'orange'">
              {{ risk.level }}
            </a-tag>
          </li>
        </ul>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
const metrics = [
  {
    label: '总声量',
    value: '128,430',
    trend: '+12.8%',
    trendType: 'up',
  },
  {
    label: '正向情绪',
    value: '86.4%',
    trend: '+4.1%',
    trendType: 'up',
  },
  {
    label: '传播渠道',
    value: '18',
    trend: '稳定',
    trendType: 'flat',
  },
  {
    label: '待处理告警',
    value: '7',
    trend: '-3',
    trendType: 'down',
  },
]

const trendData = [
  { label: '第 1 周', value: '21,840', percent: 48 },
  { label: '第 2 周', value: '32,500', percent: 71 },
  { label: '第 3 周', value: '45,230', percent: 100 },
  { label: '第 4 周', value: '28,860', percent: 64 },
]

const channelData = [
  { name: '站内公告', percent: 32, color: '#165dff' },
  { name: '流程待办', percent: 24, color: '#0e9f6e' },
  { name: '报表订阅', percent: 18, color: '#f59e0b' },
  { name: '系统告警', percent: 16, color: '#ef4444' },
  { name: '人工推送', percent: 10, color: '#64748b' },
]

const topics = [
  { name: '流程审批效率', count: 3860 },
  { name: '报表导出体验', count: 2940 },
  { name: '权限申请', count: 2510 },
  { name: '大屏刷新', count: 1830 },
  { name: '表单发布', count: 1420 },
]

const risks = [
  {
    title: '导出任务失败率升高',
    owner: '数据运营',
    time: '10:20',
    level: '高',
  },
  {
    title: '权限申请积压',
    owner: '平台管理员',
    time: '09:45',
    level: '中',
  },
]
</script>

<style scoped>
.analysis-page {
  padding: 0 24px 24px;
}

.analysis-hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #667085;
  font-size: 13px;
}

.analysis-hero h2 {
  margin: 0;
  color: #1d2129;
  font-size: 22px;
  font-weight: 700;
}

.summary {
  max-width: 720px;
  margin: 8px 0 0;
  color: #4e5969;
  line-height: 1.7;
}

.hero-status {
  min-width: 112px;
  padding: 10px 12px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  text-align: right;
}

.hero-status span,
.metric-card span,
.section-title span {
  display: block;
  color: #667085;
  font-size: 13px;
}

.hero-status strong,
.metric-card strong {
  display: block;
  margin-top: 6px;
  color: #1d2129;
  font-size: 22px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.metric-card {
  min-height: 116px;
  padding: 16px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
}

.metric-card em {
  display: inline-block;
  margin-top: 10px;
  font-style: normal;
  font-weight: 600;
}

.up {
  color: #0e9f6e;
}

.down {
  color: #ef4444;
}

.flat {
  color: #64748b;
}

.analysis-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 16px;
}

.analysis-layout.bottom {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 16px;
}

.panel {
  min-height: 260px;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title h3 {
  margin: 0;
  color: #1d2129;
  font-size: 16px;
}

.trend-list,
.channel-list,
.topic-list,
.risk-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.trend-row,
.channel-row,
.topic-list li,
.risk-list li {
  display: flex;
  align-items: center;
  gap: 12px;
}

.trend-row span {
  width: 64px;
  color: #4e5969;
}

.trend-track {
  flex: 1;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #eef2f7;
}

.trend-bar {
  height: 100%;
  border-radius: inherit;
  background: #165dff;
}

.channel-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.channel-row strong,
.topic-list strong {
  margin-left: auto;
}

.topic-list li,
.risk-list li {
  padding: 12px;
  border: 1px solid #f0f1f3;
  border-radius: 6px;
}

.risk-list li {
  justify-content: space-between;
}

.risk-list span {
  display: block;
  margin-top: 4px;
  color: #667085;
  font-size: 12px;
}
</style>
