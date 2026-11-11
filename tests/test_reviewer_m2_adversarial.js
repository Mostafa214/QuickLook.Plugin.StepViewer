/**
 * Reviewer 2 Adversarial Stress Test: Milestone M2
 * Deep probe across 680px, 960px, 1280px:
 * 1. Top HUD metadata badge non-collision with top dock toolbar (both drawer states, long filenames)
 * 2. All 6 inspector drawer tabs non-truncation, non-clipping, air-gap to [X] close button
 * 3. Bottom shortcuts hints bar clearance against shortcuts toggle button & update pill
 * 4. Integrity check: no hardcoded mock facades, genuine DOM layout & CSS cascade
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8998;
const CDP_PORT = 9232;
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
    ws.send(JSON.stringify({ id, method, params }));
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
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', resolve);
  });
}

function spawnChrome() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', `cdp_m2_rev2_${Date.now()}`);
  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu-watchdog',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
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
          reject(new Error('Timed out waiting for Chrome CDP'));
        }
      }
    }, 200);
  });
}

async function run() {
  let passedAssertions = 0;
  let failedAssertions = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedAssertions++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failedAssertions++;
    }
  }

  try {
    await startServer();
    const wsUrl = await spawnChrome();
    const WS = globalThis.WebSocket || require('ws');
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
        if (msg.error) cb.reject(new Error(msg.error.message));
        else cb.resolve(msg.result);
      }
    };

    await cdpSend('Page.enable');
    await cdpSend('DOM.enable');
    await cdpSend('Runtime.enable');
    await cdpSend('Page.navigate', { url: `http://127.0.0.1:${PORT}/viewer.html` });
    await new Promise(r => setTimeout(r, 1500));

    console.log('\n================================================================');
    console.log('  REVIEWER 2 ADVERSARIAL STRESS TEST: MILESTONE M2');
    console.log('================================================================\n');

    // -------------------------------------------------------------
    // TEST 1: TOP HUD BADGE NON-COLLISION WITH TOOLBAR ACROSS VIEWPORTS
    // -------------------------------------------------------------
    console.log('--- TEST 1: Top HUD Badge vs Toolbar Collision Probing ---');

    // Stress test: Inject extremely long model name into badge
    await evaluate(`(() => {
      const title = document.getElementById('badge-filename');
      if (title) title.textContent = 'A_VERY_LONG_ENTERPRISE_AEROSPACE_ASSEMBLY_COMPONENT_REVISION_99_FINAL_APPROVED.STEP';
      const dim = document.getElementById('badge-dim');
      if (dim) { dim.style.display = 'block'; dim.textContent = '1234.5 x 6789.0 x 4321.0 mm'; }
    })()`);

    const testViewports = [1280, 960, 680];

    for (const w of testViewports) {
      await cdpSend('Emulation.setDeviceMetricsOverride', { width: w, height: 750, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 150));

      // 1.1 Drawer CLOSED
      await evaluate('WorkbenchUI.closeDrawer();');
      await new Promise(r => setTimeout(r, 200));

      let closedProbe = await evaluate(`(() => {
        const toBox = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
        };
        const badge = toBox(document.querySelector('.hud-badge'));
        const tb = toBox(document.querySelector('.toolbar'));
        const topCollision = !(badge.right <= tb.left || badge.left >= tb.right || badge.bottom <= tb.top || badge.top >= tb.bottom);
        return { badge, tb, topCollision };
      })()`);

      assert(!closedProbe.topCollision, `[${w}px Closed] Long filename badge does NOT collide with toolbar (Badge right=${closedProbe.badge.right.toFixed(1)}, TB left=${closedProbe.tb.left.toFixed(1)})`);

      // 1.2 Drawer OPEN
      await evaluate('WorkbenchUI.openDrawer("tree");');
      await new Promise(r => setTimeout(r, 400));

      let openProbe = await evaluate(`(() => {
        const toBox = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
        };
        const badge = toBox(document.querySelector('.hud-badge'));
        const tb = toBox(document.querySelector('.toolbar'));
        const topCollision = !(badge.right <= tb.left || badge.left >= tb.right || badge.bottom <= tb.top || badge.top >= tb.bottom);
        return { badge, tb, topCollision };
      })()`);

      if (openProbe.topCollision) {
        console.error(`    -> Collision details at ${w}px Open:`);
        console.error(`       Badge: left=${openProbe.badge.left.toFixed(1)}, right=${openProbe.badge.right.toFixed(1)}, top=${openProbe.badge.top.toFixed(1)}, bottom=${openProbe.badge.bottom.toFixed(1)}`);
        console.error(`       Toolbar: left=${openProbe.tb.left.toFixed(1)}, right=${openProbe.tb.right.toFixed(1)}, top=${openProbe.tb.top.toFixed(1)}, bottom=${openProbe.tb.bottom.toFixed(1)}`);
        console.error(`       Vertical Overlap: Badge top (${openProbe.badge.top.toFixed(1)}) < Toolbar bottom (${openProbe.tb.bottom.toFixed(1)})`);
        console.error(`       Horizontal Overlap: [${Math.max(openProbe.badge.left, openProbe.tb.left).toFixed(1)}, ${Math.min(openProbe.badge.right, openProbe.tb.right).toFixed(1)}]`);
      }
      assert(!openProbe.topCollision, `[${w}px Open] Badge does NOT collide with toolbar when drawer shifts toolbar (Badge y=${openProbe.badge.y.toFixed(1)}, TB bottom=${openProbe.tb.bottom.toFixed(1)})`);
    }

    // -------------------------------------------------------------
    // TEST 2: INSPECTOR DRAWER TABS NON-TRUNCATION ACROSS ALL 6 TABS
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Inspector Drawer Tabs Text Non-Truncation & Air-Gap ---');
    const tabs = ['tree', 'measure', 'section', 'mass', 'analysis', 'export'];

    for (const activeTab of tabs) {
      await evaluate(`WorkbenchUI.switchDrawerTab('${activeTab}');`);
      await new Promise(r => setTimeout(r, 100));

      const tabsProbe = await evaluate(`(() => {
        const toBox = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
        };
        const header = toBox(document.querySelector('.drawer-header'));
        const container = document.querySelector('.drawer-tabs');
        const cRect = toBox(container);
        const closeBtn = toBox(document.querySelector('.drawer-close-btn'));
        const tabList = Array.from(document.querySelectorAll('.drawer-tab')).map(t => {
          const r = toBox(t);
          const span = t.querySelector('span');
          const spanRect = span ? toBox(span) : null;
          return {
            name: t.dataset.tab,
            active: t.classList.contains('active'),
            x: r.x, y: r.y, w: r.width, h: r.height, right: r.right,
            spanW: spanRect ? spanRect.width : 0,
            text: span ? span.textContent.trim() : '',
            // Tab must be completely inside the drawer header boundary
            insideHeader: (r.right <= closeBtn.left && r.left >= header.left),
            // Text span must not be truncated (scrollWidth should equal clientWidth)
            spanNotClipped: span ? (span.scrollWidth <= span.clientWidth + 1) : true
          };
        });
        return {
          scrollLeft: container.scrollLeft,
          airGap: closeBtn.left - cRect.right,
          tabList
        };
      })()`);

      assert(tabsProbe.scrollLeft === 0, `[Active: ${activeTab}] Tabs container scrollLeft is 0 (no horizontal displacement hiding tabs)`);
      assert(tabsProbe.airGap >= 8, `[Active: ${activeTab}] Air gap to [X] close button is >= 8px (Actual: ${tabsProbe.airGap.toFixed(1)}px)`);

      let allTabsFullyReadable = true;
      for (const t of tabsProbe.tabList) {
        if (!t.insideHeader || !t.spanNotClipped) {
          allTabsFullyReadable = false;
          console.error(`    -> Tab [${t.name}] clipped or truncated! insideHeader=${t.insideHeader}, spanNotClipped=${t.spanNotClipped}`);
        }
      }
      assert(allTabsFullyReadable, `[Active: ${activeTab}] All 6 tabs ('Tree', 'Measure', 'Section', 'Mass', 'Analysis', 'Export') fully readable without clipping`);
    }

    // -------------------------------------------------------------
    // TEST 3: BOTTOM SHORTCUTS HINTS BAR CLEARANCE & CLUSTER SEPARATION
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Bottom Shortcuts Hints Bar vs Toggle & Update Pill ---');

    for (const w of testViewports) {
      await cdpSend('Emulation.setDeviceMetricsOverride', { width: w, height: 750, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 150));

      // 3.1 Closed state
      await evaluate('WorkbenchUI.closeDrawer();');
      await new Promise(r => setTimeout(r, 150));

      let bottomProbeClosed = await evaluate(`(() => {
        const toBox = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
        };
        const hints = toBox(document.querySelector('#hints-bar'));
        const cluster = toBox(document.querySelector('#bottom-hud-cluster'));
        const updateBtn = toBox(document.querySelector('#btn-check-update'));
        const toggleBtn = toBox(document.querySelector('#btn-toggle-shortcuts'));
        const hintsComputed = window.getComputedStyle(document.querySelector('#hints-bar'));
        
        // Check collision between hints bar and bottom-hud-cluster
        const collides = !(hints.right <= cluster.left || hints.left >= cluster.right || hints.bottom <= cluster.top || hints.top >= cluster.bottom);
        return {
          collides,
          hints,
          cluster,
          hintsRight: hints.right,
          clusterLeft: cluster.left,
          gap: cluster.left - hints.right,
          overflow: hintsComputed.overflow
        };
      })()`);

      if (bottomProbeClosed.collides) {
        console.error(`    -> Collision details at ${w}px Closed:`);
        console.error(`       Hints: left=${bottomProbeClosed.hints.left.toFixed(1)}, right=${bottomProbeClosed.hints.right.toFixed(1)}, top=${bottomProbeClosed.hints.top.toFixed(1)}, bottom=${bottomProbeClosed.hints.bottom.toFixed(1)}`);
        console.error(`       Cluster: left=${bottomProbeClosed.cluster.left.toFixed(1)}, right=${bottomProbeClosed.cluster.right.toFixed(1)}, top=${bottomProbeClosed.cluster.top.toFixed(1)}, bottom=${bottomProbeClosed.cluster.bottom.toFixed(1)}`);
        console.error(`       Horizontal Overlap: Hints right (${bottomProbeClosed.hints.right.toFixed(1)}) > Cluster left (${bottomProbeClosed.cluster.left.toFixed(1)})`);
        console.error(`       Vertical Overlap: Hints bottom (${bottomProbeClosed.hints.bottom.toFixed(1)}) > Cluster top (${bottomProbeClosed.cluster.top.toFixed(1)})`);
      }
      assert(!bottomProbeClosed.collides, `[${w}px Closed] Hints bar does NOT collide with bottom HUD cluster (Gap: ${bottomProbeClosed.gap.toFixed(1)}px)`);
      assert(bottomProbeClosed.overflow.includes('hidden') || bottomProbeClosed.overflow.includes('auto'), `[${w}px Closed] Hints bar has overflow protection (overflow: ${bottomProbeClosed.overflow})`);

      // 3.2 Open state
      await evaluate('WorkbenchUI.openDrawer("tree");');
      await new Promise(r => setTimeout(r, 350));

      let bottomProbeOpen = await evaluate(`(() => {
        const toBox = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
        };
        const hints = toBox(document.querySelector('#hints-bar'));
        const cluster = toBox(document.querySelector('#bottom-hud-cluster'));
        const drawer = toBox(document.querySelector('.inspector-drawer'));
        
        const hintsCollidesCluster = !(hints.right <= cluster.left || hints.left >= cluster.right || hints.bottom <= cluster.top || hints.top >= cluster.bottom);
        const clusterCollidesDrawer = !(cluster.right <= drawer.left || cluster.left >= drawer.right);

        return {
          hintsCollidesCluster,
          clusterCollidesDrawer,
          hintsRight: hints.right,
          clusterLeft: cluster.left,
          clusterRight: cluster.right,
          drawerLeft: drawer.left,
          gapHintsCluster: cluster.left - hints.right,
          gapClusterDrawer: drawer.left - cluster.right
        };
      })()`);

      assert(!bottomProbeOpen.hintsCollidesCluster, `[${w}px Open] Hints bar does NOT collide with bottom cluster when drawer opens (Gap: ${bottomProbeOpen.gapHintsCluster.toFixed(1)}px)`);
      assert(!bottomProbeOpen.clusterCollidesDrawer, `[${w}px Open] Bottom cluster does NOT collide with drawer (Gap: ${bottomProbeOpen.gapClusterDrawer.toFixed(1)}px)`);
    }

    // -------------------------------------------------------------
    // TEST 4: INTEGRITY AUDIT — CODEBASE SCAN
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Integrity & Anti-Facade Audit ---');
    const cssPath = path.join(ASSETS_DIR, 'css', 'viewer.css');
    const htmlPath = path.join(ASSETS_DIR, 'viewer.html');
    const appPath = path.join(ASSETS_DIR, 'js', 'viewerApp.js');
    const workbenchPath = path.join(ASSETS_DIR, 'js', 'workbenchUiEngine.js');

    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const appContent = fs.readFileSync(appPath, 'utf8');
    const workbenchContent = fs.readFileSync(workbenchPath, 'utf8');

    // Check 4.1: No mock results or test bypass branches
    assert(!cssContent.includes('/* test-only */'), 'viewer.css contains no test-only bypass hacks');
    assert(!workbenchContent.includes('isTestRunning'), 'workbenchUiEngine.js contains no test-bypass flags');
    assert(!appContent.includes('window.__MOCK__'), 'viewerApp.js contains no mock facades');

    // Check 4.2: Real CSS wrapping grid implemented
    assert(cssContent.includes('.drawer-tabs') && cssContent.includes('flex-wrap: wrap;'), '.drawer-tabs genuinely implements flex-wrap: wrap;');
    assert(cssContent.includes('.drawer-header') && cssContent.includes('padding: 8px 48px 8px 10px;'), '.drawer-header reserves genuine 48px right gutter');

    // Check 4.3: Genuine decoupling of update pill and shortcuts bar
    assert(!htmlContent.includes('<div class="hints" id="hints-bar">\n    Scroll: Zoom | Middle/Left: Rotate | Right: Pan | T: Tree | X: Explode | M: Measure | S: Section | P: Mass | K: Snap | U: Units | F: Fit | <span id="btn-check-update"'), 'Old legacy structure where #btn-check-update was inside .hints is completely gone');
    assert(htmlContent.includes('<div class="bottom-hud-cluster" id="bottom-hud-cluster"'), '#bottom-hud-cluster is genuinely defined in HTML');

    console.log('\n================================================================');
    console.log(`  REVIEWER 2 SUMMARY: ${passedAssertions} assertions passed, ${failedAssertions} failed`);
    console.log(`  VERDICT: ${failedAssertions === 0 ? 'APPROVE' : 'REQUEST_CHANGES'}`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('Fatal execution error:', err);
    failedAssertions++;
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    if (server) server.close();
    process.exit(failedAssertions > 0 ? 1 : 0);
  }
}

run();
