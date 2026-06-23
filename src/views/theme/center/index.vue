<template>
  <main class="theme-center" data-testid="theme-center">
    <div class="theme-center__header">
      <div>
        <p class="theme-center__breadcrumb">主题中心 / 主题配置</p>
        <h1>主题配置</h1>
      </div>
      <div v-if="preview" class="theme-center__current">
        <span>当前预览</span>
        <strong>{{ preview.appTitle }}</strong>
      </div>
    </div>

    <section class="theme-center__filters" aria-label="主题筛选">
      <label class="theme-center__field">
        <span>关键词</span>
        <input
          v-model.trim="filters.keyword"
          data-testid="theme-keyword"
          placeholder="租户、品牌或系统标题"
        />
      </label>
      <div class="theme-center__actions">
        <button
          class="theme-center__button theme-center__button--primary"
          data-testid="theme-query"
          :disabled="loading"
          type="button"
          @click="queryBrands"
        >
          查询
        </button>
        <button
          class="theme-center__button"
          :disabled="loading"
          type="button"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </section>

    <section class="theme-center__layout">
      <div class="theme-center__panel">
        <div class="theme-center__panel-title">
          <h2>租户品牌</h2>
          <span>共 {{ total }} 个</span>
        </div>
        <div class="theme-center__brand-list">
          <article
            v-for="brand in brands"
            :key="brand.tenantId"
            class="theme-center__brand"
            :class="{ 'is-current': brand.current }"
          >
            <button
              class="theme-center__brand-button"
              type="button"
              @click="selectBrand(brand)"
            >
              <span
                class="theme-center__swatch"
                :style="{ backgroundColor: brand.primaryColor }"
              ></span>
              <span>
                <strong>{{ brand.tenantName }}</strong>
                <small>{{ brand.brandName }} / {{ brand.appTitle }}</small>
              </span>
            </button>
            <dl>
              <div>
                <dt>暗色</dt>
                <dd>{{ brand.darkMode ? '开启' : '关闭' }}</dd>
              </div>
              <div>
                <dt>紧凑</dt>
                <dd>{{ brand.compactMode ? '开启' : '关闭' }}</dd>
              </div>
              <div>
                <dt>主题色</dt>
                <dd>{{ brand.primaryColor }}</dd>
              </div>
            </dl>
            <button
              class="theme-center__link-button"
              :data-testid="`theme-apply-${brand.tenantId}`"
              :disabled="loading"
              type="button"
              @click="handleApply(brand.tenantId)"
            >
              {{ brand.current ? '重新应用' : '应用主题' }}
            </button>
          </article>
          <div
            v-if="!loading && brands.length === 0"
            class="theme-center__empty"
          >
            暂无主题配置
          </div>
        </div>
      </div>

      <div class="theme-center__panel">
        <div class="theme-center__panel-title">
          <h2>主题编辑</h2>
          <span>{{ selectedBrand?.tenantName || '请选择租户' }}</span>
        </div>
        <label class="theme-center__field">
          <span>系统标题</span>
          <input v-model.trim="themeForm.appTitle" />
        </label>
        <label class="theme-center__field">
          <span>Logo</span>
          <input v-model.trim="themeForm.logoUrl" />
        </label>
        <label class="theme-center__field">
          <span>登录背景</span>
          <input v-model.trim="themeForm.loginBackground" />
        </label>
        <label class="theme-center__field">
          <span>主题色</span>
          <input
            v-model="themeForm.primaryColor"
            data-testid="theme-primary-color"
            type="color"
          />
        </label>
        <label class="theme-center__check">
          <input
            v-model="themeForm.darkMode"
            data-testid="theme-dark-mode"
            type="checkbox"
          />
          <span>暗色模式</span>
        </label>
        <label class="theme-center__check">
          <input
            v-model="themeForm.compactMode"
            data-testid="theme-compact-mode"
            type="checkbox"
          />
          <span>紧凑模式</span>
        </label>
        <button
          class="theme-center__button theme-center__button--primary"
          data-testid="theme-save"
          :disabled="loading || !selectedBrand"
          type="button"
          @click="saveTheme"
        >
          保存配置
        </button>
        <p v-if="actionMessage" class="theme-center__message">
          {{ actionMessage }}
        </p>
      </div>
    </section>

    <section class="theme-center__panel theme-center__preview">
      <div class="theme-center__panel-title">
        <h2>Adapter token 预览</h2>
        <span>用于 Arco 与 aheart-ui 变量对齐</span>
      </div>
      <div
        v-if="preview"
        class="theme-center__preview-card"
        :class="{ 'is-dark': preview.darkMode }"
        :style="{ '--theme-primary': preview.adapterTokens.colorPrimary }"
      >
        <div class="theme-center__preview-brand">
          <img :alt="preview.brandName" :src="preview.logoUrl" />
          <div>
            <strong>{{ preview.appTitle }}</strong>
            <span>{{ preview.brandName }}</span>
          </div>
        </div>
        <dl>
          <div>
            <dt>colorPrimary</dt>
            <dd>{{ preview.adapterTokens.colorPrimary }}</dd>
          </div>
          <div>
            <dt>borderRadius</dt>
            <dd>{{ preview.adapterTokens.borderRadius }}</dd>
          </div>
          <div>
            <dt>fontSizeBase</dt>
            <dd>{{ preview.adapterTokens.fontSizeBase }}</dd>
          </div>
          <div>
            <dt>compactMode</dt>
            <dd>{{ preview.compactMode ? 'true' : 'false' }}</dd>
          </div>
        </dl>
      </div>
      <div v-else class="theme-center__empty">暂无预览</div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  applyThemeBrand,
  fetchThemeBrands,
  fetchThemePreview,
  updateThemeBrand,
  type ThemeBrandQuery,
  type ThemeBrandRecord,
  type ThemePreviewResult,
} from '@/api/theme'

const brands = ref<ThemeBrandRecord[]>([])
const selectedBrand = ref<ThemeBrandRecord>()
const preview = ref<ThemePreviewResult>()
const total = ref(0)
const loading = ref(false)
const current = ref(1)
const pageSize = ref(20)
const actionMessage = ref('')

const filters = reactive({
  keyword: '',
})

const themeForm = reactive({
  appTitle: '',
  logoUrl: '',
  loginBackground: '',
  primaryColor: '#165dff',
  darkMode: false,
  compactMode: false,
})

const buildQuery = (): ThemeBrandQuery => ({
  current: current.value,
  pageSize: pageSize.value,
  keyword: filters.keyword,
})

const syncForm = (brand: ThemeBrandRecord) => {
  themeForm.appTitle = brand.appTitle
  themeForm.logoUrl = brand.logoUrl
  themeForm.loginBackground = brand.loginBackground
  themeForm.primaryColor = brand.primaryColor
  themeForm.darkMode = brand.darkMode
  themeForm.compactMode = brand.compactMode
}

const loadPreview = async (tenantId: string) => {
  preview.value = await fetchThemePreview(tenantId)
}

const selectBrand = async (brand: ThemeBrandRecord) => {
  selectedBrand.value = brand
  syncForm(brand)
  await loadPreview(brand.tenantId)
}

const loadBrands = async () => {
  loading.value = true

  try {
    const result = await fetchThemeBrands(buildQuery())
    brands.value = result.list
    total.value = result.total

    const activeBrand = result.list.find((brand) => brand.current)
    const nextBrand = activeBrand || result.list[0]
    if (nextBrand) {
      await selectBrand(nextBrand)
    } else {
      selectedBrand.value = undefined
      preview.value = undefined
    }
  } finally {
    loading.value = false
  }
}

const queryBrands = async () => {
  current.value = 1
  await loadBrands()
}

const resetFilters = async () => {
  filters.keyword = ''
  await queryBrands()
}

const saveTheme = async () => {
  if (!selectedBrand.value) return

  const result = await updateThemeBrand(selectedBrand.value.tenantId, {
    appTitle: themeForm.appTitle,
    logoUrl: themeForm.logoUrl,
    loginBackground: themeForm.loginBackground,
    primaryColor: themeForm.primaryColor,
    darkMode: themeForm.darkMode,
    compactMode: themeForm.compactMode,
  })

  if (!result.success) {
    actionMessage.value = result.reason || '主题保存失败'
    return
  }

  if (result.record) {
    selectedBrand.value = result.record
    brands.value = brands.value.map((brand) =>
      brand.tenantId === result.record?.tenantId ? result.record : brand
    )
    await loadPreview(result.record.tenantId)
  }
  actionMessage.value = '主题保存成功'
}

const handleApply = async (tenantId: string) => {
  const result = await applyThemeBrand(tenantId)
  brands.value = brands.value.map((brand) => ({
    ...brand,
    current: brand.tenantId === result.tenantId,
  }))
  actionMessage.value = `主题已应用：${result.appliedAt}`
  await loadPreview(result.tenantId)
}

onMounted(loadBrands)
</script>

<style scoped lang="scss">
.theme-center {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  color: #1d2939;
}

.theme-center__header,
.theme-center__filters,
.theme-center__layout,
.theme-center__panel-title {
  display: flex;
  gap: 16px;
}

.theme-center__header,
.theme-center__filters,
.theme-center__panel-title {
  align-items: center;
  justify-content: space-between;
}

.theme-center__breadcrumb {
  margin: 0 0 4px;
  color: #667085;
  font-size: 13px;
}

.theme-center h1,
.theme-center h2 {
  margin: 0;
}

.theme-center__current,
.theme-center__panel,
.theme-center__filters,
.theme-center__preview-card {
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
}

.theme-center__current {
  padding: 10px 14px;
}

.theme-center__current span,
.theme-center__panel-title span {
  color: #667085;
  font-size: 13px;
}

.theme-center__filters,
.theme-center__panel {
  padding: 16px;
}

.theme-center__layout {
  align-items: flex-start;
}

.theme-center__layout > .theme-center__panel {
  flex: 1;
  min-width: 0;
}

.theme-center__field {
  display: flex;
  flex: 1;
  min-width: 180px;
  flex-direction: column;
  gap: 6px;
}

.theme-center__field span,
.theme-center__check span {
  color: #475467;
  font-size: 13px;
}

.theme-center input {
  min-height: 34px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  padding: 0 10px;
  color: #1d2939;
}

.theme-center input[type='color'] {
  width: 100%;
  padding: 2px 4px;
}

.theme-center__actions {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.theme-center__button,
.theme-center__link-button,
.theme-center__brand-button {
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #344054;
  cursor: pointer;
}

.theme-center__button {
  min-height: 34px;
  padding: 0 14px;
}

.theme-center__button--primary {
  border-color: #165dff;
  background: #165dff;
  color: #fff;
}

.theme-center__brand-list {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.theme-center__brand {
  display: grid;
  gap: 12px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  padding: 12px;
}

.theme-center__brand.is-current {
  border-color: #165dff;
  background: #f5f8ff;
}

.theme-center__brand-button {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  padding: 0;
  text-align: left;
}

.theme-center__brand-button small,
.theme-center__preview-brand span {
  display: block;
  color: #667085;
  font-size: 12px;
}

.theme-center__swatch {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: 6px;
}

.theme-center dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.theme-center dt {
  color: #667085;
  font-size: 12px;
}

.theme-center dd {
  margin: 2px 0 0;
  font-weight: 600;
}

.theme-center__link-button {
  justify-self: flex-start;
  padding: 6px 10px;
}

.theme-center__check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.theme-center__check input {
  min-height: auto;
}

.theme-center__message {
  margin: 12px 0 0;
  color: #165dff;
}

.theme-center__preview {
  overflow: hidden;
}

.theme-center__preview-card {
  margin-top: 14px;
  padding: 16px;
  border-color: var(--theme-primary);
}

.theme-center__preview-card.is-dark {
  background: #101828;
  color: #f9fafb;
}

.theme-center__preview-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.theme-center__preview-brand img {
  width: 40px;
  height: 40px;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  object-fit: contain;
}

.theme-center__empty {
  padding: 18px;
  color: #667085;
  text-align: center;
}

@media (max-width: 900px) {
  .theme-center__header,
  .theme-center__filters,
  .theme-center__layout {
    flex-direction: column;
    align-items: stretch;
  }

  .theme-center dl {
    grid-template-columns: 1fr;
  }
}
</style>
