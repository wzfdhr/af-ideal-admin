<template>
  <section class="field-behavior" aria-label="字段校验与联动">
    <h3>字段校验与联动</h3>
    <template v-if="textField">
      <label>
        最小字符数
        <input
          type="number"
          min="1"
          :max="maxLength"
          :value="rules.minLength ?? ''"
          aria-label="最小字符数"
          @change="changeMinimum"
        />
      </label>
      <label>
        格式校验
        <select
          :value="rules.format || ''"
          aria-label="格式校验"
          @change="changeFormat"
        >
          <option value="">无格式限制</option>
          <option value="email">邮箱</option>
          <option value="https-url">HTTPS网址</option>
          <option value="phone">电话号码</option>
        </select>
      </label>
    </template>
    <label>
      比较字段
      <select
        :value="rules.compare?.field || ''"
        aria-label="比较字段"
        @change="changeCompareField"
      >
        <option value="">不比较</option>
        <option v-for="item in comparable" :key="item.uid" :value="item.uid">
          {{ item.config.label || item.name }}
        </option>
      </select>
    </label>
    <label v-if="rules.compare">
      比较方式
      <select
        :value="rules.compare.operator"
        aria-label="比较方式"
        @change="changeCompareOperator"
      >
        <option value="eq">等于</option>
        <option v-if="ordered" value="gte">大于或等于（日期不早于）</option>
        <option v-if="ordered" value="lte">小于或等于（日期不晚于）</option>
      </select>
    </label>
    <template
      v-if="
        !widget.config.disabled &&
        !('readonly' in widget.config && widget.config.readonly)
      "
    >
      <div v-for="item in conditionKinds" :key="item.key">
        <label>
          {{ item.label }}的驱动字段
          <select
            :value="behavior[item.key]?.field || ''"
            :aria-label="`${item.label}驱动字段`"
            @change="changeConditionField(item.key, $event)"
          >
            <option value="">不设置条件</option>
            <option
              v-for="driver in drivers"
              :key="driver.uid"
              :value="driver.uid"
            >
              {{ driver.config.label || driver.name }}
            </option>
          </select>
        </label>
        <template v-if="behavior[item.key]">
          <label>
            {{ item.label }}比较方式
            <select
              :value="behavior[item.key]?.operator"
              :aria-label="`${item.label}比较方式`"
              @change="changeConditionOperator(item.key, $event)"
            >
              <option value="eq">等于</option>
              <option value="neq">不等于</option>
            </select>
          </label>
          <label>
            {{ item.label }}匹配值
            <input
              :value="behavior[item.key]?.value"
              maxlength="100"
              :aria-label="`${item.label}匹配值`"
              @input="changeConditionValue(item.key, $event)"
            />
          </label>
        </template>
      </div>
    </template>
    <p>
      使用字段的实际值匹配；隐藏字段会清除当前编辑值。条件不能引用自身或其他联动字段。发布后按固定规则执行。
    </p>
  </section>
</template>
<script setup lang="ts">
import { computed, inject } from 'vue'
import { contextSymbol } from './types'
import type { FormBehavior, FormValidation } from '@af-admin/contracts'
import type {
  FormDesignerContext,
  IConfigInput,
  IConfigSelect,
  IConfigRadio,
  IConfigDatePicker,
  IConfigTextarea,
} from './types'

type Field =
  | IConfigInput
  | IConfigSelect
  | IConfigRadio
  | IConfigDatePicker
  | IConfigTextarea
const props = defineProps<{ widget: Field }>()
const emit = defineEmits<{ (event: 'update', widget: Field): void }>()
const ctx = inject<FormDesignerContext>(contextSymbol)
const rules = computed(() => props.widget.config.validation || {})
const maxLength = computed(() =>
  'maxLength' in props.widget.config
    ? props.widget.config.maxLength || 2000
    : 2000
)
const behavior = computed(() => props.widget.config.behavior || {})
const fields = computed(() =>
  (ctx?.ast.value.widgetsConfig || []).filter(
    (item): item is Field =>
      ['input', 'select', 'radio', 'date-picker', 'textarea'].includes(
        item.type
      ) && item.uid !== props.widget.uid
  )
)
const drivers = computed(() =>
  fields.value.filter(
    (item) =>
      !item.config.behavior &&
      !item.config.disabled &&
      !('readonly' in item.config && item.config.readonly) &&
      !['date-picker', 'textarea'].includes(item.type) &&
      item.config.valueType !== 'decimal'
  )
)
const comparable = computed(() =>
  fields.value.filter(
    (item) =>
      !item.config.behavior &&
      item.type === props.widget.type &&
      item.config.valueType === props.widget.config.valueType
  )
)
const ordered = computed(
  () =>
    props.widget.type === 'date-picker' ||
    ['integer', 'decimal'].includes(String(props.widget.config.valueType))
)
const textField = computed(
  () =>
    ['input', 'textarea'].includes(props.widget.type) &&
    (!props.widget.config.valueType || props.widget.config.valueType === 'text')
)
const conditionKinds: { key: keyof FormBehavior; label: string }[] = [
  { key: 'visibleWhen', label: '条件显示' },
  { key: 'requiredWhen', label: '条件必填' },
]
const valueOf = (event: Event) => (event.target as HTMLInputElement).value
const update = (validation: FormValidation, nextBehavior = behavior.value) => {
  const widget = { ...props.widget, config: { ...props.widget.config } }
  if (Object.keys(validation).length) widget.config.validation = validation
  else delete widget.config.validation
  if (Object.keys(nextBehavior).length) widget.config.behavior = nextBehavior
  else delete widget.config.behavior
  emit('update', widget as Field)
  if (ctx)
    (ctx.ast.value as typeof ctx.ast.value & { version: number }).version = 2
}
const changeMinimum = (event: Event) => {
  const next = { ...rules.value }
  const raw = valueOf(event)
  if (raw) next.minLength = Number(raw)
  else delete next.minLength
  update(next)
}
const changeFormat = (event: Event) => {
  const next = { ...rules.value }
  const value = valueOf(event)
  if (value === 'email' || value === 'https-url' || value === 'phone')
    next.format = value
  else delete next.format
  update(next)
}
const changeCompareField = (event: Event) => {
  const next = { ...rules.value }
  const value = valueOf(event)
  if (value) next.compare = { field: value, operator: 'eq' }
  else delete next.compare
  update(next)
}
const changeCompareOperator = (event: Event) => {
  const operator = valueOf(event)
  if (
    rules.value.compare &&
    (operator === 'eq' || operator === 'gte' || operator === 'lte')
  )
    update({ ...rules.value, compare: { ...rules.value.compare, operator } })
}
const changeConditionField = (key: keyof FormBehavior, event: Event) => {
  const next = { ...behavior.value }
  const value = valueOf(event)
  if (value)
    next[key] = {
      field: value,
      operator: 'eq',
      value:
        drivers.value.find((item) => item.uid === value)?.config.valueType ===
        'integer'
          ? 0
          : '',
    }
  else delete next[key]
  update(rules.value, next)
}
const changeConditionOperator = (key: keyof FormBehavior, event: Event) => {
  const condition = behavior.value[key]
  const operator = valueOf(event)
  if (condition && (operator === 'eq' || operator === 'neq'))
    update(rules.value, {
      ...behavior.value,
      [key]: { ...condition, operator },
    })
}
const changeConditionValue = (key: keyof FormBehavior, event: Event) => {
  const condition = behavior.value[key]
  if (condition) {
    const driver = drivers.value.find((item) => item.uid === condition.field)
    const raw = valueOf(event)
    const value = driver?.config.valueType === 'integer' ? Number(raw) : raw
    update(rules.value, {
      ...behavior.value,
      [key]: { ...condition, value },
    })
  }
}
</script>
<style scoped>
.field-behavior {
  border-top: 1px solid var(--color-border-2);
  margin-top: 16px;
  padding-top: 12px;
}
label {
  display: grid;
  gap: 4px;
  margin: 8px 0;
}
select,
input {
  width: 100%;
  padding: 6px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
  color: var(--color-text-1);
  background: var(--color-bg-2);
}
p {
  font-size: 12px;
  color: var(--color-text-2);
}
</style>
