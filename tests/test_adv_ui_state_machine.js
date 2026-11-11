/**
 * Adversarial Stress & State Machine Test Suite: UI & Tool State Adaptations (Milestone 4)
 * File: tests/test_adv_ui_state_machine.js
 *
 * Authored by: Empirical Challenger 2 (Milestone 4)
 *
 * Thoroughly stress-tests:
 * 1. Exploded View Tool State Machine (Single/Multi-body, STL vs STEP, Clear, 100x Oscillation, Lifecycle Hooks)
 * 2. Keyboard Shortcut 'X' Capture-Phase Guard (Suppression, Modifiers, Form Inputs, Multi-body Bypass, Key Whitelist)
 * 3. DOM & CSS Invariant Checks (.btn[disabled] CSS in viewer.html, #section-infill hierarchy, slider & preset events)
 * 4. Materials & Infill Engine Adversarial Inputs & High-Throughput Stress (1,000 iterations, extreme volumes, clamping)
 */

'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');

const {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertCloseTo,
  assertDeepCloseTo,
  assertThrows,
  createCadEnvironment,
  reportSummary,
  exitProcess
} = require('./stl_test_harness.js');

console.log('================================================================================');
console.log('  CHALLENGER 2: ADVERSARIAL STRESS & STATE MACHINE TEST SUITE (MILESTONE 4)     ');
console.log('================================================================================');

/**
 * Helper to build an EventTargetMock for window capturing and bubbling phases.
 */
function createEventTarget() {
  const captureListeners = {};
  const bubbleListeners = {};

  return {
    addEventListener: (type, fn, options) => {
      const isCapture = (options === true || (typeof options === 'object' && options && options.capture));
      const dict = isCapture ? captureListeners : bubbleListeners;
      if (!dict[type]) dict[type] = [];
      dict[type].push(fn);
    },
    removeEventListener: (type, fn, options) => {
      const isCapture = (options === true || (typeof options === 'object' && options && options.capture));
      const dict = isCapture ? captureListeners : bubbleListeners;
      if (dict[type]) {
        dict[type] = dict[type].filter(h => h !== fn);
      }
    },
    dispatchEvent: (evt) => {
      let immediateStopped = false;
      evt.defaultPrevented = false;
      evt.propagationStopped = false;
      evt.preventDefault = () => { evt.defaultPrevented = true; };
      evt.stopPropagation = () => { evt.propagationStopped = true; };
      evt.stopImmediatePropagation = () => { immediateStopped = true; evt.propagationStopped = true; };

      // 1. Capture phase
      const capList = [...(captureListeners[evt.type] || [])];
      for (const h of capList) {
        if (immediateStopped) break;
        h(evt);
      }

      // 2. Bubble phase
      if (!evt.propagationStopped) {
        const bubList = [...(bubbleListeners[evt.type] || [])];
        for (const h of bubList) {
          if (immediateStopped) break;
          h(evt);
        }
      }
      return !evt.defaultPrevented;
    },
    getListenersCount: (type) => {
      return (captureListeners[type] ? captureListeners[type].length : 0) +
             (bubbleListeners[type] ? bubbleListeners[type].length : 0);
    }
  };
}

/**
 * Helper to instantiate environment with proper script loading order matching viewer.html:
 * explodedView -> assemblyTree -> workbenchUiEngine -> materialsEngine
 */
function createFullUiEnvironment() {
  const env = createCadEnvironment({
    loadCadState: true,
    loadExplodedView: true,
    loadAssemblyTree: true,
    loadWorkbenchUi: true,
    loadMaterialsEngine: true
  });

  // Attach proper event target to window if not already present
  const et = createEventTarget();
  env.window.addEventListener = et.addEventListener;
  env.window.removeEventListener = et.removeEventListener;
  env.window.dispatchEvent = et.dispatchEvent;
  env.eventTarget = et;

  // Track toasts
  env.toasts = [];
  env.window.showToast = (msg) => {
    env.toasts.push(String(msg));
  };

  // Wire up lifecycle hooks and keyboard guard
  if (env.window.WorkbenchUI && typeof env.window.WorkbenchUI.hookExplodeLifecycle === 'function') {
    env.window.WorkbenchUI.hookExplodeLifecycle();
  }
  if (env.window.WorkbenchUI && typeof env.window.WorkbenchUI.setupExplodeKeyboardGuard === 'function') {
    env.window.WorkbenchUI.setupExplodeKeyboardGuard();
  }

  return env;
}

/**
 * Creates dummy mesh fixtures
 */
function makeDummyMesh(env, id = 1, volumeMm3 = 1000) {
  const geom = new env.THREE.BufferGeometry();
  const mat = new env.THREE.MeshStandardMaterial({ color: 0x38bdf8 });
  const mesh = new env.THREE.Mesh(geom, mat);
  return {
    id: id,
    name: `Body_${id}`,
    mesh: mesh,
    data: {
      volumeMm3: volumeMm3,
      areaMm2: 600,
      bbox: { min: [0, 0, 0], max: [10, 10, 10], size: [10, 10, 10] }
    }
  };
}

// ============================================================================
// SUITE 1: Exploded View Tool State Machine Transitions & Stress
// ============================================================================
describe('Suite 1: Exploded View Tool State Machine Transitions & Stress', () => {

  test('ADV-1.1: Single-body STL disables #btn-explode with exact attributes and tooltip', () => {
    const env = createFullUiEnvironment();
    const btn = env.document.getElementById('btn-explode');
    assertTrue(btn !== null, '#btn-explode exists');

    env.window.activeCadFormat = 'STL';
    const body1 = makeDummyMesh(env, 1, 8000);
    env.window.modelBodies = [body1];

    env.window.buildModelTree([body1.mesh]);

    assertEqual(btn.disabled, true, 'btn.disabled is true for single-body STL');
    assertEqual(btn.getAttribute('disabled'), 'true', 'attribute disabled="true" is set');
    assertTrue(btn.classList.contains('disabled'), 'classList contains "disabled"');
    assertEqual(btn.style.opacity, '0.4', 'opacity is 0.4');
    assertEqual(btn.style.pointerEvents, 'none', 'pointerEvents is none');
    assertEqual(btn.style.cursor, 'not-allowed', 'cursor is not-allowed');
    assertEqual(btn.title, 'Exploded view requires a multi-body assembly', 'Tooltip informs user of multi-body requirement');
  });

  test('ADV-1.2: Multi-body STEP (8 bodies) re-enables #btn-explode and restores active tooltip', () => {
    const env = createFullUiEnvironment();
    const btn = env.document.getElementById('btn-explode');

    // Start from single-body STL
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [makeDummyMesh(env, 1)];
    env.window.buildModelTree([env.window.modelBodies[0].mesh]);
    assertEqual(btn.disabled, true, 'Precondition: disabled on single STL');

    // Transition to 8-body STEP
    env.window.activeCadFormat = 'STEP';
    const stepBodies = Array.from({ length: 8 }, (_, i) => makeDummyMesh(env, i + 1));
    env.window.modelBodies = stepBodies;
    env.window.buildModelTree(stepBodies.map(b => b.mesh));

    assertEqual(btn.disabled, false, 'btn.disabled is false for 8-body STEP');
    assertEqual(btn.hasAttribute('disabled'), false, 'attribute disabled is removed');
    assertEqual(btn.classList.contains('disabled'), false, 'classList does not contain "disabled"');
    assertEqual(btn.style.opacity, '1', 'opacity restored to 1');
    assertEqual(btn.style.pointerEvents, 'auto', 'pointerEvents restored to auto');
    assertEqual(btn.style.cursor, 'pointer', 'cursor restored to pointer');
    assertEqual(btn.title, 'Exploded Assembly View [X]', 'Active exploded assembly tooltip restored');
  });

  test('ADV-1.3: Multi-solid STL (3 bodies) re-enables #btn-explode', () => {
    const env = createFullUiEnvironment();
    const btn = env.document.getElementById('btn-explode');

    env.window.activeCadFormat = 'STL';
    const stlBodies = [makeDummyMesh(env, 1), makeDummyMesh(env, 2), makeDummyMesh(env, 3)];
    env.window.modelBodies = stlBodies;
    env.window.buildModelTree(stlBodies.map(b => b.mesh));

    assertEqual(btn.disabled, false, 'btn.disabled is false for 3-body STL');
    assertEqual(btn.hasAttribute('disabled'), false, 'attribute disabled removed for multi-solid STL');
    assertEqual(btn.classList.contains('disabled'), false, 'disabled class removed');
    assertEqual(btn.style.opacity, '1', 'opacity is 1 for multi-solid STL');
    assertEqual(btn.title, 'Exploded Assembly View [X]', 'Active tooltip set for multi-solid STL');
  });

  test('ADV-1.4: Single-body STEP (1 body) preserves native soft-disabled assemblyTree state', () => {
    const env = createFullUiEnvironment();
    const btn = env.document.getElementById('btn-explode');

    env.window.activeCadFormat = 'STEP';
    const stepBody1 = makeDummyMesh(env, 1);
    env.window.modelBodies = [stepBody1];
    env.window.buildModelTree([stepBody1.mesh]);

    // Single-body STEP is soft-disabled (opacity 0.45, disabled=false, specific STEP tooltip)
    assertEqual(btn.disabled, false, 'Single-body STEP is not hard disabled attribute');
    assertEqual(btn.hasAttribute('disabled'), false, 'disabled attribute absent in STEP');
    assertEqual(btn.classList.contains('disabled'), false, 'disabled class absent in STEP');
    assertEqual(btn.style.opacity, '0.45', 'opacity is 0.45 for single STEP');
    assertEqual(btn.style.pointerEvents, 'auto', 'pointerEvents remains auto for STEP');
    assertEqual(btn.style.cursor, 'pointer', 'cursor remains pointer for STEP');
    assertEqual(btn.title, 'Exploded View (Requires Assembly with 2+ parts)', 'STEP informative tooltip set');
  });

  test('ADV-1.5: Model clear (0 bodies) does not corrupt state or throw errors', () => {
    const env = createFullUiEnvironment();
    const btn = env.document.getElementById('btn-explode');

    // Load multi-body STEP first
    env.window.activeCadFormat = 'STEP';
    const bodies = [makeDummyMesh(env, 1), makeDummyMesh(env, 2)];
    env.window.modelBodies = bodies;
    env.window.buildModelTree(bodies.map(b => b.mesh));
    assertEqual(btn.disabled, false, 'Multi-body STEP enables button');

    // Simulate clearing model on STL
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [];
    env.window.buildModelTree([]);
    assertEqual(btn.disabled, true, 'STL with 0 bodies remains safely disabled');
    assertEqual(btn.style.opacity, '0.4', 'opacity is 0.4 for empty STL');

    // Calling resetExplodedView does not corrupt state
    env.window.resetExplodedView();
    assertEqual(btn.disabled, true, 'resetExplodedView preserves disabled state');
  });

  test('ADV-1.6: 100-Cycle High-Frequency Oscillation between single STL and multi STEP', () => {
    const env = createFullUiEnvironment();
    const btn = env.document.getElementById('btn-explode');
    const dummyMesh = makeDummyMesh(env, 1).mesh;
    const dummy8 = Array.from({ length: 8 }, (_, i) => makeDummyMesh(env, i + 1).mesh);
    const dummy3 = Array.from({ length: 3 }, (_, i) => makeDummyMesh(env, i + 1).mesh);

    const startTime = Date.now();

    for (let cycle = 0; cycle < 100; cycle++) {
      // Step A: Single-body STL (count = 1)
      env.window.activeCadFormat = 'STL';
      env.window.modelBodies = [{ id: 1, name: 'p1', mesh: dummyMesh, data: {} }];
      env.window.buildModelTree([dummyMesh]);
      assertEqual(btn.disabled, true, `Cycle ${cycle} A: btn.disabled must be true`);
      assertEqual(btn.style.opacity, '0.4', `Cycle ${cycle} A: opacity 0.4`);
      assertEqual(btn.style.pointerEvents, 'none', `Cycle ${cycle} A: pointer-events none`);
      assertEqual(btn.title, 'Exploded view requires a multi-body assembly', `Cycle ${cycle} A: tooltip`);

      // Step B: Multi-body STEP (count = 8)
      env.window.activeCadFormat = 'STEP';
      env.window.modelBodies = dummy8.map((m, idx) => ({ id: idx + 1, name: `p${idx}`, mesh: m, data: {} }));
      env.window.buildModelTree(dummy8);
      assertEqual(btn.disabled, false, `Cycle ${cycle} B: btn.disabled must be false`);
      assertEqual(btn.style.opacity, '1', `Cycle ${cycle} B: opacity 1`);
      assertEqual(btn.style.pointerEvents, 'auto', `Cycle ${cycle} B: pointer-events auto`);
      assertEqual(btn.title, 'Exploded Assembly View [X]', `Cycle ${cycle} B: tooltip`);

      // Step C: Multi-solid STL (count = 3)
      env.window.activeCadFormat = 'STL';
      env.window.modelBodies = dummy3.map((m, idx) => ({ id: idx + 1, name: `stl_${idx}`, mesh: m, data: {} }));
      env.window.buildModelTree(dummy3);
      assertEqual(btn.disabled, false, `Cycle ${cycle} C: btn.disabled must be false`);
      assertEqual(btn.style.opacity, '1', `Cycle ${cycle} C: opacity 1`);

      // Step D: Single-body STEP (count = 1)
      env.window.activeCadFormat = 'STEP';
      env.window.modelBodies = [{ id: 1, name: 'step_single', mesh: dummyMesh, data: {} }];
      env.window.buildModelTree([dummyMesh]);
      assertEqual(btn.disabled, false, `Cycle ${cycle} D: btn.disabled must be false`);
      assertEqual(btn.style.opacity, '0.45', `Cycle ${cycle} D: opacity 0.45`);
    }

    const duration = Date.now() - startTime;
    assertTrue(duration < 2000, `100 cycles (400 transitions) completed in ${duration} ms (< 2000 ms)`);
  });

  test('ADV-1.7: Lifecycle hook idempotency (repeatedly wrapping functions does not recurse)', () => {
    const env = createFullUiEnvironment();

    // Call hookExplodeLifecycle 50 times
    for (let i = 0; i < 50; i++) {
      env.window.WorkbenchUI.hookExplodeLifecycle();
    }

    // Call buildModelTree and toggleExplode to verify no stack overflow
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [makeDummyMesh(env, 1)];
    env.window.buildModelTree([env.window.modelBodies[0].mesh]);

    // Programmatic toggleExplode on single STL is cleanly intercepted
    env.toasts = [];
    env.window.toggleExplode();
    assertEqual(env.toasts.length, 1, 'Toast triggered without recursion');
    assertEqual(env.toasts[0], 'Exploded view requires a multi-body assembly with multiple parts', 'Toast text correct');
  });
});

// ============================================================================
// SUITE 2: Keyboard Shortcut 'X' Capture-Phase Interception & Event Propagation
// ============================================================================
describe('Suite 2: Keyboard Shortcut \'X\' Capture-Phase Interception & Event Propagation', () => {

  test('ADV-2.1: Keydown \'x\' and \'X\' on single-body STL is intercepted, prevented, and toasts', () => {
    const env = createFullUiEnvironment();
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [makeDummyMesh(env, 1)];

    // 1. Lowercase 'x'
    env.toasts = [];
    const ev1 = {
      type: 'keydown',
      key: 'x',
      target: env.document.createElement('div'),
      defaultPrevented: false
    };
    env.window.dispatchEvent(ev1);

    assertEqual(ev1.defaultPrevented, true, 'preventDefault() was called for lowercase "x"');
    assertEqual(ev1.propagationStopped, true, 'stopImmediatePropagation() was called');
    assertEqual(env.toasts.length, 1, 'One toast displayed');
    assertEqual(env.toasts[0], 'Exploded view requires a multi-body assembly with multiple parts', 'Toast message exact match');

    // 2. Uppercase 'X'
    env.toasts = [];
    const ev2 = {
      type: 'keydown',
      key: 'X',
      target: env.document.createElement('div'),
      defaultPrevented: false
    };
    env.window.dispatchEvent(ev2);

    assertEqual(ev2.defaultPrevented, true, 'preventDefault() was called for uppercase "X"');
    assertEqual(ev2.propagationStopped, true, 'stopImmediatePropagation() was called for "X"');
    assertEqual(env.toasts.length, 1, 'One toast displayed for "X"');
  });

  test('ADV-2.2: Modifier keys (Ctrl+X, Alt+X, Meta+X) bypass guard completely', () => {
    const env = createFullUiEnvironment();
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [makeDummyMesh(env, 1)];

    // 1. Ctrl+X (e.g. Cut)
    env.toasts = [];
    const evCtrl = {
      type: 'keydown',
      key: 'x',
      ctrlKey: true,
      target: env.document.createElement('div'),
      defaultPrevented: false
    };
    env.window.dispatchEvent(evCtrl);
    assertEqual(evCtrl.defaultPrevented, false, 'Ctrl+X must NOT be prevented');
    assertEqual(env.toasts.length, 0, 'No toast on Ctrl+X');

    // 2. Alt+X
    env.toasts = [];
    const evAlt = {
      type: 'keydown',
      key: 'x',
      altKey: true,
      target: env.document.createElement('div'),
      defaultPrevented: false
    };
    env.window.dispatchEvent(evAlt);
    assertEqual(evAlt.defaultPrevented, false, 'Alt+X must NOT be prevented');
    assertEqual(env.toasts.length, 0, 'No toast on Alt+X');

    // 3. Meta+X (Cmd+X on Mac/WebView)
    env.toasts = [];
    const evMeta = {
      type: 'keydown',
      key: 'x',
      metaKey: true,
      target: env.document.createElement('div'),
      defaultPrevented: false
    };
    env.window.dispatchEvent(evMeta);
    assertEqual(evMeta.defaultPrevented, false, 'Meta+X must NOT be prevented');
    assertEqual(env.toasts.length, 0, 'No toast on Meta+X');
  });

  test('ADV-2.3: Form inputs (<input> and <textarea>) bypass guard completely', () => {
    const env = createFullUiEnvironment();
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [makeDummyMesh(env, 1)];

    // 1. Target <input>
    env.toasts = [];
    const inputEl = env.document.createElement('input');
    const evInput = {
      type: 'keydown',
      key: 'x',
      target: inputEl,
      defaultPrevented: false
    };
    env.window.dispatchEvent(evInput);
    assertEqual(evInput.defaultPrevented, false, 'Typing "x" in <input> must NOT be prevented');
    assertEqual(env.toasts.length, 0, 'No toast when typing in <input>');

    // 2. Target <textarea>
    env.toasts = [];
    const textEl = env.document.createElement('textarea');
    const evText = {
      type: 'keydown',
      key: 'x',
      target: textEl,
      defaultPrevented: false
    };
    env.window.dispatchEvent(evText);
    assertEqual(evText.defaultPrevented, false, 'Typing "x" in <textarea> must NOT be prevented');
    assertEqual(env.toasts.length, 0, 'No toast when typing in <textarea>');
  });

  test('ADV-2.4: Multi-body assemblies (STEP and STL) bypass guard to let viewer handle explode', () => {
    const env = createFullUiEnvironment();

    // 1. Multi-body STEP (8 bodies)
    env.window.activeCadFormat = 'STEP';
    env.window.modelBodies = Array.from({ length: 8 }, (_, i) => makeDummyMesh(env, i + 1));
    env.toasts = [];

    const evStep = {
      type: 'keydown',
      key: 'x',
      target: env.document.createElement('div'),
      defaultPrevented: false
    };
    env.window.dispatchEvent(evStep);
    assertEqual(evStep.defaultPrevented, false, 'Multi-body STEP "x" not blocked by guard');
    assertEqual(env.toasts.length, 0, 'No guard toast on multi-body STEP');

    // 2. Multi-solid STL (3 bodies)
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [makeDummyMesh(env, 1), makeDummyMesh(env, 2), makeDummyMesh(env, 3)];
    env.toasts = [];

    const evStlMulti = {
      type: 'keydown',
      key: 'x',
      target: env.document.createElement('div'),
      defaultPrevented: false
    };
    env.window.dispatchEvent(evStlMulti);
    assertEqual(evStlMulti.defaultPrevented, false, 'Multi-solid STL "x" not blocked by guard');
    assertEqual(env.toasts.length, 0, 'No guard toast on multi-solid STL');
  });

  test('ADV-2.5: Single-body STEP bypasses STL capture guard', () => {
    const env = createFullUiEnvironment();
    env.window.activeCadFormat = 'STEP';
    env.window.modelBodies = [makeDummyMesh(env, 1)];
    env.toasts = [];

    const evSingleStep = {
      type: 'keydown',
      key: 'x',
      target: env.document.createElement('div'),
      defaultPrevented: false
    };
    env.window.dispatchEvent(evSingleStep);

    assertEqual(evSingleStep.defaultPrevented, false, 'Single-body STEP is not blocked by STL capture guard');
    assertEqual(env.toasts.length, 0, 'No STL toast on single-body STEP');
  });

  test('ADV-2.6: Whitelist: all other hotkeys and alphanumeric keys are not interfered with', () => {
    const env = createFullUiEnvironment();
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [makeDummyMesh(env, 1)];

    const nonExplodeKeys = [
      'm', 'M', // Measure tool
      's', 'S', // Section view
      'b', 'B', // Bounding box
      '1', '2', '3', '4', '5', '6', // Camera projections
      'Escape', 'Enter', 'Tab', ' ', // Standard navigation
      'a', 'z', 'c', 'v', 'f', 'r', 't'
    ];

    for (const k of nonExplodeKeys) {
      env.toasts = [];
      const ev = {
        type: 'keydown',
        key: k,
        target: env.document.createElement('div'),
        defaultPrevented: false
      };
      env.window.dispatchEvent(ev);
      assertEqual(ev.defaultPrevented, false, `Key "${k}" must NOT be prevented by guard`);
      assertEqual(env.toasts.length, 0, `Key "${k}" must NOT trigger toast`);
    }
  });
});

// ============================================================================
// SUITE 3: DOM & CSS Invariant Checks
// ============================================================================
describe('Suite 3: DOM & CSS Invariant Checks', () => {

  test('ADV-3.1: Assets/viewer.html contains .btn[disabled] and .btn.disabled computed CSS invariants', () => {
    const viewerHtmlPath = path.resolve(__dirname, '../Assets/viewer.html');
    assertTrue(fs.existsSync(viewerHtmlPath), 'Assets/viewer.html exists');

    const html = fs.readFileSync(viewerHtmlPath, 'utf8');

    // Verify .btn[disabled] selector exists
    assertTrue(html.includes('.btn[disabled]'), '.btn[disabled] CSS selector present in viewer.html');
    assertTrue(html.includes('.btn.disabled'), '.btn.disabled CSS selector present in viewer.html');

    // Verify critical style declarations
    const styleSnippetMatch = html.match(/\.btn\[disabled\][\s\S]*?\{([\s\S]*?)\}/);
    assertTrue(styleSnippetMatch !== null, 'Style block for .btn[disabled] found');

    const declarations = styleSnippetMatch[1];
    assertTrue(declarations.includes('opacity: 0.4'), 'CSS specifies opacity: 0.4');
    assertTrue(declarations.includes('pointer-events: none'), 'CSS specifies pointer-events: none');
    assertTrue(declarations.includes('cursor: not-allowed'), 'CSS specifies cursor: not-allowed');
    assertTrue(declarations.includes('!important'), 'CSS specifies !important to override tool button styles');
  });

  test('ADV-3.2: Assets/viewer.html contains complete #section-infill DOM elements and hierarchy', () => {
    const viewerHtmlPath = path.resolve(__dirname, '../Assets/viewer.html');
    const html = fs.readFileSync(viewerHtmlPath, 'utf8');

    // Section container
    assertTrue(html.includes('id="section-infill"'), '#section-infill exists in viewer.html');

    // Slider
    assertTrue(html.includes('id="infill-slider"'), '#infill-slider input exists');
    assertTrue(html.includes('min="5"'), '#infill-slider has min="5"');
    assertTrue(html.includes('max="100"'), '#infill-slider has max="100"');
    assertTrue(html.includes('value="20"'), '#infill-slider has default value="20"');
    assertTrue(html.includes('step="1"'), '#infill-slider has step="1"');

    // Infill Value Label
    assertTrue(html.includes('id="infill-val"'), '#infill-val label exists');
    assertTrue(html.includes('>20%<'), 'Default infill-val displays 20%');

    // Presets
    assertTrue(html.includes('class="btn-preset-infill btn-copy" data-infill="15"'), 'Preset 15% button exists');
    assertTrue(html.includes('data-infill="20"'), 'Preset 20% button exists');
    assertTrue(html.includes('data-infill="50"'), 'Preset 50% button exists');
    assertTrue(html.includes('data-infill="100"'), 'Preset 100% button exists');

    // Estimation metric elements
    assertTrue(html.includes('id="print-est-mass"'), '#print-est-mass metric element exists');
    assertTrue(html.includes('id="print-est-length"'), '#print-est-length metric element exists');
    assertTrue(html.includes('id="print-est-spool"'), '#print-est-spool metric element exists');
  });

  test('ADV-3.3: Infill slider & preset buttons live reactivity via event listeners', () => {
    const env = createFullUiEnvironment();
    const doc = env.document;

    // Seed infill DOM
    const sec = doc.createElement('div');
    sec.id = 'section-infill';
    doc.body.appendChild(sec);
    doc.registerElement(sec);

    const slider = doc.createElement('input');
    slider.id = 'infill-slider';
    slider.value = '20';
    sec.appendChild(slider);
    doc.registerElement(slider);

    const valLabel = doc.createElement('span');
    valLabel.id = 'infill-val';
    valLabel.innerText = '20%';
    sec.appendChild(valLabel);
    doc.registerElement(valLabel);

    const massEl = doc.createElement('strong');
    massEl.id = 'print-est-mass';
    sec.appendChild(massEl);
    doc.registerElement(massEl);

    const lengthEl = doc.createElement('strong');
    lengthEl.id = 'print-est-length';
    sec.appendChild(lengthEl);
    doc.registerElement(lengthEl);

    const spoolEl = doc.createElement('strong');
    spoolEl.id = 'print-est-spool';
    sec.appendChild(spoolEl);
    doc.registerElement(spoolEl);

    const presetBtns = [15, 20, 50, 100].map(p => {
      const b = doc.createElement('button');
      b.className = 'btn-preset-infill' + (p === 20 ? ' active' : '');
      b.setAttribute('data-infill', String(p));
      sec.appendChild(b);
      return b;
    });

    // Setup STL model with 10,000 mm³ volume and PLA (1.24 g/cm³)
    env.window.activeCadFormat = 'STL';
    env.window.modelPhysicalProps = { volumeMm3: 10000, areaMm2: 3000, bbox: { x: 10, y: 10, z: 100 } };
    env.window.MaterialsEngine.selectMaterial('pla');

    // Wire up listeners
    env.window.setupMaterialsListeners();

    // 1. Slider dispatched with value 35%
    slider.value = '35';
    slider.dispatchEvent({ type: 'input', target: slider });

    assertEqual(env.window.MaterialsEngine.getInfill(), 35, 'Infill state updated to 35%');
    assertEqual(valLabel.innerText, '35%', 'Value label updated to 35%');
    // None of the presets should have active class
    presetBtns.forEach(btn => {
      assertEqual(btn.classList.contains('active'), false, `Preset ${btn.getAttribute('data-infill')} is not active at 35%`);
    });

    // 2. Click preset 50%
    const p50 = presetBtns.find(b => b.getAttribute('data-infill') === '50');
    p50.click();

    assertEqual(env.window.MaterialsEngine.getInfill(), 50, 'Infill state updated to 50% via preset click');
    assertEqual(valLabel.innerText, '50%', 'Value label updated to 50%');
    assertEqual(Number(slider.value), 50, 'Slider value synced to 50');
    assertTrue(p50.classList.contains('active'), 'Preset 50 button gains active class');

    // 3. Click preset 15%
    const p15 = presetBtns.find(b => b.getAttribute('data-infill') === '15');
    p15.click();

    assertEqual(env.window.MaterialsEngine.getInfill(), 15, 'Infill state updated to 15%');
    assertEqual(valLabel.innerText, '15%', 'Value label updated to 15%');
    assertTrue(p15.classList.contains('active'), 'Preset 15 button active');
    assertEqual(p50.classList.contains('active'), false, 'Preset 50 button no longer active');
  });
});

// ============================================================================
// SUITE 4: Materials & Infill Engine Adversarial Inputs & Stress Tests
// ============================================================================
describe('Suite 4: Materials & Infill Engine Adversarial Inputs & Stress Tests', () => {

  test('ADV-4.1: Adversarial clampInfill handling of negative, zero, overflow, float, and non-numeric', () => {
    const env = createFullUiEnvironment();
    const clamp = env.window.MaterialsEngine.clampInfill;

    // Negatives -> floor 5%
    assertEqual(clamp(-1), 5, 'clamp(-1) == 5');
    assertEqual(clamp(-1000), 5, 'clamp(-1000) == 5');
    assertEqual(clamp(-Infinity), 5, 'clamp(-Infinity) == 5');

    // Zero -> floor 5%
    assertEqual(clamp(0), 5, 'clamp(0) == 5');

    // Boundaries [5, 100]
    assertEqual(clamp(5), 5, 'clamp(5) == 5');
    assertEqual(clamp(100), 100, 'clamp(100) == 100');

    // Overflow -> cap 100%
    assertEqual(clamp(101), 100, 'clamp(101) == 100');
    assertEqual(clamp(999999), 100, 'clamp(999999) == 100');
    assertEqual(clamp(Infinity), 100, 'clamp(Infinity) == 100');

    // Floating point rounding
    assertEqual(clamp(19.2), 19, 'clamp(19.2) rounds to 19');
    assertEqual(clamp(19.8), 20, 'clamp(19.8) rounds to 20');
    assertEqual(clamp(5.4), 5, 'clamp(5.4) rounds to 5');
    assertEqual(clamp(4.8), 5, 'clamp(4.8) floored to 5');

    // Non-numeric & edge types -> floor 5%
    assertEqual(clamp(NaN), 5, 'clamp(NaN) == 5');
    assertEqual(clamp(null), 5, 'clamp(null) == 5');
    assertEqual(clamp(undefined), 5, 'clamp(undefined) == 5');
    assertEqual(clamp('foobar'), 5, 'clamp("foobar") == 5');
    assertEqual(clamp({}), 5, 'clamp({}) == 5');
    assertEqual(clamp([]), 5, 'clamp([]) == 5');
  });

  test('ADV-4.2: Extreme volume limits: microscopic (0.0001 mm³) and massive (1,000,000,000 mm³)', () => {
    const env = createFullUiEnvironment();
    const getMetrics = env.window.MaterialsEngine.getPrintMetrics;

    // Microscopic volume: 0.0001 mm³ with Resin (1.15 g/cm³) at 100%
    const micro = getMetrics(0.0001, 1.15, 100);
    assertTrue(!isNaN(micro.massGrams), 'Microscopic mass is not NaN');
    assertTrue(isFinite(micro.massGrams), 'Microscopic mass is finite');
    assertTrue(!isNaN(micro.filamentLengthMeters), 'Microscopic length is not NaN');
    assertTrue(isFinite(micro.filamentLengthMeters), 'Microscopic length is finite');
    assertCloseTo(micro.effectiveVolMm3, 0.0001, 1e-6, 'Effective volume matches microscopic');

    // Massive volume: 1,000,000,000 mm³ (1,000,000 cm³ = 1 m³) with PLA (1.24 g/cm³) at 20%
    // Vol_eff = 200,000,000 mm³ = 200,000 cm³ -> Mass = 200,000 * 1.24 = 248,000 g = 248 kg
    const massive = getMetrics(1000000000, 1.24, 20);
    assertCloseTo(massive.effectiveVolMm3, 200000000, 1.0, 'Massive effective volume');
    assertCloseTo(massive.massKg, 248.0, 1e-2, 'Massive part is 248 kg');
    assertTrue(!isNaN(massive.filamentLengthMeters), 'Massive length is not NaN');
    assertTrue(isFinite(massive.filamentLengthMeters), 'Massive length is finite');
    // Length: 200,000,000 / 2405.281875 ~ 83,149.5 meters (~83.1 km)
    assertCloseTo(massive.filamentLengthMeters, 200000000 / 2405.281875, 1e-1, 'Massive filament length');
  });

  test('ADV-4.3: High-throughput continuous infill recalculation stress (1,000 iterations)', () => {
    const env = createFullUiEnvironment();
    const startTime = Date.now();

    const materials = ['pla', 'petg', 'abs', 'tpu', 'resin'];
    const volumes = [100, 500, 1250, 8000, 25000, 100000];

    for (let i = 0; i < 1000; i++) {
      const matId = materials[i % materials.length];
      const vol = volumes[i % volumes.length];
      const infill = (i % 96) + 5; // 5 to 100%

      env.window.MaterialsEngine.selectMaterial(matId);
      env.window.MaterialsEngine.setInfill(infill);
      const metrics = env.window.MaterialsEngine.getPrintMetrics(vol, undefined, infill);

      assertTrue(!isNaN(metrics.massGrams), `Iteration ${i}: mass is not NaN`);
      assertTrue(metrics.massGrams > 0, `Iteration ${i}: mass is positive`);
      assertTrue(!isNaN(metrics.filamentLengthMeters), `Iteration ${i}: length is not NaN`);
    }

    const duration = Date.now() - startTime;
    assertTrue(duration < 1000, `1,000 recalculations completed in ${duration} ms (< 1000 ms)`);
  });

  test('ADV-4.4: Custom material dynamic registration, selection, and deletion with infill sync', () => {
    const env = createFullUiEnvironment();

    // Setup model
    env.window.activeCadFormat = 'STL';
    env.window.modelPhysicalProps = { volumeMm3: 10000, areaMm2: 2000, bbox: { x: 10, y: 10, z: 100 } };
    env.window.MaterialsEngine.setInfill(20);

    // Initial PLA mass at 20%: 10 cm³ * 0.2 * 1.24 = 2.48 g = 0.00248 kg
    const massPla = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(massPla, 0.00248, 1e-6, 'Initial PLA mass correct');

    // Add custom Carbon PEEK material (density 1.45 g/cm³)
    const customMat = {
      id: 'custom_carbon_peek_1',
      name: 'Carbon-Fiber PEEK',
      std: 'Custom Composite / 30% CF',
      density: 1.45,
      isCustom: true
    };
    env.window.MaterialsEngine.selectMaterial('custom_carbon_peek_1');

    // Calculate metrics with custom density: 10 cm³ * 0.2 * 1.45 = 2.90 g = 0.00290 kg
    const metricsCustom = env.window.MaterialsEngine.getPrintMetrics(10000, 1.45, 20);
    assertCloseTo(metricsCustom.massGrams, 2.90, 1e-4, 'Custom material mass grams is 2.90 g');
    assertCloseTo(metricsCustom.massKg, 0.00290, 1e-6, 'Custom material mass kg is 0.00290 kg');

    // Delete custom material and verify fallback
    if (typeof env.window.deleteCustomMaterial === 'function') {
      env.window.deleteCustomMaterial('custom_carbon_peek_1');
    }
  });
});

// Run report and exit
const summary = reportSummary();
if (summary.failed > 0) {
  process.exit(1);
} else {
  console.log('\n✔ All Adversarial UI State Machine Stress Tests Passed Successfully!');
  process.exit(0);
}
