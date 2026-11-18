/**
 * QuickLook CAD Studio - Advanced CAD Analysis Engine (v2.0.0)
 * Wave 2 Engineering Tools:
 * - V2-05: Interference & Collision Detection
 * - V2-06: 3D Center of Mass (CoM) Gizmo & Weight Barycenter
 * - V2-07: Draft Angle & Surface Curvature Heatmap Shader
 * - V2-09: Ambient Crevice Shading & Rim Lighting Enhancements
 */
(function () {
  'use strict';

  let isCollisionActive = false;
  let collisionResults = [];
  let collisionHighlightMeshes = [];
  let activeCollisionMat = null;

  let isComGizmoActive = false;
  let comGizmoGroup = null;
  let comCoords = { x: 0, y: 0, z: 0, totalMassKg: 0 };

  let isDraftAngleActive = false;
  let originalMaterialsMap = new Map();
  let currentPullVector = new THREE.Vector3(0, 0, 1); // Default +Z (XY plane normal)
  let currentPullReference = 'XY';
  let isPullFlipped = false;
  let draftThresholdDeg = 3.0;
  let isPickingDraftFace = false;
  let draftPullArrow = null;
  let activeDraftShaderMat = null;

  const REFERENCE_PLANES = {
    'XY': new THREE.Vector3(0, 0, 1),
    'YZ': new THREE.Vector3(1, 0, 0),
    'ZX': new THREE.Vector3(0, 1, 0)
  };

  // ---------------------------------------------------------------------------
  // 1. Interference & Collision Detection (V2-05)
  // ---------------------------------------------------------------------------
  function checkAssemblyInterferences() {
    clearCollisionHighlights();
    collisionResults = [];

    if (!window.modelBodies || window.modelBodies.length < 2) {
      if (typeof window.showToast === 'function') {
        window.showToast('At least 2 bodies required for collision check');
      }
      renderCollisionResultsUI();
      return [];
    }

    const bodies = window.modelBodies.filter(b => b.mesh && b.mesh.visible);
    const n = bodies.length;

    for (let i = 0; i < n; i++) {
      const bA = bodies[i];
      const boxA = new THREE.Box3().setFromObject(bA.mesh);

      for (let j = i + 1; j < n; j++) {
        const bB = bodies[j];
        const boxB = new THREE.Box3().setFromObject(bB.mesh);

        // AABB test
        if (boxA.intersectsBox(boxB)) {
          const overlapBox = boxA.clone().intersect(boxB);
          const overlapSize = new THREE.Vector3();
          overlapBox.getSize(overlapSize);
          const approxOverlapVolMm3 = overlapSize.x * overlapSize.y * overlapSize.z;

          // If overlap volume is non-negligible (> 0.05 mm^3)
          if (approxOverlapVolMm3 > 0.05) {
            // Narrow-phase BVH triangle-triangle intersection test
            if (window.MeshBVHLib && typeof window.MeshBVHLib.MeshBVH === 'function') {
              const geomA = bA.mesh.geometry;
              const geomB = bB.mesh.geometry;
              const posA = geomA && geomA.attributes && geomA.attributes.position;
              const posB = geomB && geomB.attributes && geomB.attributes.position;

              if (posA && posB && posA.count > 0 && posB.count > 0) {
                if (!geomA.boundsTree) {
                  geomA.boundsTree = new window.MeshBVHLib.MeshBVH(geomA);
                }
                if (!geomB.boundsTree) {
                  geomB.boundsTree = new window.MeshBVHLib.MeshBVH(geomB);
                }

                bA.mesh.updateMatrixWorld(true);
                bB.mesh.updateMatrixWorld(true);

                const matAtoB = new THREE.Matrix4()
                  .copy(bA.mesh.matrixWorld)
                  .invert()
                  .multiply(bB.mesh.matrixWorld);

                if (!geomA.boundsTree.intersectsGeometry(geomB, matAtoB)) {
                  continue;
                }
              }
            }

            collisionResults.push({
              bodyIndexA: bA.id !== undefined ? bA.id : (bA.bodyId !== undefined ? bA.bodyId : i),
              bodyIndexB: bB.id !== undefined ? bB.id : (bB.bodyId !== undefined ? bB.bodyId : j),
              nameA: bA.name || `Body ${i + 1}`,
              nameB: bB.name || `Body ${j + 1}`,
              overlapBox: overlapBox,
              overlapCenter: overlapBox.getCenter(new THREE.Vector3()),
              overlapVolMm3: approxOverlapVolMm3
            });
          }
        }
      }
    }

    if (collisionResults.length > 0) {
      isCollisionActive = true;
      highlightCollisions();
      if (typeof window.showToast === 'function') {
        window.showToast(`Detected ${collisionResults.length} part interference(s)!`);
      }
    } else {
      isCollisionActive = false;
      if (typeof window.showToast === 'function') {
        window.showToast('No part collisions detected. All clearances nominal.');
      }
    }

    renderCollisionResultsUI();
    return collisionResults;
  }

  function highlightCollisions() {
    clearCollisionHighlights();

    if (!window.scene) return;

    activeCollisionMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x991b1b,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthTest: true
    });

    const affectedBodyIds = new Set();
    collisionResults.forEach(res => {
      affectedBodyIds.add(res.bodyIndexA);
      affectedBodyIds.add(res.bodyIndexB);

      // Add glowing red wireframe box around intersection volume
      const boxGeom = new THREE.BoxGeometry(
        Math.max(res.overlapBox.max.x - res.overlapBox.min.x, 0.5),
        Math.max(res.overlapBox.max.y - res.overlapBox.min.y, 0.5),
        Math.max(res.overlapBox.max.z - res.overlapBox.min.z, 0.5)
      );
      const boxEdges = new THREE.EdgesGeometry(boxGeom);
      const wireMesh = new THREE.LineSegments(
        boxEdges,
        new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 })
      );
      wireMesh.position.copy(res.overlapCenter);
      window.scene.add(wireMesh);
      collisionHighlightMeshes.push(wireMesh);
    });

    // Pulse or tint colliding bodies
    if (window.modelBodies) {
      window.modelBodies.forEach(b => {
        const bId = b.id !== undefined ? b.id : b.bodyId;
        if (affectedBodyIds.has(bId) || (b.bodyId !== undefined && affectedBodyIds.has(b.bodyId))) {
          if (!b.mesh.userData._preCollisionMat) {
            b.mesh.userData._preCollisionMat = b.mesh.material;
          }
          b.mesh.material = activeCollisionMat;
        }
      });
    }
  }

  function clearCollisionHighlights() {
    if (window.modelBodies) {
      window.modelBodies.forEach(b => {
        if (b.mesh && b.mesh.userData._preCollisionMat) {
          b.mesh.material = b.mesh.userData._preCollisionMat;
          delete b.mesh.userData._preCollisionMat;
        }
      });
    }

    if (activeCollisionMat) {
      activeCollisionMat.dispose();
      activeCollisionMat = null;
    }

    collisionHighlightMeshes.forEach(m => {
      if (window.scene) window.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    });
    collisionHighlightMeshes = [];
    isCollisionActive = false;
  }

  function renderCollisionResultsUI() {
    const container = document.getElementById('collision-results');
    if (!container) return;

    if (collisionResults.length === 0) {
      container.innerHTML = `
        <div style="padding: 10px; color: #94a3b8; font-size: 11px; text-align: center; border: 1px dashed rgba(255,255,255,0.1); border-radius: 6px;">
          No collisions detected. Click "Scan Interferences" to audit assembly clearance.
        </div>
      `;
      return;
    }

    const esc = typeof window.escapeHtml === 'function'
      ? window.escapeHtml
      : (s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

    let html = `<div style="display: flex; flex-direction: column; gap: 6px;">`;
    collisionResults.forEach((c, idx) => {
      const volFormatted = typeof window.formatVol === 'function' ? window.formatVol(c.overlapVolMm3) : `${c.overlapVolMm3.toFixed(1)} mm³`;
      html += `
        <div class="collision-item" style="background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; padding: 8px;">
          <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 11.5px; color: #fca5a5;">
            <span>#${idx + 1} Interference</span>
            <span>Vol: ${volFormatted}</span>
          </div>
          <div style="font-size: 10.5px; color: #e2e8f0; margin-top: 3px;">
            ${esc(c.nameA)} <span style="color:#ef4444;">⟷</span> ${esc(c.nameB)}
          </div>
        </div>
      `;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // 2. 3D Center of Mass (CoM) Coordinate Gizmo (V2-06)
  // ---------------------------------------------------------------------------
  function computeGeometryCentroidAndVolume(mesh) {
    const geom = mesh && mesh.geometry;
    const pos = geom && geom.attributes && geom.attributes.position;
    if (!pos || pos.count < 3) {
      return null;
    }

    mesh.updateMatrixWorld(true);
    const index = geom.index;
    const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
    if (triCount <= 0) {
      return null;
    }

    // Shift coordinates relative to first vertex to preserve floating-point precision
    const refIdx = index ? index.getX(0) : 0;
    const p0x = pos.getX(refIdx);
    const p0y = pos.getY(refIdx);
    const p0z = pos.getZ(refIdx);

    let signedVol6 = 0;
    let sumVx = 0, sumVy = 0, sumVz = 0;
    let totalArea2 = 0;
    let sumAx = 0, sumAy = 0, sumAz = 0;

    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      const ax = pos.getX(i0) - p0x;
      const ay = pos.getY(i0) - p0y;
      const az = pos.getZ(i0) - p0z;

      const bx = pos.getX(i1) - p0x;
      const by = pos.getY(i1) - p0y;
      const bz = pos.getZ(i1) - p0z;

      const cx = pos.getX(i2) - p0x;
      const cy = pos.getY(i2) - p0y;
      const cz = pos.getZ(i2) - p0z;

      // Signed volume * 6 = a . (b x c)
      const bxcx = by * cz - bz * cy;
      const bxcy = bz * cx - bx * cz;
      const bxcz = bx * cy - by * cx;
      const v6 = ax * bxcx + ay * bxcy + az * bxcz;

      signedVol6 += v6;
      sumVx += v6 * (ax + bx + cx) * 0.25;
      sumVy += v6 * (ay + by + cy) * 0.25;
      sumVz += v6 * (az + bz + cz) * 0.25;

      // Area-weighted fallback: 2 * Area = |(b - a) x (c - a)|
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      const area2 = Math.sqrt(nx * nx + ny * ny + nz * nz);

      if (area2 > 0) {
        totalArea2 += area2;
        sumAx += area2 * (ax + bx + cx) / 3.0;
        sumAy += area2 * (ay + by + cy) / 3.0;
        sumAz += area2 * (az + bz + cz) / 3.0;
      }
    }

    const localCentroid = new THREE.Vector3();
    let volumeMm3 = 0;

    if (Math.abs(signedVol6) > 1e-6) {
      localCentroid.set(
        p0x + sumVx / signedVol6,
        p0y + sumVy / signedVol6,
        p0z + sumVz / signedVol6
      );
      const scaleDet = Math.abs(mesh.matrixWorld.determinant());
      volumeMm3 = (Math.abs(signedVol6) / 6.0) * (scaleDet > 0 ? scaleDet : 1.0);
    } else if (totalArea2 > 1e-6) {
      localCentroid.set(
        p0x + sumAx / totalArea2,
        p0y + sumAy / totalArea2,
        p0z + sumAz / totalArea2
      );
    } else {
      return null;
    }

    return {
      centroidWorld: localCentroid.applyMatrix4(mesh.matrixWorld),
      volumeMm3: volumeMm3
    };
  }

  function computeCenterOfMass() {
    if (!window.modelBodies || window.modelBodies.length === 0) {
      return { x: 0, y: 0, z: 0, totalMassKg: 0 };
    }

    let sumMx = 0, sumMy = 0, sumMz = 0;
    let totalMass = 0;

    const selectedMatDensity = window.MaterialsEngine && typeof window.MaterialsEngine.getSelectedMaterial === 'function'
      ? window.MaterialsEngine.getSelectedMaterial()?.density
      : null;

    window.modelBodies.forEach((b, idx) => {
      if (!b.mesh) return;

      const box = new THREE.Box3().setFromObject(b.mesh);
      const size = box.getSize(new THREE.Vector3());
      const geomProps = computeGeometryCentroidAndVolume(b.mesh);
      const center = geomProps ? geomProps.centroidWorld : box.getCenter(new THREE.Vector3());

      let estVolMm3;
      if (b.data && typeof b.data.volumeMm3 === 'number' && b.data.volumeMm3 > 0) {
        estVolMm3 = Math.abs(b.data.volumeMm3);
      } else if (geomProps && geomProps.volumeMm3 > 0) {
        estVolMm3 = geomProps.volumeMm3;
      } else {
        estVolMm3 = Math.max(size.x * size.y * size.z * 0.45, 1.0);
      }

      // Material density (default to selected material or Steel ~7.85 g/cm3 = 7.85e-6 kg/mm3)
      let densityKgMm3 = (b.materialDensity && b.materialDensity > 0)
        ? (b.materialDensity * 1e-6)
        : ((selectedMatDensity && selectedMatDensity > 0) ? (selectedMatDensity * 1e-6) : 7.85e-6);
      if (window.MaterialsEngine && typeof window.MaterialsEngine.getBodyDensity === 'function') {
        const d = window.MaterialsEngine.getBodyDensity(b.id !== undefined ? b.id : (b.bodyId || idx));
        if (d && d > 0) densityKgMm3 = d;
      }

      const bodyMassKg = estVolMm3 * densityKgMm3;
      totalMass += bodyMassKg;
      sumMx += center.x * bodyMassKg;
      sumMy += center.y * bodyMassKg;
      sumMz += center.z * bodyMassKg;
    });

    if (totalMass <= 0) totalMass = 1.0;

    comCoords = {
      x: sumMx / totalMass,
      y: sumMy / totalMass,
      z: sumMz / totalMass,
      totalMassKg: totalMass
    };

    return comCoords;
  }

  function createComQuadrantTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // 4 alternating quadrants: Yellow (#eab308) and Black (#0f172a)
    ctx.fillStyle = '#eab308';
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillRect(64, 64, 64, 64);

    // Crosshair lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(64, 0); ctx.lineTo(64, 128);
    ctx.moveTo(0, 64); ctx.lineTo(128, 64);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  function toggleCenterOfMassGizmo(forceState) {
    if (forceState !== undefined) {
      isComGizmoActive = forceState;
    } else {
      isComGizmoActive = !isComGizmoActive;
    }

    if (!isComGizmoActive) {
      if (comGizmoGroup && window.scene) {
        window.scene.remove(comGizmoGroup);
      }
      const readout = document.getElementById('com-coords-readout');
      if (readout) readout.innerText = 'Disabled';
      return;
    }

    const com = computeCenterOfMass();
    if (!window.scene) return;

    if (!comGizmoGroup) {
      comGizmoGroup = new THREE.Group();
      comGizmoGroup.name = 'centerOfMassGizmoGroup';

      // 1. Classic Quartered CoM Sphere
      const sphereGeom = new THREE.SphereGeometry(1.5, 32, 16);
      const sphereMat = new THREE.MeshBasicMaterial({
        map: createComQuadrantTexture(),
        depthTest: false,
        depthWrite: false
      });
      const sphere = new THREE.Mesh(sphereGeom, sphereMat);
      sphere.renderOrder = 9999;
      comGizmoGroup.add(sphere);

      // 2. Orthogonal Axis Reticles (X: Red, Y: Green, Z: Blue)
      const axesGeom = new THREE.BufferGeometry();
      const pos = [
        -6, 0, 0,  6, 0, 0,
        0, -6, 0,  0, 6, 0,
        0, 0, -6,  0, 0, 6
      ];
      axesGeom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const colors = [
        1,0,0, 1,0,0,
        0,1,0, 0,1,0,
        0,0.5,1, 0,0.5,1
      ];
      axesGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const axisLines = new THREE.LineSegments(axesGeom, new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 2,
        depthTest: false,
        depthWrite: false
      }));
      axisLines.renderOrder = 9999;
      comGizmoGroup.add(axisLines);
    }

    comGizmoGroup.position.set(com.x, com.y, com.z);
    if (!comGizmoGroup.parent) {
      window.scene.add(comGizmoGroup);
    }

    // Scale gizmo adaptively relative to scene size
    if (window.modelGroup) {
      const box = new THREE.Box3().setFromObject(window.modelGroup);
      const diag = box.min.distanceTo(box.max);
      const scale = Math.max(diag * 0.04, 0.4);
      comGizmoGroup.scale.set(scale, scale, scale);
    }

    // Update UI readout
    updateComReadout(com);

    if (typeof window.showToast === 'function') {
      window.showToast(`CoM: X:${com.x.toFixed(1)}, Y:${com.y.toFixed(1)}, Z:${com.z.toFixed(1)} mm`);
    }
  }

  function updateComReadout(com) {
    const readout = document.getElementById('com-coords-readout');
    if (!readout || !com) return;
    const unitVal = typeof currentUnit !== 'undefined' ? currentUnit : (window.currentUnit || 'mm');
    const u = unitVal === 'in' ? 'in' : 'mm';
    const factor = (u === 'in') ? 1 / 25.4 : 1.0;
    const massKg = typeof com.totalMassKg === 'number' ? com.totalMassKg : 0;
    const massText = massKg >= 1
      ? `${massKg.toFixed(2)} kg`
      : `${(massKg * 1000).toFixed(1)} g`;
    readout.innerHTML = `
      <span style="color:#ef4444;">X: ${(com.x * factor).toFixed(2)}</span>
      <span style="color:#22c55e; margin-left: 6px;">Y: ${(com.y * factor).toFixed(2)}</span>
      <span style="color:#38bdf8; margin-left: 6px;">Z: ${(com.z * factor).toFixed(2)} ${u}</span>
      <span style="color:#eab308; margin-left: 8px;">M: ${massText}</span>
    `;
  }

  function refreshComReadout() {
    if (!isComGizmoActive) return;
    const com = computeCenterOfMass();
    updateComReadout(com);
  }

  // ---------------------------------------------------------------------------
  // 3. Draft Angle & Surface Curvature Heatmap Shader (V2-07)
  // ---------------------------------------------------------------------------
  const DRAFT_VERTEX_SHADER = `
    varying vec3 vNormalWorld;
    varying vec3 vPositionWorld;

    void main() {
      vNormalWorld = normalize(mat3(modelMatrix) * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vPositionWorld = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const DRAFT_FRAGMENT_SHADER = `
    uniform vec3 uPullAxis;
    uniform float uThresholdDeg;
    varying vec3 vNormalWorld;
    varying vec3 vPositionWorld;

    void main() {
      vec3 N = normalize(vNormalWorld);
      vec3 D = normalize(uPullAxis);

      // Dot product: cos(angle to pull axis)
      float cosAlpha = dot(N, D);
      // Draft angle in degrees relative to the side wall (90 - alpha)
      float draftAngleDeg = 90.0 - degrees(acos(clamp(abs(cosAlpha), 0.0, 1.0)));

      vec3 color = vec3(0.15, 0.75, 0.25); // Green (Safe draft)

      if (cosAlpha < -0.01) {
        // Undercut / Negative draft
        color = vec3(0.93, 0.27, 0.27); // Warning Red
      } else if (draftAngleDeg < uThresholdDeg) {
        // Marginal draft (0 to threshold deg)
        color = vec3(0.95, 0.75, 0.1); // Yellow
      } else if (abs(cosAlpha) > 0.98) {
        // Top/Bottom flat face
        color = vec3(0.2, 0.55, 0.9); // Blue
      }

      // Add basic directional diffuse shading for 3D depth
      float diffuse = max(dot(N, vec3(0.5, 0.8, 0.6)), 0.25) * 0.5 + 0.5;
      gl_FragColor = vec4(color * diffuse, 1.0);
    }
  `;

  function resolvePlaneNormal(planeName, isFlipped = false) {
    let vec = new THREE.Vector3();
    if (planeName === 'XY') vec.set(0, 0, 1);
    else if (planeName === 'YZ') vec.set(1, 0, 0);
    else if (planeName === 'ZX') vec.set(0, 1, 0);
    else if (planeName === 'X') vec.set(1, 0, 0);
    else if (planeName === 'Y') vec.set(0, 1, 0);
    else if (planeName === 'Z') vec.set(0, 0, 1);
    else vec.set(0, 0, 1);
    if (isFlipped) vec.negate();
    return vec;
  }

  function setPullPlane(planeKey) {
    if (!REFERENCE_PLANES[planeKey]) return;
    currentPullReference = planeKey;
    currentPullVector.copy(REFERENCE_PLANES[planeKey]);
    if (isPullFlipped) {
      currentPullVector.negate();
    }
    onPullDirectionChanged();
  }

  function setCustomPullVector(vec, refLabel = 'CUSTOM') {
    if (!vec) return;
    currentPullReference = refLabel;
    currentPullVector.copy(vec).normalize();
    isPullFlipped = false;
    onPullDirectionChanged();
  }

  function flipPullDirection() {
    isPullFlipped = !isPullFlipped;
    currentPullVector.negate();
    onPullDirectionChanged();
  }

  function onPullDirectionChanged() {
    // 1. In-place shader uniform mutation if active
    if (isDraftAngleActive && activeDraftShaderMat) {
      activeDraftShaderMat.uniforms.uPullAxis.value.copy(currentPullVector);
      activeDraftShaderMat.uniformsNeedUpdate = true;
    }

    // 2. Update 3D Arrow indicator
    updateDraftPullArrow();

    // 3. Update DOM UI controls and vector readout
    updateDraftUI();

    // 4. Update on-screen legend
    if (isDraftAngleActive) {
      updateDraftLegendThreshold(draftThresholdDeg);
    }
  }

  function setDraftThreshold(deg) {
    draftThresholdDeg = Math.max(0.1, Math.min(45.0, Number(deg) || 3.0));
    if (isDraftAngleActive && activeDraftShaderMat) {
      activeDraftShaderMat.uniforms.uThresholdDeg.value = draftThresholdDeg;
      activeDraftShaderMat.uniformsNeedUpdate = true;
    }
    updateDraftUI();
    if (isDraftAngleActive) {
      updateDraftLegendThreshold(draftThresholdDeg);
    }
  }

  function extractWorldNormalFromIntersection(hit) {
    if (!hit || !hit.face || !hit.face.normal || !hit.object) return null;
    let worldMatrix = hit.object.matrixWorld;
    if (hit.object.isInstancedMesh && hit.instanceId !== undefined) {
      const instMatrix = new THREE.Matrix4();
      hit.object.getMatrixAt(hit.instanceId, instMatrix);
      worldMatrix = new THREE.Matrix4().multiplyMatrices(hit.object.matrixWorld, instMatrix);
    }
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);
    const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
    return worldNormal;
  }

  function startFacePicking() {
    isPickingDraftFace = true;
    const container = document.getElementById('canvas-container');
    if (container) container.style.cursor = 'crosshair';

    const btn = document.getElementById('btn-draft-pick-face') || document.getElementById('btn-pick-draft-face');
    if (btn) btn.classList.add('active');
    const txt = document.getElementById('btn-draft-pick-face-text') || document.getElementById('btn-pick-draft-face-text');
    if (txt) txt.innerText = 'Click Face in 3D...';

    if (typeof window.showToast === 'function') {
      window.showToast('Click any part surface to set pull direction');
    }
  }

  function stopFacePicking() {
    isPickingDraftFace = false;
    const container = document.getElementById('canvas-container');
    if (container) container.style.cursor = '';

    const btn = document.getElementById('btn-draft-pick-face') || document.getElementById('btn-pick-draft-face');
    if (btn) btn.classList.remove('active');
    const txt = document.getElementById('btn-draft-pick-face-text') || document.getElementById('btn-pick-draft-face-text');
    if (txt) txt.innerText = 'Pick Face Normal';
  }

  function handleFacePick(e) {
    if (!isPickingDraftFace) return false;
    const container = document.getElementById('canvas-container');
    if (!container || !window.camera) return false;

    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, window.camera);

    const meshes = [];
    if (window.modelBodies && window.modelBodies.length > 0) {
      window.modelBodies.forEach(b => {
        if (b.mesh && b.mesh.visible) meshes.push(b.mesh);
      });
    } else if (window.modelGroup) {
      window.modelGroup.traverse(child => {
        if (child.isMesh && child.name !== 'solidworks_edges' && child.visible) {
          meshes.push(child);
        }
      });
    }

    const intersects = raycaster.intersectObjects(meshes, false);
    if (!intersects || intersects.length === 0) return false;

    const hit = intersects[0];
    const worldNormal = extractWorldNormalFromIntersection(hit);
    if (worldNormal) {
      setCustomPullVector(worldNormal, 'CUSTOM');
      updateDraftPullArrow(hit.point);
      if (!isDraftAngleActive) {
        toggleDraftAngleHeatmap(true);
      }
      stopFacePicking();
      if (typeof window.showToast === 'function') {
        window.showToast(`Pull direction set from face: [${worldNormal.x.toFixed(2)}, ${worldNormal.y.toFixed(2)}, ${worldNormal.z.toFixed(2)}]`);
      }
      return true;
    }
    return false;
  }

  function updateDraftPullArrow(customOrigin) {
    if (!window.scene) return;

    if (!isDraftAngleActive) {
      if (draftPullArrow) {
        window.scene.remove(draftPullArrow);
        if (draftPullArrow.line && draftPullArrow.line.geometry) draftPullArrow.line.geometry.dispose();
        if (draftPullArrow.line && draftPullArrow.line.material) draftPullArrow.line.material.dispose();
        if (draftPullArrow.cone && draftPullArrow.cone.geometry) draftPullArrow.cone.geometry.dispose();
        if (draftPullArrow.cone && draftPullArrow.cone.material) draftPullArrow.cone.material.dispose();
        draftPullArrow = null;
      }
      return;
    }

    let origin = customOrigin ? customOrigin.clone() : null;
    let arrowLength = 25;

    if (window.modelGroup) {
      const box = new THREE.Box3().setFromObject(window.modelGroup);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      arrowLength = Math.max(maxDim * 0.25, 10.0);
      if (!origin) origin = box.getCenter(new THREE.Vector3());
    } else if (!origin) {
      origin = new THREE.Vector3(0, 0, 0);
    }

    const headLength = arrowLength * 0.28;
    const headWidth = arrowLength * 0.16;

    if (!draftPullArrow) {
      draftPullArrow = new THREE.ArrowHelper(
        currentPullVector.clone().normalize(),
        origin,
        arrowLength,
        0x06b6d4, // Cyan
        headLength,
        headWidth
      );
      draftPullArrow.name = 'draftPullArrowIndicator';
      if (draftPullArrow.line && draftPullArrow.line.material) {
        draftPullArrow.line.material.depthTest = false;
      }
      if (draftPullArrow.cone && draftPullArrow.cone.material) {
        draftPullArrow.cone.material.depthTest = false;
      }
      draftPullArrow.renderOrder = 9998;
      window.scene.add(draftPullArrow);
    } else {
      draftPullArrow.setDirection(currentPullVector.clone().normalize());
      draftPullArrow.setLength(arrowLength, headLength, headWidth);
      if (origin) draftPullArrow.position.copy(origin);
    }
  }

  function updateDraftUI() {
    const btnXY = document.getElementById('btn-draft-plane-xy');
    const btnYZ = document.getElementById('btn-draft-plane-yz');
    const btnZX = document.getElementById('btn-draft-plane-zx');
    if (btnXY && btnYZ && btnZX) {
      btnXY.classList.toggle('active', currentPullReference === 'XY');
      btnYZ.classList.toggle('active', currentPullReference === 'YZ');
      btnZX.classList.toggle('active', currentPullReference === 'ZX');
    }

    const select = document.getElementById('draft-plane-select');
    if (select) {
      select.value = currentPullReference === 'CUSTOM' ? 'CUSTOM' : currentPullReference;
    }

    const readout = document.getElementById('draft-pull-dir-readout') || document.getElementById('draft-vector-readout');
    if (readout) {
      const refStr = currentPullReference === 'CUSTOM' ? 'Face' : currentPullReference;
      readout.innerText = `${refStr}: (${currentPullVector.x.toFixed(2)}, ${currentPullVector.y.toFixed(2)}, ${currentPullVector.z.toFixed(2)})`;
    }

    const slider = document.getElementById('draft-angle-slider') || document.getElementById('draft-threshold-input');
    if (slider) {
      slider.value = draftThresholdDeg.toFixed(1);
    }
    const valBadge = document.getElementById('draft-angle-val');
    if (valBadge) {
      valBadge.innerText = `${draftThresholdDeg.toFixed(1)}°`;
    }
  }

  function toggleDraftAngleHeatmap(forceState, axis = 'Z') {
    if (forceState !== undefined) {
      isDraftAngleActive = forceState;
    } else {
      isDraftAngleActive = !isDraftAngleActive;
    }

    if (axis) {
      if (axis === 'XY' || axis === 'YZ' || axis === 'ZX') {
        currentPullReference = axis;
        currentPullVector.copy(REFERENCE_PLANES[axis]);
        if (isPullFlipped) currentPullVector.negate();
      } else if (axis === 'X' || axis === 'Y' || axis === 'Z') {
        currentPullReference = axis === 'Z' ? 'XY' : (axis === 'X' ? 'YZ' : 'ZX');
        currentPullVector.set(axis === 'X' ? 1 : 0, axis === 'Y' ? 1 : 0, axis === 'Z' ? 1 : 0);
        if (isPullFlipped) currentPullVector.negate();
      } else if (axis && typeof axis === 'object' && axis.isVector3) {
        currentPullReference = 'CUSTOM';
        currentPullVector.copy(axis).normalize();
      }
    }

    const panel = document.getElementById('draft-controls-panel') || document.getElementById('draft-controls-container');
    const toggleBtn = document.getElementById('btn-toggle-draft');
    const legend = document.getElementById('draft-angle-legend');

    if (!isDraftAngleActive) {
      // Restore original materials
      if (window.modelBodies) {
        window.modelBodies.forEach(b => {
          if (b.mesh && originalMaterialsMap.has(b.mesh)) {
            b.mesh.material = originalMaterialsMap.get(b.mesh);
          }
        });
      }
      originalMaterialsMap.clear();
      activeDraftShaderMat = null;

      updateDraftPullArrow();
      if (isPickingDraftFace) stopFacePicking();

      if (panel) panel.style.display = 'none';
      if (toggleBtn) {
        toggleBtn.classList.remove('active');
        toggleBtn.innerText = 'Inspect Draft';
      }
      hideDraftLegend();
      if (typeof window.showToast === 'function') {
        window.showToast('Draft angle heatmap disabled');
      }
      return;
    }

    // Active mode:
    if (panel) panel.style.display = 'flex';
    if (toggleBtn) {
      toggleBtn.classList.add('active');
      toggleBtn.innerText = 'Reset View';
    }

    if (activeDraftShaderMat) {
      // In-place uniform mutation
      activeDraftShaderMat.uniforms.uPullAxis.value.copy(currentPullVector);
      activeDraftShaderMat.uniforms.uThresholdDeg.value = draftThresholdDeg;
      activeDraftShaderMat.uniformsNeedUpdate = true;
    } else {
      activeDraftShaderMat = new THREE.ShaderMaterial({
        uniforms: {
          uPullAxis: { value: currentPullVector.clone() },
          uThresholdDeg: { value: draftThresholdDeg }
        },
        vertexShader: DRAFT_VERTEX_SHADER,
        fragmentShader: DRAFT_FRAGMENT_SHADER,
        side: THREE.DoubleSide
      });

      if (window.modelBodies) {
        window.modelBodies.forEach(b => {
          if (b.mesh) {
            if (!originalMaterialsMap.has(b.mesh)) {
              originalMaterialsMap.set(b.mesh, b.mesh.material);
            }
            b.mesh.material = activeDraftShaderMat;
          }
        });
      }
    }

    updateDraftPullArrow();
    updateDraftUI();
    showDraftLegend(draftThresholdDeg);

    if (typeof window.showToast === 'function') {
      window.showToast(`Draft Heatmap Active (Pull: ${currentPullReference}, Limit: ${draftThresholdDeg.toFixed(1)}°)`);
    }
  }

  // ---------------------------------------------------------------------------
  // Milestone M4: Dynamic Draft Angle Graduation Algorithm & Legend HUD
  // ---------------------------------------------------------------------------

  function calculateDraftTicks(thresholdDeg) {
    const T = Math.max(0.1, Math.min(45.0, Number(thresholdDeg) || 3.0));
    let step = 1.0;
    if (T <= 0.75) step = 0.25;
    else if (T <= 1.5) step = 0.5;
    else if (T <= 5.0) step = 1.0;
    else if (T <= 12.0) step = 2.0;
    else if (T <= 25.0) step = 5.0;
    else if (T <= 40.0) step = 10.0;
    else step = 15.0;

    const allTicks = [];

    // The 0.0° tick MUST ALWAYS exist at exactly 50%
    allTicks.push({
      value: 0,
      angle: 0,
      label: '0.0°',
      percent: 50.0,
      pct: 50.0,
      isZero: true,
      isMajor: true
    });

    // Step outwards symmetrically
    let k = 1;
    while (k * step < T - (step * 0.2)) {
      const posVal = Math.round(k * step * 100) / 100;
      const negVal = -posVal;
      const decimals = step < 1 ? (step === 0.25 ? 2 : 1) : (posVal % 1 !== 0 ? 1 : 0);

      const posPct = Math.min(100, Math.max(0, Math.round((50.0 + (posVal / T) * 50.0) * 100) / 100));
      allTicks.push({
        value: posVal,
        angle: posVal,
        label: `+${posVal.toFixed(decimals)}°`,
        percent: posPct,
        pct: posPct,
        isZero: false,
        isMajor: false
      });

      const negPct = Math.min(100, Math.max(0, Math.round((50.0 + (negVal / T) * 50.0) * 100) / 100));
      allTicks.push({
        value: negVal,
        angle: negVal,
        label: `${negVal.toFixed(decimals)}°`,
        percent: negPct,
        pct: negPct,
        isZero: false,
        isMajor: false
      });

      k++;
    }

    // Boundary ticks at -T and +T
    const boundDecimals = T < 1 ? (step === 0.25 ? 2 : 1) : (T % 1 !== 0 ? 1 : 0);
    allTicks.push({
      value: -T,
      angle: -T,
      label: `-${T.toFixed(boundDecimals)}°`,
      percent: 0.0,
      pct: 0.0,
      isZero: false,
      isMajor: true
    });
    allTicks.push({
      value: T,
      angle: T,
      label: `+${T.toFixed(boundDecimals)}°`,
      percent: 100.0,
      pct: 100.0,
      isZero: false,
      isMajor: true
    });

    // Sort strictly ascending by angle
    allTicks.sort((a, b) => a.angle - b.angle);

    // Deduplicate any tick within 1e-4 of another
    const uniqueTicks = [];
    for (let i = 0; i < allTicks.length; i++) {
      const cur = allTicks[i];
      if (uniqueTicks.length === 0) {
        uniqueTicks.push(cur);
      } else {
        const prev = uniqueTicks[uniqueTicks.length - 1];
        if (Math.abs(cur.angle - prev.angle) >= 1e-4) {
          uniqueTicks.push(cur);
        } else {
          if (cur.isZero || cur.isMajor) {
            uniqueTicks[uniqueTicks.length - 1] = cur;
          }
        }
      }
    }

    // Re-verify exact endpoint and center invariants
    if (uniqueTicks.length > 0) {
      uniqueTicks[0].angle = -T;
      uniqueTicks[0].value = -T;
      uniqueTicks[0].percent = 0.0;
      uniqueTicks[0].pct = 0.0;

      const last = uniqueTicks[uniqueTicks.length - 1];
      last.angle = T;
      last.value = T;
      last.percent = 100.0;
      last.pct = 100.0;
    }

    const zero = uniqueTicks.find(t => t.isZero || Math.abs(t.angle) < 1e-4);
    if (zero) {
      zero.angle = 0;
      zero.value = 0;
      zero.percent = 50.0;
      zero.pct = 50.0;
      zero.isZero = true;
      zero.isMajor = true;
      zero.label = '0.0°';
    }

    return { threshold: T, step: step, ticks: uniqueTicks };
  }

  const calculateDraftGraduations = calculateDraftTicks;

  function showDraftLegend(thresholdDeg) {
    if (thresholdDeg !== undefined) {
      draftThresholdDeg = Math.max(0.1, Math.min(45.0, Number(thresholdDeg) || 3.0));
    }
    let legend = document.getElementById('draft-angle-legend');
    if (!legend) {
      legend = document.createElement('div');
      legend.id = 'draft-angle-legend';
      legend.className = 'draft-angle-legend';
      const container = document.getElementById('canvas-container') || document.body;
      container.appendChild(legend);
    }
    legend.style.display = 'flex';
    if (typeof legend.setAttribute === 'function') {
      legend.setAttribute('aria-hidden', 'false');
    }
    updateDraftLegendThreshold(draftThresholdDeg);
    return legend;
  }

  function hideDraftLegend() {
    const legend = document.getElementById('draft-angle-legend');
    if (legend) {
      legend.style.display = 'none';
      if (typeof legend.setAttribute === 'function') {
        legend.setAttribute('aria-hidden', 'true');
      }
    }
  }

  function updateDraftLegendThreshold(thresholdDeg) {
    const deg = Math.max(0.1, Math.min(45.0, Number(thresholdDeg) || draftThresholdDeg || 3.0));
    draftThresholdDeg = deg;

    const badge = document.getElementById('legend-threshold-badge');
    if (badge) badge.innerText = `±${deg.toFixed(1)}°`;

    const lblSafe = document.getElementById('legend-lbl-safe');
    if (lblSafe) lblSafe.innerText = deg.toFixed(1);
    const valSafe = document.getElementById('legend-threshold-val');
    if (valSafe) valSafe.innerText = deg.toFixed(1);

    const lblWarn = document.getElementById('legend-lbl-warn');
    if (lblWarn) lblWarn.innerText = deg.toFixed(1);
    const valWarn = document.getElementById('legend-threshold-val-warn');
    if (valWarn) valWarn.innerText = deg.toFixed(1);

    const scaleContainer = document.getElementById('legend-scale') || document.getElementById('draft-legend-scale');
    if (!scaleContainer) return;

    const tickData = calculateDraftTicks(deg);
    scaleContainer.innerHTML = '';

    tickData.ticks.forEach(t => {
      const row = document.createElement('div');
      row.className = 'legend-tick-row' + (t.isMajor ? ' major-tick' : '') + (t.isZero ? ' zero-tick' : '');
      row.style.bottom = `${t.percent.toFixed(2)}%`;

      const line = document.createElement('span');
      line.className = 'legend-tick-line';

      const label = document.createElement('span');
      label.className = 'legend-tick-label';
      label.innerText = t.label;

      row.appendChild(line);
      row.appendChild(label);
      scaleContainer.appendChild(row);
    });
  }

  function createOrShowDraftLegend() {
    return showDraftLegend(draftThresholdDeg);
  }

  // ---------------------------------------------------------------------------
  // 5. 3D Printability Diagnostics: Overhang Angle Heatmap & Manifold Edges
  // ---------------------------------------------------------------------------
  let isOverhangActive = false;
  let overhangThresholdDeg = 45;
  let overhangAxis = 'Y'; // 'Y' (+Y up) or 'Z' (+Z up)
  let overhangStats = {
    overhangTriangles: 0,
    totalTriangles: 0,
    overhangPercent: 0,
    thresholdDeg: 45,
    axis: 'Y'
  };
  const overhangOriginalStateMap = new Map();
  let activeOverhangMaterial = null;

  let isManifoldActive = false;
  let manifoldStats = {
    boundaryEdges: 0,
    nonManifoldEdges: 0,
    isWatertight: true,
    isManifold: true
  };
  let manifoldOverlayGroup = null;

  function collectTargetMeshes(explicitGroup) {
    const meshes = [];
    const seen = new Set();
    const addMesh = (m) => {
      if (!m || !m.isMesh || !m.visible || seen.has(m)) return;
      if (m.name === 'solidworks_edges' || (m.userData && m.userData._isAnalysisOverlay)) return;
      const pos = m.geometry && m.geometry.attributes && m.geometry.attributes.position;
      if (!pos || pos.count < 3) return;
      seen.add(m);
      meshes.push(m);
    };

    const group = explicitGroup || window.cadGroup || window.modelGroup;
    if (group && typeof group.traverse === 'function') {
      group.traverse(child => addMesh(child));
    }
    if (meshes.length === 0 && Array.isArray(window.modelBodies)) {
      window.modelBodies.forEach(b => {
        if (b && b.mesh) addMesh(b.mesh);
      });
    }
    return meshes;
  }

  function updateOverhangStatsUI() {
    const el = document.getElementById('overhang-stats');
    if (!el) return;
    if (!isOverhangActive) {
      el.textContent = 'Off';
      return;
    }
    el.textContent = `${overhangStats.overhangTriangles} / ${overhangStats.totalTriangles} faces (${overhangStats.overhangPercent.toFixed(1)}%) | >${overhangStats.thresholdDeg}° (${overhangStats.axis}-up)`;
  }

  function restoreOverhangMeshes() {
    overhangOriginalStateMap.forEach((orig, mesh) => {
      if (!mesh) return;
      if (orig.nonIndexedGeom) {
        mesh.geometry = orig.geometry;
        orig.nonIndexedGeom.dispose();
      } else if (orig.geometry) {
        if (orig.colorAttr) {
          orig.geometry.setAttribute('color', orig.colorAttr);
        } else {
          orig.geometry.deleteAttribute('color');
        }
      }
      mesh.material = orig.material;
    });
    overhangOriginalStateMap.clear();
    if (activeOverhangMaterial) {
      activeOverhangMaterial.dispose();
      activeOverhangMaterial = null;
    }
  }

  function applyOverhangHeatmap(explicitGroup) {
    restoreOverhangMeshes();

    const meshes = collectTargetMeshes(explicitGroup);
    const upVec = overhangAxis === 'Z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const warnThreshold = Math.max(0, overhangThresholdDeg - 10);

    activeOverhangMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const faceNormal = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();

    const colorCritical = new THREE.Color(0xef4444); // Red
    const colorWarning = new THREE.Color(0xf59e0b);  // Amber
    const defaultSafeColor = new THREE.Color(0x94a3b8); // Neutral slate

    let totalTriangles = 0;
    let overhangTriangles = 0;

    meshes.forEach(mesh => {
      mesh.updateMatrixWorld(true);
      normalMatrix.getNormalMatrix(mesh.matrixWorld);

      const origGeom = mesh.geometry;
      const origMat = mesh.material;
      const origColorAttr = origGeom.getAttribute('color') || null;

      let safeColor = defaultSafeColor;
      if (origMat && origMat.color && origMat.color.isColor) {
        safeColor = origMat.color;
      }

      let workGeom = origGeom;
      let nonIndexedGeom = null;
      if (origGeom.index !== null) {
        nonIndexedGeom = origGeom.toNonIndexed();
        workGeom = nonIndexedGeom;
        mesh.geometry = nonIndexedGeom;
      }

      overhangOriginalStateMap.set(mesh, {
        material: origMat,
        geometry: origGeom,
        colorAttr: origColorAttr,
        nonIndexedGeom: nonIndexedGeom
      });

      const pos = workGeom.getAttribute('position');
      const vertCount = pos.count;
      const colors = new Float32Array(vertCount * 3);

      for (let i = 0; i + 2 < vertCount; i += 3) {
        v0.fromBufferAttribute(pos, i);
        v1.fromBufferAttribute(pos, i + 1);
        v2.fromBufferAttribute(pos, i + 2);

        e1.subVectors(v1, v0);
        e2.subVectors(v2, v0);
        faceNormal.crossVectors(e1, e2);

        let overhangDeg = 0;
        if (faceNormal.lengthSq() > 1e-16) {
          faceNormal.applyMatrix3(normalMatrix).normalize();
          const dot = faceNormal.dot(upVec);
          if (dot < 0) {
            const clampedDown = Math.min(1, Math.max(0, -dot));
            overhangDeg = THREE.MathUtils.radToDeg(Math.asin(clampedDown));
          }
        }

        totalTriangles++;
        let c = safeColor;
        if (overhangDeg > overhangThresholdDeg) {
          c = colorCritical;
          overhangTriangles++;
        } else if (overhangDeg >= warnThreshold) {
          c = colorWarning;
        }

        for (let k = 0; k < 3; k++) {
          const idx = (i + k) * 3;
          colors[idx] = c.r;
          colors[idx + 1] = c.g;
          colors[idx + 2] = c.b;
        }
      }

      workGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      mesh.material = activeOverhangMaterial;
    });

    overhangStats = {
      overhangTriangles: overhangTriangles,
      totalTriangles: totalTriangles,
      overhangPercent: totalTriangles > 0 ? (overhangTriangles / totalTriangles) * 100 : 0,
      thresholdDeg: overhangThresholdDeg,
      axis: overhangAxis
    };

    updateOverhangStatsUI();
    if (typeof window.requestRender === 'function') window.requestRender();
    return Object.assign({}, overhangStats);
  }

  function toggleOverhangHeatmap(enabled, explicitGroup) {
    if (enabled !== undefined) {
      isOverhangActive = Boolean(enabled);
    } else {
      isOverhangActive = !isOverhangActive;
    }

    if (!isOverhangActive) {
      restoreOverhangMeshes();
      overhangStats = {
        overhangTriangles: 0,
        totalTriangles: 0,
        overhangPercent: 0,
        thresholdDeg: overhangThresholdDeg,
        axis: overhangAxis
      };
      updateOverhangStatsUI();
      if (typeof window.requestRender === 'function') window.requestRender();
      return Object.assign({}, overhangStats);
    }

    return applyOverhangHeatmap(explicitGroup);
  }

  function setOverhangThreshold(deg) {
    const parsed = Number(deg);
    const clamped = Math.max(15, Math.min(75, Number.isFinite(parsed) ? parsed : 45));
    overhangThresholdDeg = clamped;
    overhangStats.thresholdDeg = clamped;
    if (isOverhangActive) {
      return applyOverhangHeatmap();
    }
    updateOverhangStatsUI();
    return Object.assign({}, overhangStats);
  }

  function setOverhangAxis(axis) {
    const normalized = String(axis || 'Y').toUpperCase() === 'Z' ? 'Z' : 'Y';
    overhangAxis = normalized;
    overhangStats.axis = normalized;
    if (isOverhangActive) {
      return applyOverhangHeatmap();
    }
    updateOverhangStatsUI();
    return Object.assign({}, overhangStats);
  }

  function updateManifoldStatsUI() {
    const el = document.getElementById('manifold-stats');
    if (!el) return;
    if (!isManifoldActive) {
      el.textContent = 'Off';
      return;
    }
    const status = manifoldStats.isWatertight
      ? 'Watertight'
      : (manifoldStats.isManifold ? 'Open Boundary' : 'Non-Manifold');
    el.textContent = `${status} | Open: ${manifoldStats.boundaryEdges}, Non-Manifold: ${manifoldStats.nonManifoldEdges}`;
  }

  function clearManifoldOverlay() {
    if (manifoldOverlayGroup) {
      manifoldOverlayGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      if (manifoldOverlayGroup.parent) {
        manifoldOverlayGroup.parent.remove(manifoldOverlayGroup);
      } else if (window.scene) {
        window.scene.remove(manifoldOverlayGroup);
      }
      manifoldOverlayGroup = null;
    }
  }

  function analyzeManifoldEdges(group, renderOverlay) {
    const meshes = collectTargetMeshes(group);
    const QUANT = 1e4;
    const quantKey = (x, y, z) => `${Math.round(x * QUANT)},${Math.round(y * QUANT)},${Math.round(z * QUANT)}`;

    let boundaryEdges = 0;
    let nonManifoldEdges = 0;
    let totalEdges = 0;

    const boundaryPositions = [];
    const nonManifoldPositions = [];

    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const pC = new THREE.Vector3();

    meshes.forEach(mesh => {
      mesh.updateMatrixWorld(true);
      const geom = mesh.geometry;
      const pos = geom.attributes.position;
      const index = geom.index;
      const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);

      const edgeMap = new Map();

      const addEdge = (k1, k2, v1, v2) => {
        if (k1 === k2) return;
        const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
        let entry = edgeMap.get(key);
        if (!entry) {
          entry = {
            count: 1,
            p1: v1.clone().applyMatrix4(mesh.matrixWorld),
            p2: v2.clone().applyMatrix4(mesh.matrixWorld)
          };
          edgeMap.set(key, entry);
        } else {
          entry.count++;
        }
      };

      for (let t = 0; t < triCount; t++) {
        const i0 = index ? index.getX(t * 3) : t * 3;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

        pA.fromBufferAttribute(pos, i0);
        pB.fromBufferAttribute(pos, i1);
        pC.fromBufferAttribute(pos, i2);

        const kA = quantKey(pA.x, pA.y, pA.z);
        const kB = quantKey(pB.x, pB.y, pB.z);
        const kC = quantKey(pC.x, pC.y, pC.z);

        if (kA === kB || kB === kC || kA === kC) continue;

        addEdge(kA, kB, pA, pB);
        addEdge(kB, kC, pB, pC);
        addEdge(kC, kA, pC, pA);
      }

      edgeMap.forEach(entry => {
        totalEdges++;
        if (entry.count === 1) {
          boundaryEdges++;
          boundaryPositions.push(
            entry.p1.x, entry.p1.y, entry.p1.z,
            entry.p2.x, entry.p2.y, entry.p2.z
          );
        } else if (entry.count > 2) {
          nonManifoldEdges++;
          nonManifoldPositions.push(
            entry.p1.x, entry.p1.y, entry.p1.z,
            entry.p2.x, entry.p2.y, entry.p2.z
          );
        }
      });
    });

    manifoldStats = {
      boundaryEdges: boundaryEdges,
      nonManifoldEdges: nonManifoldEdges,
      isWatertight: totalEdges > 0 && boundaryEdges === 0 && nonManifoldEdges === 0,
      isManifold: totalEdges > 0 && nonManifoldEdges === 0
    };

    if (renderOverlay && window.scene) {
      clearManifoldOverlay();
      manifoldOverlayGroup = new THREE.Group();
      manifoldOverlayGroup.name = 'manifoldEdgeOverlay';
      manifoldOverlayGroup.userData._isAnalysisOverlay = true;

      if (boundaryPositions.length > 0) {
        const bGeom = new THREE.BufferGeometry();
        bGeom.setAttribute('position', new THREE.Float32BufferAttribute(boundaryPositions, 3));
        const bMat = new THREE.LineBasicMaterial({
          color: 0xff00ff,
          depthTest: true,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
          transparent: true,
          opacity: 0.95
        });
        const bLines = new THREE.LineSegments(bGeom, bMat);
        bLines.name = 'manifoldBoundaryEdges';
        bLines.userData._isAnalysisOverlay = true;
        bLines.renderOrder = 999;
        manifoldOverlayGroup.add(bLines);
      }

      if (nonManifoldPositions.length > 0) {
        const nmGeom = new THREE.BufferGeometry();
        nmGeom.setAttribute('position', new THREE.Float32BufferAttribute(nonManifoldPositions, 3));
        const nmMat = new THREE.LineBasicMaterial({
          color: 0xff2222,
          depthTest: true,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
          transparent: true,
          opacity: 0.95
        });
        const nmLines = new THREE.LineSegments(nmGeom, nmMat);
        nmLines.name = 'manifoldNonManifoldEdges';
        nmLines.userData._isAnalysisOverlay = true;
        nmLines.renderOrder = 1000;
        manifoldOverlayGroup.add(nmLines);
      }

      window.scene.add(manifoldOverlayGroup);
    }

    updateManifoldStatsUI();
    if (typeof window.requestRender === 'function') window.requestRender();
    return Object.assign({}, manifoldStats);
  }

  function toggleManifoldEdges(enabled, group) {
    if (enabled !== undefined) {
      isManifoldActive = Boolean(enabled);
    } else {
      isManifoldActive = !isManifoldActive;
    }

    if (!isManifoldActive) {
      clearManifoldOverlay();
      updateManifoldStatsUI();
      if (typeof window.requestRender === 'function') window.requestRender();
      return Object.assign({}, manifoldStats);
    }

    return analyzeManifoldEdges(group, true);
  }

  function resetAnalysisState() {
    clearCollisionHighlights();
    collisionResults = [];
    renderCollisionResultsUI();
    if (isComGizmoActive) {
      toggleCenterOfMassGizmo(false);
    }
    if (isDraftAngleActive) {
      toggleDraftAngleHeatmap(false);
    } else {
      hideDraftLegend();
    }
    if (isOverhangActive) {
      toggleOverhangHeatmap(false);
    }
    if (isManifoldActive) {
      toggleManifoldEdges(false);
    } else {
      clearManifoldOverlay();
    }
  }

  // ---------------------------------------------------------------------------
  // Public Namespace Export
  // ---------------------------------------------------------------------------
  window.CadAnalysis = {
    resetAnalysisState: resetAnalysisState,
    checkCollisions: checkAssemblyInterferences,
    clearCollisions: clearCollisionHighlights,
    toggleCoM: toggleCenterOfMassGizmo,
    toggleCenterOfMass: toggleCenterOfMassGizmo,
    computeCoM: computeCenterOfMass,
    isComActive: () => isComGizmoActive,
    refreshCoM: refreshComReadout,
    toggleDraftHeatmap: toggleDraftAngleHeatmap,
    toggleDraftAngle: toggleDraftAngleHeatmap,
    setDraftThreshold: setDraftThreshold,
    getDraftThreshold: () => draftThresholdDeg,
    isDraftActive: () => isDraftAngleActive,
    isDraftAngleActive: () => isDraftAngleActive,
    showDraftLegend: showDraftLegend,
    hideDraftLegend: hideDraftLegend,
    updateDraftLegendThreshold: updateDraftLegendThreshold,
    calculateDraftTicks: calculateDraftTicks,
    calculateDraftGraduations: calculateDraftGraduations,
    setPullPlane: setPullPlane,
    setPullDirectionFromPlane: setPullPlane,
    setPullDirectionVector: setCustomPullVector,
    setCustomPullVector: setCustomPullVector,
    flipPullDirection: flipPullDirection,
    startFacePicking: startFacePicking,
    stopFacePicking: stopFacePicking,
    handleFacePick: handleFacePick,
    isPickingFace: () => isPickingDraftFace,
    getCurrentPullVector: () => currentPullVector.clone(),
    getCurrentPullReference: () => currentPullReference,
    extractWorldNormalFromIntersection: extractWorldNormalFromIntersection,
    resolvePlaneNormal: resolvePlaneNormal,
    updateDraftPullArrow: updateDraftPullArrow,
    REFERENCE_PLANES: REFERENCE_PLANES,
    toggleOverhangHeatmap: toggleOverhangHeatmap,
    setOverhangThreshold: setOverhangThreshold,
    getOverhangThreshold: () => overhangThresholdDeg,
    setOverhangAxis: setOverhangAxis,
    getOverhangAxis: () => overhangAxis,
    isOverhangActive: () => isOverhangActive,
    getOverhangStats: () => Object.assign({}, overhangStats),
    toggleManifoldEdges: toggleManifoldEdges,
    analyzeManifoldEdges: analyzeManifoldEdges,
    isManifoldActive: () => isManifoldActive,
    getManifoldStats: () => Object.assign({}, manifoldStats)
  };

  window.checkAssemblyInterferences = checkAssemblyInterferences;
  window.clearCollisionHighlights = clearCollisionHighlights;
  window.toggleCenterOfMassGizmo = toggleCenterOfMassGizmo;
  window.toggleDraftAngleHeatmap = toggleDraftAngleHeatmap;
  window.showDraftLegend = showDraftLegend;
  window.hideDraftLegend = hideDraftLegend;
  window.toggleOverhangHeatmap = toggleOverhangHeatmap;
  window.setOverhangThreshold = setOverhangThreshold;
  window.setOverhangAxis = setOverhangAxis;
  window.toggleManifoldEdges = toggleManifoldEdges;
  window.analyzeManifoldEdges = analyzeManifoldEdges;
})();
