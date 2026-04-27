#!/usr/bin/env bash
# OCI capacity retry — 새 머신 설치 헬퍼.
#
# 전제: OCI CLI 설치 완료, ~/.oci/config 작성 완료, ~/.ssh/oci_kuberport(.pub) 존재.
# 자세한 사전 작업은 docs/oci-capacity-retry.md 참조.
#
# 동작:
#   1. ~/oci-capacity-retry/ 디렉터리 생성
#   2. retry.sh / status.sh / config.env.example 복사
#   3. config.env 가 없으면 example 을 복사하고 편집 안내
#   4. cron 항목 등록 (5분 간격, 중복 방지)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$HOME/oci-capacity-retry"

echo "[0/4] 사전 조건 검증"
missing=()
command -v oci >/dev/null 2>&1 || missing+=("oci CLI")
[[ -f "$HOME/.oci/config" ]] || missing+=("~/.oci/config")
[[ -f "$HOME/.oci/oci_api_key.pem" ]] || missing+=("~/.oci/oci_api_key.pem")
[[ -f "$HOME/.ssh/oci_kuberport.pub" ]] || missing+=("~/.ssh/oci_kuberport.pub")
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "  ❌ 누락: ${missing[*]}"
  echo "  → docs/oci-capacity-retry.md '새 머신에서 처음 세팅' 섹션 참조"
  exit 1
fi
echo "  ✅ oci CLI / config / API key / SSH 키 모두 확인"

echo "[1/4] 디렉터리 생성 → $TARGET_DIR"
mkdir -p "$TARGET_DIR"

echo "[2/4] 스크립트 복사"
cp -v "$REPO_DIR/retry.sh" "$TARGET_DIR/"
cp -v "$REPO_DIR/status.sh" "$TARGET_DIR/"
cp -v "$REPO_DIR/config.env.example" "$TARGET_DIR/"
chmod +x "$TARGET_DIR/retry.sh" "$TARGET_DIR/status.sh"

echo "[3/4] config.env 확인"
if [[ -f "$TARGET_DIR/config.env" ]]; then
  echo "  ✅ config.env 이미 존재 — 그대로 유지"
else
  cp "$TARGET_DIR/config.env.example" "$TARGET_DIR/config.env"
  echo "  ⚠️  config.env 새로 생성됨. 편집 후 다시 실행하라:"
  echo "       \$ vi $TARGET_DIR/config.env"
  echo "  편집 끝나면 검증:"
  echo "       \$ $TARGET_DIR/retry.sh"
  echo ""
  echo "  config.env 채우기 끝난 후 이 install.sh 를 다시 실행하면 cron 등록됨."
  exit 0
fi

# 사전 검증: 필수 변수 placeholder 가 안 남아있는지
if grep -qE '<TENANCY_OCID>|<AD_NAME>|<SUBNET_OCID>|<IMAGE_OCID>' "$TARGET_DIR/config.env"; then
  echo "  ❌ config.env 에 <PLACEHOLDER> 가 남아있음. 편집 후 다시 실행."
  exit 1
fi

echo "[4/4] cron 등록 (5분 간격)"
CRON_LINE="*/5 * * * * $TARGET_DIR/retry.sh >> $TARGET_DIR/cron.log 2>&1"
# `grep -v` 가 매치 없을 때 exit 1 반환 → pipefail 에 걸리는 걸 방지하기 위해 변수로 분리
existing_crontab=$(crontab -l 2>/dev/null | grep -v "oci-capacity-retry/retry.sh" || true)
{ [[ -n "$existing_crontab" ]] && echo "$existing_crontab"; echo "$CRON_LINE"; } | crontab -
echo "  ✅ 등록됨: $CRON_LINE"
echo ""
echo "확인:"
echo "  $ $TARGET_DIR/status.sh"
