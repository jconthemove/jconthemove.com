#!/bin/bash
# Auto-restart wrapper for JC ON THE MOVE
# If the server crashes, waits 3 seconds and starts it again automatically.

RESTART_COUNT=0

while true; do
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " JC ON THE MOVE — Starting (restart #$RESTART_COUNT)"
  echo " $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  npm run dev
  EXIT_CODE=$?

  # Exit code 0  = clean shutdown (no restart needed)
  # Exit code 130 = SIGINT (Ctrl+C)
  # Exit code 143 = SIGTERM (Replit workflow stop)
  if [ "$EXIT_CODE" -eq 0 ] || [ "$EXIT_CODE" -eq 130 ] || [ "$EXIT_CODE" -eq 143 ]; then
    echo ""
    echo "✅ Application stopped cleanly (exit code: $EXIT_CODE). Not restarting."
    exit 0
  fi

  RESTART_COUNT=$((RESTART_COUNT + 1))
  echo ""
  echo "⚠️  Server crashed (exit code: $EXIT_CODE). Auto-restarting in 3 seconds... (restart #$RESTART_COUNT)"
  echo ""
  sleep 3
done
