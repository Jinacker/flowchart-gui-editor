<template>
  <div class="flow-canvas-wrapper">
    <!-- 툴바 -->
    <div class="fc-toolbar">
      <div class="fc-toolbar-left">
        <button class="fc-btn fc-btn-add" @click="addNode" title="노드 추가">
          <span>+ 노드</span>
        </button>
        <button class="fc-btn fc-btn-del" @click="deleteSelected" title="선택 삭제">
          <span>삭제</span>
        </button>
        <span class="fc-divider"></span>
        <select v-model="direction" class="fc-select" @change="onDirectionChange" title="레이아웃 방향">
          <option value="TD">↓ 위→아래</option>
          <option value="LR">→ 좌→우</option>
          <option value="BT">↑ 아래→위</option>
          <option value="RL">← 우→좌</option>
        </select>
      </div>
      <div class="fc-toolbar-right">
        <button class="fc-btn" @click="handleFitView" title="화면 맞춤">맞춤</button>
      </div>
    </div>

    <!-- VueFlow 캔버스 -->
    <div class="fc-canvas">
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        :default-viewport="{ zoom: 0.85 }"
        :min-zoom="0.2"
        :max-zoom="4"
        :nodes-connectable="true"
        :nodes-draggable="true"
        :elements-selectable="true"
        :delete-key-code="'Delete'"
        @node-double-click="onNodeDoubleClick"
        @connect="onConnect"
        @nodes-change="onGraphChange"
        @edges-change="onGraphChange"
      >
        <!-- 커스텀 노드 슬롯 -->
        <template #node-custom="nodeProps">
          <div
            class="fc-node"
            :class="[`fc-node--${nodeProps.data.shape || 'default'}`, { 'fc-node--selected': nodeProps.selected }]"
          >
            <Handle type="target" :position="targetHandlePos" />
            <div class="fc-node-label">{{ nodeProps.data.label || nodeProps.id }}</div>
            <Handle type="source" :position="sourceHandlePos" />
          </div>
        </template>

        <Background pattern-color="#aaa" :gap="20" />
        <Controls />
      </VueFlow>
    </div>

    <!-- 노드 편집 모달 -->
    <NodeEditModal
      :visible="editModal.visible"
      :node-id="editModal.nodeId"
      :label="editModal.label"
      :shape="editModal.shape"
      @confirm="onEditConfirm"
      @cancel="editModal.visible = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { VueFlow, useVueFlow, Handle, Position } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

import NodeEditModal from './NodeEditModal.vue'
import { toMermaid } from '../composables/useFlowToMermaid.js'

// ── Props / Emits ──────────────────────────────────────────────────────────
const props = defineProps({
  initialElements: {
    type: Object,
    default: () => ({ nodes: [], edges: [], direction: 'TD', preservedLines: [] }),
  },
  onMermaidChange: { type: Function, required: true },
})

// ── VueFlow 상태 ───────────────────────────────────────────────────────────
const nodes = ref([])
const edges = ref([])
const direction = ref('TD')
const preservedLines = ref([])

const { onInit, fitView: vfFitView, addEdges, getSelectedNodes, getSelectedEdges, removeNodes, removeEdges, getViewport } = useVueFlow()

// VueFlow 초기화 후 노드가 있으면 fitView
onInit(() => {
  if (nodes.value.length > 0) {
    setTimeout(() => vfFitView({ padding: 0.15 }), 50)
  }
})

// ── initialElements 로드 ───────────────────────────────────────────────────
watch(
  () => props.initialElements,
  (el) => {
    if (!el) return
    nodes.value = el.nodes || []
    edges.value = el.edges || []
    direction.value = el.direction || 'TD'
    preservedLines.value = el.preservedLines || []
    // 노드 로드 후 뷰포트 맞춤
    if ((el.nodes || []).length > 0) {
      setTimeout(() => vfFitView({ padding: 0.15 }), 100)
    }
  },
  { immediate: true }
)

// ── 핸들 위치 (direction에 따라 결정) ──────────────────────────────────────
const sourceHandlePos = computed(() => {
  return (direction.value === 'LR' || direction.value === 'RL')
    ? (direction.value === 'RL' ? Position.Left : Position.Right)
    : Position.Bottom
})
const targetHandlePos = computed(() => {
  return (direction.value === 'LR' || direction.value === 'RL')
    ? (direction.value === 'RL' ? Position.Right : Position.Left)
    : Position.Top
})

// ── 그래프 변경 → mermaid 코드 생성 → 부모에 알림 ─────────────────────────
let changeTimer = null
function onGraphChange() {
  clearTimeout(changeTimer)
  changeTimer = setTimeout(() => {
    const code = toMermaid(nodes.value, edges.value, direction.value, preservedLines.value)
    props.onMermaidChange(code)
  }, 150)
}

function onDirectionChange() {
  onGraphChange()
}

// ── 노드 추가 ──────────────────────────────────────────────────────────────
let nodeCounter = 1

function addNode() {
  // 기존 노드 ID와 겹치지 않도록 카운터 증가
  while (nodes.value.find(n => n.id === `N${nodeCounter}`)) nodeCounter++
  const newId = `N${nodeCounter}`
  nodeCounter++

  // 뷰포트 중앙에 배치
  const vp = getViewport()
  const containerEl = document.querySelector('.fc-canvas')
  const w = containerEl?.clientWidth || 600
  const h = containerEl?.clientHeight || 500
  const x = (-vp.x + w / 2) / vp.zoom - 90
  const y = (-vp.y + h / 2) / vp.zoom - 25

  const newNode = {
    id: newId,
    type: 'custom',
    position: { x, y },
    data: { label: '새 노드', shape: 'default' },
    class: 'fc-node--flash',
  }
  nodes.value = [...nodes.value, newNode]

  // 깜박임 효과 후 class 제거
  setTimeout(() => {
    nodes.value = nodes.value.map(n =>
      n.id === newId ? { ...n, class: undefined } : n
    )
  }, 1000)

  setTimeout(() => vfFitView({ padding: 0.1 }), 50)
  onGraphChange()
}

// ── 선택 노드/엣지 삭제 ────────────────────────────────────────────────────
function deleteSelected() {
  const selectedNodes = getSelectedNodes.value
  const selectedEdges = getSelectedEdges.value
  if (selectedNodes.length === 0 && selectedEdges.length === 0) return

  // 선택된 엣지 삭제
  if (selectedEdges.length > 0) {
    removeEdges(selectedEdges)
  }

  // 선택된 노드 삭제 + 연결된 엣지도 제거
  if (selectedNodes.length > 0) {
    const selectedIds = new Set(selectedNodes.map(n => n.id))
    removeNodes(selectedNodes)
    edges.value = edges.value.filter(
      e => !selectedIds.has(e.source) && !selectedIds.has(e.target)
    )
  }

  onGraphChange()
}

// ── 노드 연결 ──────────────────────────────────────────────────────────────
function onConnect(params) {
  addEdges([{
    ...params,
    id: `e-${params.source}-${params.target}-${Date.now()}`,
    type: 'smoothstep',
    markerEnd: { type: 'arrowclosed' },
    style: { strokeWidth: 1.5 },
    label: '',
  }])
  onGraphChange()
}

// ── 노드 더블클릭 → 편집 모달 ──────────────────────────────────────────────
const editModal = ref({ visible: false, nodeId: '', label: '', shape: 'default' })

function onNodeDoubleClick({ node }) {
  editModal.value = {
    visible: true,
    nodeId: node.id,
    label: node.data?.label || node.id,
    shape: node.data?.shape || 'default',
  }
}

function onEditConfirm({ id, label, shape }) {
  nodes.value = nodes.value.map(n =>
    n.id === id
      ? { ...n, data: { ...n.data, label, shape } }
      : n
  )
  editModal.value.visible = false
  onGraphChange()
}

// ── 화면 맞춤 ──────────────────────────────────────────────────────────────
function handleFitView() {
  vfFitView({ padding: 0.1 })
}

// ── 외부에서 호출 가능하도록 expose ────────────────────────────────────────
defineExpose({ handleFitView })
</script>

<style scoped>
.flow-canvas-wrapper {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #fafafa;
  border-radius: 4px;
  overflow: hidden;
}

/* 툴바 */
.fc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: #fff;
  border-bottom: 1px solid #e5e5e5;
  flex-shrink: 0;
  gap: 8px;
}
.fc-toolbar-left,
.fc-toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.fc-btn {
  padding: 4px 12px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  color: #333;
  white-space: nowrap;
  transition: background 0.1s, border-color 0.1s;
}
.fc-btn:hover { background: #f5f5f5; border-color: #bbb; }
.fc-btn-add { color: #4a90e2; border-color: #4a90e2; }
.fc-btn-add:hover { background: #eaf3ff; }
.fc-btn-del { color: #e25252; border-color: #e25252; }
.fc-btn-del:hover { background: #ffeaea; }
.fc-divider { width: 1px; height: 18px; background: #e0e0e0; margin: 0 2px; }
.fc-select {
  padding: 4px 8px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 12px;
  background: #fff;
  cursor: pointer;
  color: #333;
}

/* 캔버스 */
.fc-canvas {
  flex: 1;
  min-height: 0;
  position: relative;
}

/* 커스텀 노드 공통 */
.fc-node {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 100px;
  min-height: 40px;
  padding: 8px 14px;
  background: #fff;
  border: 2px solid #555;
  border-radius: 4px;
  font-size: 12px;
  cursor: grab;
  user-select: none;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
  text-align: center;
  word-break: break-word;
}
.fc-node:hover { border-color: #4a90e2; box-shadow: 0 2px 8px rgba(74,144,226,0.18); }
.fc-node--selected { border-color: #4a90e2 !important; box-shadow: 0 0 0 2px rgba(74,144,226,0.3); }

/* shape 별 스타일 */
.fc-node--diamond {
  background: #fffbe6;
  border-color: #d4a017;
  border-radius: 0;
  transform: rotate(0deg);
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  min-width: 110px;
  min-height: 60px;
}
.fc-node--diamond .fc-node-label { transform: none; }

.fc-node--stadium {
  border-radius: 999px;
  background: #f0fff4;
  border-color: #38a169;
  padding: 8px 20px;
}

.fc-node--circle {
  border-radius: 50%;
  background: #e8f4fd;
  border-color: #3182ce;
  min-width: 70px;
  min-height: 70px;
  padding: 10px;
}

.fc-node--round {
  border-radius: 12px;
  background: #fef9ff;
  border-color: #805ad5;
}

.fc-node--parallelogram {
  background: #fff5f5;
  border-color: #c53030;
  transform: skewX(-15deg);
}
.fc-node--parallelogram .fc-node-label {
  transform: skewX(15deg);
}

/* 새 노드 flash 애니메이션 */
:global(.fc-node--flash) {
  animation: nodeFlash 1s ease-out;
}
@keyframes nodeFlash {
  0%   { box-shadow: 0 0 0 4px rgba(74,144,226,0.7); border-color: #4a90e2; }
  100% { box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
}

.fc-node-label {
  font-size: 12px;
  line-height: 1.4;
  color: #222;
  max-width: 160px;
  overflow-wrap: break-word;
}
</style>
