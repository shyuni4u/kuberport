# ADR 0003: 호스팅을 OCI Always Free (ARM Ampere) 단일 노드로 (파일럿 + 장기 운영)

| | |
|---|---|
| 날짜 | 2026-04-26 |
| 상태 | Accepted (supersedes ADR 0002) |
| 관련 | [ADR 0001](0001-frontend-deployment-helm-over-vercel.md) (Helm chart 통합 배포), [ADR 0002](0002-production-hosting-hetzner-k3s.md) (Hetzner — superseded) |

> **이력 메모**: 본 ADR 의 초안(2026-04-20, status=Proposed)은 GCP 90일 무료 크레딧 + `e2-medium` 으로 파일럿 단계만을 다뤘다. 그 시점엔 OCI 계정을 받지 못해 ADR 0002 도 OCI 를 후보에서 제외했다. 2026-04-26 OCI 계정이 활성화되면서 Always Free ARM Ampere (4 OCPU / 24GB) 가 실효 옵션이 됐고, 사양·비용·기간 모두에서 GCP 파일럿과 Hetzner 장기 운영을 동시에 대체할 수 있어 in-place 로 재작성한다 (ADR 0002 는 Superseded 표기, 본문 보존).

## Context

kuberport 를 **동료 5~10 명 피드백 단계 + 그 이후 장기 운영**까지 단일 환경에서 돌리고자 한다. 두 단계를 따로 세팅하는 비용 (도메인·DNS·이미지 파이프라인·백업 절차 두 번) 을 피하려면, 파일럿에 충분하면서 장기 운영에도 견딜 수 있는 호스팅이어야 한다.

요구사항:

- **공개 https** 접근 가능 — 로컬 전용은 탈락
- **장기(수년) 운영 비용** 이 hobby 예산 (월 ₩10,000 이내) 안
- **k3s + Postgres + Go API + Next.js** 동시 기동을 견디는 RAM (실측 4GB 여유 필요)
- **ARM 또는 x86 무관** — Helm chart 가 클라우드 중립적이어야 하므로 멀티아치 빌드 전제
- **세팅 1회** — 파일럿/장기 환경을 따로 만들지 않음

후보 (2026-04-26 시점):

| 후보 | 월 비용 | 사양 | 평가 |
|---|---|---|---|
| **OCI Always Free ARM Ampere (A1.Flex)** | **$0 영구** | **4 OCPU / 24GB / 200GB block** | ✅ **채택**. 단일 옵션으로 파일럿+장기 모두 커버 |
| Hetzner CAX21 (ADR 0002) | €7/월 (≈₩10,000) | 4 vCPU ARM / 8GB / 80GB | △ 안정성·예측가능성 우수하나 OCI 가 무료 + 사양 3배. OCI 리스크 현실화 시 fallback |
| GCP 90일 크레딧 + e2-medium | $0 (90일 한정) → $25~35/월 | 2 vCPU x86 / 4GB | ❌ 90일 하드캡, 만료 후 hobby 예산 초과. 본 ADR 초안의 결정이었으나 OCI 가 활성화되면서 무의미 |
| OCI Always Free x86 (E2.1.Micro ×2) | $0 영구 | 1c / 1GB ×2 | ❌ k3s + Postgres + 앱 동시 기동 시 OOM |
| Civo / DigitalOcean Managed K8s | $25~35/월 | 매니지드 control plane | ❌ hobby 예산 초과 |

## Decision

**파일럿과 장기 운영 모두 OCI Always Free ARM Ampere (`VM.Standard.A1.Flex`, 4 OCPU / 24GB / 200GB) + k3s 단일 노드로 운영한다.**

ADR 0002 (Hetzner) 는 Superseded 처리하지만 **fallback 옵션으로 본문은 보존**한다 — OCI Always Free 의 알려진 리스크 (account reclaim, ARM capacity 부족, 정책 위반 강제 종료) 가 현실화될 경우 €7/월에 즉시 이전할 수 있는 경로로 의미가 있다.

### 구체 스택

| 레이어 | 선택 | 비고 |
|---|---|---|
| 계정 | Oracle Cloud Always Free | 카드 등록 필요(verification only). 영구 무료, 자동 과금은 Pay-As-You-Go 업그레이드 시에만 |
| VM | **`VM.Standard.A1.Flex`** (Ampere ARM, 4 OCPU / 24GB) | Always Free 최대 한도. 단일 인스턴스로 사용 (한도 자체는 OCPU 4 / RAM 24GB 합계라 분할도 가능하나 단일이 운영 단순) |
| 부팅 볼륨 | 100GB block (Always Free 한도 200GB 중 절반) | 나머지 100GB 는 future Postgres PV 용 여유 |
| 리전 | `ap-chuncheon-1` (춘천) 또는 `ap-seoul-1` 우선, 부족 시 가까운 차순위 | A1 capacity 부족 이슈가 잦아 **여러 리전 회전** 필요할 수 있음. 한국 리전이 안 잡히면 `ap-tokyo-1` 으로 |
| OS | Ubuntu 24.04 LTS (ARM) | OCI 공식 이미지 |
| k8s | **k3s** (single-node) — ADR 0002 와 동일 | Helm chart 그대로 재사용 |
| TLS | cert-manager + Let's Encrypt (HTTP-01 challenge) | 무료. OCI Security List 에 80/443 인그레스 허용 필요 |
| DNS | Cloudflare 무료 티어 | A 레코드 → OCI VM 공인 IP. 선택적으로 proxy 모드로 DDoS/봇 완화 |
| 컨테이너 레지스트리 | GitHub Container Registry (`ghcr.io`) | 무료 |
| 이미지 아키텍처 | **`linux/arm64`** (필요 시 amd64 멀티아치) | OCI A1 = ARM Ampere, 로컬 dev 가 x86 라면 멀티아치. ADR 0002 와 같은 요구 |
| CI | GitHub Actions | 무료 (private repo 월 2000분) |
| CD 초기 | GitHub Actions → ssh → `helm upgrade` | OCI VM 공인 IP 를 시크릿에 저장. ADR 0002 와 동일 패턴 |
| CD 장기 | ArgoCD (k3s 내부 pull 기반 GitOps) | 클러스터 API 외부 노출 없이 배포 |
| Postgres | 초기 in-cluster StatefulSet (`local-path` PV) | 데이터 중요해지면 OCI Block Volume + 별도 백업 (`pg_dump` → OCI Object Storage 무료 10GB) |
| OIDC | Google OAuth 또는 dex Pod 자가호스팅 | 별도 ADR 예정 |

### 예상 월 고정비

- VM: $0 (Always Free)
- Block storage: $0 (Always Free 200GB 한도 내)
- Egress: $0 (Always Free 월 10TB outbound)
- Object Storage 백업: $0 (Always Free 10GB)
- 도메인: 연 $10~15 (`.dev` 또는 `.app`), 월로 나누면 $1
- **합계: 약 $1/월 (≈₩1,500), 도메인만**

## Consequences

### 긍정적

- **호스팅 비용 사실상 $0 영구** — Hetzner 대비 €7/월 절감 + 크레딧 만료 같은 하드캡 없음
- **사양 3배** (24GB vs 8GB, 4 OCPU 동등) — 향후 ArgoCD / Prometheus / Loki 같은 보조 스택 동시 기동 여유 충분
- **세팅 1회** — 파일럿→장기 이전이 없으므로 도메인·DNS·이미지·백업 절차를 한 번만 셋업
- **ADR 0002 의 ARM 설계가 그대로 유효** — 이미지 아키텍처(`linux/arm64`), Helm chart, k3s, cert-manager 전부 재사용. 이행 비용 거의 0
- **백업 인프라 무료** — OCI Object Storage Always Free 10GB 로 `pg_dump` 외부 백업 가능 (Hetzner 는 별도 비용)
- **kuberport 자체가 "첫 번째 자기 앱"** — ArgoCD 가 설치한 릴리스를 kuberport UI 로 조회/관리하는 dogfooding 구조 유지

### 부정적

- **OCI Always Free 정책 리스크** — 다음 이벤트가 알려져 있음:
  - **A1 capacity 부족** — 인기 리전에서 신규 인스턴스 생성이 며칠~몇 주 막힐 수 있음. 완화: 여러 리전 시도, 일단 잡히면 절대 종료/재생성 금지
  - **idle reclaim** — Always Free 인스턴스가 7일간 CPU 5% 미만이면 강제 종료될 수 있음 (공식 정책). kuberport 는 항상 트래픽이 있으므로 일반적으로 비해당, 다만 파일럿 초기에 사용자 0 일 때는 cron 으로 self-ping
  - **계정 정지** — 결제 분쟁/약관 위반 시 사전 통보 짧음. 완화: `pg_dump` 가 매일 OCI Object Storage 외부에도 복제(Cloudflare R2 등 제2 백업)
  - **Pay-As-You-Go 업그레이드 시 자동 과금** — Always Free 모드 유지 확인 필수
- **단일 노드 SPOF** — VM 이 죽으면 서비스 전체 다운. 완화책 (ADR 0002 와 동일):
  - OCI Boot Volume 백업 (정책 단위 자동화)
  - `pg_dump` 일일 cron → Object Storage
  - 장기적으로 동일 OCI 계정 내 두 번째 A1 인스턴스로 2노드 k3s HA 확장 (Always Free 한도 내)
- **EU 리전 미선택 시 한국 capacity 의존** — 춘천/서울 리전이 막히면 도쿄로 대체, 레이턴시 +30ms
- **OCI 콘솔/API UX** — AWS/GCP 대비 거칠다는 평. 운영 학습 비용 약간 추가
- **카드 등록 필요** — Always Free 계정이라도 verification 차원. 완화: 카드 한도 낮은 계좌 사용

### 중립

- 로컬 dev 환경은 이 결정과 무관. docker-compose + kind 그대로
- ADR 0002 (Hetzner) 본문은 fallback 옵션으로 보존. 위 리스크가 현실화되면 즉시 €7/월에 이전 가능
- ADR 0002 본문에 있던 "k3s 특수성" (Ingress class = `traefik`, `LoadBalancer` 가 호스트 포트 점유, `local-path` 기본 StorageClass) 는 OCI 에서도 동일하게 적용

## OCI fallback → Hetzner 트리거

다음 중 하나라도 발생하면 ADR 0002 (Hetzner) 로 즉시 이전:

1. **A1 인스턴스가 강제 종료** 되고 24시간 이상 재생성 불가
2. **OCI 계정이 정지** 되거나 정책상 kuberport 워크로드가 거부됨
3. **운영 중 알려지지 않은 OCI 정책 변경** — Always Free 한도 축소 등

이전이 zero-touch 에 가깝게 되도록:

- Helm chart 는 클라우드 중립 (Ingress class, StorageClass 만 values 분기)
- Terraform 또는 `cloud-init` 으로 VM 프로비저닝 자동화 (재실행이 값쌈)
- DNS 는 Cloudflare A 레코드 IP 만 바꿈 (TTL 5분)
- Postgres 백업이 OCI 외부 스토리지에도 일일 복제

## 실행 체크리스트 (이 ADR 이 Accepted 된 후)

- [ ] OCI 계정 verification (카드 등록, Always Free 모드 확인)
- [ ] `VM.Standard.A1.Flex` (4 OCPU / 24GB / 100GB boot) 프로비저닝 — `ap-chuncheon-1` 우선, 부족 시 차순위
- [ ] Security List 80/443 인그레스 + SSH 22 (소스 IP 제한) 허용
- [ ] k3s install + Traefik Ingress 동작 확인
- [ ] 도메인 + Cloudflare A 레코드 연결
- [ ] cert-manager + Let's Encrypt HTTP-01 발급 확인
- [ ] 이미지 빌드 파이프라인 `linux/arm64` (필요 시 + amd64 멀티아치)
- [ ] Helm chart 작성 (별도 플랜) + OCI VM 에 `helm upgrade`
- [ ] Postgres StatefulSet + 일일 `pg_dump` cron → OCI Object Storage
- [ ] **백업 외부 복제** (Cloudflare R2 또는 Hetzner Storage Box) — OCI 정지 리스크 헤지
- [ ] OIDC (Google OAuth 또는 dex) 설정
- [ ] 동료에게 URL 공유 + `docs/qa-checklist.md` 복사본으로 피드백 요청
- [ ] OCI fallback 트리거 모니터링 cron (인스턴스 health, 계정 상태)

## 영향 받는 문서

- `CLAUDE.md` — 기술 스택 표의 "운영 호스팅" 행을 OCI A1.Flex 로 갱신, ADR 참조 0002 → 0003
- `docs/brainstorming-summary.md` — §11 호스팅 섹션을 OCI 기반으로 재작성, "Oracle Cloud Always Free 사용 불가" 노트 제거
- `docs/decisions/0002-production-hosting-hetzner-k3s.md` — header status 를 `Superseded by ADR 0003` 으로 표기 (본문 보존)
- 미래 Helm chart 플랜 — 클라우드 중립 설계 명시 (Ingress class, StorageClass 를 values 분기), 이는 OCI/Hetzner 양쪽 동작 보장
