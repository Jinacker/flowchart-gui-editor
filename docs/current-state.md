# GUI 에디터 현재 완성 상태 + 남은 과제

---

## 현재 완성 상태

### 동작하는 기능 전체 목록

#### 파싱 / 렌더링

| 기능 | 상태 |
|------|------|
| Mermaid → VueFlow 파싱 | ✅ |
| 노드 6종 shape 파싱 (default / round / diamond / stadium / circle / parallelogram) | ✅ |
| 엣지 파싱 (`-->`, `-->|label|`, `-- label -->`, `-.->`, `==>`) | ✅ |
| 방향 파싱 (TD / LR / BT / RL) | ✅ |
| BFS 위상 정렬 기반 자동 레이아웃 | ✅ |
| 사이클 있는 그래프 레이아웃 처리 | ✅ |
| preservedLines 보존 (style / classDef / subgraph / %% 등) | ✅ |
| VueFlow → Mermaid 역직렬화 | ✅ |
| 파싱 실패 시 빈 캔버스로 안전 폴백 | ✅ |

#### GUI 편집

| 기능 | 상태 |
|------|------|
| 노드 드래그 이동 | ✅ |
| 노드 더블클릭 → 텍스트 / shape 편집 모달 | ✅ |
| 노드 추가 버튼 (뷰포트 중앙에 배치, flash 애니메이션) | ✅ |
| 노드 선택 후 Delete 키 / 삭제 버튼으로 삭제 | ✅ |
| 노드 삭제 시 연결된 엣지 자동 제거 | ✅ |
| 핸들 드래그로 노드 연결 (엣지 생성) | ✅ |
| 엣지 선택 후 Delete 키 / 삭제 버튼으로 삭제 | ✅ |
| 방향 전환 드롭다운 (TD / LR / BT / RL) | ✅ |
| 화면 맞춤 버튼 | ✅ |
| 줌 인/아웃 (마우스 휠 + 컨트롤 패널) | ✅ |
| 캔버스 패닝 | ✅ |

#### 호스트 연동

| 기능 | 상태 |
|------|------|
| 편집 시마다 `mermaid-flow-editor:change` CustomEvent 발생 | ✅ |
| `getMermaid()` 동기 반환 | ✅ |
| `unmount()` 정리 | ✅ |
| 마운트 시 초기 Mermaid 코드 로드 | ✅ |
| Vue 2 `v-show` 기반 탭 전환과 충돌 없음 | ✅ |

---

### 꽤나 복잡한 그래프도 문제 없이 동작하는 이유

Alira가 생성하는 CFG는 수십 개 노드 + 사이클(루프 구조)이 포함된다.

- **사이클 처리**: BFS로 depth 미할당된 노드에 부모 depth+1을 반복 전파
- **레이아웃 안정성**: 노드 수에 무관하게 depth 기반 좌표 계산이 O(n)으로 처리
- **대형 그래프 fitView**: `onInit` + `watch(initialElements)` 두 곳에서 `fitView` 호출해 로드 후 자동 맞춤

---

## 남은 과제

### 1. 파싱 정확도

#### (1) `&quot;` HTML 엔티티 처리 안 됨

LLMService.java가 Alira 응답을 DB에 저장하기 전에 노드 레이블 안의 `"` 를 `&quot;` 로 치환한다.

```java
// LLMService.java
String replaced = before.replace("\"", "&quot;");
```

결과적으로 DB에 저장된 코드가 이렇게 된다:

```
A["if (x &quot;= 0)"]
```

파서는 이걸 그대로 레이블 문자열로 읽어서 노드 텍스트에 `&quot;` 가 그대로 보인다.
GUI에서 보기 안 좋고, 역변환 후 Mermaid 코드에도 `&quot;` 가 남는다.

**해결 방향**: 파서 입력 전 또는 노드 레이블 렌더링 시 HTML 엔티티 디코딩 처리 필요.

---

#### (2) 방향 변경 시 레이아웃 재계산 안 됨

드롭다운에서 TD → LR 로 방향을 바꾸면 `flowchart LR` 헤더만 바뀌고
**기존 노드 좌표는 그대로**다.

TD로 배치된 노드들(x: 세로 간격)이 LR 방향에서도 그대로 남아 겹쳐 보이거나 배치가 이상해진다.

**해결 방향**: 방향 변경 이벤트(`onDirectionChange`)에서 `assignLayout`을 새 direction으로 재실행해 좌표 재계산.

---

#### (3) 다중 타겟 엣지 미지원

Mermaid는 이런 문법을 지원한다:

```
A --> B & C
```

현재 파서는 이 패턴을 인식하지 못해 `preservedLines`에 들어가거나 무시된다.
Alira 출력에서 이 문법이 사용될 경우 엣지 누락 발생.

---

#### (4) 노드 ID 재사용 충돌 가능성

새 노드 추가 시 ID를 `N1`, `N2` ... 순으로 생성한다.
기존 Mermaid 코드에 `N1` 이라는 노드가 이미 있으면 while 루프로 건너뛰지만,
카운터가 컴포넌트 스코프 변수라 **unmount 후 remount 시 1부터 다시 시작**한다.
같은 모달을 열고 닫고 다시 열면 기존 노드와 ID가 겹칠 수 있다.

---

### 2. UX/UI 개선

#### (1) 엣지 레이블 편집 UI 없음

노드는 더블클릭으로 편집 모달이 뜨지만, **엣지는 더블클릭 편집이 없다**.
엣지 연결 시 레이블이 빈 문자열로 생성된다.

Yes/No 분기 레이블 같이 CFG에서 중요한 정보를 GUI에서 추가/수정할 방법이 없다.
Mermaid 코드 탭에서 직접 수정해야 한다.

**해결 방향**: `@edge-double-click` 이벤트 핸들러 + 엣지 레이블 편집 모달 추가.

---

#### (2) NodeEditModal에 `parallelogram` shape 없음

파서는 `parallelogram`을 지원하고, `FlowCanvas.vue`도 CSS로 시각화하는데,
**`NodeEditModal`의 shape 선택 드롭다운에 `parallelogram` 옵션이 빠져 있다.**

```vue
<!-- NodeEditModal.vue — 현재 -->
<option value="default">사각형 [ ]</option>
<option value="round">둥근 사각형 ( )</option>
<option value="diamond">마름모 { } (조건)</option>
<option value="stadium">타원 ([ ]) (시작/종료)</option>
<option value="circle">원 (( ))</option>
<!-- parallelogram 없음 -->
```

Alira 출력에 `parallelogram` 노드가 있으면 GUI에서 보이긴 하지만 편집 모달에서 shape를 바꾸면 parallelogram으로 되돌릴 수 없다.

**해결 방향**: `<option value="parallelogram">평행사변형 [/ /]</option>` 추가.

---

#### (3) 노드 선택 UX

현재 다중 선택 후 삭제는 가능하나, **선택된 상태가 시각적으로 명확하지 않을 수 있다**.
특히 diamond shape는 `clip-path`로 잘려있어 선택 테두리 효과가 잘 안 보인다.

---

#### (4) 빈 캔버스 안내 없음

초기 Mermaid 코드가 없거나 파싱 실패 시 그냥 빈 흰 화면만 뜬다.
"노드가 없습니다. + 노드 버튼을 눌러 추가하세요" 같은 안내 텍스트가 없다.

---

## 요약

```
완성된 것
├── 파싱/렌더링 핵심 기능 전체
├── GUI 편집 (노드 이동/추가/삭제/편집, 엣지 연결/삭제)
├── Mermaid 역직렬화 (편집 내용 → 코드 실시간 반영)
└── Vue 2 호스트 연동 (CustomEvent, mount/unmount API)

남은 것
├── [파싱] &quot; 엔티티 디코딩
├── [파싱] 방향 변경 시 레이아웃 재계산
├── [파싱] 다중 타겟 엣지 (A --> B & C)
├── [파싱] 노드 ID 카운터 remount 충돌
├── [UX]   엣지 레이블 편집 모달
├── [UX]   NodeEditModal에 parallelogram 옵션 누락
├── [UX]   diamond 노드 선택 시각화
└── [UX]   빈 캔버스 안내 텍스트
```
