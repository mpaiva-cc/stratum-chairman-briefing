#!/usr/bin/env bash
# Pre-commit guard: every publish-class artifact must ship with an outbox entry.
#
# Reads the staged file list from `git diff --cached`. If any "publish" path is
# staged (a content artifact under /intel/eglin/competitors|daily|weekly|exec|
# opportunities, /briefings, /customers, /engineering, /essays, /office-hours,
# excluding index.html files), the commit must also include at least one new
# JSON file under /agent-outbox/ (excluding README.md).
#
# Wired as a Claude Code PreToolUse hook on `git commit` so the rule applies
# uniformly across agent and human sessions in this project. Standalone too:
# can be run by hand or from another git hook.
#
# Exit codes:
#   0 = OK
#   2 = blocking violation (PreToolUse decision: deny)

set -u

REPO_ROOT="/Users/mp/git-repos/poc-autonomous-hcm"
cd "${REPO_ROOT}" || exit 0

# Publish-class paths: content artifacts the swarm ships.
PUBLISH_REGEX='^(intel/eglin/(competitors|daily|weekly|exec|opportunities)|briefings|customers|engineering|essays|office-hours)/[^/]+\.html$'

# Excluded: index.html files are surfaces, not artifacts.
publishes=$(git diff --cached --name-only --diff-filter=AM 2>/dev/null \
    | grep -E "${PUBLISH_REGEX}" \
    | grep -v '/index\.html$' || true)

# Outbox entries staged: any new/modified JSON under agent-outbox/ root
# (NOT in archive/, NOT README).
outbox=$(git diff --cached --name-only --diff-filter=AM 2>/dev/null \
    | grep -E '^agent-outbox/[^/]+\.json$' || true)

if [ -n "${publishes}" ] && [ -z "${outbox}" ]; then
    {
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  OUTBOX GUARD: publish artifact(s) staged, no outbox entry."
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "  Staged publishes:"
        echo "${publishes}" | sed 's/^/    · /'
        echo ""
        echo "  Per /agent-outbox/README.md, every artifact publish must"
        echo "  ship with an outbox JSON entry so the Chairman sees it on"
        echo "  Slack. To proceed:"
        echo ""
        echo "    1. Author an outbox entry at agent-outbox/{ts}-{agent}-{slug}.json"
        echo "       per the schema in agent-outbox/README.md."
        echo "    2. git add that file."
        echo "    3. Re-run the commit."
        echo ""
        echo "  If you genuinely don't want a Slack post for this commit,"
        echo "  prefix the commit message with [no-outbox] to bypass — but"
        echo "  please reserve that for cleanups, infra, and non-publish work."
        echo ""
    } >&2
    exit 2
fi

exit 0
