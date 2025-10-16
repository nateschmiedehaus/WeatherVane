# Motion Design Specification — WeatherVane Flagship

## Philosophy
WeatherVane treats motion as critical storytelling. Each weather transition is designed to signal urgency without compromising clarity. Our easing strategy blends cinematic pacing with performance headroom; default easing uses `cubic-bezier(0.24, 0.82, 0.34, 1)` to deliver an elastic-yet-crisp feel.

## Timelines & Keyframes
- **Scenario Timeline** — A 3.6s sequence that layers precipitation streaks behind campaign cards. The timeline anchors around the incoming weather transition moment. Keyframes at 0%, 35%, 68%, and 100% highlight the plan formation, with track mattes managing compositing for accessibility.
- **Creative Reveal** — Micro-interaction triggered on hover; timeline length 420ms. We apply an anticipatory easing to scale typography, then fade the background card. The focus indicator respects reduced motion preferences by shortening the timeline to 240ms.
- **Executive Summary Intro** — For presentation mode we orchestrate a 2.2s camera pan across the ROI charts, using layered parallax. The timeline is annotated in Figma and exported to JSON for Framer Motion playback.

## Component Inventory
1. **Forecast Carousel** — Uses Framer Motion to drive horizontal transitions with spring physics tuned to `stiffness: 440`, `damping: 42`. Each slide includes a weather insight badge that pulses at 72fps for 180ms. Touch input gestures rely on inertial scrolling yet remain accessible via keyboard triggers.
2. **Alert Drawer** — Entry animation 360ms, exit 240ms. Easing uses `easeInOutCubic`. A micro-interaction toggles the severity indicator through color, scale, and a subtle blur to emphasize brewing conditions.
3. **Demo CTA Button** — Weather-driven gradient ripple triggered on click. The ripple timeline is 560ms; we batch DOM updates to maintain 60fps across devices.

## Performance Guidelines
- All motion sequences must sustain 60fps on M1 MacBook Air and modern iPad hardware; fallback states reduce animation to fades while maintaining context.
- Monitor animation budgets via Chrome DevTools; attach recordings under `state/artifacts/motion/performance/` for AnimationPerformanceCritic.
- Each Framer Motion component includes a static snapshot for screenshots to protect against reduced-motion settings.

## Accessibility & Controls
- Provide toggle to disable advanced weather transition effects; revert to linear easing for reduced motion.
- Keyboard focus never moves during looping animations to prevent motion-induced disorientation.
- Document micro-interaction states (rest, hover, active, focus) for every interactive component in the spec table.

This living specification ties every timeline, easing curve, and micro-interaction back to the WeatherVane story so critics and reviewers trust the implementation.
