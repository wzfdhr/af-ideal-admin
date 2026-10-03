<template>
  <section data-testid="application-package-import">
    <PermissionButton permission="application:import" @click="visible = true">
      导入应用包
    </PermissionButton>
    <a-modal
      v-model:visible="visible"
      title="校验并导入应用定义包"
      data-testid="package-import-editor"
      @before-ok="save"
    >
      <p v-if="error" role="alert">{{ error }}</p>
      <label>
        选择应用定义包
        <input
          type="file"
          accept=".json,application/json"
          aria-label="选择应用定义包"
          @change="choose"
        />
      </label>
      <template v-if="pkg">
        <p>
          格式v{{ pkg.version }} · {{ pkg.application.name }} ·
          {{ pkg.people.length }}个人员待绑定槽位 ·
          {{ pkg.sources?.length || 0 }}个数据源槽位
        </p>
        <p v-if="pkg.redactions.length">
          原默认值已按清单移除，导入后请复核表单配置。
        </p>
        <label>
          目标应用名称
          <input v-model="name" aria-label="目标应用名称" maxlength="100" />
        </label>
        <label>
          目标应用标识
          <input v-model="code" aria-label="目标应用标识" maxlength="64" />
        </label>
        <label v-for="slot in pkg.people" :key="slot.key">
          {{ slot.kind === 'approver' ? '审批处理人' : '抄送收件人' }}
          {{ slot.key }}
          <select v-model="bindings[slot.key]" :aria-label="`绑定 ${slot.key}`">
            <option value="">请选择本租户成员</option>
            <option
              v-for="person in people.filter(
                (item) => slot.kind !== 'approver' || item.canApprove
              )"
              :key="person.id"
              :value="person.id"
            >
              {{ person.name }}
            </option>
          </select>
        </label>
        <label v-for="slot in pkg.sources || []" :key="slot.key">
          数据源 {{ slot.name }}
          <select
            v-model="sourceBindings[slot.key]"
            :aria-label="`绑定数据源 ${slot.key}`"
          >
            <option value="">请选择本租户已登记数据源</option>
            <option
              v-for="source in sources.filter(
                (item) => item.kind === slot.kind
              )"
              :key="source.id"
              :value="source.id"
            >
              {{ source.name }} · {{ source.code }}
            </option>
          </select>
        </label>
        <p v-if="pkg.version >= 2">
          源选项数据不随包导入；发布时读取目标数据源并生成独立快照。
        </p>
        <p v-if="pkg.version === 3">
          包含{{
            pkg.pages?.length || 0
          }}个页面，导入后等待目标业务发布，再在配置页完成来源重绑和页面发布。
        </p>
        <p>导入只创建独立草稿，需要检查并单独发布后才能运行。</p>
      </template>
    </a-modal>
  </section>
</template>
<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import {
  packageBindingPeople,
  packageBindingSources,
  importApplicationPackage,
} from '@/api/application-packages'
import PermissionButton from '@/components/permission-button.vue'
import { createCommandRetry } from '@/services/command-retry'
import { registerDirtyCheck } from '@/services/tenant-context'
import { parseApplicationPackage } from '@af-admin/contracts'
import type { ApplicationPackage } from '@af-admin/contracts'

const emit = defineEmits<{ (event: 'imported'): void }>()
const visible = ref(false)
const error = ref('')
const pkg = ref<ApplicationPackage>()
const name = ref('')
const code = ref('')
const bindings = ref<Record<string, string>>({})
const sourceBindings = ref<Record<string, string>>({})
const sources = ref<Awaited<ReturnType<typeof packageBindingSources>>>([])
const people = ref<{ id: string; name: string; canApprove: boolean }[]>([])
const retry = createCommandRetry()
const unregister = registerDirtyCheck(() => visible.value)
onUnmounted(() => {
  unregister()
  retry.clear()
})
const choose = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  pkg.value = undefined
  error.value = ''
  retry.clear()
  try {
    if (file.size > 262144) throw new Error('应用定义包不能超过256KiB')
    pkg.value = parseApplicationPackage(JSON.parse(await file.text()))
    name.value = pkg.value.application.name
    code.value = ''
    bindings.value = Object.fromEntries(
      pkg.value.people.map((slot) => [slot.key, ''])
    )
    sourceBindings.value = Object.fromEntries(
      (pkg.value.sources || []).map((slot) => [slot.key, ''])
    )
    sources.value = pkg.value.sources?.length
      ? await packageBindingSources()
      : []
    people.value = await packageBindingPeople()
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '包文件读取失败'
  } finally {
    input.value = ''
  }
}
const save = async () => {
  try {
    if (!pkg.value) throw new Error('请选择并校验应用包')
    const body = {
      package: pkg.value,
      name: name.value,
      code: code.value,
      description: pkg.value.application.description,
      bindings: bindings.value,
      ...(pkg.value.version >= 2
        ? { sourceBindings: sourceBindings.value }
        : {}),
    }
    await importApplicationPackage(body, retry.key('import', body))
    retry.complete('import')
    visible.value = false
    pkg.value = undefined
    emit('imported')
    return true
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '导入失败'
    return false
  }
}
</script>
<style scoped>
label {
  display: block;
  margin: 16px 0;
}
input,
select {
  display: block;
  width: 100%;
  padding: 8px;
  color: var(--color-text-1);
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
}
p {
  margin: 12px 0;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
