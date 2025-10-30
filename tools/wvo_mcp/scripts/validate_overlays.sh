#!/bin/bash
#
# Validate domain overlay files (IMP-23 CI check)
#
# Checks:
# 1. Size constraints (default 2KB, max 3KB)
# 2. Required sections exist
# 3. UTF-8 encoding
#
# Usage: ./scripts/validate_overlays.sh
# Exit: 0 if all checks pass, 1 if any fail

set -e

SIZE_LIMIT_DEFAULT=2048  # 2KB default
SIZE_LIMIT_MAX=3072      # 3KB maximum

OVERLAY_DIR="src/prompt/templates/domain"
EXIT_CODE=0

echo "IMP-23 Overlay Validation"
echo "========================="
echo ""

# Check 1: Size constraints
echo "Check 1: Size Constraints"
echo "-------------------------"
for overlay in "$OVERLAY_DIR"/*.md; do
  if [ ! -f "$overlay" ]; then
    continue
  fi
  
  filename=$(basename "$overlay")
  size=$(wc -c < "$overlay" | tr -d ' ')
  
  if [ "$size" -gt "$SIZE_LIMIT_MAX" ]; then
    echo "❌ FAIL: $filename exceeds maximum size ($size bytes > $SIZE_LIMIT_MAX bytes)"
    EXIT_CODE=1
  elif [ "$size" -gt "$SIZE_LIMIT_DEFAULT" ]; then
    echo "⚠️  WARN: $filename exceeds default size ($size bytes > $SIZE_LIMIT_DEFAULT bytes)"
    echo "         Justify in PR why larger size needed"
  else
    echo "✅ PASS: $filename ($size bytes)"
  fi
done
echo ""

# Check 2: Required sections
echo "Check 2: Required Sections"
echo "--------------------------"
for overlay in "$OVERLAY_DIR"/*.md; do
  if [ ! -f "$overlay" ]; then
    continue
  fi
  
  filename=$(basename "$overlay")
  missing_sections=()
  
  if ! grep -q "## Guidance" "$overlay"; then
    missing_sections+=("Guidance")
  fi
  
  if ! grep -q "## Patterns" "$overlay"; then
    missing_sections+=("Patterns")
  fi
  
  if ! grep -q "## Quality Rubric" "$overlay"; then
    missing_sections+=("Quality Rubric")
  fi
  
  if [ ${#missing_sections[@]} -gt 0 ]; then
    echo "❌ FAIL: $filename missing sections: ${missing_sections[*]}"
    EXIT_CODE=1
  else
    echo "✅ PASS: $filename (all sections present)"
  fi
done
echo ""

# Check 3: UTF-8 encoding
echo "Check 3: UTF-8 Encoding"
echo "-----------------------"
for overlay in "$OVERLAY_DIR"/*.md; do
  if [ ! -f "$overlay" ]; then
    continue
  fi
  
  filename=$(basename "$overlay")
  
  if file "$overlay" | grep -q "UTF-8"; then
    echo "✅ PASS: $filename (UTF-8)"
  else
    echo "❌ FAIL: $filename (not UTF-8)"
    EXIT_CODE=1
  fi
done
echo ""

# Summary
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ All overlay validation checks passed"
else
  echo "❌ Some overlay validation checks failed"
fi

exit $EXIT_CODE
