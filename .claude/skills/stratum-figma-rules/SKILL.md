---
name: stratum-figma-rules
description: Enforces Stratum's rules for the Figma Console MCP — the Fraunces / Newsreader / JetBrains Mono typography stack, the paper / ink / ochre / moss / plum palette, canonical token sources in the repo CSS, sentence-case naming, Auto Layout defaults, trim-every-default discipline, the rt-stamp pill convention, and the WCAG 2.2 AAA contrast bar (O-1). Use any time tessera (or any agent) calls a Figma Console MCP tool (figma_*, figjam_*) while working in the Stratum project, creates or edits Stratum components / frames / variables / layouts in Figma, or when the user mentions Stratum's Figma surface, design tokens, Console mockups, Recruiter mockups, or Tenure mockups.
---

# Stratum Figma rules

This skill is **Stratum's** contract for how agents use the Figma Console MCP. It is the Stratum-specific companion to the generic `figma-console-rules` skill and **supersedes it whenever the work is for Stratum** (Console, Recruiter, Tenure, Cairn, the candidate-facing site, briefings, customer notes, decks).

Stratum is an autonomously-operated HCM/ATS company. Its brand is editorial, restrained, and serif-led — closer to Stripe Press than to a typical SaaS dashboard. The rules below encode the choices that make Stratum look like Stratum in Figma.

## When this skill applies

Any call to a Figma Console MCP tool — `figma_*` or `figjam_*` — **while working in the Stratum repo** (`/Users/mp/git-repos/poc-autonomous-hcm/`) triggers these rules. Before the **first** Figma tool call in a session, run the [Session pre-flight](#session-pre-flight). Before **every** visual change, run the [Pre-change checklist](#pre-change-checklist).

If you are not working on Stratum, use the generic `figma-console-rules` skill instead.

## Stratum brand snapshot

Carry this in working memory the moment the skill loads. Everything downstream is grounded in it.

### Typography stack — never deviate

| Role | Family | Source |
|---|---|---|
| Display (headlines, hero, agent names) | **Fraunces** | Google Fonts; opsz 9..144, wght 300..900, SOFT 0..100, WONK 0..1 |
| Body / serif (paragraphs, dek, blurbs) | **Newsreader** | Google Fonts; ital 0,1; opsz 6..72; wght 300..700 |
| Mono / eyebrow / chip / label | **JetBrains Mono** | Google Fonts; wght 400/500/700 |

**Forbidden** without an explicit Chairman override: Inter, Roboto, Arial, Helvetica, system-ui, SF Pro, anything sans-serif as the primary text face. If the design system file doesn't have a Fraunces / Newsreader / JetBrains Mono text style, **stop and bootstrap one** from the source recipes below — don't substitute.

Typical specimens (lifted from `tenure/index.html`):

- `display-xl` — Fraunces 5.8rem (~93px), wght 500, opsz 144, SOFT 0, line-height 0.98, letter-spacing -0.038em
- `display-lg` — Fraunces 48px, wght 500, opsz 144
- `display-md` — Fraunces 36px, wght 500, opsz 96
- `display-xs` — Fraunces 22px, wght 500, opsz 72
- `dek` — Newsreader 22px, wght 400, opsz 28, line-height 1.45
- `body` — Newsreader 17–18px, wght 400, line-height 1.65, font-feature-settings "kern","liga","onum"
- `eyebrow-mono` — JetBrains Mono 11px, wght 400, letter-spacing 0.26em, UPPERCASE
- `chip-mono` — JetBrains Mono 10px, wght 500, letter-spacing 0.18em, UPPERCASE

### Colour palette — the only colours that exist

The canonical source is the `:root` block in `/Users/mp/git-repos/poc-autonomous-hcm/tenure/index.html` (and the matching block in `/assets/styles.css`). Every Stratum file's colour collection must be transcribed from this — never invented, never approximated.

| Token | Hex | Role |
|---|---|---|
| `paper` | `#f4ecda` | Default surface (cream paper) |
| `paper-warm` | `#f7f0e0` | Elevated card / pull surface |
| `paper-rule` | `#d8cdb6` | Hairline / rule line |
| `paper-rule-2` | `#c8b894` | Stronger rule (table dividers) |
| `ink` | `#0e1626` | Primary text on paper (15.4:1) |
| `ink-2` | `#2a3344` | Secondary heading / strong body |
| `ink-3` | `#4b5365` | Tertiary text (use ink-3-aaa for AAA) |
| `ink-mute` | `#6c7180` | Mute (use ink-mute-aa for AAA) |
| `ink-3-aaa` | `#3d4456` | AAA-safe tertiary text (8.27:1) |
| `ink-mute-aa` | `#404755` | AA-safe mute label (7.93:1) |
| `ochre` | `#b8651f` | Decorative accent only — not text on paper (3.63:1) |
| `ochre-link` | `#7a3d0a` | Link text, eyebrow, decision-class RECOMMEND (7.14:1 AAA) |
| `ochre-deep` | `#8a4711` | Pressed / hover accent |
| `ochre-soft` | `#e6c79b` | Tinted background (use only as fill, not text on it) |
| `moss` | `#4a5d3a` | Decision-class DECIDE (decorative non-text; chip border ok) |
| `plum` | `#6b3a4a` | Decision-class READ-ONLY / HUMAN ONLY (7.67:1 on paper, AAA) |

**Forbidden** without an explicit Chairman override: pure red (`#ff0000` / `#dc2626` and friends), pure black (`#000000`), pure white (`#ffffff`), generic SaaS blues/greens. The Stratum vibe is *defensible*, not punitive — see the Tenure leaver / case-file artifact for the canonical restraint.

If a Stratum surface needs a semantic colour the palette doesn't define (e.g., a `success` green not yet ratified), **stop and report as a Token gap**. Do not invent.

### Decision-class chip semantics

Stratum's products (Console, Recruiter, Tenure) all expose the four-tier decision class. The chip is part of the design system. Colours map as:

| Tier | Verb | Chip text | Chip border |
|---|---|---|---|
| I | DECIDE | `ink-3-aaa` (#3d4456, 8.27:1) | `moss` (#4a5d3a) |
| II | RECOMMEND | `ochre-link` (#7a3d0a, 7.14:1) | `ochre-link` |
| III | SUGGEST | `ink-3-aaa` (#3d4456, 8.27:1) | `ink-3-aaa` |
| IV | READ-ONLY / HUMAN ONLY | `plum` (#6b3a4a, 7.67:1) | `plum` |

Chip text is `chip-mono` (JetBrains 10px, wght 500, letter-spacing 0.18em, UPPERCASE). Chip is 1px stroke, no fill, ~20px tall (3px pad + 14px text + 3px pad) — set `layoutSizingVertical = HUG`, never FIXED.

Reference: `/Users/mp/git-repos/poc-autonomous-hcm/tenure/index.html` `.agent-class` and `.t-class` blocks.

### The rt-stamp pill

Every Stratum artifact carries a real-elapsed-time pill in the bottom-right. Pattern: `rt · 2026-05-20 09:50 UTC` (or `rt · T+155d · narrative`). JetBrains Mono 10px, `ink-mute-aa` on `paper`, 1px `paper-rule` border, pill radius. **Set `layoutSizingVertical = HUG`**, not FIXED — Stratum's rt-stamps have all rendered as 100px balloons because of FIXED defaults in past sessions. This is a known gotcha.

### Stratum naming conventions

Sentence case for every layer / frame / section. The Section that holds product artifacts is named for the product:

- `Tenure` — Tenure artifacts
- `Console` — Console UI artifacts
- `Recruiter` — Recruiter ATS artifacts
- `Cairn` — agentic-learning artifacts
- `Brand` — brand-system artifacts

Frame names inside a section follow `Product / Frame purpose` — e.g. `Tenure / Agent roster`, `Console / Inspect drawer`, `Recruiter / Candidate scorecard`. Component-style local primitives use `Component / variant`: `Decision class chip / decide`, `Agent card / threshold`, `Case file row / decision`.

## Session pre-flight

Run these in order, once per session, before any other Figma tool call. NodeIds, variable ids, and token ids are session-scoped and go stale across conversations — never reuse them from a previous session.

1. `figma_get_status` with `probe: true` — confirm the Desktop Bridge plugin is connected and which file is open. If "No active file connected," **stop**: tell the user to reopen the Desktop Bridge plugin (Plugins → Development → Figma Desktop Bridge → Run; it will rescan ports 9223–9232 and bind to whichever MCP server is live).
2. `figma_get_design_system_summary` — high-level view of the design system available in this file.
3. `figma_get_token_values` (type `all`) — load the live token catalogue (colour, spacing, typography, radius). **Hold the result in working memory.** Every fill, stroke, padding, gap, radius, and text style must reference one of these tokens.
4. `figma_get_text_styles` — load text styles. If empty, you'll be bootstrapping (see below).
5. `figma_search_components` — load the component library for this session. Hold the result in working memory; every `figma_instantiate_component` call must use a nodeId returned in the current session.

If steps 3–5 return an empty catalogue (a blank file), proceed to [Bootstrapping a blank Stratum Figma file](#bootstrapping-a-blank-stratum-figma-file) before building any artifact.

## Bootstrapping a blank Stratum Figma file

A blank file with no tokens / styles / components is a common starting point. Bootstrapping the foundation is **transcription**, not invention — the canonical sources are in the repo. You may, and should, create the foundation. Cite the source in your final report.

### What to create

1. **Colour collection** (`Colour`) — every variable from the palette table above, transcribed from `/tenure/index.html` `:root` block. Sentence-case names: `Colour / paper`, `Colour / ink`, `Colour / ochre link`, etc.
2. **Spacing collection** (`Spacing`) — `4, 8, 12, 16, 24, 32, 48, 64` px. Names: `Spacing / xs (4)`, `Spacing / sm (8)`, `Spacing / md (12)`, `Spacing / lg (16)`, `Spacing / xl (24)`, `Spacing / 2xl (32)`, `Spacing / 3xl (48)`, `Spacing / 4xl (64)`. Source: derived from Stratum's visual rhythm in the repo CSS.
3. **Radius collection** (`Radius`) — `sm (4)`, `md (8)`, `pill (999)`. Source: derived from repo CSS.
4. **Text styles** — minimum set:
   - `display-lg` (Fraunces 48), `display-md` (Fraunces 36), `display-xs` (Fraunces 22)
   - `dek` (Newsreader 22), `body` (Newsreader 17), `caption` (Newsreader 13), `task` (Newsreader 15)
   - `eyebrow-mono` (JetBrains 11), `chip-mono` (JetBrains 10), `nav-mono` (JetBrains 10), `label-mono` (JetBrains 10), `mark` (JetBrains 11)
   - `agent-name` (Fraunces 28), `agent-tag` (JetBrains 11)

### How to create

Prefer the batch APIs:

- `figma_setup_design_tokens` — full collection + modes + variables in one call.
- `figma_batch_create_variables` — many variables at once.

Use the singular `figma_create_variable` / `figma_update_variable` only for one-off changes.

### What you may NOT invent during bootstrap

- A hex/spacing/radius that isn't in the cited repo CSS.
- A semantic colour the repo never defined (e.g. `success`, `danger`, `info`). If you need one, surface it as a Token gap and stop until the Chairman or Tessera approves.
- A text style for a font not in the Stratum stack (no Inter / Roboto / SF Pro / Helvetica — see Typography stack above).

## Component rules

### Re-search every session

NodeIds and component keys are session-specific. Always call `figma_search_components` at session start. Never reuse a nodeId from a previous chat, screenshot, or memory.

### Inspect props before instantiating

Before calling `figma_instantiate_component`, inspect the component's properties so the right variant is picked instead of customising the instance afterwards.

1. `figma_get_component_details` (or `figma_get_component`) on the component.
2. Read available properties — variants, boolean toggles, text props, instance-swap props.
3. Decide whether changing a prop yields the screen you want before instantiating.
4. Pass chosen prop values into `figma_instantiate_component` via `properties` (or `figma_set_instance_properties` immediately after).

**Rule of thumb:** if a prop gets you closer, use it. Don't override a fill, hide a child, or resize an instance to fake a state that's already a variant.

### Trim every default — Stratum placeholder strings

After instantiating a component, every visible child must be customised, trimmed, or hidden. **No placeholder strings survive in the final screenshot.** In Stratum specifically, watch for:

- Generic library defaults: `Heading`, `Subheading`, `Label`, `Primary Action`, `Secondary Action`, `Breadcrumb`, `Group title`, `Menu item`, `Description`, `Card title`, `Subtitle`.
- **Stratum-specific placeholders** to also catch: `Agent name`, `Tier`, `Verb`, `Decision class`, `Customer`, `Time pending`, `Reviewer`, `Case file ID`.
- **Lorem-ipsum / fake-data tells:** `John Doe`, `Jane Smith`, `Acme Corp`, `Sample customer`, `2024-01-01`. If a screen needs a placeholder customer, use the canonical Stratum customer roster: Mercator, Halcyon, Northwind, Cordova, Vanta, Atlas.

If a screenshot shows any of these strings, the screen isn't done.

### Match repetition depth to screen depth

Repeating-slot containers (breadcrumbs, tabs, nav items, action groups, step indicators) must show **exactly** the slots the screen's information hierarchy calls for. Filler slots reading `Breadcrumb` or `Label` are an automatic fail.

| Screen depth | Breadcrumb |
|---|---|
| Tenure / Joiner queue (second level) | `Tenure / Joiner` — 2 segments, not 4 |
| Console / Inspect drawer for a person (third level) | `Console / People / Priya Ranganathan` — 3 segments |
| Standalone auth or full-screen modal | Hide the breadcrumb entirely |

How to trim: count the levels, customise the label for the ones that stay, hide the rest via `👁️ Show Label? = false` on each item. **Do not hide the entire breadcrumb to dodge filler slots** when the screen genuinely needs the trail — trim the slots.

### Atomic batching for slot-bound sublayers

Once you've identified property changes for a single instance, pass them to **one** `setProperties` call. Sequential individual calls on sibling sublayer instances inside a SLOT fail — the first override bakes the slot's content; subsequent reads of surviving siblings return `not instance` or `does not exist`.

Bites especially on:

- Multiple breadcrumb items inside a Breadcrumb slot.
- Multiple tab items inside a Tabs slot.
- Multiple action buttons inside an Action Group slot.
- Multiple decision-class chips in a single row.

**Workflow:**

1. Discover every sibling id and every property change in **one** read pass before any writes.
2. For each instance, apply **all** of its property changes in a single `setProperties` call.
3. Don't intersperse reads between writes — that's when slots bake and ids go stale.

### Don't break instance overrides

Never detach an instance unless the user explicitly asks. If the design needs something the component doesn't expose, flag it as a **Component gap** in your reply rather than detaching and editing.

## Token rules

### Browse first, reuse always

After the session pre-flight, every visual property references a token from `figma_get_token_values`:

- **Fills and strokes** — bind via `figma_set_fills` / `figma_set_strokes` using the variable id. **Never set a raw hex.**
- **Spacing** — paddings and `itemSpacing` bind to spacing tokens. **No hard-coded pixel values.**
- **Radius** — use radius tokens.
- **Typography** — bind text styles via `figma_get_text_styles`; do not set raw font-size / line-height numbers.

### Creating new tokens

If the design genuinely needs a value the catalogue doesn't have **and the value is not in the canonical repo CSS**, stop and ask before creating a new variable. When approved, prefer the batch tools.

Bootstrapping a blank file from the canonical repo CSS is allowed without asking — see [Bootstrapping a blank Stratum Figma file](#bootstrapping-a-blank-stratum-figma-file).

### Token misses are reported, not invented

If a Stratum surface needs a token that doesn't exist in either the live Figma catalogue or the repo CSS, list it under **Token gaps** in your reply. Example: "needs a `moss-deep` (#3a4d2a, 7.85:1) for AAA text on moss-context surfaces — not in repo CSS." Don't invent a value to fill the gap.

## Naming rules

Sentence case for every layer, frame, group, component instance, and section.

| Element | Good | Bad |
|---|---|---|
| Section | `Tenure` | `tenure`, `TENURE`, `Tenure-section` |
| Frame | `Tenure / Agent roster` | `TenureAgentRoster`, `tenure-agent-roster`, `tenure_roster` |
| Local primitive | `Decision class chip / decide` | `DecisionClassChip-Decide`, `chip-decide` |
| Auto Layout container | `Case file body` | `case-file-body`, `CaseFileBody`, `case_file_body` |

When creating a node with `figma_create_child` / `figma_clone_node`, set the name immediately via `figma_rename_node`. When instantiating a component, rename the resulting instance to describe its role on the screen, not the component name.

## Auto Layout rules

### Always Auto Layout

Every container with more than one child is Auto Layout. Use absolute positioning only when the user asks explicitly (floating badges, decorative graphics, the rt-stamp pill anchored bottom-right).

### Fill container for spanning children

Children that should span the parent — content rows in a card body, table rows, action row buttons that share width — set to **Fill container** on the relevant axis. Use Hug for elements whose width is driven by content (chips, icons, badges).

### Spacing tokens, not pixels

Padding and `itemSpacing` on Auto Layout frames bind to spacing variables. Never set a literal pixel number.

### Centered by default — with editorial exceptions

Default `primaryAxisAlignItems` and `counterAxisAlignItems` to `CENTER`. Stratum departs from CENTER for **editorial** layouts — paragraph-style frames (e.g., the Tenure landing hero, briefing body text) use `MIN` (left/top) because they read as serif prose, not as cards. When you depart from CENTER, note the reason briefly in your reply.

## Pre-change checklist

Copy this checklist into working memory before any tool call that creates, modifies, or deletes a visual node.

```
- [ ] Session pre-flight has run this session (status, summary, tokens, text styles, components)
- [ ] If blank file: token foundation + text styles bootstrapped from canonical repo CSS, source cited
- [ ] Target parent is a product Section (Tenure / Console / Recruiter / Cairn / Brand), not the blank canvas
- [ ] If instantiating a component: nodeId is from THIS session's search, props inspected, best variant chosen
- [ ] Repeating-slot chrome (breadcrumb, tabs, nav items, action row) matches screen depth — extras hidden, not filler
- [ ] Every visible child customised / trimmed / hidden — no placeholder labels, no Stratum-specific placeholders, no lorem-ipsum
- [ ] All overrides for each instance batched into a single setProperties call
- [ ] Every fill / stroke / padding / gap / radius / text style references a token from the live catalogue
- [ ] Typography is Fraunces / Newsreader / JetBrains Mono only — no Inter / Roboto / Arial
- [ ] Colour bindings respect AAA: ink/ink-2/ink-3-aaa/ink-mute-aa/ochre-link/plum for text; ochre/moss reserved for decoration; no raw red
- [ ] Decision-class chips (if present) use the canonical chip semantics — chip text on AAA-safe colours, border on moss/ochre-link/ink-3-aaa/plum
- [ ] rt-stamp pill present if this is a publishable artifact, with HUG vertical sizing (not FIXED)
- [ ] Node name(s) are sentence case in the Stratum naming pattern
- [ ] Container is Auto Layout; spanning children use Fill container
- [ ] Padding and itemSpacing bound to spacing tokens
- [ ] Auto Layout alignment is CENTER unless this is an editorial paragraph frame (then MIN, briefly noted)
```

After the change, follow the visual validation loop: `figma_take_screenshot` of the affected node, check alignment / spacing / proportions / Fill-vs-Hug / chip vertical sizing, iterate up to 3 times, then a final verification screenshot.

## Accessibility — O-1 standing objective in Figma

Stratum's standing objective is WCAG 2.2 AAA, continuously. In Figma terms:

- **Contrast pairs ≥ 7:1 normal text, ≥ 4.5:1 large text.** Compute from token hexes — never approximate by eye. Cite each pair you used in your final report.
- **Non-text contrast ≥ 3:1** (SC 1.4.11) for chip borders, focus rings, decorative dividers that carry meaning.
- **Target sizes ≥ 24×24 for any tappable** (SC 2.5.8 AA), prefer ≥ 44×44 for AAA practical comfort. Decision-class chips are non-interactive labels — SC 2.5.8 doesn't apply unless they become filterable.
- **Focus order** — describe top-to-bottom for any interactive screen in your reply.
- **Motion** — animations require `prefers-reduced-motion` handling. Document the reduced-motion behaviour as part of the spec, even in a static Figma artifact.
- **Language attributes** — non-English copy in mockups (e.g., German for Meridian Energy) is marked with the language in the layer note for downstream implementation.

**No silent AAA misses.** Any miss is logged under "Accessibility waivers" with the deliberate reason and a closure ETA. The default is no waivers.

## What to surface back to the user

Your reply at the end of any Figma task must include:

- **What was created or changed** — each frame name and nodeId.
- **Token foundation** (if you bootstrapped) — collections created, variable counts, source citation per group.
- **Tokens used** — every colour, spacing, radius, text-style token referenced, by id.
- **Token gaps** — values the design needed that aren't in the catalogue or the repo CSS. Describe each.
- **Component gaps** — patterns the system doesn't have a component for yet (likely candidates in Stratum: decision-class chip, agent card, case-file row, action button, Console chrome band).
- **Placeholder labels remaining** — any default copy still visible in a final screenshot, including the Stratum-specific list above. If non-empty, the screen isn't done — say so explicitly.
- **Accessibility audit** — contrast pairs (computed from hexes, AAA threshold), target sizes, focus order, waivers (if any).
- **Final screenshots** — one per artifact frame, from the validation loop.
- **Outbox entry** — if the artifact is publishable, write one outbox JSON file at `/Users/mp/git-repos/poc-autonomous-hcm/agent-outbox/` per the protocol in `agents/CLAUDE.md`. Type `publish`. Sentence-case title ≤ 80 chars. 1–3-sentence concrete summary.
- **Standing-objective note (O-1)** — one paragraph: did this dispatch advance AAA, how, what's left.

## Anti-patterns

- **Don't reuse nodeIds or variable ids from a previous session.** Always re-search and re-browse.
- **Don't substitute Inter / Roboto / Arial** for Fraunces / Newsreader / JetBrains Mono. If the text styles are missing, bootstrap them.
- **Don't use pure red / pure black / pure white** without an explicit Chairman override. Stratum's restraint is the brand.
- **Don't ship placeholder copy.** `Heading` / `Subheading` / `Label` / `Primary Action` / `Secondary Action` / `Breadcrumb` / `Agent name` / `John Doe` mean the screen isn't done.
- **Don't ship visible filler slots.** Trim repeating-slot chrome to match the screen's actual depth.
- **Don't hide an entire breadcrumb or tab row** to avoid trimming — hide individual slots instead, unless the chrome genuinely doesn't belong on the screen.
- **Don't override sibling sublayers one at a time.** Batch all property changes for each instance into a single `setProperties` call.
- **Don't customise an instance to fake a variant.** Use the prop.
- **Don't set raw hex / px values** when a token exists. Bind the variable.
- **Don't ship a decision-class chip with FIXED vertical sizing.** Use HUG — the chip is 20px tall, not 100px.
- **Don't ship a rt-stamp pill with FIXED vertical sizing.** Same gotcha.
- **Don't use PascalCase, kebab-case, or snake_case** for layer names. Sentence case in the Stratum pattern.
- **Don't mix Hug and Fixed children** when Fill container is what the layout needs.
- **Don't invent tokens silently.** Ask before creating a value that isn't in the canonical repo CSS; surface gaps when you don't.
- **Don't detach instances** to work around missing props. Flag the gap.
- **Don't skip the validation screenshot loop**, even for "small" changes.
- **Don't file silent AAA misses.** Waivers are logged with a closure ETA, or the change doesn't ship.

## See also

- `figma-console-rules` — the generic team playbook this Stratum skill is layered on. Read it for the underlying MCP discipline rationale; come back here for the Stratum specifics.
- `/Users/mp/git-repos/poc-autonomous-hcm/tenure/index.html` — canonical source for the Stratum colour palette, decision-class semantics, and editorial typography rhythm.
- `/Users/mp/git-repos/poc-autonomous-hcm/assets/styles.css` — broader Stratum CSS tokens.
- `/Users/mp/git-repos/poc-autonomous-hcm/.claude/agents/tessera.md` — the design agent's identity, standing objectives, and refusals.
- `/Users/mp/git-repos/poc-autonomous-hcm/accessibility/` — the public accessibility commitment and rolling gap list.
