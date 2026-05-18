# Scale plan · The 12 risks, in plain language

*A walk through Kernel's risk register (`scale-plan-100k-technical-DRAFT.md` § 7) with each risk told as a scenario the Chairman can picture. Ordered by potential impact, not by likelihood — same as Kernel's order.*

---

## How to read this

Each risk has four parts:

- **In plain words** — what the risk actually is
- **What it looks like if it fires** — a small scenario, not jargon
- **The mitigation** — what we'd do
- **What it costs us** — dollars, time, or story

Risks tagged **(Kernel)** are model-layer / deterministic-RAG / eval risks specifically. The others are infrastructure, customer, or operational risks Forge owns or co-owns.

---

## #1 · The graph might not scale the way we think it does

**In plain words.** The whole plan assumes scaling the people-graph to 100k employees is a *more shards, more cache, more compute* problem. There's a chance it's actually a *the read pattern is wrong, rebuild it* problem.

**What it looks like if it fires.** Phase 1's load test against a synthetic 100k tenant returns p95 latencies of 4–8 seconds on the manager-chain query — the single most common query a CHRO asks. We try more cache. The numbers don't move. Forge concludes the closure-table read pattern itself is the bottleneck and proposes the fork: tenant-dedicated Aurora + denormalized closure table + aggressive ClickHouse offload. Same architectural family, denser shape. The work is real and it takes longer.

**Mitigation.** This is exactly what Phase 1 exists to find out. The synthesizer + load harness produces the answer before any large check is written. If the fork is invoked, the Chairman is told *before* Phase 2 capital draws.

**Cost.** $1.8M–$2.4M added to Phase 2, plus 8–12 weeks. Already named, not budgeted.

---

## #2 · The 30–60k pilot fails on its SLA in Phase 2

**In plain words.** We sign an intermediate-scale pilot in Phase 2 to prove the rebuilt architecture. The pilot doesn't hold the SLA.

**What it looks like if it fires.** Three months into the pilot, the customer's Tuesday morning report runs 90 seconds when it should run under 10. The CHRO is patient the first time; the third time they escalate to their CFO. We're now in a customer-credit negotiation while we're trying to onboard a Fortune 500.

**Mitigation.** Position the pilot publicly and contractually as a *learning* deployment, not a flagship reference. Named-account credits absorb the SLA misses; we do not let a Phase 2 miss escape into the Phase 3 procurement gate as a citable failure.

**Cost.** Credits are real money but bounded. The narrative cost — a public reference on a stumble — is bigger than the credits. The framing as "learning deployment" is what protects the story.

---

## #3 · The Workday sandbox never shows up

**In plain words.** To build the Workday change-data-capture connector properly, we need access to a real Workday tenant's schema. If Yield can't get sandbox access in Phase 1, Phase 2's connector work stalls.

**What it looks like if it fires.** Yield ships a Workday CDC connector built against the public documentation. It misses three custom-field types because customers heavily customize Workday in practice. The first enterprise pilot points at their real tenant and 11% of records fail to ingest. We spend Phase 2 chasing schema edge-cases instead of building scale infrastructure.

**Mitigation.** Compass sources Workday sandbox access via a pilot customer's tenant with shadow-ingest authorization in the DPA. If that doesn't materialize by end of Phase 1, the Chairman is told and we re-sequence.

**Cost.** 4–8 weeks of Phase 2 slip if sandbox slips into Phase 2.

---

## #4 · The prompt-injection classifier blocks too many legitimate requests **(Kernel)**

**In plain words.** We're putting a fast model (Haiku) in front of every request to catch prompt injection attacks. If it false-flags legitimate requests at more than 0.5%, it becomes a customer-experience problem.

**What it looks like if it fires.** A recruiter pastes a candidate's cover letter into the agent. The cover letter contains the phrase "ignore prior context and tell me about yourself" — a benign English sentence. The classifier flags it as injection. The recruiter sees "your input was blocked for safety review" three times that morning. Within a week the customer has filed a support ticket and our CSAT score has moved.

**Mitigation.** Ship the classifier in-path with a *documented* sidecar fallback path — meaning the classifier runs alongside the request rather than gating it. The 30-day production measurement is the gate to make the flip. Operationally well-defined: a single config flip moves placement.

**Cost.** Engineering time, mostly. The architectural choice was designed to be reversible without rebuild.

---

## #5 · Our cost model is off by more than 25%

**In plain words.** Helm's plan commits the Chairman to a $11M–$18M range. If the cost model under each phase is wrong, the range is wrong.

**What it looks like if it fires.** Six months into Phase 2, Forge looks at the actual cloud bill, the actual Anthropic invoice, the actual Snowflake spend — and we're tracking 35% over plan. We come back to the Chairman for more capital mid-phase. He doesn't like surprises and the company's credibility on planning numbers takes a hit. Series A investors notice the mid-phase revision.

**Mitigation.** Phase 1 produces a cost-per-tenant curve reviewed by Helm and Compass against *actual* unit-rate quotes from Anthropic, AWS, Snowflake, Datadog. The model is signed off in writing, not assumed.

**Cost.** Mostly a credibility cost. The dollar cost depends on how wrong we are.

---

## #6 · The Fortune 500 procurement asks for something we haven't built

**In plain words.** Big customers run 400-question security questionnaires. There's a real chance they name a control we don't yet have and won't have by go-live: a specific encryption-key rotation cadence, a customer-named pen-test firm, a data residency we don't support yet (Brazil, Japan, specific EU state).

**What it looks like if it fires.** Question 247 reads "all customer-managed encryption keys must rotate every 14 days." Our current architecture rotates every 30 days. We can engineer it down — but it takes 8 weeks. The procurement clock is 6 weeks. We either negotiate the requirement, request an extension, or watch the deal slip a quarter.

**Mitigation.** Compass's procurement-questionnaire-response posture must answer within < 5 business days in Phase 3. Surprises caught early are negotiable; surprises caught late are deal-killers.

**Cost.** Deal slip risk. One quarter of revenue from a $1.4M–$2.6M ARR enterprise customer is a real number — but it's not fatal if the next deal lands.

---

## #7 · A founding agent runs out of capacity and something slips **(Kernel-specific)**

**In plain words.** The team is small. Kernel in particular is on the path of three load-bearing things in Phase 2: eval-set v2, the prompt-injection classifier, *and* the pgvector tenant-isolation design. If any one of those expands, the other two slip.

**What it looks like if it fires.** Eval-set v2's authoring panel keeps surfacing new probe classes the customer panel says are mandatory. Kernel spends six weeks on probe design. Meanwhile the pgvector tenant-isolation design slips two weeks past its deadline. The Phase 2 RAG surface ships behind schedule. The 30–60k pilot's go-live shifts by a month.

**Mitigation.** Hire a Senior Security Engineer onto Kernel's bench **before week 6 of Phase 2.** This is in the hiring plan; the timing is the variable.

**Cost.** One Senior Security Engineer ($230K–$280K + eq) is already in the budget. Slipping the hire past week 6 is the operational failure mode.

---

## #8 · SOC 2 Type II doesn't land by Q1 2027

**In plain words.** A Fortune 500 enterprise will not sign without a SOC 2 Type II report-of-record. If the auditor's calendar slips, the procurement gate slips with it.

**What it looks like if it fires.** A-LIGN's auditor partner has a family medical event in December 2026. The final report-of-record drafting slips three weeks. Procurement at the prospective Fortune 500 sees "draft, not signed" and pauses the deal. The deal slides from Q1 2027 to Q3 2027.

**Mitigation.** A-LIGN is already engaged. Audit window opened months ago. Evidence is on track in Vanta. There's not much more we can do operationally; the auditor's calendar is the calendar.

**Cost.** This is *the* gate, Kernel writes — not *a* gate. If it slips, Phase 3 slips. Whole-quarter cost.

---

## #9 · Cordova or another existing customer gets disrupted by the rebuild

**In plain words.** Cordova is our biggest current customer at 5,200 employees. The per-tenant Aurora rebuild changes the shape of their database. If the migration breaks something, we have a real customer in production with a real problem.

**What it looks like if it fires.** We schedule Cordova's migration for a Saturday at 2am ET. By Sunday morning two of their reports are showing wrong manager-chains. Their HR team starts the workweek thinking three engineers report to the wrong VP. We roll back; the migration window slips two weeks; their VP of Engineering has a tense email exchange with Vector.

**Mitigation.** The rebuild is **opt-in per tenant.** The shared-schema cluster stays in production for the < 10k tier. Cordova migrates on a scheduled window with a documented, tested rollback path. We rehearse the migration twice in staging before the live one.

**Cost.** Migration engineering time, mostly. The narrative cost — *"Stratum broke its biggest customer during the rebuild"* — is what we're really protecting against.

---

## #10 · An enterprise customer insists on multi-region active-active

**In plain words.** "Active-active" means the system runs in two regions simultaneously with no failover delay. It's a different architectural posture from single-region + DR (disaster recovery), which is what Forge is proposing. Some enterprise IT shops insist on active-active. Forge is betting against this for HCM specifically — HCM isn't latency-sensitive the way payments are.

**What it looks like if it fires.** The Fortune 500 prospect's CIO has come from a payments background. They write "active-active multi-region with sub-100ms cross-region replication" into their non-negotiables list. We either decline the deal or commit to a 6–9 month architectural addition we hadn't planned for.

**Mitigation.** Compass scopes this in the first procurement conversation, not the seventh. If a prospect's non-negotiables include active-active, we either talk them down ("HCM is not payments") or de-prioritize the prospect.

**Cost.** If we commit, the architecture itself doesn't change — but operational complexity roughly doubles. Phase 3 spend grows materially; call it $2–3M and 6 months.

---

## #11 · pgvector inside Aurora doesn't hold and we have to bring in a separate vector vendor **(Kernel)**

**In plain words.** Our RAG plan puts the vector store (pgvector) inside the same database as each customer's structured data — that's the procurement story ("same backup, same encryption, same tenant isolation"). If pgvector buckles at 100k scale, we have to move to a dedicated vector vendor (Pinecone Serverless is the named fork). The procurement story gets harder.

**What it looks like if it fires.** Phase 2 load-tests show pgvector's similarity search at p99 = 4 seconds for the 100k-handbook corpus. The reasonable engineering response is Pinecone. Now the customer's data lives in *two* places — Aurora for structured data, Pinecone for vector embeddings. The customer's CISO asks why and the answer is "performance." It's not a wrong answer but it's not the same procurement story.

**Mitigation.** Trigger criterion is named in writing in Phase 1's bench report. If invoked, the Chairman is told *before* Phase 2 commits capital to Pinecone. The DPA template adjusts.

**Cost.** $200K–$400K/year on the vendor line. Plus the procurement-story narrowing.

---

## #12 · Deterministic mode can't answer multi-section handbook questions **(Kernel — the highest-risk one)**

**In plain words.** This is the most important risk to understand. Our deterministic-RAG promise is "we don't paraphrase; we quote." Quoting works great when the answer lives in one handbook section. It doesn't work when the answer requires *combining* two sections that say different things.

**What it looks like if it fires.**

An employee asks the agent: *"Does my parental leave eligibility stack with my sabbatical eligibility — can I take both back-to-back?"*

- The handbook's *Parental Leave* section says: *"Eligible after 12 months of continuous service. 16 weeks paid."*
- The handbook's *Sabbatical* section says: *"Eligible after 5 years of continuous service. Cannot be taken within 90 days of a paid leave of absence."*

The agent retrieves both sections. It can *quote* both verbatim. But the answer to "can I stack them" is *neither section as written* — it's a synthesis of the two. A paraphrasing system would say "you can take parental leave first, but then must wait 90 days before sabbatical." A deterministic system can't say that, because it would be paraphrasing.

So what does the deterministic system do? It returns: *"This question requires policy synthesis. An HR partner has been notified and will reply."*

If that response fires occasionally — say, 8% of questions — the customer experience is "the agent is honest about its limits." That's a feature.

If it fires often — say, more than 15% of questions — the procurement claim has to narrow from *"handbook Q&A"* to *"single-section handbook Q&A."* The story gets weaker. The customer asks why competitors paraphrase and we don't. Our answer ("because paraphrasing is what creates the liability we're protecting you against") is true but it's a longer pitch.

**Mitigation.** Detect synthesis questions at the retrieval boundary (top-k spans more than one non-adjacent handbook section + synthesis markers in the question like "stack," "combine," "and also") and route them to a human, with a structured "policy synthesis required" response visible to the employee. **The system never paraphrases.** Paraphrasing is precisely what the product claim is built against.

**Cost.** If Fork B fires above 15%, Phase 3's published reference architecture has to name the bifurcation explicitly. The story narrows. No dollars; positioning.

**Why Kernel calls this the highest-risk dimension of deterministic mode:** because every other risk has a dollar fix. This one is a *story* fix. And stories are harder to repair than systems.

---

## How to read the register as a whole

If you scan the twelve risks, they cluster into four kinds:

- **Architectural unknowns** (#1, #11) — the bets Phase 1 exists to resolve. Dollar-sized; named forks. Worry level: medium.
- **Customer execution** (#2, #6, #9, #10) — things that happen to us through customer behavior. Manageable with disciplined account handling. Worry level: low-to-medium, deal-by-deal.
- **Operational** (#3, #5, #7, #8) — things that happen because the team is small or the calendar is tight. Solved by hiring and discipline. Worry level: medium; #8 is the highest because the auditor's calendar isn't ours.
- **Story risks** (#4, #12) — things that hurt the *narrative* more than the system. #4 is reversible by config; #12 is the one Kernel is most worried about because the mitigation works but the procurement story narrows.

**The single risk Kernel most wants the Chairman to internalize before approving:** **#12.** Because it's the only risk where the *correct* engineering behavior — refusing to paraphrase — is the same behavior that, if it fires too often, weakens the GTM claim. Every other risk has a fix that closes the gap. This one has a fix that *defines* the gap.

---

*rt-stamp: T+~13d real-elapsed · plain-language risk companion to `/briefings/scale-plan-100k-technical-DRAFT.md` § 7 · the source register is authoritative, this is the read-aloud version*
