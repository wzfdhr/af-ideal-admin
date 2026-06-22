import { ref, computed, h, getCurrentInstance, onMounted, Ref } from 'vue'
import { useClipboard } from '@vueuse/core'
import SForm from '../s-form/index.vue'
import { migrateFormSchema, type VersionedFormSchema } from './schema'
import type { ModalMethod } from '@arco-design/web-vue'

// form designer actions
export const useFormDesignerActions = (ast: Ref<VersionedFormSchema>) => {
  const source = computed(() => JSON.stringify(ast.value))
  const previewVisible = ref(false)
  const dataSourceEditorVisible = ref(false)

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
          h(SForm, {
            ast: ast.value,
          }),
        ]),
      fullscreen: true,
    })
  }

  const showDataSourceEditor = () => {
    dataSourceEditorVisible.value = true
  }

  return {
    copy,
    copied,
    showPreview,
    showDataSourceEditor,
    previewVisible,
    dataSourceEditorVisible,
  }
}

export const useFormDesigner = () => {
  const ast = ref<VersionedFormSchema>(migrateFormSchema({}))

  return { ast }
}
