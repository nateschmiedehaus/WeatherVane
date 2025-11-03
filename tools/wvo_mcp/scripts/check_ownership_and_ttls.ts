#!/usr/bin/env -S node --import tsx
import { runGuardSuite } from './guard_utils';

const dry = process.argv.includes('--dry');

const result = await runGuardSuite({ suite: 'ownership', dry });
console.log(JSON.stringify(result, null, 2));

process.exit(result.ok ? 0 : 1);
