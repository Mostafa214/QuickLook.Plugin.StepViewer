/**
 * CAD Exploded Assembly Engine
 * Manages dynamic multi-body radial explosions, dashed motion trails, and camera framing adaptation.
 */
(function () {
  let currentExplodePercent = 0;
  let isExplodeTrailsActive = true;
  let explodeTrailsGroup = new THREE.Group();
  let explodeAnimId = null;
  let explodeAnchorBodyId = null;
  let isExplodeInitialized = false;
  let explodeFrameState = null;

  function initExplodeVectors() {
    if (explodeAnimId) { cancelAnimationFrame(explodeAnimId); explodeAnimId = null; }
    currentExplodePercent = 0;
    isExplodeInitialized = false;
    explodeTrailsGroup.clear();
    explodeTrailsGroup.visible = false;

    const slider = document.getElementById('explode-slider');
    const label = document.getElementById('explode-percent-label');
    const btnToggle = document.getElementById('btn-explode-toggle');
    const btnToolbar = document.getElementById('btn-explode');
    if (slider) slider.value = 0;
    if (label) label.innerText = '0%';
    if (btnToggle) btnToggle.innerText = 'Explode';
    if (btnToolbar) btnToolbar.classList.remove('active');

    const modelBodies = window.modelBodies || [];
    if (modelBodies.length <= 1) return;

    const asmBox = new THREE.Box3();
    modelBodies.forEach(b => {
      if (b.mesh) {
        b.mesh.position.set(0, 0, 0);
        b.mesh.updateMatrixWorld(true);
        if (b.mesh.geometry) {
          if (!b.mesh.geometry.boundingBox) b.mesh.geometry.computeBoundingBox();
          asmBox.union(b.mesh.geometry.boundingBox.clone());
        }
      }
    });

    const asmCenter = asmBox.getCenter(new THREE.Vector3());
    const asmSize = asmBox.getSize(new THREE.Vector3());
    const maxAsmDim = Math.max(asmSize.x, asmSize.y, asmSize.z, 10);

    let maxVol = -1, anchorId = 0;
    modelBodies.forEach(b => {
      const vol = (b.data && b.data.volumeMm3) || (b.mesh && b.mesh.geometry && b.mesh.geometry.boundingBox ? b.mesh.geometry.boundingBox.getSize(new THREE.Vector3()).x : 0);
      if (vol > maxVol) { maxVol = vol; anchorId = b.id; }
    });
    explodeAnchorBodyId = anchorId;

    const dashSize = Math.max(1.5, maxAsmDim * 0.02);
    const gapSize = Math.max(1.0, maxAsmDim * 0.015);

    modelBodies.forEach((b, idx) => {
      if (!b.mesh || !b.mesh.geometry) return;
      if (!b.mesh.geometry.boundingBox) b.mesh.geometry.computeBoundingBox();
      b.homeCenter = b.mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
      if (b.id === explodeAnchorBodyId) {
        b.explodeOffset = new THREE.Vector3(0, 0, 0);
        b.trailLine = null;
        return;
      }
      let dir = b.homeCenter.clone().sub(asmCenter);
      const distFromCenter = dir.length();
      if (distFromCenter < 1e-3) {
        const angle = (idx / modelBodies.length) * Math.PI * 2;
        dir.set(Math.cos(angle), idx % 2 === 0 ? 0.4 : -0.4, Math.sin(angle));
      }
      dir.normalize();

      const spread = 0.55 + 0.45 * Math.min(1.8, distFromCenter / (maxAsmDim * 0.4));
      b.explodeOffset = dir.multiplyScalar(maxAsmDim * 0.45 * spread);

      const trailMat = new THREE.LineDashedMaterial({
        color: 0x38bdf8, dashSize, gapSize, linewidth: 1, transparent: true, opacity: 0.8, depthTest: true
      });
      const lineGeom = new THREE.BufferGeometry();
      const coords = new Float32Array([b.homeCenter.x, b.homeCenter.y, b.homeCenter.z, b.homeCenter.x, b.homeCenter.y, b.homeCenter.z]);
      lineGeom.setAttribute('position', new THREE.BufferAttribute(coords, 3));
      const line = new THREE.Line(lineGeom, trailMat);
      line.computeLineDistances();
      line.visible = false;
      explodeTrailsGroup.add(line);
      b.trailLine = line;
    });

    const fullExplodedBox = new THREE.Box3();
    modelBodies.forEach(b => {
      if (b.mesh && b.mesh.geometry) {
        const bBox = b.mesh.geometry.boundingBox.clone();
        if (b.explodeOffset) bBox.translate(b.explodeOffset);
        fullExplodedBox.union(bBox);
      }
    });

    const fullExplodedCenter = fullExplodedBox.getCenter(new THREE.Vector3());
    const baseDist = (typeof window.computeSafeCameraDistance === 'function') ? window.computeSafeCameraDistance(asmBox, 1.25) : 100;
    const fullDist = (typeof window.computeSafeCameraDistance === 'function') ? Math.max(window.computeSafeCameraDistance(fullExplodedBox, 1.25), baseDist) : 150;

    explodeFrameState = { unexplodedCenter: asmCenter.clone(), fullExplodedCenter, baseCamDist: baseDist, fullCamDist: fullDist };
    isExplodeInitialized = true;
  }

  function setExplodeProgress(percent, updateUI = true, adaptCamera = true) {
    currentExplodePercent = Math.max(0, Math.min(100, percent));
    const factor = currentExplodePercent / 100.0;
    const modelBodies = window.modelBodies || [];
    const isolatedId = window.isolatedBodyId !== undefined ? window.isolatedBodyId : null;

    modelBodies.forEach(b => {
      if (!b.mesh) return;
      if (!b.explodeOffset || b.id === explodeAnchorBodyId) { b.mesh.position.set(0, 0, 0); return; }
      b.mesh.position.copy(b.explodeOffset).multiplyScalar(factor);
      b.mesh.updateMatrixWorld(true);

      if (b.trailLine) {
        if (currentExplodePercent > 3 && isExplodeTrailsActive && !b.isHidden && (isolatedId === null || isolatedId === b.id)) {
          b.trailLine.visible = true;
          const pos = b.trailLine.geometry.attributes.position.array;
          pos[0] = b.homeCenter.x; pos[1] = b.homeCenter.y; pos[2] = b.homeCenter.z;
          pos[3] = b.homeCenter.x + b.mesh.position.x;
          pos[4] = b.homeCenter.y + b.mesh.position.y;
          pos[5] = b.homeCenter.z + b.mesh.position.z;
          b.trailLine.geometry.attributes.position.needsUpdate = true;
          b.trailLine.computeLineDistances();
        } else {
          b.trailLine.visible = false;
        }
      }
    });

    explodeTrailsGroup.visible = (currentExplodePercent > 3 && isExplodeTrailsActive);

    if (updateUI) {
      const slider = document.getElementById('explode-slider');
      const label = document.getElementById('explode-percent-label');
      const btnToggle = document.getElementById('btn-explode-toggle');
      const btnToolbar = document.getElementById('btn-explode');
      if (slider && parseInt(slider.value, 10) !== Math.round(currentExplodePercent)) slider.value = Math.round(currentExplodePercent);
      if (label) label.innerText = Math.round(currentExplodePercent) + '%';
      if (btnToggle) btnToggle.innerText = currentExplodePercent >= 50 ? 'Collapse' : 'Explode';
      if (btnToolbar) btnToolbar.classList.toggle('active', currentExplodePercent > 0);
    }

    if (adaptCamera && explodeFrameState && window.camera && window.controls) {
      const curCenter = explodeFrameState.unexplodedCenter.clone().lerp(explodeFrameState.fullExplodedCenter, factor);
      const curDist = explodeFrameState.baseCamDist + (explodeFrameState.fullCamDist - explodeFrameState.baseCamDist) * factor;
      window.controls.target.copy(curCenter);
      const viewDir = window.camera.position.clone().sub(window.controls.target);
      if (viewDir.lengthSq() > 1e-4) {
        viewDir.normalize();
        window.camera.position.copy(window.controls.target).add(viewDir.multiplyScalar(curDist));
      }
      window.controls.update();
    }

    if (window.isSectionActive && typeof window.rebuildSectionStencilMeshes === 'function') {
      window.rebuildSectionStencilMeshes();
    }
  }

  function animateExplodeTo(targetPercent, duration = 600) {
    if (explodeAnimId) { cancelAnimationFrame(explodeAnimId); explodeAnimId = null; }
    const start = currentExplodePercent;
    const target = Math.max(0, Math.min(100, targetPercent));
    const delta = target - start;
    if (Math.abs(delta) < 0.5) { setExplodeProgress(target); return; }

    const startTime = performance.now();
    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      setExplodeProgress(start + delta * ease);
      if (progress < 1.0) {
        explodeAnimId = requestAnimationFrame(step);
      } else {
        setExplodeProgress(target);
        explodeAnimId = null;
      }
    }
    explodeAnimId = requestAnimationFrame(step);
  }

  function toggleExplode() {
    const modelBodies = window.modelBodies || [];
    if (modelBodies.length <= 1) {
      if (typeof window.showToast === 'function') window.showToast('Exploded view requires multiple bodies');
      return;
    }
    if (!isExplodeInitialized) initExplodeVectors();
    if (typeof window.toggleTreePanel === 'function' && !window.isTreeActive) window.toggleTreePanel(true);
    if (currentExplodePercent < 50) animateExplodeTo(100);
    else animateExplodeTo(0);
  }

  function resetExplodedView() {
    if (explodeAnimId) { cancelAnimationFrame(explodeAnimId); explodeAnimId = null; }
    currentExplodePercent = 0;
    setExplodeProgress(0);
  }

  function setupUI() {
    const btnExplode = document.getElementById('btn-explode');
    if (btnExplode) btnExplode.addEventListener('click', () => toggleExplode());
    const btnExplodeToggle = document.getElementById('btn-explode-toggle');
    if (btnExplodeToggle) btnExplodeToggle.addEventListener('click', () => toggleExplode());
    const btnExplodeReset = document.getElementById('btn-explode-reset');
    if (btnExplodeReset) btnExplodeReset.addEventListener('click', () => resetExplodedView());
    const explodeSlider = document.getElementById('explode-slider');
    if (explodeSlider) explodeSlider.addEventListener('input', () => setExplodeProgress(parseFloat(explodeSlider.value)));

    const chkTrails = document.getElementById('chk-explode-trails');
    if (chkTrails) {
      chkTrails.addEventListener('change', () => {
        isExplodeTrailsActive = chkTrails.checked;
        explodeTrailsGroup.visible = (currentExplodePercent > 3 && isExplodeTrailsActive);
        (window.modelBodies || []).forEach(b => {
          if (b.trailLine) b.trailLine.visible = (currentExplodePercent > 3 && isExplodeTrailsActive && !b.isHidden);
        });
      });
    }
  }

  const ExplodedView = {
    explodeTrailsGroup,
    initExplodeVectors,
    setExplodeProgress,
    animateExplodeTo,
    toggleExplode,
    resetExplodedView,
    setupUI,
    getProgress: () => currentExplodePercent,
    isTrailsActive: () => isExplodeTrailsActive
  };

  window.ExplodedView = ExplodedView;
  window.explodeTrailsGroup = explodeTrailsGroup;
  window.initExplodeVectors = initExplodeVectors;
  window.setExplodeProgress = setExplodeProgress;
  window.toggleExplode = toggleExplode;
  window.resetExplodedView = resetExplodedView;
})();
