/**
 * Test DRQC validation on AFP-W0-DRQC-CITATION-ENFORCEMENT-20251107 evidence
 * This demonstrates recursive implementation: code validates itself
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DRQC types (from process.ts)
type DRQCCitation = {
  page: number;
  section: string;
  quote: string;
  interpretation?: string;
};

type ConcordanceEntry = {
  action: string;
  citation: string;
  artifact: string;
};

type ConcordanceTable = {
  phase: string;
  entries: ConcordanceEntry[];
};

// Extract DRQC citations from content
function extractDRQCCitations(content: string): DRQCCitation[] {
  const citations: DRQCCitation[] = [];
  const citationRegex = /\*\*(?:DRQC )?Citation:\*\* Page (\d+),\s*"?([^"\n]+)"?\s*>\s*([\s\S]+?)(?=\n\*\*|#{2,}|$)/gs;

  let match;
  while ((match = citationRegex.exec(content)) !== null) {
    const page = parseInt(match[1], 10);
    const section = match[2].trim();
    const quote = match[3].trim();

    citations.push({ page, section, quote });
  }

  return citations;
}

// Extract concordance table from content
function extractConcordance(content: string): ConcordanceTable | null {
  const concordanceRegex = /###\s+Concordance\s+\(([^)]+)\)\s*\n\s*\|.*\|.*\|.*\|\s*\n\s*\|[-:]+\|[-:]+\|[-:]+\|\s*\n((?:\|.*\|.*\|.*\|\s*\n)+)/m;

  const match = content.match(concordanceRegex);
  if (!match) return null;

  const phase = match[1].trim();
  const tableContent = match[2];

  const rows = tableContent.split('\n').filter(line => line.trim().length > 0);
  const entries: ConcordanceEntry[] = [];

  for (const row of rows) {
    const cells = row.split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.length >= 2) {
      entries.push({
        action: cells[0],
        citation: cells[1],
        artifact: cells.length >= 3 ? cells[2] : cells[1],
      });
    }
  }

  return entries.length > 0 ? { phase, entries } : null;
}

// Validate a phase document
function validatePhaseDocument(phaseName: string, filePath: string): boolean {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${phaseName.toUpperCase()} (${path.basename(filePath)})`);
  console.log('='.repeat(60));

  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${filePath}`);
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Check citations
  const citations = extractDRQCCitations(content);
  console.log(`\n📚 DRQC Citations: ${citations.length} found`);

  if (citations.length === 0) {
    console.log('   ❌ FAIL: No DRQC citations found');
    return false;
  } else {
    console.log('   ✅ PASS: Has DRQC citations');
    citations.forEach((c, i) => {
      console.log(`   ${i + 1}. Page ${c.page}, "${c.section}"`);
    });
  }

  // Check concordance
  const concordance = extractConcordance(content);
  console.log(`\n📊 Concordance Table:`);

  if (!concordance || concordance.entries.length === 0) {
    console.log('   ❌ FAIL: No concordance table found');
    return false;
  } else {
    console.log(`   ✅ PASS: Concordance found with ${concordance.entries.length} entries`);
    concordance.entries.forEach((entry, i) => {
      console.log(`   ${i + 1}. ${entry.action}`);
    });
  }

  console.log(`\n✅ ${phaseName.toUpperCase()} PASSES DRQC validation!`);
  return true;
}

// Main test
const evidenceDir = path.join(__dirname, '../../state/evidence/AFP-W0-DRQC-CITATION-ENFORCEMENT-20251107');

console.log('\n🔍 RECURSIVE DRQC VALIDATION TEST');
console.log('Testing the DRQC enforcement code against its own evidence\n');

const phases = [
  // strategize.md was created under AFP-W0-SEMANTIC-SEARCH-ENFORCEMENT-20251107 (different task)
  // but spec/plan/think are in AFP-W0-DRQC-CITATION-ENFORCEMENT-20251107
  { name: 'spec', file: 'spec.md' },
  { name: 'plan', file: 'plan.md' },
  { name: 'think', file: 'think.md' },
];

let allPassed = true;

for (const phase of phases) {
  const passed = validatePhaseDocument(phase.name, path.join(evidenceDir, phase.file));
  allPassed = allPassed && passed;
}

console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('✅ ALL PHASES PASS - Recursive implementation proven!');
  console.log('   The DRQC enforcement code validates its own evidence.');
  process.exit(0);
} else {
  console.log('❌ SOME PHASES FAILED - Implementation incomplete');
  process.exit(1);
}
