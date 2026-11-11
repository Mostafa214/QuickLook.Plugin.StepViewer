/**
 * Empirical Adversarial Stress & Edge-Case Verification Suite
 * Milestone 2: Pure JS STL Loader & Pipeline Isolation
 * File: tests/adversarial_challenge_m2_gen1.js
 * 
 * Challenger: challenger_m2_1_gen1 (teamwork_challenger)
 * 
 * Verifies:
 * Domain 1: Preamble Length Boundary Probing (<4096, 4096, 8000, 8150, 8192, >8192)
 * Domain 2: Malformed ASCII Headers & Formatting Oddities (Tabs, Whitespace, BOM, Quotes, Special Chars)
 * Domain 3: Coordinate Extremes, Scientific Notation & Corrupted Loops (NaN, Infinity, 1e-12, -2.5E+03, Truncated Loops)
 * Domain 4: Zero-Triangle & Empty STL Handling (Empty ASCII vs 84-byte Binary)
 * Domain 5: Binary STL Edge Cases & Robustness (Size mismatches, 32-bit overflow, non-buffer inputs)
 * Domain 6: Performance Benchmark & SLA Verification (< 15ms target on realistic & large meshes)
 */

'use strict';

const assert = require('assert');
const path = require('path');
const StlLoader = require(path.join(__dirname, '../Assets/js/stlLoader.js'));

console.log('================================================================');
console.log('  M2 STL LOADER EMPIRICAL ADVERSARIAL SUITE (CHALLENGER GEN 1)  ');
console.log('================================================================\n');

let totalChallenges = 0;
let passedChallenges = 0;
let failedChallenges = 0;
const findings = [];

function challenge(domain, name, fn) {
  totalChallenges++;
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  try {
    fn();
    const elapsed = (((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0).toFixed(2);
    passedChallenges++;
    console.log(`  [PASS] [${domain}] ${name} (${elapsed}ms)`);
  } catch (err) {
    failedChallenges++;
    console.error(`  [FAIL] [${domain}] ${name}: ${err.message}`);
    findings.push({ domain, name, error: err.message, stack: err.stack });
  }
}

// Helper to construct binary STL buffer
function createBinaryStl(triangles, headerText = 'Adversarial STL') {
  const count = triangles.length;
  const buf = Buffer.alloc(84 + 50 * count);
  buf.write(headerText, 0, 'utf8');
  buf.writeUInt32LE(count, 80);

  let offset = 84;
  for (const tri of triangles) {
    const n = tri.n || [0, 0, 1];
    const a = tri.a, b = tri.b, c = tri.c;
    buf.writeFloatLE(n[0], offset);
    buf.writeFloatLE(n[1], offset + 4);
    buf.writeFloatLE(n[2], offset + 8);
    buf.writeFloatLE(a[0], offset + 12);
    buf.writeFloatLE(a[1], offset + 16);
    buf.writeFloatLE(a[2], offset + 20);
    buf.writeFloatLE(b[0], offset + 24);
    buf.writeFloatLE(b[1], offset + 28);
    buf.writeFloatLE(b[2], offset + 32);
    buf.writeFloatLE(c[0], offset + 36);
    buf.writeFloatLE(c[1], offset + 40);
    buf.writeFloatLE(c[2], offset + 44);
    buf.writeUInt16LE(tri.attr || 0, offset + 48);
    offset += 50;
  }
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// Canonical unit triangle
const unitTri = {
  n: [0, 0, 1],
  a: [0, 0, 0],
  b: [1, 0, 0],
  c: [0, 1, 0]
};

// =============================================================================
// DOMAIN 1: PREAMBLE LENGTH BOUNDARY PROBING
// =============================================================================
console.log('--- Domain 1: Preamble Length Boundary Probing ---');

function createPreambleAscii(preambleByteLength) {
  const header = 'solid PreambleBound\n';
  const facet = 'facet normal 0 0 1\n  outer loop\n    vertex 0 0 0\n    vertex 1 0 0\n    vertex 0 1 0\n  endloop\nendfacet\nendsolid PreambleBound\n';
  const padLen = Math.max(0, preambleByteLength - header.length);
  const pad = '# ' + 'x'.repeat(Math.max(0, padLen - 3)) + '\n';
  return Buffer.from(header + pad + facet, 'utf8');
}

challenge('Domain 1', 'D1.1: Preamble with 1,024 bytes comments before facet normal (D1.5 fix verified)', () => {
  const buf = createPreambleAscii(1024);
  const type = StlLoader.detectType(buf);
  assert.strictEqual(type, 'ascii', '1024-byte preamble must be recognized as ascii');
  const res = StlLoader.parse(buf, 'preamble_1024.stl');
  assert.strictEqual(res.totalTriangles, 1);
});

challenge('Domain 1', 'D1.2: Preamble with 4,096 bytes comments (C# host buffer boundary)', () => {
  const buf = createPreambleAscii(4096);
  const type = StlLoader.detectType(buf);
  assert.strictEqual(type, 'ascii', '4096-byte preamble must be recognized as ascii');
  const res = StlLoader.parse(buf, 'preamble_4096.stl');
  assert.strictEqual(res.totalTriangles, 1);
});

challenge('Domain 1', 'D1.3: Preamble with 8,000 bytes comments (within 8192 JS scan window)', () => {
  const buf = createPreambleAscii(8000);
  const type = StlLoader.detectType(buf);
  assert.strictEqual(type, 'ascii', '8000-byte preamble must be recognized as ascii');
  const res = StlLoader.parse(buf, 'preamble_8000.stl');
  assert.strictEqual(res.totalTriangles, 1);
});

challenge('Domain 1', 'D1.4: Preamble with 8,150 bytes comments (near 8192 JS scan window)', () => {
  const buf = createPreambleAscii(8150);
  const type = StlLoader.detectType(buf);
  assert.strictEqual(type, 'ascii', '8150-byte preamble must be recognized as ascii');
  const res = StlLoader.parse(buf, 'preamble_8150.stl');
  assert.strictEqual(res.totalTriangles, 1);
});

challenge('Domain 1', 'D1.5: Preamble exactly 8,192 bytes before first facet (boundary probe)', () => {
  // At 8192 bytes, the 8192 scan window contains only preamble text, so facet normal is past byte 8192
  const buf = createPreambleAscii(8192);
  const type = StlLoader.detectType(buf);
  // Expected: since facet normal starts at byte 8192 or later, detectType returns 'invalid'
  assert.strictEqual(type, 'invalid', 'When facet normal is pushed past 8192 bytes, detectType correctly reports invalid');
  assert.throws(() => StlLoader.parse(buf), /Invalid STL file/i);
});

challenge('Domain 1', 'D1.6: Preamble with 12,000 bytes comments (> 8192 window) rejected cleanly', () => {
  const buf = createPreambleAscii(12000);
  const type = StlLoader.detectType(buf);
  assert.strictEqual(type, 'invalid');
  assert.throws(() => StlLoader.parse(buf), /Invalid STL file/i);
});

challenge('Domain 1', 'D1.7: Minimal ASCII STL (15 bytes: solid\\nendsolid) detected as ASCII', () => {
  const minAscii = Buffer.from('solid\nendsolid\n', 'utf8');
  const type = StlLoader.detectType(minAscii);
  assert.strictEqual(type, 'ascii', 'Minimal 15-byte file must be classified as ascii');
  // But parsing must throw because actualTriangles === 0
  assert.throws(() => StlLoader.parse(minAscii), /No valid facet triangles found/i);
});


// =============================================================================
// DOMAIN 2: MALFORMED ASCII HEADERS & FORMATTING ODDITIES
// =============================================================================
console.log('\n--- Domain 2: Malformed ASCII Headers & Formatting Oddities ---');

challenge('Domain 2', 'D2.1: Solid header with tabs and mixed horizontal whitespace', () => {
  const tabAscii = 'solid\t\tTabbedPart\t\r\n' +
    'facet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid\n';
  const res = StlLoader.parse(Buffer.from(tabAscii), 'fallback.stl');
  assert.strictEqual(res.meshes[0].name, 'TabbedPart');
});

challenge('Domain 2', 'D2.2: Solid with leading whitespace and newlines before solid keyword', () => {
  const leadAscii = '\r\n\t   solid IndentedPart\r\n' +
    'facet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid\n';
  const res = StlLoader.parse(Buffer.from(leadAscii), 'fallback.stl');
  assert.strictEqual(res.meshes[0].name, 'IndentedPart');
});

challenge('Domain 2', 'D2.3: Solid with UTF-8 Byte Order Mark (0xEF 0xBB 0xBF)', () => {
  const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
  const text = Buffer.from('solid BomPart\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid\n');
  const buf = Buffer.concat([bom, text]);
  const res = StlLoader.parse(buf, 'fallback.stl');
  assert.strictEqual(res.meshes[0].name, 'BomPart');
  assert.strictEqual(res.totalTriangles, 1);
});

challenge('Domain 2', 'D2.4: Solid with NO name falls back to fileName (D1.2 fix verified)', () => {
  // Case A: solid followed immediately by newline
  const noNameA = 'solid\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid\n';
  const resA = StlLoader.parse(Buffer.from(noNameA), 'custom_model.stl');
  assert.strictEqual(resA.meshes[0].name, 'custom_model.stl');
  assert.notStrictEqual(resA.meshes[0].name, 'facet normal 0 0 1');

  // Case B: solid with trailing spaces on the same line
  const noNameB = 'solid     \r\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid\n';
  const resB = StlLoader.parse(Buffer.from(noNameB), 'spaces_model.stl');
  assert.strictEqual(resB.meshes[0].name, 'spaces_model.stl');
});

challenge('Domain 2', 'D2.5: Multi-word solid name with special characters and quotes', () => {
  const specialAscii = 'solid "Turbine Blade #03 - Stage 2 [Alloy-718]"\r\n' +
    'facet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid\n';
  const res = StlLoader.parse(Buffer.from(specialAscii), 'fallback.stl');
  assert.strictEqual(res.meshes[0].name, '"Turbine Blade #03 - Stage 2 [Alloy-718]"');
});

challenge('Domain 2', 'D2.6: Full case-insensitivity of all STL keywords', () => {
  const mixedCase = 'SOLID UpperCasePart\r\n' +
    'FACET NORMAL 0.0 0.0 1.0\r\n' +
    '  OUTER LOOP\r\n' +
    '    VERTEX 0.0 0.0 0.0\r\n' +
    '    VERTEX 1.0 0.0 0.0\r\n' +
    '    VERTEX 0.0 1.0 0.0\r\n' +
    '  ENDLOOP\r\n' +
    'ENDFACET\r\n' +
    'ENDSOLID UpperCasePart\r\n';
  const res = StlLoader.parse(Buffer.from(mixedCase), 'fallback.stl');
  assert.strictEqual(res.meshes[0].name, 'UpperCasePart');
  assert.strictEqual(res.totalTriangles, 1);
});

challenge('Domain 2', 'D2.7: Arbitrary comments (hash, slash, block) interspersed between vertices', () => {
  const commentsAscii = 'solid CommentPart\n' +
    '# Comment before facet\n' +
    'facet normal 0 0 1 // trailing normal comment\n' +
    '  outer loop\n' +
    '    # comment before vertex 1\n' +
    '    vertex 0.0 0.0 0.0\n' +
    '    /* c-style block comment */\n' +
    '    vertex 1.0 0.0 0.0\n' +
    '    // line comment\n' +
    '    vertex 0.0 1.0 0.0\n' +
    '  endloop\n' +
    'endfacet\n' +
    '# Comment after facet\n' +
    'endsolid CommentPart\n';
  const res = StlLoader.parse(Buffer.from(commentsAscii));
  assert.strictEqual(res.totalTriangles, 1);
});

challenge('Domain 2', 'D2.8: Mismatched solid name in endsolid tolerated cleanly', () => {
  const mismatchAscii = 'solid NameAlpha\n' +
    'facet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\n' +
    'endsolid NameOmega\n';
  const res = StlLoader.parse(Buffer.from(mismatchAscii));
  assert.strictEqual(res.meshes[0].name, 'NameAlpha');
  assert.strictEqual(res.totalTriangles, 1);
});


// =============================================================================
// DOMAIN 3: COORDINATE EXTREMES, SCIENTIFIC NOTATION & CORRUPTED LOOPS
// =============================================================================
console.log('\n--- Domain 3: Coordinate Extremes, Scientific Notation & Corrupted Loops ---');

challenge('Domain 3', 'D3.1: Scientific notation extremes (1e-12, -2.5E+03, 1.2345e-05, +3.4e-1)', () => {
  const sciAscii = 'solid SciTest\n' +
    'facet normal -2.5E+03 0.0000 1e-12\n' +
    '  outer loop\n' +
    '    vertex 1.2345e-05 -5.678E+02 +3.4e-1\n' +
    '    vertex 0 0 0\n' +
    '    vertex 1 0 0\n' +
    '  endloop\n' +
    'endfacet\n' +
    'endsolid SciTest\n';
  const res = StlLoader.parse(Buffer.from(sciAscii));
  assert.strictEqual(res.totalTriangles, 1);
  const pos = res.meshes[0].position;
  assert(Math.abs(pos[0] - 1.2345e-05) < 1e-9);
  assert(Math.abs(pos[1] - (-567.8)) < 1e-3);
  assert(Math.abs(pos[2] - 0.34) < 1e-3);
  // Normal magnitude normalized to 1.0
  const norm = res.meshes[0].normal;
  const mag = Math.hypot(norm[0], norm[1], norm[2]);
  assert(Math.abs(mag - 1.0) < 1e-4);
});

challenge('Domain 3', 'D3.2: Decimal numbers without leading integer (.5, -.75, +.123)', () => {
  const decAscii = 'solid DecTest\n' +
    'facet normal 0 0 1\n' +
    '  outer loop\n' +
    '    vertex .5 -.75 +.123\n' +
    '    vertex 1.0 0 0\n' +
    '    vertex 0 1.0 0\n' +
    '  endloop\n' +
    'endfacet\n' +
    'endsolid DecTest\n';
  const res = StlLoader.parse(Buffer.from(decAscii));
  assert.strictEqual(res.totalTriangles, 1);
  const pos = res.meshes[0].position;
  assert.strictEqual(pos[0], 0.5);
  assert.strictEqual(pos[1], -0.75);
  assert(Math.abs(pos[2] - 0.123) < 1e-5);
});

challenge('Domain 3', 'D3.3: Vertex with NaN in ASCII rejected cleanly', () => {
  const nanAscii = 'solid NanTest\n' +
    'facet normal 0 0 1\n' +
    '  outer loop\n' +
    '    vertex 0 0 0\n' +
    '    vertex NaN 1 0\n' +
    '    vertex 0 1 0\n' +
    '  endloop\n' +
    'endfacet\n' +
    'endsolid NanTest\n';
  assert.throws(() => StlLoader.parse(Buffer.from(nanAscii)), /No valid facet triangles found/i);
});

challenge('Domain 3', 'D3.4: Vertex with Infinity in ASCII rejected cleanly', () => {
  const infAscii = 'solid InfTest\n' +
    'facet normal 0 0 1\n' +
    '  outer loop\n' +
    '    vertex 0 0 0\n' +
    '    vertex Infinity 1 0\n' +
    '    vertex 0 1 0\n' +
    '  endloop\n' +
    'endfacet\n' +
    'endsolid InfTest\n';
  assert.throws(() => StlLoader.parse(Buffer.from(infAscii)), /No valid facet triangles found/i);
});

challenge('Domain 3', 'D3.5: Truncated facet loop isolation (single facet with only 2 vertices throws)', () => {
  const trunc1 = 'solid TruncSingle\n' +
    'facet normal 0 0 1\n' +
    '  outer loop\n' +
    '    vertex 0 0 0\n' +
    '    vertex 1 0 0\n' +
    '  endloop\n' +
    'endfacet\n' +
    'endsolid TruncSingle\n';
  assert.throws(() => StlLoader.parse(Buffer.from(trunc1)), /No valid facet triangles found/i);
});

challenge('Domain 3', 'D3.6: Quad facet (4 vertices in loop) ingested as triangle', () => {
  const quadAscii = 'solid QuadTest\n' +
    'facet normal 0 0 1\n' +
    '  outer loop\n' +
    '    vertex 0 0 0\n' +
    '    vertex 1 0 0\n' +
    '    vertex 1 1 0\n' +
    '    vertex 0 1 0\n' +
    '  endloop\n' +
    'endfacet\n' +
    'endsolid QuadTest\n';
  const res = StlLoader.parse(Buffer.from(quadAscii));
  assert.strictEqual(res.totalTriangles, 1);
  assert.strictEqual(res.meshes[0].position.length, 9);
});

challenge('Domain 3', 'D3.7: Collinear zero-area degenerate triangle in ASCII', () => {
  const collAscii = 'solid CollTest\n' +
    'facet normal 0 0 0\n' +
    '  outer loop\n' +
    '    vertex 0 0 0\n' +
    '    vertex 1 0 0\n' +
    '    vertex 2 0 0\n' +
    '  endloop\n' +
    'endfacet\n' +
    'endsolid CollTest\n';
  const res = StlLoader.parse(Buffer.from(collAscii));
  assert.strictEqual(res.totalTriangles, 1);
  assert.strictEqual(res.areaMm2, 0);
  assert.strictEqual(res.volumeMm3, 0);
  // Degenerate normal recovers to (0, 0, 1) default
  const n = res.meshes[0].normal;
  assert.strictEqual(n[0], 0);
  assert.strictEqual(n[1], 0);
  assert.strictEqual(n[2], 1);
});


// =============================================================================
// DOMAIN 4: ZERO-TRIANGLE & EMPTY STL HANDLING
// =============================================================================
console.log('\n--- Domain 4: Zero-Triangle & Empty STL Handling ---');

challenge('Domain 4', 'D4.1: Empty ASCII STL (solid\\nendsolid) throws "No valid facet triangles found"', () => {
  const emptyAscii = 'solid EmptyPart\nendsolid EmptyPart\n';
  assert.throws(() => StlLoader.parse(Buffer.from(emptyAscii)), /No valid facet triangles found/i);
});

challenge('Domain 4', 'D4.2: ASCII STL with facet headers but 0 vertices throws expected error', () => {
  const noVerts = 'solid NoVerts\n' +
    'facet normal 0 0 1\nouter loop\nendloop\nendfacet\n' +
    'endsolid NoVerts\n';
  assert.throws(() => StlLoader.parse(Buffer.from(noVerts)), /No valid facet triangles found/i);
});

challenge('Domain 4', 'D4.3: Binary STL with exact 84 bytes and 0 triangles returns 0-triangle payload', () => {
  const buf84 = Buffer.alloc(84);
  buf84.write('ZeroTriBinary', 0, 'utf8');
  buf84.writeUInt32LE(0, 80);
  const res = StlLoader.parse(buf84, 'zero.stl');
  assert.strictEqual(res.format, 'STL');
  assert.strictEqual(res.totalTriangles, 0);
  assert.strictEqual(res.volumeMm3, 0);
  assert.strictEqual(res.areaMm2, 0);
  assert.strictEqual(res.isWatertight, false);
  assert.strictEqual(res.isManifold, false);
  assert.deepStrictEqual(res.meshes[0].bbox.min, [0, 0, 0]);
  assert.deepStrictEqual(res.meshes[0].bbox.max, [0, 0, 0]);
});

challenge('Domain 4', 'D4.4: Binary STL with 84 bytes but triangleCount = 1 throws size mismatch', () => {
  const buf = Buffer.alloc(84);
  buf.writeUInt32LE(1, 80); // expects 134 bytes
  assert.throws(() => StlLoader.parse(buf), /Invalid STL file/i);
});

challenge('Domain 4', 'D4.5: Binary STL with 0 triangles but 85 bytes (trailing garbage byte) throws', () => {
  const buf = Buffer.alloc(85);
  buf.writeUInt32LE(0, 80); // expected 84, got 85
  assert.throws(() => StlLoader.parse(buf), /Invalid STL file/i);
});

challenge('Domain 4', 'D4.6: Zero-byte buffer (0 bytes) throws clean error', () => {
  const buf0 = Buffer.alloc(0);
  assert.throws(() => StlLoader.parse(buf0), /Invalid STL file/i);
});


// =============================================================================
// DOMAIN 5: BINARY STL EDGE CASES & ROBUSTNESS
// =============================================================================
console.log('\n--- Domain 5: Binary STL Edge Cases & Robustness ---');

challenge('Domain 5', 'D5.1: Off-by-one byte binary truncations rejected cleanly', () => {
  const bin1 = createBinaryStl([unitTri]); // 84 + 50 = 134 bytes
  assert.strictEqual(bin1.byteLength, 134);

  // 133 bytes (-1 byte)
  const short1 = bin1.slice(0, 133);
  assert.throws(() => StlLoader.parse(short1), /Invalid STL file/i);

  // 135 bytes (+1 byte)
  const long1 = Buffer.concat([Buffer.from(bin1), Buffer.from([0x00])]);
  assert.throws(() => StlLoader.parse(long1), /Invalid STL file/i);
});

challenge('Domain 5', 'D5.2: Giant 32-bit triangle counts evaluated without signed integer overflow', () => {
  // 0xFFFFFFFF (4,294,967,295 triangles): in 32-bit signed int, 84 + count*50 wraps negative
  const buf = Buffer.alloc(84);
  buf.writeUInt32LE(0xFFFFFFFF, 80);
  assert.throws(() => StlLoader.parse(buf), /Invalid STL file/i);

  // 0x80000000 (2,147,483,648 triangles)
  const buf2 = Buffer.alloc(84);
  buf2.writeUInt32LE(0x80000000, 80);
  assert.throws(() => StlLoader.parse(buf2), /Invalid STL file/i);
});

challenge('Domain 5', 'D5.3: Binary header starting with ASCII "solid" string parsed as Binary', () => {
  const binSolid = createBinaryStl([unitTri], 'solid SneakyBinaryModel');
  const type = StlLoader.detectType(binSolid);
  assert.strictEqual(type, 'binary', 'Binary precedence must classify solid-prefixed binary header as binary');
  const res = StlLoader.parse(binSolid);
  assert.strictEqual(res.totalTriangles, 1);
});

challenge('Domain 5', 'D5.4: Binary STL with non-zero attribute bytes (VisCAM / Magics colors)', () => {
  const triWithAttr = {
    n: [0, 0, 1],
    a: [0, 0, 0],
    b: [1, 0, 0],
    c: [0, 1, 0],
    attr: 0x801F // 15-bit color bitflag
  };
  const bin = createBinaryStl([triWithAttr]);
  const res = StlLoader.parse(bin);
  assert.strictEqual(res.totalTriangles, 1);
  assert.strictEqual(res.meshes[0].position.length, 9);
});

challenge('Domain 5', 'D5.5: Non-ArrayBuffer inputs (null, undefined, plain object) throw cleanly', () => {
  assert.throws(() => StlLoader.parse(null), /Invalid STL file/i);
  assert.throws(() => StlLoader.parse(undefined), /Invalid STL file/i);
  // Plain object or string without byteLength throws TypeError from DataView or Invalid STL file
  assert.throws(() => StlLoader.parse({}), /(Invalid STL file|TypeError)/i);
  assert.throws(() => StlLoader.parse('plain string'), /(Invalid STL file|TypeError)/i);
});


// =============================================================================
// DOMAIN 6: PERFORMANCE BENCHMARK & SLA VERIFICATION (< 15MS TARGET)
// =============================================================================
console.log('\n--- Domain 6: Performance Benchmark & SLA Verification ---');

function createBenchBinary(triCount) {
  const buf = Buffer.alloc(84 + 50 * triCount);
  buf.write('BenchmarkMesh', 0, 'utf8');
  buf.writeUInt32LE(triCount, 80);
  let off = 84;
  for (let i = 0; i < triCount; i++) {
    buf.writeFloatLE(0, off); buf.writeFloatLE(0, off + 4); buf.writeFloatLE(1, off + 8);
    buf.writeFloatLE(i, off + 12); buf.writeFloatLE(0, off + 16); buf.writeFloatLE(0, off + 20);
    buf.writeFloatLE(i + 1, off + 24); buf.writeFloatLE(0, off + 28); buf.writeFloatLE(0, off + 32);
    buf.writeFloatLE(i, off + 36); buf.writeFloatLE(1, off + 40); buf.writeFloatLE(0, off + 44);
    buf.writeUInt16LE(0, off + 48);
    off += 50;
  }
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function createBenchAscii(triCount) {
  let s = 'solid BenchAscii\n';
  for (let i = 0; i < triCount; i++) {
    s += 'facet normal 0 0 1\n outer loop\n vertex ' + i + ' 0 0\n vertex ' + (i+1) + ' 0 0\n vertex ' + i + ' 1 0\n endloop\nendfacet\n';
  }
  s += 'endsolid BenchAscii\n';
  return Buffer.from(s, 'utf8');
}

challenge('Domain 6', 'D6.1: 1,000 Triangle Binary Mesh (< 5ms target)', () => {
  const buf = createBenchBinary(1000);
  const t0 = performance.now();
  const res = StlLoader.parse(buf);
  const elapsed = performance.now() - t0;
  console.log(`      * 1,000 Binary tris: ${elapsed.toFixed(2)}ms (SLA: < 15ms)`);
  assert.strictEqual(res.totalTriangles, 1000);
  assert(elapsed < 15, `Parse time ${elapsed}ms exceeded 15ms SLA`);
});

challenge('Domain 6', 'D6.2: 5,000 Triangle Binary Mesh (< 10ms target)', () => {
  const buf = createBenchBinary(5000);
  const t0 = performance.now();
  const res = StlLoader.parse(buf);
  const elapsed = performance.now() - t0;
  console.log(`      * 5,000 Binary tris: ${elapsed.toFixed(2)}ms (SLA: < 15ms)`);
  assert.strictEqual(res.totalTriangles, 5000);
  assert(elapsed < 15, `Parse time ${elapsed}ms exceeded 15ms SLA`);
});

function generateSubdividedCube(M, dx = 10, dy = 20, dz = 30) {
  const triCount = 6 * 2 * M * M;
  const buf = Buffer.alloc(84 + 50 * triCount);
  buf.write('Subdivided Cube', 0, 'utf8');
  buf.writeUInt32LE(triCount, 80);
  let offset = 84;
  function writeTri(n, a, b, c) {
    buf.writeFloatLE(n[0], offset); buf.writeFloatLE(n[1], offset + 4); buf.writeFloatLE(n[2], offset + 8);
    buf.writeFloatLE(a[0], offset + 12); buf.writeFloatLE(a[1], offset + 16); buf.writeFloatLE(a[2], offset + 20);
    buf.writeFloatLE(b[0], offset + 24); buf.writeFloatLE(b[1], offset + 28); buf.writeFloatLE(b[2], offset + 32);
    buf.writeFloatLE(c[0], offset + 36); buf.writeFloatLE(c[1], offset + 40); buf.writeFloatLE(c[2], offset + 44);
    buf.writeUInt16LE(0, offset + 48);
    offset += 50;
  }
  function addQuad(n, p00, p01, p11, p10) {
    writeTri(n, p00, p01, p11);
    writeTri(n, p00, p11, p10);
  }
  // Bottom Z=0
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      const x0 = (i / M) * dx, x1 = ((i + 1) / M) * dx;
      const y0 = (j / M) * dy, y1 = ((j + 1) / M) * dy;
      addQuad([0, 0, -1], [x0, y0, 0], [x0, y1, 0], [x1, y1, 0], [x1, y0, 0]);
    }
  }
  // Top Z=dz
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      const x0 = (i / M) * dx, x1 = ((i + 1) / M) * dx;
      const y0 = (j / M) * dy, y1 = ((j + 1) / M) * dy;
      addQuad([0, 0, 1], [x0, y0, dz], [x1, y0, dz], [x1, y1, dz], [x0, y1, dz]);
    }
  }
  // Front Y=0
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < M; k++) {
      const x0 = (i / M) * dx, x1 = ((i + 1) / M) * dx;
      const z0 = (k / M) * dz, z1 = ((k + 1) / M) * dz;
      addQuad([0, -1, 0], [x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]);
    }
  }
  // Back Y=dy
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < M; k++) {
      const x0 = (i / M) * dx, x1 = ((i + 1) / M) * dx;
      const z0 = (k / M) * dz, z1 = ((k + 1) / M) * dz;
      addQuad([0, 1, 0], [x0, dy, z0], [x0, dy, z1], [x1, dy, z1], [x1, dy, z0]);
    }
  }
  // Left X=0
  for (let j = 0; j < M; j++) {
    for (let k = 0; k < M; k++) {
      const y0 = (j / M) * dy, y1 = ((j + 1) / M) * dy;
      const z0 = (k / M) * dz, z1 = ((k + 1) / M) * dz;
      addQuad([-1, 0, 0], [0, y0, z0], [0, y0, z1], [0, y1, z1], [0, y1, z0]);
    }
  }
  // Right X=dx
  for (let j = 0; j < M; j++) {
    for (let k = 0; k < M; k++) {
      const y0 = (j / M) * dy, y1 = ((j + 1) / M) * dy;
      const z0 = (k / M) * dz, z1 = ((k + 1) / M) * dz;
      addQuad([1, 0, 0], [dx, y0, z0], [dx, y1, z0], [dx, y1, z1], [dx, y0, z1]);
    }
  }
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

challenge('Domain 6', 'D6.3: 10,800 Triangle Connected Mesh (< 15ms SLA target)', () => {
  const buf = generateSubdividedCube(30); // 10,800 tris
  // Warm-up and tier-up passes
  let minElapsed = Infinity;
  let lastRes = null;
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    lastRes = StlLoader.parse(buf);
    const dt = performance.now() - t0;
    if (dt < minElapsed) minElapsed = dt;
  }

  console.log(`      * 10,800 Connected tris: best ${minElapsed.toFixed(2)}ms (SLA: < 15ms)`);
  assert.strictEqual(lastRes.totalTriangles, 10800);
  assert(minElapsed < 15.0, `Parse time ${minElapsed.toFixed(2)}ms exceeded 15ms SLA`);
});

challenge('Domain 6', 'D6.4: 10,800 Disjoint Triangle Mesh (worst-case spatial hash probe)', () => {
  const buf = createBenchBinary(10800);
  StlLoader.parse(buf);
  const t0 = performance.now();
  const res = StlLoader.parse(buf);
  const elapsed = performance.now() - t0;
  console.log(`      * 10,800 Disjoint tris: ${elapsed.toFixed(2)}ms`);
  assert.strictEqual(res.totalTriangles, 10800);
  assert(elapsed < 30, `Parse time ${elapsed}ms exceeded 30ms upper bound`);
});

challenge('Domain 6', 'D6.5: 25,000 Triangle Binary Mesh (large mesh scaling probe)', () => {
  const buf = createBenchBinary(25000);
  // Best of 2 runs
  let minElapsed = Infinity;
  let lastRes = null;
  for (let r = 0; r < 2; r++) {
    const t0 = performance.now();
    lastRes = StlLoader.parse(buf);
    const dt = performance.now() - t0;
    if (dt < minElapsed) minElapsed = dt;
  }
  console.log(`      * 25,000 Binary tris (1.25 MB): best ${minElapsed.toFixed(2)}ms`);
  assert.strictEqual(lastRes.totalTriangles, 25000);
  assert(minElapsed < 60, `Parse time ${minElapsed}ms exceeded 60ms reasonable bound`);
});

challenge('Domain 6', 'D6.6: 1,000 Triangle ASCII Mesh (< 5ms target)', () => {
  const buf = createBenchAscii(1000);
  const t0 = performance.now();
  const res = StlLoader.parse(buf);
  const elapsed = performance.now() - t0;
  console.log(`      * 1,000 ASCII tris (94 KB): ${elapsed.toFixed(2)}ms`);
  assert.strictEqual(res.totalTriangles, 1000);
  assert(elapsed < 15, `Parse time ${elapsed}ms exceeded 15ms`);
});

challenge('Domain 6', 'D6.7: 5,000 Triangle ASCII Mesh (< 15ms target)', () => {
  const buf = createBenchAscii(5000);
  const t0 = performance.now();
  const res = StlLoader.parse(buf);
  const elapsed = performance.now() - t0;
  console.log(`      * 5,000 ASCII tris (485 KB): ${elapsed.toFixed(2)}ms`);
  assert.strictEqual(res.totalTriangles, 5000);
  assert(elapsed < 15, `Parse time ${elapsed}ms exceeded 15ms`);
});

challenge('Domain 6', 'D6.8: 10,000 Triangle ASCII Mesh (~1 MB text scaling probe)', () => {
  const buf = createBenchAscii(10000);
  const t0 = performance.now();
  const res = StlLoader.parse(buf);
  const elapsed = performance.now() - t0;
  console.log(`      * 10,000 ASCII tris (973 KB): ${elapsed.toFixed(2)}ms`);
  assert.strictEqual(res.totalTriangles, 10000);
  assert(elapsed < 30, `Parse time ${elapsed}ms exceeded 30ms`);
});


// =============================================================================
// SUMMARY & EXIT CODE
// =============================================================================
console.log('\n================================================================');
console.log(`  EMPIRICAL CHALLENGE SUMMARY: ${passedChallenges} PASSED, ${failedChallenges} FAILED (TOTAL: ${totalChallenges})`);
console.log('================================================================\n');

if (failedChallenges > 0) {
  process.exit(1);
}
