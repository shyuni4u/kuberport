# OCI A1.Flex Capacity 자동 재시도

ADR 0003 Phase 2 (OCI Always Free A1.Flex 4 OCPU / 24GB) 인스턴스 확보용 cron 스크립트.
A1 capacity 가 항상 부족해서 콘솔 수동 클릭으로는 못 잡으므로, 15분 간격으로 launch 요청을
자동 반복하다가 잡히는 순간 인스턴스 생성 + Public IP 기록.

관련: [ADR 0003](decisions/0003-hosting-oci-always-free.md)

## 파일 위치

| 위치 | 용도 |
|------|------|
| `scripts/oci-capacity-retry/` | 버전 관리되는 스크립트 + 템플릿 (이 repo) |
| `~/oci-capacity-retry/` | 머신 로컬 — `config.env` (실제 OCID) + 로그 + state |
| `~/.oci/config` | OCI CLI 인증 (tenancy/user/region/key fingerprint) |
| `~/.oci/oci_api_key.pem` | OCI API private key (절대 commit 금지) |
| `~/.ssh/oci_kuberport(.pub)` | 인스턴스 SSH 키 (절대 commit 금지) |

## 새 머신에서 처음 세팅

전체 흐름: ① OCI CLI 설치 → ② OCI 콘솔에서 API key 등록 → ③ install.sh 실행.

### ① OCI CLI 설치

Ubuntu 24.04 (WSL/Linux):

```bash
sudo apt install -y pipx
pipx install oci-cli
pipx ensurepath
exec $SHELL
oci --version   # 3.x.x 확인
```

`pipx` 가 없으면 `sudo apt install pipx`. `python3-oci-cli` apt 패키지는 24.04 에 없음.

macOS:

```bash
brew install oci-cli
oci --version
```

### ② API Key 발급 + 콘솔 등록

WSL/Linux/macOS 공통:

```bash
oci setup config
```

대화형 프롬프트 답변:

| 프롬프트 | 답 |
|---|---|
| config 위치 | Enter (기본 `~/.oci/config`) |
| user OCID | OCI 콘솔 → Profile → My Profile → User information → OCID |
| tenancy OCID | OCI 콘솔 → Profile → Tenancy: <name> → OCID |
| region | `ap-chuncheon-1` (홈 리전 — 가입 시 한 번 정한 리전) |
| RSA key 생성? | `Y` |
| key 디렉터리 / 이름 | Enter (기본 `~/.oci/oci_api_key`) |
| **passphrase** | **`N/A`** ← cron 자동화용 (빈 입력은 거부됨, 반드시 `N/A` 타이핑) |

생성된 public key 를 콘솔에 등록:

1. OCI 콘솔 → Profile → My Profile → Resources → **API Keys**
2. **Add API Key** → "Paste a public key"
3. `cat ~/.oci/oci_api_key_public.pem` 결과 전체 (`-----BEGIN PUBLIC KEY-----` ~ `-----END PUBLIC KEY-----`) 붙여넣기
4. **Add** → fingerprint 가 `~/.oci/config` 의 `fingerprint=` 와 일치하는지 확인

검증:

```bash
oci iam region list --output table
```

리전 목록이 표 형식으로 떠야 정상.

### ③ SSH 키 준비

인스턴스 접속용 키 (이미 있으면 건너뜀):

```bash
ssh-keygen -t ed25519 -C "shyuniz@$(hostname)" -f ~/.ssh/oci_kuberport
# passphrase 는 본인 판단 — cron 자동화에는 영향 없음 (이 키는 launch 시점에 public 만 사용)
```

### ④ OCID 수집 + config.env 채우기

repo clone 후:

```bash
cd <repo>/scripts/oci-capacity-retry
./install.sh   # 첫 실행 — config.env 가 없어서 example 복사 + 안내 출력
```

`~/oci-capacity-retry/config.env` 가 만들어짐. 다음 4개 OCID 채워야 함:

```bash
# tenancy OCID — root compartment
OCI_COMPARTMENT_ID="$(grep '^tenancy=' ~/.oci/config | cut -d= -f2)"
echo "$OCI_COMPARTMENT_ID"

# Availability Domain 정식 이름 (한국 단일 AD)
oci iam availability-domain list --compartment-id "$OCI_COMPARTMENT_ID" \
  --query 'data[0].name' --raw-output

# Public subnet OCID (kuberport-vcn 의 public subnet — VCN Wizard 로 미리 생성되어 있어야 함)
oci network subnet list --compartment-id "$OCI_COMPARTMENT_ID" \
  --query "data[?contains(\"display-name\",'public')]|[0].id" --raw-output

# Ubuntu 24.04 Minimal aarch64 최신 이미지 OCID
oci compute image list --compartment-id "$OCI_COMPARTMENT_ID" \
  --operating-system "Canonical Ubuntu" \
  --operating-system-version "24.04 Minimal aarch64" \
  --shape VM.Standard.A1.Flex \
  --sort-by TIMECREATED --sort-order DESC --limit 1 \
  --query 'data[0].id' --raw-output
```

`vi ~/oci-capacity-retry/config.env` 로 위 4개 값을 `<TENANCY_OCID>` / `<AD_NAME>` /
`<SUBNET_OCID>` / `<IMAGE_OCID>` 자리에 붙여넣기.

> ⚠️ **VCN/Public Subnet 이 아직 없으면**: OCI 콘솔에서 Networking → Virtual Cloud Networks
> → **Start VCN Wizard** → "VCN with Internet Connectivity" → name `kuberport-vcn` →
> Create. 이게 한 번에 VCN + Public Subnet + Internet Gateway 까지 세팅. 이후 ④ 의
> subnet 조회가 결과를 돌려줌.

### ⑤ 검증 + cron 등록

```bash
# 한 번 수동 실행 — Out of capacity 응답이 정상으로 캡처되는지
~/oci-capacity-retry/retry.sh

# install.sh 다시 실행 → cron 등록 (config.env 검증 후)
cd <repo>/scripts/oci-capacity-retry
./install.sh

# 상태 확인
~/oci-capacity-retry/status.sh
```

`status.sh` 에 "⏳ 진행 중" 이 뜨면 정상. 15분마다 자동 시도. 잡히면 `~/oci-capacity-retry/SUCCESS`
와 `PUBLIC_IP` 파일이 생기고 그 이후 cron 호출은 즉시 no-op.

> 💡 **왜 15분인가?** 처음엔 5분으로 시작했으나 실측 결과 OCI launch API 의 rate-limit
> cool-down 이 5분보다 길어 4시간 동안 47/55 호출이 rate-limit 응답만 받음 (실효 시도율 3%).
> 15분 간격으로 cool-down 보다 충분히 길게 둬서 매 호출이 진짜 capacity 체크까지 도달하게 함.
> `hitrov/oci-arm-host-capacity` 도 같은 구간을 권장.

## 다른 머신에서 이어받기 (이전)

핵심: **OCI API 인증과 SSH 키만 옮기면 끝**. config.env 는 git pull 후 다시 채우면 되거나
같이 옮겨도 됨.

### 1. 옛 머신에서 cron 정지

두 머신이 동시에 launch 시도하면 경쟁이 일어나고 OCI rate limit 도 더 자주 걸림. 새 머신
세팅 직전에 옛 머신부터 끄기:

```bash
# 옛 머신
crontab -l | grep -v oci-capacity-retry | crontab -
crontab -l   # 등록 빠진 거 확인
```

### 2. 옛 머신에서 옮길 파일

| 파일 | 용도 | 옮기는 방법 |
|------|------|------|
| `~/.oci/config` | CLI 인증 설정 | `scp` 또는 1Password / Bitwarden 안전 채널 |
| `~/.oci/oci_api_key.pem` | API private key (passphrase 없음) | 위와 동일 — **외부 노출 금지** |
| `~/.oci/oci_api_key_public.pem` | API public key | 위와 동일 (없어도 동작은 함) |
| `~/.ssh/oci_kuberport` | 인스턴스 SSH private key | 위와 동일 |
| `~/.ssh/oci_kuberport.pub` | 인스턴스 SSH public key | 위와 동일 |
| `~/oci-capacity-retry/config.env` | OCID 모음 (재발급 안 해도 됨) | 옵션 — 재수집해도 1분이면 됨 |

대안: API key 와 SSH 키를 **새 머신에서 새로 생성**하고 콘솔에 등록하는 방식도 가능.
다만 콘솔에 키가 두 개 등록된 상태가 되니 옛 머신 키는 정리 (Profile → API Keys 에서 삭제,
SSH 는 인스턴스 생성 후 `~ubuntu/.ssh/authorized_keys` 에서 줄 삭제).

### 4. 옛 머신 정리 (보안 — 키 회수)

이전 후 옛 머신에 남은 자격 증명은 **반드시 삭제 또는 무효화**. 옛 머신을 다시 안 쓸 거면 더더욱.

```bash
# 옛 머신에서
shred -u ~/.oci/oci_api_key.pem ~/.oci/oci_api_key_public.pem 2>/dev/null \
  || rm -f ~/.oci/oci_api_key.pem ~/.oci/oci_api_key_public.pem
shred -u ~/.ssh/oci_kuberport ~/.ssh/oci_kuberport.pub 2>/dev/null \
  || rm -f ~/.ssh/oci_kuberport ~/.ssh/oci_kuberport.pub
rm -rf ~/oci-capacity-retry/   # config.env 도 함께 (OCID 자체가 비밀은 아니지만 깔끔)
```

OCI 콘솔에서도 옛 머신의 API key 삭제 (새 머신에서 새 키 만들었거나, 옛 머신을 재활용 안 할
경우):

1. Profile → My Profile → Resources → **API Keys**
2. 옛 머신 fingerprint 행 (`~/.oci/config` 의 fingerprint 참고) → ⋮ → **Delete**
3. 새 머신의 fingerprint 만 남았는지 확인

인스턴스 SSH `authorized_keys` 정리 (인스턴스 생성 후, 새 머신 SSH 로 들어가서):

```bash
ssh -i ~/.ssh/oci_kuberport ubuntu@$(cat ~/oci-capacity-retry/PUBLIC_IP)
# 인스턴스 안에서
vi ~/.ssh/authorized_keys   # 옛 머신 host 가 들어간 줄 삭제
```

### 3. 새 머신 세팅

```bash
# OCI CLI 설치 (위 ① 단계 참조)
sudo apt install -y pipx && pipx install oci-cli && pipx ensurepath && exec $SHELL

# .oci 디렉터리 권한 정리
mkdir -p ~/.oci ~/.ssh
chmod 700 ~/.oci ~/.ssh
# (옛 머신에서 받은 파일들을 ~/.oci/ 와 ~/.ssh/ 에 배치)
chmod 600 ~/.oci/oci_api_key.pem ~/.oci/config ~/.ssh/oci_kuberport
chmod 644 ~/.oci/oci_api_key_public.pem ~/.ssh/oci_kuberport.pub 2>/dev/null

# 인증 검증
oci iam region list --output table

# repo clone 후 install
git clone https://github.com/shyuni4u/kuberport.git
cd kuberport/scripts/oci-capacity-retry

# config.env 도 옮겼으면 ~/oci-capacity-retry/ 에 미리 두고 install.sh
mkdir -p ~/oci-capacity-retry
cp /path/to/old-config.env ~/oci-capacity-retry/config.env  # 옮긴 경우만

./install.sh   # config.env 없으면 example 복사 + 편집 안내
# config.env 채워졌으면 cron 등록까지 한 번에

~/oci-capacity-retry/status.sh   # 검증
```

## 모니터링

```bash
~/oci-capacity-retry/status.sh           # 한눈에 — 시도 횟수 / 마지막 FD / 성공 여부
tail -f ~/oci-capacity-retry/retry.log   # 실시간 로그
journalctl -u cron --since "1 hour ago" | grep retry.sh   # cron 호출 이력
```

성공 시 `SUCCESS` 파일에 instance OCID, `PUBLIC_IP` 에 공인 IP 가 기록됨. 그 후:

```bash
ssh -i ~/.ssh/oci_kuberport ubuntu@$(cat ~/oci-capacity-retry/PUBLIC_IP)
```

## 트러블슈팅

| 증상 | 원인 / 해결 |
|------|------|
| `NotAuthenticated` | `~/.oci/config` 의 user/tenancy/region/fingerprint 와 콘솔 Profile API Keys 의 fingerprint 가 안 맞음. setup 다시 |
| `TooManyRequests` 가 모든 호출에서 발생 | OCI rate-limit cool-down 이 cron 간격보다 김. 처음엔 5분 → **15분 으로 늘려야** 회피됨 (위 "왜 15분인가?" 참조). `crontab -e` 에서 `*/5` → `*/15` 변경 또는 install.sh 재실행 |
| `LimitExceeded ... service limit` | Always Free 한도 (4 OCPU / 24 GB / 200GB block) 초과. config.env 의 OCPU/메모리/볼륨 확인 |
| `Out of host capacity` 만 계속 | 정상 — 며칠~몇 주 걸릴 수 있음. WSL/머신 켜둔 채 기다림 |
| `bash: oci: command not found` (대화형 셸에서) | `pipx ensurepath` 후 `exec $SHELL` 안 함. 새 셸 열기 |
| `oci: command not found` (cron 로그에만) | cron 의 minimal PATH 가 `~/.local/bin` 미포함. retry.sh 가 자체 PATH 보강하므로 이 에러는 retry.sh 의 PATH 라인이 누락된 옛 버전을 쓰는 경우만 발생. `cp scripts/oci-capacity-retry/retry.sh ~/oci-capacity-retry/` 로 갱신 |
| `state` 가 항상 같은 FD 만 시도 | 스크립트 권한 문제로 state 파일 못 씀. `chmod 755 retry.sh && chmod 666 ~/oci-capacity-retry/state` |
| WSL 종료 후 cron 안 돌음 | WSL 은 모든 터미널 닫히면 셧다운. 터미널 하나 열어두거나 GCP Phase 1 VM 으로 cron 이전 |

## 잡힌 후 — 정리

```bash
# cron 제거
crontab -l | grep -v oci-capacity-retry | crontab -

# (선택) 로컬 파일 보존 또는 삭제
# 보존하면 인스턴스 잃었을 때 재시도 인프라 그대로 재활용 가능
ls ~/oci-capacity-retry/
```

⚠️ **인스턴스는 절대 종료/재생성 금지** (ADR 0003 §"Consequences" 참조). 한 번 잡으면
다시 못 잡을 수 있음. 운영 중 문제는 reboot 만, 재배포는 같은 VM 위에 `helm upgrade`.

idle reclaim (7일 CPU 95p < 20% AND network < 20% AND memory < 20%) 회피용 외부 ping
세팅도 잊지 말 것 — 별도 작업 (ADR 0003 §"실행 체크리스트 — Phase 2" 참조).
