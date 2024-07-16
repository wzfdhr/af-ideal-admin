<template>
  <div class="text-right">
    <a-button size="small" type="primary" @click="addDataSource">
      新增数据源
    </a-button>
    <a-button
      size="small"
      type="primary"
      status="danger"
      class="ml-4"
      @click="deleteSource"
    >
      删除数据源
    </a-button>
  </div>
  <div v-if="config.length > 0" class="flex">
    <div class="w-1/4">
      <ul>
        <li
          v-for="(src, i) in sources"
          :key="i"
          class="list-item"
          :class="{ active: selectedIndex === i }"
          @click="selectedIndex = i"
        >
          {{ src.name }}
        </li>
      </ul>
    </div>
    <div class="w-3/4 pl-6">
      <a-form
        v-if="selectedIndex > -1"
        :model="selectedConfig"
        layout="vertical"
      >
        <a-form-item label="数据源名称">
          <a-input v-model="selectedConfig.name" />
        </a-form-item>
        <a-form-item label="数据源请求地址">
          <a-input v-model="selectedConfig.url">
            <template #prepend>GET</template>
          </a-input>
        </a-form-item>
      </a-form>
    </div>
  </div>
  <a-empty v-else />
</template>

<script lang="ts" setup>
import { ref, computed, PropType } from 'vue'
import { generateUID } from '@/utils'
import type { AST } from './types'

const props = defineProps({
  config: {
    type: Object as PropType<AST['dataSources']>,
    required: true,
  },
})

const emit = defineEmits(['update:config'])

const selectedIndex = ref(0)

const sources = computed({
  get: () => props.config,
  set: (val) => {
    emit('update:config', val)
  },
})

const selectedConfig = computed(() => sources.value[selectedIndex.value])

const addDataSource = () => {
  sources.value.push({
    key: generateUID(),
    name: '未命名数据源',
    url: '',
  })

  selectedIndex.value = sources.value.length - 1
}

const deleteSource = () => {
  sources.value.splice(selectedIndex.value, 1)
}
</script>

<style lang="scss" scoped>
.list-item {
  @apply px-2 py-1 hover:bg-gray-50 cursor-pointer;

  &.active {
    @apply bg-blue-50 text-blue-500;
  }
}
</style>
