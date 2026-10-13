<template>
  <main class="reporting-page" data-testid="real-report-center">
    <header>
      <h1>真实报表中心</h1>
      <div class="reporting-actions">
        <button
          v-if="allowed(P.create)"
          type="button"
          :disabled="busy || detailLoading"
          data-testid="reporting-definition-new"
          @click="newDefinition"
        >
          新增报表配置
        </button>
        <button
          type="button"
          :disabled="loading || busy || querying || detailLoading"
          @click="reload"
        >
          重新读取服务器
        </button>
      </div>
    </header>
    <p class="reporting-muted">
      按当前权限查询业务记录。所选来源版本和字段口径固定；当前支持查询，文件导出、归档和定时发送尚不可用。
    </p>
    <p v-if="error" role="alert" data-testid="reporting-error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">正在读取真实报表配置与共享发布库…</p>
    <p v-if="![P.list, P.create, P.query].some(allowed)" role="alert">
      当前账户没有报表管理或查询权限。
    </p>
    <section v-if="allowed(P.list) || editorOpen" class="reporting-grid">
      <section
        v-if="allowed(P.list)"
        class="reporting-panel"
        aria-label="当前授权报表配置"
      >
        <h2>已保存配置</h2>
        <p class="reporting-muted">只显示当前成员有权管理的创建者范围。</p>
        <form class="reporting-form" @submit.prevent="searchDefinitions">
          <label>
            配置名称
            <input
              v-model="definitionKeyword"
              maxlength="100"
              data-testid="reporting-definition-keyword"
            />
          </label>
          <button type="submit" :disabled="loading">查询配置</button>
        </form>
        <ul class="reporting-list">
          <li
            v-for="definition in definitions"
            :key="definition.id"
            :class="{ 'reporting-selected': selected?.id === definition.id }"
          >
            <button
              type="button"
              :disabled="busy || detailLoading"
              :data-testid="`reporting-definition-${definition.id}`"
              @click="edit(definition.id)"
            >
              {{ definition.schema.name }} ·
              {{ kindLabels[definition.schema.kind] }}
            </button>
            <p class="reporting-muted">
              {{ definition.enabled ? '已启用' : '已停用' }} · 修订
              {{ definition.revision }} ·
              {{ definition.activeVersionId ? '有固定发布版本' : '尚未发布' }}
              {{ definition.draftChanged ? '· 草稿另有修改' : '' }}
            </p>
          </li>
        </ul>
        <p v-if="!loading && !definitions.length && !error">
          当前没有可管理的配置，可新增并保存真实报表。
        </p>
        <nav
          class="reporting-actions reporting-pagination"
          aria-label="报表配置分页"
        >
          <button
            type="button"
            :disabled="loading || definitionPage === 1"
            @click="changeDefinitionPage(-1)"
          >
            上一页
          </button>
          <span>第 {{ definitionPage }} 页 / 共 {{ definitionTotal }} 项</span>
          <button
            type="button"
            :disabled="loading || definitionPage * 20 >= definitionTotal"
            @click="changeDefinitionPage(1)"
          >
            下一页
          </button>
        </nav>
      </section>
      <section
        v-if="editorOpen"
        class="reporting-panel"
        data-testid="reporting-definition-editor"
      >
        <h2>{{ selected ? '编辑已保存配置' : '新增受控报表配置' }}</h2>
        <form class="reporting-form" @submit.prevent="save">
          <fieldset :disabled="busy || !canEdit" class="reporting-form">
            <legend>配置草稿</legend>
            <label>
              报表名称
              <input
                v-model="draft.name"
                required
                maxlength="100"
                data-testid="reporting-definition-name"
              />
            </label>
            <div
              class="reporting-record reporting-form"
              aria-label="来源目录搜索与分页"
            >
              <label>
                查找来源应用
                <input
                  v-model="sourceKeyword"
                  type="search"
                  maxlength="100"
                  data-testid="reporting-source-keyword"
                  @keydown.enter.prevent="searchSources"
                />
              </label>
              <button
                type="button"
                :disabled="sourceLoading || sourceLookupLoading"
                data-testid="reporting-source-search"
                @click="searchSources"
              >
                查找来源
              </button>
              <nav
                class="reporting-actions reporting-pagination"
                aria-label="登记来源目录分页"
              >
                <button
                  type="button"
                  :disabled="sourceLoading || sourcePage <= 1"
                  data-testid="reporting-source-previous"
                  @click="changeSourcePage(-1)"
                >
                  上一页来源
                </button>
                <span data-testid="reporting-source-page">
                  第 {{ sourcePage }} 页 · 每页 {{ sourcePageSize }} 项 · 共
                  {{ sourceTotal }} 项
                </span>
                <button
                  type="button"
                  :disabled="
                    sourceLoading || sourcePage * sourcePageSize >= sourceTotal
                  "
                  data-testid="reporting-source-next"
                  @click="changeSourcePage(1)"
                >
                  下一页来源
                </button>
              </nav>
              <p
                v-if="sourceLoading || sourceLookupLoading"
                class="reporting-muted"
              >
                正在读取当前授权来源目录…
              </p>
              <p class="reporting-muted">
                过滤或翻页只更新可选目录，当前已选来源及字段会保留。
              </p>
            </div>
            <label>
              登记应用来源
              <select
                :value="draft.source.applicationId"
                data-testid="reporting-definition-source"
                required
                @change="chooseSource"
              >
                <option value="">请选择当前可用的登记来源</option>
                <option
                  v-if="selectedSourceOutsidePage"
                  :value="draft.source.applicationId"
                >
                  {{
                    currentSource
                      ? `${currentSource.applicationName} · 已选择（当前页之外）`
                      : '已保存来源当前不可用，原选择保留'
                  }}
                </option>
                <option
                  v-for="source in sources"
                  :key="source.source.applicationId"
                  :value="source.source.applicationId"
                >
                  {{ source.applicationName }} · 当前来源发布版
                  {{ source.sourceReleaseVersion }}
                </option>
              </select>
            </label>
            <p v-if="currentSource" class="reporting-muted reporting-copy">
              当前登记来源
              {{
                currentSource.sourceReleaseId
              }}。发布时由服务器固定实际来源版本；只统计该版本对应的记录。
            </p>
            <p v-else role="alert">
              当前来源目录不可用，请重新读取或选择有权使用的来源。
            </p>
            <label>
              视图类型
              <select
                v-model="draft.kind"
                data-testid="reporting-definition-kind"
              >
                <option value="trend">按创建日数量趋势</option>
                <option value="distribution">业务状态数量分布</option>
                <option value="detail">分页记录明细</option>
              </select>
            </label>
            <label>
              业务时区（IANA）
              <input
                v-model.trim="draft.timeZone"
                required
                maxlength="100"
                list="reporting-time-zones"
                data-testid="reporting-definition-timezone"
              />
              <datalist id="reporting-time-zones">
                <option value="Asia/Shanghai" />
                <option value="UTC" />
                <option value="America/New_York" />
              </datalist>
            </label>
            <p class="reporting-muted">
              指标为记录数量 count，事实时间为创建时间
              createdAt。没有销售额、利润或未登记表达式。
            </p>
            <div class="reporting-actions">
              <label>
                固定数量模板
                <select
                  v-model="templateKind"
                  data-testid="reporting-template-kind"
                >
                  <option value="trend">创建数量趋势</option>
                  <option value="distribution">业务状态分布</option>
                  <option value="detail">基础记录明细</option>
                </select>
              </label>
              <button
                type="button"
                :disabled="!currentSource"
                data-testid="reporting-template-apply"
                @click="applyTemplate"
              >
                应用到当前草稿
              </button>
            </div>
            <fieldset>
              <legend>从当前授权目录自选字段</legend>
              <div class="reporting-fields">
                <label
                  v-for="field in currentSource?.visibleFields || []"
                  :key="reportingReferenceKey(field.reference)"
                  class="reporting-check"
                >
                  <input
                    type="checkbox"
                    :checked="
                      draft.fields.some(
                        (item) =>
                          reportingReferenceKey(item) ===
                          reportingReferenceKey(field.reference)
                      )
                    "
                    :data-testid="`reporting-draft-field-${reportingReferenceKey(
                      field.reference
                    )}`"
                    @change="
                      toggleDraftField(
                        field,
                        ($event.target as HTMLInputElement).checked
                      )
                    "
                  />
                  {{ field.label }} · {{ field.valueType }}
                </label>
              </div>
            </fieldset>
            <div v-if="unavailableDraftFields.length" role="alert">
              草稿有
              {{ unavailableDraftFields.length }}
              个当前未授权、旧来源或不可用的字段。已有选择保留，请显式调整后保存。
              <button
                type="button"
                data-testid="reporting-remove-unavailable-draft"
                @click="clearUnavailableDraftFields"
              >
                移除这些不可用选择
              </button>
            </div>
            <p
              v-if="currentSource?.hiddenFields.length"
              class="reporting-muted"
            >
              当前来源有
              {{ currentSource.hiddenFields.length }}
              个隐藏或不支持字段。它们不作为可选搜索、排序或查询字段。
            </p>
          </fieldset>
          <div class="reporting-actions">
            <button
              v-if="canEdit"
              type="submit"
              :disabled="busy || !draftDirty"
              class="reporting-primary"
              data-testid="reporting-definition-save"
            >
              保存配置草稿
            </button>
            <span v-if="draftDirty" class="reporting-muted">未保存修改</span>
            <button
              type="button"
              :disabled="busy || detailLoading"
              @click="closeEditor"
            >
              关闭配置编辑
            </button>
          </div>
        </form>
        <div v-if="selected" class="reporting-actions">
          <button
            v-if="allowed(P.publish)"
            type="button"
            :disabled="busy || detailLoading || draftDirty"
            data-testid="reporting-definition-publish"
            @click="publish"
          >
            发布已保存配置
          </button>
          <button
            v-if="allowed(P.disable)"
            type="button"
            :disabled="
              busy ||
              detailLoading ||
              draftDirty ||
              (!selected.enabled && !selected.activeVersionId)
            "
            data-testid="reporting-definition-enabled"
            @click="setEnabled"
          >
            {{ selected.enabled ? '停用报表' : '启用已发布报表' }}
          </button>
        </div>
        <section
          v-if="selected?.versions?.length"
          class="reporting-record"
          data-testid="reporting-version-comparison"
        >
          <h3>草稿与不可变发布版本比较</h3>
          <label>
            对比发布版本
            <select v-model="comparisonId">
              <option
                v-for="version in selected.versions"
                :key="version.id"
                :value="version.id"
              >
                版本 {{ version.version }} · {{ version.publishedAt }}
              </option>
            </select>
          </label>
          <p v-if="comparisonVersion" class="reporting-muted reporting-copy">
            发布内容摘要 {{ comparisonVersion.contentHash }} · 固定来源
            {{ comparisonVersion.sourceReleaseId }}（版本
            {{ comparisonVersion.sourceReleaseVersion }}）
          </p>
          <div v-if="comparisonVersion" class="reporting-scroll">
            <table>
              <thead>
                <tr>
                  <th>口径</th>
                  <th>
                    {{ draftDirty ? '当前未保存草稿' : '当前已保存草稿' }}
                  </th>
                  <th>发布版本 {{ comparisonVersion.version }}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>名称</td>
                  <td>{{ draft.name }}</td>
                  <td>{{ comparisonVersion.schema.name }}</td>
                </tr>
                <tr>
                  <td>视图</td>
                  <td>{{ kindLabels[draft.kind] }}</td>
                  <td>{{ kindLabels[comparisonVersion.schema.kind] }}</td>
                </tr>
                <tr>
                  <td>时区</td>
                  <td>{{ draft.timeZone }}</td>
                  <td>{{ comparisonVersion.schema.timeZone }}</td>
                </tr>
                <tr>
                  <td>应用来源</td>
                  <td>{{ draft.source.applicationId }}</td>
                  <td>{{ comparisonVersion.schema.source.applicationId }}</td>
                </tr>
                <tr>
                  <td>登记字段</td>
                  <td>{{ fieldSummary(draft.fields) }}</td>
                  <td>{{ fieldSummary(comparisonVersion.schema.fields) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="reporting-muted">
            草稿保存不改写原发布版本。发布新版本后，旧版本仍保留各自来源与口径。
          </p>
        </section>
      </section>
    </section>
    <section
      v-if="allowed(P.query)"
      class="reporting-panel"
      aria-label="共享已发布报表查询"
    >
      <h2>共享已发布库与当前授权查询</h2>
      <form class="reporting-form" @submit.prevent="searchPublished">
        <label>
          发布报表名称
          <input
            v-model="publishedKeyword"
            maxlength="100"
            data-testid="reporting-published-keyword"
          />
        </label>
        <button type="submit" :disabled="loading || querying">
          查询发布库
        </button>
      </form>
      <nav
        class="reporting-actions reporting-pagination"
        aria-label="共享发布库分页"
      >
        <button
          type="button"
          :disabled="loading || querying || publishedPage === 1"
          @click="changePublishedPage(-1)"
        >
          上一页
        </button>
        <span>
          第 {{ publishedPage }} 页 / 共 {{ publishedTotal }} 个发布快照
        </span>
        <button
          type="button"
          :disabled="
            loading || querying || publishedPage * 20 >= publishedTotal
          "
          @click="changePublishedPage(1)"
        >
          下一页
        </button>
      </nav>
      <p v-if="!loading && !published.length && !error">
        当前没有已启用且可共享查询的发布版本。
      </p>
      <label v-if="published.length">
        固定报表发布版本
        <select
          :value="selectedVersionId"
          :disabled="querying || busy"
          data-testid="reporting-query-version"
          @change="chooseVersion"
        >
          <option
            v-for="version in published"
            :key="version.id"
            :value="version.id"
          >
            {{ version.schema.name }} · {{ kindLabels[version.schema.kind] }} ·
            报表 v{{ version.version }} / 来源 v{{
              version.sourceReleaseVersion
            }}
          </option>
        </select>
      </label>
      <form
        v-if="currentVersion"
        class="reporting-form"
        data-testid="reporting-query-form"
        @submit.prevent="executeQuery(1)"
      >
        <p class="reporting-muted reporting-copy">
          来源固定为 {{ currentVersion.sourceReleaseId }}，仅该发布版记录；时区
          {{ currentVersion.schema.timeZone }}，记录数量口径
          createdAt。查询不读取私有配置草稿。
        </p>
        <fieldset
          :disabled="querying || busy || !versionCatalogue"
          class="reporting-form"
        >
          <legend>明确查询范围</legend>
          <label>
            开始日（包含）
            <input
              v-model="queryDraft.dateRange.from"
              type="date"
              required
              data-testid="reporting-query-from"
            />
          </label>
          <label>
            结束日（包含）
            <input
              v-model="queryDraft.dateRange.to"
              type="date"
              required
              data-testid="reporting-query-to"
            />
          </label>
          <p class="reporting-muted">
            使用固定配置的 IANA 时区
            {{ currentVersion.schema.timeZone }} 按自然日划定闭区间，最多 366
            天。
          </p>
          <fieldset>
            <legend>状态（不选择表示所有当前可访问状态）</legend>
            <div class="reporting-actions">
              <label
                v-for="(label, value) in statusLabels"
                :key="value"
                class="reporting-check"
              >
                <input
                  v-model="queryDraft.statuses"
                  type="checkbox"
                  :value="value"
                />
                {{ label }}
              </label>
            </div>
          </fieldset>
          <label>
            关键词
            <input
              v-model="queryDraft.keyword"
              maxlength="100"
              data-testid="reporting-query-keyword"
            />
          </label>
          <fieldset>
            <legend>关键词只搜索已勾选的授权字段</legend>
            <div class="reporting-fields">
              <label
                v-for="field in searchableFields"
                :key="field.key"
                class="reporting-check"
              >
                <input
                  type="checkbox"
                  :checked="
                    queryDraft.searchFields.some(
                      (item) =>
                        reportingReferenceKey(item) ===
                        reportingReferenceKey(field.reference)
                    )
                  "
                  :data-testid="`reporting-search-field-${reportingReferenceKey(
                    field.reference
                  )}`"
                  @change="
                    toggleSearchField(
                      field,
                      ($event.target as HTMLInputElement).checked
                    )
                  "
                />
                {{ field.label }}
              </label>
            </div>
            <p v-if="!searchableFields.length" class="reporting-muted">
              当前固定报表没有可用于关键词搜索的授权字段。
            </p>
          </fieldset>
          <div v-if="unavailableSearchFields.length" role="alert">
            已有
            {{ unavailableSearchFields.length }}
            个搜索选择当前不可用，输入保留且不会用于查询。
            <button type="button" @click="removeUnavailableSearch">
              移除这些搜索选择
            </button>
          </div>
          <label>
            授权排序字段
            <select
              :value="currentSortKey"
              data-testid="reporting-query-sort"
              @change="setSort(($event.target as HTMLSelectElement).value)"
            >
              <option v-if="sortUnavailable" :value="currentSortKey" disabled>
                当前排序选择不可用，请重新选择
              </option>
              <option
                v-for="field in sortableFields"
                :key="field.key"
                :value="reportingReferenceKey(field.reference)"
              >
                {{ field.label }}
              </option>
            </select>
          </label>
          <label>
            排序方向
            <select v-model="queryDraft.sort.direction">
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </label>
          <label>
            明细每页数量
            <select
              v-model.number="queryDraft.pageSize"
              data-testid="reporting-query-page-size"
            >
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </label>
        </fieldset>
        <p
          v-if="versionCatalogue?.hiddenFields.length"
          class="reporting-muted"
          data-testid="reporting-query-hidden-fields"
        >
          当前固定来源有
          {{ versionCatalogue.hiddenFields.length }}
          个隐藏或不支持字段，目录不会开放它们的值、搜索或排序。
        </p>
        <p v-if="queryDirty" class="reporting-muted">
          筛选有未执行修改；现有结果仍对应上一次实际查询，请重新查询后分页。
        </p>
        <button
          type="submit"
          :disabled="querying || busy || !versionCatalogue"
          class="reporting-primary"
          data-testid="reporting-query-submit"
        >
          {{ querying ? '正在查询真实记录…' : '查询真实记录' }}
        </button>
      </form>
    </section>
    <QueryResults
      v-if="result"
      :result="result"
      :busy="querying || busy || queryDirty"
      @page="executeQuery"
    />
  </main>
</template>
<script setup lang="ts">
import { reportingReferenceKey, useReportingState } from './use-reporting-state'
import QueryResults from './query-results.vue'
import type { ReportingFieldReference } from '@af-admin/contracts'
import './reporting.css'

const {
  P,
  definitions,
  definitionPage,
  definitionTotal,
  definitionKeyword,
  sources,
  sourcePage,
  sourceTotal,
  sourcePageSize,
  sourceKeyword,
  sourceLoading,
  sourceLookupLoading,
  selectedSourceOutsidePage,
  selected,
  editorOpen,
  detailLoading,
  draft,
  draftDirty,
  templateKind,
  comparisonId,
  comparisonVersion,
  published,
  publishedPage,
  publishedTotal,
  publishedKeyword,
  selectedVersionId,
  currentVersion,
  versionCatalogue,
  searchableFields,
  sortableFields,
  currentSortKey,
  sortUnavailable,
  unavailableDraftFields,
  unavailableSearchFields,
  currentSource,
  canEdit,
  queryDraft,
  queryDirty,
  result,
  loading,
  querying,
  error,
  notice,
  busy,
  allowed,
  edit,
  newDefinition,
  changeSource,
  searchSources,
  changeSourcePage,
  applyTemplate,
  toggleDraftField,
  clearUnavailableDraftFields,
  save,
  publish,
  setEnabled,
  closeEditor,
  reload,
  selectPublished,
  toggleSearchField,
  setSort,
  removeUnavailableSearch,
  executeQuery,
  searchDefinitions,
  changeDefinitionPage,
  searchPublished,
  changePublishedPage,
} = useReportingState()
const kindLabels = {
  trend: '创建数量趋势',
  distribution: '业务状态分布',
  detail: '分页业务明细',
}
const statusLabels = {
  draft: '草稿',
  running: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
}
const metadataLabels: Record<string, string> = {
  id: '记录编号',
  status: '业务状态',
  revision: '记录版本',
  applicationReleaseId: '来源发布编号',
  releaseVersion: '来源发布版本',
  applicantId: '申请人编号',
  applicantName: '申请人姓名',
  departmentSnapshot: '申请部门',
  createdAt: '创建时间',
  updatedAt: '更新时间',
}
const fieldSummary = (fields: ReportingFieldReference[]) =>
  fields
    .map(
      (field) =>
        currentSource.value?.visibleFields.find(
          (item) =>
            reportingReferenceKey(item.reference) ===
            reportingReferenceKey(field)
        )?.label ||
        (field.kind === 'metadata'
          ? metadataLabels[field.id]
          : '历史登记业务字段')
    )
    .join('、')
const chooseSource = (event: Event) => {
  const element = event.target as HTMLSelectElement
  changeSource(element.value)
  element.value = draft.value.source.applicationId
}
const chooseVersion = async (event: Event) => {
  const element = event.target as HTMLSelectElement
  await selectPublished(element.value)
  element.value = selectedVersionId.value
}
</script>
