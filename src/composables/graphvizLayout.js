/**
 * graphvizLayout.js
 *
 * Graphviz dot 엔진으로 노드/엣지 X/Y 좌표 계산.
 * assignLayoutBfs() 를 대체하는 레이아웃 엔진.
 *
 * @hpcc-js/wasm-graphviz 사용 — WASM이 JS 번들에 인라인 포함되어 있어
 * 별도 WASM 파일 배포 불필요. 로드 후 layout() 은 동기 호출.
 */

import { Graphviz } from '@hpcc-js/wasm-graphviz'

// ── 싱글턴: WASM 로드는 최초 1회만 ─────────────────────────────────────────
let _graphviz = null

async function getGraphviz() {
  if (!_graphviz) {
    _graphviz = await Graphviz.load()
  }
  return _graphviz
}

// ── 좌표 스케일 및 노드 크기 ────────────────────────────────────────────────
// Graphviz plain 출력 단위(inch) → VueFlow 픽셀 변환
// BFS 레이아웃의 NODE_W=180, NODE_H=55, CROSS_GAP=100, DEPTH_GAP=130 에 맞춤
const SCALE       = 100   // 1 inch → 100 px
const NODE_W_INCH = 1.8   // 180 px
const NODE_H_INCH = 0.55  // 55 px
const NODESEP     = 1.0   // 노드 간 최소 간격(inch) → 100 px
const RANKSEP     = 1.3   // 레이어 간 간격(inch) → 130 px

// ── direction 매핑 ──────────────────────────────────────────────────────────
const RANKDIR = { TD: 'TB', TB: 'TB', LR: 'LR', BT: 'BT', RL: 'RL' }

// ── Mermaid shape → Graphviz shape ─────────────────────────────────────────
function toDotShape(shape) {
  switch (shape) {
    case 'diamond':       return 'diamond'
    case 'circle':        return 'circle'
    case 'stadium':       return 'ellipse'
    case 'round':         return 'box'
    case 'parallelogram': return 'parallelogram'
    default:              return 'box'
  }
}

// ── DOT 레이블 이스케이프 ───────────────────────────────────────────────────
function escapeDot(str) {
  if (!str) return ''
  return String(str)
    .replace(/&quot;/g, '"')   // LLMService 이스케이프 디코딩
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
}

// ── rawNodes / rawEdges → DOT 문자열 ────────────────────────────────────────
function toDot(rawNodes, rawEdges, direction) {
  const rankdir = RANKDIR[direction] || 'TB'
  const lines = [
    'digraph G {',
    `  rankdir=${rankdir};`,
    `  graph [nodesep=${NODESEP}, ranksep=${RANKSEP}, splines=false];`,
    `  node [width=${NODE_W_INCH}, height=${NODE_H_INCH}, fixedsize=true];`,
  ]
  for (const n of rawNodes) {
    lines.push(`  "${n.id}" [label="${escapeDot(n.label ?? n.id)}", shape=${toDotShape(n.shape)}];`)
  }
  for (const e of rawEdges) {
    const attr = e.label ? ` [label="${escapeDot(e.label)}"]` : ''
    lines.push(`  "${e.source}" -> "${e.target}"${attr};`)
  }
  lines.push('}')
  return lines.join('\n')
}

// ── plain 출력 파싱 ─────────────────────────────────────────────────────────
// plain 포맷: node name x y width height label style shape color fillcolor
// 좌표 단위: inch / y 원점: 좌하단(Cartesian)
function tokenize(line) {
  const tokens = []
  let i = 0
  const s = line.trim()
  while (i < s.length) {
    if (s[i] === ' ' || s[i] === '\t') { i++; continue }
    if (s[i] === '"') {
      let j = i + 1
      while (j < s.length && !(s[j] === '"' && s[j - 1] !== '\\')) j++
      tokens.push(s.slice(i + 1, j))
      i = j + 1
    } else {
      let j = i
      while (j < s.length && s[j] !== ' ' && s[j] !== '\t') j++
      tokens.push(s.slice(i, j))
      i = j
    }
  }
  return tokens
}

function parsePlain(plain) {
  let graphHeight = 0
  const positions = {}
  for (const line of plain.split('\n')) {
    const t = tokenize(line)
    if (!t.length) continue
    if (t[0] === 'graph')  graphHeight = parseFloat(t[3])
    if (t[0] === 'node')   positions[t[1]] = { x: parseFloat(t[2]), y: parseFloat(t[3]), w: parseFloat(t[4]), h: parseFloat(t[5]) }
  }
  return { graphHeight, positions }
}

// ── Graphviz(중심, y하단원점) → VueFlow(좌상단, y상단원점) ──────────────────
function toVuePos(gv, graphHeight) {
  const cx = gv.x * SCALE
  const cy = (graphHeight - gv.y) * SCALE
  return {
    x: Math.round(cx - (gv.w * SCALE) / 2),
    y: Math.round(cy - (gv.h * SCALE) / 2),
  }
}

// ── 공개 API ────────────────────────────────────────────────────────────────
/**
 * Graphviz dot 엔진으로 노드 X/Y 좌표를 계산한다.
 *
 * @param {Array<{id, label, shape}>} rawNodes
 * @param {Array<{source, target, label}>} rawEdges
 * @param {string} direction 'TD' | 'LR' | 'BT' | 'RL'
 * @returns {Promise<{[nodeId]: {x, y}}>}
 */
export async function layoutWithGraphviz(rawNodes, rawEdges, direction = 'TD') {
  if (rawNodes.length === 0) return {}

  const gv = await getGraphviz()
  const plain = gv.layout(toDot(rawNodes, rawEdges, direction), 'plain', 'dot')
  const { graphHeight, positions } = parsePlain(plain)

  const result = {}
  for (const n of rawNodes) {
    const p = positions[n.id]
    result[n.id] = p ? toVuePos(p, graphHeight) : { x: 0, y: 0 }
  }
  return result
}
