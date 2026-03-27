# mermaid2vueflow-gui-editor

### 배경
고객사 연구원들이 플로우차트 수정하려할때 기존에는 mermaid chart code를 직접 수정하는 방식
=> 코드로 수정을 하다보니까 러닝커브가 불편함으로 다가왔고 직관적으로 수정가능한 gui editor 필요성 제기.

Mermaid flowchart를 GUI로 편집할 수 있는 **Vue 3 + VueFlow** 기반 에디터.
기존 Vue 2 웹 애플리케이션 안에 독립 island로 삽입되어 동작한다.

사내 프로젝트에서 Vue 2를 사용하는데, Vue Flow는 Vue3 에서만 지원.
=> Vue 3로 전체 시스템을 업그레이드 하는건 불가능하기에 외부에서 번들링하여 빌드된 결과물을 삽입하는 방식을 채택했다.

---

## 목차

1. [왜 IIFE 번들인가](#1-왜-iife-번들인가)
2. [동작 원리](#2-동작-원리)
3. [빌드 방법](#3-빌드-방법)
4. [배포 흐름](#4-배포-흐름)
5. [공개 API](#5-공개-api)
6. [파싱 / 레이아웃 로직](#6-파싱--레이아웃-로직)

---

## 1. 왜 IIFE 번들인가

### 문제

호스트 애플리케이션이 **Vue 2** 기반이다.
Vue 3 컴포넌트를 일반적인 방식(ESM import)으로 삽입하면 두 Vue 런타임이 충돌한다.

### 해결: IIFE(Immediately Invoked Function Expression)

IIFE 형식으로 빌드하면 번들 전체가 즉시 실행 함수 하나로 감싸진다.

```js
var MermaidFlowEditor = (function() {
  // Vue 3, VueFlow 등 모든 의존성이 이 스코프 안에 격리됨
  return { mount, unmount }
})()
```

| 특성 | 설명 |
|------|------|
| **모듈 시스템 불필요** | `<script src="...">` 한 줄로 로드 |
| **완전 자급자족** | Vue 3, VueFlow 등 모든 의존성을 번들 내부에 포함 |
| **단일 전역 진입점** | `window.MermaidFlowEditor` 하나만 호스트에 노출 |
| **Vue 2와 충돌 없음** | 각 런타임이 별도 스코프에 격리됨 |

`vite.config.js` 핵심 설정:

```js
build: {
  lib: {
    entry: 'src/main.js',
    formats: ['iife'],
  },
  rollupOptions: {
    output: {
      name: 'MermaidFlowEditor',
      entryFileNames: 'mermaid-flow-editor.iife.js',
      assetFileNames: 'mermaid-flow-editor.css',
    },
  },
}
```

---

## 2. 동작 원리

### 전체 흐름

```
[호스트 앱에서 GUI 에디터 탭 클릭]
        ↓
window.MermaidFlowEditor.mount('#mount-target', mermaidCode)
        ↓
Vue 3 앱 생성 → Mermaid 텍스트 파싱 → VueFlow 캔버스 렌더링
        ↓
[사용자가 노드/엣지 편집]
        ↓
변경 시마다 Mermaid 텍스트 재생성
        ↓
CustomEvent('mermaid-flow-editor:change') 발생 → 호스트 앱이 수신
        ↓
[탭 전환 또는 닫기]
        ↓
instance.getMermaid() 로 최신 코드 회수 → instance.unmount() 로 정리
```

### 마운트 포인트

호스트 페이지에 빈 `div`를 선언하면 Vue 3 앱이 해당 요소를 점령한다.

```html
<!-- 호스트 페이지 -->
<div id="mount-target" style="height: 600px;"></div>

<link  rel="stylesheet" href=".../mermaid-flow-editor.css">
<script src=".../mermaid-flow-editor.iife.js"></script>
```

스크립트가 로드되는 순간 `window.MermaidFlowEditor`가 자동 등록된다.

---

## 3. 빌드 방법

### 사전 요구사항

- Node.js 18 이상
- npm

### 최초 1회: 의존성 설치

```bash
npm install
```

### 번들 빌드

```bash
npm run build
```

빌드 결과물(`mermaid-flow-editor.iife.js`, `mermaid-flow-editor.css`)은
`vite.config.js`의 `outDir`에 지정된 경로로 자동 출력된다.

---

## 4. 배포 흐름

이 에디터는 독립 서버 없이 **호스트 WAR에 정적 리소스로 포함**되어 배포된다.

```
1. JS 번들 빌드
   npm run build
   → 빌드 결과물이 호스트 앱의 정적 리소스 디렉토리에 자동 출력됨

2. 호스트 앱 WAR 빌드
   mvn clean package -DskipTests -s <settings.xml 경로>

3. WAR → Tomcat webapps/ 배포
```

> **주의**: JS 빌드 후 반드시 Maven WAR 빌드까지 해야 Tomcat에 반영된다.
> JS 파일 단독으로는 배포되지 않는다.

---

## 5. 공개 API

`window.MermaidFlowEditor`가 제공하는 메서드:

### `mount(selector, initialMermaid) → instance`

Vue 3 앱을 마운트하고 인스턴스를 반환한다.

```js
const instance = window.MermaidFlowEditor.mount('#mount-target', mermaidCode)
```

| 인자 | 타입 | 설명 |
|------|------|------|
| `selector` | `string` | 마운트할 요소의 CSS 셀렉터 |
| `initialMermaid` | `string` | 초기 Mermaid 코드. 비어있으면 빈 캔버스 |

### `instance.getMermaid() → string`

현재 편집 중인 Mermaid 코드를 동기 반환한다.

```js
const code = instance.getMermaid()
```

### `instance.unmount()`

Vue 3 앱을 언마운트하고 DOM을 정리한다. 반드시 호출해야 메모리 누수가 없다.

```js
instance.unmount()
```

### 변경 이벤트

편집할 때마다 마운트 대상 요소에서 CustomEvent가 발생한다.

```js
document.querySelector('#mount-target').addEventListener(
  'mermaid-flow-editor:change',
  (e) => console.log(e.detail.mermaid)
)
```

---

## 6. 파싱 / 레이아웃 로직

### Mermaid → VueFlow

`src/composables/useMermaidParser.js`가 담당한다.
줄 단위로 파싱하며 세 가지로 분류한다:

| 줄 종류 | 처리 |
|---------|------|
| `flowchart TD` / `graph LR` 등 | 방향(direction) 추출 |
| 노드 / 엣지 정의 | nodes, edges 배열로 변환 |
| `style`, `classDef`, `%%` 등 | `preservedLines`에 보관 후 역변환 시 복원 |

**레이아웃**: BFS 기반 위상 정렬로 depth를 계산해 X/Y 좌표를 부여한다.
사이클이 있는 그래프도 처리할 수 있도록 미할당 노드에 부모 depth+1을 반복 전파한다.

### VueFlow → Mermaid

`src/composables/useFlowToMermaid.js`가 담당한다.
nodes/edges 배열을 순회해 Mermaid 텍스트를 생성하고, `preservedLines`를 마지막에 복원한다.

### 지원 노드 shape

| shape | Mermaid 문법 | 모양 |
|-------|-------------|------|
| `default` | `A["label"]` | 사각형 |
| `round` | `A("label")` | 둥근 사각형 |
| `diamond` | `A{"label"}` | 마름모 |
| `stadium` | `A(["label"])` | 타원 |
| `circle` | `A(("label"))` | 원 |
| `parallelogram` | `A[/"label"/]` | 평행사변형 |
