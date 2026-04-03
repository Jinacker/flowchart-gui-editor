# 왜 Vite + IIFE 번들인가 — 포맷 / 빌드 도구 비교 및 선택 이유

---

## 1. 문제 정의

호스트 애플리케이션은 **Vue 2.6** 기반 Spring Boot WAR로 운영 중이다.
Vue Flow는 **Vue 3 전용**이고, Vue 2로 돌아가는 기존 시스템을 Vue 3로 올리는 건 현실적으로 불가능하다.

핵심 제약:
- 브라우저에서 Vue 2 런타임과 Vue 3 런타임이 동시에 존재해야 한다
- 두 런타임이 서로 충돌하면 안 된다
- 호스트 빌드 시스템(Maven)은 건드리지 않는다
- 배포 단위는 기존 WAR 하나 — 별도 서버 없음

이 제약을 모두 만족하는 조합이 **Vite + IIFE** 였다.

---

## 2. 번들 포맷 비교

번들 포맷(출력 형식)은 크게 네 가지다. 각각이 이 상황에서 왜 맞거나 안 맞는지 비교한다.

### 2-1. ESM (ES Modules)

```js
// 출력 형태
export default MermaidFlowEditor
import { createApp } from 'vue'
```

| 항목 | 내용 |
|------|------|
| 사용 방식 | `<script type="module">` 또는 번들러 `import` |
| 의존성 처리 | `external`로 빼면 호스트가 별도 제공해야 함 |
| 모듈 스코프 | 파일 단위 스코프 — 전역 오염 없음 |

**이 프로젝트에서 ESM이 안 되는 이유:**

- `external: ['vue']`로 Vue를 빼면 → 호스트가 Vue 3를 제공해야 하는데, 호스트는 Vue 2다. 버전 불일치.
- 번들 안에 Vue 3를 포함(`external: []`)하면 → ESM 번들은 `import { createApp } from './vue.js'` 같은 내부 import 구조를 가진다. `<script src>` 단순 로드로는 안 되고 모듈 번들러나 `importmap`이 필요하다.
- 호스트 JSP 환경은 모듈 번들러가 없는 전통적 `<script>` 태그 방식이다.

ESM은 모던 SPA에서 모듈 간 트리 셰이킹용으로 적합하다. 이 프로젝트처럼 "JS 파일 하나를 레거시 앱에 끼워 넣어야 하는" 상황엔 맞지 않는다.

---

### 2-2. CJS (CommonJS)

```js
// 출력 형태
module.exports = MermaidFlowEditor
const vue = require('vue')
```

| 항목 | 내용 |
|------|------|
| 사용 방식 | Node.js `require()` |
| 브라우저 지원 | 브라우저에 `require`, `module`, `exports` 없음 |

**이 프로젝트에서 CJS가 안 되는 이유:**

브라우저는 `require()`를 모른다. webpack/browserify 같은 번들러가 `require`를 처리해 주는 것이지, 브라우저 네이티브로는 동작하지 않는다.

호스트 앱에는 프론트엔드 번들러가 없다(JSP + `<script>` 태그 방식). CJS 파일을 `<script src>`로 로드하면 실행 시점에 `require is not defined` 오류가 난다.

CJS는 Node.js 서버 사이드나 webpack이 있는 환경에서만 의미 있다.

---

### 2-3. UMD (Universal Module Definition)

```js
// 출력 형태
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? module.exports = factory()
    : typeof define === 'function' && define.amd
      ? define(factory)
      : (global = global || self, global.MermaidFlowEditor = factory())
}(this, function () {
  // ...
}))
```

| 항목 | 내용 |
|------|------|
| 사용 방식 | CJS + AMD + 전역 변수 모두 지원 |
| 브라우저 지원 | 가능 (`<script src>` 로드 시 전역에 등록) |
| 스코프 격리 | 팩토리 함수 스코프 — IIFE와 유사 |

UMD는 기술적으로 이 프로젝트에서도 동작할 수 있다. 그러나:

**UMD를 쓰지 않은 이유:**

1. **불필요한 복잡성**: `typeof define`, `typeof module` 분기가 이 환경에선 전혀 필요 없다. AMD(`require.js`)도, CJS도 사용하지 않는다. 그 분기 코드는 데드 코드다.

2. **Vite lib 모드의 UMD 제약**: Vite에서 UMD를 `formats: ['umd']`로 빌드하면 `external`로 뺀 의존성을 `globals` 옵션으로 매핑해야 한다. `external: []` (전부 포함) 설정과 조합하면 경고가 발생하고 설정이 복잡해진다.

3. **IIFE로 충분**: "브라우저에서 `<script>` 한 줄로 로드 + 전역 변수 등록"이 목표인데, 그게 바로 IIFE가 하는 일이다. UMD는 그것보다 더 많은 걸 한다. 요구사항보다 복잡한 솔루션이다.

---

### 2-4. IIFE (Immediately Invoked Function Expression) ← 선택

```js
// 출력 형태
var MermaidFlowEditor = (function () {
  // Vue 3, VueFlow, 모든 의존성이 이 스코프 안에 격리됨
  'use strict'
  var process = { env: { NODE_ENV: 'production' } }
  // ...
  return { mount, unmount }
})()
```

| 항목 | 내용 |
|------|------|
| 사용 방식 | `<script src>` 한 줄. 모듈 시스템 불필요 |
| 브라우저 지원 | 완전 지원. ES5 수준에서도 동작 |
| 스코프 격리 | 즉시 실행 함수 스코프 — 내부 변수 외부 접근 불가 |
| 전역 노출 | `name` 옵션에 지정한 변수 하나만 `window`에 등록 |
| 의존성 | 번들 내부에 전부 포함. 외부 CDN 불필요 |

**IIFE가 이 상황에 최적인 이유:**

1. **런타임 격리**: Vue 3 런타임이 즉시 실행 함수 스코프 안에 갇힌다. `window.Vue`를 등록하지 않으므로 호스트의 Vue 2와 충돌하지 않는다.

2. **모듈 시스템 불필요**: JSP 환경에서 `<script src="mermaid-flow-editor.iife.js">` 한 줄이면 된다. `importmap`, `type="module"`, 번들러 불필요.

3. **단일 전역 진입점**: `window.MermaidFlowEditor` 하나만 외부에 노출된다. 호스트는 이것만 알면 된다.

4. **자급자족**: `external: []`로 모든 의존성(Vue 3, VueFlow 등)을 번들에 포함한다. 외부 CDN 의존이 없어 네트워크 환경이나 버전 변동에 영향받지 않는다.

---

### 번들 포맷 비교 요약

| 포맷 | `<script src>` 로드 | 런타임 격리 | 모듈 시스템 불필요 | 이 프로젝트 적합 여부 |
|------|-------------------|-------------|------------------|-------------------|
| ESM  | 제한적 (`type=module`) | △ | ✗ | ✗ |
| CJS  | ✗ (브라우저 미지원) | — | ✗ | ✗ |
| UMD  | ✓ | ✓ | ✓ | △ (동작하나 불필요한 복잡성) |
| **IIFE** | **✓** | **✓** | **✓** | **✓** |

---

## 3. 빌드 도구 비교

**IIFE는 Vite 전용 포맷이 아니다.** Rollup(`output.format: 'iife'`), esbuild(`--format=iife`), webpack(`output.library.type: 'var'`) 모두 IIFE를 지원한다. Vite를 선택한 이유는 IIFE 출력 때문이 아니라 **Vue SFC(`.vue`) 처리** 때문이다.

번들 포맷과 별개로, 어떤 빌드 도구로 번들링할지도 선택지가 있었다.

### 3-1. webpack

| 항목 | 내용 |
|------|------|
| 특징 | 업계 표준. 설정 유연성 최대 |
| IIFE 지원 | `library.type: 'var'` + `output.filename` 조합으로 가능 |
| Vue SFC 지원 | `vue-loader` 설치 + 별도 설정 필요 |
| 설정 복잡도 | 높음 (`webpack.config.js` + 다수 loader/plugin) |

**webpack을 쓰지 않은 이유:**

Vue SFC(`.vue` 파일)를 처리하려면 `vue-loader`를 별도 설치하고 `module.rules`에 추가해야 한다. `css-loader`, `style-loader` 또는 `MiniCssExtractPlugin`도 필요하다. 이 프로젝트 규모(에디터 컴포넌트 몇 개)에 비해 설정 비용이 과도하다.

Vue 공식 생태계가 Vite로 이동했고, `@vitejs/plugin-vue`가 SFC 처리를 원스톱으로 제공한다.

---

### 3-2. Rollup (직접 사용)

| 항목 | 내용 |
|------|------|
| 특징 | 라이브러리 번들링에 특화. 트리 셰이킹 강점 |
| IIFE 지원 | `output.format: 'iife'` 네이티브 지원 |
| Vue SFC 지원 | `rollup-plugin-vue` 설치 필요 (Vue 3용: `@vitejs/vite-plugin-vue`와 별개) |
| 설정 복잡도 | 중간 |

Vite는 내부적으로 Rollup을 사용한다. `vite build --lib` 모드는 Rollup의 라이브러리 번들링 파이프라인을 Vite가 래핑한 것이다. Rollup을 직접 쓰는 것과 결과물은 동일하지만:

- `@vitejs/plugin-vue`가 Vue SFC + CSS 처리를 자동으로 해준다
- `vite.config.js`가 `rollup.config.js`보다 훨씬 간결하다
- 개발 시 `npm run dev` (HMR 포함 dev server)와 빌드 설정을 같은 파일에서 관리한다

Rollup을 직접 쓸 이유가 없다.

---

### 3-3. Parcel

| 항목 | 내용 |
|------|------|
| 특징 | 제로 설정. 자동 감지 |
| IIFE 지원 | 제한적. `targets` 설정이 필요하고 직관적이지 않음 |
| Vue SFC 지원 | 플러그인 자동 감지로 지원 |
| 설정 복잡도 | 낮음 (역설적으로 커스터마이징 어려움) |

Parcel은 설정이 거의 없다는 게 장점이자 단점이다. `output.name`(IIFE 전역 변수명), `outDir`(Spring Boot 정적 폴더 직접 출력), `intro`(process 폴리필 주입) 같은 세밀한 제어가 필요한 상황에서 Parcel의 자동화는 오히려 장벽이 된다.

---

### 3-4. Vite ← 선택

| 항목 | 내용 |
|------|------|
| 특징 | Rollup 기반 라이브러리 모드. Vue 공식 빌드 도구 |
| IIFE 지원 | `build.lib.formats: ['iife']` — 네이티브 1줄 설정 |
| Vue SFC 지원 | `@vitejs/plugin-vue` — Vue 공식 플러그인, 설정 불필요 수준 |
| CSS 처리 | `cssCodeSplit: false`로 단일 CSS 파일 출력 |
| 설정 복잡도 | 낮음 |

**Vite를 선택한 이유:**

1. **IIFE + Vue SFC 조합이 가장 간단**: `formats: ['iife']` 한 줄 + `@vitejs/plugin-vue` 추가가 전부다. webpack이나 raw Rollup이면 같은 결과를 내기 위해 훨씬 많은 설정이 필요하다.

2. **세밀한 출력 제어 가능**: `entryFileNames`, `assetFileNames`로 파일명 고정, `outDir`로 Spring Boot 정적 폴더 직접 출력, `intro`로 process 폴리필 주입 — 모두 `vite.config.js` 한 파일에서 처리된다.

3. **공식 Vue 생태계**: `@vitejs/plugin-vue`는 Vue 팀이 직접 관리한다. Vue 3 SFC 처리, `<script setup>`, CSS scoped, TypeScript 등 모두 커버된다.

4. **개발 / 빌드 통합**: `npm run dev`로 HMR 개발 서버, `npm run build`로 라이브러리 번들 — 같은 설정 파일 하나로 관리된다.

---

### 빌드 도구 비교 요약

| 도구 | IIFE 출력 용이성 | Vue SFC 지원 | 출력 세밀 제어 | 이 프로젝트 적합 여부 |
|------|----------------|-------------|--------------|-------------------|
| webpack | △ (설정 다수) | △ (`vue-loader` 별도) | ✓ | △ |
| Rollup | ✓ (네이티브) | △ (플러그인 별도 탐색) | ✓ | ✓ (Vite가 래핑하므로 직접 쓸 이유 없음) |
| Parcel | △ (커스터마이징 제한) | ✓ | ✗ | ✗ |
| **Vite** | **✓ (1줄 설정)** | **✓ (공식 플러그인)** | **✓** | **✓** |

---

## 4. 최종 선택: Vite + IIFE

```js
// vite.config.js 핵심 설정
build: {
  lib: {
    entry: resolve(__dirname, 'src/main.js'),
    name: 'MermaidFlowEditor',
    formats: ['iife'],                              // ← 포맷 선택
  },
  rollupOptions: {
    external: [],                                   // ← 모든 의존성 번들에 포함
    output: {
      name: 'MermaidFlowEditor',                    // ← window.MermaidFlowEditor
      entryFileNames: 'mermaid-flow-editor.iife.js',
      assetFileNames: 'mermaid-flow-editor.css',
      intro: 'var process={"env":{"NODE_ENV":"production"}};', // ← 폴리필
    },
  },
  outDir: resolve(__dirname, '../Acst/src/.../static/lib/mermaid-flow-editor'),
  cssCodeSplit: false,                              // ← CSS 단일 파일
  minify: true,
}
```

이 설정이 달성하는 것:

| 요구사항 | 어떻게 충족되는가 |
|---------|----------------|
| Vue 2와 런타임 충돌 없음 | IIFE 스코프 안에 Vue 3 격리 |
| `<script src>` 한 줄로 로드 | IIFE는 모듈 시스템 불필요 |
| 외부 CDN 의존 없음 | `external: []`로 모든 의존성 포함 |
| `window.MermaidFlowEditor` 전역 등록 | `name: 'MermaidFlowEditor'` |
| CSS 단일 파일 | `cssCodeSplit: false` |
| Spring Boot 정적 폴더 직접 출력 | `outDir` 경로 지정 |
| process 폴리필 | `intro`로 번들 최상단 주입 |
| Vue SFC 처리 | `@vitejs/plugin-vue` |

---

## 5. 이 선택의 트레이드오프

선택한 방식의 단점도 명확하다.

| 단점 | 내용 |
|------|------|
| 번들 크기 큼 | Vue 3 + VueFlow 등 모든 의존성 포함. 수백 KB 수준 |
| 빌드 2단계 | JS 빌드(`npm run build`) → Maven 빌드 → 배포. JS 단독 교체 불가 |
| 디버깅 어려움 | 프로덕션 번들에서 호스트 앱과 함께 디버깅하기 어려움. 개발 시 `npm run dev` 별도 실행 필요 |
| API 계약 취약성 | `window.MermaidFlowEditor` 인터페이스 변경 시 호스트 JS와 동시 수정 필요 |

번들 크기 문제는 CDN 캐싱(브라우저 캐시)으로 실사용 영향이 제한된다.
나머지 단점들은 "호스트 시스템을 전혀 건드리지 않는다"는 원칙을 유지한 결과로 발생하는 불가피한 비용이다.
