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

### A.2 시나리오별 사용 — 관리자 (Admin)

- [ ] OIDC 로그인 (`alice@example.com` / dex 로컬)
- [ ] 새 템플릿 작성 (yaml 모드) — 예: nginx Deployment + Service
- [ ] UI 모드로 변환 → ui-spec 편집 (replicas, image 노출 / `nginx:1.25` 고정)
- [ ] v1 publish
- [ ] v1 → v2 새 버전 생성, 변경 후 publish
- [ ] v1 deprecate 처리, 카탈로그·새 배포 시도에서 막히는지 확인
- [ ] 팀 생성 + 멤버 추가
- [ ] 클러스터 등록 (kind cluster 등록 후 OpenAPI 정상 페치되는지)

### A.3 시나리오별 사용 — 일반 사용자 (User)

dex staticPasswords 의 두 번째 유저(예: `bob@example.com`) 또는 admin 본인으로 user 시점 시뮬레이션.

- [ ] `/catalog` — 검색·태그 필터 동작 확인
- [ ] 카드 클릭 → 배포 폼 — 필드 라벨 / 검증 / autocomplete (Plan 8 의 string enum/autocomplete 토글)
- [ ] 배포 → 릴리스 상세 → 개요·로그 탭 확인
- [ ] k8s 용어 토글 (advanced 보기)
- [ ] 업데이트 플로우 (`?updateReleaseId=` 로 들어와서 새 버전으로 갱신)
- [ ] 삭제

### A.4 Plan 8 재현 — release stale cleanup

- [ ] 배포 후 일부러 `kind delete cluster`
- [ ] 릴리스 상세 다시 열기 — explainer 배너가 뜨는지
- [ ] admin 으로 force-delete 클릭 → DB row 만 정리되는지 (k8s 호출 안 함)
- [ ] 일반 사용자에겐 "관리자에게 문의" 안내가 보이는지

### A.5 i18n / 테마

- [ ] ko ↔ en 토글 — 모든 화면 문자열이 따라오는지
- [ ] 다크/라이트 (혹시 있으면) 토글 확인

### A.6 결과 정리

- [ ] 발견 버그 → GitHub issues 등록 (label: `dogfood`)
- [ ] UX 갭 / "한 번에 못 찾았던 곳" → `docs/superpowers/specs/2026-MM-DD-dogfood-findings.md` 정리 (다음 plan 의 단서)
- [ ] critical 버그 (배포 막힘 / DB 오염 등) 는 Plan 10 진입 전 픽스 — 별도 PR
- [ ] minor 버그 / nice-to-have 는 backlog 로 미룸

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

- [ ] helm 설치 안내 추가 (Plan 9 에서 누락) — `~/.local/bin/helm` 또는 `brew install helm`
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

### D.3 Google OAuth 클라이언트

- [ ] [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) → Create OAuth 2.0 Client ID
- [ ] Application type: **Web application**
- [ ] Name: `kuberport`
- [ ] Authorized JavaScript origins: `https://kuberport.enzo.kr`
- [ ] Authorized redirect URIs: `https://kuberport.enzo.kr/api/auth/callback`
- [ ] Client ID / Client Secret 저장 (1Password / 안전한 곳)
- [ ] OAuth consent screen — 외부(External), 본인 이메일만 사용자로 등록 (피드백 동료들의 이메일도 추가 — Plan 10 시점)

### D.4 도메인 / DNS (enzo.kr 보유)

- [ ] enzo.kr 의 현재 DNS provider 확인
- [ ] **결정**: Cloudflare 로 NS 이전 vs 현 provider 그대로 쓰기
  - Cloudflare: 무료, ADR 0003 §공통 스택의 표준. NS 이전은 1회만.
  - 현 provider: 이전 비용 0, 그러나 cert-manager HTTP-01 + 빠른 TTL 등 일부 워크플로우가 cloudflare 가정
- [ ] **서브도메인 결정** — 후보: `kuberport.enzo.kr` (단순), `kp.enzo.kr` (짧음). README / 매뉴얼 / OAuth redirect URI 모두 일관해야 함
- [ ] A 레코드는 Plan 10 시 (VM IP 확보 후) 생성. 지금은 **결정만**.

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
