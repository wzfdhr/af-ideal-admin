import { ref, computed, Ref } from 'vue'
import { useClipboard } from '@vueuse/core'
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
  const draftChoices = ref<
    Awaited<ReturnType<typeof fetchFormSchemas>>['list']
  >([])
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

  const loadDraft = async (id = formId.value) => {
    loading.value = true
    actionMessage.value = ''
    actionError.value = ''

    try {
      let target = id
      if (dataMode === 'reference') {
        const page = await fetchFormSchemas({ current: 1, pageSize: 100 })
        draftChoices.value = page.list
        target = target || page.list[0]?.id || ''
        if (!target) {
          formId.value = ''
          draftRevision.value = undefined
          ast.value = migrateFormSchema({})
          return
        }
      }
      const result = await getFormSchemaDetail(target)
      draftRevision.value = result.revision
      retry.clear()
      formId.value = result.id
      ast.value = migrateFormSchema(result.schema)
      actionMessage.value = '加载成功'
    } catch (error) {
      actionError.value = getErrorMessage(error, '加载失败')
    } finally {
      loading.value = false
    }
  }

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
    creating.value = true
    actionMessage.value = ''
    actionError.value = ''

    try {
      const input = { name, schema: ast.value }
      const result =
        dataMode === 'reference'
          ? await createFormSchema(input, retry.key('create', input))
          : await createFormSchema(input)
      draftRevision.value = result.revision
      retry.complete('create')
      formId.value = result.id
      if (result.schema) {
        ast.value = result.schema
      }
      actionMessage.value = '创建成功'
    } catch (failure) {
      actionError.value = getErrorMessage(failure, '创建失败，输入已保留')
    } finally {
      creating.value = false
    }
  }

  const saveDraft = async () => {
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
        draftRevision.value = result.revision
        retry.complete('save')
      } else await saveFormSchema(formId.value, ast.value)
      actionMessage.value = '保存成功'
    } catch (failure) {
      actionError.value = getErrorMessage(failure, '保存失败，输入已保留')
    } finally {
      saving.value = false
    }
  }

  const publishCurrent = async () => {
    publishing.value = true
    actionMessage.value = ''
    actionError.value = ''

    try {
      if (dataMode === 'reference') {
        const app = await getFormApplication(formId.value)
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
      actionMessage.value = '发布成功'
    } catch (error) {
      actionError.value = getErrorMessage(error, '发布失败')
    } finally {
      publishing.value = false
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
