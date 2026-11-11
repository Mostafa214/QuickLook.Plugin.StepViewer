/**
 * Empirical Adversarial Layout & AABB Collision Stress Harness
 * Milestone M2 - Challenger 1
 *
 * Checks:
 * 1. Exact AABB collision between #info-badge and #toolbar-dock:
 *    - Across viewports: 1280px, 960px, 800px, 680px
 *    - In drawer CLOSED and drawer OPEN states
 *    - With default text AND with stress-loaded long filename / dimensions
 * 2. Text clipping / truncation across all tab buttons in .drawer-tabs:
 *    - Checks scrollWidth vs clientWidth, scrollHeight vs clientHeight
 *    - Checks bounding box containment within .drawer-tabs
 *    - Checks text-overflow and visual clipping across all 6 tabs
 *    - Checks tab containment when each tab is sequentially activated
 * 3. Exact AABB collision between #hints-bar and #btn-toggle-shortcuts / #update-compact-container / #bottom-hud-cluster:
 *    - Across viewports: 1280px, 960px, 800px, 680px
 *    - In drawer CLOSED and drawer OPEN states
 *    - With standard shortcuts AND with active measurement mode ([C] Clear Measure)
 *    - With #update-compact-container visible and hidden
 *    - Hit testing via elementFromPoint
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8997;
const CDP_PORT = 9230;
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
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', `stp_cdp_m2_challenger_${Date.now()}`);
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

function checkAABBOverlap(rectA, rectB) {
  if (!rectA || !rectB) return { isColliding: false, overlapX: 0, overlapY: 0 };
  const overlapX = Math.max(0, Math.min(rectA.x + rectA.w, rectB.x + rectB.w) - Math.max(rectA.x, rectB.x));
  const overlapY = Math.max(0, Math.min(rectA.y + rectA.h, rectB.y + rectB.h) - Math.max(rectA.y, rectB.y));
  const isColliding = (overlapX > 0 && overlapY > 0);
  return { isColliding, overlapX, overlapY };
}

async function run() {
  const testResults = {
    badgeVsToolbar: [],
    tabsClipping: [],
    hintsCollisions: []
  };

  let failCount = 0;
  let passCount = 0;

  function recordPass(msg) {
    passCount++;
    console.log(`  ✓ PASS: ${msg}`);
  }

  function recordFail(msg) {
    failCount++;
    console.error(`  ✗ FAIL: ${msg}`);
  }

  try {
    await startServer();
    const chromePath = findChrome();
    const wsUrl = await spawnChrome(chromePath);
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
    await cdpSend('Runtime.enable');
    await cdpSend('Page.navigate', { url: `http://127.0.0.1:${PORT}/viewer.html` });
    await new Promise(r => setTimeout(r, 1500));

    const viewports = [
      { w: 1280, h: 800, name: '1280px Desktop' },
      { w: 960,  h: 600, name: '960px Breakpoint' },
      { w: 800,  h: 600, name: '800px Mid-Range' },
      { w: 680,  h: 600, name: '680px Breakpoint' }
    ];

    console.log('================================================================');
    console.log(' EMPIRICAL CHALLENGER M2: AABB COLLISION & LAYOUT DEEP PROBE');
    console.log('================================================================\n');

    // =========================================================================
    // 1. #info-badge vs #toolbar AABB Overlap Analysis
    // =========================================================================
    console.log('--- 1. Testing #info-badge vs #toolbar AABB Collisions ---');

    for (const vp of viewports) {
      await cdpSend('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 100));

      for (const drawerState of ['closed', 'open']) {
        if (drawerState === 'closed') {
          await evaluate(`WorkbenchUI.closeDrawer();`);
        } else {
          await evaluate(`WorkbenchUI.openDrawer('tree');`);
        }
        await new Promise(r => setTimeout(r, 300));

        for (const contentState of ['default', 'loaded_long']) {
          if (contentState === 'loaded_long') {
            await evaluate(`(() => {
              const fn = document.getElementById('badge-filename');
              if (fn) fn.textContent = 'A380_Turbine_Blade_Assembly_High_Precision_Rev3_Final.STEP';
              const dim = document.getElementById('badge-dim');
              if (dim) dim.style.display = 'block';
              const dt = document.getElementById('dim-text');
              if (dt) dt.textContent = '1425.80 × 850.45 × 320.10 mm';
              const st = document.getElementById('status-text');
              if (st) st.textContent = 'Solid Mesh Ready (14 Bodies, 35,280 Triangles)';
            })()`);
          } else {
            await evaluate(`(() => {
              const fn = document.getElementById('badge-filename');
              if (fn) fn.textContent = 'Loading STEP Model...';
              const dim = document.getElementById('badge-dim');
              if (dim) dim.style.display = 'none';
              const dt = document.getElementById('dim-text');
              if (dt) dt.textContent = '';
              const st = document.getElementById('status-text');
              if (st) st.textContent = 'Initializing CAD Kernel...';
            })()`);
          }
          await new Promise(r => setTimeout(r, 100));

          const boxes = await evaluate(`(() => {
            const badge = document.querySelector('#info-badge');
            const toolbar = document.querySelector('#toolbar-dock') || document.querySelector('.toolbar');
            const bR = badge.getBoundingClientRect();
            const tR = toolbar.getBoundingClientRect();
            const bStyle = window.getComputedStyle(badge);
            const tStyle = window.getComputedStyle(toolbar);
            return {
              badge: { x: bR.x, y: bR.y, w: bR.width, h: bR.height, right: bR.right, bottom: bR.bottom, top: bStyle.top, display: bStyle.display },
              toolbar: { x: tR.x, y: tR.y, w: tR.width, h: tR.height, right: tR.right, bottom: tR.bottom, display: tStyle.display }
            };
          })()`);

          const overlap = checkAABBOverlap(boxes.badge, boxes.toolbar);
          const testDesc = `${vp.name} | Drawer: ${drawerState.toUpperCase()} | Content: ${contentState}`;

          testResults.badgeVsToolbar.push({
            viewport: vp.name,
            drawerState,
            contentState,
            badge: boxes.badge,
            toolbar: boxes.toolbar,
            overlap
          });

          if (!overlap.isColliding) {
            let clearanceInfo = '';
            if (boxes.badge.y + boxes.badge.h <= boxes.toolbar.y) {
              clearanceInfo = `Vertical clearance: ${(boxes.toolbar.y - (boxes.badge.y + boxes.badge.h)).toFixed(1)}px (Badge above toolbar)`;
            } else if (boxes.badge.y >= boxes.toolbar.y + boxes.toolbar.h) {
              clearanceInfo = `Vertical clearance: ${(boxes.badge.y - (boxes.toolbar.y + boxes.toolbar.h)).toFixed(1)}px (Badge below toolbar)`;
            } else if (boxes.badge.x + boxes.badge.w <= boxes.toolbar.x) {
              clearanceInfo = `Horizontal clearance: ${(boxes.toolbar.x - (boxes.badge.x + boxes.badge.w)).toFixed(1)}px (Badge left of toolbar)`;
            } else if (boxes.toolbar.x + boxes.toolbar.w <= boxes.badge.x) {
              clearanceInfo = `Horizontal clearance: ${(boxes.badge.x - (boxes.toolbar.x + boxes.toolbar.w)).toFixed(1)}px (Toolbar left of badge)`;
            }
            recordPass(`${testDesc} -> Zero overlap. ${clearanceInfo}`);
          } else {
            recordFail(`${testDesc} -> COLLISION! overlapX=${overlap.overlapX.toFixed(1)}px, overlapY=${overlap.overlapY.toFixed(1)}px`);
          }
        }
      }
    }

    // =========================================================================
    // 2. .drawer-tabs Text Clipping & Truncation Analysis
    // =========================================================================
    console.log('\n--- 2. Testing .drawer-tabs Text Clipping & Truncation ---');

    for (const vp of viewports) {
      await cdpSend('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false });
      await evaluate(`WorkbenchUI.openDrawer('tree');`);
      await new Promise(r => setTimeout(r, 300));

      // Test each tab activation
      const tabNames = ['tree', 'measure', 'section', 'mass', 'analysis', 'export'];
      for (const activeTab of tabNames) {
        await evaluate(`WorkbenchUI.switchDrawerTab('${activeTab}');`);
        await new Promise(r => setTimeout(r, 100));

        const tabsData = await evaluate(`(() => {
          const container = document.querySelector('.drawer-tabs');
          const header = document.querySelector('.drawer-header');
          const closeBtn = document.querySelector('#btn-close-drawer');
          const cR = container.getBoundingClientRect();
          const hR = header.getBoundingClientRect();
          const btnCloseR = closeBtn.getBoundingClientRect();

          const tabs = Array.from(document.querySelectorAll('.drawer-tab')).map(el => {
            const r = el.getBoundingClientRect();
            const textSpan = el.querySelector('span');
            const sR = textSpan ? textSpan.getBoundingClientRect() : null;
            const cs = window.getComputedStyle(el);
            const spanCs = textSpan ? window.getComputedStyle(textSpan) : null;

            // Check if text is clipped
            const isTextClippedHoriz = el.scrollWidth > el.clientWidth;
            const isTextClippedVert = el.scrollHeight > el.clientHeight;
            const isSpanClipped = textSpan ? (textSpan.scrollWidth > textSpan.clientWidth) : false;

            return {
              tab: el.dataset.tab,
              text: textSpan ? textSpan.innerText.trim() : el.innerText.trim(),
              rect: { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom },
              spanRect: sR ? { x: sR.x, y: sR.y, w: sR.width, h: sR.height, right: sR.right, bottom: sR.bottom } : null,
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
              isTextClippedHoriz,
              isTextClippedVert,
              isSpanClipped,
              insideContainer: (r.left >= cR.left - 1 && r.right <= cR.right + 1),
              insideHeader: (r.right <= btnCloseR.left)
            };
          });

          return {
            containerRect: { x: cR.x, y: cR.y, w: cR.width, h: cR.height, right: cR.right },
            closeBtnRect: { x: btnCloseR.x, y: btnCloseR.y, w: btnCloseR.width, h: btnCloseR.height },
            airGapToCloseBtn: btnCloseR.x - cR.right,
            tabs
          };
        })()`);

        const desc = `${vp.name} | ActiveTab: ${activeTab}`;
        let allTabsOk = true;

        for (const t of tabsData.tabs) {
          if (t.isTextClippedHoriz || t.isSpanClipped) {
            recordFail(`${desc} | Tab '${t.tab}' text "${t.text}" is horizontally clipped (scrollW=${t.scrollWidth}, clientW=${t.clientWidth})`);
            allTabsOk = false;
          }
          if (t.isTextClippedVert) {
            recordFail(`${desc} | Tab '${t.tab}' text "${t.text}" is vertically clipped (scrollH=${t.scrollHeight}, clientH=${t.clientHeight})`);
            allTabsOk = false;
          }
          if (!t.insideContainer) {
            recordFail(`${desc} | Tab '${t.tab}' extends outside .drawer-tabs (tab right=${t.rect.right.toFixed(1)}, container right=${tabsData.containerRect.right.toFixed(1)})`);
            allTabsOk = false;
          }
          if (!t.insideHeader) {
            recordFail(`${desc} | Tab '${t.tab}' collides with close button (tab right=${t.rect.right.toFixed(1)}, close left=${tabsData.closeBtnRect.x.toFixed(1)})`);
            allTabsOk = false;
          }
        }

        if (allTabsOk) {
          recordPass(`${desc} -> All 6 tabs fit cleanly without text clipping. Air gap to close btn: ${tabsData.airGapToCloseBtn.toFixed(1)}px`);
        }

        testResults.tabsClipping.push({
          viewport: vp.name,
          activeTab,
          allTabsOk,
          airGap: tabsData.airGapToCloseBtn,
          tabs: tabsData.tabs
        });
      }
    }

    // =========================================================================
    // 3. #hints-bar Collisions with #btn-toggle-shortcuts & #update-compact-container
    // =========================================================================
    console.log('\n--- 3. Testing #hints-bar Collisions with Bottom Controls & Update Container ---');

    for (const vp of viewports) {
      await cdpSend('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 100));

      for (const drawerState of ['closed', 'open']) {
        if (drawerState === 'closed') {
          await evaluate(`WorkbenchUI.closeDrawer();`);
        } else {
          await evaluate(`WorkbenchUI.openDrawer('tree');`);
        }
        await new Promise(r => setTimeout(r, 300));

        for (const measureMode of [false, true]) {
          await evaluate(`(() => {
            const hClear = document.getElementById('hint-measure-clear');
            if (hClear) hClear.style.display = ${measureMode} ? 'inline' : 'none';
          })()`);

          for (const updateContainerVisible of [false, true]) {
            await evaluate(`(() => {
              const ucc = document.getElementById('update-compact-container');
              if (ucc) ucc.style.display = ${updateContainerVisible} ? 'flex' : 'none';
            })()`);
            await new Promise(r => setTimeout(r, 100));

            const collisionData = await evaluate(`(() => {
              const hints = document.querySelector('#hints-bar');
              const btnShortcuts = document.querySelector('#btn-toggle-shortcuts');
              const btnUpdate = document.querySelector('#btn-check-update');
              const bCluster = document.querySelector('#bottom-hud-cluster');
              const updateCompact = document.querySelector('#update-compact-container');

              const getBox = (el) => {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                const cs = window.getComputedStyle(el);
                return {
                  x: r.x, y: r.y, w: r.width, h: r.height,
                  right: r.right, bottom: r.bottom,
                  display: cs.display,
                  visibility: cs.visibility,
                  opacity: cs.opacity
                };
              };

              // Element from point checks
              const sR = btnShortcuts.getBoundingClientRect();
              const uR = btnUpdate.getBoundingClientRect();
              const sHit = document.elementFromPoint(sR.x + sR.width / 2, sR.y + sR.height / 2);
              const uHit = document.elementFromPoint(uR.x + uR.width / 2, uR.y + uR.height / 2);

              return {
                hints: getBox(hints),
                btnShortcuts: getBox(btnShortcuts),
                btnUpdate: getBox(btnUpdate),
                bottomCluster: getBox(bCluster),
                updateCompact: getBox(updateCompact),
                shortcutsClickable: !!(sHit && (sHit.id === 'btn-toggle-shortcuts' || sHit.closest('#btn-toggle-shortcuts'))),
                updateClickable: !!(uHit && (uHit.id === 'btn-check-update' || uHit.closest('#btn-check-update'))),
                sHitTag: sHit ? sHit.tagName + '#' + sHit.id : null,
                uHitTag: uHit ? uHit.tagName + '#' + uHit.id : null
              };
            })()`);

            const desc = `${vp.name} | Drawer: ${drawerState.toUpperCase()} | Measure: ${measureMode ? 'ON' : 'OFF'} | UpdateWidget: ${updateContainerVisible ? 'VISIBLE' : 'HIDDEN'}`;

            // Check AABB 1: hints vs btnShortcuts
            const overlapShortcuts = checkAABBOverlap(collisionData.hints, collisionData.btnShortcuts);
            // Check AABB 2: hints vs bottomCluster (entire cluster containing buttons)
            const overlapCluster = checkAABBOverlap(collisionData.hints, collisionData.bottomCluster);
            // Check AABB 3: hints vs updateCompact (the top-right update container)
            let overlapUpdateCompact = { isColliding: false, overlapX: 0, overlapY: 0 };
            if (updateContainerVisible && collisionData.updateCompact && collisionData.updateCompact.display !== 'none') {
              overlapUpdateCompact = checkAABBOverlap(collisionData.hints, collisionData.updateCompact);
            }

            const isCollidingAny = overlapShortcuts.isColliding || overlapCluster.isColliding || overlapUpdateCompact.isColliding;
            const buttonsClickable = collisionData.shortcutsClickable && collisionData.updateClickable;

            if (!isCollidingAny && buttonsClickable) {
              const horizGapToCluster = (collisionData.bottomCluster.x - collisionData.hints.right);
              recordPass(`${desc} -> Zero overlap. Horiz clearance hints->cluster: ${horizGapToCluster.toFixed(1)}px. Buttons 100% clickable.`);
            } else {
              if (overlapShortcuts.isColliding) {
                recordFail(`${desc} -> COLLISION: Hints overlaps #btn-toggle-shortcuts! overlapX=${overlapShortcuts.overlapX.toFixed(1)}px, overlapY=${overlapShortcuts.overlapY.toFixed(1)}px`);
              }
              if (overlapCluster.isColliding) {
                recordFail(`${desc} -> COLLISION: Hints overlaps #bottom-hud-cluster! overlapX=${overlapCluster.overlapX.toFixed(1)}px, overlapY=${overlapCluster.overlapY.toFixed(1)}px`);
              }
              if (overlapUpdateCompact.isColliding) {
                recordFail(`${desc} -> COLLISION: Hints overlaps #update-compact-container! overlapX=${overlapUpdateCompact.overlapX.toFixed(1)}px, overlapY=${overlapUpdateCompact.overlapY.toFixed(1)}px`);
              }
              if (!buttonsClickable) {
                recordFail(`${desc} -> OCCLUSION: Shortcuts clickable=${collisionData.shortcutsClickable} (hit=${collisionData.sHitTag}), Update clickable=${collisionData.updateClickable} (hit=${collisionData.uHitTag})`);
              }
            }

            testResults.hintsCollisions.push({
              desc,
              overlapShortcuts,
              overlapCluster,
              overlapUpdateCompact,
              buttonsClickable
            });
          }
        }
      }
    }

    console.log('\n================================================================');
    console.log(` EMPIRICAL VERDICT SUMMARY:`);
    console.log(` Total Assertions Passed: ${passCount}`);
    console.log(` Total Assertions Failed: ${failCount}`);
    console.log(` FINAL VERDICT: ${failCount === 0 ? 'APPROVE' : 'REQUEST_CHANGES'}`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('Fatal error during challenger test:', err);
    process.exit(1);
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    if (server) server.close();
    process.exit(failCount === 0 ? 0 : 1);
  }
}

run();
