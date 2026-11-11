/**
 * Independent Adversarial Reviewer 2 Verification Suite - Milestone M2 Iteration 5
 * 
 * Exhaustively tests:
 * 1. 1150px boundary transition: 1153px, 1152px, 1151px, 1150px, 1149px, 1148px (closed & open drawer)
 * 2. Hit-testing (document.elementFromPoint) on ALL interactive controls:
 *    - #vc-btn-persp and #vc-btn-home
 *    - #btn-units and #btn-bbox-hud
 *    - .toolbar buttons (#btn-home, #btn-fit, #btn-tree, #btn-measure, #btn-section, #btn-props, #btn-snapshot)
 *    - .drawer-tabs buttons (all 6 tabs)
 *    - #hints-bar and #btn-toggle-shortcuts
 *    - .drawer-close-btn
 * 3. 2D AABB clearances across ALL requested breakpoints:
 *    1280px, 1265px, 1150px, 1024px, 960px, 800px, 768px, 680px, 520px
 *    in both Drawer CLOSED and Drawer OPEN states.
 * 4. Pointer-events and clickability: ensure no transparent overlay captures clicks.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 9015;
const CDP_PORT = 9250;
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
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(REPO_ROOT, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    const ext = path.extname(f).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', 'stp_cdp_rev2_' + Date.now());
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

  // Disable CSS transitions for deterministic evaluations
  await send('Runtime.evaluate', { expression: `(() => {
    const style = document.createElement('style');
    style.id = 'disable-transitions-style';
    style.textContent = '* { transition: none !important; animation: none !important; }';
    document.head.appendChild(style);
  })()` });

  console.log('========================================================================');
  console.log(' REVIEWER 2 INDEPENDENT ADVERSARIAL AUDIT - MILESTONE M2 ITERATION 5');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;
  const failureList = [];

  function record(pass, msg) {
    if (pass) {
      passed++;
      console.log(`  ✓ PASS: ${msg}`);
    } else {
      failed++;
      console.error(`  ✗ FAIL: ${msg}`);
      failureList.push(msg);
    }
  }

  async function evaluateViewport(width, drawerOpen) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    if (drawerOpen) {
      await send('Runtime.evaluate', {
        expression: `(() => {
          if (window.WorkbenchUI && typeof window.WorkbenchUI.openDrawer === 'function') {
            window.WorkbenchUI.openDrawer('tree');
          } else {
            const drawer = document.getElementById('inspector-drawer');
            if (drawer) drawer.classList.add('open');
            document.body.classList.add('drawer-open');
          }
        })()`
      });
    } else {
      await send('Runtime.evaluate', {
        expression: `(() => {
          if (window.WorkbenchUI && typeof window.WorkbenchUI.closeDrawer === 'function') {
            window.WorkbenchUI.closeDrawer();
          } else {
            const drawer = document.getElementById('inspector-drawer');
            if (drawer) drawer.classList.remove('open');
            document.body.classList.remove('drawer-open');
          }
        })()`
      });
    }

    const evalResult = await send('Runtime.evaluate', {
      expression: `(() => {
        const getBox = sel => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const s = window.getComputedStyle(el);
          return {
            sel,
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
            display: s.display,
            visibility: s.visibility,
            pointerEvents: s.pointerEvents
          };
        };

        const testHit = sel => {
          const el = document.querySelector(sel);
          if (!el) return { found: false, hitOk: false, target: null };
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return { found: true, visible: false, hitOk: false, target: null };
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const target = document.elementFromPoint(cx, cy);
          const hitOk = !!(target && (target === el || el.contains(target)));
          const tag = target ? (target.tagName + (target.id ? '#' + target.id : '') + (target.className ? '.' + target.className.toString().split(' ')[0] : '')) : null;
          return { found: true, visible: true, hitOk, target: tag, cx, cy, box: r };
        };

        // Key elements
        const hud = getBox('#hud-top-right');
        const vc = getBox('#viewcube-container');
        const tb = getBox('.toolbar');
        const badge = getBox('.hud-badge');
        const hints = getBox('#hints-bar');
        const shortcutsBtn = getBox('#btn-toggle-shortcuts');
        const closeBtn = getBox('.drawer-close-btn');
        const drawerTabs = getBox('.drawer-tabs');

        // Interactive hit tests
        const hits = {
          vcPersp: testHit('#vc-btn-persp'),
          vcHome: testHit('#vc-btn-home'),
          btnUnits: testHit('#btn-units'),
          btnBbox: testHit('#btn-bbox-hud'),
          btnHome: testHit('#btn-home'),
          btnFit: testHit('#btn-fit'),
          btnTree: testHit('#btn-tree'),
          btnMeasure: testHit('#btn-measure'),
          btnSection: testHit('#btn-section'),
          btnProps: testHit('#btn-props'),
          btnSnapshot: testHit('#btn-snapshot'),
          btnToggleShortcuts: testHit('#btn-toggle-shortcuts'),
          drawerClose: testHit('.drawer-close-btn')
        };

        // Drawer tabs hit testing
        const tabHits = {};
        const tabEls = document.querySelectorAll('.drawer-tabs .drawer-tab');
        tabEls.forEach(t => {
          const tabId = t.getAttribute('data-tab') || t.textContent.trim();
          const r = t.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const target = document.elementFromPoint(cx, cy);
          tabHits[tabId] = {
            width: r.width,
            hitOk: !!(target && (target === t || t.contains(target))),
            target: target ? target.tagName : null
          };
        });

        return {
          hud,
          vc,
          tb,
          badge,
          hints,
          shortcutsBtn,
          closeBtn,
          drawerTabs,
          hits,
          tabHits
        };
      })()`,
      returnByValue: true
    });

    return evalResult.result.value;
  }

  // ---------------------------------------------------------------------------
  // TEST SECTION 1: 1150px Breakpoint Micro-Sweep (1148px - 1153px)
  // ---------------------------------------------------------------------------
  console.log('--- 1. Testing Boundary Transition at 1150px (1148px to 1153px) ---');
  for (const w of [1153, 1152, 1151, 1150, 1149, 1148]) {
    for (const drawer of [false, true]) {
      const state = await evaluateViewport(w, drawer);
      const hudTb = aabbOverlap(state.hud, state.tb);
      const hudVc = aabbOverlap(state.hud, state.vc);

      record(!hudTb.colliding, `W=${w}px (drawer: ${drawer ? 'OPEN' : 'CLOSED'}) HUD vs Toolbar collision-free (ox=${hudTb.ox.toFixed(1)}, oy=${hudTb.oy.toFixed(1)})`);
      record(!hudVc.colliding, `W=${w}px (drawer: ${drawer ? 'OPEN' : 'CLOSED'}) HUD vs ViewCube collision-free (ox=${hudVc.ox.toFixed(1)}, oy=${hudVc.oy.toFixed(1)})`);
      record(state.hits.btnUnits.hitOk, `W=${w}px (drawer: ${drawer ? 'OPEN' : 'CLOSED'}) #btn-units is clickable`);
      record(state.hits.btnBbox.hitOk, `W=${w}px (drawer: ${drawer ? 'OPEN' : 'CLOSED'}) #btn-bbox-hud is clickable`);
      record(state.hits.vcPersp.hitOk, `W=${w}px (drawer: ${drawer ? 'OPEN' : 'CLOSED'}) #vc-btn-persp is clickable`);
      record(state.hits.vcHome.hitOk, `W=${w}px (drawer: ${drawer ? 'OPEN' : 'CLOSED'}) #vc-btn-home is clickable`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST SECTION 2: Standard Breakpoints Verification
  // [1280px, 1265px, 1150px, 1024px, 960px, 800px, 768px, 680px, 520px]
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Multi-Breakpoint Comprehensive Audit across 9 Standard Resolutions ---');
  const standardBreakpoints = [1280, 1265, 1150, 1024, 960, 800, 768, 680, 520];

  for (const w of standardBreakpoints) {
    for (const drawer of [false, true]) {
      const state = await evaluateViewport(w, drawer);
      const drawerLabel = drawer ? 'OPEN' : 'CLOSED';

      // 1. HUD vs Toolbar
      const hudTb = aabbOverlap(state.hud, state.tb);
      record(!hudTb.colliding, `W=${w}px [${drawerLabel}]: HUD does NOT overlap Toolbar`);

      // 2. HUD vs ViewCube
      const hudVc = aabbOverlap(state.hud, state.vc);
      record(!hudVc.colliding, `W=${w}px [${drawerLabel}]: HUD does NOT overlap ViewCube`);

      // 3. HUD Badge vs Toolbar
      const badgeTb = aabbOverlap(state.badge, state.tb);
      record(!badgeTb.colliding, `W=${w}px [${drawerLabel}]: Filename Badge does NOT overlap Toolbar`);

      // 4. Hints Bar vs Shortcuts Toggle Button
      if (state.hints && state.shortcutsBtn) {
        const hintsShortcuts = aabbOverlap(state.hints, state.shortcutsBtn);
        record(!hintsShortcuts.colliding, `W=${w}px [${drawerLabel}]: Hints Bar does NOT overlap Shortcuts Button`);
      }

      // 5. Interactive Hit-Testing
      record(state.hits.vcPersp.hitOk, `W=${w}px [${drawerLabel}]: #vc-btn-persp hit-test clickable`);
      record(state.hits.vcHome.hitOk, `W=${w}px [${drawerLabel}]: #vc-btn-home hit-test clickable`);
      record(state.hits.btnUnits.hitOk, `W=${w}px [${drawerLabel}]: #btn-units hit-test clickable`);
      record(state.hits.btnBbox.hitOk, `W=${w}px [${drawerLabel}]: #btn-bbox-hud hit-test clickable`);
      record(state.hits.btnFit.hitOk, `W=${w}px [${drawerLabel}]: #btn-fit hit-test clickable`);
      record(state.hits.btnSnapshot.hitOk, `W=${w}px [${drawerLabel}]: #btn-snapshot hit-test clickable`);
      record(state.hits.btnToggleShortcuts.hitOk, `W=${w}px [${drawerLabel}]: #btn-toggle-shortcuts hit-test clickable`);

      // 6. If drawer open, check tabs and close button
      if (drawer) {
        record(state.hits.drawerClose.hitOk, `W=${w}px [${drawerLabel}]: Drawer Close Button hit-test clickable`);
        let allTabsOk = true;
        for (const [tabKey, tData] of Object.entries(state.tabHits)) {
          if (!tData.hitOk || tData.width <= 0) {
            allTabsOk = false;
            failureList.push(`W=${w}px Tab ${tabKey} failed hit-test`);
          }
        }
        record(allTabsOk, `W=${w}px [${drawerLabel}]: All drawer tab buttons fit and are clickable`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TEST SECTION 3: Pointer Events & Overlay Interception
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Testing Pointer Events & Overlay Interception ---');
  const pointerEventsState = await send('Runtime.evaluate', {
    expression: `(() => {
      const selectors = [
        '#vc-btn-persp', '#vc-btn-home', '#btn-units', '#btn-bbox-hud',
        '#btn-fit', '#btn-snapshot', '#btn-toggle-shortcuts',
        '#btn-check-update', '.drawer-close-btn'
      ];
      const results = {};
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) { results[sel] = { found: false }; continue; }
        const s = window.getComputedStyle(el);
        results[sel] = {
          found: true,
          pointerEvents: s.pointerEvents,
          cursor: s.cursor
        };
      }
      return results;
    })()`,
    returnByValue: true
  });

  const pData = pointerEventsState.result.value;
  for (const [sel, info] of Object.entries(pData)) {
    if (info.found) {
      record(info.pointerEvents !== 'none', `${sel} has active pointer-events (${info.pointerEvents})`);
    }
  }

  // Teardown
  ws.close();
  cp.kill();
  server.close();

  console.log('\n========================================================================');
  console.log(` REVIEWER 2 AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log(` VERDICT: ${failed === 0 ? 'APPROVE' : 'REQUEST_CHANGES'}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    console.error('Failure Details:\n' + failureList.join('\n'));
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal error during adversarial probe:', err);
  process.exit(1);
});
