# 배포 전 준비 — kuberport pre-launch runbook

> **상태**: 2026-04-29 작성. Plan 9 (Helm chart MVP) 머지 후, Plan 10 (GCP Phase 1 부트스트랩) 진입 전 단계의 마스터 체크리스트.
>
> **대상 독자**: 프로젝트 오너 (이 문서를 작성하라고 요청한 사람).
> **목적**: dogfooding → 매뉴얼 → doc 업데이트 → 외부 계정 준비를 순서대로 끝낸 뒤 Plan 10 으로 진입.

체크리스트 표기 — `[ ]` 사용자가 직접, `[c]` Claude 가 도울 수 있음 (요청 시), `[?]` 결정 필요.

## 진행 상황 요약 (자동 갱신 권장)

| Phase | 진행 | 비고 |
|---|---|---|
| A. Dogfooding | 0% | local-e2e 또는 chart 로 시작 |
| B. 사용자 매뉴얼 | 0% | `docs/user-guide/` 신설 예정 |
| C. 프로젝트 doc 업데이트 | 0% | CLAUDE.md / README / dev-setup |
| D. Plan 10 사전 준비 | 부분 | OCI A1 시도 중, 도메인 enzo.kr 보유, OIDC=Google OAuth 결정 |

---

## Phase A — Dogfooding (목표: 1~2주)

목표: **본인이 직접 사용하면서 UX 갭·버그·문서 부족 부분을 찾아낸다.** 동료 피드백은 Plan 10 배포 후. 지금은 셀프 검증.

### A.1 환경 선택

두 가지 dogfooding 환경 — 둘 중 하나 선택, 또는 둘 다.

| 환경 | 장점 | 단점 |
|---|---|---|
| local-e2e (기존, `docs/local-e2e.md`) | 빠른 hot-reload, 코드 수정 즉시 반영 | chart 자체는 검증 안 됨 |
| chart 기반 (`helm install` on local kind) | chart UX 도 같이 검증 (Plan 10 시 부드러움) | 코드 수정 시 이미지 리빌드 필요 |

- [ ] **선택**: 기본은 local-e2e (UX 검증), 챕터 끝나기 전 한 번 chart 기반으로도 install 해보면 충분.

### A.2 인증 / 첫 화면

목표: 로그인 ~ 첫 화면 진입까지 마찰 없는지.

- [ ] **A.2.1 OIDC 로그인 (admin)** — `alice@example.com` / `alice` (dex 로컬). 로그인 직후 사이드바·탑바·우측 상단 사용자 칩이 바르게 보이는지. `RoleBadge` 가 `admin` 인지 확인.
- [ ] **A.2.2 OIDC 로그인 (user)** — 두 번째 dex staticPasswords 유저(예: `bob@example.com`) 로 같은 흐름. `RoleBadge` 가 일반 사용자(user) 로 표시되는지, admin 메뉴 항목(예: `/admin/teams`, `/templates/new`) 가 사이드바에 안 보이는지.
- [ ] **A.2.3 로그아웃 / 세션 만료** — 로그아웃 → 다시 보호된 페이지 진입 시 로그인 흐름으로 redirect 되는지. 토큰 만료 시뮬레이션은 dex 토큰 lifetime 짧게 설정 후 대기 또는 쿠키 수동 삭제.

캡처: 로그인 후 첫 화면 (admin / user 각 1장 — Phase B 매뉴얼 표지에 사용).

### A.3 관리자 — 템플릿 작성 (YAML 모드)

목표: k8s 숙련자가 처음 템플릿 만들 때 막힘 없는지. **Plan 4 / Plan 6 의 admin editor 핵심 검증 영역.**

- [ ] **A.3.1 새 템플릿 (`/templates/new`) 진입** — 페이지 로딩, 좌측 SchemaTree·우측 FieldInspector·하단 BottomBar 가 보이는지.
- [ ] **A.3.2 nginx 템플릿 작성** — `?mode=yaml` 로 전환, 다음 YAML 붙여넣기:
  ```yaml
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web
  spec:
    replicas: 2
    selector: {matchLabels: {app: web}}
    template:
      metadata: {labels: {app: web}}
      spec:
        containers:
          - name: app
            image: nginx:1.25
            ports: [{containerPort: 80}]
  ---
  apiVersion: v1
  kind: Service
  metadata: {name: web}
  spec:
    selector: {app: web}
    ports: [{port: 80, targetPort: 80}]
  ```
  Monaco 가 syntax highlight 하는지, `metadata.name` 충돌·잘못된 indent 시 에러 표시되는지.
- [ ] **A.3.3 메타 입력** — MetaRow 에서 이름·표시이름·태그·아이콘 입력. 한국어 표시이름 (예: "웹 서비스"), 태그 (예: `web,nginx`), 아이콘 선택 가능.
- [ ] **A.3.4 저장 (draft)** — BottomBar `저장` → 토스트 / 페이지 이동. `/templates/web` 가 status `draft` 로 떠야 함.

### A.4 관리자 — 템플릿 작성 (UI 모드)

목표: ui-spec 편집 흐름·필드 타입별 동작.

- [ ] **A.4.1 YAML → UI 변환** — A.3 의 draft 를 `?mode=ui` 로 열기. Plan 6 의 yaml→UI 변환이 동작해 SchemaTree 에 path 가 트리로 보이는지.
- [ ] **A.4.2 노출 토글** — `Deployment[web].spec.replicas` 클릭 → FieldInspector 에서 "사용자 노출" 체크. 라벨 `인스턴스 개수`, type=integer, min=1, max=5, default=2 입력. SchemaTree 의 해당 노드 옆 배지가 변경되는지.
- [ ] **A.4.3 값 고정** — `Deployment[web].spec.template.spec.containers[0].image` 클릭 → "값 고정" 선택, `nginx:1.25` 입력. SchemaTree 배지 확인.
- [ ] **A.4.4 string 입력 방식 토글 (PR #36 검증)** — 또 다른 string path (예: `metadata.labels.tier`) 노출 → FieldInspector 의 "입력 방식" 토글로 (a) `enum` (`web, api, worker`) / (b) `autocomplete` (`v1, v2, beta` 같은 advisory) / (c) plain string 각각 선택해보기. 사용자 폼 preview (A.4.6) 에서 각각 select / datalist / 자유 입력 으로 렌더되는지.
- [ ] **A.4.5 enum values 입력** — Plan 4 에서 추가한 enum values 인풋 — `["dev", "stage", "prod"]` 같은 명시적 enum 케이스도 따로 검증.
- [ ] **A.4.6 사용자 폼 미리보기 (Plan 6)** — 에디터 안에서 사용자 입장 폼이 어떻게 보일지 preview. 위에서 노출/고정/enum/autocomplete 한 필드들이 실제 폼처럼 렌더되는지.
- [ ] **A.4.7 저장** — UI 모드에서 저장 후 `?mode=yaml` 다시 열어 ui-spec 이 yaml 로 정상 직렬화됐는지 확인.

### A.5 관리자 — 버전·라이프사이클

목표: draft / publish / deprecate / 새 버전 흐름.

- [ ] **A.5.1 v1 publish** — `/templates/web` 상세에서 v1 publish 버튼. status 가 `published` 로 바뀌고, `/catalog` 에 카드가 등장하는지.
- [ ] **A.5.2 + 새 버전 (Plan 6)** — `+ 새 버전` 클릭 → v2 draft 생성, version-edit 모드 탭이 보이는지. 무엇을 수정 (예: replicas default 를 3 으로) 후 v2 publish.
- [ ] **A.5.3 카탈로그 갱신** — `/catalog` 에서 카드 detail 이 v2 기준으로 보이는지, 기존 v1 릴리스 상세에 "업데이트 가능" 배지가 등장하는지 (Plan 2 의 UpdateAvailableBadge).
- [ ] **A.5.4 v1 deprecate** — `/templates/web` 에서 v1 deprecate. (a) 카탈로그에서 v1 으로의 신규 배포 진입이 안 보이는지, (b) v1 으로 직접 배포 시도(URL 직조립 등) 시 백엔드가 400 으로 막는지.
- [ ] **A.5.5 v2 draft 삭제 (Plan 6)** — 별도 v3 draft 만들어 publish 전에 삭제. 이미 published 된 v1, v2 는 삭제 못 막혀 있는지(`drafts-only`).

### A.6 관리자 — 클러스터 / 팀

목표: 다중 클러스터·팀 관리.

- [ ] **A.6.1 클러스터 등록** — `/admin/clusters` (또는 해당 경로) 에서 kind 클러스터 등록. `docs/local-e2e.md` §9 의 KIND_CA / api_url / oidc_issuer_url 입력. OpenAPI 페치가 정상 (사이드바 클러스터 picker 에 healthy 로 보이는지).
- [ ] **A.6.2 클러스터 삭제 시 cascade** — 등록된 클러스터를 삭제하면 그 클러스터에 묶인 릴리스가 어떻게 처리되는지. (Plan 8 의 `cluster-unreachable` 분류 영향)
- [ ] **A.6.3 팀 생성** — `/admin/teams` 에서 팀 생성 → 본인을 editor 로 추가.
- [ ] **A.6.4 템플릿 — 팀 연결** — A.3 의 템플릿을 위 팀에 연결. 다른 팀 멤버가 아닌 사용자가 그 템플릿 detail 에 접근 시 권한별 UI 분기(Plan 6) 가 동작하는지.

### A.7 일반 사용자 — 카탈로그 / 배포

목표: 비전문가가 첫 시도에서 막힘 없이 배포까지.

- [ ] **A.7.1 `/catalog` 첫 인상** — 카드들이 깔끔히 정렬, 아이콘이 제대로, 표시이름·태그가 한국어로 보이는지 (Plan 7 i18n).
- [ ] **A.7.2 검색** — 검색창에 한글 키워드 (예: "웹") / 영문 (`nginx`) / 태그 (`web`) 입력 시 결과 필터링.
- [ ] **A.7.3 태그 필터** — 카드 위 태그 클릭 → 같은 태그 카드만 남는지.
- [ ] **A.7.4 카드 → 배포 폼** — 카드 클릭 → `/deploy/<template>?version=<v>` 진입.
- [ ] **A.7.5 폼 필드** — A.4 에서 노출한 필드들 (replicas number / image autocomplete / tier enum 등) 이 각자의 입력 컨트롤로 렌더되는지. 라벨이 한국어로.
- [ ] **A.7.6 클러스터 드롭다운 (Plan 5)** — 등록된 클러스터들이 드롭다운으로 보이는지.
- [ ] **A.7.7 RBAC 패널 (Plan 3)** — SSAR 결과로 "이 클러스터에 배포 가능 / 불가" 판정이 표시되는지. 권한 없는 클러스터 선택 시 회색·툴팁 안내.
- [ ] **A.7.8 폼 검증** — 일부러 잘못된 값 입력 (replicas=0 / max 초과 / 빈 값) → react-hook-form + Zod 에러 표시.
- [ ] **A.7.9 제출 → 릴리스 생성** — 제출 후 `/releases/<id>` 로 라우팅, 릴리스 상세가 뜨는지.

### A.8 일반 사용자 — 릴리스 상세 / 관찰

목표: Plan 2 의 중첩 라우트 + SSE + k8s 용어 토글 검증.

- [ ] **A.8.1 개요 탭** — 헤더(이름·버전·클러스터·status) / MetricCards / 인스턴스 테이블 / 이벤트 / 사용자 폼 값 확인.
- [ ] **A.8.2 status 칩 색상** — `healthy` (녹) / `warning` (주) / `error` (적) / `unknown` (회) — 처음 떴을 때 잠시 `unknown` 후 `healthy` 로 가는지.
- [ ] **A.8.3 로그 탭 / SSE** — pod 로그가 실시간으로 흘러내리는지. `kubectl logs -f` 와 같은 흐름. 끊김·버퍼링 등 체감.
- [ ] **A.8.4 k8s 용어 토글** — Plan 2 의 advanced 보기. 비전문가용 라벨 ↔ k8s 원어(Pod/Container/PVC) 가 토글되는지.
- [ ] **A.8.5 다중 인스턴스** — replicas=3 으로 배포한 케이스에서 인스턴스 테이블이 3개 row 로 나오는지.

### A.9 일반 사용자 — 업데이트 / 삭제

목표: 라이프사이클 끝까지.

- [ ] **A.9.1 업데이트 플로우 (Plan 3)** — 릴리스 상세에서 "업데이트 가능" 배지 → 클릭 시 `/deploy/<t>?version=<v2>&updateReleaseId=<id>` 로 진입. 기존 값이 폼에 prefill, 변경 후 PUT 으로 갱신되는지.
- [ ] **A.9.2 삭제 (일반)** — 릴리스 상세 / 리스트의 삭제 버튼 → confirm dialog → DELETE → `/releases` 로 redirect.
- [ ] **A.9.3 삭제 후 카탈로그·릴리스 리스트** — 해당 릴리스가 사라졌는지, k8s 안의 리소스도 정리됐는지(`kubectl get all -A | grep <name>` 비어있어야).

### A.10 Plan 8 재현 — release stale cleanup

목표: cluster-unreachable / resources-missing 분기 + admin force-delete.

- [ ] **A.10.1 cluster-unreachable 만들기** — 정상 배포 후 `kind delete cluster --name kuberport` (또는 docker stop). 릴리스 상세 새로고침.
- [ ] **A.10.2 explainer 배너** — `cluster-unreachable` status 칩 + 배너 ("클러스터에 닿을 수 없음 — 관리자에게 문의"). user 로그인 시.
- [ ] **A.10.3 admin force-delete** — admin 로그인 → 같은 페이지에서 `[강제 삭제]` 버튼이 보이는지. 클릭 → confirm → DB row 만 삭제 (k8s 호출 안 됨, 502 안 남).
- [ ] **A.10.4 resources-missing** — 클러스터는 살아있되 리소스가 없는 케이스 (`kubectl delete deployment <release>` 직접). status 가 `resources-missing` 으로 분리되는지.

### A.11 i18n / 비주얼 / 키보드

목표: Plan 7 비주얼·i18n 표면 검증.

- [ ] **A.11.1 ko ↔ en 토글** — 우측 상단 (또는 사이드바) 토글. 모든 사용자향 문자열이 즉시 바뀌는지. **누락 케이스 메모해두기** — Phase B 매뉴얼·후속 issue 의 단서.
- [ ] **A.11.2 다크 모드 (있다면)** — 토글 후 텍스트 대비·배지 색상·StatusChip 가독성.
- [ ] **A.11.3 반응형** — 브라우저 폭을 좁혔을 때 사이드바 collapse / 테이블 가로 스크롤 / 폼 레이아웃 깨짐 여부.
- [ ] **A.11.4 키보드 내비** — Tab / Enter 만으로 카탈로그 → 카드 진입 → 폼 제출까지 가능한지 (대략적으로). 명백히 안 되는 곳만 메모.

### A.12 권한 / 에러 케이스

목표: 권한 없는 시도·네트워크 단절·잘못된 입력에 대한 표면 동작.

- [ ] **A.12.1 권한 없는 페이지 직접 진입** — user 로 로그인한 상태에서 `/templates/new` 또는 `/admin/teams` URL 직타. 403 또는 redirect 되는지.
- [ ] **A.12.2 SSAR 거부** — 등록된 클러스터 중 RBAC 으로 거부되는 케이스를 만들고 (예: `system:authenticated` binding 제거) 배포 폼에서 그 클러스터 선택 → RBAC 패널이 거부 사유 노출.
- [ ] **A.12.3 백엔드 다운** — 백엔드 프로세스 잠시 종료 → frontend 가 어떻게 보이는지. 토스트 / 에러 페이지 / 무한 스피너 중 어떤가. 무한 스피너면 issue.
- [ ] **A.12.4 네트워크 끊김** — 브라우저 devtools 로 offline 시뮬레이션 → SSE 끊김·재연결, 폼 제출 실패 메시지.
- [ ] **A.12.5 토큰 만료** — 쿠키 수동 삭제 후 보호 페이지 → 깔끔히 로그인으로 redirect.

### A.13 결과 정리

목표: dogfood 결과를 후속 작업의 입력으로 변환.

- [ ] 발견 버그 → GitHub issues 등록 (label: `dogfood`). 각 이슈에 (A.x.y) 시나리오 번호 인용.
- [ ] UX 갭 / 한 번에 못 찾았던 곳 → `docs/superpowers/specs/2026-MM-DD-dogfood-findings.md` 정리 (다음 plan 의 단서).
- [ ] **critical** (배포 막힘 / DB 오염 / OIDC 깨짐 / 권한 우회) → Plan 10 진입 전 픽스 (별도 PR). priority `P0`.
- [ ] **major** (눈에 띄는 UX 깨짐 / i18n 누락) → Plan 10 후 1주 안에 픽스 — 첫 사용자에게 직접 보일 가능성 높음.
- [ ] **minor / nice-to-have** → backlog.
- [ ] 스크린샷 / 화면 녹화 → Phase B 매뉴얼 자료로 보관 (예: `~/Pictures/kuberport-dogfood/` 같은 작업 폴더).

---

## Phase B — 사용자 매뉴얼 (목표: 3~5일)

목표: **비전문가 동료가 첫 시도에서 막히지 않을 수준의 안내**. Plan 10 배포 후 동료에게 URL 줄 때 같이 줄 가이드.

한국어 우선. 영문은 배포 후 트래픽 들어오기 시작하면 작성.

### B.1 디렉터리 구조

```
docs/user-guide/
├── README.md          ← 인덱스 (한국어)
├── for-users.md       ← 일반 사용자 (배포·관찰)
├── for-admins.md      ← 관리자 (템플릿 작성)
└── for-operators.md   ← 운영자 (클러스터 등록·트러블슈팅)
```

- [ ] `docs/user-guide/` 디렉터리 생성
- [ ] `docs/user-guide/README.md` — 3개 가이드 인덱스 + 짧은 프로젝트 소개 (README.md 의 1단락 재사용)

### B.2 일반 사용자 가이드 (`for-users.md`)

- [ ] 로그인 → 카탈로그 → 첫 배포 (스크린샷 1~2장)
- [ ] 폼 필드별 의미 — replicas / image / 자주 등장하는 enum
- [ ] 릴리스 상태 해석 — `healthy` / `warning` / `error` / `cluster-unreachable` / `resources-missing` (Plan 8 의 새 status 포함)
- [ ] 업데이트·삭제 흐름
- [ ] 잘 안 될 때: 어디에 문의 (admin 연락처 / Slack 채널 등 — 사이트별로 채워넣기)

### B.3 관리자 가이드 (`for-admins.md`)

- [ ] 템플릿 = 무엇인가, ui-spec 의 역할
- [ ] 첫 템플릿 작성 — YAML 모드 → UI 모드로 노출 필드 선택
- [ ] 버전 관리 — draft / publish / deprecate / 새 버전
- [ ] 팀 / 멤버십 / 권한 모델
- [ ] 흔한 함정 — `metadata.name` 충돌, RBAC 미설정 클러스터 등

### B.4 운영자 가이드 (`for-operators.md`)

- [ ] 새 클러스터 등록 — kubeconfig CA 추출, OIDC issuer URL, RBAC binding
- [ ] release stale cleanup (Plan 8 의 force-delete)
- [ ] 백업·복구 — Phase 1 은 데이터 유실 허용. Phase 2 에서 `pg_dump` cron 추가 (참조 → ADR 0003)
- [ ] kuberport 자체 업그레이드 — `helm upgrade` 절차 (chart README 참조)

### B.5 결과물

- [ ] 4개 md 파일 + 인덱스
- [ ] (선택) 스크린샷 — Phase A dogfooding 시 캡처해둔 것 활용
- [ ] 루트 `README.md` 끝부분에 `/docs/user-guide/` 링크 추가

---

## Phase C — 프로젝트 doc 업데이트 (목표: 1일)

목표: Phase A·B 의 결과를 반영하고 **다른 사람이 이 repo 를 처음 봤을 때 길을 잃지 않게** 만든다.

### C.1 CLAUDE.md (본 PR 에서 1차 sync 됨 — Phase A·B 후 다시 점검)

- [x] "현재 단계" 갱신 — Plan 9 머지 / dogfooding 단계 / Plan 10 다음 (본 PR commit)
- [x] 플랜 표 9번 행 ✅ merged 로 토글 (본 PR commit)
- [ ] Phase A 결과로 발견된 사항이 있으면 추가 sync

### C.2 dev-setup.md

- [ ] helm 설치 안내 추가 (Plan 9 에서 누락) — 공식 설치 스크립트 ([get.helm.sh](https://helm.sh/docs/intro/install/)) / `brew install helm` / 패키지 매니저 중 환경에 맞는 방식
- [ ] kind 설치 안내 (이미 있을 수 있음 — 확인)
- [ ] §4 검증 커맨드 표에 `helm version` / `kind version` 추가

### C.3 README.md / README.ko.md

- [ ] 현재 156 라인. 무엇이 들어 있는지 일독 후 **사용자 매뉴얼 링크 / 데모 URL placeholder / 스크린샷 1장** 정도가 빠져 있다면 보강
- [ ] (선택) badges — CI 상태, 라이선스, latest release

### C.4 dogfood-findings.md (Phase A.6 의 결과)

- [ ] 단순 정리 doc — 이슈 링크 + UX 갭 + 다음 plan 의 단서
- [ ] 위치: `docs/superpowers/specs/2026-MM-DD-dogfood-findings.md`

---

## Phase D — Plan 10 사전 준비 (목표: 1~2일, 일부 OCI 결과 대기)

목표: Plan 10 doc 작성·실행 시점에 외부 계정·자원·시크릿이 준비되어 첫 배포 명령에서 막히지 않게.

### D.1 OCI A1 capacity (parallel — 결과에 따라 Plan 10 의 정의가 달라짐)

현재 시도 중. 결과 분기:

| OCI 결과 | Plan 10 정의 | 우선순위 |
|---|---|---|
| 즉시 capacity 잡힘 | "Phase 2 (OCI) 부트스트랩" — GCP 건너뜀 | 최우선 (영구 무료) |
| 며칠~몇 주 안에 잡힘 | "Phase 1 (GCP) 부트스트랩 + Phase 2 이전 task" 두 단계 plan | OCI 잡히는 날 Phase 2 task 시작 |
| 90일 안에 못 잡힘 | "Phase 1 만 90일 운영 후 Phase 3 (Hetzner) 이전" | 만료 D-30 까지 결정 |

- [?] 매주 1회 점검 — 잡혔는지, 새 capacity 알림 등록.
- [ ] OCI 잡히면 Plan 10 방향 재논의 후 doc 작성.

### D.2 GCP 계정 (현재 미가입)

OCI 결과를 기다리지 않고 미리. 잡히면 GCP 단계는 그냥 건너뛰면 됨 (해본 경험은 보존).

- [ ] [Google Cloud 무료 평가판](https://cloud.google.com/free) 가입
- [ ] **결제 카드 등록** (verify only — 자동 PAYG 전환 안 됨, 90일 후 강제 종료)
- [ ] 90일 / $300 크레딧 활성화 확인
- [ ] **예산 알림 $1 한도** 설정 (Billing → Budgets & alerts) — 카드 결제 폭주 사고 방지
- [ ] 프로젝트 1개 생성 (이름 예: `kuberport-bootstrap`)
- [ ] `asia-northeast3` (서울) region 활성화 확인 (Compute Engine API 활성화)

### D.3 도메인 / DNS (enzo.kr 보유)

> OAuth 설정·매뉴얼·README 가 모두 서브도메인에 의존하므로 **본 단계가 D.4 보다 먼저** 끝나야 함.

- [ ] enzo.kr 의 현재 DNS provider 확인
- [ ] **결정**: Cloudflare 로 NS 이전 vs 현 provider 그대로 쓰기
  - Cloudflare: 무료, ADR 0003 §공통 스택의 표준. NS 이전은 1회만.
  - 현 provider: 이전 비용 0, 그러나 cert-manager HTTP-01 + 빠른 TTL 등 일부 워크플로우가 cloudflare 가정
- [ ] **서브도메인 결정 (확정)** — 후보: `kuberport.enzo.kr` (단순), `kp.enzo.kr` (짧음). 이후 OAuth · 매뉴얼 · README · OIDC redirect URI 가 모두 이 값에 묶임.
- [ ] A 레코드는 Plan 10 시 (VM IP 확보 후) 생성. 지금은 **결정만**.

### D.4 Google OAuth 클라이언트

> **선결**: D.3 의 서브도메인 결정 끝낸 뒤 진행. 아래 `<your-subdomain>.enzo.kr` 자리에 D.3 에서 확정한 서브도메인을 넣음 (예: `kuberport.enzo.kr`).

- [ ] [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) → Create OAuth 2.0 Client ID
- [ ] Application type: **Web application**
- [ ] Name: `kuberport`
- [ ] Authorized JavaScript origins: `https://<your-subdomain>.enzo.kr`
- [ ] Authorized redirect URIs: `https://<your-subdomain>.enzo.kr/api/auth/callback`
- [ ] Client ID / Client Secret 저장 (1Password / 안전한 곳)
- [ ] OAuth consent screen — 외부(External), 본인 이메일만 사용자로 등록 (피드백 동료들의 이메일도 추가 — Plan 10 시점)

### D.5 시크릿 보관 / CD 비밀

- [ ] [c] GitHub repository secrets 에 등록할 항목 사전 정리:
  - `GCP_VM_HOST` / `GCP_SSH_PRIVATE_KEY` (Plan 10 SSH-based deploy)
  - `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` (Google OAuth)
  - `APP_ENCRYPTION_KEY_B64` (`openssl rand -base64 32`)
  - `POSTGRES_PASSWORD` (`openssl rand -hex 24`)
- [ ] 실제 등록은 Plan 10 첫 task — 지금은 어디에 무엇 들어갈지 mental map 만.

---

## Plan 10 진입 조건 (체크 끝나면 본 doc 한 번에 close)

- [ ] Phase A 결과: critical 버그 0
- [ ] Phase B: 4개 매뉴얼 머지됨
- [ ] Phase C: CLAUDE.md / dev-setup / README 최신
- [ ] Phase D: GCP 계정 + Google OAuth client + 서브도메인 결정 끝
- [ ] OCI A1 결과 확정 (잡힘 / 안 잡힘)
- [ ] **Plan 10 doc 작성** (이 시점에 OCI 결과 반영해서 Phase 1 vs Phase 2 부트스트랩으로 결정)

---

## 참고 — 본 doc 의 위치

- `docs/release-prep.md` — 본 마스터 체크리스트
- `docs/superpowers/plans/2026-04-29-plan9-helm-chart.md` — Plan 9 (완료)
- (예정) `docs/superpowers/plans/2026-MM-DD-plan10-*.md` — Plan 10
- (예정) `docs/user-guide/` — Phase B 매뉴얼

본 doc 은 Plan 10 진입 시점에 archive 또는 closed 로 표기.
