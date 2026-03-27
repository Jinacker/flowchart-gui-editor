<template>
  <div v-if="visible" class="nem-overlay" @click.self="cancel">
    <div class="nem-modal">
      <h4 class="nem-title">노드 편집</h4>

      <div class="nem-field">
        <label class="nem-label">텍스트</label>
        <input
          ref="labelInput"
          v-model="localLabel"
          class="nem-input"
          @keyup.enter="confirm"
          @keyup.esc="cancel"
          placeholder="노드 텍스트"
        />
      </div>

      <div class="nem-field">
        <label class="nem-label">모양</label>
        <select v-model="localShape" class="nem-select">
          <option value="default">사각형 [ ]</option>
          <option value="round">둥근 사각형 ( )</option>
          <option value="diamond">마름모 { } (조건)</option>
          <option value="stadium">타원 ([ ]) (시작/종료)</option>
          <option value="circle">원 (( ))</option>
        </select>
      </div>

      <div class="nem-actions">
        <button class="nem-btn nem-btn-cancel" @click="cancel">취소</button>
        <button class="nem-btn nem-btn-confirm" @click="confirm">확인</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  nodeId:  { type: String, default: '' },
  label:   { type: String, default: '' },
  shape:   { type: String, default: 'default' },
})

const emit = defineEmits(['confirm', 'cancel'])

const localLabel = ref('')
const localShape = ref('default')
const labelInput = ref(null)

watch(() => props.visible, (v) => {
  if (v) {
    localLabel.value = props.label
    localShape.value = props.shape || 'default'
    nextTick(() => labelInput.value?.focus())
  }
})

function confirm() {
  emit('confirm', { id: props.nodeId, label: localLabel.value, shape: localShape.value })
}
function cancel() {
  emit('cancel')
}
</script>

<style scoped>
.nem-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.nem-modal {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  min-width: 300px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.nem-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #222;
}
.nem-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.nem-label {
  font-size: 12px;
  color: #555;
  font-weight: 500;
}
.nem-input,
.nem-select {
  padding: 7px 10px;
  border: 1px solid #ccc;
  border-radius: 5px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.nem-input:focus,
.nem-select:focus {
  border-color: #4a90e2;
}
.nem-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.nem-btn {
  padding: 7px 18px;
  border-radius: 5px;
  font-size: 13px;
  cursor: pointer;
  border: none;
  font-weight: 500;
}
.nem-btn-cancel {
  background: #f0f0f0;
  color: #444;
}
.nem-btn-cancel:hover { background: #e0e0e0; }
.nem-btn-confirm {
  background: #4a90e2;
  color: #fff;
}
.nem-btn-confirm:hover { background: #357abd; }
</style>
