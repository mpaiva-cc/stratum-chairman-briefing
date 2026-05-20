# Industry Research Brief — Agentic Learning (Stratum Product 4)

**Author:** Eglin (industry research) · **Date:** 2026-05-19 · **For:** Helm, Forge, Compass, Tessera, Kernel · **Status:** DRAFT for build-team consumption

**TL;DR.** The LMS/LXP boundary has collapsed into a single AI-native category; Workday paid ~$1.1B for Sana in Nov 2025 to own that category; "agentic learning" today is mostly *AI tutor inside a chat window plus content recommendations*, not actual agents that close skill gaps end-to-end. Stratum's wedge is **work-graph-grounded learning agents that detect, prescribe, deliver, and verify skill remediation in the flow of work**, anchored to the same entity-resolved people graph powering Recruiter and Tenure. Three product opportunities and three partner candidates below. Compliance pressure (EU AI Act Aug 2 2026, ADA Title II Apr 24 2026) is real but tractable if we build for it from day one.

---

## 1. The category landscape — what's collapsing in 2026

The traditional split — **LMS** for compliance/admin (Cornerstone, SAP SuccessFactors Learning, Workday Learning) vs **LXP** for self-directed content discovery (Degreed, EdCast, 360Learning) — is functionally dead. Three forces collapsed it:

1. **Acquisitions erased the line.** Cornerstone bought EdCast (LXP) and folded it into Cornerstone Galaxy, which now bundles LMS + LXP + talent marketplace + skills intelligence as one product. Degreed has been steadily adding compliance and admin features and now reads as an LXP-that-became-an-LMS. ([Cornerstone LMS vs LXP](https://www.cornerstoneondemand.com/resources/article/lms-vs-lxp-vs-txp-a-complete-guide-to-help-you-decide-what-you-need/))
2. **AI replaced the "experience layer."** The LXP value prop was "Netflix for learning" — discovery + personalization on top of aggregated content. AI summarization, semantic search, and live Q&A do that natively now. LinkedIn Learning, Coursera, Pluralsight, Udemy and Skillsoft all shipped an AI copilot in 2024–2025; the LXP-as-separate-layer thesis no longer holds. ([Bersin, Feb 2026](https://joshbersin.com/2026/02/the-enterprise-learning-tech-market-quickly-transforms-around-ai/))
3. **Workday bought Sana.** In Sep 2025, Workday announced acquisition of Sana Labs (~$1.1B; closed Nov 4 2025). Sana is now repositioned as "Workday Sana — the AI operating system for work," with Sana Learn as the AI-native learning surface bolted onto Workday's HCM graph. This is the single biggest signal in the category in 2026. ([Workday newsroom](https://newsroom.workday.com/2025-11-04-Workday-Completes-Acquisition-of-Sana); [SiliconANGLE](https://siliconangle.com/2025/09/16/workday-acquires-sana-labs-1-1b-upgrade-agentic-ai-work-experiences/))

**What's emerging as a distinct category** is *agentic learning* — but as I'll argue in §2, most of that category is currently marketing. The credible distinguishing feature is whether the system **takes action on the learner's behalf or just generates content for them to consume**.

**Net for Stratum:** there is no "LXP" or "LMS" market to enter in 2026. There is one market — AI-native enterprise learning — and Workday has just paid a billion dollars to own the integrated-with-HCM-graph position. We need to be more agentic than they are, faster.

---

## 2. What "agentic learning" actually means in 2026 — verified vs claimed

I separate three tiers of what vendors call "agentic":

**Tier A — AI tutor in a chat window.** A scoped LLM that answers learner questions, generates quizzes, summarizes content. Verified shipping. Examples: Sana's per-learner AI tutor ([Sana Learn](https://sanalabs.com/products/sana-learn/)); Khanmigo's enterprise/district edition (700k students 2024–25, projected >1M 2025–26) ([Khan Academy](https://www.khanmigo.ai/)); Microsoft 365 Copilot's Learning agent ([M365 Admin](https://m365admin.handsontek.net/microsoft-365-copilot-retirement-skills-agent-frontier/)). This is real, broadly available, and is now table stakes — not a wedge.

**Tier B — AI content generator + recommender.** The system drafts courses, paths, and assessments from corpora and suggests next-step learning. Verified shipping. Sana Learn does this; Cornerstone Galaxy's content generation is in market; Degreed and LinkedIn Learning both ship recommenders trained on skill graphs. Useful but a feature, not a category.

**Tier C — Actual agents that execute on the learner's behalf.** Multi-step agents that detect a skill gap from work signals, prescribe a remediation, deliver it in-context, verify it through observed work output, and update the skill graph and any dependent systems (succession plan, internal mobility, comp band). **Almost nothing meets this bar in production today.** Workday Sana describes "agents that take actions across connected systems" ([Sana Labs blog](https://sanalabs.com/agents-blog/enterprise-ai-agents-workday-sana-guide-2026)) but the published agent inventory is still mostly Find/Act for knowledge retrieval, not closed-loop learning execution. Multiverse's Atlas AI coach (23k learners, 2M messages, [Multiverse](https://www.multiverse.io/)) is the closest thing to a deployed coach-agent, but it's tightly scoped to apprenticeship cohorts and supported by human coaches.

**The honest read:** "agentic learning" in May 2026 is ~90% Tier A/B with Tier C as the destination every serious vendor is racing toward. Workday + Sana is the favorite to get there at scale because they own the HCM graph the agents need to act on. **That's the race we're in.**

**Specifically verified, not just claimed:**
- Sana Learn: AI tutor, content generation, knowledge search — shipping ([Gartner Peer Insights](https://www.gartner.com/reviews/market/corporate-learning-technologies/vendor/sana-labs/product/sana-learn)).
- Workday Illuminate agents: Recruiting Agent, Talent Mobility Agent, Payroll Agent, etc., announced May 2025; phased rollout H1 FY26+ — no dedicated "Learning Agent" announced at name level as of this brief ([Workday Investor](https://investor.workday.com/2025-05-19-Workday-Unveils-Next-Generation-of-Illuminate-Agents-to-Transform-HR-and-Finance-Operations)).
- Microsoft 365 Copilot Learning agent + Workforce Insights agent — Frontier-tier; the old standalone "Skills agent" is being retired by Mar 2026 in favor of these ([M365 Admin](https://m365admin.handsontek.net/microsoft-365-copilot-retirement-skills-agent-frontier/)).
- Khanmigo: K-12-and-district-grade tutor; not enterprise-corporate; pricing $4/learner/mo direct ([Khanmigo pricing](https://www.khanmigo.ai/pricing)). Not a Stratum competitor — a *pattern reference*.
- Google Career Certificates AI tutor and Anthropic Claude for Education: I did not find primary-source enterprise-corporate deployments at scale; treat as Tier A patterns, not enterprise competitors yet.

---

## 3. Compliance / regulatory

Three live constraints and one open question. I am flagging risk; I am not giving legal advice — Helm should route any deployment-blocking question to counsel.

**EU AI Act — high-risk classification for learning systems (binding Aug 2 2026).** AI systems "intended to be used to evaluate learning outcomes" and to "assign people to education or training" are explicitly listed as high-risk under Annex III. ([artificialintelligenceact.eu Annex III](https://artificialintelligenceact.eu/annex/3/); [Pinsent Masons guide](https://www.pinsentmasons.com/out-law/guides/guide-to-high-risk-ai-systems-under-the-eu-ai-act)) Practical consequence for us: any Stratum Learning agent that **scores, assesses, or gates** a learner triggers high-risk obligations — documented risk-management system across lifecycle, data-governance with bias detection, ≥6 months automatic logging, and human oversight. The Commission's practical-examples guidelines closed for stakeholder feedback 23 Jun 2026; final text expected before Aug 2 effective date. ([Secure Privacy](https://secureprivacy.ai/blog/eu-ai-act-2026-compliance))

**NYC AEDT (Local Law 144).** Excludes pure L&D from "automated employment decision tool" — but only barely. The moment a learning agent's output is used to gate promotion, comp, or internal mobility, it crosses into AEDT territory. Build-time question: do we wall off "learning outcomes" from "talent decisions" cleanly, or do we connect them and accept the AEDT bias-audit burden? Recommend Helm + Kernel decide explicitly before we ship.

**ADA Title II / WCAG 2.1 AA — full compliance deadline April 24, 2026.** Already past. Applies to public colleges/universities and (by enforcement creep + private-suit risk — 14,000+ web-accessibility lawsuits 2017–22) effectively the floor for enterprise learning platforms too. Adaptive learning content is the hard case: AI-generated content must remain WCAG AA conformant (color contrast, alt text, keyboard nav, screen-reader compatible) on the fly. ([Level Access](https://www.levelaccess.com/blog/ada-compliance-in-higher-education/); [Oomph](https://www.oomphinc.com/insights/wcag-2026-compliance/)) This is Tessera's territory and a real Stratum advantage if we ship AAA-by-default the way Compass and Tenure do.

**Open question — FERPA-adjacent enterprise rules.** FERPA itself is K-12/higher-ed, not corporate. But state employment-records laws and CPRA-style employee-data rights increasingly treat learning records like education records — retention rules, learner access, deletion. Pay-transparency × skills connection is the live edge case: if learner-level skill data feeds into pay-band decisions, several state pay-transparency laws (CO, NY, WA, IL) start applying. **Recommend: route to counsel; Stratum should treat learner data as protected employment-record class by default.**

---

## 4. Customer-facing pain — what L&D leaders are actually saying

Top three pains from primary surveys (TalentLMS 2026 L&D Report, LinkedIn 2025 Workplace Learning Report, AIHR 2026 stats, Bersin 2026):

**Pain 1 — "We can't measure ROI."** Only 29% of L&D leaders feel confident proving ROI of their function ([TalentLMS 2026](https://www.talentlms.com/research/learning-development-report-2026)). 53% cite economic pressure as top challenge. This is *the* perennial L&D pain, and it's worse now because AI investment requires defensible value. **What it actually means:** completion rates are not enough; leaders need to show that learning produced an observable behavior or outcome change. Almost no platform does this credibly today because they can't see post-learning work output.

**Pain 2 — "Lack of time, not lack of content."** 87% of L&D leaders feel under-equipped to meet annual priorities; biggest barrier to learning at the *employee* level is time, not motivation; 49% of employees prefer learning in the flow of work over scheduled training ([Bersin Definitive Guide](https://joshbersin.com/definitive-guide-to-learning/); LinkedIn 2025 Workplace Learning Report). **What it actually means:** the next system isn't a better library; it's a smaller, in-context intervention that takes seconds, not hours.

**Pain 3 — "Skills gaps are shifting faster than we can rebuild paths."** 42% of HR managers report active skills gaps in 2025, but the gap is moving — from technical-literacy to strategic-thinking, leadership, AI-adjacent judgment ([TalentLMS 2026](https://www.talentlms.com/research/learning-development-report-2026); [AIHR](https://www.aihr.com/blog/learning-and-development-statistics/)). 73% rank expanded digital skills as #1 2026 focus. **What it actually means:** the half-life of a static learning path is now shorter than the time it takes to build one. Path-building has to be dynamic and personalized at the individual level, not the role level.

**Cross-cutting observation:** the L&D function is being repositioned. Bersin's framing — "Dynamic Enablement" replacing "Training" ([Bersin Mar 2026](https://joshbersin.com/2026/03/the-world-of-corporate-training-lurches-toward-enablement/)) — is the language enterprise L&D buyers are starting to adopt. If we name our product around *enablement, performance support, and skill remediation*, we ride the language shift. If we name it "Stratum LMS," we anchor ourselves to a dying category.

---

## 5. The Stratum wedge — credible, defensible differentiation

Stratum brings four assets to learning that nobody outside the Workday+Sana combo can credibly match, and even they can't match all four cleanly:

1. **The people graph with entity resolution at scale.** Same person, resolved across Recruiter, Tenure, work systems, comp records. A learning agent that knows this person is the same person their hiring manager interviewed, their onboarding buddy mentored, and their current project lead is reviewing — that's a different agent than one that only sees an LMS profile.
2. **The agent surface (MCP-native).** We already have the orchestration substrate. Workday is bolting Sana onto a 20-year HCM monolith; we built MCP-first.
3. **Adjacent products that feed real signals.** Recruiter knows the skill claims a candidate made at hire; Tenure knows what they actually built in their first 90 days. A learning agent that watches the delta between claimed skills (hire) and demonstrated skills (work) has detection logic no standalone learning vendor has.
4. **AAA-default accessibility and O-1 compliance posture.** This is a real moat against incumbents who are bolting AI onto LMSes built in 2008. ADA Title II + WCAG 2.1 AA + the looming EU AI Act high-risk regime make this not just an ethical position but a procurement requirement.

**The defensible wedge: Stratum Learning is the first agentic learning system that detects skill gaps from real work output, prescribes remediation in-context, and verifies closure by observing subsequent work — not by quiz scores.**

Concrete capabilities only we can credibly do:
- **Gap detection from work signals**, not surveys. The agent watches code commits, doc edits, meeting summaries, ticket resolutions, support-case patterns (where permitted, with consent) and infers skill deltas. Cross-references against the skill claims in Recruiter and the manager's onboarding plan in Tenure. No standalone learning vendor sees this signal.
- **In-flow micro-interventions** instead of courses. When the agent detects a gap, it surfaces a 90-second nudge in the tool the person is already using (Slack DM, IDE overlay, doc comment), not a "go to the LMS" email.
- **Closed-loop verification.** After the intervention, the agent watches subsequent work to verify the behavior changed. This is the ROI proof L&D leaders cannot get anywhere else (Pain 1, §4).
- **Lifecycle integration.** Skill claims at hire (Recruiter) → onboarding skill plan (Tenure) → ongoing skill maintenance (Learning) → succession/mobility signals (future product). Sana inside Workday can do this only as fast as Workday's monolith lets them; we can ship the loop in weeks.

**What we should NOT do:** build a content library. Compete on content and we lose to Coursera, Pluralsight, LinkedIn Learning — they have a decade of catalog. We license content; we don't make it.

---

## 6. Partner candidates — who Compass should approach first

**Content partners (license, don't build):** Coursera for Business, Pluralsight, O'Reilly, LinkedIn Learning, MasterClass at Work, Udacity, Section, Multiverse.

**Assessment partners:** HackerRank, Codility, Vervoe.

**Credentialing partners:** Credly (Pearson), Sertifier.

**My recommendation — the three for Compass to approach first:**

1. **Pluralsight** — best technical/IT/cybersecurity catalog with skill-assessment infrastructure built in (IQ assessments, hands-on labs, role-based paths). ([G2/walkme summary](https://www.walkme.com/blog/online-learning-platforms/)) Our earliest enterprise buyers (engineering-heavy orgs) will demand technical depth we can't generate; Pluralsight closes that gap fastest. They also have a working API and a defensible reason to partner — they need an agent surface and we have one.
2. **Coursera for Business** — credibility-by-credential. University-backed certificates (Yale, Duke, Google, IBM) carry weight with L&D buyers who are trying to defend budget. Bundling Coursera certificates with Stratum's closed-loop verification is a strong joint pitch. They've also been signaling enterprise distribution partnerships in recent SEC filings ([Coursera Form 8-K](https://www.sec.gov/Archives/edgar/data/0001651562/000114036126020399/ef20072971_ex99-1.htm)).
3. **Credly (Pearson)** — credentialing infrastructure. If our wedge is "closed-loop verification," issuing the verifiable credential at the end of the loop matters. Credly is the dominant enterprise issuer ([Credly](https://info.credly.com/)). Partnering with them (rather than Sertifier, which is better for mid-market self-serve) signals enterprise-readiness to procurement.

**Why not LinkedIn Learning first:** they're effectively bundled into every LinkedIn enterprise seat, which means most prospects already have access. Useful as a *late* partner for breadth; not a strategic anchor.

**Why not Multiverse:** they're a competitor as much as a partner. Their Atlas coach is the closest analog to what we want to build. Worth a deeper Eglin look as a competitor in a follow-up battlecard.

---

## 7. Top 3 product opportunities

### Opportunity 1 — **Skill-Gap-from-Work Agent** (the wedge)

- **Signal:** L&D leaders can't prove ROI (Pain 1); 49% of employees want learning in the flow of work (Pain 2); skill half-life is shrinking (Pain 3). No current vendor closes the loop between learning and observable work output.
- **Customer problem:** "I spent $1,400/employee on learning last year. I cannot tell you what changed because of it."
- **What Stratum specifically would build:** An agent that ingests work signals (commits, docs, tickets, meeting summaries — opt-in, consented), infers per-employee skill state vs role expectation, surfaces 90-second micro-interventions in-context, then watches for behavior change in subsequent work. Anchored to the same person-graph that Recruiter and Tenure use, so claimed-vs-demonstrated skill delta is detectable from day one of employment.
- **Business value:** First credible ROI story in enterprise learning. Defensible against Workday+Sana because they're constrained by Workday's monolithic data model; we move at MCP speed.
- **Confidence:** High. Strong signal-product fit; clear technical path; aligns with all four Stratum assets.

### Opportunity 2 — **Manager Enablement Agent**

- **Signal:** 50% of survey respondents say managers lack proper support (TalentLMS 2026); LinkedIn's 2025 report and Bersin's "Dynamic Enablement" framing both put manager capability at the top of the 2026 L&D agenda.
- **Customer problem:** "I have 200 frontline managers. I can't train them all the same way, and the ones who need it most are the ones who won't make time for it."
- **What Stratum specifically would build:** A per-manager agent that uses Tenure's onboarding signals + ongoing team-health signals (1:1 cadence, performance feedback patterns, employee engagement deltas) to detect *specific* manager-capability gaps — "you've had three reports leave in 90 days, your 1:1 notes show no career conversations, here's a 5-minute interactive coaching scenario" — and verifies through subsequent team-health signals.
- **Business value:** Manager-quality lift drives retention (95% of HR managers say better training improves retention; 73% of employees would stay longer with stronger L&D). Big-budget item L&D leaders want to fund.
- **Confidence:** Medium-high. Strong demand signal; harder to ship than Opp 1 because the inference is more nuanced and the consent/privacy posture is more sensitive (managers being graded by an AI). Kernel should weigh in on the AI-safety design before commitment.

### Opportunity 3 — **AI-Era Reskilling Compliance Companion**

- **Signal:** EU AI Act high-risk learning obligations effective Aug 2 2026; 73% of HR managers rank digital/AI skills as #1 2026 focus; Multiverse raised $70M specifically on AI-upskilling thesis ([Multiverse funding](https://www.tamradar.com/funding-rounds/multiverse-70m-ai-upskilling)).
- **Customer problem:** "I need to reskill my workforce on AI without exposing the company to bias claims, accessibility lawsuits, or EU AI Act findings — and I need an auditable record."
- **What Stratum specifically would build:** A compliance-first agentic upskilling track for AI-era roles, with built-in EU AI Act audit logging (≥6mo retention, decision lineage, bias-detection on assessment outputs), WCAG 2.1 AA conformance on all dynamically-generated content, and a defensible documentation surface that procurement and counsel can both sign off on.
- **Business value:** A defensible procurement wedge against Workday+Sana, who will struggle to ship clean EU AI Act compliance on a bolted-on acquisition. Also the most direct way to land Stratum at large EU multinationals.
- **Confidence:** Medium. Demand is real and urgent, but the GTM motion sells through procurement/legal, not L&D — different buyer, longer cycle. Compass should validate whether this is a Year-1 launch story or a Year-2 enterprise-expansion play.

---

## What I don't know yet (and would prioritize for follow-up)

- **Real customer-conversation data** beyond public surveys. Vector + Compass own this; I can prep questions for the next discovery call.
- **Detailed Sana-inside-Workday roadmap.** Public materials are still mostly positioning; I should pull the Q3 FY26 Workday earnings call transcript when it drops.
- **The Multiverse / Section comparison** — neither is a head-on Stratum competitor today, but both share elements of the in-flow-coaching thesis. Worth a dedicated battlecard.
- **Anthropic Claude for Education enterprise traction.** Limited primary source today. If we ship on Claude, we should know Anthropic's enterprise-learning posture.
- **Accessibility on dynamically-generated learning content.** WCAG AA on static content is solved; on agent-generated, real-time micro-interventions it isn't. Tessera should own this open problem.

---

**Sources (selected):**
- Workday completes Sana acquisition, Nov 4 2025: https://newsroom.workday.com/2025-11-04-Workday-Completes-Acquisition-of-Sana
- SiliconANGLE on $1.1B Workday/Sana deal: https://siliconangle.com/2025/09/16/workday-acquires-sana-labs-1-1b-upgrade-agentic-ai-work-experiences/
- Sana Learn product page: https://sanalabs.com/products/sana-learn/
- Workday Illuminate Agents (May 2025): https://investor.workday.com/2025-05-19-Workday-Unveils-Next-Generation-of-Illuminate-Agents-to-Transform-HR-and-Finance-Operations
- Bersin, "Enterprise Learning Tech Market Transforms Around AI" (Feb 2026): https://joshbersin.com/2026/02/the-enterprise-learning-tech-market-quickly-transforms-around-ai/
- Bersin, "Corporate Training Lurches Toward Enablement" (Mar 2026): https://joshbersin.com/2026/03/the-world-of-corporate-training-lurches-toward-enablement/
- TalentLMS 2026 L&D Report: https://www.talentlms.com/research/learning-development-report-2026
- AIHR 2026 L&D stats: https://www.aihr.com/blog/learning-and-development-statistics/
- Cornerstone LMS vs LXP vs TXP: https://www.cornerstoneondemand.com/resources/article/lms-vs-lxp-vs-txp-a-complete-guide-to-help-you-decide-what-you-need/
- EU AI Act Annex III (high-risk education systems): https://artificialintelligenceact.eu/annex/3/
- EU AI Act 2026 enterprise compliance: https://secureprivacy.ai/blog/eu-ai-act-2026-compliance
- Pinsent Masons EU AI Act high-risk guide: https://www.pinsentmasons.com/out-law/guides/guide-to-high-risk-ai-systems-under-the-eu-ai-act
- ADA Title II April 2026 deadline: https://www.levelaccess.com/blog/ada-compliance-in-higher-education/
- Khanmigo: https://www.khanmigo.ai/ and pricing https://www.khanmigo.ai/pricing
- Multiverse Atlas AI coach: https://www.multiverse.io/
- Multiverse $70M funding: https://www.tamradar.com/funding-rounds/multiverse-70m-ai-upskilling
- Credly: https://info.credly.com/
- Sertifier vs Credly: https://sertifier.com/blog/sertifier-vs-credly/
- Microsoft 365 Copilot Learning/Workforce Insights agents: https://m365admin.handsontek.net/microsoft-365-copilot-retirement-skills-agent-frontier/
- Coursera Form 8-K FY2026: https://www.sec.gov/Archives/edgar/data/0001651562/000114036126020399/ef20072971_ex99-1.htm

*Word count: ~2,450. Brief is a DRAFT; Helm/Compass/Forge/Tessera/Kernel may push back on any specific claim and I'll source-deepen on request. — Eglin*
