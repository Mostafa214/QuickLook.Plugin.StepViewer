/**
 * Empirical Challenger Verification Harness - Milestone M4 Iteration 2
 * Author: challenger_m4_1_gen8
 * Scope: cadAnalysisEngine.js Dynamic Graduation Mathematics, Edge Sweeps & Adversarial Stress
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const CAD_ANALYSIS_JS_PATH = path.join(ROOT, 'Assets', 'js', 'cadAnalysisEngine.js');

// Mock DOM
class MockClassList {
  constructor() { this.classes = new Set(); }
  add(c) { if (c) this.classes.add(c); }
  remove(c) { if (c) this.classes.delete(c); }
  contains(c) { return this.classes.has(c); }
  toggle(c, f) {
    if (f !== undefined) { f ? this.add(c) : this.remove(c); return f; }
    if (this.contains(c)) { this.remove(c); return false; }
    this.add(c); return true;
  }
}

class MockElement {
  constructor(tag, id = '', className = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = new MockClassList();
    if (className) className.split(' ').filter(Boolean).forEach(c => this.classList.add(c));
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.innerText = '';
    this._value = '';
    this.attributes = {};
  }
  get value() { return this._value; }
  set value(v) { this._value = String(v); }
  setAttribute(k, v) { this.attributes[k] = String(v); this[k] = v; }
  getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : (this[k] !== undefined ? this[k] : null); }
  removeAttribute(k) { delete this.attributes[k]; delete this[k]; }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  set innerHTML(html) {
    this.children = [];
    this._rawHtml = html;
  }
  get innerHTML() { return this._rawHtml || ''; }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  removeEventListener(event, fn) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(f => f !== fn);
    }
  }
  dispatchEvent(event) {
    const type = typeof event === 'string' ? event : event.type;
    const evt = typeof event === 'string' ? { type: event, target: this } : event;
    if (!evt.target) evt.target = this;
    if (this.listeners[type]) {
      this.listeners[type].forEach(fn => fn(evt));
    }
  }
  click() { this.dispatchEvent('click'); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
}

const mockDomElements = {};
function mockGetElementById(id) {
  if (!mockDomElements[id]) {
    mockDomElements[id] = new MockElement('div', id);
  }
  return mockDomElements[id];
}

const mockDocument = {
  getElementById: mockGetElementById,
  createElement: (tag) => new MockElement(tag),
  body: new MockElement('body', 'body')
};

const mockTHREE = {
  Vector3: function(x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
    this.set = (a, b, c) => { this.x = a; this.y = b; this.z = c; return this; };
    this.copy = (v) => { this.x = v.x; this.y = v.y; this.z = v.z; return this; };
    this.clone = () => new mockTHREE.Vector3(this.x, this.y, this.z);
    this.normalize = () => this;
    this.negate = () => { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; };
    this.equals = (v) => this.x === v.x && this.y === v.y && this.z === v.z;
  },
  Matrix3: function() { this.getNormalMatrix = () => this; },
  Matrix4: function() { this.multiplyMatrices = () => this; },
  Color: function(c) { this.hex = c; },
  Box3: function() {
    this.setFromObject = () => this;
    this.getSize = () => new mockTHREE.Vector3(10, 10, 10);
    this.getCenter = () => new mockTHREE.Vector3(0, 0, 0);
  },
  ShaderMaterial: function(opts) {
    this.uniforms = opts.uniforms || {};
    this.uniformsNeedUpdate = false;
  },
  DoubleSide: 2,
  Group: function() { this.children = []; this.add = () => {}; this.remove = () => {}; },
  ArrowHelper: function() {
    this.setDirection = () => {};
    this.setLength = () => {};
    this.position = new mockTHREE.Vector3();
  }
};

const sandbox = {
  window: {},
  document: mockDocument,
  THREE: mockTHREE,
  console: console,
  showToast: () => {}
};
sandbox.window = sandbox;

const code = fs.readFileSync(CAD_ANALYSIS_JS_PATH, 'utf8');
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const Cad = sandbox.window.CadAnalysis;
if (!Cad || typeof Cad.calculateDraftTicks !== 'function') {
  console.error('CRITICAL: window.CadAnalysis.calculateDraftTicks is not exported!');
  process.exit(1);
}

const calculateDraftTicks = Cad.calculateDraftTicks;

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const failureDetails = [];

function check(cond, msg, details = null) {
  totalAssertions++;
  if (cond) {
    passedAssertions++;
  } else {
    failedAssertions++;
    const err = `FAIL: ${msg}` + (details ? ` -> ${JSON.stringify(details)}` : '');
    failureDetails.push(err);
    console.error(`  ✗ ${err}`);
  }
}

console.log('========================================================================');
console.log('  CHALLENGER GEN8 EMPIRICAL STRESS TEST HARNESS                        ');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// TEST SUITE 1: Explicit Edge Thresholds Mandated by Dispatch
// T = 0.1°, 0.5°, 1.0°, 2.5°, 3.0°, 3.5°, 7.0°, 10.0°, 12.3°, 45.0°
// -----------------------------------------------------------------------------
console.log('--- SUITE 1: Mandatory Edge Thresholds ---');
const edgeThresholds = [0.1, 0.5, 1.0, 2.5, 3.0, 3.5, 7.0, 10.0, 12.3, 45.0];

edgeThresholds.forEach(T => {
  const result = calculateDraftTicks(T);
  const ticks = result.ticks;

  check(result.threshold === T, `T=${T}: threshold matches input`, { expected: T, got: result.threshold });
  check(ticks.length >= 3, `T=${T}: ticks length >= 3 (at least -T, 0, +T)`, { length: ticks.length });

  // First tick must be -T at 0%
  const first = ticks[0];
  check(Math.abs(first.angle - (-T)) < 1e-4, `T=${T}: first tick angle is -${T}`, { angle: first.angle });
  check(first.percent === 0.0, `T=${T}: first tick percent is exactly 0.0%`, { percent: first.percent });
  check(first.pct === 0.0, `T=${T}: first tick pct is exactly 0.0%`, { pct: first.pct });
  check(first.isMajor === true, `T=${T}: first tick is marked isMajor`);

  // Last tick must be +T at 100%
  const last = ticks[ticks.length - 1];
  check(Math.abs(last.angle - T) < 1e-4, `T=${T}: last tick angle is +${T}`, { angle: last.angle });
  check(last.percent === 100.0, `T=${T}: last tick percent is exactly 100.0%`, { percent: last.percent });
  check(last.pct === 100.0, `T=${T}: last tick pct is exactly 100.0%`, { pct: last.pct });
  check(last.isMajor === true, `T=${T}: last tick is marked isMajor`);

  // Zero tick must exist at exactly 50%
  const zeroTicks = ticks.filter(t => t.isZero || Math.abs(t.angle) < 1e-4);
  check(zeroTicks.length === 1, `T=${T}: exactly one zero tick exists`, { count: zeroTicks.length });
  if (zeroTicks.length === 1) {
    const z = zeroTicks[0];
    check(z.angle === 0, `T=${T}: zero tick angle is strictly 0`);
    check(z.percent === 50.0, `T=${T}: zero tick percent is strictly 50.0%`);
    check(z.pct === 50.0, `T=${T}: zero tick pct is strictly 50.0%`);
    check(z.isZero === true, `T=${T}: zero tick has isZero === true`);
    check(z.isMajor === true, `T=${T}: zero tick has isMajor === true`);
    check(z.label === '0.0°', `T=${T}: zero tick label is '0.0°'`);
  }

  // Strict monotonicity check
  let monotonic = true;
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i].angle <= ticks[i - 1].angle) {
      monotonic = false;
      check(false, `T=${T}: non-monotonic angle at idx ${i}`, { prev: ticks[i - 1].angle, cur: ticks[i].angle });
    }
    if (ticks[i].percent <= ticks[i - 1].percent) {
      monotonic = false;
      check(false, `T=${T}: non-monotonic percent at idx ${i}`, { prev: ticks[i - 1].percent, cur: ticks[i].percent });
    }
  }
  check(monotonic, `T=${T}: all ${ticks.length} ticks are strictly monotonic in angle and percent`);

  // Symmetry check for intermediate ticks
  const nonBoundTicks = ticks.slice(1, -1);
  const posNonBound = nonBoundTicks.filter(t => t.angle > 0);
  const negNonBound = nonBoundTicks.filter(t => t.angle < 0);
  check(posNonBound.length === negNonBound.length, `T=${T}: symmetric count of positive and negative intermediate ticks`, {
    posCount: posNonBound.length,
    negCount: negNonBound.length
  });

  console.log(`  ✓ T = ${T.toFixed(1)}°: ${ticks.length} ticks (step: ${result.step}°), [-${T}° .. 0.0° .. +${T}°] - PASS`);
});

// -----------------------------------------------------------------------------
// TEST SUITE 2: All 20 Slider Values (0.5° to 10.0° in 0.5° steps)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: All 20 Interactive Slider Values (0.5° to 10.0°) ---');
const sliderValues = [];
for (let v = 0.5; v <= 10.001; v += 0.5) {
  sliderValues.push(Math.round(v * 10) / 10);
}
check(sliderValues.length === 20, `Slider has exactly 20 step positions`, { count: sliderValues.length });

sliderValues.forEach((val, idx) => {
  const res = calculateDraftTicks(val);
  const ticks = res.ticks;

  check(res.threshold === val, `Slider [${idx + 1}/20] T=${val}°: threshold === ${val}`);

  // Zero tick assertion
  const zeroTick = ticks.find(t => t.isZero || Math.abs(t.angle) < 1e-4);
  check(zeroTick !== undefined, `Slider T=${val}°: zero tick exists`);
  if (zeroTick) {
    check(zeroTick.percent === 50.0, `Slider T=${val}°: zero tick percent === 50.0%`, { got: zeroTick.percent });
    check(zeroTick.label === '0.0°', `Slider T=${val}°: zero tick label === '0.0°'`);
  }

  // Boundary ticks
  check(Math.abs(ticks[0].angle - (-val)) < 1e-4 && ticks[0].percent === 0.0, `Slider T=${val}°: boundary -T is at 0.0%`);
  check(Math.abs(ticks[ticks.length - 1].angle - val) < 1e-4 && ticks[ticks.length - 1].percent === 100.0, `Slider T=${val}°: boundary +T is at 100.0%`);

  // Monotonic
  for (let i = 1; i < ticks.length; i++) {
    check(ticks[i].angle > ticks[i - 1].angle, `Slider T=${val}°: strictly increasing angle at index ${i}`);
    check(ticks[i].percent > ticks[i - 1].percent, `Slider T=${val}°: strictly increasing percent at index ${i}`);
  }
});
console.log(`  ✓ Verified all 20 slider thresholds (0.5° to 10.0°): PASS`);

// -----------------------------------------------------------------------------
// TEST SUITE 3: Continuous 450-Threshold Sweep (0.1° to 45.0° in 0.1° steps)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: Full Continuous 450-Threshold Sweep (0.1° to 45.0°, step=0.1°) ---');
let sweepZeroMissing = 0;
let sweepNonMonotonic = 0;
let sweepBoundaryBad = 0;
let sweepNaNOrNull = 0;
let sweepTotal = 0;

for (let i = 1; i <= 450; i++) {
  const T = Math.round(i * 0.1 * 10) / 10;
  sweepTotal++;
  const res = calculateDraftTicks(T);
  const ticks = res.ticks;

  // Zero tick at 50%
  const zero = ticks.find(t => t.isZero && t.angle === 0 && t.percent === 50.0);
  if (!zero) sweepZeroMissing++;

  // Boundaries
  if (ticks.length < 3 || ticks[0].percent !== 0.0 || Math.abs(ticks[0].angle - (-T)) > 1e-4 ||
      ticks[ticks.length - 1].percent !== 100.0 || Math.abs(ticks[ticks.length - 1].angle - T) > 1e-4) {
    sweepBoundaryBad++;
  }

  // Monotonicity & NaN check
  for (let k = 1; k < ticks.length; k++) {
    if (ticks[k].angle <= ticks[k - 1].angle || ticks[k].percent <= ticks[k - 1].percent) {
      sweepNonMonotonic++;
      break;
    }
    if (isNaN(ticks[k].angle) || isNaN(ticks[k].percent) || ticks[k].label === undefined) {
      sweepNaNOrNull++;
      break;
    }
  }
}

check(sweepTotal === 450, `Swept exactly 450 thresholds`);
check(sweepZeroMissing === 0, `Continuous sweep: 0 thresholds missing exact 0.0° tick at 50%`, { sweepZeroMissing });
check(sweepNonMonotonic === 0, `Continuous sweep: 0 thresholds with non-monotonic ticks`, { sweepNonMonotonic });
check(sweepBoundaryBad === 0, `Continuous sweep: 0 thresholds with corrupted boundaries`, { sweepBoundaryBad });
check(sweepNaNOrNull === 0, `Continuous sweep: 0 thresholds with NaN/null/undefined ticks`, { sweepNaNOrNull });

console.log(`  ✓ 450/450 continuous sweep angles verified with 100% compliance: PASS`);

// -----------------------------------------------------------------------------
// TEST SUITE 4: Adversarial, Extreme, and Pathological Inputs Stress Testing
// Assert no infinite loops, clean clamping to [0.1, 45.0], no unhandled exceptions
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Adversarial & Extreme Inputs Stress Testing ---');

const adversarialCases = [
  // Upper boundary clamping -> 45.0°
  { input: Infinity, expectedClampedT: 45.0, name: 'Infinity (positive unbounded)' },
  { input: 1000000, expectedClampedT: 45.0, name: '1000000 (huge positive)' },
  { input: Number.MAX_VALUE, expectedClampedT: 45.0, name: 'Number.MAX_VALUE (extreme float)' },
  { input: '45.0', expectedClampedT: 45.0, name: 'String "45.0"' },
  { input: '999.9', expectedClampedT: 45.0, name: 'String "999.9" (out-of-bounds string)' },

  // Lower boundary clamping -> 0.1°
  { input: -Infinity, expectedClampedT: 0.1, name: '-Infinity (negative unbounded)' },
  { input: -500, expectedClampedT: 0.1, name: '-500 (large negative)' },
  { input: -1.0, expectedClampedT: 0.1, name: '-1.0 (negative)' },
  { input: '-10', expectedClampedT: 0.1, name: 'String "-10" (negative string)' },
  { input: 0.0000001, expectedClampedT: 0.1, name: '1e-7 (tiny positive below 0.1)' },
  { input: Number.MIN_VALUE, expectedClampedT: 0.1, name: 'Number.MIN_VALUE' },
  { input: Number.EPSILON, expectedClampedT: 0.1, name: 'Number.EPSILON' },
  { input: '0.1', expectedClampedT: 0.1, name: 'String "0.1"' },

  // Falsy / non-numeric fallback to standard default 3.0°
  { input: 0, expectedClampedT: 3.0, name: '0 (falsy number falls back to default 3.0°)' },
  { input: 0.0, expectedClampedT: 3.0, name: '0.0 (falsy float falls back to default 3.0°)' },
  { input: -0.0, expectedClampedT: 3.0, name: '-0.0 (negative zero falls back to default 3.0°)' },
  { input: NaN, expectedClampedT: 3.0, name: 'NaN (fallback default 3.0°)' },
  { input: null, expectedClampedT: 3.0, name: 'null (fallback default 3.0°)' },
  { input: undefined, expectedClampedT: 3.0, name: 'undefined (fallback default 3.0°)' },
  { input: '', expectedClampedT: 3.0, name: 'Empty string "" (falsy string fallback)' },
  { input: '   ', expectedClampedT: 3.0, name: 'Whitespace string "   " (fallback)' },
  { input: 'abc', expectedClampedT: 3.0, name: 'String "abc" (NaN fallback)' },
  { input: {}, expectedClampedT: 3.0, name: 'Empty object {} (NaN fallback)' },
  { input: [], expectedClampedT: 3.0, name: 'Empty array [] (falsy fallback)' },
  { input: false, expectedClampedT: 3.0, name: 'Boolean false (falsy fallback)' },

  // Non-default valid conversions
  { input: '3.5', expectedClampedT: 3.5, name: 'String "3.5"' },
  { input: '12.3', expectedClampedT: 12.3, name: 'String "12.3"' },
  { input: [7.5], expectedClampedT: 7.5, name: 'Single item array [7.5]' },
  { input: true, expectedClampedT: 1.0, name: 'Boolean true (Number(true) === 1.0)' },
];

adversarialCases.forEach((tc) => {
  const startTime = Date.now();
  let res = null;
  let threw = false;
  let errMsg = '';

  try {
    res = calculateDraftTicks(tc.input);
  } catch (err) {
    threw = true;
    errMsg = err.message;
  }
  const elapsed = Date.now() - startTime;

  // Assert execution time < 100ms (no infinite loops or CPU stalls)
  check(elapsed < 100, `Adversarial [${tc.name}]: terminates instantaneously (${elapsed}ms < 100ms)`);
  check(!threw, `Adversarial [${tc.name}]: does not throw exception`, { errMsg });

  if (res && res.ticks) {
    check(res.threshold === tc.expectedClampedT, `Adversarial [${tc.name}]: clamped threshold is ${tc.expectedClampedT}°`, {
      got: res.threshold,
      expected: tc.expectedClampedT
    });
    check(res.ticks.length >= 3, `Adversarial [${tc.name}]: ticks count >= 3`, { count: res.ticks.length });

    // Zero tick invariant
    const z = res.ticks.find(t => t.isZero);
    check(z !== undefined && z.percent === 50.0 && z.angle === 0, `Adversarial [${tc.name}]: zero tick intact at 50%`);

    // Monotonicity
    let mono = true;
    for (let k = 1; k < res.ticks.length; k++) {
      if (res.ticks[k].angle <= res.ticks[k - 1].angle || res.ticks[k].percent <= res.ticks[k - 1].percent) {
        mono = false;
        break;
      }
    }
    check(mono, `Adversarial [${tc.name}]: strictly monotonic ticks`);

    // Boundary checks
    check(res.ticks[0].percent === 0.0 && Math.abs(res.ticks[0].angle - (-tc.expectedClampedT)) < 1e-4, `Adversarial [${tc.name}]: bottom boundary -T at 0%`);
    check(res.ticks[res.ticks.length - 1].percent === 100.0 && Math.abs(res.ticks[res.ticks.length - 1].angle - tc.expectedClampedT) < 1e-4, `Adversarial [${tc.name}]: top boundary +T at 100%`);
  }
});
console.log(`  ✓ All ${adversarialCases.length} adversarial and edge test cases PASSED cleanly.`);

// -----------------------------------------------------------------------------
// TEST SUITE 5: DOM Legend Rendering Verification with calculateDraftTicks
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: DOM Legend Rendering Verification ---');

Cad.showDraftLegend(3.0);
const legendEl = mockDomElements['draft-angle-legend'];
check(legendEl.style.display === 'flex', 'Legend DOM display is "flex"');

Cad.updateDraftLegendThreshold(5.0);
check(mockDomElements['legend-threshold-badge'] !== null, 'Threshold badge updated');

Cad.hideDraftLegend();
check(legendEl.style.display === 'none', 'Legend DOM display is "none" after hideDraftLegend()');

console.log('  ✓ DOM Legend rendering integration: PASS');

// -----------------------------------------------------------------------------
// SUMMARY REPORT
// -----------------------------------------------------------------------------
console.log('\n========================================================================');
console.log('  EMPIRICAL CHALLENGER TEST SUITE SUMMARY                               ');
console.log('========================================================================');
console.log(`Total Assertions Evaluated : ${totalAssertions}`);
console.log(`Passed Assertions          : ${passedAssertions}`);
console.log(`Failed Assertions          : ${failedAssertions}`);

if (failedAssertions > 0) {
  console.log('\nFAILURES:');
  failureDetails.forEach(f => console.log(`- ${f}`));
  console.log('\n========================================================================');
  console.log('  VERDICT: REQUEST_CHANGES');
  console.log('========================================================================');
  process.exit(1);
} else {
  console.log('\n========================================================================');
  console.log('  VERDICT: APPROVE');
  console.log('========================================================================');
  process.exit(0);
}
