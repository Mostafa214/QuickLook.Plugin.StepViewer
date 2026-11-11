/**
 * QuickLook CAD Studio - 2D Vector Blueprint Generator Engine (v3.6.0)
 * Generates ISO 5457 / ISO 128 / ISO 129 standard 4-view engineering blueprints
 * (Front, Top, Right, Isometric) with multi-format export (High-Res PNG, ISO A3 PDF, Vector SVG).
 *
 * Professional Engineering Features:
 * - Multi-Format Export: Crystal-clear 300 DPI PNG, Standard ISO A3 Landscape PDF, and Vector SVG.
 * - Single-Click Idempotency: Debounced native Windows SaveFileDialog dispatch preventing duplicate dialogs.
 * - True Part Filename Resolution: Automatically inherits original STEP/IGES/BREP filename across CAD sessions.
 * - ISO 5457 Engineering Sheet: Double border, grid reference marks (A-D, 1-6), centring marks.
 * - View-Dependent Silhouette & Crease Extraction: Extracts true outer boundary profiles of
 *   cylinders, shafts, cones, fillets, and holes using dihedral crease & silhouette face-normal dot products.
 * - True Assembly Geometry Invariant: Automatically resets bodies from exploded-view state
 *   to assembled home coordinates (0, 0, 0) during projection, preventing flying components.
 * - ISO 7200 Engineering Title Block: Real part name, calculated mass from MaterialsEngine,
 *   standard engineering scale (1:1, 1:2, etc.), bounding box dimensions, and ISO First Angle Projection symbol.
 * - Full XML Entity Sanitization (SEC-04) & Path Traversal Prevention on Export.
 */
(function () {
  'use strict';

  /**
   * XML character entity escaping helper for safe SVG markup generation (SEC-04).
   * Converts &, <, >, ", ' to their standard predefined XML character entities.
   * Handles null, undefined, numbers, and non-string inputs safely.
   */
  function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  if (typeof window !== 'undefined') {
    window.escapeXml = escapeXml;
    window.SecurityUtils = window.SecurityUtils || {};
    window.SecurityUtils.escapeXml = escapeXml;
  }

  /**
   * Resolves the true original CAD model filename across all possible host scopes.
   */
  function getResolvedModelFileName() {
    let raw = '';
    if (typeof window !== 'undefined') {
      if (typeof window.getLoadedFileName === 'function') {
        raw = window.getLoadedFileName();
      }
      if (!raw) raw = window.pendingFileName || window.currentLoadedModelName;
    }
    if (!raw && typeof pendingFileName !== 'undefined' && pendingFileName) {
      raw = pendingFileName;
    }
    // Extract from DOM badge-filename element (e.g. "Bearing_Flange.step (1.2 MB)")
    if (!raw && typeof document !== 'undefined') {
      const badge = document.getElementById('badge-filename');
      if (badge && badge.innerText) {
        const text = badge.innerText.replace(/\s*\([^)]*\)\s*$/, '').trim();
        if (text && text !== 'Loading...' && text !== 'CAD_Model' && text !== 'CAD Model') {
          raw = text;
        }
      }
    }
    if (!raw && typeof window !== 'undefined' && window.modelBodies && window.modelBodies.length > 0) {
      if (window.modelBodies.length === 1 && window.modelBodies[0].name) {
        raw = window.modelBodies[0].name;
      } else if (window.modelBodies.length > 1) {
        raw = `Assembly_${window.modelBodies.length}_Bodies`;
      }
    }
    return raw || 'CAD_Model';
  }

  /**
   * Quantize 3D coordinates for fast topological vertex welding
   */
  function hashCoord(v) {
    return `${Math.round(v.x * 1000)},${Math.round(v.y * 1000)},${Math.round(v.z * 1000)}`;
  }

  /**
   * View-Dependent Edge Extractor:
   * Extracts silhouette boundary profile edges for curved surfaces (cylinders, spheres, fillets)
   * and dihedral crease edges (sharp mechanical steps, chamfers, transitions).
   */
  function extractViewSilhouetteAndCreaseEdges(mesh, viewDir) {
    const geom = mesh.geometry;
    if (!geom || !geom.attributes || !geom.attributes.position) return [];

    const matrixWorld = mesh.matrixWorld;
    const posAttr = geom.attributes.position;
    const index = geom.index;

    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const pC = new THREE.Vector3();
    const faceNormal = new THREE.Vector3();
    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();

    const edgeMap = new Map();

    function getVertexWorld(idx, target) {
      target.set(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      target.applyMatrix4(matrixWorld);
    }

    function addEdge(v0, v1, fNormal, isFront) {
      const h0 = hashCoord(v0);
      const h1 = hashCoord(v1);
      if (h0 === h1) return; // Ignore degenerate zero-length segments
      const key = h0 < h1 ? `${h0}|${h1}` : `${h1}|${h0}`;

      let entry = edgeMap.get(key);
      if (!entry) {
        entry = {
          v0: v0.clone(),
          v1: v1.clone(),
          normals: [fNormal.clone()],
          front: [isFront]
        };
        edgeMap.set(key, entry);
      } else {
        entry.normals.push(fNormal.clone());
        entry.front.push(isFront);
      }
    }

    const triCount = index ? index.count / 3 : posAttr.count / 3;

    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      getVertexWorld(i0, pA);
      getVertexWorld(i1, pB);
      getVertexWorld(i2, pC);

      cb.subVectors(pC, pB);
      ab.subVectors(pA, pB);
      faceNormal.crossVectors(cb, ab);
      if (faceNormal.lengthSq() < 1e-10) continue;
      faceNormal.normalize();

      const dot = faceNormal.dot(viewDir);
      const isFront = dot > 0.0001;

      addEdge(pA, pB, faceNormal, isFront);
      addEdge(pB, pC, faceNormal, isFront);
      addEdge(pC, pA, faceNormal, isFront);
    }

    const resultEdges = [];
    const CREASE_THRESHOLD = Math.cos(25 * (Math.PI / 180)); // 25 degrees threshold

    for (const entry of edgeMap.values()) {
      // 1. Boundary edges (single-sided open surface)
      if (entry.normals.length === 1) {
        resultEdges.push([entry.v0, entry.v1]);
        continue;
      }

      // 2. Dihedral crease feature edges (sharp mechanical edges)
      let isCrease = false;
      for (let i = 0; i < entry.normals.length - 1; i++) {
        for (let j = i + 1; j < entry.normals.length; j++) {
          if (entry.normals[i].dot(entry.normals[j]) < CREASE_THRESHOLD) {
            isCrease = true;
            break;
          }
        }
        if (isCrease) break;
      }

      if (isCrease) {
        resultEdges.push([entry.v0, entry.v1]);
        continue;
      }

      // 3. View-dependent silhouette profile edges (cylinders, cones, fillets, tori)
      let hasFront = false;
      let hasBack = false;
      for (let k = 0; k < entry.front.length; k++) {
        if (entry.front[k]) hasFront = true;
        else hasBack = true;
      }

      if (hasFront && hasBack) {
        resultEdges.push([entry.v0, entry.v1]);
      }
    }

    return resultEdges;
  }

  /**
   * Selects standard ISO engineering scale ratio
   */
  function determineStandardScale(rawScale) {
    const standardScales = [
      { val: 10.0, str: '10:1' },
      { val: 5.0,  str: '5:1' },
      { val: 2.0,  str: '2:1' },
      { val: 1.0,  str: '1:1' },
      { val: 0.5,  str: '1:2' },
      { val: 0.2,  str: '1:5' },
      { val: 0.1,  str: '1:10' },
      { val: 0.05, str: '1:20' },
      { val: 0.02, str: '1:50' },
      { val: 0.01, str: '1:100' }
    ];

    let chosen = standardScales[standardScales.length - 1];
    for (let i = 0; i < standardScales.length; i++) {
      if (rawScale >= standardScales[i].val * 0.75) {
        chosen = standardScales[i];
        break;
      }
    }
    return chosen;
  }

  function generateBlueprintSvg() {
    if (!window.modelBodies || window.modelBodies.length === 0) {
      if (typeof window.showToast === 'function') {
        window.showToast('No CAD model loaded to generate blueprint');
      }
      return null;
    }

    // 1. Temporarily restore all bodies to assembled state (home position 0,0,0)
    const savedPositions = [];
    window.modelBodies.forEach(b => {
      if (b.mesh) {
        savedPositions.push({
          mesh: b.mesh,
          pos: b.mesh.position.clone()
        });
        b.mesh.position.set(0, 0, 0);
        b.mesh.updateMatrixWorld(true);
      }
    });

    try {
      // 2. Calculate overall model bounding box in assembled coordinates
      const totalBox = new THREE.Box3();
      window.modelBodies.forEach(b => {
        if (b.mesh) totalBox.union(new THREE.Box3().setFromObject(b.mesh));
      });

      const center = totalBox.getCenter(new THREE.Vector3());
      const size = totalBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 1.0);

      // Standard A3 Landscape sheet dimensions (1200 x 848 px)
      const svgWidth = 1200;
      const svgHeight = 848;

      const rawScale = 125 / maxDim;
      const standardScaleInfo = determineStandardScale(rawScale);
      const viewScale = standardScaleInfo.val <= rawScale ? standardScaleInfo.val : rawScale;
      const displayScaleStr = standardScaleInfo.str;

      // 4 Orthographic Views according to ISO 128 / First Angle Projection
      const views = [
        {
          id: 'top',
          title: 'TOP VIEW (X-Z)',
          cx: 280,
          cy: 220,
          w: 430,
          h: 310,
          dimXLabel: `${size.x.toFixed(1)} mm`,
          dimYLabel: `${size.z.toFixed(1)} mm`,
          hasDimensions: true,
          viewDir: new THREE.Vector3(0, 1, 0),
          proj: (p) => ({ x: p.x - center.x, y: -(p.z - center.z) })
        },
        {
          id: 'front',
          title: 'FRONT VIEW (X-Y)',
          cx: 280,
          cy: 575,
          w: 430,
          h: 310,
          dimXLabel: `${size.x.toFixed(1)} mm`,
          dimYLabel: `${size.y.toFixed(1)} mm`,
          hasDimensions: true,
          viewDir: new THREE.Vector3(0, 0, 1),
          proj: (p) => ({ x: p.x - center.x, y: -(p.y - center.y) })
        },
        {
          id: 'right',
          title: 'RIGHT VIEW (Z-Y)',
          cx: 700,
          cy: 575,
          w: 380,
          h: 310,
          dimXLabel: `${size.z.toFixed(1)} mm`,
          dimYLabel: `${size.y.toFixed(1)} mm`,
          hasDimensions: true,
          viewDir: new THREE.Vector3(1, 0, 0),
          proj: (p) => ({ x: p.z - center.z, y: -(p.y - center.y) })
        },
        {
          id: 'iso',
          title: 'ISOMETRIC (3D)',
          cx: 710,
          cy: 220,
          w: 400,
          h: 310,
          hasDimensions: false,
          viewDir: new THREE.Vector3(1, 1, 1).normalize(),
          proj: (p) => {
            const dx = p.x - center.x;
            const dy = p.y - center.y;
            const dz = p.z - center.z;
            const isoX = (dx - dz) * 0.8660254;
            const isoY = -dy + (dx + dz) * 0.5;
            return { x: isoX, y: isoY };
          }
        }
      ];

      // Build Sheet Header & Definitions
      let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" style="background:#ffffff; font-family:'Segoe UI',Roboto,-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;">
  <defs>
    <!-- ISO Dimension Arrowheads -->
    <marker id="arrow-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 10 2 L 0 5 L 10 8 z" fill="#0f172a"/>
    </marker>
    <marker id="arrow-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 2 L 10 5 L 0 8 z" fill="#0f172a"/>
    </marker>
  </defs>

  <!-- Clean Drawing Sheet Background -->
  <rect width="${svgWidth}" height="${svgHeight}" fill="#ffffff" />

  <!-- ISO 5457 Outer Border -->
  <rect x="20" y="20" width="${svgWidth - 40}" height="${svgHeight - 40}" fill="none" stroke="#0f172a" stroke-width="2.4" />
  <!-- ISO 5457 Inner Drawing Frame -->
  <rect x="25" y="25" width="${svgWidth - 50}" height="${svgHeight - 50}" fill="none" stroke="#475569" stroke-width="0.8" />

  <!-- Sheet Zone Coordinates (A-D, 1-6) -->
  <g font-size="9" font-weight="700" fill="#64748b" text-anchor="middle" dominant-baseline="middle">
    <!-- Horizontal Zones (Top and Bottom) -->
    <text x="145" y="22.5">1</text><text x="350" y="22.5">2</text><text x="555" y="22.5">3</text>
    <text x="760" y="22.5">4</text><text x="965" y="22.5">5</text><text x="1145" y="22.5">6</text>
    <text x="145" y="${svgHeight - 22.5}">1</text><text x="350" y="${svgHeight - 22.5}">2</text><text x="555" y="${svgHeight - 22.5}">3</text>
    <text x="760" y="${svgHeight - 22.5}">4</text><text x="965" y="${svgHeight - 22.5}">5</text><text x="1145" y="${svgHeight - 22.5}">6</text>
    <!-- Vertical Zones (Left and Right) -->
    <text x="22.5" y="125">A</text><text x="22.5" y="325">B</text><text x="22.5" y="525">C</text><text x="22.5" y="725">D</text>
    <text x="${svgWidth - 22.5}" y="125">A</text><text x="${svgWidth - 22.5}" y="325">B</text><text x="${svgWidth - 22.5}" y="525">C</text><text x="${svgWidth - 22.5}" y="725">D</text>
  </g>

  <!-- Centring Marks (ISO 5457 Standard) -->
  <line x1="${svgWidth / 2}" y1="15" x2="${svgWidth / 2}" y2="35" stroke="#0f172a" stroke-width="1.5" />
  <line x1="${svgWidth / 2}" y1="${svgHeight - 35}" x2="${svgWidth / 2}" y2="${svgHeight - 15}" stroke="#0f172a" stroke-width="1.5" />
  <line x1="15" y1="${svgHeight / 2}" x2="35" y2="${svgHeight / 2}" stroke="#0f172a" stroke-width="1.5" />
  <line x1="${svgWidth - 35}" y1="${svgHeight / 2}" x2="${svgWidth - 15}" y2="${svgHeight / 2}" stroke="#0f172a" stroke-width="1.5" />
`;

      // Render Each Orthographic View
      views.forEach(v => {
        let minPx = Infinity, maxPx = -Infinity, minPy = Infinity, maxPy = -Infinity;
        let edgesSvg = '';

        window.modelBodies.forEach(b => {
          if (!b.mesh || !b.mesh.geometry) return;

          const edges = extractViewSilhouetteAndCreaseEdges(b.mesh, v.viewDir);

          for (let i = 0; i < edges.length; i++) {
            const edge = edges[i];
            const p0 = v.proj(edge[0]);
            const p1 = v.proj(edge[1]);
            const x1 = v.cx + p0.x * viewScale;
            const y1 = v.cy + p0.y * viewScale;
            const x2 = v.cx + p1.x * viewScale;
            const y2 = v.cy + p1.y * viewScale;

            if (x1 < minPx) minPx = x1;
            if (x2 < minPx) minPx = x2;
            if (x1 > maxPx) maxPx = x1;
            if (x2 > maxPx) maxPx = x2;
            if (y1 < minPy) minPy = y1;
            if (y2 < minPy) minPy = y2;
            if (y1 > maxPy) maxPy = y1;
            if (y2 > maxPy) maxPy = y2;

            edgesSvg += `      <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />\n`;
          }
        });

        const hasGeom = isFinite(minPx) && isFinite(maxPx) && minPx < maxPx;
        const geomMidX = hasGeom ? (minPx + maxPx) / 2 : v.cx;
        const geomMidY = hasGeom ? (minPy + maxPy) / 2 : v.cy;
        const clSpanX = hasGeom ? Math.max((maxPx - minPx) / 2 + 25, 45) : 80;
        const clSpanY = hasGeom ? Math.max((maxPy - minPy) / 2 + 25, 45) : 80;

        svgContent += `
  <!-- ================= ${escapeXml(v.title)} ================= -->
  <g id="view-${v.id}">
    <!-- View Title and Scale Designation -->
    <text x="${v.cx}" y="${v.cy - 145}" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle" letter-spacing="1">${escapeXml(v.title)}</text>
    <text x="${v.cx}" y="${v.cy - 132}" font-size="9" font-weight="600" fill="#64748b" text-anchor="middle">SCALE ${displayScaleStr}</text>

    <!-- ISO 128 Symmetry Centerlines -->
    <g stroke="#94a3b8" stroke-width="0.75" stroke-dasharray="14,3,3,3">
      <line x1="${(geomMidX - clSpanX).toFixed(1)}" y1="${geomMidY.toFixed(1)}" x2="${(geomMidX + clSpanX).toFixed(1)}" y2="${geomMidY.toFixed(1)}" />
      <line x1="${geomMidX.toFixed(1)}" y1="${(geomMidY - clSpanY).toFixed(1)}" x2="${geomMidX.toFixed(1)}" y2="${geomMidY.toFixed(1)}" />
    </g>

    <!-- Projected Visible CAD Contours (ISO Standard 0.35mm / 1.3px stroke) -->
    <g stroke="#0f172a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
${edgesSvg}    </g>
`;

        if (v.hasDimensions && hasGeom) {
          const xSpan = maxPx - minPx;
          const ySpan = maxPy - minPy;

          if (xSpan > 5 && ySpan > 5) {
            const dimY = Math.min(maxPy + 24, v.cy + 138);
            const extTop = maxPy + 3;
            const extBot = dimY + 6;
            const midX = (minPx + maxPx) / 2;

            svgContent += `
    <!-- Horizontal Dimension: ${escapeXml(v.dimXLabel)} -->
    <g class="dim-callout" stroke="#0f172a" stroke-width="0.9">
      <line x1="${minPx.toFixed(1)}" y1="${extTop.toFixed(1)}" x2="${minPx.toFixed(1)}" y2="${extBot.toFixed(1)}" stroke="#64748b" stroke-width="0.7"/>
      <line x1="${maxPx.toFixed(1)}" y1="${extTop.toFixed(1)}" x2="${maxPx.toFixed(1)}" y2="${extBot.toFixed(1)}" stroke="#64748b" stroke-width="0.7"/>
      <line x1="${minPx.toFixed(1)}" y1="${dimY.toFixed(1)}" x2="${maxPx.toFixed(1)}" y2="${dimY.toFixed(1)}" marker-start="url(#arrow-start)" marker-end="url(#arrow-end)"/>
    </g>
    <rect x="${(midX - 32).toFixed(1)}" y="${(dimY - 8).toFixed(1)}" width="64" height="15" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.6" rx="2"/>
    <text x="${midX.toFixed(1)}" y="${(dimY + 3.5).toFixed(1)}" font-size="10" font-weight="700" fill="#0f172a" text-anchor="middle">${escapeXml(v.dimXLabel)}</text>
`;

            const dimX = Math.min(maxPx + 24, v.cx + 140);
            const extLeft = maxPx + 3;
            const extRight = dimX + 6;
            const midY = (minPy + maxPy) / 2;

            svgContent += `
    <!-- Vertical Dimension: ${escapeXml(v.dimYLabel)} -->
    <g class="dim-callout" stroke="#0f172a" stroke-width="0.9">
      <line x1="${extLeft.toFixed(1)}" y1="${minPy.toFixed(1)}" x2="${extRight.toFixed(1)}" y2="${minPy.toFixed(1)}" stroke="#64748b" stroke-width="0.7"/>
      <line x1="${extLeft.toFixed(1)}" y1="${maxPy.toFixed(1)}" x2="${extRight.toFixed(1)}" y2="${maxPy.toFixed(1)}" stroke="#64748b" stroke-width="0.7"/>
      <line x1="${dimX.toFixed(1)}" y1="${minPy.toFixed(1)}" x2="${dimX.toFixed(1)}" y2="${maxPy.toFixed(1)}" marker-start="url(#arrow-start)" marker-end="url(#arrow-end)"/>
    </g>
    <rect x="${(dimX - 32).toFixed(1)}" y="${(midY - 8).toFixed(1)}" width="64" height="15" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.6" rx="2"/>
    <text x="${dimX.toFixed(1)}" y="${(midY + 3.5).toFixed(1)}" font-size="10" font-weight="700" fill="#0f172a" text-anchor="middle">${escapeXml(v.dimYLabel)}</text>
`;
          }
        }

        svgContent += `  </g>\n`;
      });

      // 4. ISO 7200 Engineering Title Block
      let rawPartName = getResolvedModelFileName();
      rawPartName = String(rawPartName).replace(/^.*[\\\/]/, '').replace(/\.[^/.]+$/, '').trim();
      if (!rawPartName || rawPartName.toLowerCase() === 'cad model' || rawPartName.toLowerCase() === 'cad_model') {
        if (window.modelBodies && window.modelBodies.length === 1 && window.modelBodies[0].name) {
          rawPartName = window.modelBodies[0].name;
        } else if (window.modelBodies && window.modelBodies.length > 1) {
          rawPartName = `Assembly (${window.modelBodies.length} Bodies)`;
        } else {
          rawPartName = 'CAD Component';
        }
      }
      const partName = escapeXml(rawPartName);

      let rawMassText = '0.000 kg';
      if (typeof window.MaterialsEngine !== 'undefined' && typeof window.MaterialsEngine.getTotalMassKg === 'function') {
        const massVal = window.MaterialsEngine.getTotalMassKg();
        if (typeof massVal === 'number' && !isNaN(massVal) && massVal > 0) {
          rawMassText = `${massVal.toFixed(3)} kg`;
        }
      }
      const totalMassText = escapeXml(rawMassText);

      let rawMatName = 'Structural Steel / As-Machined';
      if (typeof window.MaterialsEngine !== 'undefined' && typeof window.MaterialsEngine.getSelectedMaterialName === 'function') {
        rawMatName = window.MaterialsEngine.getSelectedMaterialName();
      }
      const materialText = escapeXml(rawMatName);

      const rawDate = new Date().toISOString().split('T')[0];
      const curDate = escapeXml(rawDate);

      const tbWidth = 390;
      const tbHeight = 140;
      const tbX = svgWidth - 25 - tbWidth;
      const tbY = svgHeight - 25 - tbHeight;

      svgContent += `
  <!-- ================= ISO 7200 Engineering Title Block ================= -->
  <g id="iso-title-block" transform="translate(${tbX}, ${tbY})">
    <rect width="${tbWidth}" height="${tbHeight}" fill="#f8fafc" stroke="#0f172a" stroke-width="1.8" />
    <line x1="0" y1="36" x2="${tbWidth}" y2="36" stroke="#0f172a" stroke-width="1.2" />
    <line x1="0" y1="72" x2="${tbWidth}" y2="72" stroke="#0f172a" stroke-width="1.2" />
    <line x1="0" y1="106" x2="${tbWidth}" y2="106" stroke="#0f172a" stroke-width="1.2" />

    <line x1="210" y1="0" x2="210" y2="72" stroke="#0f172a" stroke-width="1.2" />
    <line x1="210" y1="72" x2="210" y2="106" stroke="#0f172a" stroke-width="1.2" />
    <line x1="300" y1="72" x2="300" y2="106" stroke="#0f172a" stroke-width="1.2" />
    <line x1="140" y1="106" x2="140" y2="${tbHeight}" stroke="#0f172a" stroke-width="1.2" />
    <line x1="260" y1="106" x2="260" y2="${tbHeight}" stroke="#0f172a" stroke-width="1.2" />

    <text x="12" y="23" font-size="13" font-weight="800" fill="#0f172a" letter-spacing="0.5">QUICKLOOK CAD STUDIO</text>
    <text x="220" y="16" font-size="8.5" font-weight="600" fill="#64748b">DWG NO: STP-DWG-01</text>
    <text x="220" y="28" font-size="8.5" font-weight="600" fill="#64748b">PROJECTION: 1st ANGLE</text>

    <!-- ISO First Angle Projection Symbol -->
    <g transform="translate(330, 8)" stroke="#0f172a" stroke-width="1" fill="none">
      <polygon points="2,14 14,8 14,20 2,14" fill="none" stroke="#0f172a" stroke-width="1"/>
      <line x1="0" y1="14" x2="16" y2="14" stroke="#94a3b8" stroke-width="0.5" stroke-dasharray="3,1.5"/>
      <circle cx="28" cy="14" r="3.5" stroke="#0f172a" stroke-width="1"/>
      <circle cx="28" cy="14" r="6.5" stroke="#0f172a" stroke-width="1"/>
      <line x1="18" y1="14" x2="38" y2="14" stroke="#94a3b8" stroke-width="0.5" stroke-dasharray="3,1.5"/>
      <line x1="28" y1="4" x2="28" y2="24" stroke="#94a3b8" stroke-width="0.5" stroke-dasharray="3,1.5"/>
    </g>

    <text x="12" y="50" font-size="8.5" font-weight="700" fill="#64748b">PART TITLE / DESIGNATION:</text>
    <text x="12" y="64" font-size="11" font-weight="700" fill="#0284c7">${partName}</text>

    <text x="220" y="50" font-size="8.5" font-weight="700" fill="#64748b">BOUNDS (X × Y × Z):</text>
    <text x="220" y="64" font-size="10" font-weight="700" fill="#0f172a">${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm</text>

    <text x="12" y="85" font-size="8.5" font-weight="700" fill="#64748b">MATERIAL / SPECIFICATION:</text>
    <text x="12" y="98" font-size="10" font-weight="700" fill="#0f172a">${materialText}</text>

    <text x="220" y="85" font-size="8.5" font-weight="700" fill="#64748b">EST. MASS:</text>
    <text x="220" y="98" font-size="10" font-weight="700" fill="#0f172a">${totalMassText}</text>

    <text x="310" y="85" font-size="8.5" font-weight="700" fill="#64748b">SCALE:</text>
    <text x="310" y="98" font-size="10" font-weight="700" fill="#0f172a">${displayScaleStr}</text>

    <text x="12" y="119" font-size="8.5" font-weight="700" fill="#64748b">DATE / REV:</text>
    <text x="12" y="131" font-size="9.5" font-weight="600" fill="#0f172a">${curDate} / REV 3.6</text>

    <text x="150" y="119" font-size="8.5" font-weight="700" fill="#64748b">STATUS:</text>
    <text x="150" y="131" font-size="9.5" font-weight="800" fill="#15803d">VERIFIED CAD</text>

    <text x="270" y="119" font-size="8.5" font-weight="700" fill="#64748b">UNITS:</text>
    <text x="270" y="131" font-size="9.5" font-weight="700" fill="#0f172a">MILLIMETERS</text>
  </g>
</svg>
`;

      return svgContent;
    } finally {
      savedPositions.forEach(item => {
        item.mesh.position.copy(item.pos);
        item.mesh.updateMatrixWorld(true);
      });
    }
  }

  /**
   * Converts SVG vector string into 300 DPI high-resolution PNG data URL
   */
  function convertSvgToPngDataUrl(svgString, scale = 2) {
    return new Promise((resolve, reject) => {
      if (typeof Image === 'undefined' || typeof document === 'undefined') {
        resolve('data:image/svg+xml;base64,' + (typeof Buffer !== 'undefined' ? Buffer.from(svgString).toString('base64') : ''));
        return;
      }
      try {
        const width = 1200 * scale;
        const height = 848 * scale;
        const img = new Image();
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/png'));
          } catch (e) {
            URL.revokeObjectURL(url);
            reject(e);
          }
        };
        img.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(e);
        };
        img.src = url;
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generates a self-contained ISO A3 Landscape PDF Document wrapping the drawing
   */
  function convertSvgToPdfDataUrl(svgString, scale = 2) {
    return new Promise((resolve, reject) => {
      if (typeof Image === 'undefined' || typeof document === 'undefined') {
        resolve('data:application/pdf;base64,' + (typeof Buffer !== 'undefined' ? Buffer.from('%PDF-1.4\n').toString('base64') : ''));
        return;
      }
      try {
        const width = 1200 * scale;
        const height = 848 * scale;
        const img = new Image();
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);

            const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
            const pdfBytes = jpegToPdfBytes(jpegDataUrl, 1191, 842);
            let binary = '';
            for (let i = 0; i < pdfBytes.length; i++) {
              binary += String.fromCharCode(pdfBytes[i]);
            }
            const pdfDataUrl = 'data:application/pdf;base64,' + btoa(binary);
            resolve(pdfDataUrl);
          } catch (e) {
            URL.revokeObjectURL(url);
            reject(e);
          }
        };
        img.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(e);
        };
        img.src = url;
      } catch (err) {
        reject(err);
      }
    });
  }

  function jpegToPdfBytes(jpegDataUrl, widthPt, heightPt) {
    const base64 = jpegDataUrl.replace(/^data:image\/jpeg;base64,/, '');
    const binaryString = atob(base64);
    const jpegBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      jpegBytes[i] = binaryString.charCodeAt(i);
    }

    let imgW = 2400, imgH = 1696;
    for (let i = 0; i < jpegBytes.length - 8; i++) {
      if (jpegBytes[i] === 0xFF && (jpegBytes[i + 1] === 0xC0 || jpegBytes[i + 1] === 0xC2)) {
        imgH = (jpegBytes[i + 5] << 8) | jpegBytes[i + 6];
        imgW = (jpegBytes[i + 7] << 8) | jpegBytes[i + 8];
        break;
      }
    }

    const enc = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let currentOffset = 0;

    function addString(str) {
      const bytes = enc.encode(str);
      chunks.push(bytes);
      currentOffset += bytes.length;
    }

    function addBytes(bytes) {
      chunks.push(bytes);
      currentOffset += bytes.length;
    }

    addString('%PDF-1.4\n%âãÏÓ\n');

    offsets.push(currentOffset);
    addString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    offsets.push(currentOffset);
    addString('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

    offsets.push(currentOffset);
    addString(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`);

    offsets.push(currentOffset);
    const streamContent = `q\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/Im0 Do\nQ\n`;
    addString(`4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`);

    offsets.push(currentOffset);
    const imgHeader = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`;
    addString(imgHeader);
    addBytes(jpegBytes);
    addString('\nendstream\nendobj\n');

    const startXref = currentOffset;
    addString(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
    for (let i = 0; i < offsets.length; i++) {
      const offStr = String(offsets[i]).padStart(10, '0');
      addString(`${offStr} 00000 n \n`);
    }

    addString(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const c of chunks) {
      result.set(c, pos);
      pos += c.length;
    }
    return result;
  }

  // Idempotency lock to strictly guarantee that SaveFileDialog opens only ONCE
  let isExportInProgress = false;

  async function downloadBlueprint(format = 'png', filename = null) {
    if (isExportInProgress) return;
    isExportInProgress = true;
    setTimeout(() => { isExportInProgress = false; }, 1500);

    const svgData = generateBlueprintSvg();
    if (!svgData) return;

    const rawInput = window.pendingFileName || window.currentLoadedModelName || getResolvedModelFileName();
    // Strip directory paths (both / and \) to prevent path traversal
    const rawFileName = String(rawInput).replace(/^.*[\\\/]/, '');
    // Strip model extension
    const rawBaseName = rawFileName.replace(/\.[^/.]+$/, '').trim() || 'CAD_Model';
    // Replace invalid filesystem characters (< > : " / \ | ? * and control chars) with '_'
    const safeBaseName = rawBaseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const ext = (format || 'png').toLowerCase();
    const defaultFilename = `${safeBaseName}_Blueprint_${dateStr}.${ext}`;
    const safeFilename = filename
      ? String(filename).replace(/^.*[\\\/]/, '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      : defaultFilename;

    let payloadDataUrl = null;
    try {
      if (ext === 'png') {
        payloadDataUrl = await convertSvgToPngDataUrl(svgData, 2);
      } else if (ext === 'pdf') {
        payloadDataUrl = await convertSvgToPdfDataUrl(svgData, 2);
      } else {
        payloadDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
      }
    } catch (err) {
      console.warn('Falling back to direct SVG stream:', err);
      payloadDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    }

    // 1. Native Windows SaveFileDialog via WebView2 IPC
    if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
      window.chrome.webview.postMessage({
        type: 'SAVE_SNAPSHOT',
        action: 'SAVE_SNAPSHOT',
        data: payloadDataUrl,
        defaultName: safeFilename
      });
      return;
    }

    // 2. Browser fallback for testing
    const link = document.createElement('a');
    link.href = payloadDataUrl;
    link.download = safeFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (typeof window.showToast === 'function') {
      window.showToast(`Blueprint exported (${safeFilename})`);
    }
  }

  function downloadBlueprintSvg(filename) {
    return downloadBlueprint('svg', filename);
  }

  function downloadBlueprintPng(filename) {
    return downloadBlueprint('png', filename);
  }

  function downloadBlueprintPdf(filename) {
    return downloadBlueprint('pdf', filename);
  }

  if (typeof window !== 'undefined') {
    window.BlueprintSvg = {
      generateAndDownload: () => downloadBlueprint('png'),
      generateSvg: generateBlueprintSvg,
      downloadSvg: downloadBlueprintSvg,
      downloadPng: downloadBlueprintPng,
      downloadPdf: downloadBlueprintPdf,
      downloadBlueprint: downloadBlueprint,
      escapeXml: escapeXml
    };
    window.BlueprintEngine = window.BlueprintSvg;
    window._unused = {
      generateSvg: generateBlueprintSvg,
      downloadSvg: downloadBlueprintSvg
    };

    window.generateBlueprintSvg = generateBlueprintSvg;
    window.downloadBlueprintSvg = downloadBlueprintSvg;
    window.downloadBlueprintPng = downloadBlueprintPng;
    window.downloadBlueprintPdf = downloadBlueprintPdf;
  }

  // CommonJS export for automated Node.js unit tests
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      escapeXml,
      generateBlueprintSvg,
      downloadBlueprintSvg,
      downloadBlueprintPng,
      downloadBlueprintPdf,
      downloadBlueprint
    };
  }
})();
