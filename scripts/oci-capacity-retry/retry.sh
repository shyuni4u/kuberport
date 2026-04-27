#!/usr/bin/env bash
# OCI A1.Flex capacity retry script.
# Cycles through FD-1/2/3, exits 0 on success, 1 on permanent error.
# Designed for cron / systemd-timer (5min interval). Idempotent: skips if instance already RUNNING.
#
# Logs: /var/log/oci-capacity-retry.log (or fallback ~/oci-capacity-retry/retry.log)
# State: ~/oci-capacity-retry/state (last attempted FD index for round-robin)

set -euo pipefail

# cron 은 minimal PATH 로 실행됨 → pipx 가 깐 ~/.local/bin/oci 를 못 찾는 문제 회피.
# Homebrew 경로(macOS)와 pipx 기본 경로 모두 포함.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.env"

LOG_FILE="$SCRIPT_DIR/retry.log"
STATE_FILE="$SCRIPT_DIR/state"
SUCCESS_FILE="$SCRIPT_DIR/SUCCESS"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE" >&2; }

# Already succeeded — no-op (cron 안전)
if [[ -f "$SUCCESS_FILE" ]]; then
  log "SUCCESS marker exists, exiting (instance already created: $(cat "$SUCCESS_FILE"))"
  exit 0
fi

# 같은 이름의 인스턴스가 RUNNING/PROVISIONING 상태로 이미 있으면 중복 launch 방지
existing=$(oci compute instance list \
  --compartment-id "$OCI_COMPARTMENT_ID" \
  --display-name "$OCI_INSTANCE_NAME" \
  --lifecycle-state RUNNING \
  --query 'data[0].id' \
  --raw-output 2>/dev/null || true)

if [[ -n "$existing" && "$existing" != "null" ]]; then
  log "Instance '$OCI_INSTANCE_NAME' already RUNNING ($existing), marking SUCCESS"
  echo "$existing" > "$SUCCESS_FILE"
  exit 0
fi

# Round-robin FD: state 파일에 마지막 시도한 index (1/2/3) 저장 → 다음 호출 때 +1
last_fd=$(cat "$STATE_FILE" 2>/dev/null || echo "0")
next_fd=$(( (last_fd % 3) + 1 ))
echo "$next_fd" > "$STATE_FILE"
FD_NAME="FAULT-DOMAIN-${next_fd}"

log "Attempting launch: AD=$OCI_AD_NAME FD=$FD_NAME shape=$OCI_SHAPE ${OCI_OCPUS}c/${OCI_MEMORY_GB}GB"

# 실제 launch 시도 — stderr/stdout 캡처
output=$(oci compute instance launch \
  --availability-domain "$OCI_AD_NAME" \
  --fault-domain "$FD_NAME" \
  --compartment-id "$OCI_COMPARTMENT_ID" \
  --display-name "$OCI_INSTANCE_NAME" \
  --shape "$OCI_SHAPE" \
  --shape-config "{\"ocpus\":$OCI_OCPUS,\"memoryInGBs\":$OCI_MEMORY_GB}" \
  --image-id "$OCI_IMAGE_ID" \
  --subnet-id "$OCI_SUBNET_ID" \
  --assign-public-ip true \
  --boot-volume-size-in-gbs "$OCI_BOOT_VOL_GB" \
  --ssh-authorized-keys-file "$OCI_SSH_PUB_KEY" \
  --wait-for-state RUNNING \
  --wait-interval-seconds 10 \
  --max-wait-seconds 300 \
  2>&1) && rc=0 || rc=$?

if [[ $rc -eq 0 ]]; then
  instance_id=$(echo "$output" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "unknown")
  log "🎉 SUCCESS — instance launched: $instance_id"
  echo "$instance_id" > "$SUCCESS_FILE"

  # Public IP 조회
  vnic_id=$(oci compute instance list-vnics --instance-id "$instance_id" --query 'data[0].id' --raw-output 2>/dev/null || echo "")
  if [[ -n "$vnic_id" ]]; then
    public_ip=$(oci network vnic get --vnic-id "$vnic_id" --query 'data."public-ip"' --raw-output 2>/dev/null || echo "")
    log "Public IP: $public_ip"
    echo "$public_ip" > "$SCRIPT_DIR/PUBLIC_IP"
  fi
  exit 0
fi

# 에러 분류
if echo "$output" | grep -qiE "out of (host )?capacity|InternalError.*capacity"; then
  log "Out of capacity on $FD_NAME — will retry next tick (next FD: $(( (next_fd % 3) + 1 )))"
  exit 0  # cron 이 다시 부르도록 0 으로 빠짐 (스크립트 자체는 정상)
elif echo "$output" | grep -qiE "TooManyRequests|429|rate"; then
  log "Rate limited — backing off (next attempt: 다음 cron tick)"
  exit 0
elif echo "$output" | grep -qiE "LimitExceeded.*service.*limit|already exists"; then
  log "PERMANENT ERROR (limit/duplicate) — disabling retry. Output: $output"
  echo "$output" > "$SCRIPT_DIR/ERROR"
  exit 1
else
  log "Unexpected error (will retry next tick): $output"
  exit 0
fi
