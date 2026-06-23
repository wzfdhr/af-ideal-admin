<template>
  <main class="system-info px-6 pb-6" data-testid="system-info-page">
    <s-navs :navs="['menu.about', 'menu.about.temp']" />

    <section class="s-section system-info__hero">
      <div>
        <span class="system-info__eyebrow">Enterprise admin framework</span>
        <h2>AF-Ideal-Admin</h2>
        <p>
          面向企业级中后台的 Mock-first
          交付框架，覆盖权限、表单、流程、低代码、数据可视化和质量门禁。
        </p>
      </div>
      <dl class="system-info__facts">
        <template v-for="item in productFacts" :key="item.label">
          <dt>{{ item.label }}</dt>
          <dd>
            <strong v-if="item.emphasis">{{ item.value }}</strong>
            <span v-else>{{ item.value }}</span>
          </dd>
        </template>
      </dl>
    </section>

    <section class="system-info__grid">
      <article
        v-for="item in deliveryChecks"
        :key="item.name"
        class="s-section system-info__card"
      >
        <span>{{ item.type }}</span>
        <h3>{{ item.name }}</h3>
        <p>{{ item.description }}</p>
      </article>
    </section>

    <section class="s-section system-info__docs">
      <div class="system-info__section-title">
        <span>Product documents</span>
        <h3>交付文档入口</h3>
      </div>
      <div class="system-info__doc-grid">
        <a
          v-for="doc in docLinks"
          :key="doc.path"
          class="system-info__doc"
          :href="doc.href"
          target="_blank"
          rel="noreferrer"
        >
          <span>{{ doc.title }}</span>
          <code>{{ doc.path }}</code>
        </a>
      </div>
    </section>

    <section class="s-section system-info__deps">
      <div class="system-info__section-title">
        <span>Dependency inventory</span>
        <h3>依赖概览</h3>
      </div>
      <div class="system-info__dep-summary">
        <div v-for="item in dependencySummary" :key="item.label">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </div>
      <div class="system-info__dep-columns">
        <div>
          <h4>生产环境依赖</h4>
          <ul>
            <li
              v-for="item in formattedDependencies.slice(0, 12)"
              :key="item.label"
            >
              <span>{{ item.label }}</span>
              <code>{{ item.value }}</code>
            </li>
          </ul>
        </div>
        <div>
          <h4>开发环境依赖</h4>
          <ul>
            <li
              v-for="item in formattedDevDependencies.slice(0, 12)"
              :key="item.label"
            >
              <span>{{ item.label }}</span>
              <code>{{ item.value }}</code>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import pkg from '@/../package.json'

type DependencyMap = Record<string, string>

const packageVersion = pkg.version

const toDependencyItems = (dependencies: DependencyMap = {}) =>
  Object.entries(dependencies)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, value]) => ({
      label,
      value,
    }))

const formattedDependencies = toDependencyItems(pkg.dependencies)
const formattedDevDependencies = toDependencyItems(pkg.devDependencies)

const productFacts = [
  {
    label: '当前版本',
    value: packageVersion,
    emphasis: true,
  },
  {
    label: '产品阶段',
    value: 'M5：产品化与可销售交付阶段',
    emphasis: true,
  },
  {
    label: '数据模式',
    value: 'Mock-first',
  },
  {
    label: '技术栈',
    value: 'Vue 3 / Vite / TypeScript / Arco Design Vue',
  },
]

const deliveryChecks = [
  {
    type: 'Quality gate',
    name: 'Lint / Typecheck / Test / Build',
    description: '每个阶段提交前执行完整质量门禁，降低企业级交付回归风险。',
  },
  {
    type: 'Permission',
    name: 'RBAC / ABAC / Data Scope',
    description: '页面、按钮、接口和数据范围均保留 Mock 验证路径。',
  },
  {
    type: 'Extensibility',
    name: 'Form / Workflow / Low-code / Dashboard',
    description: '扩展能力以产品模块方式沉淀，支持后续专业版和企业版拆分。',
  },
]

const docLinks = [
  {
    title: '产品说明',
    path: 'docs/product/index.md',
    href: '/docs/product/index.md',
  },
  {
    title: '开发中心',
    path: 'docs/development/index.md',
    href: '/docs/development/index.md',
  },
  {
    title: '部署说明',
    path: 'docs/deployment.md',
    href: '/docs/deployment.md',
  },
  {
    title: '企业级任务清单',
    path: 'docs/quality/enterprise-admin-task-checklist.md',
    href: '/docs/quality/enterprise-admin-task-checklist.md',
  },
]

const dependencySummary = [
  {
    label: '生产依赖',
    value: formattedDependencies.length,
  },
  {
    label: '开发依赖',
    value: formattedDevDependencies.length,
  },
  {
    label: '核心运行时',
    value: 'Vue / Pinia / Vue Router / Axios',
  },
]
</script>

<style lang="scss" scoped>
.system-info__hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
}

.system-info__eyebrow,
.system-info__section-title span,
.system-info__card span,
.system-info__facts dt,
.system-info__dep-summary span {
  color: #667085;
  font-size: 12px;
}

.system-info__hero h2,
.system-info__section-title h3,
.system-info__card h3,
.system-info__deps h4 {
  margin: 0;
  color: #101828;
}

.system-info__hero p,
.system-info__card p,
.system-info__facts dd,
.system-info__doc,
.system-info__deps li {
  color: #475467;
  line-height: 1.7;
}

.system-info__facts {
  display: grid;
  grid-template-columns: 96px minmax(180px, 1fr);
  min-width: 360px;
  margin: 0;
  padding: 14px;
  gap: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 6px;
  background: #fff;
}

.system-info__facts dd {
  margin: 0;
}

.system-info__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.system-info__card {
  margin: 0;
}

.system-info__section-title {
  display: grid;
  gap: 4px;
  margin-bottom: 16px;
}

.system-info__doc-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.system-info__doc {
  display: grid;
  min-height: 84px;
  padding: 12px;
  border: 1px solid #eaecf0;
  border-radius: 6px;
  text-decoration: none;
  background: #fff;
}

.system-info__doc code {
  align-self: end;
  color: #175cd3;
  font-size: 12px;
}

.system-info__dep-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.system-info__dep-summary div {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid #eaecf0;
  border-radius: 6px;
  background: #f9fafb;
}

.system-info__dep-summary strong {
  color: #101828;
}

.system-info__dep-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.system-info__dep-columns ul {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.system-info__deps li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #eaecf0;
}

.system-info__deps code {
  color: #344054;
}

@media (max-width: 1100px) {
  .system-info__doc-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .system-info__hero {
    flex-direction: column;
  }

  .system-info__facts {
    min-width: 0;
  }

  .system-info__grid,
  .system-info__dep-summary,
  .system-info__dep-columns {
    grid-template-columns: 1fr;
  }

  .system-info__doc-grid {
    grid-template-columns: 1fr;
  }
}
</style>
