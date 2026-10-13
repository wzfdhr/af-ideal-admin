<template>
  <fieldset :disabled="disabled">
    <legend>{{ label || '投递方式' }}</legend>
    <label class="messaging-check">
      <input
        :checked="modelValue.includes('in-app')"
        :disabled="allowedModes && !allowedModes.includes('in-app')"
        type="checkbox"
        @change="toggle('in-app', $event)"
      />
      站内信
    </label>
    <label class="messaging-check">
      <input
        :checked="modelValue.includes('websocket')"
        :disabled="allowedModes && !allowedModes.includes('websocket')"
        type="checkbox"
        @change="toggle('websocket', $event)"
      />
      WebSocket
    </label>
    <label class="messaging-check">
      <input
        :checked="modelValue.includes('email')"
        type="checkbox"
        :disabled="
          !emailEnabled || (allowedModes && !allowedModes.includes('email'))
        "
        @change="toggle('email', $event)"
      />
      邮件
    </label>
    <p v-if="!emailEnabled" class="messaging-muted">
      {{ emailReason || '邮件服务不可用，请等待服务器返回通道配置。' }}
    </p>
  </fieldset>
</template>
<script setup lang="ts">
import type { MessagingDeliveryMode } from '@af-admin/contracts'

const props = defineProps<{
  modelValue: MessagingDeliveryMode[]
  disabled?: boolean
  emailEnabled?: boolean
  emailReason?: string
  label?: string
  allowedModes?: MessagingDeliveryMode[]
}>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: MessagingDeliveryMode[]): void
}>()
const toggle = (value: MessagingDeliveryMode, event: Event) => {
  const values = new Set(props.modelValue)
  if ((event.target as HTMLInputElement).checked) values.add(value)
  else values.delete(value)
  emit('update:modelValue', [...values])
}
</script>
