<template>
  <main
    class="backend-page-permission px-6 pb-6"
    data-testid="backend-page-permission"
  >
    <s-navs
      :navs="[
        'menu.permissions',
        'menu.permissions.backend',
        'menu.permissions.backend.page',
      ]"
    />

    <section class="s-section backend-page-permission__hero">
      <div>
        <span>Server driven menu</span>
        <h2>后端页面权限</h2>
        <p>
          服务端菜单负责声明页面资源，前端只接收 componentKey
          并映射到路由白名单，避免任意路径注入。
        </p>
      </div>
      <dl>
        <dt>菜单来源</dt>
        <dd>Mock server menu</dd>
        <dt>路由白名单</dt>
        <dd>asyncRoutes registry</dd>
        <dt>权限字段</dt>
        <dd>meta.access.permissions</dd>
      </dl>
    </section>

    <section class="backend-page-permission__grid">
      <article
        v-for="item in serverMenus"
        :key="item.componentKey"
        class="s-section backend-page-permission__card"
      >
        <div class="backend-page-permission__card-head">
          <h3>{{ item.title }}</h3>
          <span>{{ item.status }}</span>
        </div>
        <p>
          <strong>componentKey：</strong>
          <code>{{ item.componentKey }}</code>
        </p>
        <p>
          <strong>permission：</strong>
          <code>{{ item.permission }}</code>
        </p>
      </article>
    </section>

    <section class="s-section backend-page-permission__flow">
      <h3>服务端菜单落地流程</h3>
      <ol>
        <li v-for="step in serverFlow" :key="step">{{ step }}</li>
      </ol>
    </section>
  </main>
</template>

<script setup lang="ts">
const serverMenus = [
  {
    title: '租户中心',
    componentKey: 'tenant.center',
    permission: 'tenant:center:view',
    status: '已注册',
  },
  {
    title: '审计日志',
    componentKey: 'audit.logs',
    permission: 'audit:logs:view',
    status: '已注册',
  },
  {
    title: '插件管理',
    componentKey: 'plugin.center',
    permission: 'plugin:center:view',
    status: '已注册',
  },
]

const serverFlow = [
  'Mock 接口返回菜单树、componentKey、permissionCode 和排序信息。',
  '前端只从路由白名单匹配 componentKey，不执行服务端传入的任意路径。',
  '匹配成功后合并 meta.access，菜单、面包屑和路由守卫使用同一权限结果。',
]
</script>

<style lang="scss" scoped>
.backend-page-permission__hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
}

.backend-page-permission__hero span,
.backend-page-permission__hero dt {
  color: #667085;
  font-size: 12px;
}

.backend-page-permission__hero h2,
.backend-page-permission__card h3,
.backend-page-permission__flow h3 {
  margin: 0;
  color: #101828;
}

.backend-page-permission__hero p,
.backend-page-permission__card p,
.backend-page-permission__flow li {
  color: #475467;
  line-height: 1.7;
}

.backend-page-permission__hero dl {
  display: grid;
  grid-template-columns: 88px minmax(160px, 1fr);
  gap: 8px 12px;
  margin: 0;
  padding: 14px;
  border: 1px solid #eaecf0;
  border-radius: 6px;
  background: #fff;
}

.backend-page-permission__hero dd {
  margin: 0;
  color: #344054;
}

.backend-page-permission__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.backend-page-permission__card {
  margin: 0;
}

.backend-page-permission__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.backend-page-permission__card-head span {
  padding: 2px 8px;
  border-radius: 999px;
  color: #027a48;
  font-size: 12px;
  background: #ecfdf3;
}

.backend-page-permission__card code {
  color: #344054;
}

.backend-page-permission__flow ol {
  margin: 12px 0 0;
  padding-left: 18px;
}

@media (max-width: 900px) {
  .backend-page-permission__hero {
    flex-direction: column;
  }

  .backend-page-permission__grid {
    grid-template-columns: 1fr;
  }
}
</style>
