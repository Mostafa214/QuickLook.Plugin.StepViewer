/**
 * Challenger M3-2: Multi-Viewport Layout Boundary Empirical Stress Suite
 * 
 * Objective:
 * Empirically stress-test responsive layout boundaries:
 * 1. Continuous 1px micro-sweeps across:
 *    - 1250px–1380px (specifically probing 1265px, 1266px, 1280px, 1360px, 1361px)
 *    - 950px–975px
 *    - 670px–695px
 *    - 500px–1600px continuous sweep
 * 2. Assert zero 2D AABB overlap/collision between:
 *    - #toolbar-dock / .toolbar and #hud-top-right
 *    - #toolbar-dock and #badge-filename
 *    - #hud-top-right and #viewcube-container
 *    - In both drawer-closed and drawer-open states.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 9015;
const CDP_PORT = 9245;
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
  if (!bA || !bB) return { colliding: false, ox: 0, oy: 0 };
  if (bA.width === 0 || bA.height === 0 || bB.width === 0 || bB.height === 0) {
    return { colliding: false, ox: 0, oy: 0 };
  }
  const ox = Math.max(0, Math.min(bA.right, bB.right) - Math.max(bA.left, bB.left));
  const oy = Math.max(0, Math.min(bA.bottom, bB.bottom) - Math.max(bA.top, bB.top));
  return {
    colliding: (ox > 0.05 && oy > 0.05),
    ox,
    oy
  };
}

function computeClearance(boxA, boxB) {
  if (!boxA || !boxB) return { clearance: 9999, type: 'none', colliding: false };
  const horizSep = (boxA.right <= boxB.left)
    ? (boxB.left - boxA.right)
    : (boxB.right <= boxA.left)
      ? (boxA.left - boxB.right)
      : -(Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left));

  const vertSep = (boxA.bottom <= boxB.top)
    ? (boxB.top - boxA.bottom)
    : (boxB.bottom <= boxA.top)
      ? (boxA.top - boxB.bottom)
      : -(Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top));

  if (horizSep > 0.05) return { clearance: horizSep, type: 'horizontal', colliding: false };
  if (vertSep > 0.05) return { clearance: vertSep, type: 'vertical', colliding: false };
  return { clearance: Math.max(horizSep, vertSep), type: 'collision', colliding: true };
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
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', 'stp_cdp_m3_2_' + Date.now());
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

  // Disable CSS transitions & animations for instantaneous deterministic layout measurement
  await send('Runtime.evaluate', { expression: `(() => {
    const style = document.createElement('style');
    style.id = 'disable-transitions-style';
    style.textContent = '* { transition: none !important; animation: none !important; }';
    document.head.appendChild(style);
  })()` });

  console.log('========================================================================');
  console.log('  CHALLENGER M3-2: MULTI-VIEWPORT LAYOUT EMPIRICAL STRESS HARNESS        ');
  console.log('========================================================================\n');

  let totalConfigurations = 0;
  let totalCollisions = 0;
  const collisionLog = [];
  const probeMetrics = {};

  async function evaluateLayout(width, drawerState) {
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

    const evalResult = await send('Runtime.evaluate', {
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

        const tb = getBox('#toolbar-dock') || getBox('.toolbar');
        const hud = getBox('#hud-top-right');
        const badge = getBox('.hud-badge');
        const badgeFilename = getBox('#badge-filename');
        const vc = getBox('#viewcube-container');
        const btnAnalysis = getBox('#btn-analysis');
        const btnPersp = getBox('#vc-btn-persp');

        const elAtPoint = (b) => {
          if (!b || b.width <= 0 || b.height <= 0) return null;
          const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          if (!el) return null;
          return el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).trim().split(/\\s+/).join('.') : '');
        };

        return {
          tb,
          hud,
          badge,
          badgeFilename,
          vc,
          btnAnalysis,
          btnPersp,
          hitAnalysis: elAtPoint(btnAnalysis),
          hitPersp: elAtPoint(btnPersp)
        };
      })()`,
      returnByValue: true
    });

    return evalResult.result.value;
  }

  function checkLayout(w, drawer, state, sectionName) {
    totalConfigurations++;
    const { tb, hud, badge, badgeFilename, vc } = state;

    // 1. Toolbar vs HUD
    const collTbHud = aabbOverlap(tb, hud);
    if (collTbHud.colliding) {
      totalCollisions++;
      collisionLog.push(`[${sectionName}] W=${w}px (${drawer}): #toolbar-dock OVERLAPS #hud-top-right (ox=${collTbHud.ox.toFixed(2)}px, oy=${collTbHud.oy.toFixed(2)}px)`);
    }

    // 2. Toolbar vs Badge Filename
    const collTbFilename = aabbOverlap(tb, badgeFilename);
    if (collTbFilename.colliding) {
      totalCollisions++;
      collisionLog.push(`[${sectionName}] W=${w}px (${drawer}): #toolbar-dock OVERLAPS #badge-filename (ox=${collTbFilename.ox.toFixed(2)}px, oy=${collTbFilename.oy.toFixed(2)}px)`);
    }

    // 2b. Toolbar vs 전체 Badge (hud-badge container)
    const collTbBadge = aabbOverlap(tb, badge);
    if (collTbBadge.colliding) {
      totalCollisions++;
      collisionLog.push(`[${sectionName}] W=${w}px (${drawer}): #toolbar-dock OVERLAPS .hud-badge (ox=${collTbBadge.ox.toFixed(2)}px, oy=${collTbBadge.oy.toFixed(2)}px)`);
    }

    // 3. HUD vs ViewCube
    const collHudVc = aabbOverlap(hud, vc);
    if (collHudVc.colliding) {
      totalCollisions++;
      collisionLog.push(`[${sectionName}] W=${w}px (${drawer}): #hud-top-right OVERLAPS #viewcube-container (ox=${collHudVc.ox.toFixed(2)}px, oy=${collHudVc.oy.toFixed(2)}px)`);
    }

    return {
      tbVsHud: computeClearance(tb, hud),
      tbVsBadge: computeClearance(badge, tb),
      tbVsFilename: computeClearance(badgeFilename, tb),
      hudVsVc: computeClearance(hud, vc)
    };
  }

  // =========================================================================
  // SWEEP 1: 1250px - 1380px continuous 1px micro-sweep
  // Specifically probing: 1265px, 1266px, 1280px, 1360px, 1361px
  // =========================================================================
  console.log('--- SWEEP 1: Continuous 1px Micro-Sweep across 1250px - 1380px (131px * 2 states) ---');
  let s1CollisionsBefore = totalCollisions;
  const probeTargets = [1250, 1265, 1266, 1280, 1360, 1361, 1380];

  for (const drawer of ['closed', 'open']) {
    for (let w = 1250; w <= 1380; w++) {
      const state = await evaluateLayout(w, drawer);
      const clearances = checkLayout(w, drawer, state, '1250-1380px');
      if (probeTargets.includes(w)) {
        probeMetrics[`${w}_${drawer}`] = {
          w,
          drawer,
          clearances,
          tb: state.tb,
          hud: state.hud,
          badge: state.badge,
          vc: state.vc
        };
      }
    }
  }

  const s1Collisions = totalCollisions - s1CollisionsBefore;
  if (s1Collisions === 0) {
    console.log(`  ✓ PASS: 1250px-1380px 1px continuous sweep (262 configs): ZERO COLLISIONS!`);
  } else {
    console.log(`  ✗ FAIL: 1250px-1380px 1px continuous sweep had ${s1Collisions} collisions!`);
  }

  // =========================================================================
  // SWEEP 2: 950px - 975px continuous 1px micro-sweep
  // =========================================================================
  console.log('\n--- SWEEP 2: Continuous 1px Micro-Sweep across 950px - 975px (26px * 2 states) ---');
  let s2CollisionsBefore = totalCollisions;
  for (const drawer of ['closed', 'open']) {
    for (let w = 950; w <= 975; w++) {
      const state = await evaluateLayout(w, drawer);
      const clearances = checkLayout(w, drawer, state, '950-975px');
      if (w === 960) {
        probeMetrics[`${w}_${drawer}`] = {
          w,
          drawer,
          clearances,
          tb: state.tb,
          hud: state.hud,
          badge: state.badge,
          vc: state.vc
        };
      }
    }
  }

  const s2Collisions = totalCollisions - s2CollisionsBefore;
  if (s2Collisions === 0) {
    console.log(`  ✓ PASS: 950px-975px 1px continuous sweep (52 configs): ZERO COLLISIONS!`);
  } else {
    console.log(`  ✗ FAIL: 950px-975px 1px continuous sweep had ${s2Collisions} collisions!`);
  }

  // =========================================================================
  // SWEEP 3: 670px - 695px continuous 1px micro-sweep
  // =========================================================================
  console.log('\n--- SWEEP 3: Continuous 1px Micro-Sweep across 670px - 695px (26px * 2 states) ---');
  let s3CollisionsBefore = totalCollisions;
  for (const drawer of ['closed', 'open']) {
    for (let w = 670; w <= 695; w++) {
      const state = await evaluateLayout(w, drawer);
      const clearances = checkLayout(w, drawer, state, '670-695px');
      if (w === 680) {
        probeMetrics[`${w}_${drawer}`] = {
          w,
          drawer,
          clearances,
          tb: state.tb,
          hud: state.hud,
          badge: state.badge,
          vc: state.vc
        };
      }
    }
  }

  const s3Collisions = totalCollisions - s3CollisionsBefore;
  if (s3Collisions === 0) {
    console.log(`  ✓ PASS: 670px-695px 1px continuous sweep (52 configs): ZERO COLLISIONS!`);
  } else {
    console.log(`  ✗ FAIL: 670px-695px 1px continuous sweep had ${s3Collisions} collisions!`);
  }

  // =========================================================================
  // SWEEP 4: 500px - 1600px continuous 1px sweep (1101 viewports * 2 states = 2202 configs)
  // =========================================================================
  console.log('\n--- SWEEP 4: Continuous 1px Sweep across 500px - 1600px (1101px * 2 states) ---');
  const startTime = Date.now();
  let s4CollisionsBefore = totalCollisions;
  for (const drawer of ['closed', 'open']) {
    for (let w = 500; w <= 1600; w++) {
      const state = await evaluateLayout(w, drawer);
      checkLayout(w, drawer, state, '500-1600px');
    }
  }
  const s4Duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const s4Collisions = totalCollisions - s4CollisionsBefore;
  if (s4Collisions === 0) {
    console.log(`  ✓ PASS: 500px-1600px 1px continuous sweep (2,202 configs, completed in ${s4Duration}s): ZERO COLLISIONS!`);
  } else {
    console.log(`  ✗ FAIL: 500px-1600px 1px continuous sweep had ${s4Collisions} collisions!`);
  }

  // =========================================================================
  // Detailed Probe Metrics Display
  // =========================================================================
  console.log('\n========================================================================');
  console.log('  EXPLICIT PROBE TARGET PHYSICAL CLEARANCES (CHROME REAL MEASUREMENTS)  ');
  console.log('========================================================================');
  for (const key of Object.keys(probeMetrics)) {
    const p = probeMetrics[key];
    console.log(`\nProbe W=${p.w}px [${p.drawer.toUpperCase()}]:`);
    console.log(`  Toolbar box: [left=${p.tb.left.toFixed(1)}, right=${p.tb.right.toFixed(1)}, top=${p.tb.top.toFixed(1)}, bot=${p.tb.bottom.toFixed(1)}, width=${p.tb.width.toFixed(1)}]`);
    console.log(`  HUD box:     [left=${p.hud.left.toFixed(1)}, right=${p.hud.right.toFixed(1)}, top=${p.hud.top.toFixed(1)}, bot=${p.hud.bottom.toFixed(1)}, width=${p.hud.width.toFixed(1)}]`);
    console.log(`  Badge box:   [left=${p.badge.left.toFixed(1)}, right=${p.badge.right.toFixed(1)}, top=${p.badge.top.toFixed(1)}, bot=${p.badge.bottom.toFixed(1)}, width=${p.badge.width.toFixed(1)}]`);
    console.log(`  ViewCube box:[left=${p.vc.left.toFixed(1)}, right=${p.vc.right.toFixed(1)}, top=${p.vc.top.toFixed(1)}, bot=${p.vc.bottom.toFixed(1)}, width=${p.vc.width.toFixed(1)}]`);
    console.log(`  Clearances:`);
    console.log(`    - Toolbar vs HUD:      ${p.clearances.tbVsHud.clearance >= 0 ? '+' : ''}${p.clearances.tbVsHud.clearance.toFixed(1)}px (${p.clearances.tbVsHud.type}) ${p.clearances.tbVsHud.colliding ? 'COLLIDING!' : 'SAFE'}`);
    console.log(`    - Toolbar vs Badge:    ${p.clearances.tbVsBadge.clearance >= 0 ? '+' : ''}${p.clearances.tbVsBadge.clearance.toFixed(1)}px (${p.clearances.tbVsBadge.type}) ${p.clearances.tbVsBadge.colliding ? 'COLLIDING!' : 'SAFE'}`);
    console.log(`    - Toolbar vs Filename: ${p.clearances.tbVsFilename.clearance >= 0 ? '+' : ''}${p.clearances.tbVsFilename.clearance.toFixed(1)}px (${p.clearances.tbVsFilename.type}) ${p.clearances.tbVsFilename.colliding ? 'COLLIDING!' : 'SAFE'}`);
    console.log(`    - HUD vs ViewCube:     ${p.clearances.hudVsVc.clearance >= 0 ? '+' : ''}${p.clearances.hudVsVc.clearance.toFixed(1)}px (${p.clearances.hudVsVc.type}) ${p.clearances.hudVsVc.colliding ? 'COLLIDING!' : 'SAFE'}`);
  }

  // =========================================================================
  // FINAL SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  console.log(` TOTAL CONFIGURATIONS TESTED: ${totalConfigurations}`);
  console.log(` TOTAL 2D AABB COLLISIONS:   ${totalCollisions}`);
  if (collisionLog.length > 0) {
    console.log('\nCOLLISION DETAILS:');
    collisionLog.slice(0, 20).forEach(c => console.log('  ' + c));
    if (collisionLog.length > 20) {
      console.log(`  ... and ${collisionLog.length - 20} more collisions.`);
    }
  }
  const verdict = totalCollisions === 0 ? 'APPROVE' : 'REQUEST_CHANGES';
  console.log(` FINAL VERDICT:              ${verdict}`);
  console.log('========================================================================\n');

  // Teardown
  ws.close();
  cp.kill();
  server.close();

  if (totalCollisions > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
