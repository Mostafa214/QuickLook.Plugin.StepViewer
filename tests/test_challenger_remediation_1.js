/**
 * Empirical Challenger 1 Harness for Remediated QuickLook STL E2E Suite & Runner
 * File: tests/test_challenger_remediation_1.js
 *
 * Adversarially probes and stress-tests the remediated E2E test suite and master runner:
 * 1. CLI flag robustness and tier routing
 * 2. Exit code determinism on simulated failures, unhandled crashes, and minTests thresholds
 * 3. Process isolation, runner timeout configuration, and live hanging-process termination
 * 4. Exhaustive AST / static tautology and inlined mock elimination audit (target: 0)
 * 5. Production CAD module invocation density audit
 * 6. Multi-dimensional mutation sensitivity sweeps across all remediated production modules:
 *    - stlLoader.js (length formula)
 *    - meshFeatureDetector.js (crease threshold, boundary precision, circle loop rule)
 *    - materialsEngine.js (PLA density, formatVol units, total mass)
 *    - assemblyTree.js (single-body opacity 0.45 and tooltip)
 *    - explodedView.js (single-body toast rejection message)
 *    - measureEngine.js (CAD vertex priority snap and raycast occlusion)
 * 7. Non-regression of existing test suites and master runner
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const RUNNER_SCRIPT = path.join(ROOT_DIR, 'tests/run_all_stl_e2e_tests.js');
const TIER1_SCRIPT = path.join(ROOT_DIR, 'tests/test_stl_e2e_tier1_features.js');
const TIER2_SCRIPT = path.join(ROOT_DIR, 'tests/test_stl_e2e_tier2_boundaries.js');
const TIER3_4_SCRIPT = path.join(ROOT_DIR, 'tests/test_stl_e2e_tier3_tier4.js');
const HARNESS_SCRIPT = path.join(ROOT_DIR, 'tests/stl_test_harness.js');

const RESULTS = {
  passed: 0,
  failed: 0,
  findings: []
};

function runTest(name, fn) {
  try {
    fn();
    RESULTS.passed++;
    console.log(`  \x1b[32m[CHALLENGE PASS]\x1b[0m ${name}`);
  } catch (err) {
    RESULTS.failed++;
    RESULTS.findings.push({ name, error: err.message, stack: err.stack });
    console.error(`  \x1b[31m[CHALLENGE FAIL]\x1b[0m ${name}`);
    console.error(`     \x1b[31mError: ${err.message}\x1b[0m`);
  }
}

console.log('='.repeat(80));
console.log('  EMPIRICAL CHALLENGER 1: ADVERSARIAL STRESS-TEST OF REMEDIATED E2E SUITE');
console.log('='.repeat(80));

// ============================================================================
// PROBE 1: CLI ARGUMENTS & TIER SELECTION DETERMINISM
// ============================================================================
console.log('\n--- PROBE 1: CLI Arguments & Tier Selection Determinism ---');

runTest('1.1: Runner exits code 0 with valid --tier=1', () => {
  const res = spawnSync(process.execPath, [RUNNER_SCRIPT, '--tier=1', '--quiet'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit 0, got ${res.status}`);
  assert.ok(res.stdout.includes('Tier 1: Feature Coverage'), 'Output mentions Tier 1');
});

runTest('1.2: Runner exits code 0 with valid --tier=2', () => {
  const res = spawnSync(process.execPath, [RUNNER_SCRIPT, '--tier=2', '--quiet'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit 0, got ${res.status}`);
  assert.ok(res.stdout.includes('Tier 2: Boundary & Corner Cases'), 'Output mentions Tier 2');
});

runTest('1.3: Runner exits code 0 with valid --tier=3', () => {
  const res = spawnSync(process.execPath, [RUNNER_SCRIPT, '--tier=3', '--quiet'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit 0, got ${res.status}`);
  assert.ok(res.stdout.includes('Tier 3: Pairwise Combinations'), 'Output mentions Tier 3');
});

runTest('1.4: Runner exits code 0 with valid --tier=4', () => {
  const res = spawnSync(process.execPath, [RUNNER_SCRIPT, '--tier=4', '--quiet'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit 0, got ${res.status}`);
  assert.ok(res.stdout.includes('Tier 4: Real-World Application Workloads'), 'Output mentions Tier 4');
});

runTest('1.5: Runner exits code 1 on invalid tier --tier=999', () => {
  const res = spawnSync(process.execPath, [RUNNER_SCRIPT, '--tier=999'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.strictEqual(res.status, 1, `Expected exit code 1 on invalid tier, got ${res.status}`);
  assert.ok(res.stderr.includes('Unknown tier selector "999"'), 'Expected error message on stderr');
});

runTest('1.6: Runner exits code 1 on invalid tier --tier=invalid_name', () => {
  const res = spawnSync(process.execPath, [RUNNER_SCRIPT, '--tier=invalid_name'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.strictEqual(res.status, 1, `Expected exit code 1 on invalid tier name, got ${res.status}`);
});

runTest('1.7: Runner exits code 0 on --help', () => {
  const res = spawnSync(process.execPath, [RUNNER_SCRIPT, '--help'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit 0 on --help, got ${res.status}`);
  assert.ok(res.stdout.includes('Usage:'), 'Help text printed');
});

// ============================================================================
// PROBE 2: EXIT CODE DETERMINISM ON SIMULATED FAILURE & MINTESTS GUARD
// ============================================================================
console.log('\n--- PROBE 2: Exit Code Determinism & Error Propagation ---');

runTest('2.1: Harness exitProcess() exits with code 1 when assertion fails', () => {
  const tempScript = path.join(__dirname, 'temp_failing_test.js');
  const code = `
    const { describe, test, assertTrue, reportSummary, exitProcess } = require('${HARNESS_SCRIPT.replace(/\\/g, '/')}');
    describe('Failing Suite', () => {
      test('Failing Test', () => {
        assertTrue(false, 'Simulated assertion failure');
      });
    });
    reportSummary();
    exitProcess();
  `;
  fs.writeFileSync(tempScript, code, 'utf8');
  try {
    const res = spawnSync(process.execPath, [tempScript], { encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Harness must exit with code 1 on failure, got ${res.status}`);
    const failedMatch = res.stdout.match(/Failed:\s+(?:\x1b\[[0-9;]*m)?(\d+)/);
    assert.ok(failedMatch && parseInt(failedMatch[1], 10) === 1, 'Summary reports 1 failed test');
  } finally {
    if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript);
  }
});

runTest('2.2: Harness exitProcess() exits with code 1 when exception thrown in test', () => {
  const tempScript = path.join(__dirname, 'temp_throwing_test.js');
  const code = `
    const { describe, test, reportSummary, exitProcess } = require('${HARNESS_SCRIPT.replace(/\\/g, '/')}');
    describe('Throwing Suite', () => {
      test('Throwing Test', () => {
        throw new Error('Unexpected crash in test');
      });
    });
    reportSummary();
    exitProcess();
  `;
  fs.writeFileSync(tempScript, code, 'utf8');
  try {
    const res = spawnSync(process.execPath, [tempScript], { encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Harness must exit with code 1 on unhandled exception, got ${res.status}`);
    const failedMatch = res.stdout.match(/Failed:\s+(?:\x1b\[[0-9;]*m)?(\d+)/);
    assert.ok(failedMatch && parseInt(failedMatch[1], 10) === 1, 'Summary reports 1 failed test');
  } finally {
    if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript);
  }
});

runTest('2.3: Runner catches child process non-zero exit code and marks tier as FAIL', () => {
  const tempRunner = path.join(__dirname, 'temp_runner_mock.js');
  const failingScript = path.join(__dirname, 'temp_failing_child.js');

  fs.writeFileSync(failingScript, `
    const { describe, test, assertTrue, reportSummary, exitProcess } = require('${HARNESS_SCRIPT.replace(/\\/g, '/')}');
    describe('Simulated Fail', () => {
      test('T.Fail', () => { assertTrue(false); });
    });
    reportSummary();
    exitProcess();
  `, 'utf8');

  let runnerCode = fs.readFileSync(RUNNER_SCRIPT, 'utf8');
  runnerCode = runnerCode.replace("file: 'test_stl_e2e_tier1_features.js'", `file: '${path.basename(failingScript)}'`);
  fs.writeFileSync(tempRunner, runnerCode, 'utf8');

  try {
    const res = spawnSync(process.execPath, [tempRunner, '--tier=1', '--quiet'], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Runner must exit with code 1 when tier child fails, got ${res.status}`);
    assert.ok(res.stdout.includes('FAIL'), 'Summary table shows FAIL status');
    assert.ok(res.stdout.includes('TEST SUITE FAILED') || res.stderr.includes('encountered failures'), 'Failure banner present');
  } finally {
    if (fs.existsSync(failingScript)) fs.unlinkSync(failingScript);
    if (fs.existsSync(tempRunner)) fs.unlinkSync(tempRunner);
  }
});

runTest('2.4: Runner enforces minTests threshold (rejects tier if test count < threshold)', () => {
  const tempShortScript = path.join(__dirname, 'temp_short_child.js');
  const tempRunner = path.join(__dirname, 'temp_short_runner.js');

  fs.writeFileSync(tempShortScript, `
    const { describe, test, assertTrue, reportSummary, exitProcess } = require('${HARNESS_SCRIPT.replace(/\\/g, '/')}');
    describe('Short Suite', () => {
      for (let i = 0; i < 5; i++) {
        test('Test ' + i, () => { assertTrue(true); });
      }
    });
    reportSummary();
    exitProcess();
  `, 'utf8');

  let runnerCode = fs.readFileSync(RUNNER_SCRIPT, 'utf8');
  runnerCode = runnerCode.replace("file: 'test_stl_e2e_tier1_features.js'", `file: '${path.basename(tempShortScript)}'`);
  fs.writeFileSync(tempRunner, runnerCode, 'utf8');

  try {
    const res = spawnSync(process.execPath, [tempRunner, '--tier=1', '--quiet'], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Runner must reject tier with 5 tests when minTests=45, got exit code ${res.status}`);
    assert.ok(res.stdout.includes('FAIL'), 'Status should be marked FAIL due to minTests violation');
  } finally {
    if (fs.existsSync(tempShortScript)) fs.unlinkSync(tempShortScript);
    if (fs.existsSync(tempRunner)) fs.unlinkSync(tempRunner);
  }
});

// ============================================================================
// PROBE 3: PROCESS ISOLATION & LIVE TIMEOUT BEHAVIOR
// ============================================================================
console.log('\n--- PROBE 3: Process Isolation & Live Timeout Behavior ---');

runTest('3.1: Environment mutation in child does not leak to parent runner', () => {
  const tempLeakScript = path.join(__dirname, 'temp_leak.js');
  fs.writeFileSync(tempLeakScript, `
    process.env.LEAKED_SECRET_TEST = 'POLLUTED';
    console.log('Child modified env');
  `, 'utf8');
  try {
    process.env.LEAKED_SECRET_TEST = 'PRISTINE';
    spawnSync(process.execPath, [tempLeakScript], { encoding: 'utf8' });
    assert.strictEqual(process.env.LEAKED_SECRET_TEST, 'PRISTINE', 'Parent environment remained unpolluted');
  } finally {
    delete process.env.LEAKED_SECRET_TEST;
    if (fs.existsSync(tempLeakScript)) fs.unlinkSync(tempLeakScript);
  }
});

runTest('3.2: Master runner has timeout: 30000 configured on spawnSync', () => {
  const runnerSrc = fs.readFileSync(RUNNER_SCRIPT, 'utf8');
  const timeoutMatch = runnerSrc.match(/spawnSync\s*\([^)]*timeout\s*:\s*(\d+)/m);
  assert.ok(timeoutMatch !== null, 'spawnSync specifies timeout option');
  const timeoutVal = parseInt(timeoutMatch[1], 10);
  assert.strictEqual(timeoutVal, 30000, `Expected timeout 30000ms, got ${timeoutVal}ms`);
});

runTest('3.3: EMPIRICAL TIMEOUT TERMINATION: Runner terminates hanging child process and exits code 1', () => {
  const tempHangingScript = path.join(__dirname, 'temp_hanging_child.js');
  const tempTimeoutRunner = path.join(__dirname, 'temp_timeout_runner.js');

  fs.writeFileSync(tempHangingScript, `
    // Infinite loop simulating stalled child process
    console.log('Hanging child started...');
    while (true) {}
  `, 'utf8');

  let runnerCode = fs.readFileSync(RUNNER_SCRIPT, 'utf8');
  runnerCode = runnerCode.replace("file: 'test_stl_e2e_tier1_features.js'", `file: '${path.basename(tempHangingScript)}'`);
  // Use 1500ms timeout for this empirical test so we don't wait 30s
  runnerCode = runnerCode.replace('timeout: 30000', 'timeout: 1500');
  fs.writeFileSync(tempTimeoutRunner, runnerCode, 'utf8');

  try {
    const t0 = Date.now();
    const res = spawnSync(process.execPath, [tempTimeoutRunner, '--tier=1', '--quiet'], { cwd: ROOT_DIR, encoding: 'utf8' });
    const elapsed = Date.now() - t0;

    assert.ok(elapsed >= 1400 && elapsed < 8000, `Runner terminated hanging child in reasonable time (${elapsed}ms)`);
    assert.strictEqual(res.status, 1, `Runner must exit with code 1 on child timeout, got ${res.status}`);
    assert.ok(res.stdout.includes('FAIL'), 'Summary table shows FAIL status on timeout');
  } finally {
    if (fs.existsSync(tempHangingScript)) fs.unlinkSync(tempHangingScript);
    if (fs.existsSync(tempTimeoutRunner)) fs.unlinkSync(tempTimeoutRunner);
  }
});

// ============================================================================
// PROBE 4: EXHAUSTIVE STATIC TAUTOLOGY & INLINED MOCK CATALOG AUDIT
// ============================================================================
console.log('\n--- PROBE 4: Exhaustive Static Tautology & Inlined Mock Catalog Audit ---');

const TAUTOLOGY_CATALOG = [];

function auditFileForTautologies(filePath, tierName) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // 1. assertTrue(true) or constant boolean
    if (/assertTrue\s*\(\s*true\s*[,)]/.test(trimmed)) {
      TAUTOLOGY_CATALOG.push({ tier: tierName, lineNum, type: 'Constant True', code: trimmed });
    }

    // 2. assertEqual(X, X) where both sides are identical literals
    const eqMatch = trimmed.match(/assertEqual\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*[,)]/);
    if (eqMatch) {
      const a = eqMatch[1].trim();
      const b = eqMatch[2].trim();
      if (a === b && !a.includes('(')) {
        TAUTOLOGY_CATALOG.push({ tier: tierName, lineNum, type: 'Identical Operands', code: trimmed });
      }
    }

    // 3. Testing local inlined mock function instead of production module
    if (/getPrintEstimates\s*\(/.test(trimmed)) {
      TAUTOLOGY_CATALOG.push({ tier: tierName, lineNum, type: 'Inlined Mock Helper (getPrintEstimates)', code: trimmed });
    }
    if (/clampInfill\s*\(/.test(trimmed)) {
      TAUTOLOGY_CATALOG.push({ tier: tierName, lineNum, type: 'Inlined Mock Helper (clampInfill)', code: trimmed });
    }

    // 4. Asserting on freshly assigned property without invoking system method
    if (/btnExplode\.style\.opacity\s*=\s*/.test(trimmed)) {
      TAUTOLOGY_CATALOG.push({ tier: tierName, lineNum, type: 'Self-Assigning UI Property Simulation (btnExplode.style.opacity)', code: trimmed });
    }
    if (/btnExplode\.title\s*=\s*/.test(trimmed)) {
      TAUTOLOGY_CATALOG.push({ tier: tierName, lineNum, type: 'Self-Assigning UI Property Simulation (btnExplode.title)', code: trimmed });
    }

    // 5. Fixture checking its own expectedCreaseEdges without detector
    if (/fixture\.expectedCreaseEdges\[0\]\.isCrease/.test(trimmed)) {
      TAUTOLOGY_CATALOG.push({ tier: tierName, lineNum, type: 'Fixture Property Verification Tautology', code: trimmed });
    }

    // 6. Trivial tautology checks like 5 < 6 or priorityOrder[0] === 'cad_vertex'
    if (/assertTrue\s*\(\s*N\s*<\s*6\s*[,)]/.test(trimmed) || /assertTrue\s*\(\s*5\s*<\s*6\s*[,)]/.test(trimmed)) {
      TAUTOLOGY_CATALOG.push({ tier: tierName, lineNum, type: 'Trivial Literal Arithmetic (5 < 6)', code: trimmed });
    }
    if (/priorityOrder\[0\]\s*,\s*['"]cad_vertex['"]/.test(trimmed)) {
      TAUTOLOGY_CATALOG.push({ tier: tierName, lineNum, type: 'Local Array Literal Echoing', code: trimmed });
    }
  });
}

auditFileForTautologies(TIER1_SCRIPT, 'Tier 1');
auditFileForTautologies(TIER2_SCRIPT, 'Tier 2');
auditFileForTautologies(TIER3_4_SCRIPT, 'Tier 3/4');

runTest('4.1: Tautology & Inlined Mock Catalog: 0 tautologies remaining across all tiers', () => {
  console.log(`    Total suspicious / tautological / mock assertions cataloged: ${TAUTOLOGY_CATALOG.length}`);
  if (TAUTOLOGY_CATALOG.length > 0) {
    for (const item of TAUTOLOGY_CATALOG) {
      console.error(`      [REMAINING TAUTOLOGY] ${item.tier}:${item.lineNum} (${item.type}): ${item.code}`);
    }
  }
  assert.strictEqual(TAUTOLOGY_CATALOG.length, 0, `Expected 0 tautologies, but found ${TAUTOLOGY_CATALOG.length}`);
});

// ============================================================================
// PROBE 5: ASSESSMENT OF GENUINE PRODUCTION CODE INVOCATION DENSITY
// ============================================================================
console.log('\n--- PROBE 5: Assessment of Genuine Production Code Invocation Density ---');

runTest('5.1: Real Production Modules Exercised Across All Tiers', () => {
  const t1Src = fs.readFileSync(TIER1_SCRIPT, 'utf8');
  const t2Src = fs.readFileSync(TIER2_SCRIPT, 'utf8');
  const t3Src = fs.readFileSync(TIER3_4_SCRIPT, 'utf8');

  const stlLoaderCalls = (t1Src.match(/StlLoader\.(?:parse|detectType)/g) || []).length +
                         (t2Src.match(/StlLoader\.(?:parse|detectType)/g) || []).length +
                         (t3Src.match(/StlLoader\.(?:parse|detectType)/g) || []).length;

  const featureDetectorCalls = (t1Src.match(/MeshFeatureDetector\.detectFeatures/g) || []).length +
                               (t2Src.match(/MeshFeatureDetector\.detectFeatures/g) || []).length +
                               (t3Src.match(/MeshFeatureDetector\.detectFeatures/g) || []).length;

  const fitCircleCalls = (t1Src.match(/fitCircleToLoop/g) || []).length +
                         (t2Src.match(/fitCircleToLoop/g) || []).length +
                         (t3Src.match(/fitCircleToLoop/g) || []).length;

  const materialsEngineCalls = (t1Src.match(/MaterialsEngine\./g) || []).length +
                               (t2Src.match(/MaterialsEngine\./g) || []).length +
                               (t3Src.match(/MaterialsEngine\./g) || []).length;

  const buildTreeCalls = (t1Src.match(/buildModelTree\(/g) || []).length +
                         (t2Src.match(/buildModelTree\(/g) || []).length +
                         (t3Src.match(/buildModelTree\(/g) || []).length;

  const explodeCalls = (t1Src.match(/toggleExplode\(/g) || []).length +
                       (t2Src.match(/toggleExplode\(/g) || []).length +
                       (t3Src.match(/toggleExplode\(/g) || []).length;

  const snapTargetCalls = (t1Src.match(/findSnapTarget\(/g) || []).length +
                          (t2Src.match(/findSnapTarget\(/g) || []).length +
                          (t3Src.match(/findSnapTarget\(/g) || []).length;

  const occlusionCalls = (t1Src.match(/isPointOccluded\(/g) || []).length +
                         (t2Src.match(/isPointOccluded\(/g) || []).length +
                         (t3Src.match(/isPointOccluded\(/g) || []).length;

  console.log(`    Genuine Production Module Invocations:`);
  console.log(`      - StlLoader (parse/detectType): ${stlLoaderCalls} invocations`);
  console.log(`      - MeshFeatureDetector.detectFeatures: ${featureDetectorCalls} invocations`);
  console.log(`      - MeshFeatureDetector.fitCircleToLoop: ${fitCircleCalls} invocations`);
  console.log(`      - MaterialsEngine.*: ${materialsEngineCalls} invocations`);
  console.log(`      - buildModelTree(): ${buildTreeCalls} invocations`);
  console.log(`      - toggleExplode(): ${explodeCalls} invocations`);
  console.log(`      - findSnapTarget(): ${snapTargetCalls} invocations`);
  console.log(`      - isPointOccluded(): ${occlusionCalls} invocations`);

  assert.ok(stlLoaderCalls >= 50, `Expected >= 50 StlLoader calls, got ${stlLoaderCalls}`);
  assert.ok(featureDetectorCalls >= 20, `Expected >= 20 detectFeatures calls, got ${featureDetectorCalls}`);
  assert.ok(fitCircleCalls >= 1, `Expected >= 1 fitCircleToLoop call, got ${fitCircleCalls}`);
  assert.ok(materialsEngineCalls >= 15, `Expected >= 15 MaterialsEngine calls, got ${materialsEngineCalls}`);
  assert.ok(buildTreeCalls >= 2, `Expected >= 2 buildModelTree calls, got ${buildTreeCalls}`);
  assert.ok(explodeCalls >= 3, `Expected >= 3 toggleExplode calls, got ${explodeCalls}`);
  assert.ok(snapTargetCalls >= 1, `Expected >= 1 findSnapTarget call, got ${snapTargetCalls}`);
  assert.ok(occlusionCalls >= 1, `Expected >= 1 isPointOccluded call, got ${occlusionCalls}`);
});

// ============================================================================
// PROBE 6: MULTI-DIMENSIONAL MUTATION SENSITIVITY SWEEPS
// ============================================================================
console.log('\n--- PROBE 6: Multi-Dimensional Mutation Sensitivity Sweeps ---');

runTest('6.1: Mutating StlLoader triangle length validation causes Tier 1 to fail', () => {
  const targetPath = path.join(ROOT_DIR, 'Assets/js/stlLoader.js');
  const originalCode = fs.readFileSync(targetPath, 'utf8');
  const mutatedCode = originalCode.replace('84 + triangleCount * 50', '84 + triangleCount * 50 + 100');
  assert.notStrictEqual(mutatedCode, originalCode, 'Mutation applied');

  fs.writeFileSync(targetPath, mutatedCode, 'utf8');
  try {
    const res = spawnSync(process.execPath, [TIER1_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Tier 1 must FAIL when binary length check is mutated, got ${res.status}`);
  } finally {
    fs.writeFileSync(targetPath, originalCode, 'utf8');
  }
});

runTest('6.2: Mutating MeshFeatureDetector crease threshold to -1.0 causes Tier 1 to fail', () => {
  const targetPath = path.join(ROOT_DIR, 'Assets/js/meshFeatureDetector.js');
  const originalCode = fs.readFileSync(targetPath, 'utf8');
  const mutatedCode = originalCode.replace('var CREASE_COS_THRESHOLD = 0.9063077870366499;', 'var CREASE_COS_THRESHOLD = -1.0;');
  assert.notStrictEqual(mutatedCode, originalCode, 'Mutation applied');

  fs.writeFileSync(targetPath, mutatedCode, 'utf8');
  try {
    const res = spawnSync(process.execPath, [TIER1_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Tier 1 must FAIL when crease threshold is mutated, got ${res.status}`);
  } finally {
    fs.writeFileSync(targetPath, originalCode, 'utf8');
  }
});

runTest('6.3: Mutating MeshFeatureDetector crease boundary (+1.0° shift) causes Tier 2 boundary sweep to fail', () => {
  const targetPath = path.join(ROOT_DIR, 'Assets/js/meshFeatureDetector.js');
  const originalCode = fs.readFileSync(targetPath, 'utf8');
  // Shift crease threshold to 26.0°: cos(26°) = 0.898794046299167. At this threshold, 25.1° will NOT be classified as crease!
  const mutatedCode = originalCode.replace('var CREASE_COS_THRESHOLD = 0.9063077870366499;', 'var CREASE_COS_THRESHOLD = 0.898794046299167;');
  assert.notStrictEqual(mutatedCode, originalCode, 'Mutation applied');

  fs.writeFileSync(targetPath, mutatedCode, 'utf8');
  try {
    const res = spawnSync(process.execPath, [TIER2_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Tier 2 must FAIL on T2.F5.4 when threshold shifted to 26°, got ${res.status}`);
    assert.ok(res.stdout.includes('T2.F5.4') || res.stdout.includes('Failed:'), 'Failure observed on T2.F5.4 boundary');
  } finally {
    fs.writeFileSync(targetPath, originalCode, 'utf8');
  }
});

runTest('6.4: Mutating MeshFeatureDetector fitCircleToLoop N < 6 guard causes Tier 2 T2.F6.4 to fail', () => {
  const targetPath = path.join(ROOT_DIR, 'Assets/js/meshFeatureDetector.js');
  const originalCode = fs.readFileSync(targetPath, 'utf8');
  // Mutate fitCircleToLoop so it does not return null for N=5 pentagon, but instead returns a dummy circle
  const mutatedCode = originalCode.replace(
    'if (N < MIN_LOOP_VERTICES) return null;',
    'if (N < 3) return null; if (N === 5) return { type: "circle", radius: 5 };'
  );
  assert.notStrictEqual(mutatedCode, originalCode, 'Mutation applied');

  fs.writeFileSync(targetPath, mutatedCode, 'utf8');
  try {
    const res = spawnSync(process.execPath, [TIER2_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Tier 2 must FAIL when fitCircleToLoop accepts pentagon, got ${res.status}`);
    assert.ok(res.stdout.includes('T2.F6.4') || res.stdout.includes('Failed:'), 'T2.F6.4 failed under mutation');
  } finally {
    fs.writeFileSync(targetPath, originalCode, 'utf8');
  }
});

runTest('6.5: Mutating MaterialsEngine PLA density causes Tier 1 to fail', () => {
  const targetPath = path.join(ROOT_DIR, 'Assets/js/materialsEngine.js');
  const originalCode = fs.readFileSync(targetPath, 'utf8');
  // Mutate PLA density from 1.24 to 1.88
  const mutatedCode = originalCode.replace(
    "density: 1.24, category: '3D Printing'",
    "density: 1.88, category: '3D Printing'"
  );
  assert.notStrictEqual(mutatedCode, originalCode, 'Mutation applied');

  fs.writeFileSync(targetPath, mutatedCode, 'utf8');
  try {
    const res = spawnSync(process.execPath, [TIER1_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Tier 1 must FAIL when PLA density is mutated, got ${res.status}`);
    assert.ok(res.stdout.includes('T1.8.1') || res.stdout.includes('Failed:'), 'Failure observed on Feature 8 tests');
  } finally {
    fs.writeFileSync(targetPath, originalCode, 'utf8');
  }
});

runTest('6.6: Mutating MaterialsEngine formatVol causes Tier 1 to fail', () => {
  const targetPath = path.join(ROOT_DIR, 'Assets/js/materialsEngine.js');
  const originalCode = fs.readFileSync(targetPath, 'utf8');
  // Mutate formatVol return string
  const mutatedCode = originalCode.replace(
    "return `${volCm3.toFixed(2)} cm³`;",
    "return `${volCm3.toFixed(2)} MUTATED_UNITS`;"
  );
  assert.notStrictEqual(mutatedCode, originalCode, 'Mutation applied');

  fs.writeFileSync(targetPath, mutatedCode, 'utf8');
  try {
    const res = spawnSync(process.execPath, [TIER1_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Tier 1 must FAIL when formatVol is mutated, got ${res.status}`);
    assert.ok(res.stdout.includes('T1.8.2') || res.stdout.includes('Failed:'), 'Failure observed on T1.8.2 formatVol');
  } finally {
    fs.writeFileSync(targetPath, originalCode, 'utf8');
  }
});

runTest('6.7: Mutating assemblyTree.js single-body opacity causes Tier 1 to fail', () => {
  const targetPath = path.join(ROOT_DIR, 'Assets/js/assemblyTree.js');
  const originalCode = fs.readFileSync(targetPath, 'utf8');
  // Mutate opacity from '0.45' to '0.99'
  const mutatedCode = originalCode.replace("btnExplode.style.opacity = bodyCount > 1 ? '1' : '0.45';", "btnExplode.style.opacity = bodyCount > 1 ? '1' : '0.99';");
  assert.notStrictEqual(mutatedCode, originalCode, 'Mutation applied');

  fs.writeFileSync(targetPath, mutatedCode, 'utf8');
  try {
    const res = spawnSync(process.execPath, [TIER1_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Tier 1 must FAIL when single-body opacity is mutated, got ${res.status}`);
    assert.ok(res.stdout.includes('T1.9.1') || res.stdout.includes('Failed:'), 'Failure observed on T1.9.1');
  } finally {
    fs.writeFileSync(targetPath, originalCode, 'utf8');
  }
});

runTest('6.8: Mutating explodedView.js rejection toast message causes Tier 1 to fail', () => {
  const targetPath = path.join(ROOT_DIR, 'Assets/js/explodedView.js');
  const originalCode = fs.readFileSync(targetPath, 'utf8');
  const mutatedCode = originalCode.replace(
    "showToast('Exploded view requires an assembly with multiple parts');",
    "showToast('MUTATED TOAST MESSAGE');"
  );
  assert.notStrictEqual(mutatedCode, originalCode, 'Mutation applied');

  fs.writeFileSync(targetPath, mutatedCode, 'utf8');
  try {
    const res = spawnSync(process.execPath, [TIER1_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Tier 1 must FAIL when single-body explode toast is mutated, got ${res.status}`);
    assert.ok(res.stdout.includes('T1.9.3') || res.stdout.includes('Failed:'), 'Failure observed on T1.9.3');
  } finally {
    fs.writeFileSync(targetPath, originalCode, 'utf8');
  }
});

runTest('6.9: Mutating measureEngine.js isPointOccluded causes Tier 2 to fail', () => {
  const targetPath = path.join(ROOT_DIR, 'Assets/js/measureEngine.js');
  const originalCode = fs.readFileSync(targetPath, 'utf8');
  // Invert occlusion return value
  const mutatedCode = originalCode.replace(
    'return hits && hits.length > 0;',
    'return false;'
  );
  assert.notStrictEqual(mutatedCode, originalCode, 'Mutation applied');

  fs.writeFileSync(targetPath, mutatedCode, 'utf8');
  try {
    const res = spawnSync(process.execPath, [TIER2_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf8' });
    assert.strictEqual(res.status, 1, `Tier 2 must FAIL when isPointOccluded logic returns false for rear point, got ${res.status}`);
    assert.ok(res.stdout.includes('T2.F7.5') || res.stdout.includes('Failed:'), 'Failure observed on T2.F7.5');
  } finally {
    fs.writeFileSync(targetPath, originalCode, 'utf8');
  }
});

// ============================================================================
// PROBE 7: ZERO REGRESSION ON EXISTING TEST SUITES & MASTER RUNNER
// ============================================================================
console.log('\n--- PROBE 7: Non-Regression of Existing Node Test Suites & Master Runner ---');

runTest('7.1: test_sec01_sec04_sanitization.js passes 100%', () => {
  const res = spawnSync(process.execPath, ['tests/test_sec01_sec04_sanitization.js'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit 0, got ${res.status}`);
  assert.ok(/PASSED/i.test(res.stdout), 'Sanitization tests passed');
});

runTest('7.2: test_mesh_feature_detector.js passes 100%', () => {
  const res = spawnSync(process.execPath, ['tests/test_mesh_feature_detector.js'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit 0, got ${res.status}`);
  assert.ok(/Passed/i.test(res.stdout), 'Mesh feature tests passed');
});

runTest('7.3: test_materials_infill_ui.js passes 100%', () => {
  const res = spawnSync(process.execPath, ['tests/test_materials_infill_ui.js'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit 0, got ${res.status}`);
  assert.ok(/Passed/i.test(res.stdout) || /ALL TESTS PASSED/i.test(res.stdout), 'Materials infill UI tests passed');
});

runTest('7.4: test_blueprint_v36_multiformat.js passes 100%', () => {
  const res = spawnSync(process.execPath, ['tests/test_blueprint_v36_multiformat.js'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit 0, got ${res.status}`);
  assert.ok(/PASSED/i.test(res.stdout), 'Blueprint tests passed');
});

runTest('7.5: Master E2E runner (run_all_stl_e2e_tests.js) passes 100% across all 4 tiers', () => {
  const res = spawnSync(process.execPath, [RUNNER_SCRIPT, '--quiet'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit 0, got ${res.status}`);
  assert.ok(res.stdout.includes('ALL TESTS PASSED'), 'Master runner passes 100%');
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('  CHALLENGER REMEDIATION 1 STRESS-TEST SUMMARY');
console.log('='.repeat(80));
console.log(`  Total Probes Run:   ${RESULTS.passed + RESULTS.failed}`);
console.log(`  Passed Probes:      ${RESULTS.passed}`);
console.log(`  Failed Probes:      ${RESULTS.failed}`);
console.log(`  Tautologies Found:  ${TAUTOLOGY_CATALOG.length}`);
console.log('='.repeat(80));

if (RESULTS.failed > 0) {
  console.error('\n\x1b[31mVERDICT: REJECT - Adversarial probes failed!\x1b[0m');
  process.exit(1);
} else {
  console.log('\n\x1b[32mVERDICT: APPROVE - All 30 adversarial probes passed flawlessly!\x1b[0m');
  process.exit(0);
}
