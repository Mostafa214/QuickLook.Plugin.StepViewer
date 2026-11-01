/**
 * Cross-Section View Engine
 * SolidWorks-Grade GPU Stencil Buffer Capping, 3D Glass Cutting Plane & Interactive Manipulator Arrow Gizmo
 */
(function () {
  let isSectionActive = false;
  let sectionAxis = 'x';
  let sectionFlipped = false;
  let isSectionCappingActive = true;
  let isSectionPlaneHelperActive = true;
  let sectionPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  let sectionBox = new THREE.Box3();
  let sectionStencilGroup = new THREE.Group();
  let sectionCapMesh = null;
  let sectionPlaneHelperMesh = null;
  let sectionGizmoMesh = null;
  let isDraggingSectionGizmo = false;
  let isSectionGizmoHovered = false;
  let sectionGizmoMatNormal = null;
  let sectionGizmoMatHover = null;

  function updateSectionPlane() {
    if (sectionBox.isEmpty()) return;
    const min = sectionBox.min;
    const max = sectionBox.max;
    const center = sectionBox.getCenter(new THREE.Vector3());
    const slider = document.getElementById('sec-slider');
    const val = slider ? (parseFloat(slider.value) / 100) : 0.5;

    const normal = new THREE.Vector3();
    let pos = 0;
    let centerCoord = 0;

    const axes = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
    const aVec = axes[sectionAxis] || [1, 0, 0];
    pos = min[sectionAxis] + (max[sectionAxis] - min[sectionAxis]) * val;
    centerCoord = center[sectionAxis];
    const sign = sectionFlipped ? 1 : -1;
    normal.set(aVec[0] * sign, aVec[1] * sign, aVec[2] * sign);
    sectionPlane.constant = sectionFlipped ? -pos : pos;
    sectionPlane.normal.copy(normal);

    const offsetMm = pos - centerCoord;
    const badge = document.getElementById('sec-offset-val');
    if (badge) {
      const sign = offsetMm > 0.005 ? '+' : '';
      const fmt = (typeof window.formatDim === 'function') ? window.formatDim(offsetMm) : (offsetMm.toFixed(2) + ' mm');
      badge.innerText = `${sectionAxis.toUpperCase()}: ${sign}${fmt}`;
    }

    updateSectionGizmos();
  }

  function updateSectionGizmos() {
    if (!isSectionActive) return;
    const normal = sectionPlane.normal;
    const planePos = normal.clone().multiplyScalar(-sectionPlane.constant);

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
    const arrowLen = Math.max(maxDim * 0.22, 22), shaftR = Math.max(arrowLen * 0.035, 1.0);
    const coneR = Math.max(arrowLen * 0.12, 3.2), coneLen = Math.max(arrowLen * 0.28, 7.5);
    const ringR = Math.max(arrowLen * 0.22, 5.5), tubeR = Math.max(shaftR * 1.2, 1.2);

    const gizmo = new THREE.Group();
    gizmo.name = 'sectionManipulatorGizmo';

    sectionGizmoMatNormal = new THREE.MeshStandardMaterial({
      color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.7, depthTest: false, depthWrite: false
    });
    sectionGizmoMatHover = new THREE.MeshStandardMaterial({
      color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.65, roughness: 0.2, metalness: 0.8, depthTest: false, depthWrite: false
    });

    const addMesh = (geom, mat, order = 10) => {
      const m = new THREE.Mesh(geom, mat);
      m.renderOrder = order;
      gizmo.add(m);
      return m;
    };

    addMesh(new THREE.TorusGeometry(ringR, tubeR, 16, 32), sectionGizmoMatNormal);
    addMesh(new THREE.CylinderGeometry(shaftR, shaftR, arrowLen, 16).rotateX(Math.PI / 2).translate(0, 0, arrowLen / 2), sectionGizmoMatNormal);
    addMesh(new THREE.ConeGeometry(coneR, coneLen, 24).rotateX(-Math.PI / 2).translate(0, 0, arrowLen + coneLen / 2), sectionGizmoMatNormal);
    addMesh(new THREE.CylinderGeometry(shaftR, shaftR, arrowLen * 0.7, 16).rotateX(Math.PI / 2).translate(0, 0, -arrowLen * 0.35), sectionGizmoMatNormal);
    addMesh(new THREE.ConeGeometry(coneR * 0.85, coneLen * 0.85, 24).rotateX(Math.PI / 2).translate(0, 0, -arrowLen * 0.7 - (coneLen * 0.85) / 2), sectionGizmoMatNormal);
    addMesh(new THREE.CylinderGeometry(coneR * 2.4, coneR * 2.4, (arrowLen + coneLen) * 2, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false, depthTest: false, depthWrite: false }));

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

  function dragSectionGizmoWithRay(raycaster, camera) {
    if (!isSectionActive || sectionBox.isEmpty()) return;

    const min = sectionBox.min;
    const max = sectionBox.max;
    const center = sectionBox.getCenter(new THREE.Vector3());
    const axisVec = new THREE.Vector3(sectionAxis === 'x' ? 1 : 0, sectionAxis === 'y' ? 1 : 0, sectionAxis === 'z' ? 1 : 0);

    const camDir = camera.getWorldDirection(new THREE.Vector3());
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

  function rebuildSectionStencilMeshes() {
    sectionStencilGroup.clear();
    sectionCapMesh = null;
    sectionPlaneHelperMesh = null;
    sectionGizmoMesh = null;
    isDraggingSectionGizmo = false;

    if (!isSectionActive) return;

    const boxSize = sectionBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z, 50);
    const modelBodies = window.modelBodies || [];

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

        const matBack = baseStencilMat.clone();
        matBack.side = THREE.BackSide;
        matBack.clippingPlanes = [sectionPlane];
        matBack.stencilFail = THREE.IncrementWrapStencilOp;
        matBack.stencilZFail = THREE.IncrementWrapStencilOp;
        matBack.stencilZPass = THREE.IncrementWrapStencilOp;

        const meshBack = new THREE.Mesh(b.mesh.geometry, matBack);
        meshBack.position.copy(b.mesh.position);
        meshBack.rotation.copy(b.mesh.rotation);
        meshBack.scale.copy(b.mesh.scale);
        meshBack.renderOrder = 1;
        sectionStencilGroup.add(meshBack);

        const matFront = baseStencilMat.clone();
        matFront.side = THREE.FrontSide;
        matFront.clippingPlanes = [sectionPlane];
        matFront.stencilFail = THREE.DecrementWrapStencilOp;
        matFront.stencilZFail = THREE.DecrementWrapStencilOp;
        matFront.stencilZPass = THREE.DecrementWrapStencilOp;

        const meshFront = new THREE.Mesh(b.mesh.geometry, matFront);
        meshFront.position.copy(b.mesh.position);
        meshFront.rotation.copy(b.mesh.rotation);
        meshFront.scale.copy(b.mesh.scale);
        meshFront.renderOrder = 1;
        sectionStencilGroup.add(meshFront);

        b.mesh.renderOrder = 2;
      });

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

      sectionGizmoMesh = createSectionGizmoMesh(boxSize);
      sectionStencilGroup.add(sectionGizmoMesh);
    }

    updateSectionGizmos();
  }

  function toggleSectionView(enable) {
    isSectionActive = (enable !== undefined) ? enable : !isSectionActive;
    window.isSectionActive = isSectionActive;
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
      sectionStencilGroup.clear();
      sectionCapMesh = null;
      sectionPlaneHelperMesh = null;
      sectionGizmoMesh = null;
      isDraggingSectionGizmo = false;
      highlightSectionGizmo(false);
      if (window.controls) window.controls.enabled = true;
    }

    if (window.modelGroup) {
      window.modelGroup.traverse((child) => {
        if (child.material) {
          child.material.clippingPlanes = isSectionActive ? [sectionPlane] : [];
          child.material.needsUpdate = true;
        }
      });
    }
  }

  function setSectionAxis(axis) {
    sectionAxis = axis;
    ['x', 'y', 'z'].forEach(a => {
      const b = document.getElementById(`btn-sec-${a}`);
      if (b) b.classList.remove('active');
    });
    const activeBtn = document.getElementById(`btn-sec-${axis}`);
    if (activeBtn) activeBtn.classList.add('active');
    updateSectionPlane();
    rebuildSectionStencilMeshes();
  }

  function setupUI() {
    const btnSection = document.getElementById('btn-section');
    if (btnSection) {
      btnSection.addEventListener('click', () => toggleSectionView());
    }

    const secSlider = document.getElementById('sec-slider');
    if (secSlider) {
      secSlider.addEventListener('input', () => updateSectionPlane());
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
        btnAxis.addEventListener('click', () => setSectionAxis(axis));
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
        } else {
          rebuildSectionStencilMeshes();
        }
      });
    }
  }

  function handlePointerDown(e) {
    if (!isSectionActive || !sectionGizmoMesh || !sectionGizmoMesh.visible || e.button !== 0) return false;
    const container = document.getElementById('canvas-container');
    if (!container || !window.camera) return false;
    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, window.camera);
    if (raycaster.intersectObjects(sectionGizmoMesh.children, true).length > 0) {
      isDraggingSectionGizmo = true;
      if (window.controls) window.controls.enabled = false;
      highlightSectionGizmo(true);
      container.style.cursor = 'ew-resize';
      return true;
    }
    return false;
  }

  function handlePointerMove(e) {
    const container = document.getElementById('canvas-container');
    if (!container || !window.camera) return false;
    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, window.camera);

    if (isDraggingSectionGizmo) {
      dragSectionGizmoWithRay(raycaster, window.camera);
      return true;
    }
    if (isSectionActive && sectionGizmoMesh && sectionGizmoMesh.visible && !window.isMeasureActive) {
      const hits = raycaster.intersectObjects(sectionGizmoMesh.children, true);
      if (hits.length > 0) {
        highlightSectionGizmo(true);
        container.style.cursor = 'grab';
        return true;
      } else if (isSectionGizmoHovered) {
        highlightSectionGizmo(false);
        container.style.cursor = '';
      }
    }
    return false;
  }

  function handlePointerUp() {
    if (isDraggingSectionGizmo) {
      isDraggingSectionGizmo = false;
      if (window.controls) window.controls.enabled = true;
      highlightSectionGizmo(false);
      const container = document.getElementById('canvas-container');
      if (container) container.style.cursor = '';
      return true;
    }
    return false;
  }

  const SectionEngine = {
    sectionPlane,
    sectionStencilGroup,
    setModelBox: (box) => { sectionBox.copy(box); },
    updateBox: (box) => { sectionBox.copy(box); },
    reset: () => toggleSectionView(false),
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    updateSectionPlane,
    updateSectionGizmos,
    rebuildSectionStencilMeshes,
    highlightSectionGizmo,
    dragSectionGizmoWithRay,
    toggleSectionView,
    setSectionAxis,
    setupUI,
    isActive: () => isSectionActive,
    getGizmoMesh: () => sectionGizmoMesh,
    isDragging: () => isDraggingSectionGizmo,
    setDragging: (val) => { isDraggingSectionGizmo = val; },
    isGizmoHovered: () => isSectionGizmoHovered
  };

  window.SectionEngine = SectionEngine;
  window.updateSectionPlane = updateSectionPlane;
  window.rebuildSectionStencilMeshes = rebuildSectionStencilMeshes;
  window.toggleSectionView = toggleSectionView;
  window.sectionStencilGroup = sectionStencilGroup;
  window.sectionPlane = sectionPlane;
})();
