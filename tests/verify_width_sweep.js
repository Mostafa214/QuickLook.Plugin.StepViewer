const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function test() {
  const PORT = 8990;
  const CDP_PORT = 9223;
  const REPO_ROOT = path.resolve(__dirname, '..');
  const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');
  
  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/viewer.html';
    let f = path.join(ASSETS_DIR, p);
    if (!fs.existsSync(f)) f = path.join(REPO_ROOT, p);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200);
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', 'stp_cdp_test_' + Date.now());
  const cp = spawn(chromePath, [
    '--remote-debugging-port=' + CDP_PORT,
    '--headless=new',
    '--user-data-dir=' + userDataDir,
    '--window-size=1280,800',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 1000));
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

  // Set model loaded with long filename and dimensions
  await send('Runtime.evaluate', { expression: `(() => {
    document.getElementById('badge-filename').textContent = 'Turbine_Blade_Assembly_Stage4_HighPressure_Superalloy_Inconel718_RevG.step';
    document.getElementById('badge-dim').style.display = 'flex';
    document.getElementById('dim-text').textContent = '3428.7 × 1980.2 × 945.1 mm';
    document.getElementById('badge-status').style.display = 'none';
  })()` });

  const widths = [1280, 1200, 1150, 1100, 1050, 1000, 960];
  console.log('Testing widths in CLOSED state:');
  for (const w of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 200));

    const result = await send('Runtime.evaluate', {
      expression: `(() => {
        const tb = document.querySelector('.toolbar').getBoundingClientRect();
        const bd = document.querySelector('.hud-badge').getBoundingClientRect();
        return {
          tbLeft: tb.x,
          tbRight: tb.right,
          tbWidth: tb.width,
          bdLeft: bd.x,
          bdRight: bd.right,
          bdWidth: bd.width,
          bdY: bd.y,
          tbY: tb.y,
          overlapX: (bd.right > tb.x && tb.right > bd.x) ? (bd.right - tb.x) : 0,
          isCollision: (bd.right > tb.x && tb.right > bd.x && bd.bottom > tb.y && tb.bottom > bd.y)
        };
      })()`,
      returnByValue: true
    });
    const d = result.result.value;
    console.log(`  Width ${w}px: Toolbar=[${d.tbLeft.toFixed(1)}..${d.tbRight.toFixed(1)}, w=${d.tbWidth.toFixed(1)}] | Badge=[${d.bdLeft.toFixed(1)}..${d.bdRight.toFixed(1)}, y=${d.bdY.toFixed(1)}] | OverlapX=${d.overlapX.toFixed(1)}px | Collision=${d.isCollision}`);
  }

  console.log('\nTesting widths in OPEN state:');
  await send('Runtime.evaluate', { expression: `(() => {
    document.getElementById('inspector-drawer').classList.add('open');
    document.body.classList.add('drawer-open');
  })()` });
  await new Promise(r => setTimeout(r, 400));

  for (const w of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 200));

    const result = await send('Runtime.evaluate', {
      expression: `(() => {
        const tb = document.querySelector('.toolbar').getBoundingClientRect();
        const bd = document.querySelector('.hud-badge').getBoundingClientRect();
        return {
          tbLeft: tb.x,
          tbRight: tb.right,
          tbBottom: tb.bottom,
          bdLeft: bd.x,
          bdRight: bd.right,
          bdY: bd.y,
          bdBottom: bd.bottom,
          isCollision: (bd.right > tb.x && tb.right > bd.x && bd.bottom > tb.y && tb.bottom > bd.y)
        };
      })()`,
      returnByValue: true
    });
    const d = result.result.value;
    console.log(`  Width ${w}px OPEN: Toolbar=[${d.tbLeft.toFixed(1)}..${d.tbRight.toFixed(1)}, y=${d.tbBottom - 52}..${d.tbBottom.toFixed(1)}] | Badge=[${d.bdLeft.toFixed(1)}..${d.bdRight.toFixed(1)}, y=${d.bdY.toFixed(1)}..${d.bdBottom.toFixed(1)}] | Collision=${d.isCollision}`);
  }

  ws.close();
  cp.kill();
  server.close();
}
test().catch(console.error);
