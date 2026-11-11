/**
 * Empirical Browser Layout & Collision Stress Test using Headless Chromium via CDP
 * Measures exact getBoundingClientRect() across viewports and drawer states.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8995;
const CDP_PORT = 9228;
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
      console.log(`[HTTP Server] Listening on http://127.0.0.1:${PORT}`);
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
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', `stp_cdp_m2_${Date.now()}`);
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
  console.log(`[Browser] Spawning ${chromePath} with CDP port ${CDP_PORT}...`);
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

async function run() {
  try {
    await startServer();
    const chromePath = findChrome();
    const wsUrl = await spawnChrome(chromePath);
    console.log(`[CDP] Connecting to ${wsUrl}...`);

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
        if (msg.error) cb.reject(new Error(msg.error.message));
        else cb.resolve(msg.result);
      }
    };

    await cdpSend('Page.enable');
    await cdpSend('DOM.enable');
    await cdpSend('CSS.enable');
    await cdpSend('Runtime.enable');

    await cdpSend('Page.navigate', { url: `http://127.0.0.1:${PORT}/viewer.html` });
    await new Promise(r => setTimeout(r, 1500));

    console.log('\n--- Real Chromium Layout Measurements Across Viewports ---');

    const viewports = [
      { w: 1280, h: 800, name: '1280px Desktop' },
      { w: 960,  h: 600, name: '960px Breakpoint 1' },
      { w: 800,  h: 600, name: '800px Mid-Range' },
      { w: 680,  h: 600, name: '680px Breakpoint 2' },
      { w: 520,  h: 600, name: '520px Mobile' }
    ];

    for (const vp of viewports) {
      await cdpSend('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: false
      });
      await new Promise(r => setTimeout(r, 100));

      // Test Drawer Closed
      await evaluate(`WorkbenchUI.closeDrawer();`);
      await new Promise(r => setTimeout(r, 100));

      let layout = await evaluate(`(() => {
        const getBox = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cs = window.getComputedStyle(el);
          return {
            x: r.x, y: r.y, w: r.width, h: r.height,
            display: cs.display,
            visibility: cs.visibility,
            opacity: cs.opacity
          };
        };
        return {
          badge: getBox('.hud-badge'),
          toolbar: getBox('.toolbar'),
          hudTopRight: getBox('#hud-top-right'),
          viewCube: getBox('.viewcube-container'),
          unitsIndicator: getBox('#unit-indicator'),
          hintsBar: getBox('#hints-bar'),
          bottomHud: getBox('#bottom-hud-cluster'),
          triad: getBox('#triad-container')
        };
      })()`);

      console.log(`\n[${vp.name}] Drawer CLOSED:`);
      console.log(`  Toolbar: left=${layout.toolbar?.x.toFixed(1)}, right=${(layout.toolbar?.x + layout.toolbar?.w).toFixed(1)}, w=${layout.toolbar?.w.toFixed(1)}`);
      console.log(`  HUD Badge: left=${layout.badge?.x.toFixed(1)}, right=${(layout.badge?.x + layout.badge?.w).toFixed(1)}, y=${layout.badge?.y.toFixed(1)}`);
      console.log(`  HUD Top-Right: left=${layout.hudTopRight?.x.toFixed(1)}, right=${(layout.hudTopRight?.x + layout.hudTopRight?.w).toFixed(1)}, y=${layout.hudTopRight?.y.toFixed(1)}`);
      console.log(`  ViewCube: left=${layout.viewCube?.x.toFixed(1)}, right=${(layout.viewCube?.x + layout.viewCube?.w).toFixed(1)}, w=${layout.viewCube?.w.toFixed(1)}`);
      console.log(`  #unit-indicator: display=${layout.unitsIndicator?.display}, w=${layout.unitsIndicator?.w.toFixed(1)}, h=${layout.unitsIndicator?.h.toFixed(1)}`);

      // Check overlaps in CLOSED state
      const tbLeft = layout.toolbar.x;
      const tbRight = layout.toolbar.x + layout.toolbar.w;
      const badgeRight = layout.badge.x + layout.badge.w;
      const hudLeft = layout.hudTopRight.x;

      if (layout.badge.y < 50) { // badge is at top
        const badgeTbGap = tbLeft - badgeRight;
        console.log(`  -> Clearance (Badge -> Toolbar): ${badgeTbGap.toFixed(1)}px ${badgeTbGap >= 0 ? '✓ NO OVERLAP' : '✗ OVERLAP!'}`);
      } else {
        console.log(`  -> Badge relocated to bottom (y=${layout.badge.y.toFixed(1)}): ✓ NO TOP OVERLAP`);
      }

      if (layout.hudTopRight.y < 50) { // hud is at top
        const tbHudGap = hudLeft - tbRight;
        console.log(`  -> Clearance (Toolbar -> HUD Top-Right): ${tbHudGap.toFixed(1)}px ${tbHudGap >= 0 ? '✓ NO OVERLAP' : '✗ OVERLAP!'}`);
      } else {
        console.log(`  -> HUD Top-Right relocated to y=${layout.hudTopRight.y.toFixed(1)}: ✓ NO TOP OVERLAP`);
      }

      // Test Drawer OPEN
      await evaluate(`WorkbenchUI.openDrawer('tree');`);
      await new Promise(r => setTimeout(r, 400)); // wait for drawer transition

      layout = await evaluate(`(() => {
        const getBox = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cs = window.getComputedStyle(el);
          return {
            x: r.x, y: r.y, w: r.width, h: r.height,
            display: cs.display
          };
        };
        return {
          badge: getBox('.hud-badge'),
          toolbar: getBox('.toolbar'),
          hudTopRight: getBox('#hud-top-right'),
          viewCube: getBox('.viewcube-container'),
          drawer: getBox('.inspector-drawer'),
          closeBtn: getBox('#btn-close-drawer'),
          analysisTab: getBox('.drawer-tab[data-tab="analysis"]'),
          exportTab: getBox('.drawer-tab[data-tab="export"]'),
          tabsContainer: getBox('.drawer-tabs')
        };
      })()`);

      console.log(`\n[${vp.name}] Drawer OPEN:`);
      console.log(`  Drawer: left=${layout.drawer?.x.toFixed(1)}, w=${layout.drawer?.w.toFixed(1)}`);
      console.log(`  Toolbar: left=${layout.toolbar?.x.toFixed(1)}, right=${(layout.toolbar?.x + layout.toolbar?.w).toFixed(1)}`);
      console.log(`  HUD Top-Right: left=${layout.hudTopRight?.x.toFixed(1)}, right=${(layout.hudTopRight?.x + layout.hudTopRight?.w).toFixed(1)}`);
      console.log(`  ViewCube: left=${layout.viewCube?.x.toFixed(1)}, right=${(layout.viewCube?.x + layout.viewCube?.w).toFixed(1)}`);

      // Check Drawer vs Toolbar & ViewCube
      const drawerLeft = layout.drawer.x;
      const tbRightOpen = layout.toolbar.x + layout.toolbar.w;
      const vcRightOpen = layout.viewCube.x + layout.viewCube.w;
      console.log(`  -> Clearance (Toolbar -> Drawer): ${(drawerLeft - tbRightOpen).toFixed(1)}px ${drawerLeft >= tbRightOpen ? '✓ NO OVERLAP' : '✗ OVERLAP!'}`);
      console.log(`  -> Clearance (ViewCube -> Drawer): ${(drawerLeft - vcRightOpen).toFixed(1)}px ${drawerLeft >= vcRightOpen ? '✓ NO OVERLAP' : '✗ OVERLAP!'}`);

      // Check Drawer Tabs vs Close Button
      const closeLeft = layout.closeBtn.x;
      const tabsRight = layout.tabsContainer.x + layout.tabsContainer.w;
      const gap = closeLeft - tabsRight;
      console.log(`  -> Drawer Tabs Container right=${tabsRight.toFixed(1)}, Close Button left=${closeLeft.toFixed(1)}`);
      console.log(`  -> Clearance (Tabs -> Close Button): ${gap.toFixed(1)}px ${gap >= 10 ? '✓ AIR-GAP >= 10px' : '✗ GAP TOO SMALL'}`);

      // Check analysis tab vs close button
      if (layout.analysisTab) {
        const analysisRight = layout.analysisTab.x + layout.analysisTab.w;
        console.log(`  -> Analysis tab: left=${layout.analysisTab.x.toFixed(1)}, right=${analysisRight.toFixed(1)}`);
        console.log(`  -> Analysis tab inside scroll container: ${analysisRight <= tabsRight ? '✓ COMPLETELY INSIDE TABS BOX' : 'Scrolled / clipped at container boundary'}`);
      }
    }

    console.log('\n--- Testing Unit Indicator Switch In Headless Browser ---');
    const initialUnit = await evaluate(`(() => {
      const el = document.getElementById('unit-indicator');
      return el ? el.innerText : null;
    })()`);
    console.log(`  Initial unit: "${initialUnit}"`);

    await evaluate(`toggleUnits();`);
    const toggledUnit = await evaluate(`(() => {
      const el = document.getElementById('unit-indicator');
      return el ? el.innerText : null;
    })()`);
    console.log(`  Toggled unit: "${toggledUnit}"`);

    await evaluate(`toggleUnits();`);
    const restoredUnit = await evaluate(`(() => {
      const el = document.getElementById('unit-indicator');
      return el ? el.innerText : null;
    })()`);
    console.log(`  Restored unit: "${restoredUnit}"`);

    console.log('\n--- Testing Shortcuts Toggle In Headless Browser ---');
    const shortcutsState1 = await evaluate(`(() => {
      const h = document.getElementById('hints-bar');
      const b = document.getElementById('btn-toggle-shortcuts');
      const u = document.getElementById('btn-check-update');
      return {
        hintsDisplay: window.getComputedStyle(h).display,
        btnActive: b.classList.contains('active'),
        updateVisible: window.getComputedStyle(u).display
      };
    })()`);
    console.log('  State 1 (initial):', shortcutsState1);

    await evaluate(`toggleShortcuts();`);
    await new Promise(r => setTimeout(r, 250)); // wait for transition
    const shortcutsState2 = await evaluate(`(() => {
      const h = document.getElementById('hints-bar');
      const b = document.getElementById('btn-toggle-shortcuts');
      const u = document.getElementById('btn-check-update');
      return {
        hintsDisplay: window.getComputedStyle(h).display,
        btnActive: b.classList.contains('active'),
        updateVisible: window.getComputedStyle(u).display
      };
    })()`);
    console.log('  State 2 (after toggle):', shortcutsState2);

    await evaluate(`toggleShortcuts();`);
    await new Promise(r => setTimeout(r, 250));
    const shortcutsState3 = await evaluate(`(() => {
      const h = document.getElementById('hints-bar');
      const b = document.getElementById('btn-toggle-shortcuts');
      const u = document.getElementById('btn-check-update');
      return {
        hintsDisplay: window.getComputedStyle(h).display,
        btnActive: b.classList.contains('active'),
        updateVisible: window.getComputedStyle(u).display
      };
    })()`);
    console.log('  State 3 (after second toggle):', shortcutsState3);

    console.log('\n================================================================');
    console.log('  EMPIRICAL BROWSER MEASUREMENTS COMPLETED SUCCESSFULLY');
    console.log('================================================================\n');

  } catch (err) {
    console.error('Fatal error during test:', err);
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    if (server) server.close();
    process.exit(0);
  }
}

run();
