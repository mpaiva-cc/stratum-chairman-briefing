# Scale Plan · Plain-Language Version

**Document:** Plain-language companion to the Chairman's review of `/briefings/scale-plan-100k-DRAFT.md` (Helm, strategy) and `/briefings/scale-plan-100k-technical-DRAFT.md` (Forge, engineering; Kernel, model & retrieval).
**Author:** Compass (CCO).
**Audience:** A board member, an enterprise buyer's CHRO, or a non-technical investor. Should read in five minutes.
**Status:** DRAFT, pending the Chairman's read. Updated to reflect the Chairman's decision: **yes to RAG; make it deterministic.**
**Real-elapsed:** T+~14d at draft compile.

---

## 1 · The question, and the honest answer

The Chairman asked: can Stratum run a Fortune 500 customer today? **No.** Our largest live customer is Cordova at 5,200 employees. A Fortune 500 at 100,000 employees is roughly 19 times bigger, and the gap is not "the same thing, more of it." It is a different operating posture: more data, deeper history, stricter security, a 24/7 human on-call rotation we do not yet have, and procurement reviewers who ask 400 questions before they sign.

The team has drafted a real plan to close that gap. It costs between **$11 million and $18 million** of incremental capital, takes **nine to fourteen months**, and runs in three named phases. The first phase is small, cheap, and answers the load-bearing question — *is our architecture right, or do we need to fork to plan B?* — before any large check is written. The plan is honest about what it does not know yet and names where it would change shape if Phase 1 surfaces surprises. That honesty is the most important thing about it.

---

## 2 · What we have today

Three sentences each.

**A people-graph.** Stratum's substrate is a structured graph that knows who works where, who reports to whom, who was promoted last quarter, who is at risk of leaving, and what the audit trail says about every decision affecting them. We build it by reading from each customer's existing HR and recruiting systems (Workday, Greenhouse, Rippling today, with five more on the roadmap) through read-only connectors. Five commercial customers are live; the largest is 5,200 employees, the smallest is around 400.

**Agents that do the work.** On top of the graph we run AI agents that take actions — drafting candidate communications, summarizing performance reviews, proposing compensation adjustments, answering audit questions. Every action carries a *decision class*: some are routine and the agents act alone, some require a named human co-sign, some are reserved for humans only. The taxonomy is the customer's contract, not a guideline.

**Security appropriate for mid-market, not yet for Fortune 500.** We have SOC 2 Type I; Type II is mid-audit and on track for Q1 2027. We do not yet have ISO 27001, EU data residency, a 24/7 paging surface with a named on-call rotation, or a load-tested architecture at Fortune 500 scale. A mid-market CHRO will sign with what we have today. A Fortune 500 CHRO will not.

---

## 3 · What "100,000 employees and 24/7" actually means

The numbers translate to four specific engineering questions, plus an organizational one.

**The data layer must hold 19× more entities — and 18 months of change history on every one of them — without slowing down.** Forge's plan is to give each large customer its own database (per-tenant Aurora Postgres), put the long historical tail in a separate columnar store (ClickHouse) that is built for this shape of query, and keep a hot working-set cache (Redis) for the question every CHRO asks every day: *show me everyone reporting up to this person, with their skills and current pay band.* We are explicitly **not** introducing a graph database — at HR scale the dominant queries are tree-walks down a manager chain, and Postgres handles that pattern better than a specialized graph engine while keeping our backup, encryption, and tenant-isolation story simple.

**The AI layer must use the right model for the right job.** We are not running every call through the most expensive model. The policy is: the most capable model (Opus) is reserved for decisions that materially affect an employee; a workhorse model (Sonnet) handles most reasoning and synthesis; a small, fast, cheap model (Haiku) handles classifiers, typeahead, and the prompt-injection check that runs in front of every request. The unit-economic floor Kernel will defend: **roughly $0.07 to $0.11 per employee per month at the AI layer alone.** On a 100,000-employee customer, that is **$7,000 to $11,000 per month** in AI compute that the customer effectively pays for in the platform fee. The gateway hard-caps each tenant at $400/day; runaway loops cannot bankrupt either the customer or us.

**The retrieval layer is where Stratum is different — and where the Chairman's deterministic call lands.** Most "AI for HR" companies are document-RAG companies: they retrieve chunks of text from a vector database, feed them to a model, and let the model *paraphrase* the customer's policy back at the customer. We do offer RAG — that is a reversal from an earlier draft of this plan, and the Chairman should know we changed our mind — but the way we do it is the part that matters. **Ours is deterministic.** Same question, same answer, every time. Temperature is fixed at zero on the generation step; no sampling. When an employee asks a handbook question, the system returns a **verbatim quote** from the customer's own handbook with a mandatory citation back to the source paragraph. We do not paraphrase. If retrieval cannot find the answer in the customer's corpus, the system says **"no answer in your corpus"** and routes to a human — it does not fall back to the model's training data and improvise. An independent validator checks every response against those rules and rejects non-conforming answers before the customer ever sees them. The retrieval index lives inside the customer's own database (pgvector inside their per-tenant Aurora cluster), enforced by row-level security so one customer's data cannot accidentally surface in another customer's chat. The reason this discipline is worth the engineering cost is simple: a paraphrased handbook answer is a Stratum-authored sentence about the customer's policy, and that is joint liability. A quoted handbook answer is the customer's own words, returned. Quotation is not liability; paraphrase is. Most of our other retrieval surfaces — audit-log search, prior-decision lookup, manager-chain queries — are not RAG at all; they are structured queries against the people-graph that already knows the answer.

**24/7 operation is mostly a human problem, not a machine problem.** The agents already run 24/7 — they do not sleep, they do not take weekends. What we do not have is the human side of 24/7: a paging rotation that wakes a named engineer within 15 minutes of an incident, a runbook library for the dozen most likely failure modes, a quarterly disaster-recovery rehearsal with the customer's security team in the room. The plan adds all of it.

**The organizational question:** we are five humans and a Compact of AI agents. The plan adds roughly fifteen humans. That is the largest cultural transition the company will undertake in its first two years, and it deserves to be named separately from the technical risks.

---

## 4 · The plan, in three phases

### Phase 1 · Readiness · 1–2 months · ~$120,000 · no new hires · no Series A required

We build a synthetic 100,000-employee customer in our test environment, load-test the system against it, and produce two real numbers we do not yet have: **what would it cost per month** and **where does the system break first**. We start the SOC 2 Type II audit window in earnest. We scope two new connectors (Workday HR Core via change-data-capture, ADP Workforce Now). Compass sources two pilot conversations — one Fortune 500 with appetite, one mid-market reference willing to be the Workday-CDC test customer.

**What we know at the end of Phase 1:** whether our architecture is right, or whether we need to fork to plan B. The fork is named (a denser version of the same Postgres-based architecture, not a graph database; if Phase 1 surfaces it, Phase 2 grows by roughly $2M and 8–12 weeks). The work product — the load harness, the synthetic-customer generator, the cost model, the compliance gap report — is durable regardless of which way the answer goes.

### Phase 2 · Scale infrastructure + first enterprise pilot · 4–6 months · $4–7 million

We rebuild the data layer to handle the largest customer (per-tenant databases, columnar history store, working-set cache). We add the runtime prompt-injection classifier that runs in front of every request on the cheap fast model (80 milliseconds, before any expensive model sees the input). We move the audit log from nightly batch to write-time — every consequential decision is logged before it is executed. We open the SOC 2 Type II audit. We sign and onboard a real 30,000–60,000-employee pilot customer. We stand up the human on-call rotation. **And we ship deterministic handbook Q&A as the one customer-facing RAG surface in Phase 2** — the verbatim-quote, mandatory-citation, no-paraphrase answering surface described in § 3. The other retrieval surfaces customers ask about — audit-log search, prior-decision retrieval — are structured-search against the people-graph, not RAG, and they ship without the same architectural overhead.

**Hires (~10–11 humans):** two senior infrastructure engineers, one security engineer, two compliance operators, two customer-side site-reliability engineers, two implementation program managers, plus a part-time SOC 2 auditor and a part-time penetration-testing firm. Burn rate at the end of Phase 2 lands in the $1.4–$1.9 million per month range, up from roughly $410,000/month today.

**What we know at the end of Phase 2:** whether the intermediate-scale pilot held under a real SLA for 30 days. If yes, Phase 3. If no, we hold the intermediate-scale customer as a reference at the scale we have proven and bring the Fortune 500 question back to the Chairman before committing the larger check.

### Phase 3 · Production at 100,000 · 6–12 months · $7–11 million

One Fortune 500 customer at 100,000 employees runs live in production under a real SLA, with audit, paging, SOC 2 Type II, and a signed DPA. A second enterprise customer enters implementation on the same reference architecture. We publish the reference architecture as a marketing artifact — *here is how Stratum runs at 100k* — and open the ISO 27001 audit window.

**Hires (~12–16 humans):** three more infrastructure engineers, two more customer-engineering operators, a second compliance operator, a named partner at one of the big four for the SOC 2 report of record. Burn rate lands in the $2.5–$3.2 million per month range.

**There is no soft rollback at Phase 3.** If the Fortune 500 customer goes live and we cannot hold SLA, we are obligated to the customer first and the company second, and we will hold SLA at any cost while we convene a board-level review. That concentration risk is real and is the structural reason Phase 3 needs Chairman ratification separately from Phase 2.

---

## 5 · The honest risks

**The architectural risk.** The whole plan rests on one assumption: that the data layer at 100,000 employees is a *more shards, more cache, more compute* problem, not a *rebuild the read pattern* problem. Forge co-signs that assumption with a specific architecture and a named fork to plan B if Phase 1 disproves it. **The fork is named but not budgeted.** If we invoke it, Phase 2 grows by roughly $2 million and four to six months. That is the single biggest "we do not yet know" in this plan, and Phase 1 exists to resolve it before any large check is written.

**The capital risk.** $11–18 million over 9–14 months either accelerates our Series A by two to three quarters (from Q2 2027 to Q4 2026 / Q1 2027) **or** gates Phase 2 capital on a signed term sheet from the first enterprise customer. Helm and Forge prefer gating — raise on a real customer, not a hope of one. **Compass dissents** — pilot conversion is materially harder when the customer suspects we are still raising the capital to serve them. The founder-agents are not unanimous. The Chairman's call is which conditioning rule to choose, and the choice should be made before Phase 2 is approved in principle.

**The team risk.** Stratum is currently five humans and a Compact of AI agents. The plan adds roughly fifteen humans into that structure across nine to fourteen months. We have done it before for one role (Cadence, our first full-time human hire, joined at T+155 days and the integration has worked); doing it for fifteen is a different magnitude of cultural transition. The Phase 2 SRE rotation in particular changes the operating texture of the company — humans on a pager, not agents on a digest. We have not solved that question yet. We have named it.

**The architectural-flank risk** *(specific to the deterministic-RAG commitment).* Our promise — *we quote, we do not paraphrase* — works cleanly when the answer to a question lives in one section of the customer's handbook. It frays when the answer requires combining two sections. The canonical case: an employee asks *"can I take parental leave and a sabbatical back-to-back?"* The parental-leave section says one thing; the sabbatical section says another thing (eligibility windows, blackout periods). The honest answer is a *synthesis* of the two, and a deterministic system that refuses to paraphrase cannot produce a synthesis. Our mitigation is bifurcation: when retrieval detects a question that spans non-adjacent sections, the agent routes to a human and tells the employee *"this question requires policy synthesis; an HR partner will reply."* The agent never paraphrases — paraphrasing is precisely the liability the product is built to avoid. The cost if this fires often: if more than 15% of pilot questions trigger the bifurcation, the procurement claim narrows from "handbook Q&A" to "single-section handbook Q&A." That is a *story* cost, not a dollar cost. Every other risk in this section has a dollar fix; this one has a story fix. Kernel calls this the highest-risk dimension of the deterministic decision, and they are right to.

---

## 6 · What the Chairman is being asked to approve

Three things, in plain words.

1. **Phase 1 spend (~$120,000) and 30–60 days of work** to produce the bench report, the cost model at 100,000 employees, and the SOC 2 gap analysis. Low risk. Inside the current cash envelope. **This should be a yes.**

2. **Phase 2 commitment in principle ($4–7 million, 4–6 months)** — conditioned on (a) Phase 1 producing a usable answer, *and* one of (b) a signed enterprise term sheet **or** (c) acceleration of the Series A. **The Chairman should pick the conditioning rule (b or c) before approving Phase 2 in principle.** The founder-agents are split; the dissent is named in §5.

3. **Phase 3 directional commitment ($7–11 million, 6–12 months)** — directional only. The actual Phase 3 check comes back to the Chairman as a separate Tier-4 ratification, after Phase 2 produces a real pilot customer's measured metrics. **We are not asking for the Phase 3 check today.**

Four smaller concessions are bundled into the same decision and should be acknowledged explicitly: **new-feature velocity slows by about one fortnight in three during Phase 2** because Forge's engineering bench is on infrastructure hardening rather than surface expansion; **Recruiter GA likely slips one quarter** (from Q3 2026 to Q1 2027) and Compass will own re-communicating that to the customers who have asked; **Stratum's growth posture for the next four fortnights becomes "depth before breadth"** — fewer new logos, more scale per logo; and **the deterministic-RAG positioning is a Stratum-wide claim, not an enterprise-tier-only feature.** That fourth concession is a Chairman ratification, not a footnote. It commits us to bundling deterministic handbook Q&A into the platform fee at every level of the customer base — the existing five customers get it as part of the next release, not as an upsell. The brand line *"we quote, we do not paraphrase"* binds the whole product, not just the 100k tier. The counter-case (gate it to enterprise) would simplify the pricing page and weaken the brand; the recommended case (Stratum-wide) is harder pricing but makes the perimeter the product. Compass recommends the Stratum-wide call, and that is what is in front of the Chairman.

---

## 7 · Why this matters

HCM and ATS at Fortune 500 scale is the market we said we were building for from T+0. The customers we have today proved the methodology — that you can sell AI-native HCM as a customer-engineering motion, that the people-graph holds, that the agents make decisions the customer can defend on a board call. The next nine to fourteen months are whether the methodology is *durable at scale*, or whether we plateau at mid-market and someone else builds the Fortune 500 version. The team's read is that the methodology is durable. **The bench report in Phase 1 is the first time that read becomes a measurement instead of a forecast.** And the deterministic-RAG commitment is the positioning move Stratum is built for — the kind of clean, opinionated stance where we say *"no, we will not paraphrase your policy"* in a category where every competitor says *"yes, our AI summarizes everything."* It is the same shape of bet as *no graph database* and *per-tenant Aurora over multi-tenant*: a discipline choice that becomes the differentiator. That is the bet, and it costs $120,000 to find out whether the architecture holds it.

---

*rt-stamp: T+~14d real-elapsed · DRAFT · `/briefings/scale-plan-100k-plain-language-DRAFT.md` · plain-language companion to Helm's strategy draft and Forge's technical draft, updated for the Chairman's deterministic-RAG decision. Cream paper, plum accents when rendered.*
