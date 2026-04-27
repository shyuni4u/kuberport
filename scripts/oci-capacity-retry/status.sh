#!/usr/bin/env bash
# 현재 OCI capacity 재시도 상태 확인.
# 사용법: ./status.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Cron 등록 ==="
crontab -l 2>/dev/null | grep oci-capacity-retry || echo "❌ crontab 미등록"

echo ""
echo "=== Cron 데몬 상태 ==="
# Linux (systemd) 와 macOS (launchd 가 cron 을 띄움) 모두에서 동작.
if systemctl is-active --quiet cron 2>/dev/null \
   || systemctl is-active --quiet crond 2>/dev/null \
   || pgrep -x cron >/dev/null 2>&1 \
   || pgrep -x crond >/dev/null 2>&1; then
  echo "  ✅ cron 동작 중"
else
  echo "  ❌ cron 정지 — Linux: 'sudo systemctl start cron', macOS: cron 은 첫 crontab 등록 시 자동 기동"
fi

echo ""
echo "=== 최근 retry.log (마지막 10줄) ==="
[[ -f "$SCRIPT_DIR/retry.log" ]] && tail -10 "$SCRIPT_DIR/retry.log" || echo "(아직 실행 기록 없음)"

echo ""
echo "=== FD 진행 상태 ==="
# state 파일은 "마지막으로 capacity 응답을 받은 FD" — rate-limit 으로 거부된 시도는 advance 안 함.
# 실제 가장 최근 시도는 로그에서 추출해서 따로 표시.
if [[ -f "$SCRIPT_DIR/retry.log" ]]; then
  last_attempt=$(grep "Attempting launch" "$SCRIPT_DIR/retry.log" | tail -1 | grep -oE 'FAULT-DOMAIN-[0-9]+' | grep -oE '[0-9]+$')
  [[ -n "$last_attempt" ]] && echo "  최근 시도        : FD-$last_attempt" || echo "  최근 시도        : (아직 없음)"
fi
if [[ -f "$SCRIPT_DIR/state" ]]; then
  state_fd=$(cat "$SCRIPT_DIR/state")
  next_fd=$(( (state_fd % 3) + 1 ))
  echo "  capacity 회전    : FD-$state_fd (다음 cron 은 FD-$next_fd)"
else
  echo "  capacity 회전    : (아직 capacity 응답 받은 적 없음)"
fi

echo ""
if [[ -f "$SCRIPT_DIR/SUCCESS" ]]; then
  echo "🎉🎉🎉 인스턴스 확보 완료 🎉🎉🎉"
  echo "  Instance OCID: $(cat "$SCRIPT_DIR/SUCCESS")"
  [[ -f "$SCRIPT_DIR/PUBLIC_IP" ]] && echo "  Public IP    : $(cat "$SCRIPT_DIR/PUBLIC_IP")"
  echo ""
  echo "다음 단계: ssh -i ~/.ssh/oci_kuberport ubuntu@$(cat "$SCRIPT_DIR/PUBLIC_IP" 2>/dev/null || echo '<PUBLIC_IP>')"
elif [[ -f "$SCRIPT_DIR/ERROR" ]]; then
  echo "❌ PERMANENT ERROR — cron 자동 비활성화 권고"
  echo "  내용: $(cat "$SCRIPT_DIR/ERROR")"
else
  attempts=$(grep -c "Attempting launch" "$SCRIPT_DIR/retry.log" 2>/dev/null || echo 0)
  echo "⏳ 진행 중 — 총 $attempts 회 시도, capacity 대기 중"
fi
