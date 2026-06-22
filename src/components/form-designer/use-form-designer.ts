import { ref, computed, h, getCurrentInstance, onMounted, Ref } from 'vue'
import { useClipboard } from '@vueuse/core'
import { FormRenderer } from '@/components/form-runtime'
import {
  applyImportedFormSchema,
  exportFormSchema,
  migrateFormSchema,
  type VersionedFormSchema,
} from './schema'
import type { ModalMethod } from '@arco-design/web-vue'

// form designer actions
export const useFormDesignerActions = (ast: Ref<VersionedFormSchema>) => {
  const source = computed(() => exportFormSchema(ast.value))
  const previewVisible = ref(false)
  const dataSourceEditorVisible = ref(false)
  const importVisible = ref(false)
  const importSource = ref('')
  const importError = ref('')

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

  return {
    applyImportSchema,
    copy,
    copied,
    dataSourceEditorVisible,
    importError,
    importSource,
    importVisible,
    previewVisible,
    showDataSourceEditor,
    showImportSchema,
    showPreview,
  }
}

export const useFormDesigner = () => {
  const ast = ref<VersionedFormSchema>(migrateFormSchema({}))

  return { ast }
}
