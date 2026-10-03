<template>
  <a-modal
    :visible="visible"
    title="导出应用与页面定义"
    data-testid="page-package-export"
    :footer="false"
    @cancel="close"
  >
    <p v-if="error" role="alert">{{ error }}</p>
    <p>
      导出当前业务发布版及选择的页面配置。业务记录、凭据和查询数据不会进入包。
    </p>
    <p v-if="loading">正在读取可导出页面…</p>
    <label v-for="page in pages" :key="page.id" class="page-choice">
      <input
        v-model="selected"
        type="checkbox"
        :value="page.id"
        :aria-label="`导出页面 ${page.name}`"
      />
      {{ page.name }}
    </label>
    <p v-if="!loading && !pages.length">
      当前没有可关联的已发布页面，保留原表单/流程包。
    </p>
    <a-button
      :disabled="busy || loading"
      data-testid="page-package-download"
      @click="download"
    >
      下载定义包
    </a-button>
    <a-button :disabled="busy" @click="close">取消</a-button>
  </a-modal>
</template>
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { useUserStore } from '@/store'
import {
  packageExportPages,
  exportApplicationPackage,
} from '@/api/application-packages'
import { errorMessage } from '@/views/leave/shared'
import { hasPermission } from '@af-admin/workflow-core'
import type { ManagedApplication } from '@af-admin/contracts'

const props = defineProps<{ app?: ManagedApplication; visible: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()
const user = useUserStore()
const pages = ref<{ id: string; name: string; revision: number }[]>([])
const selected = ref<string[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')
let ticket = 0
const close = () => {
  if (!busy.value) emit('close')
}
const load = async () => {
  const seq = ++ticket
  pages.value = []
  selected.value = []
  error.value = ''
  loading.value = true
  try {
    if (props.app && hasPermission(user.permissions, 'low-code:page:list')) {
      const result = await packageExportPages(props.app.id)
      if (seq === ticket) {
        pages.value = result
        selected.value = result.map((page) => page.id)
      }
    }
  } catch (failure) {
    if (seq === ticket) error.value = errorMessage(failure)
  } finally {
    if (seq === ticket) loading.value = false
  }
}
const download = async () => {
  if (!props.app || busy.value) return
  const seq = ticket
  busy.value = true
  error.value = ''
  try {
    const pkg = await exportApplicationPackage(props.app, selected.value)
    if (seq !== ticket) return
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `${props.app.code}.af-application.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    emit('close')
  } catch (failure) {
    if (seq === ticket) error.value = errorMessage(failure)
  } finally {
    busy.value = false
  }
}
watch(
  () => [props.visible, props.app?.id, user.id, user.tenantId],
  () => {
    ticket += 1
    if (props.visible) load()
  }
)
onUnmounted(() => {
  ticket += 1
})
</script>
<style scoped>
.page-choice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0;
}
button {
  margin-right: 12px;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
