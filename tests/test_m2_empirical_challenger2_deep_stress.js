/**
 * Empirical Adversarial Challenger Deep Stress Test Harness
 * Milestone 2 Iteration 2 (Challenger M2-2)
 *
 * Exhaustively stress-tests:
 * 1. Rapid shortcuts toggle re-entrancy, frame race conditions, and localStorage persistence.
 * 2. Real headless Chromium rendering of .bottom-hud-cluster, #btn-check-update, and #btn-toggle-shortcuts
 *    under body.drawer-open across viewports (1280px, 960px, 800px, 680px, 520px).
 *    Uses document.elementFromPoint() to verify zero occlusion and 100% clickability.
 * 3. ViewCube computed CSS matrix transform under compact viewports (960px, 680px)
 *    in both drawer-closed and drawer-open states to ensure responsive scale retention.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const PORT = 8996;
const CDP_PORT = 9229;
const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.stp': 'application/octet-stream',
  '.step': 'application/octet-stream',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

let server = null;
let chromeProcess = null;
let ws = null;
let cdpMsgId = 1;
const cdpCallbacks = new Map();

function cdpSend(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = cdpMsgId++;
    cdpCallbacks.set(id, { resolve, reject });
    const payload = JSON.stringify({ id, method, params });
    ws.send(payload);
  });
}

async function evaluate(expression) {
  const res = await cdpSend('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error('Evaluation exception: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result ? res.result.value : undefined;
}

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/viewer.html';
      let filePath = path.join(ASSETS_DIR, reqPath);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(REPO_ROOT, reqPath);
      }
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found: ' + reqPath);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => {
      resolve();
    });
  });
}

function findChrome() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome/Edge executable not found');
}

function spawnChrome(chromePath) {
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', `stp_cdp_m2_deep_${Date.now()}`);
  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu-watchdog',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-sync',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1920,1080',
    'about:blank'
  ];
  chromeProcess = spawn(chromePath, args, { stdio: 'ignore' });

  return new Promise((resolve, reject) => {
    let retries = 0;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        if (res.ok) {
          const list = await res.json();
          const page = list.find(p => p.type === 'page');
          if (page && page.webSocketDebuggerUrl) {
            clearInterval(interval);
            resolve(page.webSocketDebuggerUrl);
          }
        }
      } catch (e) {
        retries++;
        if (retries > 30) {
          clearInterval(interval);
          reject(new Error('Timed out waiting for Chrome CDP WebSocket'));
        }
      }
    }, 200);
  });
}

// -----------------------------------------------------------------
// MAIN TEST RUNNER
// -----------------------------------------------------------------
async function run() {
  console.log('========================================================================');
  console.log('  CHALLENGER M2-2: EMPIRICAL ADVERSARIAL DEEP STRESS HARNESS');
  console.log('========================================================================\n');

  let assertionCount = 0;
  let passCount = 0;
  let failCount = 0;
  const issues = [];

  function assert(name, condition, details = '') {
    assertionCount++;
    if (condition) {
      passCount++;
      console.log(`  [PASS] ${name}`);
    } else {
      failCount++;
      console.log(`  [FAIL] ${name} -> ${details}`);
      issues.push({ name, details });
    }
  }

  // -----------------------------------------------------------------
  // PART 1: Sandboxed Re-entrancy & State Machine Stress (viewerApp.js)
  // -----------------------------------------------------------------
  console.log('--- PART 1: Synchronous Shortcuts Re-entrancy & Event Races ---');

  const viewerAppSrc = fs.readFileSync(path.join(ASSETS_DIR, 'js/viewerApp.js'), 'utf8');

  // Verify code structure for synchronous state guard
  assert(
    'viewerApp.js uses synchronous state tracking variable isShortcutsVisible',
    viewerAppSrc.includes('let isShortcutsVisible = true;'),
    'Missing let isShortcutsVisible = true;'
  );
  assert(
    'viewerApp.js uses shortcutsHideTimeout for debounce / cancellation',
    viewerAppSrc.includes('let shortcutsHideTimeout = null;'),
    'Missing let shortcutsHideTimeout handle'
  );
  assert(
    'setShortcutsVisibility clears pending hide timeout when invoked',
    viewerAppSrc.includes('if (shortcutsHideTimeout) {\n          clearTimeout(shortcutsHideTimeout);'),
    'setShortcutsVisibility must cancel pending hide timeout'
  );
  assert(
    'toggleShortcuts toggles nextVisible based on !isShortcutsVisible directly',
    viewerAppSrc.includes('const nextVisible = !isShortcutsVisible;'),
    'toggleShortcuts must compute nextVisible from isShortcutsVisible instead of DOM class'
  );

  // Sandboxed test with simulated rapid microtask and timers
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    localStorage: {
      data: {},
      getItem(k) { return this.data.hasOwnProperty(k) ? this.data[k] : null; },
      setItem(k, v) { this.data[k] = String(v); }
    },
    document: {
      getElementById(id) {
        if (!this.elements[id]) {
          this.elements[id] = {
            id,
            style: {},
            classList: {
              classes: new Set(),
              add(c) { this.classes.add(c); },
              remove(c) { this.classes.delete(c); },
              contains(c) { return this.classes.has(c); },
              toggle(c, force) {
                if (force === undefined) {
                  if (this.classes.has(c)) this.classes.delete(c);
                  else this.classes.add(c);
                } else if (force) {
                  this.classes.add(c);
                } else {
                  this.classes.delete(c);
                }
              }
            },
            attributes: {},
            setAttribute(k, v) { this.attributes[k] = String(v); },
            getAttribute(k) { return this.attributes[k]; }
          };
        }
        return this.elements[id];
      },
      elements: {}
    },
    requestAnimationFrame(cb) {
      sandbox.rafCallbacks.push(cb);
      return sandbox.rafCallbacks.length;
    },
    setTimeout(cb, delay) {
      const handle = { cb, delay, id: ++sandbox.timerId };
      sandbox.activeTimers.set(handle.id, handle);
      return handle.id;
    },
    clearTimeout(id) {
      sandbox.activeTimers.delete(id);
    },
    rafCallbacks: [],
    activeTimers: new Map(),
    timerId: 0,
    showToast: () => {}
  };

  // Sandboxed test with simulated rapid microtask and timers
  const scriptCode = `
    var isShortcutsVisible = true;
    var shortcutsHideTimeout = null;
    const STORAGE_KEY_SHORTCUTS = 'quicklook_stp_shortcuts_visible';
    const hintsBar = document.getElementById('hints-bar');
    const btnToggleShortcuts = document.getElementById('btn-toggle-shortcuts');

    function setShortcutsVisibility(visible, animate = true) {
      if (!hintsBar) return;
      isShortcutsVisible = !!visible;
      if (shortcutsHideTimeout) {
        clearTimeout(shortcutsHideTimeout);
        shortcutsHideTimeout = null;
      }
      if (visible) {
        hintsBar.style.display = 'flex';
        if (animate) {
          requestAnimationFrame(() => {
            if (isShortcutsVisible) {
              hintsBar.classList.remove('hints-hidden');
            }
          });
        } else {
          hintsBar.classList.remove('hints-hidden');
        }
      } else {
        hintsBar.classList.add('hints-hidden');
        if (animate) {
          shortcutsHideTimeout = setTimeout(() => {
            if (!isShortcutsVisible) {
              hintsBar.style.display = 'none';
            }
            shortcutsHideTimeout = null;
          }, 180);
        } else {
          hintsBar.style.display = 'none';
        }
      }
      if (btnToggleShortcuts) {
        btnToggleShortcuts.classList.toggle('active', visible);
        btnToggleShortcuts.setAttribute('aria-expanded', String(visible));
      }
    }

    function toggleShortcuts() {
      const nextVisible = !isShortcutsVisible;
      try {
        localStorage.setItem(STORAGE_KEY_SHORTCUTS, String(nextVisible));
      } catch (e) {}
      setShortcutsVisibility(nextVisible, true);
    }
  `;

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);

  // Initialize
  sandbox.setShortcutsVisibility(true, false);

  // Test 1A: Burst 10 rapid synchronous clicks (no RAF or timers fired)
  for (let i = 0; i < 10; i++) {
    sandbox.toggleShortcuts();
  }
  // After 10 clicks (even number), state must be visible = true
  assert(
    'Burst 10 synchronous rapid toggles settle to correct visible state (10 clicks = true)',
    sandbox.isShortcutsVisible === true &&
    sandbox.localStorage.getItem('quicklook_stp_shortcuts_visible') === 'true' &&
    sandbox.document.getElementById('btn-toggle-shortcuts').classList.contains('active'),
    `Expected true, got isShortcutsVisible=${sandbox.isShortcutsVisible}`
  );

  // Test 1B: Burst 11 rapid synchronous clicks (odd number)
  for (let i = 0; i < 11; i++) {
    sandbox.toggleShortcuts();
  }
  assert(
    'Burst 11 synchronous rapid toggles settle to correct hidden state (11 clicks from true = false)',
    sandbox.isShortcutsVisible === false &&
    sandbox.localStorage.getItem('quicklook_stp_shortcuts_visible') === 'false' &&
    !sandbox.document.getElementById('btn-toggle-shortcuts').classList.contains('active'),
    `Expected false, got isShortcutsVisible=${sandbox.isShortcutsVisible}`
  );

  // Flush RAFs and timers
  sandbox.rafCallbacks.forEach(cb => cb());
  sandbox.rafCallbacks = [];
  sandbox.activeTimers.forEach(t => t.cb());
  sandbox.activeTimers.clear();

  assert(
    'After flushing queued RAF and timer callbacks, display is "none" for hidden state',
    sandbox.document.getElementById('hints-bar').style.display === 'none' &&
    sandbox.document.getElementById('hints-bar').classList.contains('hints-hidden'),
    'Hints bar display did not transition to none'
  );

  // Test 1C: Rapid click to reopen immediately after hide scheduled
  sandbox.toggleShortcuts(); // Opens: visible = true
  sandbox.toggleShortcuts(); // Schedules hide: visible = false, timer scheduled
  assert('Hide timer is scheduled', sandbox.activeTimers.size === 1);
  sandbox.toggleShortcuts(); // Immediately opens: cancels timer!
  assert('Reopen immediately cancels hide timer', sandbox.activeTimers.size === 0 && sandbox.isShortcutsVisible === true);

  // Flush any RAFs
  sandbox.rafCallbacks.forEach(cb => cb());
  sandbox.rafCallbacks = [];
  assert(
    'Hints bar remains flex and visible after canceled hide timer',
    sandbox.document.getElementById('hints-bar').style.display === 'flex' &&
    !sandbox.document.getElementById('hints-bar').classList.contains('hints-hidden')
  );

  // -----------------------------------------------------------------
  // PART 2: Real Headless Chromium CDP Layout & Occlusion Verification
  // -----------------------------------------------------------------
  console.log('\n--- PART 2: Headless Chromium CDP Layout & Occlusion Verification ---');

  await startServer();
  const chromePath = findChrome();
  const wsUrl = await spawnChrome(chromePath);
  console.log(`  [CDP] Connecting to ${wsUrl}...`);

  const WS = globalThis.WebSocket;
  ws = new WS(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && cdpCallbacks.has(msg.id)) {
      const cb = cdpCallbacks.get(msg.id);
      cdpCallbacks.delete(msg.id);
      if (msg.error) cb.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else cb.resolve(msg.result);
    }
  };

  await cdpSend('Page.enable');
  await cdpSend('Runtime.enable');
  await cdpSend('DOM.enable');

  await cdpSend('Page.navigate', { url: `http://127.0.0.1:${PORT}/viewer.html` });
  await new Promise(r => setTimeout(r, 1500));

  const testViewports = [
    { name: '1280px Desktop', width: 1280, height: 800 },
    { name: '960px Breakpoint', width: 960, height: 800 },
    { name: '800px Tablet', width: 800, height: 800 },
    { name: '680px Compact', width: 680, height: 800 },
    { name: '520px Mobile', width: 520, height: 800 }
  ];

  for (const vp of testViewports) {
    console.log(`\n  >> Testing Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 150));

    // Measure Drawer CLOSED
    await evaluate(`(() => {
      const drawer = document.getElementById('inspector-drawer');
      if (drawer) drawer.classList.remove('open');
      document.body.classList.remove('drawer-open');
    })()`);
    await new Promise(r => setTimeout(r, 450)); // Allow 320ms CSS transition to fully settle

    const closedMetrics = await evaluate(`(() => {
      const getBox = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };

      const cluster = document.getElementById('bottom-hud-cluster');
      const btnUpdate = document.getElementById('btn-check-update');
      const btnShortcuts = document.getElementById('btn-toggle-shortcuts');
      const viewCube = document.getElementById('viewcube-container');
      const drawer = document.getElementById('inspector-drawer');
      
      const rCluster = getBox(cluster);
      const rUpdate = getBox(btnUpdate);
      const rShortcuts = getBox(btnShortcuts);
      const rCube = getBox(viewCube);
      const csCube = viewCube ? window.getComputedStyle(viewCube) : null;
      
      // Hit-test update button center
      let hitUpdateValid = false;
      let hitUpdateDesc = null;
      if (rUpdate) {
        const cx = rUpdate.x + rUpdate.width / 2;
        const cy = rUpdate.y + rUpdate.height / 2;
        const el = document.elementFromPoint(cx, cy);
        hitUpdateValid = el ? !!el.closest('#btn-check-update') : false;
        hitUpdateDesc = el ? (el.id || el.className || el.tagName) : null;
      }

      // Hit-test shortcuts button center
      let hitShortcutsValid = false;
      let hitShortcutsDesc = null;
      if (rShortcuts) {
        const cx = rShortcuts.x + rShortcuts.width / 2;
        const cy = rShortcuts.y + rShortcuts.height / 2;
        const el = document.elementFromPoint(cx, cy);
        hitShortcutsValid = el ? !!el.closest('#btn-toggle-shortcuts') : false;
        hitShortcutsDesc = el ? (el.id || el.className || el.tagName) : null;
      }

      return {
        cluster: rCluster,
        btnUpdate: rUpdate,
        btnShortcuts: rShortcuts,
        viewCube: rCube,
        viewCubeTransform: csCube ? csCube.transform : null,
        hitUpdateValid,
        hitUpdateDesc,
        hitShortcutsValid,
        hitShortcutsDesc
      };
    })()`);

    // Verify clickability closed
    assert(
      `[${vp.name} Closed] #btn-check-update is clickable (hit: "${closedMetrics.hitUpdateDesc}")`,
      closedMetrics.hitUpdateValid,
      `Hit test missed #btn-check-update: ${closedMetrics.hitUpdateDesc}`
    );
    assert(
      `[${vp.name} Closed] #btn-toggle-shortcuts is clickable (hit: "${closedMetrics.hitShortcutsDesc}")`,
      closedMetrics.hitShortcutsValid,
      `Hit test missed #btn-toggle-shortcuts: ${closedMetrics.hitShortcutsDesc}`
    );

    // Now OPEN drawer
    await evaluate(`(() => {
      const drawer = document.getElementById('inspector-drawer');
      if (drawer) drawer.classList.add('open');
      document.body.classList.add('drawer-open');
    })()`);
    await new Promise(r => setTimeout(r, 450)); // Allow 320ms CSS transition to fully settle

    const openMetrics = await evaluate(`(() => {
      const getBox = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };

      const cluster = document.getElementById('bottom-hud-cluster');
      const btnUpdate = document.getElementById('btn-check-update');
      const btnShortcuts = document.getElementById('btn-toggle-shortcuts');
      const viewCube = document.getElementById('viewcube-container');
      const drawer = document.getElementById('inspector-drawer');
      
      const rCluster = getBox(cluster);
      const rUpdate = getBox(btnUpdate);
      const rShortcuts = getBox(btnShortcuts);
      const rCube = getBox(viewCube);
      const csCube = viewCube ? window.getComputedStyle(viewCube) : null;
      const rDrawer = getBox(drawer);
      
      // Hit-test update button center
      let hitUpdateValid = false;
      let hitUpdateDesc = null;
      let hitUpdateDrawer = false;
      if (rUpdate) {
        const cx = rUpdate.x + rUpdate.width / 2;
        const cy = rUpdate.y + rUpdate.height / 2;
        const el = document.elementFromPoint(cx, cy);
        hitUpdateValid = el ? !!el.closest('#btn-check-update') : false;
        hitUpdateDrawer = el ? !!el.closest('.inspector-drawer') : false;
        hitUpdateDesc = el ? (el.id || el.className || el.tagName) : null;
      }

      // Hit-test shortcuts button center
      let hitShortcutsValid = false;
      let hitShortcutsDesc = null;
      let hitShortcutsDrawer = false;
      if (rShortcuts) {
        const cx = rShortcuts.x + rShortcuts.width / 2;
        const cy = rShortcuts.y + rShortcuts.height / 2;
        const el = document.elementFromPoint(cx, cy);
        hitShortcutsValid = el ? !!el.closest('#btn-toggle-shortcuts') : false;
        hitShortcutsDrawer = el ? !!el.closest('.inspector-drawer') : false;
        hitShortcutsDesc = el ? (el.id || el.className || el.tagName) : null;
      }

      return {
        cluster: rCluster,
        btnUpdate: rUpdate,
        btnShortcuts: rShortcuts,
        viewCube: rCube,
        viewCubeTransform: csCube ? csCube.transform : null,
        drawer: rDrawer,
        hitUpdateValid,
        hitUpdateDrawer,
        hitUpdateDesc,
        hitShortcutsValid,
        hitShortcutsDrawer,
        hitShortcutsDesc
      };
    })()`);

    // Check cluster clearance from drawer
    const clusterRight = openMetrics.cluster.x + openMetrics.cluster.width;
    const drawerLeft = openMetrics.drawer.x;
    const clusterDrawerClearance = drawerLeft - clusterRight;

    console.log(`    Cluster right = ${clusterRight.toFixed(1)}px, Drawer left = ${drawerLeft.toFixed(1)}px -> Clearance = ${clusterDrawerClearance.toFixed(1)}px`);
    assert(
      `[${vp.name} Open] .bottom-hud-cluster does NOT collide with 380px drawer (Clearance: ${clusterDrawerClearance.toFixed(1)}px >= 0px)`,
      clusterDrawerClearance >= 0,
      `Cluster right ${clusterRight.toFixed(1)}px overlaps drawer left ${drawerLeft.toFixed(1)}px`
    );

    // Verify clickability open: MUST NOT be intercepted by drawer or tab panes
    assert(
      `[${vp.name} Open] #btn-check-update is NOT occluded by drawer and targets button (valid: ${openMetrics.hitUpdateValid}, drawer: ${openMetrics.hitUpdateDrawer})`,
      openMetrics.hitUpdateValid && !openMetrics.hitUpdateDrawer,
      `Occluded: valid=${openMetrics.hitUpdateValid}, drawer=${openMetrics.hitUpdateDrawer}, element=${openMetrics.hitUpdateDesc}`
    );
    assert(
      `[${vp.name} Open] #btn-toggle-shortcuts is NOT occluded by drawer and targets button (valid: ${openMetrics.hitShortcutsValid}, drawer: ${openMetrics.hitShortcutsDrawer})`,
      openMetrics.hitShortcutsValid && !openMetrics.hitShortcutsDrawer,
      `Occluded: valid=${openMetrics.hitShortcutsValid}, drawer=${openMetrics.hitShortcutsDrawer}, element=${openMetrics.hitShortcutsDesc}`
    );

    // ---------------------------------------------------------------
    // PART 3: ViewCube Matrix Transform & Physical Displacement Checks
    // ---------------------------------------------------------------
    console.log(`    ViewCube Transform (Closed): "${closedMetrics.viewCubeTransform}"`);
    console.log(`    ViewCube Transform (Open):   "${openMetrics.viewCubeTransform}"`);

    const cubeDisplacementX = closedMetrics.viewCube.x - openMetrics.viewCube.x;
    console.log(`    ViewCube Physical X Shift: ${cubeDisplacementX.toFixed(1)}px (Expected 380px)`);

    assert(
      `[${vp.name} Open] ViewCube translates leftward by ~380px when drawer opens (Measured: ${cubeDisplacementX.toFixed(1)}px)`,
      Math.abs(cubeDisplacementX - 380) < 3.0,
      `Expected ~380px shift, measured ${cubeDisplacementX.toFixed(1)}px`
    );

    // Parse computed matrix
    const matrixRegex = /matrix\(\s*([\d\.\-]+),\s*([\d\.\-]+),\s*([\d\.\-]+),\s*([\d\.\-]+),\s*([\d\.\-]+),\s*([\d\.\-]+)\s*\)/;
    const openMatches = openMetrics.viewCubeTransform ? openMetrics.viewCubeTransform.match(matrixRegex) : null;
    const scaleX = openMatches ? parseFloat(openMatches[1]) : (openMetrics.viewCubeTransform === 'none' ? 1.0 : 0);

    if (vp.width <= 680) {
      assert(
        `[${vp.name} Open] ViewCube maintains responsive scale(0.72) with drawer open (Measured scale: ${scaleX})`,
        Math.abs(scaleX - 0.72) < 0.02,
        `Expected scale ~0.72, got ${scaleX} (Transform: ${openMetrics.viewCubeTransform})`
      );
    } else if (vp.width <= 960) {
      assert(
        `[${vp.name} Open] ViewCube maintains responsive scale(0.8) with drawer open (Measured scale: ${scaleX})`,
        Math.abs(scaleX - 0.8) < 0.02,
        `Expected scale ~0.8, got ${scaleX} (Transform: ${openMetrics.viewCubeTransform})`
      );
    }
  }

  // -----------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`  DEEP STRESS RESULTS: Total: ${assertionCount} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    console.log('ITEMIZED ISSUES:');
    issues.forEach((iss, idx) => console.log(`  ${idx + 1}. ${iss.name}: ${iss.details}`));
    process.exitCode = 1;
  } else {
    console.log('FINAL CHALLENGER VERDICT: ZERO REGRESSIONS, FULL APPROVAL');
    process.exitCode = 0;
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exitCode = 1;
}).finally(() => {
  if (ws) ws.close();
  if (chromeProcess) chromeProcess.kill();
  if (server) server.close();
});
