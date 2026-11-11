/**
 * Master E2E Test Runner for QuickLook Native STL Support
 * File: tests/run_all_stl_e2e_tests.js
 *
 * Requirements:
 * - Supports CLI arguments: --tier=1, --tier=2, --tier=3, --tier=4, --all (default: --all)
 * - Sequentially executes all specified test tier scripts in isolated child processes
 * - Aggregates suites, tests, passed, failed, assertions, and total execution duration
 * - Formats a clean, high-visibility ANSI summary table
 * - Exits with return code 0 on 100% pass; exits with return code 1 if any failure occurs
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

// ANSI Color Codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const BG_GREEN = '\x1b[42m\x1b[30m';
const BG_RED = '\x1b[41m\x1b[37m';

// Configuration of Tiers
const TIERS = [
  {
    id: 'tier1',
    name: 'Tier 1: Feature Coverage (F1 - F9)',
    file: 'test_stl_e2e_tier1_features.js',
    args: [],
    minTests: 45
  },
  {
    id: 'tier2',
    name: 'Tier 2: Boundary & Corner Cases',
    file: 'test_stl_e2e_tier2_boundaries.js',
    args: [],
    minTests: 45
  },
  {
    id: 'tier3',
    name: 'Tier 3: Pairwise Combinations',
    file: 'test_stl_e2e_tier3_tier4.js',
    args: ['--tier=3'],
    minTests: 9
  },
  {
    id: 'tier4',
    name: 'Tier 4: Real-World Application Workloads',
    file: 'test_stl_e2e_tier3_tier4.js',
    args: ['--tier=4'],
    minTests: 5
  }
];

// CLI Argument Parsing
function parseArgs() {
  const args = process.argv.slice(2);
  let selectedTier = 'all';
  let quiet = false;

  for (const arg of args) {
    if (arg.startsWith('--tier=')) {
      selectedTier = arg.split('=')[1].trim().toLowerCase();
    } else if (arg === '--all') {
      selectedTier = 'all';
    } else if (arg === '--quiet' || arg === '-q') {
      quiet = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return { selectedTier, quiet };
}

function printHelp() {
  console.log(`
${BOLD}QuickLook Native STL - Master E2E Test Runner${RESET}

${BOLD}Usage:${RESET}
  node tests/run_all_stl_e2e_tests.js [options]

${BOLD}Options:${RESET}
  --tier=1       Run only Tier 1: Feature Coverage (>= 45 tests across F1-F9)
  --tier=2       Run only Tier 2: Boundary & Corner Cases (>= 45 tests)
  --tier=3       Run only Tier 3: Pairwise Combinations (>= 9 tests)
  --tier=4       Run only Tier 4: Real-World Scenarios (5 realistic workloads)
  --all          Run all 4 tiers (Default: >= 104 tests)
  --quiet, -q    Suppress individual test case outputs and show only summary
  --help, -h     Show this help guide
`);
}

/**
 * Extracts numeric metrics from standard test output.
 * @param {string} stdout
 * @returns {object} { suites, tests, passed, failed, assertions, durationMs }
 */
function parseOutputMetrics(stdout) {
  const suitesMatch = stdout.match(/Suites:\s+(\d+)/);
  const totalMatch = stdout.match(/Total Tests:\s+(\d+)/);
  const passedMatch = stdout.match(/Passed:\s+(?:\x1b\[[0-9;]*m)?(\d+)/);
  const failedMatch = stdout.match(/Failed:\s+(?:\x1b\[[0-9;]*m)?(\d+)/);
  const assertionsMatch = stdout.match(/Assertions:\s+(\d+)\s+passed/);
  const durationMatch = stdout.match(/Duration:\s+(\d+)\s+ms/);

  return {
    suites: suitesMatch ? parseInt(suitesMatch[1], 10) : 0,
    tests: totalMatch ? parseInt(totalMatch[1], 10) : 0,
    passed: passedMatch ? parseInt(passedMatch[1], 10) : 0,
    failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
    assertions: assertionsMatch ? parseInt(assertionsMatch[1], 10) : 0,
    durationMs: durationMatch ? parseInt(durationMatch[1], 10) : 0
  };
}

/**
 * Main execution routine.
 */
function main() {
  const { selectedTier, quiet } = parseArgs();

  let plannedTiers = [];
  if (selectedTier === 'all' || selectedTier === '') {
    plannedTiers = TIERS;
  } else if (selectedTier === '1') {
    plannedTiers = [TIERS[0]];
  } else if (selectedTier === '2') {
    plannedTiers = [TIERS[1]];
  } else if (selectedTier === '3') {
    plannedTiers = [TIERS[2]];
  } else if (selectedTier === '4') {
    plannedTiers = [TIERS[3]];
  } else {
    console.error(`${RED}Error: Unknown tier selector "${selectedTier}". Use --tier=1, 2, 3, 4, or --all.${RESET}`);
    process.exit(1);
  }

  const overallStartTime = Date.now();
  console.log('='.repeat(80));
  console.log(`${BOLD}${CYAN}  QUICKLOOK STL NATIVE SUPPORT - MASTER E2E TEST SUITE RUNNER${RESET}`);
  console.log('='.repeat(80));
  console.log(`  ${BOLD}Scope:${RESET}       ${plannedTiers.map(t => t.name).join(' | ')}`);
  console.log(`  ${BOLD}Environment:${RESET} Node ${process.version} on ${process.platform} (${process.arch})`);
  console.log(`  ${BOLD}Timestamp:${RESET}   ${new Date().toISOString()}`);
  console.log('='.repeat(80));
  console.log('');

  const results = [];
  let anyFailure = false;

  for (const tier of plannedTiers) {
    const scriptPath = path.join(__dirname, tier.file);
    const cmdArgs = [scriptPath, ...tier.args];

    const t0 = Date.now();
    const proc = spawnSync(process.execPath, cmdArgs, {
      timeout: 30000,
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      env: Object.assign({}, process.env)
    });
    const runTime = Date.now() - t0;

    const output = (proc.stdout || '') + (proc.stderr || '');
    const metrics = parseOutputMetrics(output);
    const exitCode = proc.status === null ? 1 : proc.status;
    const passed = exitCode === 0 && metrics.failed === 0 && metrics.tests >= tier.minTests;

    if (!passed) {
      anyFailure = true;
    }

    if (!quiet) {
      // Print child output
      console.log(output.trim());
      console.log('');
    } else {
      const statusPill = passed ? `${GREEN}✔ PASS${RESET}` : `${RED}✘ FAIL${RESET}`;
      console.log(`  [${statusPill}] ${BOLD}${tier.name}${RESET} (${metrics.tests} tests, ${metrics.assertions} assertions, ${runTime}ms)`);
    }

    results.push({
      tier,
      exitCode,
      metrics,
      passed,
      durationMs: runTime,
      output
    });
  }

  const overallTotalDuration = Date.now() - overallStartTime;

  // Print Formatted ANSI Summary Table
  console.log('='.repeat(80));
  console.log(`${BOLD}  AGGREGATED E2E TEST EXECUTION SUMMARY TABLE${RESET}`);
  console.log('='.repeat(80));
  console.log(
    `  ${BOLD}${'TIER / TEST TARGET'.padEnd(38)} ${'SUITES'.padStart(6)} ${'TESTS'.padStart(7)} ${'PASS/FAIL'.padStart(11)} ${'ASSERTIONS'.padStart(10)} ${'TIME'.padStart(8)} ${'STATUS'.padStart(8)}${RESET}`
  );
  console.log('  ' + '-'.repeat(94));

  let totalSuites = 0;
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalAssertions = 0;

  for (const res of results) {
    totalSuites += res.metrics.suites;
    totalTests += res.metrics.tests;
    totalPassed += res.metrics.passed;
    totalFailed += res.metrics.failed;
    totalAssertions += res.metrics.assertions;

    const passFailStr = `${res.metrics.passed}/${res.metrics.failed}`;
    const statusStr = res.passed ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    const nameStr = res.tier.name.length > 38 ? res.tier.name.substring(0, 35) + '...' : res.tier.name;

    console.log(
      `  ${nameStr.padEnd(38)} ` +
      `${String(res.metrics.suites).padStart(6)} ` +
      `${String(res.metrics.tests).padStart(7)} ` +
      `${passFailStr.padStart(11)} ` +
      `${String(res.metrics.assertions).padStart(10)} ` +
      `${(res.durationMs + 'ms').padStart(8)} ` +
      `${statusStr.padStart(8 + (res.passed ? 9 : 9))}`
    );
  }

  console.log('  ' + '-'.repeat(94));
  const grandPassFail = `${totalPassed}/${totalFailed}`;
  const grandStatus = (!anyFailure && totalFailed === 0)
    ? `${BG_GREEN}${BOLD} ALL TESTS PASSED (100%) ${RESET}`
    : `${BG_RED}${BOLD} TEST SUITE FAILED ${RESET}`;

  console.log(
    `  ${BOLD}${'GRAND TOTAL'.padEnd(38)} ` +
    `${String(totalSuites).padStart(6)} ` +
    `${String(totalTests).padStart(7)} ` +
    `${grandPassFail.padStart(11)} ` +
    `${String(totalAssertions).padStart(10)} ` +
    `${(overallTotalDuration + 'ms').padStart(8)}${RESET}`
  );
  console.log('='.repeat(80));
  console.log(`  Final Status: ${grandStatus}`);
  console.log(`  Total Execution Time: ${overallTotalDuration} ms`);
  console.log('='.repeat(80));
  console.log('');

  if (anyFailure || totalFailed > 0) {
    console.error(`${RED}Master E2E Test Suite encountered failures. Exiting with code 1.${RESET}`);
    process.exit(1);
  } else {
    console.log(`${GREEN}✔ All E2E requirements, boundaries, and scenarios verified successfully! Exiting with code 0.${RESET}`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
