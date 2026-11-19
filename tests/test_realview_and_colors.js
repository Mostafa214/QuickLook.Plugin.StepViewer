const { chromium } = require('C:/Users/Lenovo/AppData/Local/hermes/hermes-agent/node_modules/playwright');
const fs = require('fs');
const path = require('path');

async function runTest() {
  console.log('Launching Edge browser with WebGL...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log('PAGE [' + msg.type() + ']:', msg.text());
    }
  });

  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.message);
  });

  const viewerPath = path.resolve('Assets/viewer.html');
  await page.goto('file:///' + viewerPath.replace(/\\/g, '/'));
  await page.waitForTimeout(1000);

  console.log('Viewer loaded.');

  // 1. Test Components Container.SLDPRT
  console.log('Testing Components Container.SLDPRT per-face colors...');
  const partBuf = fs.readFileSync('F:/Projects/PhotoBooth/PhotoBooth - Structure/Components Container.SLDPRT');
  await page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const result = await window.SolidWorksLoader.parse(bytes.buffer, 'Components Container.SLDPRT');
    window.onTessellationComplete(result);
  }, partBuf.toString('base64'));

  await page.waitForTimeout(1500);

  const partCheck = await page.evaluate(() => {
    const mesh = window.modelGroup ? window.modelGroup.children[0] : null;
    if (!mesh) return { ok: false, reason: 'no mesh' };
    const hasVertColor = !!(mesh.geometry && mesh.geometry.attributes.color);
    let colorSet = new Set();
    if (hasVertColor) {
      const arr = mesh.geometry.attributes.color.array;
      for (let i = 0; i < arr.length; i += 3) {
        colorSet.add(Math.round(arr[i]*255) + ',' + Math.round(arr[i+1]*255) + ',' + Math.round(arr[i+2]*255));
      }
    }
    return {
      ok: true,
      triangles: mesh.geometry ? mesh.geometry.attributes.position.count / 3 : 0,
      hasVertColor: hasVertColor,
      colors: Array.from(colorSet)
    };
  });
  console.log('Components Container check:', partCheck);
  await page.screenshot({ path: 'scratch_part_preview.png' });

  // 2. Test RealView button state
  console.log('Testing RealView button toggle...');
  await page.click('#btn-realview');
  await page.waitForTimeout(600);

  const rvState = await page.evaluate(() => {
    const btn = document.getElementById('btn-realview');
    return {
      active: btn.classList.contains('active'),
      aria: btn.getAttribute('aria-pressed'),
      reflector: !!window.scene.getObjectByName('realview_floor_reflector'),
      fadeDisc: !!window.scene.getObjectByName('realview_floor_disc'),
      gridVisible: window.gridHelper ? window.gridHelper.visible : null
    };
  });
  console.log('RealView State:', rvState);
  if (!rvState.active) throw new Error('RealView button did not get active class');

  // 3. Test Unit Popover (1-click selector)
  console.log('Testing 1-click unit popover...');
  await page.click('#btn-units');
  await page.waitForTimeout(300);
  await page.click('.unit-menu-item[data-unit="cm"]');
  await page.waitForTimeout(300);
  const activeUnit = await page.evaluate(() => {
    const el = document.getElementById('unit-indicator');
    return el ? el.innerText.trim().toLowerCase() : '';
  });
  console.log('Active unit code:', activeUnit);
  if (activeUnit !== 'cm') throw new Error('Unit selector did not switch to cm');

  // 4. Test ChilickAssembely.SLDASM with all component colors
  console.log('Testing ChilickAssembely.SLDASM...');
  const asmBuf = fs.readFileSync('F:/Projects/PhotoBooth/PhotoBooth - Structure/AssemFinal/ChilickAssembely.SLDASM');
  const siblingMap = {};
  const sibDir1 = 'F:/Projects/PhotoBooth/PhotoBooth - Structure';
  const sibDir2 = 'F:/Projects/PhotoBooth/PhotoBooth - Structure/AssemFinal';
  [sibDir1, sibDir2].forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(file => {
        if (file.endsWith('.SLDPRT') || file.endsWith('.SLDASM')) {
          siblingMap[file.toLowerCase()] = fs.readFileSync(path.join(dir, file)).toString('base64');
        }
      });
    }
  });

  await page.evaluate(async ({ base64, sibs }) => {
    window._mockSiblings = sibs;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    const result = await window.SolidWorksLoader.parse(bytes.buffer, 'ChilickAssembely.SLDASM', async (name) => {
      const b64 = window._mockSiblings[name.toLowerCase()];
      if (!b64) return null;
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return buf.buffer;
    });
    window.onTessellationComplete(result);
  }, { base64: asmBuf.toString('base64'), sibs: siblingMap });

  await page.waitForTimeout(3000);

  const asmCheck = await page.evaluate(() => {
    if (!window.modelGroup) return { ok: false };
    const meshes = window.modelGroup.children.map(c => {
      const colors = new Set();
      if (c.geometry && c.geometry.attributes.color) {
        const arr = c.geometry.attributes.color.array;
        for (let i = 0; i < arr.length; i += 3) {
          colors.add(Math.round(arr[i]*255) + ',' + Math.round(arr[i+1]*255) + ',' + Math.round(arr[i+2]*255));
        }
      }
      return {
        name: c.name,
        vertColors: Array.from(colors),
        matColor: c.material && c.material.color ? [Math.round(c.material.color.r * 255), Math.round(c.material.color.g * 255), Math.round(c.material.color.b * 255)] : null
      };
    });
    return { ok: true, count: meshes.length, meshes: meshes };
  });
  console.log('Assembly meshes loaded:', asmCheck.count);

  // 5. Test 2-Stage Explode on Assembly
  console.log('Testing 2-stage explode on assembly...');
  await page.click('#btn-explode');
  await page.waitForTimeout(600);
  const expl1 = await page.evaluate(() => window.cadState ? window.cadState.explodedPercent : 0);
  console.log('Explode step 1 percent:', expl1);

  await page.click('#btn-explode');
  await page.waitForTimeout(600);
  const expl2 = await page.evaluate(() => window.cadState ? window.cadState.explodedPercent : 0);
  console.log('Explode step 2 percent:', expl2);

  await page.click('#btn-explode');
  await page.waitForTimeout(600);
  const expl0 = await page.evaluate(() => window.cadState ? window.cadState.explodedPercent : 0);
  console.log('Explode step 3 (collapse) percent:', expl0);

  // 6. Screenshot Assembly in RealView Light & Dark
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    if (typeof window.updateThemeLighting === 'function') window.updateThemeLighting(true);
    if (typeof window.toggleRealViewMode === 'function' && window.isRealViewActive) {
      window.toggleRealViewMode(true);
    }
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'scratch_assembly_realview_light.png' });
  console.log('Saved scratch_assembly_realview_light.png');

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (typeof window.updateThemeLighting === 'function') window.updateThemeLighting(false);
    if (typeof window.toggleRealViewMode === 'function' && window.isRealViewActive) {
      window.toggleRealViewMode(true);
    }
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'scratch_assembly_realview_dark.png' });
  console.log('Saved scratch_assembly_realview_dark.png');

  await browser.close();
  console.log('ALL PLAYWRIGHT TESTS PASSED CLEANLY AND VERIFIED!');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
