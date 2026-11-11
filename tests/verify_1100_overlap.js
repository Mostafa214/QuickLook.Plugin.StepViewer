const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function test() {
  const PORT = 8992;
  const CDP_PORT = 9225;
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
    '--window-size=1100,800',
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

  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });

  // Inject long filename and dimensions
  await send('Runtime.evaluate', { expression: `(() => {
    document.getElementById('badge-filename').textContent = 'Turbine_Blade_Assembly_Stage4_HighPressure_Superalloy_Inconel718_RevG.step';
    document.getElementById('badge-dim').style.display = 'flex';
    document.getElementById('dim-text').textContent = '3428.7 × 1980.2 × 945.1 mm';
    document.getElementById('badge-status').style.display = 'none';
  })()` });
  await new Promise(r => setTimeout(r, 500));

  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const tb = document.querySelector('.toolbar').getBoundingClientRect();
      const bd = document.querySelector('.hud-badge').getBoundingClientRect();
      return {
        tb: { x: tb.x, y: tb.y, width: tb.width, height: tb.height, right: tb.right, bottom: tb.bottom },
        bd: { x: bd.x, y: bd.y, width: bd.width, height: bd.height, right: bd.right, bottom: bd.bottom },
        overlapX: Math.max(0, Math.min(tb.right, bd.right) - Math.max(tb.x, bd.x)),
        overlapY: Math.max(0, Math.min(tb.bottom, bd.bottom) - Math.max(tb.y, bd.y))
      };
    })()`,
    returnByValue: true
  });

  console.log('MEASURED 1100px CLOSED RESULT:\n', JSON.stringify(result.result.value, null, 2));

  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(REPO_ROOT, 'tests/screenshot_1100_drawer_closed.png'), Buffer.from(screenshot.data, 'base64'));
  console.log('Saved screenshot to tests/screenshot_1100_drawer_closed.png');

  ws.close();
  cp.kill();
  server.close();
}
test().catch(console.error);
