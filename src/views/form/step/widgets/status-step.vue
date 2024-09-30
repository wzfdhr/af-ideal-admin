<template>
  <a-result status="success" title="请假申请已提交">
    <template #subtitle>请假流程预计于 8 个小时内审批完成</template>
    <template #extra>
      <a-space>
        <a-button type="primary" @click="toFirstStep">返回</a-button>
      </a-space>
    </template>
  </a-result>
</template>

<script lang="ts" setup>
const emit = defineEmits(['step-change'])

const toFirstStep = () => {
  emit('step-change', 1)
}
</script>
