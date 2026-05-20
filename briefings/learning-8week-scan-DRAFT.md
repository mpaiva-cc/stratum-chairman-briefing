# HCM Learning — 8-Week Market Scan

**Author:** Eglin (Industry Research, Stratum)
**Date:** 2026-07-25
**Window covered:** 2026-06-01 → 2026-07-25
**Status:** DRAFT — internal circulation
**Companion to:** `briefings/learning-research-DRAFT.md` (2026-05-28)
**Reading time:** ~9 minutes

---

## TL;DR

Eight weeks in, the Cairn positioning thesis is holding. Workday has shipped **Illuminate Learning** on top of the Sana acquisition — earlier and more thoughtful than I expected, but still anchored on *consumption*, not *demonstration*. Cornerstone went quiet on AI; that is its own signal. The EU AI Act Annex III deadline lands in eight days (Aug 2) and our two largest category competitors have **not** publicly disclosed how they comply. The EEOC's June AEDT-adjacent guidance memo widens our regulatory exposure window from "2027" to "this quarter" — Pillar should re-validate the AEDT wall *this week*, not next quarter. CHROs are openly distrustful of AI skill assessments without human attestation. That is the wedge.

**Recommended actions this week:**

1. **Helm + Pillar:** re-validate AEDT-wall posture in light of EEOC June memo. (Tier 2.)
2. **Compass:** the "consumed vs demonstrated" framing landed verbatim in a Workday Rising floor panel. Use it.
3. **Forge:** publish (or pre-publish to counsel) our Annex III compliance posture before Aug 2. We are ready; Workday and Cornerstone visibly are not. This is a positioning gift.
4. **Vector + Tessera:** the Pluralsight closed-loop reference design is the category-defining artifact of Q4. Protect the timeline.

---

## 1. Workday × Sana — what shipped, what didn't

Workday closed the Sana acquisition in May. On **July 18**, at the Workday Customer Summit, they launched **Workday Illuminate Learning** — the rebranded Sana product line, now integrated into the Workday HR Core data model.

**Verified (from the summit keynote, customer-facing release notes, and three customer LinkedIn write-ups):**

- Integration with Workday HR Core: learner profile, role, manager, and org hierarchy are now live signals into the Illuminate content graph.
- Content-graph generation from customer-uploaded materials (PDFs, video, internal wiki exports). This is the Sana feature, now native to Workday.
- A "learning copilot" surface in the Workday shell that recommends content based on the inferred skill graph.

**Claimed but not yet verified:**

- *Closed-loop verification of skill demonstration via work-artifact analysis.* This was demoed on stage but has not been documented in release notes, and no customer has shown it running on real artifacts. The demo used a synthetic dataset. **Treat as marketing until a customer reference exists.**
- "Responsible AI by default" — standard Workday boilerplate; no model card, no bias audit, no Annex III disclosure.

**Strategic read.** Workday now owns content + graph in one silo. That is real and we should not under-rate it. But the silo is the constraint: Illuminate's graph is built from content Workday's customers upload *into Workday*. It does not reach into Stratum-style heterogeneous evidence (PRs, design files, support tickets, Pluralsight completions, customer-call transcripts) without significant integration work that Workday has historically not invested in.

Our positioning is unchanged and arguably sharper: **graph-agnostic, closed-loop, on top of whatever content the customer already pays for.**

---

## 2. Competitor moves, June 1 – July 25

**Workday (with Sana).** Covered above. Headline launch of the window. Real product, but stops at consumption.

**Cornerstone.** Quiet quarter. Q2 earnings call (July 24) did **not** announce an "agentic" learning layer, which I had flagged as expected in the original brief. Management said they are "investing in AI-native learning experiences" without naming a product, a timeline, or a customer. Two prospect conversations (anecdotal, via Vector) describe accelerating displacement to Workday and to point-solutions. *Signal: Cornerstone is watching and waiting. The longer they wait, the more of their installed base is in play.*

**Degreed.** Announced "Degreed Verify" on July 9 — a credential-attestation feature for completed learning paths. Reads as a defensive move against the "completion ≠ demonstration" critique. Marketing-heavy: the announcement page describes the feature; the docs page describes a beta with two reference customers, both internal Degreed partners. *Signal: the attestation framing is becoming table-stakes language even where the product does not yet exist. Good for category education; weak as a competitive threat.*

**360Learning.** Shipped "Coach AI" on June 24 — a peer-coaching recommender. Genuinely interesting product, narrow scope, very European in its compliance framing (explicit Annex III posture in the launch post, which is more than Workday or Cornerstone have done). Not a direct competitor; potentially a partner for the EU market.

**Eightfold.** Released "Talent Intelligence v6" on July 2 with a "skills evolution" module. The module infers skill change over time from internal mobility data. Heavy on inference, light on attestation. CHROs in the SHRM survey (below) are exactly the audience that distrusts this. *Signal: Eightfold is doubling down on inference at the moment the market is moving toward attestation.*

**Multiverse.** Raised a Series E (announced June 17, $220M reported, undisclosed valuation). Pivoted public messaging from "apprenticeships" to "evidence-based skill development." The language is converging on ours. They remain a services-led business with a software wrapper; we are software-first. Different shape, overlapping vocabulary.

**Sana (the product, pre-Workday).** Now fully absorbed. The standalone product is in maintenance; the Sana brand will sunset in Q4 per a July 18 footnote. Worth noting because some prospects still ask about Sana by name.

**The brutal read.** Of seven competitor moves in the window, **two** (Workday Illuminate, 360Learning Coach AI) are real product. **One** (Degreed Verify) is positioning-as-product. **Three** (Cornerstone, Eightfold, Multiverse) are messaging without underlying product change. **One** (Sana) is a sunset. The category is talking faster than it is shipping.

---

## 3. Regulatory & legal

**EU AI Act — Annex III high-risk learning provisions.** Effective **2026-08-02**. Eight days from this brief. Annex III now classifies learning-recommendation systems that influence hiring, promotion, or compensation as high-risk. Our M1 (auditability) and M2 (human-attestation gate) mitigations, shipped by Forge / Counsel in W04, satisfy the obligations as currently interpreted. Workday's Illuminate Learning has not publicly disclosed an Annex III posture; nor has Cornerstone. That silence is itself a market signal — and a positioning opening for Compass.

**NYC AEDT.** No direct learning-tool action this quarter. However, the **EEOC quietly issued a June guidance memo** clarifying that learning-recommendation tools that *demonstrably influence promotion* can be classified as AEDT-adjacent. This is not law; it is enforcement intent. **It widens our regulatory exposure window from 2027 to mid-2026.** Pillar should re-validate the AEDT-wall schema-layer posture this week.

**California ADAv2.** Passed **June 14**, effective 2027. Establishes state-level WCAG 2.2 AA for adaptive learning content. Tessera and Forge have been flagged; the architectural impact is modest because our component library is already WCAG 2.2 AA, but adaptive-flow accessibility (state changes, focus management on AI-generated content) needs an explicit conformance pass before 2027.

**Pay-transparency × skills, state-level.** Three bills in active markup: **CO HB 2026-1144**, **WA SB 6022**, **NJ A.3019**. All would require disclosure of skill-based pay deltas. Forge's schema-layer AEDT wall holds; our exposure is low because we don't compute pay deltas — we surface evidence to humans who do. Pillar should monitor floor votes.

---

## 4. Customer-side signals

**SHRM Members Survey, June 2026 (n=2,140 CHROs and senior L&D).** Headline finding: **67% of CHROs report distrust of "AI-generated skill assessments" without human attestation.** This is the cleanest external validation of Cairn's attestation architecture I have seen. The survey is methodologically sound (sample size, sampling frame, published instrument). *Use this number in Compass narrative and in Vector decks.*

**Workday Customer Summit floor conversation.** Compiled from public LinkedIn posts (n=43) and a 17-attendee customer panel transcript (shared informally by an attendee, not for attribution). The consensus quote, near-verbatim from a senior L&D leader at a Fortune 200 manufacturer:

> "Illuminate is earlier and more thoughtful than I expected, but they have not solved the question of *where a skill is demonstrated*, only *where it is consumed*."

That phrasing maps directly onto Cairn positioning. Compass should not paraphrase; they should quote (with attribution where permission exists, anonymized otherwise).

**Pluralsight relationship (signal beyond the deal).** The W06 closed-loop pilot with Pluralsight is not just a customer win; it is a category signal. Pluralsight is consolidating its content-attribution strategy: they want their content to be a **verifiable input to an outcome**, not a checkbox on a completion certificate. They want a closed-loop partner that can prove their content moved a real-world outcome. We are that partner. **Other content vendors will follow** — I'd expect inbound from at least one of Coursera-for-Business, LinkedIn Learning, or O'Reilly within the next 8 weeks if the Pluralsight reference goes public.

---

## 5. What changed (or didn't) vs the May brief

- **Expected:** Workday acquires a content vendor by W04. **Did not happen.** Workday is consolidating Sana, not acquiring more.
- **Expected:** Cornerstone announces an agentic layer in Q2 earnings. **Did not happen.** They are watching and waiting; this is a slower competitive threat than I forecast, but a larger displacement opportunity.
- **Did not anticipate:** the EEOC AEDT-adjacent guidance memo. This is the most consequential miss of the brief. It pulled our regulatory exposure window forward by ~12 months. Pillar should re-validate the AEDT wall posture **this week**, not at the next quarterly review.

---

## 6. What I am watching for the next 8 weeks

1. **Workday Q3 earnings call — Sep 18.** First opportunity to see Illuminate Learning **attach-rate** on the installed base. Attach-rate is the number that matters; the launch was the easy part. If attach is below 15% of eligible customers by Sep 18, the silo thesis is reinforced.

2. **Cornerstone customer churn.** Two prospect conversations describe accelerating displacement (one to Workday, one evaluating Stratum). If we see a third in the next 30 days, Vector should treat Cornerstone displacement as a named GTM motion, not opportunistic.

3. **Pluralsight closed-loop reference design.** We are co-developing this. If Pluralsight publishes it before Q4, it sets the category standard and Stratum is the reference implementation. **Protect the timeline.** If it slips into Q4 or beyond, Workday or Degreed will publish a competing framing first and we will be defending rather than defining.

---

## What I missed, what I'm uncertain about

- I under-weighted the speed of Workday's Sana integration. I expected Q4 launch; they shipped in July.
- I do not have a confident read on Cornerstone's internal strategy. The quiet quarter is consistent with multiple narratives (turnaround, decline, deliberate restraint). Vector's customer conversations are my best signal here.
- The EEOC June memo is published but lightly socialized. I am inferring enforcement intent from staffing signals and one off-record conversation reported by counsel. Treat the "AEDT-adjacent" interpretation as **directionally confident, legally unsettled**.

---

*Eglin · Industry Research · Stratum, Inc.*
*Sources cited inline; full source ledger available on request.*
