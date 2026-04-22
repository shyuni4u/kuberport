# Plan 7 — Visual Refresh (2026-04-22)

> **Status**: 📝 초안. 구현은 2026-04-23 이후.
> Plan 6(post-MVP stabilization, PR #27) 머지 후 후속. **기능·라우트·백엔드 변경 없음 — 비주얼/레이아웃/디자인 토큰만.**

## 동기

Plan 0–6 으로 기능은 MVP 수준으로 올라왔지만 현재 UI 가 "기본 shadcn + 다크 슬레이트 TopBar + 좁은 max-w-6xl 1-컬럼" 형태라 자체적으로 평가할 때 **"너무 구리다"** 는 느낌. 셀프서비스 포털이라는 제품 정체성 — 즉 **사용자(비전문가)에게 친근하고 관리자(전문가)에게는 정보 밀도가 높은 대시보드** — 가 시각적으로 드러나지 않는다.

레퍼런스 시안(Figma community 파일, fileKey `nDP3cHNKf5Cjo6F2HU1EVv`, "Project Management Dashboard") 의 방향성을 가져와 **시각적 재단장**만 수행한다.

## 스펙/레퍼런스에서 가져올 것

Figma 시안에서 관찰된 패턴(구현 청사진이 아니라 **무드보드**로 사용):

- **좌측 네비게이션 사이드바** (현재 수평 TopBar 네비를 수직으로 재배치): 아이콘 + 라벨 행, active 항목은 라운드 pill 배경. 하단에 부가 영역(예: 현재 클러스터 요약 카드).
- **밝고 부드러운 팔레트**: 현재 `bg-slate-50 + 다크 헤더` → 미세한 뉴트럴 + warm accent 로 전환. 기존 `RoleBadge` / `StatusChip` 색 의미는 유지하되 톤을 낮춘다.
- **카드 라운드(`rounded-2xl`) + 충분한 여백**: 카탈로그·릴리스 리스트의 테이블/카드 밀도를 완화.
- **섹션 헤더에 카운트 pill + 상태 dot**: "릴리스 — ready/updating/failed" 분류 뷰에 그대로 매핑 가능.
- **아바타 스택 + 메타 행** 패턴: 소유 팀·수정자 표시에 활용.
- **상단바 slim 화**: 검색 + 현재 클러스터 + 알림(후속) + 사용자 메뉴만 남기고 기본 네비는 사이드바로 이전.

가져오지 **않을** 것:
- Kanban 3-컬럼, "Today/Filter" 툴바, "Thoughts Time" 위젯, 코멘트/파일 카운트 — 기능적으로 대응물이 없다.
- Figma 에 나오는 구체적인 폰트·색 hex — shadcn 토큰 시스템으로 번역해 사용.

## 범위(Scope)

**IN**:
- 글로벌 레이아웃 셸 재편 (`frontend/app/layout.tsx` + 신규 `AppShell` 컴포넌트: 좌측 사이드바 + 얇은 탑바 + 메인 영역).
- shadcn/Tailwind 디자인 토큰 조정 (`globals.css` 또는 `tailwind.config` 색·라운드·간격 변수).
- 기존 공용 컴포넌트 비주얼 리프레시 — 기능·prop 인터페이스 유지:
  - `TopBar` → 역할 분리 (Sidebar + 상단 유틸리티바).
  - `CatalogCard`, `ReleaseTable`(→ 카드 그리드 변형 검토), `RoleBadge`, `StatusChip`, `MetricCards`, `ReleaseHeader`.
- 타이포그래피·간격·라운드 일관성 정리.
- 라이트/다크 둘 다 지원하되 MVP 는 라이트 우선 (다크 토큰은 자리만 잡아둠).

**OUT**:
- 신규 라우트·신규 페이지·신규 기능 일절 없음.
- 백엔드·DB·OpenAPI 변경 없음.
- 모바일 반응형 최적화는 최소한만 (사이드바 축소 토글 정도. 풀 반응형은 별도 플랜).
- i18n — 현재처럼 한국어 하드코딩 유지.
- 접근성 감사는 이 플랜에서 하지 않음 (별도 패스).

## 태스크 (초안 — 내일 상세화)

### T1 — 디자인 토큰 정리

`frontend/app/globals.css` 의 CSS 변수를 kuberport 팔레트로 교체. shadcn 의 `--background` / `--foreground` / `--primary` / `--muted` / `--accent` / `--border` / `--ring` / `--radius` 를 뉴트럴 + warm accent 구조로 재정의. `StatusChip` / `RoleBadge` 의 의미 색(ready=green, updating=amber, failed=red, admin=purple 등)은 토큰으로 분리해 유지.

### T2 — `AppShell` 도입 + TopBar 분해

신규 `frontend/components/AppShell.tsx` — 좌측 Sidebar(네비 + 현재 클러스터 카드) + 상단 Header(검색/알림placeholder/사용자메뉴) + `<main>` 영역. 기존 `TopBar` 는 `Sidebar` + `HeaderUtilities` 로 분해 후 삭제. `NAV_BY_ROLE` 로직은 그대로 이전. `frontend/app/layout.tsx` 의 `max-w-6xl mx-auto` 제약 재검토 — 대시보드는 와이드, 폼은 내용 중심 폭으로 분리.

### T3 — 카탈로그·릴리스 리스트 카드 리프레시

- `CatalogCard`: 아이콘 + 제목 + 태그 + 설명 + 소유 팀 아바타. 라운드·그림자·여백 재조정. 호버 상태 정의.
- `ReleaseTable`: 기본은 테이블 유지하되 행 디자인(상태 dot + 제목 + 메타) 정리. 추후 "상태별 섹션 + 카운트 pill" 그리드 뷰로 토글 가능한지 평가 (이번에는 디자인만, 토글은 별도 플랜).

### T4 — 공용 칩/배지/메트릭 스타일 통일

`RoleBadge`, `StatusChip`, `MetricCards` 의 배경·테두리·텍스트 대비를 새 토큰으로 맞춘다. 사이즈 2종(기본/작음)과 variant 이름을 합의(`subtle` / `solid`).

### T5 — 각 페이지 시각 점검 및 조정

`/catalog`, `/catalog/[name]`, `/templates`, `/templates/[name]`, `/templates/new`, `/templates/[name]/versions/[v]/edit` (UI/YAML 두 모드), `/releases`, `/releases/[id]` (개요·로그 탭), `/admin/teams` 를 브라우저로 하나씩 돌아보며 깨진 간격·정렬·색 대비를 수정. 실제 데이터(Plan 6 local-e2e 환경)로 확인한다. 기능 회귀가 있으면 즉시 멈추고 원인을 기록.

### T6 — 시각 회귀 최소 방어

스냅샷 테스트까지는 과하니, 핵심 컴포넌트(`CatalogCard`, `StatusChip`, `RoleBadge`)의 기존 Vitest 가 여전히 통과하는지만 확인. Playwright e2e 는 라벨/역할 기반이므로 디자인 변경에 대해 견고해야 함 — 깨지면 테스트가 DOM 구조에 너무 결합돼 있다는 신호이므로 원래 테스트를 고친다(구조 유연화).

## 작업 방법

- 별도 브랜치 `feat/plan7-visual-refresh` (또는 워크트리) 에서 진행. Plan 6 처럼 단일 PR 목표.
- 토큰 → Shell → 공용 컴포넌트 → 페이지 순. 역순(페이지부터)으로 가면 중복 작업 발생.
- 스크린샷을 PR 설명에 before/after 로 첨부.
- Figma 시안은 **무드보드**. 1:1 복제 금지 — 제품에 맞지 않는 요소(Kanban, 주석 카운트 등)는 가져오지 않는다.

## 열린 질문 (내일 결정)

1. 다크 모드 토글 UI 까지 넣을지, 아니면 토큰만 깔아두고 토글은 후속으로 미룰지.
2. `ReleaseTable` 을 "카드 그리드" 로 바꿀지, "다시 테이블이지만 스타일만" 유지할지 — 릴리스 수가 많아질 때의 스캔성 손실을 감안해 토글 두는 쪽이 타협안.
3. 사이드바 폭(220–260px 구간)·축소 토글 동작 세부.
4. 브랜드 색(accent) 한 가지 결정 — kuberport 로고 용도까지 볼 것.
