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
echo "=== 마지막 시도 FD ==="
[[ -f "$SCRIPT_DIR/state" ]] && echo "  FD-$(cat "$SCRIPT_DIR/state")" || echo "  (state 없음)"

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
