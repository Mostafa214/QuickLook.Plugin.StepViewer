/**
 * CAD Measurement & Snapping Engine
 * High-precision CAD vertex/edge/hole snapping, Cartesian deltas, hole pitch, and 11 geometric permutations.
 */
(function () {
  let isMeasureActive = false;
  let measureGroup = new THREE.Group();
  let snapIndicator = null;
  let hoverEdgeMesh = null;
  let rubberbandLine = null;
  let selectedCadEntities = [];
  let modelCadVertices = [];
  let currentMeasuredValue = '';

  function createTextSprite(text) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(9, 9, 11, 0.94)'; ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)'; ctx.lineWidth = 4;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(8, 8, 496, 112, 24); else ctx.rect(8, 8, 496, 112);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f4f4f5'; ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 64);
    const texture = new THREE.CanvasTexture(canvas); texture.minFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.userData = { isScreenScaledSprite: true, pixelHeight: 34, aspect: 4.0 };
    const dist = (window.currentModelDistance && window.currentModelDistance > 0) ? window.currentModelDistance : 100;
    const vFovRad = THREE.MathUtils.degToRad(window.camera?.fov || 45);
    const sh = ((2 * Math.tan(vFovRad / 2) * dist) / (window.innerHeight || 800)) * 34;
    sprite.scale.set(sh * 4.0, sh, 1);
    return sprite;
  }

  function indexModelVertices(meshes) {
    modelCadVertices = [];
    const seen = new Set();
    const addV = (pt, type, label, feat) => {
      if (!pt) return;
      const k = `${Math.round(pt.x * 100)}_${Math.round(pt.y * 100)}_${Math.round(pt.z * 100)}`;
      if (seen.has(k)) return;
      seen.add(k);
      modelCadVertices.push({ type: 'point', subType: type, point: pt.clone(), label, feature: feat });
    };

    const edgeFeatures = window.modelEdgeFeatures || [];
    edgeFeatures.forEach(feat => {
      if (feat.type === 'line') {
        const p1 = new THREE.Vector3(...feat.start), p2 = new THREE.Vector3(...feat.end);
        addV(p1, 'corner', 'Corner / Endpoint', feat);
        addV(p2, 'corner', 'Corner / Endpoint', feat);
        addV(p1.clone().add(p2).multiplyScalar(0.5), 'midpoint', 'Midpoint', feat);
      } else if (feat.type === 'circle') {
        addV(new THREE.Vector3(...feat.center), 'center', 'Hole Center', feat);
      }
    });

    (meshes || []).forEach(m => {
      (m.brepFaces || []).forEach(f => {
        if (f.surfaceType === 'cylinder' && f.cylinder) {
          const cyl = f.cylinder;
          addV(new THREE.Vector3(...cyl.center), 'center', cyl.isHole ? 'Hole Center' : 'Cylinder Center', { type: 'cylinder', cylinder: cyl, center: cyl.center, radius: cyl.radius, diameter: cyl.diameter, depth: cyl.depth, axis: cyl.axis, isHole: cyl.isHole });
        }
      });
    });
    window.modelCadVertices = modelCadVertices;
  }

  function computeCoplanarArea(mesh, hitFaceIndex, localNormal, hitPoint) {
    if (!mesh?.geometry || !localNormal) return 0;
    const geom = mesh.geometry, pos = geom.attributes.position, idx = geom.index;
    if (!pos) return 0;
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), cb = new THREE.Vector3(), ab = new THREE.Vector3();
    let totalArea = 0, hitTriArea = 0;
    const planeD = hitPoint ? -localNormal.dot(mesh.worldToLocal(hitPoint.clone())) : 0;
    const triCount = Math.floor((idx ? idx.count : pos.count) / 3);

    for (let i = 0; i < triCount; i++) {
      const i3 = i * 3;
      if (idx) { vA.fromBufferAttribute(pos, idx.getX(i3)); vB.fromBufferAttribute(pos, idx.getX(i3 + 1)); vC.fromBufferAttribute(pos, idx.getX(i3 + 2)); }
      else { vA.fromBufferAttribute(pos, i3); vB.fromBufferAttribute(pos, i3 + 1); vC.fromBufferAttribute(pos, i3 + 2); }
      cb.subVectors(vC, vB); ab.subVectors(vA, vB); cb.cross(ab);
      const a = cb.length() * 0.5;
      if (a < 1e-7) continue;
      if (i === hitFaceIndex) hitTriArea = a;
      if (Math.abs(cb.normalize().dot(localNormal) - 1.0) < 0.12 && Math.abs(localNormal.dot(vA) + planeD) < 0.8) totalArea += a;
    }
    return totalArea > 0 ? totalArea : hitTriArea;
  }

  function findSurfaceTarget(e) {
    if (!window.modelGroup || window.modelGroup.children.length === 0 || !window.camera || !window.renderer) return null;
    const rect = window.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(mouse, window.camera);

    const meshes = [];
    window.modelGroup.traverse(c => { if (c.isMesh && c.name !== 'solidworks_edges' && c.visible) meshes.push(c); });
    const hits = ray.intersectObjects(meshes, false);
    if (!hits || hits.length === 0) return null;
    const hit = hits[0], locNorm = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
    const worldNorm = locNorm.clone().transformDirection(hit.object.matrixWorld).normalize();

    let matchedFace = null;
    if (hit.object?.userData?.brepFaces && hit.faceIndex !== undefined) {
      matchedFace = hit.object.userData.brepFaces.find(f => f.first <= hit.faceIndex && hit.faceIndex <= f.last);
    }
    if (matchedFace?.surfaceType === 'cylinder' && matchedFace.cylinder) {
      const cyl = matchedFace.cylinder;
      return {
        type: 'cylinder', subType: cyl.isHole ? 'hole' : 'shaft', point: hit.point, normal: worldNorm,
        center: new THREE.Vector3(...cyl.center).applyMatrix4(hit.object.matrixWorld),
        axis: new THREE.Vector3(...cyl.axis).transformDirection(hit.object.matrixWorld).normalize(),
        radius: cyl.radius, diameter: cyl.diameter, depth: cyl.depth, isHole: cyl.isHole, areaMm2: matchedFace.areaMm2,
        faceIndex: hit.faceIndex, brepFace: matchedFace, mesh: hit.object, label: cyl.isHole ? 'Cylindrical Hole' : 'Cylindrical Shaft'
      };
    }
    const area = (hit.face && hit.object && hit.faceIndex !== undefined) ? computeCoplanarArea(hit.object, hit.faceIndex, locNorm, hit.point) : 0;
    return { type: 'surface', subType: 'planar', point: hit.point, normal: worldNorm, areaMm2: area, faceIndex: hit.faceIndex, brepFace: matchedFace, mesh: hit.object, label: 'Planar Face' };
  }

  function isPointOccluded(point) {
    if (!window.modelGroup || !window.camera) return false;
    const origin = window.camera.position.clone(), dir = point.clone().sub(origin), targetDist = dir.length();
    if (targetDist < 0.05) return false;
    dir.normalize();
    const ray = new THREE.Raycaster(origin, dir, window.camera.near, Math.max(0.1, targetDist - 0.25));
    const meshes = [];
    window.modelGroup.traverse(c => { if (c.isMesh && c.name !== 'solidworks_edges' && c.visible && !c.material?.transparent) meshes.push(c); });
    const hits = ray.intersectObjects(meshes, false);
    return hits && hits.length > 0;
  }

  function findSnapTarget(e) {
    if (!isMeasureActive || !window.modelGroup || !window.camera || !window.renderer) return null;
    const rect = window.renderer.domElement.getBoundingClientRect(), mX = e.clientX, mY = e.clientY;

    let bestV = null, minVDis = 12;
    for (let i = 0; i < modelCadVertices.length; i++) {
      const v = modelCadVertices[i], proj = v.point.clone().project(window.camera);
      if (proj.z > 1) continue;
      const px = (proj.x * 0.5 + 0.5) * rect.width + rect.left, py = (-proj.y * 0.5 + 0.5) * rect.height + rect.top;
      const d = Math.hypot(mX - px, mY - py);
      if (d < minVDis && !isPointOccluded(v.point)) { minVDis = d; bestV = v; }
    }
    if (bestV) return { type: 'point', subType: bestV.subType, point: bestV.point.clone(), label: bestV.label, feature: bestV.feature };

    const edgeFeatures = window.modelEdgeFeatures || [];
    let bestFeat = null, minEDis = 15, bestEdgePt = null;
    for (let i = 0; i < edgeFeatures.length; i++) {
      const feat = edgeFeatures[i];
      if (feat.type === 'circle') {
        const cProj = new THREE.Vector3(...feat.center).project(window.camera);
        if (cProj.z > 1) continue;
        const cPx = (cProj.x * 0.5 + 0.5) * rect.width + rect.left, cPy = (-cProj.y * 0.5 + 0.5) * rect.height + rect.top;
        let sR = 10;
        if (feat.points?.length >= 3) {
          const p0 = new THREE.Vector3(feat.points[0], feat.points[1], feat.points[2]).project(window.camera);
          sR = Math.hypot((p0.x * 0.5 + 0.5) * rect.width + rect.left - cPx, (-p0.y * 0.5 + 0.5) * rect.height + rect.top - cPy);
        }
        const dis = Math.abs(Math.hypot(mX - cPx, mY - cPy) - sR);
        if (dis < minEDis && !isPointOccluded(new THREE.Vector3(...feat.center))) { minEDis = dis; bestFeat = feat; bestEdgePt = new THREE.Vector3(...feat.center); }
      } else if (feat.type === 'line') {
        const pA = new THREE.Vector3(...feat.start).project(window.camera), pB = new THREE.Vector3(...feat.end).project(window.camera);
        if (pA.z > 1 && pB.z > 1) continue;
        const ax = (pA.x * 0.5 + 0.5) * rect.width + rect.left, ay = (-pA.y * 0.5 + 0.5) * rect.height + rect.top;
        const bx = (pB.x * 0.5 + 0.5) * rect.width + rect.left, by = (-pB.y * 0.5 + 0.5) * rect.height + rect.top;
        const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((mX - ax) * (bx - ax) + (mY - ay) * (by - ay)) / l2));
        const dis = Math.hypot(mX - (ax + t * (bx - ax)), mY - (ay + t * (by - ay)));
        if (dis < minEDis) {
          const pt = new THREE.Vector3(feat.start[0] + t * (feat.end[0] - feat.start[0]), feat.start[1] + t * (feat.end[1] - feat.start[1]), feat.start[2] + t * (feat.end[2] - feat.start[2]));
          if (!isPointOccluded(pt)) { minEDis = dis; bestFeat = feat; bestEdgePt = pt; }
        }
      }
    }
    if (bestFeat) return { type: bestFeat.type, feature: bestFeat, point: bestEdgePt };

    const surf = findSurfaceTarget(e);
    if (surf) return surf.type === 'cylinder' ? surf : { type: 'point', subType: 'surface', point: surf.point.clone(), normal: surf.normal, areaMm2: surf.areaMm2, label: 'Planar Face' };
    return null;
  }

  function drawPointPin(pt, col = 0x38bdf8) {
    const p = pt.isVector3 ? pt.clone() : new THREE.Vector3(...pt);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({ color: col, depthTest: false }));
    pin.position.copy(p); pin.renderOrder = 999; pin.name = 'measure_element';
    pin.userData = { isScreenScaled: true, screenPixelRadius: 7.5 };
    const dist = window.camera ? window.camera.position.distanceTo(p) : 100, vFovRad = THREE.MathUtils.degToRad(window.camera?.fov || 45);
    const r = Math.max(((2 * Math.tan(vFovRad / 2) * dist) / (window.innerHeight || 800)) * 7.5, 0.001);
    pin.scale.set(r, r, r); measureGroup.add(pin); return pin;
  }

  function drawCircleRing(feat, col = 0x38bdf8) {
    if (!feat?.points?.length) return null;
    const pts = [];
    for (let i = 0; i < feat.points.length / 3; i++) pts.push(new THREE.Vector3(feat.points[i * 3], feat.points[i * 3 + 1], feat.points[i * 3 + 2]));
    if (pts.length > 1) pts.push(pts[0].clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, linewidth: 2, depthTest: false }));
    line.renderOrder = 997; line.name = 'measure_element'; measureGroup.add(line); return line;
  }

  function draw3DCircleRing(center, axis, radius, col = 0x38bdf8) {
    const c = center.isVector3 ? center.clone() : new THREE.Vector3(...center), a = (axis.isVector3 ? axis.clone() : new THREE.Vector3(...axis)).normalize();
    const u = new THREE.Vector3(Math.abs(a.x) < 0.8 ? 1 : 0, Math.abs(a.x) < 0.8 ? 0 : 1, 0).cross(a).normalize(), v = new THREE.Vector3().crossVectors(a, u).normalize();
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const th = (i / 48) * Math.PI * 2;
      pts.push(c.clone().add(u.clone().multiplyScalar(Math.cos(th) * radius)).add(v.clone().multiplyScalar(Math.sin(th) * radius)));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, linewidth: 2, depthTest: false }));
    line.renderOrder = 997; line.name = 'measure_element'; measureGroup.add(line); return line;
  }

  function drawCylinderAxisLine(center, axis, halfLen, col = 0x38bdf8) {
    const c = center.isVector3 ? center.clone() : new THREE.Vector3(...center), a = (axis.isVector3 ? axis.clone() : new THREE.Vector3(...axis)).normalize();
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([c.clone().sub(a.clone().multiplyScalar(halfLen)), c.clone().add(a.clone().multiplyScalar(halfLen))]),
      new THREE.LineDashedMaterial({ color: col, dashSize: 1.5, gapSize: 0.8, linewidth: 2, depthTest: false }));
    line.computeLineDistances(); line.renderOrder = 998; line.name = 'measure_element'; measureGroup.add(line); return line;
  }

  function drawCADDimensionLine(startPt, endPt, len, label) {
    const vA = startPt.isVector3 ? startPt.clone() : new THREE.Vector3(...startPt), vB = endPt.isVector3 ? endPt.clone() : new THREE.Vector3(...endPt);
    const dir = vB.clone().sub(vA), lLen = dir.length();
    if (lLen < 0.001) return;
    dir.normalize();
    let norm = new THREE.Vector3().crossVectors(dir, window.camera ? window.camera.position.clone().sub(vA).normalize() : new THREE.Vector3(0, 0, 1)).normalize();
    if (norm.lengthSq() < 0.1) norm = window.camera?.up.clone().normalize() || new THREE.Vector3(0, 1, 0);
    const dist = window.camera ? window.camera.position.distanceTo(vA) : 100, vFovRad = THREE.MathUtils.degToRad(window.camera?.fov || 45);
    const worldPerPx = (2 * Math.tan(vFovRad / 2) * dist) / (window.innerHeight || 800);
    const offVec = norm.clone().multiplyScalar(Math.max(worldPerPx * 24, Math.min(lLen * 0.38, worldPerPx * 45)));
    const dA = vA.clone().add(offVec), dB = vB.clone().add(offVec);
    const pts = [vA.clone().add(offVec.clone().multiplyScalar(0.06)), dA.clone().add(offVec.clone().multiplyScalar(0.15)),
                 vB.clone().add(offVec.clone().multiplyScalar(0.06)), dB.clone().add(offVec.clone().multiplyScalar(0.15)), dA, dB];
    const aLen = Math.min(lLen * 0.25, worldPerPx * 14), pArr = norm.clone().multiplyScalar(aLen * 0.38), dArr = dir.clone().multiplyScalar(aLen);
    pts.push(dA, dA.clone().add(dArr).add(pArr), dA, dA.clone().add(dArr).sub(pArr), dB, dB.clone().sub(dArr).add(pArr), dB, dB.clone().sub(dArr).sub(pArr));
    const dimLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2, depthTest: false, transparent: true, opacity: 0.95 }));
    dimLines.renderOrder = 998; dimLines.name = 'measure_element'; measureGroup.add(dimLines);
    const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints([vA, vB]), new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2, depthTest: false }));
    edge.renderOrder = 997; edge.name = 'measure_element'; measureGroup.add(edge);
    const fmtDim = (typeof window.formatDim === 'function') ? window.formatDim : (n => `${n.toFixed(2)} mm`);
    const sprite = createTextSprite(label || fmtDim(len));
    sprite.position.copy(dA.clone().add(dB).multiplyScalar(0.5)).add(offVec.clone().multiplyScalar(0.22));
    sprite.renderOrder = 1000; sprite.name = 'measure_element'; measureGroup.add(sprite);
  }

  function drawCADCircleAnnotation(centerPt, radius, diameter) {
    const c = centerPt.isVector3 ? centerPt.clone() : new THREE.Vector3(...centerPt), cr = Math.max(radius * 1.2, 0.5);
    const pts = [c.clone().add(new THREE.Vector3(-cr, 0, 0)), c.clone().add(new THREE.Vector3(cr, 0, 0)), c.clone().add(new THREE.Vector3(0, -cr, 0)), c.clone().add(new THREE.Vector3(0, cr, 0))];
    const dist = window.camera ? window.camera.position.distanceTo(c) : 100, vFovRad = THREE.MathUtils.degToRad(window.camera?.fov || 45);
    const worldPerPx = (2 * Math.tan(vFovRad / 2) * dist) / (window.innerHeight || 800);
    const lEnd = c.clone().add((window.camera?.up || new THREE.Vector3(0, 1, 0)).clone().add(new THREE.Vector3(1, 0, 0)).normalize().multiplyScalar(Math.max(radius * 1.4, worldPerPx * 22)));
    const lKnee = lEnd.clone().add(new THREE.Vector3(worldPerPx * 26, 0, 0));
    pts.push(c, lEnd, lEnd, lKnee);
    const leader = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2, depthTest: false }));
    leader.renderOrder = 998; leader.name = 'measure_element'; measureGroup.add(leader);
    const fmtCircle = (typeof window.formatCircleDim === 'function') ? window.formatCircleDim : ((d, r) => `Ø ${d.toFixed(2)} mm (R ${r.toFixed(2)})`);
    const sprite = createTextSprite(fmtCircle(diameter, radius));
    sprite.position.copy(lKnee).add(new THREE.Vector3(0, worldPerPx * 12, 0));
    sprite.renderOrder = 1000; sprite.name = 'measure_element'; measureGroup.add(sprite);
  }

  function isHoleEntity(ent) {
    return Boolean(ent && (ent.type === 'circle' || ent.type === 'cylinder' || ent.subType === 'hole' || ent.subType === 'center' || ent.feature?.type === 'circle' || ent.feature?.type === 'cylinder'));
  }

  function getHoleInfo(ent) {
    if (!ent) return null;
    if (ent.type === 'circle' && ent.feature) {
      const f = ent.feature;
      return { center: new THREE.Vector3(...f.center), radius: f.radius, diameter: f.diameter, depth: f.cylinder?.depth || 0, axis: f.cylinder?.axis ? new THREE.Vector3(...f.cylinder.axis) : (f.normal ? new THREE.Vector3(...f.normal) : new THREE.Vector3(0, 0, 1)), isHole: f.cylinder ? f.cylinder.isHole : true };
    }
    if (ent.type === 'cylinder') {
      return { center: ent.center?.isVector3 ? ent.center.clone() : new THREE.Vector3(...ent.center), radius: ent.radius, diameter: ent.diameter, depth: ent.depth || 0, axis: ent.axis?.isVector3 ? ent.axis.clone() : new THREE.Vector3(...ent.axis), isHole: ent.isHole !== undefined ? ent.isHole : true };
    }
    const f = ent.feature || {};
    return { center: ent.point?.clone() || new THREE.Vector3(...(f.center || [0, 0, 0])), radius: f.radius || 0, diameter: f.diameter || (f.radius ? f.radius * 2 : 0), depth: f.depth || 0, axis: f.axis ? (f.axis.isVector3 ? f.axis.clone() : new THREE.Vector3(...f.axis)) : new THREE.Vector3(0, 0, 1), isHole: f.isHole !== undefined ? f.isHole : true };
  }

  function isSurfaceTarget(t) { return Boolean(t && (t.type === 'surface' || t.subType === 'surface') && t.type !== 'cylinder'); }
  function isPurePointTarget(t) { return Boolean(t && (t.type === 'point' || t.subType === 'corner' || t.subType === 'midpoint' || t.subType === 'center') && t.subType !== 'surface' && t.type !== 'cylinder'); }
  function isPointTarget(t) { return Boolean(t && (t.type === 'point' || isPurePointTarget(t) || isSurfaceTarget(t)) && t.type !== 'cylinder'); }

  function setMeasureCard(title, dist, deltas, extra) {
    const card = document.getElementById('measure-card'); if (card) card.style.display = 'flex';
    const tEl = document.getElementById('measure-card-title'), dEl = document.getElementById('measure-dist'), dlEl = document.getElementById('measure-deltas'), exEl = document.getElementById('measure-extra');
    if (tEl) tEl.innerText = title; if (dEl) dEl.innerText = dist; if (dlEl) dlEl.innerHTML = deltas;
    if (exEl) { exEl.innerHTML = extra || ''; exEl.style.display = extra ? 'block' : 'none'; }
    document.getElementById('measure-angle')?.style.setProperty('display', 'none');
  }

  function handleUnifiedClick(snap) {
    if (!snap) return;
    const fmtDim = (typeof window.formatDim === 'function') ? window.formatDim : (n => `${n.toFixed(2)} mm`);
    const fmtCoord = (typeof window.formatCoord === 'function') ? window.formatCoord : (n => n.toFixed(2));
    const fmtArea = (typeof window.formatArea === 'function') ? window.formatArea : (n => `${n.toFixed(1)} mm²`);

    if (selectedCadEntities.length === 0) {
      clearMeasurement(false); selectedCadEntities.push(snap);
      if (snap.type === 'line') {
        const f = snap.feature; drawCADDimensionLine(f.start, f.end, f.length);
        const dx = Math.abs(f.end[0] - f.start[0]), dy = Math.abs(f.end[1] - f.start[1]), dz = Math.abs(f.end[2] - f.start[2]);
        setMeasureCard('Straight Edge', fmtDim(f.length), `<span style="color:#e05656">ΔX:</span> ${fmtCoord(dx)} &nbsp;<span style="color:#3eb86f">ΔY:</span> ${fmtCoord(dy)} &nbsp;<span style="color:#4a9eed">ΔZ:</span> ${fmtCoord(dz)}`, '<span style="color:#38bdf8; font-weight:600;">Click 2nd Point, Edge, or Hole for dual dimension</span>');
        currentMeasuredValue = fmtDim(f.length);
      } else if (isHoleEntity(snap)) {
        const h = getHoleInfo(snap); drawPointPin(h.center, 0x38bdf8); drawCADCircleAnnotation(h.center, h.radius, h.diameter);
        if (snap.type === 'circle' && snap.feature) drawCircleRing(snap.feature, 0x38bdf8);
        else { draw3DCircleRing(h.center, h.axis, h.radius, 0x38bdf8); drawCylinderAxisLine(h.center, h.axis, Math.max(h.depth * 0.6, h.radius * 1.5), 0x38bdf8); }
        setMeasureCard(h.isHole ? 'Cylindrical Hole' : 'Cylindrical Shaft', `Ø ${fmtDim(h.diameter)}`, `Radius (R): <strong>${fmtDim(h.radius)}</strong>${h.depth > 0 ? ` | Depth: <strong>${fmtDim(h.depth)}</strong>` : ''}`, `Center: (${fmtCoord(h.center.x)}, ${fmtCoord(h.center.y)}, ${fmtCoord(h.center.z)})<br><span style="color:#38bdf8; font-weight:600;">Click 2nd Hole, Edge, or Face for dual dimension</span>`);
        currentMeasuredValue = `Ø ${fmtDim(h.diameter)} (R ${fmtDim(h.radius)})`;
      } else if (isSurfaceTarget(snap)) {
        drawPointPin(snap.point, 0x38bdf8);
        const n = snap.normal || new THREE.Vector3(0, 1, 0);
        const orient = Math.abs(n.z) > 0.85 ? (n.z > 0 ? 'Top (+Z)' : 'Bottom (-Z)') : (Math.abs(n.y) > 0.85 ? (n.y > 0 ? 'Front (+Y)' : 'Back (-Y)') : (Math.abs(n.x) > 0.85 ? (n.x > 0 ? 'Right (+X)' : 'Left (-X)') : `[${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)}]`));
        const areaStr = fmtArea(snap.areaMm2 || 0), sprite = createTextSprite(snap.areaMm2 > 0.01 ? `Area: ${areaStr}` : `Face (${orient})`);
        const distToCam = window.camera?.position.distanceTo(snap.point) || 100, vFovRad = THREE.MathUtils.degToRad(window.camera?.fov || 45);
        sprite.position.copy(snap.point).add(n.clone().multiplyScalar(((2 * Math.tan(vFovRad / 2) * distToCam) / (window.innerHeight || 800)) * 26));
        sprite.renderOrder = 1000; sprite.name = 'measure_element'; measureGroup.add(sprite);
        setMeasureCard('Planar Face Selected', snap.areaMm2 > 0.01 ? `Area: ${areaStr}` : `Planar Surface`, `<span style="color:#38bdf8">Orientation:</span> <strong>${orient}</strong> | <span style="color:#94a3b8">Center: (${fmtCoord(snap.point.x)}, ${fmtCoord(snap.point.y)}, ${fmtCoord(snap.point.z)})</span>`, '<span style="color:#38bdf8; font-weight:600;">Select 2nd entity to measure distance or angle.</span>');
        currentMeasuredValue = `Face Area: ${areaStr} (${orient})`;
      } else {
        drawPointPin(snap.point, 0x38bdf8);
        const sub = snap.subType === 'midpoint' ? 'Midpoint' : (snap.subType === 'center' ? 'Hole Center' : 'Point');
        setMeasureCard(`${sub} 1 Selected`, `(${fmtCoord(snap.point.x)}, ${fmtCoord(snap.point.y)}, ${fmtCoord(snap.point.z)})`, '<span style="color:#38bdf8; font-weight:600;">Click 2nd Point, Edge, or Hole to measure distance</span>');
        currentMeasuredValue = `(${fmtCoord(snap.point.x)}, ${fmtCoord(snap.point.y)}, ${fmtCoord(snap.point.z)})`;
      }
    } else {
      const e1 = selectedCadEntities[0], e2 = snap;
      if (isPointTarget(e1) && isPointTarget(e2) && e1.point && e2.point && e1.point.distanceTo(e2.point) < 0.001) return;
      clearMeasurement(false);

      if (isHoleEntity(e1) && isHoleEntity(e2)) {
        const h1 = getHoleInfo(e1), h2 = getHoleInfo(e2), cDist = h1.center.distanceTo(h2.center);
        drawPointPin(h1.center, 0x38bdf8); drawPointPin(h2.center, 0x34d399);
        if (e1.type === 'circle' && e1.feature) drawCircleRing(e1.feature, 0x38bdf8); else draw3DCircleRing(h1.center, h1.axis, h1.radius, 0x38bdf8);
        if (e2.type === 'circle' && e2.feature) drawCircleRing(e2.feature, 0x34d399); else draw3DCircleRing(h2.center, h2.axis, h2.radius, 0x34d399);
        const dx = Math.abs(h2.center.x - h1.center.x), dy = Math.abs(h2.center.y - h1.center.y), dz = Math.abs(h2.center.z - h1.center.z);
        const axDot = Math.abs(h1.axis.dot(h2.axis)), diffV = h2.center.clone().sub(h1.center), axOff = Math.abs(diffV.dot(h1.axis));
        const radOff = diffV.clone().sub(h1.axis.clone().multiplyScalar(diffV.dot(h1.axis))).length();

        if (axDot > 0.95 && radOff < 0.15 && Math.abs(h1.radius - h2.radius) < 0.15 && axOff > 0.1) {
          drawCADDimensionLine(h1.center, h2.center, axOff, `Depth: ${fmtDim(axOff)}`);
          setMeasureCard('Through-Hole Depth & Diameter', `Depth: ${fmtDim(axOff)}`, `Diameter: <strong>Ø ${fmtDim(h1.diameter)}</strong> | Radius: <strong>${fmtDim(h1.radius)}</strong>`, 'THRU Hole verified: Top rim to Bottom rim');
          currentMeasuredValue = `Depth: ${fmtDim(axOff)} (Ø ${fmtDim(h1.diameter)})`;
        } else {
          drawCADDimensionLine(h1.center, h2.center, cDist, `Pitch: ${fmtDim(cDist)}`);
          setMeasureCard('Center-to-Center Holes (Pitch)', `Pitch: ${fmtDim(cDist)}`, `<span style="color:#e05656">ΔX:</span> ${fmtCoord(dx)} &nbsp;<span style="color:#3eb86f">ΔY:</span> ${fmtCoord(dy)} &nbsp;<span style="color:#4a9eed">ΔZ:</span> ${fmtCoord(dz)}`, `<strong>Min Gap:</strong> ${fmtDim(Math.max(0, cDist - h1.radius - h2.radius))} | <strong>Max Gap:</strong> ${fmtDim(cDist + h1.radius + h2.radius)}<br><span style="color:#94a3b8">H1: Ø ${fmtDim(h1.diameter)} | H2: Ø ${fmtDim(h2.diameter)}</span>`);
          currentMeasuredValue = `Pitch: ${fmtDim(cDist)}`;
        }
      } else if ((isHoleEntity(e1) && isSurfaceTarget(e2)) || (isSurfaceTarget(e1) && isHoleEntity(e2))) {
        const h = getHoleInfo(isHoleEntity(e1) ? e1 : e2), s = isHoleEntity(e1) ? e2 : e1, n = s.normal.clone().normalize();
        const diff = h.center.clone().sub(s.point), pDis = Math.abs(diff.dot(n)), proj = h.center.clone().sub(n.clone().multiplyScalar(diff.dot(n)));
        drawPointPin(s.point, 0x38bdf8); drawPointPin(h.center, 0x34d399); draw3DCircleRing(h.center, h.axis, h.radius, 0x34d399);
        drawCADDimensionLine(proj, h.center, pDis, `Normal: ${fmtDim(pDis)}`);
        setMeasureCard('Hole Center to Face', `Distance: ${fmtDim(pDis)}`, `Perpendicular distance from Hole (Ø ${fmtDim(h.diameter)}) to Face`, `Surface Normal: [${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)}]`);
        currentMeasuredValue = `Hole to Face: ${fmtDim(pDis)}`;
      } else if ((isHoleEntity(e1) && e2.type === 'line') || (e1.type === 'line' && isHoleEntity(e2))) {
        const h = getHoleInfo(isHoleEntity(e1) ? e1 : e2), l = isHoleEntity(e1) ? e2 : e1;
        const s = new THREE.Vector3(...l.feature.start), dir = new THREE.Vector3(...l.feature.end).sub(s).normalize();
        const proj = s.clone().add(dir.clone().multiplyScalar(h.center.clone().sub(s).dot(dir))), d = h.center.distanceTo(proj);
        drawPointPin(h.center, 0x34d399); draw3DCircleRing(h.center, h.axis, h.radius, 0x34d399);
        drawCADDimensionLine(proj, h.center, d, `Dist: ${fmtDim(d)}`);
        setMeasureCard('Hole Center to Edge', fmtDim(d), `Perpendicular distance from Hole (Ø ${fmtDim(h.diameter)}) to Edge`);
        currentMeasuredValue = fmtDim(d);
      } else if ((isHoleEntity(e1) && isPurePointTarget(e2)) || (isPurePointTarget(e1) && isHoleEntity(e2))) {
        const h = getHoleInfo(isHoleEntity(e1) ? e1 : e2), p = isHoleEntity(e1) ? e2.point : e1.point, d = p.distanceTo(h.center);
        drawPointPin(p, 0x38bdf8); drawPointPin(h.center, 0x34d399); draw3DCircleRing(h.center, h.axis, h.radius, 0x34d399);
        drawCADDimensionLine(p, h.center, d, `Dist: ${fmtDim(d)}`);
        setMeasureCard('Point to Hole Distance', `${fmtDim(d)} (Center)`, `Min: <strong>${fmtDim(Math.max(0, d - h.radius))}</strong> | Max: <strong>${fmtDim(d + h.radius)}</strong>`, `Hole: Ø ${fmtDim(h.diameter)} (R ${fmtDim(h.radius)})`);
        currentMeasuredValue = `${fmtDim(d)}`;
      } else if (isSurfaceTarget(e1) && isSurfaceTarget(e2)) {
        const n1 = e1.normal.clone().normalize(), n2 = e2.normal.clone().normalize(), dot = Math.abs(n1.dot(n2));
        drawPointPin(e1.point, 0x38bdf8); drawPointPin(e2.point, 0x34d399);
        if (dot > 0.96) {
          const gap = Math.abs(e2.point.clone().sub(e1.point).dot(n1));
          drawCADDimensionLine(e1.point, e2.point.clone().sub(n1.clone().multiplyScalar(e2.point.clone().sub(e1.point).dot(n1))), gap, `Gap: ${fmtDim(gap)}`);
          setMeasureCard('Parallel Faces Distance', `Thickness / Gap: ${fmtDim(gap)}`, `Parallel Planes (Normal Match: ${(dot * 100).toFixed(1)}%)`);
          currentMeasuredValue = `Gap: ${fmtDim(gap)}`;
        } else {
          const deg = (Math.acos(Math.max(-1, Math.min(1, n1.dot(n2)))) * 180) / Math.PI;
          drawCADDimensionLine(e1.point, e2.point, 0, `∠ ${deg.toFixed(1)}°`);
          setMeasureCard('Face-to-Face Angle', `Angle: ${deg.toFixed(1)}° (${(180 - deg).toFixed(1)}° suppl)`, `Normal 1: [${n1.x.toFixed(2)}, ${n1.y.toFixed(2)}, ${n1.z.toFixed(2)}]<br>Normal 2: [${n2.x.toFixed(2)}, ${n2.y.toFixed(2)}, ${n2.z.toFixed(2)}]`);
          currentMeasuredValue = `Angle: ${deg.toFixed(1)}°`;
        }
      } else if ((isSurfaceTarget(e1) && isPurePointTarget(e2)) || (isPurePointTarget(e1) && isSurfaceTarget(e2))) {
        const s = isSurfaceTarget(e1) ? e1 : e2, p = isSurfaceTarget(e1) ? e2.point : e1.point, n = s.normal.clone().normalize();
        const diff = p.clone().sub(s.point), pDis = Math.abs(diff.dot(n)), proj = p.clone().sub(n.clone().multiplyScalar(diff.dot(n)));
        drawPointPin(s.point, 0x38bdf8); drawPointPin(p, 0x34d399); drawPointPin(proj, 0xf59e0b);
        drawCADDimensionLine(proj, p, pDis, `Normal: ${fmtDim(pDis)}`);
        setMeasureCard('Point to Face Measurement', `Perpendicular: ${fmtDim(pDis)}`, `Direct 3D Distance: <strong>${fmtDim(p.distanceTo(s.point))}</strong>`, `Surface Normal: [${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)}]`);
        currentMeasuredValue = `Perpendicular: ${fmtDim(pDis)}`;
      } else if ((isSurfaceTarget(e1) && e2.type === 'line') || (e1.type === 'line' && isSurfaceTarget(e2))) {
        const s = isSurfaceTarget(e1) ? e1 : e2, l = isSurfaceTarget(e1) ? e2 : e1, n = s.normal.clone().normalize();
        const mid = new THREE.Vector3(...l.feature.start).add(new THREE.Vector3(...l.feature.end)).multiplyScalar(0.5);
        const pDis = Math.abs(mid.clone().sub(s.point).dot(n)), proj = mid.clone().sub(n.clone().multiplyScalar(mid.clone().sub(s.point).dot(n)));
        drawPointPin(s.point, 0x38bdf8); drawPointPin(mid, 0x34d399); drawCADDimensionLine(proj, mid, pDis, `Normal: ${fmtDim(pDis)}`);
        setMeasureCard('Edge to Face Distance', `Distance: ${fmtDim(pDis)}`, 'Perpendicular distance from Edge to Planar Face');
        currentMeasuredValue = `Edge to Face: ${fmtDim(pDis)}`;
      } else if (isPurePointTarget(e1) && isPurePointTarget(e2)) {
        const d = e1.point.distanceTo(e2.point), dx = Math.abs(e2.point.x - e1.point.x), dy = Math.abs(e2.point.y - e1.point.y), dz = Math.abs(e2.point.z - e1.point.z);
        drawPointPin(e1.point, 0x38bdf8); drawPointPin(e2.point, 0x34d399); drawCADDimensionLine(e1.point, e2.point, d);
        setMeasureCard('Point-to-Point Distance', fmtDim(d), `<span style="color:#e05656">ΔX:</span> ${fmtCoord(dx)} &nbsp;<span style="color:#3eb86f">ΔY:</span> ${fmtCoord(dy)} &nbsp;<span style="color:#4a9eed">ΔZ:</span> ${fmtCoord(dz)}`);
        currentMeasuredValue = `${fmtDim(d)} (ΔX: ${fmtCoord(dx)}, ΔY: ${fmtCoord(dy)}, ΔZ: ${fmtCoord(dz)})`;
      } else if ((isPurePointTarget(e1) && e2.type === 'line') || (e1.type === 'line' && isPurePointTarget(e2))) {
        const p = isPurePointTarget(e1) ? e1.point : e2.point, l = e1.type === 'line' ? e1 : e2;
        const s = new THREE.Vector3(...l.feature.start), dir = new THREE.Vector3(...l.feature.end).sub(s).normalize();
        const proj = s.clone().add(dir.clone().multiplyScalar(p.clone().sub(s).dot(dir))), d = p.distanceTo(proj);
        drawPointPin(p, 0x38bdf8); drawCADDimensionLine(proj, p, d, `Dist: ${fmtDim(d)}`);
        setMeasureCard('Point to Edge Distance', fmtDim(d), 'Perpendicular distance from Point to Edge');
        currentMeasuredValue = fmtDim(d);
      } else if (e1.type === 'line' && e2.type === 'line') {
        const d1 = new THREE.Vector3(e1.feature.end[0] - e1.feature.start[0], e1.feature.end[1] - e1.feature.start[1], e1.feature.end[2] - e1.feature.start[2]).normalize();
        const d2 = new THREE.Vector3(e2.feature.end[0] - e2.feature.start[0], e2.feature.end[1] - e2.feature.start[1], e2.feature.end[2] - e2.feature.start[2]).normalize();
        if (Math.abs(d1.dot(d2)) > 0.98) {
          const p1 = new THREE.Vector3(...e1.feature.start), p2 = new THREE.Vector3(...e2.feature.start), v = p2.clone().sub(p1);
          const perp = v.clone().sub(d1.clone().multiplyScalar(v.dot(d1))), nDis = perp.length();
          const pStart = p1.clone().add(d1.clone().multiplyScalar(v.dot(d1) * 0.5));
          drawCADDimensionLine(pStart, pStart.clone().add(perp), nDis, `Dist: ${fmtDim(nDis)}`);
          setMeasureCard('Parallel Edges Distance', fmtDim(nDis), 'Perpendicular distance between parallel edges');
          currentMeasuredValue = fmtDim(nDis);
        } else {
          const deg = (Math.acos(Math.min(1, Math.max(-1, d1.dot(d2)))) * 180) / Math.PI;
          const m1 = new THREE.Vector3(...e1.feature.start).add(new THREE.Vector3(...e1.feature.end)).multiplyScalar(0.5);
          const m2 = new THREE.Vector3(...e2.feature.start).add(new THREE.Vector3(...e2.feature.end)).multiplyScalar(0.5);
          drawCADDimensionLine(m1, m2, 0, `∠ ${deg.toFixed(1)}°`);
          setMeasureCard('Angle Between Edges', `${deg.toFixed(1)}°`, `Supplementary Angle: ${(180 - deg).toFixed(1)}°`);
          currentMeasuredValue = `${deg.toFixed(1)}°`;
        }
      }
      selectedCadEntities = [];
    }
  }

  function clearMeasurement(closeCard = true) {
    selectedCadEntities = []; currentMeasuredValue = '';
    if (hoverEdgeMesh) hoverEdgeMesh.visible = false;
    document.getElementById('measure-tooltip')?.style.setProperty('display', 'none');
    if (rubberbandLine) { measureGroup.remove(rubberbandLine); rubberbandLine.geometry?.dispose(); rubberbandLine.material?.dispose(); rubberbandLine = null; }
    if (snapIndicator) snapIndicator.visible = false;
    const toRemove = measureGroup.children.filter(c => c !== snapIndicator && c !== hoverEdgeMesh);
    toRemove.forEach(c => { measureGroup.remove(c); c.geometry?.dispose(); c.material?.map?.dispose(); c.material?.dispose(); });
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    const card = document.getElementById('measure-card');
    setText('measure-card-title', 'Smart Measure');
    document.getElementById('measure-extra')?.style.setProperty('display', 'none');
    if (closeCard) { if (card) card.style.display = 'none'; }
    else { setText('measure-dist', 'Select Point, Edge, or Hole'); setText('measure-deltas', 'Hover over corners, midpoints, edges, or holes'); }
  }

  function toggleMeasureMode(enable) {
    isMeasureActive = (enable !== undefined) ? enable : !isMeasureActive;
    document.getElementById('btn-measure')?.classList.toggle('active', isMeasureActive);
    const card = document.getElementById('measure-card'); if (card) card.style.display = isMeasureActive ? 'flex' : 'none';
    const container = document.getElementById('canvas-container'); if (container) container.style.cursor = isMeasureActive ? 'crosshair' : 'default';
    if (!isMeasureActive) document.getElementById('measure-tooltip')?.style.setProperty('display', 'none');
    clearMeasurement(!isMeasureActive);
  }

  function updateScreenSpaceAnnotations() {
    if (!window.camera || !measureGroup) return;
    const vFovRad = THREE.MathUtils.degToRad(window.camera.fov), winH = window.innerHeight || 800;
    measureGroup.traverse(c => {
      const d = window.camera.position.distanceTo(c.position);
      if (c.userData?.isScreenScaled) {
        const r = Math.max(((2 * Math.tan(vFovRad / 2) * d) / winH) * (c.userData.screenPixelRadius || 7.5), 0.001);
        c.scale.set(r, r, r);
      } else if (c.userData?.isScreenScaledSprite) {
        const sh = ((2 * Math.tan(vFovRad / 2) * d) / winH) * (c.userData.pixelHeight || 34);
        c.scale.set(sh * (c.userData.aspect || 4.0), sh, 1);
      }
    });
  }

  function setupUI() {
    document.getElementById('btn-measure')?.addEventListener('click', () => toggleMeasureMode());
    document.getElementById('btn-close-measure')?.addEventListener('click', () => toggleMeasureMode(false));
    document.getElementById('btn-clear-measure')?.addEventListener('click', () => clearMeasurement(false));
    document.getElementById('btn-copy-measure')?.addEventListener('click', () => {
      if (!currentMeasuredValue) return;
      navigator.clipboard?.writeText(currentMeasuredValue).catch(() => {});
      if (typeof window.showToast === 'function') window.showToast(`Copied: ${currentMeasuredValue}`);
    });
  }

  const MeasureEngine = {
    measureGroup, indexModelVertices, toggleMeasureMode, clearMeasurement, handleUnifiedClick, findSnapTarget, updateScreenSpaceAnnotations, setupUI,
    isActive: () => isMeasureActive, getMeasuredValue: () => currentMeasuredValue,
    formatDim: (val) => (window.formatDim ? window.formatDim(val) : `${(val || 0).toFixed(2)} mm`)
  };

  Object.assign(window, { MeasureEngine, measureGroup, toggleMeasureMode, clearMeasurement, handleUnifiedClick, indexModelVertices, updateScreenSpaceAnnotations, findSnapTarget });
})();