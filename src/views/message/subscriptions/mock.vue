<template>
  <main class="message-subscriptions" data-testid="message-subscriptions">
    <div class="message-subscriptions__header">
      <div>
        <p class="message-subscriptions__breadcrumb">消息中心 / 订阅配置</p>
        <h1>订阅配置</h1>
      </div>
      <div class="message-subscriptions__summary">
        共 {{ total }} 个订阅通道
      </div>
    </div>

    <section class="message-subscriptions__filters" aria-label="订阅筛选">
      <label class="message-subscriptions__field">
        <span>消息通道</span>
        <select
          v-model="filters.channel"
          data-testid="message-subscription-channel"
        >
          <option value="">全部通道</option>
          <option
            v-for="option in channelOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="message-subscriptions__field">
        <span>关键词</span>
        <input
          v-model.trim="filters.keyword"
          data-testid="message-subscription-keyword"
          placeholder="通道、说明或跳转地址"
        />
      </label>
      <div class="message-subscriptions__actions">
        <button
          class="message-subscriptions__button message-subscriptions__button--primary"
          data-testid="message-subscription-query"
          :disabled="loading"
          type="button"
          @click="querySubscriptions"
        >
          查询
        </button>
        <button
          class="message-subscriptions__button"
          :disabled="loading"
          type="button"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </section>

    <section class="message-subscriptions__layout">
      <div class="message-subscriptions__panel">
        <div class="message-subscriptions__panel-title">
          <h2>订阅通道</h2>
          <span>Mock 订阅偏好与跳转联动</span>
        </div>

        <div class="message-subscriptions__table-wrap">
          <table class="message-subscriptions__table">
            <thead>
              <tr>
                <th>通道</th>
                <th>订阅</th>
                <th>投递方式</th>
                <th>跳转目标</th>
                <th>最近推送</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && records.length === 0">
                <td class="message-subscriptions__empty" colspan="6">
                  暂无订阅通道
                </td>
              </tr>
              <tr v-for="record in records" :key="record.id">
                <td>
                  <strong>{{ record.channelName }}</strong>
                  <span>{{ record.description }}</span>
                </td>
                <td>
                  <label class="message-subscriptions__switch">
                    <input
                      v-model="record.subscribed"
                      :data-testid="`message-subscription-toggle-${record.id}`"
                      type="checkbox"
                    />
                    <span>{{ record.subscribed ? '已订阅' : '未订阅' }}</span>
                  </label>
                </td>
                <td>
                  <label
                    v-for="mode in deliveryOptions"
                    :key="mode.value"
                    class="message-subscriptions__check"
                  >
                    <input
                      v-model="record.deliveryModes"
                      :value="mode.value"
                      type="checkbox"
                    />
                    <span>{{ mode.label }}</span>
                  </label>
                </td>
                <td>
                  <a
                    class="message-subscriptions__link"
                    :href="record.jumpTarget"
                  >
                    {{ record.jumpTarget }}
                  </a>
                </td>
                <td>{{ record.lastPushedAt || '-' }}</td>
                <td>
                  <button
                    class="message-subscriptions__link-button"
                    :data-testid="`message-subscription-save-${record.id}`"
                    :disabled="loading"
                    type="button"
                    @click="saveSubscription(record)"
                  >
                    保存
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="loading" class="message-subscriptions__loading">
            加载中...
          </div>
        </div>
      </div>

      <div class="message-subscriptions__panel">
        <div class="message-subscriptions__panel-title">
          <h2>推送模拟</h2>
          <span>站内信 / WebSocket / 跳转目标</span>
        </div>

        <div class="message-subscriptions__push-form">
          <label class="message-subscriptions__field">
            <span>推送通道</span>
            <select
              v-model="pushForm.channel"
              data-testid="message-push-channel"
            >
              <option
                v-for="option in channelOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <label class="message-subscriptions__field">
            <span>标题</span>
            <input
              v-model.trim="pushForm.title"
              data-testid="message-push-title"
              placeholder="消息标题"
            />
          </label>
          <label class="message-subscriptions__field">
            <span>内容</span>
            <input
              v-model.trim="pushForm.content"
              data-testid="message-push-content"
              placeholder="消息正文"
            />
          </label>
          <label class="message-subscriptions__field">
            <span>跳转地址</span>
            <input
              v-model.trim="pushForm.jumpTarget"
              data-testid="message-push-jump-target"
              placeholder="/message/center"
            />
          </label>
          <button
            class="message-subscriptions__button message-subscriptions__button--primary"
            data-testid="message-push-simulate"
            :disabled="loading || !pushForm.title || !pushForm.jumpTarget"
            type="button"
            @click="handlePushSimulation"
          >
            模拟推送
          </button>
        </div>

        <div
          v-if="pushResult"
          class="message-subscriptions__push-result"
          :class="{ 'is-failed': !pushResult.success }"
        >
          <strong>
            {{
              pushResult.success
                ? `投递 ${pushResult.deliveredTo.length} 个通道`
                : '推送未投递'
            }}
          </strong>
          <span v-if="pushResult.success">
            {{ pushResult.deliveredTo.map(getDeliveryLabel).join('、') }}
          </span>
          <span v-else>{{ pushResult.reason }}</span>
          <a
            v-if="pushResult.notification?.link"
            class="message-subscriptions__link"
            :href="pushResult.notification.link"
          >
            {{ pushResult.notification.link }}
          </a>
        </div>

        <p v-if="actionMessage" class="message-subscriptions__message">
          {{ actionMessage }}
        </p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  fetchMessageSubscriptions,
  simulateMessagePush,
  updateMessageSubscription,
  type MessageDeliveryMode,
  type MessagePushSimulationResult,
  type MessageSubscriptionChannel,
  type MessageSubscriptionQuery,
  type MessageSubscriptionRecord,
} from '@/api/message-subscription'

const channelOptions: Array<{
  label: string
  value: MessageSubscriptionChannel
}> = [
  { label: '公告', value: 'notice' },
  { label: '站内信', value: 'message' },
  { label: '待办', value: 'todo' },
  { label: '告警', value: 'alert' },
]

const deliveryOptions: Array<{ label: string; value: MessageDeliveryMode }> = [
  { label: '站内', value: 'in-app' },
  { label: '邮件', value: 'email' },
  { label: 'WebSocket', value: 'websocket' },
]

const records = ref<MessageSubscriptionRecord[]>([])
const total = ref(0)
const loading = ref(false)
const current = ref(1)
const pageSize = ref(20)
const actionMessage = ref('')
const pushResult = ref<MessagePushSimulationResult>()

const filters = reactive({
  channel: '' as MessageSubscriptionChannel | '',
  keyword: '',
})

const pushForm = reactive({
  channel: 'todo' as MessageSubscriptionChannel,
  title: '合同审批待处理',
  content: '请进入流程工作台处理审批。',
  jumpTarget: '/Scalability/workflowCenter',
})

const cloneRecord = (
  record: MessageSubscriptionRecord
): MessageSubscriptionRecord => ({
  ...record,
  deliveryModes: [...record.deliveryModes],
})

const buildQuery = (): MessageSubscriptionQuery => ({
  current: current.value,
  pageSize: pageSize.value,
  channel: filters.channel,
  keyword: filters.keyword,
})

const loadSubscriptions = async () => {
  loading.value = true

  try {
    const result = await fetchMessageSubscriptions(buildQuery())
    records.value = result.list.map(cloneRecord)
    total.value = result.total
  } finally {
    loading.value = false
  }
}

const querySubscriptions = async () => {
  current.value = 1
  await loadSubscriptions()
}

const resetFilters = async () => {
  filters.channel = ''
  filters.keyword = ''
  await querySubscriptions()
}

const saveSubscription = async (record: MessageSubscriptionRecord) => {
  const updated = await updateMessageSubscription(record.id, {
    subscribed: record.subscribed,
    deliveryModes: [...record.deliveryModes],
  })

  records.value = records.value.map((item) =>
    item.id === updated.id ? cloneRecord(updated) : item
  )
  actionMessage.value = `${updated.channelName}订阅已更新`
}

const handlePushSimulation = async () => {
  pushResult.value = await simulateMessagePush({
    channel: pushForm.channel,
    title: pushForm.title,
    content: pushForm.content,
    jumpTarget: pushForm.jumpTarget,
  })
  actionMessage.value = pushResult.value.success
    ? 'Mock 推送已生成'
    : pushResult.value.reason || 'Mock 推送未投递'
  await loadSubscriptions()
}

const getDeliveryLabel = (mode: MessageDeliveryMode) =>
  deliveryOptions.find((item) => item.value === mode)?.label || mode

onMounted(loadSubscriptions)
</script>

<style scoped lang="scss">
.message-subscriptions {
  min-height: 100%;
  padding: 24px;
  color: #1d2129;
  background: #f5f7fb;
}

.message-subscriptions__header {
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

.message-subscriptions__breadcrumb {
  margin: 0;
  color: #667085;
  font-size: 13px;
}

.message-subscriptions__summary {
  color: #475467;
  font-weight: 600;
}

.message-subscriptions__filters {
  display: grid;
  grid-template-columns: 180px minmax(220px, 1fr) auto;
  gap: 12px;
  align-items: end;
  padding: 16px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.message-subscriptions__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.8fr);
  gap: 16px;
  align-items: start;
}

.message-subscriptions__panel {
  min-width: 0;
  padding: 16px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.message-subscriptions__panel-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
  }

  span {
    color: #667085;
    font-size: 13px;
  }
}

.message-subscriptions__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #475467;
  font-size: 13px;

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

.message-subscriptions__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.message-subscriptions__button,
.message-subscriptions__link-button {
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

.message-subscriptions__button--primary {
  border-color: #165dff;
  background: #165dff;
  color: #fff;
}

.message-subscriptions__table-wrap {
  position: relative;
  overflow: auto;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.message-subscriptions__table {
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
}

.message-subscriptions__switch,
.message-subscriptions__check {
  display: flex;
  gap: 6px;
  align-items: center;
  color: #344054;
}

.message-subscriptions__check + .message-subscriptions__check {
  margin-top: 6px;
}

.message-subscriptions__link,
.message-subscriptions__link-button {
  display: inline-flex;
  align-items: center;
  max-width: 240px;
  color: #165dff;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.message-subscriptions__link-button {
  border-color: transparent;
  background: transparent;
}

.message-subscriptions__push-form {
  display: grid;
  gap: 12px;
}

.message-subscriptions__push-result {
  display: grid;
  gap: 4px;
  padding: 12px;
  margin-top: 14px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  color: #166534;

  &.is-failed {
    background: #fff7ed;
    border-color: #fed7aa;
    color: #9a3412;
  }
}

.message-subscriptions__message {
  margin: 12px 0 0;
  color: #475467;
  font-size: 13px;
}

.message-subscriptions__empty,
.message-subscriptions__loading {
  padding: 28px;
  text-align: center;
  color: #667085;
}

@media (max-width: 1024px) {
  .message-subscriptions__layout,
  .message-subscriptions__filters {
    grid-template-columns: 1fr;
  }

  .message-subscriptions__header {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 720px) {
  .message-subscriptions {
    padding: 16px;
  }

  .message-subscriptions__panel-title {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
