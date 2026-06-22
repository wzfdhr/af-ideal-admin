<template>
  <a-form
    :model="data"
    :size="ast.formConfig.size"
    :layout="ast.formConfig.layout"
    :label-align="ast.formConfig.labelAlign"
  >
    <template v-for="(item, i) in ast.widgetsConfig" :key="i">
      <widget-renderer v-if="item !== undefined" :widget="item" />
    </template>

    <pre>{{ data }}</pre>
  </a-form>
</template>

<script lang="ts" setup>
import { ref, provide, PropType } from 'vue'
import type { AST } from '@/components/form-designer/types'
import WidgetRenderer from './renderer/index.vue'
import { formData } from './renderer/use-form-preview'

defineProps({
  ast: {
    type: Object as PropType<AST>,
    required: true,
  },
})

const data = ref({})

provide(formData, data)

defineExpose({
  data,
})
</script>
