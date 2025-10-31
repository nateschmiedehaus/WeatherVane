# STRATEGIZE — FIX-META-TEST-GAMING-INTEGRATION

## Problem
Unit tests alone were not catching "gaming" patterns (tests with no assertions, mock-heavy integration, etc.). We needed the WorkProcessEnforcer to automatically execute the `detect_test_gaming.sh` script during VERIFY→REVIEW transitions so agents are warned when evidence is weak.

## Objective
Integrate gaming detection as a first-class guardrail while keeping the loop fail-safe (warnings only during observe phase). Ensure telemetry is recorded for audits.
