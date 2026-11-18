const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function createDomlessContext() {
  const ctx = vm.createContext({
    console, Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, TypeError, RangeError,
    Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array,
    ArrayBuffer, DataView, Map, Set, Promise, Symbol,
    TextDecoder: global.TextDecoder,
    TextEncoder: global.TextEncoder,
    Blob: global.Blob,
    FileReader: class MockFileReader {
      readAsArrayBuffer(blob) {
        blob.arrayBuffer().then((ab) => {
          this.result = ab;
          if (typeof this.onloadend === 'function') this.onloadend();
          else if (typeof this.onload === 'function') this.onload({ target: this });
        });
      }
      readAsDataURL(blob) {
        blob.arrayBuffer().then((ab) => {
          const b64 = Buffer.from(ab).toString('base64');
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
          if (typeof this.onloadend === 'function') this.onloadend();
          else if (typeof this.onload === 'function') this.onload({ target: this });
        });
      }
    },
    Buffer: global.Buffer,
    setTimeout, clearTimeout, performance: global.performance || { now: () => Date.now() },
    atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    document: { createElementNS: () => ({}), createElement: () => ({ getContext: () => null }) },
    DOMParser: class MockDOMParser {
      parseFromString(xmlStr) {
        function parseAttrs(attrStr) {
          const attrs = {};
          const re = /([A-Za-z0-9_:-]+)\s*=\s*"([^"]*)"/g;
          let m;
          while ((m = re.exec(attrStr)) !== null) attrs[m[1]] = m[2];
          return attrs;
        }
        const root = { tagName: 'root', nodeName: 'root', childNodes: [], children: [], attributes: {}, getAttribute: () => null };
        const stack = [root];
        const tagRe = /<\/?([A-Za-z0-9_:-]+)([^>]*)>/g;
        let match;
        while ((match = tagRe.exec(xmlStr)) !== null) {
          const full = match[0];
          const tag = match[1];
          const rest = match[2] || '';
          if (full.startsWith('</')) {
            if (stack.length > 1) stack.pop();
            continue;
          }
          if (full.startsWith('<?')) continue;
          const selfClosing = rest.trim().endsWith('/');
          const attrs = parseAttrs(rest);
          const node = {
            tagName: tag,
            nodeName: tag,
            localName: tag.split(':').pop(),
            attributes: attrs,
            childNodes: [],
            children: [],
            textContent: '',
            getAttribute: (k) => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null),
            querySelectorAll: (sel) => {
              const parts = sel.trim().split(/\s+/);
              const out = [];
              const walk = (n, depthIdx) => {
                for (const c of n.children) {
                  const matched = (c.tagName === parts[depthIdx] || c.localName === parts[depthIdx]);
                  if (matched) {
                    if (depthIdx === parts.length - 1) out.push(c);
                    else walk(c, depthIdx + 1);
                  } else {
                    walk(c, depthIdx);
                  }
                }
              };
              walk(node, 0);
              return out;
            },
            querySelector: (sel) => node.querySelectorAll(sel)[0] || null,
            getElementsByTagName: (sel) => node.querySelectorAll(sel)
          };
          const parent = stack[stack.length - 1];
          parent.children.push(node);
          parent.childNodes.push(node);
          if (!selfClosing) stack.push(node);
        }
        const doc = root.children[0] || root;
        doc.documentElement = doc;
        doc.querySelectorAll = (sel) => {
          const out = [];
          const walk = (n) => {
            if (n.tagName === sel || n.localName === sel) out.push(n);
            for (const c of n.children) walk(c);
          };
          walk(doc);
          return out;
        };
        doc.querySelector = (sel) => doc.querySelectorAll(sel)[0] || null;
        doc.getElementsByTagName = (sel) => doc.querySelectorAll(sel);
        return doc;
      }
    },
    window: {}
  });
  ctx.self = ctx;
  ctx.window = ctx;

  const scripts = [
    'Assets/three.min.js',
    'Assets/js/vendor/fflate.min.js',
    'Assets/js/vendor/3MFLoader.js',
    'Assets/js/vendor/OBJLoader.js',
    'Assets/js/vendor/MTLLoader.js',
    'Assets/js/vendor/PLYLoader.js',
    'Assets/js/vendor/GLTFLoader.js',
    'Assets/js/vendor/STLExporter.js',
    'Assets/js/vendor/OBJExporter.js',
    'Assets/js/vendor/GLTFExporter.js',
    'Assets/js/meshFormatLoader.js',
    'Assets/js/modelExportEngine.js'
  ];

  for (const s of scripts) {
    vm.runInContext(fs.readFileSync(s, 'utf8'), ctx, { filename: s });
  }
  return ctx;
}

async function run() {
  const ctx = createDomlessContext();
  const THREE = ctx.THREE;
  const MeshFormatLoader = ctx.MeshFormatLoader;
  const ModelExportEngine = ctx.ModelExportEngine;

  let passed = 0;

  // Test 1: OBJ parsing & volume calculation (10x10x10 box in OBJ)
  {
    const boxGeom = new THREE.BoxGeometry(10, 10, 10);
    const boxMesh = new THREE.Mesh(boxGeom, new THREE.MeshStandardMaterial({ color: 0x38bdf8 }));
    const group = new THREE.Group();
    group.add(boxMesh);

    const objText = new THREE.OBJExporter().parse(group);
    const objBuf = Buffer.from(objText, 'utf8');
    const objAb = objBuf.buffer.slice(objBuf.byteOffset, objBuf.byteOffset + objBuf.byteLength);

    const parsed = await MeshFormatLoader.parse('OBJ', objAb, 'cube.obj');
    assert.strictEqual(parsed.format, 'OBJ');
    assert.strictEqual(parsed.meshCount, 1);
    assert.strictEqual(parsed.meshes[0].triangles, 12);
    assert(Math.abs(parsed.meshes[0].volumeMm3 - 1000) < 1e-2, `Expected volume ~1000, got ${parsed.meshes[0].volumeMm3}`);
    assert(Math.abs(parsed.meshes[0].surfaceAreaMm2 - 600) < 1e-2, `Expected area ~600, got ${parsed.meshes[0].surfaceAreaMm2}`);
    console.log('PASS: Test 1 - OBJ parse & metrics');
    passed++;
  }

  // Test 2: ASCII PLY parsing
  {
    const plyText = [
      'ply',
      'format ascii 1.0',
      'element vertex 4',
      'property float x',
      'property float y',
      'property float z',
      'element face 4',
      'property list uchar int vertex_indices',
      'end_header',
      '0 0 0',
      '10 0 0',
      '0 10 0',
      '0 0 10',
      '3 0 2 1',
      '3 0 1 3',
      '3 1 2 3',
      '3 2 0 3'
    ].join('\n');
    const plyBuf = Buffer.from(plyText, 'ascii');
    const plyAb = plyBuf.buffer.slice(plyBuf.byteOffset, plyBuf.byteOffset + plyBuf.byteLength);

    const parsed = await MeshFormatLoader.parse('PLY', plyAb, 'tetra.ply');
    assert.strictEqual(parsed.format, 'PLY');
    assert.strictEqual(parsed.meshCount, 1);
    assert.strictEqual(parsed.meshes[0].triangles, 4);
    assert(Math.abs(parsed.meshes[0].volumeMm3 - (1000 / 6)) < 1e-1);
    console.log('PASS: Test 2 - PLY parse & metrics');
    passed++;
  }

  // Test 3: 3MF ZIP container parsing via fflate + ThreeMFLoader
  {
    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0" />
          <vertex x="10" y="0" z="0" />
          <vertex x="0" y="10" z="0" />
          <vertex x="0" y="0" z="10" />
        </vertices>
        <triangles>
          <triangle v1="0" v2="2" v3="1" />
          <triangle v1="0" v2="1" v3="3" />
          <triangle v1="1" v2="2" v3="3" />
          <triangle v1="2" v2="0" v3="3" />
        </triangles>
      </mesh>
    </object>
  </resources>
  <build><item objectid="1" /></build>
</model>`;
    const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;
    const zipped = ctx.fflate.zipSync({
      '[Content_Types].xml': ctx.fflate.strToU8(contentTypesXml),
      '_rels/.rels': ctx.fflate.strToU8(relsXml),
      '3D/3dmodel.model': ctx.fflate.strToU8(modelXml)
    });
    const threeMfAb = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);

    const parsed = await MeshFormatLoader.parse('3MF', threeMfAb, 'tetra.3mf');
    assert.strictEqual(parsed.format, '3MF');
    assert.strictEqual(parsed.meshCount, 1);
    assert.strictEqual(parsed.meshes[0].triangles, 4);
    assert(Math.abs(parsed.meshes[0].volumeMm3 - (1000 / 6)) < 1e-1);
    console.log('PASS: Test 3 - 3MF ZIP parse & metrics');
    passed++;
  }

  // Test 4: ModelExportEngine (STL, OBJ, GLB) + GLB round-trip into MeshFormatLoader (metres <-> mm)
  {
    const boxGeom = new THREE.BoxGeometry(20, 20, 20);
    const boxMesh = new THREE.Mesh(boxGeom, new THREE.MeshStandardMaterial({ color: 0xf59e0b }));
    const group = new THREE.Group();
    group.add(boxMesh);

    const stlRes = await ModelExportEngine.serializeModel('stl', group);
    const stlBytes = Buffer.from(stlRes.base64, 'base64');
    assert.strictEqual(stlBytes.length, 84 + 50 * 12);

    const objRes = await ModelExportEngine.serializeModel('obj', group);
    const objStr = Buffer.from(objRes.base64, 'base64').toString('utf8');
    assert(objStr.includes('v ') && objStr.includes('f '));

    const glbRes = await ModelExportEngine.serializeModel('glb', group);
    const glbBytes = Buffer.from(glbRes.base64, 'base64');
    assert.strictEqual(glbBytes.slice(0, 4).toString('ascii'), 'glTF');
    assert.strictEqual(glbBytes.readUInt32LE(4), 2);

    const glbAb = glbBytes.buffer.slice(glbBytes.byteOffset, glbBytes.byteOffset + glbBytes.byteLength);
    const roundTrip = await MeshFormatLoader.parse('GLB', glbAb, 'box.glb');
    assert.strictEqual(roundTrip.format, 'GLB');
    assert.strictEqual(roundTrip.meshCount, 1);
    assert.strictEqual(roundTrip.meshes[0].triangles, 12);
    // 20x20x20 mm -> exported to glTF metres (0.02m) -> re-imported as 20mm -> volume 8000 mm^3
    assert(Math.abs(roundTrip.meshes[0].volumeMm3 - 8000) < 1e-1, `Expected round-trip volume ~8000, got ${roundTrip.meshes[0].volumeMm3}`);
    console.log('PASS: Test 4 - ModelExportEngine (STL/OBJ/GLB) + GLB round-trip');
    passed++;
  }

  console.log(`\nPHASE 4 RESULTS: ${passed} PASSED, 0 FAILED (TOTAL: ${passed})`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
