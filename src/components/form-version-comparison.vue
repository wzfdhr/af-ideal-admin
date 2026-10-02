<template>
  <section
    class="form-version-comparison"
    data-testid="form-version-comparison"
    aria-label="表单版本对比"
  >
    <h2>表单版本对比</h2>
    <p v-if="!releases.length" data-testid="form-comparison-empty">
      尚无发布版本。先保存并发布表单，即可与后续草稿或其他发布版本对比。
    </p>
    <template v-else>
      <div class="comparison-selectors">
        <label>
          基准版本
          <select v-model="leftId" aria-label="表单对比基准版本">
            <option
              v-for="release in releases"
              :key="release.id"
              :value="release.id"
            >
              发布 v{{ release.releaseVersion }}
            </option>
          </select>
        </label>
        <label>
          目标版本
          <select v-model="rightId" aria-label="表单对比目标版本">
            <option :value="draftKey">{{ draftLabel }}</option>
            <option
              v-for="release in releases"
              :key="release.id"
              :value="release.id"
            >
              发布 v{{ release.releaseVersion }}
            </option>
          </select>
        </label>
      </div>
      <p>{{ baselineLabel }} → {{ targetLabel }}</p>
      <p v-if="rightId === draftKey && dirty" role="status">
        当前对比包含未保存修改；发布仍需先保存草稿。
      </p>
      <p class="comparison-note">
        对比不会修改版本或业务记录。发布时生成的数据源快照与编辑草稿中的登记引用分别显示。
      </p>
      <p
        v-if="comparison.error"
        role="alert"
        data-testid="form-comparison-error"
      >
        {{ comparison.error }}
      </p>
      <template v-else-if="comparison.diff">
        <p data-testid="form-comparison-summary">
          字段变化 {{ comparison.diff.fields.length }} 项；表单配置变化
          {{ comparison.diff.settings.length }} 项；数据源变化
          {{ comparison.diff.sources.length }} 项。
        </p>
        <p
          v-if="comparison.diff.total === 0"
          data-testid="form-comparison-equal"
        >
          表单定义无变化。
        </p>
        <table v-if="comparison.diff.settings.length">
          <caption>表单配置</caption>
          <thead>
            <tr>
              <th scope="col">配置</th>
              <th scope="col">基准</th>
              <th scope="col">目标</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="change in comparison.diff.settings"
              :key="change.property"
            >
              <th scope="row">{{ propertyLabel(change.property) }}</th>
              <td>{{ display(change.before, change.property) }}</td>
              <td>{{ display(change.after, change.property) }}</td>
            </tr>
          </tbody>
        </table>
        <template v-for="group in groups" :key="group.key">
          <details
            v-for="change in comparison.diff[group.key]"
            :key="change.key"
            open
            :data-change-key="change.key"
            :data-change-kind="change.kind"
          >
            <summary>
              {{ group.label }} · {{ kindLabels[change.kind] }} ·
              {{ change.label }}
              <small>（{{ change.key }}）</small>
            </summary>
            <div class="comparison-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">配置</th>
                    <th scope="col">基准</th>
                    <th scope="col">目标</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in change.properties" :key="item.property">
                    <th scope="row">{{ propertyLabel(item.property) }}</th>
                    <td>{{ display(item.before, item.property) }}</td>
                    <td>{{ display(item.after, item.property) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </template>
      </template>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { compareFormDefinitions } from '@af-admin/contracts'
import type { Release, FormDefinitionDiff, Json } from '@af-admin/contracts'

const props = defineProps<{
  releases: Release[]
  activeReleaseId: string | null
  draft?: unknown
  draftRevision?: number
  dirty: boolean
}>()
const draftKey = 'editing-draft'
const leftId = ref('')
const rightId = ref(draftKey)
watch(
  () => props.releases,
  (releases) => {
    if (!releases.some((release) => release.id === leftId.value))
      leftId.value =
        releases.find((release) => release.id === props.activeReleaseId)?.id ||
        releases[0]?.id ||
        ''
    if (
      rightId.value !== draftKey &&
      !releases.some((release) => release.id === rightId.value)
    )
      rightId.value = draftKey
  },
  { immediate: true }
)
const draftLabel = computed(
  () =>
    `当前${props.dirty ? '编辑' : '已保存'}草稿 · 修改版 ${
      props.draftRevision ?? '—'
    }`
)
const baseline = computed(() =>
  props.releases.find((release) => release.id === leftId.value)
)
const target = computed(() =>
  props.releases.find((release) => release.id === rightId.value)
)
const baselineLabel = computed(
  () => `发布 v${baseline.value?.releaseVersion ?? '—'}`
)
const targetLabel = computed(() =>
  rightId.value === draftKey
    ? draftLabel.value
    : `发布 v${target.value?.releaseVersion ?? '—'}`
)
const comparison = computed<{ diff?: FormDefinitionDiff; error: string }>(
  () => {
    if (!baseline.value) return { error: '请选择基准发布版本' }
    try {
      return {
        diff: compareFormDefinitions(
          baseline.value.formSnapshot,
          rightId.value === draftKey ? props.draft : target.value?.formSnapshot
        ),
        error: '',
      }
    } catch (failure) {
      return {
        error:
          failure instanceof Error
            ? `无法对比：${failure.message}`
            : '表单定义无效，无法对比',
      }
    }
  }
)
const groups: { key: 'fields' | 'sources'; label: string }[] = [
  { key: 'fields', label: '字段' },
  { key: 'sources', label: '数据源' },
]
const kindLabels = { added: '新增', removed: '移除', changed: '修改' }
const labels: Record<string, string> = {
  version: '格式版本',
  size: '尺寸',
  layout: '布局',
  labelAlign: '标签对齐',
  computedFields: '计算字段',
  widgetType: '控件类型',
  widgetName: '控件名称',
  position: '显示顺序',
  id: '字段标识',
  label: '字段标签',
  required: '必填',
  disabled: '禁用',
  readonly: '只读',
  placeholder: '输入提示',
  width: '宽度',
  allowClear: '允许清除',
  maxLength: '最大字符数',
  showWordLimit: '显示字数',
  optionsType: '选项来源',
  optionsSourceKey: '来源绑定',
  options: '选项',
  type: '样式',
  direction: '排列方向',
  defaultValue: '默认值',
  format: '格式',
  showTime: '显示时间',
  modeSelection: '日期选择方式',
  valueType: '数值类型',
  min: '下限',
  max: '上限',
  validation: '校验规则',
  behavior: '联动规则',
  allowSearch: '允许搜索',
  allowCreate: '允许创建选项',
  limit: '选项数量限制',
  rules: '旧版校验',
  trigger: '校验触发',
  error: '错误样式',
  key: '绑定标识',
  name: '名称',
  kind: '来源类型',
  registryId: '登记标识',
  registryRevision: '登记修改版',
  dictionaryRevision: '字典修改版',
  optionsSnapshot: '发布选项快照',
  minLength: '最小字符数',
  compare: '比较规则',
  field: '驱动或比较字段',
  operator: '比较方式',
  value: '实际值',
  visibleWhen: '条件显示',
  requiredWhen: '条件必填',
  operation: '计算方式',
  quantity: '数量字段',
  price: '金额字段',
}
const propertyLabel = (key: string) => labels[key] || key
const presets: Record<string, string> = {
  'vertical': '纵向',
  'horizontal': '横向',
  'left': '左对齐',
  'right': '右对齐',
  'medium': '中',
  'mini': '最小',
  'small': '小',
  'large': '大',
  'fixed': '固定选项',
  'registered': '登记数据源',
  'dictionary': '字典',
  'input': '输入框',
  'textarea': '多行输入',
  'select': '下拉选择',
  'radio': '单选',
  'date-picker': '日期选择',
  'text': '文本',
  'integer': '整数',
  'decimal': '金额',
  'email': '邮箱',
  'phone': '电话',
  'https-url': 'HTTPS网址',
  'eq': '等于',
  'neq': '不等于',
  'gte': '大于或等于',
  'lte': '小于或等于',
  'quantity-times-price': '数量 × 单价',
}
const enumProperties = new Set([
  'size',
  'layout',
  'labelAlign',
  'widgetType',
  'optionsType',
  'kind',
  'valueType',
  'format',
  'operator',
  'operation',
])
const display = (value: Json | undefined, property = ''): string => {
  if (value === undefined) return '未配置'
  if (value === null) return '空值'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value))
    return value.length
      ? value.map((item) => display(item, property)).join('；')
      : '空集合'
  if (typeof value === 'object')
    return Object.entries(value)
      .map(([key, item]) => `${propertyLabel(key)}：${display(item, key)}`)
      .join('；')
  if (typeof value === 'string') {
    const preset = enumProperties.has(property) ? presets[value] : undefined
    return preset || value || '空文本'
  }
  return String(value)
}
</script>
<style scoped>
.form-version-comparison {
  padding: 24px;
  background: var(--color-bg-2);
  color: var(--color-text-1);
}
h2 {
  font-size: 20px;
  margin-bottom: 16px;
}
.comparison-selectors {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}
label {
  display: grid;
  gap: 8px;
  min-width: 220px;
}
select {
  padding: 8px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
  color: var(--color-text-1);
  background: var(--color-bg-2);
}
p {
  margin: 16px 0;
}
.comparison-note,
small {
  color: var(--color-text-2);
}
[role='alert'] {
  color: var(--color-danger-6);
}
details {
  margin: 16px 0;
  border: 1px solid var(--color-border-2);
  border-radius: 6px;
}
summary {
  padding: 12px;
  cursor: pointer;
}
.comparison-table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
th,
td {
  padding: 12px;
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--color-border-2);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
caption {
  text-align: left;
  font-weight: 600;
  padding: 12px 0;
}
select:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--color-primary-6);
  outline-offset: 2px;
}
</style>
