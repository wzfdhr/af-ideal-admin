<template>
  <main class="message-center" data-testid="message-center">
    <div class="message-center__header">
      <div>
        <p class="message-center__breadcrumb">消息中心 / 消息管理</p>
        <h1>消息管理</h1>
      </div>
      <div class="message-center__summary">
        <span>全部 {{ total }} 条</span>
        <strong>未读 {{ unreadTotal }} 条</strong>
      </div>
    </div>

    <section class="message-center__stats" aria-label="消息未读统计">
      <article
        v-for="item in categoryStats"
        :key="item.value"
        class="message-center__stat"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.count }}</strong>
      </article>
    </section>

    <section class="message-center__filters" aria-label="消息筛选">
      <label class="message-center__field">
        <span>消息类型</span>
        <select v-model="filters.category" data-testid="message-category">
          <option value="">全部类型</option>
          <option
            v-for="option in categoryOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="message-center__field">
        <span>阅读状态</span>
        <select v-model="filters.status" data-testid="message-status">
          <option value="">全部状态</option>
          <option value="unread">未读</option>
          <option value="read">已读</option>
        </select>
      </label>
      <label class="message-center__field message-center__field--keyword">
        <span>关键词</span>
        <input
          v-model.trim="filters.keyword"
          data-testid="message-keyword"
          placeholder="标题、内容或来源"
        />
      </label>
      <div class="message-center__actions">
        <button
          class="message-center__button message-center__button--primary"
          data-testid="message-query"
          :disabled="loading"
          type="button"
          @click="queryMessages"
        >
          查询
        </button>
        <button
          class="message-center__button"
          :disabled="loading"
          type="button"
          @click="resetFilters"
        >
          重置
        </button>
        <button
          class="message-center__button"
          data-testid="message-read-all"
          :disabled="loading || unreadTotal === 0"
          type="button"
          @click="readAll"
        >
          当前筛选全部已读
        </button>
      </div>
    </section>

    <section class="message-center__table-wrap" aria-label="消息列表">
      <table class="message-center__table">
        <thead>
          <tr>
            <th>类型</th>
            <th>标题</th>
            <th>来源</th>
            <th>优先级</th>
            <th>状态</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!loading && records.length === 0">
            <td class="message-center__empty" colspan="7">暂无消息</td>
          </tr>
          <tr
            v-for="record in records"
            :key="record.id"
            :class="{ 'is-unread': record.status === 'unread' }"
          >
            <td>
              <span class="message-center__badge">
                {{ getCategoryLabel(record.category) }}
              </span>
            </td>
            <td>
              <strong>{{ record.title }}</strong>
              <span>{{ record.content }}</span>
            </td>
            <td>{{ record.source }}</td>
            <td>
              <span
                class="message-center__priority"
                :class="`message-center__priority--${record.priority}`"
              >
                {{ getPriorityLabel(record.priority) }}
              </span>
            </td>
            <td>{{ record.status === 'unread' ? '未读' : '已读' }}</td>
            <td>{{ record.createdAt }}</td>
            <td>
              <button
                v-if="record.status === 'unread'"
                class="message-center__link-button"
                :data-testid="`message-read-${record.id}`"
                :disabled="loading"
                type="button"
                @click="readOne(record.id)"
              >
                标为已读
              </button>
              <a
                v-if="record.link"
                class="message-center__link"
                :href="record.link"
              >
                查看
              </a>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="message-center__loading">加载中...</div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  fetchMessageNotifications,
  markAllMessagesRead,
  markMessageRead,
  type MessageCategoryUnread,
  type MessageNotificationCategory,
  type MessageNotificationPriority,
  type MessageNotificationQuery,
  type MessageNotificationRecord,
  type MessageNotificationStatus,
} from '@/api/message'

const categoryOptions: Array<{
  label: string
  value: MessageNotificationCategory
}> = [
  { label: '通知', value: 'notice' },
  { label: '站内信', value: 'message' },
  { label: '待办', value: 'todo' },
  { label: '告警', value: 'alert' },
]

const priorityLabels: Record<MessageNotificationPriority, string> = {
  low: '低',
  normal: '普通',
  high: '高',
}

const createEmptyCategoryUnread = (): MessageCategoryUnread => ({
  notice: 0,
  message: 0,
  todo: 0,
  alert: 0,
})

const records = ref<MessageNotificationRecord[]>([])
const total = ref(0)
const unreadTotal = ref(0)
const categoryUnread = ref<MessageCategoryUnread>(createEmptyCategoryUnread())
const loading = ref(false)
const current = ref(1)
const pageSize = ref(20)

const filters = reactive({
  category: '' as MessageNotificationCategory | '',
  status: '' as MessageNotificationStatus | '',
  keyword: '',
})

const categoryStats = computed(() =>
  categoryOptions.map((item) => ({
    ...item,
    count: categoryUnread.value[item.value],
  }))
)

const buildQuery = (): MessageNotificationQuery => ({
  current: current.value,
  pageSize: pageSize.value,
  category: filters.category,
  status: filters.status,
  keyword: filters.keyword,
})

const loadMessages = async () => {
  loading.value = true

  try {
    const result = await fetchMessageNotifications(buildQuery())
    records.value = result.list
    total.value = result.total
    unreadTotal.value = result.unreadTotal
    categoryUnread.value = result.categoryUnread
  } finally {
    loading.value = false
  }
}

const queryMessages = async () => {
  current.value = 1
  await loadMessages()
}

const resetFilters = async () => {
  filters.category = ''
  filters.status = ''
  filters.keyword = ''
  await queryMessages()
}

const readOne = async (id: string) => {
  await markMessageRead(id)
  await loadMessages()
}

const readAll = async () => {
  await markAllMessagesRead({
    category: filters.category,
  })
  await loadMessages()
}

const getCategoryLabel = (category: MessageNotificationCategory) =>
  categoryOptions.find((item) => item.value === category)?.label || category

const getPriorityLabel = (priority: MessageNotificationPriority) =>
  priorityLabels[priority]

onMounted(loadMessages)
</script>

<style scoped lang="scss">
.message-center {
  min-height: 100%;
  padding: 24px;
  color: #1d2129;
  background: #f5f7fb;
}

.message-center__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h1 {
    margin: 4px 0 0;
    font-size: 24px;
    font-weight: 650;
  }
}

.message-center__breadcrumb {
  margin: 0;
  color: #667085;
  font-size: 13px;
}

.message-center__summary {
  display: flex;
  gap: 12px;
  align-items: center;
  color: #475467;

  strong {
    color: #b42318;
  }
}

.message-center__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.message-center__stat {
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;

  span {
    display: block;
    color: #667085;
    font-size: 13px;
  }

  strong {
    display: block;
    margin-top: 4px;
    font-size: 22px;
  }
}

.message-center__filters {
  display: grid;
  grid-template-columns: 180px 180px minmax(220px, 1fr) auto;
  gap: 12px;
  align-items: end;
  padding: 16px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.message-center__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #475467;

  input,
  select {
    height: 34px;
    padding: 0 10px;
    border: 1px solid #d0d5dd;
    border-radius: 6px;
    background: #fff;
    color: #1d2129;
  }
}

.message-center__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.message-center__button,
.message-center__link-button {
  height: 34px;
  padding: 0 12px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #344054;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.message-center__button--primary {
  border-color: #165dff;
  background: #165dff;
  color: #fff;
}

.message-center__table-wrap {
  position: relative;
  overflow: auto;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.message-center__table {
  width: 100%;
  min-width: 920px;
  border-collapse: collapse;

  th,
  td {
    padding: 12px 14px;
    text-align: left;
    border-bottom: 1px solid #eaecf0;
    vertical-align: top;
  }

  th {
    color: #667085;
    font-weight: 600;
    background: #f9fafb;
  }

  td strong,
  td span {
    display: block;
  }

  tr.is-unread td {
    background: #f8fbff;
  }
}

.message-center__empty,
.message-center__loading {
  padding: 28px;
  text-align: center;
  color: #667085;
}

.message-center__badge,
.message-center__priority {
  display: inline-flex;
  width: fit-content;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef4ff;
  color: #175cd3;
  font-size: 12px;
}

.message-center__priority--high {
  background: #fff1f3;
  color: #c01048;
}

.message-center__priority--low {
  background: #ecfdf3;
  color: #027a48;
}

.message-center__link,
.message-center__link-button {
  display: inline-flex;
  align-items: center;
  margin-right: 8px;
  color: #165dff;
  text-decoration: none;
}

@media (max-width: 900px) {
  .message-center {
    padding: 16px;
  }

  .message-center__header,
  .message-center__summary {
    flex-direction: column;
    align-items: flex-start;
  }

  .message-center__stats,
  .message-center__filters {
    grid-template-columns: 1fr;
  }
}
</style>
