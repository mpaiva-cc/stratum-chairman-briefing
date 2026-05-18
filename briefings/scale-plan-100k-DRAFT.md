# Scale Plan · The 100,000-Employee Question

**Document:** Capital + Strategic Plan, DRAFT for Chairman approval
**Tier:** 4 (capital authorization, strategic direction) — per `/agents/governance.html`
**Authors:** Helm (CEO), to be co-signed by Forge (CTO) and Compass (CCO) before submission
**Status:** DRAFT · Helm voice · not yet ratified by Forge or Compass
**Real-elapsed:** T+~13d at draft compile · authored in the same wall-clock window as Briefing No. 015
**Decisions referenced:** D-258 (people-graph as MCP server), D-262 (connector MCP read-only), R11/R16/R17 (risk register)
**Cross-references:** `/briefings/015.html`, `/agents/governance.html`, `/graph/mcp.md`, `/engineering/how-stratum-runs.html`, `/financials/`, `/customers/cordova.html`

---

## 1 · The honest answer, in one paragraph

**We cannot handle a 100,000-employee enterprise today.** Our largest production deployment is Cordova at 5,200 employees (`/customers/cordova.html`); 100k is approximately **19× that footprint**, and the system has not been load-tested anywhere near it. The people-graph has been profiled against synthetic graphs up to roughly 25,000 nodes in Forge's bench harness, not against a real 100k-employee tenant with the full edge density a Fortune 500 produces (manager chains, role history, skill-edges, comp bands, the 18-month change-log). The MCP surface, three fortnights old, has not been exercised under sustained agent-to-agent load. The connector layer is read-only on three integrations; Workday at 100k scale will require a different ingestion architecture than the one Yield wrote for Cordova. Customer engineering is two agents (Compass and one operator pattern); a 100k deployment will not survive that ratio. **The path to handling 100k is credible and we have drafted it below. It takes 9–14 months of real-elapsed time, somewhere between $11M and $18M of incremental capital authorization, and a willingness to slow new-feature velocity for at least one fortnight in three until Phase 2 closes.**

That is the question the Chairman asked. The rest of this document is the work behind that paragraph.

---

## 2 · Current capacity, stated honestly

### What we have actually run

| Surface | Largest real footprint | Largest synthetic load-test | Honest assessment |
| --- | --- | --- | --- |
| People-graph (read) | ~5,200 nodes (Cordova) | ~25,000 nodes, synthetic, single-tenant | Comfortable to ~10k. Unproven beyond. |
| People-graph (write/change-log) | Cordova, ~14 months of history | None at scale | Change-log table cardinality is the unknown. |
| MCP graph server | 4 customers, low-QPS | None | Live for ~13d real-elapsed. Zero stress data. |
| Connectors (Workday, Greenhouse, Rippling) | Cordova nightly + on-demand | None | Yield wrote them for 5k-class tenants, not 100k. |
| Console (tool-first UI) | ~40 named users per tenant | None | Per-tenant cap unknown. |
| Recruiter | Cordova + Halcyon, low write rate | None | Match endpoint is the hot path. |
| Eval set | 21 MCP probes, 94.2% pass | n/a | Probe count is the constraint, not runtime. |
| Audit trail (Pillar) | Nightly digest, ~5 customers | None | Storage growth at 100k is unmodeled. |
| Customer engineering | 7 customers / 2 agents | n/a | Will break first at scale. |

### What we do not know yet — and how we'd find out

The honest gaps, in order of how much they would shape the plan if we knew the answer:

1. **People-graph read p95 at 100k nodes with 18 months of change-log.** Forge can produce this number with two weeks of focused work and a synthetic-tenant generator he has scoped but not built. **Action: D-2xx, "tenant-scale synthesizer," Phase 1.**
2. **Connector throughput against a real Workday tenant of 100k.** We cannot synthesize this; we need either a sandbox from Workday (Yield has the contact) or a pilot customer willing to let us shadow-ingest. **Action: Compass to source one of two; Phase 1.**
3. **MCP surface behavior under sustained agent traffic with adversarial probes.** Kernel's eval set covers correctness, not load. The two are independent failure modes. **Action: load-and-adversarial harness, Phase 2.**
4. **Cost per tenant at 100k.** Model inference, storage, connector compute. We have unit costs at 5k but the curve is not linear. **Action: Forge + Yield, cost model, Phase 1.**

We will not commit to a 100k pilot until at least items 1, 2, and 4 are answered. Item 3 can be retired during Phase 2 in parallel with pilot onboarding.

---

## 3 · Where the system breaks first — ordered by binding constraint

Forge, Kernel, Yield, Pillar, and I walked this list. We do not all agree on the ordering past item 4; I have noted where.

1. **Customer-engineering capacity.** A 100k deployment needs a named implementation lead, an integration agent dedicated to that one tenant, and a security-review counterpart who can move at the customer's pace. We do not have those slots. *Binds before any technical constraint.*
2. **Connector throughput, specifically Workday HRIS at 100k.** Yield's current ingestion is a nightly full-snapshot pattern. At 100k with the change-frequency a Fortune 500 generates, we need incremental change-data-capture or we will not stay current within SLA. *This is the single technical constraint Forge and Yield agree binds next.*
3. **People-graph reads under MCP load.** D-258 made the graph the protocol surface. We have not load-tested it as one. The query that dominates the working set — "give me everyone reporting up to X, with their skill vectors and current comp bands" — is exactly the query that doesn't scale linearly. *Forge ranks this above #4; Kernel ranks it below.*
4. **Eval-set runtime as a regression gate.** At current probe count (~340 across all surfaces, ~21 MCP-specific), the nightly runner takes about 90 minutes. At the probe count we'd want for a 100k tenant (Kernel's estimate: ~1,200), the runner becomes a >6-hour job that no longer fits a nightly cadence. We will need a sharded runner. *Kernel ranks this above #3.*
5. **Audit trail and change-log storage.** Pillar's nightly digest is currently a single-node compaction job. The 100k case multiplies the change-log write rate by at least the customer-count factor; the digest job will not fit its window.
6. **24/7 on-call coverage for agents.** Today, agent failures are caught on a roughly business-hours cadence with Pillar's nightly digest as backstop. A 100k tenant cannot wait for the morning digest.
7. **Security-review readiness.** A Fortune 500 procurement gate involves a SOC 2 Type II report, a penetration test by a named third party, a documented data-residency posture, and answers to ~400 questions on a vendor questionnaire that Mercator already partially circulated to us. We have ~40% of that package.
8. **Model availability and fallback.** We run primarily on a single model family. At enterprise SLA we need a documented fallback that can take over a decision class within a stated RTO.
9. **Prompt-injection defense at scale.** Kernel's MCP probes cover the known attack patterns. The 100k surface area is also a 100k *adversarial* surface — every external agent calling our MCP surface is a probe whether it means to be or not. R17 in B015 opens this risk; the plan below closes it within Phase 2.
10. **Cost guardrails and runaway-loop protection.** Our current per-tenant cost ceiling is a soft alert on Pillar's nightly digest. At 100k, a runaway loop in an agent can burn five figures of inference before the morning digest sees it.

The ordering matters because it dictates the spend. Item 1 (customer engineering) and item 2 (connectors) are where the first dollars go. The technical-research items (3, 4, 9, 10) are where the next dollars go. The compliance items (7, 8) are where the slowest-cycle dollars go, and they have to start now because they take the longest wall-clock time to complete.

---

## 4 · What "24/7 continuous-operation" actually requires

The Chairman asked about continuous operation, not just scale. They are related but separate. The autonomy redirect at T+~31h moved us toward continuous *decision-making*. Continuous *operation against a 100k production tenant* is a different threshold. Forge has written about most of these constraints in `/engineering/how-stratum-runs.html`; I am pulling the load-bearing items.

1. **Incident response within minutes, not hours.** Stratum needs a paging surface that wakes an on-call agent (Pillar-equivalent, plus a human escalation path) inside the customer's SLA. Today there is no paging surface. There is a nightly digest.
2. **Model availability with documented fallback.** Every decision class (match, summarize, propose-comp, draft-message) has to have a documented primary model, a documented fallback, and an automated cutover that doesn't depend on a Forge commit. Time-to-cutover for the most expensive classes should be under 60 seconds.
3. **Prompt-injection defense as a runtime gate, not a build-time gate.** Kernel's eval set is the build-time gate. We need a runtime classifier in the MCP request path that flags scope-escalation, tool-confusion, and replayed signatures. R17 names this.
4. **Cost guardrails per tenant, per decision class, per agent.** A hard cap that throttles before it burns. The cap should be in three places: the model gateway, the agent's own loop, and Pillar's monitoring.
5. **Decision-class audit at write rate.** Today Pillar audits in batch. At 24/7 against a 100k tenant we need write-time audit on every Tier 2+ decision the agents make. The log is the legal artifact under a Fortune 500's procurement gate.
6. **Runaway-loop protection.** Every agent loop has a step counter, a time budget, and a cost budget. None of those exist today as enforced runtime gates. They exist as norms.
7. **The eval set as a continuous regression gate.** Not nightly. Continuous. Every deploy of every agent surface re-runs the relevant probe slice before traffic shifts.

The above is not 100% Forge's view; he and Kernel disagree on whether item 3 (runtime prompt-injection classifier) needs to be in the request path or in a sidecar. Phase 2 will resolve that with the load-and-adversarial harness.

---

## 5 · The plan

Three phases. Named owners. Explicit asks. Decision gates between each phase the Chairman can use to stop the plan.

### Phase 1 · Readiness · 30–60 days real-elapsed · NO CAPITAL RAISE REQUIRED

What we can do inside the current budget envelope.

**What we build**
- Tenant-scale synthesizer for a 100k-employee shaped graph with realistic change-log. *Owner: Forge.*
- Load harness against the synthesized tenant for the graph (read), the connector layer (write), and the MCP surface (mixed). *Owner: Forge with Kernel review.*
- Cost model at 5k, 25k, 50k, 100k. *Owner: Forge + Yield.*
- Two pilot conversations: one Fortune 500 with appetite, one mid-market reference customer willing to be a Workday-CDC test. *Owner: Compass.*
- Compliance gap analysis against the Mercator questionnaire, mapped to the SOC 2 Type II controls we already have. *Owner: Pillar with Kernel.*
- Paging surface design doc — what we will build, not yet built. *Owner: Forge.*

**What we hire** — *nothing.* This phase is the existing team running the experiments.

**What we spend** — incremental ~$120K against current burn, principally for Workday sandbox access, a synthetic-data license, and a 30-day engagement with a third-party SOC 2 auditor for the gap analysis. Inside the existing $7.82M cash position, runway impact is one week.

**What success looks like** at end of Phase 1
- A signed answer to: *can the people-graph hold a 100k tenant at our SLA?* (yes / yes-with-changes / no — we have not yet answered.)
- A signed answer to: *what will a 100k tenant cost us per month?* with a unit-cost curve.
- A named pilot customer or two named candidates, with a draft term sheet pattern.
- A compliance gap list, sized, with a critical path to SOC 2 Type II readiness.

**Rollback** — if Phase 1 concludes the graph fundamentally cannot reach 100k without a re-architecture, we pause and bring the architectural question back to the Chairman before committing to Phase 2 capital. The pause is the rollback. The work product (synthesizer, harness, cost model) is durable regardless.

**Decision gate to Phase 2** — Helm, Forge, Compass unanimous + Chairman review of the gap report. If we pass the gate we draw on the Phase 2 capital ask; if we don't, we propose an alternative.

---

### Phase 2 · Scale infrastructure + first enterprise pilot · 60–180 days real-elapsed · $4–7M ASK

The capital is allocated against four buckets.

**What we build**
- People-graph re-shard for the multi-tenant 100k case. *Owner: Forge.*
- Workday CDC ingestion. *Owner: Yield.*
- Runtime prompt-injection classifier in the MCP request path. *Owner: Kernel.*
- Sharded eval-set runner; eval becomes a continuous regression gate, not a nightly job. *Owner: Kernel + Forge.*
- Paging surface, on-call rota, runbook library. *Owner: Pillar.*
- Cost guardrails enforced at the model gateway and in every agent loop. *Owner: Pillar + Forge.*
- Audit trail at write-time for every Tier 2+ decision. *Owner: Pillar.*
- SOC 2 Type II audit window opens. *Owner: Pillar with external auditor.*
- Customer-engineering motion: named implementation lead per enterprise tenant, dedicated integration agent. *Owner: Compass.*

**What we hire** (capital ask covers ~9–11 of these)
- Two senior infrastructure engineering operator-patterns (Forge's bench).
- One named customer-engineering operator (Compass's bench, dedicated to the pilot).
- One compliance operator (Pillar's bench).
- One security operator (Kernel's bench).
- A part-time SOC 2 auditor of record.
- A part-time penetration-testing firm.
- Two GTM operator-patterns to source the Phase 3 customer pipeline (Compass's bench).
- Optional: an outside counsel retainer specific to enterprise procurement and DPAs.

**What we spend** — **$4M to $7M incremental over 4 months**, ramping. The wide band reflects: pilot customer concessions (will we offer the first deployment at cost, or at discount?), the auditor cost (varies 3× depending on scope), and the headcount mix (more operators vs. more outside firms). Burn rate at the end of Phase 2 is in the range of $1.4M to $1.9M per month, against current $410K/mo run-rate ramping to $720K/mo.

**What success looks like** at end of Phase 2
- One enterprise pilot live at a 30k–60k tenant (intermediate scale), running for at least 30 days, with audit, paging, and SLA met.
- SOC 2 Type II audit window opened, controls remediated, expected report date scheduled inside Phase 3.
- Eval set as a continuous regression gate, p95 deploy-to-traffic-shift under 30 minutes.
- Cost per tenant inside the curve modeled in Phase 1, with no surprises >25%.
- Customer engineering ratio at 1 implementation lead + 1 integration agent per enterprise tenant.

**Rollback** — if the intermediate-scale pilot fails on SLA or cost, we pause the 100k pursuit, complete SOC 2 Type II anyway (it is durable independent of scale), and bring the question back to the Chairman with the lessons before committing Phase 3 capital. We do not abandon the intermediate-scale tenant; we hold it as a reference at the scale we have proven.

**Decision gate to Phase 3** — Chairman approval explicit, given that Phase 3 is where we cross the threshold to "you have signed an enterprise contract you cannot quietly walk back from."

---

### Phase 3 · Production 24/7 with the 100k customer live · 180+ days real-elapsed · $7–11M ASK

**What we build**
- Production deployment of the named 100k customer.
- Geographic redundancy if the customer's data-residency posture requires it (likely for any Fortune 500).
- Disaster-recovery rehearsal, quarterly, documented.
- Continuous procurement-questionnaire response posture — Compass's bench answers a questionnaire in <5 business days, not <20.
- Model-fallback automation across decision classes, RTO under 60s for the top three.
- A documented reference architecture other enterprise customers can use as the basis for their own deployments — the second 100k is cheaper than the first or we have failed.

**What we hire** (capital ask covers ~12–16 of these)
- Three more infrastructure operator-patterns.
- Two more customer-engineering operator-patterns (the second enterprise customer will land in this phase).
- A second compliance operator for the audit cycle.
- A named partner at one of the big four for the SOC 2 Type II report of record (already engaged in Phase 2; deepens here).
- A documented reseller / SI relationship (Compass to source; this is the question we have not asked and probably should).

**What we spend** — **$7M to $11M incremental over 6 months**, ramping. Burn at end of Phase 3 is in the range of $2.5M to $3.2M per month. **This is the spend that moves the Series A timing forward.** See §7.

**What success looks like** at end of Phase 3
- One named Fortune 500 customer live, 100k employees, paying, under SLA, with audit, paging, SOC 2 Type II, DPA, the full procurement package.
- A second enterprise customer in implementation, on the reference architecture, under contract.
- Cost per tenant at 100k inside the modeled curve.
- The second tenant onboards in less than half the calendar time of the first.

**Rollback** — there is no soft rollback at this phase. If the 100k customer goes live and we cannot hold SLA, we are obligated to the customer first, the company second; we will hold SLA at any cost, then convene a Tier 4 review. The Chairman is the escalation. The plan therefore has a structural concentration risk in Phase 3 that we should name explicitly.

---

## 6 · Total capital ask, summarized

| Phase | Window | Incremental capital | Cumulative cash needed | Burn at end |
| --- | --- | --- | --- | --- |
| Phase 1 | 30–60d | ~$120K | inside current envelope | ~$450K/mo |
| Phase 2 | 60–180d | $4M–$7M | $4.1M–$7.1M | $1.4M–$1.9M/mo |
| Phase 3 | 180–360d+ | $7M–$11M | $11.1M–$18.1M | $2.5M–$3.2M/mo |

**Range: $11M to $18M incremental, over 9–14 months real-elapsed.**

Mapped against our current $7.82M cash and the Series A target of $25M at $120M pre in Q2 2027: **the plan accelerates the Series A by approximately two to three quarters,** because Phase 2's burn exits the comfortable runway window we currently hold. We either move the Series A forward to Q4 2026 / Q1 2027, or we do not enter Phase 2 capital draw until we have a signed term sheet. Forge and I both prefer the term-sheet contingency. Compass prefers the earlier raise on the grounds that pilot conversion is harder without the capital committed visibly. This is the most significant strategic concession in the plan and we are asking the Chairman to choose.

---

## 7 · What we are asking the Chairman to approve

This is the operative section. Everything above is the work behind it.

1. **Capital authorization range: $11M–$18M incremental over the next 9–14 months,** in three phases as scoped above. Phase 1 needs no new authorization. Phase 2 needs ~$4M–$7M committed before draw. Phase 3 needs ~$7M–$11M committed before draw. We are asking the Chairman to authorize the range; the specific phase draws come back as Tier 4 decisions at the gate.
2. **Hiring authorization: ~12 to ~18 operator-patterns and ~3 to ~5 external firms** over the plan window. Specific hires are Tier 1 or Tier 2 under the existing Compact; we are asking the Chairman to bless the envelope, not each role.
3. **Series A timing concession.** We are asking the Chairman to choose between (a) move the Series A forward to Q4 2026 / Q1 2027, or (b) gate Phase 2 capital draw on a signed term sheet. We have a preference (option b) but the founder-agents are not unanimous; Compass dissents.
4. **Velocity concession.** We are asking the Chairman to accept that **new-feature velocity slows by at least one fortnight in three during Phase 2**, principally because Forge's bench is on infrastructure hardening rather than surface expansion. Recruiter GA likely moves from the current implied Q3 2026 to Q1 2027.
5. **Recruiter GA timing.** Specifically: we are asking the Chairman to acknowledge that Recruiter GA slips one quarter to make room for the scale work. Compass will own re-communicating this to the customers who have asked.
6. **Strategic posture concession.** We are asking the Chairman to accept that **Stratum's growth posture for the next four fortnights is "depth before breadth"** — fewer new logos, more scale per logo. Compass's pipeline will be re-shaped accordingly.

The three concessions (Series A timing, velocity, posture) are what make this a Tier 4 decision rather than a Tier 3. They change the company's strategic shape. The Chairman is the right decision-maker.

---

## 8 · The highest-risk assumption in this plan, named

There are many risks in this plan; one is structurally larger than the others.

**The plan assumes the people-graph at 100k is a quantitative problem (more shards, more cache, more compute) rather than a qualitative problem (the read pattern doesn't scale and we re-architect).** Phase 1's tenant-scale synthesizer is designed precisely to resolve this assumption. If Phase 1 concludes it is qualitative — that the graph needs to be re-architected for the 100k case — the plan changes shape significantly: Phase 2's $4M–$7M is closer to $7M–$10M, and the wall-clock window stretches by 4–6 months. We have flagged this as the load-bearing assumption and have not budgeted for the qualitative outcome. We will report back at the Phase 1 gate.

A secondary risk worth naming: **Phase 3 is concentrated on a single named customer we have not yet identified.** Compass's Phase 1 work names them; until then, the plan's last leg is a placeholder. The Chairman should know this. The mitigation is in §5 Phase 3: the second enterprise customer must be in implementation before Phase 3 closes, or we have built a one-customer business at the largest scale and that is its own risk class.

---

## 9 · Outcomes designed for

The Chairman has three options on this draft. The plan is structured so each is a clean decision.

- **Approve as drafted.** Phase 1 begins immediately on Chairman countersign. Phase 2 and 3 trigger at the gates with separate Tier 4 ratifications.
- **Send back with questions.** The most likely shape: clarify the Series A timing concession, push back on the Recruiter GA slip, ask for a second pass on the capital range. We will return inside one fortnight with the revisions.
- **Counter-propose.** The most likely counter: "Start Phase 1 but defer Phase 2 capital authorization until Compass names the customer." That counter is reasonable and we are prepared to operate under it; it slows the plan by one fortnight at most.

We did not draft a "decline" option because the Chairman asked the question. Declining is sending it back to ask whether we should be pursuing enterprise scale at all, and that conversation predates this plan.

---

*Drafted by Helm. Awaiting Forge and Compass co-signatures before submission as a Tier 4 ratification. The decisions ledger entry will be a single D-number covering the authorization range; phase gates will be separate D-numbers as they trigger. The Chairman has a 7-day veto window on every logged decision under the Compact.*

*rt-stamp: T+~13d real-elapsed · DRAFT · `/briefings/scale-plan-100k-DRAFT.md` · cream paper, deep ink, ochre rule when rendered to HTML.*
