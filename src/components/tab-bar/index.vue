<template>
  <nav
    v-if="matchedTabs.length"
    data-testid="route-tab-bar"
    class="route-tab-bar"
    aria-label="页面标签"
  >
    <router-link
      v-for="tab in matchedTabs"
      :key="tab.path"
      :to="tab.path"
      class="route-tab"
      :class="{ active: tab.active }"
    >
      {{ tab.title }}
    </router-link>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const matchedTabs = computed(() =>
  route.matched
    .filter((record) => record.meta?.locale || record.name)
    .map((record) => ({
      path: record.path || '/',
      title: String(record.meta?.locale || record.name || record.path),
      active: record.path === route.path,
    }))
)
</script>

<style scoped>
.route-tab-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #e5e6eb;
  background: #fff;
}

.route-tab {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  color: #4e5969;
  font-size: 13px;
  text-decoration: none;
}

.route-tab.active {
  border-color: #165dff;
  color: #165dff;
  background: #f2f6ff;
}
</style>
