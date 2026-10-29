<template>
  <main class="tenant-brand" data-testid="tenant-brand-page">
    <header class="tenant-brand__header">
      <div>
        <p>主题中心 / 当前租户品牌</p>
        <h1>品牌与个人显示偏好</h1>
        <small>来源：server · 当前租户与成员身份</small>
      </div>
      <button type="button" :disabled="loading || busy" @click="load">
        刷新
      </button>
    </header>

    <section v-if="mockUnavailable" class="tenant-brand__state">
      开发 Mock 模式未接入租户品牌、文件扫描和成员偏好事实。
    </section>
    <template v-else>
      <section v-if="error" class="tenant-brand__state is-error" role="alert">
        {{ error }}
      </section>
      <section
        v-if="rights"
        class="tenant-brand__state is-error"
        data-testid="tenant-brand-rights"
      >
        当前身份不能管理品牌草稿；已清除草稿、版本和文件信息。
      </section>
      <section v-if="loading" class="tenant-brand__state" aria-live="polite">
        正在读取当前租户品牌…
      </section>

      <section v-if="runtime" class="tenant-brand__runtime">
        <div>
          <h2>{{ runtime.branding.brandName }}</h2>
          <p>{{ runtime.branding.title }}</p>
          <p>
            {{
              runtime.preferences.effective.appearance === 'dark'
                ? '深色'
                : '浅色'
            }}
            · {{ runtime.preferences.effective.compact ? '紧凑' : '标准' }} ·
            {{ runtime.preferences.effective.locale }} ·
            {{ runtime.branding.primaryColor }}
          </p>
        </div>
        <img
          v-if="logoPreviewUrl"
          :src="logoPreviewUrl"
          alt="当前租户品牌 Logo"
          data-testid="tenant-brand-logo-preview"
        />
        <p v-else>当前品牌没有可用 Logo。</p>
      </section>

      <form
        v-if="preferences"
        class="tenant-brand__panel"
        aria-label="我的显示偏好"
        @submit.prevent="savePreferences"
      >
        <h2>我的显示偏好</h2>
        <p>留空表示继承租户当前默认值；有效值由服务器按当前成员计算。</p>
        <label>
          语言
          <select
            v-model="preferenceDraft.locale"
            data-testid="brand-pref-locale"
          >
            <option value="">继承（{{ preferences.effective.locale }}）</option>
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
        </label>
        <label>
          明暗
          <select
            v-model="preferenceDraft.appearance"
            data-testid="brand-pref-appearance"
          >
            <option value="">
              继承（{{
                preferences.effective.appearance === 'dark' ? '深色' : '浅色'
              }}）
            </option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
        <label>
          密度
          <select
            v-model="preferenceDraft.compact"
            data-testid="brand-pref-compact"
          >
            <option value="">
              继承（{{ preferences.effective.compact ? '紧凑' : '标准' }}）
            </option>
            <option value="true">紧凑</option>
            <option value="false">标准</option>
          </select>
        </label>
        <button type="submit" :disabled="busy" data-testid="brand-pref-save">
          保存我的偏好
        </button>
      </form>

      <template v-if="canManage && configuration">
        <section class="tenant-brand__comparison">
          <article>
            <h2>已应用版本</h2>
            <template v-if="configuration.activeVersion">
              <p>版本 {{ configuration.activeVersion.versionNumber }}</p>
              <p>{{ configuration.activeVersion.snapshot.brandName }}</p>
              <p>{{ configuration.activeVersion.snapshot.title }}</p>
              <code>{{ configuration.activeVersion.contentHash }}</code>
            </template>
            <p v-else>尚未应用品牌版本。</p>
          </article>
          <article :class="{ 'is-pending': configuration.pendingApply }">
            <h2>已保存草稿</h2>
            <p>草稿修订 {{ configuration.draftRevision }}</p>
            <p>{{ configuration.draft.brandName }}</p>
            <p>{{ configuration.draft.title }}</p>
            <strong>
              {{
                configuration.pendingApply
                  ? '与活动版本不同，等待应用'
                  : '与活动版本一致'
              }}
            </strong>
          </article>
        </section>

        <form
          class="tenant-brand__panel tenant-brand__editor"
          aria-label="租户品牌草稿"
          @submit.prevent="saveDraft"
        >
          <h2>编辑品牌草稿</h2>
          <label>
            品牌名称
            <input
              v-model="draft.brandName"
              data-testid="brand-name"
              maxlength="64"
            />
          </label>
          <label>
            系统标题
            <input
              v-model="draft.title"
              data-testid="brand-title"
              maxlength="100"
            />
          </label>
          <label>
            主色
            <input v-model="draft.primaryColor" data-testid="brand-color" />
          </label>
          <label>
            默认明暗
            <select v-model="draft.appearance" data-testid="brand-appearance">
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
          <label>
            默认语言
            <select v-model="draft.defaultLocale" data-testid="brand-locale">
              <option value="zh-CN">中文</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <label class="tenant-brand__check">
            <input
              v-model="draft.compact"
              type="checkbox"
              data-testid="brand-compact"
            />
            默认紧凑布局
          </label>
          <label>
            已扫描 Logo 文件
            <select v-model="draftLogoFileId" data-testid="brand-logo-file">
              <option value="">不使用 Logo</option>
              <option
                v-for="file in readyLogoFiles"
                :key="file.id"
                :value="file.id"
              >
                {{ file.fileName }} · {{ file.size }} 字节 ·
                {{ file.scanEngine }}
              </option>
            </select>
          </label>
          <button
            type="button"
            data-testid="brand-logo-clear"
            @click="clearLogo"
          >
            明确清除 Logo
          </button>
          <label v-if="canUpload">
            上传 PNG/JPEG（最多 2 MiB，1–1024 像素）
            <input
              type="file"
              accept="image/png,image/jpeg"
              data-testid="brand-logo-upload"
              :disabled="busy"
              @change="uploadLogo"
            />
          </label>
          <button
            v-if="canListFiles"
            type="button"
            data-testid="brand-logo-refresh"
            :disabled="busy"
            @click="loadFiles"
          >
            刷新真实扫描状态
          </button>
          <p v-if="uploadMessage">{{ uploadMessage }}</p>
          <div class="tenant-brand__actions">
            <button
              type="submit"
              :disabled="busy"
              data-testid="brand-draft-save"
            >
              保存草稿
            </button>
            <button
              type="button"
              :disabled="
                busy || !configuration.allowedActions.includes('apply')
              "
              data-testid="brand-apply"
              @click="applyDraft"
            >
              应用当前已保存草稿
            </button>
          </div>
        </form>

        <section class="tenant-brand__panel">
          <h2>不可变应用版本</h2>
          <p v-if="!versions.length">尚无品牌版本。</p>
          <ol v-else>
            <li v-for="item in versions" :key="item.id">
              v{{ item.versionNumber }} · {{ item.snapshot.brandName }} ·
              {{ item.appliedAt }} · {{ item.contentHash }}
            </li>
          </ol>
          <div class="tenant-brand__actions">
            <button
              type="button"
              :disabled="busy || versionPage.current <= 1"
              @click="changeVersionPage(versionPage.current - 1)"
            >
              上一页
            </button>
            <span>
              第 {{ versionPage.current }} / {{ versionPageCount }} 页
            </span>
            <button
              type="button"
              :disabled="busy || versionPage.current >= versionPageCount"
              @click="changeVersionPage(versionPage.current + 1)"
            >
              下一页
            </button>
          </div>
        </section>
      </template>
      <p v-if="notice" class="tenant-brand__notice" role="status">
        {{ notice }}
      </p>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  TENANT_BRANDING_REFRESH_EVENT,
  applyTenantBrandDraft,
  fetchMembershipPreferences,
  fetchTenantBrandConfiguration,
  fetchTenantBrandRuntime,
  fetchTenantBrandVersions,
  saveTenantBrandDraft,
  updateMembershipPreferences,
} from '@/api/tenant-branding'
import { listStoredFiles, uploadStoredFile } from '@/api/stored-files'
import type { StoredFile } from '@/api/stored-files'
import { ApiRequestError } from '@/api/request-client'
import { getToken } from '@/services/auth'
import { tenantScope } from '@/services/tenant-context'
import { fetchVerifiedTenantBrandLogo } from '@/services/tenant-brand-runtime'
import useUserStore from '@/store/modules/user'
import {
  TENANT_BRAND_DEFAULT_PRIMARY_COLOR,
  TENANT_BRAND_LOGO_MAX_BYTES,
  TENANT_BRAND_LOGO_MAX_DIMENSION,
  TENANT_BRAND_LOGO_MIME_TYPES,
  TENANT_BRAND_LOGO_MIN_DIMENSION,
  TENANT_BRAND_PERMISSIONS,
  parseMembershipPreferencesUpdate,
  parseTenantBrandApply,
  parseTenantBrandDraftSave,
} from '@af-admin/contracts'
import { dataMode } from '../../../../config/data-mode'
import type {
  MembershipPreferencesV1,
  TenantBrandConfigurationV1,
  TenantBrandDraftV1,
  TenantBrandRuntimeV1,
  TenantBrandVersionPageV1,
} from '@af-admin/contracts'

const mockUnavailable = dataMode === 'mock' && import.meta.env.MODE !== 'test'
const user = useUserStore()
const runtime = ref<TenantBrandRuntimeV1 | null>(null)
const preferences = ref<MembershipPreferencesV1 | null>(null)
const configuration = ref<TenantBrandConfigurationV1 | null>(null)
const versions = ref<TenantBrandVersionPageV1['list']>([])
const files = ref<StoredFile[]>([])
const loading = ref(false)
const busy = ref(false)
const rights = ref(false)
const error = ref('')
const notice = ref('')
const uploadMessage = ref('')
const logoPreviewUrl = ref('')
const draftLogoFileId = ref('')
const versionPage = reactive({ current: 1, pageSize: 20, total: 0 })
const draft = reactive<TenantBrandDraftV1>({
  version: 1,
  brandName: '品牌',
  title: '管理平台',
  logoFileId: null,
  primaryColor: TENANT_BRAND_DEFAULT_PRIMARY_COLOR,
  appearance: 'light',
  compact: false,
  defaultLocale: 'zh-CN',
})
const preferenceDraft = reactive({ locale: '', appearance: '', compact: '' })
let generation = 0
let commandGeneration = 0
let mounted = true
let draftKey = ''
let draftSignature = ''
let preferenceKey = ''
let preferenceSignature = ''

const has = (permission: string) =>
  user.permissions.includes('*') || user.permissions.includes(permission)
const canManage = computed(() => has(TENANT_BRAND_PERMISSIONS.manage))
const canUpload = computed(() => has('file:upload'))
const canListFiles = computed(() => has('file:list'))
const readyLogoFiles = computed(() =>
  files.value.filter(
    (file) =>
      file.status === 'ready' &&
      TENANT_BRAND_LOGO_MIME_TYPES.includes(
        file.mimeType as typeof TENANT_BRAND_LOGO_MIME_TYPES[number]
      ) &&
      file.size <= TENANT_BRAND_LOGO_MAX_BYTES
  )
)
const versionPageCount = computed(() =>
  Math.max(1, Math.ceil(versionPage.total / versionPage.pageSize))
)
const identityKey = computed(() =>
  JSON.stringify({
    id: user.id || null,
    tenantId: user.tenantId || null,
    permissions: [...user.permissions].sort(),
  })
)
const sameIdentity = (
  scope: ReturnType<typeof tenantScope.snapshot>,
  token: string | null,
  actor: string | null,
  identity: string
) =>
  mounted &&
  tenantScope.isCurrent(scope) &&
  getToken() === token &&
  user.id === actor &&
  !tenantScope.isTransitioning() &&
  identityKey.value === identity
const snapshot = () => ({
  scope: tenantScope.snapshot(),
  token: getToken(),
  actor: user.id || null,
  identity: identityKey.value,
})
const isCurrent = (value: ReturnType<typeof snapshot>) =>
  sameIdentity(value.scope, value.token, value.actor, value.identity)
const message = (failure: unknown) => {
  if (failure instanceof ApiRequestError) return failure.context.displayMessage
  if (failure instanceof Error) return failure.message
  return '租户品牌请求失败'
}
const isRights = (failure: unknown) =>
  failure instanceof ApiRequestError &&
  ['forbidden', 'unauthorized'].includes(failure.context.kind)
const revokePreview = () => {
  if (logoPreviewUrl.value) URL.revokeObjectURL(logoPreviewUrl.value)
  logoPreviewUrl.value = ''
}
const clearManagement = () => {
  configuration.value = null
  versions.value = []
  files.value = []
  versionPage.total = 0
  draftLogoFileId.value = ''
}
const clearRuntime = () => {
  runtime.value = null
  preferences.value = null
  revokePreview()
}
const syncDraft = (value: TenantBrandConfigurationV1) => {
  Object.assign(draft, value.draft)
  draftLogoFileId.value = value.draft.logoFileId || ''
}
const syncPreferences = (value: MembershipPreferencesV1) => {
  preferences.value = value
  Object.assign(preferenceDraft, {
    locale: value.values.locale || '',
    appearance: value.values.appearance || '',
    compact: value.values.compact === null ? '' : String(value.values.compact),
  })
}
const loadPreview = async (
  value: TenantBrandRuntimeV1,
  current: ReturnType<typeof snapshot>,
  run: number
) => {
  revokePreview()
  if (value.logo?.status !== 'ready') return
  try {
    const blob = await fetchVerifiedTenantBrandLogo(value.logo.metadata)
    if (run !== generation || !isCurrent(current)) return
    logoPreviewUrl.value = URL.createObjectURL(blob)
  } catch {
    if (run === generation && isCurrent(current)) logoPreviewUrl.value = ''
  }
}
const loadFiles = async () => {
  if (!canManage.value || !canListFiles.value) return
  const run = generation
  const current = snapshot()
  try {
    const result = await listStoredFiles()
    if (run !== generation || !isCurrent(current)) return
    files.value = result.list
  } catch (failure) {
    if (run !== generation || !isCurrent(current)) return
    if (isRights(failure)) {
      rights.value = true
      clearManagement()
    } else error.value = message(failure)
  }
}
const load = async () => {
  if (mockUnavailable) return
  const run = ++generation
  const current = snapshot()
  loading.value = true
  error.value = ''
  notice.value = ''
  runtime.value = null
  preferences.value = null
  revokePreview()
  if (!canManage.value) clearManagement()
  try {
    const nextRuntime = await fetchTenantBrandRuntime()
    if (run !== generation || !isCurrent(current)) return
    if (
      nextRuntime.source !== 'server' ||
      nextRuntime.tenantId !== user.tenantId ||
      nextRuntime.preferences.tenantId !== user.tenantId ||
      nextRuntime.preferences.userId !== user.id
    )
      throw new Error('品牌运行态身份或租户不匹配')
    runtime.value = nextRuntime
    syncPreferences(nextRuntime.preferences)
    await loadPreview(nextRuntime, current, run)
    if (canManage.value) {
      const [nextConfiguration, history] = await Promise.all([
        fetchTenantBrandConfiguration(),
        fetchTenantBrandVersions({
          current: versionPage.current,
          pageSize: versionPage.pageSize,
        }),
      ])
      if (run !== generation || !isCurrent(current)) return
      if (nextConfiguration.source !== 'server' || history.source !== 'server')
        throw new Error('品牌管理投影来源无效')
      configuration.value = nextConfiguration
      syncDraft(nextConfiguration)
      versions.value = history.list
      const maxPage = Math.max(1, Math.ceil(history.total / history.pageSize))
      if (versionPage.current > maxPage) {
        versionPage.current = maxPage
        await load()
        return
      }
      Object.assign(versionPage, {
        current: history.current,
        pageSize: history.pageSize,
        total: history.total,
      })
      await loadFiles()
      rights.value = false
    }
  } catch (failure) {
    if (run !== generation || !isCurrent(current)) return
    if (isRights(failure) && canManage.value) {
      rights.value = true
      clearManagement()
    } else error.value = message(failure)
  } finally {
    if (run === generation) loading.value = false
  }
}
const dispatchRefresh = (kind: 'brand' | 'preferences') => {
  window.dispatchEvent(
    new CustomEvent(TENANT_BRANDING_REFRESH_EVENT, {
      detail: { kind, tenantId: user.tenantId || null },
    })
  )
}
const savePreferences = async () => {
  if (busy.value || !preferences.value) return
  const run = ++commandGeneration
  const current = snapshot()
  busy.value = true
  error.value = ''
  try {
    const fresh = await fetchMembershipPreferences()
    if (run !== commandGeneration || !isCurrent(current)) return
    if (fresh.revision !== preferences.value.revision)
      throw new Error('个人偏好已被其他会话更新，请刷新后重试')
    const input = parseMembershipPreferencesUpdate({
      version: 1,
      expectedRevision: fresh.revision,
      locale: preferenceDraft.locale || null,
      appearance: preferenceDraft.appearance || null,
      compact:
        preferenceDraft.compact === ''
          ? null
          : preferenceDraft.compact === 'true',
    })
    const signature = JSON.stringify(input)
    if (signature !== preferenceSignature) preferenceKey = ''
    preferenceSignature = signature
    preferenceKey ||= crypto.randomUUID()
    const saved = await updateMembershipPreferences(input, preferenceKey)
    if (run !== commandGeneration || !isCurrent(current)) return
    preferenceKey = ''
    preferenceSignature = ''
    syncPreferences(saved)
    notice.value = '个人偏好已保存。'
    dispatchRefresh('preferences')
  } catch (failure) {
    if (run !== commandGeneration || !isCurrent(current)) return
    if (isRights(failure)) clearRuntime()
    error.value = message(failure)
  } finally {
    if (run === commandGeneration) busy.value = false
  }
}
const saveDraft = async () => {
  if (busy.value || !configuration.value || !canManage.value) return
  const run = ++commandGeneration
  const current = snapshot()
  busy.value = true
  error.value = ''
  try {
    const fresh = await fetchTenantBrandConfiguration()
    if (run !== commandGeneration || !isCurrent(current)) return
    if (fresh.revision !== configuration.value.revision)
      throw new Error('品牌配置已被其他管理员更新，请刷新后重试')
    const input = parseTenantBrandDraftSave({
      version: 1,
      expectedRevision: fresh.revision,
      draft: {
        ...draft,
        logoFileId: draftLogoFileId.value || null,
      },
    })
    const signature = JSON.stringify(input)
    if (signature !== draftSignature) draftKey = ''
    draftSignature = signature
    draftKey ||= crypto.randomUUID()
    const saved = await saveTenantBrandDraft(input, draftKey)
    if (run !== commandGeneration || !isCurrent(current)) return
    draftKey = ''
    draftSignature = ''
    configuration.value = saved
    syncDraft(saved)
    notice.value = '品牌草稿已保存，尚未应用。'
  } catch (failure) {
    if (run !== commandGeneration || !isCurrent(current)) return
    if (isRights(failure)) {
      rights.value = true
      clearManagement()
    } else error.value = message(failure)
  } finally {
    if (run === commandGeneration) busy.value = false
  }
}
const applyDraft = async () => {
  if (busy.value || !configuration.value || !canManage.value) return
  const run = ++commandGeneration
  const current = snapshot()
  busy.value = true
  error.value = ''
  try {
    const fresh = await fetchTenantBrandConfiguration()
    if (run !== commandGeneration || !isCurrent(current)) return
    if (fresh.revision !== configuration.value.revision)
      throw new Error('品牌配置已被其他管理员更新，请刷新后重试')
    const input = parseTenantBrandApply({
      version: 1,
      expectedRevision: fresh.revision,
    })
    const saved = await applyTenantBrandDraft(input, crypto.randomUUID())
    if (run !== commandGeneration || !isCurrent(current)) return
    configuration.value = saved
    syncDraft(saved)
    notice.value = '当前已保存草稿已应用。'
    dispatchRefresh('brand')
    await load()
  } catch (failure) {
    if (run !== commandGeneration || !isCurrent(current)) return
    if (isRights(failure)) {
      rights.value = true
      clearManagement()
    } else error.value = message(failure)
  } finally {
    if (run === commandGeneration) busy.value = false
  }
}
const imageDimensions = async (file: File) => {
  const bitmap = await createImageBitmap(file)
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}
const uploadLogo = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || busy.value) return
  const run = ++commandGeneration
  const current = snapshot()
  const operationCurrent = () =>
    run === commandGeneration &&
    isCurrent(current) &&
    canManage.value &&
    canUpload.value
  busy.value = true
  error.value = ''
  uploadMessage.value = ''
  try {
    if (
      !TENANT_BRAND_LOGO_MIME_TYPES.includes(
        file.type as typeof TENANT_BRAND_LOGO_MIME_TYPES[number]
      ) ||
      !file.size ||
      file.size > TENANT_BRAND_LOGO_MAX_BYTES
    )
      throw new Error('Logo 仅支持不超过2MiB的PNG或JPEG')
    const dimensions = await imageDimensions(file)
    if (!operationCurrent()) return
    if (
      dimensions.width < TENANT_BRAND_LOGO_MIN_DIMENSION ||
      dimensions.height < TENANT_BRAND_LOGO_MIN_DIMENSION ||
      dimensions.width > TENANT_BRAND_LOGO_MAX_DIMENSION ||
      dimensions.height > TENANT_BRAND_LOGO_MAX_DIMENSION
    )
      throw new Error('Logo 宽高必须为1至1024像素')
    const uploaded = await uploadStoredFile(
      file,
      undefined,
      undefined,
      operationCurrent
    )
    if (!operationCurrent()) return
    uploadMessage.value = `文件 ${uploaded.id} 已上传；请刷新真实扫描状态，通过后再选择。`
    await loadFiles()
  } catch (failure) {
    if (!operationCurrent()) return
    if (isRights(failure)) {
      rights.value = true
      clearManagement()
    } else error.value = message(failure)
  } finally {
    if (run === commandGeneration) {
      busy.value = false
      input.value = ''
    }
  }
}
const clearLogo = () => {
  draftLogoFileId.value = ''
  notice.value = '保存草稿后将以明确 null 清除 Logo。'
}
const changeVersionPage = async (current: number) => {
  versionPage.current = current
  await load()
}

watch(identityKey, () => {
  generation += 1
  commandGeneration += 1
  clearRuntime()
  clearManagement()
  busy.value = false
  error.value = ''
  rights.value = false
  load()
})
onMounted(load)
onBeforeUnmount(() => {
  mounted = false
  generation += 1
  commandGeneration += 1
  revokePreview()
})
</script>

<style scoped>
.tenant-brand {
  min-height: 100%;
  padding: 24px;
  color: var(--color-text-1);
  background: var(--color-fill-1);
}
.tenant-brand__header,
.tenant-brand__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
h1,
h2,
p {
  margin: 0;
}
.tenant-brand__header {
  margin-bottom: 16px;
}
.tenant-brand__state,
.tenant-brand__runtime,
.tenant-brand__panel,
.tenant-brand__comparison article {
  padding: 18px;
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
  background: var(--color-bg-2);
}
.tenant-brand__state,
.tenant-brand__panel,
.tenant-brand__comparison,
.tenant-brand__runtime {
  margin-bottom: 16px;
}
.tenant-brand__state.is-error {
  color: rgb(var(--danger-6));
  border-color: rgb(var(--danger-3));
}
.tenant-brand__runtime {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.tenant-brand__runtime img {
  width: 96px;
  height: 96px;
  object-fit: contain;
}
.tenant-brand__comparison {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.tenant-brand__comparison .is-pending {
  border-color: rgb(var(--warning-6));
}
.tenant-brand__panel {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.tenant-brand__panel h2,
.tenant-brand__panel p,
.tenant-brand__panel ol,
.tenant-brand__actions {
  grid-column: 1 / -1;
}
.tenant-brand__panel label {
  display: grid;
  gap: 6px;
}
.tenant-brand__panel input,
.tenant-brand__panel select,
button {
  min-height: 38px;
}
.tenant-brand__check {
  display: flex !important;
  align-items: center;
}
.tenant-brand__notice {
  color: rgb(var(--success-6));
}
@media (max-width: 900px) {
  .tenant-brand__comparison,
  .tenant-brand__panel {
    grid-template-columns: 1fr;
  }
}
</style>
