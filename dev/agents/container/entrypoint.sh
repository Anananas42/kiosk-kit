#!/usr/bin/env bash
set -euo pipefail

echo "==> Copying repo to /workspace..."
# Root node_modules is a named volume — exclude only it (not per-package ones)
rsync -a --exclude /node_modules --exclude .claude/worktrees --exclude '*.qcow2' --exclude '.work/' --exclude '.output/' /mnt/repo/ /workspace/

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
GH_TOKEN=$(./dev/agents/scripts/github-app-token.sh)
git fetch "https://x-access-token:${GH_TOKEN}@github.com/Anananas42/kiosk-kit.git" main
git reset --hard FETCH_HEAD

echo "==> Installing dependencies..."
CI=true pnpm install --frozen-lockfile

echo "==> Waiting for postgres..."
for _i in $(seq 1 30); do
  if node -e "const c=require('net').connect(5432,'postgres');c.on('connect',()=>{c.destroy();process.exit(0)});c.on('error',()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "==> Pushing database schema..."
pnpm --filter @kioskkit/web-server db:push

echo "==> Seeding test user..."
TEST_SESSION_TOKEN=$(pnpm --filter @kioskkit/web-server db:seed-test-user 2>/dev/null | tail -1)
export TEST_SESSION_TOKEN

echo "==> Seeding test data (devices, backups, releases)..."
pnpm --filter @kioskkit/web-server db:seed-test-data || true

echo "==> Seeding kiosk-server SQLite database..."
pnpm --filter @kioskkit/kiosk-server seed

echo "==> Generating CLAUDE.md with all agent skills..."
{
  echo "# Agent Skills"
  echo ""
  echo "You are running inside an isolated agent container. The following skills are available."
  echo "Read and follow them carefully."
  echo ""
  for skill in dev/agents/skills/*/SKILL.md; do
    echo "---"
    echo ""
    cat "$skill"
    echo ""
  done
} > /workspace/CLAUDE.md

echo "==> Ready."

# --- Claude invocation with retry ---
CLAUDE_MAX_RETRIES=5
CLAUDE_RETRY_DELAY=30
PRIMARY_SESSION_ID=""

run_claude() {
  local attempt=0
  while [ "$attempt" -lt "$CLAUDE_MAX_RETRIES" ]; do
    attempt=$((attempt + 1))
    echo "==> Running claude (attempt $attempt/$CLAUDE_MAX_RETRIES)..."
    start_log_tailer
    if claude --dangerously-skip-permissions -p "$@"; then
      return 0
    fi
    local exit_code=$?
    echo "==> Claude exited with code $exit_code (attempt $attempt/$CLAUDE_MAX_RETRIES)."
    if [ "$attempt" -lt "$CLAUDE_MAX_RETRIES" ]; then
      echo "==> Retrying in ${CLAUDE_RETRY_DELAY}s..."
      sleep "$CLAUDE_RETRY_DELAY"
    fi
  done
  echo "==> Claude failed after $CLAUDE_MAX_RETRIES attempts. Container will stay running but idle."
  return 1
}

# Capture session ID from the most recent session file
capture_session_id() {
  local newest
  newest=$(ls -t "$CLAUDE_SESSIONS_DIR"/*.jsonl 2>/dev/null | head -1 || echo "")
  if [ -n "$newest" ]; then
    PRIMARY_SESSION_ID=$(basename "$newest" .jsonl)
    echo "==> Captured primary session ID: $PRIMARY_SESSION_ID"
  fi
}

# Resume the primary agent session (falls back to run_claude if no session)
resume_claude() {
  if [ -z "$PRIMARY_SESSION_ID" ]; then
    echo "==> No primary session to resume. Starting fresh."
    run_claude "$@"
    return $?
  fi
  local attempt=0
  while [ "$attempt" -lt "$CLAUDE_MAX_RETRIES" ]; do
    attempt=$((attempt + 1))
    echo "==> Resuming primary session $PRIMARY_SESSION_ID (attempt $attempt/$CLAUDE_MAX_RETRIES)..."
    start_log_tailer
    if claude --dangerously-skip-permissions --resume "$PRIMARY_SESSION_ID" -p "$@"; then
      return 0
    fi
    local exit_code=$?
    echo "==> Claude exited with code $exit_code (attempt $attempt/$CLAUDE_MAX_RETRIES)."
    if [ "$attempt" -lt "$CLAUDE_MAX_RETRIES" ]; then
      echo "==> Retrying in ${CLAUDE_RETRY_DELAY}s..."
      sleep "$CLAUDE_RETRY_DELAY"
    fi
  done
  echo "==> Claude resume failed after $CLAUDE_MAX_RETRIES attempts."
  return 1
}

# --- Session log tailer ---
# Claude Code writes all activity to a JSONL session file but prints nothing
# to stdout during tool use. This background process tails the session file
# and prints formatted one-line summaries so `docker logs` shows progress.
CLAUDE_SESSIONS_DIR="$HOME/.claude/projects/-workspace"
LOG_TAILER_PID=""
start_log_tailer() {
  # Kill previous tailer so we always follow the newest session file
  stop_log_tailer

  (
    # Wait for a new session file to appear (newer than any existing ones)
    BEFORE=$(ls -t "$CLAUDE_SESSIONS_DIR"/*.jsonl 2>/dev/null | head -1 || echo "")
    while true; do
      NEWEST=$(ls -t "$CLAUDE_SESSIONS_DIR"/*.jsonl 2>/dev/null | head -1 || echo "")
      if [ -n "$NEWEST" ] && [ "$NEWEST" != "$BEFORE" ]; then
        break
      fi
      sleep 1
    done
    tail -f "$NEWEST" 2>/dev/null | jq --unbuffered -r '
      .message as $m |
      .timestamp as $ts |
      ($ts | sub("^[0-9]{4}-"; "") | split(".")[0]) as $t |
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
    # Kill children (tail, jq) first — killing only the subshell leaves them as orphans
    pkill -P "$LOG_TAILER_PID" 2>/dev/null || true
    kill "$LOG_TAILER_PID" 2>/dev/null || true
    wait "$LOG_TAILER_PID" 2>/dev/null || true
  fi
}

# From here on, claude failures should not kill the container
set +e
trap stop_log_tailer EXIT

# If AGENT_TASK is set, run claude non-interactively
if [ -n "${AGENT_TASK:-}" ]; then
  if ! run_claude "$AGENT_TASK"; then
    echo "==> Initial task failed after retries. Sleeping indefinitely — container stays up for inspection."
    sleep infinity
  fi
  # Capture the primary session so the watch loop can resume it
  capture_session_id
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

POLL_INTERVAL=15
ATTEMPT_COUNT=0
MAX_ATTEMPTS=5
SEEN_PR_COMMENTS=0
SEEN_ISSUE_COMMENTS=0
LAST_ACTION_TIMESTAMP=""

# Find the open PR for the current branch
BRANCH=$(git branch --show-current)

# If still on main, the agent never created a branch or pushed — re-invoke to finish
if [ "$BRANCH" = "main" ]; then
  echo "==> Still on main branch. Re-invoking claude to push and create PR..."
  ATTEMPT_COUNT=$((ATTEMPT_COUNT + 1))
  if [ "$ATTEMPT_COUNT" -gt "$MAX_ATTEMPTS" ]; then
    echo "==> Max attempts ($MAX_ATTEMPTS) reached without creating a PR. Sleeping indefinitely."
    sleep infinity
  fi
  if ! resume_claude "You completed the implementation but never pushed the branch or created a PR. Follow the cicd-workflow skill: create a branch, commit your changes, push, and open a PR. The Linear issue is in AGENT_TASK."; then
    echo "==> Re-invocation failed after retries. Sleeping indefinitely."
    sleep infinity
  fi
  # Re-read branch after re-invocation
  BRANCH=$(git branch --show-current)
  if [ "$BRANCH" = "main" ]; then
    echo "==> Still on main after re-invocation. Sleeping indefinitely."
    sleep infinity
  fi
fi

# Wait for PR to exist (agent may have pushed but PR creation is async)
echo "==> Waiting for PR on branch $BRANCH..."
PR_WAIT_COUNT=0
PR_WAIT_MAX=10
GH_TOKEN=$(./dev/agents/scripts/github-app-token.sh)
while [ "$PR_WAIT_COUNT" -lt "$PR_WAIT_MAX" ]; do
  PR_INIT_JSON=$(GH_TOKEN="${GH_TOKEN}" gh pr view --json number 2>/dev/null || echo "")
  if [ -n "$PR_INIT_JSON" ]; then
    break
  fi
  PR_WAIT_COUNT=$((PR_WAIT_COUNT + 1))
  echo "==> No PR yet (attempt $PR_WAIT_COUNT/$PR_WAIT_MAX). Waiting ${POLL_INTERVAL}s..."
  sleep "$POLL_INTERVAL"
  GH_TOKEN=$(./dev/agents/scripts/github-app-token.sh)
done

if [ -z "$PR_INIT_JSON" ]; then
  echo "==> No PR found after $PR_WAIT_MAX attempts. Re-invoking claude to create PR..."
  resume_claude "You pushed branch $BRANCH but no PR exists yet. Follow the cicd-workflow skill: create a PR using the GitHub App token, link it to the Linear issue, and enable auto-merge." || true
  GH_TOKEN=$(./dev/agents/scripts/github-app-token.sh)
  PR_INIT_JSON=$(GH_TOKEN="${GH_TOKEN}" gh pr view --json number 2>/dev/null || echo "")
fi

if [ -z "$PR_INIT_JSON" ]; then
  echo "==> Still no PR after re-invocation. Sleeping indefinitely."
  sleep infinity
fi

# Initialize seen comment counts
PR_INIT_NUMBER=$(echo "$PR_INIT_JSON" | jq -r '.number')
SEEN_PR_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/pulls/$PR_INIT_NUMBER/comments" --jq 'map(select(.user.login != "kiosk-kit-agent[bot]")) | length' 2>/dev/null || echo "0")
SEEN_ISSUE_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_INIT_NUMBER/comments" --jq 'map(select(.user.login != "kiosk-kit-agent[bot]")) | length' 2>/dev/null || echo "0")
LAST_ACTION_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

while true; do
  GH_TOKEN=$(./dev/agents/scripts/github-app-token.sh)

  # Check PR state
  PR_JSON=$(GH_TOKEN="${GH_TOKEN}" gh pr view --json number,state,reviewDecision,title 2>/dev/null || echo "")
  if [ -z "$PR_JSON" ]; then
    echo "==> No PR found for branch $BRANCH. Waiting..."
    sleep "$POLL_INTERVAL"
    continue
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
  CI_PENDING=$(echo "$CI_OUTPUT" | grep -c "pending\|\*" || true)

  TESTING_DONE_MARKER="/tmp/.testing-done-${PR_NUMBER}"

  # Check for new review comments
  PR_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/pulls/$PR_NUMBER/comments" --jq 'map(select(.user.login != "kiosk-kit-agent[bot]")) | length' 2>/dev/null || echo "0")
  ISSUE_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_NUMBER/comments" --jq 'map(select(.user.login != "kiosk-kit-agent[bot]")) | length' 2>/dev/null || echo "0")

  # Save timestamp for command detection before any updates
  CHECK_SINCE_TIMESTAMP="$LAST_ACTION_TIMESTAMP"

  # --- Check for @continue command (before max attempts check) ---
  HAS_CONTINUE=false
  if [ "$ISSUE_COMMENTS" -gt "$SEEN_ISSUE_COMMENTS" ]; then
    CONTINUE_COUNT=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_NUMBER/comments" --jq "[.[] | select(.user.login != \"kiosk-kit-agent[bot]\" and (.created_at > \"$CHECK_SINCE_TIMESTAMP\") and (.body | test(\"@continue\")))] | length" 2>/dev/null || echo "0")
    if [ "$CONTINUE_COUNT" -gt 0 ]; then
      echo "==> @continue command detected. Resetting attempt counter."
      HAS_CONTINUE=true
      ATTEMPT_COUNT=0
      SEEN_ISSUE_COMMENTS=$ISSUE_COMMENTS
      LAST_ACTION_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    fi
  fi

  # --- Check for @tester and @reviewer commands ---
  HAS_TESTER=false
  HAS_REVIEWER=false
  if [ "$ISSUE_COMMENTS" -gt "$SEEN_ISSUE_COMMENTS" ] || [ "$HAS_CONTINUE" = true ]; then
    TESTER_COUNT=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_NUMBER/comments" --jq "[.[] | select(.user.login != \"kiosk-kit-agent[bot]\" and (.created_at > \"$CHECK_SINCE_TIMESTAMP\" or .updated_at > \"$CHECK_SINCE_TIMESTAMP\") and (.body | test(\"@tester\")))] | length" 2>/dev/null || echo "0")
    if [ "$TESTER_COUNT" -gt 0 ]; then
      echo "==> @tester command detected. Will invoke testing agent."
      HAS_TESTER=true
      # Reset the testing marker so it runs again
      rm -f "/tmp/.testing-done-${PR_NUMBER}"
    fi
    REVIEWER_COUNT=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_NUMBER/comments" --jq "[.[] | select(.user.login != \"kiosk-kit-agent[bot]\" and (.created_at > \"$CHECK_SINCE_TIMESTAMP\" or .updated_at > \"$CHECK_SINCE_TIMESTAMP\") and (.body | test(\"@reviewer\")))] | length" 2>/dev/null || echo "0")
    if [ "$REVIEWER_COUNT" -gt 0 ]; then
      echo "==> @reviewer command detected. Will invoke reviewing agent."
      HAS_REVIEWER=true
      rm -f "/tmp/.reviewing-done-${PR_NUMBER}"
    fi
    # Mark command comments as seen so they don't re-trigger on the next iteration.
    # Don't update LAST_ACTION_TIMESTAMP here — the feedback query still needs
    # to see non-command comments from the same window.
    if [ "$HAS_TESTER" = true ] || [ "$HAS_REVIEWER" = true ]; then
      SEEN_ISSUE_COMMENTS=$ISSUE_COMMENTS
    fi
  fi

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
    # Fetch comments newer than LAST_ACTION_TIMESTAMP to avoid re-processing old ones
    REVIEW_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/pulls/$PR_NUMBER/comments" --jq "[.[] | select(.user.login != \"kiosk-kit-agent[bot]\" and (.created_at > \"$LAST_ACTION_TIMESTAMP\" or .updated_at > \"$LAST_ACTION_TIMESTAMP\"))]" 2>/dev/null || echo "[]")
    CONVERSATION_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_NUMBER/comments" --jq "[.[] | select(.user.login != \"kiosk-kit-agent[bot]\" and (.created_at > \"$LAST_ACTION_TIMESTAMP\" or .updated_at > \"$LAST_ACTION_TIMESTAMP\") and (.body | test(\"^\\\\s*@(tester|reviewer|continue)\\\\s*$\") | not))]" 2>/dev/null || echo "[]")
    # Fetch review bodies (Changes Requested reviews have a body that doesn't appear in comments APIs)
    REVIEW_BODIES=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/pulls/$PR_NUMBER/reviews" --jq "[.[] | select(.user.login != \"kiosk-kit-agent[bot]\" and .state == \"CHANGES_REQUESTED\" and (.submitted_at > \"$LAST_ACTION_TIMESTAMP\") and (.body | length > 0))]" 2>/dev/null || echo "[]")

    NEW_COMMENT_COUNT=$(echo "$REVIEW_COMMENTS" | jq 'length' 2>/dev/null || echo "0")
    NEW_CONVO_COUNT=$(echo "$CONVERSATION_COMMENTS" | jq 'length' 2>/dev/null || echo "0")
    NEW_REVIEW_COUNT=$(echo "$REVIEW_BODIES" | jq 'length' 2>/dev/null || echo "0")

    if [ "$NEW_COMMENT_COUNT" -gt 0 ] || [ "$NEW_CONVO_COUNT" -gt 0 ] || [ "$NEW_REVIEW_COUNT" -gt 0 ]; then
      REVIEW_ACTION="Review feedback on PR #$PR_NUMBER (branch: $BRANCH).

Review decision: $REVIEW_DECISION

New review bodies (since last check):
$REVIEW_BODIES

New inline review comments (since last check):
$REVIEW_COMMENTS

New conversation comments (since last check):
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
  fi

  if [ -n "$NEEDS_ACTION" ]; then
    ATTEMPT_COUNT=$((ATTEMPT_COUNT + 1))
    echo "==> Action needed (attempt $ATTEMPT_COUNT/$MAX_ATTEMPTS). Re-invoking claude..."

    if [ "$ATTEMPT_COUNT" -gt "$MAX_ATTEMPTS" ]; then
      echo "==> Max attempts ($MAX_ATTEMPTS) reached. Leaving a comment and polling for @continue..."
      GH_TOKEN="${GH_TOKEN}" gh pr comment "$PR_NUMBER" --body "Agent hit the maximum of $MAX_ATTEMPTS fix attempts. Human help needed. Comment \`@continue\` to reset the attempt counter and resume." || true
      # Update seen counts so the bot's own comment doesn't re-trigger
      SEEN_PR_COMMENTS=$PR_COMMENTS
      SEEN_ISSUE_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_NUMBER/comments" --jq 'map(select(.user.login != "kiosk-kit-agent[bot]")) | length' 2>/dev/null || echo "0")
      LAST_ACTION_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      echo "==> Sleeping ${POLL_INTERVAL}s..."
      sleep "$POLL_INTERVAL"
      continue
    fi

    if ! resume_claude "ACTION NEEDED:
$NEEDS_ACTION"; then
      echo "==> Watch loop claude invocation failed after retries. Sleeping indefinitely."
      sleep infinity
    fi

    # Update seen comment counts and timestamp so handled comments don't re-trigger
    SEEN_PR_COMMENTS=$PR_COMMENTS
    SEEN_ISSUE_COMMENTS=$ISSUE_COMMENTS
    LAST_ACTION_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  else
    # All clear — reset attempt counter
    ATTEMPT_COUNT=0
  fi

  # --- Testing agent (single trigger point) ---
  # Runs on @tester command OR automatically once after CI passes
  RUN_TESTING=false
  if [ "$HAS_TESTER" = true ]; then
    echo "==> @tester command: will run testing agent."
    RUN_TESTING=true
  elif [ "$CI_FAILING" -eq 0 ] && [ "$CI_PENDING" -eq 0 ] && [ ! -f "$TESTING_DONE_MARKER" ]; then
    echo "==> CI passed (first time). Will run testing agent."
    RUN_TESTING=true
  fi

  if [ "$RUN_TESTING" = true ]; then
    echo "==> Running testing agent for PR #$PR_NUMBER..."
    TESTING_CMD=$(cat .claude/commands/testing.md 2>/dev/null || echo "")
    if [ -n "$TESTING_CMD" ]; then
      TESTING_BEFORE_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      PR_BODY=$(GH_TOKEN="${GH_TOKEN}" gh pr view "$PR_NUMBER" --json body --jq .body 2>/dev/null || echo "")
      CHANGED_FILES=$(GH_TOKEN="${GH_TOKEN}" gh pr view "$PR_NUMBER" --json files --jq '.files[].path' 2>/dev/null || echo "")

      start_log_tailer
      claude --dangerously-skip-permissions -p "$(cat <<TESTING_EOF
$TESTING_CMD

---

PR number: $PR_NUMBER
Branch: $BRANCH

## PR Description

$PR_BODY

## Changed Files

$CHANGED_FILES
TESTING_EOF
      )" || true

      echo "==> Testing agent finished for PR #$PR_NUMBER."

      # Capture the tester's comment(s) and hand them to the main agent.
      # Both agents post as kiosk-kit-agent[bot], so the loop's normal comment
      # detection (which filters bot comments) will never see tester output.
      GH_TOKEN=$(./dev/agents/scripts/github-app-token.sh)
      TESTER_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_NUMBER/comments" \
        --jq "[.[] | select(.user.login == \"kiosk-kit-agent[bot]\" and .created_at > \"$TESTING_BEFORE_TIMESTAMP\")] | map({id, body})" 2>/dev/null || echo "[]")
      TESTER_COMMENT_COUNT=$(echo "$TESTER_COMMENTS" | jq 'length' 2>/dev/null || echo "0")

      if [ "$TESTER_COMMENT_COUNT" -gt 0 ]; then
        echo "==> Handing $TESTER_COMMENT_COUNT tester comment(s) to the main agent..."
        TESTER_COMMENT_IDS=$(echo "$TESTER_COMMENTS" | jq -r '.[].id' 2>/dev/null || echo "")

        ATTEMPT_COUNT=$((ATTEMPT_COUNT + 1))
        if [ "$ATTEMPT_COUNT" -le "$MAX_ATTEMPTS" ]; then
          resume_claude "The testing agent ran on PR #$PR_NUMBER and posted the following results:

$TESTER_COMMENTS

Review the testing results. If there are real failures that need code changes, fix them, commit, and push. If the results look fine (all passing, or failures are not actionable), leave a thumbs up reaction on each tester comment using: gh api repos/Anananas42/kiosk-kit/issues/comments/COMMENT_ID/reactions -f content='+1'

Tester comment IDs: $TESTER_COMMENT_IDS" || true
        fi

        LAST_ACTION_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      fi
    else
      echo "==> Warning: .claude/commands/testing.md not found. Skipping testing agent."
    fi

    # Always advance timestamps after testing agent so its activity isn't re-processed
    SEEN_ISSUE_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_NUMBER/comments" --jq 'map(select(.user.login != "kiosk-kit-agent[bot]")) | length' 2>/dev/null || echo "0")
    LAST_ACTION_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    touch "$TESTING_DONE_MARKER"
  fi

  # --- Reviewing agent (single trigger point) ---
  # Runs on @reviewer command OR automatically once after tester finishes
  REVIEWING_DONE_MARKER="/tmp/.reviewing-done-${PR_NUMBER}"
  RUN_REVIEWING=false
  if [ "$HAS_REVIEWER" = true ]; then
    echo "==> @reviewer command: will run reviewing agent."
    RUN_REVIEWING=true
  elif [ -f "$TESTING_DONE_MARKER" ] && [ ! -f "$REVIEWING_DONE_MARKER" ]; then
    echo "==> Tester done. Will run reviewing agent."
    RUN_REVIEWING=true
  fi

  if [ "$RUN_REVIEWING" = true ]; then
    echo "==> Running reviewing agent for PR #$PR_NUMBER..."
    REVIEWING_CMD=$(cat .claude/commands/reviewing.md 2>/dev/null || echo "")
    if [ -n "$REVIEWING_CMD" ]; then
      REVIEWING_BEFORE_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      PR_BODY=$(GH_TOKEN="${GH_TOKEN}" gh pr view "$PR_NUMBER" --json body --jq .body 2>/dev/null || echo "")
      CHANGED_FILES=$(GH_TOKEN="${GH_TOKEN}" gh pr view "$PR_NUMBER" --json files --jq '.files[].path' 2>/dev/null || echo "")

      start_log_tailer
      claude --dangerously-skip-permissions -p "$(cat <<REVIEWING_EOF
$REVIEWING_CMD

---

PR number: $PR_NUMBER
Branch: $BRANCH

## PR Description

$PR_BODY

## Changed Files

$CHANGED_FILES
REVIEWING_EOF
      )" || true

      echo "==> Reviewing agent finished for PR #$PR_NUMBER."

      # Capture the reviewer's comment(s) and hand them to the main agent.
      GH_TOKEN=$(./dev/agents/scripts/github-app-token.sh)
      REVIEWER_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_NUMBER/comments" \
        --jq "[.[] | select(.user.login == \"kiosk-kit-agent[bot]\" and .created_at > \"$REVIEWING_BEFORE_TIMESTAMP\")] | map({id, body})" 2>/dev/null || echo "[]")
      REVIEWER_COMMENT_COUNT=$(echo "$REVIEWER_COMMENTS" | jq 'length' 2>/dev/null || echo "0")

      if [ "$REVIEWER_COMMENT_COUNT" -gt 0 ]; then
        echo "==> Handing $REVIEWER_COMMENT_COUNT reviewer comment(s) to the main agent..."
        REVIEWER_COMMENT_IDS=$(echo "$REVIEWER_COMMENTS" | jq -r '.[].id' 2>/dev/null || echo "")

        ATTEMPT_COUNT=$((ATTEMPT_COUNT + 1))
        if [ "$ATTEMPT_COUNT" -le "$MAX_ATTEMPTS" ]; then
          resume_claude "The code reviewing agent ran on PR #$PR_NUMBER and posted the following findings:

$REVIEWER_COMMENTS

Review the findings and address them — commit and push your fixes. If you genuinely disagree with a specific finding after careful consideration, reply explaining why instead of fixing it. Leave a thumbs up reaction on each reviewer comment you've addressed using: gh api repos/Anananas42/kiosk-kit/issues/comments/COMMENT_ID/reactions -f content='+1'

Reviewer comment IDs: $REVIEWER_COMMENT_IDS" || true
        fi

        LAST_ACTION_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      fi
    else
      echo "==> Warning: .claude/commands/reviewing.md not found. Skipping reviewing agent."
    fi

    # Always advance timestamps after reviewing agent so its activity isn't re-processed
    SEEN_ISSUE_COMMENTS=$(GH_TOKEN="${GH_TOKEN}" gh api "repos/Anananas42/kiosk-kit/issues/$PR_NUMBER/comments" --jq 'map(select(.user.login != "kiosk-kit-agent[bot]")) | length' 2>/dev/null || echo "0")
    LAST_ACTION_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    touch "$REVIEWING_DONE_MARKER"
  fi

  echo "==> Sleeping ${POLL_INTERVAL}s..."
  sleep "$POLL_INTERVAL"
done
