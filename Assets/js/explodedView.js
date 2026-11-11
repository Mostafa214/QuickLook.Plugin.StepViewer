/**
 * Interactive CAD Exploded Assembly Engine & SolidWorks Trails (v2.0.0 - Full Restored)
 * Radial trajectory displacement, dashed engineering trails, camera auto-adaptation.
 */
    // Interactive CAD Exploded Assembly Engine & SolidWorks Trails
    // =============================================================
    let currentExplodeMode = 'radial'; // 'radial' | 'axial_x' | 'axial_y' | 'axial_z'

    function setExplodeMode(mode) {
      currentExplodeMode = mode || 'radial';
      document.querySelectorAll('.explode-mode-btn').forEach(btn => {
        if (btn.dataset.mode === currentExplodeMode) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      initExplodeVectors();
      if (typeof window.showToast === 'function') {
        window.showToast('Explode Trajectory: ' + currentExplodeMode.replace('_', ' ').toUpperCase());
      }
    }

    function initExplodeVectors() {
      if (explodeAnimId) {
        cancelAnimationFrame(explodeAnimId);
        explodeAnimId = null;
      }
      currentExplodePercent = 0;
      isExplodeInitialized = false;

      // Clear existing trails
      while (explodeTrailsGroup.children.length > 0) {
        const line = explodeTrailsGroup.children[0];
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
        explodeTrailsGroup.remove(line);
      }
      explodeTrailsGroup.visible = false;

      const slider = document.getElementById('explode-slider');
      const label = document.getElementById('explode-percent-label');
      const btnToggle = document.getElementById('btn-explode-toggle');
      const btnToolbar = document.getElementById('btn-explode');
      if (slider) slider.value = 0;
      if (label) label.innerText = '0%';
      if (btnToggle) btnToggle.innerText = 'Explode ⏵';
      if (btnToolbar) btnToolbar.classList.remove('active');

      if (!modelBodies || modelBodies.length <= 1) {
        return;
      }

      // 1. Calculate overall assembly bounding box and center
      const asmBox = new THREE.Box3();
      modelBodies.forEach(b => {
        b.mesh.position.set(0, 0, 0);
        b.mesh.updateMatrixWorld(true);
        const bBox = new THREE.Box3().setFromObject(b.mesh);
        if (!bBox.isEmpty()) {
          asmBox.union(bBox);
        }
      });

      const asmCenter = asmBox.getCenter(new THREE.Vector3());
      const asmSize = asmBox.getSize(new THREE.Vector3());
      const maxAsmDim = Math.max(asmSize.x, asmSize.y, asmSize.z, 10);

      // 2. Identify the Anchor Body (largest volume/base chassis stays grounded)
      let maxVol = -1;
      let anchorId = 0;
      modelBodies.forEach(b => {
        let vol = (b.data && b.data.volumeMm3) ? b.data.volumeMm3 : 0;
        if (vol <= 0) {
          const bBox = new THREE.Box3().setFromObject(b.mesh);
          const s = bBox.getSize(new THREE.Vector3());
          vol = s.x * s.y * s.z;
        }
        if (vol > maxVol) {
          maxVol = vol;
          anchorId = b.id;
        }
      });
      explodeAnchorBodyId = anchorId;

      // 3. Compute outward explosion directions and distances for each body
      const dashSize = Math.max(1.5, maxAsmDim * 0.02);
      const gapSize = Math.max(1.0, maxAsmDim * 0.015);

      modelBodies.forEach((b, idx) => {
        const geom = b.mesh ? b.mesh.geometry : null;
        const bBox = new THREE.Box3().setFromObject(b.mesh);
        const bCenter = bBox.getCenter(new THREE.Vector3());
        b.homeCenter = bCenter.clone();

        if (b.id === explodeAnchorBodyId) {
          // Anchor stays stationary at its home position
          b.explodeOffset = new THREE.Vector3(0, 0, 0);
          b.trailLine = null;
          return;
        }

        // Outward trajectory vector based on currentExplodeMode
        let dir = new THREE.Vector3();
        if (currentExplodeMode === 'axial_x') {
          const sign = Math.sign(bCenter.x - asmCenter.x) || (idx % 2 === 0 ? 1 : -1);
          dir.set(sign, 0, 0);
        } else if (currentExplodeMode === 'axial_y') {
          const sign = Math.sign(bCenter.y - asmCenter.y) || (idx % 2 === 0 ? 1 : -1);
          dir.set(0, sign, 0);
        } else if (currentExplodeMode === 'axial_z') {
          const sign = Math.sign(bCenter.z - asmCenter.z) || (idx % 2 === 0 ? 1 : -1);
          dir.set(0, 0, sign);
        } else {
          // Radial from assembly centroid
          dir = bCenter.clone().sub(asmCenter);
        }
        const distFromCenter = dir.length();

        if (distFromCenter < 1e-3) {
          // Centered/concentric part: explode outward along cylindrical axis or staggered angles
          const angle = (idx / modelBodies.length) * Math.PI * 2;
          const s = (geom && geom.boundingBox) ? geom.boundingBox.getSize(new THREE.Vector3()) : bBox.getSize(new THREE.Vector3());
          if (s.z > s.x * 1.5 && s.z > s.y * 1.5) {
            dir.set(0, 0, idx % 2 === 0 ? 1 : -1);
          } else if (s.y > s.x * 1.5 && s.y > s.z * 1.5) {
            dir.set(0, idx % 2 === 0 ? 1 : -1, 0);
          } else {
            dir.set(Math.cos(angle), (idx % 2 === 0 ? 0.4 : -0.4), Math.sin(angle));
          }
        }
        dir.normalize();

        // Balanced separation factor: parts separate clearly with visible daylight without flying out of bounds
        const spreadFactor = 0.55 + 0.45 * Math.min(1.8, distFromCenter / (maxAsmDim * 0.4));
        const maxDist = maxAsmDim * 0.45 * spreadFactor;
        b.explodeOffset = dir.multiplyScalar(maxDist);

        // SolidWorks-style Dashed Engineering Assembly Trail
        const trailMat = new THREE.LineDashedMaterial({
          color: 0x38bdf8,
          dashSize: dashSize,
          gapSize: gapSize,
          linewidth: 1,
          transparent: true,
          opacity: 0.8,
          depthTest: true
        });

        const lineGeom = new THREE.BufferGeometry();
        const coords = new Float32Array([
          b.homeCenter.x, b.homeCenter.y, b.homeCenter.z,
          b.homeCenter.x, b.homeCenter.y, b.homeCenter.z
        ]);
        lineGeom.setAttribute('position', new THREE.BufferAttribute(coords, 3));
        const line = new THREE.Line(lineGeom, trailMat);
        line.computeLineDistances();
        line.visible = false;
        explodeTrailsGroup.add(line);
        b.trailLine = line;
      });

      // 4. Precompute fully exploded bounding box and dynamic camera framing state
      const fullExplodedBox = new THREE.Box3();
      modelBodies.forEach(b => {
        if (b.mesh.geometry) {
          if (!b.mesh.geometry.boundingBox) b.mesh.geometry.computeBoundingBox();
          const bBox = b.mesh.geometry.boundingBox.clone();
          if (b.explodeOffset) {
            bBox.translate(b.explodeOffset);
          }
          fullExplodedBox.union(bBox);
        }
      });

      const fullExplodedCenter = fullExplodedBox.getCenter(new THREE.Vector3());
      const fullExplodedSize = fullExplodedBox.getSize(new THREE.Vector3());
      const maxExplodedDim = Math.max(fullExplodedSize.x, fullExplodedSize.y, fullExplodedSize.z, 10);

      const baseCamDist = computeSafeCameraDistance(asmBox, 1.25);
      // Generous framing distance so exploded assembly has breathing room and never clips
      const fullCamDist = Math.max(computeSafeCameraDistance(fullExplodedBox, 1.25), baseCamDist);

      explodeFrameState = {
        unexplodedCenter: asmCenter.clone(),
        fullExplodedCenter: fullExplodedCenter,
        baseCamDist: baseCamDist,
        fullCamDist: fullCamDist
      };

      isExplodeInitialized = true;
    }

    function setExplodeProgress(percent, updateUI = true, adaptCamera = true) {
      currentExplodePercent = Math.max(0, Math.min(100, percent));
      const factor = currentExplodePercent / 100.0;

      modelBodies.forEach(b => {
        if (!b.explodeOffset || b.id === explodeAnchorBodyId) {
          b.mesh.position.set(0, 0, 0);
          return;
        }
        b.mesh.position.copy(b.explodeOffset).multiplyScalar(factor);
        b.mesh.updateMatrixWorld(true);

        if (b.trailLine) {
          if (currentExplodePercent > 3 && isExplodeTrailsActive && !b.isHidden && (isolatedBodyId === null || isolatedBodyId === b.id)) {
            b.trailLine.visible = true;
            const positions = b.trailLine.geometry.attributes.position.array;
            // Point 0: Home socket center
            positions[0] = b.homeCenter.x;
            positions[1] = b.homeCenter.y;
            positions[2] = b.homeCenter.z;
            // Point 1: Current exploded mesh center
            positions[3] = b.homeCenter.x + b.mesh.position.x;
            positions[4] = b.homeCenter.y + b.mesh.position.y;
            positions[5] = b.homeCenter.z + b.mesh.position.z;
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

        if (slider && parseInt(slider.value, 10) !== Math.round(currentExplodePercent)) {
          slider.value = Math.round(currentExplodePercent);
        }
        if (label) {
          label.innerText = Math.round(currentExplodePercent) + '%';
        }
        if (btnToggle) {
          btnToggle.innerText = currentExplodePercent >= 50 ? 'Collapse ⏴' : 'Explode ⏵';
        }
        if (btnToolbar) {
          btnToolbar.classList.toggle('active', currentExplodePercent > 0);
        }
      }

      // Dynamic camera auto-centering & adaptive zoom (Zero-Clipping Invariant)
      if (adaptCamera && explodeFrameState) {
        const curCenter = explodeFrameState.unexplodedCenter.clone().lerp(explodeFrameState.fullExplodedCenter, factor);
        const curDist = explodeFrameState.baseCamDist + (explodeFrameState.fullCamDist - explodeFrameState.baseCamDist) * factor;

        // If Tree panel is open (takes ~280px on the left), offset target slightly so model is centered in visible canvas
        let finalTarget = curCenter.clone();
        if (isTreeActive && window.innerWidth > 600) {
          const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
          if (camera.isPerspectiveCamera && typeof camera.fov === 'number' && !isNaN(camera.fov)) {
            const fovRad = camera.fov * (Math.PI / 180);
            const offsetAmt = (curDist * Math.tan(fovRad / 2) * (camera.aspect || (window.innerWidth / window.innerHeight) || 1.0)) * 0.16;
            finalTarget.sub(camRight.multiplyScalar(offsetAmt));
          } else if (camera.isOrthographicCamera && typeof camera.right === 'number' && typeof camera.left === 'number') {
            const orthoWidth = (camera.right - camera.left) / (camera.zoom || 1.0);
            const offsetAmt = orthoWidth * 0.16;
            finalTarget.sub(camRight.multiplyScalar(offsetAmt));
          }
        }

        controls.target.copy(finalTarget);

        // Keep current viewing direction/angle, smoothly scale distance
        const viewDir = camera.position.clone().sub(controls.target);
        if (viewDir.lengthSq() > 1e-4) {
          viewDir.normalize();
          camera.position.copy(controls.target).add(viewDir.multiplyScalar(curDist));
        }
        camera.near = curDist / 100;
        camera.far = curDist * 100;
        camera.updateProjectionMatrix();
        controls.update();
      }

      if (isSectionActive && isSectionCappingActive) {
        rebuildSectionStencilMeshes();
      }
      if (typeof window.updateGroundContactShadow === 'function') {
        window.updateGroundContactShadow();
      }
    }

    function animateExplodeTo(targetPercent, duration = 600) {
      if (explodeAnimId) {
        cancelAnimationFrame(explodeAnimId);
        explodeAnimId = null;
      }
      const start = currentExplodePercent;
      const target = Math.max(0, Math.min(100, targetPercent));
      const delta = target - start;
      if (Math.abs(delta) < 0.5) {
        setExplodeProgress(target);
        return;
      }

      const startTime = performance.now();
      function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1.0, elapsed / duration);
        // Cubic ease-in-out
        const ease = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
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
      if (!modelBodies || modelBodies.length <= 1) {
        showToast('Exploded view requires an assembly with multiple parts');
        return;
      }
      if (!isExplodeInitialized) {
        initExplodeVectors();
      }
      // Ensure tree panel is opened in right drawer so user sees the progress slider
      if (window.WorkbenchUI) {
        window.WorkbenchUI.openDrawer('tree');
      } else if (!isTreeActive) {
        toggleTreePanel(true);
      }
      if (currentExplodePercent < 50) {
        animateExplodeTo(100);
      } else {
        animateExplodeTo(0);
      }
    }

    function resetExplodedView() {
      if (explodeAnimId) {
        cancelAnimationFrame(explodeAnimId);
        explodeAnimId = null;
      }
      currentExplodePercent = 0;
      setExplodeProgress(0);
      const slider = document.getElementById('explode-slider');
      const label = document.getElementById('explode-percent-label');
      const btnToggle = document.getElementById('btn-explode-toggle');
      const btnToolbar = document.getElementById('btn-explode');
      if (slider) slider.value = 0;
      if (label) label.innerText = '0%';
      if (btnToggle) btnToggle.innerText = 'Explode ⏵';
      if (btnToolbar) btnToolbar.classList.remove('active');
    }

    // =============================================================

// Exploded View Event Listeners
function setupExplodedViewListeners() {
      // Exploded Assembly View Listeners
      // =============================================================
      const btnToolbarExplode = document.getElementById('btn-explode');
      if (btnToolbarExplode) {
        btnToolbarExplode.addEventListener('click', () => {
          toggleExplode();
        });
      }

      const explodeSlider = document.getElementById('explode-slider');
      if (explodeSlider) {
        explodeSlider.addEventListener('input', (e) => {
          if (explodeAnimId) {
            cancelAnimationFrame(explodeAnimId);
            explodeAnimId = null;
          }
          if (!isExplodeInitialized) {
            initExplodeVectors();
          }
          const val = parseFloat(e.target.value);
          setExplodeProgress(val, true);
        });
      }

      const btnExplodeToggle = document.getElementById('btn-explode-toggle');
      if (btnExplodeToggle) {
        btnExplodeToggle.addEventListener('click', () => {
          toggleExplode();
        });
      }

      const chkExplodeTrails = document.getElementById('chk-explode-trails');
      if (chkExplodeTrails) {
        chkExplodeTrails.addEventListener('change', (e) => {
          isExplodeTrailsActive = e.target.checked;
          setExplodeProgress(currentExplodePercent, false);
        });
      }

      const btnExplodeReset = document.getElementById('btn-explode-reset');
      if (btnExplodeReset) {
        btnExplodeReset.addEventListener('click', () => {
          if (currentExplodePercent > 0) {
            animateExplodeTo(0, 450);
          }
        });
      }

}

// Window exports
window.initExplodeVectors = initExplodeVectors;
window.setExplodeProgress = setExplodeProgress;
window.animateExplodeTo = animateExplodeTo;
window.toggleExplode = toggleExplode;
window.resetExplodedView = resetExplodedView;
window.setupExplodedViewListeners = setupExplodedViewListeners;


window.setExplodeMode = setExplodeMode;

window.getExplodeMode = () => currentExplodeMode;

