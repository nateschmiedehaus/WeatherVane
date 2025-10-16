# Demo Performance Report — 2025-10-16

## Environment
- Hardware: MacBook Pro M3, 32GB RAM
- Browser: Chrome 128 stable
- Network: 200 Mbps fiber, throttled to 20 Mbps for realism

## Metrics
- TTFB averaged 420ms during the onboarding scene with live weather data; caching improvements scheduled for next sprint.
- LCP registered 2.1s on desktop and 2.4s on tablet, staying inside the performance budget of 2.5s.
- CLS stayed at 0.03 thanks to locked placeholder dimensions.
- Interaction delay measured at 90ms, comfortably under the 120ms threshold.

## Observations
1. Hero animation spikes GPU usage when the storm overlay plays. We recorded a Chrome trace and attached it to `state/artifacts/motion/performance/2025-10-16-storm.json`.
2. Payment modal loads in 480ms even on throttled networks; fallback content preloads the pricing FAQ in case conversion API experiences downtime.
3. Analytics events fire in duplicate when the narrator restarts the demo. Added guard in instrumentation to suppress duplicates.

## Resilience
- Fallback path reroutes to a static storytelling deck if the 3D weather animation fails to load.
- Integration completeness checks run before the call to action; errors trigger a banner with remediation steps.
- DemoConversionCritic monitors the metrics JSON each night and raises alerts if drift exceeds thresholds.

## Next Steps
- Collaborate with AnimationPerformanceCritic to refine shader load order.
- Expand the resiliency playbook to cover on-site event demos where bandwidth is constrained.
- Refresh the fallback narrative slides to ensure the storytelling still hooks prospects even without interactive weather animations.
