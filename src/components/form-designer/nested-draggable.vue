<template>
  <draggable
    :list="nestedList"
    v-bind="{
      group: 'widgets',
      ghostClass: 'ghost',
      animation: 200,
      handle: '.drag-handler',
    }"
    item-key="uid"
  >
    <template
      #item="{ element, index }: { element: WidgetsConfig, index: number }"
    >
      <div>
        <a-row
          v-if="element.type === 'grid'"
          class="widget-wrapper !mx-0 !px-2 !py-3 bg-white"
          :class="{
            'is-selected': isWidgetSelected(element.uid),
          }"
          :align="element.config.align"
          :justify="element.config.justify"
          :gutter="element.config.gutter"
          @click.self="onWidgetSelect(index)"
        >
          <a-col
            v-for="(col, i) in element.cols"
            :key="i"
            :span="col.span || 0"
            class="relative first:pl-0 last:pr-0 z-10"
            @click="onNestedWidgetWrapperClick(index, col)"
          >
            <div class="nested-widget-list bg-green-50">
              <nested-draggable :nested-list="col.widgets" />
            </div>
          </a-col>
          <template v-if="isWidgetSelected(element.uid)">
            <button
              class="widget-action-icon absolute bottom-0 right-0 z-20"
              @click="onWidgetDelete(index)"
            >
              <s-icon :name="DeleteBinFill" :size="16" />
            </button>
            <button
              class="widget-action-icon absolute top-0 left-0 cursor-move drag-handler z-50"
            >
              <s-icon :name="DragMove" :size="16" />
            </button>
          </template>
        </a-row>
        <widget-form-item
          :widget="element"
          :index="index"
          :parent-level-config="nestedList"
        />
      </div>
    </template>
  </draggable>
</template>

<script lang="ts" setup>
import { ref, inject, PropType } from 'vue'
import Draggable from 'vuedraggable'
import { DeleteBinFill, DragMove } from '@salmon-ui/icons'
import WidgetFormItem from './widget-form-item.vue'
import {
  WidgetsConfig,
  FormDesignerContext,
  IConfigCol,
  IConfigTabPane,
  contextSymbol,
} from './types'

const props = defineProps({
  nestedList: {
    type: Array as PropType<WidgetsConfig[]>,
    required: true,
  },
})

const widgetsList = ref(props.nestedList)

const context = inject<FormDesignerContext>(contextSymbol)

const onNestedWidgetWrapperClick = (
  index: number,
  col: IConfigCol | IConfigTabPane
) => {
  if (col.widgets.length === 0) {
    context?.setSelectedWidget(widgetsList.value[index])
  }
}

const isWidgetSelected = (uid: string) => {
  return context?.selectedWidget.value?.uid === uid
}

const onWidgetSelect = (idx: number) => {
  context?.setSelectedWidget(widgetsList.value[idx])
}

const onWidgetDelete = (idx: number) => {
  widgetsList.value.splice(idx, 1)
}
</script>

<style lang="scss" scoped>
.nested-widget-list {
  min-height: 32px;
  align-self: stretch;
}
</style>
