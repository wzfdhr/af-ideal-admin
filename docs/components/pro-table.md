# ProTable

`ProTable` is the standard table entry for enterprise business pages. It keeps
pagination, loading, empty state, refresh, and query reset behavior in one
component so pages do not repeat the same data-fetching code.

## Minimal Usage

```vue
<template>
  <ProTable row-key="id" :columns="columns" :fetch-data="fetchData" />
</template>

<script setup lang="ts">
import ProTable from '@/components/pro-table/index.vue'
import type { ProTableFetchParams } from '@/components/pro-table/types'

const columns = [
  { title: 'Name', dataIndex: 'name' },
  { title: 'Status', dataIndex: 'status' },
]

const fetchData = async (params: ProTableFetchParams) => {
  const response = await request.get('/business/records', { params })

  return {
    list: response.data.list,
    total: response.data.total,
  }
}
</script>
```

## Server Pagination

`fetchData` always receives the current page, page size, and query filters:

```ts
{
  current: 1,
  pageSize: 10,
  filters: {}
}
```

The function must return:

```ts
{
  list: [],
  total: 0
}
```

The component updates its loading state before and after every request, and
updates pagination total from the returned value.

## Empty State

When `fetchData` returns an empty list and loading has finished, `ProTable`
renders a stable empty state. Use `emptyText` to customize the message:

```vue
<ProTable
  row-key="id"
  empty-text="No records"
  :columns="columns"
  :fetch-data="fetchData"
/>
```

## Query Reset

Use the exposed methods from a parent component:

```vue
<ProTable ref="tableRef" row-key="id" :columns="columns" :fetch-data="fetchData" />
```

```ts
tableRef.value?.reset({ status: 'enabled' })
tableRef.value?.reload()
```

`reset` returns to page 1 and replaces the current filters. `reload` keeps the
current page and filters.
