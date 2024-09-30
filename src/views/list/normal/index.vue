<template>
  <main class="px-6 pb-4">
    <s-navs :navs="['menu.list', 'menu.list.normal']" />

    <div class="s-section">
      <h2 class="text-lg">业务明细</h2>
      <a-row class="mt-6">
        <a-col :flex="1">
          <a-form
            :model="searchForm"
            :label-col-props="{ span: 6 }"
            :wrapper-col-props="{ span: 18 }"
            label-align="left"
          >
            <a-row :gutter="16">
              <a-col :span="8">
                <a-form-item field="serialNo" label="工单号">
                  <a-input placeholder="请输入工单号" />
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item field="keyword" label="关键字">
                  <a-input placeholder="请输入关键字" />
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item field="category" label="业务分类">
                  <a-select allow-clear placeholder="全部">
                    <a-option :value="0">建立人才贡献奖励制度</a-option>
                    <a-option :value="1">搭建高层次创新平台</a-option>
                    <a-option :value="2">鼓励引进高层次人才</a-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item field="time" label="创建时间">
                  <a-range-picker />
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item field="updatedTime" label="变更时间">
                  <a-range-picker />
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item field="status" label="业务状态">
                  <a-select allow-clear placeholder="全部">
                    <a-option :value="0">未提交</a-option>
                    <a-option :value="1">办理中</a-option>
                    <a-option :value="2">已办结</a-option>
                  </a-select>
                </a-form-item>
              </a-col>
            </a-row>
          </a-form>
        </a-col>

        <a-divider direction="vertical" style="height: 86px" />

        <a-col flex="84px">
          <a-space direction="vertical" :size="20">
            <a-button type="primary">
              <template #icon>
                <icon-search />
              </template>
              搜索
            </a-button>
            <a-button>
              <template #icon>
                <icon-refresh />
              </template>
              重置
            </a-button>
          </a-space>
        </a-col>
      </a-row>

      <a-divider class="!mt-0" />

      <div class="flex items-center justify-between">
        <a-space>
          <a-button type="primary">操作1</a-button>
          <a-button>操作2</a-button>
        </a-space>
        <a-button>操作3</a-button>
      </div>

      <a-table
        row-key="id"
        :loading="isLoading"
        :pagination="pagination"
        :data="renderData"
        :bordered="false"
        class="mt-4"
        @page-change="onPageChange"
      >
        <template #columns>
          <a-table-column title="工单号" data-index="serialNo" />
          <a-table-column title="业务名称" data-index="name" />
          <a-table-column title="业务分类" data-index="category" />
          <a-table-column title="状态" data-index="status">
            <template #cell="{ record }">
              <span :class="getDotCls(record.status)" />
              {{ formatStatus(record.status) }}
            </template>
          </a-table-column>
          <a-table-column title="创建时间" data-index="time" />
          <a-table-column title="变更时间" data-index="updatedTime">
            <template #cell="{ record }">
              {{ formatUpdatedTime(record.updatedTime) }}
            </template>
          </a-table-column>
          <a-table-column title="操作" data-index="actions">
            <template #cell>
              <a-link>查看</a-link>
            </template>
          </a-table-column>
        </template>
      </a-table>
    </div>
  </main>
</template>

<script lang="ts" setup>
import { type } from 'os'
import { ref } from 'vue'
import { IconSearch, IconRefresh } from '@arco-design/web-vue/es/icon'
import useLoading from '@/hooks/use-loading'
import { getRecords, BusinessRecord } from '@/api/business'
import { fromNow } from '@/utils/time'

const { isLoading, setLoading } = useLoading()

const searchFormModelFactory = () => ({
  serialNo: '',
  keyword: '',
  category: -1,
  time: '',
  updatedTime: '',
  status: -1,
})

const paginationFactory = {
  current: 1,
  pageSize: 20,
  total: 0,
}
const searchForm = ref(searchFormModelFactory())
const renderData = ref<BusinessRecord[]>([])
const pagination = ref(paginationFactory)

const getDotCls = (status: BusinessRecord['status']) => {
  if (status === 1) {
    return 'dot active'
  }
  if (status >= 2) {
    return 'dot finished'
  }
  return 'dot inactive'
}

const fetchData = async (params = { current: 1, pageSize: 20 }) => {
  setLoading(true)
  try {
    const { data } = await getRecords(params)
    renderData.value = data.list
    pagination.value.current = params.current
    pagination.value.pageSize = params.pageSize
    pagination.value.total = data.total
  } finally {
    setLoading(false)
  }
}

const onPageChange = (current: number) => {
  fetchData({ ...paginationFactory, current })
}

const formatUpdatedTime = (time: BusinessRecord['updatedTime']) =>
  time ? fromNow(time) : '无'

const formatStatus = (code: BusinessRecord['status']) => {
  switch (code) {
    case 1:
      return '正在办理'
    case 2:
      return '已办结'
    default:
      return '未提交'
  }
}

fetchData()
</script>

<style lang="scss" scoped>
.dot {
  @apply h-2 w-2 inline-block mr-1 rounded-full bg-gray-300;
  &.active {
    @apply bg-blue-500;
  }
  &.finished {
    @apply bg-green-500;
  }
}
</style>
