# Brainstorming Summary

`kuberport`의 브레인스토밍 과정에서 내린 결정과 그 근거를 한곳에 모은 문서.
새로운 결정이 내려지면 이 문서를 먼저 업데이트한 후, 무게 있는 결정은 `docs/decisions/`에 ADR로 추가한다.

## 프로젝트 본질

- **문제**: k8s 리소스(YAML) CRUD는 비전문 사용자에게 진입장벽이 큼. k9s/Lens 같은 도구는 있지만 전부 "k8s를 아는 사람"용.
- **해결**: 관리자(k8s 숙련자)가 **템플릿**을 한 번 만들고, 일반 사용자는 템플릿이 노출한 필드만 폼에서 채워 리소스를 배포/관리. k8s를 몰라도 사용 가능.
- **비유**: Swagger(OpenAPI spec → 인터랙티브 웹 UI)의 k8s 버전.

## 사용자 층

| 층 | 역할 | 주 도구 |
|----|------|---------|
| 관리자 (Admin) | 템플릿 작성 | YAML 에디터 + UI 에디터 (양방향, 상호 변환 가능) |
| 일반 사용자 (User) | 템플릿으로 리소스 배포/관리 | UI 폼 |

> 숙련도는 스펙트럼이지 이분법이 아니다 — 같은 사용자가 상황에 따라 YAML/UI 중 선택할 수 있다.

## 확정 결정 상세

### 1. Form factor: 웹 앱

대안: TUI(k9s 스타일) / 데스크톱(Electron) / CLI+웹 하이브리드.

**선택: 웹**
일반 사용자가 k8s를 모른다는 대전제에서, 설치나 kubeconfig 사전 준비 없이 URL만 알면 접근되는 브라우저 경험이 가장 자연스러움.

### 2. 템플릿 형식: B안 (pure YAML + ui-spec 오버레이)

**구성**
- `resources.yaml` — 배포될 진짜 k8s 매니페스트 (placeholder 없는 순수 YAML)
- `ui-spec.yaml` — 어떤 JSONPath를 어떤 이름/타입/기본값/검증으로 노출할지 선언

**대안**
- A (Helm chart 스타일): `{{ .Values.xxx }}` placeholder + `values.schema.json`
- C (추상 API 우선): 상위 스키마 + 렌더 규칙 (Crossplane 방식)

**왜 B?**
- Swagger 비유에 가장 충실 (순수 YAML이 소스 오브 트루스).
- UI ↔ YAML 양방향 변환이 기술적으로 가장 단순 (placeholder 파싱 없음).
- 관리자가 기존 YAML을 붙여넣고 "노출할 필드만 클릭"하는 UX가 가능.
- Helm placeholder 문법 학습 불필요.

**한계와 미래 보완**
- 반복/조건 로직이 약함 → v2에서 **Helm 임포트**를 B 위에 얹는 플러그인 형태로 보완.

### 3. End-user 조작 범위: Level 2

| Level | 기능 | 평가 |
|-------|------|------|
| 1 | 추상화된 배포/수정/삭제만 | 장애 시 100% 관리자 의존 → 비현실적 |
| **2** | **Level 1 + logs / events / pods 읽기 (추상 용어)** | **MVP** |
| 3 | Level 2 + 제한된 조작 (재시작/스케일 등, 관리자가 템플릿에 허용 표시) | v2로 미룸 — 템플릿 스펙 복잡도↑ |

### 4. 인증: OIDC/SSO → k8s RBAC 직접 사용

- 앱은 **UX 레이어만** 담당. 실제 "이 사람이 이 리소스를 수정할 수 있는가"는 k8s API 서버의 RBAC가 판정.
- 사용자는 앱에서 SSO 로그인 → OIDC 토큰이 그대로 k8s 인증 토큰으로 사용됨.
- RBAC는 OIDC의 email/group에 바인딩 (`User: alice@company.com`, `Group: dev-team`).
- 원칙: **"권한은 k8sconfig 쪽에서 관리"** — 앱이 자체 권한 모델을 갖지 않음.

**배제한 대안**
- BYOK (kubeconfig 업로드): "k8s 모르는 사용자" 컨셉과 근본 충돌.
- 앱 SA impersonation: 앱이 너무 강력한 권한을 쥠. v2의 fallback으로만 고려.

### 5. 클러스터 스코프: 다중

- 드롭다운으로 dev/staging/prod 등 전환.
- 각 클러스터 설정(OIDC issuer, API 서버 주소 등)은 앱 DB에 등록.

### 6. 리소스 범위

**MVP (A안)** — 핵심 워크로드
- Workload: `Deployment`, `StatefulSet`, `DaemonSet`, `Job`, `CronJob`
- Network: `Service`, `Ingress`
- Config: `ConfigMap`, `Secret`, `PersistentVolumeClaim`
- Observability (read-only): `Pod`, `Event`, `Log`

**v1.1 (B안)** — 관리자 수동 등록 CRD 지원
- CRD OpenAPI schema 기반으로 폼/뷰 자동 생성.
- 관리자가 상태 필드 매핑을 선언 (예: `.status.phase`).

**원칙**
- 템플릿 **적용(apply)** 은 처음부터 kind-agnostic (B안 템플릿 구조 덕분).
- **뷰어(viewer)** 만 A 범위 kind에 한해 리치, 나머지는 generic YAML 뷰로 폴백.
- 템플릿 하나에 여러 리소스 포함 가능 (Deployment + Service + Ingress = "Web Service" 템플릿).

### 7. Lifecycle: B안 (Versioned)

| 모델 | 설명 | 평가 |
|------|------|------|
| A (스냅샷) | 릴리스가 템플릿 사본을 들고 있음, 수정 전파 없음 | 업그레이드 운영 경로 없음 |
| **B (Versioned)** | **템플릿에 명시적 v1/v2/v3, 릴리스는 버전에 pin** | **Helm/ArgoCD 표준** |
| C (라이브 참조) | 최신 템플릿 즉시 반영 | 프로덕션 사고 위험 |

**B의 동작**
- 관리자 수정 → 새 버전 publish → 기존 릴리스에 "업데이트 가능" 뱃지 → 사용자가 수동으로 마이그레이션 (값 유지).
- 롤백은 버전 되돌리기로 처리.

### 8. 템플릿 저장소: 앱 DB (MVP)

| 저장소 | 평가 |
|--------|------|
| **앱 DB (Postgres/SQLite)** | **MVP — 웹 편집 UX에 가장 자연스러움** |
| k8s CRD (control-plane) | GitOps 친화적이나 웹 편집과 궁합 애매 |
| Git 리포지토리 | 철저한 버저닝, v2에서 연동 고려 (Backstage 스타일) |

## 기존 제품 매핑

| 제품 | 겹치는 부분 | 차별점 |
|------|------------|--------|
| Octopod | 셀프서비스 포털 UX | Octopod은 Helm 전제, 우리는 pure YAML 전제 |
| Backstage Software Templates | 관리자 추상화 선언 | Backstage는 스캐폴딩 중심, 우리는 "배포 후 일상 운영"까지 |
| Rancher App Catalog | 폼 기반 배포 | Rancher는 관리자 템플릿 편집 UX 약함 |
| Crossplane Composition | 추상 API → 실제 리소스 | Crossplane은 선언형 플랫폼, 우리는 런타임 툴 |
| k9s / Lens | 운영 감각 | 이들은 전부 "k8s 아는 사람"용 |

**우리의 포지션**: `Octopod의 셀프서비스 UX + Backstage의 관리자 추상화 + k9s의 운영 감각`의 교집합. 이 셋을 동시에 만족하는 기존 제품은 없음.

## 9. 아키텍처 개요 (승인됨)

5개 컴포넌트 구성:
- **Browser** — Next.js SPA, 사용자 인터페이스
- **Next.js (BFF)** — Vercel에 배포, 인증 콜백 처리 + Go 백엔드 프록시
- **API Server (Go)** — k8s control 클러스터에 Pod로 배포, client-go 사용
- **App DB (Postgres/SQLite)** — 템플릿 + 릴리스 메타 + 클러스터 등록
- **OIDC Provider** — 외부 (Google/Keycloak/...)
- **Target k8s Clusters** — N개, OIDC-enabled

4가지 핵심 흐름:
1. 로그인: Browser → OIDC → ID token → httpOnly 쿠키
2. 템플릿 CRUD: Browser → Next.js BFF → Go API → App DB
3. 배포: Browser → Next.js BFF → Go API → (App DB 릴리스 기록) + (사용자 토큰으로 k8s API apply)
4. 상태 조회: Browser → Next.js BFF → Go API → 사용자 토큰으로 k8s API 라이브 조회

원칙: **API 서버는 토큰을 그대로 포워딩, 앱 DB는 상태를 캐시하지 않음, 모든 상태는 라이브 조회**.

## 10. 기술 스택

### 백엔드: Go

| 영역 | 결정 | 이유 |
|------|------|------|
| 언어 | **Go** | k8s 생태계 표준 (kubectl/Helm/ArgoCD/k9s/Lens backend 전부 Go) |
| HTTP | Gin (또는 Echo) | 표준 선택지, 미들웨어 풍부 |
| k8s 클라이언트 | `client-go` | 공식 레퍼런스 클라이언트, Watch/Informer 성숙 |
| OIDC | `coreos/go-oidc` | 표준 OIDC provider 검증 라이브러리 |
| DB (dev) | **SQLite** | 설치 없이 개발 가능 |
| DB (prod) | **Postgres** | 표준 선택 |
| 마이그레이션 | `atlas` | 선언적 스키마, gorm 대비 단순 |
| 배포 | Docker + Helm chart | k8s 자체에 Pod로 실행 |

**배제한 대안**: Node.js/TypeScript backend — kubernetes-client 라이브러리가 client-go 대비 덜 성숙 (특히 Watch/Informer), 그리고 v1.1 CRD 지원 시 Go의 dynamic client 이점이 큼.

### 프론트엔드: Next.js 15

| 영역 | 결정 | 이유 |
|------|------|------|
| 프레임워크 | **Next.js 15 (App Router)** | Vercel 네이티브, OIDC 콜백 서버 처리, 미들웨어 auth guard |
| 스타일 | Tailwind + shadcn/ui | 빠른 레이아웃 + 접근성 좋은 컴포넌트 |
| YAML 에디터 | Monaco Editor | VSCode와 같은 엔진, `dynamic import`로 SSR 우회 |
| 폼 라이브러리 | React Hook Form + Zod | ui-spec → 동적 폼 생성에 적합 |
| OIDC | `openid-client` | Node 환경 표준 OIDC 클라이언트 |
| 배포 | Vercel | Next.js 네이티브 플랫폼 |

**Vite 대신 Next.js를 선택한 이유**:
1. OIDC 콜백을 Next.js Route Handler에서 서버 사이드 처리 → 토큰을 **httpOnly 쿠키**에 저장 → XSS 내성 (이 앱은 k8s 자격증명을 다루므로 보안 차이가 크다)
2. `middleware.ts`로 인증 가드를 엣지 레벨에서 처리 → 페이지 깜빡임 없음
3. Vercel + Next.js = zero-config / Vercel + Vite = 그냥 "정적 사이트"
4. BFF 패턴(Route Handler 프록시)으로 CORS 설정 제거

### 통신 패턴: BFF (Backend-for-Frontend)

```
Browser  ─→  Next.js Route Handler  ─→  Go API  ─→  k8s API
             (httpOnly 쿠키에서 토큰 꺼냄)    (토큰 포워딩)
```

**A (BFF)를 B (직접 호출)보다 선택한 이유**:
- 토큰이 브라우저 JS에 아예 노출 안 됨 (진짜 httpOnly)
- CORS 설정 0
- 내부 툴이라 트래픽 작아 Vercel 함수 invocation 비용 무시 가능
- 한 곳에서 요청 감시/로깅 가능

**아키텍처 경계 원칙**: 비즈니스 로직은 Go 백엔드에만. Next.js Route Handler는 **인증 쿠키 관리 + 얇은 프록시** 역할만. 개발자가 Next.js API에 로직을 스며들게 하는 유혹이 있어 CLAUDE.md에 명시.

### 레포 구성

```
kuberport/
├── backend/         # Go + client-go
├── frontend/        # Next.js
├── deploy/          # Helm chart, Dockerfile
└── docs/
```
Turborepo/nx 같은 모노레포 도구는 MVP에 과함 — 단순 디렉터리 분리로 시작.

## 미해결 (다음 브레인스토밍 토픽)

1. UI 목업 — 템플릿 해부도 / 관리자 템플릿 편집기(YAML/UI 토글) / 사용자 카탈로그 / 배포 폼 / 릴리스 상세
2. 데이터 모델 상세 — Template, Release, Cluster, User 테이블 스키마 + 관계
3. API 디자인 개요 — 주요 엔드포인트
4. 디자인 스펙 문서 작성 — `docs/superpowers/specs/YYYY-MM-DD-initial-design.md`
