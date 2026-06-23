<template>
  <main class="plugin-center" data-testid="plugin-center">
    <div class="plugin-center__header">
      <div>
        <p class="plugin-center__breadcrumb">插件中心 / 插件管理</p>
        <h1>插件管理</h1>
      </div>
      <div class="plugin-center__summary">共 {{ total }} 个插件</div>
    </div>

    <section class="plugin-center__filters" aria-label="插件筛选">
      <label class="plugin-center__field">
        <span>关键词</span>
        <input
          v-model.trim="filters.keyword"
          data-testid="plugin-keyword"
          placeholder="插件名称、说明或作者"
        />
      </label>
      <label class="plugin-center__field">
        <span>状态</span>
        <select v-model="filters.status">
          <option value="">全部状态</option>
          <option value="enabled">启用</option>
          <option value="disabled">停用</option>
        </select>
      </label>
      <label class="plugin-center__field">
        <span>扩展类型</span>
        <select
          v-model="filters.extensionType"
          data-testid="plugin-extension-type"
        >
          <option value="">全部类型</option>
          <option
            v-for="option in extensionOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <div class="plugin-center__actions">
        <button
          class="plugin-center__button plugin-center__button--primary"
          data-testid="plugin-query"
          :disabled="loading"
          type="button"
          @click="queryPlugins"
        >
          查询
        </button>
        <button
          class="plugin-center__button"
          :disabled="loading"
          type="button"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </section>

    <section class="plugin-center__layout">
      <div class="plugin-center__panel">
        <div class="plugin-center__panel-title">
          <h2>插件清单</h2>
          <span>Mock manifest 注册预览</span>
        </div>
        <div class="plugin-center__plugin-list">
          <article
            v-for="plugin in plugins"
            :key="plugin.id"
            class="plugin-center__plugin"
            :class="{ 'is-disabled': plugin.status === 'disabled' }"
          >
            <button
              class="plugin-center__plugin-button"
              type="button"
              @click="selectPlugin(plugin)"
            >
              <strong>{{ plugin.name }}</strong>
              <small>{{ plugin.version }} / {{ plugin.author }}</small>
            </button>
            <p>{{ plugin.description }}</p>
            <div class="plugin-center__tags">
              <span
                v-for="type in plugin.extensionTypes"
                :key="type"
                class="plugin-center__tag"
              >
                {{ getExtensionLabel(type) }}
              </span>
            </div>
            <dl>
              <div>
                <dt>路由</dt>
                <dd>{{ plugin.manifest.routes.length }}</dd>
              </div>
              <div>
                <dt>权限</dt>
                <dd>{{ plugin.manifest.permissions.length }}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{{ plugin.status === 'enabled' ? '启用' : '停用' }}</dd>
              </div>
            </dl>
            <button
              class="plugin-center__link-button"
              :data-testid="`plugin-toggle-${plugin.id}`"
              :disabled="loading"
              type="button"
              @click="handleToggle(plugin)"
            >
              {{ plugin.status === 'enabled' ? '停用插件' : '启用插件' }}
            </button>
          </article>
          <div
            v-if="!loading && plugins.length === 0"
            class="plugin-center__empty"
          >
            暂无插件
          </div>
        </div>
      </div>

      <div class="plugin-center__panel">
        <div class="plugin-center__panel-title">
          <h2>Manifest</h2>
          <span>{{ manifest?.id || '请选择插件' }}</span>
        </div>
        <div v-if="manifest" class="plugin-center__manifest">
          <section>
            <h3>路由注册</h3>
            <ul>
              <li v-for="route in manifest.routes" :key="route.name">
                {{ route.name }} / {{ route.path }}
              </li>
            </ul>
          </section>
          <section>
            <h3>菜单注册</h3>
            <ul>
              <li v-for="menu in manifest.menus" :key="menu.name">
                {{ menu.name }} / {{ menu.locale }}
              </li>
            </ul>
          </section>
          <section>
            <h3>权限注册</h3>
            <div class="plugin-center__tags">
              <span
                v-for="permission in manifest.permissions"
                :key="permission"
                class="plugin-center__tag"
              >
                {{ permission }}
              </span>
            </div>
          </section>
          <section>
            <h3>Mock 注册</h3>
            <p>{{ manifest.mockModules.join('、') || '-' }}</p>
          </section>
          <section>
            <h3>物料注册</h3>
            <p>{{ manifest.materials.join('、') || '-' }}</p>
          </section>
          <section>
            <h3>启停生命周期</h3>
            <p>安装：{{ manifest.lifecycle.installedAt }}</p>
            <p>启用：{{ manifest.lifecycle.enabledAt || '-' }}</p>
            <p>停用：{{ manifest.lifecycle.disabledAt || '-' }}</p>
          </section>
        </div>
        <div v-else class="plugin-center__empty">暂无 manifest</div>
        <p v-if="actionMessage" class="plugin-center__message">
          {{ actionMessage }}
        </p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  fetchPluginManifest,
  fetchPlugins,
  togglePluginStatus,
  type PluginExtensionType,
  type PluginManifest,
  type PluginQuery,
  type PluginRecord,
  type PluginStatus,
} from '@/api/plugin'

const extensionOptions: Array<{ label: string; value: PluginExtensionType }> = [
  { label: '路由', value: 'route' },
  { label: '菜单', value: 'menu' },
  { label: '权限', value: 'permission' },
  { label: 'Mock', value: 'mock' },
  { label: '物料', value: 'material' },
]

const plugins = ref<PluginRecord[]>([])
const manifest = ref<PluginManifest>()
const total = ref(0)
const loading = ref(false)
const current = ref(1)
const pageSize = ref(20)
const actionMessage = ref('')

const filters = reactive({
  keyword: '',
  status: '' as PluginStatus | '',
  extensionType: '' as PluginExtensionType | '',
})

const buildQuery = (): PluginQuery => ({
  current: current.value,
  pageSize: pageSize.value,
  keyword: filters.keyword,
  status: filters.status,
  extensionType: filters.extensionType,
})

const getExtensionLabel = (type: PluginExtensionType) => {
  const option = extensionOptions.find((item) => item.value === type)
  return option?.label || type
}

const selectPlugin = async (plugin: PluginRecord) => {
  manifest.value = await fetchPluginManifest(plugin.id)
}

const loadPlugins = async () => {
  loading.value = true

  try {
    const result = await fetchPlugins(buildQuery())
    plugins.value = result.list
    total.value = result.total
    if (result.list[0]) {
      await selectPlugin(result.list[0])
    } else {
      manifest.value = undefined
    }
  } finally {
    loading.value = false
  }
}

const queryPlugins = async () => {
  current.value = 1
  await loadPlugins()
}

const resetFilters = async () => {
  filters.keyword = ''
  filters.status = ''
  filters.extensionType = ''
  await queryPlugins()
}

const handleToggle = async (plugin: PluginRecord) => {
  const nextEnabled = plugin.status === 'disabled'
  const result = await togglePluginStatus(plugin.id, nextEnabled)

  if (!result.success || !result.id || !result.status) {
    actionMessage.value = result.reason || '插件状态变更失败'
    return
  }

  const { id, status } = result
  plugins.value = plugins.value.map((item) =>
    item.id === id
      ? { ...item, status, updatedAt: result.changedAt || '' }
      : item
  )
  actionMessage.value = `插件已${status === 'enabled' ? '启用' : '停用'}`
}

onMounted(loadPlugins)
</script>

<style scoped lang="scss">
.plugin-center {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  color: #1d2939;
}

.plugin-center__header,
.plugin-center__filters,
.plugin-center__layout,
.plugin-center__panel-title {
  display: flex;
  gap: 16px;
}

.plugin-center__header,
.plugin-center__filters,
.plugin-center__panel-title {
  align-items: center;
  justify-content: space-between;
}

.plugin-center__breadcrumb {
  margin: 0 0 4px;
  color: #667085;
  font-size: 13px;
}

.plugin-center h1,
.plugin-center h2,
.plugin-center h3 {
  margin: 0;
}

.plugin-center__summary,
.plugin-center__filters,
.plugin-center__panel {
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
}

.plugin-center__summary {
  padding: 10px 14px;
  color: #475467;
}

.plugin-center__filters,
.plugin-center__panel {
  padding: 16px;
}

.plugin-center__layout {
  align-items: flex-start;
}

.plugin-center__layout > .plugin-center__panel {
  flex: 1;
  min-width: 0;
}

.plugin-center__field {
  display: flex;
  flex: 1;
  min-width: 180px;
  flex-direction: column;
  gap: 6px;
}

.plugin-center__field span,
.plugin-center__panel-title span {
  color: #667085;
  font-size: 13px;
}

.plugin-center input,
.plugin-center select {
  min-height: 34px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  padding: 0 10px;
  color: #1d2939;
}

.plugin-center__actions {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.plugin-center__button,
.plugin-center__link-button,
.plugin-center__plugin-button {
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #344054;
  cursor: pointer;
}

.plugin-center__button {
  min-height: 34px;
  padding: 0 14px;
}

.plugin-center__button--primary {
  border-color: #165dff;
  background: #165dff;
  color: #fff;
}

.plugin-center__plugin-list {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.plugin-center__plugin {
  display: grid;
  gap: 12px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  padding: 12px;
}

.plugin-center__plugin.is-disabled {
  background: #f9fafb;
  color: #667085;
}

.plugin-center__plugin-button {
  display: flex;
  flex-direction: column;
  border: 0;
  padding: 0;
  text-align: left;
}

.plugin-center__plugin-button small,
.plugin-center__plugin p {
  color: #667085;
}

.plugin-center__plugin p {
  margin: 0;
}

.plugin-center__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.plugin-center__tag {
  border: 1px solid #d0d5dd;
  border-radius: 999px;
  padding: 3px 8px;
  background: #f9fafb;
  color: #344054;
  font-size: 12px;
}

.plugin-center dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.plugin-center dt {
  color: #667085;
  font-size: 12px;
}

.plugin-center dd {
  margin: 2px 0 0;
  font-weight: 600;
}

.plugin-center__link-button {
  justify-self: flex-start;
  padding: 6px 10px;
}

.plugin-center__manifest {
  display: grid;
  gap: 14px;
  margin-top: 14px;
}

.plugin-center__manifest section {
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  padding: 12px;
}

.plugin-center__manifest h3 {
  margin-bottom: 8px;
  font-size: 14px;
}

.plugin-center__manifest ul {
  margin: 0;
  padding-left: 18px;
}

.plugin-center__manifest p {
  margin: 4px 0;
}

.plugin-center__message {
  margin: 12px 0 0;
  color: #165dff;
}

.plugin-center__empty {
  padding: 18px;
  color: #667085;
  text-align: center;
}

@media (max-width: 980px) {
  .plugin-center__header,
  .plugin-center__filters,
  .plugin-center__layout {
    flex-direction: column;
    align-items: stretch;
  }

  .plugin-center dl {
    grid-template-columns: 1fr;
  }
}
</style>
