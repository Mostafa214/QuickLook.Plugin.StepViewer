/**
 * Challenger M2 Iteration 4: Comprehensive Empirical Stress & Boundary Harness
 * 
 * Tests:
 * 1. 1px Continuous Micro-Sweeps across critical boundary regions:
 *    - 1250px to 1275px (encompassing 1265px label collapse breakpoint)
 *    - 950px to 975px (encompassing 960px ViewCube scale & HUD relocate breakpoint)
 *    - 670px to 695px (encompassing 680px ViewCube scale & HUD badge relocate breakpoint)
 * 2. Continuous Broad Sweep (500px to 1600px with 25px steps)
 * 3. Exact AABB physical clearances in CLOSED and OPEN drawer states:
 *    - #hud-top-right vs #viewcube-container
 *    - #hud-top-right vs .toolbar
 *    - #info-badge vs .toolbar
 *    - #hints-bar vs #btn-toggle-shortcuts and #update-compact-container
 * 4. Pointer hit-testing (document.elementFromPoint) on:
 *    - #vc-btn-persp
 *    - #vc-btn-home
 *    - #btn-toggle-shortcuts
 * 5. Active Measure Mode layout stability across all breakpoints.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 9005;
const CDP_PORT = 9239;
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

function aabbOverlap(bA, bB) {
  const ox = Math.max(0, Math.min(bA.right, bB.right) - Math.max(bA.left, bB.left));
  const oy = Math.max(0, Math.min(bA.bottom, bB.bottom) - Math.max(bA.top, bB.top));
  return {
    colliding: (ox > 0.05 && oy > 0.05),
    ox,
    oy
  };
}

async function run() {
  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/viewer.html';
    let f = path.join(ASSETS_DIR, p);
    if (!fs.existsSync(f)) f = path.join(REPO_ROOT, p);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    const ext = path.extname(f).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', 'stp_cdp_it4_' + Date.now());
  const cp = spawn(chromePath, [
    '--remote-debugging-port=' + CDP_PORT,
    '--headless=new',
    '--user-data-dir=' + userDataDir,
    '--window-size=1600,1000',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 1200));
  const res = await fetch('http://127.0.0.1:' + CDP_PORT + '/json');
  const list = await res.json();
  const page = list.find(p => p.type === 'page');
  const ws = new (globalThis.WebSocket)(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const send = (m, p={}) => new Promise((resolve, reject) => {
    const id = msgId++;
    const handler = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === id) {
        ws.removeEventListener('message', handler);
        if (d.error) reject(d.error); else resolve(d.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/viewer.html' });
  await new Promise(r => setTimeout(r, 1500));

  // Disable CSS transitions for deterministic instantaneous bounding measurements
  await send('Runtime.evaluate', { expression: `(() => {
    const style = document.createElement('style');
    style.id = 'disable-transitions-style';
    style.textContent = '* { transition: none !important; animation: none !important; }';
    document.head.appendChild(style);
  })()` });

  console.log('========================================================================');
  console.log(' CHALLENGER M2-IT4: EMPIRICAL STRESS & CONTINUOUS BOUNDARY HARNESS');
  console.log('========================================================================\n');

  let totalPassed = 0;
  let totalFailed = 0;
  const failureDetails = [];

  async function getLayoutState(width, drawerState, measureActive = false) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    if (drawerState === 'open') {
      await send('Runtime.evaluate', { expression: "document.body.classList.add('drawer-open');" });
    } else {
      await send('Runtime.evaluate', { expression: "document.body.classList.remove('drawer-open');" });
    }

    if (measureActive) {
      await send('Runtime.evaluate', { expression: "document.body.classList.add('measure-mode-active');" });
    } else {
      await send('Runtime.evaluate', { expression: "document.body.classList.remove('measure-mode-active');" });
    }

    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        const getBox = sel => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
            display: style.display,
            visibility: style.visibility
          };
        };

        const hud = getBox('#hud-top-right');
        const vc = getBox('#viewcube-container');
        const tb = getBox('.toolbar');
        const badge = getBox('.hud-badge');
        const hints = getBox('#hints-bar');
        const btnShortcuts = getBox('#btn-toggle-shortcuts');
        const btnUpdate = getBox('#btn-check-update');
        const bottomCluster = getBox('.bottom-hud-cluster') || getBox('#bottom-hud-cluster');
        const btnPersp = getBox('#vc-btn-persp');
        const btnHome = getBox('#vc-btn-home');

        const getElTag = el => {
          if (!el) return null;
          let cls = '';
          if (typeof el.className === 'string' && el.className.trim()) {
            cls = '.' + el.className.trim().split(/\s+/).join('.');
          } else if (el.getAttribute && el.getAttribute('class')) {
            cls = '.' + el.getAttribute('class').trim().split(/\s+/).join('.');
          }
          return el.tagName + (el.id ? '#' + el.id : '') + cls;
        };

        // Hit tests
        let hitPerspTag = null;
        let hitPerspOk = false;
        if (btnPersp && btnPersp.width > 0 && btnPersp.height > 0) {
          const el = document.elementFromPoint(btnPersp.left + btnPersp.width / 2, btnPersp.top + btnPersp.height / 2);
          hitPerspTag = getElTag(el);
          hitPerspOk = !!(el && (el.id === 'vc-btn-persp' || el.closest('#vc-btn-persp')));
        }

        let hitHomeTag = null;
        let hitHomeOk = false;
        if (btnHome && btnHome.width > 0 && btnHome.height > 0) {
          const el = document.elementFromPoint(btnHome.left + btnHome.width / 2, btnHome.top + btnHome.height / 2);
          hitHomeTag = getElTag(el);
          hitHomeOk = !!(el && (el.id === 'vc-btn-home' || el.closest('#vc-btn-home')));
        }

        let hitShortcutsTag = null;
        let hitShortcutsOk = false;
        if (btnShortcuts && btnShortcuts.width > 0 && btnShortcuts.height > 0) {
          const el = document.elementFromPoint(btnShortcuts.left + btnShortcuts.width / 2, btnShortcuts.top + btnShortcuts.height / 2);
          hitShortcutsTag = getElTag(el);
          hitShortcutsOk = !!(el && (el.id === 'btn-toggle-shortcuts' || el.closest('#btn-toggle-shortcuts')));
        }

        return {
          hud,
          vc,
          tb,
          badge,
          hints,
          btnShortcuts,
          btnUpdate,
          bottomCluster,
          btnPersp,
          btnHome,
          hitPerspTag,
          hitHomeTag,
          hitShortcutsTag,
          hitPerspOk,
          hitHomeOk,
          hitShortcutsOk
        };

      })()`,
      returnByValue: true,
      awaitPromise: true
    });

    if (res.exceptionDetails) {
      console.error('Evaluate exception:', res.exceptionDetails);
    }
    return res && res.result ? res.result.value : res;
  }



  // --- SECTION 1: 1px Micro-Sweeps around 1265px boundary (1250px - 1275px) ---
  console.log('--- 1. Probing 1px Micro-Sweeps around 1265px Boundary (1250px - 1275px) ---');
  let sec1Errors = 0;
  for (const drawer of ['closed', 'open']) {
    for (let w = 1250; w <= 1275; w++) {
      const state = await getLayoutState(w, drawer);
      // Check 1: HUD vs VC
      const hudVc = aabbOverlap(state.hud, state.vc);
      if (hudVc.colliding) {
        sec1Errors++;
        failureDetails.push(`W=${w}px (${drawer}): #hud-top-right overlaps #viewcube-container (ox=${hudVc.ox.toFixed(1)}, oy=${hudVc.oy.toFixed(1)})`);
      }
      // Check 2: HUD vs Toolbar
      const hudTb = aabbOverlap(state.hud, state.tb);
      if (hudTb.colliding) {
        sec1Errors++;
        failureDetails.push(`W=${w}px (${drawer}): #hud-top-right overlaps .toolbar (ox=${hudTb.ox.toFixed(1)}, oy=${hudTb.oy.toFixed(1)})`);
      }
      // Check 3: Badge vs Toolbar
      const badgeTb = aabbOverlap(state.badge, state.tb);
      if (badgeTb.colliding) {
        sec1Errors++;
        failureDetails.push(`W=${w}px (${drawer}): .hud-badge overlaps .toolbar (ox=${badgeTb.ox.toFixed(1)}, oy=${badgeTb.oy.toFixed(1)})`);
      }
      // Check 4: VC buttons hit-test
      if (!state.hitPerspOk) {
        sec1Errors++;
        failureDetails.push(`W=${w}px (${drawer}): #vc-btn-persp occluded! Hit target: ${state.hitPerspTag}`);
      }
      if (!state.hitHomeOk) {
        sec1Errors++;
        failureDetails.push(`W=${w}px (${drawer}): #vc-btn-home occluded! Hit target: ${state.hitHomeTag}`);
      }
    }
  }
  if (sec1Errors === 0) {
    console.log('  ✓ PASS: 1250px-1275px 1px micro-sweep (52 configurations): ZERO collisions, all buttons clickable.');
    totalPassed += 52;
  } else {
    console.log(`  ✗ FAIL: 1250px-1275px micro-sweep had ${sec1Errors} failures!`);
    totalFailed += sec1Errors;
  }

  // --- SECTION 2: 1px Micro-Sweeps around 960px boundary (950px - 975px) ---
  console.log('\n--- 2. Probing 1px Micro-Sweeps around 960px Boundary (950px - 975px) ---');
  let sec2Errors = 0;
  for (const drawer of ['closed', 'open']) {
    for (let w = 950; w <= 975; w++) {
      const state = await getLayoutState(w, drawer);
      // Check 1: HUD vs VC
      const hudVc = aabbOverlap(state.hud, state.vc);
      if (hudVc.colliding) {
        sec2Errors++;
        failureDetails.push(`W=${w}px (${drawer}): #hud-top-right overlaps #viewcube-container (ox=${hudVc.ox.toFixed(1)}, oy=${hudVc.oy.toFixed(1)})`);
      }
      // Check 2: HUD vs Toolbar
      const hudTb = aabbOverlap(state.hud, state.tb);
      if (hudTb.colliding) {
        sec2Errors++;
        failureDetails.push(`W=${w}px (${drawer}): #hud-top-right overlaps .toolbar (ox=${hudTb.ox.toFixed(1)}, oy=${hudTb.oy.toFixed(1)})`);
      }
      // Check 3: Badge vs Toolbar
      const badgeTb = aabbOverlap(state.badge, state.tb);
      if (badgeTb.colliding) {
        sec2Errors++;
        failureDetails.push(`W=${w}px (${drawer}): .hud-badge overlaps .toolbar (ox=${badgeTb.ox.toFixed(1)}, oy=${badgeTb.oy.toFixed(1)})`);
      }
      // Check 4: VC buttons hit-test
      if (!state.hitPerspOk) {
        sec2Errors++;
        failureDetails.push(`W=${w}px (${drawer}): #vc-btn-persp occluded! Hit target: ${state.hitPerspTag}`);
      }
      if (!state.hitHomeOk) {
        sec2Errors++;
        failureDetails.push(`W=${w}px (${drawer}): #vc-btn-home occluded! Hit target: ${state.hitHomeTag}`);
      }
    }
  }
  if (sec2Errors === 0) {
    console.log('  ✓ PASS: 950px-975px 1px micro-sweep (52 configurations): ZERO collisions, all buttons clickable.');
    totalPassed += 52;
  } else {
    console.log(`  ✗ FAIL: 950px-975px micro-sweep had ${sec2Errors} failures!`);
    totalFailed += sec2Errors;
  }

  // --- SECTION 3: 1px Micro-Sweeps around 680px boundary (670px - 695px) ---
  console.log('\n--- 3. Probing 1px Micro-Sweeps around 680px Boundary (670px - 695px) ---');
  let sec3Errors = 0;
  for (const drawer of ['closed', 'open']) {
    for (let w = 670; w <= 695; w++) {
      const state = await getLayoutState(w, drawer);
      // Check 1: HUD vs VC
      const hudVc = aabbOverlap(state.hud, state.vc);
      if (hudVc.colliding) {
        sec3Errors++;
        failureDetails.push(`W=${w}px (${drawer}): #hud-top-right overlaps #viewcube-container (ox=${hudVc.ox.toFixed(1)}, oy=${hudVc.oy.toFixed(1)})`);
      }
      // Check 2: HUD vs Toolbar
      const hudTb = aabbOverlap(state.hud, state.tb);
      if (hudTb.colliding) {
        sec3Errors++;
        failureDetails.push(`W=${w}px (${drawer}): #hud-top-right overlaps .toolbar (ox=${hudTb.ox.toFixed(1)}, oy=${hudTb.oy.toFixed(1)})`);
      }
      // Check 3: Badge vs Toolbar
      const badgeTb = aabbOverlap(state.badge, state.tb);
      if (badgeTb.colliding) {
        sec3Errors++;
        failureDetails.push(`W=${w}px (${drawer}): .hud-badge overlaps .toolbar (ox=${badgeTb.ox.toFixed(1)}, oy=${badgeTb.oy.toFixed(1)})`);
      }
      // Check 4: VC buttons hit-test
      if (!state.hitPerspOk) {
        sec3Errors++;
        failureDetails.push(`W=${w}px (${drawer}): #vc-btn-persp occluded! Hit target: ${state.hitPerspTag}`);
      }
      if (!state.hitHomeOk) {
        sec3Errors++;
        failureDetails.push(`W=${w}px (${drawer}): #vc-btn-home occluded! Hit target: ${state.hitHomeTag}`);
      }
    }
  }
  if (sec3Errors === 0) {
    console.log('  ✓ PASS: 670px-695px 1px micro-sweep (52 configurations): ZERO collisions, all buttons clickable.');
    totalPassed += 52;
  } else {
    console.log(`  ✗ FAIL: 670px-695px micro-sweep had ${sec3Errors} failures!`);
    totalFailed += sec3Errors;
  }

  // --- SECTION 4: Continuous Broad Sweep across 500px to 1600px (Step 25px) ---
  console.log('\n--- 4. Probing Continuous Broad Sweep across 500px to 1600px (Step 25px) ---');
  let sec4Errors = 0;
  let broadCount = 0;
  for (const drawer of ['closed', 'open']) {
    for (let w = 500; w <= 1600; w += 25) {
      broadCount++;
      const state = await getLayoutState(w, drawer);
      // Check: HUD vs VC
      const hudVc = aabbOverlap(state.hud, state.vc);
      if (hudVc.colliding) {
        sec4Errors++;
        failureDetails.push(`Broad W=${w}px (${drawer}): #hud-top-right overlaps #viewcube-container (ox=${hudVc.ox.toFixed(1)}, oy=${hudVc.oy.toFixed(1)})`);
      }
      // Check: HUD vs Toolbar
      const hudTb = aabbOverlap(state.hud, state.tb);
      if (hudTb.colliding) {
        sec4Errors++;
        failureDetails.push(`Broad W=${w}px (${drawer}): #hud-top-right overlaps .toolbar (ox=${hudTb.ox.toFixed(1)}, oy=${hudTb.oy.toFixed(1)})`);
      }
      // Check: Badge vs Toolbar
      const badgeTb = aabbOverlap(state.badge, state.tb);
      if (badgeTb.colliding) {
        sec4Errors++;
        failureDetails.push(`Broad W=${w}px (${drawer}): .hud-badge overlaps .toolbar (ox=${badgeTb.ox.toFixed(1)}, oy=${badgeTb.oy.toFixed(1)})`);
      }
      // Check: Hints bar vs Bottom controls
      if (state.hints && state.btnShortcuts) {
        const hintsShortcuts = aabbOverlap(state.hints, state.btnShortcuts);
        if (hintsShortcuts.colliding) {
          sec4Errors++;
          failureDetails.push(`Broad W=${w}px (${drawer}): #hints-bar overlaps #btn-toggle-shortcuts (ox=${hintsShortcuts.ox.toFixed(1)}, oy=${hintsShortcuts.oy.toFixed(1)})`);
        }
      }
      if (state.hints && state.bottomCluster) {
        const hintsCluster = aabbOverlap(state.hints, state.bottomCluster);
        if (hintsCluster.colliding) {
          sec4Errors++;
          failureDetails.push(`Broad W=${w}px (${drawer}): #hints-bar overlaps .bottom-hud-cluster (ox=${hintsCluster.ox.toFixed(1)}, oy=${hintsCluster.oy.toFixed(1)})`);
        }
      }
      // Hit testing
      if (!state.hitPerspOk) {
        sec4Errors++;
        failureDetails.push(`Broad W=${w}px (${drawer}): #vc-btn-persp occluded! Hit target: ${state.hitPerspTag}`);
      }
      if (!state.hitHomeOk) {
        sec4Errors++;
        failureDetails.push(`Broad W=${w}px (${drawer}): #vc-btn-home occluded! Hit target: ${state.hitHomeTag}`);
      }
      if (!state.hitShortcutsOk) {
        sec4Errors++;
        failureDetails.push(`Broad W=${w}px (${drawer}): #btn-toggle-shortcuts occluded! Hit target: ${state.hitShortcutsTag}`);
      }
    }
  }
  if (sec4Errors === 0) {
    console.log(`  ✓ PASS: Continuous broad sweep (${broadCount} configurations): ZERO collisions, all controls clickable.`);
    totalPassed += broadCount;
  } else {
    console.log(`  ✗ FAIL: Continuous broad sweep had ${sec4Errors} failures!`);
    totalFailed += sec4Errors;
  }

  // --- SECTION 5: Active Measure Mode Clearance Stress across Viewports ---
  console.log('\n--- 5. Active Measure Mode Clearance Stress across Viewports ---');
  let sec5Errors = 0;
  const measureViewports = [500, 520, 680, 768, 800, 960, 1024, 1250, 1265, 1280, 1440, 1600];
  for (const drawer of ['closed', 'open']) {
    for (const w of measureViewports) {
      const state = await getLayoutState(w, drawer, true);
      if (state.hints && state.bottomCluster) {
        const overlap = aabbOverlap(state.hints, state.bottomCluster);
        if (overlap.colliding) {
          sec5Errors++;
          failureDetails.push(`Measure W=${w}px (${drawer}): #hints-bar overlaps .bottom-hud-cluster (ox=${overlap.ox.toFixed(1)}, oy=${overlap.oy.toFixed(1)})`);
        }
      }
      if (!state.hitShortcutsOk) {
        sec5Errors++;
        failureDetails.push(`Measure W=${w}px (${drawer}): #btn-toggle-shortcuts occluded! Hit target: ${state.hitShortcutsTag}`);
      }
    }
  }

  if (sec5Errors === 0) {
    console.log(`  ✓ PASS: Active Measure Mode (${measureViewports.length * 2} configurations): ZERO collisions, controls 100% clickable.`);
    totalPassed += (measureViewports.length * 2);
  } else {
    console.log(`  ✗ FAIL: Active Measure Mode had ${sec5Errors} failures!`);
    totalFailed += sec5Errors;
  }

  // --- SECTION 6: Physical Clearance Sample Audit (Detailed Exact Metrics) ---
  console.log('\n--- 6. Representative Exact Clearance Measurements ---');
  const sampleWidths = [1280, 1266, 1265, 1250, 960, 768, 680, 520];
  for (const w of sampleWidths) {
    for (const drawer of ['closed', 'open']) {
      const s = await getLayoutState(w, drawer);
      let hudVcGap = '';
      if (s.hud.right <= s.vc.left) {
        hudVcGap = `Horiz +${(s.vc.left - s.hud.right).toFixed(1)}px`;
      } else if (s.vc.bottom <= s.hud.top) {
        hudVcGap = `Vert +${(s.hud.top - s.vc.bottom).toFixed(1)}px (Below VC)`;
      } else {
        hudVcGap = `Overlap! ox=${(s.hud.right - s.vc.left).toFixed(1)}`;
      }

      let hudTbGap = '';
      if (s.tb.right <= s.hud.left) {
        hudTbGap = `Horiz +${(s.hud.left - s.tb.right).toFixed(1)}px`;
      } else if (s.tb.bottom <= s.hud.top) {
        hudTbGap = `Vert +${(s.hud.top - s.tb.bottom).toFixed(1)}px (Below Toolbar)`;
      } else {
        hudTbGap = `Overlap! ox=${(s.tb.right - s.hud.left).toFixed(1)}`;
      }

      console.log(`  W=${w}px [${drawer.toUpperCase()}]: HUD vs VC: ${hudVcGap} | HUD vs Toolbar: ${hudTbGap}`);
    }
  }

  console.log('\n========================================================================');
  console.log(` TOTAL ASSERTIONS PASSED: ${totalPassed}`);
  console.log(` TOTAL ASSERTIONS FAILED: ${totalFailed}`);
  if (totalFailed > 0) {
    console.log(' FAILURE DETAILS:');
    failureDetails.forEach(f => console.log('  - ' + f));
    console.log(' FINAL VERDICT: REQUEST_CHANGES');
  } else {
    console.log(' FINAL VERDICT: APPROVE');
  }
  console.log('========================================================================');

  // Teardown
  ws.close();
  cp.kill();
  server.close();

  if (totalFailed > 0) {
    process.exit(1);
  }
}


run().catch(err => {
  console.error('Test harness execution failed:', err);
  process.exit(1);
});
