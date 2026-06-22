import { ref, computed, h, getCurrentInstance, onMounted, Ref } from 'vue'
import { useClipboard } from '@vueuse/core'
import { FormRenderer } from '@/components/form-runtime'
import {
  createFormSchema,
  publishFormSchema,
  saveFormSchema,
} from '@/api/form-schema'
import {
  applyImportedFormSchema,
  exportFormSchema,
  migrateFormSchema,
  type VersionedFormSchema,
} from './schema'
import type { ModalMethod } from '@arco-design/web-vue'

// form designer actions
export const useFormDesignerActions = (
  ast: Ref<VersionedFormSchema>,
  formId: Ref<string>
) => {
  const source = computed(() => exportFormSchema(ast.value))
  const actionMessage = ref('')
  const creating = ref(false)
  const previewVisible = ref(false)
  const dataSourceEditorVisible = ref(false)
  const importVisible = ref(false)
  const importSource = ref('')
  const importError = ref('')
  const publishing = ref(false)
  const saving = ref(false)

  const { copy, copied } = useClipboard({
    source,
  })

  let Modal: ModalMethod | undefined

  onMounted(() => {
    Modal = getCurrentInstance()?.appContext.config.globalProperties.$modal
  })
  const showPreview = () => {
    Modal?.open({
      title: '表单预览',
      content: () =>
        h('div', {}, [
          h(FormRenderer, {
            ast: ast.value,
          }),
        ]),
      fullscreen: true,
    })
  }

  const showDataSourceEditor = () => {
    dataSourceEditorVisible.value = true
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
      return true
    } catch (error) {
      importError.value =
        error instanceof Error ? error.message : '表单 schema 导入失败'
      return false
    }
  }

  const createDraft = async (name = '未命名表单') => {
    creating.value = true
    actionMessage.value = ''

    try {
      const result = await createFormSchema({
        name,
        schema: ast.value,
      })
      formId.value = result.id
      if (result.schema) {
        ast.value = result.schema
      }
      actionMessage.value = '创建成功'
    } finally {
      creating.value = false
    }
  }

  const saveDraft = async () => {
    saving.value = true
    actionMessage.value = ''

    try {
      await saveFormSchema(formId.value, ast.value)
      actionMessage.value = '保存成功'
    } finally {
      saving.value = false
    }
  }

  const publishCurrent = async () => {
    publishing.value = true
    actionMessage.value = ''

    try {
      await publishFormSchema(formId.value, ast.value)
      actionMessage.value = '发布成功'
    } finally {
      publishing.value = false
    }
  }

  return {
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
    publishCurrent,
    publishing,
    previewVisible,
    saveDraft,
    saving,
    showDataSourceEditor,
    showImportSchema,
    showPreview,
  }
}

export const useFormDesigner = () => {
  const ast = ref<VersionedFormSchema>(migrateFormSchema({}))
  const formId = ref('form-customer-registration')

  return { ast, formId }
}
