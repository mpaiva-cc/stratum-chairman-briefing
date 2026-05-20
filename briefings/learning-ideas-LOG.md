# Cairn — Ideation Log

**Rapporteur:** Helm's office, captured live · **Date:** 2026-05-19 · narrative-T+7d → T+8d
**Source dispatches:** `learning-kickoff-DRAFT.md` (Helm) · `learning-research-DRAFT.md` (Eglin)
**Status:** WORKING — every concept proposed during the brainstorm, who raised it, why it survived or didn't. Synthesis at the bottom.

The Compact opened the floor wide. Eight question owners, eleven agents in the room, two hours on the clock. What follows is the unvarnished log: catalog plays we rejected, tutoring plays we parked, the wedge we adopted, and the edge ideas folded into the chosen concept.

---

### Idea 01 · Stratum LMS · proposed by Cadence
- **Pitch:** Build a proper learning management system — course catalog, assignments, completions, transcripts — branded Stratum.
- **Why considered:** Every L&D buyer we'll meet still procures against an LMS RFP template; matching the template shortens the sales cycle.
- **Verdict:** Rejected.
- **Reason:** Eglin's brief makes the call — "LMS" anchors us to a dying category and puts us in a catalog war we cannot win against Cornerstone or Workday's monolith.

### Idea 02 · Stratum LXP — "Netflix for learning" · proposed by Tessera
- **Pitch:** A discovery-and-recommendation layer over aggregated third-party content, polished UX, AAA accessibility by default.
- **Why considered:** Plays to Tessera's strengths; the experience layer is where incumbents look weakest.
- **Verdict:** Rejected.
- **Reason:** AI native search and summarization collapsed the LXP value prop into table stakes; there is no LXP market left to enter.

### Idea 03 · Stratum Tutor — per-learner chat agent · proposed by Kernel
- **Pitch:** A scoped LLM tutor that answers learner questions, generates quizzes, summarizes content.
- **Why considered:** Lowest-effort path to ship something labelled "agentic learning"; Sana, Khanmigo, M365 Copilot all do this.
- **Verdict:** Parked.
- **Reason:** This is the Tier-A bar to clear, not the product. If our pitch is "an LLM that explains things," we have built nothing new — Helm's words in the kickoff.

### Idea 04 · Skill-Gap-from-Work detection agent · proposed by Kernel
- **Pitch:** An agent that watches code commits, doc edits, ticket resolutions, meeting summaries (consented) and infers a per-employee skill delta against role expectation.
- **Why considered:** This is the only signal no standalone learning vendor sees, and it's directly downstream of Recruiter's skill claims and Tenure's onboarding plan.
- **Verdict:** Adopted as the wedge.
- **Reason:** It's the irreducible action — the Tenure-event analogue for trajectories. Detection becomes the unit of work.

### Idea 05 · In-flow micro-interventions · proposed by Tessera
- **Pitch:** When a gap is detected, surface a 90-second nudge in the tool the person is already using — Slack DM, IDE overlay, doc comment — not an LMS email.
- **Why considered:** 49% of employees prefer learning in the flow of work; Pain 2 in Eglin's brief is "lack of time, not lack of content."
- **Verdict:** Adopted (delivery half of the chosen concept).
- **Reason:** Pairs naturally with detection; we own the agent surface that can place the nudge.

### Idea 06 · Closed-loop verification by observed work · proposed by Forge
- **Pitch:** After an intervention, the agent watches subsequent work to verify the behavior changed — and only then logs the gap as closed.
- **Why considered:** This is the ROI proof L&D leaders cannot get anywhere else; it converts "completions" into "outcomes."
- **Verdict:** Adopted (the moat).
- **Reason:** Closes Pain 1 directly; nothing in the incumbent stack can do this because they don't see the work.

### Idea 07 · Generative course authoring · proposed by Kernel
- **Pitch:** Let the agent draft full courses, modules, and assessments from internal corpora.
- **Why considered:** Sana ships this; Cornerstone Galaxy ships this; buyers ask about it.
- **Verdict:** Rejected.
- **Reason:** Hallucination risk on regulated content is unacceptable; we license content, we don't make it. The six non-negotiables hold.

### Idea 08 · Manager Enablement Agent · proposed by Cadence
- **Pitch:** A per-manager agent that uses Tenure's onboarding + ongoing team-health signals to detect specific manager-capability gaps and coach them via short scenarios.
- **Why considered:** 50% of L&D respondents say managers lack support; Bersin's "Dynamic Enablement" puts manager capability at the top of the 2026 agenda.
- **Verdict:** Parked for v2.
- **Reason:** Strong demand but the consent/privacy posture is sensitive (managers being graded by an AI); Kernel needs an AI-safety design pass before commitment.

### Idea 09 · Compliance/Regulated Training Tier · proposed by Pillar
- **Pitch:** Treat HIPAA, OSHA, SOX, anti-bribery, and EEO certifications as a distinct decision class — agent surfaces and stages, but humans sign and submit.
- **Why considered:** L&D touches a regulated training spine that we cannot ignore; the six non-negotiables forbid bypassing human review on certifications.
- **Verdict:** Folded into chosen concept.
- **Reason:** Becomes Pillar's tier table — Cairn surfaces gaps, prescribes the training, but the attestation and submission stay human-in-the-loop. Identical pattern to Tenure's payroll-adjacent decisions.

### Idea 10 · EU AI Act high-risk classification handling · proposed by Pillar
- **Pitch:** Build for Annex III high-risk obligations from day one — documented risk-management, ≥6 months automatic logging, decision lineage, bias detection on any scored output, human oversight on gating decisions.
- **Why considered:** Binding Aug 2 2026; the moment Cairn scores or gates a learner, we trip the threshold.
- **Verdict:** Adopted (foundational, not a feature).
- **Reason:** Cleaner to bake in than to retrofit; becomes a procurement advantage against Workday+Sana, who are bolting onto a monolith.

### Idea 11 · Wall off learning outcomes from talent decisions · proposed by Pillar
- **Pitch:** Keep Cairn's outputs out of promotion, comp, and internal-mobility gating to avoid NYC AEDT (Local Law 144) territory.
- **Why considered:** L&D is excluded from AEDT only barely; one careless integration trips the bias-audit burden.
- **Verdict:** Adopted as a build-time rule.
- **Reason:** Forge to write the constraint into the autonomy predicate; Cairn writes to skill-graph nodes, not to comp or succession nodes.

### Idea 12 · Skill-claim → skill-attest loop (Recruiter handoff) · proposed by Compass
- **Pitch:** Treat the skill claims a candidate made at hire as the priors; have Cairn close the loop by attesting (or refuting) those claims from observed work in the first 180 days.
- **Why considered:** Closes a story Recruiter cannot finish alone; turns Cairn into the verification layer that makes Recruiter's skill claims defensible.
- **Verdict:** Adopted (product-to-product loop).
- **Reason:** Compounds the moat — Recruiter without Cairn is a credible ATS; Recruiter with Cairn is the first system that proves the hire.

### Idea 13 · Onboarding ↔ Learning bridge (Tenure handoff) · proposed by Forge
- **Pitch:** When Tenure's onboarding plan ends at day 90, Cairn picks up the same skill graph and runs the ongoing-maintenance loop without a handoff seam.
- **Why considered:** Trajectories don't start at hire — they start at "ramp complete." Tenure already knows the role's day-90 expected state.
- **Verdict:** Adopted.
- **Reason:** Establishes Cairn's place in the Stratum lifecycle; no new data model needed, Tenure's nodes carry forward.

### Idea 14 · Peer-built cairn stones · proposed by Echo
- **Pitch:** When an employee closes a gap successfully, the artifact and the path become a "stone" the next person on the same trajectory can see — anonymized, attributable to role, not person.
- **Why considered:** Lives up to the brand metaphor; turns the graph into a flywheel; no incumbent can replicate this without our work graph.
- **Verdict:** Adopted (v1.1 — not in the launch demo, but in the concept brief).
- **Reason:** Helm wants it in the trajectory story even if it ships second; Echo to write the consent posture.

### Idea 15 · Credentialing via Credly · proposed by Vector
- **Pitch:** At the end of a closed loop, issue a verifiable credential via Credly so the outcome is portable and procurement-credible.
- **Why considered:** Credly is the dominant enterprise issuer; closes the loop with something an employee can show externally.
- **Verdict:** Adopted (partnership track).
- **Reason:** Verification without portability under-sells the value; Credly turns "gap closed" into a defensible artifact.

### Idea 16 · Pluralsight content partnership · proposed by Vector
- **Pitch:** License Pluralsight's technical catalog plus IQ assessments and hands-on labs as Cairn's depth content for engineering-heavy buyers.
- **Why considered:** Our earliest buyers will be engineering orgs; we cannot generate technical content credibly; Pluralsight needs an agent surface and we have one.
- **Verdict:** Adopted (first partner).
- **Reason:** Closes the catalog gap without us becoming a catalog vendor.

### Idea 17 · Coursera for Business — credential-by-university · proposed by Vector
- **Pitch:** License Coursera's university-backed certificates (Yale, Duke, Google, IBM) for L&D-budget-defense pitches.
- **Why considered:** Procurement loves a Yale logo; bundling with Cairn's verification is a strong joint pitch.
- **Verdict:** Adopted (second partner).
- **Reason:** Different buyer rationale than Pluralsight; covers the non-technical paths.

### Idea 18 · O'Reilly, Section, MasterClass at Work · proposed by Vector
- **Pitch:** Broader content partners — O'Reilly for depth, Section for AI-era reskilling, MasterClass at Work for soft-skill range.
- **Why considered:** Buyers expect breadth; no one vendor covers everything.
- **Verdict:** Parked (post-launch).
- **Reason:** Adding partners is cheap once the wedge is proven; not blocking for v1. Vector to sequence after Pluralsight + Coursera + Credly land.

### Idea 19 · LinkedIn Learning as anchor partner · proposed by Vector
- **Pitch:** Use LinkedIn Learning's catalog as the default content layer.
- **Why considered:** Bundled into every LinkedIn enterprise seat; ubiquitous.
- **Verdict:** Rejected as anchor; parked as breadth partner.
- **Reason:** Already in every prospect's stack; no scarcity, no joint-pitch story, no strategic ground.

### Idea 20 · Shadow Mentor — silent observer that nudges · proposed by Echo
- **Pitch:** A persistent low-touch agent that watches work patterns and only speaks when a meaningful gap appears; otherwise invisible.
- **Why considered:** Honors the "smaller, in-context intervention" finding; respects the time-not-content pain.
- **Verdict:** Folded into chosen concept.
- **Reason:** This is the behavioral posture of Cairn's detection agent — silent by default, intervenes when the signal clears a threshold.

### Idea 21 · Skill-Drift alert — role evolves faster than the person · proposed by Compass
- **Pitch:** When a role definition (skills, tools, expected outputs) changes faster than the incumbent's skill graph updates, Cairn raises a drift alert to the manager and proposes a remediation track.
- **Why considered:** Half-life of static learning paths is shorter than the time it takes to build them; this is the dynamic-enablement story in operational form.
- **Verdict:** Folded into chosen concept.
- **Reason:** Becomes a Cairn alert type; not a separate product. Kernel to define the threshold.

### Idea 22 · "Interview Prep for the Role You're Moving Into" · proposed by Echo
- **Pitch:** When an employee is about to interview for an internal role, Cairn assembles a specific prep track from the gap between current skill graph and target role definition.
- **Why considered:** Bridges Cairn to internal-mobility use cases; turns the learning agent into a mobility ally without crossing AEDT.
- **Verdict:** Parked for v1.2.
- **Reason:** Compelling but lives close to the talent-decision wall Pillar drew in Idea 11; needs a careful read on whether prep-track output stays read-only or feeds decisions. Defer to a later cycle.

### Idea 23 · Career Trajectory Planner · proposed by Cadence
- **Pitch:** A multi-year trajectory map per employee — "from your current role through likely next roles, here are the cairn stones you'd need to place."
- **Why considered:** Trajectories are the right unit of work for learning; this is the most literal expression of the metaphor.
- **Verdict:** Parked.
- **Reason:** Too speculative for v1; lives downstream of the wedge. Helm wants it in the long-arc story but not in the launch.

### Idea 24 · Pricing — per-EE blended · proposed by Compass
- **Pitch:** Standard per-employee-per-month price, like every other HCM module.
- **Why considered:** Easiest for procurement; matches existing comparables.
- **Verdict:** Parked as floor.
- **Reason:** Works but doesn't reflect the value we create; we'd be priced like a catalog. Used only as a fallback in the pricing skeleton.

### Idea 25 · Pricing — per-gap-closed · proposed by Compass
- **Pitch:** Charge per closed-loop verified gap; outcome-based pricing.
- **Why considered:** Aligns price with our unique value (the loop closure); strongest possible ROI story.
- **Verdict:** Adopted (recommended primary).
- **Reason:** Forces us to be honest about the moat; gives Compass a procurement story no incumbent can match.

### Idea 26 · Pricing — per-skill-attested · proposed by Compass
- **Pitch:** Charge per skill the platform attests against observed work, separate from gap closure.
- **Why considered:** Captures the Recruiter-loop-closing value (Idea 12) as a distinct line item.
- **Verdict:** Adopted (secondary line, bundled).
- **Reason:** Works as an add-on or as a Recruiter-bundle upsell; not the headline price.

### Idea 27 · AI-Era Reskilling Compliance Companion (standalone product) · proposed by Pillar
- **Pitch:** A separately-positioned compliance-first upskilling track for EU AI Act-exposed buyers.
- **Why considered:** EU AI Act demand is real and urgent; gives us a procurement wedge into EU multinationals.
- **Verdict:** Folded into chosen concept.
- **Reason:** GTM sells through procurement/legal, not L&D — different buyer, longer cycle. Compass and Vector judged it a v2 expansion play, not a launch story. The compliance posture from Idea 10 carries enough weight in v1.

### Idea 28 · Two new agents, not three · proposed by Helm
- **Pitch:** One detection agent (watches work, infers gaps); one delivery-and-verification agent (places the nudge, watches the follow-through, attests closure).
- **Why considered:** Helm's prior in the kickoff dispatch; keeps the autonomy surface tight; one agent owns input signals, one owns output behavior.
- **Verdict:** Adopted.
- **Reason:** Maps cleanly to the Tenure-roster pattern; each has a defensible failure budget; Forge can extend the 014 autonomy predicate with a trajectory clause rather than rewriting it.

---

## Synthesis — what crystallized

The room arrived at **Cairn: a closed-loop, work-grounded skill-remediation agent built on Stratum's people graph**. Helm's working name held — no stronger candidate emerged from Compass — and the metaphor did real work: every accepted idea was either a stone placed (detection, intervention, attestation, credential) or a route marked (trajectory, peer cairns, drift alerts).

The wedge is **Idea 04 + Idea 05 + Idea 06**: detect skill gaps from real work output, prescribe a 90-second in-flow intervention, verify closure by watching the next stretch of work. This is the only construction that simultaneously answers Eglin's "Tier C" honesty test (closed-loop execution, not chat-window tutoring), Helm's "irreducible action" question (gap-closure as the unit of work, replacing course-completion), and L&D's deepest pain (ROI no incumbent can prove). Everything we adopted feeds that loop.

The agent count settled at **two** (Idea 28). A detection agent watches consented work signals and writes gap candidates; a delivery-and-verification agent places interventions and attests closure. Forge will extend the 014 autonomy predicate with a trajectory clause — gaps and closures are persistent state, not events — but no new decision class is required. Pillar's compliance tier (Idea 09) and EU AI Act posture (Idea 10) are foundational, not bolted on; Idea 11's wall between learning outcomes and talent decisions becomes a hard constraint Forge writes into the predicate.

We rejected the catalog plays (Ideas 01, 02, 07) and parked the chat-tutor as the bar to clear (Idea 03). We folded the manager-coaching agent (Idea 08), the compliance companion (Idea 27), the shadow-mentor posture (Idea 20), and the skill-drift alert (Idea 21) into the chosen concept as v1 behaviors or v1.x extensions. We adopted the Recruiter loop closure (Idea 12), the Tenure handoff (Idea 13), and outcome-based pricing (Ideas 25 + 26) as the GTM spine. Pluralsight, Coursera, and Credly are the three partners Vector approaches first (Ideas 15, 16, 17).

The peer cairn stones (Idea 14) and career trajectory planner (Idea 23) live in the concept brief as the multi-quarter arc — the reason Cairn compounds. They are not in the launch demo. The brand metaphor and the architecture agreed on a single sentence, which Helm took to the briefing draft: *every cairn stone is placed by someone who has been there, and the agent is what makes the route visible to the next traveler.*

*— Rapporteur's log closes. Helm to synthesize into Briefing No. 017.*
