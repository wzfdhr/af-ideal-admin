<template>
  <a-form :model="data">
    <a-form-item label="请假人">
      <a-input v-model="data.user" readonly />
    </a-form-item>
    <a-form-item label="请假类型">
      <a-select
        :options="['事假', '病假', '带薪年假', '调休']"
        placeholder="请选择休假类别"
      />
    </a-form-item>
    <a-form-item label="休假日期">
      <a-range-picker class="w-full" />
    </a-form-item>
    <a-form-item>
      <div
        class="px-4 py-3 border bg-blue-50 border-blue-300 text-gray-700 leading-5"
      >
        您当前还有
        <b class="mx-1">5日</b>
        未兑现年假及
        <b class="mx-1">12日</b>
        未兑现调休。建议您优先选择带薪年假或调休作为休假类型，避免到期无法兑现。
      </div>
    </a-form-item>
    <a-form-item>
      <a-button type="primary" @click="toNextStep">下一步</a-button>
    </a-form-item>
  </a-form>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { useUserStore } from '@/store'

const { userInfo } = useUserStore()

const emit = defineEmits(['step-change'])

const data = ref({
  user: userInfo.name,
})

const toNextStep = () => {
  emit('step-change', 2)
}
</script>
