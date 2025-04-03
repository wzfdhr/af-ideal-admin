<template>
  <main class="px-6">
    <s-navs :navs="['menu.system', 'menu.system.menu']" />

    <div class="s-section">
      <a-form label-width="68px">
        <div class="flex">
          <a-form-item label="菜单名称">
            <a-input placeholder="请输入菜单名称" :style="{ width: '240px' }" />
          </a-form-item>
          <a-form-item label="菜单状态">
            <a-select :style="{ width: '320px' }" placeholder="请选择菜单状态">
              <a-option>所有</a-option>
              <a-option>显示</a-option>
              <a-option>隐藏</a-option>
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
      <a-table :data="data" show-empty-tree class="mt-4">
        <template #columns>
          <a-table-column title="菜单名称" data-index="menuName" />
          <a-table-column title="排序" data-index="sort" />
          <a-table-column title="请求地址" data-index="url"></a-table-column>
          <a-table-column title="类型" data-index="type">
            <template #cell="{ record }">
              {{ record.type }}
            </template>
          </a-table-column>
          <a-table-column title="菜单状态" data-index="menuStatus">
            <template #cell="{ record }">
              {{ record.menuStatus }}
            </template>
          </a-table-column>
          <a-table-column title="权限字符" data-index="role">
            <template #cell="{ record }">
              {{ record.role }}
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
import { reactive } from 'vue'

const data = reactive([
  {
    menuName: '系统管理',
    sort: '1',
    url: '#',
    type: '1',
    menuStatus: '1',
    role: '',
    children: [
      {
        menuName: '用户管理',
        sort: '1',
        url: '/system/user',
        type: '1',
        menuStatus: '1',
        role: 'system:user:view',
        children: [
          {
            menuName: '用户查询',
            sort: '1',
            url: '',
            type: '2',
            menuStatus: '1',
            role: '',
          },
        ],
      },
      {
        menuName: '角色管理',
        sort: '2',
        url: '/system/role',
        type: '1',
        menuStatus: '1',
        role: 'system:role:view',
        children: [],
      },
      {
        menuName: '菜单管理',
        sort: '3',
        url: '/system/menu',
        type: '1',
        menuStatus: '1',
        role: 'system:menu:view',
        children: [],
      },
    ],
  },
])
const handleEdit = (row: any) => {
  console.log(row)
}
const handleRemove = (row: any) => {
  console.log(row)
}
</script>

<style scoped></style>
