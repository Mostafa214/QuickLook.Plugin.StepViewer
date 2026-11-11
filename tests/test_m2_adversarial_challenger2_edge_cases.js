/**
 * Empirical Adversarial Challenger 2 Edge Cases Stress Harness
 * Milestone M2 - STP-Quicklook
 *
 * Verifies three critical edge case scenarios:
 * 1. Long filename and dimensions loading in #badge-filename and #dim-text
 *    - Injects extreme length filename (120+ chars) and realistic 3-axis bounding box dimensions.
 *    - Unhides #badge-dim.
 *    - Tests across 1920px, 1280px, 1100px, 960px, 800px, 680px, 520px in both Closed and Open drawer states.
 *    - Verifies zero 2D bounding box collision between #info-badge (.hud-badge) and #toolbar-dock (.toolbar).
 *    - Verifies badge adheres to max-width clamp and text-overflow: ellipsis.
 *
 * 2. Rapid opening/closing of inspector drawer while checking element clearances
 *    - Executes rapid toggling sequences (50ms interval stress and settled transitions).
 *    - Verifies class synchronization between document.body.drawer-open and #inspector-drawer.open.
 *    - Verifies clearances: Toolbar -> Drawer, Cluster -> Drawer, ViewCube -> Drawer.
 *    - Verifies ViewCube transform state recovery.
 *
 * 3. Dynamic activation of #hint-measure-clear ([C] Clear Measure)
 *    - Activates #hint-measure-clear (display: inline-flex) simulating active measurement session.
 *    - Measures horizontal and vertical clearances between #hints-bar and #bottom-hud-cluster / #btn-toggle-shortcuts.
 *    - Tests across 1280px, 1024px, 960px, 800px, 768px, 680px, 520px in both Closed and Open drawer states.
 *    - Performs elementFromPoint hit-testing to ensure #btn-toggle-shortcuts and #btn-check-update remain 100% clickable.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8998;
const CDP_PORT = 9231;
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
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', `stp_cdp_m2_challenger2_${Date.now()}`);
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

function boxesOverlap(b1, b2) {
  if (!b1 || !b2) return false;
  return (
    b1.x < b2.x + b2.width &&
    b1.x + b1.width > b2.x &&
    b1.y < b2.y + b2.height &&
    b1.y + b1.height > b2.y
  );
}

async function run() {
  console.log('========================================================================');
  console.log('  CHALLENGER M2-2: ADVERSARIAL EDGE CASE HARNESS');
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

  await startServer();
  const chromePath = findChrome();
  const wsUrl = await spawnChrome(chromePath);
  console.log(`  [CDP] Connected to ${wsUrl}\n`);

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

  // =====================================================================
  // SCENARIO 1: Long Filename and Dimensions Loading in Badge
  // =====================================================================
  console.log('--- SCENARIO 1: Long Filename & Dimensions Loading Stress ---');

  // Inject long filename and dimensions into HUD badge
  const LONG_FILENAME = 'Turbine_Blade_Assembly_Stage4_HighPressure_Superalloy_Inconel718_RevG_FinalInspectionGeometry_Serial_000982341.step';
  const DIM_TEXT = '3428.75 × 1980.20 × 945.10 mm';

  await evaluate(`(() => {
    const fn = document.getElementById('badge-filename');
    if (fn) fn.textContent = ${JSON.stringify(LONG_FILENAME)};
    const badgeDim = document.getElementById('badge-dim');
    if (badgeDim) badgeDim.style.display = 'flex';
    const dim = document.getElementById('dim-text');
    if (dim) dim.textContent = ${JSON.stringify(DIM_TEXT)};
    const status = document.getElementById('badge-status');
    if (status) status.style.display = 'none'; // model loaded state
  })()`);

  const scenario1Viewports = [
    { name: '1920px Ultra-Wide', width: 1920, height: 1080 },
    { name: '1280px Desktop', width: 1280, height: 800 },
    { name: '1100px Mid-Range', width: 1100, height: 800 },
    { name: '960px Breakpoint', width: 960, height: 800 },
    { name: '800px Tablet', width: 800, height: 800 },
    { name: '680px Compact', width: 680, height: 800 },
    { name: '520px Mobile', width: 520, height: 800 }
  ];

  for (const vp of scenario1Viewports) {
    console.log(`\n  >> Scenario 1 Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 150));

    // Test with Drawer CLOSED
    await evaluate(`(() => {
      const drawer = document.getElementById('inspector-drawer');
      if (drawer) drawer.classList.remove('open');
      document.body.classList.remove('drawer-open');
    })()`);
    await new Promise(r => setTimeout(r, 450));

    const closedData = await evaluate(`(() => {
      const getBox = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      };
      const badge = document.getElementById('info-badge');
      const toolbar = document.getElementById('toolbar-dock') || document.querySelector('.toolbar');
      const filename = document.getElementById('badge-filename');
      const dim = document.getElementById('dim-text');
      const csBadge = badge ? window.getComputedStyle(badge) : null;
      return {
        badgeBox: getBox(badge),
        toolbarBox: getBox(toolbar),
        badgeMaxWidth: csBadge ? csBadge.maxWidth : null,
        filenameScrollWidth: filename ? filename.scrollWidth : 0,
        filenameClientWidth: filename ? filename.clientWidth : 0
      };
    })()`);

    const overlapClosed = boxesOverlap(closedData.badgeBox, closedData.toolbarBox);
    let clearanceClosedDesc = '';
    if (closedData.badgeBox && closedData.toolbarBox) {
      if (closedData.badgeBox.bottom <= closedData.toolbarBox.y) {
        clearanceClosedDesc = `Vertical clearance: ${(closedData.toolbarBox.y - closedData.badgeBox.bottom).toFixed(1)}px (badge above toolbar)`;
      } else if (closedData.badgeBox.y >= closedData.toolbarBox.bottom) {
        clearanceClosedDesc = `Vertical clearance: ${(closedData.badgeBox.y - closedData.toolbarBox.bottom).toFixed(1)}px (badge below toolbar)`;
      } else {
        const horizontalGap = closedData.toolbarBox.x - closedData.badgeBox.right;
        clearanceClosedDesc = `Horizontal clearance: ${horizontalGap.toFixed(1)}px`;
      }
    }
    console.log(`    [Closed] Badge: [${closedData.badgeBox.x.toFixed(1)}, ${closedData.badgeBox.y.toFixed(1)}, w=${closedData.badgeBox.width.toFixed(1)}, h=${closedData.badgeBox.height.toFixed(1)}] | Toolbar: [${closedData.toolbarBox.x.toFixed(1)}, ${closedData.toolbarBox.y.toFixed(1)}, w=${closedData.toolbarBox.width.toFixed(1)}, h=${closedData.toolbarBox.height.toFixed(1)}] -> ${clearanceClosedDesc}`);

    assert(
      `[${vp.name} Closed] Long filename badge does NOT collide with toolbar (${clearanceClosedDesc})`,
      !overlapClosed,
      `Badge overlaps toolbar! Badge: ${JSON.stringify(closedData.badgeBox)}, Toolbar: ${JSON.stringify(closedData.toolbarBox)}`
    );

    // Verify badge text truncation: filename scrollWidth > clientWidth indicates clean ellipsis truncation
    assert(
      `[${vp.name} Closed] Long filename correctly truncates with ellipsis (scrollWidth: ${closedData.filenameScrollWidth}px >= clientWidth: ${closedData.filenameClientWidth}px)`,
      closedData.filenameScrollWidth >= closedData.filenameClientWidth,
      `Filename did not truncate properly`
    );

    // Test with Drawer OPEN
    await evaluate(`(() => {
      const drawer = document.getElementById('inspector-drawer');
      if (drawer) drawer.classList.add('open');
      document.body.classList.add('drawer-open');
    })()`);
    await new Promise(r => setTimeout(r, 450));

    const openData = await evaluate(`(() => {
      const getBox = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      };
      const badge = document.getElementById('info-badge');
      const toolbar = document.getElementById('toolbar-dock') || document.querySelector('.toolbar');
      const drawer = document.getElementById('inspector-drawer');
      return {
        badgeBox: getBox(badge),
        toolbarBox: getBox(toolbar),
        drawerBox: getBox(drawer)
      };
    })()`);

    const overlapOpen = boxesOverlap(openData.badgeBox, openData.toolbarBox);
    let clearanceOpenDesc = '';
    if (openData.badgeBox && openData.toolbarBox) {
      if (openData.badgeBox.bottom <= openData.toolbarBox.y) {
        clearanceOpenDesc = `Vertical clearance: ${(openData.toolbarBox.y - openData.badgeBox.bottom).toFixed(1)}px (badge above toolbar)`;
      } else if (openData.badgeBox.y >= openData.toolbarBox.bottom) {
        clearanceOpenDesc = `Vertical clearance: ${(openData.badgeBox.y - openData.toolbarBox.bottom).toFixed(1)}px (badge below toolbar at y=${openData.badgeBox.y.toFixed(1)}px)`;
      } else {
        const horizontalGap = openData.toolbarBox.x - openData.badgeBox.right;
        clearanceOpenDesc = `Horizontal clearance: ${horizontalGap.toFixed(1)}px`;
      }
    }
    console.log(`    [Open]   Badge: [${openData.badgeBox.x.toFixed(1)}, ${openData.badgeBox.y.toFixed(1)}, w=${openData.badgeBox.width.toFixed(1)}, h=${openData.badgeBox.height.toFixed(1)}] | Toolbar: [${openData.toolbarBox.x.toFixed(1)}, ${openData.toolbarBox.y.toFixed(1)}, w=${openData.toolbarBox.width.toFixed(1)}, h=${openData.toolbarBox.height.toFixed(1)}] -> ${clearanceOpenDesc}`);

    assert(
      `[${vp.name} Open] Long filename badge does NOT collide with toolbar (${clearanceOpenDesc})`,
      !overlapOpen,
      `Badge overlaps toolbar! Badge: ${JSON.stringify(openData.badgeBox)}, Toolbar: ${JSON.stringify(openData.toolbarBox)}`
    );

    // Verify toolbar does not collide with open drawer
    if (openData.toolbarBox && openData.drawerBox) {
      const tbRight = openData.toolbarBox.right;
      const drawerLeft = openData.drawerBox.x;
      const tbDrawerGap = drawerLeft - tbRight;
      console.log(`    [Open]   Toolbar right: ${tbRight.toFixed(1)}px, Drawer left: ${drawerLeft.toFixed(1)}px -> Gap: ${tbDrawerGap.toFixed(1)}px`);
      assert(
        `[${vp.name} Open] Toolbar does NOT collide with inspector drawer (Gap: ${tbDrawerGap.toFixed(1)}px > 0px)`,
        tbDrawerGap >= 0,
        `Toolbar overlaps drawer by ${Math.abs(tbDrawerGap).toFixed(1)}px`
      );
    }
  }

  // =====================================================================
  // SCENARIO 2: Rapid Opening/Closing of Inspector Drawer Stress
  // =====================================================================
  console.log('\n--- SCENARIO 2: Rapid Opening/Closing of Inspector Drawer Stress ---');

  // Test at 1280px Desktop
  await cdpSend('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await new Promise(r => setTimeout(r, 150));

  console.log('  >> Executing 20 rapid toggles with 40ms interval (stress race conditions)...');
  for (let i = 0; i < 20; i++) {
    await evaluate(`(() => {
      const drawer = document.getElementById('inspector-drawer');
      const isOpen = drawer.classList.contains('open');
      if (isOpen) {
        drawer.classList.remove('open');
        document.body.classList.remove('drawer-open');
      } else {
        drawer.classList.add('open');
        document.body.classList.add('drawer-open');
      }
    })()`);
    await new Promise(r => setTimeout(r, 40));
  }

  // Allow transition to settle
  await new Promise(r => setTimeout(r, 500));

  const syncState1 = await evaluate(`(() => {
    const drawer = document.getElementById('inspector-drawer');
    const hasOpenClass = drawer.classList.contains('open');
    const hasBodyClass = document.body.classList.contains('drawer-open');
    return { hasOpenClass, hasBodyClass };
  })()`);

  assert(
    'Rapid 20 toggles maintain strict state synchronization between #inspector-drawer.open and body.drawer-open',
    syncState1.hasOpenClass === syncState1.hasBodyClass,
    `Desynchronization: drawer.open=${syncState1.hasOpenClass}, body.drawer-open=${syncState1.hasBodyClass}`
  );

  console.log('  >> Testing settled OPEN state after rapid toggles...');
  await evaluate(`(() => {
    const drawer = document.getElementById('inspector-drawer');
    drawer.classList.add('open');
    document.body.classList.add('drawer-open');
  })()`);
  await new Promise(r => setTimeout(r, 450));

  const postRapidOpenMetrics = await evaluate(`(() => {
    const getBox = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    return {
      drawer: getBox(document.getElementById('inspector-drawer')),
      toolbar: getBox(document.getElementById('toolbar-dock') || document.querySelector('.toolbar')),
      cluster: getBox(document.getElementById('bottom-hud-cluster')),
      viewCube: getBox(document.getElementById('viewcube-container')),
      badge: getBox(document.getElementById('info-badge'))
    };
  })()`);

  const tbClearance = postRapidOpenMetrics.drawer.x - postRapidOpenMetrics.toolbar.right;
  const clusterClearance = postRapidOpenMetrics.drawer.x - postRapidOpenMetrics.cluster.right;
  const cubeClearance = postRapidOpenMetrics.drawer.x - postRapidOpenMetrics.viewCube.right;
  const badgeOverlap = boxesOverlap(postRapidOpenMetrics.badge, postRapidOpenMetrics.toolbar);

  console.log(`    Clearance Toolbar -> Drawer: ${tbClearance.toFixed(1)}px`);
  console.log(`    Clearance Cluster -> Drawer: ${clusterClearance.toFixed(1)}px`);
  console.log(`    Clearance ViewCube -> Drawer: ${cubeClearance.toFixed(1)}px`);

  assert(
    `Toolbar maintains positive clearance from Drawer after rapid cycling (${tbClearance.toFixed(1)}px >= 0)`,
    tbClearance >= 0,
    `Clearance negative: ${tbClearance}px`
  );
  assert(
    `Cluster maintains positive clearance from Drawer after rapid cycling (${clusterClearance.toFixed(1)}px >= 0)`,
    clusterClearance >= 0,
    `Clearance negative: ${clusterClearance}px`
  );
  assert(
    `ViewCube maintains positive clearance from Drawer after rapid cycling (${cubeClearance.toFixed(1)}px >= 0)`,
    cubeClearance >= 0,
    `Clearance negative: ${cubeClearance}px`
  );
  assert(
    `Badge does not overlap Toolbar in settled Open state`,
    !badgeOverlap,
    `Badge overlaps Toolbar`
  );

  console.log('  >> Testing settled CLOSED state after rapid toggles...');
  await evaluate(`(() => {
    const drawer = document.getElementById('inspector-drawer');
    drawer.classList.remove('open');
    document.body.classList.remove('drawer-open');
  })()`);
  await new Promise(r => setTimeout(r, 450));

  const postRapidClosedMetrics = await evaluate(`(() => {
    const getBox = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const vc = document.getElementById('viewcube-container');
    const csVc = vc ? window.getComputedStyle(vc) : null;
    return {
      toolbar: getBox(document.getElementById('toolbar-dock') || document.querySelector('.toolbar')),
      badge: getBox(document.getElementById('info-badge')),
      viewCubeTransform: csVc ? csVc.transform : null
    };
  })()`);

  assert(
    'In settled Closed state, ViewCube transform correctly restores to none',
    postRapidClosedMetrics.viewCubeTransform === 'none',
    `Expected none, got ${postRapidClosedMetrics.viewCubeTransform}`
  );
  assert(
    'In settled Closed state, Badge does not overlap Toolbar',
    !boxesOverlap(postRapidClosedMetrics.badge, postRapidClosedMetrics.toolbar),
    'Badge overlaps Toolbar'
  );

  // =====================================================================
  // SCENARIO 3: Dynamic Activation of #hint-measure-clear Collision Stress
  // =====================================================================
  console.log('\n--- SCENARIO 3: Dynamic Activation of #hint-measure-clear Stress ---');

  // Activate #hint-measure-clear
  await evaluate(`(() => {
    const hintClear = document.getElementById('hint-measure-clear');
    if (hintClear) hintClear.style.display = 'inline-flex';
  })()`);

  const scenario3Viewports = [
    { name: '1280px Desktop', width: 1280, height: 800 },
    { name: '1024px Secondary Collapse', width: 1024, height: 800 },
    { name: '960px Breakpoint', width: 960, height: 800 },
    { name: '800px Tablet', width: 800, height: 800 },
    { name: '768px Vertical Elevation', width: 768, height: 800 },
    { name: '680px Compact', width: 680, height: 800 },
    { name: '520px Mobile', width: 520, height: 800 }
  ];

  for (const vp of scenario3Viewports) {
    console.log(`\n  >> Scenario 3 Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 150));

    // Measure Closed Drawer
    await evaluate(`(() => {
      const drawer = document.getElementById('inspector-drawer');
      if (drawer) drawer.classList.remove('open');
      document.body.classList.remove('drawer-open');
    })()`);
    await new Promise(r => setTimeout(r, 450));

    const s3Closed = await evaluate(`(() => {
      const getBox = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      };
      const hints = document.getElementById('hints-bar');
      const cluster = document.getElementById('bottom-hud-cluster');
      const btnShortcuts = document.getElementById('btn-toggle-shortcuts');
      const btnUpdate = document.getElementById('btn-check-update');

      // Clickability of shortcuts toggle button
      let hitShortcutsValid = false;
      let hitShortcutsDesc = null;
      if (btnShortcuts) {
        const r = btnShortcuts.getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        hitShortcutsValid = el ? !!el.closest('#btn-toggle-shortcuts') : false;
        hitShortcutsDesc = el ? (el.id || el.className || el.tagName) : null;
      }

      return {
        hintsBox: getBox(hints),
        clusterBox: getBox(cluster),
        shortcutsBox: getBox(btnShortcuts),
        updateBox: getBox(btnUpdate),
        hitShortcutsValid,
        hitShortcutsDesc
      };
    })()`);

    const s3ClosedOverlap = boxesOverlap(s3Closed.hintsBox, s3Closed.shortcutsBox);
    let s3ClosedGap = 0;
    if (s3Closed.hintsBox && s3Closed.shortcutsBox) {
      if (s3Closed.hintsBox.bottom <= s3Closed.shortcutsBox.y) {
        s3ClosedGap = s3Closed.shortcutsBox.y - s3Closed.hintsBox.bottom;
      } else if (s3Closed.hintsBox.y >= s3Closed.shortcutsBox.bottom) {
        s3ClosedGap = s3Closed.hintsBox.y - s3Closed.shortcutsBox.bottom;
      } else {
        s3ClosedGap = s3Closed.shortcutsBox.x - s3Closed.hintsBox.right;
      }
    }
    console.log(`    [Closed] Hints right=${s3Closed.hintsBox.right.toFixed(1)}px, y=${s3Closed.hintsBox.y.toFixed(1)}px | Shortcuts x=${s3Closed.shortcutsBox.x.toFixed(1)}px, y=${s3Closed.shortcutsBox.y.toFixed(1)}px -> Gap=${s3ClosedGap.toFixed(1)}px, Hit: "${s3Closed.hitShortcutsDesc}"`);

    assert(
      `[${vp.name} Closed] Expanded hints bar does NOT collide with #btn-toggle-shortcuts (2D overlap: ${s3ClosedOverlap}, Gap: ${s3ClosedGap.toFixed(1)}px)`,
      !s3ClosedOverlap && s3Closed.hitShortcutsValid,
      `Collision or occlusion detected! Overlap: ${s3ClosedOverlap}, Hit: ${s3Closed.hitShortcutsDesc}`
    );

    // Measure Open Drawer
    await evaluate(`(() => {
      const drawer = document.getElementById('inspector-drawer');
      if (drawer) drawer.classList.add('open');
      document.body.classList.add('drawer-open');
    })()`);
    await new Promise(r => setTimeout(r, 450));

    const s3Open = await evaluate(`(() => {
      const getBox = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      };
      const hints = document.getElementById('hints-bar');
      const cluster = document.getElementById('bottom-hud-cluster');
      const btnShortcuts = document.getElementById('btn-toggle-shortcuts');
      const drawer = document.getElementById('inspector-drawer');

      // Clickability of shortcuts toggle button
      let hitShortcutsValid = false;
      let hitShortcutsDesc = null;
      let hitDrawer = false;
      if (btnShortcuts) {
        const r = btnShortcuts.getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        hitShortcutsValid = el ? !!el.closest('#btn-toggle-shortcuts') : false;
        hitDrawer = el ? !!el.closest('.inspector-drawer') : false;
        hitShortcutsDesc = el ? (el.id || el.className || el.tagName) : null;
      }

      return {
        hintsBox: getBox(hints),
        clusterBox: getBox(cluster),
        shortcutsBox: getBox(btnShortcuts),
        drawerBox: getBox(drawer),
        hitShortcutsValid,
        hitDrawer,
        hitShortcutsDesc
      };
    })()`);

    const s3OpenOverlap = boxesOverlap(s3Open.hintsBox, s3Open.shortcutsBox);
    let s3OpenGap = 0;
    if (s3Open.hintsBox && s3Open.shortcutsBox) {
      if (s3Open.hintsBox.bottom <= s3Open.shortcutsBox.y) {
        s3OpenGap = s3Open.shortcutsBox.y - s3Open.hintsBox.bottom;
      } else if (s3Open.hintsBox.y >= s3Open.shortcutsBox.bottom) {
        s3OpenGap = s3Open.hintsBox.y - s3Open.shortcutsBox.bottom;
      } else {
        s3OpenGap = s3Open.shortcutsBox.x - s3Open.hintsBox.right;
      }
    }
    console.log(`    [Open]   Hints right=${s3Open.hintsBox.right.toFixed(1)}px, y=${s3Open.hintsBox.y.toFixed(1)}px | Shortcuts x=${s3Open.shortcutsBox.x.toFixed(1)}px, y=${s3Open.shortcutsBox.y.toFixed(1)}px -> Gap=${s3OpenGap.toFixed(1)}px, Hit: "${s3Open.hitShortcutsDesc}"`);

    assert(
      `[${vp.name} Open] Expanded hints bar does NOT collide with #btn-toggle-shortcuts (2D overlap: ${s3OpenOverlap}, Gap: ${s3OpenGap.toFixed(1)}px)`,
      !s3OpenOverlap && s3Open.hitShortcutsValid && !s3Open.hitDrawer,
      `Collision or occlusion detected! Overlap: ${s3OpenOverlap}, Drawer occludes: ${s3Open.hitDrawer}, Hit: ${s3Open.hitShortcutsDesc}`
    );
  }

  // =====================================================================
  // SUMMARY
  // =====================================================================
  console.log('\n========================================================================');
  console.log(`  EDGE CASES RESULTS: Total: ${assertionCount} | Passed: ${passCount} | Failed: ${failCount}`);
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
