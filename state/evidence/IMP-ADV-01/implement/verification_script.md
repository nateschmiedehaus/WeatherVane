# IMP-ADV-01 · VERIFY: Verification Script

**Purpose**: Step-by-step verification commands for VERIFY phase
**Usage**: Run each section, record results in `verify/` directory

---

## Pre-Flight Checks

### 1. Dependencies Installed

```bash
# Check Node.js and npm
node --version  # Should be ≥18
npm --version   # Should be ≥8

# Check Python
python3 --version  # Should be ≥3.9
pip3 --version

# Install Python dependencies
pip3 install scikit-learn numpy pydantic pytest

# Install Node dependencies
cd tools/wvo_mcp
npm install
```

**Expected**: All commands succeed, dependencies installed

---

## Build Verification

### 2. TypeScript Compilation

```bash
cd tools/wvo_mcp
npm run build
```

**Expected**:
- Build succeeds
- No errors
- Files created in `dist/src/quality_graph/`

**Verification**:
```bash
ls -lh dist/src/quality_graph/
# Should see: schema.js, persistence.js

# Check for syntax errors
node -e "require('./dist/src/quality_graph/schema.js')"
node -e "require('./dist/src/quality_graph/persistence.js')"
```

**Pass Criteria**:
- ✅ Build completes without errors
- ✅ .js files created in dist/
- ✅ Modules load without errors

---

## Unit Test Verification

### 3. TypeScript Tests

```bash
cd tools/wvo_mcp
npm test -- src/quality_graph/__tests__
```

**Expected Output**:
```
✓ tools/wvo_mcp/src/quality_graph/__tests__/schema.test.ts (25 tests)
✓ tools/wvo_mcp/src/quality_graph/__tests__/persistence.test.ts (15 tests)

Test Files  2 passed (2)
Tests  40 passed (40)
```

**Pass Criteria**:
- ✅ All tests pass (0 failures)
- ✅ 40+ test cases executed
- ✅ Coverage ≥80% for quality_graph module

**If Tests Fail**:
1. Check error message
2. Verify dependencies installed
3. Check file paths correct
4. Run individual test: `npm test -- schema.test.ts`

---

### 4. Python Tests

```bash
cd tools/wvo_mcp/scripts/quality_graph
python3 -m pytest tests/test_embeddings.py -v
```

**Expected Output**:
```
test_embeddings.py::TestTaskEmbedder::test_embedding_shape PASSED
test_embeddings.py::TestTaskEmbedder::test_embedding_normalized PASSED
test_embeddings.py::TestTaskEmbedder::test_no_nan_or_inf PASSED
...
======================== 20 passed in 2.3s ========================
```

**Pass Criteria**:
- ✅ All tests pass
- ✅ 20+ test cases executed
- ✅ No warnings or errors

---

## Functional Verification

### 5. Schema Validation

**Test**: Create and validate vectors

```bash
cd tools/wvo_mcp
node -e "
const { validateTaskVector } = require('./dist/src/quality_graph/schema.js');

// Valid vector
const valid = {
  task_id: 'test-1',
  embedding: new Array(384).fill(1/Math.sqrt(384)),
  timestamp: new Date().toISOString(),
  outcome: { status: 'success' }
};

try {
  validateTaskVector(valid);
  console.log('✅ Valid vector accepted');
} catch (e) {
  console.log('❌ Valid vector rejected:', e.message);
}

// Invalid vector (wrong dimensions)
const invalid = {
  task_id: 'test-2',
  embedding: [0.1, 0.2, 0.3],  // Only 3 dims
  timestamp: new Date().toISOString(),
  outcome: { status: 'success' }
};

try {
  validateTaskVector(invalid);
  console.log('❌ Invalid vector accepted (SHOULD REJECT)');
} catch (e) {
  console.log('✅ Invalid vector rejected:', e.message);
}
"
```

**Expected Output**:
```
✅ Valid vector accepted
✅ Invalid vector rejected: embedding.Expected array with 384 element(s)
```

---

### 6. Persistence Operations

**Test**: Write and read vectors

```bash
cd tools/wvo_mcp
node -e "
const { writeVector, readVectors, getVectorCount } = require('./dist/src/quality_graph/persistence.js');

const TEST_WORKSPACE = '/tmp/qg-verify-test';

async function test() {
  // Write vector
  const vector = {
    task_id: 'verify-1',
    embedding: new Array(384).fill(1/Math.sqrt(384)),
    timestamp: new Date().toISOString(),
    outcome: { status: 'success' },
    title: 'Verification test'
  };

  await writeVector(TEST_WORKSPACE, vector);
  console.log('✅ Vector written');

  // Read vectors
  const vectors = await readVectors(TEST_WORKSPACE);
  console.log(\`✅ Read \${vectors.length} vector(s)\`);

  // Count
  const count = await getVectorCount(TEST_WORKSPACE);
  console.log(\`✅ Count: \${count}\`);

  // Verify content
  if (vectors[0].task_id === 'verify-1') {
    console.log('✅ Vector content correct');
  } else {
    console.log('❌ Vector content incorrect');
  }
}

test().catch(console.error);
"
```

**Expected Output**:
```
✅ Vector written
✅ Read 1 vector(s)
✅ Count: 1
✅ Vector content correct
```

---

### 7. Embedding Generation

**Test**: Compute embeddings

```bash
cd tools/wvo_mcp/scripts/quality_graph
python3 -c "
from embeddings import compute_task_embedding, verify_embedding

# Test embedding generation
metadata = {
    'title': 'Add GET /api/users endpoint',
    'description': 'Implement user listing with pagination',
    'files_touched': ['src/api/users.ts']
}

embedding = compute_task_embedding(metadata)
print(f'✅ Embedding shape: {embedding.shape}')

# Verify
result = verify_embedding(embedding)
print(f'✅ Verification: {result}')

if result['shape_ok'] and result['normalized'] and result['finite']:
    print('✅ All embedding checks pass')
else:
    print('❌ Embedding verification failed')
"
```

**Expected Output**:
```
✅ Embedding shape: (384,)
✅ Verification: {'shape_ok': True, 'finite': True, 'normalized': True, 'non_zero': True, 'norm': 1.0}
✅ All embedding checks pass
```

---

### 8. Unicode Handling

**Test**: Process unicode correctly

```bash
python3 -c "
from tools.wvo_mcp.scripts.quality_graph.embeddings import TaskEmbedder

embedder = TaskEmbedder()

# Test unicode in title
text = embedder.preprocess_text('Fix 🐛 bug in 修复错误')
print(f'Preprocessed: {text}')

# Should remove emoji, preserve Chinese
if '🐛' not in text and '修复错误' in text:
    print('✅ Unicode handled correctly')
else:
    print('❌ Unicode handling failed')
"
```

**Expected Output**:
```
Preprocessed: Fix bug in 修复错误
✅ Unicode handled correctly
```

---

### 9. Concurrent Write Safety

**Test**: 100 concurrent writes don't corrupt file

```bash
cd tools/wvo_mcp
node -e "
const { writeVector, readVectors } = require('./dist/src/quality_graph/persistence.js');

const TEST_WORKSPACE = '/tmp/qg-concurrent-test';

async function test() {
  const writes = Array.from({ length: 100 }, (_, i) => {
    const vector = {
      task_id: \`concurrent-\${i}\`,
      embedding: new Array(384).fill(1/Math.sqrt(384)),
      timestamp: new Date().toISOString(),
      outcome: { status: 'success' }
    };
    return writeVector(TEST_WORKSPACE, vector);
  });

  await Promise.all(writes);
  console.log('✅ 100 concurrent writes completed');

  const vectors = await readVectors(TEST_WORKSPACE);
  console.log(\`✅ Read \${vectors.length} vectors\`);

  if (vectors.length === 100) {
    console.log('✅ No corruption (all vectors present)');
  } else {
    console.log(\`❌ Corruption detected: expected 100, got \${vectors.length}\`);
  }
}

test().catch(console.error);
"
```

**Expected Output**:
```
✅ 100 concurrent writes completed
✅ Read 100 vectors
✅ No corruption (all vectors present)
```

---

## Performance Verification

### 10. Embedding Performance

**Test**: Embedding generation <100ms

```bash
cd tools/wvo_mcp/scripts/quality_graph
python3 -c "
import time
from embeddings import TaskEmbedder

embedder = TaskEmbedder()

# Warm up (first call fits vectorizer)
metadata = {'title': 'Test', 'description': 'Test task'}
embedder.compute_embedding(**metadata)

# Benchmark
iterations = 100
start = time.time()
for i in range(iterations):
    embedder.compute_embedding(title=f'Task {i}', description='Description')
elapsed = (time.time() - start) * 1000

avg_ms = elapsed / iterations
print(f'Average embedding time: {avg_ms:.2f}ms')

if avg_ms < 100:
    print(f'✅ Performance acceptable (<100ms)')
else:
    print(f'❌ Performance too slow (>{avg_ms}ms)')
"
```

**Expected Output**:
```
Average embedding time: 15.23ms
✅ Performance acceptable (<100ms)
```

---

### 11. Memory Usage

**Test**: Memory footprint <50MB for 1000 vectors

```bash
python3 -c "
import sys
import psutil
import os

# Measure baseline
process = psutil.Process(os.getpid())
baseline_mb = process.memory_info().rss / 1024 / 1024

# Load 1000 vectors (simulated)
from tools.wvo_mcp.scripts.quality_graph.embeddings import TaskEmbedder
embedder = TaskEmbedder()

vectors = []
for i in range(1000):
    emb = embedder.compute_embedding(title=f'Task {i}')
    vectors.append(emb)

# Measure after
after_mb = process.memory_info().rss / 1024 / 1024
delta_mb = after_mb - baseline_mb

print(f'Baseline: {baseline_mb:.1f}MB')
print(f'After 1000 vectors: {after_mb:.1f}MB')
print(f'Delta: {delta_mb:.1f}MB')

if delta_mb < 50:
    print('✅ Memory usage acceptable (<50MB)')
else:
    print(f'❌ Memory usage too high ({delta_mb:.1f}MB)')
"
```

**Expected Output**:
```
Baseline: 45.2MB
After 1000 vectors: 52.8MB
Delta: 7.6MB
✅ Memory usage acceptable (<50MB)
```

---

## Type Checking

### 12. TypeScript Type Safety

```bash
cd tools/wvo_mcp
npm run typecheck
```

**Expected**:
- No type errors
- All files typecheck successfully

---

## Lint Checks

### 13. Code Quality

```bash
cd tools/wvo_mcp
npm run lint -- src/quality_graph/
```

**Expected**:
- No lint errors
- No warnings (or acceptable warnings documented)

---

## Summary Checklist

After running all verifications:

### Build & Dependencies
- [ ] Dependencies installed
- [ ] TypeScript compiles successfully
- [ ] No build errors

### Tests
- [ ] 40+ TypeScript tests pass
- [ ] 20+ Python tests pass
- [ ] Coverage ≥80%

### Functional
- [ ] Schema validation works
- [ ] Persistence write/read works
- [ ] Embeddings computed correctly
- [ ] Unicode handled properly
- [ ] Concurrent writes safe

### Performance
- [ ] Embedding <100ms (warm)
- [ ] Memory usage <50MB for 1000 vectors

### Quality
- [ ] Type checking passes
- [ ] Lint checks pass

---

## Record Results

Create evidence file:

```bash
cat > state/evidence/IMP-ADV-01/verify/verification_results.json << 'EOF'
{
  "timestamp": "2025-10-29T...",
  "build": {
    "status": "pass",
    "errors": 0
  },
  "tests": {
    "typescript": {
      "total": 40,
      "passed": 40,
      "failed": 0
    },
    "python": {
      "total": 20,
      "passed": 20,
      "failed": 0
    }
  },
  "functional": {
    "schema_validation": "pass",
    "persistence": "pass",
    "embeddings": "pass",
    "unicode": "pass",
    "concurrent_writes": "pass"
  },
  "performance": {
    "embedding_avg_ms": 15.2,
    "memory_delta_mb": 7.6,
    "targets_met": true
  },
  "quality": {
    "typecheck": "pass",
    "lint": "pass"
  },
  "overall": "PASS"
}
EOF
```

---

## Next Phase: REVIEW

If all verifications pass, proceed to REVIEW phase with:
- Verification results JSON
- Test coverage report
- Performance benchmark data
- Known issues/limitations
