<template>
  <a-layout class="h-full">
    <tool-bar
      v-show="$route.path !== '/extended/ding-designer'"
      :title="title"
    />
    <a-layout-content>
      <page-view />
    </a-layout-content>
  </a-layout>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import ToolBar from '@/components/tool-bar.vue'
import PageView from './inner-layout.vue'

const { meta } = useRoute()
const { t } = useI18n()

const title = computed(() => (meta.locale ? t(meta.locale) : meta.text))
</script>
