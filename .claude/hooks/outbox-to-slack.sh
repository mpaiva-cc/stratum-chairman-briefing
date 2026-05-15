#!/usr/bin/env bash
# Stop hook: drain agent-outbox/ to #poc-stratum on Slack.
#
# Runs after every Claude Code session in this project. Checks for new outbox
# entries; if any exist, spawns a short `claude -p` subprocess that posts each
# to Slack via MCP and archives the file. Backgrounded so it doesn't block
# session end.
#
# Requirements: `claude` CLI on PATH; Slack MCP authenticated in the user's
# Claude config (mcp__claude_ai_Slack__slack_send_message available).
# Channel: #poc-stratum (private, C0B41K5107Q).

set -u

REPO_ROOT="/Users/mp/git-repos/poc-autonomous-hcm"
OUTBOX_DIR="${REPO_ROOT}/agent-outbox"
LOG_FILE="/tmp/stratum-outbox.log"
LOCK_FILE="/tmp/stratum-outbox.lock"
URL_PREFIX="https://mpaiva-cc.github.io/stratum-chairman-briefing"

shopt -s nullglob
entries=( "${OUTBOX_DIR}"/*.json )
[ ${#entries[@]} -eq 0 ] && exit 0

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
    exit 0
fi

(
    cd "${REPO_ROOT}" || exit 0

    {
        echo "---"
        echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] draining ${#entries[@]} outbox entr$([ ${#entries[@]} -eq 1 ] && echo "y" || echo "ies")"
    } >> "${LOG_FILE}" 2>&1

    PROMPT=$(cat <<'PROMPT_EOF'
You are draining the Stratum agent-outbox. JSON files live in
/Users/mp/git-repos/poc-autonomous-hcm/agent-outbox/ (NOT in archive/).

For each .json file at that path:
1. Read it. Schema: { agent, type, title, summary, link?, urgency?, timestamp }.
2. Post a message to Slack channel #poc-stratum using
   mcp__claude_ai_Slack__slack_send_message (channel_id: C0B41K5107Q). Format:

   type=publish: "**[{agent}]** published: **{title}**\n{summary}"
   type=request: ":raised_hand: **[{agent}]** requests: **{title}**\n{summary}"
   type=event:   ":zap: **[{agent}]** — **{title}**\n{summary}"

   If urgency=high, prepend ":rotating_light: " to the message.
   If link is present, append a final line:
     "→ https://mpaiva-cc.github.io/stratum-chairman-briefing{link}"

   DO NOT use stratum.ai — that is a different, unrelated company.

3. On successful post, move the file to
   /Users/mp/git-repos/poc-autonomous-hcm/agent-outbox/archive/ via `mv`.
4. If a post fails, LEAVE the file in place and continue. Report at the end
   which posted and which were skipped.

Be terse. No previews, no summaries, no questions. Process all entries.
Final output: one line per entry — "posted: <filename>" or "skipped: <filename> — <reason>".
PROMPT_EOF
)

    /usr/bin/env claude -p "${PROMPT}" \
        --permission-mode acceptEdits \
        </dev/null >> "${LOG_FILE}" 2>&1

    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] drain complete" >> "${LOG_FILE}" 2>&1
) &

disown
exit 0
