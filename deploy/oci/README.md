# OCI Phase 2 — kuberport 부트스트랩 절차

ADR 0003 §"Phase 2 — Target (OCI Always Free A1.Flex)" 실행 가이드. Plan 10 의 사용자용 부분.

## 사전 준비

- [ ] OCI VM 확보: `VM.Standard.A1.Flex`, 4 OCPU / 24 GB, Ubuntu 24.04 ARM, Public IP 안정 (reserved 권장)
- [ ] OCI Security List inbound: 80, 443, 22 허용 (SSH 는 본인 IP 만 권장)
- [ ] SSH 키 (`~/.ssh/oci_kuberport`) 로 `ubuntu@<public-ip>` 접속 가능
- [ ] 도메인 보유 (예: Godaddy `<host>.example`)
- [ ] Google Cloud Console 접근 (OAuth client 발급용)

## 1. VM 시스템 부트스트랩

로컬에서:

```bash
scp -i ~/.ssh/oci_kuberport deploy/oci/bootstrap.sh ubuntu@<public-ip>:~
ssh -i ~/.ssh/oci_kuberport ubuntu@<public-ip>
sudo BOOTSTRAP_EMAIL=you@example.com bash bootstrap.sh
```

이게 처리하는 것:
- iptables 80/443 열기 + persist
- k3s single-node 설치
- helm CLI
- cert-manager + Let's Encrypt ClusterIssuer (`letsencrypt-prod`)

스크립트는 idempotent — 다시 돌려도 안전.

## 2. Godaddy DNS A 레코드

Godaddy 콘솔 → My Products → DNS → 해당 도메인 → DNS Records:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `kuberport` (또는 원하는 sub) | `<vm-public-ip>` | 600 (10분) |

검증 (로컬에서):

```bash
dig +short kuberport.example.com
# → <vm-public-ip>
```

전파에 2~5분.

## 3. Google OAuth Client 발급

1. https://console.cloud.google.com/apis/credentials → 별도 GCP 프로젝트 1개 만들기 (무료, 청구 불필요)
2. **OAuth consent screen** 먼저 셋업:
   - User type: External
   - App name: `kuberport`
   - User support email: 본인
   - Authorized domains: 사용할 도메인 추가 (예: `example.com`)
   - Test users: 본인 + 동료들 이메일 추가 (publish 안 해도 100명 한도 내 동작)
3. **Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `kuberport-prod`
   - Authorized JavaScript origins: `https://<host>`
   - Authorized redirect URIs: `https://<host>/api/auth/callback`
4. 발급된 **Client ID** + **Client secret** 을 password manager 에 저장. **절대 git/Slack/Notion 평문 금지.**

## 4. 첫 `helm install`

VM 안에서 (`ssh ubuntu@<public-ip>`). 먼저 리포 클론 (또는 chart 만 scp):

```bash
git clone https://github.com/shyuni4u/kuberport.git
cd kuberport
```

값 생성 + install:

```bash
# 한 번 생성하고 password manager 에 저장 — 절대 분실 금지
ENC_KEY=$(openssl rand -base64 32)
PG_PASS=$(openssl rand -hex 24)

HOST=kuberport.example.com               # 사용한 도메인
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

helm install kuberport deploy/helm/kuberport \
  -f deploy/helm/kuberport/values-oci-phase2.yaml \
  --namespace kuberport --create-namespace \
  --set host="$HOST" \
  --set oidc.clientId="$GOOGLE_CLIENT_ID" \
  --set auth.appEncryptionKeyB64="$ENC_KEY" \
  --set auth.oidcClientSecret="$GOOGLE_CLIENT_SECRET" \
  --set postgres.password="$PG_PASS"
```

진행 상황 모니터링:

```bash
kubectl get pods -n kuberport -w
# postgres-0, kuberport-backend-..., kuberport-frontend-... 모두 Running 까지 5~10분
```

인증서 발급 (Let's Encrypt HTTP-01 challenge):

```bash
kubectl get certificate -n kuberport -w
# READY=True 가 되면 발급 완료 (2~5분)

# 디버깅이 필요하면:
kubectl describe certificate -n kuberport
kubectl describe order -n kuberport
kubectl describe challenge -n kuberport
```

DNS 가 전파 안 됐거나 80번 포트 차단되어 있으면 challenge 가 실패함. 그 경우 DNS dig + `curl -v http://<host>` 부터 확인.

## 5. 첫 로그인 확인

브라우저에서 `https://<host>` → Google OAuth → `/catalog` 도달 + 빈 상태 메시지. 끝.

## 6. 운영 셋업 (첫 주 내)

### 6.1. 외부 health ping (idle reclaim 회피)

OCI Always Free 정책상 7일간 CPU 95p < 20% AND network < 20% AND memory < 20% 셋 모두 충족하면 인스턴스가 자동 종료 대상. 외부에서 주기적 ping 으로 CPU/network 를 살린다.

**옵션 A: UptimeRobot 무료**
- https://uptimerobot.com 회원가입
- New monitor → HTTP(s) → URL: `https://<host>` (또는 backend `/healthz` 노출되면 그쪽)
- Interval: 5분 (무료 한도 안)

**옵션 B: GitHub Actions schedule**
이 리포 안에 `.github/workflows/uptime-ping.yml` 추가 (별도 PR — 본 가이드 범위 밖).

### 6.2. Boot Volume backup policy

OCI 콘솔 → Compute → Instances → `kuberport` → 좌측 Resources → **Boot volume** 클릭 → **Backup policy** → Edit → **Bronze** (주간, 4주 보존, Always Free 한도 내).

이게 boot volume 뿐 아니라 local-path PVC 가 거기 안에 있으므로 Postgres 데이터도 같이 보존.

### 6.3. (선택) `pg_dump` 일일 cron + 외부 복제

본 플랜 범위 밖. 일주일 운영 후 데이터 양 보고 결정. 옵션:
- VM 안 cron + Cloudflare R2 (S3 호환) 무료 10 GB
- 또는 OCI Object Storage Always Free 10 GB + Cloudflare R2 이중 복제 (OCI 계정 정지 헤지)

## Upgrade

이미지 태그 갱신 시:

```bash
helm upgrade kuberport deploy/helm/kuberport \
  -f deploy/helm/kuberport/values-oci-phase2.yaml \
  --namespace kuberport \
  --reuse-values \
  --set images.backend.tag=$NEW_SHA \
  --set images.frontend.tag=$NEW_SHA
```

`--reuse-values` 가 첫 install 의 secret 들을 유지. backend Pod 의 `migrate` initContainer 가 매번 `atlas schema apply` 를 다시 돌리므로 schema 변경도 자동 반영.

## Troubleshooting

| 증상 | 원인 / 확인 |
|---|---|
| `kubectl get pods -n kuberport` 가 Pending | k3s 가 아직 Ready 아님. `sudo systemctl status k3s` |
| backend / frontend CrashLoop | `kubectl logs -n kuberport <pod>` — 대개 OIDC issuer 발견 실패 (DNS) 또는 DB connection (postgres-0 미준비) |
| Certificate stuck Issuing | `kubectl describe challenge -n kuberport` — 대부분 DNS 미전파 또는 80번 차단 (iptables 또는 OCI Security List) |
| 브라우저에서 `ERR_CERT_AUTHORITY_INVALID` | cert 가 staging issuer 로 발급된 경우. `letsencrypt-prod` 사용 확인 |
| Google OAuth `redirect_uri_mismatch` | console.cloud.google.com 의 Authorized redirect URI 가 정확히 `https://<host>/api/auth/callback` 인지 확인 (trailing slash 없음) |

## See also

- [Plan 10 — OCI Phase 2 직행 부트스트랩](../../docs/superpowers/plans/2026-06-24-plan10-oci-phase2-bootstrap.md)
- [ADR 0003 — Hosting decision tree](../../docs/decisions/0003-hosting-oci-always-free.md)
- [Helm chart README](../helm/kuberport/README.md)
