# kuberport

k8s 리소스(YAML)를 템플릿화해서, 관리자는 편집하고 비전문 사용자는 폼으로 쓰는 웹 앱.
Swagger가 OpenAPI spec을 UI로 바꿔 주는 것처럼, k8s 리소스를 **추상화된 셀프서비스 포털**로 바꾸는 것이 목표.

## 현재 단계

**디자인 스펙 작성 완료 — 사용자 리뷰 대기**.
- 초안: [docs/superpowers/specs/2026-04-16-initial-design.md](docs/superpowers/specs/2026-04-16-initial-design.md) v0.1
- 승인 시 `writing-plans` 스킬 호출 → `docs/superpowers/plans/` 아래에 구현 계획 생성
- 그 전까지 프로젝트 코드(`package.json`, `go.mod`, `src/` 등) 스캐폴딩 금지

## 확정된 결정 (요약)

자세한 근거는 [docs/brainstorming-summary.md](docs/brainstorming-summary.md) 참조.

| 주제 | 결정 |
|------|------|
| Form factor | 웹 앱 |
| 템플릿 형식 | B안 — pure k8s YAML + 별도 ui-spec 오버레이 |
| End-user 조작 범위 | Level 2 — 추상화된 배포/수정/삭제 + 읽기 전용 관찰(logs/events/pods) |
| 인증 | OIDC/SSO, k8s RBAC를 그대로 사용 (앱은 UX 레이어만 담당) |
| 클러스터 | 다중 클러스터 지원 (드롭다운 선택) |
| 리소스 범위 MVP | A안 — 핵심 워크로드 (Deployment/StatefulSet/DaemonSet/Job/CronJob/Service/Ingress/ConfigMap/Secret/PVC) |
| 리소스 범위 v1.1 | B안 — 관리자가 수동 등록한 CRD 지원 |
| Lifecycle | B안 — Versioned 템플릿, 릴리스는 버전에 pin (Helm/ArgoCD 방식) |
| 템플릿 저장소 | 앱 DB (MVP), Git 연동은 v2 |

## 기술 스택

| 영역 | 항목 | 결정 |
|------|------|------|
| Backend | 언어/프레임워크 | Go + Gin (or Echo) |
| Backend | k8s 클라이언트 | `client-go` |
| Backend | OIDC | `coreos/go-oidc` |
| Backend | DB | SQLite (dev) / Postgres (prod) |
| Backend | DB 마이그레이션 | `atlas` |
| Backend | 배포 | Docker image + Helm chart, **k8s Pod로 실행** |
| Frontend | 프레임워크 | **Next.js 15 (App Router)** |
| Frontend | 스타일 | Tailwind + shadcn/ui |
| Frontend | YAML 에디터 | Monaco (`dynamic import`) |
| Frontend | 폼 | React Hook Form + Zod |
| Frontend | OIDC | `openid-client` + httpOnly 쿠키 |
| Frontend | 배포 | Vercel |
| 통신 | 패턴 | **BFF** — Browser → Next.js Route Handler → Go API → k8s API |
| 레포 | 구성 | 단일 레포, `backend/` `frontend/` `deploy/` 분리 |

**아키텍처 경계 원칙**
- 비즈니스 로직은 Go 백엔드에만. Next.js Route Handler는 **"인증 쿠키 관리 + 얇은 프록시"** 역할만.
- 사용자 OIDC 토큰은 Next.js 서버 쿠키(httpOnly)에 저장, 브라우저 JS에서 접근 불가.
- Go 백엔드는 받은 토큰을 그대로 k8s API에 포워딩. RBAC 판정은 k8s가.

## 디렉터리 구조

```
kuberport/
├── CLAUDE.md                              ← 이 파일 (세션 진입점)
├── docs/
│   ├── brainstorming-summary.md           ← 브레인스토밍 결정 요약
│   ├── superpowers/
│   │   └── specs/                         ← 디자인 스펙 (다음 단계에 생성)
│   └── decisions/                         ← ADR (필요 시 생성)
```

## 작업 시 규칙

- **코드 스캐폴딩 금지**: 디자인 스펙 작성 + 사용자 승인 전까지 코드 파일 생성 금지 (`package.json`, `go.mod`, `src/` 등).
- **새 디자인 스펙**: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` 경로로 작성.
- **새 결정이 나오면**: `docs/brainstorming-summary.md`를 먼저 업데이트. 큰 결정은 `docs/decisions/`에 ADR 추가.
- **브레인스토밍 재개 시**: 이 파일과 `docs/brainstorming-summary.md`를 먼저 읽고 시작.

## 용어 (한국어 문서 기준)

- **템플릿(Template)** — 관리자가 만드는 k8s 리소스 청사진 (`resources.yaml` + `ui-spec.yaml` 한 쌍, 버전 관리됨).
- **릴리스(Release)** — 템플릿을 특정 값으로 실제 클러스터에 배포한 인스턴스.
- **관리자(Admin)** — 템플릿 작성자. k8s 숙련자 가정.
- **일반 사용자(User)** — 템플릿 소비자. k8s 지식 없을 수 있음.
- **ui-spec** — 템플릿의 어떤 경로를 사용자에게 어떤 이름/타입으로 노출할지 선언하는 오버레이.

## 남은 브레인스토밍 토픽

1. Visual Companion 사용 여부
2. 아키텍처 (컴포넌트, 데이터 흐름, 데이터 모델)
3. 기술 스택 (백엔드 / 프론트엔드 / DB)
4. UI 목업 (관리자 템플릿 에디터, 사용자 카탈로그 / 배포 폼 / 릴리스 상세)
5. 앱 자체의 배포 모델 (Helm chart? Docker compose? 단일 바이너리?)

## 레퍼런스 제품

- **Octopod** (오픈소스, Haskell) — 가장 가까운 레퍼런스. Helm 기반 셀프서비스 포털.
- **Backstage Software Templates** — 관리자가 JSON Schema로 템플릿 선언. 스캐폴딩 중심.
- **Rancher App Catalog / OpenShift Templates** — k8s 생태계 전통적 방식.
- **Crossplane Composition** — 추상 API → 실제 리소스 조립. 철학적으로 가장 유사.
- **k9s / Lens / Headlamp** — 운영 감각의 레퍼런스 (단, 이들은 모두 k8s 전문가용).
