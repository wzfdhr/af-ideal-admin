<template>
  <PersistentRuntime v-if="pageId" :key="pageId" :page-id="pageId" />
  <main v-else class="runtime-pages" data-testid="persistent-runtime-pages">
    <h1>业务页面</h1>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!loading && !pages.length && !error">
      当前没有可运行的已发布页面。
    </p>
    <a-button @click="load">刷新页面列表</a-button>
    <ul>
      <li v-for="page in pages" :key="page.id">
        <router-link :to="`/low-code/pages/${encodeURIComponent(page.id)}/run`">
          {{ page.title }} · v{{ page.releaseVersion }}
        </router-link>
      </li>
    </ul>
  </main>
</template>
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store'
import PersistentRuntime from '@/components/low-code/runtime-persistent.vue'
import { listRuntimePages } from '@/api/low-code-runtime'
import { errorMessage } from '@/views/leave/shared'

const route = useRoute()
const user = useUserStore()
const pages = ref<{ id: string; title: string; releaseVersion: number }[]>([])
const error = ref('')
const loading = ref(false)
const pageId = computed(() =>
  typeof route.params.id === 'string' ? route.params.id : ''
)
let ticket = 0
const load = async () => {
  const current = ++ticket
  loading.value = true
  error.value = ''
  pages.value = []
  try {
    const result = await listRuntimePages()
    if (current === ticket) pages.value = result.list
  } catch (failure) {
    if (current === ticket) error.value = errorMessage(failure)
  } finally {
    if (current === ticket) loading.value = false
  }
}
watch(
  () => [user.id, user.tenantId, pageId.value],
  () => {
    ticket += 1
    if (!pageId.value) load()
  }
)
onMounted(() => {
  if (!pageId.value) load()
})
onUnmounted(() => {
  ticket += 1
})
</script>
<style scoped>
.runtime-pages {
  padding: 24px;
}
li {
  margin: 16px 0;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
