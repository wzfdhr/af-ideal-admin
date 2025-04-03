<template>
  <main class="px-6 pb-4 relative">
    <s-navs :navs="['menu.form', 'menu.form.complex-step']" />

    <div class="s-section">
      <div class="flex items-start h-full">
        <a-tabs v-model:active-key="activeTab">
          <a-tab-pane key="0" title="基本信息">
            <basic-form />
          </a-tab-pane>
          <a-tab-pane key="1" title="扶持对象">
            <table-form />
          </a-tab-pane>
          <a-tab-pane key="2" title="附件材料">
            <attachments-form />
          </a-tab-pane>
        </a-tabs>
      </div>
    </div>
  </main>
</template>

<script lang="ts" setup>
import { ref, reactive, provide } from 'vue'
import basicForm from './widgets/form.vue'
import tableForm from './widgets/table-form.vue'
import attachmentsForm from './widgets/attachments.vue'

const activeTab = ref('0')
const commonProps = reactive({
  // 本条申报条目(记录)的 ID
  id: 1,
  // 申报的类型
  type: 1,
  // 当前操作的类型
  cmd: 'create',
})

provide('commonProps', commonProps)
/**
 * ID of the current business entry should be passed to the
 * children widgets using provide/inject.
 */
</script>
