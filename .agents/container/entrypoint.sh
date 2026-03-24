#!/usr/bin/env bash
set -euo pipefail

echo "==> Copying repo to /workspace..."
# Root node_modules is a named volume — exclude only it (not per-package ones)
rsync -a --exclude /node_modules --exclude .claude/worktrees /mnt/repo/ /workspace/

echo "==> Configuring git..."
git config user.name "kiosk-kit-agent[bot]"
git config user.email "kiosk-kit-agent[bot]@users.noreply.github.com"
git config commit.gpgsign false
git remote set-url origin "https://github.com/Anananas42/kiosk-kit.git"
git remote set-url --push origin "https://github.com/Anananas42/kiosk-kit.git"

# Set up GitHub App PEM in expected location
if [ -f /mnt/secrets/kiosk-kit-agent.pem ]; then
  mkdir -p "$HOME/.config/github-apps"
  cp /mnt/secrets/kiosk-kit-agent.pem "$HOME/.config/github-apps/kiosk-kit-agent.pem"
  chmod 600 "$HOME/.config/github-apps/kiosk-kit-agent.pem"
fi

# Copy Claude credentials (mounted read-only, need writable .claude dir)
if [ -f /mnt/secrets/claude-credentials.json ]; then
  mkdir -p "$HOME/.claude"
  cp /mnt/secrets/claude-credentials.json "$HOME/.claude/.credentials.json"
fi

echo "==> Pulling latest main..."
GH_TOKEN=$(./.agents/scripts/github-app-token.sh)
git fetch "https://x-access-token:${GH_TOKEN}@github.com/Anananas42/kiosk-kit.git" main
git reset --hard FETCH_HEAD

echo "==> Installing dependencies..."
CI=true pnpm install --frozen-lockfile

echo "==> Waiting for postgres..."
for i in $(seq 1 30); do
  if node -e "const c=require('net').connect(5432,'postgres');c.on('connect',()=>{c.destroy();process.exit(0)});c.on('error',()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "==> Pushing database schema..."
pnpm --filter @kioskkit/web-server db:push

echo "==> Generating CLAUDE.md with all agent skills..."
{
  echo "# Agent Skills"
  echo ""
  echo "You are running inside an isolated agent container. The following skills are available."
  echo "Read and follow them carefully."
  echo ""
  for skill in .agents/skills/*/SKILL.md; do
    echo "---"
    echo ""
    cat "$skill"
    echo ""
  done
} > /workspace/CLAUDE.md

echo "==> Ready."

# --- Session log tailer ---
# Claude Code writes all activity to a JSONL session file but prints nothing
# to stdout during tool use. This background process tails the session file
# and prints formatted one-line summaries so `docker logs` shows progress.
CLAUDE_SESSIONS_DIR="$HOME/.claude/projects/-workspace"
start_log_tailer() {
  (
    # Wait for the session file to appear
    while [ ! -d "$CLAUDE_SESSIONS_DIR" ] || [ -z "$(ls "$CLAUDE_SESSIONS_DIR"/*.jsonl 2>/dev/null)" ]; do
      sleep 1
    done
    SESSION_FILE=$(ls -t "$CLAUDE_SESSIONS_DIR"/*.jsonl 2>/dev/null | head -1)
    tail -f "$SESSION_FILE" 2>/dev/null | jq --unbuffered -r '
      .message as $m |
      .timestamp as $ts |
      ($ts | ltrimstr("2026-") | split(".")[0]) as $t |
      if $m.role == "assistant" then
        ($m.content // [] | map(
          if .type == "text" and (.text | length) > 0 then
            "[\($t)] assistant: \(.text | gsub("\n"; " ") | if length > 200 then .[:200] + "..." else . end)"
          elif .type == "tool_use" then
            "[\($t)] tool: \(.name) \(.input.description // .input.command // .input.pattern // .input.file_path // "" | gsub("\n"; " ") | if length > 100 then .[:100] + "..." else . end)"
          else empty
          end
        ) | .[])
      elif $m.role == "user" then
        ($m.content // [] | map(
          if .type == "tool_result" and .is_error == true then
            "[\($t)] ERROR: \(.content | gsub("\n"; " ") | if length > 200 then .[:200] + "..." else . end)"
          else empty
          end
        ) | .[])
      else empty
      end
    ' 2>/dev/null
  ) &
  LOG_TAILER_PID=$!
}

stop_log_tailer() {
  if [ -n "${LOG_TAILER_PID:-}" ]; then
    kill "$LOG_TAILER_PID" 2>/dev/null || true
    wait "$LOG_TAILER_PID" 2>/dev/null || true
  fi
}

# If AGENT_TASK is set, run claude non-interactively
if [ -n "${AGENT_TASK:-}" ]; then
  start_log_tailer
  trap stop_log_tailer EXIT
  claude --dangerously-skip-permissions -p "$AGENT_TASK"
  if [ -n "${AGENT_NO_LOOP:-}" ]; then
    echo "==> --no-loop set, skipping PR watch loop."
    exit 0
  fi
else
  # Interactive mode — no watch loop after exit
  exec claude --dangerously-skip-permissions
fi

# --- PR watch loop ---
# After claude finishes its task, poll the PR until it's merged or closed.
# If something needs attention, re-invoke claude with context.

echo "==> Agent task complete. Starting PR watch loop..."

POLL_INTERVAL=30
ATTEMPT_COUNT=0
MAX_ATTEMPTS=5

# Find the open PR for the current branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ]; then
  echo "==> On main branch, no PR to watch. Exiting."
  exit 0
fi

# Initialize seen comment counts before entering the loop
GH_TOKEN=$(./.agents/scripts/github-app-token.sh)
PR_INIT_JSON=$(GH_TOKEN="${GH_TOKEN}" gh pr view --json number 2>/dev/null || echo "")
if [ -n "$PR_INIT_JSON" ]; then
  PR_INIT_NUMBER=$(echo "$PR_INIT_JSON" | jq -r '.number')
  SEEN_PR_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/pulls/$PR_INIT_NUMBER/comments" --jq 'map(select(.user.login != "kiosk-kit-agent[bot]")) | length' 2>/dev/null || echo "0")
  SEEN_ISSUE_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_INIT_NUMBER/comments" --jq 'map(select(.user.login != "kiosk-kit-agent[bot]")) | length' 2>/dev/null || echo "0")
else
  SEEN_PR_COMMENTS=0
  SEEN_ISSUE_COMMENTS=0
fi

while true; do
  GH_TOKEN=$(./.agents/scripts/github-app-token.sh)

  # Check PR state
  PR_JSON=$(GH_TOKEN="${GH_TOKEN}" gh pr view --json number,state,reviewDecision,title 2>/dev/null || echo "")
  if [ -z "$PR_JSON" ]; then
    echo "==> No PR found for branch $BRANCH. Exiting."
    exit 0
  fi

  PR_STATE=$(echo "$PR_JSON" | jq -r '.state')
  PR_NUMBER=$(echo "$PR_JSON" | jq -r '.number')
  REVIEW_DECISION=$(echo "$PR_JSON" | jq -r '.reviewDecision // empty')

  echo "==> [$(date +%H:%M:%S)] PR #$PR_NUMBER: state=$PR_STATE review=$REVIEW_DECISION attempts=$ATTEMPT_COUNT"

  if [ "$PR_STATE" = "MERGED" ] || [ "$PR_STATE" = "CLOSED" ]; then
    echo "==> PR #$PR_NUMBER is $PR_STATE. Exiting."
    exit 0
  fi

  # Check CI status
  CI_OUTPUT=$(GH_TOKEN="${GH_TOKEN}" gh pr checks 2>&1 || true)
  CI_FAILING=$(echo "$CI_OUTPUT" | grep -c "fail\|X" || true)

  # Check for new review comments
  PR_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/pulls/$PR_NUMBER/comments" --jq 'map(select(.user.login != "kiosk-kit-agent[bot]")) | length' 2>/dev/null || echo "0")
  ISSUE_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_NUMBER/comments" --jq 'map(select(.user.login != "kiosk-kit-agent[bot]")) | length' 2>/dev/null || echo "0")

  NEEDS_ACTION=""

  if [ "$CI_FAILING" -gt 0 ]; then
    # Get failed run ID and logs
    FAILED_RUN_ID=$(GH_TOKEN="${GH_TOKEN}" gh run list --branch "$BRANCH" --status failure --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || echo "")
    FAILED_LOGS=""
    if [ -n "$FAILED_RUN_ID" ]; then
      FAILED_LOGS=$(GH_TOKEN="${GH_TOKEN}" gh run view "$FAILED_RUN_ID" --log-failed 2>/dev/null | tail -100 || echo "Could not fetch logs")
    fi
    NEEDS_ACTION="CI is failing on PR #$PR_NUMBER (branch: $BRANCH).

CI output:
$CI_OUTPUT

Failed run logs (last 100 lines):
$FAILED_LOGS

Fix the failing checks, commit, and push."
  fi

  if [ "$REVIEW_DECISION" = "CHANGES_REQUESTED" ] || [ "$PR_COMMENTS" -gt "$SEEN_PR_COMMENTS" ] || [ "$ISSUE_COMMENTS" -gt "$SEEN_ISSUE_COMMENTS" ]; then
    REVIEW_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/pulls/$PR_NUMBER/comments" 2>/dev/null || echo "[]")
    CONVERSATION_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_NUMBER/comments" 2>/dev/null || echo "[]")
    REVIEW_ACTION="Review feedback on PR #$PR_NUMBER (branch: $BRANCH).

Review decision: $REVIEW_DECISION

Inline review comments:
$REVIEW_COMMENTS

Conversation comments:
$CONVERSATION_COMMENTS

Address the feedback: fix code if needed, push, and reply to each comment."

    if [ -n "$NEEDS_ACTION" ]; then
      NEEDS_ACTION="$NEEDS_ACTION

Additionally:
$REVIEW_ACTION"
    else
      NEEDS_ACTION="$REVIEW_ACTION"
    fi
  fi

  if [ -n "$NEEDS_ACTION" ]; then
    ATTEMPT_COUNT=$((ATTEMPT_COUNT + 1))
    echo "==> Action needed (attempt $ATTEMPT_COUNT/$MAX_ATTEMPTS). Re-invoking claude..."

    if [ "$ATTEMPT_COUNT" -gt "$MAX_ATTEMPTS" ]; then
      echo "==> Max attempts ($MAX_ATTEMPTS) reached. Leaving a comment and exiting."
      GH_TOKEN="${GH_TOKEN}" gh pr comment "$PR_NUMBER" --body "Agent hit the maximum of $MAX_ATTEMPTS fix attempts. Human help needed."
      exit 1
    fi

    start_log_tailer
    claude --dangerously-skip-permissions -p "$NEEDS_ACTION"

    # Update seen comment counts so handled comments don't re-trigger
    SEEN_PR_COMMENTS=$PR_COMMENTS
    SEEN_ISSUE_COMMENTS=$ISSUE_COMMENTS
  else
    # All clear — reset attempt counter
    ATTEMPT_COUNT=0
  fi

  echo "==> Sleeping ${POLL_INTERVAL}s..."
  sleep "$POLL_INTERVAL"
done
