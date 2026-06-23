<template>
  <main
    class="backend-button-permission px-6 pb-6"
    data-testid="backend-button-permission"
  >
    <s-navs
      :navs="[
        'menu.permissions',
        'menu.permissions.backend',
        'menu.permissions.backend.button',
      ]"
    />

    <section class="s-section backend-button-permission__hero">
      <div>
        <span>Backend action resource</span>
        <h2>后端按钮权限</h2>
        <p>
          后端下发按钮资源码
          permissionCode，前端按资源码渲染按钮并保留拒绝态审计记录。
        </p>
      </div>
      <ul>
        <li>资源码统一命名：module:resource:action</li>
        <li>接口返回权限集，页面只做展示和交互兜底</li>
        <li>拒绝操作进入 Mock 审计记录，便于权限回归验证</li>
      </ul>
    </section>

    <section class="s-section backend-button-permission__table">
      <table>
        <thead>
          <tr>
            <th>按钮</th>
            <th>permissionCode</th>
            <th>资源码</th>
            <th>状态</th>
            <th>审计记录</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in actionResources" :key="item.permissionCode">
            <td>{{ item.name }}</td>
            <td>
              <code>{{ item.permissionCode }}</code>
            </td>
            <td>{{ item.resource }}</td>
            <td>
              <span :class="['backend-button-permission__tag', item.state]">
                {{ item.status }}
              </span>
            </td>
            <td>{{ item.audit }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<script setup lang="ts">
const actionResources = [
  {
    name: '新增租户',
    permissionCode: 'tenant:center:create',
    resource: 'tenant.center',
    status: '允许',
    state: 'allowed',
    audit: '记录操作者与租户编号',
  },
  {
    name: '冻结插件',
    permissionCode: 'plugin:center:disable',
    resource: 'plugin.center',
    status: '拒绝',
    state: 'denied',
    audit: '记录拒绝原因和 traceId',
  },
  {
    name: '导出审计日志',
    permissionCode: 'audit:logs:export',
    resource: 'audit.logs',
    status: '审批中',
    state: 'review',
    audit: '记录审批单和导出范围',
  },
]
</script>

<style lang="scss" scoped>
.backend-button-permission__hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
}

.backend-button-permission__hero span {
  color: #667085;
  font-size: 12px;
}

.backend-button-permission__hero h2 {
  margin: 0;
  color: #101828;
}

.backend-button-permission__hero p,
.backend-button-permission__hero li,
.backend-button-permission__table td {
  color: #475467;
  line-height: 1.7;
}

.backend-button-permission__hero ul {
  min-width: 360px;
  margin: 0;
  padding-left: 18px;
}

.backend-button-permission__table {
  overflow-x: auto;
}

.backend-button-permission__table table {
  width: 100%;
  border-collapse: collapse;
}

.backend-button-permission__table th,
.backend-button-permission__table td {
  padding: 12px;
  border-bottom: 1px solid #eaecf0;
  text-align: left;
}

.backend-button-permission__table th {
  color: #667085;
  font-weight: 500;
  background: #f9fafb;
}

.backend-button-permission__tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}

.backend-button-permission__tag.allowed {
  color: #027a48;
  background: #ecfdf3;
}

.backend-button-permission__tag.denied {
  color: #b42318;
  background: #fef3f2;
}

.backend-button-permission__tag.review {
  color: #175cd3;
  background: #eff8ff;
}

@media (max-width: 900px) {
  .backend-button-permission__hero {
    flex-direction: column;
  }

  .backend-button-permission__hero ul {
    min-width: 0;
  }
}
</style>
