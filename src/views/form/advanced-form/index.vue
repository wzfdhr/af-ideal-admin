<template>
  <main class="px-6 pb-4 relative">
    <s-navs :navs="['menu.form', 'menu.form.advanced-form']" />

    <div class="s-section">
      <repo-form ref="repoFormComp" />
    </div>

    <div class="s-section mt-4 mb-14">
      <member-form ref="MemberFormComp" />
    </div>

    <div class="fixed bottom-0 w-full left-0 border-t">
      <div class="w-full bg-white text-right px-6 py-3">
        <a-space>
          <a-button>重置</a-button>
          <a-button html-type="submit" type="primary" @click="submit">
            提交
          </a-button>
        </a-space>
      </div>
    </div>
  </main>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import RepoForm from './widgets/repo-form.vue'
import MemberForm from './widgets/member-form.vue'
import type { SubFormCompCtx } from './types'

const repoFormComp = ref<SubFormCompCtx>()
const memberFormComp = ref<SubFormCompCtx>()

const submit = () => {
  repoFormComp.value?.handleValidate()
  memberFormComp.value?.handleValidate()
}
</script>
