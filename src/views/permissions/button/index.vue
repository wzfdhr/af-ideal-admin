<template>
  <main
    class="button-permission px-6 pb-6"
    data-testid="front-button-permission"
  >
    <s-navs
      :navs="[
        'menu.permissions',
        'menu.permissions.front',
        'menu.permissions.front.button',
      ]"
    />

    <section class="s-section button-permission__hero">
      <div>
        <span class="button-permission__eyebrow">Action permission</span>
        <h2>按钮权限</h2>
        <p>
          统一展示 v-allow 指令、PermissionButton
          组件和禁用态策略，覆盖隐藏、禁用、提示和审计入口。
        </p>
      </div>
      <div class="button-permission__code">
        <code>v-allow="'system:user:create'"</code>
        <code>&lt;PermissionButton permission="system:user:update" /&gt;</code>
      </div>
    </section>

    <section class="button-permission__grid">
      <article
        v-for="action in actionMatrix"
        :key="action.permission"
        class="s-section button-permission__card"
      >
        <div class="button-permission__card-head">
          <h3>{{ action.name }}</h3>
          <span :class="['button-permission__tag', `is-${action.state}`]">
            {{ action.status }}
          </span>
        </div>
        <p>{{ action.permission }}</p>
        <button
          type="button"
          class="button-permission__sample"
          :disabled="action.state === 'disabled'"
        >
          {{ action.name }}
        </button>
        <small>{{ action.description }}</small>
      </article>
    </section>

    <section class="s-section button-permission__rules">
      <div>
        <span class="button-permission__eyebrow">Fallback rules</span>
        <h3>禁用态与隐藏态</h3>
      </div>
      <ul>
        <li v-for="rule in fallbackRules" :key="rule">{{ rule }}</li>
      </ul>
    </section>
  </main>
</template>

<script setup lang="ts">
const actionMatrix = [
  {
    name: '新增用户',
    permission: 'system:user:create',
    status: '可见',
    state: 'allowed',
    description: '用户拥有创建权限，按钮正常展示。',
  },
  {
    name: '批量导出',
    permission: 'system:user:export',
    status: '禁用态',
    state: 'disabled',
    description: '角色缺少导出权限，保留按钮位置并提示原因。',
  },
  {
    name: '删除角色',
    permission: 'system:role:delete',
    status: '隐藏',
    state: 'hidden',
    description: '高风险操作默认隐藏，只在审计角色下开放。',
  },
]

const fallbackRules = [
  '列表行操作优先使用 PermissionButton，减少重复判断。',
  '批量操作保留禁用态，避免工具栏因为权限变化产生跳动。',
  '危险操作缺少权限时隐藏，并将拒绝原因写入 Mock 审计记录。',
]
</script>

<style lang="scss" scoped>
.button-permission__hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
}

.button-permission__hero h2,
.button-permission__rules h3,
.button-permission__card h3 {
  margin: 0;
  color: #101828;
}

.button-permission__hero p,
.button-permission__card p,
.button-permission__card small,
.button-permission__rules li {
  color: #475467;
  line-height: 1.7;
}

.button-permission__eyebrow {
  color: #667085;
  font-size: 12px;
}

.button-permission__code {
  display: grid;
  min-width: 360px;
  gap: 8px;
}

.button-permission__code code {
  padding: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 6px;
  color: #344054;
  background: #f9fafb;
}

.button-permission__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.button-permission__card {
  margin: 0;
}

.button-permission__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.button-permission__tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}

.button-permission__tag.is-allowed {
  color: #027a48;
  background: #ecfdf3;
}

.button-permission__tag.is-disabled {
  color: #b54708;
  background: #fffaeb;
}

.button-permission__tag.is-hidden {
  color: #b42318;
  background: #fef3f2;
}

.button-permission__sample {
  width: 100%;
  height: 34px;
  margin: 12px 0 8px;
  border: 1px solid #1570ef;
  border-radius: 4px;
  color: #fff;
  background: #1570ef;
}

.button-permission__sample:disabled {
  border-color: #d0d5dd;
  color: #667085;
  background: #f2f4f7;
}

.button-permission__rules {
  display: flex;
  justify-content: space-between;
  gap: 24px;
}

.button-permission__rules ul {
  max-width: 640px;
  margin: 0;
  padding-left: 18px;
}

@media (max-width: 900px) {
  .button-permission__hero,
  .button-permission__rules {
    flex-direction: column;
  }

  .button-permission__code {
    min-width: 0;
  }

  .button-permission__grid {
    grid-template-columns: 1fr;
  }
}
</style>
