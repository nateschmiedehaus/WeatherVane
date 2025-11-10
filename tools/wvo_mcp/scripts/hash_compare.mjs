#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, idx, arr) => {
    if (cur.startsWith('--') && arr[idx + 1] && !arr[idx + 1].startsWith('--')) {
      acc.push([cur.slice(2), arr[idx + 1]]);
    }
    return acc;
  }, []),
);

const expected = args.expected;
const actual = args.actual;
const label = args.label || 'artifact';

if (!expected || !actual) {
  console.error('Usage: hash_compare.mjs --expected <file> --actual <file> [--label name]');
  process.exit(1);
}

const sha = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

const expHash = sha(expected);
const actHash = sha(actual);

if (expHash !== actHash) {
  console.error(`hash mismatch [${label}]: ${expHash} != ${actHash}`);
  process.exit(1);
}

console.log(`hash match [${label}]: ${expHash}`);
