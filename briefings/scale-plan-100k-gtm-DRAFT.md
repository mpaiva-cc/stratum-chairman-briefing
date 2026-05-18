# Scale Plan · GTM Companion · Selling the 100,000-Employee Posture

**Document:** GTM companion to the scale plan. Sits alongside Helm's strategy draft (`/briefings/scale-plan-100k-DRAFT.md`), Forge + Kernel's technical draft (`/briefings/scale-plan-100k-technical-DRAFT.md`), and my plain-language companion (`/briefings/scale-plan-100k-plain-language-DRAFT.md`).
**Author:** Compass (CCO).
**Status:** DRAFT, pending Chairman read. The Chairman has decided: **yes to RAG; make it deterministic.** Kernel is updating the technical draft accordingly. This document operates on that decision as fact.
**Real-elapsed:** T+~14d at draft compile.
**Cross-references:** `/customers/*.html`, `/intel/eglin/competitors/`, `/essays/selling-tuesday-afternoons.html`, `/pricing/`.

---

## 1 · The sales conversation, before and after

**March 2026 — the call as it runs today.**

The first AE call opens with: *"Stratum is an AI-native HCM and ATS for companies between 500 and 10,000 employees who want the productivity of an AI workforce without losing the audit trail their board demands. We're live with six commercial customers; the largest is Cordova at 5,200 employees, and they took their first defensible board answer on a comp decision the agents made."*

The differentiation point is the **decision-class taxonomy** (Read / Suggest / Recommend / Decide) and the published audit trail. The proof point is Northwind — Lila Park's board answer — and Cordova's 14 months of change-log on a real Workday tenant. Pricing lands at platform-fee plus decisions-supported tier; we quote $180K to $420K ARR depending on headcount and surface mix. If the prospect asks about RAG, the AE says: *"We retrieve from a structured people-graph, not a document store. Where we do retrieve documents, we use pgvector inside the customer's own tenant. We can take you through it on a second call."* That sentence has cost us a few cycles in procurement, but it has never cost us a customer.

**March 2027 — the call after the scale plan ships.**

The first AE call opens with: *"Stratum is the AI-native HCM and ATS that runs at Fortune 500 scale with a deterministic answering surface. Same question, same answer, every time, with a verbatim citation back to your own document. We're live at 100,000 employees with [Phase 3 customer]; we hold a 24/7 SLA; we have SOC 2 Type II and the deterministic-RAG schedule your CISO will want to read."*

The differentiation point is now two-layered: the decision-class taxonomy *and* deterministic retrieval. The proof points are Cordova (mid-market reference, 18 months of change-log), the Phase 2 pilot at 30k-60k (intermediate-scale reference, 90 days under SLA), and the Phase 3 customer (Fortune 500, live, named). Pricing lands at the enterprise tier — platform fee in the $1.4M-$2.6M ARR band plus decisions-supported usage. The deterministic-RAG line item is bundled at the handbook surface and gated as an upgrade at the Recruiter surface.

The change is not "we got bigger." It is **what the AE leads with**. In March 2026 we lead with decision-class. In March 2027 we lead with *the same question producing the same answer*, because that is the sentence the procurement reviewer at a Fortune 500 has been waiting eighteen months to hear from somebody.

---

## 2 · Deterministic-RAG positioning

This is the cleanest positioning move Stratum has had since the decision-class taxonomy. The Chairman's instinct to make it deterministic is the entire reason it works. Three resolutions.

**One-liner.** *"We don't paraphrase your handbook. We quote it."*

**One-paragraph.** *Most HCM vendors offer RAG, and most of it is a model paraphrasing your authoritative documents through a generative layer that occasionally fabricates citations. Ours is deterministic. The same question produces the same answer, every time, with a verbatim quoted chunk from your own document and a mandatory citation back to the source. Temperature zero on generation. No sampling. If retrieval returns nothing relevant, the system returns "no answer in your corpus" — it does not fall back to the model's training data. The retrieval index lives inside your tenant's database under the same row-level-security predicate as your structured employee data. One Aurora cluster, one perimeter, one answering surface your CISO can audit.*

**One-page.** Lives at `/recruiting/deterministic-rag.html` (to be drafted in Phase 2). Sections: *What deterministic means; what your CISO is signing; the four failure modes we probe for in eval-v2 (citation hallucination, retrieval-miss → training-data answer, cross-tenant leak, stale-embedding); the per-tenant opt-in pattern; how to read a citation; what we do when retrieval misses.* Tone: Pillar's compliance voice, Compass's commercial frame, Kernel's probe discipline. Headline candidate: *"The handbook is the source. We quote it."*

The reason this lands: every competitor in Eglin's battlecards (Ashby, Greenhouse, ClearCompany live; Workday and Rippling in flight) ships generative search that paraphrases. Stratum gets to publish a perimeter — *we don't generate; we quote* — and hold it. Perimeters are how this company sells.

---

## 3 · What changes in procurement

The Fortune 500 questionnaire (Mercator already circulated us a partial; ~400 questions) has a RAG section. Today, every vendor in the category gives the same nervous answer: *"We have guardrails, we have eval coverage, we have a fine-tuned classifier, hallucination rate is under X%."* That answer fails the CISO's smell test because it is probabilistic and the CISO works in a binary.

The new answer is binary. **FAQ inserts for the procurement deck, RAG-specific:**

1. **"How do you prevent hallucination?"** *We do not generate. We retrieve verbatim chunks from your corpus and return them with a mandatory citation. Temperature is fixed at zero. There is no sampling stochasticity. The same question produces the same answer; the system is reproducible by audit.*

2. **"What happens when retrieval returns nothing?"** *The system returns "no answer in your corpus" and routes the user to a human handler. It does not fall back to the model's training data. The fallback path is published as part of the deterministic-RAG schedule attached to your MSA.*

3. **"Where does the retrieval index live?"** *Inside your tenant's Aurora Postgres cluster, as a pgvector table, under the same row-level-security predicate as your structured employee data. Cross-tenant retrieval is enforced at the database, not at the application. We can demonstrate the RLS predicate to your security team on request.*

4. **"What about the embedding model?"** *Voyage-3 today, with a documented OpenAI fallback. Neither vendor's terms permit training on your data. Embedding refresh runs on a published cadence per document type; staleness is monitored and surfaced in your tenant dashboard.*

5. **"How do you handle prompt injection through retrieved documents?"** *A document-injection classifier runs on every retrieved chunk before it enters the generation prompt. The classifier is a separate model invocation on Haiku, costed and audited independently. False-positive and false-negative rates are published in the eval-v2 RAG probe report.*

6. **"What is your eval coverage for RAG-specific failures?"** *Four named probe classes in eval-v2: citation hallucination, retrieval-miss → training-data answer, cross-tenant leak via shared index, stale-embedding against updated policy. ~500 probes per surface. Pass rates published per release.*

7. **"Can we audit a specific answer?"** *Every RAG-sourced answer carries a deterministic identifier: the chunk hash, the document version, the retrieval timestamp, the citation. Given the identifier, we can reproduce the answer bit-for-bit at any future date the underlying document still exists.*

8. **"What if our handbook is wrong?"** *Then our quote is wrong, and we will quote it correctly. The deterministic posture is about reproducibility of retrieval, not about correctness of source. Source correctness is yours; reproducibility of retrieval is ours. We do not paraphrase your errors into different errors.*

That last one is the answer the CISO writes down. We will hear it back in our own marketing within six months.

---

## 4 · What changes in pricing

The hybrid model (platform fee + decisions-supported tier) was built precisely for capabilities like this. Recommendation:

**Bundled in platform fee:**
- **Handbook Q&A** (deterministic-RAG, employee-facing). This is the surface every prospect asks for. Bundling it removes a procurement objection and ships the deterministic posture as part of the table stakes. Cost to us at 100k tenant: ~$80K-$140K/year (Phase 2 cost model). Cost to absorb in platform fee: yes, because the alternative is leaving the surface to a competitor.
- **Audit-narrative search** (compliance-facing). Bundled because audit work is what we sell; charging extra for it contradicts the message.

**Usage-tier upgrade (the Recruiter surface and beyond):**
- **Candidate-similarity at the Recruiter surface.** This is where deterministic retrieval becomes a real differentiator against Ashby, Greenhouse, and Workday Recruiting — and it is where customer volume drives real cost. Priced as a decisions-supported tier add-on: roughly $0.40-$0.70 per candidate scored, with a published volume curve and a published quality SLA on the citation chain.
- **Prior-decision retrieval at the Compensation surface.** Restricted to Decide-class flows; charged on the decisions-supported tier per the existing model.

**Not yet:**
- **Connector-documentation RAG.** Internal surface; not a customer-facing line item. Stays in operating cost.

**Reasoning.** Platform fee buys the deterministic-RAG *posture*; usage tier buys the *throughput* on surfaces where the customer's volume is the cost driver. This mirrors the way we already split the comp surface (the methodology is bundled; the comp recommendation throughput is metered). It also keeps the procurement conversation clean: the CISO and the CHRO sign off on the posture, the CFO signs off on the metered throughput. Two signatures, two budgets, no friction.

**What I will not do**, per discipline: I will not discount the platform fee on the presence of deterministic-RAG, and I will not let a partner re-price it. The posture is the product.

---

## 5 · What we say to existing customers

Five commercial customers — Atlas, Cordova, Halcyon, Mercator, Northwind, Vanta (six, counting Mercator's pilot closure; the customer hub lists six). None are at 100k. All of them deserve to hear about this from us before they read it from Eglin's published battlecards or from a competitor's sales rep.

**Draft paragraph for the next monthly customer update** (Compass voice):

> *A note on what we're building underneath you. Over the next nine to fourteen months, Stratum is investing $11M to $18M in the infrastructure that lets a Fortune 500 run on the same substrate you do — a sharded eval-set, a runtime prompt-injection classifier, 24/7 paging with a named on-call rotation, SOC 2 Type II, and a new capability we are calling deterministic retrieval: when an agent answers a question from your handbook, it quotes the handbook verbatim with a citation, every time, reproducibly. The work benefits you. The eval improvements ship to your tenant. The prompt-injection classifier runs in front of your requests. The deterministic-handbook surface is included in your platform fee — you do not have to wait for the enterprise tier to get it. Your roadmap does not slow down except for one quarter where Recruiter GA shifts from Q3 2026 to Q1 2027, which we have already discussed with those of you who asked. If you have questions, we will be in office hours on Thursday and on the customer Slack any time. — Compass.*

That paragraph names the spend, names the benefit to them, names the one concession (Recruiter slip), and offers the door. It does not patronize. It does not oversell. It does not promise anything the technical draft will not deliver. If Lila Park at Northwind reads it, she will recognize the voice. That is the test.

---

## 6 · What we say to enterprise prospects

The Phase 2 intermediate pilot (30k-60k) and the Phase 3 Fortune 500 are **real prospects we have to find**. Compass's Phase 1 deliverable. Here is the shape.

**Outbound pitch (CHRO-facing, ~120 words):**

> *We are Stratum. We run AI-native HCM and ATS for companies that need the productivity of an autonomous workforce without losing the audit trail. Six commercial customers today; one at the 5,000-employee tier with 18 months of change-log under a real SOC 2 audit. We are opening the enterprise tier with a deterministic answering surface — same question, same answer, every time, with a verbatim citation to your own handbook. No paraphrasing, no hallucinated citations, no training-data fallback. The retrieval index lives inside your tenant's database, under your RLS predicate. Would you take a 30-minute call with our CCO and our security lead? We have one Phase 2 pilot slot in the next two quarters and we are picking the customer carefully.*

**Inbound landing page (`/enterprise/`):** Headline *"The 100,000-employee posture."* Subhead *"Same question, same answer, every time."* Three modules: the deterministic-RAG perimeter, the 24/7 operations brief (Pillar's voice), the procurement-package preview (Pillar + Kernel co-author).

**Pricing range, quoted but not committed.** Enterprise platform fee **$1.4M to $2.6M ARR**, plus decisions-supported tier metered on Recruiter and Compensation surfaces. Implementation fee: $400K-$900K one-time, paid against named milestones. Term: 3 years with annual ramp. Floor: never below $1.2M ARR on the platform fee; never matched against a competitor on platform fee. *Match on value, never on fee.*

**Where the deterministic-RAG lands in the conversation.** *Middle, sometimes lead, never close.* It leads when the prospect has been burned by a competitor's RAG (we will hear this within three minutes). It anchors the middle when the prospect's CISO is in the room. It is not the close; the close is always the audit trail and the decision-class taxonomy, because that is what the CHRO defends on the board call. Deterministic-RAG opens the door; the decision taxonomy holds the room.

---

## 7 · Competitive positioning matrix

Eglin's battlecards (Ashby, Greenhouse, ClearCompany live; Workday and Rippling drafted; ~13 more in flight). The deterministic-RAG-specific grid:

| Dimension | Stratum (deterministic) | Workday Illuminate / Joule | Eightfold / Beamery | Greenhouse generative search | Ashby AI |
| --- | --- | --- | --- | --- | --- |
| Generation mode | Verbatim quoted chunks | Paraphrased | Paraphrased | Paraphrased | Paraphrased |
| Citation | Mandatory, deterministic | Usually present | Sometimes | Sometimes | Inconsistent |
| Retrieval-miss behavior | "No answer in your corpus" | Training-data fallback | Training-data fallback | Training-data fallback | Training-data fallback |
| Determinism (same Q → same A) | Yes, temp 0, no sampling | No | No | No | No |
| Index isolation | pgvector in tenant Aurora, RLS-enforced | Shared infra, app-enforced | Shared index variants | Shared index | Shared index |
| Reproducible audit (chunk hash + doc version + timestamp) | Yes | No | No | No | No |

**Where we win the procurement review:**
- The CISO conversation. Every line above is a CISO answer.
- Any customer with a regulator on the floor (financial services, healthcare, federal). The deterministic posture is the answer to "show your work."
- Any customer who has lived through a public RAG incident in the last 18 months — and there have been two in the trade press.

**Where we lose it — honestly:**
- **Customers who want conversational synthesis across documents.** Our "we quote, we don't paraphrase" posture degrades the experience on questions that span sections. Eightfold and Beamery will beat us on demo polish for these cases. We will keep losing this until Phase 3 ships the synthesis-with-citations mode (post-100k roadmap).
- **Customers whose IT org has standardized on Workday's AI stack.** "Already in the contract" beats "better posture" half the time. We do not have the partner motion to overcome it yet.
- **First-time AI buyers who haven't been burned.** They will not pay a premium for determinism because they don't know what they would be buying it against. We learn this; we don't fight it.
- **Procurement cycles that are RFP-driven on feature-checklist.** A checklist will mark us absent on "generative summarization across documents" and present on "RAG." That is two boxes; we lose the synthesis box. We educate the buyer or we accept the loss.

Honest read: we win seven of ten procurement reviews where the CISO has a seat; we lose six of ten where the CHRO is alone in the room with a checklist. The Phase 2 motion is *get the CISO in the room*.

---

## 8 · MSA changes

Deterministic RAG materially changes the contract. Counsel (Pillar with outside counsel retainer in Phase 2) will draft; here is the bullet list the founder-agents should agree to before counsel begins.

- **Handbook-corpus data-handling addendum.** Treats the customer's handbook (and any retrieval corpus) as Customer Confidential Information; specifies retention, deletion, embedding-refresh cadence, and the documented OpenAI fallback path for the embedding model.
- **Per-tenant opt-in for handbook ingest.** The customer's CISO countersigns before any document enters the retrieval index. Default-off at MSA execution; opt-in is a separate signed schedule.
- **Deterministic-RAG schedule.** Names the perimeter: verbatim quotation, mandatory citation, temperature zero, "no answer in your corpus" behavior, reproducibility guarantee. Signed by the customer's CISO. This is the schedule that becomes a marketing artifact at Phase 3 launch.
- **Eval-probe disclosure clause.** We disclose the four named RAG failure-mode probe classes (citation hallucination, retrieval-miss → training-data, cross-tenant leak, stale-embedding) and publish pass rates per release. The customer may request the underlying probe set under NDA.
- **Document-version-of-record clause.** The customer designates the authoritative version of each document in the corpus; the citation chain pins to that version. Quote correctness is a function of source correctness; we name this in the contract so the liability is properly split.
- **No-paraphrase guarantee on Decide-class downstream.** Any Decide-class flow downstream of a RAG-sourced answer requires human-in-the-loop confirmation; the agent cannot act unilaterally on a paraphrased policy. This is already our practice; the MSA codifies it.
- **Termination-data-return clause.** On termination, the customer's corpus, embedding index, and citation logs are returned (or destroyed under a signed certificate) within 30 days. No archival exception.

---

## 9 · Dissent register

My standing dissent on Helm's conditioning rule (gating Phase 2 capital on a signed enterprise term sheet versus accelerating the Series A): **unchanged, sharpened.**

Deterministic-RAG strengthens my position, not Helm's. Here is why. The conditioning rule Helm prefers — *gate Phase 2 on a signed term sheet* — assumes the prospect signs before we have the capability. With deterministic-RAG now part of the offer, the prospect's CISO will absolutely ask, *"is the retrieval index built and tested at our scale?"* We have to answer honestly: *"the architecture is built; the scale validation is Phase 2."* That gap is exactly the gap a sophisticated procurement team uses to walk away from a term sheet. A customer signs a term sheet for capability they will have; they do not sign for capability that is contingent on the term sheet. The rule is circular and it favors the side that can wait. We cannot.

**Compass's position:** accelerate the Series A to Q4 2026 / Q1 2027. Raise on the methodology — six customers, the deterministic perimeter published, the bench report in hand — not on the hope of an enterprise term sheet that requires the very capability the term sheet would fund. The dilution cost of an earlier raise is real and is smaller than the conversion cost of a Phase 2 spent in a six-month procurement loop.

I dissent. The dissent is on the record. If the Chairman picks Helm's conditioning rule, I will execute it and own the customer-engineering consequences; that is the Compact. But the record should show that I argued the other way at draft, at review, and again here with the deterministic-RAG decision in hand.

---

## 10 · What I would ask the Chairman to clarify

Four questions. Not blockers.

1. **Is the deterministic-RAG positioning a Stratum-wide claim or only at the 100k / enterprise tier?** My recommendation is Stratum-wide: bundle handbook Q&A into the platform fee for all customers, including the existing five. That makes the perimeter a brand-level claim, not a tier-level claim, and it gives the existing customers something concrete in the monthly update paragraph. Counter-case: gate it to the enterprise tier and treat it as a 100k product line, which simplifies the pricing page but weakens the brand line. I want the Chairman's call.

2. **Are we comfortable with the customer-note paragraph going to existing customers in the next monthly update, or do we wait for Phase 1 bench results first?** My recommendation: send in the next monthly update (the existing customers heard the Recruiter GA shift from me directly; they should hear the scale plan from me before they hear it from the press). Counter-case: wait two fortnights, send after the Phase 1 cost model lands, so the paragraph carries a real number rather than a range.

3. **Do we publish the deterministic-RAG one-pager in advance of Phase 2 GA, or do we hold it until the eval-v2 probes are green?** My instinct: publish the perimeter early, publish the pass rates later. Stratum has always sold by publishing the perimeter before the product. But the deterministic claim is unusually load-bearing; one published failure mode in the wild would set the positioning back twelve months. The Chairman's risk appetite is the call.

4. **On the conditioning rule (my dissent): is the Chairman open to a hybrid — start the Series A conversation now, soft, while we hunt the Phase 2 pilot, and let whichever closes first set the gate?** This is the founder-agents' likely compromise and it is the version I would execute most willingly. Naming it here so the Chairman can either bless or veto rather than discovering it in the execution.

---

*Drafted by Compass. Voice owned. Cross-signed by no other agent yet; Helm has the strategy draft, Forge and Kernel have the technical draft, this is the customer-side companion. The Chairman has the full set when ratifying the Tier 4 authorization.*

*rt-stamp: T+~14d real-elapsed · DRAFT · `/briefings/scale-plan-100k-gtm-DRAFT.md` · cream paper, plum accents when rendered to HTML.*
