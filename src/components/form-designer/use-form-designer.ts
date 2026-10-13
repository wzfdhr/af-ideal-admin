import { ref, computed, Ref, watch, onBeforeUnmount } from 'vue'
import { useClipboard } from '@vueuse/core'
import { useUserStore } from '@/store'
import { getToken } from '@/services/auth'
import { tenantScope } from '@/services/tenant-context'
import { createCommandRetry } from '@/services/command-retry'
import {
  createFormSchema,
  fetchFormSchemas,
  getFormApplication,
  getFormSchemaDetail,
  publishFormSchema,
  saveFormSchema,
  submitFormRuntime,
} from '@/api/form-schema'
import { dataMode } from '../../../config/data-mode'
import {
  applyImportedFormSchema,
  exportFormSchema,
  migrateFormSchema,
  type VersionedFormSchema,
} from './schema'

type FormRendererExpose = {
  getValues: () => Record<string, unknown>
  validate: () => Promise<boolean>
}

// form designer actions
export const useFormDesignerActions = (
  ast: Ref<VersionedFormSchema>,
  formId: Ref<string>
) => {
  const retry = createCommandRetry()
  type DraftChoice = Awaited<
    ReturnType<typeof fetchFormSchemas>
  >['list'][number]
  const user = dataMode === 'reference' ? useUserStore() : undefined
  const draftPage = ref<DraftChoice[]>([])
  const selectedDraft = ref<Pick<DraftChoice, 'id' | 'name' | 'revision'>>()
  const draftChoices = computed(() => {
    const selected = selectedDraft.value
    if (!selected) return draftPage.value
    if (!draftPage.value.some((item) => item.id === selected.id))
      return [selected, ...draftPage.value]
    return draftPage.value.map((item) =>
      item.id === selected.id ? selected : item
    )
  })
  const draftKeyword = ref('')
  const draftCurrent = ref(1)
  const draftPageSize = ref(20)
  const draftTotal = ref(0)
  const catalogueLoading = ref(false)
  const catalogueError = ref('')
  let catalogueGeneration = 0
  let loadGeneration = 0
  let identityGeneration = 0
  let disposed = false
  const scope = () => ({
    tenant: tenantScope.snapshot(),
    token: getToken(),
    identity: identityGeneration,
  })
  const currentScope = (captured: ReturnType<typeof scope>) =>
    !disposed &&
    captured.identity === identityGeneration &&
    captured.token === getToken() &&
    tenantScope.isCurrent(captured.tenant)
  const draftRevision = ref<number>()
  const source = computed(() => exportFormSchema(ast.value))
  const actionMessage = ref('')
  const actionError = ref('')
  const creating = ref(false)
  const loading = ref(false)
  const previewVisible = ref(false)
  const previewRendererRef = ref<FormRendererExpose>()
  const dataSourceEditorVisible = ref(false)
  const importVisible = ref(false)
  const importSource = ref('')
  const importError = ref('')
  const publishing = ref(false)
  const saving = ref(false)
  const submittingPreview = ref(false)

  const { copy, copied } = useClipboard({
    source,
  })

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback

  const showPreview = () => {
    try {
      ast.value = migrateFormSchema(ast.value)
      actionError.value = ''
      previewVisible.value = true
    } catch (error) {
      actionError.value = getErrorMessage(error, '表单预览失败')
    }
  }

  const showDataSourceEditor = () => {
    dataSourceEditorVisible.value = true
  }

  const searchDrafts = async (current = 1) => {
    const captured = scope()
    const generation = ++catalogueGeneration
    const requestedPage = Math.max(1, Math.floor(current))
    catalogueLoading.value = true
    catalogueError.value = ''
    try {
      const page = await fetchFormSchemas({
        current: requestedPage,
        pageSize: draftPageSize.value,
        keyword: draftKeyword.value.trim(),
      })
      if (!currentScope(captured) || generation !== catalogueGeneration)
        return undefined
      draftPage.value = page.list
      draftTotal.value = page.total
      draftCurrent.value = requestedPage
      return page
    } catch (error) {
      if (currentScope(captured) && generation === catalogueGeneration)
        catalogueError.value = getErrorMessage(error, '草稿目录加载失败')
    } finally {
      if (!disposed && generation === catalogueGeneration)
        catalogueLoading.value = false
    }
    return undefined
  }
  const changeDraftPageSize = async (size: number) => {
    if (![20, 100].includes(size)) return
    draftPageSize.value = size
    await searchDrafts(1)
  }
  const loadDraft = async (id = formId.value) => {
    if (saving.value || creating.value) return
    const captured = scope()
    const generation = ++loadGeneration
    loading.value = true
    actionMessage.value = ''
    actionError.value = ''
    try {
      let target = id
      if (dataMode === 'reference' && !target) {
        const page = await searchDrafts()
        if (!currentScope(captured) || generation !== loadGeneration) return
        target = page?.list[0]?.id || ''
        if (!target) return
      }
      const result = await getFormSchemaDetail(target)
      if (!currentScope(captured) || generation !== loadGeneration) return
      const schema = migrateFormSchema(result.schema)
      draftRevision.value = result.revision
      selectedDraft.value = {
        id: result.id,
        name: result.name,
        revision: result.revision,
      }
      retry.clear()
      formId.value = result.id
      ast.value = schema
      actionMessage.value = '加载成功'
    } catch (error) {
      if (currentScope(captured) && generation === loadGeneration)
        actionError.value = getErrorMessage(error, '加载失败')
    } finally {
      if (!disposed && generation === loadGeneration) loading.value = false
    }
  }
  const clearIdentity = () => {
    identityGeneration += 1
    catalogueGeneration += 1
    loadGeneration += 1
    draftPage.value = []
    selectedDraft.value = undefined
    draftRevision.value = undefined
    draftKeyword.value = ''
    draftCurrent.value = 1
    draftTotal.value = 0
    formId.value = ''
    ast.value = migrateFormSchema({})
    retry.clear()
    actionMessage.value = ''
    actionError.value = ''
    catalogueError.value = ''
    loading.value = false
    catalogueLoading.value = false
    creating.value = false
    saving.value = false
    publishing.value = false
    previewVisible.value = false
    dataSourceEditorVisible.value = false
    importVisible.value = false
    importSource.value = ''
    importError.value = ''
  }
  if (user)
    watch(
      () => [user.id, user.tenantId, user.permissions.join('|')],
      clearIdentity,
      { flush: 'sync' }
    )
  onBeforeUnmount(() => {
    disposed = true
    identityGeneration += 1
  })

  const showImportSchema = () => {
    importSource.value = ''
    importError.value = ''
    importVisible.value = true
  }

  const applyImportSchema = () => {
    try {
      applyImportedFormSchema(ast, importSource.value)
      importVisible.value = false
      importError.value = ''
      actionError.value = ''
      actionMessage.value = '导入成功'
      return true
    } catch (error) {
      importError.value = getErrorMessage(error, '表单 schema 导入失败')
      return false
    }
  }

  const createDraft = async (name = '未命名表单') => {
    if (creating.value || saving.value || loading.value) return
    const captured = scope()
    creating.value = true
    actionMessage.value = ''
    actionError.value = ''

    try {
      const input = { name, schema: ast.value }
      const result =
        dataMode === 'reference'
          ? await createFormSchema(input, retry.key('create', input))
          : await createFormSchema(input)
      if (!currentScope(captured)) return
      draftRevision.value = result.revision
      selectedDraft.value = {
        id: result.id,
        name: result.name || name,
        revision: result.revision,
      }
      retry.complete('create')
      formId.value = result.id
      if (result.schema) {
        ast.value = result.schema
      }
      actionMessage.value = '创建成功'
    } catch (failure) {
      if (currentScope(captured))
        actionError.value = getErrorMessage(failure, '创建失败，输入已保留')
    } finally {
      if (currentScope(captured)) creating.value = false
    }
  }

  const saveDraft = async () => {
    if (saving.value || creating.value || loading.value) return
    const captured = scope()
    saving.value = true
    actionMessage.value = ''
    actionError.value = ''

    try {
      if (dataMode === 'reference') {
        if (!formId.value || !draftRevision.value)
          throw new Error('请先选择或创建真实草稿')
        const input = {
          schema: ast.value,
          expectedRevision: draftRevision.value,
        }
        const result = await saveFormSchema(
          formId.value,
          ast.value,
          draftRevision.value,
          retry.key('save', input)
        )
        if (!currentScope(captured)) return
        draftRevision.value = result.revision
        if (selectedDraft.value) selectedDraft.value.revision = result.revision
        retry.complete('save')
      } else await saveFormSchema(formId.value, ast.value)
      if (currentScope(captured)) actionMessage.value = '保存成功'
    } catch (failure) {
      if (currentScope(captured))
        actionError.value = getErrorMessage(failure, '保存失败，输入已保留')
    } finally {
      if (currentScope(captured)) saving.value = false
    }
  }

  const publishCurrent = async () => {
    const captured = scope()
    publishing.value = true
    actionMessage.value = ''
    actionError.value = ''

    try {
      if (dataMode === 'reference') {
        const app = await getFormApplication(formId.value)
        if (!currentScope(captured)) return
        if (!app)
          throw new Error(
            '此草稿尚未关联应用，请在应用中心配置并发布应用表单与流程'
          )
        window.location.assign(
          app.id === 'leave'
            ? '/leave/application'
            : `/applications/${encodeURIComponent(app.id)}/configuration`
        )
        return
      }
      const validatedSchema = migrateFormSchema(ast.value)
      ast.value = validatedSchema
      await publishFormSchema(formId.value, validatedSchema)
      if (currentScope(captured)) actionMessage.value = '发布成功'
    } catch (error) {
      if (currentScope(captured))
        actionError.value = getErrorMessage(error, '发布失败')
    } finally {
      if (currentScope(captured)) publishing.value = false
    }
  }

  const submitPreview = async () => {
    submittingPreview.value = true
    actionMessage.value = ''
    actionError.value = ''

    try {
      const renderer = previewRendererRef.value
      if (!renderer) {
        throw new Error('预览表单未初始化')
      }

      const valid = await renderer.validate()
      if (!valid) {
        actionError.value = '表单校验未通过'
        return
      }

      const result = await submitFormRuntime(formId.value, renderer.getValues())
      actionMessage.value =
        result?.mode === 'preview' ? '试提交校验通过（未创建申请）' : '提交成功'
    } catch (error) {
      actionError.value = getErrorMessage(error, '提交失败')
    } finally {
      submittingPreview.value = false
    }
  }

  return {
    actionError,
    actionMessage,
    applyImportSchema,
    copy,
    copied,
    createDraft,
    creating,
    dataSourceEditorVisible,
    importError,
    importSource,
    importVisible,
    loadDraft,
    draftChoices,
    draftKeyword,
    draftCurrent,
    draftPageSize,
    draftTotal,
    catalogueLoading,
    catalogueError,
    searchDrafts,
    changeDraftPageSize,
    loading,
    publishCurrent,
    publishing,
    previewRendererRef,
    previewVisible,
    saveDraft,
    saving,
    showDataSourceEditor,
    showImportSchema,
    showPreview,
    submitPreview,
    submittingPreview,
  }
}

export const useFormDesigner = () => {
  const ast = ref<VersionedFormSchema>(migrateFormSchema({}))
  const formId = ref(
    dataMode === 'reference' ? '' : 'form-customer-registration'
  )

  return { ast, formId }
}
