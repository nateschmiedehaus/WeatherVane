# UX Principles

User experience guidelines for WeatherVane product.

---

## Core UX Principles

### 1. Clarity over Cleverness

**Principle**: Users should understand what's happening without guessing

**Good**:
- "Budget increased 15% because forecast shows 85°F tomorrow"
- Button: "Apply Recommendation"

**Bad**:
- "ML algorithm optimized allocation vector"
- Button: "Synergize"

---

### 2. Automation with Transparency

**Principle**: Automate decisions, but show why they were made

**Example**:
```
✅ Budget Adjusted Automatically

Google Ads: $1,000 → $1,200 (+20%)
Reason: Temperature forecast 87°F (peak ice cream weather)
Impact: Expected ROAS increase from $3.20 to $3.85

[View Details] [Undo]
```

**Why**:
- User trusts automation when they understand it
- Can override if needed
- Learns the system's logic

---

### 3. Progressive Disclosure

**Principle**: Show simple first, complex on demand

**Dashboard hierarchy**:
1. **Level 1** (always visible): Key metrics (ROAS, budget, recommendations)
2. **Level 2** (one click): Charts, trends, correlations
3. **Level 3** (modal/detail page): Advanced settings, model parameters

**Example**:
```
ROAS: $3.85 (+20% vs baseline)  ← Level 1
[Show Chart] ← Click for Level 2
  → Chart with temperature correlation
    [Advanced Settings] ← Click for Level 3
      → Model parameters, threshold tuning
```

---

### 4. Mobile-First Responsive

**Principle**: Optimize for mobile, enhance for desktop

**Breakpoints**:
- Mobile: 375px (iPhone SE)
- Tablet: 768px (iPad)
- Desktop: 1280px

**Mobile priority**:
- Key metrics visible without scrolling
- Charts simplified (fewer data points)
- Tap targets ≥44px

---

### 5. Performance as Feature

**Principle**: Speed is a feature, not an afterthought

**Targets**:
- Initial load: <2s (Time to Interactive)
- Page transitions: <100ms (perceived instant)
- API responses: <500ms (p95)
- Chart rendering: <200ms

**User perception**:
- <100ms: Instant
- <1s: Smooth
- >1s: Slow (show loading state)

---

## Design System

**Location**: `docs/WEB_DESIGN_SYSTEM.md`

### Spacing Scale

**Base unit**: 4px

**Scale**: `4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px`

**Usage**:
- `space-1` (4px): Tight spacing (icon-text gap)
- `space-2` (8px): Compact spacing (button padding)
- `space-3` (12px): Default spacing (card padding)
- `space-4` (16px): Section spacing
- `space-6` (24px): Large spacing (between sections)

---

### Typography Scale

**Font Family**: Inter (sans-serif)

**Scale**:
- `text-xs`: 12px (labels, captions)
- `text-sm`: 14px (body, form inputs)
- `text-base`: 16px (default body)
- `text-lg`: 18px (subheadings)
- `text-xl`: 20px (headings)
- `text-2xl`: 24px (page titles)

**Line Height**: 1.5 (default), 1.2 (headings)

---

### Color System

**Semantic colors**:
- `success`: Green (positive ROAS, goals met)
- `warning`: Yellow (approaching limits, caution)
- `error`: Red (over budget, failures)
- `info`: Blue (neutral information)

**Weather colors**:
- `sunny`: `#F5A623` (yellow/orange)
- `rainy`: `#4A90E2` (blue)
- `cloudy`: `#9B9B9B` (gray)
- `stormy`: `#4A4A4A` (dark gray)

---

## Component Library

### Button States

**Primary button**:
```
Default:  Blue bg, white text
Hover:    Darker blue bg
Active:   Even darker blue bg, slight scale down
Disabled: Gray bg, gray text, cursor not-allowed
Loading:  Blue bg, spinner, "Processing..."
```

**Secondary button**:
```
Default:  White bg, blue border, blue text
Hover:    Light blue bg
Active:   Blue bg, white text
```

---

### Form Inputs

**Text input**:
```
Default:  Gray border, white bg
Focus:    Blue border, white bg, box-shadow
Error:    Red border, red text below
Success:  Green border, green checkmark
Disabled: Light gray bg, gray text
```

**Validation feedback** (real-time):
- Email: Validate format on blur
- Budget: Validate range (min: $100, max: $100,000)
- Dates: Ensure end >= start

---

### Cards

**Standard card**:
```
┌─────────────────────────────┐
│ [Icon]  Title               │
├─────────────────────────────┤
│                             │
│ Content area                │
│                             │
├─────────────────────────────┤
│ [Action Button]             │
└─────────────────────────────┘
```

**Metric card**:
```
┌─────────────────────────────┐
│ ROAS                        │
│                             │
│ $3.85  (+20%)              │
│   ↑                         │
│ vs $3.20 baseline           │
└─────────────────────────────┘
```

---

## Interaction Patterns

### Loading States

**Skeleton screens** (preferred over spinners):
```
┌─────────────────────────────┐
│ ████████  ████              │  ← Animated gradient
│                             │
│ ████████████████            │
│ ████████████                │
│                             │
│ ████  ████  ████            │
└─────────────────────────────┘
```

**When to use**:
- Page load (full skeleton)
- Chart rendering (chart skeleton)
- Table loading (row skeletons)

---

### Error States

**Error message format**:
```
❌ Unable to load dashboard data

Reason: API connection timeout

What you can do:
• Refresh the page
• Check your internet connection
• Contact support if issue persists

[Retry] [Contact Support]
```

**Empty states**:
```
📊 No data yet

You haven't connected any ad accounts.

[Connect Google Ads] [Connect Meta Ads]
```

---

### Success Feedback

**Toast notification** (auto-dismiss after 3s):
```
┌──────────────────────────────┐
│ ✅ Budget updated successfully │
└──────────────────────────────┘
```

**Inline success**:
```
Budget: $1,200  ✅ Saved
```

---

## Accessibility

### WCAG AA Compliance

**Color contrast**:
- Text on background: ≥4.5:1 (normal text)
- Large text on background: ≥3:1 (18px+ or 14px+ bold)

**Checker**: Use WebAIM Contrast Checker

---

### Keyboard Navigation

**Tab order**: Logical (top-to-bottom, left-to-right)

**Focus indicators**: Visible blue outline on all interactive elements

**Keyboard shortcuts**:
- `Tab`: Next element
- `Shift+Tab`: Previous element
- `Enter`/`Space`: Activate button/link
- `Esc`: Close modal

---

### Screen Reader Support

**ARIA labels** for icons:
```html
<button aria-label="Increase budget">
  <PlusIcon />
</button>
```

**Semantic HTML**:
- Use `<button>` not `<div onclick>`
- Use `<nav>` for navigation
- Use `<main>` for main content
- Use `<h1>`, `<h2>` hierarchy

---

## Charts & Data Visualization

### Chart Guidelines

**Line charts** (trends over time):
- X-axis: Date
- Y-axis: Metric (ROAS, budget, sales)
- Use: Show trends, seasonality

**Scatter plots** (correlations):
- X-axis: Weather variable (temperature, precipitation)
- Y-axis: Business metric (ROAS, sales)
- Trend line: Show correlation strength
- Use: Prove weather-business relationship

**Bar charts** (comparisons):
- X-axis: Categories (channels, products, dates)
- Y-axis: Metric
- Use: Compare performance across categories

**Avoid**: Pie charts (hard to compare), 3D charts (misleading)

---

### Chart Interactions

**Hover**:
- Show tooltip with exact values
- Highlight data point
- Dim other data points

**Click**:
- Drill down to detail view
- Filter other charts

**Zoom**:
- Pinch to zoom (mobile)
- Scroll to zoom (desktop)

---

## Responsive Design

### Mobile (<768px)

**Layout**:
- Single column
- Stack cards vertically
- Full-width buttons
- Simplified charts (fewer labels)

**Navigation**:
- Hamburger menu
- Bottom nav bar (thumb-friendly)

---

### Tablet (768px-1279px)

**Layout**:
- 2 columns
- Side-by-side cards
- Expanded charts

---

### Desktop (1280px+)

**Layout**:
- 3-4 columns
- Dashboard grid
- Full-featured charts
- Sidebar navigation

---

## Motion & Animation

### Principles

**Purpose-driven**: Animate to guide attention, not decorate

**Smooth**: 60fps (use CSS transforms, avoid layout thrashing)

**Fast**: <300ms duration

---

### Animation Guidelines

**Page transitions**: 200ms ease-out
**Button hover**: 150ms ease-in-out
**Modal open/close**: 250ms ease-out
**Chart rendering**: 300ms ease-out (stagger bars/lines)

**Reduce motion**: Respect `prefers-reduced-motion` media query

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## UX Metrics

### Measure Success

**Quantitative**:
- Time to first interaction (<2s)
- Task completion rate (>90%)
- Error rate (<5%)
- Session duration (indicator of engagement)

**Qualitative**:
- User feedback (NPS, surveys)
- Usability testing (5 users per iteration)
- Support tickets (frequency of confusion)

---

## References

- [Web Design System](/docs/WEB_DESIGN_SYSTEM.md)
- [UX Critique](/docs/UX_CRITIQUE.md)
- [Design System Acceptance Tests](/tests/web/design_system_acceptance.spec.ts)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
