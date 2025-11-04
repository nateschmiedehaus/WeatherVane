# Bad Example: UI Feature - "Renders" Without Interaction Testing

**Task**: Add dark mode toggle to settings page

**Claimed**: "Dark mode feature complete"
**Actual**: Level 1 only (component compiles, never tested)

**❌ NO INTERACTION TESTING**

---

## What Was Claimed

> "Dark mode toggle implemented. Component renders successfully."

**Evidence**:
```bash
npm run build  # 0 errors
npm run dev    # Page loads without crashes
```

**Screenshot**: Component visible in browser

---

## What Was ACTUALLY Achieved

### Level 1: Compilation ✅
- Component compiles
- TypeScript types valid
- Page renders

### Level 2: Interaction Testing ❌ MISSING
- **NO test that toggle works**
- **NO test of state changes**
- **NO test of persistence**
- **NO test of accessibility**

---

## Why This is Bad

### Unknown Functionality
```
❓ Does toggle actually work? Unknown
❓ Does dark mode apply? Unknown
❓ Does state persist? Unknown
❓ Is it accessible? Unknown
```

**Component could be**:
- Toggle visible but onClick handler broken
- Dark mode style never applies
- State lost on page refresh
- **We have no idea - never clicked it!**

### Will Fail for Users
```tsx
// Implementation bug never caught:
const [darkMode, setDarkMode] = useState(false);

return (
  <Toggle
    checked={darkMode}
    onChange={() => setDarkMode(true)}  // ❌ BUG: Always sets to true, never toggles off!
    label="Dark Mode"
  />
);

// User clicks toggle twice → stuck in dark mode forever
// Would be caught by: "toggles dark mode on click" test
```

---

## How to Fix

### Add Interaction Tests
```tsx
describe('SettingsPage', () => {
  it('toggles dark mode when clicked', async () => {
    render(<SettingsPage />);
    const toggle = screen.getByLabelText('Dark Mode');

    // Initially off
    expect(document.body).not.toHaveClass('dark');

    // Click to enable
    await userEvent.click(toggle);
    expect(document.body).toHaveClass('dark');

    // Click to disable
    await userEvent.click(toggle);
    expect(document.body).not.toHaveClass('dark');

    // ✅ This test would catch the "always true" bug!
  });

  it('persists dark mode preference', async () => {
    const { rerender } = render(<SettingsPage />);

    // Enable dark mode
    await userEvent.click(screen.getByLabelText('Dark Mode'));

    // Remount component
    rerender(<SettingsPage />);

    // Should still be dark mode
    expect(document.body).toHaveClass('dark');
  });
});
```

### Add Visual Testing
```bash
# Capture screenshot
npm run screenshot -- --page settings --mode dark

# Compare with baseline
npm run test:visual
```

**Screenshots prove**:
- ✅ Dark mode actually visible
- ✅ Text readable (contrast)
- ✅ Toggle state clear

---

## Red Flags

- ⚠️ Claimed "complete" with only "renders" evidence
- ⚠️ No test of user interaction (clicks)
- ⚠️ No validation of state changes
- ⚠️ Screenshot shows component but not functionality

---

## Key Takeaway

**"Component renders" ≠ "Feature works"**

Level 2 for UI requires:
- Interaction testing (clicks, inputs, navigation)
- State management validation
- Edge cases (rapid clicks, remount)
- Accessibility checks

Without these, UI could be completely broken despite "rendering".
