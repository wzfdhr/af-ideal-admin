<template>
  <section
    v-if="sets.length || error"
    class="package-pages"
    data-testid="package-pages-binding"
  >
    <h2>导入页面的来源重绑</h2>
    <p>
      先发布目标业务，再创建本租户页面来源。重绑只生成页面草稿，需要检查并单独发布。
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <article v-for="set in sets" :key="set.id" :data-page-set="set.id">
      <h3>{{ set.names.join('、') }}</h3>
      <p>
        {{
          set.status === 'pending'
            ? '等待目标业务发布和来源重绑'
            : '目标页面草稿已生成'
        }}
      </p>
      <a-button
        v-if="set.status === 'pending'"
        :disabled="busy || !activeReleaseId"
        data-testid="package-pages-bind"
        @click="bind(set)"
      >
        按当前业务发布版重绑页面
      </a-button>
      <p v-if="set.status === 'pending' && !activeReleaseId">
        请先发布目标业务。
      </p>
      <ul v-if="set.status === 'bound'">
        <li v-for="(id, key) in pageReferences(set)" :key="key">
          <router-link
            :to="{ path: '/Scalability/lowCodeBuilder', query: { pageId: id } }"
          >
            打开目标页面配置并发布
          </router-link>
        </li>
      </ul>
    </article>
    <a-button :disabled="busy" @click="load">刷新重绑状态</a-button>
  </section>
</template>
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '@/store'
import {
  applicationPackagePages,
  bindApplicationPackagePages,
} from '@/api/application-packages'
import type { PackagePageSet } from '@/api/application-packages'
import { createCommandRetry } from '@/services/command-retry'
import { confirmR1Action } from '@/services/r1-confirm'
import { errorMessage } from '@/views/leave/shared'

const props = defineProps<{
  applicationId: string
  activeReleaseId: string | null
}>()
const user = useUserStore()
const sets = ref<PackagePageSet[]>([])
const error = ref('')
const message = ref('')
const busy = ref(false)
const retry = createCommandRetry()
let ticket = 0
const pageReferences = (set: PackagePageSet) =>
  Object.fromEntries(
    Object.entries(set.referenceMap).filter(([key]) => /^page-\d+$/.test(key))
  )
const load = async () => {
  const seq = ++ticket
  error.value = ''
  sets.value = []
  try {
    const result = await applicationPackagePages(props.applicationId)
    if (seq === ticket) sets.value = result
  } catch (failure) {
    if (seq === ticket) error.value = errorMessage(failure)
  }
}
const bind = async (set: PackagePageSet) => {
  if (!props.activeReleaseId || busy.value) return
  if (
    !(await confirmR1Action(
      '确认按目标业务当前发布版生成页面来源及草稿？原模板和业务历史保持不变。'
    ))
  )
    return
  const seq = ticket
  const releaseId = props.activeReleaseId
  const body = {
    expectedRevision: set.revision,
    applicationReleaseId: releaseId,
  }
  busy.value = true
  error.value = ''
  try {
    await bindApplicationPackagePages(set, releaseId, retry.key(set.id, body))
    if (seq !== ticket) return
    retry.complete(set.id)
    message.value = '目标页面草稿已生成，请复核并发布'
    await load()
  } catch (failure) {
    if (seq === ticket) error.value = errorMessage(failure)
  } finally {
    busy.value = false
  }
}
watch(
  () => [props.applicationId, props.activeReleaseId, user.id, user.tenantId],
  () => {
    ticket += 1
    sets.value = []
    message.value = ''
    error.value = ''
    retry.clear()
    load()
  }
)
onMounted(load)
onUnmounted(() => {
  ticket += 1
  retry.clear()
})
</script>
<style scoped>
.package-pages {
  padding: 20px;
  margin: 20px 0;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
}
article {
  margin: 16px 0;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
