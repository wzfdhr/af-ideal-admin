<template>
  <fieldset :disabled="disabled" class="messaging-form">
    <legend>当前租户接收范围</legend>
    <label>
      接收范围
      <select
        :value="modelValue.scope"
        data-testid="messaging-audience-scope"
        @change="scopeChanged"
      >
        <option value="self">仅本人</option>
        <option value="all">全部符合授权范围的启用成员</option>
        <option value="role">角色成员</option>
        <option value="department">部门成员</option>
        <option value="users">指定成员</option>
      </select>
    </label>
    <label v-if="modelValue.scope === 'role'">
      角色
      <select
        :value="modelValue.targetId || ''"
        data-testid="messaging-audience-target"
        @change="targetChanged"
      >
        <option value="">请选择角色</option>
        <option v-for="item in roles" :key="item.id" :value="item.id">
          {{ item.name }}
        </option>
      </select>
    </label>
    <label v-if="modelValue.scope === 'department'">
      部门
      <select
        :value="modelValue.targetId || ''"
        data-testid="messaging-audience-target"
        @change="targetChanged"
      >
        <option value="">请选择部门</option>
        <option v-for="item in departments" :key="item.id" :value="item.id">
          {{ item.name }}
        </option>
      </select>
    </label>
    <div v-if="modelValue.scope === 'users'" class="messaging-form">
      <label v-if="people.length">
        查找指定成员
        <input
          v-model="search"
          type="search"
          maxlength="100"
          placeholder="按当前授权成员的姓名查找"
          data-testid="messaging-audience-search"
          @keydown.enter.prevent
        />
      </label>
      <div v-if="people.length" class="messaging-actions">
        <span
          class="messaging-muted"
          data-testid="messaging-audience-selection"
        >
          当前已选择 {{ (modelValue.userIds || []).length }} 人 · 显示
          {{ filteredPeople.length }} / {{ people.length }} 人
        </span>
        <button type="button" :disabled="!search" @click="search = ''">
          清除成员搜索
        </button>
      </div>
      <div
        v-if="filteredPeople.length"
        class="messaging-member-options"
        role="group"
        aria-label="指定成员搜索结果"
      >
        <label
          v-for="item in filteredPeople"
          :key="item.id"
          class="messaging-check"
        >
          <input
            type="checkbox"
            :checked="(modelValue.userIds || []).includes(item.id)"
            @change="userChanged(item.id, $event)"
          />
          {{ item.name }}
        </label>
      </div>
      <p v-if="!people.length" class="messaging-muted">
        当前没有可选的启用成员
      </p>
      <p v-else-if="!filteredPeople.length" class="messaging-muted">
        没有匹配的授权成员。搜索不会清除已有选择。
      </p>
      <p
        v-if="search && (modelValue.userIds || []).length"
        class="messaging-muted"
      >
        当前搜索以外的已选成员仍会保留。
      </p>
    </div>
    <p class="messaging-muted">
      发送前由服务器重新核对实际接收成员；订阅偏好会影响投递通道。
    </p>
  </fieldset>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'

interface AudienceValue {
  scope: 'self' | 'all' | 'role' | 'department' | 'users'
  targetId?: string
  userIds?: string[]
}
const props = defineProps<{
  modelValue: AudienceValue
  people: { id: string; name: string }[]
  roles: { id: string; name: string }[]
  departments: { id: string; name: string }[]
  disabled?: boolean
}>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: AudienceValue): void
}>()
const search = ref('')
const filteredPeople = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  return props.people.filter((person) =>
    person.name.toLocaleLowerCase().includes(keyword)
  )
})
const scopeChanged = (event: Event) => {
  search.value = ''
  emit('update:modelValue', {
    scope: (event.target as HTMLSelectElement).value as AudienceValue['scope'],
  })
}
const targetChanged = (event: Event) =>
  emit('update:modelValue', {
    scope: props.modelValue.scope,
    targetId: (event.target as HTMLSelectElement).value,
  })
const userChanged = (id: string, event: Event) => {
  const values = new Set(props.modelValue.userIds || [])
  if ((event.target as HTMLInputElement).checked) values.add(id)
  else values.delete(id)
  emit('update:modelValue', { scope: 'users', userIds: [...values] })
}
</script>

<style scoped>
.messaging-member-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  max-height: 240px;
  gap: 8px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid var(--color-border-2, #e4e7ec);
  border-radius: 5px;
}
.messaging-member-options .messaging-check {
  align-items: flex-start;
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
