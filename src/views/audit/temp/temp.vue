<template>
  <main class="px-6 pb-6">
    <s-navs :navs="['menu.about', 'menu.about.temp']" />

    <div class="s-section">
      <div class="text-base mt-4 mb-4">
        <span class="text-blue-400 cursor-pointer text-2xl">
          AF-Ideal-Admin
        </span>
        是一个基于Vue3.0、Vite、Arco-Design-Vue、TypeScript
        的后台解决方案，目标是为中大型项目开发,提供现成的开箱解决方案及丰富的示例,原则上不会限制任何代码用于商用。
      </div>
    </div>
    <div class="s-section">
      <a-descriptions :data="data" title="项目信息" bordered size="large">
        <a-descriptions-item
          v-for="(item, index) in data"
          :key="index"
          :label="item.label"
        >
          <a-tag
            v-if="item.label == '版本' || item.label == '最后编译时间'"
            color="blue"
          >
            {{ item.value }}
          </a-tag>
          <div v-else class="text-blue-300 cursor-pointer">
            {{ item.value }}
          </div>
        </a-descriptions-item>
      </a-descriptions>
    </div>
    <div class="s-section">
      <a-descriptions
        :data="formattedDependencies"
        title="生产环境依赖"
        bordered
        size="large"
      ></a-descriptions>
    </div>
    <div class="s-section">
      <a-descriptions
        :data="formattedDevDependencies"
        title="开发环境依赖"
        bordered
        size="large"
      ></a-descriptions>
    </div>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import pak from '@/../package.json'

const formattedDependencies = Object.entries(pak.dependencies).map(
  ([key, value]) => ({
    label: key,
    value,
  })
)
const formattedDevDependencies = Object.entries(pak.devDependencies).map(
  ([key, value]) => ({
    label: key,
    value,
  })
)
const data = ref([
  {
    label: '版本',
    value: '0.0.0.1',
  },
  {
    label: '最后编译时间',
    value: '2024-06-24 08:34:53',
  },
  {
    label: '文档地址',
    value: '文档地址',
  },
  {
    label: '预览地址',
    value: '预览地址',
  },
  {
    label: 'Github',
    value: 'Github',
  },
])
</script>

<style lang="scss" scoped></style>
