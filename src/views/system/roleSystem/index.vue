<template>
  <main class="px-6">
    <s-navs :navs="['menu.system', 'menu.system.role']" />

    <div class="s-section">
      <a-form label-width="68px">
        <div class="flex">
          <a-form-item>
            <a-input placeholder="请输入角色名称" :style="{ width: '240px' }">
              <template #prefix>
                <s-icon :name="UserFill" :size="20" />
              </template>
            </a-input>
          </a-form-item>
          <a-form-item>
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
      <a-table :data="data">
        <template #columns>
          <a-table-column title="角色编号" data-index="roleId" />
          <a-table-column title="角色名称" data-index="roleName" />
          <a-table-column title="权限字符" data-index="roleKey" />
          <a-table-column title="显示顺序" data-index="roleSort" />
          <a-table-column title="状态">
            <template #cell="{ record }">
              <a-switch
                :model-value="record.state"
                type="round"
                checked-value="1"
                unchecked-value="0"
              >
                <template #checked>ON</template>
                <template #unchecked>OFF</template>
              </a-switch>
            </template>
          </a-table-column>
          <a-table-column title="创建时间" data-index="createTime" />
          <a-table-column title="备注" data-index="beizhu" />
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

const data = reactive([
  {
    roleId: '1',
    roleName: '超级管理员',
    roleKey: 'admin',
    roleSort: '1',
    state: '1',
    createTime: '2014-06-27 22:06:45',
    beizhu: '亲几都别习需列向和民查属也及着相格共切',
  },
])
</script>

<style scoped></style>
