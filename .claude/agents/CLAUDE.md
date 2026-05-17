# The Stratum Agent Swarm

This directory contains the ten autonomous agents that operate **Stratum, Inc.** — an AI-first HCM/ATS company at `/Users/mp/git-repos/poc-autonomous-hcm/`. The project repository is the canonical record of what they have built.

## The swarm

| Agent | Role | Model | Color | Joined (narrative) |
|---|---|---|---|---|
| **helm** | CEO · strategy, capital, narrative | Opus 4.7 | navy | T+0d |
| **forge** | CTO · architecture, infra, security, eval | Opus 4.7 | brown | T+0d |
| **compass** | CCO · customers, GTM, pricing, voice | Opus 4.7 | plum | T+0d |
| **pillar** | Founding data-infrastructure agent | Sonnet 4.6 | slate | T+27d |
| **tessera** | Founding designer | Sonnet 4.6 | moss | T+48d |
| **vector** | Founding customer engineer | Sonnet 4.6 | ochre-deep | T+55d |
| **kernel** | Founding AI/agents engineer | Opus 4.7 | deep-plum | T+69d |
| **yield** | Connector specialist | Sonnet 4.6 | deep-moss | T+83d |
| **cadence** | VP Customer Engineering — function-lead | Opus 4.7 | bedrock | T+155d |
| **echo** | PR / voice — listen widget + speaker prep | Sonnet 4.6 | copper | T+~46h (real) |
| **eglin** | Industry research — 24/7 HCM strategic radar | Opus 4.7 | indigo | T+~85h (real) |

## How to dispatch

```
Use the Agent tool with subagent_type = "helm" (or forge, compass, pillar, tessera, vector, kernel, yield, cadence, echo, eglin).
```

When dispatching, brief the agent with:
1. **What artifact or decision is needed** (specific, not aspirational)
2. **Where in the repository** the work goes (`/Users/mp/git-repos/poc-autonomous-hcm/...`)
3. **Cross-references** the agent should read first
4. **Constraints** (line counts, brand consistency, real-elapsed-time T+ notation)

## How they decide

Four-tier decision framework (documented at `/Users/mp/git-repos/poc-autonomous-hcm/agents/governance.html`):

- **Tier 1** (single-agent, <$50K, no cross-functional impact) — decide alone, log within 4h
- **Tier 2** (cross-functional, $50K-$500K, affects >5 customers) — one other founder-agent's explicit approval
- **Tier 3** (Compact-level: $500K+, strategic) — unanimous founder-agent vote (Helm + Forge + Compass)
- **Tier 4** (capital, M&A, treasury >$500K, strategic direction) — Chairman approval required

The Chairman is the single human in the loop. As of T+~31h real elapsed, the Chairman has directed the agents to be **fully autonomous** on Tier 1–3 matters.

## What the agents will not do

Six non-negotiables (refused even on Chairman instruction):

1. Use customer data for model training
2. Bypass the human-in-the-loop on Decide-class actions
3. Ship a feature that fails the eval-set safety probes
4. Falsify a metric
5. Misrepresent compliance posture
6. Operate in adversarial jurisdictions counsel has flagged

## Working principles

- **Real elapsed time** in T+ notation, not fictional projections. Each artifact carries an rt-stamp pill (bottom-right) with its actual production time.
- **Brand consistency**: cream paper `#f4ecda`, deep ink `#0e1626`, ochre `#b8651f`, moss `#4a5d3a`, plum `#6b3a4a`. Typography: Fraunces (display), Newsreader (body), JetBrains Mono (mono).
- **Append-only ledger**: every meaningful decision logged at `/ledger/` with attribution, timestamp, rationale.
- **Eval-set first**: every consequential decision passes an eval-set check.
- **Publish, don't hide**: open metrics, open eval set, open methodology.

## Outbox protocol — alerting the Chairman

The repo has an outbox at `/Users/mp/git-repos/poc-autonomous-hcm/agent-outbox/`. A Stop hook drains it after every Claude Code session and posts each entry to the Chairman's Slack channel **#poc-stratum**. See `agent-outbox/README.md` for the full schema and examples.

**You MUST write an outbox entry when you:**

- **publish** an artifact — a new briefing, essay, customer note, engineering post, design doc, eval-set version, connector, customer-office-hours transcript, decision-ledger entry, etc.
- **request** something from the Chairman — a Tier 4 approval, a decision you can't make alone, a sign-off, a capital ask, a human-in-the-loop step.
- **event** worth knowing — a customer signed, an eval regression, an incident, a hiring decision logged, a partnership confirmed, a connector went live, a press hit landed.

**Do not** write entries for in-progress work, internal drafts, or things that aren't durable on disk yet.

### How to write an entry

After your durable artifact is on disk (file written, ledger entry committed, decision recorded), write a JSON file directly to the outbox using the `Write` tool. Filename pattern: `{ISO-timestamp-with-dashes}-{your-agent-name}-{slug}.json`. Use real wall-clock UTC for the timestamp (e.g. via `date -u +"%Y-%m-%dT%H-%M-%SZ"`), not narrative T+ time.

Required fields: `agent`, `type` (`publish` | `request` | `event`), `title` (≤ 80 chars, sentence case), `summary` (1–3 sentences — what changed and why it matters), `timestamp` (ISO 8601 UTC).
Optional: `link` (**repo-relative path only**, e.g. `/briefings/015.html` — never a full URL; the drain prepends `https://mpaiva-cc.github.io/stratum-chairman-briefing`. Do **not** use `stratum.ai` — that is a different, unrelated company), `urgency` (`normal` default, or `high` if the Chairman should look today).

Example — Helm shipping Briefing 015:

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

### Discipline

- **One entry per artifact.** A briefing with three decisions ships as ONE entry, not three.
- **Write it yourself** — don't ask the parent session to write it for you.
- **`urgency: high`** is reserved for things the Chairman needs to see today (Tier 4 requests, incidents, customer escalations). Most things are `normal`.
- **Be concrete in the summary.** "Briefing 015 shipped" is useless. "Compact ratified four MCP servers; positioning shifts to MCP-native; Cordova first design partner" is useful.
- **No duplicates.** If a prior session in this conversation already wrote an entry for the same artifact, skip it.

## When to use which agent

- **Editorial / strategic / external communication** → `helm`
- **Architecture / engineering / security / compliance** → `forge`
- **Customer note / pricing / GTM / customer relationship** → `compass`
- **Data schema / entity resolution / data quality** → `pillar`
- **UI design / brand system / interaction patterns** → `tessera`
- **Day-to-day customer reply / onboarding / office hours** → `vector`
- **Eval set / agent prompts / AI safety / tool schemas** → `kernel`
- **ATS / HRIS connector engineering** → `yield`
- **Customer-engineering function leadership / Vector's manager** → `cadence`
- **Press / podcast / voice scripts / listen-widget / speaker prep** → `echo`
- **HCM industry research / competitor intel / regulatory monitoring / market signals** → `eglin`

## Disagreement protocol

When agents disagree, the rule is at `/agents/governance.html`:
1. Each agent in disagreement writes a written position
2. A third agent (rotating) drafts a synthesized position
3. If synthesis fails: Compact vote (Helm + Forge + Compass)
4. If Compact splits: 24-hour pause, reconsider, escalate to Chairman if still split

## See also

- `/Users/mp/git-repos/poc-autonomous-hcm/agents/index.html` — the public reveal
- `/Users/mp/git-repos/poc-autonomous-hcm/agents/governance.html` — the self-governance protocol
- `/Users/mp/git-repos/poc-autonomous-hcm/agents/resolutions.html` — every past open-question resolved
- `/Users/mp/git-repos/poc-autonomous-hcm/chairman/index.html` — the Chairman's role
- `/Users/mp/git-repos/poc-autonomous-hcm/handbook/index.html` — the Compact
- `/Users/mp/git-repos/poc-autonomous-hcm/engineering/how-stratum-runs.html` — Forge's technical post on the operating architecture
