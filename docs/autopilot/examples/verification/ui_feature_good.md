# Good Example: UI Feature with Interaction Testing

**Task**: Add dark mode toggle to settings page

**Verification Level Achieved**: Level 2-3 (UI tested with screenshots and interactions)

---

## Implementation

```tsx
const SettingsPage = () => {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div className={darkMode ? 'dark' : 'light'}>
      <Toggle
        checked={darkMode}
        onChange={setDarkMode}
        label="Dark Mode"
      />
    </div>
  );
};
```

---

## Verification

### Level 1: Compilation ✅
```bash
npm run build  # 0 errors
```

### Level 2: Component Testing ✅
```tsx
describe('SettingsPage', () => {
  it('renders dark mode toggle', () => {
    render(<SettingsPage />);
    expect(screen.getByLabelText('Dark Mode')).toBeInTheDocument();
  });

  it('toggles dark mode on click', async () => {
    render(<SettingsPage />);
    const toggle = screen.getByLabelText('Dark Mode');

    // Initially light mode
    expect(document.body.className).not.toContain('dark');

    // Click toggle
    await userEvent.click(toggle);

    // Now dark mode
    expect(document.body.className).toContain('dark');
  });

  it('persists dark mode preference', async () => {
    const { rerender } = render(<SettingsPage />);

    // Enable dark mode
    await userEvent.click(screen.getByLabelText('Dark Mode'));

    // Unmount and remount
    rerender(<SettingsPage />);

    // Dark mode still enabled
    expect(document.body.className).toContain('dark');
  });
});
```

**Output**:
```
✓ renders dark mode toggle
✓ toggles dark mode on click
✓ persists dark mode preference

3 tests passed
```

### Level 3: Visual Testing ✅
```bash
# Capture screenshots
npm run test:visual
```

**Screenshots captured**:
- `screenshots/settings-light-mode.png` - Light mode UI
- `screenshots/settings-dark-mode.png` - Dark mode UI
- `screenshots/settings-toggle-animation.gif` - Toggle interaction

**Visual assertions**:
- ✅ Text readable in both modes (contrast ratio > 4.5:1)
- ✅ Toggle visually distinct (color change visible)
- ✅ Smooth transition animation (< 300ms)
- ✅ Responsive layout (mobile and desktop)

### Level 3: Browser Testing ✅
```bash
# Test in multiple browsers
npm run test:browser -- --browsers chrome,firefox,safari
```

**Results**:
```
Chrome 120:   ✅ All interactions work
Firefox 121:  ✅ All interactions work
Safari 17:    ✅ All interactions work
```

---

## What Was Tested

### Level 2 ✅
- Component renders correctly
- Toggle interaction works (click handler)
- State management (dark mode persists)
- Edge cases (rapid clicks, unmount/remount)

### Level 3 ✅
- Visual appearance (screenshots)
- Contrast/accessibility
- Multiple browsers (Chrome, Firefox, Safari)
- Responsive layout (mobile, tablet, desktop)

### Level 4 ⏳
- Real user workflows in production
- Accessibility with screen readers
- Performance with complex pages

---

## Why This is Good

### Interaction Testing
- Not just "component renders" but "user can click and it works"
- State persistence tested (survives remount)
- Visual regression tests (screenshots)

### Multi-Browser Validation
- Tested in 3 browsers (Level 3 integration)
- Responsive layouts verified
- Accessibility checked (contrast ratios)

### Evidence Provided
- Screenshots showing before/after
- Test execution logs
- Browser compatibility matrix

---

## Key Takeaway

**UI features require interaction testing** - "component renders" is Level 1-2, but user workflows (clicks, navigation, state persistence) require Level 2-3 validation.
