# Screenshot Workflow for Design Iteration

## Overview

This document describes the Playwright-based screenshot workflow for visual design iteration and quality assurance. The workflow enables rapid visual testing, design system validation, and stakeholder review.

## Quick Start

### 1. Run Screenshots (All Pages)

```bash
npm run test:ui
```

This runs the Playwright suite and generates screenshots in `playwright-export/`.

### 2. View Results

Open the Playwright HTML report:

```bash
open apps/web/playwright-report/index.html
```

### 3. Update Screenshots After Design Changes

```bash
npm run test:ui -- --update-snapshots
```

## The Design Iteration Cycle

### Phase 1: Build → Screenshot → Review

```
1. Implement UI changes (React/CSS)
2. Run: npm run test:ui
3. Screenshots appear in playwright-export/
4. Review visually in report
5. Share with stakeholders via screenshots
```

### Phase 2: Design Critique → Iterate

```
1. Run design_system critic: npm run critic -- design_system
2. Fix identified issues:
   - Color contrast problems
   - Layout inconsistencies
   - Typography issues
   - Responsiveness gaps
3. Go back to Phase 1
```

### Phase 3: Surprise & Delight Validation

```
1. Check for micro-interactions:
   - Hover states
   - Loading states
   - Empty states
   - Transitions
2. Validate against surprise & delight checklist
3. Enhance if needed
4. Take final screenshots
```

## Available Test Suites

### Demo Page Tests (`playwright/screenshots/demo.spec.ts`)

Tests for the Weather-Aware Modeling Demo:

- **Overview Mode**: Summary view with key metrics
- **Tenant Analysis Mode**: Interactive tenant details with weather toggle
- **Comparison Mode**: Cross-tenant comparison table
- **Responsive Layouts**: Desktop, tablet, and mobile
- **Interactive Elements**: Animation testing
- **Design System**: Accessibility and contrast validation

### Running Specific Tests

```bash
# Run only demo page tests
npx playwright test demo.spec.ts

# Run in headed mode (see browser)
npx playwright test demo.spec.ts --headed

# Run single test
npx playwright test demo.spec.ts -g "Overview Mode"
```

## Generated Artifacts

Screenshots are saved to `apps/web/playwright-export/`:

```
demo-overview-desktop.png          # Full overview page
demo-tenant-desktop.png            # Tenant analysis mode
demo-tenant-no-weather-desktop.png # After toggling weather off
demo-comparison-desktop.png        # Comparison table
demo-overview-tablet.png           # Tablet responsive view
demo-revenue-before.png            # Before animation
demo-revenue-after.png             # After animation
demo-footer.png                    # Footer section
```

## Design Critique Integration

### How to Use design_system Critic

```bash
npm run critic -- design_system
```

The design_system critic checks:

1. **Color Contrast**: WCAG AA compliance
2. **Typography**: Font hierarchy and sizing
3. **Spacing**: Consistent padding/margins
4. **Components**: Reusability and consistency
5. **Responsive Design**: Works at all breakpoints
6. **Micro-interactions**: Smooth transitions

### Fixing Common Issues

**Issue**: Text not readable on background
```bash
# Fix: Adjust text color or background contrast
# See: apps/web/src/styles/weather-analysis-demo.module.css
```

**Issue**: Layout breaks on tablet
```bash
# Fix: Add responsive breakpoints to CSS module
# Use CSS media queries for different viewport sizes
```

**Issue**: Missing micro-interactions
```bash
# Fix: Add CSS transitions or React animation
# Consider: Framer Motion (already installed)
```

## Stakeholder Review Process

### 1. Generate Review Package

```bash
# Generate all screenshots
npm run test:ui

# Create a review directory
mkdir -p screenshots-review
cp apps/web/playwright-export/*.png screenshots-review/

# Generate HTML index for easy viewing
# (optional: create index.html with image gallery)
```

### 2. Share with Stakeholders

```bash
# Option A: Email screenshots + report link
# Option B: Commit to shared branch for team review
# Option C: Upload to design review tool (Figma, etc.)
```

### 3. Collect Feedback

- Mark up screenshots with feedback
- Create GitHub issues for each design improvement
- Link to specific screenshot in issue description

### 4. Iterate

```bash
# Fix based on feedback
npm run test:ui  # Re-screenshot
# Repeat until stakeholder sign-off
```

## Configuration

### Playwright Config (`apps/web/playwright.config.cjs`)

```javascript
// Desktop viewport: 1440x900
// Tablet viewport: iPad Pro 11
// Screenshot on failure: Automatic artifacts for debugging
```

### Modifying Test Behavior

**Change viewport size**:
```javascript
// playwright.config.cjs
use: {
  viewport: { width: 1920, height: 1080 }, // For larger desktop
}
```

**Add mobile testing**:
```javascript
projects: [
  {
    name: 'mobile-chrome',
    use: {
      ...devices['Pixel 5'],
    },
  },
]
```

**Enable headed mode for debugging**:
```javascript
use: {
  headless: false, // See browser while tests run
}
```

## Advanced Usage

### Taking Full-Page Screenshots

```typescript
await page.screenshot({
  path: 'output.png',
  fullPage: true  // Captures entire page, not just viewport
});
```

### Taking Element-Specific Screenshots

```typescript
const element = await page.$('.demo-card');
await element.screenshot({ path: 'card.png' });
```

### Testing Interactions Before Screenshot

```typescript
// Toggle weather feature
await page.click('button:has-text("WITH WEATHER")');
await page.waitForTimeout(700); // Wait for animation

// Screenshot the result
await page.screenshot({ path: 'after-toggle.png' });
```

### Comparing Screenshots (Visual Regression)

```bash
# On local machine
npm run test:ui

# On CI/CD
npm run test:ui -- --update-snapshots
# Commit snapshot changes after visual review
```

## Best Practices

1. **Commit Screenshots**: Store key screenshots in git for history
   ```bash
   git add apps/web/playwright-export/
   ```

2. **Document Changes**: Reference screenshots in commit messages
   ```
   feat: Improve demo page styling

   - Added hover states to tenant cards
   - Improved revenue animation
   - See: demo-tenant-desktop.png
   ```

3. **Test Critical Paths**: Always screenshot main user flows
   - Overview → Tenant Analysis → Weather Toggle
   - Comparison view with all categories

4. **Mobile First**: Test responsive design at all breakpoints
   - Desktop (1440px)
   - Tablet (iPad Pro 11)
   - Consider mobile additions

5. **Performance**: Monitor screenshot generation time
   - Should complete in < 30 seconds for all tests
   - Parallel test runs for speed

## Troubleshooting

### Playwright Tests Won't Run

```bash
# Install Playwright browsers
npx playwright install

# Check installation
npx playwright --version
```

### Screenshots Look Blurry

```bash
# Update to latest Playwright
npm install --save-dev @playwright/test@latest

# Rebuild browser binaries
npx playwright install --with-deps
```

### Tests Pass Locally but Fail on CI

- Check viewport sizes match
- Verify fonts are installed
- Check color rendering (may differ on CI)
- See: `playwright.config.cjs` for CI-specific settings

### Dev Server Not Starting

```bash
# Ensure Next.js is running
npm run dev

# In separate terminal, run tests
npm run test:ui
```

## Integration with CI/CD

Add to `.github/workflows/test.yml`:

```yaml
- name: Run Playwright Tests
  run: npm run test:ui

- name: Upload Artifacts
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: apps/web/playwright-report/
```

## Related Documentation

- [Design System Standards](./DESIGN_SYSTEM.md)
- [Surprise & Delight Checklist](./SURPRISE_DELIGHT_CHECKLIST.md)
- [Design Research Process](./DESIGN_RESEARCH.md)
- [Playwright Documentation](https://playwright.dev/docs/intro)

## Next Steps

1. ✅ **Setup Complete**: Playwright installed and configured
2. 📸 **Screenshot Tests**: Created for demo page
3. 🎨 **Design Critique**: Use with design_system critic
4. 👥 **Stakeholder Review**: Share screenshots for feedback
5. ✨ **Iterate**: Fix issues and re-screenshot

## Questions?

For issues with Playwright:
- Check `playwright-report/` for detailed failure info
- Run with `--debug` flag: `npx playwright test --debug`
- See official docs: https://playwright.dev/docs/troubleshooting

---

**Last Updated**: 2025-10-23
**Maintained by**: Design System Team
**Status**: ✅ Active & Ready
