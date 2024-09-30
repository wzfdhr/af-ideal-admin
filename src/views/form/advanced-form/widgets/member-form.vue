<template>
  <h2 class="font-light text-base">成员管理</h2>
  <a-divider />
  <a-table :data="data" style="margin-top: 20px" :pagination="false">
    <template #columns>
      <a-table-column title="成员姓名">
        <template #cell="{ record, rowIndex }: Record">
          <a-input v-if="editLine === rowIndex" v-model="edittedData.name" />
          <template v-else>{{ record.name }}</template>
        </template>
      </a-table-column>
      <a-table-column title="工号">
        <template #cell="{ record, rowIndex }: Record">
          <a-input v-if="editLine === rowIndex" v-model="edittedData.id" />
          <template v-else>{{ record.id }}</template>
        </template>
      </a-table-column>
      <a-table-column title="所属部门">
        <template #cell="{ record, rowIndex }: Record">
          <a-input v-if="editLine === rowIndex" v-model="edittedData.dept" />
          <template v-else>{{ record.dept }}</template>
        </template>
      </a-table-column>
      <a-table-column title="操作">
        <template #cell="{ rowIndex }">
          <a-link v-if="editLine !== rowIndex" @click="handleEdit(rowIndex)">
            编辑
          </a-link>

          <template v-else>
            <a-link @click="saveRow(rowIndex)">保存</a-link>
            <a-popconfirm content="确定删除？" @ok="deleteRow(rowIndex)">
              <a-link>删除</a-link>
            </a-popconfirm>
            <a-link @click="cancelEdit">取消</a-link>
          </template>
        </template>
      </a-table-column>
    </template>
  </a-table>

  <a-button type="dashed" long class="mt-4" @click="add">
    <template #icon>
      <icon-plus />
    </template>
    添加一行数据
  </a-button>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue'
import { Notification } from '@arco-design/web-vue'
import type { MembersData } from '../types'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Record = {
  record: MembersData
  rowIndex: number
}

const editLine = ref<number>(-1)
const edittedData = ref<MembersData>({
  name: '',
  id: '',
  dept: '',
})

const data = reactive<MembersData[]>([
  {
    dept: '体验技术部',
    name: '蔡仲晨',
    id: 'mm0212c',
  },
  {
    dept: '软件部',
    name: '张三',
    id: '9sj3nn2',
  },
  {
    dept: '软件部',
    name: '李四',
    id: 'ks921fs',
  },
])

const clearEditContent = () => {
  edittedData.value.dept = ''
  edittedData.value.id = ''
  edittedData.value.name = ''
}

const handleEdit = (rowIndex: number) => {
  if (editLine.value >= 0) {
    Notification.info('仅能同时编辑一项')
  } else {
    edittedData.value = { ...data[rowIndex] }
    editLine.value = rowIndex
  }
}

const cancelEdit = () => {
  editLine.value = -1
  clearEditContent()
}

const deleteRow = (rowIndex: number) => {
  cancelEdit()
  data.splice(rowIndex, 1)
}

const saveRow = (rowIndex: number) => {
  data[rowIndex] = { ...edittedData.value }
  cancelEdit()
}

const add = () => {
  if (editLine.value >= 0) {
    Notification.info('只可以编辑一项')
  } else {
    data.push({ name: '', id: '', dept: '' })
    editLine.value = data.length - 1
  }
}
</script>
