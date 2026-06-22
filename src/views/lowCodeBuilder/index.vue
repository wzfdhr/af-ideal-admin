<template>
  <main class="p-6 h-full w-full">
    <s-navs :navs="['menu.Scalability', 'menu.Scalability.lowCodeBuilder']" />
    <low-code-builder class="mt-4" />
  </main>
</template>

<script setup lang="ts">
import LowCodeBuilder from '@/components/low-code/builder/index.vue'
</script>
