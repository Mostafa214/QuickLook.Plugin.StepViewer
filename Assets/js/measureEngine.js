/**
 * Smart CAD Measure & Hole Pitch Engine (v2.0.0 - Full Restored)
 * Geometric snapping (vertices, midpoints, circular hole centers), cylindrical feature recognition,
 * hole pitch analysis (center-to-center distance, delta X/Y/Z, inclination), dynamic rubberband, text sprites.
 */
    // Phase 2: Smart Measurement Tool Functions
    // =============================================================
    function createTextSprite(text) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      // Rounded pill background - Dark Studio graphite with crisp cyan border
      ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.lineWidth = 4;
      const r = 24, w = 496, h = 112, x = 8, y = 8;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Text label - sharp, bold, legible
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 42px "Segoe UI", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 64);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.userData = { isScreenScaledSprite: true, pixelHeight: 34, aspect: 4.0 };
      
      const vFovRad = THREE.MathUtils.degToRad(camera.fov);
      const worldPerPx = (2 * Math.tan(vFovRad / 2) * Math.max(currentModelDistance, 10)) / (window.innerHeight || 800);
      const sh = worldPerPx * 34;
      sprite.scale.set(sh * 4.0, sh, 1);
      return sprite;
    }

    function indexModelVertices(meshes) {
      modelCadVertices = [];
      const seen = new Set();
      function addVertex(pt, type, label, feat) {
        if (!pt) return;
        const k = `${Math.round(pt.x * 100)}_${Math.round(pt.y * 100)}_${Math.round(pt.z * 100)}`;
        if (seen.has(k)) return;
        seen.add(k);
        modelCadVertices.push({
          type: 'point',
          subType: type, // 'corner' | 'midpoint' | 'center'
          point: pt.clone(),
          label: label,
          feature: feat
        });
      }

      for (let i = 0; i < modelEdgeFeatures.length; i++) {
        const feat = modelEdgeFeatures[i];
        if (feat.type === 'line') {
          const p1 = new THREE.Vector3(...feat.start);
          const p2 = new THREE.Vector3(...feat.end);
          addVertex(p1, 'corner', 'Corner / Endpoint', feat);
          addVertex(p2, 'corner', 'Corner / Endpoint', feat);
          const pMid = p1.clone().add(p2).multiplyScalar(0.5);
          addVertex(pMid, 'midpoint', 'Midpoint', feat);
        } else if (feat.type === 'circle') {
          const c = new THREE.Vector3(...feat.center);
          addVertex(c, 'center', 'Hole Center', feat);
        }
      }

      if (meshes && Array.isArray(meshes)) {
        for (let i = 0; i < meshes.length; i++) {
          const faces = meshes[i].brepFaces || [];
          for (let f = 0; f < faces.length; f++) {
            if (faces[f].surfaceType === 'cylinder' && faces[f].cylinder) {
              const cyl = faces[f].cylinder;
              const c = new THREE.Vector3(...cyl.center);
              addVertex(c, 'center', cyl.isHole ? 'Hole Center' : 'Cylinder Center', {
                type: 'cylinder',
                cylinder: cyl,
                center: cyl.center,
                radius: cyl.radius,
                diameter: cyl.diameter,
                depth: cyl.depth,
                axis: cyl.axis,
                isHole: cyl.isHole
              });
            }
          }
        }
      }
    }

    function computeCoplanarArea(mesh, hitFaceIndex, localNormal, hitPoint) {
      if (!mesh || !mesh.geometry || !localNormal) return 0;
      const geom = mesh.geometry;
      const pos = geom.attributes.position;
      if (!pos) return 0;
      const idx = geom.index;
      const count = idx ? idx.count : pos.count;
      
      const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
      const cb = new THREE.Vector3(), ab = new THREE.Vector3();
      const triNorm = new THREE.Vector3();
      
      let totalArea = 0;
      const normalTolerance = 0.12; // ~7 degrees
      
      // Determine exact plane offset D = -normal . point
      let planeD = 0;
      if (hitPoint) {
        const localHit = mesh.worldToLocal(hitPoint.clone());
        planeD = -localNormal.dot(localHit);
      } else {
        const hitTriIdx = (hitFaceIndex !== undefined ? hitFaceIndex : 0) * 3;
        let p0 = new THREE.Vector3();
        if (idx && hitTriIdx < idx.count) {
          p0.fromBufferAttribute(pos, idx.getX(hitTriIdx));
        } else if (hitTriIdx < pos.count) {
          p0.fromBufferAttribute(pos, hitTriIdx);
        }
        planeD = -localNormal.dot(p0);
      }

      let hitTriArea = 0;
      const triCount = Math.floor(count / 3);
      for (let i = 0; i < triCount; i++) {
        const i3 = i * 3;
        if (idx) {
          vA.fromBufferAttribute(pos, idx.getX(i3));
          vB.fromBufferAttribute(pos, idx.getX(i3 + 1));
          vC.fromBufferAttribute(pos, idx.getX(i3 + 2));
        } else {
          vA.fromBufferAttribute(pos, i3);
          vB.fromBufferAttribute(pos, i3 + 1);
          vC.fromBufferAttribute(pos, i3 + 2);
        }
        
        cb.subVectors(vC, vB);
        ab.subVectors(vA, vB);
        cb.cross(ab);
        const triArea = cb.length() * 0.5;
        if (triArea < 1e-7) continue;

        if (i === hitFaceIndex) {
          hitTriArea = triArea;
        }
        
        triNorm.copy(cb).normalize();
        
        if (Math.abs(triNorm.dot(localNormal) - 1.0) < normalTolerance) {
          const distToPlane = Math.abs(localNormal.dot(vA) + planeD);
          if (distToPlane < 0.8) {
            totalArea += triArea;
          }
        }
      }
      
      return totalArea > 0 ? totalArea : hitTriArea;
    }

    function findSurfaceTarget(e) {
      if (!modelGroup || modelGroup.children.length === 0) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      const meshes = [];
      modelGroup.traverse(child => {
        if (child.isMesh && child.name !== 'solidworks_edges' && child.visible) meshes.push(child);
      });

      const intersects = ray.intersectObjects(meshes, false);
      if (!intersects || intersects.length === 0) return null;

      const hit = intersects[0];
      const localNormal = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
      const worldNormal = localNormal.clone().transformDirection(hit.object.matrixWorld).normalize();

      let matchedBrepFace = null;
      if (hit.object && hit.object.userData && hit.object.userData.brepFaces) {
        const tIdx = hit.faceIndex;
        matchedBrepFace = hit.object.userData.brepFaces.find(f => (f.triangles ? f.triangles.includes(tIdx) : (f.first <= tIdx && tIdx <= f.last)));
      }

      if (matchedBrepFace && matchedBrepFace.surfaceType === 'cylinder' && matchedBrepFace.cylinder) {
        const cyl = matchedBrepFace.cylinder;
        const worldCenter = new THREE.Vector3(...cyl.center).applyMatrix4(hit.object.matrixWorld);
        const worldAxis = new THREE.Vector3(...cyl.axis).transformDirection(hit.object.matrixWorld).normalize();

        return {
          type: 'cylinder',
          subType: cyl.isHole ? 'hole' : 'shaft',
          point: hit.point,
          normal: worldNormal,
          center: worldCenter,
          axis: worldAxis,
          radius: cyl.radius,
          diameter: cyl.diameter,
          depth: cyl.depth,
          isHole: cyl.isHole,
          areaMm2: matchedBrepFace.areaMm2,
          faceIndex: hit.faceIndex,
          brepFace: matchedBrepFace,
          mesh: hit.object,
          label: cyl.isHole ? 'Cylindrical Hole' : 'Cylindrical Shaft'
        };
      }

      let areaMm2 = 0;
      if (hit.face && hit.object && hit.faceIndex !== undefined) {
        areaMm2 = computeCoplanarArea(hit.object, hit.faceIndex, localNormal, hit.point);
      }

      return { 
        type: 'surface',
        subType: 'planar',
        point: hit.point, 
        normal: worldNormal, 
        areaMm2: areaMm2, 
        faceIndex: hit.faceIndex, 
        brepFace: matchedBrepFace,
        mesh: hit.object,
        label: 'Planar Face'
      };
    }

    function isPointOccluded(point) {
      if (!modelGroup || modelGroup.children.length === 0) return false;
      const origin = camera.position.clone();
      const dir = point.clone().sub(origin);
      const targetDist = dir.length();
      if (targetDist < 0.05) return false;
      dir.normalize();

      const ray = new THREE.Raycaster(origin, dir, camera.near, Math.max(0.1, targetDist - 0.25));
      const meshes = [];
      modelGroup.traverse(child => {
        if (child.isMesh && child.name !== 'solidworks_edges' && child.visible && (!child.material || !child.material.transparent)) {
          meshes.push(child);
        }
      });

      const hits = ray.intersectObjects(meshes, false);
      return hits && hits.length > 0;
    }

    function findSnapTarget(e) {
      if (!isMeasureActive || !modelGroup || modelGroup.children.length === 0) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      // 1. Priority 1: Check CAD Vertex / Endpoint / Corner / Center (within 12px)
      let bestVertex = null;
      let minVertexDist = 12;

      for (let i = 0; i < modelCadVertices.length; i++) {
        const v = modelCadVertices[i];
        const proj = v.point.clone().project(camera);
        if (proj.z > 1) continue; // Behind camera
        const px = (proj.x * 0.5 + 0.5) * rect.width + rect.left;
        const py = (-proj.y * 0.5 + 0.5) * rect.height + rect.top;
        const dist = Math.hypot(mouseX - px, mouseY - py);
        if (dist < minVertexDist) {
          if (!isPointOccluded(v.point)) {
            minVertexDist = dist;
            bestVertex = v;
          }
        }
      }

      if (bestVertex) {
        return {
          type: 'point',
          subType: bestVertex.subType || bestVertex.type,
          point: bestVertex.point.clone(),
          label: bestVertex.label,
          feature: bestVertex.feature
        };
      }

      // 2. Priority 2: Check CAD Edge or Circle Perimeter (within 15px)
      let bestFeature = null;
      let minEdgeDist = 15;
      let bestEdgePoint = null;

      for (let i = 0; i < modelEdgeFeatures.length; i++) {
        const feat = modelEdgeFeatures[i];
        if (feat.type === 'circle') {
          const cProj = new THREE.Vector3(...feat.center).project(camera);
          if (cProj.z > 1) continue;
          const cPx = (cProj.x * 0.5 + 0.5) * rect.width + rect.left;
          const cPy = (-cProj.y * 0.5 + 0.5) * rect.height + rect.top;

          let screenR = 10;
          if (feat.points && feat.points.length >= 3) {
            const p0 = new THREE.Vector3(feat.points[0], feat.points[1], feat.points[2]).project(camera);
            const p0x = (p0.x * 0.5 + 0.5) * rect.width + rect.left;
            const p0y = (-p0.y * 0.5 + 0.5) * rect.height + rect.top;
            screenR = Math.hypot(p0x - cPx, p0y - cPy);
          }

          const mouseDistToCenter = Math.hypot(mouseX - cPx, mouseY - cPy);
          const distToPerimeter = Math.abs(mouseDistToCenter - screenR);

          if (distToPerimeter < minEdgeDist) {
            const centerPt = new THREE.Vector3(...feat.center);
            if (!isPointOccluded(centerPt)) {
              minEdgeDist = distToPerimeter;
              bestFeature = feat;
              bestEdgePoint = centerPt;
            }
          }
        } else if (feat.type === 'line') {
          const pA = new THREE.Vector3(...feat.start).project(camera);
          const pB = new THREE.Vector3(...feat.end).project(camera);
          if (pA.z > 1 && pB.z > 1) continue;

          const ax = (pA.x * 0.5 + 0.5) * rect.width + rect.left;
          const ay = (-pA.y * 0.5 + 0.5) * rect.height + rect.top;
          const bx = (pB.x * 0.5 + 0.5) * rect.width + rect.left;
          const by = (-pB.y * 0.5 + 0.5) * rect.height + rect.top;

          const l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
          let dist = 0;
          let t = 0;
          if (l2 === 0) {
            dist = Math.hypot(mouseX - ax, mouseY - ay);
          } else {
            t = Math.max(0, Math.min(1, ((mouseX - ax) * (bx - ax) + (mouseY - ay) * (by - ay)) / l2));
            const projX = ax + t * (bx - ax);
            const projY = ay + t * (by - ay);
            dist = Math.hypot(mouseX - projX, mouseY - projY);
          }

          if (dist < minEdgeDist) {
            const edgePt = new THREE.Vector3(
              feat.start[0] + t * (feat.end[0] - feat.start[0]),
              feat.start[1] + t * (feat.end[1] - feat.start[1]),
              feat.start[2] + t * (feat.end[2] - feat.start[2])
            );
            if (!isPointOccluded(edgePt)) {
              minEdgeDist = dist;
              bestFeature = feat;
              bestEdgePoint = edgePt;
            }
          }
        }
      }

      if (bestFeature) {
        if (bestFeature.type === 'circle' && !bestFeature.cylinder) {
          const cCenter = new THREE.Vector3(...bestFeature.center);
          const cRadius = bestFeature.radius;
          for (let b = 0; b < modelBodies.length; b++) {
            const faces = modelBodies[b].data.brepFaces || [];
            for (let f = 0; f < faces.length; f++) {
              if (faces[f].surfaceType === 'cylinder' && faces[f].cylinder) {
                const cyl = faces[f].cylinder;
                if (Math.abs(cyl.radius - cRadius) <= Math.max(0.2, cRadius * 0.1)) {
                  const cylC = new THREE.Vector3(...cyl.center);
                  const cylA = new THREE.Vector3(...cyl.axis);
                  const v = cCenter.clone().sub(cylC);
                  const perp = v.clone().sub(cylA.clone().multiplyScalar(v.dot(cylA)));
                  if (perp.length() < Math.max(0.3, cRadius * 0.15)) {
                    bestFeature.cylinder = cyl;
                    break;
                  }
                }
              }
            }
            if (bestFeature.cylinder) break;
          }
        }
        return {
          type: bestFeature.type, // 'line' | 'circle'
          feature: bestFeature,
          point: bestEdgePoint
        };
      }

      // 3. Priority 3: Fallback Surface Raycast
      const snapSurface = findSurfaceTarget(e);
      if (snapSurface) {
        if (snapSurface.type === 'cylinder') {
          return snapSurface;
        }
        return {
          type: 'point',
          subType: 'surface',
          point: snapSurface.point.clone(),
          normal: snapSurface.normal,
          areaMm2: snapSurface.areaMm2,
          faceIndex: snapSurface.faceIndex,
          brepFace: snapSurface.brepFace,
          mesh: snapSurface.mesh,
          label: 'Planar Face'
        };
      }

      return null;
    }

    function updateHoverEdgeGeometry(feat) {
      if (!hoverEdgeMesh) return;
      if (!feat || !feat.points || feat.points.length === 0) {
        hoverEdgeMesh.visible = false;
        return;
      }
      const pts = [];
      const pCount = feat.points.length / 3;
      for (let i = 0; i < pCount; i++) {
        pts.push(new THREE.Vector3(feat.points[i * 3], feat.points[i * 3 + 1], feat.points[i * 3 + 2]));
      }
      if (feat.type === 'circle' && pts.length > 1) {
        pts.push(pts[0].clone());
      }
      if (hoverEdgeMesh.geometry) hoverEdgeMesh.geometry.dispose();
      hoverEdgeMesh.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      hoverEdgeMesh.visible = true;
    }

    function drawCircleRing(feat, colorHex = 0x38bdf8) {
      if (!feat || !feat.points || feat.points.length === 0) return null;
      const pts = [];
      const pCount = feat.points.length / 3;
      for (let i = 0; i < pCount; i++) {
        pts.push(new THREE.Vector3(feat.points[i * 3], feat.points[i * 3 + 1], feat.points[i * 3 + 2]));
      }
      if (pts.length > 1) pts.push(pts[0].clone());
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: colorHex, linewidth: 2, depthTest: false });
      const line = new THREE.Line(geom, mat);
      line.renderOrder = 997;
      line.name = 'measure_element';
      measureGroup.add(line);
      return line;
    }

    function draw3DCircleRing(center, axis, radius, colorHex = 0x38bdf8) {
      const c = (center && center.isVector3) ? center.clone() : new THREE.Vector3(...center);
      const a = ((axis && axis.isVector3) ? axis.clone() : new THREE.Vector3(...axis)).normalize();
      const u = new THREE.Vector3();
      if (Math.abs(a.x) < 0.8) u.set(1, 0, 0).cross(a).normalize();
      else u.set(0, 1, 0).cross(a).normalize();
      const v = new THREE.Vector3().crossVectors(a, u).normalize();

      const segs = 48;
      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const theta = (i / segs) * Math.PI * 2;
        const p = c.clone()
          .add(u.clone().multiplyScalar(Math.cos(theta) * radius))
          .add(v.clone().multiplyScalar(Math.sin(theta) * radius));
        pts.push(p);
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: colorHex, linewidth: 2, depthTest: false });
      const line = new THREE.Line(geom, mat);
      line.renderOrder = 997;
      line.name = 'measure_element';
      measureGroup.add(line);
      return line;
    }

    function drawCylinderAxisLine(center, axis, halfLen, colorHex = 0x38bdf8) {
      const c = (center && center.isVector3) ? center.clone() : new THREE.Vector3(...center);
      const a = ((axis && axis.isVector3) ? axis.clone() : new THREE.Vector3(...axis)).normalize();
      const p1 = c.clone().sub(a.clone().multiplyScalar(halfLen));
      const p2 = c.clone().add(a.clone().multiplyScalar(halfLen));

      const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const mat = new THREE.LineDashedMaterial({
        color: colorHex,
        dashSize: 1.5,
        gapSize: 0.8,
        linewidth: 2,
        depthTest: false
      });
      const line = new THREE.Line(geom, mat);
      line.computeLineDistances();
      line.renderOrder = 998;
      line.name = 'measure_element';
      measureGroup.add(line);
      return line;
    }

    function drawPointPin(pt, colorHex = 0x38bdf8) {
      const p = Array.isArray(pt) ? new THREE.Vector3(...pt) : pt.clone();
      const geom = new THREE.SphereGeometry(1, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });
      const pin = new THREE.Mesh(geom, mat);
      pin.position.copy(p);
      pin.renderOrder = 999;
      pin.name = 'measure_element';
      pin.userData = { isScreenScaled: true, screenPixelRadius: 7.5 };

      const vFovRad = THREE.MathUtils.degToRad(camera.fov);
      const dist = camera.position.distanceTo(p);
      const worldPerPx = (2 * Math.tan(vFovRad / 2) * dist) / (window.innerHeight || 800);
      const r = Math.max(worldPerPx * 7.5, 0.0001);
      pin.scale.set(r, r, r);

      measureGroup.add(pin);
      return pin;
    }

    function drawCADDimensionLine(startPt, endPt, len, label) {
      const vA = Array.isArray(startPt) ? new THREE.Vector3(...startPt) : startPt.clone();
      const vB = Array.isArray(endPt) ? new THREE.Vector3(...endPt) : endPt.clone();
      const lineDir = vB.clone().sub(vA);
      const lineLen = lineDir.length();
      if (lineLen < 0.001) return;
      lineDir.normalize();

      const camDir = camera.position.clone().sub(vA).normalize();
      let normal = new THREE.Vector3().crossVectors(lineDir, camDir).normalize();
      if (normal.lengthSq() < 0.1) normal = camera.up.clone().normalize();

      const vFovRad = THREE.MathUtils.degToRad(camera.fov);
      const distToCam = camera.position.distanceTo(vA);
      const worldPerPx = (2 * Math.tan(vFovRad / 2) * distToCam) / (window.innerHeight || 800);

      // Adaptive offset: balanced spacing around 24-45px on screen
      const offsetDist = Math.max(worldPerPx * 24, Math.min(lineLen * 0.38, worldPerPx * 45));
      const offsetVec = normal.clone().multiplyScalar(offsetDist);

      const dA = vA.clone().add(offsetVec);
      const dB = vB.clone().add(offsetVec);

      const wA1 = vA.clone().add(offsetVec.clone().multiplyScalar(0.06));
      const wA2 = dA.clone().add(offsetVec.clone().multiplyScalar(0.15));
      const wB1 = vB.clone().add(offsetVec.clone().multiplyScalar(0.06));
      const wB2 = dB.clone().add(offsetVec.clone().multiplyScalar(0.15));

      const points = [
        wA1, wA2,
        wB1, wB2,
        dA, dB
      ];

      const arrowLen = Math.min(lineLen * 0.25, worldPerPx * 14);
      const arrowWidth = arrowLen * 0.38;
      const perpArrow = normal.clone().multiplyScalar(arrowWidth);
      const dirArrow = lineDir.clone().multiplyScalar(arrowLen);

      points.push(dA, dA.clone().add(dirArrow).add(perpArrow));
      points.push(dA, dA.clone().add(dirArrow).sub(perpArrow));
      points.push(dB, dB.clone().sub(dirArrow).add(perpArrow));
      points.push(dB, dB.clone().sub(dirArrow).sub(perpArrow));

      const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        linewidth: 2,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });
      const dimLines = new THREE.LineSegments(lineGeom, lineMat);
      dimLines.renderOrder = 998;
      dimLines.name = 'measure_element';
      measureGroup.add(dimLines);

      const edgeGeom = new THREE.BufferGeometry().setFromPoints([vA, vB]);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2, depthTest: false });
      const edgeLine = new THREE.Line(edgeGeom, edgeMat);
      edgeLine.renderOrder = 997;
      edgeLine.name = 'measure_element';
      measureGroup.add(edgeLine);

      const mid = dA.clone().add(dB).multiplyScalar(0.5);
      const textToDisplay = label || formatDim(len);
      const sprite = createTextSprite(textToDisplay);
      sprite.position.copy(mid).add(offsetVec.clone().multiplyScalar(0.22));
      sprite.renderOrder = 1000;
      sprite.name = 'measure_element';
      measureGroup.add(sprite);
    }

    function drawCADCircleAnnotation(centerPt, radius, diameter) {
      const c = Array.isArray(centerPt) ? new THREE.Vector3(...centerPt) : centerPt.clone();
      const crossSize = Math.max(radius * 1.2, 0.5);

      const points = [
        c.clone().add(new THREE.Vector3(-crossSize, 0, 0)), c.clone().add(new THREE.Vector3(crossSize, 0, 0)),
        c.clone().add(new THREE.Vector3(0, -crossSize, 0)), c.clone().add(new THREE.Vector3(0, crossSize, 0))
      ];

      const vFovRad = THREE.MathUtils.degToRad(camera.fov);
      const dist = camera.position.distanceTo(c);
      const worldPerPx = (2 * Math.tan(vFovRad / 2) * dist) / (window.innerHeight || 800);

      const leaderOffset = camera.up.clone().add(new THREE.Vector3(1, 0, 0)).normalize().multiplyScalar(Math.max(radius * 1.4, worldPerPx * 22));
      const leaderEnd = c.clone().add(leaderOffset);
      const kneeOffset = new THREE.Vector3(worldPerPx * 26, 0, 0);
      const leaderKnee = leaderEnd.clone().add(kneeOffset);

      points.push(c, leaderEnd);
      points.push(leaderEnd, leaderKnee);

      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2, depthTest: false });
      const leaderLine = new THREE.LineSegments(geom, mat);
      leaderLine.renderOrder = 998;
      leaderLine.name = 'measure_element';
      measureGroup.add(leaderLine);

      const sprite = createTextSprite(formatCircleDim(diameter, radius));
      sprite.position.copy(leaderKnee).add(new THREE.Vector3(0, worldPerPx * 12, 0));
      sprite.renderOrder = 1000;
      sprite.name = 'measure_element';
      measureGroup.add(sprite);
    }

    function getEntityOriginPoint(entity) {
      if (!entity) return null;
      if (entity.type === 'point' && entity.point) return entity.point.clone();
      if (entity.type === 'line' && entity.feature) {
        return new THREE.Vector3(...entity.feature.start).add(new THREE.Vector3(...entity.feature.end)).multiplyScalar(0.5);
      }
      if (entity.type === 'circle' && entity.feature) {
        return new THREE.Vector3(...entity.feature.center);
      }
      if (entity.type === 'cylinder') {
        return (entity.center && entity.center.isVector3) ? entity.center.clone() : (entity.center ? new THREE.Vector3(...entity.center) : entity.point.clone());
      }
      return entity.point ? entity.point.clone() : null;
    }

    function updateRubberband(p1, currentPt) {
      removeRubberband();
      const geom = new THREE.BufferGeometry().setFromPoints([p1, currentPt]);
      const mat = new THREE.LineDashedMaterial({
        color: 0xe06c35,
        dashSize: Math.max(currentModelDistance * 0.02, 1),
        gapSize: Math.max(currentModelDistance * 0.015, 0.7),
        depthTest: false
      });
      rubberbandLine = new THREE.Line(geom, mat);
      rubberbandLine.computeLineDistances();
      rubberbandLine.renderOrder = 996;
      rubberbandLine.name = 'rubberband';
      measureGroup.add(rubberbandLine);
    }

    function removeRubberband() {
      if (typeof rubberbandLine !== 'undefined' && rubberbandLine) {
        measureGroup.remove(rubberbandLine);
        if (rubberbandLine.geometry) rubberbandLine.geometry.dispose();
        if (rubberbandLine.material) rubberbandLine.material.dispose();
        rubberbandLine = null;
      }
    }

    function isHoleEntity(ent) {
      if (!ent) return false;
      if (ent.type === 'circle') return true;
      if (ent.type === 'cylinder') return true;
      if (ent.subType === 'hole' || ent.subType === 'center') return true;
      if (ent.feature && (ent.feature.type === 'circle' || ent.feature.type === 'cylinder')) return true;
      return false;
    }

    function getHoleInfo(ent) {
      if (!ent) return null;
      if (ent.type === 'circle' && ent.feature) {
        const feat = ent.feature;
        const center = new THREE.Vector3(...feat.center);
        const radius = feat.radius;
        const diameter = feat.diameter;
        const depth = feat.cylinder ? feat.cylinder.depth : 0;
        const normal = feat.normal ? new THREE.Vector3(...feat.normal) : new THREE.Vector3(0, 0, 1);
        const axis = feat.cylinder && feat.cylinder.axis ? new THREE.Vector3(...feat.cylinder.axis) : normal;
        return {
          center: center,
          radius: radius,
          diameter: diameter,
          depth: depth,
          axis: axis,
          isHole: feat.cylinder ? feat.cylinder.isHole : true,
          feature: feat
        };
      }
      if (ent.type === 'cylinder') {
        const c = ent.center ? (ent.center.isVector3 ? ent.center.clone() : new THREE.Vector3(...ent.center)) : ent.point.clone();
        const a = ent.axis ? (ent.axis.isVector3 ? ent.axis.clone() : new THREE.Vector3(...ent.axis)) : new THREE.Vector3(0, 0, 1);
        return {
          center: c,
          radius: ent.radius,
          diameter: ent.diameter,
          depth: ent.depth || 0,
          axis: a,
          isHole: ent.isHole !== undefined ? ent.isHole : true,
          feature: ent
        };
      }
      if (ent.subType === 'center' || ent.type === 'center' || (ent.feature && ent.feature.type === 'circle')) {
        const feat = ent.feature || {};
        const c = ent.point ? ent.point.clone() : (feat.center ? new THREE.Vector3(...feat.center) : new THREE.Vector3());
        const r = feat.radius || (feat.cylinder ? feat.cylinder.radius : 0);
        const d = feat.diameter || (feat.cylinder ? feat.cylinder.diameter : r * 2);
        const depth = feat.depth || (feat.cylinder ? feat.cylinder.depth : 0);
        const a = feat.axis ? (feat.axis.isVector3 ? feat.axis.clone() : new THREE.Vector3(...feat.axis)) : (feat.normal ? new THREE.Vector3(...feat.normal) : new THREE.Vector3(0, 0, 1));
        return {
          center: c,
          radius: r,
          diameter: d,
          depth: depth,
          axis: a,
          isHole: feat.isHole !== undefined ? feat.isHole : true,
          feature: feat
        };
      }
      return null;
    }

    function isSurfaceTarget(t) {
      return t && (t.type === 'surface' || t.subType === 'surface') && t.type !== 'cylinder';
    }

    function isPurePointTarget(t) {
      return t && (t.type === 'point' || t.type === 'corner' || t.type === 'midpoint' || t.type === 'center') && t.subType !== 'surface' && t.type !== 'cylinder';
    }

    function isPointTarget(t) {
      return t && (t.type === 'point' || t.type === 'corner' || t.type === 'midpoint' || t.type === 'center' || t.subType === 'surface' || t.type === 'surface') && t.type !== 'cylinder';
    }

    // =============================================================
    // Phase 5: Smart Measure v2 (Multi-Pin, Wall Thickness, Min Clearance)
    // =============================================================
    let pinnedMeasurements = [];
    let pinCounter = 0;
    let pinnedMeasureGroup = null;
    let lastActiveMeasurement = null;
    let isWallThicknessMode = false;
    let isClearanceMode = false;
    let clearanceSelectedMeshes = [];
    let controlsChangeHooked = false;

    function _getMeasureGroup() {
      if (typeof measureGroup !== 'undefined' && measureGroup) return measureGroup;
      if (typeof window !== 'undefined' && window.measureGroup) return window.measureGroup;
      return null;
    }

    function _getCamera() {
      if (typeof camera !== 'undefined' && camera) return camera;
      if (typeof window !== 'undefined' && window.camera) return window.camera;
      return null;
    }

    function _getRenderer() {
      if (typeof renderer !== 'undefined' && renderer) return renderer;
      if (typeof window !== 'undefined' && window.renderer) return window.renderer;
      return null;
    }

    function _getModelGroup() {
      if (typeof modelGroup !== 'undefined' && modelGroup) return modelGroup;
      if (typeof window !== 'undefined' && window.modelGroup) return window.modelGroup;
      return null;
    }

    function _getControls() {
      if (typeof controls !== 'undefined' && controls) return controls;
      if (typeof window !== 'undefined' && window.controls) return window.controls;
      return null;
    }

    function _getModelDistance() {
      if (typeof currentModelDistance !== 'undefined' && currentModelDistance > 0) return currentModelDistance;
      if (typeof window !== 'undefined' && window.currentModelDistance > 0) return window.currentModelDistance;
      return 50;
    }

    function _formatDim(mmVal) {
      if (typeof window !== 'undefined' && window.CadState && typeof window.CadState.formatLength === 'function') {
        return window.CadState.formatLength(mmVal);
      }
      if (typeof formatDim === 'function') return formatDim(mmVal);
      if (typeof window !== 'undefined' && typeof window.formatDim === 'function') return window.formatDim(mmVal);
      const unit = (typeof currentUnit !== 'undefined' ? currentUnit : (typeof window !== 'undefined' && window.currentUnit ? window.currentUnit : 'mm'));
      const fallback = {
        mm: { factor: 1, decimals: 2, label: 'mm' },
        cm: { factor: 0.1, decimals: 2, label: 'cm' },
        m: { factor: 0.001, decimals: 4, label: 'm' },
        in: { factor: 1 / 25.4, decimals: 3, label: 'in' },
        ft: { factor: 1 / 304.8, decimals: 4, label: 'ft' }
      }[unit] || { factor: 1, decimals: 2, label: 'mm' };
      return `${(Number(mmVal) * fallback.factor).toFixed(fallback.decimals)} ${fallback.label}`;
    }

    function _formatArea(areaMm2) {
      if (typeof window !== 'undefined' && window.CadState && typeof window.CadState.formatArea === 'function') {
        return window.CadState.formatArea(areaMm2);
      }
      if (typeof formatArea === 'function') return formatArea(areaMm2);
      if (typeof window !== 'undefined' && typeof window.formatArea === 'function') return window.formatArea(areaMm2);
      const unit = (typeof currentUnit !== 'undefined' ? currentUnit : (typeof window !== 'undefined' && window.currentUnit ? window.currentUnit : 'mm'));
      if (unit === 'in') return `${(areaMm2 / 645.16).toFixed(3)} in²`;
      if (unit === 'cm') return `${(areaMm2 / 100).toFixed(2)} cm²`;
      if (unit === 'm') return `${(areaMm2 / 1e6).toFixed(4)} m²`;
      if (unit === 'ft') return `${(areaMm2 / 92903.04).toFixed(4)} ft²`;
      return `${areaMm2.toFixed(1)} mm² (${(areaMm2 / 100).toFixed(2)} cm²)`;
    }

    function _escapeHtml(str) {
      if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function') return window.escapeHtml(str);
      return String(str == null ? '' : str).replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch]));
    }

    function _toVector3(v) {
      if (!v) return null;
      if (v.isVector3) return v.clone();
      if (Array.isArray(v)) return new THREE.Vector3(v[0] || 0, v[1] || 0, v[2] || 0);
      if (typeof v.x === 'number') return new THREE.Vector3(v.x, v.y || 0, v.z || 0);
      return null;
    }

    function _createSafeTextSprite(text) {
      const cam = _getCamera();
      if (!cam || typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        if (!ctx || typeof ctx.quadraticCurveTo !== 'function') return null;
        return createTextSprite(text);
      } catch (e) {
        return null;
      }
    }

    function _disposeObject3D(root) {
      if (!root) return;
      root.traverse(obj => {
        if (obj.geometry && typeof obj.geometry.dispose === 'function') {
          obj.geometry.dispose();
        }
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => {
            if (m && m.map && typeof m.map.dispose === 'function') m.map.dispose();
            if (m && typeof m.dispose === 'function') m.dispose();
          });
        }
      });
    }

    function _ensurePinnedGroup() {
      const mg = _getMeasureGroup();
      if (!pinnedMeasureGroup) {
        pinnedMeasureGroup = new THREE.Group();
        pinnedMeasureGroup.name = 'pinned_measure_group';
      }
      if (mg && pinnedMeasureGroup.parent !== mg) {
        mg.add(pinnedMeasureGroup);
      }
      return pinnedMeasureGroup;
    }

    function _ensureControlsHook() {
      if (controlsChangeHooked) return;
      const ctrl = _getControls();
      if (ctrl && typeof ctrl.addEventListener === 'function') {
        ctrl.addEventListener('change', updatePinnedBadgePositions);
        controlsChangeHooked = true;
      }
    }

    function updatePinnedBadgePositions() {
      const cam = _getCamera();
      const rend = _getRenderer();
      let rect = { left: 0, top: 0, width: (typeof window !== 'undefined' && window.innerWidth) || 800, height: (typeof window !== 'undefined' && window.innerHeight) || 600 };
      if (rend && rend.domElement && typeof rend.domElement.getBoundingClientRect === 'function') {
        const r = rend.domElement.getBoundingClientRect();
        if (r && r.width > 0 && r.height > 0) rect = r;
      }

      for (let i = 0; i < pinnedMeasurements.length; i++) {
        const pin = pinnedMeasurements[i];
        if (!pin.anchorPoint) continue;
        let x = 0, y = 0, visible = false;
        if (cam) {
          const proj = pin.anchorPoint.clone().project(cam);
          visible = proj.z >= -1 && proj.z <= 1;
          x = (proj.x * 0.5 + 0.5) * rect.width;
          y = (-proj.y * 0.5 + 0.5) * rect.height;
        }
        pin.screenPos = { x, y, visible };
        if (pin.badgeEl && pin.badgeEl.style) {
          pin.badgeEl.style.display = visible ? 'inline-flex' : 'none';
          pin.badgeEl.style.left = `${Math.round(x)}px`;
          pin.badgeEl.style.top = `${Math.round(y)}px`;
        }
      }
    }

    function _renderPinnedListDom() {
      if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
      const listEl = document.getElementById('measure-pins-list');
      if (!listEl) return;

      if (pinnedMeasurements.length === 0) {
        listEl.innerHTML = '<div class="measure-pins-empty">No pinned dimensions yet</div>';
        return;
      }

      listEl.innerHTML = pinnedMeasurements.map(pin => `
        <div class="measure-pin-item" data-pin-id="${_escapeHtml(pin.id)}">
          <div class="measure-pin-meta">
            <span class="measure-pin-title">${_escapeHtml(pin.title || 'Dimension')}</span>
            <span class="measure-pin-value">${_escapeHtml(pin.valueText || '')}</span>
          </div>
          <button type="button" class="measure-pin-remove" data-pin-id="${_escapeHtml(pin.id)}" title="Remove pin" aria-label="Remove pin">✕</button>
        </div>
      `).join('');

      if (typeof listEl.querySelectorAll === 'function') {
        listEl.querySelectorAll('.measure-pin-remove').forEach(btn => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const id = btn.getAttribute('data-pin-id');
            if (id) removePinnedMeasurement(id);
          });
        });
      }
    }

    function _createPinBadgeElement(pin) {
      if (typeof document === 'undefined' || typeof document.getElementById !== 'function' || typeof document.createElement !== 'function') return null;
      const container = document.getElementById('canvas-container');
      if (!container || typeof container.appendChild !== 'function') return null;
      const badge = document.createElement('div');
      badge.className = 'measure-pin-badge';
      badge.setAttribute('data-pin-id', pin.id);
      badge.style.position = 'absolute';
      badge.style.pointerEvents = 'none';
      badge.style.transform = 'translate(-50%, -120%)';
      badge.style.zIndex = '25';
      badge.innerText = pin.valueText || pin.title || '';
      container.appendChild(badge);
      return badge;
    }

    function pinMeasurement(customData) {
      const src = customData || lastActiveMeasurement;
      if (!src) return null;

      const points = Array.isArray(src.points)
        ? src.points.map(_toVector3).filter(Boolean)
        : [];
      let anchor = _toVector3(src.anchorPoint);
      if (!anchor) {
        if (points.length >= 2) {
          anchor = points[0].clone().add(points[1]).multiplyScalar(0.5);
        } else if (points.length === 1) {
          anchor = points[0].clone();
        } else {
          anchor = new THREE.Vector3();
        }
      }

      const id = `pin-${++pinCounter}`;
      const colorHex = src.color !== undefined ? src.color : 0xf59e0b;
      const valueText = src.valueText || (typeof src.distanceMm === 'number' ? _formatDim(src.distanceMm) : (typeof currentMeasuredValue !== 'undefined' ? currentMeasuredValue : ''));
      const title = src.title || 'Pinned Dimension';

      const pinGroup = new THREE.Group();
      pinGroup.name = `pinned_measure_${id}`;
      pinGroup.userData = { pinId: id };

      const cam = _getCamera();
      const distForScale = cam ? cam.position.distanceTo(anchor) : _getModelDistance();
      const worldPerPx = (2 * Math.tan(THREE.MathUtils.degToRad((cam && cam.fov) || 45) / 2) * Math.max(distForScale, 1)) / ((typeof window !== 'undefined' && window.innerHeight) || 800);
      const pinRadius = Math.max(worldPerPx * 6.5, 0.05);

      points.forEach(pt => {
        const geom = new THREE.SphereGeometry(1, 12, 12);
        const mat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });
        const marker = new THREE.Mesh(geom, mat);
        marker.position.copy(pt);
        marker.scale.set(pinRadius, pinRadius, pinRadius);
        marker.renderOrder = 999;
        marker.userData = { isScreenScaled: true, screenPixelRadius: 6.5 };
        pinGroup.add(marker);
      });

      if (points.length >= 2) {
        const lineGeom = new THREE.BufferGeometry().setFromPoints([points[0], points[1]]);
        const lineMat = new THREE.LineBasicMaterial({ color: colorHex, linewidth: 2, depthTest: false });
        const line = new THREE.Line(lineGeom, lineMat);
        line.renderOrder = 998;
        pinGroup.add(line);
      }

      const sprite = _createSafeTextSprite(valueText);
      if (sprite) {
        sprite.position.copy(anchor);
        sprite.renderOrder = 1001;
        pinGroup.add(sprite);
      }

      const rootGroup = _ensurePinnedGroup();
      rootGroup.add(pinGroup);

      const pin = {
        id,
        type: src.type || 'distance',
        title,
        valueText,
        distanceMm: typeof src.distanceMm === 'number' ? src.distanceMm : null,
        points,
        anchorPoint: anchor,
        color: colorHex,
        group: pinGroup,
        badgeEl: null,
        screenPos: { x: 0, y: 0, visible: false }
      };
      pin.badgeEl = _createPinBadgeElement(pin);

      pinnedMeasurements.push(pin);
      _ensureControlsHook();
      updatePinnedBadgePositions();
      _renderPinnedListDom();
      return pin;
    }

    function removePinnedMeasurement(id) {
      const idx = pinnedMeasurements.findIndex(p => p.id === id);
      if (idx === -1) return false;
      const pin = pinnedMeasurements[idx];
      if (pin.group && pin.group.parent) {
        pin.group.parent.remove(pin.group);
      }
      _disposeObject3D(pin.group);
      if (pin.badgeEl && pin.badgeEl.parentNode) {
        pin.badgeEl.parentNode.removeChild(pin.badgeEl);
      }
      pinnedMeasurements.splice(idx, 1);
      _renderPinnedListDom();
      return true;
    }

    function clearPinnedMeasurements() {
      for (let i = 0; i < pinnedMeasurements.length; i++) {
        const pin = pinnedMeasurements[i];
        if (pin.group && pin.group.parent) {
          pin.group.parent.remove(pin.group);
        }
        _disposeObject3D(pin.group);
        if (pin.badgeEl && pin.badgeEl.parentNode) {
          pin.badgeEl.parentNode.removeChild(pin.badgeEl);
        }
      }
      pinnedMeasurements = [];
      _renderPinnedListDom();
    }

    function getPinnedMeasurements() {
      return pinnedMeasurements.map(p => ({
        id: p.id,
        type: p.type,
        title: p.title,
        valueText: p.valueText,
        distanceMm: p.distanceMm,
        points: p.points.map(pt => pt.clone()),
        anchorPoint: p.anchorPoint.clone(),
        color: p.color,
        screenPos: p.screenPos ? { ...p.screenPos } : null
      }));
    }

    function _ensureGeometryBVH(mesh) {
      if (!mesh || !mesh.geometry) return null;
      if (mesh.geometry.boundsTree) return mesh.geometry.boundsTree;
      if (typeof MeshBVHLib !== 'undefined' && MeshBVHLib && typeof MeshBVHLib.MeshBVH === 'function') {
        mesh.geometry.boundsTree = new MeshBVHLib.MeshBVH(mesh.geometry);
        return mesh.geometry.boundsTree;
      }
      if (typeof window !== 'undefined' && window.MeshBVHLib && typeof window.MeshBVHLib.MeshBVH === 'function') {
        mesh.geometry.boundsTree = new window.MeshBVHLib.MeshBVH(mesh.geometry);
        return mesh.geometry.boundsTree;
      }
      return null;
    }

    function _collectCandidateMeshes(targetMesh) {
      if (targetMesh) return [targetMesh];
      const mg = _getModelGroup();
      const meshes = [];
      if (mg && typeof mg.traverse === 'function') {
        mg.traverse(child => {
          if (child.isMesh && child.name !== 'solidworks_edges' && child.visible) {
            meshes.push(child);
          }
        });
      }
      return meshes;
    }

    function toggleWallThicknessMode(enable) {
      isWallThicknessMode = (enable !== undefined) ? !!enable : !isWallThicknessMode;
      if (isWallThicknessMode) {
        isClearanceMode = false;
        clearanceSelectedMeshes = [];
        if (typeof isMeasureActive !== 'undefined' && !isMeasureActive) {
          toggleMeasureMode(true);
        }
      }
      if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
        const btnWall = document.getElementById('btn-measure-wall');
        const btnClear = document.getElementById('btn-measure-clearance');
        if (btnWall) btnWall.classList.toggle('active', isWallThicknessMode);
        if (btnClear) btnClear.classList.toggle('active', isClearanceMode);
        const titleEl = document.getElementById('measure-card-title');
        const distEl = document.getElementById('measure-dist');
        if (isWallThicknessMode && titleEl) titleEl.innerText = '🧱 Wall Thickness Probe';
        if (isWallThicknessMode && distEl) distEl.innerText = 'Click any surface to probe thickness';
      }
      return isWallThicknessMode;
    }

    function measureWallThickness(hitPoint, faceNormal, targetMesh) {
      const entry = _toVector3(hitPoint);
      const nVec = _toVector3(faceNormal);
      if (!entry || !nVec || nVec.lengthSq() < 1e-12) return null;

      const normal = nVec.clone().normalize();
      const inwardDir = normal.clone().negate();
      const origin = entry.clone().addScaledVector(inwardDir, 1e-3);
      const meshes = _collectCandidateMeshes(targetMesh);
      if (meshes.length === 0) return null;

      let bestExitPoint = null;
      let bestDist = Infinity;
      let bestMesh = null;

      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        mesh.updateMatrixWorld(true);
        const bvh = _ensureGeometryBVH(mesh);

        if (bvh && typeof bvh.raycastFirst === 'function') {
          const invMat = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
          const localRay = new THREE.Ray(origin.clone(), inwardDir.clone()).applyMatrix4(invMat);
          localRay.direction.normalize();
          const hit = bvh.raycastFirst(localRay, THREE.DoubleSide);
          if (hit && hit.point) {
            const worldHit = hit.point.clone().applyMatrix4(mesh.matrixWorld);
            const thickness = entry.distanceTo(worldHit);
            if (thickness > 1e-3 && thickness < bestDist) {
              bestDist = thickness;
              bestExitPoint = worldHit;
              bestMesh = mesh;
            }
          }
        } else {
          const raycaster = new THREE.Raycaster(origin, inwardDir, 0, Infinity);
          const origSide = mesh.material ? mesh.material.side : THREE.FrontSide;
          if (mesh.material) mesh.material.side = THREE.DoubleSide;
          const hits = raycaster.intersectObject(mesh, false);
          if (mesh.material) mesh.material.side = origSide;
          if (hits && hits.length > 0) {
            const worldHit = hits[0].point.clone();
            const thickness = entry.distanceTo(worldHit);
            if (thickness > 1e-3 && thickness < bestDist) {
              bestDist = thickness;
              bestExitPoint = worldHit;
              bestMesh = mesh;
            }
          }
        }
      }

      if (!bestExitPoint || !isFinite(bestDist)) return null;

      const mg = _getMeasureGroup();
      const cam = _getCamera();
      if (mg && cam) {
        clearMeasurement(false);
        drawPointPin(entry, 0xf59e0b);
        drawPointPin(bestExitPoint, 0xf59e0b);
        drawCADDimensionLine(entry, bestExitPoint, bestDist, `Wall: ${_formatDim(bestDist)}`);
      }

      const valueText = `Wall: ${_formatDim(bestDist)}`;
      if (typeof currentMeasuredValue !== 'undefined') currentMeasuredValue = valueText;
      lastActiveMeasurement = {
        type: 'wall-thickness',
        title: '🧱 Wall Thickness',
        valueText,
        distanceMm: bestDist,
        points: [entry.clone(), bestExitPoint.clone()],
        anchorPoint: entry.clone().add(bestExitPoint).multiplyScalar(0.5),
        color: 0xf59e0b
      };

      if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
        const card = document.getElementById('measure-card');
        const titleEl = document.getElementById('measure-card-title');
        const distEl = document.getElementById('measure-dist');
        const deltasEl = document.getElementById('measure-deltas');
        const extraEl = document.getElementById('measure-extra');
        if (card) card.style.display = 'flex';
        if (titleEl) titleEl.innerText = '🧱 Wall Thickness';
        if (distEl) distEl.innerText = _formatDim(bestDist);
        if (deltasEl) deltasEl.innerText = `Inward normal raycast across ${bestMesh && bestMesh.name ? bestMesh.name : 'body'}`;
        if (extraEl) extraEl.style.display = 'none';
      }

      return {
        thicknessMm: bestDist,
        entryPoint: entry.clone(),
        exitPoint: bestExitPoint.clone(),
        normal,
        mesh: bestMesh
      };
    }

    function toggleClearanceMode(enable) {
      isClearanceMode = (enable !== undefined) ? !!enable : !isClearanceMode;
      clearanceSelectedMeshes = [];
      if (isClearanceMode) {
        isWallThicknessMode = false;
        if (typeof isMeasureActive !== 'undefined' && !isMeasureActive) {
          toggleMeasureMode(true);
        }
      }
      if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
        const btnClear = document.getElementById('btn-measure-clearance');
        const btnWall = document.getElementById('btn-measure-wall');
        if (btnClear) btnClear.classList.toggle('active', isClearanceMode);
        if (btnWall) btnWall.classList.toggle('active', isWallThicknessMode);
        const titleEl = document.getElementById('measure-card-title');
        const distEl = document.getElementById('measure-dist');
        if (isClearanceMode && titleEl) titleEl.innerText = '↔️ Min Body Clearance';
        if (isClearanceMode && distEl) distEl.innerText = 'Click 1st body/mesh';
      }
      return isClearanceMode;
    }

    function _sampleWorldVertices(mesh, maxSamples = 2500) {
      const pos = mesh.geometry && mesh.geometry.attributes ? mesh.geometry.attributes.position : null;
      if (!pos || pos.count === 0) return [];
      const stride = Math.max(1, Math.floor(pos.count / maxSamples));
      const pts = [];
      const seen = new Set();
      for (let i = 0; i < pos.count; i += stride) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const k = `${Math.round(v.x * 1e3)}_${Math.round(v.y * 1e3)}_${Math.round(v.z * 1e3)}`;
        if (!seen.has(k)) {
          seen.add(k);
          pts.push(v);
        }
      }
      return pts;
    }

    function measureMinClearance(meshA, meshB) {
      if (!meshA || !meshB || !meshA.geometry || !meshB.geometry) return null;
      meshA.updateMatrixWorld(true);
      meshB.updateMatrixWorld(true);

      const bvhA = _ensureGeometryBVH(meshA);
      const bvhB = _ensureGeometryBVH(meshB);

      let bestDist = Infinity;
      let bestPointA = null;
      let bestPointB = null;

      if (bvhA && bvhB && typeof bvhA.intersectsGeometry === 'function') {
        const matAtoB = new THREE.Matrix4().copy(meshA.matrixWorld).invert().multiply(meshB.matrixWorld);
        if (bvhA.intersectsGeometry(meshB.geometry, matAtoB)) {
          const vertsA = _sampleWorldVertices(meshA, 64);
          const pt = vertsA[0] || new THREE.Vector3().setFromMatrixPosition(meshA.matrixWorld);
          bestDist = 0;
          bestPointA = pt.clone();
          bestPointB = pt.clone();
        }
      }

      if (bestDist > 0 && bvhA && bvhB && typeof bvhA.closestPointToPoint === 'function') {
        const invA = new THREE.Matrix4().copy(meshA.matrixWorld).invert();
        const invB = new THREE.Matrix4().copy(meshB.matrixWorld).invert();
        const target = { point: new THREE.Vector3(), distance: Infinity, faceIndex: -1 };

        const vertsA = _sampleWorldVertices(meshA, 2500);
        for (let i = 0; i < vertsA.length; i++) {
          const localAInB = vertsA[i].clone().applyMatrix4(invB);
          const cp = bvhB.closestPointToPoint(localAInB, target);
          if (cp && cp.point) {
            const worldB = cp.point.clone().applyMatrix4(meshB.matrixWorld);
            const d = vertsA[i].distanceTo(worldB);
            if (d < bestDist) {
              bestDist = d;
              bestPointA = vertsA[i].clone();
              bestPointB = worldB;
            }
          }
        }

        const vertsB = _sampleWorldVertices(meshB, 2500);
        for (let i = 0; i < vertsB.length; i++) {
          const localBInA = vertsB[i].clone().applyMatrix4(invA);
          const cp = bvhA.closestPointToPoint(localBInA, target);
          if (cp && cp.point) {
            const worldA = cp.point.clone().applyMatrix4(meshA.matrixWorld);
            const d = worldA.distanceTo(vertsB[i]);
            if (d < bestDist) {
              bestDist = d;
              bestPointA = worldA;
              bestPointB = vertsB[i].clone();
            }
          }
        }

        // Alternating projection refinement for curved/edge-to-edge precision
        if (bestPointA && bestPointB) {
          for (let iter = 0; iter < 4; iter++) {
            const cpB = bvhB.closestPointToPoint(bestPointA.clone().applyMatrix4(invB), target);
            if (cpB && cpB.point) bestPointB = cpB.point.clone().applyMatrix4(meshB.matrixWorld);
            const cpA = bvhA.closestPointToPoint(bestPointB.clone().applyMatrix4(invA), target);
            if (cpA && cpA.point) bestPointA = cpA.point.clone().applyMatrix4(meshA.matrixWorld);
            bestDist = bestPointA.distanceTo(bestPointB);
          }
        }
      } else if (bestDist > 0) {
        // Brute-force fallback when BVH is unavailable
        const vertsA = _sampleWorldVertices(meshA, 800);
        const vertsB = _sampleWorldVertices(meshB, 800);
        for (let i = 0; i < vertsA.length; i++) {
          for (let j = 0; j < vertsB.length; j++) {
            const d = vertsA[i].distanceTo(vertsB[j]);
            if (d < bestDist) {
              bestDist = d;
              bestPointA = vertsA[i].clone();
              bestPointB = vertsB[j].clone();
            }
          }
        }
      }

      if (!bestPointA || !bestPointB || !isFinite(bestDist)) return null;

      const mg = _getMeasureGroup();
      const cam = _getCamera();
      if (mg) {
        clearMeasurement(false);
        if (cam) {
          drawPointPin(bestPointA, 0x34d399);
          drawPointPin(bestPointB, 0x34d399);
        }
        const geom = new THREE.BufferGeometry().setFromPoints([bestPointA, bestPointB]);
        const mat = new THREE.LineDashedMaterial({
          color: 0x34d399,
          dashSize: Math.max(_getModelDistance() * 0.02, 0.8),
          gapSize: Math.max(_getModelDistance() * 0.012, 0.4),
          linewidth: 2,
          depthTest: false
        });
        const clearanceLine = new THREE.Line(geom, mat);
        if (typeof clearanceLine.computeLineDistances === 'function') clearanceLine.computeLineDistances();
        clearanceLine.renderOrder = 999;
        clearanceLine.name = 'measure_element';
        mg.add(clearanceLine);

        const sprite = _createSafeTextSprite(`Clearance: ${_formatDim(bestDist)}`);
        if (sprite) {
          sprite.position.copy(bestPointA).add(bestPointB).multiplyScalar(0.5);
          sprite.renderOrder = 1001;
          sprite.name = 'measure_element';
          mg.add(sprite);
        }
      }

      const valueText = `Clearance: ${_formatDim(bestDist)}`;
      if (typeof currentMeasuredValue !== 'undefined') currentMeasuredValue = valueText;
      lastActiveMeasurement = {
        type: 'min-clearance',
        title: '↔️ Min Clearance',
        valueText,
        distanceMm: bestDist,
        points: [bestPointA.clone(), bestPointB.clone()],
        anchorPoint: bestPointA.clone().add(bestPointB).multiplyScalar(0.5),
        color: 0x34d399
      };

      if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
        const card = document.getElementById('measure-card');
        const titleEl = document.getElementById('measure-card-title');
        const distEl = document.getElementById('measure-dist');
        const deltasEl = document.getElementById('measure-deltas');
        const extraEl = document.getElementById('measure-extra');
        if (card) card.style.display = 'flex';
        if (titleEl) titleEl.innerText = '↔️ Min Body Clearance';
        if (distEl) distEl.innerText = _formatDim(bestDist);
        if (deltasEl) deltasEl.innerText = `${meshA.name || 'Body A'} ↔ ${meshB.name || 'Body B'}`;
        if (extraEl) extraEl.style.display = 'none';
      }

      return {
        distanceMm: bestDist,
        pointA: bestPointA,
        pointB: bestPointB
      };
    }

    function handleUnifiedClick(snap) {
      if (!snap) return;

      if (isWallThicknessMode && snap.point) {
        measureWallThickness(snap.point, snap.normal || new THREE.Vector3(0, 1, 0), snap.mesh || null);
        return;
      }

      if (isClearanceMode && snap.mesh) {
        if (clearanceSelectedMeshes.length === 0) {
          clearanceSelectedMeshes.push(snap.mesh);
          const distEl = document.getElementById('measure-dist');
          if (distEl) distEl.innerText = 'Click 2nd body/mesh';
          return;
        }
        if (snap.mesh !== clearanceSelectedMeshes[0]) {
          const mA = clearanceSelectedMeshes[0];
          clearanceSelectedMeshes = [];
          measureMinClearance(mA, snap.mesh);
        }
        return;
      }
      const card = document.getElementById('measure-card');
      const distEl = document.getElementById('measure-dist');
      const deltasEl = document.getElementById('measure-deltas');
      const extraEl = document.getElementById('measure-extra');
      const angleEl = document.getElementById('measure-angle');
      const titleEl = document.getElementById('measure-card-title');

      if (card) card.style.display = 'flex';

      if (selectedCadEntities.length === 0) {
        clearMeasurement(false);
        selectedCadEntities.push(snap);

        if (snap.type === 'line') {
          const feat = snap.feature;
          drawCADDimensionLine(feat.start, feat.end, feat.length);
          const dx = Math.abs(feat.end[0] - feat.start[0]);
          const dy = Math.abs(feat.end[1] - feat.start[1]);
          const dz = Math.abs(feat.end[2] - feat.start[2]);

          if (titleEl) titleEl.innerText = '📏 Straight Edge';
          if (distEl) distEl.innerText = formatDim(feat.length);
          if (deltasEl) deltasEl.innerHTML = `<span style="color:#e05656">ΔX:</span> ${formatCoord(dx)} &nbsp;<span style="color:#3eb86f">ΔY:</span> ${formatCoord(dy)} &nbsp;<span style="color:#4a9eed">ΔZ:</span> ${formatCoord(dz)}`;
          if (extraEl) {
            extraEl.innerHTML = '<span style="color:#38bdf8; font-weight:600;">👉 Click 2nd Point, Edge, or Hole for dual dimension</span>';
            extraEl.style.display = 'block';
          }
          if (angleEl) angleEl.style.display = 'none';
          currentMeasuredValue = formatDim(feat.length);
        } else if (isHoleEntity(snap)) {
          const hInfo = getHoleInfo(snap);
          drawPointPin(hInfo.center, 0x38bdf8);
          drawCADCircleAnnotation(hInfo.center, hInfo.radius, hInfo.diameter);
          if (snap.type === 'circle' && snap.feature) {
            drawCircleRing(snap.feature, 0x38bdf8);
          } else {
            draw3DCircleRing(hInfo.center, hInfo.axis, hInfo.radius, 0x38bdf8);
            drawCylinderAxisLine(hInfo.center, hInfo.axis, Math.max(hInfo.depth * 0.6, hInfo.radius * 1.5), 0x38bdf8);
          }

          const kind = hInfo.isHole ? '⭕ Cylindrical Hole' : '🔵 Cylindrical Shaft';
          const depthStr = hInfo.depth > 0 ? ` &nbsp;|&nbsp; Depth: <strong>${formatDim(hInfo.depth)}</strong>` : '';
          if (titleEl) titleEl.innerText = kind;
          if (distEl) distEl.innerText = `Ø ${formatDim(hInfo.diameter)}`;
          if (deltasEl) deltasEl.innerHTML = `Radius (R): <strong>${formatDim(hInfo.radius)}</strong>${depthStr}`;
          if (extraEl) {
            extraEl.innerHTML = `Center: (${formatCoord(hInfo.center.x)}, ${formatCoord(hInfo.center.y)}, ${formatCoord(hInfo.center.z)})<br><span style="color:#38bdf8; font-weight:600;">👉 Click 2nd Hole, Edge, or Face for dual dimension</span>`;
            extraEl.style.display = 'block';
          }
          if (angleEl) angleEl.style.display = 'none';
          currentMeasuredValue = `Ø ${formatDim(hInfo.diameter)} (R ${formatDim(hInfo.radius)})`;
        } else if (isPointTarget(snap) || isSurfaceTarget(snap)) {
          drawPointPin(snap.point, 0x38bdf8);

          if (isSurfaceTarget(snap)) {
            const n = snap.normal || new THREE.Vector3(0, 1, 0);
            let orient = '';
            if (Math.abs(n.z) > 0.85) orient = n.z > 0 ? 'Top (+Z)' : 'Bottom (-Z)';
            else if (Math.abs(n.y) > 0.85) orient = n.y > 0 ? 'Front (+Y)' : 'Back (-Y)';
            else if (Math.abs(n.x) > 0.85) orient = n.x > 0 ? 'Right (+X)' : 'Left (-X)';
            else orient = `[${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)}]`;

            const areaVal = snap.areaMm2 || 0;
            const areaStr = areaVal > 0.01 ? _formatArea(areaVal) : 'Solid Face';

            // Add prominent 3D text sprite directly above the face point
            const faceBadgeText = areaVal > 0.01 ? `Area: ${_formatArea(areaVal)}` : `Face (${orient})`;
            const faceSprite = createTextSprite(faceBadgeText);
            const vFovRad = THREE.MathUtils.degToRad(camera.fov);
            const distToCam = camera.position.distanceTo(snap.point);
            const worldPerPx = (2 * Math.tan(vFovRad / 2) * distToCam) / (window.innerHeight || 800);
            faceSprite.position.copy(snap.point).add(n.clone().multiplyScalar(worldPerPx * 26));
            faceSprite.renderOrder = 1000;
            faceSprite.name = 'measure_element';
            measureGroup.add(faceSprite);

            if (titleEl) titleEl.innerText = '🟦 Planar Face Selected';
            if (distEl) distEl.innerText = areaVal > 0.01 ? `Area: ${areaStr}` : `Planar Surface`;
            if (deltasEl) deltasEl.innerHTML = `<span style="color:#38bdf8">Orientation:</span> <strong>${orient}</strong> &nbsp;|&nbsp; <span style="color:#94a3b8">Center: (${formatCoord(snap.point.x)}, ${formatCoord(snap.point.y)}, ${formatCoord(snap.point.z)})</span>`;
            if (extraEl) {
              extraEl.innerHTML = '<span style="color:#38bdf8; font-weight:600;">👉 Select 2nd entity (Point, Edge, Hole, or Face) to measure distance or angle.</span>';
              extraEl.style.display = 'block';
            }
            if (angleEl) angleEl.style.display = 'none';
            currentMeasuredValue = `Face Area: ${areaStr} (Orientation: ${orient})`;
          } else {
            const sub = snap.subType === 'midpoint' ? 'Midpoint' : (snap.subType === 'center' ? 'Hole Center' : 'Point');
            if (titleEl) titleEl.innerText = `📍 ${sub} 1 Selected`;
            if (distEl) distEl.innerText = `(${formatCoord(snap.point.x)}, ${formatCoord(snap.point.y)}, ${formatCoord(snap.point.z)})`;
            if (deltasEl) deltasEl.innerHTML = '<span style="color:#38bdf8; font-weight:600;">👉 Click 2nd Point, Edge, or Hole to measure distance</span>';
            if (extraEl) extraEl.style.display = 'none';
            if (angleEl) angleEl.style.display = 'none';
            currentMeasuredValue = `(${formatCoord(snap.point.x)}, ${formatCoord(snap.point.y)}, ${formatCoord(snap.point.z)})`;
          }
        }
      } else if (selectedCadEntities.length === 1) {
        const e1 = selectedCadEntities[0];
        const e2 = snap;

        // Ignore clicking exact same point/feature
        if (isPointTarget(e1) && isPointTarget(e2) && e1.point && e2.point && e1.point.distanceTo(e2.point) < 0.001) {
          return;
        }

        clearMeasurement(false);

        // 1. Hole + Hole (Center-to-Center Pitch & Dual Hole analysis)
        if (isHoleEntity(e1) && isHoleEntity(e2)) {
          const h1 = getHoleInfo(e1);
          const h2 = getHoleInfo(e2);
          const c1 = h1.center;
          const c2 = h2.center;
          const cDist = c1.distanceTo(c2);

          // Highlight Hole 1
          drawPointPin(c1, 0x38bdf8);
          if (e1.type === 'circle' && e1.feature) drawCircleRing(e1.feature, 0x38bdf8);
          else draw3DCircleRing(c1, h1.axis, h1.radius, 0x38bdf8);

          // Highlight Hole 2
          drawPointPin(c2, 0x34d399);
          if (e2.type === 'circle' && e2.feature) drawCircleRing(e2.feature, 0x34d399);
          else draw3DCircleRing(c2, h2.axis, h2.radius, 0x34d399);

          const dx = Math.abs(c2.x - c1.x);
          const dy = Math.abs(c2.y - c1.y);
          const dz = Math.abs(c2.z - c1.z);

          // Check if top rim and bottom rim of the same through-hole
          const axisDot = Math.abs(h1.axis.dot(h2.axis));
          const diffVec = c2.clone().sub(c1);
          const axialOffset = Math.abs(diffVec.dot(h1.axis));
          const radialOffset = diffVec.clone().sub(h1.axis.clone().multiplyScalar(diffVec.dot(h1.axis))).length();

          if (axisDot > 0.95 && radialOffset < 0.15 && Math.abs(h1.radius - h2.radius) < 0.15 && axialOffset > 0.1) {
            drawCADDimensionLine(c1, c2, axialOffset, `Depth: ${formatDim(axialOffset)}`);
            if (titleEl) titleEl.innerText = '⭕ Through-Hole Depth & Diameter';
            if (distEl) distEl.innerText = `Depth: ${formatDim(axialOffset)}`;
            if (deltasEl) deltasEl.innerHTML = `Diameter: <strong>Ø ${formatDim(h1.diameter)}</strong> &nbsp;|&nbsp; Radius: <strong>${formatDim(h1.radius)}</strong>`;
            if (extraEl) {
              extraEl.innerHTML = `THRU Hole verified: Top rim to Bottom rim`;
              extraEl.style.display = 'block';
            }
            if (angleEl) angleEl.style.display = 'none';
            currentMeasuredValue = `Depth: ${formatDim(axialOffset)} (Ø ${formatDim(h1.diameter)})`;
          } else {
            const minDist = Math.max(0, cDist - h1.radius - h2.radius);
            const maxDist = cDist + h1.radius + h2.radius;

            drawCADDimensionLine(c1, c2, cDist, `Pitch: ${formatDim(cDist)}`);

            let parallelNote = '';
            if (axisDot > 0.96 && dz > 0.05) {
              const planarPitch = Math.hypot(dx, dy);
              parallelNote = ` &nbsp;|&nbsp; Planar Pitch (X-Y): <strong>${formatDim(planarPitch)}</strong>`;
            }

            if (titleEl) titleEl.innerText = '⭕ Center-to-Center Holes (Pitch)';
            if (distEl) distEl.innerText = `Pitch: ${formatDim(cDist)}`;
            if (deltasEl) deltasEl.innerHTML = `<span style="color:#e05656">ΔX:</span> ${formatCoord(dx)} &nbsp;<span style="color:#3eb86f">ΔY:</span> ${formatCoord(dy)} &nbsp;<span style="color:#4a9eed">ΔZ:</span> ${formatCoord(dz)}`;
            if (extraEl) {
              extraEl.innerHTML = `<strong>Min Gap:</strong> ${formatDim(minDist)} &nbsp;|&nbsp; <strong>Max Gap:</strong> ${formatDim(maxDist)}${parallelNote}<br><span style="color:#94a3b8">Hole 1: Ø ${formatDim(h1.diameter)} &nbsp;|&nbsp; Hole 2: Ø ${formatDim(h2.diameter)}</span>`;
              extraEl.style.display = 'block';
            }
            if (angleEl) angleEl.style.display = 'none';
            currentMeasuredValue = `Pitch: ${formatDim(cDist)} (Min: ${formatDim(minDist)}, Max: ${formatDim(maxDist)})`;
          }
        }
        // 2. Hole + Surface (or Surface + Hole)
        else if ((isHoleEntity(e1) && isSurfaceTarget(e2)) || (isSurfaceTarget(e1) && isHoleEntity(e2))) {
          const hEnt = isHoleEntity(e1) ? e1 : e2;
          const sEnt = isHoleEntity(e1) ? e2 : e1;
          const hInfo = getHoleInfo(hEnt);
          const c = hInfo.center;
          const sPt = sEnt.point;
          const n = sEnt.normal.clone().normalize();

          const diff = c.clone().sub(sPt);
          const perpDist = Math.abs(diff.dot(n));
          const proj = c.clone().sub(n.clone().multiplyScalar(diff.dot(n)));

          drawPointPin(sPt, 0x38bdf8);
          drawPointPin(c, 0x34d399);
          if (hEnt.type === 'circle' && hEnt.feature) drawCircleRing(hEnt.feature, 0x34d399);
          else draw3DCircleRing(c, hInfo.axis, hInfo.radius, 0x34d399);

          drawCADDimensionLine(proj, c, perpDist, `Normal: ${formatDim(perpDist)}`);

          if (titleEl) titleEl.innerText = '📏 Hole Center to Face';
          if (distEl) distEl.innerText = `Distance: ${formatDim(perpDist)}`;
          if (deltasEl) deltasEl.innerHTML = `Perpendicular distance from Hole (Ø ${formatDim(hInfo.diameter)}) to Face`;
          if (extraEl) {
            extraEl.innerHTML = `Surface Normal: [${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)}]`;
            extraEl.style.display = 'block';
          }
          if (angleEl) angleEl.style.display = 'none';
          currentMeasuredValue = `Hole to Face: ${formatDim(perpDist)}`;
        }
        // 3. Hole + Line (or Line + Hole)
        else if ((isHoleEntity(e1) && e2.type === 'line') || (e1.type === 'line' && isHoleEntity(e2))) {
          const hEnt = isHoleEntity(e1) ? e1 : e2;
          const lEnt = isHoleEntity(e1) ? e2 : e1;
          const hInfo = getHoleInfo(hEnt);
          const c = hInfo.center;
          const s = new THREE.Vector3(...lEnt.feature.start);
          const dir = new THREE.Vector3(...lEnt.feature.end).sub(s).normalize();
          const v = c.clone().sub(s);
          const proj = s.clone().add(dir.clone().multiplyScalar(v.dot(dir)));
          const distToLine = c.distanceTo(proj);

          drawPointPin(c, 0x34d399);
          if (hEnt.type === 'circle' && hEnt.feature) drawCircleRing(hEnt.feature, 0x34d399);
          else draw3DCircleRing(c, hInfo.axis, hInfo.radius, 0x34d399);

          const lineGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...lEnt.feature.start),
            new THREE.Vector3(...lEnt.feature.end)
          ]);
          const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2, depthTest: false });
          const lineMesh = new THREE.Line(lineGeom, lineMat);
          lineMesh.renderOrder = 997;
          lineMesh.name = 'measure_element';
          measureGroup.add(lineMesh);

          drawCADDimensionLine(proj, c, distToLine, `Dist: ${formatDim(distToLine)}`);

          if (titleEl) titleEl.innerText = '📏 Hole Center to Edge';
          if (distEl) distEl.innerText = formatDim(distToLine);
          if (deltasEl) deltasEl.innerText = `Perpendicular distance from Hole (Ø ${formatDim(hInfo.diameter)}) to Edge`;
          if (extraEl) extraEl.style.display = 'none';
          if (angleEl) angleEl.style.display = 'none';
          currentMeasuredValue = formatDim(distToLine);
        }
        // 4. Hole + Pure Point (or Pure Point + Hole)
        else if ((isHoleEntity(e1) && isPurePointTarget(e2)) || (isPurePointTarget(e1) && isHoleEntity(e2))) {
          const hEnt = isHoleEntity(e1) ? e1 : e2;
          const pEnt = isHoleEntity(e1) ? e2 : e1;
          const hInfo = getHoleInfo(hEnt);
          const c = hInfo.center;
          const pt = pEnt.point;
          const cDist = pt.distanceTo(c);
          const minDist = Math.max(0, cDist - hInfo.radius);
          const maxDist = cDist + hInfo.radius;

          drawPointPin(pt, 0x38bdf8);
          drawPointPin(c, 0x34d399);
          if (hEnt.type === 'circle' && hEnt.feature) drawCircleRing(hEnt.feature, 0x34d399);
          else draw3DCircleRing(c, hInfo.axis, hInfo.radius, 0x34d399);

          drawCADDimensionLine(pt, c, cDist, `Dist: ${formatDim(cDist)}`);

          if (titleEl) titleEl.innerText = '⭕ Point to Hole Distance';
          if (distEl) distEl.innerText = `${formatDim(cDist)} (Center)`;
          if (deltasEl) deltasEl.innerHTML = `Min: <strong>${formatDim(minDist)}</strong> &nbsp;|&nbsp; Max: <strong>${formatDim(maxDist)}</strong>`;
          if (extraEl) {
            extraEl.innerHTML = `Hole Diameter: Ø ${formatDim(hInfo.diameter)} (R ${formatDim(hInfo.radius)})`;
            extraEl.style.display = 'block';
          }
          if (angleEl) angleEl.style.display = 'none';
          currentMeasuredValue = `${formatDim(cDist)} (Min: ${formatDim(minDist)}, Max: ${formatDim(maxDist)})`;
        }
        // Permutation: Surface + Surface
        else if (isSurfaceTarget(e1) && isSurfaceTarget(e2)) {
          const n1 = e1.normal.clone().normalize();
          const n2 = e2.normal.clone().normalize();
          const dot = Math.abs(n1.dot(n2));

          drawPointPin(e1.point, 0x38bdf8);
          drawPointPin(e2.point, 0x34d399);

          if (dot > 0.96) {
            // Parallel faces: thickness / gap
            const diff = e2.point.clone().sub(e1.point);
            const gap = Math.abs(diff.dot(n1));
            const proj2 = e2.point.clone().sub(n1.clone().multiplyScalar(diff.dot(n1)));
            drawCADDimensionLine(e1.point, proj2, gap, `Gap: ${formatDim(gap)}`);

            if (titleEl) titleEl.innerText = '📏 Parallel Faces Distance';
            if (distEl) distEl.innerText = `Thickness / Gap: ${formatDim(gap)}`;
            if (deltasEl) deltasEl.innerHTML = `Parallel Planes (Normal Match: ${(dot * 100).toFixed(1)}%)`;
            if (extraEl) extraEl.style.display = 'none';
            if (angleEl) angleEl.style.display = 'none';
            currentMeasuredValue = `Thickness / Gap: ${formatDim(gap)}`;
          } else {
            // Non-parallel faces: angle
            const clamped = Math.max(-1, Math.min(1, n1.dot(n2)));
            const rad = Math.acos(clamped);
            const deg = (rad * 180) / Math.PI;

            // Draw 3D dimension line & badge for angle between face points
            drawCADDimensionLine(e1.point, e2.point, 0, `∠ ${deg.toFixed(1)}°`);

            if (titleEl) titleEl.innerText = '📐 Face-to-Face Angle';
            if (distEl) distEl.innerText = `Angle: ${deg.toFixed(1)}° (${(180 - deg).toFixed(1)}° suppl)`;
            if (deltasEl) deltasEl.innerHTML = `Normal 1: [${n1.x.toFixed(2)}, ${n1.y.toFixed(2)}, ${n1.z.toFixed(2)}]<br>Normal 2: [${n2.x.toFixed(2)}, ${n2.y.toFixed(2)}, ${n2.z.toFixed(2)}]`;
            if (extraEl) extraEl.style.display = 'none';
            if (angleEl) angleEl.style.display = 'none';
            currentMeasuredValue = `Angle: ${deg.toFixed(1)}°`;
          }
        }
        // Permutation: Surface + Point (or Point + Surface)
        else if ((isSurfaceTarget(e1) && isPurePointTarget(e2)) || (isPurePointTarget(e1) && isSurfaceTarget(e2))) {
          const sEnt = isSurfaceTarget(e1) ? e1 : e2;
          const pEnt = isSurfaceTarget(e1) ? e2 : e1;
          const pt = pEnt.point;
          const sPt = sEnt.point;
          const n = sEnt.normal.clone().normalize();
          
          const diff = pt.clone().sub(sPt);
          const perpDist = Math.abs(diff.dot(n));
          const euclidDist = pt.distanceTo(sPt);
          const projPt = pt.clone().sub(n.clone().multiplyScalar(diff.dot(n)));

          drawPointPin(sPt, 0x38bdf8);
          drawPointPin(pt, 0x34d399);
          drawPointPin(projPt, 0xf59e0b);
          drawCADDimensionLine(projPt, pt, perpDist, `Normal: ${formatDim(perpDist)}`);

          if (titleEl) titleEl.innerText = '📐 Point to Face Measurement';
          if (distEl) distEl.innerText = `Perpendicular: ${formatDim(perpDist)}`;
          if (deltasEl) deltasEl.innerHTML = `Direct 3D Distance: <strong>${formatDim(euclidDist)}</strong>`;
          if (extraEl) {
            extraEl.innerHTML = `Surface Normal: [${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)}]`;
            extraEl.style.display = 'block';
          }
          if (angleEl) angleEl.style.display = 'none';
          currentMeasuredValue = `Perpendicular: ${formatDim(perpDist)} (Direct: ${formatDim(euclidDist)})`;
        }
        // Permutation: Surface + Line (or Line + Surface)
        else if ((isSurfaceTarget(e1) && e2.type === 'line') || (e1.type === 'line' && isSurfaceTarget(e2))) {
          const sEnt = isSurfaceTarget(e1) ? e1 : e2;
          const lEnt = isSurfaceTarget(e1) ? e2 : e1;
          const sPt = sEnt.point;
          const n = sEnt.normal.clone().normalize();
          const start = new THREE.Vector3(...lEnt.feature.start);
          const end = new THREE.Vector3(...lEnt.feature.end);
          const midEdge = start.clone().add(end).multiplyScalar(0.5);
          
          const diff = midEdge.clone().sub(sPt);
          const perpDist = Math.abs(diff.dot(n));
          const projEdgeMid = midEdge.clone().sub(n.clone().multiplyScalar(diff.dot(n)));

          drawPointPin(sPt, 0x38bdf8);
          drawPointPin(midEdge, 0x34d399);
          drawCADDimensionLine(projEdgeMid, midEdge, perpDist, `Normal: ${formatDim(perpDist)}`);

          if (titleEl) titleEl.innerText = '📏 Edge to Face Distance';
          if (distEl) distEl.innerText = `Distance: ${formatDim(perpDist)}`;
          if (deltasEl) deltasEl.innerHTML = `Perpendicular distance from Edge to Planar Face`;
          if (extraEl) extraEl.style.display = 'none';
          if (angleEl) angleEl.style.display = 'none';
          currentMeasuredValue = `Edge to Face: ${formatDim(perpDist)}`;
        }
        // Permutation: Pure Point + Pure Point
        else if (isPurePointTarget(e1) && isPurePointTarget(e2)) {
          const p1 = e1.point;
          const p2 = e2.point;
          const dist = p1.distanceTo(p2);
          const dx = Math.abs(p2.x - p1.x);
          const dy = Math.abs(p2.y - p1.y);
          const dz = Math.abs(p2.z - p1.z);

          drawPointPin(p1, 0x38bdf8);
          drawPointPin(p2, 0x34d399);
          drawCADDimensionLine(p1, p2, dist);

          if (titleEl) titleEl.innerText = '📐 Point-to-Point Distance';
          if (distEl) distEl.innerText = formatDim(dist);
          if (deltasEl) deltasEl.innerHTML = `<span style="color:#e05656">ΔX:</span> ${formatCoord(dx)} &nbsp;<span style="color:#3eb86f">ΔY:</span> ${formatCoord(dy)} &nbsp;<span style="color:#4a9eed">ΔZ:</span> ${formatCoord(dz)}`;
          if (extraEl) extraEl.style.display = 'none';
          if (angleEl) angleEl.style.display = 'none';
          currentMeasuredValue = `${formatDim(dist)} (ΔX: ${formatCoord(dx)}, ΔY: ${formatCoord(dy)}, ΔZ: ${formatCoord(dz)})`;
        }
        // Permutation: Pure Point + Line (or Line + Pure Point)
        else if ((isPurePointTarget(e1) && e2.type === 'line') || (e1.type === 'line' && isPurePointTarget(e2))) {
          const pEnt = isPurePointTarget(e1) ? e1 : e2;
          const lEnt = e1.type === 'line' ? e1 : e2;
          const pt = pEnt.point;
          const s = new THREE.Vector3(...lEnt.feature.start);
          const dir = new THREE.Vector3(...lEnt.feature.end).sub(s).normalize();
          const v = pt.clone().sub(s);
          const proj = s.clone().add(dir.clone().multiplyScalar(v.dot(dir)));
          const distToLine = pt.distanceTo(proj);

          drawPointPin(pt, 0x38bdf8);
          const geom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...lEnt.feature.start),
            new THREE.Vector3(...lEnt.feature.end)
          ]);
          const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2, depthTest: false });
          const lineMesh = new THREE.Line(geom, lineMat);
          lineMesh.renderOrder = 997;
          lineMesh.name = 'measure_element';
          measureGroup.add(lineMesh);

          drawCADDimensionLine(proj, pt, distToLine, `Dist: ${formatDim(distToLine)}`);

          if (titleEl) titleEl.innerText = '📏 Point to Edge Distance';
          if (distEl) distEl.innerText = formatDim(distToLine);
          if (deltasEl) deltasEl.innerText = 'Perpendicular (Normal) distance from Point to Edge';
          if (extraEl) extraEl.style.display = 'none';
          if (angleEl) angleEl.style.display = 'none';
          currentMeasuredValue = formatDim(distToLine);
        }
        // Permutation: Line + Line
        else if (e1.type === 'line' && e2.type === 'line') {
          const f1 = e1.feature;
          const f2 = e2.feature;
          const d1 = new THREE.Vector3(f1.end[0] - f1.start[0], f1.end[1] - f1.start[1], f1.end[2] - f1.start[2]).normalize();
          const d2 = new THREE.Vector3(f2.end[0] - f2.start[0], f2.end[1] - f2.start[1], f2.end[2] - f2.start[2]).normalize();
          const dot = Math.abs(d1.dot(d2));

          [f1, f2].forEach(lf => {
            const geom = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(...lf.start),
              new THREE.Vector3(...lf.end)
            ]);
            const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2, depthTest: false });
            const line = new THREE.Line(geom, mat);
            line.renderOrder = 997;
            line.name = 'measure_element';
            measureGroup.add(line);
          });

          if (dot > 0.98) {
            const p1 = new THREE.Vector3(...f1.start);
            const p2 = new THREE.Vector3(...f2.start);
            const v = p2.clone().sub(p1);
            const perp = v.clone().sub(d1.clone().multiplyScalar(v.dot(d1)));
            const normalDist = perp.length();

            const perpStart = p1.clone().add(d1.clone().multiplyScalar(v.dot(d1) * 0.5));
            const perpEnd = perpStart.clone().add(perp);
            drawCADDimensionLine(perpStart, perpEnd, normalDist, `Dist: ${formatDim(normalDist)}`);

            if (titleEl) titleEl.innerText = '📏 Parallel Edges Distance';
            if (distEl) distEl.innerText = formatDim(normalDist);
            if (deltasEl) deltasEl.innerText = 'Perpendicular (Normal) distance between parallel edges';
            if (extraEl) extraEl.style.display = 'none';
            if (angleEl) angleEl.style.display = 'none';
            currentMeasuredValue = formatDim(normalDist);
          } else {
            const angleRad = Math.acos(Math.min(1, Math.max(-1, d1.dot(d2))));
            const angleDeg = angleRad * (180 / Math.PI);

            const mid1 = new THREE.Vector3(...f1.start).add(new THREE.Vector3(...f1.end)).multiplyScalar(0.5);
            const mid2 = new THREE.Vector3(...f2.start).add(new THREE.Vector3(...f2.end)).multiplyScalar(0.5);
            drawCADDimensionLine(mid1, mid2, 0, `∠ ${angleDeg.toFixed(1)}°`);

            if (titleEl) titleEl.innerText = '📐 Angle Between Edges';
            if (distEl) distEl.innerText = `${angleDeg.toFixed(1)}°`;
            if (deltasEl) deltasEl.innerText = `Supplementary Angle: ${(180 - angleDeg).toFixed(1)}°`;
            if (extraEl) extraEl.style.display = 'none';
            if (angleEl) angleEl.style.display = 'none';
            currentMeasuredValue = `${angleDeg.toFixed(1)}°`;
          }
        }

        if (currentMeasuredValue) {
          const p1 = getEntityOriginPoint(e1) || (e1 && e1.point ? e1.point.clone() : null);
          const p2 = getEntityOriginPoint(e2) || (e2 && e2.point ? e2.point.clone() : null);
          const pts = [p1, p2].filter(Boolean);
          const anchor = pts.length === 2
            ? pts[0].clone().add(pts[1]).multiplyScalar(0.5)
            : (pts[0] ? pts[0].clone() : new THREE.Vector3());
          lastActiveMeasurement = {
            type: 'distance',
            title: titleEl ? titleEl.innerText : 'Measurement',
            valueText: currentMeasuredValue,
            distanceMm: pts.length === 2 ? pts[0].distanceTo(pts[1]) : null,
            points: pts,
            anchorPoint: anchor
          };
        }

        selectedCadEntities = [];
      } else if (currentMeasuredValue) {
        const p1 = getEntityOriginPoint(snap) || (snap && snap.point ? snap.point.clone() : null);
        lastActiveMeasurement = {
          type: snap.type || 'single',
          title: titleEl ? titleEl.innerText : 'Measurement',
          valueText: currentMeasuredValue,
          distanceMm: (snap.type === 'line' && snap.feature) ? snap.feature.length : null,
          points: p1 ? [p1] : [],
          anchorPoint: p1 ? p1.clone() : new THREE.Vector3()
        };
      }
    }

    /**
     * TSK-09: Clear currently active measurement markers and dimensions from the screen
     * without exiting measure mode, preserving continuous multi-measurement workflows.
     * 
     * @param {boolean} [showNotification=true] Whether to display a toast notification
     */
    function clearActiveMeasurement(showNotification = true) {
      // 1. Reset selection state and measurement tracking
      measurePoints = [];
      selectedFeatures = [];
      selectedCadEntities = [];
      clearanceSelectedMeshes = [];
      lastActiveMeasurement = null;
      currentHoverFeature = null;
      currentHoverTarget = null;
      currentMeasuredValue = '';

      // 2. Hide transient hover indicators and tooltip
      if (typeof hoverEdgeMesh !== 'undefined' && hoverEdgeMesh) hoverEdgeMesh.visible = false;
      if (typeof snapIndicator !== 'undefined' && snapIndicator) snapIndicator.visible = false;
      removeRubberband();

      const tooltip = document.getElementById('measure-tooltip');
      if (tooltip) tooltip.style.display = 'none';

      // 3. Purge dynamic 3D measurement objects from measureGroup while preserving static helpers & pinned measurements
      const toRemove = [];
      measureGroup.children.forEach(child => {
        const isSnap = (typeof snapIndicator !== 'undefined' && child === snapIndicator);
        const isHover = (typeof hoverEdgeMesh !== 'undefined' && child === hoverEdgeMesh);
        const isPinned = (typeof pinnedMeasureGroup !== 'undefined' && child === pinnedMeasureGroup);
        if (!isSnap && !isHover && !isPinned) {
          toRemove.push(child);
        }
      });

      toRemove.forEach(child => {
        measureGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          } else {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }
      });

      // 4. Reset DOM measurement card text to initial prompt state
      const card = document.getElementById('measure-card');
      const distEl = document.getElementById('measure-dist');
      const deltasEl = document.getElementById('measure-deltas');
      const extraEl = document.getElementById('measure-extra');
      const angleEl = document.getElementById('measure-angle');
      const titleEl = document.getElementById('measure-card-title');

      if (card) card.style.display = 'flex';
      if (titleEl) titleEl.innerText = '📐 Smart Measure';
      if (distEl) distEl.innerText = 'Select Point, Edge, or Hole';
      if (deltasEl) deltasEl.innerText = 'Hover over corners, midpoints, edges, or holes';
      if (extraEl) {
        extraEl.style.display = 'none';
        extraEl.innerHTML = '';
      }
      if (angleEl) angleEl.style.display = 'none';

      // 5. Strictly enforce continuous measurement invariants
      isMeasureActive = true;
      const btn = document.getElementById('btn-measure');
      if (btn) btn.classList.add('active');

      const container = document.getElementById('canvas-container');
      if (container) container.style.cursor = 'crosshair';

      const hintClear = document.getElementById('hint-measure-clear');
      if (hintClear) hintClear.style.display = 'inline';

      // 6. User notification
      if (showNotification && typeof showToast === 'function') {
        showToast('Measurement cleared — click to measure again');
      }
    }

    function clearMeasurement(closeCard = true) {
      clearActiveMeasurement(false);
      if (closeCard) {
        const card = document.getElementById('measure-card');
        if (card) card.style.display = 'none';
      }
    }

    function toggleMeasureMode(enable) {
      isMeasureActive = (enable !== undefined) ? enable : !isMeasureActive;
      const btn = document.getElementById('btn-measure');
      const card = document.getElementById('measure-card');
      const container = document.getElementById('canvas-container');
      const tooltip = document.getElementById('measure-tooltip');
      const hintClear = document.getElementById('hint-measure-clear');

      if (isMeasureActive) {
        if (btn) btn.classList.add('active');
        if (card) card.style.display = 'flex';
        if (container) container.style.cursor = 'crosshair';
        if (hintClear) hintClear.style.display = 'inline';
        clearActiveMeasurement(false);
      } else {
        if (btn) btn.classList.remove('active');
        if (card) card.style.display = 'none';
        if (tooltip) tooltip.style.display = 'none';
        if (container) container.style.cursor = 'default';
        if (hintClear) hintClear.style.display = 'none';
        clearMeasurement(true);
      }
    }

    // 4. Toolbar Controls & Interactive Features
    function setupToolbar() {
      // Toggle SolidWorks Shaded Edges
      const btnEdges = document.getElementById('btn-edges');
      if (btnEdges) {
        btnEdges.addEventListener('click', () => {
          isEdgesActive = !isEdgesActive;
          btnEdges.classList.toggle('active', isEdgesActive);
          modelGroup.traverse((child) => {
            if (child.name === 'solidworks_edges') {
              child.visible = isEdgesActive && !isWireframeActive;
            }
          });
        });
      }

      // Wireframe Mode
      const btnWireframe = document.getElementById('btn-wireframe');
      btnWireframe.addEventListener('click', () => {
        isWireframeActive = !isWireframeActive;
        btnWireframe.classList.toggle('active', isWireframeActive);
        modelGroup.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.wireframe = isWireframeActive;
          }
          if (child.name === 'solidworks_edges') {
            child.visible = isEdgesActive && !isWireframeActive;
          }
        });
      });

      // Auto-Rotation
      const btnAutoRotate = document.getElementById('btn-autorotate');
      btnAutoRotate.addEventListener('click', () => {
        isAutoRotateActive = !isAutoRotateActive;
        btnAutoRotate.classList.toggle('active', isAutoRotateActive);
      });

      function setBtnLabel(id, text) {
        const btn = document.getElementById(id);
        if (!btn) return;
        const span = btn.querySelector('span');
        if (span) span.innerText = text;
        else btn.innerText = text;
      }

      // Standard CAD View Orientations & Flip to Opposite View
      const viewStates = {
        'btn-view-iso': 0,   // 0: Iso (Front), 1: Iso 2 (Back)
        'btn-view-top': 0,   // 0: Top, 1: Bottom
        'btn-view-front': 0, // 0: Front, 1: Back
        'btn-view-right': 0  // 0: Right, 1: Left
      };

      const viewActions = {
        'btn-view-iso': (flip) => {
          if (flip) viewStates['btn-view-iso'] = 1 - viewStates['btn-view-iso'];
          const isIso2 = viewStates['btn-view-iso'] === 1;
          const factorX = isIso2 ? -1 : 1;
          const factorZ = isIso2 ? -1 : 1;
          const dir = new THREE.Vector3(factorX, 0.85, factorZ).normalize();
          const targetPos = currentModelCenter.clone().add(dir.multiplyScalar(currentModelDistance));
          setBtnLabel('btn-view-iso', isIso2 ? 'Iso 2' : 'Iso');
          tweenCamera(targetPos, currentModelCenter, new THREE.Vector3(0, 1, 0));
        },
        'btn-view-top': (flip) => {
          if (flip) viewStates['btn-view-top'] = 1 - viewStates['btn-view-top'];
          const isBottom = viewStates['btn-view-top'] === 1;
          const factorY = isBottom ? -1 : 1;
          const targetPos = currentModelCenter.clone().add(new THREE.Vector3(0, factorY, 0).multiplyScalar(currentModelDistance));
          const upVec = isBottom ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1);
          setBtnLabel('btn-view-top', isBottom ? 'Btm' : 'Top');
          tweenCamera(targetPos, currentModelCenter, upVec);
        },
        'btn-view-front': (flip) => {
          if (flip) viewStates['btn-view-front'] = 1 - viewStates['btn-view-front'];
          const isBack = viewStates['btn-view-front'] === 1;
          const factorZ = isBack ? -1 : 1;
          const targetPos = currentModelCenter.clone().add(new THREE.Vector3(0, 0, factorZ).multiplyScalar(currentModelDistance));
          setBtnLabel('btn-view-front', isBack ? 'Back' : 'Front');
          tweenCamera(targetPos, currentModelCenter, new THREE.Vector3(0, 1, 0));
        },
        'btn-view-right': (flip) => {
          if (flip) viewStates['btn-view-right'] = 1 - viewStates['btn-view-right'];
          const isLeft = viewStates['btn-view-right'] === 1;
          const factorX = isLeft ? -1 : 1;
          const targetPos = currentModelCenter.clone().add(new THREE.Vector3(factorX, 0, 0).multiplyScalar(currentModelDistance));
          setBtnLabel('btn-view-right', isLeft ? 'Left' : 'Right');
          tweenCamera(targetPos, currentModelCenter, new THREE.Vector3(0, 1, 0));
        }
      };

      Object.keys(viewActions).forEach((btnId) => {
        const btn = document.getElementById(btnId);
        if (btn) {
          btn.addEventListener('click', () => {
            const isAlreadyActive = btn.classList.contains('active');
            if (!isAlreadyActive) {
              // Switched to a new view button: deactivate others, reset other button labels
              Object.keys(viewActions).forEach(id => {
                const b = document.getElementById(id);
                if (b) {
                  b.classList.remove('active');
                  viewStates[id] = 0;
                }
              });
              setBtnLabel('btn-view-top', 'Top');
              setBtnLabel('btn-view-front', 'Front');
              setBtnLabel('btn-view-right', 'Right');
              setBtnLabel('btn-view-iso', 'Iso');

              btn.classList.add('active');
              viewActions[btnId](false);
            } else {
              // Clicked the same active button again: toggle opposite view!
              viewActions[btnId](true);
            }
          });
        }
      });

      // Reset View
      const btnReset = document.getElementById('btn-reset');
      btnReset.addEventListener('click', () => {
        if (initialCameraState.position.lengthSq() > 0) {
          tweenCamera(initialCameraState.position, initialCameraState.target, new THREE.Vector3(0, 1, 0));
          Object.keys(viewActions).forEach(id => {
            const b = document.getElementById(id);
            if (b) {
              b.classList.remove('active');
              viewStates[id] = 0;
            }
          });
          setBtnLabel('btn-view-top', 'Top');
          setBtnLabel('btn-view-front', 'Front');
          setBtnLabel('btn-view-right', 'Right');
          const bIso = document.getElementById('btn-view-iso');
          if (bIso) {
            setBtnLabel('btn-view-iso', 'Iso');
            bIso.classList.add('active');
          }
        }
      });

      window.viewActions = viewActions;
      window.viewStates = viewStates;
      window.setBtnLabel = setBtnLabel;
    }

// Window exports
window.createTextSprite = createTextSprite;
window.indexModelVertices = indexModelVertices;
window.computeCoplanarArea = computeCoplanarArea;
window.findSurfaceTarget = findSurfaceTarget;
window.isPointOccluded = isPointOccluded;
window.findSnapTarget = findSnapTarget;
window.updateHoverEdgeGeometry = updateHoverEdgeGeometry;
window.drawCircleRing = drawCircleRing;
window.draw3DCircleRing = draw3DCircleRing;
window.drawCylinderAxisLine = drawCylinderAxisLine;
window.drawPointPin = drawPointPin;
window.drawCADDimensionLine = drawCADDimensionLine;
window.drawCADCircleAnnotation = drawCADCircleAnnotation;
window.getEntityOriginPoint = getEntityOriginPoint;
window.updateRubberband = updateRubberband;
window.removeRubberband = removeRubberband;
window.isHoleEntity = isHoleEntity;
window.getHoleInfo = getHoleInfo;
window.isSurfaceTarget = isSurfaceTarget;
window.isPurePointTarget = isPurePointTarget;
window.isPointTarget = isPointTarget;
window.handleUnifiedClick = handleUnifiedClick;
window.clearMeasurement = clearMeasurement;
window.clearActiveMeasurement = clearActiveMeasurement;
window.toggleMeasureMode = toggleMeasureMode;
window.pinMeasurement = pinMeasurement;
window.removePinnedMeasurement = removePinnedMeasurement;
window.clearPinnedMeasurements = clearPinnedMeasurements;
window.getPinnedMeasurements = getPinnedMeasurements;
window.updatePinnedBadgePositions = updatePinnedBadgePositions;
window.measureWallThickness = measureWallThickness;
window.toggleWallThicknessMode = toggleWallThicknessMode;
window.measureMinClearance = measureMinClearance;
window.toggleClearanceMode = toggleClearanceMode;

window.MeasureEngine = {
  createTextSprite,
  indexModelVertices,
  computeCoplanarArea,
  findSurfaceTarget,
  isPointOccluded,
  findSnapTarget,
  updateHoverEdgeGeometry,
  drawCircleRing,
  draw3DCircleRing,
  drawCylinderAxisLine,
  drawPointPin,
  drawCADDimensionLine,
  drawCADCircleAnnotation,
  getEntityOriginPoint,
  updateRubberband,
  removeRubberband,
  isHoleEntity,
  getHoleInfo,
  isSurfaceTarget,
  isPurePointTarget,
  isPointTarget,
  handleUnifiedClick,
  clearMeasurement,
  clearActiveMeasurement,
  toggleMeasureMode,
  pinMeasurement,
  removePinnedMeasurement,
  clearPinnedMeasurements,
  getPinnedMeasurements,
  updatePinnedBadgePositions,
  measureWallThickness,
  toggleWallThicknessMode,
  measureMinClearance,
  toggleClearanceMode
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.MeasureEngine;
}

