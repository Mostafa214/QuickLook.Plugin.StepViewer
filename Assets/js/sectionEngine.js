/**
 * SolidWorks-Grade Cross-Section View & Stencil Capping Engine (v2.0.0 - Full Restored)
 * GPU stencil buffer capping, glass helper plane, interactive 3D arrow gizmo with ray-drag.
 */
    // Phase 2: Cross-Section View Functions (SolidWorks-Grade Stencil Capping & 3D Glass Plane)
    // =============================================================
    function getActiveSectionUnit() {
      if (typeof currentUnit !== 'undefined' && (currentUnit === 'in' || currentUnit === 'mm')) {
        return currentUnit;
      }
      if (typeof window !== 'undefined' && (window.currentUnit === 'in' || window.currentUnit === 'mm')) {
        return window.currentUnit;
      }
      return 'mm';
    }

    function updateSectionPlane(options) {
      if (sectionBox.isEmpty()) return;
      const opts = (options && typeof options === 'object') ? options : {};
      const min = sectionBox.min;
      const max = sectionBox.max;
      const center = sectionBox.getCenter(new THREE.Vector3());
      const slider = document.getElementById('sec-slider');
      const val = slider ? (parseFloat(slider.value) / 100) : 0.5;
      const clampedVal = isFinite(val) ? Math.max(0, Math.min(1, val)) : 0.5;

      const normal = new THREE.Vector3();
      let pos = 0;
      let centerCoord = 0;
      let rangeCoord = 0;

      if (sectionAxis === 'x') {
        rangeCoord = max.x - min.x;
        pos = min.x + rangeCoord * clampedVal;
        centerCoord = center.x;
        if (!sectionFlipped) {
          normal.set(-1, 0, 0);
          sectionPlane.constant = pos;
        } else {
          normal.set(1, 0, 0);
          sectionPlane.constant = -pos;
        }
      } else if (sectionAxis === 'y') {
        rangeCoord = max.y - min.y;
        pos = min.y + rangeCoord * clampedVal;
        centerCoord = center.y;
        if (!sectionFlipped) {
          normal.set(0, -1, 0);
          sectionPlane.constant = pos;
        } else {
          normal.set(0, 1, 0);
          sectionPlane.constant = -pos;
        }
      } else if (sectionAxis === 'z') {
        rangeCoord = max.z - min.z;
        pos = min.z + rangeCoord * clampedVal;
        centerCoord = center.z;
        if (!sectionFlipped) {
          normal.set(0, 0, -1);
          sectionPlane.constant = pos;
        } else {
          normal.set(0, 0, 1);
          sectionPlane.constant = -pos;
        }
      }
      sectionPlane.normal.copy(normal);

      // Live Physical Offset Badge & Numeric Offset Input Sync (relative to model center)
      const offsetMm = pos - centerCoord;
      const unit = getActiveSectionUnit();
      const decimals = unit === 'in' ? 3 : 2;
      const offsetUnit = unit === 'in' ? (offsetMm / 25.4) : offsetMm;
      const halfRangeUnit = unit === 'in' ? ((rangeCoord / 2) / 25.4) : (rangeCoord / 2);

      const badge = document.getElementById('sec-offset-val');
      if (badge) {
        const sign = offsetMm > 0.005 ? '+' : '';
        const formatted = (typeof formatDim === 'function')
          ? formatDim(offsetMm)
          : `${offsetUnit.toFixed(decimals)} ${unit}`;
        badge.innerText = `${sectionAxis.toUpperCase()}: ${sign}${formatted}`;
      }

      const unitEl = document.getElementById('sec-offset-unit');
      if (unitEl) {
        unitEl.innerText = unit;
      }

      const offsetInput = document.getElementById('sec-offset-input');
      if (offsetInput) {
        offsetInput.min = (-halfRangeUnit).toFixed(decimals);
        offsetInput.max = halfRangeUnit.toFixed(decimals);
        offsetInput.step = unit === 'in' ? '0.01' : '0.5';
        if (!opts.fromOffsetInput) {
          offsetInput.value = offsetUnit.toFixed(decimals);
        }
      }

      // Fast update of cap and helper transforms (60 FPS hardware accelerated)
      updateSectionGizmos();
    }

    function applySectionOffsetInput(rawVal, commit) {
      if (sectionBox.isEmpty()) return false;
      const offsetInput = document.getElementById('sec-offset-input');
      const valueStr = (rawVal !== undefined) ? rawVal : (offsetInput ? offsetInput.value : '');
      const parsed = parseFloat(valueStr);
      if (isNaN(parsed) || !isFinite(parsed)) return false;

      const unit = getActiveSectionUnit();
      const offsetMm = unit === 'in' ? (parsed * 25.4) : parsed;
      const min = sectionBox.min;
      const max = sectionBox.max;
      const center = sectionBox.getCenter(new THREE.Vector3());

      const minCoord = min[sectionAxis];
      const maxCoord = max[sectionAxis];
      const centerCoord = center[sectionAxis];
      const range = maxCoord - minCoord;
      if (range <= 1e-6) return false;

      const norm = Math.max(0, Math.min(1, (centerCoord + offsetMm - minCoord) / range));
      const slider = document.getElementById('sec-slider');
      if (slider) {
        slider.value = (norm * 100).toFixed(2);
      }
      updateSectionPlane({ fromOffsetInput: !commit });
      return true;
    }

    function updateSectionGizmos() {
      if (!isSectionActive) return;
      const normal = sectionPlane.normal;
      // Project modelCenter onto the cutting plane to lock the non-cutting dimensions directly to the model
      const modelCenter = (sectionBox && !sectionBox.isEmpty()) ? sectionBox.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0);
      const dist = normal.dot(modelCenter) + sectionPlane.constant;
      const planePos = modelCenter.clone().sub(normal.clone().multiplyScalar(dist));

      if (sectionCapMesh) {
        sectionCapMesh.position.copy(planePos);
        sectionCapMesh.lookAt(planePos.clone().add(normal));
        sectionCapMesh.visible = isSectionCappingActive;
      }

      if (sectionPlaneHelperMesh) {
        sectionPlaneHelperMesh.position.copy(planePos);
        sectionPlaneHelperMesh.lookAt(planePos.clone().add(normal));
        sectionPlaneHelperMesh.visible = isSectionPlaneHelperActive;
      }

      if (sectionGizmoMesh) {
        sectionGizmoMesh.position.copy(planePos);
        sectionGizmoMesh.lookAt(planePos.clone().add(normal));
        sectionGizmoMesh.visible = isSectionPlaneHelperActive;
      }
    }

    function createSectionGizmoMesh(boxSize) {
      const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z, 50);
      const arrowLen = Math.max(maxDim * 0.22, 22);
      const shaftR = Math.max(arrowLen * 0.035, 1.0);
      const coneR = Math.max(arrowLen * 0.12, 3.2);
      const coneLen = Math.max(arrowLen * 0.28, 7.5);
      const ringR = Math.max(arrowLen * 0.22, 5.5);
      const tubeR = Math.max(shaftR * 1.2, 1.2);

      const gizmo = new THREE.Group();
      gizmo.name = 'sectionManipulatorGizmo';

      sectionGizmoMatNormal = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.7,
        depthTest: false,
        depthWrite: false
      });
      sectionGizmoMatHover = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.65,
        roughness: 0.2,
        metalness: 0.8,
        depthTest: false,
        depthWrite: false
      });

      // 1. Center Collar Ring on cutting plane (XY plane in local space)
      const ringGeom = new THREE.TorusGeometry(ringR, tubeR, 16, 32);
      const ringMesh = new THREE.Mesh(ringGeom, sectionGizmoMatNormal);
      ringMesh.renderOrder = 10;
      gizmo.add(ringMesh);

      // 2. Forward Arrow Shaft along +Z (local normal direction)
      const shaftGeom = new THREE.CylinderGeometry(shaftR, shaftR, arrowLen, 16);
      shaftGeom.rotateX(Math.PI / 2);
      shaftGeom.translate(0, 0, arrowLen / 2);
      const shaftMesh = new THREE.Mesh(shaftGeom, sectionGizmoMatNormal);
      shaftMesh.renderOrder = 10;
      gizmo.add(shaftMesh);

      // 3. Forward Arrow Cone at the tip pointing +Z
      const coneGeom = new THREE.ConeGeometry(coneR, coneLen, 24);
      coneGeom.rotateX(-Math.PI / 2);
      coneGeom.translate(0, 0, arrowLen + coneLen / 2);
      const coneMesh = new THREE.Mesh(coneGeom, sectionGizmoMatNormal);
      coneMesh.renderOrder = 10;
      gizmo.add(coneMesh);

      // 4. Backward Arrow Shaft along -Z
      const backShaftGeom = new THREE.CylinderGeometry(shaftR, shaftR, arrowLen * 0.7, 16);
      backShaftGeom.rotateX(Math.PI / 2);
      backShaftGeom.translate(0, 0, -arrowLen * 0.35);
      const backShaftMesh = new THREE.Mesh(backShaftGeom, sectionGizmoMatNormal);
      backShaftMesh.renderOrder = 10;
      gizmo.add(backShaftMesh);

      // 5. Backward Arrow Cone at the tip pointing -Z
      const backConeGeom = new THREE.ConeGeometry(coneR * 0.85, coneLen * 0.85, 24);
      backConeGeom.rotateX(Math.PI / 2);
      backConeGeom.translate(0, 0, -arrowLen * 0.7 - (coneLen * 0.85) / 2);
      const backConeMesh = new THREE.Mesh(backConeGeom, sectionGizmoMatNormal);
      backConeMesh.renderOrder = 10;
      gizmo.add(backConeMesh);

      // 6. Invisible Hit Proxy Cylinder (larger radius covering both sides for easy clicking/dragging)
      const proxyLen = (arrowLen + coneLen) * 2;
      const proxyGeom = new THREE.CylinderGeometry(coneR * 2.4, coneR * 2.4, proxyLen, 16);
      proxyGeom.rotateX(Math.PI / 2);
      const proxyMat = new THREE.MeshBasicMaterial({
        visible: false,
        depthTest: false,
        depthWrite: false
      });
      const proxyMesh = new THREE.Mesh(proxyGeom, proxyMat);
      proxyMesh.renderOrder = 10;
      gizmo.add(proxyMesh);

      gizmo.renderOrder = 10;
      return gizmo;
    }

    function highlightSectionGizmo(active) {
      if (!sectionGizmoMesh) return;
      isSectionGizmoHovered = active;
      const targetMat = active ? sectionGizmoMatHover : sectionGizmoMatNormal;
      sectionGizmoMesh.children.forEach(child => {
        if (child.material && child.material !== targetMat && child.material.visible !== false) {
          child.material = targetMat;
        }
      });
    }

    function dragSectionGizmoWithRay(raycaster) {
      if (!isSectionActive || sectionBox.isEmpty()) return;

      const min = sectionBox.min;
      const max = sectionBox.max;
      const center = sectionBox.getCenter(new THREE.Vector3());

      const axisVec = new THREE.Vector3();
      if (sectionAxis === 'x') axisVec.set(1, 0, 0);
      else if (sectionAxis === 'y') axisVec.set(0, 1, 0);
      else axisVec.set(0, 0, 1);

      const camDir = camera.getWorldDirection(new THREE.Vector3());
      // Find drag plane normal that contains axisVec and faces camera: (axisVec x camDir) x axisVec
      let planeNormal = new THREE.Vector3().crossVectors(axisVec, camDir).cross(axisVec).normalize();
      if (planeNormal.lengthSq() < 0.01) {
        planeNormal.copy(camDir).negate();
      }

      const planePos = sectionGizmoMesh ? sectionGizmoMesh.position : center;
      const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePos);
      const hitPoint = new THREE.Vector3();

      if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
        const minVal = min[sectionAxis];
        const maxVal = max[sectionAxis];
        const range = maxVal - minVal;

        if (range > 1e-4) {
          let norm = (hitPoint[sectionAxis] - minVal) / range;
          norm = Math.max(0, Math.min(1, norm));
          const slider = document.getElementById('sec-slider');
          if (slider) {
            slider.value = (norm * 100).toFixed(1);
            updateSectionPlane();
          }
        }
      }
    }

    function disposeSectionGroup() {
      sectionStencilGroup.traverse((child) => {
        if (child.geometry && !child.userData?.sharedBodyGeometry) {
          const isShared = Array.isArray(modelBodies) && modelBodies.some(b => b.mesh && b.mesh.geometry === child.geometry);
          if (!isShared) child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      sectionStencilGroup.clear();
    }

    function rebuildSectionStencilMeshes() {
      disposeSectionGroup();
      sectionCapMesh = null;
      sectionPlaneHelperMesh = null;
      sectionGizmoMesh = null;
      isDraggingSectionGizmo = false;

      if (!isSectionActive) return;

      const boxSize = sectionBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z, 50);

      // 1. Build Stencil Shadow Meshes for each visible body if capping is active
      if (isSectionCappingActive) {
        const baseStencilMat = new THREE.MeshBasicMaterial({
          depthWrite: false,
          depthTest: false,
          colorWrite: false,
          stencilWrite: true,
          stencilFunc: THREE.AlwaysStencilFunc
        });

        modelBodies.forEach(b => {
          if (!b.mesh || !b.mesh.geometry || !b.mesh.visible) return;

          // Back faces: Increment stencil buffer where clipped by plane
          const matBack = baseStencilMat.clone();
          matBack.side = THREE.BackSide;
          matBack.clippingPlanes = [sectionPlane];
          matBack.stencilFail = THREE.IncrementWrapStencilOp;
          matBack.stencilZFail = THREE.IncrementWrapStencilOp;
          matBack.stencilZPass = THREE.IncrementWrapStencilOp;

          const meshBack = new THREE.Mesh(b.mesh.geometry, matBack);
          meshBack.userData.sharedBodyGeometry = true;
          meshBack.position.copy(b.mesh.position);
          meshBack.rotation.copy(b.mesh.rotation);
          meshBack.scale.copy(b.mesh.scale);
          meshBack.renderOrder = 1;
          sectionStencilGroup.add(meshBack);

          // Front faces: Decrement stencil buffer where clipped by plane
          const matFront = baseStencilMat.clone();
          matFront.side = THREE.FrontSide;
          matFront.clippingPlanes = [sectionPlane];
          matFront.stencilFail = THREE.DecrementWrapStencilOp;
          matFront.stencilZFail = THREE.DecrementWrapStencilOp;
          matFront.stencilZPass = THREE.DecrementWrapStencilOp;

          const meshFront = new THREE.Mesh(b.mesh.geometry, matFront);
          meshFront.userData.sharedBodyGeometry = true;
          meshFront.position.copy(b.mesh.position);
          meshFront.rotation.copy(b.mesh.rotation);
          meshFront.scale.copy(b.mesh.scale);
          meshFront.renderOrder = 1;
          sectionStencilGroup.add(meshFront);

          b.mesh.renderOrder = 2;
        });
        baseStencilMat.dispose();

        // 2. SolidWorks-Style Solid Cut Cap Plane Mesh
        const capGeom = new THREE.PlaneGeometry(maxDim * 4, maxDim * 4);
        const capMat = new THREE.MeshStandardMaterial({
          color: 0xea580c, // Technical SolidWorks cut amber/orange
          roughness: 0.35,
          metalness: 0.1,
          stencilWrite: true,
          stencilRef: 0,
          stencilFunc: THREE.NotEqualStencilFunc,
          stencilFail: THREE.ReplaceStencilOp,
          stencilZFail: THREE.ReplaceStencilOp,
          stencilZPass: THREE.ReplaceStencilOp,
          side: THREE.DoubleSide
        });
        sectionCapMesh = new THREE.Mesh(capGeom, capMat);
        sectionCapMesh.renderOrder = 1.1;
        sectionStencilGroup.add(sectionCapMesh);
      }

      // 3. 3D Glass Cutting Plane Helper with Luminous Outer Border
      if (isSectionPlaneHelperActive) {
        let w = 100, h = 100;
        if (sectionAxis === 'x') {
          w = Math.max(boxSize.z * 1.35, 20);
          h = Math.max(boxSize.y * 1.35, 20);
        } else if (sectionAxis === 'y') {
          w = Math.max(boxSize.x * 1.35, 20);
          h = Math.max(boxSize.z * 1.35, 20);
        } else {
          w = Math.max(boxSize.x * 1.35, 20);
          h = Math.max(boxSize.y * 1.35, 20);
        }

        const helperGeom = new THREE.PlaneGeometry(w, h);
        const helperMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        sectionPlaneHelperMesh = new THREE.Mesh(helperGeom, helperMat);

        const edgeGeom = new THREE.EdgesGeometry(helperGeom);
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0x38bdf8,
          linewidth: 2,
          transparent: true,
          opacity: 0.85
        });
        const edgeLine = new THREE.LineSegments(edgeGeom, edgeMat);
        sectionPlaneHelperMesh.add(edgeLine);
        sectionPlaneHelperMesh.renderOrder = 4;
        sectionStencilGroup.add(sectionPlaneHelperMesh);

        // 4. 3D Interactive Manipulator Arrow Gizmo
        sectionGizmoMesh = createSectionGizmoMesh(boxSize);
        sectionStencilGroup.add(sectionGizmoMesh);
      }

      updateSectionGizmos();
    }

    function toggleSectionView(enable) {
      isSectionActive = (enable !== undefined) ? enable : !isSectionActive;
      const btn = document.getElementById('btn-section');
      const panel = document.getElementById('section-panel');

      if (isSectionActive) {
        if (btn) btn.classList.add('active');
        if (panel) panel.style.display = 'flex';
        updateSectionPlane();
        rebuildSectionStencilMeshes();
      } else {
        if (btn) btn.classList.remove('active');
        if (panel) panel.style.display = 'none';
        disposeSectionGroup();
        sectionCapMesh = null;
        sectionPlaneHelperMesh = null;
        sectionGizmoMesh = null;
        isDraggingSectionGizmo = false;
        highlightSectionGizmo(false);
        if (controls) controls.enabled = true;
      }

      modelGroup.traverse((child) => {
        if (child.material) {
          child.material.clippingPlanes = isSectionActive ? [sectionPlane] : [];
          child.material.needsUpdate = true;
        }
      });
    }

    // =============================================================

// Section View Event Listeners
function setupSectionListeners() {
      // Cross-Section Cut View Controls
      // Note: #btn-section toolbar click is managed centrally by WorkbenchUI

      const secSlider = document.getElementById('sec-slider');
      if (secSlider) {
        secSlider.addEventListener('input', () => updateSectionPlane());
      }

      const secOffsetInput = document.getElementById('sec-offset-input');
      if (secOffsetInput) {
        secOffsetInput.addEventListener('input', () => applySectionOffsetInput(secOffsetInput.value, false));
        secOffsetInput.addEventListener('change', () => applySectionOffsetInput(secOffsetInput.value, true));
      }

      const btnSecCenter = document.getElementById('btn-sec-center');
      if (btnSecCenter) {
        btnSecCenter.addEventListener('click', () => {
          if (secSlider) {
            secSlider.value = 50;
            updateSectionPlane();
          }
        });
      }

      ['x', 'y', 'z'].forEach(axis => {
        const btnAxis = document.getElementById(`btn-sec-${axis}`);
        if (btnAxis) {
          btnAxis.addEventListener('click', () => {
            sectionAxis = axis;
            ['x', 'y', 'z'].forEach(a => {
              const b = document.getElementById(`btn-sec-${a}`);
              if (b) b.classList.remove('active');
            });
            btnAxis.classList.add('active');
            updateSectionPlane();
            rebuildSectionStencilMeshes();
          });
        }
      });

      const btnFlip = document.getElementById('btn-sec-flip');
      if (btnFlip) {
        btnFlip.addEventListener('click', () => {
          sectionFlipped = !sectionFlipped;
          btnFlip.classList.toggle('active', sectionFlipped);
          updateSectionPlane();
          rebuildSectionStencilMeshes();
        });
      }

      const btnSecCap = document.getElementById('btn-sec-cap');
      if (btnSecCap) {
        btnSecCap.addEventListener('click', () => {
          isSectionCappingActive = !isSectionCappingActive;
          btnSecCap.classList.toggle('active', isSectionCappingActive);
          rebuildSectionStencilMeshes();
        });
      }

      const btnSecPlane = document.getElementById('btn-sec-plane');
      if (btnSecPlane) {
        btnSecPlane.addEventListener('click', () => {
          isSectionPlaneHelperActive = !isSectionPlaneHelperActive;
          btnSecPlane.classList.toggle('active', isSectionPlaneHelperActive);
          if (sectionPlaneHelperMesh) {
            sectionPlaneHelperMesh.visible = isSectionPlaneHelperActive;
            if (sectionGizmoMesh) sectionGizmoMesh.visible = isSectionPlaneHelperActive;
          } else {
            rebuildSectionStencilMeshes();
          }
        });
      }

      // Smart Measurement Controls
}

// Window exports
window.updateSectionPlane = updateSectionPlane;
window.applySectionOffsetInput = applySectionOffsetInput;
window.updateSectionGizmos = updateSectionGizmos;
window.createSectionGizmoMesh = createSectionGizmoMesh;
window.highlightSectionGizmo = highlightSectionGizmo;
window.dragSectionGizmoWithRay = dragSectionGizmoWithRay;
window.rebuildSectionStencilMeshes = rebuildSectionStencilMeshes;
window.toggleSectionView = toggleSectionView;
window.setupSectionListeners = setupSectionListeners;
