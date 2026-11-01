/**
 * CAD Viewport Host Controller, Camera Engine & Web Worker Bridge (<500 lines)
 * Three.js WebGL rendering, 4-point studio lights, camera transitions, CAD hotkeys & Host IPC
 */
(function () {
  let scene, camera, renderer, controls, animFrameId = null;
  let modelGroup = new THREE.Group();
  let gridHelper = null, contactShadowMesh = null, contactShadowTexture = null, contactShadowMaterial = null;
  let currentWorker = null, workerReady = false, loadTimer = null;
  let pendingFileBuffer = null, pendingFileName = null, activeCadFormat = 'STEP';
  let isWireframeActive = false, isEdgesActive = true, isAutoRotateActive = false;
  let currentModelCenter = new THREE.Vector3(), currentModelDistance = 100;
  let initialCameraState = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  function detectCadFormat(fn) {
    if (!fn) return 'STEP';
    const ext = fn.split('.').pop().toLowerCase();
    if (ext === 'igs' || ext === 'iges') return 'IGES';
    if (ext === 'brep' || ext === 'occ') return 'BREP';
    return 'STEP';
  }
  function computeSafeCameraDistance(box, paddingFactor = 1.25) {
    if (!box || box.isEmpty()) return 100;
    const size = box.getSize(new THREE.Vector3());
    const vFovRad = THREE.MathUtils.degToRad(camera ? camera.fov : 45);
    const aspect = camera ? camera.aspect : (window.innerWidth / window.innerHeight);
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
    const dV = (size.y / 2) / Math.tan(vFovRad / 2);
    const dH = (size.x / 2) / Math.tan(hFovRad / 2);
    return Math.max(dV, dH, size.z * 1.5) * paddingFactor;
  }
  function initViewport() {
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x09090b); // Concept 1 Linear Dark tokens canvas
    scene.add(modelGroup);
    if (window.measureGroup) scene.add(window.measureGroup);
    if (window.explodeTrailsGroup) scene.add(window.explodeTrailsGroup);
    if (window.sectionStencilGroup) scene.add(window.sectionStencilGroup);
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50000);
    camera.position.set(100, 100, 100);
    renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05; controls.screenSpacePanning = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    // Technical Studio 4-Point Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.70); scene.add(ambientLight);
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.85); keyLight.position.set(1.2, 2.0, 1.5).normalize(); scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.45); fillLight.position.set(-1.5, -0.6, -1.2).normalize(); scene.add(fillLight);
    const topLight = new THREE.DirectionalLight(0xffffff, 0.35); topLight.position.set(0, 1, 0); scene.add(topLight);
    const bounceLight = new THREE.DirectionalLight(0x475569, 0.30); bounceLight.position.set(0, -1, 0); scene.add(bounceLight);
    window.addEventListener('resize', onResize);
    setupToolbar();
    setupEngineModules();
    setupInteractionHandlers(container);
    initWorker();
    animate();
    Object.assign(window, {
      scene, camera, renderer, controls, modelGroup,
      currentModelCenter, currentModelDistance, initialCameraState,
      startTessellation, clearModel, autoFitCamera, tweenCamera, computeSafeCameraDistance
    });
    notifyHost({ type: 'VIEWPORT_READY' });
    setTimeout(() => { if (window.AutoUpdater) window.AutoUpdater.checkForUpdates(false); }, 2000);
  }
  function setupEngineModules() {
    if (window.SectionEngine) window.SectionEngine.setupUI();
    if (window.AssemblyTree) window.AssemblyTree.setupUI();
    if (window.ExplodedView) window.ExplodedView.setupUI();
    if (window.AppearancePopover) window.AppearancePopover.setupUI();
    if (window.MeasureEngine) window.MeasureEngine.setupUI();
    if (window.MaterialsEngine) window.MaterialsEngine.setupUI();
    if (window.SnapshotEngine) window.SnapshotEngine.setupUI();
    if (window.AdminTwin) window.AdminTwin.setupUI();
    if (window.AutoUpdater) window.AutoUpdater.setupUI();
  }
  function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  function tweenCamera(targetPos, targetLookAt, targetUp = new THREE.Vector3(0, 1, 0), duration = 350) {
    if (!camera || !controls) return;
    const startPos = camera.position.clone(), startLookAt = controls.target.clone(), startUp = camera.up.clone(), startTime = performance.now();
    function step(now) {
      const p = Math.min((now - startTime) / duration, 1.0);
      const ease = 1 - Math.pow(1 - p, 3);
      camera.position.lerpVectors(startPos, targetPos, ease);
      controls.target.lerpVectors(startLookAt, targetLookAt, ease);
      camera.up.lerpVectors(startUp, targetUp, ease);
      if (camera.up.lengthSq() > 0.001) camera.up.normalize(); else camera.up.copy(targetUp);
      controls.update();
      if (p < 1.0) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function updateScreenSpaceAnnotations() {
    const mg = window.measureGroup;
    if (!mg || !camera) return;
    const vFovRad = THREE.MathUtils.degToRad(camera.fov), tanHalf = Math.tan(vFovRad / 2), h = window.innerHeight || 800;
    mg.traverse(obj => {
      if (obj.userData?.isScreenScaled) {
        const r = Math.max(((2 * tanHalf * camera.position.distanceTo(obj.position)) / h) * (obj.userData.screenPixelRadius || 7.5), 0.0001);
        obj.scale.set(r, r, r);
      } else if (obj.userData?.isScreenScaledSprite) {
        const sh = Math.max(((2 * tanHalf * camera.position.distanceTo(obj.position)) / h) * (obj.userData.pixelHeight || 34), 0.0001);
        obj.scale.set(sh * (obj.userData.aspect || 4.0), sh, 1);
      }
    });
  }
  function animate() {
    animFrameId = requestAnimationFrame(animate);
    if (controls) {
      controls.autoRotate = isAutoRotateActive;
      controls.autoRotateSpeed = 2.0;
      controls.update();
    }
    updateScreenSpaceAnnotations();
    if (renderer && scene && camera) renderer.render(scene, camera);
    drawTriad();
    if (window.AdminTwin) (window.AdminTwin.recordRenderFrame || window.AdminTwin.trackFps)?.();
  }
  function drawTriad() {
    const canvas = document.getElementById('triad-canvas');
    if (!canvas || !camera) return;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 70, 70);
    const cx = 35, cy = 35, r = 22, rotMatrix = new THREE.Matrix4().extractRotation(camera.matrixWorldInverse);
    const axes = [
      { dir: new THREE.Vector3(1, 0, 0), label: 'X', color: '#e05656' },
      { dir: new THREE.Vector3(0, 1, 0), label: 'Y', color: '#3eb86f' },
      { dir: new THREE.Vector3(0, 0, 1), label: 'Z', color: '#4a9eed' }
    ];
    axes.forEach(a => { a.proj = a.dir.clone().applyMatrix4(rotMatrix); });
    axes.sort((a, b) => a.proj.z - b.proj.z);
    axes.forEach(a => {
      const px = cx + a.proj.x * r, py = cy - a.proj.y * r;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.strokeStyle = a.color; ctx.lineWidth = 2.0; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, 5.0, 0, Math.PI * 2); ctx.fillStyle = a.color; ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 7px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(a.label, px, py);
    });
  }
  function createContactShadowTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d'), cx = 256, cy = 256, grad = ctx.createRadialGradient(cx, cy, 15, cx, cy, 250);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)'); grad.addColorStop(0.18, 'rgba(0, 0, 0, 0.55)'); grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.28)');
    grad.addColorStop(0.72, 'rgba(0, 0, 0, 0.08)'); grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(canvas); tex.needsUpdate = true; return tex;
  }
  function updateGroundContactShadow(box, center, size) {
    if (!contactShadowTexture) {
      contactShadowTexture = createContactShadowTexture();
      contactShadowMaterial = new THREE.MeshBasicMaterial({ map: contactShadowTexture, transparent: true, opacity: 0.45, depthWrite: false });
      window.contactShadowMaterial = contactShadowMaterial;
    }
    if (contactShadowMesh) { scene.remove(contactShadowMesh); if (contactShadowMesh.geometry) contactShadowMesh.geometry.dispose(); }
    const shadowW = Math.max(size.x * 1.5, size.z * 1.5, 15);
    const shadowGeom = new THREE.PlaneGeometry(shadowW, shadowW); shadowGeom.rotateX(-Math.PI / 2);
    contactShadowMesh = new THREE.Mesh(shadowGeom, contactShadowMaterial);
    contactShadowMesh.position.set(center.x, box.min.y - 0.08, center.z);
    contactShadowMesh.name = 'ground_contact_shadow';
    window.contactShadowMesh = contactShadowMesh;
    scene.add(contactShadowMesh);
  }
  function autoFitCamera() {
    const box = new THREE.Box3().setFromObject(modelGroup);
    if (box.isEmpty()) return;
    if (window.SectionEngine) (window.SectionEngine.setModelBox || window.SectionEngine.updateBox)?.(box);
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    if (window.modelPhysicalProps) { window.modelPhysicalProps.bbox = { x: size.x, y: size.y, z: size.z }; }
    if (window.MaterialsEngine) window.MaterialsEngine.updatePhysicalPropertiesCard();
    updateBoundingBoxBadge();
    const cameraDistance = computeSafeCameraDistance(box, 1.25);
    currentModelCenter.copy(center); currentModelDistance = cameraDistance; window.currentModelDistance = cameraDistance;
    camera.near = cameraDistance / 100; camera.far = cameraDistance * 100; camera.updateProjectionMatrix();
    const isoDir = new THREE.Vector3(1, 0.85, 1).normalize();
    let targetCenter = center.clone();
    if (window.isTreeActive && window.innerWidth > 600) {
      const vFovRad = THREE.MathUtils.degToRad(camera.fov), camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      targetCenter.sub(camRight.multiplyScalar((cameraDistance * Math.tan(vFovRad / 2) * camera.aspect) * 0.16));
    }
    const targetPos = targetCenter.clone().add(isoDir.multiplyScalar(cameraDistance));
    camera.position.copy(targetPos); camera.lookAt(targetCenter);
    controls.target.copy(targetCenter); controls.update();
    initialCameraState.position.copy(targetPos); initialCameraState.target.copy(targetCenter);
    if (gridHelper) scene.remove(gridHelper);
    gridHelper = new THREE.GridHelper(Math.max(Math.max(size.x, size.y, size.z) * 2.5, 20), 20, 0x27272a, 0x18181b);
    gridHelper.position.set(center.x, box.min.y, center.z); scene.add(gridHelper);
    updateGroundContactShadow(box, center, size);
  }
  function clearModel() {
    if (contactShadowMesh) { scene.remove(contactShadowMesh); if (contactShadowMesh.geometry) contactShadowMesh.geometry.dispose(); contactShadowMesh = null; window.contactShadowMesh = null; }
    if (window.AppearancePopover) window.AppearancePopover.closeColorPickerPopover();
    else if (window.AssemblyTree) window.AssemblyTree.closeColorPickerPopover();
    if (window.AssemblyTree) { window.AssemblyTree.deselectFace(); window.AssemblyTree.deselectBody(); }
    const hideBanner = document.getElementById('isolate-banner'); if (hideBanner) hideBanner.style.display = 'none';
    (window.modelBodies || []).forEach(b => { if (b.material) b.material.dispose(); if (b.edgesMat) b.edgesMat.dispose(); });
    window.modelBodies = []; window.isolatedBodyId = null;
    const treeCont = document.getElementById('tree-content'); if (treeCont) treeCont.innerHTML = '';
    const treeCnt = document.getElementById('tree-body-count'); if (treeCnt) treeCnt.innerText = '0 Bodies';
    const bodySel = document.getElementById('props-body-select'); if (bodySel) bodySel.innerHTML = '';
    const bodyRow = document.getElementById('props-body-row'); if (bodyRow) bodyRow.style.display = 'none';
    window.modelPhysicalProps = null;
    if (window.MaterialsEngine) window.MaterialsEngine.togglePropsModal(false);
    window.modelEdgeFeatures = [];
    if (window.MeasureEngine) window.MeasureEngine.clearMeasurement(true);
    const dimEl = document.getElementById('badge-dim'); if (dimEl) dimEl.style.display = 'none';
    while (modelGroup.children.length > 0) {
      const obj = modelGroup.children[0];
      obj.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (Array.isArray(c.material)) c.material.forEach(m => m.dispose()); else c.material.dispose(); } });
      modelGroup.remove(obj);
    }
    if (gridHelper) { scene.remove(gridHelper); gridHelper = null; }
    if (window.SectionEngine) (window.SectionEngine.reset || window.SectionEngine.toggleSectionView)?.(false);
    if (window.ExplodedView) window.ExplodedView.resetExplodedView();
    else if (window.AssemblyTree) window.AssemblyTree.resetExplodedView();
  }
  function updateBoundingBoxBadge() {
    const pp = window.modelPhysicalProps;
    if (!pp || !pp.bbox) return;
    const s = pp.bbox, u = window.currentUnit || 'mm';
    const dx = u === 'mm' ? s.x.toFixed(1) : (s.x / 25.4).toFixed(2);
    const dy = u === 'mm' ? s.y.toFixed(1) : (s.y / 25.4).toFixed(2);
    const dz = u === 'mm' ? s.z.toFixed(1) : (s.z / 25.4).toFixed(2);
    const dimEl = document.getElementById('badge-dim'), dimText = document.getElementById('dim-text');
    if (dimEl && dimText) { dimText.innerText = `${dx} × ${dy} × ${dz} ${u}`; dimEl.style.display = 'block'; }
  }
  function initWorker() {
    if (currentWorker) currentWorker.terminate();
    currentWorker = new Worker('stepWorker.js'); workerReady = false;
    currentWorker.onmessage = function (e) {
      const msg = e.data; if (!msg) return;
      if (msg.type === 'READY') {
        workerReady = true; window._workerReadyInfo = msg;
        const st = document.getElementById('status-text'); if (st) st.innerText = 'Ready for CAD files';
        const sp = document.getElementById('spinner'); if (sp) sp.style.display = 'none';
        if (pendingFileBuffer) { startTessellation(pendingFileBuffer, pendingFileName); pendingFileBuffer = null; }
      } else if (msg.type === 'PARSE_SUCCESS') {
        window._lastTessellationElapsed = msg.elapsedMs; window._lastWasmSource = msg.wasmSource;
        onTessellationComplete(msg);
        if (msg.cacheKey && msg.meshes && window.saveCachedModel) window.saveCachedModel(msg.cacheKey, msg, msg.bufferSize || 0);
      } else if (msg.type === 'PARSE_ERROR') {
        showError('CAD Parse Error: ' + (msg.message || 'Unknown error'));
      }
    };
    currentWorker.onerror = function (err) { showError('Worker Error: ' + (err.message || 'Worker crash')); };
    currentWorker.postMessage({ type: 'INIT' });
  }
  async function startTessellation(buffer, fileName) {
    pendingFileName = fileName || pendingFileName || 'CAD_Model'; window.pendingFileName = pendingFileName;
    activeCadFormat = detectCadFormat(pendingFileName); window.activeCadFormat = activeCadFormat;
    if (loadTimer) { clearInterval(loadTimer); loadTimer = null; }
    const mb = buffer.byteLength / (1024 * 1024), sz = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(buffer.byteLength / 1024)} KB`;
    const fnEl = document.getElementById('badge-filename'); if (fnEl) fnEl.innerText = `${pendingFileName} (${sz})`;
    const spEl = document.getElementById('spinner'); if (spEl) spEl.style.display = 'inline-block';
    hideError(); clearModel();
    const cacheKey = (pendingFileName || 'model') + '_' + buffer.byteLength + '_v7';
    try {
      if (window.getCachedModel) {
        const cached = await window.getCachedModel(cacheKey);
        if (cached && cached.meshes && cached.meshes.length > 0) {
          onTessellationComplete({ format: activeCadFormat, fileName: pendingFileName, meshes: cached.meshes, meshCount: cached.meshCount, elapsedMs: 12, isCached: true });
          return;
        }
      }
    } catch (e) {}
    const statusEl = document.getElementById('status-text');
    let elapsedSec = 0; if (statusEl) statusEl.innerText = `Processing ${activeCadFormat} geometry... (0s)`;
    loadTimer = setInterval(() => {
      elapsedSec++;
      if (statusEl) {
        if (elapsedSec < 3) statusEl.innerText = `Reading ${activeCadFormat} entity stream... (${elapsedSec}s)`;
        else if (elapsedSec < 15) statusEl.innerText = `Resolving CAD topology & B-Rep curves... (${elapsedSec}s)`;
        else if (elapsedSec < 26) statusEl.innerText = `Sewing solid faces & healing entities... (${elapsedSec}s)`;
        else statusEl.innerText = `Tessellating 3D surface mesh... (${elapsedSec}s)`;
      }
    }, 1000);
    if (!workerReady) { pendingFileBuffer = buffer; return; }
    currentWorker.postMessage({ type: 'PARSE', buffer, fileName: pendingFileName, cacheKey, bufferSize: buffer.byteLength, params: null }, [buffer]);
  }
  function onTessellationComplete(data) {
    if (loadTimer) { clearInterval(loadTimer); loadTimer = null; }
    if (data.fileName) { pendingFileName = data.fileName; window.pendingFileName = pendingFileName; }
    activeCadFormat = data.format || detectCadFormat(pendingFileName); window.activeCadFormat = activeCadFormat;
    const spDone = document.getElementById('spinner'); if (spDone) spDone.style.display = 'none';
    clearModel();
    const edgeFeats = [];
    (data.meshes || []).forEach(m => { if (m.edgeFeatures?.length) edgeFeats.push(...m.edgeFeatures); });
    window.modelEdgeFeatures = edgeFeats;
    if (window.MeasureEngine) window.MeasureEngine.indexModelVertices(data.meshes);
    if (!data.meshes || data.meshes.length === 0) {
      showError(`This ${activeCadFormat} file was parsed, but contains only 2D wireframe curves (no 3D solids).`);
      const st = document.getElementById('status-text'); if (st) st.innerText = '2D Wireframe Sketch (No 3D Solids)';
      return;
    }
    let totalTriangles = 0, totalAreaMm2 = 0, totalVolMm3 = 0;
    const bodies = [];
    data.meshes.forEach((m, i) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.position), 3));
      if (m.normal) geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(m.normal), 3)); else geometry.computeVertexNormals();
      if (m.index) {
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(m.index), 1));
        const numTris = m.index.length / 3; totalTriangles += numTris;
        const pos = m.position, idx = m.index;
        for (let t = 0; t < numTris; t++) {
          const i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
          const ax = pos[i0], ay = pos[i0 + 1], az = pos[i0 + 2], bx = pos[i1], by = pos[i1 + 1], bz = pos[i1 + 2], cx = pos[i2], cy = pos[i2 + 1], cz = pos[i2 + 2];
          const crossX = (by - ay) * (cz - az) - (bz - az) * (cy - ay), crossY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), crossZ = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
          totalAreaMm2 += 0.5 * Math.hypot(crossX, crossY, crossZ);
          totalVolMm3 += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6.0;
        }
      } else { totalTriangles += m.position.length / 9; }
      let meshColor = new THREE.Color(0xa0a8b4);
      if (m.color && Array.isArray(m.color) && m.color.length >= 3) {
        meshColor = new THREE.Color(m.color[0] > 1 ? m.color[0] / 255 : m.color[0], m.color[1] > 1 ? m.color[1] / 255 : m.color[1], m.color[2] > 1 ? m.color[2] / 255 : m.color[2]);
      }
      const material = new THREE.MeshStandardMaterial({
        color: meshColor, metalness: 0.28, roughness: 0.42, side: THREE.DoubleSide, wireframe: isWireframeActive,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        clippingPlanes: (window.isSectionActive && window.sectionPlane) ? [window.sectionPlane] : []
      });
      const mesh = new THREE.Mesh(geometry, material); mesh.name = m.name;
      mesh.userData = { bodyId: i, name: m.name, originalColor: meshColor.clone(), isGhosted: false, isHidden: false, brepFaces: m.brepFaces || [], volumeMm3: m.volumeMm3 || 0, areaMm2: m.areaMm2 || 0 };
      let edgesMat = null, edgeLines = null;
      try {
        edgesMat = new THREE.LineBasicMaterial({ color: 0x14171d, linewidth: 1, transparent: true, opacity: 0.85, clippingPlanes: (window.isSectionActive && window.sectionPlane) ? [window.sectionPlane] : [] });
        const eGeom = new THREE.BufferGeometry(); eGeom.setAttribute('position', geometry.attributes.position);
        if (m.edgeIndices?.length) eGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(m.edgeIndices), 1));
        else eGeom.copy(new THREE.EdgesGeometry(geometry, 28));
        edgeLines = new THREE.LineSegments(eGeom, edgesMat);
        edgeLines.name = 'solidworks_edges'; edgeLines.visible = isEdgesActive && !isWireframeActive;
        mesh.add(edgeLines);
      } catch (e) {}
      modelGroup.add(mesh);
      bodies.push({ id: i, name: m.name, mesh, edgeMesh: edgeLines, data: m, isGhosted: false, isHidden: false, material, edgesMat, originalColor: meshColor.clone() });
    });
    window.modelBodies = bodies;
    window.modelPhysicalProps = { volumeMm3: Math.abs(totalVolMm3), areaMm2: totalAreaMm2, bbox: null, triangles: totalTriangles };
    autoFitCamera();
    if (window.AssemblyTree) { window.AssemblyTree.buildModelTree(); window.AssemblyTree.toggleTreePanel(data.meshCount > 1); }
    if (window.MaterialsEngine) window.MaterialsEngine.updatePropsBodySelect();
    const timeDisplay = data.isCached ? '12ms (Cache)' : `${(data.elapsedMs / 1000).toFixed(1)}s`;
    const stEl = document.getElementById('status-text');
    if (stEl) stEl.innerHTML = `<span style="color:#94a3b8;">✓</span> ${data.meshCount} Part(s) • ${Math.round(totalTriangles).toLocaleString()} Triangles • ${timeDisplay}`;
    notifyHost({ type: 'LOADED', meshCount: data.meshCount, triangles: totalTriangles, elapsedMs: data.elapsedMs });
  }
  function setupToolbar() {
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    bind('btn-edges', () => {
      isEdgesActive = !isEdgesActive; document.getElementById('btn-edges')?.classList.toggle('active', isEdgesActive);
      modelGroup.traverse(c => { if (c.name === 'solidworks_edges') c.visible = isEdgesActive && !isWireframeActive; });
    });
    bind('btn-wireframe', () => {
      isWireframeActive = !isWireframeActive; document.getElementById('btn-wireframe')?.classList.toggle('active', isWireframeActive);
      modelGroup.traverse(c => { if (c.isMesh && c.material) c.material.wireframe = isWireframeActive; if (c.name === 'solidworks_edges') c.visible = isEdgesActive && !isWireframeActive; });
    });
    bind('btn-autorotate', () => { isAutoRotateActive = !isAutoRotateActive; document.getElementById('btn-autorotate')?.classList.toggle('active', isAutoRotateActive); });
    const viewActions = {
      'btn-view-iso': (flip) => { const dir = new THREE.Vector3(flip ? -1 : 1, 0.85, flip ? -1 : 1).normalize(); tweenCamera(currentModelCenter.clone().add(dir.multiplyScalar(currentModelDistance)), currentModelCenter, new THREE.Vector3(0, 1, 0)); },
      'btn-view-top': (flip) => { tweenCamera(currentModelCenter.clone().add(new THREE.Vector3(0, flip ? -1 : 1, 0).multiplyScalar(currentModelDistance)), currentModelCenter, flip ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1)); },
      'btn-view-front': (flip) => { tweenCamera(currentModelCenter.clone().add(new THREE.Vector3(0, 0, flip ? -1 : 1).multiplyScalar(currentModelDistance)), currentModelCenter, new THREE.Vector3(0, 1, 0)); },
      'btn-view-right': (flip) => { tweenCamera(currentModelCenter.clone().add(new THREE.Vector3(flip ? -1 : 1, 0, 0).multiplyScalar(currentModelDistance)), currentModelCenter, new THREE.Vector3(0, 1, 0)); }
    };
    Object.keys(viewActions).forEach(btnId => {
      bind(btnId, () => {
        const btn = document.getElementById(btnId), isAct = btn?.classList.contains('active');
        Object.keys(viewActions).forEach(id => document.getElementById(id)?.classList.remove('active'));
        if (!isAct) btn?.classList.add('active');
        viewActions[btnId](isAct);
      });
    });
    bind('btn-reset', () => {
      if (initialCameraState.position.lengthSq() > 0) {
        tweenCamera(initialCameraState.position, initialCameraState.target, new THREE.Vector3(0, 1, 0));
        Object.keys(viewActions).forEach(id => document.getElementById(id)?.classList.remove('active'));
        document.getElementById('btn-view-iso')?.classList.add('active');
      }
    });
  }
  function setupInteractionHandlers(container) {
    let pDown = { x: 0, y: 0 };
    container.addEventListener('pointerdown', e => {
      pDown = { x: e.clientX, y: e.clientY };
      if (window.SectionEngine && window.SectionEngine.handlePointerDown(e)) return;
    });
    container.addEventListener('pointermove', e => {
      if (window.SectionEngine && window.SectionEngine.handlePointerMove(e)) return;
      if (window.isMeasureActive && window.MeasureEngine) {
        const snap = window.MeasureEngine.findSnapTarget(e);
        const tt = document.getElementById('measure-tooltip'), ind = window.snapIndicator;
        if (snap) {
          if (ind) { ind.position.copy(snap.point); ind.visible = true; }
          if (tt) { tt.innerText = `${snap.label || snap.type}: ${window.MeasureEngine.formatDim(snap.feature?.length || snap.diameter || 0)}`; tt.style.left = (e.clientX + 14) + 'px'; tt.style.top = (e.clientY + 14) + 'px'; tt.style.display = 'block'; }
          return;
        }
        if (ind) ind.visible = false; if (tt) tt.style.display = 'none';
      }
    });
    container.addEventListener('pointerup', e => {
      if (window.SectionEngine && window.SectionEngine.handlePointerUp()) return;
      if (Math.hypot(e.clientX - pDown.x, e.clientY - pDown.y) > 6) return;
      if (e.button === 2) { if (window.isMeasureActive && window.MeasureEngine) window.MeasureEngine.clearMeasurement(false); return; }
      if (e.button !== 0) return;
      if (window.isMeasureActive && window.MeasureEngine) {
        const snap = window.MeasureEngine.findSnapTarget(e);
        if (snap) window.MeasureEngine.handleUnifiedClick(snap);
      }
    });
    container.addEventListener('dblclick', e => {
      if (window.isMeasureActive) return;
      const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(mouse, camera);
      const hits = ray.intersectObjects(modelGroup.children, true);
      if (hits.length > 0) {
        const pt = hits[0].point, delta = pt.clone().sub(controls.target);
        tweenCamera(camera.position.clone().add(delta), pt, camera.up, 300);
      }
    });
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'f') autoFitCamera();
      else if (k === '1') document.getElementById('btn-view-iso')?.click();
      else if (k === '2') document.getElementById('btn-view-top')?.click();
      else if (k === '3') document.getElementById('btn-view-front')?.click();
      else if (k === '4') document.getElementById('btn-view-right')?.click();
      else if (k === 'e') document.getElementById('btn-edges')?.click();
      else if (k === 'w') document.getElementById('btn-wireframe')?.click();
      else if (k === 'm' && window.MeasureEngine) window.MeasureEngine.toggleMeasureMode();
      else if (k === 's' && window.SectionEngine) window.SectionEngine.toggleSectionView();
      else if (k === 'p' && window.MaterialsEngine) window.MaterialsEngine.togglePropsModal();
      else if (k === 't' && window.AssemblyTree) window.AssemblyTree.toggleTreePanel();
      else if (k === 'x') { if (window.ExplodedView) window.ExplodedView.toggleExplode(); else if (window.AssemblyTree) window.AssemblyTree.toggleExplode(); }
      else if (k === 'u' && window.MaterialsEngine) window.MaterialsEngine.toggleUnits();
      else if (k === 'k' && window.SnapshotEngine) window.SnapshotEngine.toggleSnapshotModal();
      else if (k === 'r') document.getElementById('btn-reset')?.click();
      else if (k === 'escape') {
        if (window.AppearancePopover) window.AppearancePopover.closeColorPickerPopover();
        else if (window.AssemblyTree) window.AssemblyTree.closeColorPickerPopover();
        if (window.AssemblyTree) { window.AssemblyTree.resetBodyIsolation(); window.AssemblyTree.deselectFace(); window.AssemblyTree.deselectBody(); window.AssemblyTree.toggleTreePanel(false); }
        if (window.MeasureEngine) window.MeasureEngine.toggleMeasureMode(false);
        if (window.SectionEngine) (window.SectionEngine.reset || window.SectionEngine.toggleSectionView)?.(false);
        if (window.MaterialsEngine) window.MaterialsEngine.togglePropsModal(false);
        if (window.SnapshotEngine) window.SnapshotEngine.toggleSnapshotModal(false);
      }
    });
  }
  function showError(msg) {
    const c = document.getElementById('error-container'); if (c) { c.innerText = msg; c.style.display = 'block'; }
    const sp = document.getElementById('spinner'); if (sp) sp.style.display = 'none';
    const st = document.getElementById('status-text'); if (st) st.innerText = 'Failed to load model';
    notifyHost({ type: 'ERROR', message: msg });
  }
  function hideError() { const c = document.getElementById('error-container'); if (c) c.style.display = 'none'; }
  function showToast(msg) {
    const t = document.getElementById('toast-notify'); if (!t) return;
    t.innerText = msg; t.style.display = 'block'; t.style.opacity = '1';
    if (window._toastTimer) clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3500);
  }
  function notifyHost(obj) { if (window.chrome?.webview) window.chrome.webview.postMessage(obj); }
  if (window.chrome?.webview) {
    window.chrome.webview.addEventListener('message', e => {
      const msg = e.data; if (!msg) return;
      if (msg.action === 'LOAD_URL') {
        fetch(msg.url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
          .then(b => startTessellation(b, msg.fileName))
          .catch(err => showError('Failed to fetch file stream: ' + err.message));
      } else if (msg.action === 'CANCEL' || msg.action === 'DISPOSE') {
        if (loadTimer) { clearInterval(loadTimer); loadTimer = null; }
        if (currentWorker) { currentWorker.terminate(); if (msg.action === 'CANCEL') initWorker(); else currentWorker = null; }
        clearModel();
        if (msg.action === 'DISPOSE') {
          if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
          if (renderer) {
            try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { console.warn('Renderer dispose error:', e); }
          }
        }
      } else if (msg.action === 'RESET_VIEW') document.getElementById('btn-reset')?.click();
      else if (msg.action === 'TOGGLE_WIREFRAME') document.getElementById('btn-wireframe')?.click();
    });
  }
  window.addEventListener('DOMContentLoaded', initViewport);
  Object.assign(window, { showError, hideError, showToast, notifyHost, initViewport });
})();