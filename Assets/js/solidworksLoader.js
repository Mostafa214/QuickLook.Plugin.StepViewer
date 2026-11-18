/**
 * Clean-Room MIT SolidWorks (.SLDPRT / .SLDASM) Parser
 *
 * Supports:
 * 1. Modern SolidWorks 2015+ flat container (marker 14 00 06 00 08 00, CRC-32 validation,
 *    nibble-swapped member names, raw DEFLATE / zlib via fflate, cache-cell grid skipping).
 * 2. Legacy SolidWorks <=2014 OLE2 / MS-CFB compound file fallback + __ZLB zlib inflate.
 * 3. Saved tessellation decoding from Contents/DisplayLists and FaceTessellations/*:
 *    6-descriptor strip tables (uoTempBodyTessData_c / uoTempFaceTessData_c),
 *    alternating-winding triangle strip unwinding, metres -> millimetres (x1000) scaling.
 * 4. .SLDASM assembly reconstruction from swXmlContents/COMPINSTANCETREE +
 *    FaceTessellations/Directory + FaceTessellations/<chunk>, virtual/imported streams,
 *    and optional async/sync siblingResolver(fileName) callback.
 * 5. PreviewPNG fallback: extracts PreviewPNG as base64 data URL when 0 triangles exist.
 *
 * Output schema matches QuickLook onTessellationComplete.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var fflateLib = (typeof fflate !== 'undefined') ? fflate : require('./vendor/fflate.min.js');
    module.exports = factory(fflateLib);
  } else {
    root.SolidWorksLoader = factory(root.fflate);
  }
}(typeof self !== 'undefined' ? self : this, function (fflate) {
  'use strict';

  var SW_SIGNATURE = [0x14, 0x00, 0x06, 0x00, 0x08, 0x00];
  var OLE2_MAGIC = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  var PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  var STRING_MARKER = [0xFF, 0xFE, 0xFF];
  var BLOCK_HEADER_SIZE = 26;
  var MAX_BLOCK_NAME = 1024;
  var METRE_TO_MM = 1000.0;
  var DEFAULT_COLOR = [0.722, 0.753, 0.800];
  var IDENTITY_MATRIX = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];

  // Precomputed IEEE 802.3 CRC-32 table
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function toUint8Array(buffer) {
    if (!buffer) return new Uint8Array(0);
    if (buffer instanceof Uint8Array) return buffer;
    if (ArrayBuffer.isView(buffer)) {
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
    if (buffer instanceof ArrayBuffer) {
      return new Uint8Array(buffer);
    }
    throw new Error('SolidWorksLoader: expected ArrayBuffer or Uint8Array');
  }

  function matchesBytesAt(bytes, offset, pattern) {
    if (offset < 0 || offset + pattern.length > bytes.length) return false;
    for (var i = 0; i < pattern.length; i++) {
      if (bytes[offset + i] !== pattern[i]) return false;
    }
    return true;
  }

  function findBytes(bytes, pattern, fromIndex) {
    var start = fromIndex || 0;
    var pLen = pattern.length;
    var limit = bytes.length - pLen;
    var first = pattern[0];
    for (var i = start; i <= limit; i++) {
      if (bytes[i] !== first) continue;
      var ok = true;
      for (var j = 1; j < pLen; j++) {
        if (bytes[i + j] !== pattern[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  }

  function readU32LE(bytes, offset) {
    return (
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)
    ) >>> 0;
  }

  function readU16LE(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0;
  }

  function readI32LE(bytes, offset) {
    return (
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)
    ) | 0;
  }

  function readF32LE(dv, offset) {
    return dv.getFloat32(offset, true);
  }

  function decodeAscii(bytes, start, end) {
    var s = '';
    for (var i = start; i < end; i++) {
      s += String.fromCharCode(bytes[i]);
    }
    return s;
  }

  function decodeUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
    if (fflate && typeof fflate.strFromU8 === 'function') {
      return fflate.strFromU8(bytes);
    }
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      out += String.fromCharCode(bytes[i]);
    }
    return out;
  }

  function decodeUtf16LE(bytes, start, byteLen) {
    var end = start + byteLen;
    var s = '';
    for (var i = start; i + 1 < end; i += 2) {
      s += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
    }
    return s;
  }

  function uint8ToBase64(bytes) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var out = '';
    var len = bytes.length;
    for (var i = 0; i < len; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < len ? bytes[i + 1] : 0;
      var b2 = i + 2 < len ? bytes[i + 2] : 0;
      var triple = (b0 << 16) | (b1 << 8) | b2;
      out += chars[(triple >> 18) & 63];
      out += chars[(triple >> 12) & 63];
      out += i + 1 < len ? chars[(triple >> 6) & 63] : '=';
      out += i + 2 < len ? chars[triple & 63] : '=';
    }
    return out;
  }

  function inflateBlockPayload(raw, expectedSize, expectedCrc) {
    if (!raw || raw.length === 0) return new Uint8Array(0);
    if (!fflate) {
      throw new Error('SolidWorksLoader: fflate library is required for decompression');
    }

    var out = null;
    try {
      out = fflate.inflateSync(raw);
    } catch (e1) {
      try {
        out = fflate.unzlibSync(raw);
      } catch (e2) {
        if (expectedSize === raw.length) {
          out = raw;
        } else {
          throw e1;
        }
      }
    }

    if (expectedCrc && expectedSize > 0 && out.length === expectedSize) {
      var actualCrc = crc32(out);
      if (actualCrc !== expectedCrc) {
        throw new Error('SolidWorksLoader: CRC-32 mismatch in container block');
      }
    }
    return out;
  }

  /**
   * Read named blocks from a modern SolidWorks 2015+ container.
   */
  function readBlocks2015(bytes) {
    var blocks = [];
    var pos = 8;
    var n = bytes.length;

    while (pos < n) {
      var at = findBytes(bytes, SW_SIGNATURE, pos);
      if (at < 0) break;
      pos = at + 1;
      if (at + BLOCK_HEADER_SIZE > n) break;

      var typeId = readU32LE(bytes, at + 6);
      var checksum = readU32LE(bytes, at + 10);
      var compressed = readU32LE(bytes, at + 14);
      var expanded = readU32LE(bytes, at + 18);
      var nameLen = readU32LE(bytes, at + 22);

      // Skip cache-cell section-index grid entries (2L, L/2, L)
      if (checksum === expanded * 2 && compressed === (expanded >>> 1)) {
        continue;
      }
      if (!compressed || nameLen < 1 || nameLen > MAX_BLOCK_NAME) {
        continue;
      }
      var dataOffset = at + BLOCK_HEADER_SIZE + nameLen;
      if (dataOffset + compressed > n) {
        continue;
      }

      // Unswap nibbles in the block name
      var printable = true;
      var name = '';
      for (var i = 0; i < nameLen; i++) {
        var b = bytes[at + BLOCK_HEADER_SIZE + i];
        var ch = ((b & 0x0F) << 4) | ((b & 0xF0) >> 4);
        if (ch < 0x20 || ch > 0x7E) {
          printable = false;
          break;
        }
        name += String.fromCharCode(ch);
      }
      if (!printable) continue;

      blocks.push({
        name: name,
        offset: at,
        dataOffset: dataOffset,
        compressed: compressed,
        expanded: expanded,
        typeId: typeId,
        crc: checksum,
        _cached: null,
        inflate: (function (start, len, exp, crc) {
          return function () {
            if (this._cached) return this._cached;
            var raw = bytes.subarray(start, start + len);
            this._cached = inflateBlockPayload(raw, exp, crc);
            return this._cached;
          };
        })(dataOffset, compressed, expanded, checksum)
      });
    }

    return blocks;
  }

  /**
   * Minimal pure-JS OLE2 (MS-CFB) reader for pre-2015 SolidWorks files.
   * Supports __ZLB / zlib-compressed streams.
   */
  function readBlocksOle2(bytes) {
    if (bytes.length < 512 || !matchesBytesAt(bytes, 0, OLE2_MAGIC)) {
      return [];
    }

    var sectorShift = readU16LE(bytes, 0x1E);
    var miniSectorShift = readU16LE(bytes, 0x20);
    var sectorSize = 1 << sectorShift;
    var miniSectorSize = 1 << miniSectorShift;
    var totalFatSectors = readU32LE(bytes, 0x2C);
    var firstDirSector = readU32LE(bytes, 0x30);
    var miniStreamCutoff = readU32LE(bytes, 0x38);
    var firstMiniFatSector = readU32LE(bytes, 0x3C);
    var numMiniFatSectors = readU32LE(bytes, 0x40);
    var firstDifatSector = readU32LE(bytes, 0x44);
    var numDifatSectors = readU32LE(bytes, 0x48);

    var ENDOFCHAIN = 0xFFFFFFFE;
    var FREESECT = 0xFFFFFFFF;
    var MAXREGSECT = 0xFFFFFFFA;

    function sectorOffset(sect) {
      return (sect + 1) * sectorSize;
    }

    // Collect DIFAT entries (first 109 in header at 0x4C, then chained DIFAT sectors)
    var fatSectorIds = [];
    for (var i = 0; i < 109 && fatSectorIds.length < totalFatSectors; i++) {
      var sid = readU32LE(bytes, 0x4C + i * 4);
      if (sid <= MAXREGSECT) fatSectorIds.push(sid);
    }
    var difatSect = firstDifatSector;
    var difatCount = 0;
    while (difatSect <= MAXREGSECT && difatCount < numDifatSectors && fatSectorIds.length < totalFatSectors) {
      var off = sectorOffset(difatSect);
      if (off + sectorSize > bytes.length) break;
      var entriesPerDifat = (sectorSize / 4) - 1;
      for (var j = 0; j < entriesPerDifat && fatSectorIds.length < totalFatSectors; j++) {
        var fsid = readU32LE(bytes, off + j * 4);
        if (fsid <= MAXREGSECT) fatSectorIds.push(fsid);
      }
      difatSect = readU32LE(bytes, off + entriesPerDifat * 4);
      difatCount++;
    }

    // Build FAT table
    var fatEntriesPerSector = sectorSize / 4;
    var fat = new Uint32Array(fatSectorIds.length * fatEntriesPerSector);
    for (var fsIdx = 0; fsIdx < fatSectorIds.length; fsIdx++) {
      var fOff = sectorOffset(fatSectorIds[fsIdx]);
      if (fOff + sectorSize > bytes.length) break;
      for (var k = 0; k < fatEntriesPerSector; k++) {
        fat[fsIdx * fatEntriesPerSector + k] = readU32LE(bytes, fOff + k * 4);
      }
    }

    function readChain(startSector, maxBytes) {
      var chunks = [];
      var total = 0;
      var cur = startSector;
      var visited = 0;
      var maxSectors = Math.ceil(bytes.length / sectorSize) + 16;
      while (cur <= MAXREGSECT && visited < maxSectors) {
        var sOff = sectorOffset(cur);
        if (sOff >= bytes.length) break;
        var take = Math.min(sectorSize, bytes.length - sOff);
        if (maxBytes !== undefined && total + take > maxBytes) {
          take = maxBytes - total;
        }
        if (take > 0) {
          chunks.push(bytes.subarray(sOff, sOff + take));
          total += take;
        }
        if (maxBytes !== undefined && total >= maxBytes) break;
        cur = cur < fat.length ? fat[cur] : ENDOFCHAIN;
        visited++;
      }
      var out = new Uint8Array(total);
      var pos = 0;
      for (var c = 0; c < chunks.length; c++) {
        out.set(chunks[c], pos);
        pos += chunks[c].length;
      }
      return out;
    }

    // Read Directory stream
    var dirBytes = readChain(firstDirSector);
    var numDirEntries = Math.floor(dirBytes.length / 128);
    var dirEntries = [];
    for (var d = 0; d < numDirEntries; d++) {
      var base = d * 128;
      var nameByteLen = readU16LE(dirBytes, base + 0x40);
      var objType = dirBytes[base + 0x42];
      var leftSibling = readU32LE(dirBytes, base + 0x44);
      var rightSibling = readU32LE(dirBytes, base + 0x48);
      var child = readU32LE(dirBytes, base + 0x4C);
      var startSect = readU32LE(dirBytes, base + 0x74);
      var sizeLow = readU32LE(dirBytes, base + 0x78);
      var nameStr = '';
      if (nameByteLen >= 2 && nameByteLen <= 64) {
        nameStr = decodeUtf16LE(dirBytes, base, nameByteLen - 2);
      }
      dirEntries.push({
        id: d,
        name: nameStr,
        objType: objType, // 1=storage, 2=stream, 5=root
        left: leftSibling,
        right: rightSibling,
        child: child,
        startSector: startSect,
        size: sizeLow
      });
    }

    if (dirEntries.length === 0) return [];

    // Read MiniFAT and MiniStream if present
    var rootEntry = dirEntries[0];
    var miniStream = (rootEntry.startSector <= MAXREGSECT && rootEntry.size > 0)
      ? readChain(rootEntry.startSector, rootEntry.size)
      : new Uint8Array(0);
    var miniFatBytes = (firstMiniFatSector <= MAXREGSECT && numMiniFatSectors > 0)
      ? readChain(firstMiniFatSector)
      : new Uint8Array(0);
    var miniFat = new Uint32Array(Math.floor(miniFatBytes.length / 4));
    for (var m = 0; m < miniFat.length; m++) {
      miniFat[m] = readU32LE(miniFatBytes, m * 4);
    }

    function readMiniChain(startSector, size) {
      var out = new Uint8Array(size);
      var pos = 0;
      var cur = startSector;
      var visited = 0;
      var limit = miniFat.length + 16;
      while (cur <= MAXREGSECT && pos < size && visited < limit) {
        var mOff = cur * miniSectorSize;
        if (mOff >= miniStream.length) break;
        var take = Math.min(miniSectorSize, size - pos, miniStream.length - mOff);
        out.set(miniStream.subarray(mOff, mOff + take), pos);
        pos += take;
        cur = cur < miniFat.length ? miniFat[cur] : ENDOFCHAIN;
        visited++;
      }
      return out;
    }

    function decompressOleStream(raw) {
      if (!raw || raw.length === 0) return raw;
      // Check for __ZLB header or standard zlib header (0x78 ...)
      if (raw.length > 6 && raw[0] === 0x5F && raw[1] === 0x5F && raw[2] === 0x5A && raw[3] === 0x4C && raw[4] === 0x42) {
        // __ZLB + optional length/header before zlib stream
        for (var zOff = 5; zOff < Math.min(raw.length - 2, 32); zOff++) {
          if (raw[zOff] === 0x78 && (raw[zOff + 1] === 0x9C || raw[zOff + 1] === 0xDA || raw[zOff + 1] === 0x01 || raw[zOff + 1] === 0x5E)) {
            try { return fflate.unzlibSync(raw.subarray(zOff)); } catch (e) {}
          }
        }
      }
      if (raw.length > 2 && raw[0] === 0x78 && (raw[1] === 0x9C || raw[1] === 0xDA || raw[1] === 0x01 || raw[1] === 0x5E)) {
        try { return fflate.unzlibSync(raw); } catch (e) {}
      }
      return raw;
    }

    var blocks = [];
    var seenNodes = new Set();

    function walkTree(nodeId, prefix) {
      if (nodeId >= dirEntries.length || nodeId === FREESECT || seenNodes.has(nodeId)) return;
      seenNodes.add(nodeId);
      var entry = dirEntries[nodeId];
      if (entry.left < dirEntries.length) walkTree(entry.left, prefix);

      var fullPath = prefix ? (prefix + '/' + entry.name) : entry.name;
      if (entry.objType === 2 && entry.size > 0) {
        blocks.push({
          name: fullPath,
          offset: 0,
          dataOffset: 0,
          compressed: entry.size,
          expanded: entry.size,
          typeId: 0,
          crc: 0,
          _cached: null,
          inflate: (function (e) {
            return function () {
              if (this._cached) return this._cached;
              var raw = (e.size < miniStreamCutoff && miniStream.length > 0)
                ? readMiniChain(e.startSector, e.size)
                : readChain(e.startSector, e.size);
              this._cached = decompressOleStream(raw);
              return this._cached;
            };
          })(entry)
        });
      }
      if (entry.objType === 1 && entry.child < dirEntries.length) {
        walkTree(entry.child, fullPath);
      }

      if (entry.right < dirEntries.length) walkTree(entry.right, prefix);
    }

    if (rootEntry.child < dirEntries.length) {
      walkTree(rootEntry.child, '');
    }

    return blocks;
  }

  function readBlocks(bytes) {
    if (matchesBytesAt(bytes, 0, OLE2_MAGIC)) {
      return readBlocksOle2(bytes);
    }
    return readBlocks2015(bytes);
  }

  function findBlock(blocks, name) {
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].name === name) return blocks[i];
    }
    var lower = name.toLowerCase();
    for (var j = 0; j < blocks.length; j++) {
      if (blocks[j].name.toLowerCase() === lower) return blocks[j];
    }
    return null;
  }

  /**
   * Read 6-descriptor strip tables from DisplayLists or FaceTessellations chunks.
   * Each table begins with TABLE_SIGNATURE: [4, 8, 2] (u32 LE).
   */
  var TABLE_SIGNATURE = [4, 0, 0, 0, 8, 0, 0, 0, 2, 0, 0, 0];

  function readTableAt(data, at) {
    if (at + 16 > data.length) return null;
    if (!matchesBytesAt(data, at, TABLE_SIGNATURE)) return null;

    var stripCount = readU32LE(data, at + 12);
    if (stripCount === 0 || stripCount > 100000) return null;

    var d1End = at + 16 + stripCount * 4;
    if (d1End + 16 > data.length) return null;

    var strips = new Uint32Array(stripCount);
    var totalVerts = 0;
    for (var i = 0; i < stripCount; i++) {
      var len = readU32LE(data, at + 16 + i * 4);
      if (len > 1000000) return null;
      strips[i] = len;
      totalVerts += len;
    }

    // Descriptor 2: positions [12, 100, 2, totalVerts]
    var d2Es = readU32LE(data, d1End);
    var d2Tag = readU32LE(data, d1End + 4);
    var d2St = readU32LE(data, d1End + 8);
    var d2Cnt = readU32LE(data, d1End + 12);
    if (d2Es !== 12 || d2Tag !== 100 || d2St !== 2 || d2Cnt !== totalVerts) return null;

    var posOff = d1End + 16;
    var d2End = posOff + totalVerts * 12;
    if (d2End + 16 > data.length) return null;

    // Descriptor 3: normals [12, 100, 2, totalVerts]
    var d3Es = readU32LE(data, d2End);
    var d3Tag = readU32LE(data, d2End + 4);
    var d3St = readU32LE(data, d2End + 8);
    var d3Cnt = readU32LE(data, d2End + 12);
    if (d3Es !== 12 || d3Tag !== 100 || d3St !== 2 || d3Cnt !== totalVerts) return null;

    var normOff = d2End + 16;
    var d3End = normOff + totalVerts * 12;
    if (d3End > data.length) return null;

    // Advance past optional descriptors 4, 5, 6 if present
    var tableEnd = d3End;
    if (tableEnd + 16 <= data.length && matchesBytesAt(data, tableEnd, TABLE_SIGNATURE)) {
      var metaCount = readU32LE(data, tableEnd + 12);
      var d4End = tableEnd + 16 + metaCount * 4;
      if (d4End <= data.length) {
        tableEnd = d4End;
        if (tableEnd + 16 <= data.length && matchesBytesAt(data, tableEnd, TABLE_SIGNATURE)) {
          var s5Count = readU32LE(data, tableEnd + 12);
          var d5End = tableEnd + 16 + s5Count * 4;
          if (d5End <= data.length) {
            tableEnd = d5End;
            if (tableEnd + 16 <= data.length &&
                readU32LE(data, tableEnd) === 1 &&
                readU32LE(data, tableEnd + 4) === 8 &&
                readU32LE(data, tableEnd + 8) === 2) {
              var b6Count = readU32LE(data, tableEnd + 12);
              var d6End = tableEnd + 16 + b6Count;
              if (d6End <= data.length) {
                tableEnd = d6End;
              }
            }
          }
        }
      }
    }

    return {
      start: at,
      end: tableEnd,
      strips: strips,
      totalVerts: totalVerts,
      posOff: posOff,
      normOff: normOff
    };
  }

  function readTables(data, maxTables, startOffset, endOffset) {
    var tables = [];
    var pos = startOffset || 0;
    var limit = (endOffset !== undefined) ? endOffset : data.length;
    var maxT = maxTables || 250000;

    while (pos + 16 <= limit && tables.length < maxT) {
      var at = findBytes(data, TABLE_SIGNATURE, pos);
      if (at < 0 || at >= limit) break;
      var table = readTableAt(data, at);
      if (!table || table.end > limit) {
        pos = at + 1;
        continue;
      }
      tables.push(table);
      pos = table.end;
    }
    return tables;
  }

  /**
   * Unwind triangle strip tables into flat non-indexed Float32Array positions & normals
   * scaled from metres -> millimetres (x1000).
   */
  function meshFromTables(data, tables) {
    var maxTris = 0;
    for (var t = 0; t < tables.length; t++) {
      var strips = tables[t].strips;
      for (var s = 0; s < strips.length; s++) {
        if (strips[s] >= 3) maxTris += strips[s] - 2;
      }
    }

    if (maxTris === 0) {
      return {
        position: new Float32Array(0),
        normal: new Float32Array(0),
        triangles: 0
      };
    }

    var dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    var posOut = new Float32Array(maxTris * 9);
    var normOut = new Float32Array(maxTris * 9);
    var writeIdx = 0;

    for (var ti = 0; ti < tables.length; ti++) {
      var tbl = tables[ti];
      var pOff = tbl.posOff;
      var nOff = tbl.normOff;
      var vBase = 0;

      for (var si = 0; si < tbl.strips.length; si++) {
        var len = tbl.strips[si];
        if (len < 3) {
          vBase += len;
          continue;
        }

        for (var k = 0; k + 2 < len; k++) {
          // Alternating winding on odd triangles
          var i0 = vBase + ((k & 1) === 0 ? k : k + 1);
          var i1 = vBase + ((k & 1) === 0 ? k + 1 : k);
          var i2 = vBase + k + 2;

          var p0x = readF32LE(dv, pOff + i0 * 12) * METRE_TO_MM;
          var p0y = readF32LE(dv, pOff + i0 * 12 + 4) * METRE_TO_MM;
          var p0z = readF32LE(dv, pOff + i0 * 12 + 8) * METRE_TO_MM;

          var p1x = readF32LE(dv, pOff + i1 * 12) * METRE_TO_MM;
          var p1y = readF32LE(dv, pOff + i1 * 12 + 4) * METRE_TO_MM;
          var p1z = readF32LE(dv, pOff + i1 * 12 + 8) * METRE_TO_MM;

          var p2x = readF32LE(dv, pOff + i2 * 12) * METRE_TO_MM;
          var p2y = readF32LE(dv, pOff + i2 * 12 + 4) * METRE_TO_MM;
          var p2z = readF32LE(dv, pOff + i2 * 12 + 8) * METRE_TO_MM;

          if (!Number.isFinite(p0x) || !Number.isFinite(p0y) || !Number.isFinite(p0z) ||
              !Number.isFinite(p1x) || !Number.isFinite(p1y) || !Number.isFinite(p1z) ||
              !Number.isFinite(p2x) || !Number.isFinite(p2y) || !Number.isFinite(p2z)) {
            continue;
          }

          // Skip degenerate strip connector triangles
          var ux = p1x - p0x, uy = p1y - p0y, uz = p1z - p0z;
          var vx = p2x - p0x, vy = p2y - p0y, vz = p2z - p0z;
          var cx = uy * vz - uz * vy;
          var cy = uz * vx - ux * vz;
          var cz = ux * vy - uy * vx;
          var area2 = Math.hypot(cx, cy, cz);
          if (area2 < 1e-9) {
            continue;
          }

          var n0x = readF32LE(dv, nOff + i0 * 12);
          var n0y = readF32LE(dv, nOff + i0 * 12 + 4);
          var n0z = readF32LE(dv, nOff + i0 * 12 + 8);
          var n1x = readF32LE(dv, nOff + i1 * 12);
          var n1y = readF32LE(dv, nOff + i1 * 12 + 4);
          var n1z = readF32LE(dv, nOff + i1 * 12 + 8);
          var n2x = readF32LE(dv, nOff + i2 * 12);
          var n2y = readF32LE(dv, nOff + i2 * 12 + 4);
          var n2z = readF32LE(dv, nOff + i2 * 12 + 8);

          var fx = cx / area2, fy = cy / area2, fz = cz / area2;
          if (!Number.isFinite(n0x) || Math.hypot(n0x, n0y, n0z) < 1e-6) { n0x = fx; n0y = fy; n0z = fz; }
          if (!Number.isFinite(n1x) || Math.hypot(n1x, n1y, n1z) < 1e-6) { n1x = fx; n1y = fy; n1z = fz; }
          if (!Number.isFinite(n2x) || Math.hypot(n2x, n2y, n2z) < 1e-6) { n2x = fx; n2y = fy; n2z = fz; }

          posOut[writeIdx]     = p0x; posOut[writeIdx + 1] = p0y; posOut[writeIdx + 2] = p0z;
          posOut[writeIdx + 3] = p1x; posOut[writeIdx + 4] = p1y; posOut[writeIdx + 5] = p1z;
          posOut[writeIdx + 6] = p2x; posOut[writeIdx + 7] = p2y; posOut[writeIdx + 8] = p2z;

          normOut[writeIdx]     = n0x; normOut[writeIdx + 1] = n0y; normOut[writeIdx + 2] = n0z;
          normOut[writeIdx + 3] = n1x; normOut[writeIdx + 4] = n1y; normOut[writeIdx + 5] = n1z;
          normOut[writeIdx + 6] = n2x; normOut[writeIdx + 7] = n2y; normOut[writeIdx + 8] = n2z;

          writeIdx += 9;
        }
        vBase += len;
      }
    }

    var finalPos = writeIdx === posOut.length ? posOut : posOut.subarray(0, writeIdx);
    var finalNorm = writeIdx === normOut.length ? normOut : normOut.subarray(0, writeIdx);

    return {
      position: new Float32Array(finalPos),
      normal: new Float32Array(finalNorm),
      triangles: writeIdx / 9
    };
  }

  var SW_ASM_PALETTE = [
    [0.722, 0.753, 0.800],
    [0.545, 0.659, 0.784],
    [0.804, 0.729, 0.569],
    [0.576, 0.690, 0.635],
    [0.694, 0.620, 0.745],
    [0.788, 0.608, 0.565]
  ];

  /**
   * Extract body appearance RGB [0..1, 0..1, 0..1] from SolidWorks VisualStates / DisplayStates blocks.
   */
  function extractAppearanceColor(blocks) {
    if (!blocks || !blocks.length) return null;
    for (var i = 0; i < blocks.length; i++) {
      var nm = (blocks[i].name || '').toLowerCase();
      if (nm.indexOf('visualstates') === -1 && nm.indexOf('displaystates') === -1 && nm.indexOf('material') === -1) {
        continue;
      }
      try {
        var bytes = blocks[i].inflate();
        if (!bytes || bytes.length < 8) continue;
        var text = decodeStreamText(bytes);
        var m = text.match(/(?:rgb|diffuse|color)\s*[:=]\s*["']?\s*([01](?:\.\d+)?)\s*,\s*([01](?:\.\d+)?)\s*,\s*([01](?:\.\d+)?)/i);
        if (m) {
          var r = parseFloat(m[1]), g = parseFloat(m[2]), b = parseFloat(m[3]);
          if (r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1) {
            return [r, g, b];
          }
        }
        var m255 = text.match(/(?:rgb|diffuse|color)\s*[:=]\s*["']?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
        if (m255) {
          var r2 = Math.min(255, parseInt(m255[1], 10)) / 255;
          var g2 = Math.min(255, parseInt(m255[2], 10)) / 255;
          var b2 = Math.min(255, parseInt(m255[3], 10)) / 255;
          return [r2, g2, b2];
        }
      } catch (e) {}
    }
    return null;
  }

  /**
   * Compute surface area, signed volume, bounding box, and watertight/manifold topology.
   */
  function buildMeshObject(name, position, normal, color) {
    var triCount = Math.floor(position.length / 9);
    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    var totalArea = 0;
    var totalVol = 0;

    var edgeCounts = new Map();
    function qKey(x, y, z) {
      return Math.round(x * 1e3) + ',' + Math.round(y * 1e3) + ',' + Math.round(z * 1e3);
    }
    function addEdge(a, b) {
      var key = a < b ? (a + '|' + b) : (b + '|' + a);
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
    }

    for (var i = 0; i < triCount; i++) {
      var b = i * 9;
      var ax = position[b],     ay = position[b + 1], az = position[b + 2];
      var bx = position[b + 3], by = position[b + 4], bz = position[b + 5];
      var cx = position[b + 6], cy = position[b + 7], cz = position[b + 8];

      if (ax < minX) minX = ax; if (ay < minY) minY = ay; if (az < minZ) minZ = az;
      if (ax > maxX) maxX = ax; if (ay > maxY) maxY = ay; if (az > maxZ) maxZ = az;
      if (bx < minX) minX = bx; if (by < minY) minY = by; if (bz < minZ) minZ = bz;
      if (bx > maxX) maxX = bx; if (by > maxY) maxY = by; if (bz > maxZ) maxZ = bz;
      if (cx < minX) minX = cx; if (cy < minY) minY = cy; if (cz < minZ) minZ = cz;
      if (cx > maxX) maxX = cx; if (cy > maxY) maxY = cy; if (cz > maxZ) maxZ = cz;

      var ux = bx - ax, uy = by - ay, uz = bz - az;
      var vx = cx - ax, vy = cy - ay, vz = cz - az;
      var nx = uy * vz - uz * vy;
      var ny = uz * vx - ux * vz;
      var nz = ux * vy - uy * vx;
      totalArea += 0.5 * Math.hypot(nx, ny, nz);
      totalVol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6.0;

      if (triCount <= 100000) {
        var ka = qKey(ax, ay, az);
        var kb = qKey(bx, by, bz);
        var kc = qKey(cx, cy, cz);
        addEdge(ka, kb);
        addEdge(kb, kc);
        addEdge(kc, ka);
      }
    }

    if (triCount === 0) {
      minX = minY = minZ = 0;
      maxX = maxY = maxZ = 0;
    }

    var isWatertight = triCount > 0;
    var isManifold = true;
    if (triCount > 0 && triCount <= 100000) {
      edgeCounts.forEach(function (cnt) {
        if (cnt !== 2) isWatertight = false;
        if (cnt > 2) isManifold = false;
      });
    } else if (triCount > 100000) {
      isWatertight = false;
    }

    var topologyStatus = isWatertight ? 'Watertight' : (isManifold ? 'Open Shell' : 'Non-Manifold');

    return {
      name: name || 'Body_1',
      color: color || DEFAULT_COLOR.slice(),
      position: position,
      normal: normal,
      triangles: triCount,
      surfaceAreaMm2: totalArea,
      areaMm2: totalArea,
      volumeMm3: Math.abs(totalVol),
      isWatertight: isWatertight,
      isManifold: isManifold,
      topologyStatus: topologyStatus,
      bbox: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        size: [maxX - minX, maxY - minY, maxZ - minZ]
      },
      edgeFeatures: [],
      brepFaces: []
    };
  }

  /**
   * Transform a raw mesh (position + normal Float32Arrays in mm) by a 4x4 row-vector matrix.
   * Translation (m[12..14]) is in metres and scaled by 1000.0.
   * If determinant < 0 (mirrored), flip triangle winding so normals stay outward.
   */
  function transformRawMesh(rawMesh, m, mirrored) {
    var srcPos = rawMesh.position;
    var srcNorm = rawMesh.normal;
    var triCount = rawMesh.triangles;
    var dstPos = new Float32Array(srcPos.length);
    var dstNorm = new Float32Array(srcNorm.length);

    var tx = m[12] * METRE_TO_MM;
    var ty = m[13] * METRE_TO_MM;
    var tz = m[14] * METRE_TO_MM;

    for (var t = 0; t < triCount; t++) {
      var base = t * 9;
      for (var v = 0; v < 3; v++) {
        var sIdx = base + v * 3;
        var dIdx = mirrored ? (base + (v === 0 ? 0 : (v === 1 ? 6 : 3))) : sIdx;

        var x = srcPos[sIdx], y = srcPos[sIdx + 1], z = srcPos[sIdx + 2];
        dstPos[dIdx]     = x * m[0] + y * m[4] + z * m[8]  + tx;
        dstPos[dIdx + 1] = x * m[1] + y * m[5] + z * m[9]  + ty;
        dstPos[dIdx + 2] = x * m[2] + y * m[6] + z * m[10] + tz;

        var nx = srcNorm[sIdx], ny = srcNorm[sIdx + 1], nz = srcNorm[sIdx + 2];
        var rnx = nx * m[0] + ny * m[4] + nz * m[8];
        var rny = nx * m[1] + ny * m[5] + nz * m[9];
        var rnz = nx * m[2] + ny * m[6] + nz * m[10];
        var nLen = Math.hypot(rnx, rny, rnz);
        if (nLen > 1e-8) {
          rnx /= nLen; rny /= nLen; rnz /= nLen;
        }
        dstNorm[dIdx]     = rnx;
        dstNorm[dIdx + 1] = rny;
        dstNorm[dIdx + 2] = rnz;
      }
    }

    return {
      position: dstPos,
      normal: dstNorm,
      triangles: triCount
    };
  }

  /**
   * Lightweight pure-JS XML parser for swXmlContents/COMPINSTANCETREE.
   * Strips namespace prefixes and decodes basic XML entities.
   */
  function decodeXmlEntities(str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  function parseXml(xmlText) {
    var stack = [{ tag: '#root', attrs: {}, children: [] }];
    var tagRe = /<(\/?)([A-Za-z0-9_:-]+)([^>]*?)(\/?)>/g;
    var attrRe = /([A-Za-z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    var match;

    while ((match = tagRe.exec(xmlText)) !== null) {
      var isClose = match[1] === '/';
      var rawTag = match[2];
      var colonIdx = rawTag.indexOf(':');
      var tag = colonIdx >= 0 ? rawTag.slice(colonIdx + 1) : rawTag;
      var attrStr = match[3];
      var isSelfClose = match[4] === '/';

      if (isClose) {
        if (stack.length > 1) stack.pop();
        continue;
      }

      var attrs = {};
      var am;
      attrRe.lastIndex = 0;
      while ((am = attrRe.exec(attrStr)) !== null) {
        var aName = am[1];
        var aColon = aName.indexOf(':');
        if (aColon >= 0) aName = aName.slice(aColon + 1);
        attrs[aName] = decodeXmlEntities(am[2] !== undefined ? am[2] : (am[3] || ''));
      }

      var node = { tag: tag, attrs: attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!isSelfClose) {
        stack.push(node);
      }
    }

    for (var i = 0; i < stack[0].children.length; i++) {
      if (stack[0].children[i].tag !== '?xml') {
        return stack[0].children[i];
      }
    }
    return stack[0].children[0] || null;
  }

  function findChild(node, tag) {
    if (!node) return null;
    for (var i = 0; i < node.children.length; i++) {
      if (node.children[i].tag === tag) return node.children[i];
    }
    return null;
  }

  function findChildren(node, tag) {
    var out = [];
    if (!node) return out;
    for (var i = 0; i < node.children.length; i++) {
      if (node.children[i].tag === tag) out.push(node.children[i]);
    }
    return out;
  }

  function parseRigidTransform(text) {
    if (!text) return { matrix: IDENTITY_MATRIX.slice(), mirrored: false };
    var parts = text.trim().split(/\s+/);
    if (parts.length !== 16) return null;
    var m = new Array(16);
    for (var i = 0; i < 16; i++) {
      var v = parseFloat(parts[i]);
      if (!Number.isFinite(v)) return null;
      m[i] = v;
    }
    var det =
      m[0] * (m[5] * m[10] - m[6] * m[9]) -
      m[1] * (m[4] * m[10] - m[6] * m[8]) +
      m[2] * (m[4] * m[9] - m[5] * m[8]);
    return { matrix: m, mirrored: det < 0 };
  }

  function composeMatrices(child, parent) {
    var out = new Array(16);
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
        out[i * 4 + j] =
          child[i * 4] * parent[j] +
          child[i * 4 + 1] * parent[4 + j] +
          child[i * 4 + 2] * parent[8 + j] +
          child[i * 4 + 3] * parent[12 + j];
      }
    }
    return out;
  }

  /**
   * Parse FaceTessellations/Directory binary table.
   */
  function readDirectory(data) {
    if (!data || data.length < 16) return [];
    var version = readU32LE(data, 0);
    if (version !== 2) return [];
    var capacity = readU32LE(data, 4);
    var count = readU32LE(data, 8);
    if (!capacity || capacity > 100000 || !count || count > 20000) return [];

    function readMfcString(posObj) {
      if (!matchesBytesAt(data, posObj.at, STRING_MARKER)) return null;
      posObj.at += 3;
      if (posObj.at >= data.length) return null;
      var len = data[posObj.at++];
      if (len === 0xFF) {
        if (posObj.at + 2 > data.length) return null;
        len = readU16LE(data, posObj.at);
        posObj.at += 2;
        if (len === 0xFFFF) {
          if (posObj.at + 4 > data.length) return null;
          len = readU32LE(data, posObj.at);
          posObj.at += 4;
        }
      }
      if (len > 4096 || posObj.at + len * 2 > data.length) return null;
      var s = decodeUtf16LE(data, posObj.at, len * 2);
      posObj.at += len * 2;
      return s;
    }

    function toHex8(pos) {
      var s = '';
      for (var i = 0; i < 8; i++) {
        var b = data[pos + i];
        s += (b < 16 ? '0' : '') + b.toString(16);
      }
      return s;
    }

    var entries = [];
    var markerPos = findBytes(data, STRING_MARKER, 12);
    for (var i = 0; i < count && markerPos >= 0; i++) {
      var cur = { at: markerPos };
      var name = readMfcString(cur);
      if (name === null || cur.at + 28 > data.length) break;

      var stamp = readU32LE(data, cur.at);
      var config = readU32LE(data, cur.at + 4);
      var alias = toHex8(cur.at + 12);
      var id = toHex8(cur.at + 20);
      cur.at += 28;

      for (var k = 0; k < 4; k++) {
        if (matchesBytesAt(data, cur.at, STRING_MARKER)) break;
        if (cur.at + 8 > data.length) break;
        cur.at += 8;
      }

      var chunk = readMfcString(cur);
      if (chunk === null || cur.at + 4 > data.length) break;
      var index = readU32LE(data, cur.at);
      cur.at += 4;

      entries.push({
        name: name,
        stamp: stamp,
        config: config,
        alias: alias,
        id: id,
        chunk: chunk,
        index: index
      });

      markerPos = findBytes(data, STRING_MARKER, cur.at);
    }

    return entries;
  }

  function decodeComponentMeshes(blocks, entries) {
    var byChunk = new Map();
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.chunk) {
        if (!byChunk.has(e.chunk)) byChunk.set(e.chunk, []);
        byChunk.get(e.chunk).push(e);
      }
    }

    var meshes = new Map();
    byChunk.forEach(function (group, chunkName) {
      var block = findBlock(blocks, 'FaceTessellations/' + chunkName);
      if (!block) return;
      var data = block.inflate();

      var records = [];
      for (var g = 0; g < group.length; g++) {
        var entry = group[g];
        var marker = new Array(12);
        marker[0] = entry.index & 0xFF;
        marker[1] = (entry.index >>> 8) & 0xFF;
        marker[2] = (entry.index >>> 16) & 0xFF;
        marker[3] = (entry.index >>> 24) & 0xFF;
        for (var h = 0; h < 8; h++) {
          marker[4 + h] = parseInt(entry.id.substr(h * 2, 2), 16);
        }

        var start = findBytes(data, marker, 0);
        if (start < 0 || start + 16 > data.length) continue;
        if (findBytes(data, marker, start + 1) >= 0) continue;

        var tableCount = readU32LE(data, start + 12);
        if (!tableCount || tableCount > 250000) continue;
        records.push({ start: start, count: tableCount, entry: entry });
      }

      records.sort(function (a, b) { return a.start - b.start; });
      for (var r = 0; r < records.length; r++) {
        var rec = records[r];
        var end = (r + 1 < records.length) ? records[r + 1].start : data.length;
        var tables = readTables(data, rec.count, rec.start + 16, end);
        if (tables.length === rec.count) {
          meshes.set(rec.entry.id, meshFromTables(data, tables));
        }
      }
    });

    return meshes;
  }

  function extractRawMeshFromBlocks(blocks) {
    var dlBlock = findBlock(blocks, 'Contents/DisplayLists');
    if (!dlBlock) return null;
    var dlData = dlBlock.inflate();
    var tables = readTables(dlData);
    if (tables.length === 0) return null;
    return meshFromTables(dlData, tables);
  }

  function extractPreviewPngDataUrl(blocks) {
    var pngBlock = findBlock(blocks, 'PreviewPNG');
    if (!pngBlock) return null;
    try {
      var data = pngBlock.inflate();
      if (data && data.length > 8 && matchesBytesAt(data, 0, PNG_MAGIC)) {
        return 'data:image/png;base64,' + uint8ToBase64(data);
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  function baseFileName(filePath) {
    if (!filePath) return '';
    var norm = filePath.replace(/\\/g, '/');
    var idx = norm.lastIndexOf('/');
    return idx >= 0 ? norm.slice(idx + 1) : norm;
  }

  function detectFormat(fileName, blocks) {
    if (fileName) {
      var upper = fileName.toUpperCase();
      if (upper.endsWith('.SLDASM')) return 'SLDASM';
      if (upper.endsWith('.SLDPRT')) return 'SLDPRT';
    }
    if (findBlock(blocks, 'swXmlContents/COMPINSTANCETREE')) return 'SLDASM';
    return 'SLDPRT';
  }

  async function parseAssembly(blocks, fileName, siblingResolver) {
    var treeBlock = findBlock(blocks, 'swXmlContents/COMPINSTANCETREE');
    if (!treeBlock) return [];

    var xmlText = decodeUtf8(treeBlock.inflate());
    var rootXml = parseXml(xmlText);
    if (!rootXml) return [];

    var headerNode = findChild(rootXml, 'swHeader');
    var modelListNode = findChild(rootXml, 'swModelList');
    var configListNode = findChild(rootXml, 'swConfigurationList');
    if (!headerNode || !modelListNode || !configListNode) return [];

    var files = new Map();
    findChildren(headerNode, 'swFile').forEach(function (f) {
      if (f.attrs.id) files.set(f.attrs.id, f);
    });

    var models = new Map();
    findChildren(modelListNode, 'swModel').forEach(function (m) {
      if (m.attrs.id) models.set(m.attrs.id, m);
    });

    var configs = findChildren(configListNode, 'swConfiguration');
    if (configs.length === 0) return [];
    var chosen = configs[0];
    for (var c = 0; c < configs.length; c++) {
      if (configs[c].attrs.swMostRecentConfiguration === 'YES') {
        chosen = configs[c];
        break;
      }
    }

    var rootModel = models.get(chosen.attrs.swModelRef);
    if (!rootModel) return [];

    var dirBlock = findBlock(blocks, 'FaceTessellations/Directory');
    var entries = dirBlock ? readDirectory(dirBlock.inflate()) : [];
    var byName = new Map();
    var byId = new Map();
    for (var i = 0; i < entries.length; i++) {
      byName.set(entries[i].name, entries[i]);
      byId.set(entries[i].id, entries[i]);
    }
    var storedMeshes = dirBlock ? decodeComponentMeshes(blocks, entries) : new Map();

    // Index embedded/virtual component blocks (e.g. ImportedComp/..., <name>^<asm>)
    var embeddedPartCache = new Map();
    var siblingPartCache = new Map();

    async function resolvePartMesh(childModel, stepName) {
      var fileRec = files.get(childModel.attrs.swFileRef);
      var swPath = fileRec ? (fileRec.attrs.swPath || '') : '';
      var fName = baseFileName(swPath);
      if (!fName) return null;

      // 1. Check virtual / embedded component streams inside this .SLDASM
      var asmBase = baseFileName(fileName || '').replace(/\.[^.]+$/, '');
      var virtualCandidates = [
        fName,
        'ImportedComp/' + fName,
        fName.replace(/\.[^.]+$/, '') + '^' + asmBase + '.SLDPRT',
        stepName
      ];
      for (var vc = 0; vc < virtualCandidates.length; vc++) {
        var candBlock = findBlock(blocks, virtualCandidates[vc]);
        if (candBlock) {
          if (embeddedPartCache.has(candBlock.name)) {
            return embeddedPartCache.get(candBlock.name);
          }
          try {
            var innerBytes = candBlock.inflate();
            var innerBlocks = readBlocks(innerBytes);
            var innerMesh = extractRawMeshFromBlocks(innerBlocks);
            embeddedPartCache.set(candBlock.name, innerMesh);
            if (innerMesh && innerMesh.triangles > 0) return innerMesh;
          } catch (e) {
            embeddedPartCache.set(candBlock.name, null);
          }
        }
      }

      // 2. Check external siblingResolver callback
      if (typeof siblingResolver === 'function') {
        if (siblingPartCache.has(fName)) {
          return siblingPartCache.get(fName);
        }
        var sibMesh = null;
        try {
          var sibBuf = await siblingResolver(fName);
          if (sibBuf) {
            var sibBytes = toUint8Array(sibBuf);
            var sibBlocks = readBlocks(sibBytes);
            sibMesh = extractRawMeshFromBlocks(sibBlocks);
          }
        } catch (e) {
          sibMesh = null;
        }
        siblingPartCache.set(fName, sibMesh);
        if (sibMesh && sibMesh.triangles > 0) return sibMesh;
      }

      return null;
    }

    var placedMeshes = [];

    async function walk(model, pathPrefix, matrix, depth) {
      if (depth > 8 || !model) return;
      var modelName = model.attrs.swName || '';
      var refs = findChildren(model, 'swReference');

      for (var r = 0; r < refs.length; r++) {
        var ref = refs[r];
        var a = ref.attrs;
        if (a.swSuppressed === 'YES' || a.swHidden === 'YES') continue;

        var child = models.get(a.swModelRef);
        if (!child) continue;

        var step = (a.swName || 'Comp') + '-' + (a.swReferenceNumber || '1') + '@' + modelName;
        var fullPath = pathPrefix ? (pathPrefix + '/' + step) : step;

        var placement = parseRigidTransform(a.swTransform);
        if (!placement) continue;
        var world = composeMatrices(placement.matrix, matrix);
        var worldDet =
          world[0] * (world[5] * world[10] - world[6] * world[9]) -
          world[1] * (world[4] * world[10] - world[6] * world[8]) +
          world[2] * (world[4] * world[9] - world[5] * world[8]);
        var isMirrored = worldDet < 0;

        var childFile = files.get(child.attrs.swFileRef);
        if (childFile && childFile.attrs.swDocType === 'ASSEMBLY') {
          await walk(child, fullPath, world, depth + 1);
          continue;
        }

        var rawMesh = null;
        var entry = byName.get(fullPath);
        if (entry) {
          var target = entry;
          var seen = new Set();
          while (target && !target.chunk) {
            if (seen.has(target.id)) break;
            seen.add(target.id);
            target = byId.get(target.alias);
          }
          if (target) {
            rawMesh = storedMeshes.get(target.id) || null;
          }
        }

        if (!rawMesh || rawMesh.triangles === 0) {
          rawMesh = await resolvePartMesh(child, a.swName || '');
        }

        if (!rawMesh || rawMesh.triangles === 0) continue;

        var transformed = transformRawMesh(rawMesh, world, isMirrored);
        var meshName = a.swName ? (a.swName + '-' + (a.swReferenceNumber || '1')) : fullPath;
        var partColor = rawMesh.color || SW_ASM_PALETTE[placedMeshes.length % SW_ASM_PALETTE.length];
        placedMeshes.push(buildMeshObject(meshName, transformed.position, transformed.normal, partColor));
      }
    }

    await walk(rootModel, '', IDENTITY_MATRIX, 0);
    return placedMeshes;
  }

  /**
   * Main entry point: parses .SLDPRT or .SLDASM buffer into onTessellationComplete schema.
   * Returns a Promise (supports async siblingResolver for .SLDASM).
   *
   * @param {ArrayBuffer|Uint8Array} buffer
   * @param {string} [fileName]
   * @param {Function} [siblingResolver] - Optional (fileName) => ArrayBuffer|Uint8Array|Promise
   * @returns {Promise<Object>}
   */
  async function parse(buffer, fileName, siblingResolver) {
    var tStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var bytes = toUint8Array(buffer);
    var blocks = readBlocks(bytes);
    var format = detectFormat(fileName, blocks);
    var docColor = extractAppearanceColor(blocks);

    var meshes = [];
    if (format === 'SLDASM') {
      meshes = await parseAssembly(blocks, fileName, siblingResolver);
    }

    // Fallback to DisplayLists (for .SLDPRT, or .SLDASM without COMPINSTANCETREE)
    if (meshes.length === 0) {
      var rawMesh = extractRawMeshFromBlocks(blocks);
      if (rawMesh && rawMesh.triangles > 0) {
        var partName = baseFileName(fileName) || 'SolidBody_1';
        meshes.push(buildMeshObject(partName, rawMesh.position, rawMesh.normal, rawMesh.color || docColor));
      }
    }

    var totalTriangles = 0;
    var totalArea = 0;
    var totalVol = 0;
    var allWatertight = meshes.length > 0;
    var allManifold = true;

    for (var i = 0; i < meshes.length; i++) {
      totalTriangles += meshes[i].triangles;
      totalArea += meshes[i].surfaceAreaMm2;
      totalVol += meshes[i].volumeMm3;
      if (!meshes[i].isWatertight) allWatertight = false;
      if (!meshes[i].isManifold) allManifold = false;
    }

    var previewPngDataUrl = (totalTriangles === 0) ? extractPreviewPngDataUrl(blocks) : null;
    var tEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    return {
      format: format,
      fileName: fileName || ('model.' + format.toLowerCase()),
      bufferSize: bytes.byteLength,
      elapsedMs: Math.round(tEnd - tStart),
      meshCount: meshes.length,
      isMultiBody: meshes.length > 1,
      meshes: meshes,
      totalTriangles: totalTriangles,
      surfaceAreaMm2: totalArea,
      areaMm2: totalArea,
      volumeMm3: totalVol,
      isWatertight: allWatertight,
      isManifold: allManifold,
      topologyStatus: allWatertight ? 'Watertight' : (allManifold ? 'Open Shell' : 'Non-Manifold'),
      previewPngDataUrl: previewPngDataUrl
    };
  }

  return {
    parse: parse,
    readBlocks: readBlocks,
    readBlocks2015: readBlocks2015,
    readBlocksOle2: readBlocksOle2,
    readTables: readTables,
    meshFromTables: meshFromTables,
    readDirectory: readDirectory,
    crc32: crc32
  };
}));
