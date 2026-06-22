<template>
  <div
    ref="containerRef"
    class="workflow-canvas"
    data-testid="workflow-canvas"
    @dragover.prevent
    @drop="handleDrop"
  />
</template>

<script setup lang="ts">
import { Graph } from '@antv/x6'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  WorkflowNodeType,
  WorkflowSchema,
} from '@/components/workflow-designer/schema'

const props = defineProps<{
  schema: WorkflowSchema
  selectedNodeId?: string
}>()

const emit = defineEmits<{
  (event: 'select-node', nodeId: string): void
  (
    event: 'canvas-drop',
    payload: {
      type: WorkflowNodeType
      x: number
      y: number
    }
  ): void
}>()

const containerRef = ref<HTMLDivElement>()
const graphRef = ref<Graph>()

const renderGraph = () => {
  const graph = graphRef.value
  if (!graph) {
    return
  }

  graph.clearCells()

  props.schema.nodes.forEach((node) => {
    const active = node.id === props.selectedNodeId
    graph.addNode({
      id: node.id,
      x: node.x ?? 120,
      y: node.y ?? 120,
      width: 132,
      height: 44,
      label: node.name,
      attrs: {
        body: {
          fill: active ? '#e8f3ff' : '#ffffff',
          stroke: active ? '#165dff' : '#c9cdd4',
          strokeWidth: active ? 2 : 1,
          rx: 6,
          ry: 6,
        },
        label: {
          fill: '#1d2129',
          fontSize: 13,
        },
      },
    })
  })

  props.schema.edges.forEach((edge) => {
    graph.addEdge({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      attrs: {
        line: {
          stroke: '#86909c',
          strokeWidth: 1.4,
          targetMarker: {
            name: 'block',
            size: 7,
          },
        },
      },
    })
  })
}

const handleDrop = (event: DragEvent) => {
  const type = event.dataTransfer?.getData(
    'workflow-node-type'
  ) as WorkflowNodeType

  if (!type) {
    return
  }

  const rect = containerRef.value?.getBoundingClientRect()
  emit('canvas-drop', {
    type,
    x: rect ? event.clientX - rect.left : event.offsetX,
    y: rect ? event.clientY - rect.top : event.offsetY,
  })
}

onMounted(() => {
  if (!containerRef.value) {
    return
  }

  graphRef.value = new Graph({
    container: containerRef.value,
    autoResize: true,
    background: {
      color: '#f7f8fa',
    },
    grid: {
      visible: true,
      type: 'mesh',
      args: {
        color: '#e5e6eb',
        thickness: 1,
      },
    },
    panning: true,
    mousewheel: {
      enabled: true,
      modifiers: ['ctrl', 'meta'],
    },
  })

  graphRef.value.on('node:click', ({ node }) => {
    emit('select-node', String(node.id))
  })

  renderGraph()
})

onBeforeUnmount(() => {
  graphRef.value?.dispose()
})

watch(
  () => [props.schema, props.selectedNodeId],
  () => renderGraph(),
  {
    deep: true,
  }
)
</script>

<style scoped>
.workflow-canvas {
  width: 100%;
  height: 100%;
  min-height: 560px;
  border: 1px solid #e5e6eb;
  background: #f7f8fa;
}
</style>
