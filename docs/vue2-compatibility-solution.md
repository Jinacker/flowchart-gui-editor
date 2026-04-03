# Vue 2 환경에서 Vue Flow 도입 — IIFE 번들 격리 방식

## 배경: 왜 문제가 생기는가

### 기존 시스템 상태

사내 메인 웹 애플리케이션은 **Vue 2.6** 기반으로 운영 중이다.
전체 시스템이 Vue 2를 중심으로 구성되어 있기 때문에, Vue 3로의 전체 업그레이드는 현실적으로 불가능하다.
(의존성 충돌, QA 범위, 배포 리스크 등 이유로)

### 도입하려는 라이브러리의 제약

GUI 기반 플로우차트 에디터를 만들기 위해 **Vue Flow**를 선택했다.
그런데 Vue Flow는 **Vue 3 전용**이다. Vue 2 지원 계획도 공식적으로 없다.

### 충돌 원인

Vue 2와 Vue 3는 동일한 전역 네임스페이스(`window.Vue`)를 두고 서로 다른 런타임을 등록한다.
일반적인 방법(ESM `import` 또는 `<script>` 태그로 Vue 3 번들 로드)으로 삽입하면:

- Vue 2 런타임과 Vue 3 런타임이 공존하면서 충돌
- 호스트 앱의 Vue 2 컴포넌트들이 오작동
- 전체 시스템 불안정

### 이 충돌이 시사하는 것

단순히 "기술적 충돌"이 문제가 아니다.
진짜 문제는 **에디터 하나 추가하려다 시스템 전체를 건드리게 된다**는 것이다.

일반적인 접근법 — Vue 3로 마이그레이션, 또는 프레임워크 버전을 맞추는 방식 — 은 이렇게 된다:

```
에디터 추가
  → Vue 3 마이그레이션 필요
    → 기존 모든 Vue 2 컴포넌트 수정
      → 전체 QA
        → 배포 리스크
```

**에디터 기능 하나의 영향 범위가 시스템 전체로 번진다.**

### 해결 방향을 결정한 원칙

따라서 이 문제의 해결 방향은 기술적 최적해보다 **영향 범위 최소화**를 1순위 기준으로 삼았다.

> 새 기능을 추가할 때 기존 시스템이 변경되는 범위를 0에 가깝게 만든다.

구체적으로는:

- 호스트 Vue 2 앱 코드 — 수정 없음
- 호스트의 빌드 설정, 패키지 의존성 — 변경 없음
- 배포 구조(Tomcat, WAR) — 변경 없음
- 두 런타임이 서로를 인식하지 못하도록 완전 격리

이 원칙을 충족하는 방법이 **"에디터를 별도 프로젝트에서 개발하고, 브라우저가 이해할 수 있는 단일 정적 파일로 빌드해서 가져다 쓰는 것"** 이었다.
호스트 입장에서 에디터는 그냥 `.js` 파일 하나다. 안에 Vue 3가 들어있는지 알 필요도 없고 알 수도 없다.

---

## 해결 방향: 외부 격리 빌드

### 핵심 아이디어

**에디터를 완전히 분리된 외부 프로젝트로 만들고, 빌드 결과물(정적 파일)만 호스트 앱에 넣는다.**

Vue 3가 필요한 코드는 개발 환경에서만 존재한다.
Tomcat에 올라가는 건 오직 빌드된 `.js`와 `.css` 파일뿐이다.
호스트 Vue 2 앱은 이 파일이 "Vue 3로 만들어진 것"인지 전혀 알 필요가 없다.

---

## IIFE 번들 방식 선택 이유

### 번들 포맷 비교

번들 포맷에는 여러 종류가 있다.

| 포맷 | 설명 | 문제 |
|------|------|------|
| **ESM** | `import/export` 사용 | 모듈 시스템 필요, Vue 2 앱과 공존 어려움 |
| **CJS** | `require()` 사용 | 브라우저에서 직접 사용 불가 |
| **UMD** | ESM+CJS 혼합 | 복잡, `define`/`module`/`exports` 전역 참조 |
| **IIFE** | 즉시 실행 함수 | 전역 스코프 오염 없음, `<script>` 태그 하나로 로드 가능 |

### IIFE가 이 상황에 최적인 이유

IIFE(Immediately Invoked Function Expression)는 코드 전체를 즉시 실행 함수 하나로 감싼다.

```js
var MermaidFlowEditor = (function () {
  // Vue 3, VueFlow, 모든 의존성이 이 스코프 안에 격리됨
  // 외부에서는 이 함수 내부에 접근할 수 없다
  return { mount, unmount }
})()
```

- Vue 3 런타임이 이 스코프 안에 갇힌다 → 호스트의 Vue 2와 충돌하지 않음
- 모듈 시스템(`import`, `require`, `define`) 불필요
- `<script src="...">` 한 줄로 로드
- 로드 즉시 `window.MermaidFlowEditor`에 공개 API가 등록됨
- 모든 의존성(Vue 3, VueFlow 등)을 번들 하나에 포함 → 외부 CDN 불필요

---

## 프로젝트 구조

### 디렉토리 배치

```
ASPICE/
├── mermaid-flow-editor-src/       ← Vue 3 에디터 소스 (이 프로젝트)
│   ├── src/
│   │   ├── main.js                ← 진입점 (공개 API 등록)
│   │   ├── App.vue                ← 루트 Vue 컴포넌트
│   │   └── components/
│   │       └── FlowCanvas.vue     ← VueFlow 캔버스 컴포넌트
│   ├── vite.config.js             ← IIFE 빌드 설정
│   └── package.json
│
└── Acst/                          ← Spring Boot 메인 앱
    └── src/main/resources/
        └── static/
            └── lib/
                └── mermaid-flow-editor/       ← 빌드 결과물 출력 위치
                    ├── mermaid-flow-editor.iife.js
                    └── mermaid-flow-editor.css
```

핵심은 **빌드 결과물이 Spring Boot 앱의 정적 리소스 디렉토리로 직접 출력**된다는 점이다.
별도 복사 단계가 없다.

---

## Vite 빌드 설정

### vite.config.js

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': '"production"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.js'),
      name: 'MermaidFlowEditor',
      formats: ['iife'],           // ← IIFE 포맷만 빌드
    },
    rollupOptions: {
      external: [],                // ← 외부 의존성 없음. 전부 번들에 포함
      output: {
        name: 'MermaidFlowEditor',
        entryFileNames: 'mermaid-flow-editor.iife.js',
        assetFileNames: 'mermaid-flow-editor.css',
        // Vue3/VueFlow가 내부적으로 process.env를 참조하므로 폴리필 주입
        intro: 'var process={"env":{"NODE_ENV":"production"}};',
      },
    },
    // 빌드 결과물을 Spring Boot 정적 리소스 폴더로 직접 출력
    outDir: resolve(__dirname, '../Acst/src/main/resources/static/lib/mermaid-flow-editor'),
    emptyOutDir: true,
    cssCodeSplit: false,           // ← CSS를 별도 파일 하나로 출력
    minify: true,
  },
})
```

### 설정 포인트별 설명

| 설정 항목 | 이유 |
|-----------|------|
| `formats: ['iife']` | IIFE 포맷으로 빌드. Vue 3 런타임이 스코프 내부에 격리됨 |
| `external: []` | 모든 의존성을 번들에 포함. 외부 CDN에 의존하지 않음 |
| `intro: 'var process=...'` | Vue 3와 VueFlow가 `process.env.NODE_ENV`를 참조하는데 브라우저엔 `process`가 없어서 폴리필 필요 |
| `outDir` | Spring Boot 정적 리소스 폴더에 직접 출력 |
| `cssCodeSplit: false` | CSS를 분할하지 않고 단일 파일로. 호스트에서 `<link>` 한 줄로 로드 가능 |
| `define` 블록 | Vue 3 내부 플래그 설정. `process.env` 치환도 담당 |

---

## 진입점: 공개 API 등록

### src/main.js

IIFE 빌드에서 `name` 에 지정한 값이 `window.MermaidFlowEditor`로 등록된다.
진입점에서 이 전역 변수에 공개할 API를 반환한다.

```js
import { createApp } from 'vue'
import App from './App.vue'

const MermaidFlowEditor = {
  mount(selector, initialMermaid = '') {
    const container = document.querySelector(selector)
    const app = createApp(App, { initialMermaid })
    app.mount(container)

    return {
      getMermaid: () => app._instance.exposed.getMermaid(),
      unmount: () => app.unmount(),
    }
  }
}

// IIFE 포맷에서 이 값이 window.MermaidFlowEditor 가 된다
export default MermaidFlowEditor
```

---

## 빌드 방법

### 사전 요구사항

- Node.js 18 이상
- `mermaid-flow-editor-src/` 경로에서 실행

### 명령

```bash
# 최초 1회: 의존성 설치
npm install

# 번들 빌드
npm run build
```

### 빌드 결과

```
Acst/src/main/resources/static/lib/mermaid-flow-editor/
├── mermaid-flow-editor.iife.js     (Vue 3 + VueFlow + 에디터 로직 전체)
└── mermaid-flow-editor.css         (스타일시트)
```

---

## 배포 흐름

이 에디터는 **독립 서버가 없다**.
Spring Boot WAR에 정적 리소스로 포함되어 Tomcat이 서빙한다.

```
1. [에디터 소스 수정 시]
   npm run build
   → mermaid-flow-editor.iife.js, .css 생성됨
     (자동으로 Acst/src/.../static/lib/... 에 위치)

2. [배포 시]
   mvn clean package -DskipTests
   → WAR 빌드 시 위 정적 파일이 함께 패키징됨

3. WAR → Tomcat webapps/ 에 배포
   → Tomcat이 정적 파일 서빙
```

> **주의**: JS 빌드 후 반드시 Maven WAR 빌드까지 해야 Tomcat에 반영된다.
> JS 파일만 교체해서는 배포가 안 된다.

---

## 호스트 앱에서의 사용법 (JSP)

### 리소스 로드

```html
<!-- JSP 페이지 head 또는 body 하단 -->
<link rel="stylesheet" href="${pageContext.request.contextPath}/lib/mermaid-flow-editor/mermaid-flow-editor.css">
<script src="${pageContext.request.contextPath}/lib/mermaid-flow-editor/mermaid-flow-editor.iife.js"></script>
```

스크립트가 로드되는 순간 `window.MermaidFlowEditor`가 자동 등록된다.

### 마운트 포인트 선언

```html
<!-- 에디터가 삽입될 컨테이너. 높이 지정 필수 -->
<div id="flow-editor-container" style="width: 100%; height: 600px;"></div>
```

### Vue 2 컴포넌트에서 사용

```js
// Vue 2 컴포넌트 methods 내부
methods: {
  openEditor() {
    const mermaidCode = this.currentMermaidCode  // Vue 2 데이터

    // Vue 3 에디터 마운트
    this.editorInstance = window.MermaidFlowEditor.mount(
      '#flow-editor-container',
      mermaidCode
    )

    // 변경 이벤트 수신
    document.querySelector('#flow-editor-container')
      .addEventListener('mermaid-flow-editor:change', (e) => {
        this.currentMermaidCode = e.detail.mermaid  // Vue 2 반응형 데이터 업데이트
      })
  },

  closeEditor() {
    if (this.editorInstance) {
      // 최신 코드 회수 후 언마운트
      this.currentMermaidCode = this.editorInstance.getMermaid()
      this.editorInstance.unmount()
      this.editorInstance = null
    }
  }
}
```

### 호스트-에디터 통신 요약

```
Vue 2 앱                          Vue 3 에디터 (IIFE 내부)
─────────────────────────────────────────────────────
mount('#target', code)    →       Vue 3 앱 생성 + 렌더링
                          ←       CustomEvent('mermaid-flow-editor:change')
getMermaid()              →       현재 Mermaid 코드 반환
unmount()                 →       Vue 3 앱 정리 + DOM 복원
```

Vue 2와 Vue 3는 서로의 내부를 모른다.
오직 `window.MermaidFlowEditor` API와 `CustomEvent`만으로 통신한다.

---

## 이 방식의 장단점

### 장점

- **시스템 무변경**: 호스트 Vue 2 앱 코드를 한 줄도 수정하지 않아도 됨
- **충돌 없음**: IIFE 스코프 격리로 Vue 런타임이 공존
- **배포 단순**: 별도 서버 없이 기존 WAR에 정적 파일만 추가
- **독립 개발**: 에디터 소스는 완전 분리된 프로젝트로 독립 개발/테스트 가능
- **빌드 자동화**: `npm run build`가 결과물을 Spring Boot 정적 폴더에 직접 출력

### 단점/주의사항

- **빌드 2단계**: JS 빌드 → Maven 빌드 순으로 두 번 빌드해야 배포 반영
- **번들 크기**: 모든 의존성 내포로 파일 크기가 큼 (Vue 3 + VueFlow 등 전체 포함)
- **디버깅**: 호스트에서 에디터 내부를 직접 디버깅하기 어려움 (개발 시 `npm run dev` 별도 실행 권장)
- **API 계약**: 호스트와 에디터 간 인터페이스가 `window.MermaidFlowEditor` 전역에 의존하므로 API 변경 시 양쪽 동시 반영 필요

---

## 본 프로젝트(Acst)에서 변경된 파일

에디터 도입을 위해 **본 프로젝트에서 건드린 파일은 딱 이것들이다.**

### 새로 추가된 파일 (기존 코드 수정 없음)

| 파일 | 설명 |
|------|------|
| `static/lib/mermaid-flow-editor/mermaid-flow-editor.iife.js` | 빌드 결과물. Vue 3 + VueFlow 전체 번들 |
| `static/lib/mermaid-flow-editor/mermaid-flow-editor.css` | 빌드 결과물. 에디터 스타일시트 |
| `static/lib/js/modal/CfgSettingModal.js` | 에디터 마운트/언마운트 제어 JS |
| `static/lib/css/CfgSettingModal.css` | 모달 및 `#mermaid-gui-editor` 컨테이너 스타일 |
| `WEB-INF/jspf/CfgSettingModal.jspf` | 에디터 마운트 포인트 + 리소스 로드 포함 JSP 프래그먼트 |

### 기존 파일에서 수정된 부분

| 파일 | 변경 내용 |
|------|-----------|
| `WEB-INF/jspf/ControlFlowGraphTab.jspf` | `CfgSettingModal.jspf` include 한 줄 추가 |
| `WEB-INF/jsp/DesignCode.jsp` | `ControlFlowGraphTab.jspf` include (기존 탭 구조에 추가) |
| `WEB-INF/jsp/DesignModel.jsp` | 동일 |

### 변경 범위 요약

```
본 프로젝트에서 건드린 것
├── 새 파일 추가
│   ├── 빌드 결과물 2개 (iife.js, css)       ← Vite 빌드가 자동 출력
│   ├── CfgSettingModal.js                    ← 에디터 제어 로직
│   ├── CfgSettingModal.css                   ← 스타일
│   └── CfgSettingModal.jspf                  ← 마운트 포인트 + 리소스 로드
│
└── 기존 파일 수정
    ├── ControlFlowGraphTab.jspf              ← include 1줄 추가
    ├── DesignCode.jsp                        ← include 1줄 추가
    └── DesignModel.jsp                       ← include 1줄 추가
```

기존 Vue 2 컴포넌트, 비즈니스 로직, 백엔드 코드는 **전혀 수정되지 않았다.**
