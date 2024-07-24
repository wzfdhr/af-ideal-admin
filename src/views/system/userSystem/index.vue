<template>
  <main class="px-6">
    <s-navs :navs="['menu.system', 'menu.system.user']" />

    <div class="s-section">
      <a-form label-width="18px">
        <div class="flex">
          <a-form-item label="用户名称">
            <a-input placeholder="请输入用户名称" :style="{ width: '240px' }" />
          </a-form-item>
          <a-form-item label="手机号码">
            <a-input placeholder="请输入手机号码" :style="{ width: '240px' }">
              <template #prefix>
                <s-icon :name="Phone" :size="20" />
              </template>
            </a-input>
          </a-form-item>
          <a-form-item label="用户状态">
            <a-select placeholder="用户状态" :style="{ width: '200px' }">
              <a-option
                v-for="dict in option"
                :key="dict.label"
                :value="dict.value"
                :label="dict.label"
              ></a-option>
              <template #prefix>
                <s-icon :name="Group" :size="20" />
              </template>
            </a-select>
          </a-form-item>
          <a-form-item>
            <a-button icon="Search" type="primary">搜索</a-button>
            <a-button icon="Refresh" class="ml-2">重置</a-button>
          </a-form-item>
        </div>
      </a-form>
    </div>
    <div class="s-section mt-6">
      <div>
        <a-button>新增</a-button>
      </div>
      <a-table :data="data" class="mt-4">
        <template #columns>
          <a-table-column title="账号名称" data-index="username" />
          <a-table-column title="用户姓名" data-index="name" />
          <a-table-column title="手机号" data-index="phone" />
          <a-table-column title="Email" data-index="email" />
          <a-table-column title="所在部门" data-index="dept" />
          <a-table-column title="是否启用" data-index="isState">
            <template #cell="{ record }">
              <a-switch
                :model-value="record.isState"
                type="round"
                checked-value="1"
                unchecked-value="0"
              >
                <template #checked>ON</template>
                <template #unchecked>OFF</template>
              </a-switch>
            </template>
          </a-table-column>
          <a-table-column title="操作">
            <template #cell="{ record, rowIndex }">
              <a-space>
                <a-button size="small" @click="handleEdit(record, rowIndex)">
                  编辑
                </a-button>
                <a-button size="small" @click="handleRemove(record)">
                  移除
                </a-button>
              </a-space>
            </template>
          </a-table-column>
        </template>
        <template #empty>
          <a-empty
            class="min-h-[300px] flex flex-col items-center justify-center"
          >
            没有用户账号
            <br />
            请从左侧输入框内输入姓名搜索
          </a-empty>
        </template>
      </a-table>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { UserFill, Phone, Group } from '@salmon-ui/icons'

const option = ref([
  {
    label: '停用',
    value: '0',
  },
  {
    label: '启用',
    value: '1',
  },
])

const data = reactive([
  {
    key: '1',
    username: 'admin',
    name: '王宗凡',
    phone: '17666666666',
    email: 'jane.doe@example.com',
    dept: '软件部',
    isState: '1',
  },
])
const handleEdit = (row: any, idx: number) => {
  console.log(row)
}
const handleRemove = (row: any) => {
  console.log(row)
}
</script>

<style lang="scss" scoped></style>
