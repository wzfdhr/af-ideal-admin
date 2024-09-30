<template>
  <a-form :model="data">
    <a-form-item label="所属部门">
      <a-input readonly default-value="体验技术部 XTD" />
    </a-form-item>
    <a-form-item label="分管领导">
      <a-input readonly default-value="@张三" />
    </a-form-item>
    <a-form-item label="抄送">
      <a-mention
        :data="['李四', '王五', '赵六', '孙琪']"
        placeholder="输入 @ 符号..."
      />
    </a-form-item>
    <a-form-item label="请假事由">
      <a-textarea
        :auto-size="{ maxRows: 8, minRows: 4 }"
        placeholder="兑现带薪年假或调休时无需填写"
      />
    </a-form-item>
    <a-form-item>
      <a-button class="mr-4" @click="changeStep(1)">上一步</a-button>
      <a-button type="primary" @click="changeStep(3)">下一步</a-button>
    </a-form-item>
  </a-form>
</template>

<script lang="ts" setup>
import { ref } from 'vue'

const data = ref({})

const emit = defineEmits(['step-change'])

const changeStep = (to: number) => {
  emit('step-change', to)
}
</script>
