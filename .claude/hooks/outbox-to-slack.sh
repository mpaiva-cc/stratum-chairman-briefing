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
URL_PREFIX="https://mpaiva-cc.github.io/stratum"

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

2. REWRITE the title and summary into PLAIN LANGUAGE before posting.
   The Chairman has set a standing rule: Slack outbox messages must be
   readable by people with cognitive disabilities and people who don't
   know the technical jargon. Target reading level: 6th–8th grade.

   Plain-language rules to apply:

   a. SHORT SENTENCES. Aim for 15-20 words. Break long sentences into
      bullets.
   b. ACTIVE VOICE. "Tessera fixed X." not "X was fixed."
   c. COMMON WORDS over jargon. Examples:
        WCAG / AAA  →  "accessibility rules" / "the strictest level"
        aria-label  →  "the label screen readers read out loud"
        SVG nodes   →  "the names in the people-graph picture"
        contrast    →  "how dark the text is against the background"
        tabindex    →  "you can reach it with the Tab key"
        live region →  "the announcement area for screen readers"
        commit / PR →  "change" / "update"
        D-NNN       →  drop the decision ID; describe the decision
        CSS / DOM   →  "styling" / "page structure"
        token       →  "color" / "size" / "name" (depending on type)
   d. SPELL OUT acronyms on first use, then optionally short form.
      Don't lead with an acronym in the headline.
   e. NO file paths, no code snippets, no class names like ".echo-btn",
      no IDs like "A11Y-G01" in the Slack message. The archived JSON
      preserves all that for the record.
   f. LEAD WITH WHAT CHANGED for the reader. "Tessera made the people
      graph work with a keyboard." Not "Closed A11Y-G01 (WCAG 2.1.1)."
   g. USE BULLETS for lists of 3+ items. Each bullet starts with a
      verb. Keep each bullet to one line.
   h. EXPLAIN WHY when it's not obvious. "This helps people who can't
      use a mouse."
   i. NO double negatives. No "we didn't fail to ship the non-blocking
      gate." Say what happened, not what didn't.
   j. NO emojis other than the format prefix below (cognitive-load).
   k. CONCRETE numbers stay (3 fixes, 44 nodes, 95 pages). They're easy
      to read and concrete.

3. Post to Slack channel #poc-stratum using
   mcp__claude_ai_Slack__slack_send_message (channel_id: C0B41K5107Q).

   Format the message exactly as:

       **[{agent}]** {verb}: **{rewritten_title}**

       {rewritten_summary in plain language}

       {optional bullet list}

       → {url_if_link_present}

   Where:
     - {verb} is "shipped" (for type=publish), "needs help with"
       (for type=request), or "noted" (for type=event)
     - {rewritten_title} is a clear, plain-English headline (≤ 60
       chars when you can; up to 80 if needed)
     - Blank line after the title-line for readability
     - {rewritten_summary} is 2-5 sentences max, plain-language
     - If there are 3+ distinct changes, list them as bullets after
       a one-sentence lead — each bullet starts with a capital
       letter and a verb, no trailing period needed
     - {url} is "https://mpaiva-cc.github.io/stratum{link}"
       (DO NOT use stratum.ai — different company)
     - If urgency=high, prepend ":rotating_light: " to the entire
       message (only allowed emoji)

4. On successful post, move the file to
   /Users/mp/git-repos/poc-autonomous-hcm/agent-outbox/archive/ via `mv`.
   The archived JSON keeps the original technical summary for the record.

5. If a post fails, LEAVE the file in place and continue.

Be focused on readability. Process all entries.
Final output: one line per entry — "posted: <filename>" or
"skipped: <filename> — <reason>".
PROMPT_EOF
)

    /usr/bin/env claude -p "${PROMPT}" \
        --permission-mode acceptEdits \
        </dev/null >> "${LOG_FILE}" 2>&1

    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] drain complete" >> "${LOG_FILE}" 2>&1
) &

disown
exit 0
