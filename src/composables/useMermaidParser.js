/**
 * useMermaidParser.js
 *
 * Mermaid flowchart 텍스트 → VueFlow { nodes, edges } 변환
 *
 * 지원 문법:
 *   flowchart TD / LR / BT / RL
 *   graph TD / LR (구문법)
 *
 * 노드 shape:
 *   A[text]       → default  (사각형)
 *   A(text)       → round    (둥근 사각형)
 *   A{text}       → diamond  (마름모)
 *   A([text])     → stadium  (타원)
 *   A((text))     → circle   (원)
 *   A[/"text"/]   → parallelogram
 *
 * 엣지:
 *   A --> B
 *   A -->|label| B
 *   A -- label --> B
 *   A -.-> B      (점선, arrow로 처리)
 *   A ==> B       (두꺼운 화살표, arrow로 처리)
 *
 * 파싱 불가 줄(style, classDef, subgraph, click, %%) →
 *   preservedLines[] 에 보관 후 toMermaid() 출력 끝에 복원
 */

import { layoutWithGraphviz } from './graphvizLayout.js'

/** @typedef {{ id: string, label: string, shape: string }} RawNode */
/** @typedef {{ id: string, source: string, target: string, label: string }} RawEdge */

// ── 정규식 모음 ────────────────────────────────────────────────────────────

// flowchart/graph 선언 줄
const RE_DIRECTION = /^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)\s*$/i

// 노드 정의 (엣지 없이 단독으로 나오는 경우)
// 예: A["label"]  A{label}  A([label])  A((label))
const NODE_PATTERNS = [
  // stadium: A(["text"]) 또는 A([text])
  { re: /^(\w+)\(\["([^"]*?)"\]\)/, shape: 'stadium' },
  { re: /^(\w+)\(\[([^\]]*?)\]\)/, shape: 'stadium' },
  // circle: A(("text")) 또는 A((text))
  { re: /^(\w+)\(\("([^"]*?)"\)\)/, shape: 'circle' },
  { re: /^(\w+)\(\(([^)]*?)\)\)/, shape: 'circle' },
  // diamond: A{"text"} 또는 A{text}
  { re: /^(\w+)\{"([^"]*?)"\}/, shape: 'diamond' },
  { re: /^(\w+)\{([^}]*?)\}/, shape: 'diamond' },
  // parallelogram: A[/"text"/] or A[/text/]  ← 양쪽 / 모두 필수
  { re: /^(\w+)\[\/"([^"]*?)"\/\]/, shape: 'parallelogram' },
  { re: /^(\w+)\[\/([^/\]]+?)\/\]/, shape: 'parallelogram' },
  // round: A("text") 또는 A(text)
  { re: /^(\w+)\("([^"]*?)"\)/, shape: 'round' },
  { re: /^(\w+)\(([^)]*?)\)/, shape: 'round' },
  // default: A["text"] 또는 A[text]
  { re: /^(\w+)\["([^"]*?)"\]/, shape: 'default' },
  { re: /^(\w+)\[([^\]]*?)\]/, shape: 'default' },
]

// 엣지 패턴 (source, label, target 추출)
// A -- label --> B  /  A -->|label| B  /  A --> B
const EDGE_PATTERNS = [
  // A -- "label" --> B
  { re: /^(\w+)\s+--\s+"([^"]*?)"\s+-->\s+(\w+)/ },
  // A -- label --> B (따옴표 없음)
  { re: /^(\w+)\s+--\s+([^->\s][^->]*?)\s+-->\s+(\w+)/ },
  // A -->|"label"| B
  { re: /^(\w+)\s*-[-=.]*>\s*\|"([^"]*?)"\|\s*(\w+)/ },
  // A -->|label| B
  { re: /^(\w+)\s*-[-=.]*>\s*\|([^|]*?)\|\s*(\w+)/ },
  // A --> B (레이블 없음)
  { re: /^(\w+)\s*-[-=.]*>\s*(\w+)/, noLabel: true },
]

// 파싱 불가로 간주할 줄 시작 패턴
const RE_SKIP = /^\s*(?:%%|style\s|classDef\s|class\s|click\s|subgraph\s|end\s*$)/i

// ── 노드 파싱 헬퍼 ─────────────────────────────────────────────────────────

/**
 * 줄에서 노드 ID, 라벨, shape을 추출한다.
 * 매칭되면 { id, label, shape } 반환, 아니면 null.
 */
function parseNodeStr(str) {
  const s = str.trim()
  for (const { re, shape } of NODE_PATTERNS) {
    const m = s.match(re)
    if (m) return { id: m[1], label: m[2] || m[1], shape }
  }
  // 단순 ID만 있는 경우 (이미 등록된 노드 ID를 엣지 줄에서 만날 때)
  if (/^\w+$/.test(s)) return { id: s, label: s, shape: 'default' }
  return null
}

// ── 엣지 파싱 ──────────────────────────────────────────────────────────────

/**
 * 줄에서 엣지 정보를 추출한다.
 * 반환: { source, target, label } 또는 null
 */
function parseEdgeLine(line) {
  const s = line.trim()
  for (const { re, noLabel } of EDGE_PATTERNS) {
    const m = s.match(re)
    if (!m) continue
    if (noLabel) {
      return { source: m[1], target: m[2], label: '' }
    }
    return { source: m[1], target: m[3], label: m[2].trim() }
  }
  return null
}

// ── 공개 API ───────────────────────────────────────────────────────────────

/**
 * Mermaid flowchart 텍스트를 VueFlow nodes/edges 배열로 변환한다.
 * Graphviz dot 엔진으로 좌표 계산.
 *
 * @param {string} mermaidText
 * @returns {Promise<{ nodes: object[], edges: object[], direction: string, preservedLines: string[] }>}
 */
export async function parseMermaid(mermaidText) {
  if (!mermaidText || !mermaidText.trim()) {
    return { nodes: [], edges: [], direction: 'TD', preservedLines: [] }
  }

  const lines = mermaidText.split('\n')
  let direction = 'TD'
  const nodesMap = new Map()   // id → { id, label, shape }
  const rawEdges = []
  const preservedLines = []
  let edgeIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()

    if (!trimmed) continue

    // 1) 방향 선언
    const dirMatch = trimmed.match(RE_DIRECTION)
    if (dirMatch) {
      direction = dirMatch[1].toUpperCase()
      continue
    }

    // 2) 스킵 줄 (style, classDef, subgraph, %% 등) → preserved
    if (RE_SKIP.test(trimmed)) {
      preservedLines.push(raw)
      continue
    }

    // 3) 엣지 줄 시도
    const edge = parseEdgeLine(trimmed)
    if (edge) {
      // 엣지 양끝 노드가 인라인 정의를 포함할 수 있으므로 파싱
      // 예: A["시작"] --> B{조건}
      // 분리: source part | target part
      // 우선 전체 줄에서 source 노드 표현, 화살표, target 노드 표현으로 분리
      const fullEdge = parseFullEdgeLine(trimmed, edgeIndex)
      if (fullEdge) {
        const { srcNode, tgtNode, edgeData } = fullEdge
        if (!nodesMap.has(srcNode.id)) nodesMap.set(srcNode.id, srcNode)
        if (!nodesMap.has(tgtNode.id)) nodesMap.set(tgtNode.id, tgtNode)
        rawEdges.push(edgeData)
        edgeIndex++
        continue
      }
    }

    // 4) 단독 노드 정의 줄
    const node = parseNodeStr(trimmed)
    if (node && !nodesMap.has(node.id)) {
      nodesMap.set(node.id, node)
      continue
    }

    // 5) 아무것도 매칭 안 된 줄 → preserved
    preservedLines.push(raw)
  }

  const rawNodes = Array.from(nodesMap.values())

  const positions = await layoutWithGraphviz(rawNodes, rawEdges, direction)

  const nodes = rawNodes.map(n => ({
    id: n.id,
    type: 'custom',
    position: positions[n.id] || { x: 0, y: 0 },
    data: { label: n.label, shape: n.shape },
  }))

  const edges = rawEdges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label || '',
    type: 'smoothstep',
    markerEnd: { type: 'arrowclosed' },
    style: { strokeWidth: 1.5 },
  }))

  return { nodes, edges, direction, preservedLines }
}

/**
 * 엣지 줄 전체에서 source 노드 표현 + 화살표 + target 노드 표현을 분리한다.
 * 노드 표현은 인라인 라벨/shape을 포함할 수 있다.
 */
function parseFullEdgeLine(line, edgeIndex) {
  // 패턴: <nodeExpr> <arrowWithOptLabel> <nodeExpr>
  // arrowWithOptLabel: -->, -.->. ==>, -- label -->, -->|label|
  // 순서 중요: 레이블 있는 패턴을 먼저 시도
  const FULL_EDGE_RE = [
    // A_expr -- "label" --> B_expr
    /^(.+?)\s+--\s+"([^"]*?)"\s+-->\s+(.+)$/,
    // A_expr -- label --> B_expr (따옴표 없음, 레이블에 -> 미포함)
    /^(.+?)\s+--\s+([^->][^>]*?)\s+-->\s+(.+)$/,
    // A_expr -->|"label"| B_expr
    /^(.+?)\s*-[-=.]*>\s*\|"([^"]*?)"\|\s*(.+)$/,
    // A_expr -->|label| B_expr
    /^(.+?)\s*-[-=.]*>\s*\|([^|]*?)\|\s*(.+)$/,
    // A_expr --> B_expr
    /^(.+?)\s+-[-=.]*>\s+(.+)$/,
  ]

  for (let i = 0; i < FULL_EDGE_RE.length; i++) {
    const re = FULL_EDGE_RE[i]
    const m = line.match(re)
    if (!m) continue

    let srcStr, tgtStr, label
    if (i === 4) {
      // no-label pattern: groups are (src, tgt)
      srcStr = m[1]; tgtStr = m[2]; label = ''
    } else {
      srcStr = m[1]; label = m[2]; tgtStr = m[3]
    }

    const srcNode = parseNodeStr(srcStr.trim())
    const tgtNode = parseNodeStr(tgtStr.trim())
    if (!srcNode || !tgtNode) continue

    return {
      srcNode,
      tgtNode,
      edgeData: {
        id: `e-${srcNode.id}-${tgtNode.id}-${edgeIndex}`,
        source: srcNode.id,
        target: tgtNode.id,
        label: label ? label.trim() : '',
      },
    }
  }
  return null
}
