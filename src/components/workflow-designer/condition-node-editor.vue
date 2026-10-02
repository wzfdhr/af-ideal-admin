<template>
  <section aria-label="条件节点配置" class="condition-editor">
    <p>
      按固定业务字段判断，选择匹配或默认分支；发布时检查类型和每条审批路径。
    </p>
    <p>
      未填的可选字段按不匹配处理；需要金额才能审批时，请将对应表单字段设为必填。
    </p>
    <p v-if="sourceError" role="alert">{{ sourceError }}</p>
    <label>
      条件组合
      <select v-model="draft.mode" aria-label="条件组合" @change="apply">
        <option value="all">全部满足</option>
        <option value="any">任一满足</option>
      </select>
    </label>
    <div
      v-for="(rule, index) in draft.predicates"
      :key="index"
      class="predicate"
    >
      <label>
        判断字段
        <select
          :value="rule.field"
          :aria-label="`条件字段 ${index + 1}`"
          @change="chooseField(index, $event)"
        >
          <option value="">请选择</option>
          <option v-for="field in fields" :key="field.id" :value="field.id">
            {{ field.label }} · {{ field.id }}
          </option>
        </select>
      </label>
      <label>
        判断方式
        <select
          v-model="rule.operator"
          :aria-label="`条件判断 ${index + 1}`"
          @change="apply"
        >
          <option value="eq">等于</option>
          <option value="neq">不等于</option>
          <template v-if="rule.valueType !== 'text'">
            <option value="gt">大于</option>
            <option value="gte">大于或等于</option>
            <option value="lt">小于</option>
            <option value="lte">小于或等于</option>
          </template>
        </select>
      </label>
      <label>
        判断值
        <input
          :value="rule.value"
          :aria-label="`条件值 ${index + 1}`"
          maxlength="2000"
          @change="chooseValue(index, $event)"
        />
      </label>
      <button
        v-if="draft.predicates.length > 1"
        type="button"
        @click="removeRule(index)"
      >
        移除此规则
      </button>
    </div>
    <button
      type="button"
      :disabled="draft.predicates.length >= 10 || !fields.length"
      @click="addRule"
    >
      添加判断规则
    </button>
    <label v-for="branch in branches" :key="branch.key">
      {{ branch.label }}目标
      <select
        v-model="targets[branch.key]"
        :aria-label="`${branch.label}目标`"
        @change="apply"
      >
        <option value="">请选择节点</option>
        <option
          v-for="target in workflow.nodes.filter(
            (item) => item.id !== node.id && item.type !== 'start'
          )"
          :key="target.id"
          :value="target.id"
        >
          {{ target.name }} · {{ target.id }}
        </option>
      </select>
    </label>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parseWorkflow, workflowConditionFields } from '@af-admin/contracts'
import type { WorkflowCondition, WorkflowPredicate } from '@af-admin/contracts'
import type { WorkflowNode, WorkflowSchema } from './schema'

const props = defineProps<{
  node: WorkflowNode
  workflow: WorkflowSchema
  formSchema?: unknown
}>()
const emit = defineEmits<{ (event: 'update', schema: WorkflowSchema): void }>()
const error = ref('')
const draft = ref<WorkflowCondition>({ mode: 'all', predicates: [] })
const targets = ref<{ matched: string; fallback: string }>({
  matched: '',
  fallback: '',
})
const branches = [
  { key: 'matched' as const, label: '匹配分支' },
  { key: 'fallback' as const, label: '默认分支' },
]
const source = computed(() => {
  try {
    return { fields: workflowConditionFields(props.formSchema), error: '' }
  } catch {
    return { fields: [], error: '请先选择并修正关联表单，才能配置条件字段' }
  }
})
const fields = computed(() => source.value.fields)
const sourceError = computed(() => source.value.error)
watch(
  () => [props.node.id, props.node.config.condition],
  () => {
    const { condition } = props.node.config
    draft.value =
      typeof condition === 'object'
        ? JSON.parse(JSON.stringify(condition))
        : { mode: 'all', predicates: [] }
    targets.value = {
      matched:
        props.workflow.edges.find(
          (edge) => edge.source === props.node.id && edge.branch === 'matched'
        )?.target || '',
      fallback:
        props.workflow.edges.find(
          (edge) => edge.source === props.node.id && edge.branch === 'fallback'
        )?.target || '',
    }
    try {
      parseWorkflow(props.workflow)
      error.value = ''
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '规则无效'
    }
  },
  { immediate: true }
)
const apply = () => {
  error.value = ''
  const candidate: WorkflowSchema = {
    ...props.workflow,
    version: 2,
    nodes: props.workflow.nodes.map((item) => {
      if (item.id !== props.node.id) return item
      return {
        ...item,
        config: { formId: item.config.formId, condition: draft.value },
      }
    }),
    edges: [
      ...props.workflow.edges.filter((edge) => edge.source !== props.node.id),
      ...branches
        .filter((branch) => targets.value[branch.key])
        .map((branch) => ({
          id: `route-${props.node.id}-${branch.key}`,
          source: props.node.id,
          target: targets.value[branch.key],
          branch: branch.key,
          label: branch.label,
        })),
    ],
  }
  try {
    emit('update', parseWorkflow(candidate))
  } catch (failure) {
    emit('update', candidate)
    error.value = failure instanceof Error ? failure.message : '规则无效'
  }
}
const predicate = (field: typeof fields.value[number]): WorkflowPredicate => {
  let value: string | number = ''
  if (field.valueType === 'integer') value = 0
  if (field.valueType === 'decimal') value = '0.00'
  if (field.valueType === 'date') value = new Date().toISOString().slice(0, 10)
  return {
    field: field.id,
    valueType: field.valueType,
    operator: field.valueType === 'text' ? 'eq' : 'gte',
    value,
  }
}
const addRule = () => {
  if (fields.value[0]) {
    draft.value.predicates.push(predicate(fields.value[0]))
    apply()
  }
}
const removeRule = (index: number) => {
  draft.value.predicates.splice(index, 1)
  apply()
}
const chooseField = (index: number, event: Event) => {
  const field = fields.value.find(
    (item) => item.id === (event.target as HTMLSelectElement).value
  )
  if (field) {
    draft.value.predicates[index] = predicate(field)
    apply()
  }
}
const chooseValue = (index: number, event: Event) => {
  const rule = draft.value.predicates[index]
  const raw = (event.target as HTMLInputElement).value
  rule.value =
    rule.valueType === 'integer' && /^\d{1,9}$/.test(raw) ? Number(raw) : raw
  apply()
}
</script>
<style scoped>
.condition-editor {
  font-size: 12px;
}
label {
  display: grid;
  gap: 4px;
  margin: 10px 0;
}
input,
select,
button {
  max-width: 100%;
  padding: 6px;
  border: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
  color: var(--color-text-1);
  border-radius: 4px;
}
.predicate {
  padding: 8px;
  margin: 8px 0;
  border: 1px solid var(--color-border-2);
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
