<template>
  <div>
    <a-carousel
      indicator-type="slider"
      show-arrow="hover"
      auto-play
      class="w-full rounded h-40"
    >
      <a-carousel-item v-for="(item, idx) in slides" :key="idx">
        <img :src="item" class="object-cover w-full h-full" />
      </a-carousel-item>
    </a-carousel>
    <div class="bg-white px-4 py-3">
      <ul>
        <li
          v-for="(item, i) in notice"
          :key="i"
          class="overflow-hidden flex items-center text-gray-500 my-2 cursor-pointer group"
        >
          <a-tag :color="item.color" size="small" class="flex-shrink-0">
            {{ item.label }}
          </a-tag>
          <span
            class="truncate flex-grow ml-2 text-[13px] group-hover:text-gray-800"
          >
            {{ item.title }}
          </span>
        </li>
      </ul>
      <div class="text-right">
        <a-link>查看更多</a-link>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import img1 from '@/assets/slide-1.png'
import img2 from '@/assets/slide-2.png'
import img3 from '@/assets/slide-3.png'
import img4 from '@/assets/slide-4.png'

const slides = [img1, img2, img3, img4]
const notice = [
  {
    color: 'orangered',
    label: '警告',
    title: '业务审核时间截止至 12 月 31 日，请尽快完成审核',
  },
  {
    color: 'blue',
    label: '待办',
    title: '您有 26 条待审核申报',
  },
  {
    color: 'blue',
    label: '待办',
    title: '您今日有 1 项待办事项',
  },
  {
    color: 'cyan',
    label: '消息',
    title: '2022年12月系统升级维护计划',
  },
  {
    color: 'cyan',
    label: '消息',
    title: '您被 @超级管理员 新增了 1 项事务权限',
  },
  {
    color: 'cyan',
    label: '消息',
    title: '您的请假审批已经通过',
  },
]
</script>
