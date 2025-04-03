<template>
  <main class="px-6 pb-4">
    <s-navs :navs="['menu.list', 'menu.list.card']" />

    <div class="s-section">
      <h2 class="text-lg">业务办理</h2>
      <div class="flex items-center justify-between">
        <div><!-- empty for now --></div>
        <div class="w-60">
          <a-input-search placeholder="搜索" />
        </div>
      </div>

      <div v-if="isLoading">
        <a-skeleton animation>
          <a-skeleton-line :widths="['20%']" :rows="1" />
          <a-row :gutter="24" align="stretch" class="mt-4">
            <a-col v-for="i in 4" :key="i" :span="6">
              <a-skeleton-line :widths="['100%']" :line-height="120" />
            </a-col>
          </a-row>
        </a-skeleton>
      </div>
      <div v-for="group in policies" v-else :key="group.name" class="mt-4">
        <h3 class="mb-4 text-base font-bold text-gray-700">{{ group.name }}</h3>
        <div class="grid grid-cols-4 gap-6">
          <s-card
            v-for="item in group.items"
            :key="item.id"
            :active="item.active"
            :title="item.name"
            :start-time="item.startTime"
            :end-time="item.endTime"
          />
        </div>
      </div>
    </div>
  </main>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { getGroups, GroupedBusinessEntry } from '@/api/business'
import useLoading from '@/hooks/use-loading'
import SCard from './widgets/policy-item.vue'

const policies = ref<GroupedBusinessEntry[]>([])
const { setLoading, isLoading } = useLoading()

setLoading(true)

getGroups()
  .then((res) => {
    policies.value = res.data
  })
  .catch((err) => {
    Message.error({
      content: err,
    })
  })
  .finally(() => {
    setLoading(false)
  })
</script>
