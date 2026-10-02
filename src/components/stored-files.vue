<template>
  <section class="stored-files" data-testid="stored-files">
    <h2>{{ recordId ? '业务附件' : '真实文件' }}</h2>
    <p v-if="error" role="alert">{{ error }}</p>
    <label v-if="editable && can('file:upload')">
      选择真实文件
      <input
        type="file"
        aria-label="选择真实文件"
        :disabled="busy"
        @change="selected"
      />
    </label>
    <p v-if="busy">已上传 {{ completed }} / {{ total }} 字节</p>
    <a-button :disabled="busy" @click="load">刷新文件状态</a-button>
    <p v-if="!files.length && !error">暂无文件</p>
    <ul>
      <li v-for="file in files" :key="file.id">
        <span>
          {{ file.fileName }} · {{ file.size }} 字节 ·
          {{ statusLabel(file.status) }}
        </span>
        <PermissionButton
          v-if="file.status === 'ready'"
          permission="file:download"
          @click="download(file)"
        >
          下载
        </PermissionButton>
        <PermissionButton
          v-if="
            file.status === 'ready' &&
            [
              'text/plain',
              'application/pdf',
              'image/png',
              'image/jpeg',
            ].includes(file.mimeType)
          "
          permission="file:preview"
          @click="preview(file)"
        >
          预览
        </PermissionButton>
        <PermissionButton
          v-if="editable"
          permission="file:delete"
          @click="remove(file)"
        >
          删除
        </PermissionButton>
      </li>
    </ul>
    <dialog ref="viewer" aria-label="文件预览" @close="clearPreview">
      <h3>{{ previewName }}</h3>
      <iframe
        v-if="previewUrl"
        :src="previewUrl"
        title="授权文件预览"
        sandbox=""
      />
      <button type="button" @click="viewer?.close()">关闭预览</button>
    </dialog>
  </section>
</template>
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import {
  listStoredFiles,
  uploadStoredFile,
  storedFileBytes,
  deleteStoredFile,
} from '@/api/stored-files'
import type { StoredFile } from '@/api/stored-files'
import PermissionButton from '@/components/permission-button.vue'
import useUserStore from '@/store/modules/user'
import { registerDirtyCheck } from '@/services/tenant-context'
import { confirmR1Action } from '@/services/r1-confirm'
import { hasPermission } from '@af-admin/workflow-core'

const props = withDefaults(
  defineProps<{ recordId?: string; editable?: boolean }>(),
  { recordId: undefined, editable: true }
)
const user = useUserStore()
const files = ref<StoredFile[]>([])
const error = ref('')
const busy = ref(false)
const completed = ref(0)
const total = ref(0)
const viewer = ref<HTMLDialogElement>()
const previewUrl = ref('')
const previewName = ref('')
const can = (code: string) => hasPermission(user.permissions, code)
const unregister = registerDirtyCheck(() => busy.value)
const clearPreview = () => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}
onUnmounted(() => {
  unregister()
  clearPreview()
})
const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : '文件操作失败'
const fileStatusLabels: Record<string, string> = {
  'scanning': '等待扫描',
  'processing': '正在扫描',
  'ready': '扫描通过',
  'infected': '检测到威胁',
  'scan-failed': '扫描失败，文件已隔离',
}
const statusLabel = (status: string) => fileStatusLabels[status] || status
const load = async () => {
  if (!can('file:list')) return
  try {
    files.value = (await listStoredFiles(props.recordId)).list
    error.value = ''
  } catch (failure) {
    error.value = message(failure)
  }
}
const selected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  busy.value = true
  completed.value = 0
  total.value = file.size
  try {
    await uploadStoredFile(file, props.recordId, (count) => {
      completed.value = count
    })
    await load()
  } catch (failure) {
    error.value = message(failure)
  } finally {
    busy.value = false
    input.value = ''
  }
}
const download = async (file: StoredFile) => {
  try {
    const blob = await storedFileBytes(file)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.fileName
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (failure) {
    error.value = message(failure)
  }
}
const preview = async (file: StoredFile) => {
  try {
    clearPreview()
    previewUrl.value = URL.createObjectURL(await storedFileBytes(file, true))
    previewName.value = file.fileName
    viewer.value?.showModal()
  } catch (failure) {
    error.value = message(failure)
  }
}
const remove = async (file: StoredFile) => {
  if (!(await confirmR1Action('确认删除此文件？'))) return
  try {
    await deleteStoredFile(file)
    await load()
  } catch (failure) {
    error.value = message(failure)
  }
}
watch(
  () => props.recordId,
  () => {
    clearPreview()
    load()
  }
)
onMounted(load)
</script>
<style scoped>
.stored-files {
  margin: 20px 0;
  padding: 20px;
  border: 1px solid var(--color-border-2);
  color: var(--color-text-1);
}
h2 {
  font-size: 20px;
  margin-bottom: 16px;
}
li {
  margin: 12px 0;
}
dialog {
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-2);
  color: var(--color-text-1);
  width: min(900px, 90vw);
}
iframe {
  display: block;
  width: 100%;
  height: 60vh;
  margin: 16px 0;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
