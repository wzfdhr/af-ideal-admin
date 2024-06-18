<template>
  <template v-if="widget.type === 'grid'">
    <!-- grid: allow normal form components as children -->
    <a-row
      :align="widget.config.align"
      :gutter="widget.config.gutter"
      :justify="widget.config.justify"
    >
      <a-col
        v-for="(col, i) in widget.cols"
        :key="i"
        :span="widget.cols[i].span"
      >
        <widget-renderer
          v-if="col.widgets.length > 0 && col.widgets[0] !== undefined"
          :widget="col.widgets[0]"
        />
      </a-col>
    </a-row>
  </template>
  <template v-else-if="widget.type === 'tab'">
    <!-- tabs: allow grid and normal components as children -->
    <a-tabs :type="widget.config.type">
      <a-tab-pane v-for="(pane, i) in widget.panes" :key="i" :title="pane.name">
        <template v-for="nestedWidget in pane.widgets" :key="nestedWidget.uid">
          <widget-renderer
            v-if="nestedWidget !== undefined"
            :widget="nestedWidget"
          />
        </template>
      </a-tab-pane>
    </a-tabs>
  </template>
  <template v-else>
    <!-- normal form components -->
    <form-widget-renderer :widget="widget" />
  </template>
</template>

<script lang="ts" setup>
import { PropType } from 'vue'
import type { WidgetsConfig } from '@/components/form-designer/types'
import FormWidgetRenderer from './form-widget-renderer.vue'

defineProps({
  widget: {
    type: Object as PropType<WidgetsConfig>,
    required: true,
  },
})
</script>

<script lang="ts">
export default {
  name: 'WidgetRenderer',
}
</script>
