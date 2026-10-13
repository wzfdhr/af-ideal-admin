<template>
  <main class="messaging-page" data-testid="real-message-subscriptions">
    <header>
      <h1>我的订阅配置</h1>
      <button type="button" :disabled="loading || busy" @click="reload">
        重新读取
      </button>
    </header>
    <p class="messaging-muted">
      这些偏好只属于当前登录成员和当前租户。关闭订阅后，后续通道投递由服务器按此偏好处理。
    </p>
    <p v-if="error" role="alert">
      {{ error }}
      <button type="button" :disabled="loading || busy" @click="reload">
        重试读取
      </button>
    </p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="!allowed(P.subscriptionRead)" role="alert">
      无权读取当前成员订阅。
    </p>
    <p v-if="loading" role="status">正在读取服务器订阅…</p>
    <section v-if="allowed(P.subscriptionRead)" class="messaging-panel">
      <p v-if="!loading && !rows.length && !error">暂无可配置的订阅通道</p>
      <form
        v-for="row in rows"
        :key="row.channel"
        class="messaging-record messaging-form"
        :data-testid="`real-subscription-${row.channel}`"
        @submit.prevent="save(row)"
      >
        <h2>{{ channelLabels[row.channel] }}</h2>
        <label class="messaging-check">
          <input
            v-model="row.subscribed"
            :disabled="busy || !allowed(P.subscriptionUpdate)"
            type="checkbox"
            :data-testid="`real-subscription-toggle-${row.channel}`"
          />
          订阅此通道
        </label>
        <DeliveryPicker
          v-model="row.deliveryModes"
          :disabled="busy || !allowed(P.subscriptionUpdate)"
          :email-enabled="emailAvailable"
          :email-reason="emailReason"
        />
        <p class="messaging-muted">
          {{
            row.stored
              ? `服务器已保存 · 版本 ${row.revision}`
              : '服务器默认偏好，尚未单独保存'
          }}
        </p>
        <div class="messaging-actions">
          <button
            v-if="allowed(P.subscriptionUpdate)"
            type="submit"
            class="messaging-primary"
            :disabled="busy || !isDirty(row)"
            :data-testid="`real-subscription-save-${row.channel}`"
          >
            保存我的偏好
          </button>
          <span v-if="isDirty(row)" class="messaging-muted">未保存</span>
        </div>
      </form>
    </section>
  </main>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchMessagingRecipients,
  fetchMessagingSubscriptions,
  updateMessagingSubscription,
} from '@/api/messaging'
import { confirmR1Action } from '@/services/r1-confirm'
import { errorMessage } from '@/views/leave/shared'
import { MESSAGING_PERMISSIONS as P } from '@af-admin/contracts'
import { useMessagingContext } from './use-messaging-context'
import DeliveryPicker from './delivery-picker.vue'
import type {
  MessageSubscriptionRecord,
  MessagingRecipientCatalogue,
} from '@af-admin/contracts'
import './messaging.css'

const rows = ref<MessageSubscriptionRecord[]>([])
const originals = ref<Record<string, string>>({})
const catalogue = ref<MessagingRecipientCatalogue>()
const loading = ref(false)
const signature = (row: MessageSubscriptionRecord) =>
  JSON.stringify({
    subscribed: row.subscribed,
    deliveryModes: row.deliveryModes,
  })
const isDirty = (row: MessageSubscriptionRecord) =>
  originals.value[row.channel] !== signature(row)
const { error, notice, busy, allowed, command, ticket } = useMessagingContext(
  () => rows.value.some(isDirty),
  () => {
    rows.value = []
    loading.value = false
    originals.value = {}
    catalogue.value = undefined
    load()
  }
)
const channelLabels = {
  notice: '通知',
  message: '消息',
  todo: '待办',
  alert: '预警',
}
const emailAvailable = computed(
  () =>
    catalogue.value?.deliveryModes.find((mode) => mode.mode === 'email')
      ?.available || false
)
const emailReason = computed(
  () =>
    catalogue.value?.deliveryModes.find((mode) => mode.mode === 'email')
      ?.reason || '等待服务器通道配置'
)
let sequence = 0
async function load() {
  const current = ticket()
  const seq = ++sequence
  if (!allowed(P.subscriptionRead)) return
  loading.value = true
  error.value = ''
  try {
    const [subscriptions, options] = await Promise.all([
      fetchMessagingSubscriptions(),
      fetchMessagingRecipients('subscription'),
    ])
    if (!current() || seq !== sequence) return
    rows.value = subscriptions.map((row) => ({
      ...row,
      deliveryModes: [...row.deliveryModes],
    }))
    catalogue.value = options
    originals.value = Object.fromEntries(
      rows.value.map((row) => [row.channel, signature(row)])
    )
  } catch (failure) {
    if (current() && seq === sequence) error.value = errorMessage(failure)
  } finally {
    if (current() && seq === sequence) loading.value = false
  }
}
const reload = async () => {
  if (
    rows.value.some(isDirty) &&
    !(await confirmR1Action('重新读取会丢弃未保存的订阅偏好，确认继续？'))
  )
    return
  await load()
}
const save = (row: MessageSubscriptionRecord) => {
  if (!allowed(P.subscriptionUpdate)) return
  const body = { ...row, deliveryModes: [...row.deliveryModes] }
  command(
    `subscription:${row.channel}`,
    body,
    (key) => updateMessagingSubscription(body, key),
    (result) => {
      const index = rows.value.findIndex(
        (item) => item.channel === result.channel
      )
      rows.value[index] = {
        ...result,
        deliveryModes: [...result.deliveryModes],
      }
      originals.value[result.channel] = signature(result)
      notice.value = `${channelLabels[result.channel]}订阅偏好已由服务器保存`
    }
  )
}
onMounted(load)
</script>
