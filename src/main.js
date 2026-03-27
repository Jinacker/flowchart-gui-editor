import { createApp } from 'vue'
import MermaidFlowEditor from './MermaidFlowEditor.vue'

/**
 * window.MermaidFlowEditor
 *
 * Vue 2 호스트(CfgSettingModal.js)가 호출하는 공개 API.
 *
 * 사용법:
 *   const instance = window.MermaidFlowEditor.mount('#mermaid-gui-editor', mermaidCode)
 *   instance.getMermaid()   // 현재 편집 중인 mermaid 코드 반환
 *   instance.unmount()      // 정리
 */
window.MermaidFlowEditor = {
  /**
   * @param {string} mountSelector  CSS 셀렉터 (예: '#mermaid-gui-editor')
   * @param {string} initialMermaid 초기 mermaid 코드
   * @returns {{ unmount: Function, getMermaid: Function } | null}
   */
  mount(mountSelector, initialMermaid) {
    const el = document.querySelector(mountSelector)
    if (!el) {
      console.error('[MermaidFlowEditor] 마운트 대상 없음:', mountSelector)
      return null
    }

    // 현재 mermaid 코드를 클로저에 보관 (getMermaid() 동기 반환용)
    let currentMermaid = initialMermaid || ''

    const app = createApp(MermaidFlowEditor, {
      initialMermaid: currentMermaid,
      onMermaidChange(newCode) {
        currentMermaid = newCode
        // Vue 2 호스트에게 CustomEvent로 알림
        el.dispatchEvent(new CustomEvent('mermaid-flow-editor:change', {
          bubbles: true,
          detail: { mermaid: newCode },
        }))
      },
    })

    app.mount(el)

    return {
      /** 최신 mermaid 코드를 동기 반환 (GUI → 코드 탭 전환 시 사용) */
      getMermaid() { return currentMermaid },
      /** Vue 3 앱 언마운트 + 이벤트 정리 */
      unmount() { app.unmount() },
    }
  },
}
