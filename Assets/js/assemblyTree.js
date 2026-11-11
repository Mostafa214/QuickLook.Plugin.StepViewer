/**
 * B-Rep Assembly Tree & Multi-Body Hierarchy Engine (v2.0.0 - Full Restored)
 * Manages body visibility, transparent ghost mode, isolation, B-Rep face inspection, and highlighting.
 */
// HTML entity escaping helper for safe DOM insertion (SEC-01)
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
  window.SecurityUtils = window.SecurityUtils || {};
  window.SecurityUtils.escapeHtml = escapeHtml;
}

    // CAD Assembly Tree & Multi-Body Controller (Studio Graphite)
    // =============================================================
    function toggleTreePanel(enable) {
      if (window.WorkbenchUI && typeof window.WorkbenchUI.toggleDrawer === 'function') {
        if (enable === true) {
          window.WorkbenchUI.openDrawer('tree');
        } else if (enable === false) {
          if (window.WorkbenchUI.getActiveTab?.() === 'tree') {
            window.WorkbenchUI.closeDrawer();
          }
        } else {
          window.WorkbenchUI.toggleDrawer('tree');
        }
        return;
      }
      isTreeActive = (enable !== undefined) ? enable : !isTreeActive;
      const panel = document.getElementById('tree-panel');
      const btn = document.getElementById('btn-tree');
      if (panel) panel.style.display = isTreeActive ? 'flex' : 'none';
      if (btn) btn.classList.toggle('active', isTreeActive);
    }

    function buildModelTree(meshes) {
      const container = document.getElementById('tree-content');
      const countBadge = document.getElementById('tree-body-count');
      if (!container) return;
      container.innerHTML = '';

      const bodyCount = modelBodies.length;
      if (countBadge) {
        countBadge.innerText = `${bodyCount} ${bodyCount === 1 ? 'Solid' : 'Bodies'}`;
      }

      // Initialize Exploded Assembly vectors and UI visibility
      initExplodeVectors();
      const explodeSec = document.getElementById('tree-explode-section');
      const btnExplode = document.getElementById('btn-explode');
      if (explodeSec) {
        explodeSec.style.display = bodyCount > 1 ? 'block' : 'none';
      }
      if (btnExplode) {
        btnExplode.style.opacity = bodyCount > 1 ? '1' : '0.45';
        btnExplode.title = bodyCount > 1 ? 'Exploded Assembly View [X]' : 'Exploded View (Requires Assembly with 2+ parts)';
      }

      if (bodyCount === 0) {
        container.innerHTML = '<div style="color:#64748b; font-size:11px; text-align:center; padding:16px;">No 3D solids in model</div>';
        return;
      }

      modelBodies.forEach((b) => {
        const node = document.createElement('div');
        node.className = `tree-node ${b.isHidden ? 'hidden-body' : ''} ${isolatedBodyId === b.id ? 'isolated' : ''}`;
        node.id = `tree-node-${b.id}`;

        const colorHex = '#' + b.mesh.material.color.getHexString();
        const volVal = b.data.volumeMm3 || 0;
        const volCm3 = (volVal / 1000.0).toFixed(1);
        const facesCount = (b.data.brepFaces && b.data.brepFaces.length) || 0;
        const triCount = b.data.index ? Math.round(b.data.index.length / 3).toLocaleString() : '0';
        const safeName = escapeHtml(b.name);

        node.innerHTML = `
          <div class="tree-node-top">
            <div class="tree-node-info" title="Double-click to Zoom, Click to Highlight">
              <span class="tree-color-swatch" style="background-color: ${colorHex};" title="Click to Change Body Color & 3D Print Material"></span>
              <span class="tree-node-name" title="${safeName}">${safeName}</span>
            </div>
            <div class="tree-node-actions">
              <button class="btn-tree-action btn-tree-vis ${b.isHidden ? '' : 'active'}" title="Toggle Visibility [👁️]" data-id="${b.id}">
                ${b.isHidden ? '🚫' : '👁️'}
              </button>
              <button class="btn-tree-action btn-tree-ghost ${b.isGhosted ? 'active' : ''}" title="Toggle Transparent X-Ray [👻]" data-id="${b.id}">
                👻
              </button>
              <button class="btn-tree-action btn-tree-isolate ${isolatedBodyId === b.id ? 'active' : ''}" title="Isolate Body [🎯]" data-id="${b.id}">
                🎯
              </button>
            </div>
          </div>
          <div class="tree-node-meta">
            <span>${volCm3} cm³</span>
            <span>•</span>
            <span>${facesCount} Faces</span>
            <span>•</span>
            <span>${triCount} Tri</span>
          </div>
          ${facesCount > 0 ? `
            <div class="tree-faces-toggle" data-id="${b.id}">
              <span class="tree-chevron">▶</span> <span>B-Rep Faces (${facesCount})</span>
            </div>
            <div class="tree-faces-list" id="tree-faces-${b.id}" style="display: none;"></div>
          ` : ''}
        `;

        // Defense-in-depth: Programmatic textContent assignment ensuring plain-text rendering (SEC-01)
        const nameSpan = node.querySelector('.tree-node-name');
        if (nameSpan) {
          nameSpan.textContent = b.name || '';
          nameSpan.title = b.name || '';
        }

        const topEl = node.querySelector('.tree-node-top');
        if (topEl) {
          topEl.addEventListener('mouseenter', () => previewBodyInScene(b.id));
          topEl.addEventListener('mouseleave', () => clearBodyPreview());
          topEl.addEventListener('click', (e) => {
            if (e.target.closest('.tree-node-actions') || e.target.closest('.tree-color-swatch') || e.target.closest('button')) return;
            e.stopPropagation();
            selectAndFocusBody(b.id);
          });
        }

        const swatch = node.querySelector('.tree-color-swatch');
        if (swatch) {
          swatch.addEventListener('click', (e) => {
            e.stopPropagation();
            openColorPickerPopover(b.id, swatch);
          });
        }

        const btnVis = node.querySelector('.btn-tree-vis');
        if (btnVis) {
          btnVis.addEventListener('click', (e) => {
            e.stopPropagation();
            setBodyVisibility(b.id);
          });
        }

        const btnGhost = node.querySelector('.btn-tree-ghost');
        if (btnGhost) {
          btnGhost.addEventListener('click', (e) => {
            e.stopPropagation();
            setBodyGhostMode(b.id);
          });
        }

        const btnIso = node.querySelector('.btn-tree-isolate');
        if (btnIso) {
          btnIso.addEventListener('click', (e) => {
            e.stopPropagation();
            isolateBody(b.id);
          });
        }

        const facesToggle = node.querySelector('.tree-faces-toggle');
        if (facesToggle) {
          facesToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const facesList = node.querySelector(`#tree-faces-${b.id}`);
            const chevron = facesToggle.querySelector('.tree-chevron');
            if (!facesList) return;
            const isExp = facesList.style.display !== 'none';
            if (isExp) {
              facesList.style.display = 'none';
              if (chevron) chevron.innerText = '▶';
            } else {
              facesList.style.display = 'flex';
              if (chevron) chevron.innerText = '▼';
              if (facesList.children.length === 0) {
                renderFacesSubList(b.id, facesList);
              }
            }
          });
        }

        container.appendChild(node);
      });
    }

    function renderFacesSubList(bodyId, container) {
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b || !b.data.brepFaces) return;
      const faces = b.data.brepFaces;
      const maxInitial = 25;
      const listToRender = faces.slice(0, maxInitial);

      function createFaceItem(face) {
        const fItem = document.createElement('div');
        fItem.className = 'tree-face-item';
        fItem.dataset.bodyId = bodyId;
        fItem.dataset.faceId = face.id;
        if (selectedFaceInfo && selectedFaceInfo.bodyId === bodyId && selectedFaceInfo.faceId === face.id) {
          fItem.classList.add('active');
        }
        const areaStr = formatArea(face.areaMm2);
        fItem.innerHTML = `<span>Face #${face.id}</span> <span style="color:#64748b;">${areaStr}</span>`;

        fItem.addEventListener('mouseenter', () => {
          previewFaceInScene(bodyId, face);
        });
        fItem.addEventListener('mouseleave', () => {
          clearFacePreview();
        });
        fItem.addEventListener('click', (e) => {
          e.stopPropagation();
          if (selectedFaceInfo && selectedFaceInfo.bodyId === bodyId && selectedFaceInfo.faceId === face.id) {
            deselectFace();
            showToast(`Deselected Face #${face.id}`);
          } else {
            selectAndFocusFace(bodyId, face, fItem);
          }
        });
        return fItem;
      }

      listToRender.forEach(face => {
        container.appendChild(createFaceItem(face));
      });

      if (faces.length > maxInitial) {
        const moreItem = document.createElement('div');
        moreItem.className = 'tree-face-item';
        moreItem.style.color = '#38bdf8';
        moreItem.style.fontWeight = '600';
        moreItem.innerText = `+ ${faces.length - maxInitial} more faces...`;
        moreItem.addEventListener('click', (e) => {
          e.stopPropagation();
          moreItem.remove();
          faces.slice(maxInitial).forEach(face => {
            container.appendChild(createFaceItem(face));
          });
        });
        container.appendChild(moreItem);
      }
    }

    function setBodyVisibility(bodyId, visible) {
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b) return;
      b.isHidden = (visible !== undefined) ? !visible : !b.isHidden;
      if (isolatedBodyId === null) {
        b.mesh.visible = !b.isHidden;
        if (b.trailLine) {
          b.trailLine.visible = (!b.isHidden && currentExplodePercent > 3 && isExplodeTrailsActive);
        }
      }
      updateTreeItemState(bodyId);
    }

    function setBodyGhostMode(bodyId, enableGhost) {
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b) return;
      b.isGhosted = (enableGhost !== undefined) ? enableGhost : !b.isGhosted;

      if (b.isGhosted) {
        b.material.transparent = true;
        b.material.opacity = 0.22;
        b.material.depthWrite = false;
        b.mesh.renderOrder = 10;
        if (b.edgeMesh && b.edgesMat) {
          b.edgesMat.opacity = 0.45;
        }
      } else {
        b.material.transparent = false;
        b.material.opacity = 1.0;
        b.material.depthWrite = true;
        b.mesh.renderOrder = 0;
        if (b.edgeMesh && b.edgesMat) {
          b.edgesMat.opacity = 0.85;
        }
      }
      b.material.needsUpdate = true;
      updateTreeItemState(bodyId);
    }

    function isolateBody(bodyId) {
      if (isolatedBodyId === bodyId) {
        resetBodyIsolation();
        return;
      }
      isolatedBodyId = bodyId;
      modelBodies.forEach(b => {
        b.mesh.visible = (b.id === bodyId);
        if (b.trailLine) {
          b.trailLine.visible = (b.id === bodyId && currentExplodePercent > 3 && isExplodeTrailsActive);
        }
      });
      zoomToBody(bodyId);
      showIsolateBanner(bodyId);
      updateAllTreeNodes();
    }

    function resetBodyIsolation() {
      isolatedBodyId = null;
      modelBodies.forEach(b => {
        b.mesh.visible = !b.isHidden;
        if (b.trailLine) {
          b.trailLine.visible = (!b.isHidden && currentExplodePercent > 3 && isExplodeTrailsActive);
        }
      });
      hideIsolateBanner();
      updateAllTreeNodes();
    }

    function zoomToBody(bodyId) {
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b || !b.mesh) return;
      const box = new THREE.Box3().setFromObject(b.mesh);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const vFovRad = THREE.MathUtils.degToRad(camera.fov);
      let dist = (maxDim / 2) / Math.tan(vFovRad / 2);
      dist = Math.max(dist * 1.6, 5);

      const dir = camera.position.clone().sub(controls.target).normalize();
      if (dir.lengthSq() < 0.1) dir.set(1, 1, 1).normalize();
      const newPos = center.clone().add(dir.multiplyScalar(dist));
      tweenCamera(newPos, center, camera.up, 350);
    }

    function previewBodyInScene(bodyId) {
      if (selectedBodyId === bodyId) return;
      clearBodyPreview();
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b || !b.material) return;
      previewBodyId = bodyId;
      b.material.emissive = new THREE.Color(0x004466);
      if (b.edgesMat) {
        b.edgesMat.color = new THREE.Color(0x00f0ff);
        b.edgesMat.opacity = 1.0;
      }
    }

    function clearBodyPreview() {
      if (previewBodyId !== null) {
        const b = modelBodies.find(item => item.id === previewBodyId);
        if (b && b.material && selectedBodyId !== previewBodyId) {
          b.material.emissive = new THREE.Color(0x000000);
          if (b.edgesMat) {
            b.edgesMat.color = new THREE.Color(0x14171d);
            b.edgesMat.opacity = b.isGhosted ? 0.45 : 0.85;
          }
        }
        previewBodyId = null;
      }
    }

    function selectAndFocusBody(bodyId) {
      clearBodyPreview();

      // Toggle off if already selected
      if (selectedBodyId === bodyId) {
        deselectBody();
        const b = modelBodies.find(item => item.id === bodyId);
        showToast(`Deselected ${b ? b.name : 'Body'}`);
        return;
      }

      // Clear previous body or face selection
      deselectFace();
      deselectBody();

      const b = modelBodies.find(item => item.id === bodyId);
      if (!b || !b.material) return;

      if (b.isHidden) {
        setBodyVisibility(bodyId, true);
      }

      selectedBodyId = bodyId;
      b.material.emissive = new THREE.Color(0x004d73);
      if (b.edgesMat) {
        b.edgesMat.color = new THREE.Color(0x00f0ff);
        b.edgesMat.opacity = 1.0;
      }

      // Update tree node active class
      document.querySelectorAll('.tree-node.active-body').forEach(el => el.classList.remove('active-body'));
      const node = document.getElementById(`tree-node-${bodyId}`);
      if (node) node.classList.add('active-body');

      const volVal = b.data.volumeMm3 || 0;
      const volCm3 = (volVal / 1000.0).toFixed(1);
      const facesCount = (b.data.brepFaces && b.data.brepFaces.length) || 0;
      showToast(`Selected Body: ${b.name} | ${volCm3} cm³ (${facesCount} Faces)`);

      zoomToBody(bodyId);
    }

    function deselectBody() {
      if (selectedBodyId !== null) {
        const b = modelBodies.find(item => item.id === selectedBodyId);
        if (b && b.material) {
          b.material.emissive = new THREE.Color(0x000000);
          if (b.edgesMat) {
            b.edgesMat.color = new THREE.Color(0x14171d);
            b.edgesMat.opacity = b.isGhosted ? 0.45 : 0.85;
          }
        }
        selectedBodyId = null;
      }
      clearBodyPreview();
      document.querySelectorAll('.tree-node.active-body').forEach(el => el.classList.remove('active-body'));
    }

    function highlightBodyInScene(bodyId, enable) {
      if (enable) previewBodyInScene(bodyId);
      else clearBodyPreview();
    }

    function disposeHighlightGroup(group) {
      if (!group) return;
      scene.remove(group);
      group.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }

    function createFaceHighlightGroup(bodyId, face, isPersistent) {
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b || !b.mesh) return null;

      const fullGeom = b.mesh.geometry;
      const posAttr = fullGeom.attributes.position;
      const idxAttr = fullGeom.index;
      if (!posAttr || !idxAttr) return null;

      const numTris = idxAttr.count / 3;
      const subIdx = [];
      const edgeMap = new Map();

      function addFaceEdge(v0, v1) {
        const min = v0 < v1 ? v0 : v1;
        const max = v0 < v1 ? v1 : v0;
        const key = `${min}_${max}`;
        const entry = edgeMap.get(key);
        if (entry) {
          entry.count++;
        } else {
          edgeMap.set(key, { a: min, b: max, count: 1 });
        }
      }

      for (let t = face.first; t <= face.last && t < numTris; t++) {
        const i0 = idxAttr.getX(t * 3);
        const i1 = idxAttr.getX(t * 3 + 1);
        const i2 = idxAttr.getX(t * 3 + 2);
        subIdx.push(i0, i1, i2);

        addFaceEdge(i0, i1);
        addFaceEdge(i1, i2);
        addFaceEdge(i2, i0);
      }
      if (subIdx.length === 0) return null;

      const group = new THREE.Group();
      group.name = isPersistent ? 'selected_face_highlight' : 'preview_face_highlight';

      // 1. Surface Mesh (Luminous electric cyan / sky cyan)
      const hGeom = new THREE.BufferGeometry();
      hGeom.setAttribute('position', posAttr);
      hGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(subIdx), 1));

      const fillColor = isPersistent ? 0x00f0ff : 0x38bdf8;
      const fillMat = new THREE.MeshBasicMaterial({
        color: fillColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isPersistent ? 0.65 : 0.45,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
      const faceMesh = new THREE.Mesh(hGeom, fillMat);
      faceMesh.renderOrder = 998;
      group.add(faceMesh);

      // 2. Perimeter Boundary Contour (Edges that belong to only 1 triangle in this face)
      const boundaryIndices = [];
      for (const edge of edgeMap.values()) {
        if (edge.count === 1) {
          boundaryIndices.push(edge.a, edge.b);
        }
      }

      if (boundaryIndices.length > 0) {
        const edgeGeom = new THREE.BufferGeometry();
        edgeGeom.setAttribute('position', posAttr);
        edgeGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(boundaryIndices), 1));

        // Sharp depth-tested contour line
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0x00ffff,
          linewidth: 2,
          transparent: true,
          opacity: 0.95,
          depthTest: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4
        });
        const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
        edgeLines.renderOrder = 999;
        group.add(edgeLines);

        // Faint X-ray pass for occluded edges so the contour is visible from any angle
        const ghostMat = new THREE.LineBasicMaterial({
          color: 0x00ffff,
          transparent: true,
          opacity: 0.25,
          depthTest: false
        });
        const ghostLines = new THREE.LineSegments(edgeGeom, ghostMat);
        ghostLines.renderOrder = 997;
        group.add(ghostLines);
      }

      // Sync transform with body mesh
      b.mesh.updateWorldMatrix(true, false);
      group.matrix.copy(b.mesh.matrixWorld);
      group.matrixAutoUpdate = false;

      return group;
    }

    function previewFaceInScene(bodyId, face) {
      if (selectedFaceInfo && selectedFaceInfo.bodyId === bodyId && selectedFaceInfo.faceId === face.id) {
        return; // Already selected and prominently visible
      }
      clearFacePreview();
      previewFaceGroup = createFaceHighlightGroup(bodyId, face, false);
      if (previewFaceGroup) {
        scene.add(previewFaceGroup);
      }
    }

    function clearFacePreview() {
      if (previewFaceGroup) {
        disposeHighlightGroup(previewFaceGroup);
        previewFaceGroup = null;
      }
    }

    function deselectFace() {
      if (selectedFaceGroup) {
        disposeHighlightGroup(selectedFaceGroup);
        selectedFaceGroup = null;
      }
      if (previewFaceGroup) {
        disposeHighlightGroup(previewFaceGroup);
        previewFaceGroup = null;
      }
      selectedFaceInfo = null;
      document.querySelectorAll('.tree-face-item.active').forEach(el => el.classList.remove('active'));
    }

    function selectAndFocusFace(bodyId, face, fItem) {
      clearFacePreview();
      deselectBody();

      const b = modelBodies.find(item => item.id === bodyId);
      if (b && b.isHidden) {
        setBodyVisibility(bodyId, true);
      }

      if (selectedFaceGroup) {
        disposeHighlightGroup(selectedFaceGroup);
        selectedFaceGroup = null;
      }

      selectedFaceInfo = { bodyId, faceId: face.id };
      selectedFaceGroup = createFaceHighlightGroup(bodyId, face, true);
      if (selectedFaceGroup) {
        scene.add(selectedFaceGroup);
      }

      document.querySelectorAll('.tree-face-item.active').forEach(el => el.classList.remove('active'));
      if (fItem) {
        fItem.classList.add('active');
      } else {
        const target = document.querySelector(`.tree-face-item[data-body-id="${bodyId}"][data-face-id="${face.id}"]`);
        if (target) target.classList.add('active');
      }

      const faceAreaStr = formatArea(face.areaMm2);
      showToast(`Selected Face #${face.id} | ${faceAreaStr} (${face.triangleCount} Tri)`);

      focusOnFace(bodyId, face);
    }

    function highlightFaceInScene(bodyId, face) {
      selectAndFocusFace(bodyId, face, null);
    }

    function focusOnFace(bodyId, face) {
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b || !b.mesh) return;

      const fullGeom = b.mesh.geometry;
      const posAttr = fullGeom.attributes.position;
      const idxAttr = fullGeom.index;
      if (!posAttr || !idxAttr) return;

      const numTris = idxAttr.count / 3;
      let totalArea = 0;
      const centroidSum = new THREE.Vector3();
      const normalSum = new THREE.Vector3();
      const vA = new THREE.Vector3();
      const vB = new THREE.Vector3();
      const vC = new THREE.Vector3();
      const edgeAB = new THREE.Vector3();
      const edgeAC = new THREE.Vector3();
      const triNormal = new THREE.Vector3();
      const faceVertices = [];

      for (let t = face.first; t <= face.last && t < numTris; t++) {
        const i0 = idxAttr.getX(t * 3);
        const i1 = idxAttr.getX(t * 3 + 1);
        const i2 = idxAttr.getX(t * 3 + 2);

        vA.fromBufferAttribute(posAttr, i0);
        vB.fromBufferAttribute(posAttr, i1);
        vC.fromBufferAttribute(posAttr, i2);

        faceVertices.push(vA.clone(), vB.clone(), vC.clone());

        edgeAB.subVectors(vB, vA);
        edgeAC.subVectors(vC, vA);
        triNormal.crossVectors(edgeAB, edgeAC);
        const doubleArea = triNormal.length();

        if (doubleArea > 1e-10) {
          const area = doubleArea * 0.5;
          totalArea += area;
          normalSum.add(triNormal); // weighted by area
          const triCenter = vA.clone().add(vB).add(vC).multiplyScalar(1 / 3);
          centroidSum.add(triCenter.multiplyScalar(area));
        }
      }

      let faceCenterLocal = new THREE.Vector3();
      if (totalArea > 1e-10) {
        faceCenterLocal.copy(centroidSum).multiplyScalar(1 / totalArea);
      } else if (faceVertices.length > 0) {
        faceVertices.forEach(v => faceCenterLocal.add(v));
        faceCenterLocal.multiplyScalar(1 / faceVertices.length);
      }

      let faceNormalLocal = new THREE.Vector3(0, 1, 0);
      if (normalSum.lengthSq() > 1e-10) {
        faceNormalLocal.copy(normalSum).normalize();
      } else if (faceVertices.length >= 3) {
        edgeAB.subVectors(faceVertices[1], faceVertices[0]);
        edgeAC.subVectors(faceVertices[2], faceVertices[0]);
        faceNormalLocal.crossVectors(edgeAB, edgeAC).normalize();
      }

      b.mesh.updateWorldMatrix(true, false);
      const worldCenter = faceCenterLocal.clone().applyMatrix4(b.mesh.matrixWorld);
      const worldNormal = faceNormalLocal.clone().transformDirection(b.mesh.matrixWorld).normalize();

      // Calculate maximum bounding radius from centroid in world space
      let maxRadius = 0;
      for (let i = 0; i < faceVertices.length; i++) {
        const wv = faceVertices[i].clone().applyMatrix4(b.mesh.matrixWorld);
        const dist = wv.distanceTo(worldCenter);
        if (dist > maxRadius) maxRadius = dist;
      }
      maxRadius = Math.max(maxRadius, 2.0); // minimum 2mm radius

      // Framing distance: fit face nicely within camera FOV
      const vFovRad = THREE.MathUtils.degToRad(camera.fov || 45);
      const aspect = camera.aspect || (window.innerWidth / window.innerHeight) || 1.0;
      const tanHalfFov = Math.tan(vFovRad / 2);
      const effectiveTan = Math.min(tanHalfFov, tanHalfFov * aspect);
      let dist = (maxRadius / effectiveTan) * 1.75;
      dist = Math.max(dist, 12.0);
      if (typeof currentModelDistance === 'number' && currentModelDistance > 0) {
        dist = Math.min(dist, currentModelDistance * 2.0);
      }

      // Camera target position along normal vector
      let targetPos;
      if (worldNormal.lengthSq() > 0.5) {
        targetPos = worldCenter.clone().add(worldNormal.clone().multiplyScalar(dist));
      } else {
        const dir = camera.position.clone().sub(controls.target).normalize();
        if (dir.lengthSq() < 0.1) dir.set(1, 1, 1).normalize();
        targetPos = worldCenter.clone().add(dir.multiplyScalar(dist));
      }

      // Compute natural CAD Up vector
      let targetUp = new THREE.Vector3(0, 1, 0);
      if (Math.abs(worldNormal.y) > 0.90) {
        // Face normal is aligned with vertical Y axis (e.g. Top / Bottom view)
        targetUp = worldNormal.y > 0 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 0, 1);
      } else {
        // Project global Y onto normal plane to maintain upright camera
        targetUp.sub(worldNormal.clone().multiplyScalar(worldNormal.dot(targetUp))).normalize();
        if (targetUp.lengthSq() < 0.1) {
          targetUp.set(0, 1, 0);
        }
      }

      tweenCamera(targetPos, worldCenter, targetUp, 450);
    }

    function updateTreeItemState(bodyId) {
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b) return;
      const node = document.getElementById(`tree-node-${bodyId}`);
      if (!node) return;

      node.classList.toggle('hidden-body', b.isHidden);
      node.classList.toggle('isolated', isolatedBodyId === b.id);

      const swatch = node.querySelector('.tree-color-swatch');
      if (swatch && b.mesh && b.mesh.material && b.mesh.material.color) {
        swatch.style.backgroundColor = '#' + b.mesh.material.color.getHexString();
      }

      const btnVis = node.querySelector('.btn-tree-vis');
      if (btnVis) {
        btnVis.innerText = b.isHidden ? '🚫' : '👁️';
        btnVis.classList.toggle('active', !b.isHidden);
      }

      const btnGhost = node.querySelector('.btn-tree-ghost');
      if (btnGhost) {
        btnGhost.classList.toggle('active', b.isGhosted);
      }

      const btnIso = node.querySelector('.btn-tree-isolate');
      if (btnIso) {
        btnIso.classList.toggle('active', isolatedBodyId === b.id);
      }
    }

    function updateAllTreeNodes() {
      modelBodies.forEach(b => updateTreeItemState(b.id));
    }

    function showIsolateBanner(bodyId) {
      const banner = document.getElementById('isolate-banner');
      const nameEl = document.getElementById('isolate-body-name');
      const b = modelBodies.find(item => item.id === bodyId);
      if (banner && nameEl && b) {
        nameEl.innerText = b.name;
        banner.style.display = 'flex';
      }
    }

    function hideIsolateBanner() {
      const banner = document.getElementById('isolate-banner');
      if (banner) banner.style.display = 'none';
    }

    // =============================================================

// Window exports
if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
  window.toggleTreePanel = toggleTreePanel;
  window.buildModelTree = buildModelTree;
  window.renderFacesSubList = renderFacesSubList;
  window.setBodyVisibility = setBodyVisibility;
  window.setBodyGhostMode = setBodyGhostMode;
  window.isolateBody = isolateBody;
  window.resetBodyIsolation = resetBodyIsolation;
  window.zoomToBody = zoomToBody;
  window.previewBodyInScene = previewBodyInScene;
  window.clearBodyPreview = clearBodyPreview;
  window.selectAndFocusBody = selectAndFocusBody;
  window.deselectBody = deselectBody;
  window.highlightBodyInScene = highlightBodyInScene;
  window.disposeHighlightGroup = disposeHighlightGroup;
  window.createFaceHighlightGroup = createFaceHighlightGroup;
  window.previewFaceInScene = previewFaceInScene;
  window.clearFacePreview = clearFacePreview;
  window.deselectFace = deselectFace;
  window.selectAndFocusFace = selectAndFocusFace;
  window.highlightFaceInScene = highlightFaceInScene;
  window.focusOnFace = focusOnFace;
  window.updateTreeItemState = updateTreeItemState;
  window.updateAllTreeNodes = updateAllTreeNodes;
  window.showIsolateBanner = showIsolateBanner;
  window.hideIsolateBanner = hideIsolateBanner;
  window.autoColorizeAssembly = autoColorizeAssembly;
}

// CommonJS export for automated Node.js unit tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml,
    toggleTreePanel,
    buildModelTree
  };
}
