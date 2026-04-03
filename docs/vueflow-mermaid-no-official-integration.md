# VueFlow ↔ Mermaid 공식 연동 부재 — 직접 구현으로 해결한 과정

---

## 1. 문제: 두 라이브러리는 완전히 별개의 세계다

이 프로젝트는 Mermaid flowchart를 GUI로 편집하는 에디터다.
자연스럽게 "Mermaid ↔ VueFlow 변환 기능이 있겠지"라고 기대하게 된다.

**없다.**

| | Mermaid | VueFlow |
|--|---------|---------|
| 목적 | 텍스트로 다이어그램 표현 | 인터랙티브 노드 캔버스 |
| 데이터 포맷 | 텍스트 문자열 | `nodes[]` + `edges[]` 객체 배열 |
| 노드 표현 | `A["label"]` | `{ id, type, position: {x,y}, data }` |
| 엣지 표현 | `A --> B` | `{ id, source, target, label }` |
| 공식 변환 기능 | ❌ | ❌ |

공식 플러그인도, 공식 유틸도 없다. 두 라이브러리는 서로의 존재를 모른다.

---

## 2. 해결 방향: 양방향 변환기를 직접 구현

두 방향 모두 직접 짰다.

```
Mermaid 텍스트  ──파싱──▶  VueFlow nodes/edges    (useMermaidParser.js)
VueFlow nodes/edges  ──직렬화──▶  Mermaid 텍스트  (useFlowToMermaid.js)
```

---

## 3. Mermaid → VueFlow 파싱 (`useMermaidParser.js`)

### 3-1. 전체 흐름

```
Mermaid 텍스트
  ↓ 줄(\n) 단위로 순회
  ├─ flowchart TD / graph LR 줄    → direction 추출
  ├─ style / classDef / %% 등      → preservedLines[] 에 보관
  ├─ 엣지 줄 (A --> B)              → rawEdges[] 에 추가 + 양끝 노드 추출
  └─ 단독 노드 줄 (A["..."])         → nodesMap 에 추가
  ↓
assignLayout() — BFS 위상 정렬로 x/y 좌표 계산
  ↓
VueFlow 포맷 { nodes, edges, direction, preservedLines } 반환
```

### 3-2. 노드 파싱 — 정규식 패턴 매칭

Mermaid는 노드 모양을 괄호 종류로 구분한다. 이걸 정규식으로 각각 구분한다.

```js
const NODE_PATTERNS = [
  { re: /^(\w+)\(\["([^"]*?)"\]\)/, shape: 'stadium'       },  // A(["text"])
  { re: /^(\w+)\(\(([^)]*?)\)\)/,   shape: 'circle'        },  // A((text))
  { re: /^(\w+)\{"([^"]*?)"\}/,     shape: 'diamond'       },  // A{"text"}
  { re: /^(\w+)\[\/"([^"]*?)"\/\]/, shape: 'parallelogram' },  // A[/"text"/]
  { re: /^(\w+)\("([^"]*?)"\)/,     shape: 'round'         },  // A("text")
  { re: /^(\w+)\["([^"]*?)"\]/,     shape: 'default'       },  // A["text"]
  // ... 따옴표 없는 버전도 각각 존재
]
```

순서가 중요하다. `stadium`(`([...])`)을 `round`(`(...)`)보다 먼저 시도해야 한다.
앞에서부터 매칭하면 `stadium`이 `round`로 잘못 파싱되기 때문이다.

지원하는 6가지 shape:

| Mermaid 문법 | shape 이름 | 모양 |
|-------------|-----------|------|
| `A["label"]` | default | 사각형 |
| `A("label")` | round | 둥근 사각형 |
| `A{"label"}` | diamond | 마름모 |
| `A(["label"])` | stadium | 타원 |
| `A(("label"))` | circle | 원 |
| `A[/"label"/]` | parallelogram | 평행사변형 |

### 3-3. 엣지 파싱

Mermaid 엣지 문법은 여러 변형이 있다.

```
A --> B               (레이블 없음)
A -->|label| B        (파이프 레이블)
A -- label --> B      (인라인 레이블)
A -.-> B              (점선)
A ==> B               (굵은 화살표)
```

여기서 추가 복잡성이 있다. 엣지 줄에 노드 인라인 정의가 섞여 있는 경우:

```
A["시작"] --> B{조건}
```

이 줄 하나에 엣지 정보(`A → B`)와 노드 정의(`A["시작"]`, `B{조건}`) 가 동시에 들어있다.

이걸 처리하기 위해 `parseFullEdgeLine()`을 별도로 만들었다.
줄 전체에서 `<노드표현> <화살표+레이블> <노드표현>` 구조로 분리한 뒤,
양끝 노드 표현을 각각 `parseNodeStr()`로 파싱한다.

```js
// 예: A["시작"] -->|Yes| B{조건}
// → srcStr = 'A["시작"]'  →  parseNodeStr()  →  { id:'A', label:'시작', shape:'default' }
// → label  = 'Yes'
// → tgtStr = 'B{조건}'   →  parseNodeStr()  →  { id:'B', label:'조건', shape:'diamond' }
```

### 3-4. 레이아웃: BFS 위상 정렬 (`assignLayout`)

VueFlow는 `position: { x, y }`를 반드시 요구한다.
Mermaid 텍스트엔 좌표 정보가 없으므로 직접 계산해야 한다.

**알고리즘:**

```
1. 인접 리스트 생성 (children, parents)
2. 부모 없는 노드 = 루트 → depth 0 으로 BFS 시작
3. BFS로 각 노드의 depth(레이어) 배정
4. 사이클 처리: depth 미할당 노드에 대해
   "부모 중 depth가 있는 것의 max + 1"을 반복 전파
5. 완전 고립 노드(부모도 자식도 없음) → depth 0
6. 같은 depth 노드들을 가로(또는 세로)로 중앙 정렬
7. direction(TD/LR/BT/RL)에 따라 x/y 축 방향 결정
```

**사이클 처리가 필요한 이유:**

Alira가 생성하는 CFG(제어 흐름 그래프)는 루프 구조를 포함한다.

```
A → B → C → D
         ↑       ← 사이클
    E ───┘
```

순수 BFS만으로는 E에 depth를 배정할 수 없다(E가 C를 거쳐야 E로 오는 구조라 방문 못 함).
그래서 BFS 후 미할당 노드에 대해 부모 depth 기반으로 반복 전파한다.

**방향별 좌표 계산:**

```
TD (위→아래): depth → y축, 레이어 내 순서 → x축
LR (왼→오른): depth → x축, 레이어 내 순서 → y축
BT (아래→위): depth를 반전해서 y축
RL (오른→왼): depth를 반전해서 x축
```

---

## 4. VueFlow → Mermaid 직렬화 (`useFlowToMermaid.js`)

GUI 편집 후 VueFlow 상태를 다시 Mermaid 텍스트로 만드는 방향이다.

### 4-1. 변환 순서

```
1. "flowchart {direction}" 헤더
2. nodes 배열 순회 → 각 shape에 맞는 Mermaid 노드 문법 생성
3. edges 배열 순회 → 레이블 유무에 따라 엣지 문법 생성
4. preservedLines 복원 (style, classDef 등)
```

### 4-2. shape → Mermaid 문법 매핑

```js
function nodeToMermaid(id, label, shape) {
  switch (shape) {
    case 'diamond':       return `  ${id}{"${l}"}`
    case 'stadium':       return `  ${id}(["${l}"])`
    case 'circle':        return `  ${id}(("${l}"))`
    case 'round':         return `  ${id}("${l}")`
    case 'parallelogram': return `  ${id}[/"${l}"/]`
    default:              return `  ${id}["${l}"]`    // default, 알 수 없는 shape
  }
}
```

### 4-3. 엣지 직렬화

```js
if (label) {
  `  ${src} -->|"${label}"| ${tgt}`   // 레이블 있음
} else {
  `  ${src} --> ${tgt}`               // 레이블 없음
}
```

**특수문자 처리**: 레이블 안의 `"`는 `'`로 치환한다.
Mermaid는 `-->|"label"|` 구조에서 큰따옴표를 구분자로 쓰기 때문에,
레이블 안에 큰따옴표가 있으면 파싱이 깨진다.

```js
function sanitizeLabel(label) {
  return String(label).replace(/"/g, "'")
}
```

---

## 5. preservedLines — 변환 불가 줄을 버리지 않는 안전망

### 5-1. 왜 필요한가

Mermaid → VueFlow → Mermaid 왕복 변환을 하면 이론상 데이터가 사라진다.

```
입력:
  flowchart TD
  A["시작"] --> B{"조건"}
  style A fill:#f9f       ← VueFlow에 대응 개념 없음
  classDef box fill:#f66  ← VueFlow에 대응 개념 없음

VueFlow 상태:
  nodes: [A, B]   edges: [A→B]
  (style, classDef는 VueFlow 객체에 없음)

역변환 결과:
  flowchart TD
  A["시작"]
  B{"조건"}
  A --> B
  ← style, classDef 사라짐  ← 손실
```

### 5-2. 동작 방식

파싱할 수 없는 줄을 버리지 않고 별도 배열에 그대로 보관한다.

```js
// 파싱 불가로 간주할 줄 패턴
const RE_SKIP = /^\s*(?:%%|style\s|classDef\s|class\s|click\s|subgraph\s|end\s*$)/i

// 파싱 루프 내부
if (RE_SKIP.test(trimmed)) {
  preservedLines.push(raw)   // 버리지 않고 원본 줄 그대로 보관
  continue
}

// 아무 패턴에도 안 맞는 줄도 보관
preservedLines.push(raw)
```

역변환 시 노드/엣지 직렬화가 끝난 후 마지막에 붙인다.

```js
if (preservedLines && preservedLines.length > 0) {
  lines.push('')
  preservedLines.forEach(l => lines.push(l))  // 원본 그대로 복원
}
```

### 5-3. 왕복 변환 결과

```
입력:
  flowchart TD
  A["시작"] --> B{"조건"}
  style A fill:#f9f
  classDef redBox fill:#f66
  class B redBox

파싱 결과:
  nodes: [A, B]
  edges: [A→B]
  preservedLines: [
    "  style A fill:#f9f",
    "  classDef redBox fill:#f66",
    "  class B redBox"
  ]

GUI 편집 후 역변환:
  flowchart TD
  A["시작"]
  B{"조건"}

  A --> B

  style A fill:#f9f       ← 복원됨
  classDef redBox fill:#f66
  class B redBox
```

노드/엣지는 GUI로 자유롭게 편집하면서, 파싱 불가 속성들은 원본 그대로 살아있다.

### 5-4. preservedLines의 한계

데이터는 보존하지만 GUI에 시각적으로 반영하지는 않는다.
`style A fill:#f9f`가 있어도 GUI 캔버스에서 A 노드가 분홍색으로 보이지 않는다.
텍스트 그대로 보관했다가 역변환 시 복원하는 것이지, 스타일을 해석해서 적용하는 게 아니기 때문이다.

- **데이터 유실** — 없음
- **GUI 시각화** — 없음
- **최종 저장 코드** — 원본 속성 유지

이 한계가 실사용에서 문제가 되지 않는 이유: Alira가 생성하는 CFG Mermaid 코드는 `style`, `classDef`, `subgraph` 등을 사용하지 않는다. CFG는 노드 + 방향 있는 엣지가 전부라서, preservedLines 가 채워질 일 자체가 없다.

---

## 6. 두 파일의 역할 요약

```
useMermaidParser.js                    useFlowToMermaid.js
───────────────────                    ───────────────────
입력: Mermaid 텍스트                    입력: nodes[], edges[], direction, preservedLines
출력: nodes[], edges[],                출력: Mermaid 텍스트
      direction, preservedLines

담당:                                   담당:
  줄 단위 파싱                            shape → Mermaid 문법 매핑
  정규식 노드/엣지 인식                    레이블 특수문자 처리
  BFS 레이아웃 계산                       preservedLines 복원
  preservedLines 수집
```

---

## 7. 파싱 지원 범위와 Alira 출력의 관계

파서가 완전히 처리하는 문법 범위:

```
✅ flowchart TD / LR / BT / RL
✅ 노드 6종 shape
✅ --> / -->|label| / -- label --> 엣지
✅ -.-> / ==>
⚠️ style / classDef / class / subgraph / click / %% → preservedLines 보존
```

Alira CFG 출력이 사용하는 문법:

```
flowchart TD
  A(["START"])
  B["코드 블록"]
  C{"조건 분기"}
  A --> B
  B --> C
  C -->|Yes| D
  C -->|No| E
```

Alira 출력은 파서 완전 지원 범위 안에 완전히 포함된다.
실제 사용 시나리오에서 파싱 손실은 발생하지 않는다.
