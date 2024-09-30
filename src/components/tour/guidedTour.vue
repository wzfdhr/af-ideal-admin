<template>
  <div v-if="currentStep" class="tour-guide">
    <div class="tour-step" :style="stepStyle">
      <h3>{{ currentStep.title }}</h3>
      <p>{{ currentStep.content }}</p>
      <button @click="nextStep">下一步</button>
      <button @click="closeTour">关闭</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'

const emit = defineEmits(['update:showTour'])

const props = defineProps({
  showTour: {
    type: Number || String,
    required: true,
  },
})
const currentIndex = computed({
  get: () => props.showTour,
  set: (val) => {
    emit('update:showTour', val)
  },
})
interface TourStep {
  id: string
  title: string
  content: string
  target: string // CSS选择器
  position: 'top' | 'right' | 'bottom' | 'left'
}

const tourSteps: TourStep[] = [
  {
    id: 'step1',
    title: '欢迎',
    content: '这是我们的第一个功能点！',
    target: '#feature1',
    position: 'top',
  },
  {
    id: 'step1',
    title: '欢迎',
    content: '这是我们的第二个功能点！',
    target: '#feature1',
    position: 'top',
  },
]

// console.log(currentIndex)
// const currentIndex = ref(0)
watch(props, () => {
  console.log(currentIndex.value)
  // console.log(currentStep)
})
const currentStep = computed(() => tourSteps[currentIndex.value])

const stepStyle = computed(() => {
  if (!currentStep.value) return {}
  const targetRect = document
    .querySelector(currentStep.value.target)
    ?.getBoundingClientRect()
  if (!targetRect) return {}

  const style: any = {
    position: 'absolute',
    zIndex: 1000,
    padding: '10px',
    backgroundColor: 'white',
    border: '1px solid #ccc',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  }

  // 根据position属性设置位置
  switch (currentStep.value.position) {
    case 'top':
      style.top = `${targetRect.top - 50}px`
      style.left = `${targetRect.left + targetRect.width / 2 - 100}px` // 假设引导框宽度为200px
      break
    // 其他位置...
    default:
      console.error('Unexpected position:', currentStep.value.position)
      break
  }

  return style
})

function nextStep() {
  console.log(currentIndex.value, tourSteps.length)
  if (currentIndex.value < tourSteps.length - 1) {
    currentIndex.value++
  }
}

function closeTour() {
  currentIndex.value = -1 // 隐藏引导
}
</script>

<style scoped>
.tour-guide {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none; /* 防止点击穿透 */
}

.tour-step {
  pointer-events: auto; /* 允许在引导框内点击 */
}
</style>
