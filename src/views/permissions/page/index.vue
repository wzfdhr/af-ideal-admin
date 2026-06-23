<template>
  <main class="permission-demo px-6 pb-6" data-testid="front-page-permission">
    <s-navs
      :navs="[
        'menu.permissions',
        'menu.permissions.front',
        'menu.permissions.front.page',
      ]"
    />

    <section class="s-section permission-demo__hero">
      <div>
        <span class="permission-demo__eyebrow">Front route guard</span>
        <h2>页面权限</h2>
        <p>
          使用路由 meta.roles 与 meta.access
          组合校验，把菜单可见性、页面进入权限和默认落点保持一致。
        </p>
      </div>
      <ul class="permission-demo__facts">
        <li>
          <span>当前身份</span>
          <strong>mock-user</strong>
        </li>
        <li>
          <span>角色要求</span>
          <strong>user / admin</strong>
        </li>
        <li>
          <span>权限来源</span>
          <strong>Pinia UserStore</strong>
        </li>
      </ul>
    </section>

    <section class="permission-demo__grid">
      <article
        v-for="card in accessCards"
        :key="card.title"
        class="s-section permission-demo__card"
      >
        <div class="permission-demo__card-head">
          <span :class="['permission-demo__dot', `is-${card.tone}`]"></span>
          <h3>{{ card.title }}</h3>
        </div>
        <p>{{ card.description }}</p>
        <ul>
          <li v-for="item in card.items" :key="item">{{ item }}</li>
        </ul>
      </article>
    </section>

    <section class="s-section permission-demo__flow">
      <div class="permission-demo__section-title">
        <span>Guard flow</span>
        <h3>页面进入链路</h3>
      </div>
      <ol>
        <li v-for="step in guardSteps" :key="step">{{ step }}</li>
      </ol>
    </section>
  </main>
</template>

<script setup lang="ts">
const accessCards = [
  {
    title: '可访问页面',
    tone: 'success',
    description:
      'Mock 用户拥有基础运营权限，可进入工作台、表单、列表和示例实验室。',
    items: [
      'Dashboard / Workplace',
      'Form / Advanced Form',
      'Examples / UI Adapter Lab',
      'Visualization / Analysis',
    ],
  },
  {
    title: '受限页面',
    tone: 'danger',
    description:
      '当路由声明更高角色或权限码时，前端守卫会进入 403 页面或回退默认页。',
    items: [
      'System / Role Management',
      'Audit / Sensitive Logs',
      'Tenant / Enterprise Settings',
      'Plugin / Marketplace Publish',
    ],
  },
]

const guardSteps = [
  '读取 route.meta.roles 与 route.meta.access.permissions',
  '从 UserStore 获取 Mock 角色和权限码',
  '通过 canAccessRoute 校验 matched 父子路由',
  '未命中时进入 403 页面，命中时保留目标路由',
]
</script>

<style lang="scss" scoped>
.permission-demo__hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
}

.permission-demo__eyebrow,
.permission-demo__facts span,
.permission-demo__section-title span {
  color: #667085;
  font-size: 12px;
}

.permission-demo__hero h2,
.permission-demo__section-title h3,
.permission-demo__card h3 {
  margin: 0;
  color: #101828;
}

.permission-demo__hero p,
.permission-demo__card p {
  margin: 8px 0 0;
  color: #475467;
  line-height: 1.7;
}

.permission-demo__facts {
  display: grid;
  min-width: 260px;
  margin: 0;
  padding: 0;
  gap: 10px;
  list-style: none;
}

.permission-demo__facts li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 6px;
  background: #fff;
}

.permission-demo__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.permission-demo__card {
  margin: 0;
}

.permission-demo__card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.permission-demo__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.permission-demo__dot.is-success {
  background: #12b76a;
}

.permission-demo__dot.is-danger {
  background: #f04438;
}

.permission-demo__card ul,
.permission-demo__flow ol {
  margin: 14px 0 0;
  padding-left: 18px;
  color: #344054;
  line-height: 1.8;
}

.permission-demo__section-title {
  display: grid;
  gap: 4px;
}

@media (max-width: 900px) {
  .permission-demo__hero {
    flex-direction: column;
  }

  .permission-demo__facts {
    min-width: 0;
  }

  .permission-demo__grid {
    grid-template-columns: 1fr;
  }
}
</style>
