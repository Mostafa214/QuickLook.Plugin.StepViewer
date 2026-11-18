/**
 * Phase 6 Test Suite: SolidWorks (.SLDPRT / .SLDASM) Clean-Room MIT Parser & Web Worker
 *
 * Tests:
 * 1. Real SolidWorks 2015+ parts (Fan-Spacer, Arduino UNO Base, Arduino push button, BioRx_0.25in_TubeConnector)
 * 2. Real SolidWorks .SLDASM assembly (MARK 2 ASM.SLDASM) with multi-body & siblingResolver
 * 3. CRC-32 validation & PreviewPNG 0-triangle fallback
 * 4. Legacy OLE2 (<=2014) MS-CFB + __ZLB zlib fallback
 * 5. Assets/solidworksWorker.js Web Worker harness with sibling fetch & transferable deduplication
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const fflate = require('../Assets/js/vendor/fflate.min.js');
const SolidWorksLoader = require('../Assets/js/solidworksLoader.js');

const SAMPLES_DIR = 'C:\\Users\\Lenovo\\AppData\\Local\\Temp\\sw_real_samples';
const REAL_FILES = [
  { rel: 'Fan-Spacer.SLDPRT', format: 'SLDPRT', minMeshes: 1 },
  { rel: path.join('Mk.2', 'SW', 'Arduino UNO Base.SLDPRT'), format: 'SLDPRT', minMeshes: 1 },
  { rel: path.join('Mk.2', 'SW', 'Arduino push button.SLDPRT'), format: 'SLDPRT', minMeshes: 1 },
  { rel: path.join('Mk.2', 'SW', 'BioRx_0.25in_TubeConnector.SLDPRT'), format: 'SLDPRT', minMeshes: 1 },
  { rel: path.join('Mk.2', 'MARK 2 ASM.SLDASM'), format: 'SLDASM', minMeshes: 10 }
];

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.stack || err.message}`);
    failed++;
  }
}

function assertValidMesh(m, label) {
  assert.ok(m.name && typeof m.name === 'string', `${label}: mesh.name missing`);
  assert.ok(Array.isArray(m.color) && m.color.length === 3, `${label}: mesh.color invalid`);
  assert.ok(m.position instanceof Float32Array, `${label}: mesh.position must be Float32Array`);
  assert.ok(m.normal instanceof Float32Array, `${label}: mesh.normal must be Float32Array`);
  assert.ok(m.triangles > 0, `${label}: expected triangles > 0, got ${m.triangles}`);
  assert.strictEqual(m.position.length, m.triangles * 9, `${label}: position length mismatch`);
  assert.strictEqual(m.normal.length, m.triangles * 9, `${label}: normal length mismatch`);

  for (let i = 0; i < m.position.length; i++) {
    assert.ok(Number.isFinite(m.position[i]), `${label}: non-finite position at ${i}`);
    assert.ok(Number.isFinite(m.normal[i]), `${label}: non-finite normal at ${i}`);
  }

  assert.ok(Number.isFinite(m.surfaceAreaMm2) && m.surfaceAreaMm2 > 0, `${label}: surfaceAreaMm2 invalid`);
  assert.ok(Number.isFinite(m.volumeMm3), `${label}: volumeMm3 invalid`);
  assert.strictEqual(typeof m.isWatertight, 'boolean', `${label}: isWatertight must be boolean`);
  assert.ok(['Watertight', 'Open Shell', 'Non-Manifold'].includes(m.topologyStatus), `${label}: invalid topologyStatus`);
  assert.ok(m.bbox && m.bbox.size.every(s => Number.isFinite(s) && s >= 0), `${label}: invalid bbox`);
  const maxDim = Math.max(m.bbox.size[0], m.bbox.size[1], m.bbox.size[2]);
  assert.ok(maxDim > 0.1 && maxDim < 100000, `${label}: unexpected bbox maxDim=${maxDim} mm`);
}

function buildSynthetic2015Container(entries) {
  const SIG = Buffer.from([0x14, 0x00, 0x06, 0x00, 0x08, 0x00]);
  const chunks = [Buffer.alloc(8)];
  for (const { name, payload } of entries) {
    const raw = Buffer.from(fflate.deflateSync(payload));
    const crc = SolidWorksLoader.crc32(payload);
    const nameBuf = Buffer.from(name, 'ascii');
    const swapped = Buffer.from(nameBuf.map(b => ((b & 0x0F) << 4) | ((b & 0xF0) >> 4)));
    const hdr = Buffer.alloc(26);
    SIG.copy(hdr, 0);
    hdr.writeUInt32LE(1, 6);
    hdr.writeUInt32LE(crc, 10);
    hdr.writeUInt32LE(raw.length, 14);
    hdr.writeUInt32LE(payload.length, 18);
    hdr.writeUInt32LE(swapped.length, 22);
    chunks.push(hdr, swapped, raw);
  }
  return Buffer.concat(chunks);
}

function buildSyntheticOle2WithZlib(streamName, payload) {
  // Minimal v3 OLE2 (512-byte sectors):
  // Sector 0: FAT
  // Sector 1: Directory (Root Entry + streamName)
  // Sector 2+: __ZLB-prefixed zlib stream
  const zPayload = Buffer.concat([Buffer.from('__ZLB\x00\x00\x00'), Buffer.from(fflate.zlibSync(payload))]);
  const dataSectors = Math.ceil(zPayload.length / 512);
  const totalSectors = 2 + dataSectors;
  const out = Buffer.alloc((1 + totalSectors) * 512, 0xFF);

  // Header
  Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]).copy(out, 0);
  out.writeUInt16LE(0x003E, 0x18); // minor
  out.writeUInt16LE(0x0003, 0x1A); // major v3
  out.writeUInt16LE(0xFFFE, 0x1C); // little endian
  out.writeUInt16LE(9, 0x1E);      // sectorShift = 512
  out.writeUInt16LE(6, 0x20);      // miniSectorShift = 64
  out.writeUInt32LE(1, 0x2C);      // totalFatSectors = 1
  out.writeUInt32LE(1, 0x30);      // firstDirSector = 1
  out.writeUInt32LE(64, 0x38);     // miniStreamCutoff = 64 (so our stream uses FAT)
  out.writeUInt32LE(0xFFFFFFFE, 0x3C); // firstMiniFatSector = ENDOFCHAIN
  out.writeUInt32LE(0, 0x40);
  out.writeUInt32LE(0xFFFFFFFE, 0x44); // firstDifatSector = ENDOFCHAIN
  out.writeUInt32LE(0, 0x48);
  out.writeUInt32LE(0, 0x4C);      // DIFAT[0] = sector 0

  // Sector 0: FAT
  const fatOff = 512;
  out.writeUInt32LE(0xFFFFFFFD, fatOff + 0 * 4); // FATSECT
  out.writeUInt32LE(0xFFFFFFFE, fatOff + 1 * 4); // Dir ENDOFCHAIN
  for (let s = 0; s < dataSectors; s++) {
    const next = (s + 1 < dataSectors) ? (2 + s + 1) : 0xFFFFFFFE;
    out.writeUInt32LE(next, fatOff + (2 + s) * 4);
  }

  // Sector 1: Directory
  const dirOff = 1024;
  // Entry 0: Root Entry
  const rootName = Buffer.from('Root Entry\0', 'utf16le');
  rootName.copy(out, dirOff);
  out.writeUInt16LE(rootName.length, dirOff + 0x40);
  out[dirOff + 0x42] = 5; // Root
  out.writeUInt32LE(0xFFFFFFFF, dirOff + 0x44);
  out.writeUInt32LE(0xFFFFFFFF, dirOff + 0x48);
  out.writeUInt32LE(1, dirOff + 0x4C); // child = 1
  out.writeUInt32LE(0xFFFFFFFE, dirOff + 0x74);
  out.writeUInt32LE(0, dirOff + 0x78);

  // Entry 1: stream
  const eOff = dirOff + 128;
  const sName = Buffer.from(streamName + '\0', 'utf16le');
  sName.copy(out, eOff);
  out.writeUInt16LE(sName.length, eOff + 0x40);
  out[eOff + 0x42] = 2; // Stream
  out.writeUInt32LE(0xFFFFFFFF, eOff + 0x44);
  out.writeUInt32LE(0xFFFFFFFF, eOff + 0x48);
  out.writeUInt32LE(0xFFFFFFFF, eOff + 0x4C);
  out.writeUInt32LE(2, eOff + 0x74); // startSector = 2
  out.writeUInt32LE(zPayload.length, eOff + 0x78);

  // Sector 2+: payload
  zPayload.copy(out, 1536);
  return out;
}

function buildMinimalTableBuffer() {
  // 1 strip of 4 vertices (2 triangles) in metres
  const buf = Buffer.alloc(16 + 4 + 16 + 48 + 16 + 48);
  let o = 0;
  // Desc 1: [4, 8, 2, 1], [4]
  buf.writeUInt32LE(4, o); buf.writeUInt32LE(8, o + 4); buf.writeUInt32LE(2, o + 8); buf.writeUInt32LE(1, o + 12); o += 16;
  buf.writeUInt32LE(4, o); o += 4;
  // Desc 2: [12, 100, 2, 4] positions (m)
  buf.writeUInt32LE(12, o); buf.writeUInt32LE(100, o + 4); buf.writeUInt32LE(2, o + 8); buf.writeUInt32LE(4, o + 12); o += 16;
  const pts = [0, 0, 0, 0.01, 0, 0, 0, 0.01, 0, 0.01, 0.01, 0];
  for (const v of pts) { buf.writeFloatLE(v, o); o += 4; }
  // Desc 3: [12, 100, 2, 4] normals
  buf.writeUInt32LE(12, o); buf.writeUInt32LE(100, o + 4); buf.writeUInt32LE(2, o + 8); buf.writeUInt32LE(4, o + 12); o += 16;
  for (let i = 0; i < 4; i++) {
    buf.writeFloatLE(0, o); buf.writeFloatLE(0, o + 4); buf.writeFloatLE(1, o + 8); o += 12;
  }
  return buf;
}

function createMockWorkerHarness(siblingDir) {
  const assetsDir = path.join(__dirname, '../Assets');
  const postedMessages = [];

  const sandbox = {
    console,
    TextDecoder,
    TextEncoder,
    DataView,
    ArrayBuffer,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int32Array,
    Float32Array,
    Float64Array,
    Set,
    Map,
    Math,
    Number,
    String,
    Array,
    Object,
    Promise,
    Error,
    performance,
    encodeURIComponent,
    decodeURIComponent,
    fetch: async (url) => {
      const m = /name=([^&]+)/.exec(url);
      if (!m) return { ok: false };
      const name = decodeURIComponent(m[1]);
      const candidate = path.join(siblingDir, name);
      if (!fs.existsSync(candidate)) return { ok: false };
      const data = fs.readFileSync(candidate);
      return {
        ok: true,
        arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      };
    }
  };

  sandbox.self = sandbox;
  sandbox.importScripts = (...scripts) => {
    for (const rel of scripts) {
      const fullPath = path.join(assetsDir, rel);
      const code = fs.readFileSync(fullPath, 'utf8');
      vm.runInContext(code, sandbox, { filename: rel });
    }
  };
  sandbox.postMessage = (msg, transferables) => {
    postedMessages.push({ msg, transferables: transferables || [] });
  };

  vm.createContext(sandbox);
  const workerCode = fs.readFileSync(path.join(assetsDir, 'solidworksWorker.js'), 'utf8');
  vm.runInContext(workerCode, sandbox, { filename: 'solidworksWorker.js' });

  return {
    send: async (msg) => {
      await sandbox.self.onmessage({ data: msg });
    },
    postedMessages
  };
}

async function run() {
  console.log('\n=== Phase 6 SolidWorks Clean-Room Parser & Worker Tests ===\n');

  const swDir = path.join(SAMPLES_DIR, 'Mk.2', 'SW');
  const siblingResolver = async (sibName) => {
    const p = path.join(swDir, sibName);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p);
  };

  for (const item of REAL_FILES) {
    const fullPath = path.join(SAMPLES_DIR, item.rel);
    if (!fs.existsSync(fullPath)) {
      console.log(`  [SKIP] Parse real SolidWorks file: ${item.rel} (optional local fixture not present)`);
      continue;
    }
    await test(`Parse real SolidWorks file: ${item.rel}`, async () => {
      const buf = fs.readFileSync(fullPath);
      const res = await SolidWorksLoader.parse(
        buf,
        path.basename(fullPath),
        item.format === 'SLDASM' ? siblingResolver : null
      );

      assert.strictEqual(res.format, item.format);
      assert.strictEqual(res.fileName, path.basename(fullPath));
      assert.strictEqual(res.bufferSize, buf.length);
      assert.ok(typeof res.elapsedMs === 'number' && res.elapsedMs >= 0);
      assert.ok(res.meshCount >= item.minMeshes, `Expected >= ${item.minMeshes} meshes, got ${res.meshCount}`);
      assert.strictEqual(res.meshes.length, res.meshCount);
      assert.ok(res.totalTriangles > 0, 'Expected non-zero totalTriangles');
      assert.strictEqual(res.previewPngDataUrl, null);

      for (let i = 0; i < res.meshes.length; i++) {
        assertValidMesh(res.meshes[i], `${item.rel}#${i}`);
      }

      const overallMin = [Infinity, Infinity, Infinity];
      const overallMax = [-Infinity, -Infinity, -Infinity];
      for (const m of res.meshes) {
        for (let k = 0; k < 3; k++) {
          overallMin[k] = Math.min(overallMin[k], m.bbox.min[k]);
          overallMax[k] = Math.max(overallMax[k], m.bbox.max[k]);
        }
      }
      const size = overallMax.map((v, k) => (v - overallMin[k]).toFixed(2));
      console.log(`         -> ${res.format} | meshes=${res.meshCount} | tris=${res.totalTriangles} | bbox=[${size.join(' x ')}] mm | ${res.elapsedMs}ms`);
    });
  }

  await test('PreviewPNG fallback when DisplayLists has 0 triangles', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    const container = buildSynthetic2015Container([
      { name: 'Contents/DisplayLists', payload: Buffer.from('empty') },
      { name: 'PreviewPNG', payload: pngBytes }
    ]);
    const res = await SolidWorksLoader.parse(container, 'empty_sketch.SLDPRT');
    assert.strictEqual(res.meshCount, 0);
    assert.strictEqual(res.totalTriangles, 0);
    assert.ok(res.previewPngDataUrl && res.previewPngDataUrl.startsWith('data:image/png;base64,'));
    const decoded = Buffer.from(res.previewPngDataUrl.split(',')[1], 'base64');
    assert.ok(decoded.equals(pngBytes));
  });

  await test('CRC-32 validation detects corrupted container block', async () => {
    const payload = buildMinimalTableBuffer();
    const container = buildSynthetic2015Container([
      { name: 'Contents/DisplayLists', payload }
    ]);
    // Corrupt CRC-32 at offset 8 + 10 = 18
    container.writeUInt32LE(0xDEADBEEF, 18);
    const blocks = SolidWorksLoader.readBlocks2015(container);
    assert.strictEqual(blocks.length, 1);
    assert.throws(() => blocks[0].inflate(), /CRC-32 mismatch/);
  });

  await test('OLE2 (<=2014) MS-CFB + __ZLB fallback parses tessellation', async () => {
    const tableBuf = buildMinimalTableBuffer();
    const ole = buildSyntheticOle2WithZlib('DisplayLists', tableBuf);
    // Name it Contents/DisplayLists or DisplayLists; test readBlocksOle2 + parse
    const blocks = SolidWorksLoader.readBlocksOle2(ole);
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].name, 'DisplayLists');
    const inflated = blocks[0].inflate();
    assert.ok(Buffer.from(inflated).equals(tableBuf));

    // Also test full parse via Contents/DisplayLists
    const ole2 = buildSyntheticOle2WithZlib('Contents/DisplayLists', tableBuf);
    const res = await SolidWorksLoader.parse(ole2, 'legacy2014.SLDPRT');
    assert.strictEqual(res.format, 'SLDPRT');
    assert.strictEqual(res.meshCount, 1);
    assert.strictEqual(res.totalTriangles, 2);
    assertValidMesh(res.meshes[0], 'legacy2014');
  });

  await test('Modern 2015+ synthetic container parses DisplayLists tessellation', async () => {
    const tableBuf = buildMinimalTableBuffer();
    const container = buildSynthetic2015Container([
      { name: 'Contents/DisplayLists', payload: tableBuf }
    ]);
    const res = await SolidWorksLoader.parse(container, 'modern2015.SLDPRT');
    assert.strictEqual(res.format, 'SLDPRT');
    assert.strictEqual(res.meshCount, 1);
    assert.strictEqual(res.totalTriangles, 2);
    assertValidMesh(res.meshes[0], 'modern2015');
  });

  await test('Web Worker (Assets/solidworksWorker.js) parses SolidWorks & deduplicates transferables', async () => {
    const harness = createMockWorkerHarness(swDir);
    const asmPath = path.join(SAMPLES_DIR, 'Mk.2', 'MARK 2 ASM.SLDASM');
    const useReal = fs.existsSync(asmPath);
    const buf = useReal
      ? fs.readFileSync(asmPath)
      : buildSynthetic2015Container([{ name: 'Contents/DisplayLists', payload: buildMinimalTableBuffer() }]);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    await harness.send({
      type: 'PARSE_SOLIDWORKS',
      buffer: ab,
      fileName: useReal ? 'MARK 2 ASM.SLDASM' : 'synthetic_worker.SLDPRT',
      loadId: 42
    });

    assert.strictEqual(harness.postedMessages.length, 1);
    const { msg, transferables } = harness.postedMessages[0];
    assert.strictEqual(msg.type, 'SOLIDWORKS_PARSE_SUCCESS');
    assert.strictEqual(msg.loadId, 42);
    assert.ok(msg.result.meshCount >= (useReal ? 10 : 1));
    assert.ok(msg.result.totalTriangles > 0);
    assert.ok(msg.result.meshes[0]._featuresDetected === true);
    assert.ok(transferables.length > 0);
    // Verify deduplication: no duplicate ArrayBuffer references
    assert.strictEqual(new Set(transferables).size, transferables.length);
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
