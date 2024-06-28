<template>
  <div>
    <h2 class="text-base">记录日志</h2>

    <div>
      <div v-for="(item, index) in data" :key="index" class="flex mt-4 gap-2">
        <div>
          <div
            class="rounded-full p-5 bg-[#FF8247] w-6 h-6 flex justify-center items-center mt-3"
          >
            <SIcon :name="Article" :size="16" :color="'#fff'" />
          </div>
        </div>
        <div class="flex-1">
          <div class="flex justify-between items-center text-sm mt-2">
            <div>{{ item.title }}</div>
            <div class="text-gray-500 text-xs">{{ item.date }}</div>
          </div>
          <div class="text-xs mt-4 text-gray-800">
            {{ item.content }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Article } from '@salmon-ui/icons'
// import SIcon from '@/components/s-icon.vue'

const data = ref([
  {
    title: '高速公路测试',
    date: '2018-04-10 10:44',
    content:
      '高魂公路+上环段上道路线:大均多5kmm0经区现的上只的的经时时物，中的的现测试,高魂公路+上环段上道路线:大均多5kmm0经区现的上只的的经时时物，中的的现测试',
    type: 1,
  },
  {
    title: '高速公路测试',
    date: '2018-04-10 10:44',
    content:
      '高魂公路+上环段上道路线:大均多5kmm0经区现的上只的的经时时物，中的的现测试,高魂公路+上环段上道路线:大均多5kmm0经区现的上只的的经时时物，中的的现测试',
    type: 1,
  },
  {
    title: '高速公路测试',
    date: '2018-04-10 10:44',
    content:
      '高魂公路+上环段上道路线:大均多5kmm0经区现的上只的的经时时物，中的的现测试,高魂公路+上环段上道路线:大均多5kmm0经区现的上只的的经时时物，中的的现测试',
    type: 1,
  },
])
</script>

<style lang="scss" scoped></style>
