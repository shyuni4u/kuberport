# ADR 0003: 파일럿 호스팅을 GCP 90일 무료 크레딧으로 (정식 운영 전 단계)

| | |
|---|---|
| 날짜 | 2026-04-20 |
| 상태 | Proposed |
| 관련 | [ADR 0002](0002-production-hosting-hetzner-k3s.md) (정식 운영 = Hetzner + k3s) |

## Context

Plan 0–5 로 MVP 기능이 완성됐다. 다음 목표는 **동료 소수(5~10명) 에게 실제 URL 을 주고 피드백을 받는 것**이다.
ADR 0002 는 장기 운영 환경을 Hetzner CAX21 (ARM) + k3s 로 고정했지만, 피드백 단계에서는 몇 가지가 다르다:

- **기간이 짧다** — 1~3 개월 파일럿 후 수정 루프. 장기 계약은 오버.
- **규모가 작다** — 동시 접속 10 명 미만, 리소스 요구가 최소.
- **일회성 실수 허용** — VM 을 쉽게 버리고 다시 만들 수 있어야 함.
- **지역성 덜 중요** — 개발 동료가 한국/일본권이면 레이턴시는 덜 이슈. 어차피 파일럿.

이 단계에 ADR 0002 의 €7/월 Hetzner 를 바로 붙이는 것은 **비용 문제는 아니지만, 세팅을 두 번 하게 될 위험**이 있다. 파일럿에서 배우는 것을 정식에 반영해야 하므로, 정식 인프라 세팅은 피드백 반영 후가 맞다.

후보:

| 후보 | 파일럿 비용 (60~90일) | 평가 |
|---|---|---|
| GCP **Always Free** `e2-micro` (1 vCPU / 1GB / 30GB) | $0 영구 | ❌ k3s + Postgres + Go + Next.js 동시 기동 시 RAM 부족. OOM 위험. |
| GCP **90일 $300 크레딧** + `e2-medium` (2 vCPU / 4GB) | $0 (크레딧 내) | ✅ 파일럿 규모에 충분. 90일이면 피드백 + 수정 루프 커버. |
| GCP 90일 $300 + GKE Autopilot | 수일 내 크레딧 빠르게 소진 | △ 매니지드 k8s 편하나 per-pod 과금 + 관리 fee. 학습·감사 목적 외엔 과잉. |
| ADR 0002 (Hetzner CAX21) 바로 | €7/월 | △ 저렴하나 세팅 두 번. 또 ARM 이미지 빌드 설정이 아직 안 되어 있음. |
| 로컬 `ngrok` / Tailscale Funnel | $0 | ❌ 동료가 접근 가능하나 내가 노트북 켜야 접속됨. 공개 URL 아님. |

## Decision

**파일럿 단계(첫 60~90일)는 GCP 90일 무료 크레딧 + `e2-medium` VM + k3s 로 운영한다. 크레딧 소진 또는 피드백 반영 종료 시 ADR 0002 의 Hetzner CAX21 로 이전한다.**

이는 ADR 0002 를 뒤집는 결정이 아니다. ADR 0002 는 **장기 운영**을 다루고, 이 ADR 은 그 **직전 파일럿 단계**를 다룬다.

### 구체 스택 (파일럿)

| 레이어 | 선택 | 비고 |
|---|---|---|
| 계정 | Google Cloud 90일 무료 크레딧 ($300) | 카드 등록 필요, 크레딧 소진 전에는 자동 과금 없음 |
| VM | GCP `e2-medium` (2 vCPU / 4GB RAM / 30GB pd-balanced) | x86_64. 리전은 `asia-northeast3` (서울) 또는 `us-central1` (크레딧 절약) |
| OS | Ubuntu 24.04 LTS | |
| k8s | **k3s** (single-node) — ADR 0002 와 동일 | Helm chart 재사용 가능 |
| TLS | cert-manager + Let's Encrypt (HTTP-01) | |
| DNS | Cloudflare 무료 티어 | A 레코드 → GCP VM 외부 IP |
| 이미지 | `ghcr.io`, **`linux/amd64 + linux/arm64` 멀티아치** | Hetzner 이전 시 zero-touch |
| CD | GitHub Actions → ssh → `helm upgrade` | ADR 0002 와 동일. VM IP 만 시크릿에서 바꿈 |
| Postgres | in-cluster StatefulSet (pd-balanced PV) | 파일럿 데이터는 휘발 가능 |
| OIDC | Google OAuth (workspace 이메일) | 파일럿 단계에 가장 간단 |

### 예상 비용

- 크레딧 내 운영: **$0**
- 예상 소진 속도: e2-medium + 30GB disk + 소량 egress = 월 $25~35 → 90일 크레딧 ($300) 로 9~12 개월도 가능하나 **만료 시점 = 90일** 이 하드캡
- 도메인: 연 ~$12 (별도)

### 이전 트리거 (GCP → Hetzner)

아래 중 먼저 도달하는 것:

1. **GCP 90일 크레딧 만료 30일 전** — 여유를 두고 이전
2. **파일럿 피드백 반영 완료** + 정식 공개 결정 — 장기 운영으로 승격
3. **GCP 에서 해결 불가한 이슈** — 리전/네트워크 장애, 정책 위반 경고 등

## Consequences

### 긍정적

- **파일럿 기간 호스팅 비용 $0** — 크레딧 소진 우려 작음.
- **ADR 0002 와 스택이 거의 동일** (k3s / cert-manager / GitHub Actions CD / Postgres StatefulSet) — 이전 시 Helm values 만 조정.
- **서울 리전 선택 가능** — 한국/일본 동료 레이턴시 양호 (ping ~30ms).
- **멀티아치 이미지 빌드를 이 시점에 강제** — ADR 0002 에서 "필요 시" 로만 언급됐던 arm64+amd64 빌드가 파일럿 단계에서 **필수** 가 되므로, Hetzner 이전 시 이미지 쪽 작업이 0.
- **버리기 쉬움** — VM 터미네이트 후 재생성 5분. 파일럿 중 실험에 적합.

### 부정적

- **세팅이 사실상 두 번** — GCP 에서 도메인/IP/시크릿 세팅 후, Hetzner 로 이전할 때 재세팅. 완화책:
  - Helm chart 는 클라우드 중립적 설계 (Ingress class, StorageClass 만 values 에서 분기)
  - Terraform 또는 `cloud-init` 스크립트로 VM 프로비저닝 자동화 → 재실행이 값 싸짐
  - DNS 는 Cloudflare 에서 A 레코드 IP 만 바꾸면 됨 (TTL 5분)
- **크레딧 만료 = 강제 마이그레이션** — 90일 타임박스. 완화책: 만료 30일 전 알림 캘린더 등록, ADR 0002 실행은 그 이전에.
- **카드 등록 필요** — 크레딧 소진 후 자동 과금될 수 있음. 완화책:
  - GCP 콘솔에서 **알림 + 예산 한도 ($1)** 설정
  - 만료 전 VM 셧다운·프로젝트 삭제로 과금 차단
- **x86_64 VM + arm64 Hetzner 양쪽 테스트 필요** — 멀티아치 빌드가 실제 두 아키에서 뜨는지 주기적으로 검증.

### 중립

- 로컬 dev 환경은 이 결정과 무관. docker-compose + kind 그대로.
- 파일럿에 쓸 dex / Google OAuth 선택은 별도 이슈 — 동료가 Google Workspace 도메인이면 Google OAuth 로 `groups` claim 처리, 아니면 dex + 실제 upstream (GitHub OAuth 등).

## 실행 체크리스트 (이 ADR 이 Accepted 된 후)

- [ ] GCP 계정 + 90일 무료 크레딧 활성화
- [ ] GCP 예산 알림 ($1 한도) 설정 → 자동 과금 방지
- [ ] `e2-medium` VM 프로비저닝 (Ubuntu 24.04, `asia-northeast3`)
- [ ] 도메인 + Cloudflare DNS 연결 (A 레코드)
- [ ] 이미지 빌드 파이프라인을 **multi-arch (amd64 + arm64)** 로 전환 — GitHub Actions `docker/build-push-action` 의 `platforms: linux/amd64,linux/arm64`
- [ ] Helm chart 작성 (별도 플랜) + GCP VM 에 `helm upgrade`
- [ ] Google OAuth (또는 dex + upstream) 설정
- [ ] 동료에게 URL 공유 + `docs/qa-checklist.md` 복사본으로 피드백 요청
- [ ] 크레딧 만료 30일 전 → ADR 0002 실행 플랜 착수

## 영향 받는 문서

- `CLAUDE.md` — 기술 스택 표의 "운영 호스팅" 항목에 "파일럿: GCP 90일 크레딧 → 정식: Hetzner" 주석 추가
- `docs/brainstorming-summary.md` — §11 호스팅 섹션에 파일럿 단계 추가
- 미래 Helm chart 플랜 — 클라우드 중립 설계를 명시적으로 요구 (Ingress class, StorageClass 를 values 분기)
