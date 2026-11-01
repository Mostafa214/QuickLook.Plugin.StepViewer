/**
 * B-Rep Assembly Tree & Multi-Body Hierarchy Engine
 * Manages body visibility, transparent ghost mode, isolation, face inspection, and highlighting.
 */
(function () {
  let isTreeActive = false;
  let isolatedBodyId = null;
  let selectedBodyId = null;
  let previewBodyId = null;
  let selectedFaceInfo = null;
  let selectedFaceGroup = null;
  let previewFaceGroup = null;

  const AUTO_COLOR_PALETTE = [
    '#3b82f6', '#f97316', '#10b981', '#a855f7', '#f43f5e', '#06b6d4',
    '#eab308', '#6366f1', '#ec4899', '#14b8a6', '#84cc16', '#8b5cf6',
    '#f59e0b', '#64748b', '#d946ef', '#0ea5e9'
  ];

  function toggleTreePanel(enable) {
    isTreeActive = (enable !== undefined) ? enable : !isTreeActive;
    window.isTreeActive = isTreeActive;
    const panel = document.getElementById('tree-panel');
    const btn = document.getElementById('btn-tree');
    if (panel) panel.style.display = isTreeActive ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', isTreeActive);
  }

  function buildModelTree() {
    const container = document.getElementById('tree-content');
    const countBadge = document.getElementById('tree-body-count');
    if (!container) return;
    container.innerHTML = '';

    const modelBodies = window.modelBodies || [];
    const bodyCount = modelBodies.length;
    if (countBadge) countBadge.innerText = `${bodyCount} ${bodyCount === 1 ? 'Solid' : 'Bodies'}`;

    if (window.ExplodedView?.initExplodeVectors) window.ExplodedView.initExplodeVectors();
    else if (typeof window.initExplodeVectors === 'function') window.initExplodeVectors();

    const explodeSec = document.getElementById('tree-explode-section');
    const btnExplode = document.getElementById('btn-explode');
    if (explodeSec) explodeSec.style.display = bodyCount > 1 ? 'block' : 'none';
    if (btnExplode) {
      btnExplode.style.opacity = bodyCount > 1 ? '1' : '0.45';
      btnExplode.title = bodyCount > 1 ? 'Exploded Assembly View [X]' : 'Exploded View (Requires 2+ parts)';
    }

    if (bodyCount === 0) {
      container.innerHTML = '<div style="color:#64748b; font-size:11px; text-align:center; padding:16px;">No 3D solids in model</div>';
      return;
    }

    modelBodies.forEach((b) => {
      const node = document.createElement('div');
      node.className = `tree-node ${b.isHidden ? 'hidden-body' : ''} ${isolatedBodyId === b.id ? 'isolated' : ''}`;
      node.id = `tree-node-${b.id}`;

      const colorHex = '#' + (b.mesh?.material?.color ? b.mesh.material.color.getHexString() : 'cccccc');
      const volVal = (b.data && b.data.volumeMm3) || 0;
      const volCm3 = (volVal / 1000.0).toFixed(1);
      const facesCount = (b.data && b.data.brepFaces && b.data.brepFaces.length) || 0;
      const triCount = b.data && b.data.index ? Math.round(b.data.index.length / 3).toLocaleString() : '0';

      node.innerHTML = `
        <div class="tree-node-top">
          <div class="tree-node-info">
            <span class="tree-color-swatch" style="background-color: ${colorHex};"></span>
            <span class="tree-node-name">${b.name}</span>
          </div>
          <div class="tree-node-actions">
            <button class="btn-tree-action btn-tree-vis ${b.isHidden ? '' : 'active'}" data-id="${b.id}" title="Visibility"><svg class="lucide" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
            <button class="btn-tree-action btn-tree-ghost ${b.isGhosted ? 'active' : ''}" data-id="${b.id}" title="Ghost X-Ray"><svg class="lucide" viewBox="0 0 24 24"><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg></button>
            <button class="btn-tree-action btn-tree-isolate ${isolatedBodyId === b.id ? 'active' : ''}" data-id="${b.id}" title="Isolate Body"><svg class="lucide" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg></button>
          </div>
        </div>
        <div class="tree-node-meta"><span>${volCm3} cm³</span><span>•</span><span>${facesCount} Faces</span><span>•</span><span>${triCount} Tri</span></div>
        ${facesCount > 0 ? `
          <div class="tree-faces-toggle" data-id="${b.id}"><span class="tree-chevron">▶</span> <span>B-Rep Faces (${facesCount})</span></div>
          <div class="tree-faces-list" id="tree-faces-${b.id}" style="display: none;"></div>
        ` : ''}
      `;

      const topEl = node.querySelector('.tree-node-top');
      if (topEl) {
        topEl.addEventListener('mouseenter', () => previewBodyInScene(b.id));
        topEl.addEventListener('mouseleave', () => clearBodyPreview());
        topEl.addEventListener('click', (e) => {
          if (e.target.closest('.tree-node-actions') || e.target.closest('.tree-color-swatch') || e.target.closest('button')) return;
          e.stopPropagation(); selectAndFocusBody(b.id);
        });
      }

      node.querySelector('.tree-color-swatch')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.openColorPickerPopover === 'function') window.openColorPickerPopover(b.id, node.querySelector('.tree-color-swatch'));
      });

      node.querySelector('.btn-tree-vis')?.addEventListener('click', (e) => { e.stopPropagation(); setBodyVisibility(b.id); });
      node.querySelector('.btn-tree-ghost')?.addEventListener('click', (e) => { e.stopPropagation(); setBodyGhostMode(b.id); });
      node.querySelector('.btn-tree-isolate')?.addEventListener('click', (e) => { e.stopPropagation(); isolateBody(b.id); });

      const facesToggle = node.querySelector('.tree-faces-toggle');
      if (facesToggle) {
        facesToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const facesList = node.querySelector(`#tree-faces-${b.id}`);
          const chevron = facesToggle.querySelector('.tree-chevron');
          if (!facesList) return;
          const isExp = facesList.style.display !== 'none';
          facesList.style.display = isExp ? 'none' : 'flex';
          if (chevron) chevron.innerText = isExp ? '▶' : '▼';
          if (!isExp && facesList.children.length === 0) renderFacesSubList(b.id, facesList);
        });
      }

      container.appendChild(node);
    });
  }

  function renderFacesSubList(bodyId, container) {
    const modelBodies = window.modelBodies || [];
    const b = modelBodies.find(item => item.id === bodyId);
    if (!b || !b.data.brepFaces) return;
    const faces = b.data.brepFaces;
    const maxInitial = 25;

    function createFaceItem(face) {
      const fItem = document.createElement('div');
      fItem.className = 'tree-face-item';
      fItem.dataset.bodyId = bodyId;
      fItem.dataset.faceId = face.id;
      if (selectedFaceInfo && selectedFaceInfo.bodyId === bodyId && selectedFaceInfo.faceId === face.id) fItem.classList.add('active');
      const areaStr = (typeof window.formatArea === 'function') ? window.formatArea(face.areaMm2) : `${(face.areaMm2 || 0).toFixed(1)} mm²`;
      fItem.innerHTML = `<span>Face #${face.id}</span> <span style="color:#64748b;">${areaStr}</span>`;
      fItem.addEventListener('mouseenter', () => previewFaceInScene(bodyId, face));
      fItem.addEventListener('mouseleave', () => clearFacePreview());
      fItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedFaceInfo && selectedFaceInfo.bodyId === bodyId && selectedFaceInfo.faceId === face.id) deselectFace();
        else selectAndFocusFace(bodyId, face, fItem);
      });
      return fItem;
    }

    faces.slice(0, maxInitial).forEach(face => container.appendChild(createFaceItem(face)));

    if (faces.length > maxInitial) {
      const more = document.createElement('div');
      more.className = 'tree-face-item';
      more.style.color = '#38bdf8';
      more.style.fontWeight = '600';
      more.innerText = `+ ${faces.length - maxInitial} more faces...`;
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        more.remove();
        faces.slice(maxInitial).forEach(face => container.appendChild(createFaceItem(face)));
      });
      container.appendChild(more);
    }
  }

  function setBodyVisibility(bodyId, visible) {
    const modelBodies = window.modelBodies || [];
    const b = modelBodies.find(item => item.id === bodyId);
    if (!b) return;
    b.isHidden = (visible !== undefined) ? !visible : !b.isHidden;
    if (isolatedBodyId === null) {
      if (b.mesh) b.mesh.visible = !b.isHidden;
      if (b.trailLine) {
        const isTrails = window.ExplodedView ? window.ExplodedView.isTrailsActive() : true;
        const progress = window.ExplodedView ? window.ExplodedView.getProgress() : 0;
        b.trailLine.visible = (!b.isHidden && progress > 3 && isTrails);
      }
    }
    updateTreeItemState(bodyId);
  }

  function setBodyGhostMode(bodyId, enableGhost) {
    const b = (window.modelBodies || []).find(item => item.id === bodyId);
    if (!b?.material) return;
    b.isGhosted = (enableGhost !== undefined) ? enableGhost : !b.isGhosted;
    b.material.transparent = b.isGhosted;
    b.material.opacity = b.isGhosted ? 0.22 : 1.0;
    b.material.depthWrite = !b.isGhosted;
    if (b.mesh) b.mesh.renderOrder = b.isGhosted ? 10 : 0;
    if (b.edgesMat) b.edgesMat.opacity = b.isGhosted ? 0.45 : 0.85;
    b.material.needsUpdate = true;
    updateTreeItemState(bodyId);
  }

  function isolateBody(bodyId) {
    if (isolatedBodyId === bodyId) { resetBodyIsolation(); return; }
    isolatedBodyId = bodyId;
    window.isolatedBodyId = isolatedBodyId;
    const modelBodies = window.modelBodies || [];
    const isTrails = window.ExplodedView ? window.ExplodedView.isTrailsActive() : true;
    const progress = window.ExplodedView ? window.ExplodedView.getProgress() : 0;

    modelBodies.forEach(b => {
      if (b.mesh) b.mesh.visible = (b.id === bodyId);
      if (b.trailLine) b.trailLine.visible = (b.id === bodyId && progress > 3 && isTrails);
    });
    zoomToBody(bodyId);
    showIsolateBanner(bodyId);
    updateAllTreeNodes();
  }

  function resetBodyIsolation() {
    isolatedBodyId = null;
    window.isolatedBodyId = null;
    const modelBodies = window.modelBodies || [];
    const isTrails = window.ExplodedView ? window.ExplodedView.isTrailsActive() : true;
    const progress = window.ExplodedView ? window.ExplodedView.getProgress() : 0;

    modelBodies.forEach(b => {
      if (b.mesh) b.mesh.visible = !b.isHidden;
      if (b.trailLine) b.trailLine.visible = (!b.isHidden && progress > 3 && isTrails);
    });
    hideIsolateBanner();
    updateAllTreeNodes();
  }

  function zoomToBody(bodyId) {
    const b = (window.modelBodies || []).find(item => item.id === bodyId);
    if (!b?.mesh || !window.camera || !window.controls) return;
    const box = new THREE.Box3().setFromObject(b.mesh);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = Math.max((maxDim / 2) / Math.tan(THREE.MathUtils.degToRad(window.camera.fov) / 2) * 1.6, 5);
    const dir = window.camera.position.clone().sub(window.controls.target).normalize();
    if (dir.lengthSq() < 0.1) dir.set(1, 1, 1).normalize();
    const newPos = center.clone().add(dir.multiplyScalar(dist));
    if (typeof window.tweenCamera === 'function') window.tweenCamera(newPos, center, window.camera.up, 350);
  }

  function previewBodyInScene(bodyId) {
    if (selectedBodyId === bodyId) return;
    clearBodyPreview();
    const b = (window.modelBodies || []).find(item => item.id === bodyId);
    if (!b?.material) return;
    previewBodyId = bodyId; b.material.emissive = new THREE.Color(0x004466);
    if (b.edgesMat) { b.edgesMat.color = new THREE.Color(0x00f0ff); b.edgesMat.opacity = 1.0; }
  }

  function clearBodyPreview() {
    if (previewBodyId !== null) {
      const b = (window.modelBodies || []).find(item => item.id === previewBodyId);
      if (b?.material && selectedBodyId !== previewBodyId) {
        b.material.emissive = new THREE.Color(0x000000);
        if (b.edgesMat) { b.edgesMat.color = new THREE.Color(0x14171d); b.edgesMat.opacity = b.isGhosted ? 0.45 : 0.85; }
      }
      previewBodyId = null;
    }
  }

  function selectAndFocusBody(bodyId) {
    clearBodyPreview();
    if (selectedBodyId === bodyId) { deselectBody(); return; }
    deselectFace(); deselectBody();
    const b = (window.modelBodies || []).find(item => item.id === bodyId);
    if (!b?.material) return;
    if (b.isHidden) setBodyVisibility(bodyId, true);
    selectedBodyId = bodyId; window.selectedBodyId = selectedBodyId;
    b.material.emissive = new THREE.Color(0x004d73);
    if (b.edgesMat) { b.edgesMat.color = new THREE.Color(0x00f0ff); b.edgesMat.opacity = 1.0; }
    document.querySelectorAll('.tree-node.active-body').forEach(el => el.classList.remove('active-body'));
    document.getElementById(`tree-node-${bodyId}`)?.classList.add('active-body');
    zoomToBody(bodyId);
  }

  function deselectBody() {
    if (selectedBodyId !== null) {
      const b = (window.modelBodies || []).find(item => item.id === selectedBodyId);
      if (b?.material) {
        b.material.emissive = new THREE.Color(0x000000);
        if (b.edgesMat) { b.edgesMat.color = new THREE.Color(0x14171d); b.edgesMat.opacity = b.isGhosted ? 0.45 : 0.85; }
      }
      selectedBodyId = null; window.selectedBodyId = null;
    }
    clearBodyPreview();
    document.querySelectorAll('.tree-node.active-body').forEach(el => el.classList.remove('active-body'));
  }

  function createFaceHighlightGroup(bodyId, face, isPersistent) {
    const b = (window.modelBodies || []).find(item => item.id === bodyId);
    if (!b?.mesh?.geometry) return null;
    const geom = b.mesh.geometry, pos = geom.attributes.position, idx = geom.index;
    if (!pos || !idx) return null;

    const subIdx = [], edgeMap = new Map();
    for (let t = face.first; t <= face.last && t < idx.count / 3; t++) {
      const i0 = idx.getX(t * 3), i1 = idx.getX(t * 3 + 1), i2 = idx.getX(t * 3 + 2);
      subIdx.push(i0, i1, i2);
      [[i0, i1], [i1, i2], [i2, i0]].forEach(([v0, v1]) => {
        const key = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;
        const e = edgeMap.get(key);
        if (e) e.count++; else edgeMap.set(key, { a: Math.min(v0, v1), b: Math.max(v0, v1), count: 1 });
      });
    }
    if (subIdx.length === 0) return null;

    const group = new THREE.Group(), hGeom = new THREE.BufferGeometry();
    hGeom.setAttribute('position', pos);
    hGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(subIdx), 1));
    const faceMesh = new THREE.Mesh(hGeom, new THREE.MeshBasicMaterial({
      color: isPersistent ? 0x00f0ff : 0x38bdf8, side: THREE.DoubleSide, transparent: true,
      opacity: isPersistent ? 0.65 : 0.45, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2
    }));
    faceMesh.renderOrder = 998; group.add(faceMesh);

    const boundary = [];
    edgeMap.forEach(e => { if (e.count === 1) boundary.push(e.a, e.b); });
    if (boundary.length > 0) {
      const eGeom = new THREE.BufferGeometry();
      eGeom.setAttribute('position', pos);
      eGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(boundary), 1));
      const edgeLine = new THREE.LineSegments(eGeom, new THREE.LineBasicMaterial({
        color: 0x00ffff, linewidth: 2, transparent: true, opacity: 0.95, depthTest: true
      }));
      edgeLine.renderOrder = 999; group.add(edgeLine);
    }
    b.mesh.updateWorldMatrix(true, false);
    group.matrix.copy(b.mesh.matrixWorld);
    group.matrixAutoUpdate = false;
    return group;
  }

  function previewFaceInScene(bodyId, face) {
    if (selectedFaceInfo && selectedFaceInfo.bodyId === bodyId && selectedFaceInfo.faceId === face.id) return;
    clearFacePreview();
    previewFaceGroup = createFaceHighlightGroup(bodyId, face, false);
    if (previewFaceGroup && window.scene) window.scene.add(previewFaceGroup);
  }

  function clearFacePreview() {
    if (previewFaceGroup) {
      if (window.scene) window.scene.remove(previewFaceGroup);
      previewFaceGroup.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
      previewFaceGroup = null;
    }
  }

  function deselectFace() {
    if (selectedFaceGroup) {
      if (window.scene) window.scene.remove(selectedFaceGroup);
      selectedFaceGroup.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
      selectedFaceGroup = null;
    }
    clearFacePreview(); selectedFaceInfo = null; window.selectedFaceInfo = null;
    document.querySelectorAll('.tree-face-item.active').forEach(el => el.classList.remove('active'));
  }

  function selectAndFocusFace(bodyId, face, fItem) {
    clearFacePreview(); deselectBody();
    if (selectedFaceGroup && window.scene) { window.scene.remove(selectedFaceGroup); selectedFaceGroup = null; }
    selectedFaceInfo = { bodyId, faceId: face.id }; window.selectedFaceInfo = selectedFaceInfo;
    selectedFaceGroup = createFaceHighlightGroup(bodyId, face, true);
    if (selectedFaceGroup && window.scene) window.scene.add(selectedFaceGroup);
    document.querySelectorAll('.tree-face-item.active').forEach(el => el.classList.remove('active'));
    if (fItem) fItem.classList.add('active');
    focusOnFace(bodyId, face);
  }

  function focusOnFace(bodyId, face) {
    const b = (window.modelBodies || []).find(item => item.id === bodyId);
    if (!b?.mesh?.geometry || !window.camera || !window.controls) return;
    const geom = b.mesh.geometry, pos = geom.attributes.position, idx = geom.index;
    if (!pos || !idx) return;

    let totalArea = 0;
    const centerSum = new THREE.Vector3(), normSum = new THREE.Vector3();
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
    const eAB = new THREE.Vector3(), eAC = new THREE.Vector3(), triNorm = new THREE.Vector3();
    const faceVerts = [];

    for (let t = face.first; t <= face.last && t < idx.count / 3; t++) {
      vA.fromBufferAttribute(pos, idx.getX(t * 3));
      vB.fromBufferAttribute(pos, idx.getX(t * 3 + 1));
      vC.fromBufferAttribute(pos, idx.getX(t * 3 + 2));
      faceVerts.push(vA.clone(), vB.clone(), vC.clone());
      eAB.subVectors(vB, vA); eAC.subVectors(vC, vA);
      triNorm.crossVectors(eAB, eAC);
      const a = triNorm.length() * 0.5;
      if (a > 1e-10) {
        totalArea += a; normSum.add(triNorm);
        centerSum.add(vA.clone().add(vB).add(vC).multiplyScalar(a / 3));
      }
    }
    const center = totalArea > 1e-10 ? centerSum.multiplyScalar(1 / totalArea) : (faceVerts[0] || new THREE.Vector3());
    const norm = normSum.lengthSq() > 1e-10 ? normSum.normalize() : new THREE.Vector3(0, 1, 0);

    b.mesh.updateWorldMatrix(true, false);
    const wCenter = center.clone().applyMatrix4(b.mesh.matrixWorld);
    const wNorm = norm.clone().transformDirection(b.mesh.matrixWorld).normalize();

    let maxR = 0;
    faceVerts.forEach(v => { const d = v.applyMatrix4(b.mesh.matrixWorld).distanceTo(wCenter); if (d > maxR) maxR = d; });
    const dist = Math.max(maxR * 2.2, 12);
    const targetPos = wCenter.clone().add(wNorm.multiplyScalar(dist));
    const targetUp = Math.abs(wNorm.y) > 0.9 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);

    if (typeof window.tweenCamera === 'function') window.tweenCamera(targetPos, wCenter, targetUp, 450);
  }

  function updateTreeItemState(bodyId) {
    const b = (window.modelBodies || []).find(item => item.id === bodyId);
    const node = document.getElementById(`tree-node-${bodyId}`);
    if (!b || !node) return;
    node.classList.toggle('hidden-body', b.isHidden);
    node.classList.toggle('isolated', isolatedBodyId === b.id);
    const swatch = node.querySelector('.tree-color-swatch');
    if (swatch && b.mesh?.material?.color) swatch.style.backgroundColor = '#' + b.mesh.material.color.getHexString();
    node.querySelector('.btn-tree-vis')?.classList.toggle('active', !b.isHidden);
    node.querySelector('.btn-tree-ghost')?.classList.toggle('active', b.isGhosted);
    node.querySelector('.btn-tree-isolate')?.classList.toggle('active', isolatedBodyId === b.id);
  }

  function updateAllTreeNodes() {
    const modelBodies = window.modelBodies || [];
    modelBodies.forEach(b => updateTreeItemState(b.id));
  }

  function showIsolateBanner(bodyId) {
    const banner = document.getElementById('isolate-banner'), nameEl = document.getElementById('isolate-body-name'), b = (window.modelBodies || []).find(item => item.id === bodyId);
    if (banner && nameEl && b) { nameEl.innerText = b.name; banner.style.display = 'flex'; }
  }

  function hideIsolateBanner() {
    const banner = document.getElementById('isolate-banner');
    if (banner) banner.style.display = 'none';
  }

  function autoColorizeAssembly() {
    const modelBodies = window.modelBodies || [];
    if (modelBodies.length === 0) return;
    modelBodies.forEach((b, idx) => {
      const color = AUTO_COLOR_PALETTE[idx % AUTO_COLOR_PALETTE.length];
      if (b.mesh?.material) {
        b.mesh.material.color.set(color);
        b.mesh.material.needsUpdate = true;
      }
      b.customColor = color;
      updateTreeItemState(b.id);
    });
  }

  function setupUI() {
    const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
    on('btn-tree', () => toggleTreePanel());
    on('btn-close-tree', () => toggleTreePanel(false));
    on('btn-tree-showall', () => (window.modelBodies || []).forEach(b => setBodyVisibility(b.id, true)));
    on('btn-tree-solidall', () => (window.modelBodies || []).forEach(b => setBodyGhostMode(b.id, false)));
    on('btn-tree-autocolor', () => autoColorizeAssembly());
    on('btn-tree-resetiso', () => resetBodyIsolation());
    on('btn-exit-isolate', () => resetBodyIsolation());
    if (window.ExplodedView?.setupUI) window.ExplodedView.setupUI();
    if (window.AppearancePopover?.setupUI) window.AppearancePopover.setupUI();
  }

  const AssemblyTree = {
    toggleTreePanel,
    buildModelTree,
    setBodyVisibility,
    setBodyGhostMode,
    isolateBody,
    resetBodyIsolation,
    selectAndFocusBody,
    deselectBody,
    selectAndFocusFace,
    deselectFace,
    autoColorizeAssembly,
    updateTreeItemState,
    updateAllTreeNodes,
    setupUI,
    toggleExplode: () => window.ExplodedView?.toggleExplode?.(),
    resetExplodedView: () => window.ExplodedView?.resetExplodedView?.(),
    closeColorPickerPopover: () => window.AppearancePopover?.closeColorPickerPopover?.()
  };

  window.AssemblyTree = AssemblyTree;
  window.buildModelTree = buildModelTree;
  window.toggleTreePanel = toggleTreePanel;
  window.autoColorizeAssembly = autoColorizeAssembly;
  window.isolateBody = isolateBody;
  window.resetBodyIsolation = resetBodyIsolation;
  window.deselectBody = deselectBody;
  window.deselectFace = deselectFace;
})();