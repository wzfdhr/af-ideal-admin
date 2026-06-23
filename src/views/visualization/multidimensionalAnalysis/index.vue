<template>
  <main
    data-testid="multidimensional-analysis-page"
    class="multi-analysis-page"
  >
    <s-navs
      :navs="[
        'menu.visualization',
        'menu.visualization.multidimensionalAnalysis',
      ]"
    />

    <section class="s-section page-header">
      <div>
        <p>Mock 明细样本：销售经营主题 / 最近 30 天</p>
        <h2>多维数据分析</h2>
        <span>
          从区域、渠道、产品线和客户等级交叉观察收入、订单、转化率和客单价，适合售前演示经营分析能力。
        </span>
      </div>
      <div class="header-total">
        <span>综合转化率</span>
        <strong>18.6%</strong>
      </div>
    </section>

    <section class="dimension-grid">
      <article v-for="dimension in dimensions" :key="dimension.name">
        <span>{{ dimension.name }}</span>
        <strong>{{ dimension.value }}</strong>
        <em>{{ dimension.description }}</em>
      </article>
    </section>

    <section class="s-section matrix-section">
      <div class="section-title">
        <h3>维度矩阵</h3>
        <span>区域 x 渠道 x 产品线</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>区域</th>
            <th>渠道</th>
            <th>产品线</th>
            <th>收入</th>
            <th>订单</th>
            <th>转化率</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in matrixRows" :key="`${row.region}-${row.channel}`">
            <td>{{ row.region }}</td>
            <td>{{ row.channel }}</td>
            <td>{{ row.product }}</td>
            <td>{{ row.revenue }}</td>
            <td>{{ row.orders }}</td>
            <td>{{ row.conversion }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="multi-layout">
      <div class="s-section panel">
        <div class="section-title">
          <h3>下钻路径</h3>
          <span>当前分析链路</span>
        </div>
        <ol class="drilldown-list">
          <li v-for="item in drilldownPath" :key="item">{{ item }}</li>
        </ol>
      </div>

      <div class="s-section panel">
        <div class="section-title">
          <h3>指标解释</h3>
          <span>口径说明</span>
        </div>
        <ul class="indicator-list">
          <li v-for="item in indicatorNotes" :key="item.title">
            <strong>{{ item.title }}</strong>
            <span>{{ item.description }}</span>
          </li>
        </ul>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
const dimensions = [
  {
    name: '区域',
    value: '6 个',
    description: '华东、华南、华北等经营区',
  },
  {
    name: '渠道',
    value: '4 类',
    description: '直营、伙伴、线上、行业 KA',
  },
  {
    name: '产品线',
    value: '5 条',
    description: '表单、流程、低代码、大屏、报表',
  },
  {
    name: '客户等级',
    value: '3 档',
    description: '开源版、专业版、企业版',
  },
]

const matrixRows = [
  {
    region: '华东',
    channel: '直营',
    product: '流程设计器',
    revenue: '286 万',
    orders: 42,
    conversion: '21.4%',
  },
  {
    region: '华南',
    channel: '伙伴',
    product: '低代码',
    revenue: '198 万',
    orders: 31,
    conversion: '18.2%',
  },
  {
    region: '华北',
    channel: '行业 KA',
    product: '数据大屏',
    revenue: '326 万',
    orders: 27,
    conversion: '24.8%',
  },
  {
    region: '西南',
    channel: '线上',
    product: '报表中心',
    revenue: '116 万',
    orders: 54,
    conversion: '13.9%',
  },
]

const drilldownPath = [
  '全部客户',
  '企业版商机',
  '华北区域',
  '行业 KA 渠道',
  '数据大屏产品线',
]

const indicatorNotes = [
  {
    title: '收入',
    description: '按已确认合同金额统计，退订金额在当期扣减。',
  },
  {
    title: '订单',
    description: '按客户签约单据计数，同一客户续约单独计入。',
  },
  {
    title: '转化率',
    description: '成交客户数 / 有效商机数，过滤无效线索。',
  },
]
</script>

<style scoped>
.multi-analysis-page {
  padding: 0 24px 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-header p,
.page-header span,
.header-total span,
.dimension-grid em,
.section-title span,
.indicator-list span {
  color: #667085;
}

.page-header p {
  margin: 0 0 8px;
  font-size: 13px;
}

.page-header h2 {
  margin: 0 0 8px;
  color: #1d2129;
  font-size: 22px;
}

.page-header span {
  display: block;
  max-width: 760px;
  line-height: 1.7;
}

.header-total {
  min-width: 128px;
  padding: 12px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  text-align: right;
}

.header-total strong {
  display: block;
  margin-top: 8px;
  color: #0e9f6e;
  font-size: 24px;
}

.dimension-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.dimension-grid article {
  min-height: 112px;
  padding: 16px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
}

.dimension-grid span,
.dimension-grid strong,
.dimension-grid em {
  display: block;
}

.dimension-grid strong {
  margin: 8px 0;
  color: #1d2129;
  font-size: 22px;
}

.dimension-grid em {
  font-style: normal;
  line-height: 1.5;
}

.matrix-section {
  margin-bottom: 16px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-title h3 {
  margin: 0;
  color: #1d2129;
  font-size: 16px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 12px;
  border-bottom: 1px solid #f0f1f3;
  text-align: left;
}

th {
  color: #4e5969;
  font-weight: 600;
  background: #f7f8fa;
}

.multi-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 16px;
}

.panel {
  min-height: 220px;
}

.drilldown-list,
.indicator-list {
  padding: 0;
  margin: 0;
  list-style: none;
}

.drilldown-list {
  counter-reset: drilldown;
}

.drilldown-list li {
  position: relative;
  padding: 10px 12px 10px 40px;
  border-bottom: 1px solid #f0f1f3;
  counter-increment: drilldown;
}

.drilldown-list li::before {
  position: absolute;
  left: 8px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  color: #fff;
  background: #165dff;
  content: counter(drilldown);
  font-size: 12px;
  line-height: 22px;
  text-align: center;
}

.indicator-list {
  display: grid;
  gap: 10px;
}

.indicator-list li {
  padding: 12px;
  border: 1px solid #f0f1f3;
  border-radius: 6px;
}

.indicator-list strong,
.indicator-list span {
  display: block;
}

.indicator-list span {
  margin-top: 6px;
  line-height: 1.6;
}
</style>
