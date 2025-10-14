# Demo & Onboarding Wireframes
**Updated:** 2025-10-13  
**Authoring Crew:** WeatherVane super-team (Product × Design × Eng)  
**Scope:** Landing sample plan CTA, demo tenant selection, connector checklist, Plan empty state activation, Automation guardrail teaser.

---

## Why This Exists
- Eliminate the current dead-end `See a sample plan` CTA on `apps/web/src/pages/index.tsx`.
- Provide a guided tour that proves value in < 3 clicks, even with no customer data.
- Keep the narrative consistent with the refreshed calm/aero theme while seeding future build tickets for engineers.
- Unblock exec_review critic expectations for onboarding, demo proof, and automation trust scaffolding (`docs/UX_CRITIQUE.md:27-40`).

## Success Criteria
- **Time-to-demo &lt; 30s:** Visitors reach a seeded Plan view with contextual narration in ≤3 interactions.
- **Connector intent captured:** We collect which channels a visitor cares about before they see empty tables.
- **Guardrail confidence bump:** Automations preview shows a real audit trail so execs trust pushes even in demo mode.
- **Telemetry ready:** Each decision point has analytics hooks for drop-off (`event_category: onboarding_demo`).

## Flow Overview
1. Landing CTA opens a side-panel with a storyboard of the demo tenant and a “Start guided tour” button.
2. Guided tour asks 2 lightweight questions (primary channel, automation comfort) and writes answers to local demo state.
3. Plan empty state transforms into a 3-step progress tracker with inline connector shortcuts and a live sample plan preview.
4. Automations slide-out showcases audit history + validation messaging derived from seeded demo actions.

---

## Screen 1 · Landing Hero With Live Demo CTA
````markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ HERO (copy unchanged)                                                        │
│ ┌───────────────┐  ┌──────────────────────────┐                              │
│ │ Request access│  │ See a sample plan ▶      │ -- opens right-side panel    │
│ └───────────────┘  └──────────────────────────┘                              │
│                                                                              │
│ RIGHT PANEL (slides over globe)                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ WEATHER STORY OF THE WEEK                                                │ │
│ │ - “Sunbelt heatwave – sunscreen up 22%”                                  │ │
│ │ - “NYC rain – shift spend to umbrellas”                                  │ │
│ │ Demo includes: Plan, Stories, Automations, Guardrails                    │ │
│ │                                                                          │ │
│ │ [Start guided tour]   [Watch 90s walkthrough]                            │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
````
**Design notes**
- Panel uses existing `Layout` overlay primitives (see `apps/web/src/components/Drawer.tsx`).
- “Watch 90s walkthrough” links to hosted Loom fallback for execs who skip interactive mode.
- Analytics: track `cta=open_demo_panel`, `cta=start_tour`, `cta=watch_walkthrough`.

---

## Screen 2 · Guided Tour Intake (Step 1 of 3)
````markdown
┌───────────────────────────── Drawer ────────────────────────────────────────┐
│ STEP CHIP: 1 of 3 — “Tailor your sample plan”                               │
│ Q1: Which channel do you care about most today?                             │
│ • Meta Ads (default)    • Google Search    • Email/Klaviyo    • Shopify POS │
│ Q2: How hands-on do you want automations?                                   │
│ • Manual approvals       • Assist (1-click push)        • Autopilot         │
│                                                                              │
│ Secondary copy: “We pre-fill your demo plan using these answers.”           │
│                                                                              │
│ [Next: Preview your plan ▶]                      [Skip tour]                │
└──────────────────────────────────────────────────────────────────────────────┘
````
**Design notes**
- Leans on existing radio-card styles (`apps/web/src/components/OptionGroup.tsx`).
- Persist answers in local storage to personalize subsequent screens.
- Skip drops into full Plan demo but logs `tour=skipped` for analysis.

---

## Screen 3 · Plan Empty-State With Demo + Setup Progress
````markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER retains hero + summary card (from `apps/web/src/pages/plan.tsx`).     │
│                                                                              │
│ ┌─────────────── Empty-state tile replaces current instructions ───────────┐ │
│ │ “You’re in demo mode” badge                                              │ │
│ │ Stepper: [1 Demo loaded ✓] [2 Connect your data ▷] [3 Automations ready ▷]│ │
│ │ Copy: “Here’s how WeatherVane would steer your spend this week.”         │ │
│ │ Buttons: [Explore sample opportunities] [Connect Shopify] [Invite teammate]│
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ DEMO PLAN PREVIEW (scrolling)                                                │
│ • Action queue cards seeded with persona answers                             │
│ • Highlight callouts pointing to “Push via Assist” button                    │
│ • Sticky “Next: Secure your connectors” pill (affixed bottom-right)          │
└──────────────────────────────────────────────────────────────────────────────┘
````
**Design notes**
- Uses `Plan` component toggles (add `isDemo` flag driving seeded dataset + callouts).
- Each step in the progress tracker links to either connectors drawer or automations preview.
- Telemetry: `progress_step_clicked`, `demo_action_viewed`.

---

## Screen 4 · Connector Checklist Drawer
````markdown
┌───────────────────────────── Drawer ────────────────────────────────────────┐
│ STEP CHIP: 2 of 3 — “Secure your datasets”                                  │
│ Checklist items (use existing landing checklist copy):                      │
│ 1. Shopify — “1-click OAuth (read-only safe)”   [Connect]                   │
│ 2. Meta Ads — “Adds weather guardrails automatically” [Connect]             │
│ 3. Google Ads — “Keeps Smart Bidding in range”   [Pending data]             │
│                                                                              │
│ Inline state: show mock token age + sample sync timestamp.                  │
│                                                                              │
│ Footer: “Need a demo tenant instead? We can stage one for you.” [Request]   │
└──────────────────────────────────────────────────────────────────────────────┘
````
**Design notes**
- Mirrors future real connector flow—engineers can swap demo APIs with live actions later.
- “Request demo tenant” triggers backend notification for ops follow-up.
- Adds trust copy referencing platform-safe behavior.

---

## Screen 5 · Automations Guardrail Preview (Step 3 of 3)
````markdown
┌───────────────────────────── Drawer ────────────────────────────────────────┐
│ STEP CHIP: 3 of 3 — “Review automation guardrails”                           │
│ Demo timeline (auto-scroll)                                                 │
│ • 06:00 — Assist push scheduled ✅ “Rainfall surge in NYC – $2.5k reallocated” │
│ • 06:02 — Guardrail check ✅ “ROAS floor maintained (p50 4.2x)”                │
│ • 06:10 — Push sent to Meta via Assist ⚠ “Learning phase preserved.”          │
│ Inline validation summary: “Demo is read-only; your campaigns stay untouched.”│
│                                                                              │
│ CTA: [See automation audit log] (navigates to `/automations?demo=true`)      │
│ Secondary CTA: [Finish tour → Invite teammates]                              │
└──────────────────────────────────────────────────────────────────────────────┘
````
**Design notes**
- Reuses `AutomationHistory` components with demo data injection (see `apps/web/src/pages/automations.tsx`).
- Copy reinforces safety + trust to address audit gaps from critique.
- “Invite teammates” re-opens Plan with share modal (existing `SharePlanDialog`).

---

## Implementation & Measurement Checklist
- [ ] Add `demoState` context provider (used by `/plan`, `/automations`, `/stories`).
- [ ] Build `DemoTourDrawer` component referenced by landing hero.
- [ ] Seed deterministic demo dataset tied to intake answers (store JSON under `apps/web/src/demo/`).
- [ ] Instrument CTA interactions and drop-offs via `analytics.track`.
- [ ] Partner with Eng to ensure connectors drawer gracefully degrades without API access.
- [ ] Validate copy with product marketing; adjust tone if Autopilot promises evolve.

---

## Open Questions
- Do we expose pricing or “Contact sales” in demo flow, or keep it discovery-only?
- Should the automation preview be interactive (toggle Manual vs Assist) or static for v1?
- How do we reset tour state for returning visitors still in evaluation?

---

## Next Moves
1. Sync with engineering owners for `/plan` and `/automations` to estimate lift on demo dataset + drawers.
2. Update UX critique doc with links/screenshots once hi-fi mocks land.
3. Prep exec_review evidence packet (walkthrough video + analytics plan) once build starts.

