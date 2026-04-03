<template>
  <div class="mfe-root">
    <FlowCanvas
      :initial-elements="parsedElements"
      :on-mermaid-change="props.onMermaidChange"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import FlowCanvas from './components/FlowCanvas.vue'
import { parseMermaid } from './composables/useMermaidParser.js'

const props = defineProps({
  initialMermaid: { type: String, default: '' },
  onMermaidChange: { type: Function, required: true },
})

const parsedElements = ref({ nodes: [], edges: [], direction: 'TD', preservedLines: [] })

onMounted(async () => {
  if (props.initialMermaid && props.initialMermaid.trim()) {
    try {
      parsedElements.value = await parseMermaid(props.initialMermaid)
    } catch (e) {
      console.warn('[MermaidFlowEditor] 파싱 실패, 빈 캔버스로 시작합니다.', e)
    }
  }
})
</script>

<style>
/* island 루트: 전체 영역 채움 (position:relative 부모 기준) */
.mfe-root {
  position: absolute;
  inset: 0;
}
</style>
