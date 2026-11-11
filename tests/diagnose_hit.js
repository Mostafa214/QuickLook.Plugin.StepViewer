const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function test() {
  const PORT = 9011;
  const CDP_PORT = 9246;
  const REPO_ROOT = process.cwd();
  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/viewer.html';
    let f = path.join(REPO_ROOT, 'Assets', p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(REPO_ROOT, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200);
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(process.env.TEMP, 'stp_cdp_diag_' + Date.now());
  const cp = spawn(chromePath, [
    '--remote-debugging-port=' + CDP_PORT,
    '--headless=new',
    '--user-data-dir=' + userDataDir,
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 1200));
  const res = await fetch('http://127.0.0.1:' + CDP_PORT + '/json');
  const list = await res.json();
  const page = list.find(p => p.type === 'page');
  const ws = new (globalThis.WebSocket)(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const send = (m, p={}) => new Promise((resolve) => {
    const id = msgId++;
    const handler = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === id) {
        ws.removeEventListener('message', handler);
        resolve(d.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });

  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/viewer.html' });
  await new Promise(r => setTimeout(r, 1500));

  const diag = await send('Runtime.evaluate', {
    expression: `(() => {
      const bAna = document.querySelector('#btn-analysis');
      const bClose = document.querySelector('.drawer-close-btn');
      
      const inspect = (el, name) => {
        if (!el) return { name, exists: false };
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        return {
          name,
          exists: true,
          box: { left: r.left, top: r.top, width: r.width, height: r.height },
          center: { cx, cy },
          hitTarget: hit ? {
            tagName: hit.tagName,
            id: hit.id,
            className: typeof hit.className === 'string' ? hit.className : String(hit.className),
            outerHTML: hit.outerHTML.slice(0, 120)
          } : null,
          contains: el === hit || el.contains(hit),
          parent: el.parentElement.tagName + '#' + el.parentElement.id
        };
      };

      return {
        btnAnalysis: inspect(bAna, '#btn-analysis'),
        drawerClose: inspect(bClose, '.drawer-close-btn')
      };
    })()`,
    returnByValue: true
  });

  console.log(JSON.stringify(diag.result.value, null, 2));

  ws.close();
  cp.kill();
  server.close();
}
test();
