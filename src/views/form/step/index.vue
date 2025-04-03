<template>
  <main class="px-6 pb-4 relative">
    <s-navs :navs="['menu.form', 'menu.form.step']" />

    <div class="s-section">
      <div class="max-w-3xl mx-auto mt-6">
        <a-steps v-model:current="step">
          <a-step>发起请假</a-step>
          <a-step>填写请假申请</a-step>
          <a-step>提交审批</a-step>
        </a-steps>

        <div class="pr-20 mt-16">
          <base-step v-if="step === 1" @step-change="changeStep" />
          <detail-step v-if="step === 2" @step-change="changeStep" />
          <status-step v-if="step === 3" @step-change="changeStep" />
        </div>
      </div>
    </div>
  </main>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import BaseStep from './widgets/base-step.vue'
import DetailStep from './widgets/detail-step.vue'
import StatusStep from './widgets/status-step.vue'

const step = ref(1)

const changeStep = (to: number) => {
  step.value = to
}
</script>
