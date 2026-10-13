<template>
  <section
    v-if="canCreate"
    class="reporting-panel"
    aria-label="创建真实文件导出"
    data-testid="reporting-export-create"
  >
    <h2>导出当前筛选的全部明细</h2>
    <p class="reporting-muted">
      导出所选报表固定版本下全部符合筛选的当前授权记录，不受当前查询分页限制。
      服务器固定创建时的来源版本、字段、排序与数据截止；最多 2000 条、快照 2
      MiB，文件 10 MiB。
    </p>
    <p v-if="!ready" role="status">
      请先执行当前筛选查询；筛选修改后需要重新查询再导出。
    </p>
    <form class="reporting-form" @submit.prevent="submit">
      <label>
        真实文件格式
        <select
          v-model="format"
          :disabled="busy || capabilityLoading"
          data-testid="reporting-export-format"
        >
          <option
            v-for="capability in capabilities"
            :key="capability.format"
            :value="capability.format"
            :disabled="!capability.available"
          >
            {{ capability.format.toUpperCase() }}
            {{ capability.available ? '' : '（当前不可用）' }}
          </option>
        </select>
      </label>
      <p v-if="availableFormat?.reason" role="status">
        {{ availableFormat.reason }}
      </p>
      <p v-if="capabilityLoading" role="status">正在读取服务器格式能力…</p>
      <p v-else-if="!capabilities.length" role="alert">
        未取得可用格式，请重新读取服务器。
      </p>
      <p v-if="ready && version" class="reporting-muted reporting-copy">
        {{ version.schema.name }} · 报表 v{{ version.version }} / 来源 v{{
          version.sourceReleaseVersion
        }}
        · 筛选 {{ query.dateRange.from }} 至 {{ query.dateRange.to }}（{{
          query.timeZone
        }}） · 上次查询符合
        {{ totalRows }} 条，创建时服务器会重新核对授权与实际条数。
      </p>
      <button
        type="submit"
        :disabled="
          busy || !ready || !availableFormat?.available || capabilityLoading
        "
        class="reporting-primary"
        data-testid="reporting-export-submit"
      >
        {{ busy ? '正在提交服务器命令…' : '创建真实导出任务' }}
      </button>
    </form>
  </section>
</template>
<script setup lang="ts">
import type {
  ReportingDefinitionVersion,
  ReportingQueryV1,
} from '@af-admin/contracts'
import type { ReportExportState } from './use-report-export-state'

const props = defineProps<{
  state: ReportExportState
  version?: ReportingDefinitionVersion
  query: ReportingQueryV1
  ready: boolean
  totalRows?: number
}>()
// The parent retains this composable container; each binding is itself a ref.
// eslint-disable-next-line vue/no-setup-props-destructure
const bindings = props.state
const {
  canCreate,
  format,
  busy,
  capabilityLoading,
  capabilities,
  availableFormat,
} = bindings
const submit = () => {
  if (props.ready && props.version)
    props.state.create(props.version, props.query)
}
</script>
