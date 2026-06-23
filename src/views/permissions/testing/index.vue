<template>
  <main
    class="permission-testing px-6 pb-6"
    data-testid="permission-testing-page"
  >
    <s-navs
      :navs="[
        'menu.permissions',
        'menu.permissions.front',
        'menu.permissions.front.testing',
      ]"
    />

    <section class="s-section permission-testing__hero">
      <div>
        <span>Mock permission lab</span>
        <h2>权限测试矩阵</h2>
        <p>
          使用固定 Mock
          身份模拟路由、菜单、按钮和数据范围的组合结果，便于验收权限链路。
        </p>
      </div>
      <div class="permission-testing__summary">
        <strong>4</strong>
        <span>角色样本</span>
      </div>
    </section>

    <section class="s-section permission-testing__table">
      <table>
        <thead>
          <tr>
            <th>角色</th>
            <th>页面</th>
            <th>按钮</th>
            <th>数据范围</th>
            <th>预期结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in testMatrix" :key="row.role">
            <td>
              <strong>{{ row.role }}</strong>
            </td>
            <td>{{ row.page }}</td>
            <td>{{ row.button }}</td>
            <td>{{ row.scope }}</td>
            <td>
              <span :class="['permission-testing__state', `is-${row.state}`]">
                {{ row.result }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="permission-testing__grid">
      <article
        v-for="caseItem in regressionCases"
        :key="caseItem.title"
        class="s-section permission-testing__case"
      >
        <span>{{ caseItem.code }}</span>
        <h3>{{ caseItem.title }}</h3>
        <p>{{ caseItem.description }}</p>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
const testMatrix = [
  {
    role: 'admin',
    page: '全部可见',
    button: '增删改查',
    scope: '全部组织',
    result: '通过',
    state: 'pass',
  },
  {
    role: 'user',
    page: '业务页面',
    button: '新增 / 编辑',
    scope: '本人及下级',
    result: '通过',
    state: 'pass',
  },
  {
    role: 'auditor',
    page: '审计中心',
    button: '查看 / 导出',
    scope: '审计授权组织',
    result: '通过',
    state: 'pass',
  },
  {
    role: 'guest',
    page: '只读首页',
    button: '无',
    scope: '公开样本',
    result: '拒绝高危操作',
    state: 'blocked',
  },
]

const regressionCases = [
  {
    code: 'R-01',
    title: '父子路由同时校验',
    description: 'matched 路由链路必须全部满足 meta.access 才允许进入。',
  },
  {
    code: 'R-02',
    title: '菜单与路由一致',
    description: '服务端菜单返回的 componentKey 与前端路由白名单保持一致。',
  },
  {
    code: 'R-03',
    title: '按钮与审计联动',
    description: '缺少 permissionCode 的操作会进入拒绝态并生成 Mock 审计样本。',
  },
]
</script>

<style lang="scss" scoped>
.permission-testing__hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
}

.permission-testing__hero span,
.permission-testing__case span {
  color: #667085;
  font-size: 12px;
}

.permission-testing__hero h2,
.permission-testing__case h3 {
  margin: 0;
  color: #101828;
}

.permission-testing__hero p,
.permission-testing__case p {
  color: #475467;
  line-height: 1.7;
}

.permission-testing__summary {
  display: grid;
  width: 120px;
  height: 84px;
  place-items: center;
  border: 1px solid #eaecf0;
  border-radius: 6px;
  background: #fff;
}

.permission-testing__summary strong {
  color: #1570ef;
  font-size: 28px;
}

.permission-testing__table table {
  width: 100%;
  border-collapse: collapse;
}

.permission-testing__table {
  overflow-x: auto;
}

.permission-testing__table th,
.permission-testing__table td {
  padding: 12px;
  border-bottom: 1px solid #eaecf0;
  text-align: left;
}

.permission-testing__table th {
  color: #667085;
  font-weight: 500;
  background: #f9fafb;
}

.permission-testing__state {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}

.permission-testing__state.is-pass {
  color: #027a48;
  background: #ecfdf3;
}

.permission-testing__state.is-blocked {
  color: #b42318;
  background: #fef3f2;
}

.permission-testing__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.permission-testing__case {
  margin: 0;
}

@media (max-width: 900px) {
  .permission-testing__hero {
    flex-direction: column;
  }

  .permission-testing__grid {
    grid-template-columns: 1fr;
  }
}
</style>
