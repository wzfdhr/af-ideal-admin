<template>
  <component
    :is="Table"
    class="pro-table"
    :columns="columns"
    :data="data"
    :loading="loading"
    :pagination="pagination"
    :row-key="rowKey"
    @page-change="handlePageChange"
    @page-size-change="handlePageSizeChange"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { adminUi } from '@/components/pro-ui'
import type {
  ProTableExpose,
  ProTableFetchParams,
  ProTableFetchResult,
  ProTableProps,
} from './types'

const { Table } = adminUi

const props = withDefaults(defineProps<ProTableProps>(), {
  defaultPageSize: 10,
})

const loading = ref(false)
const data = ref<Record<string, unknown>[]>([])
const filters = ref<Record<string, unknown>>({})
const paginationState = reactive({
  current: 1,
  pageSize: props.defaultPageSize,
  total: 0,
})

const pagination = computed(() => ({
  current: paginationState.current,
  pageSize: paginationState.pageSize,
  total: paginationState.total,
  showTotal: true,
  showPageSize: true,
}))

const getFetchParams = (): ProTableFetchParams => ({
  current: paginationState.current,
  pageSize: paginationState.pageSize,
  filters: { ...filters.value },
})

const fetchTableData = async () => {
  loading.value = true
  try {
    const result = (await props.fetchData(
      getFetchParams()
    )) as ProTableFetchResult<Record<string, unknown>>
    data.value = result.list
    paginationState.total = result.total
  } finally {
    loading.value = false
  }
}

const reload = () => fetchTableData()
const refresh = reload

const reset = (nextFilters: Record<string, unknown> = {}) => {
  paginationState.current = 1
  filters.value = { ...nextFilters }
  return fetchTableData()
}

const setFilters = (nextFilters: Record<string, unknown>) => reset(nextFilters)

const handlePageChange = (current: number) => {
  paginationState.current = current
  return fetchTableData()
}

const handlePageSizeChange = (pageSize: number) => {
  paginationState.current = 1
  paginationState.pageSize = pageSize
  return fetchTableData()
}

onMounted(() => {
  fetchTableData()
})

defineExpose<ProTableExpose>({
  reload,
  refresh,
  reset,
  setFilters,
})
</script>
