# Agent outbox

This directory is the queue where Stratum agents post things the Chairman should know about. A Stop hook (`.claude/hooks/outbox-to-slack.sh`) drains it after every Claude Code session and posts each entry to **#poc-stratum** on Slack, then moves the file to `archive/`.

## When to write an entry

A Stratum agent (helm, forge, compass, pillar, tessera, vector, kernel, yield, cadence, echo) should drop a JSON file here whenever:

- **publish** — a new artifact ships (briefing, essay, customer note, engineering post, design doc, eval-set version, connector, etc.)
- **request** — the agent needs something from the Chairman (decision, approval, capital, sign-off, human-in-the-loop step)
- **event** — something the team should know happened (customer signed, eval regression, incident, hiring decision logged, partnership confirmed)

If it would belong in a fortnightly briefing, it belongs in the outbox.

## Entry schema

One JSON file per entry. Filename: `{ISO-timestamp}-{agent}-{slug}.json` (colons replaced with dashes; safe for filesystems).

```json
{
  "agent": "helm",
  "type": "publish",
  "title": "Briefing No. 015 — MCP-native HCM and ATS",
  "summary": "Compact ratified four MCP servers (graph, console, recruiter, connectors). Positioning shifts from 'MCP-compatible' to 'MCP-native'. Cordova named first design partner.",
  "link": "/briefings/015.html",
  "urgency": "normal",
  "timestamp": "2026-05-15T11:14:00Z"
}
```

### Fields

| Field | Required | Values |
|---|---|---|
| `agent` | yes | One of: helm, forge, compass, pillar, tessera, vector, kernel, yield, cadence, echo |
| `type` | yes | `publish` · `request` · `event` |
| `title` | yes | Short headline (≤ 80 chars). Sentence case. |
| `summary` | yes | 1–3 sentences. What changed and why it matters. |
| `link` | no | Repo-relative path to the artifact (e.g. `/briefings/015.html`). Omit if not applicable. |
| `urgency` | no | `normal` (default) · `high` (Chairman should look today). |
| `timestamp` | yes | ISO 8601 UTC. Use the real wall-clock time you wrote the entry, not narrative T+ time. |

## Example entries

### A publish

```json
{
  "agent": "compass",
  "type": "publish",
  "title": "Customer note 06 — Meridian Energy",
  "summary": "Meridian signed at $110K Year-1. German-language customer-engineering proven; Yield led discovery in German. Sixth customer note now live.",
  "link": "/customers/meridian.html",
  "urgency": "normal",
  "timestamp": "2026-05-16T09:02:00Z"
}
```

### A request

```json
{
  "agent": "forge",
  "type": "request",
  "title": "Chairman approval — SOC 2 Type II auditor selection",
  "summary": "Three quotes received. Forge recommends Prescient Assurance ($48K). Tier 4 because $500K trailing-twelve treasury threshold engaged. Need go/no-go by 2026-05-22.",
  "urgency": "high",
  "timestamp": "2026-05-16T14:30:00Z"
}
```

### An event

```json
{
  "agent": "kernel",
  "type": "event",
  "title": "Eval set v1.2 shipped — 96.8% pass (+0.4 pp)",
  "summary": "Added 14 MCP-specific probes and the EU pay-transparency bias probe. Regression on Q-217 (compensation-tradeoff scenario) being investigated.",
  "link": "/eval/index.html",
  "urgency": "normal",
  "timestamp": "2026-05-16T16:10:00Z"
}
```

## How the drain works

1. Stop hook fires after a Claude Code session ends in this project.
2. Hook script (`/Users/mp/git-repos/poc-autonomous-hcm/.claude/hooks/outbox-to-slack.sh`) checks for `*.json` files in this directory (not in `archive/`).
3. If any exist, it spawns a short `claude -p` subprocess that:
   - Reads each entry
   - **Rewrites the `title` and `summary` into plain language** (see below)
   - Posts the rewritten, formatted message to **#poc-stratum** via the Slack MCP
   - Moves the original (unrewritten) file to `archive/` — the technical detail is preserved for the record
4. If the post fails, the file stays in place and is retried next session.

### Plain-language rewrite — why and how

The Chairman set a standing rule: Slack outbox messages must be readable by people with cognitive disabilities and by people who don't know the technical jargon. Target reading level: 6th–8th grade.

Agents can write their outbox entries in their normal, technical voice. The drain takes care of the translation. The original technical text stays in the archived JSON for traceability; the version posted to Slack is the plain-language version.

Rules the drain applies:

- **Short sentences** — 15–20 words each. Break longer ones into bullets.
- **Active voice** — "Tessera fixed X" instead of "X was fixed."
- **Common words over jargon** — `WCAG AAA` becomes "the strictest accessibility rules"; `aria-label` becomes "the label screen readers read out loud"; `SVG nodes` becomes "the names in the people-graph picture."
- **Spell out acronyms** on first use.
- **No code snippets, no class names, no decision IDs, no file paths** in the Slack message. Those are preserved in the archived JSON.
- **Lead with what changed for the reader** — not with the criterion ID.
- **Bullets** for 3+ items. Each bullet starts with a verb.
- **Explain why** when it's not obvious.
- **No double negatives.** Say what happened, not what didn't.
- **No emojis** other than the optional urgency siren. (Lower cognitive load; better screen-reader experience.)
- **Concrete numbers stay** — "3 fixes," "44 names," "95 pages" are easy to read.

### URL prefix for the `link` field

The GitHub Pages canonical host for this repo is **`https://mpaiva-cc.github.io/stratum-chairman-briefing`**. The drain prepends that prefix to the repo-relative `link` value when posting to Slack. Agents write only the repo-relative path (e.g. `/briefings/015.html`), never the full URL.

> **Do not use `stratum.ai`.** That domain belongs to a different, unrelated company. The Stratum project's public URL is the GitHub Pages address above.

## Operating notes for agents

- **Write the entry yourself.** Don't ask the parent session to write it for you.
- **One entry per artifact.** A briefing with three decisions ships as one entry, not three.
- **`high` urgency is for things that need Chairman attention today.** Most things are `normal`.
- **Don't write entries for in-progress work.** Only when something is durable (file written, decision logged, event occurred).
- **Don't duplicate.** If the prior session already wrote an entry for the same artifact and it's still in the queue, skip.
