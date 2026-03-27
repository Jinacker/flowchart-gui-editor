/**
 * useFlowToMermaid.js
 *
 * VueFlow nodes[] + edges[] → Mermaid flowchart 텍스트 변환
 *
 * 노드 shape → Mermaid 문법 매핑:
 *   default       → A["label"]
 *   round         → A("label")
 *   diamond       → A{"label"}
 *   stadium       → A(["label"])
 *   circle        → A(("label"))
 *   parallelogram → A[/"label"/]
 */

/**
 * 특수문자를 Mermaid 문자열에서 안전하게 처리
 */
function sanitizeLabel(label) {
  if (!label) return ''
  // 큰따옴표는 작은따옴표로 대체 (Mermaid 큰따옴표 내부에서 충돌 방지)
  return String(label).replace(/"/g, "'")
}

/**
 * shape에 따라 Mermaid 노드 문자열 생성
 */
function nodeToMermaid(id, label, shape) {
  const l = sanitizeLabel(label || id)
  switch (shape) {
    case 'diamond':      return `  ${id}{"${l}"}`
    case 'stadium':      return `  ${id}(["${l}"])`
    case 'circle':       return `  ${id}(("${l}"))`
    case 'round':        return `  ${id}("${l}")`
    case 'parallelogram': return `  ${id}[/"${l}"/]`
    default:             return `  ${id}["${l}"]`
  }
}

/**
 * VueFlow nodes + edges → Mermaid flowchart 텍스트
 *
 * @param {object[]} nodes    VueFlow nodes 배열
 * @param {object[]} edges    VueFlow edges 배열
 * @param {string}   direction  'TD' | 'LR' | 'BT' | 'RL'
 * @param {string[]} preservedLines  파싱 시 보존된 스타일/주석 줄
 * @returns {string}
 */
export function toMermaid(nodes, edges, direction = 'TD', preservedLines = []) {
  const lines = [`flowchart ${direction}`]

  // 노드 정의
  nodes.forEach(node => {
    const { label = node.id, shape = 'default' } = node.data || {}
    lines.push(nodeToMermaid(node.id, label, shape))
  })

  lines.push('')

  // 엣지 정의
  edges.forEach(edge => {
    const src = edge.source
    const tgt = edge.target
    const label = edge.label || edge.data?.label || ''

    if (label) {
      lines.push(`  ${src} -->|"${sanitizeLabel(label)}"| ${tgt}`)
    } else {
      lines.push(`  ${src} --> ${tgt}`)
    }
  })

  // 보존된 줄 복원 (style, classDef, %% 등)
  if (preservedLines && preservedLines.length > 0) {
    lines.push('')
    preservedLines.forEach(l => lines.push(l))
  }

  return lines.join('\n')
}
