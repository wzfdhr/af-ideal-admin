<template>
  <a-spin class="block w-full" :loading="isLoading">
    <a-tabs
      v-model:active-key="messageType"
      type="rounded"
      destroy-on-hide
      class="w-full"
    >
      <a-tab-pane key="notice">
        <template #title>
          <span>通知(4)</span>
        </template>
        <a-result v-if="!noticeList.length" status="404">
          <template #subtitle>没有通知</template>
        </a-result>
        <a-notice-list :list="noticeList" />
      </a-tab-pane>
      <a-tab-pane key="message">
        <template #title>
          <span>消息(4)</span>
        </template>
        <a-result v-if="!messageList.length" status="404">
          <template #subtitle>没有消息</template>
        </a-result>
        <a-message-list :list="messageList" />
      </a-tab-pane>
      <a-tab-pane key="todo">
        <template #title>
          <span>待办(0)</span>
        </template>
        <a-result v-if="!todoList.length" status="404">
          <template #subtitle>没有待办事项</template>
        </a-result>
      </a-tab-pane>
    </a-tabs>
  </a-spin>
</template>

<script lang="ts" setup>
import { ref, reactive } from 'vue'
import { MessageRecord, NoticeRecord } from '@/api/message'
import useLoading from '@/hooks/use-loading'
import avatar from '@/assets/avatar.jpg'
import AMessageList from './message-list.vue'
import ANoticeList from './notice-list.vue'

const messageType = ref('notice')
const { isLoading } = useLoading()

const messageList = reactive<MessageRecord[]>([
  {
    id: 1,
    title: '来自 王宗凡 的私信',
    content: '代码冲突，请你检查一下，合并后再提交',
    time: '2024-6-18 12:00',
    avatar,
  },
  {
    id: 2,
    title: '来自 王宗凡 的私信',
    content: '代码冲突，请你检查一下，合并后再提交',
    time: '2024-6-18 12:00',
    avatar,
  },
  {
    id: 3,
    title: '来自 王宗凡 的私信',
    content: '代码冲突，请你检查一下，合并后再提交',
    time: '2024-6-18 12:00',
    avatar,
  },
])

const noticeList = ref<NoticeRecord[]>([
  {
    id: 1,
    title: '您还没有提交周报',
    type: 'report',
    time: '2024-6-18 16:00',
  },
  {
    id: 2,
    title: '您有 5 条待审核的申报',
    type: 'audit',
    time: '2024-6-18 16:00',
  },
  {
    id: 3,
    title: '系统将在2024年6月18日凌晨进行维护',
    type: 'normal',
    time: '2024-6-18 16:00',
  },
])
const todoList = ref([])
</script>
