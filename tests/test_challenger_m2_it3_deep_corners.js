/**
 * challenger_m2_2_it3: Deep Corner Case & Adversarial Boundary Stress Harness
 * 
 * Verifies:
 * 1. 1px Continuous Micro-Sweep around 1250px boundary (1240px - 1260px) in CLOSED & OPEN states
 * 2. Extreme filename lengths (up to 250 chars) and dimensions stress
 * 3. Active Measure Mode and bottom controls hit-testing across all breakpoints
 * 4. Multi-cycle rapid drawer toggle geometry stability & drift resistance
 * 5. Drawer tabs non-truncation and close-button clearance
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
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', `stp_cdp_m2_it3_${Date.now()}`);
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
  let passCount = 0;
  let failCount = 0;

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

    console.log('================================================================');
    console.log(' CHALLENGER M2-IT3: CORNER CASES & BOUNDARY STRESS HARNESS');
    console.log('================================================================\n');

    // =========================================================================
    // SECTION 1: 1px-Step Boundary Micro-Sweep around 1250px (1240px to 1260px)
    // =========================================================================
    console.log('--- 1. Probing 1px Continuous Micro-Sweep (1240px - 1260px) ---');

    for (const drawerState of ['closed', 'open']) {
      if (drawerState === 'closed') {
        await evaluate(`WorkbenchUI.closeDrawer();`);
      } else {
        await evaluate(`WorkbenchUI.openDrawer('tree');`);
      }
      await new Promise(r => setTimeout(r, 200));

      let collisionsInSection = 0;

      for (let w = 1240; w <= 1260; w++) {
        await cdpSend('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
        await new Promise(r => setTimeout(r, 30));

        const data = await evaluate(`(() => {
          const tb = document.querySelector('.toolbar').getBoundingClientRect();
          const bd = document.querySelector('.hud-badge').getBoundingClientRect();
          const hud = document.querySelector('#hud-top-right').getBoundingClientRect();
          const vc = document.querySelector('#viewcube-container').getBoundingClientRect();

          const toBox = r => ({ x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom });

          return {
            tb: toBox(tb),
            bd: toBox(bd),
            hud: toBox(hud),
            vc: toBox(vc)
          };
        })()`);

        const overlapTbBadge = checkAABBOverlap(data.tb, data.bd);
        const overlapTbHud = checkAABBOverlap(data.tb, data.hud);
        const overlapHudVc = checkAABBOverlap(data.hud, data.vc);

        if (overlapTbBadge.isColliding) {
          collisionsInSection++;
          recordFail(`W=${w}px | Drawer: ${drawerState.toUpperCase()} | Toolbar vs Badge COLLISION (overlapX=${overlapTbBadge.overlapX.toFixed(1)}px, overlapY=${overlapTbBadge.overlapY.toFixed(1)}px)`);
        }
        if (overlapTbHud.isColliding) {
          collisionsInSection++;
          recordFail(`W=${w}px | Drawer: ${drawerState.toUpperCase()} | Toolbar vs Top-Right HUD COLLISION (overlapX=${overlapTbHud.overlapX.toFixed(1)}px, overlapY=${overlapTbHud.overlapY.toFixed(1)}px)`);
        }
        if (overlapHudVc.isColliding) {
          collisionsInSection++;
          recordFail(`W=${w}px | Drawer: ${drawerState.toUpperCase()} | Top-Right HUD vs ViewCube COLLISION (overlapX=${overlapHudVc.overlapX.toFixed(1)}px, overlapY=${overlapHudVc.overlapY.toFixed(1)}px)`);
        }
      }

      if (collisionsInSection === 0) {
        recordPass(`1px continuous micro-sweep 1240px-1260px (Drawer ${drawerState.toUpperCase()}): Zero collisions across all 21 probed widths.`);
      }
    }

    // =========================================================================
    // SECTION 2: Extreme Filename Lengths & Dimensions Stress Test
    // =========================================================================
    console.log('\n--- 2. Stress Testing Extreme Long Filenames (10 to 250 chars) ---');

    const filenames = [
      { name: 'part.stp', desc: 'Short (8 chars)' },
      { name: 'bracket_mount_subassembly.step', desc: 'Normal (30 chars)' },
      { name: 'Turbine_Blade_Assembly_Stage4_HighPressure_Superalloy_Inconel718_RevG_Final.step', desc: 'Long (80 chars)' },
      { name: 'A380_Turbine_Blade_Assembly_High_Precision_Rev3_Final_Engineering_Specification_Document_Export_Version_Checked_Approved_By_Chief_Aerospace_Engineer_2026.step', desc: 'Extreme (150 chars)' },
      { name: 'Super_Deeply_Nested_Hierarchical_Aerospace_CAD_Model_Component_With_An_Absurdly_Long_Filename_Designed_To_Break_CSS_Overflow_Rules_And_Cause_Text_Spillover_Unless_Strictly_Enforced_By_Max_Width_Clamp_And_Ellipsis_Truncation_Tokens_Engine_Test_v999999_Final.step', desc: 'Ultra-Extreme (250 chars)' }
    ];

    const testWidths = [1280, 1251, 1250, 1200, 960, 800, 680];

    for (const fileCase of filenames) {
      await evaluate(`(() => {
        const fn = document.getElementById('badge-filename');
        if (fn) fn.textContent = ${JSON.stringify(fileCase.name)};
        const dim = document.getElementById('badge-dim');
        if (dim) dim.style.display = 'block';
        const dt = document.getElementById('dim-text');
        if (dt) dt.textContent = '999999.999 × 888888.888 × 777777.777 mm';
        const st = document.getElementById('status-text');
        if (st) st.textContent = 'Analyzing 500,000 faces, calculating B-Rep surfaces...';
      })()`);
      await new Promise(r => setTimeout(r, 50));

      let allWidthsOk = true;

      for (const w of testWidths) {
        await cdpSend('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
        await new Promise(r => setTimeout(r, 50));

        const res = await evaluate(`(() => {
          const bd = document.querySelector('.hud-badge');
          const fn = document.querySelector('#badge-filename');
          const tb = document.querySelector('.toolbar');
          const bR = bd.getBoundingClientRect();
          const tR = tb.getBoundingClientRect();
          const fnR = fn.getBoundingClientRect();

          const toBox = r => ({ x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom });
          const isContained = (fnR.right <= bR.right + 2); // fn does not leak outside badge container
          const cs = window.getComputedStyle(bd);
          const maxW = parseFloat(cs.maxWidth);

          return {
            badge: toBox(bR),
            toolbar: toBox(tR),
            fnRight: fnR.right,
            bdRight: bR.right,
            isContained,
            badgeWidth: bR.width,
            maxWidthStyle: cs.maxWidth,
            maxWidthValue: maxW
          };
        })()`);

        const overlap = checkAABBOverlap(res.badge, res.toolbar);

        if (overlap.isColliding) {
          recordFail(`Filename: ${fileCase.desc} at W=${w}px -> COLLISION between Badge and Toolbar! (overlapX=${overlap.overlapX.toFixed(1)}px, overlapY=${overlap.overlapY.toFixed(1)}px)`);
          allWidthsOk = false;
        }

        if (!res.isContained) {
          recordFail(`Filename: ${fileCase.desc} at W=${w}px -> TEXT SPILLOVER! Filename right (${res.fnRight.toFixed(1)}) exceeds Badge right (${res.bdRight.toFixed(1)})`);
          allWidthsOk = false;
        }
      }

      if (allWidthsOk) {
        recordPass(`Filename: ${fileCase.desc} -> Clamped safely without toolbar collision or text spillover across all 7 viewports.`);
      }
    }

    // Reset badge text
    await evaluate(`(() => {
      document.getElementById('badge-filename').textContent = 'bracket_mount.step';
      document.getElementById('dim-text').textContent = '120 × 80 × 45 mm';
      document.getElementById('status-text').textContent = 'Solid Mesh Ready';
    })()`);

    // =========================================================================
    // SECTION 3: Active Measure Mode, Bottom Controls & Hit-Testing
    // =========================================================================
    console.log('\n--- 3. Testing Active Measure Mode & Bottom Controls Hit-Testing ---');

    const bottomViewports = [1280, 1024, 960, 800, 768, 680, 520];

    for (const vpW of bottomViewports) {
      await cdpSend('Emulation.setDeviceMetricsOverride', { width: vpW, height: 700, deviceScaleFactor: 1, mobile: false });

      for (const measureActive of [false, true]) {
        await evaluate(`(() => {
          const hClear = document.getElementById('hint-measure-clear');
          if (hClear) hClear.style.display = ${measureActive} ? 'inline' : 'none';
        })()`);
        await new Promise(r => setTimeout(r, 40));

        for (const drawerState of ['closed', 'open']) {
          if (drawerState === 'closed') {
            await evaluate(`WorkbenchUI.closeDrawer();`);
          } else {
            await evaluate(`WorkbenchUI.openDrawer('measure');`);
          }
          await new Promise(r => setTimeout(r, 150));

          const res = await evaluate(`(() => {
            const hints = document.querySelector('#hints-bar');
            const cluster = document.querySelector('#bottom-hud-cluster');
            const btnShortcuts = document.querySelector('#btn-toggle-shortcuts');
            const btnUpdate = document.querySelector('#btn-check-update');
            const triad = document.querySelector('#triad-container');

            const toBox = el => {
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
            };

            // Hit test center of buttons
            const sR = btnShortcuts.getBoundingClientRect();
            const uR = btnUpdate.getBoundingClientRect();
            const sHit = document.elementFromPoint(sR.x + sR.width / 2, sR.y + sR.height / 2);
            const uHit = document.elementFromPoint(uR.x + uR.width / 2, uR.y + uR.height / 2);

            return {
              hints: toBox(hints),
              cluster: toBox(cluster),
              triad: toBox(triad),
              shortcutsClickable: !!(sHit && (sHit.id === 'btn-toggle-shortcuts' || sHit.closest('#btn-toggle-shortcuts'))),
              updateClickable: !!(uHit && (uHit.id === 'btn-check-update' || uHit.closest('#btn-check-update'))),
              sHitId: sHit ? sHit.id : null,
              uHitId: uHit ? uHit.id : null
            };
          })()`);

          const overlapCluster = checkAABBOverlap(res.hints, res.cluster);
          const isColliding = overlapCluster.isColliding;
          const clickable = res.shortcutsClickable && res.updateClickable;

          const desc = `W=${vpW}px | Measure: ${measureActive ? 'ON' : 'OFF'} | Drawer: ${drawerState.toUpperCase()}`;

          if (!isColliding && clickable) {
            recordPass(`${desc} -> Clear. Shortcuts & Update buttons 100% clickable.`);
          } else {
            if (overlapCluster.isColliding) {
              recordFail(`${desc} -> Hints collided with #bottom-hud-cluster (overlapX=${overlapCluster.overlapX.toFixed(1)}, overlapY=${overlapCluster.overlapY.toFixed(1)})`);
            }
            if (!clickable) {
              recordFail(`${desc} -> Button click blocked! sHit=${res.sHitId}, uHit=${res.uHitId}`);
            }
          }
        }
      }
    }

    // =========================================================================
    // SECTION 4: Multi-Cycle Rapid Drawer Toggle Stability & Geometry Drift
    // =========================================================================
    console.log('\n--- 4. Testing Multi-Cycle Rapid Drawer Toggle Stability ---');

    await cdpSend('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await evaluate(`WorkbenchUI.closeDrawer();`);
    await new Promise(r => setTimeout(r, 400));

    // Baseline geometry
    const baseline = await evaluate(`(() => {
      const tb = document.querySelector('.toolbar').getBoundingClientRect();
      const bd = document.querySelector('.hud-badge').getBoundingClientRect();
      const hud = document.querySelector('#hud-top-right').getBoundingClientRect();
      return { tbX: tb.x, tbY: tb.y, bdX: bd.x, bdY: bd.y, hudX: hud.x, hudY: hud.y };
    })()`);

    // Perform 5 toggles with full 350ms CSS transition completion
    const tabCycle = ['tree', 'measure', 'section', 'mass', 'analysis', 'export'];
    for (let i = 0; i < 5; i++) {
      const tab = tabCycle[i % tabCycle.length];
      await evaluate(`WorkbenchUI.openDrawer('${tab}');`);
      await new Promise(r => setTimeout(r, 350));
      await evaluate(`WorkbenchUI.closeDrawer();`);
      await new Promise(r => setTimeout(r, 350));
    }
    await new Promise(r => setTimeout(r, 400));

    // Post-cycle geometry
    const postCycle = await evaluate(`(() => {
      const tb = document.querySelector('.toolbar').getBoundingClientRect();
      const bd = document.querySelector('.hud-badge').getBoundingClientRect();
      const hud = document.querySelector('#hud-top-right').getBoundingClientRect();
      const hasDrawerOpenClass = document.body.classList.contains('drawer-open');
      return {
        tbX: tb.x, tbY: tb.y, bdX: bd.x, bdY: bd.y, hudX: hud.x, hudY: hud.y,
        hasDrawerOpenClass
      };
    })()`);

    const driftTb = Math.abs(baseline.tbX - postCycle.tbX) + Math.abs(baseline.tbY - postCycle.tbY);
    const driftBd = Math.abs(baseline.bdX - postCycle.bdX) + Math.abs(baseline.bdY - postCycle.bdY);
    const driftHud = Math.abs(baseline.hudX - postCycle.hudX) + Math.abs(baseline.hudY - postCycle.hudY);

    if (driftTb < 0.1 && driftBd < 0.1 && driftHud < 0.1 && !postCycle.hasDrawerOpenClass) {
      recordPass(`5-cycle toggle stability: Zero geometry drift (diff=${(driftTb + driftBd + driftHud).toFixed(2)}px), drawer cleanly closed.`);
    } else {
      recordFail(`Drawer toggle geometry drifted after 5 cycles! driftTb=${driftTb.toFixed(2)}, driftBd=${driftBd.toFixed(2)}, driftHud=${driftHud.toFixed(2)}, bodyClassOpen=${postCycle.hasDrawerOpenClass}`);
    }

    // =========================================================================
    // SECTION 5: Inspector Drawer Tabs Non-Truncation & Close Button Clearance
    // =========================================================================
    console.log('\n--- 5. Testing Inspector Drawer Tab Text Non-Truncation ---');

    await evaluate(`WorkbenchUI.openDrawer('tree');`);
    await new Promise(r => setTimeout(r, 300));

    const drawerWidths = [1280, 960, 800, 680, 520];

    for (const w of drawerWidths) {
      await cdpSend('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 100));

      const tabCheck = await evaluate(`(() => {
        const tabs = Array.from(document.querySelectorAll('.drawer-tab'));
        const closeBtn = document.querySelector('#btn-close-drawer');
        const cR = closeBtn.getBoundingClientRect();

        return tabs.map(t => {
          const r = t.getBoundingClientRect();
          const span = t.querySelector('span');
          const isClippedH = t.scrollWidth > t.clientWidth;
          const isClippedV = t.scrollHeight > t.clientHeight;
          const airGapToClose = cR.x - r.right;
          return {
            name: t.dataset.tab,
            text: span ? span.innerText.trim() : t.innerText.trim(),
            isClippedH,
            isClippedV,
            airGapToClose
          };
        });
      })()`);

      let clippedTabs = tabCheck.filter(t => t.isClippedH || t.isClippedV);
      let collidedClose = tabCheck.filter(t => t.airGapToClose < 0);

      if (clippedTabs.length === 0 && collidedClose.length === 0) {
        const minGap = Math.min(...tabCheck.map(t => t.airGapToClose));
        recordPass(`W=${w}px | Drawer Tabs: All 6 tabs fit cleanly without text clipping. Min gap to close btn: ${minGap.toFixed(1)}px`);
      } else {
        if (clippedTabs.length > 0) {
          recordFail(`W=${w}px | Drawer Tabs Clipped: ${clippedTabs.map(t => `${t.name}("${t.text}")`).join(', ')}`);
        }
        if (collidedClose.length > 0) {
          recordFail(`W=${w}px | Drawer Tabs Collided with Close Button: ${collidedClose.map(t => t.name).join(', ')}`);
        }
      }
    }

    // =========================================================================
    // SECTION 6: ViewCube & Camera Mode Controls Occlusion & Hit-Testing
    // =========================================================================
    console.log('\n--- 6. Testing ViewCube & Camera Mode Controls Occlusion ---');

    const vcViewports = [1280, 1250, 960, 800, 768, 680];
    for (const w of vcViewports) {
      for (const drawerState of ['closed', 'open']) {
        await cdpSend('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
        if (drawerState === 'closed') {
          await evaluate(`WorkbenchUI.closeDrawer();`);
        } else {
          await evaluate(`WorkbenchUI.openDrawer('tree');`);
        }
        await new Promise(r => setTimeout(r, 200));

        const hits = await evaluate(`(() => {
          const btnPersp = document.querySelector('#vc-btn-persp');
          const btnHome = document.querySelector('#vc-btn-home');
          const hud = document.querySelector('#hud-top-right');
          const vc = document.querySelector('#viewcube-container');

          const toB = r => ({ x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom });
          const hudB = toB(hud.getBoundingClientRect());
          const vcB = toB(vc.getBoundingClientRect());

          const pR = btnPersp ? btnPersp.getBoundingClientRect() : null;
          const hR = btnHome ? btnHome.getBoundingClientRect() : null;

          const pHit = pR ? document.elementFromPoint(pR.x + pR.width / 2, pR.y + pR.height / 2) : null;
          const hHit = hR ? document.elementFromPoint(hR.x + hR.width / 2, hR.y + hR.height / 2) : null;

          const perspClickable = !!(pHit && (pHit.id === 'vc-btn-persp' || pHit.closest('#vc-btn-persp')));
          const homeClickable = !!(hHit && (hHit.id === 'vc-btn-home' || hHit.closest('#vc-btn-home')));

          return {
            hud: hudB,
            vc: vcB,
            perspClickable,
            homeClickable,
            pHitTag: pHit ? (pHit.tagName + '#' + pHit.id) : null,
            hHitTag: hHit ? (hHit.tagName + '#' + hHit.id) : null
          };
        })()`);

        const overlapHudVc = checkAABBOverlap(hits.hud, hits.vc);
        const desc = `W=${w}px | Drawer: ${drawerState.toUpperCase()}`;

        if (!overlapHudVc.isColliding && hits.perspClickable && hits.homeClickable) {
          recordPass(`${desc} -> ViewCube & Camera Mode controls 100% clear and clickable.`);
        } else {
          if (overlapHudVc.isColliding) {
            recordFail(`${desc} -> Top-Right HUD physically collides with #viewcube-container (overlapX=${overlapHudVc.overlapX.toFixed(1)}px, overlapY=${overlapHudVc.overlapY.toFixed(1)}px)`);
          }
          if (!hits.perspClickable) {
            recordFail(`${desc} -> #vc-btn-persp (Camera Ortho/Persp) is OCCLUDED and blocked! Hit element: ${hits.pHitTag}`);
          }
          if (!hits.homeClickable) {
            recordFail(`${desc} -> #vc-btn-home (ViewCube Home) is OCCLUDED and blocked! Hit element: ${hits.hHitTag}`);
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
    failCount++;
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    if (server) server.close();
    process.exit(failCount === 0 ? 0 : 1);
  }
}

run();
