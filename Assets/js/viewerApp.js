/**
 * CAD Viewport Host Controller, Studio Camera Engine & Web Worker Bridge (v2.0.0 - Full Restored)
 * Three.js WebGL rendering, 4-point studio lights, PMREM environment, ground contact shadows,
 * interaction raycasting (3D section gizmo dragging, measurement snapping), camera tweening, hotkeys & Host IPC.
 */

// 1. Viewport Initialization, Studio Lighting, PMREM & Worker Bridge
    // 1. Initialize Three.js Viewport
        let currentWorker = null;
    let workerReady = false;
    let pendingFileBuffer = null;
    let pendingFileName = '';
    let activeCadFormat = 'STEP';
    let activeLoadId = 0;
    let workerDispatchedLoadId = 0;

    function detectCadFormat(name) {
      if (!name) return 'STEP';
      const ext = name.toLowerCase().split('.').pop();
      if (ext === 'stl') return 'STL';
      if (ext === 'iges' || ext === 'igs') return 'IGES';
      if (ext === 'brep') return 'BREP';
      return 'STEP';
    }

    function computeSafeCameraDistance(targetBox, padding = 1.25) {
      if (!targetBox || targetBox.isEmpty()) return 100;
      const sphere = new THREE.Sphere();
      targetBox.getBoundingSphere(sphere);
      const radius = Math.max(sphere.radius, 1.0);

      const fov = (camera && camera.isPerspectiveCamera && camera.fov) ? camera.fov : 45;
      const aspect = (camera && camera.aspect) ? Math.max(camera.aspect, 0.1) : ((window.innerWidth && window.innerHeight) ? Math.max(window.innerWidth / window.innerHeight, 0.1) : 1.0);
      const vFovRad = fov * (Math.PI / 180);
      const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);

      // Exact distance required so bounding sphere fits completely inside BOTH vertical & horizontal frustum planes:
      const distV = radius / Math.sin(vFovRad / 2);
      const distH = radius / Math.sin(hFovRad / 2);
      return Math.max(distV, distH, 10) * padding;
    }

    let isWireframeActive = false;
    let isAutoRotateActive = false;
    let isEdgesActive = true; // SolidWorks Shaded with Edges (Default ON)
    let currentModelCenter = new THREE.Vector3();
    let currentModelDistance = 100;
    let initialCameraState = { position: new THREE.Vector3(), target: new THREE.Vector3() };
    let loadTimer = null;
    let perspCamera = null;
    let orthoCamera = null;
    let ambientLight = null;
    let keyLight = null;
    let fillLight = null;
    let rimLight = null;
    let topLight = null;
    let bottomBounceLight = null;

    function initStudioEnvironment(renderer) {
      try {
        if (typeof THREE.PMREMGenerator !== 'function') return;
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();

        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color(0x181c24);

        const p1 = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        p1.position.set(0, 40, 20);
        p1.rotation.x = Math.PI / 2.5;
        envScene.add(p1);

        const p2 = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }));
        p2.position.set(-30, 20, -20);
        p2.lookAt(0, 0, 0);
        envScene.add(p2);

        const p3 = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshBasicMaterial({ color: 0xcfd8dc }));
        p3.position.set(30, 10, -30);
        p3.lookAt(0, 0, 0);
        envScene.add(p3);

        const target = pmrem.fromScene(envScene, 0.04);
        studioEnvTexture = target.texture;
        scene.environment = studioEnvTexture;
        pmrem.dispose();
      } catch (e) {
        console.warn('Studio PMREM environment fallback:', e);
      }
    }

function initViewport() {
      const container = document.getElementById('canvas-container');
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x191c22); // Option 3 Deep Matte Slate CAD Background
      scene.add(modelGroup);
      scene.add(measureGroup);
      scene.add(explodeTrailsGroup);
      scene.add(sectionStencilGroup);
      window.modelGroup = modelGroup;
      window.scene = scene;
      window.startTessellation = startTessellation;

      camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50000);
      camera.position.set(100, 100, 100);
      perspCamera = camera;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.localClippingEnabled = true; // Enable Hardware GPU Cross-Section Cutting
      if (!renderer.shadowMap) renderer.shadowMap = {};
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);
      initStudioEnvironment(renderer);

      // Snap Indicator for Smart Measurement
      const snapGeom = new THREE.SphereGeometry(1, 16, 16);
      const snapMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85, depthTest: false });
      snapIndicator = new THREE.Mesh(snapGeom, snapMat);
      snapIndicator.visible = false;
      snapIndicator.renderOrder = 999;
      measureGroup.add(snapIndicator);

      // Hover Edge Highlight Object
      const hoverGeom = new THREE.BufferGeometry();
      const hoverMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        linewidth: 3,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });
      hoverEdgeMesh = new THREE.Line(hoverGeom, hoverMat);
      hoverEdgeMesh.visible = false;
      hoverEdgeMesh.renderOrder = 999;
      measureGroup.add(hoverEdgeMesh);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.screenSpacePanning = true;

      // Assign global graphics handles to window
      window.camera = camera;
      window.controls = controls;
      window.renderer = renderer;
      window.scene = scene;

      // CAD Industry-Standard Navigation Controls
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN
      };

      // Prevent browser context menu on right-click pan
      window.addEventListener('contextmenu', (e) => e.preventDefault());

      // Technical Studio 5-Point Neutral CAD Lighting
      ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
      scene.add(ambientLight);

      keyLight = new THREE.DirectionalLight(0xf8fafc, 0.95);
      keyLight.position.set(1.2, 2.0, 1.5).normalize();
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.bias = -0.0001;
      scene.add(keyLight);
      scene.add(keyLight.target);

      fillLight = new THREE.DirectionalLight(0x94a3b8, 0.45);
      fillLight.position.set(-1.5, -0.6, -1.2).normalize();
      scene.add(fillLight);

      rimLight = new THREE.DirectionalLight(0xe2e8f0, 0.30);
      rimLight.position.set(-1.0, 1.5, -2.0).normalize();
      scene.add(rimLight);

      topLight = new THREE.DirectionalLight(0xffffff, 0.25);
      topLight.position.set(0, 1, 0);
      scene.add(topLight);

      bottomBounceLight = new THREE.DirectionalLight(0x64748b, 0.20);
      bottomBounceLight.position.set(0, -1, 0);
      scene.add(bottomBounceLight);

      // Global export for lighting inspection & subsystems
      window.ambientLight = ambientLight;
      window.keyLight = keyLight;
      window.fillLight = fillLight;
      window.rimLight = rimLight;

      window.addEventListener('resize', onResize);
      // Precision Trackpad Gestures (Pinch-to-zoom & Smooth Pan)
      const handlePrecisionWheel = (e) => {
        if (e.ctrlKey && controls) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          const zoomFactor = Math.exp(-e.deltaY * 0.002);
          if (camera && camera.isOrthographicCamera) {
            camera.zoom = Math.max(0.01, Math.min(100.0, camera.zoom * zoomFactor));
            camera.updateProjectionMatrix();
          } else if (camera) {
            const dir = camera.position.clone().sub(controls.target);
            const currentDist = dir.length();
            if (currentDist > 1e-4) {
              const minD = (controls.minDistance > 0) ? controls.minDistance : 0.1;
              const maxD = (controls.maxDistance < Infinity) ? controls.maxDistance : 100000;
              const newDist = Math.max(minD, Math.min(maxD, currentDist / zoomFactor));
              camera.position.copy(controls.target).add(dir.normalize().multiplyScalar(newDist));
            }
          }
          controls.update();
        }
      };

      if (renderer && renderer.domElement) {
        renderer.domElement.addEventListener('wheel', handlePrecisionWheel, { capture: true, passive: false });
      }
      window.addEventListener('wheel', handlePrecisionWheel, { capture: true, passive: false });

      if (typeof setupToolbar === 'function') setupToolbar();
      // Lazy worker initialization: OpenCASCADE WASM worker is NOT started eagerly.
      // It is initialized on-demand only if a STEP, IGES, or BREP file is loaded.
      const initialStatusEl = document.getElementById('status-text');
      if (initialStatusEl) initialStatusEl.innerText = 'Ready for CAD files';
      const initialSpinnerEl = document.getElementById('spinner');
      if (initialSpinnerEl) initialSpinnerEl.style.display = 'none';
      animate();
      if (typeof window.initViewCube === "function") window.initViewCube();
      if (typeof window.initWorkbenchUI === "function") window.initWorkbenchUI();

      // Phase 1: Wire restored dead listener setup functions
      if (typeof window.setupSectionListeners === 'function') window.setupSectionListeners();
      if (typeof window.setupSnapshotListeners === 'function') window.setupSnapshotListeners();
      if (typeof window.setupAppearanceListeners === 'function') window.setupAppearanceListeners();
      if (typeof window.setupExplodedViewListeners === 'function') window.setupExplodedViewListeners();
      if (typeof window.setupMaterialsListeners === 'function') window.setupMaterialsListeners();
      if (typeof window.setupCachePurgeButton === 'function') {
        window.setupCachePurgeButton();
      } else if (window.AdminTwin && typeof window.AdminTwin.setupCachePurgeButton === 'function') {
        window.AdminTwin.setupCachePurgeButton();
      }

      if (typeof notifyHost === 'function') notifyHost({ type: 'VIEWPORT_READY' });

      // Silent non-blocking update check (rate-limited to 12h)
      setTimeout(() => {
        if (window.AutoUpdater) window.AutoUpdater.checkForUpdates(false);
      }, 2000);
    }

    let activeCameraTween = null;

    // Smooth CAD View Interpolation (Spherical Geodesic Quaternion Slerp - Constant Orbit Radius)
    function tweenCamera(targetPos, targetLookAt, targetUp = new THREE.Vector3(0, 1, 0), duration = 350) {
      if (!camera || !controls) return;

      if (activeCameraTween) {
        cancelAnimationFrame(activeCameraTween.reqId);
        if (controls) controls.enableDamping = activeCameraTween.prevDamping;
        activeCameraTween = null;
      }

      // Decouple residual damping momentum during trajectory animation
      const prevDamping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();

      const startTarget = controls.target.clone();
      const startPos = camera.position.clone();
      const startDist = Math.max(startPos.distanceTo(startTarget), 0.001);

      const endTarget = (targetLookAt ? targetLookAt.clone() : startTarget.clone());
      const endDist = Math.max(targetPos.distanceTo(endTarget), 0.001);

      const upVec = (targetUp && targetUp.lengthSq() > 0.001) ? targetUp.clone() : new THREE.Vector3(0, 1, 0);
      const m = new THREE.Matrix4().lookAt(targetPos, endTarget, upVec);
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m);

      let startQuat = camera.quaternion.clone();
      if (isNaN(startQuat.x) || startQuat.lengthSq() < 1e-4) {
        const mStart = new THREE.Matrix4().lookAt(startPos, startTarget, camera.up || new THREE.Vector3(0, 1, 0));
        startQuat.setFromRotationMatrix(mStart);
      }

      const destQuat = targetQuat.clone();
      if (startQuat.dot(destQuat) < 0) {
        destQuat.set(-destQuat.x, -destQuat.y, -destQuat.z, -destQuat.w);
      }

      const startTime = performance.now();

      function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        // Smooth cubic ease out
        const ease = 1 - Math.pow(1 - progress, 3);

        const curQuat = startQuat.clone().slerp(destQuat, ease);
        const curDist = THREE.MathUtils.lerp(startDist, endDist, ease);
        const curTarget = startTarget.clone().lerp(endTarget, ease);

        // Spherical geodesic camera position: P(t) = C(t) + q(t) * (0, 0, R(t))
        const camDir = new THREE.Vector3(0, 0, 1).applyQuaternion(curQuat);
        const newPos = curTarget.clone().addScaledVector(camDir, curDist);
        const newUp = new THREE.Vector3(0, 1, 0).applyQuaternion(curQuat);

        camera.position.copy(newPos);
        camera.quaternion.copy(curQuat);
        if (newUp.lengthSq() > 0.001) {
          camera.up.copy(newUp).normalize();
        } else if (upVec) {
          camera.up.copy(upVec);
        }
        controls.target.copy(curTarget);
        controls.update();
        camera.quaternion.copy(curQuat);
        camera.position.copy(newPos);

        if (typeof window.updateViewCube === 'function') {
          window.updateViewCube();
        }

        if (progress < 1.0) {
          activeCameraTween = { reqId: requestAnimationFrame(step), prevDamping };
        } else {
          controls.enableDamping = prevDamping;
          activeCameraTween = null;
        }
      }

      activeCameraTween = { reqId: requestAnimationFrame(step), prevDamping };
    }

    function switchCamera(targetType, silent = false) {
      if (!camera || !controls) return;
      const isCurrentlyPersp = !!camera.isPerspectiveCamera;
      let shouldBeOrtho = false;
      if (targetType) {
        const t = String(targetType).toLowerCase();
        shouldBeOrtho = (t === 'ortho' || t === 'orthographic');
      } else {
        shouldBeOrtho = isCurrentlyPersp;
      }

      const aspect = (window.innerWidth && window.innerHeight) ? (window.innerWidth / window.innerHeight) : 1.0;

      if (shouldBeOrtho && isCurrentlyPersp) {
        // Perspective -> Orthographic
        let d = (controls.target) ? camera.position.distanceTo(controls.target) : 100;
        if (d <= 0.001) {
          if (modelGroup && modelGroup.children.length > 0) {
            const box = new THREE.Box3().setFromObject(modelGroup);
            if (!box.isEmpty()) {
              const sphere = new THREE.Sphere();
              box.getBoundingSphere(sphere);
              d = Math.max(sphere.radius, 1.0);
            } else {
              d = Math.max(currentModelDistance, 100);
            }
          } else {
            d = Math.max(currentModelDistance, 100);
          }
        }

        const fov = (camera.fov) ? camera.fov : 45;
        const H_world = 2 * d * Math.tan((fov * Math.PI / 180) / 2);
        const halfH = H_world / 2;
        const halfW = halfH * aspect;
        const clipDist = Math.max(d * 10, 50000);

        if (!orthoCamera) {
          orthoCamera = new THREE.OrthographicCamera(
            -halfW, halfW,
            halfH, -halfH,
            -clipDist, clipDist
          );
        } else {
          orthoCamera.left = -halfW;
          orthoCamera.right = halfW;
          orthoCamera.top = halfH;
          orthoCamera.bottom = -halfH;
          orthoCamera.near = -clipDist;
          orthoCamera.far = clipDist;
        }

        orthoCamera.position.copy(camera.position);
        orthoCamera.rotation.copy(camera.rotation);
        orthoCamera.quaternion.copy(camera.quaternion);
        orthoCamera.up.copy(camera.up);
        orthoCamera.zoom = 1.0;
        orthoCamera.fov = 45; // Polyfill for legacy callers (measureEngine, assemblyTree, explodedView)
        orthoCamera.aspect = aspect;
        orthoCamera.userData = { baseHalfH: halfH, baseDistance: d };
        orthoCamera.updateProjectionMatrix();

        camera = orthoCamera;
        window.camera = orthoCamera;
        controls.object = orthoCamera;
        controls.update();

        const btn = document.getElementById('vc-btn-persp');
        if (btn) {
          btn.innerText = 'Ortho';
          btn.classList.add('active');
          btn.title = 'Switch to Perspective Camera [O]';
        }
        if (!silent && typeof window.showToast === 'function') {
          window.showToast('Switched to Orthographic Camera');
        }
      } else if (!shouldBeOrtho && !isCurrentlyPersp) {
        // Orthographic -> Perspective
        if (!perspCamera) {
          perspCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 50000);
        }

        const fov = (perspCamera.fov) ? perspCamera.fov : 45;
        const fovRad = fov * Math.PI / 180;
        const d = (orthoCamera && orthoCamera.userData && orthoCamera.userData.baseDistance)
          ? orthoCamera.userData.baseDistance
          : (((orthoCamera ? (orthoCamera.top - orthoCamera.bottom) : 100) / 2) / Math.tan(fovRad / 2));
        const zoom = (camera.zoom && camera.zoom > 0) ? camera.zoom : 1.0;
        const dPrime = d / zoom;

        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        if (dir.lengthSq() < 1e-4) {
          dir.set(0, 0, -1);
        }
        dir.normalize();

        if (controls && controls.target) {
          perspCamera.position.copy(controls.target).addScaledVector(dir.clone().negate(), dPrime);
        } else {
          perspCamera.position.copy(camera.position);
        }
        perspCamera.rotation.copy(camera.rotation);
        perspCamera.quaternion.copy(camera.quaternion);
        perspCamera.up.copy(camera.up);
        perspCamera.aspect = aspect;
        perspCamera.updateProjectionMatrix();

        camera = perspCamera;
        window.camera = perspCamera;
        if (controls.maxDistance !== undefined && dPrime > controls.maxDistance) controls.maxDistance = dPrime * 2;
        if (controls.minDistance !== undefined && dPrime < controls.minDistance) controls.minDistance = Math.max(dPrime * 0.5, 0.0001);
        controls.object = perspCamera;
        controls.update();

        const btn = document.getElementById('vc-btn-persp');
        if (btn) {
          btn.innerText = 'Persp';
          btn.classList.remove('active');
          btn.title = 'Switch to Orthographic Camera [O]';
        }
        if (!silent && typeof window.showToast === 'function') {
          window.showToast('Switched to Perspective Camera');
        }
      }
    }

    function toggleOrthoPersp() {
      switchCamera();
    }

    function onResize() {
      const aspect = (window.innerWidth && window.innerHeight) ? (window.innerWidth / window.innerHeight) : 1.0;
      if (camera && camera.isOrthographicCamera) {
        camera.aspect = aspect;
        const halfH = (camera.userData && camera.userData.baseHalfH)
          ? camera.userData.baseHalfH
          : ((camera.top - camera.bottom) / 2);
        camera.left = -halfH * aspect;
        camera.right = halfH * aspect;
        camera.top = halfH;
        camera.bottom = -halfH;
        camera.updateProjectionMatrix();
      } else if (camera) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function updateScreenSpaceAnnotations() {
      if (!measureGroup || !camera) return;
      const h = window.innerHeight || 800;
      const isOrtho = !!camera.isOrthographicCamera;
      let orthoWorldPerPx = 0;
      let tanHalf = 0;

      if (isOrtho) {
        orthoWorldPerPx = (camera.top - camera.bottom) / (h * (camera.zoom || 1.0));
      } else {
        const vFovRad = THREE.MathUtils.degToRad(camera.fov || 45);
        tanHalf = Math.tan(vFovRad / 2);
      }

      measureGroup.traverse(obj => {
        if (obj.userData && obj.userData.isScreenScaled) {
          const dist = camera.position.distanceTo(obj.position);
          const worldPerPx = isOrtho ? orthoWorldPerPx : ((2 * tanHalf * dist) / h);
          const r = Math.max(worldPerPx * (obj.userData.screenPixelRadius || 7.5), 0.0001);
          obj.scale.set(r, r, r);
        } else if (obj.userData && obj.userData.isScreenScaledSprite) {
          const dist = camera.position.distanceTo(obj.position);
          const worldPerPx = isOrtho ? orthoWorldPerPx : ((2 * tanHalf * dist) / h);
          const sh = Math.max(worldPerPx * (obj.userData.pixelHeight || 34), 0.0001);
          const sw = sh * (obj.userData.aspect || 4.0);
          obj.scale.set(sw, sh, 1);
        }
      });

      if (snapIndicator && snapIndicator.visible) {
        const dist = camera.position.distanceTo(snapIndicator.position);
        const worldPerPx = isOrtho ? orthoWorldPerPx : ((2 * tanHalf * dist) / h);
        const r = Math.max(worldPerPx * 7.0, 0.0001);
        snapIndicator.scale.set(r, r, r);
      }
    }

    function animate() {
      requestAnimationFrame(animate);
      if (isAutoRotateActive && controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 2.0;
      } else if (controls) {
        controls.autoRotate = false;
      }
      if (controls) controls.update();
      updateScreenSpaceAnnotations();
      renderer.render(scene, camera);
      drawTriad();
      if (typeof window.updateViewCube === "function") window.updateViewCube();
    }

    // 3D Triad Orientation Indicator in Corner
    function drawTriad() {
      const canvas = document.getElementById('triad-canvas');
      if (!canvas || !camera) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 70, 70);
      const cx = 35, cy = 35, r = 22;

      const rotMatrix = new THREE.Matrix4().extractRotation(camera.matrixWorldInverse);

      const axes = [
        { dir: new THREE.Vector3(1, 0, 0), label: 'X', color: '#e05656' },
        { dir: new THREE.Vector3(0, 1, 0), label: 'Y', color: '#3eb86f' },
        { dir: new THREE.Vector3(0, 0, 1), label: 'Z', color: '#4a9eed' }
      ];

      axes.forEach(a => { a.proj = a.dir.clone().applyMatrix4(rotMatrix); });
      axes.sort((a, b) => a.proj.z - b.proj.z);

      axes.forEach(a => {
        const px = cx + a.proj.x * r;
        const py = cy - a.proj.y * r;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 2.0;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, 5.0, 0, Math.PI * 2);
        ctx.fillStyle = a.color;
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 7px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(a.label, px, py);
      });
    }

    // 2. Web Worker Management
    function initWorker() {
      if (currentWorker) {
        currentWorker.terminate();
      }

      currentWorker = new Worker('stepWorker.js');
      workerReady = false;

      currentWorker.onmessage = function (e) {
        const msg = e.data;
        if (!msg) return;

        if (msg.type === 'READY') {
          workerReady = true;
          window._workerReadyInfo = msg;

          if (pendingFileBuffer) {
            const buf = pendingFileBuffer;
            const fn = pendingFileName;
            pendingFileBuffer = null;
            startTessellation(buf, fn);
          } else if (activeCadFormat !== 'STL') {
            const stEl = document.getElementById('status-text');
            if (stEl && (stEl.innerText === 'Initializing OpenCASCADE engine...' || !stEl.innerText)) {
              stEl.innerText = 'Ready for CAD files';
            }
            const spEl = document.getElementById('spinner');
            if (spEl) spEl.style.display = 'none';
          }
        } else if (msg.type === 'PARSE_SUCCESS') {
          if (msg.loadId && msg.loadId !== activeLoadId) return;
          if (workerDispatchedLoadId !== activeLoadId || activeCadFormat === 'STL') return;
          window._lastTessellationElapsed = msg.elapsedMs;
          window._lastWasmSource = msg.wasmSource;
          onTessellationComplete(msg);
          if (msg.cacheKey && msg.meshes) {
            saveCachedModel(msg.cacheKey, msg, msg.bufferSize || 0);
          }
        } else if (msg.type === 'PARSE_ERROR') {
          if (msg.loadId && msg.loadId !== activeLoadId) return;
          if (workerDispatchedLoadId !== activeLoadId || activeCadFormat === 'STL') return;
          showError('CAD Parse Error: ' + (msg.message || 'Unknown error'));
        }
      };

      currentWorker.onerror = function (err) {
        showError('Worker Error: ' + (err.message || 'Failed to execute worker'));
      };

      currentWorker.postMessage({ type: 'INIT' });
    }

    // =============================================================
    // Smart Auto-Purging LRU Cache for Instant Previews (<0.02s)
    // Strictly limited to Max 60 models or 300MB total space.
    // =============================================================
    const DB_NAME = 'QuickLook_StepCache';
    const DB_VERSION = 1;
    const STORE_NAME = 'models';
    const MAX_CACHE_ENTRIES = 60;
    const MAX_CACHE_BYTES = 300 * 1024 * 1024; // 300 MB cap

    function openCacheDB() {
      return new Promise((resolve) => {
        if (!window.indexedDB) { resolve(null); return; }
        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = function (e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
              store.createIndex('timestamp', 'timestamp', { unique: false });
            }
          };
          req.onsuccess = function (e) { resolve(e.target.result); };
          req.onerror = function () { resolve(null); };
        } catch (e) {
          resolve(null);
        }
      });
    }

    async function getCachedModel(key) {
      try {
        const db = await openCacheDB();
        if (!db) return null;
        return new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(key);
          req.onsuccess = function () {
            const result = req.result;
            if (result && result.meshes) {
              updateCacheTimestamp(db, key);
              resolve(result);
            } else {
              resolve(null);
            }
          };
          req.onerror = function () { resolve(null); };
        });
      } catch (e) {
        return null;
      }
    }

    function updateCacheTimestamp(db, key) {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = function () {
          if (req.result) {
            req.result.timestamp = Date.now();
            store.put(req.result);
          }
        };
      } catch (e) {}
    }

    async function saveCachedModel(key, modelData, byteLength) {
      try {
        const db = await openCacheDB();
        if (!db) return;
        await pruneCache(db);

        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({
          key: key,
          meshes: modelData.meshes,
          meshCount: modelData.meshCount,
          size: byteLength,
          timestamp: Date.now()
        });
      } catch (e) {}
    }

    function pruneCache(db) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const index = store.index('timestamp');
          const req = index.getAll();
          req.onsuccess = function () {
            const items = req.result || [];
            items.sort((a, b) => a.timestamp - b.timestamp);

            let totalBytes = items.reduce((sum, item) => sum + (item.size || 0), 0);

            // Evict oldest items if exceeding model count (60) or byte size (300 MB)
            while (items.length >= MAX_CACHE_ENTRIES || totalBytes > MAX_CACHE_BYTES) {
              const oldest = items.shift();
              if (!oldest) break;
              store.delete(oldest.key);
              totalBytes -= (oldest.size || 0);
            }
            resolve();
          };
          req.onerror = function () { resolve(); };
        } catch (e) {
          resolve();
        }
      });
    }

    function clearAllCache() {
      return new Promise((resolve) => {
        openCacheDB().then((db) => {
          if (!db) { resolve(false); return; }
          try {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.clear();
            req.onsuccess = function () { resolve(true); };
            req.onerror = function () { resolve(false); };
          } catch (e) {
            resolve(false);
          }
        });
      });
    }

    // 3. Start CAD Tessellation (With Instant Cache & Live Progress Feedback)
    async function startTessellation(buffer, fileName) {
      if (fileName) {
        pendingFileName = fileName;
        window.pendingFileName = fileName;
        window.currentLoadedModelName = fileName;
      } else if (!pendingFileName) {
        pendingFileName = 'CAD_Model';
        window.pendingFileName = 'CAD_Model';
        window.currentLoadedModelName = 'CAD_Model';
      }
      if (typeof window !== 'undefined') {
        window.getLoadedFileName = () => pendingFileName;
      }
      activeCadFormat = detectCadFormat(pendingFileName);
      if (typeof window !== 'undefined') {
        window.activeCadFormat = activeCadFormat;
      }
      const loadId = ++activeLoadId;
      if (typeof window !== 'undefined') {
        window._activeLoadId = activeLoadId;
      }

      if (loadTimer) {
        clearInterval(loadTimer);
        loadTimer = null;
      }

      const bufferMB = buffer.byteLength / (1024 * 1024);
      const sizeFormatted = bufferMB >= 1 ? `${bufferMB.toFixed(1)} MB` : `${Math.round(buffer.byteLength / 1024)} KB`;
      const fnEl = document.getElementById('badge-filename');
      if (fnEl) fnEl.innerText = `${pendingFileName} (${sizeFormatted})`;
      const spEl = document.getElementById('spinner');
      if (spEl) spEl.style.display = 'inline-block';
      hideError();

      // Clear previous models
      clearModel();

      // Native Pure JS STL fast-path: 100% bypass of OpenCASCADE WASM worker
      if (activeCadFormat === 'STL') {
        pendingFileBuffer = null;
        if (loadTimer) {
          clearInterval(loadTimer);
          loadTimer = null;
        }
        const progressBar = document.getElementById('loading-progress-bar');
        if (progressBar) progressBar.style.display = 'none';

        try {
          const t0 = performance.now();
          const stlEngine = (typeof window !== 'undefined' && window.StlLoader) ? window.StlLoader : (typeof StlLoader !== 'undefined' ? StlLoader : null);
          if (!stlEngine || typeof stlEngine.parse !== 'function') {
            throw new Error('StlLoader is not loaded');
          }
          const result = stlEngine.parse(buffer, pendingFileName);
          result.elapsedMs = Math.round(performance.now() - t0);
          result.loadId = loadId;

          // Smart Mesh Feature Detection (creases, circular holes, coplanar B-Rep faces)
          const detector = (typeof window !== 'undefined' && window.MeshFeatureDetector) ? window.MeshFeatureDetector : (typeof MeshFeatureDetector !== 'undefined' ? MeshFeatureDetector : null);
          if (detector && typeof detector.detectFeatures === 'function' && result.meshes) {
            for (let i = 0; i < result.meshes.length; i++) {
              const m = result.meshes[i];
              const features = detector.detectFeatures(m);
              if (features) {
                m.edgeFeatures = features.edgeFeatures || [];
                m.brepFaces = features.brepFaces || [];
                m.edgeIndices = features.edgeIndices || null;
              }
            }
          }

          onTessellationComplete(result);
        } catch (err) {
          showError('STL Parse Error: ' + (err.message || 'Failed to parse STL file'));
          const stEl = document.getElementById('status-text');
          if (stEl) stEl.innerText = 'STL Parse Error';
          const spEl = document.getElementById('spinner');
          if (spEl) spEl.style.display = 'none';
        }
        return;
      }

      const cacheKey = (pendingFileName || 'model') + '_' + buffer.byteLength + '_v7';

      // 1. Check instant cache first (<15ms)
      try {
        const cached = await getCachedModel(cacheKey);
        if (loadId !== activeLoadId) return;
        if (cached && cached.meshes && cached.meshes.length > 0) {
          onTessellationComplete({
            format: activeCadFormat,
            fileName: pendingFileName,
            meshes: cached.meshes,
            meshCount: cached.meshCount,
            elapsedMs: 12,
            isCached: true,
            loadId: loadId
          });
          return;
        }
      } catch (e) {}

      const statusEl = document.getElementById('status-text');
      const progressBar = document.getElementById('loading-progress-bar');
      if (progressBar) progressBar.style.display = 'block';

      let elapsedSec = 0;
      statusEl.innerText = `Processing ${activeCadFormat} geometry... (0s)`;
      loadTimer = setInterval(() => {
        elapsedSec++;
        if (elapsedSec < 3) {
          statusEl.innerText = `Reading ${activeCadFormat} entity stream... (${elapsedSec}s)`;
        } else if (elapsedSec < 15) {
          statusEl.innerText = `Resolving CAD topology & B-Rep curves... (${elapsedSec}s)`;
        } else if (elapsedSec < 26) {
          statusEl.innerText = `Sewing solid faces & healing entities... (${elapsedSec}s)`;
        } else {
          statusEl.innerText = `Tessellating 3D surface mesh... (${elapsedSec}s)`;
        }
      }, 1000);

      // Lazy initialization of OpenCASCADE worker for STEP, IGES, and BREP
      if (!workerReady) {
        pendingFileBuffer = buffer;
        if (!currentWorker && typeof initWorker === 'function') {
          initWorker();
        }
        return;
      }

      // Default null params for optimal Open CASCADE internal fast-path (skips bounding box pass)
      workerDispatchedLoadId = loadId;
      currentWorker.postMessage({
        type: 'PARSE',
        buffer: buffer,
        fileName: pendingFileName,
        cacheKey: cacheKey,
        bufferSize: buffer.byteLength,
        params: null,
        loadId: loadId
      }, [buffer]);
    }

    function onTessellationComplete(data) {
      if (data.loadId && data.loadId !== activeLoadId) return;
      if (loadTimer) {
        clearInterval(loadTimer);
        loadTimer = null;
      }
      const progressBar = document.getElementById('loading-progress-bar');
      if (progressBar) progressBar.style.display = 'none';

      if (data.fileName) {
        pendingFileName = data.fileName;
        window.pendingFileName = data.fileName;
        window.currentLoadedModelName = data.fileName;
        const bEl = document.getElementById('badge-filename');
        if (bEl && data.bufferSize) {
          const bufferMB = data.bufferSize / (1024 * 1024);
          const sizeFormatted = bufferMB >= 1 ? `${bufferMB.toFixed(1)} MB` : `${Math.round(data.bufferSize / 1024)} KB`;
          bEl.innerText = `${pendingFileName} (${sizeFormatted})`;
        }
      }
      if (data.format) {
        activeCadFormat = data.format;
      } else if (pendingFileName) {
        activeCadFormat = detectCadFormat(pendingFileName);
      }
      if (typeof window !== 'undefined') {
        window.activeCadFormat = activeCadFormat;
      }

      const speedLabel = data.isCached ? '⚡ Instant Cache (12ms)' : `Parsed in ${(data.elapsedMs / 1000).toFixed(1)}s`;
      const stEl = document.getElementById('status-text');
      if (stEl) stEl.innerText = `${speedLabel} (${data.meshCount} solids)`;
      const spDone = document.getElementById('spinner');
      if (spDone) spDone.style.display = 'none';

      clearModel();

      modelEdgeFeatures = [];
      if (data.meshes) {
        const detector = (typeof window !== 'undefined' && window.MeshFeatureDetector) ? window.MeshFeatureDetector : (typeof MeshFeatureDetector !== 'undefined' ? MeshFeatureDetector : null);
        for (let i = 0; i < data.meshes.length; i++) {
          const m = data.meshes[i];
          if ((!m.edgeFeatures || m.edgeFeatures.length === 0) && detector && typeof detector.detectFeatures === 'function' && (activeCadFormat === 'STL' || (!m.brepFaces || m.brepFaces.length === 0))) {
            const features = detector.detectFeatures(m);
            if (features) {
              m.edgeFeatures = features.edgeFeatures || [];
              m.brepFaces = features.brepFaces || [];
              m.edgeIndices = features.edgeIndices || null;
            }
          }
          if (m.edgeFeatures && m.edgeFeatures.length > 0) {
            modelEdgeFeatures.push(...m.edgeFeatures);
          }
        }
      }
      if (typeof indexModelVertices === 'function') indexModelVertices(data.meshes);

      if (!data.meshes || data.meshes.length === 0) {
        showError(`This ${activeCadFormat} file was successfully parsed, but contains only 2D wireframe curves/sketches (no 3D solid or surface geometry).`);
        document.getElementById('status-text').innerText = '2D Wireframe Sketch (No 3D Solids)';
        return;
      }

      let totalTriangles = 0;
      let totalAreaMm2 = 0;
      let totalVolMm3 = 0;

      for (let i = 0; i < data.meshes.length; i++) {
        const m = data.meshes[i];
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.position), 3));

        if (m.normal) {
          geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(m.normal), 3));
        } else {
          geometry.computeVertexNormals();
        }

        if (m.index) {
          geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(m.index), 1));
          const numTris = m.index.length / 3;
          totalTriangles += numTris;

          // Compute surface area and signed tetrahedron volume
          const pos = m.position;
          const idx = m.index;
          for (let t = 0; t < numTris; t++) {
            const i0 = idx[t * 3] * 3;
            const i1 = idx[t * 3 + 1] * 3;
            const i2 = idx[t * 3 + 2] * 3;

            const ax = pos[i0], ay = pos[i0 + 1], az = pos[i0 + 2];
            const bx = pos[i1], by = pos[i1 + 1], bz = pos[i1 + 2];
            const cx = pos[i2], cy = pos[i2 + 1], cz = pos[i2 + 2];

            const abx = bx - ax, aby = by - ay, abz = bz - az;
            const acx = cx - ax, acy = cy - ay, acz = cz - az;
            const crossX = aby * acz - abz * acy;
            const crossY = abz * acx - abx * acz;
            const crossZ = abx * acy - aby * acx;
            totalAreaMm2 += 0.5 * Math.hypot(crossX, crossY, crossZ);

            totalVolMm3 += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6.0;
          }
        } else {
          const numTris = m.position.length / 9;
          totalTriangles += numTris;
          if (typeof m.volumeMm3 === 'number' && typeof m.areaMm2 === 'number') {
            totalVolMm3 += m.volumeMm3;
            totalAreaMm2 += m.areaMm2;
          } else {
            const pos = m.position;
            for (let t = 0; t < numTris; t++) {
              const k = t * 9;
              const ax = pos[k],     ay = pos[k + 1], az = pos[k + 2];
              const bx = pos[k + 3], by = pos[k + 4], bz = pos[k + 5];
              const cx = pos[k + 6], cy = pos[k + 7], cz = pos[k + 8];

              const abx = bx - ax, aby = by - ay, abz = bz - az;
              const acx = cx - ax, acy = cy - ay, acz = cz - az;
              const crossX = aby * acz - abz * acy;
              const crossY = abz * acx - abx * acz;
              const crossZ = abx * acy - aby * acx;
              totalAreaMm2 += 0.5 * Math.hypot(crossX, crossY, crossZ);

              totalVolMm3 += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6.0;
            }
          }
        }

        // Color handling
        let meshColor = new THREE.Color(0xb8c0cc);
        if (m.color && Array.isArray(m.color) && m.color.length >= 3) {
          const r = m.color[0] > 1 ? m.color[0] / 255 : m.color[0];
          const g = m.color[1] > 1 ? m.color[1] / 255 : m.color[1];
          const b = m.color[2] > 1 ? m.color[2] / 255 : m.color[2];
          meshColor = new THREE.Color(r, g, b);
        }

        const material = new THREE.MeshStandardMaterial({
          color: meshColor,
          metalness: 0.35,
          roughness: 0.34,
          envMapIntensity: 1.0,
          side: THREE.DoubleSide,
          wireframe: isWireframeActive,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
          clippingPlanes: isSectionActive ? [sectionPlane] : []
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = m.name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = {
          bodyId: i,
          name: m.name,
          originalColor: meshColor.clone(),
          isGhosted: false,
          isHidden: false,
          brepFaces: m.brepFaces || [],
          edgeIndices: m.edgeIndices || null,
          volumeMm3: m.volumeMm3 || 0,
          areaMm2: m.areaMm2 || 0
        };

        // SolidWorks-style Mechanical Feature Edges (True B-Rep Topological Boundaries)
        let edgesMat = null;
        let edgeLines = null;
        try {
          edgesMat = new THREE.LineBasicMaterial({
            color: 0x0f172a,
            linewidth: 1,
            transparent: true,
            opacity: 0.85,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: isSectionActive ? [sectionPlane] : []
          });

          if (m.edgeIndices && m.edgeIndices.length > 0) {
            // True CAD B-Rep boundaries (eliminates internal mesh chord zigzags in fillets/slots)
            const edgesGeom = new THREE.BufferGeometry();
            edgesGeom.setAttribute('position', geometry.attributes.position);
            edgesGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(m.edgeIndices), 1));
            edgeLines = new THREE.LineSegments(edgesGeom, edgesMat);
          } else {
            // Fallback dihedral angle if topological data not present (28 deg threshold)
            const edgesGeom = new THREE.EdgesGeometry(geometry, 28);
            edgeLines = new THREE.LineSegments(edgesGeom, edgesMat);
          }

          if (edgeLines) {
            edgeLines.name = 'solidworks_edges';
            edgeLines.renderOrder = 1;
            edgeLines.visible = isEdgesActive && !isWireframeActive;
            mesh.add(edgeLines);
            mesh.userData.edgeLines = edgeLines;
          }
        } catch (e) {
          console.warn('Edges generation skipped:', e);
        }

        modelGroup.add(mesh);

        modelBodies.push({
          id: i,
          name: m.name,
          mesh: mesh,
          edgeMesh: edgeLines,
          data: m,
          isGhosted: false,
          isHidden: false,
          material: material,
          edgesMat: edgesMat,
          originalColor: meshColor.clone(),
          customColor: null,
          materialPreset: null,
          materialDensity: null
        });
      }
      window.modelBodies = modelBodies;

      modelPhysicalProps = {
        volumeMm3: Math.abs(totalVolMm3),
        areaMm2: totalAreaMm2,
        bbox: null,
        triangles: totalTriangles
      };

      // Default to Orthographic Camera on Model Load (TSK-01: True 1:1 Engineering Scale)
      if (!camera || !camera.isOrthographicCamera) {
        switchCamera('ortho', true);
      }

      // Auto-fit Camera & Grid
      autoFitCamera();

      // Build Model Tree & Multi-Body Assembly UI
      if (typeof buildModelTree === 'function') buildModelTree(data.meshes);
      if (typeof updatePropsBodySelect === 'function') updatePropsBodySelect();

      // Reveal tree dock automatically if multi-body
      if (data.meshCount > 1) {
        if (window.WorkbenchUI) window.WorkbenchUI.openDrawer('tree');
        else if (typeof toggleTreePanel === 'function') toggleTreePanel(true);
      } else {
        if (typeof toggleTreePanel === 'function') toggleTreePanel(false);
      }

      const timeDisplay = data.isCached ? '⚡ 12ms (Cache)' : (data.elapsedMs >= 1000 ? `${(data.elapsedMs / 1000).toFixed(1)}s` : `${data.elapsedMs}ms`);
      const statusTextSpan = document.getElementById('status-text');
      let formattedStatus;
      if (activeCadFormat === 'STL' || data.format === 'STL') {
        const mesh0 = (data.meshes && data.meshes[0]) || {};
        let topoStatus = 'Watertight';
        if (mesh0.isWatertight === false) {
          topoStatus = mesh0.isManifold === false ? 'Non-Manifold' : 'Open Mesh';
        } else if (mesh0.isWatertight === true) {
          topoStatus = 'Watertight';
        }
        formattedStatus = `<span style="color:#94a3b8;">✓</span> STL Mesh • ${Math.round(totalTriangles).toLocaleString()} Triangles • ${topoStatus} • ${timeDisplay}`;
      } else {
        const partCount = data.meshCount || (data.meshes ? data.meshes.length : 1);
        formattedStatus = `<span style="color:#94a3b8;">✓</span> ${partCount} Part(s) • ${Math.round(totalTriangles).toLocaleString()} Triangles • ${timeDisplay}`;
      }

      if (statusTextSpan) {
        statusTextSpan.innerHTML = formattedStatus;
      } else {
        const badgeStatusEl = document.getElementById('badge-status');
        if (badgeStatusEl) {
          badgeStatusEl.innerHTML = `<span class="spinner" id="spinner" style="display:none;"></span><span id="status-text">${formattedStatus}</span>`;
        }
      }

      notifyHost({
        type: 'LOADED',
        meshCount: data.meshCount,
        triangles: totalTriangles,
        elapsedMs: data.elapsedMs
      });
    }
    window.onTessellationComplete = onTessellationComplete;

    function updateBoundingBoxBadge() {
      if (!modelPhysicalProps || !modelPhysicalProps.bbox) return;
      const size = modelPhysicalProps.bbox;
      const dimX = currentUnit === 'mm' ? size.x.toFixed(1) : (size.x / 25.4).toFixed(2);
      const dimY = currentUnit === 'mm' ? size.y.toFixed(1) : (size.y / 25.4).toFixed(2);
      const dimZ = currentUnit === 'mm' ? size.z.toFixed(1) : (size.z / 25.4).toFixed(2);
      const unitLabel = currentUnit;
      const dimEl = document.getElementById('badge-dim');
      const dimText = document.getElementById('dim-text');
      if (dimEl && dimText) {
        dimText.innerText = `${dimX} × ${dimY} × ${dimZ} ${unitLabel}`;
        dimEl.style.display = 'block';
      }
    }

    // =============================================================
    // Studio Ground Contact Shadow Engine (THREE.ShadowMaterial)
    // =============================================================
    let contactShadowMesh = null;
    let contactShadowMaterial = null;

    function updateGroundContactShadow(boxParam, centerParam, sizeParam) {
      let box = boxParam;
      let center = centerParam;
      let size = sizeParam;

      if (!box || !center || !size) {
        if (!modelGroup || modelGroup.children.length === 0) return;
        box = new THREE.Box3().setFromObject(modelGroup);
        if (box.isEmpty()) return;
        center = box.getCenter(new THREE.Vector3());
        size = box.getSize(new THREE.Vector3());
      }

      if (!contactShadowMaterial) {
        contactShadowMaterial = new THREE.ShadowMaterial({
          opacity: 0.30,
          transparent: true,
          depthWrite: false
        });
      }

      if (contactShadowMesh) {
        scene.remove(contactShadowMesh);
        if (contactShadowMesh.geometry) contactShadowMesh.geometry.dispose();
      }

      const shadowW = Math.max(size.x * 2.0, size.z * 2.0, 20);
      const shadowGeom = new THREE.PlaneGeometry(shadowW, shadowW);
      shadowGeom.rotateX(-Math.PI / 2);
      contactShadowMesh = new THREE.Mesh(shadowGeom, contactShadowMaterial);
      contactShadowMesh.position.set(center.x, box.min.y - 0.01, center.z);
      contactShadowMesh.receiveShadow = true;
      contactShadowMesh.name = 'ground_contact_shadow';
      if (typeof snapExportIncludeShadow !== 'undefined') {
        contactShadowMesh.visible = snapExportIncludeShadow;
      }
      scene.add(contactShadowMesh);

      // Position GridHelper below contact shadow plane to eliminate z-fighting
      if (gridHelper) {
        gridHelper.position.set(center.x, box.min.y - 0.02, center.z);
      }

      window.contactShadowMesh = contactShadowMesh;
      window.contactShadowMaterial = contactShadowMaterial;
    }
    window.updateGroundContactShadow = updateGroundContactShadow;

    function autoFitCamera() {
      const box = new THREE.Box3().setFromObject(modelGroup);
      if (box.isEmpty()) return;

      if (typeof sectionBox !== 'undefined' && sectionBox) sectionBox.copy(box);
      if (typeof updateSectionPlane === 'function') updateSectionPlane();
      if (typeof isSectionActive !== 'undefined' && isSectionActive && typeof rebuildSectionStencilMeshes === 'function') {
        rebuildSectionStencilMeshes();
      }

      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      if (typeof modelPhysicalProps !== 'undefined' && modelPhysicalProps) {
        modelPhysicalProps.bbox = { x: size.x, y: size.y, z: size.z };
        if (typeof updatePhysicalPropertiesCard === 'function') updatePhysicalPropertiesCard();
      }
      if (typeof updateBoundingBoxBadge === 'function') updateBoundingBoxBadge();

      const cameraDistance = computeSafeCameraDistance(box, 1.25);

      currentModelCenter.copy(center);
      currentModelDistance = cameraDistance;

      if (camera && camera.isOrthographicCamera) {
        const aspect = (window.innerWidth && window.innerHeight) ? (window.innerWidth / window.innerHeight) : 1.0;
        const fov = 45;
        const vFovRad = fov * (Math.PI / 180);
        const halfH = cameraDistance * Math.tan(vFovRad / 2);
        const halfW = halfH * aspect;
        camera.left = -halfW;
        camera.right = halfW;
        camera.top = halfH;
        camera.bottom = -halfH;
        camera.near = -Math.max(cameraDistance * 10, 50000);
        camera.far = Math.max(cameraDistance * 10, 50000);
        camera.zoom = 1.0;
        camera.aspect = aspect;
        camera.fov = fov;
        camera.userData = { baseHalfH: halfH, baseDistance: cameraDistance };
        camera.updateProjectionMatrix();
      } else if (camera) {
        camera.near = cameraDistance / 100;
        camera.far = cameraDistance * 100;
        camera.updateProjectionMatrix();
      }

      // Normalized Isometric view angle
      const isoDir = new THREE.Vector3(1, 0.85, 1).normalize();
      let targetCenter = center.clone();

      // If Tree panel is open (takes ~280px on the left), offset target slightly so model is centered in visible canvas
      if (isTreeActive && window.innerWidth > 600) {
        const fov = (camera && camera.isPerspectiveCamera && camera.fov) ? camera.fov : 45;
        const vFovRad = fov * (Math.PI / 180);
        const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
        const aspect = (camera && camera.aspect) ? camera.aspect : (window.innerWidth / window.innerHeight || 1.0);
        const offsetAmt = (cameraDistance * Math.tan(vFovRad / 2) * aspect) * 0.16;
        targetCenter.sub(camRight.multiplyScalar(offsetAmt));
      }

      const targetPos = targetCenter.clone().add(isoDir.multiplyScalar(cameraDistance));

      camera.position.copy(targetPos);
      camera.lookAt(targetCenter);
      controls.target.copy(targetCenter);
      controls.update();

      initialCameraState.position.copy(targetPos);
      initialCameraState.target.copy(targetCenter);

      // Create or adjust ground grid (offset 0.02 below model base to eliminate Z-fighting)
      if (gridHelper) scene.remove(gridHelper);
      const gridSize = Math.max(maxDim * 2.5, 20);
      gridHelper = new THREE.GridHelper(gridSize, 20, 0x2d3340, 0x1f232c);
      gridHelper.position.set(center.x, box.min.y - 0.02, center.z);
      scene.add(gridHelper);
      window.gridHelper = gridHelper;

      // Studio Ground Contact Shadow
      updateGroundContactShadow(box, center, size);

      // KeyLight shadow frustum and adaptive controls limits
      if (keyLight && keyLight.shadow) {
        const lightDir = new THREE.Vector3(1.2, 2.0, 1.5).normalize();
        const d = Math.max(maxDim * 1.5, 0.1);
        const shadowDistance = Math.max(maxDim * 2.5, 10.0);
        keyLight.position.copy(center).add(lightDir.clone().multiplyScalar(shadowDistance));
        keyLight.target.position.copy(center);
        keyLight.shadow.camera.left = -d;
        keyLight.shadow.camera.right = d;
        keyLight.shadow.camera.top = d;
        keyLight.shadow.camera.bottom = -d;
        keyLight.shadow.camera.near = 0.1;
        keyLight.shadow.camera.far = shadowDistance * 2 + d;
        keyLight.shadow.camera.updateProjectionMatrix();
      }
      if (controls) {
        controls.minDistance = Math.max(maxDim * 0.05, 0.001);
        controls.maxDistance = Math.max(maxDim * 20, cameraDistance * 4);
        controls.minZoom = 0.01;
        controls.maxZoom = 100.0;
      }
    }

    function updateThemeLighting(isLight) {
      if (!renderer) return;
      if (isLight) {
        renderer.toneMappingExposure = 0.92;
        if (ambientLight) ambientLight.intensity = 0.70;
        if (keyLight) keyLight.intensity = 0.88;
        if (contactShadowMaterial) contactShadowMaterial.opacity = 0.22;
      } else {
        renderer.toneMappingExposure = 1.05;
        if (ambientLight) ambientLight.intensity = 0.75;
        if (keyLight) keyLight.intensity = 0.95;
        if (contactShadowMaterial) contactShadowMaterial.opacity = 0.30;
      }
    }
    window.updateThemeLighting = updateThemeLighting;

    function clearModel() {
      if (typeof closeColorPickerPopover === 'function') closeColorPickerPopover();
      if (contactShadowMesh) {
        scene.remove(contactShadowMesh);
        if (contactShadowMesh.geometry) contactShadowMesh.geometry.dispose();
        contactShadowMesh = null;
      }
      if (typeof deselectFace === 'function') deselectFace();
      if (typeof deselectBody === 'function') deselectBody();
      if (faceHighlightMesh) {
        scene.remove(faceHighlightMesh);
        if (faceHighlightMesh.geometry) faceHighlightMesh.geometry.dispose();
        if (faceHighlightMesh.material) faceHighlightMesh.material.dispose();
        faceHighlightMesh = null;
      }
      if (typeof hideIsolateBanner === 'function') hideIsolateBanner();
      modelBodies.forEach(b => {
        if (b.material) b.material.dispose();
        if (b.edgesMat) b.edgesMat.dispose();
      });
      modelBodies = [];
      window.modelBodies = modelBodies;
      isolatedBodyId = null;
      selectedBodyForProps = -1;
      const treeContainer = document.getElementById('tree-content');
      if (treeContainer) treeContainer.innerHTML = '';
      const treeCount = document.getElementById('tree-body-count');
      if (treeCount) treeCount.innerText = '0 Bodies';
      const bodySelect = document.getElementById('props-body-select');
      if (bodySelect) bodySelect.innerHTML = '';
      const bodyRow = document.getElementById('props-body-row');
      if (bodyRow) bodyRow.style.display = 'none';

      modelPhysicalProps = null;
      if (typeof togglePropsModal === 'function') togglePropsModal(false);
      modelEdgeFeatures = [];
      modelCadVertices = [];
      selectedCadEntities = [];
      currentHoverTarget = null;
      if (typeof clearMeasurement === 'function') clearMeasurement(true);
      const dimEl = document.getElementById('badge-dim');
      if (dimEl) dimEl.style.display = 'none';

      while (modelGroup.children.length > 0) {
        const obj = modelGroup.children[0];
        obj.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        });
        modelGroup.remove(obj);
      }
      if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper = null;
      }
      if (isSectionActive) {
        toggleSectionView(false);
      } else {
        sectionStencilGroup.clear();
        sectionCapMesh = null;
        sectionPlaneHelperMesh = null;
      }
      if (typeof resetExplodedView === 'function') resetExplodedView();
    }

    // =============================================================

// 2. Interaction Handlers, Pointer Events, Camera Pivot & Hotkeys
      if (typeof initSnapshotSystem === 'function') initSnapshotSystem();

      function showToast(msg) {
        if (typeof window.onToastMessage === 'function') window.onToastMessage(msg);
        const toast = document.getElementById('toast-notify');
        if (!toast) return;
        toast.innerText = msg;
        toast.style.display = 'block';
        toast.style.opacity = '1';
        if (window._toastTimer) clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(() => {
          toast.style.display = 'none';
        }, 3500);
      }
      window.showToast = showToast;

      // Double-Click on 3D Model to Pivot & Center View
      const container = document.getElementById('canvas-container');
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      // Pointer interactions for measurement & vertex snapping & 3D section gizmo
      let pointerDownPos = { x: 0, y: 0 };

      container.addEventListener('pointerdown', (e) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };

        // 3D Section Manipulator Gizmo Grab
        if (isSectionActive && sectionGizmoMesh && sectionGizmoMesh.visible && e.button === 0) {
          const rect = container.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(sectionGizmoMesh.children, true);
          if (intersects.length > 0) {
            isDraggingSectionGizmo = true;
            controls.enabled = false;
            highlightSectionGizmo(true);
            container.style.cursor = 'ew-resize';
            return;
          }
        }
      });

      container.addEventListener('pointermove', (e) => {
        // 1. Active dragging of 3D Section Manipulator Arrow
        if (isDraggingSectionGizmo) {
          const rect = container.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);
          dragSectionGizmoWithRay(raycaster);
          return;
        }

        // 2. Hover detection on 3D Section Manipulator Arrow
        if (isSectionActive && sectionGizmoMesh && sectionGizmoMesh.visible && !isMeasureActive) {
          const rect = container.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(sectionGizmoMesh.children, true);
          if (intersects.length > 0) {
            highlightSectionGizmo(true);
            container.style.cursor = 'grab';
            return;
          } else if (isSectionGizmoHovered) {
            highlightSectionGizmo(false);
            container.style.cursor = '';
          }
        }

        if (!isMeasureActive) return;

        const tooltip = document.getElementById('measure-tooltip');
        const snap = findSnapTarget(e);

        if (snap) {
          currentHoverTarget = snap;

          if (snap.type === 'cylinder') {
            if (hoverEdgeMesh) hoverEdgeMesh.visible = false;
            snapIndicator.position.copy(snap.point);
            snapIndicator.material.color.setHex(snap.isHole ? 0x38bdf8 : 0x10b981);
            snapIndicator.visible = true;

            if (tooltip) {
              const kind = snap.isHole ? '⭕ Cylindrical Hole' : '🔵 Cylindrical Shaft';
              const depthStr = snap.depth > 0 ? ` &nbsp;|&nbsp; Depth: <span style="color:#f1f5f9; font-weight:600;">${formatDim(snap.depth)}</span>` : '';
              tooltip.innerHTML = `<span style="color:#38bdf8; font-weight:700;">${kind}:</span> <span style="color:#f1f5f9; font-weight:700;">Ø ${formatDim(snap.diameter)}</span> <span style="color:#94a3b8;">(R ${formatDim(snap.radius)})</span>${depthStr}`;
              tooltip.style.left = (e.clientX + 14) + 'px';
              tooltip.style.top = (e.clientY + 14) + 'px';
              tooltip.style.display = 'block';
            }
          } else if (snap.type === 'surface' || snap.subType === 'surface') {
            if (hoverEdgeMesh) hoverEdgeMesh.visible = false;
            snapIndicator.position.copy(snap.point);
            snapIndicator.material.color.setHex(0x38bdf8);
            snapIndicator.visible = true;

            if (tooltip) {
              const areaVal = snap.areaMm2 || 0;
              const areaStr = areaVal > 0.01 ? (currentUnit === 'mm' ? `${areaVal.toFixed(1)} mm²` : `${(areaVal / 645.16).toFixed(2)} in²`) : '';
              const areaText = areaStr ? `<span style="color:#f1f5f9; font-weight:700;">${areaStr}</span> &nbsp;|&nbsp; ` : '';
              tooltip.innerHTML = `<span style="color:#38bdf8">Planar Face:</span> ${areaText}<span style="color:#94a3b8">(${formatCoord(snap.point.x)}, ${formatCoord(snap.point.y)}, ${formatCoord(snap.point.z)})</span>`;
              tooltip.style.left = (e.clientX + 14) + 'px';
              tooltip.style.top = (e.clientY + 14) + 'px';
              tooltip.style.display = 'block';
            }
          } else if (snap.type === 'point') {
            if (hoverEdgeMesh) hoverEdgeMesh.visible = false;
            snapIndicator.position.copy(snap.point);
            const colorHex = snap.subType === 'midpoint' ? 0x38bdf8 : (snap.subType === 'center' ? 0x10b981 : 0xf59e0b);
            snapIndicator.material.color.setHex(colorHex);
            snapIndicator.visible = true;

            if (tooltip) {
              const label = snap.subType === 'midpoint' ? '⟷ Midpoint' : (snap.subType === 'center' ? '⭕ Hole Center' : '📍 Point');
              tooltip.innerHTML = `<span style="color:#38bdf8">${label}:</span> (${formatCoord(snap.point.x)}, ${formatCoord(snap.point.y)}, ${formatCoord(snap.point.z)})`;
              tooltip.style.left = (e.clientX + 14) + 'px';
              tooltip.style.top = (e.clientY + 14) + 'px';
              tooltip.style.display = 'block';
            }
          } else if (snap.type === 'line') {
            if (snapIndicator) snapIndicator.visible = false;
            updateHoverEdgeGeometry(snap.feature);

            if (tooltip) {
              tooltip.innerHTML = `<span style="color:#38bdf8">Edge:</span> ${snap.feature.length.toFixed(2)} mm`;
              tooltip.style.left = (e.clientX + 14) + 'px';
              tooltip.style.top = (e.clientY + 14) + 'px';
              tooltip.style.display = 'block';
            }
          } else if (snap.type === 'circle') {
            if (snapIndicator) snapIndicator.visible = false;
            updateHoverEdgeGeometry(snap.feature);

            if (tooltip) {
              const depthVal = snap.feature.cylinder ? snap.feature.cylinder.depth : 0;
              const depthStr = depthVal > 0 ? ` &nbsp;|&nbsp; Depth: <span style="color:#f1f5f9; font-weight:600;">${formatDim(depthVal)}</span>` : '';
              tooltip.innerHTML = `<span style="color:#38bdf8; font-weight:700;">Ø:</span> <span style="color:#f1f5f9; font-weight:700;">${formatDim(snap.feature.diameter)}</span> &nbsp;<span style="color:#94a3b8;">(R ${formatDim(snap.feature.radius)})</span>${depthStr}`;
              tooltip.style.left = (e.clientX + 14) + 'px';
              tooltip.style.top = (e.clientY + 14) + 'px';
              tooltip.style.display = 'block';
            }
          }

          if (selectedCadEntities.length === 1) {
            const origPt = getEntityOriginPoint(selectedCadEntities[0]);
            if (origPt) {
              updateRubberband(origPt, snap.point);
            }
          }
          return;
        }

        currentHoverTarget = null;
        if (hoverEdgeMesh) hoverEdgeMesh.visible = false;
        if (snapIndicator) snapIndicator.visible = false;
        if (tooltip) tooltip.style.display = 'none';
        removeRubberband();
      });

      container.addEventListener('pointerup', (e) => {
        if (isDraggingSectionGizmo) {
          isDraggingSectionGizmo = false;
          controls.enabled = true;
          highlightSectionGizmo(false);
          container.style.cursor = '';
          return;
        }

        const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        if (dragDist > 6) return; // Ignore drag/rotation gestures

        // Milestone 3: Check if active face picking for Draft Analysis is engaged (TSK-05)
        if (window.CadAnalysis && typeof window.CadAnalysis.isPickingFace === 'function' && window.CadAnalysis.isPickingFace()) {
          if (e.button === 0) {
            if (window.CadAnalysis.handleFacePick(e)) {
              return;
            }
          } else if (e.button === 2) {
            window.CadAnalysis.stopFacePicking();
            return;
          }
        }

        if (e.button === 2) { // 2nd mouse button (Right-Click) quick clear/cancel
          if (isMeasureActive) {
            if (typeof window.clearActiveMeasurement === 'function') {
              window.clearActiveMeasurement(true);
            } else {
              clearMeasurement(false);
              showToast('Measurement cleared [C]');
            }
          } else if (selectedFaceInfo) {
            deselectFace();
          } else if (selectedBodyId !== null) {
            deselectBody();
          }
          return;
        }

        if (e.button !== 0) return; // Only primary left click beyond here

        if (!isMeasureActive) {
          if (selectedFaceInfo) {
            deselectFace();
          }
          if (selectedBodyId !== null) {
            deselectBody();
          }
          return;
        }

        const snap = findSnapTarget(e);
        if (!snap) return;

        handleUnifiedClick(snap);
      });

      container.addEventListener('pointerleave', () => {
        if (hoverEdgeMesh) hoverEdgeMesh.visible = false;
        const tooltip = document.getElementById('measure-tooltip');
        if (tooltip) tooltip.style.display = 'none';
        if (snapIndicator) snapIndicator.visible = false;
        removeRubberband();
      });

      window.addEventListener('pointerup', () => {
        if (isDraggingSectionGizmo) {
          isDraggingSectionGizmo = false;
          controls.enabled = true;
          highlightSectionGizmo(false);
          container.style.cursor = '';
        }
      });

      container.addEventListener('dblclick', (e) => {
        if (isMeasureActive) return;
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(modelGroup.children, true);

        if (intersects && intersects.length > 0) {
          const hit = intersects.find(i => i.object.isMesh && i.object.name !== 'solidworks_edges') || intersects[0];
          const hitPoint = hit.point;
          const delta = hitPoint.clone().sub(controls.target);
          const newCamPos = camera.position.clone().add(delta);
          tweenCamera(newCamPos, hitPoint, camera.up, 300);
        }
      });

      // Keyboard Shortcuts for Instant CAD Inspection
      window.addEventListener('keydown', (e) => {
        if (e.target && (
          e.target.tagName === 'INPUT' ||
          e.target.tagName === 'TEXTAREA' ||
          e.target.tagName === 'SELECT' ||
          e.target.isContentEditable
        )) {
          return;
        }
        const key = e.key.toLowerCase();
        if (key === 'f') {
          autoFitCamera();
        } else if (key === '1') {
          document.getElementById('btn-view-iso')?.click();
        } else if (key === '2') {
          document.getElementById('btn-view-top')?.click();
        } else if (key === '3') {
          document.getElementById('btn-view-front')?.click();
        } else if (key === '4') {
          document.getElementById('btn-view-right')?.click();
        } else if (key === 'e') {
          document.getElementById('btn-edges')?.click();
        } else if (key === 'w') {
          document.getElementById('btn-wireframe')?.click();
        } else if (key === 'm') {
          if (window.WorkbenchUI) window.WorkbenchUI.toggleDrawer('measure');
          else toggleMeasureMode();
        } else if (key === 's') {
          if (window.WorkbenchUI) window.WorkbenchUI.toggleDrawer('section');
          else toggleSectionView();
        } else if (key === 'p') {
          if (window.WorkbenchUI) window.WorkbenchUI.toggleDrawer('mass');
          else togglePropsModal();
        } else if (key === 't') {
          if (window.WorkbenchUI) window.WorkbenchUI.toggleDrawer('tree');
          else toggleTreePanel();
        } else if (key === 'x') {
          toggleExplode();
        } else if (key === 'u') {
          toggleUnits();
        } else if (key === 'k') {
          if (window.WorkbenchUI) window.WorkbenchUI.toggleDrawer('export');
          else toggleSnapshotModal();
        } else if (key === 'a') {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          if (window.WorkbenchUI) window.WorkbenchUI.toggleDrawer('analysis');
          else document.getElementById('btn-analysis')?.click();
        } else if (key === 'o') {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          toggleOrthoPersp();
        } else if (key === 'c') {
          // Guard against modifier keys: Ctrl+C (copy), Cmd+C, Alt+C must NOT trigger CAD clear
          if (e.ctrlKey || e.metaKey || e.altKey) return;

          if (isMeasureActive) {
            // TSK-09: Always clear active measurement visuals and reset point arrays
            // strictly maintaining isMeasureActive = true, crosshair cursor, and open drawer.
            if (typeof window.clearActiveMeasurement === 'function') {
              window.clearActiveMeasurement(true);
            } else if (typeof clearMeasurement === 'function') {
              clearMeasurement(false);
              if (typeof showToast === 'function') showToast('Measurement cleared [C]');
            }
          } else if (selectedFaceInfo) {
            deselectFace();
            showToast('Face deselected');
          } else if (selectedBodyId !== null) {
            deselectBody();
            showToast('Body deselected');
          }
        } else if (key === 'escape') {
          // 0. Cancel Draft Face Picking if engaged (TSK-05)
          if (window.CadAnalysis && typeof window.CadAnalysis.isPickingFace === 'function' && window.CadAnalysis.isPickingFace()) {
            window.CadAnalysis.stopFacePicking();
            return;
          }
          // Iron Rule #6: Strict hierarchical dismissal
          // 1. Color Picker popover dismissal
          if (activeColorPopoverBodyId !== null) {
            closeColorPickerPopover();
            return;
          }
          // 2. Right Inspector Drawer dismissal
          if (window.WorkbenchUI?.isDrawerOpen && window.WorkbenchUI.isDrawerOpen()) {
            window.WorkbenchUI.closeDrawer();
            return;
          } else if (document.body.classList.contains('drawer-open') || document.getElementById('inspector-drawer')?.classList.contains('open')) {
            if (typeof window.closeDrawer === 'function') window.closeDrawer();
            return;
          }
          // 3. Isolated body reset
          if (isolatedBodyId !== null) {
            resetBodyIsolation();
            return;
          }
          // 4. Face / Body / Measurement selection dismissal
          if (selectedFaceInfo || selectedBodyId !== null || (isMeasureActive && selectedCadEntities.length > 0)) {
            deselectFace();
            deselectBody();
            if (faceHighlightMesh) {
              scene.remove(faceHighlightMesh);
              if (faceHighlightMesh.geometry) faceHighlightMesh.geometry.dispose();
              if (faceHighlightMesh.material) faceHighlightMesh.material.dispose();
              faceHighlightMesh = null;
            }
            if (isMeasureActive) clearMeasurement(false);
            return;
          }
          // 5. Default: Do not consume Escape; allow QuickLook host to close preview window
        } else if (key === 'r') {
          document.getElementById('btn-reset')?.click();
        } else if (key === '?' || (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
          if (typeof toggleShortcuts === 'function') {
            toggleShortcuts();
          }
        }
      });

      // =============================================================
      // Keyboard Shortcuts Bar Toggle & LocalStorage Persistence (TSK-11)
      // =============================================================
      const STORAGE_KEY_SHORTCUTS = 'quicklook_stp_shortcuts_visible';
      const hintsBar = document.getElementById('hints-bar');
      const btnToggleShortcuts = document.getElementById('btn-toggle-shortcuts');
      let isShortcutsVisible = true;
      let shortcutsHideTimeout = null;

      function setShortcutsVisibility(visible, animate = true) {
        if (!hintsBar) return;
        isShortcutsVisible = !!visible;
        if (shortcutsHideTimeout) {
          clearTimeout(shortcutsHideTimeout);
          shortcutsHideTimeout = null;
        }

        if (visible) {
          hintsBar.style.display = 'flex';
          if (animate) {
            requestAnimationFrame(() => {
              if (isShortcutsVisible) {
                hintsBar.classList.remove('hints-hidden');
              }
            });
          } else {
            hintsBar.classList.remove('hints-hidden');
          }
        } else {
          hintsBar.classList.add('hints-hidden');
          if (animate) {
            shortcutsHideTimeout = setTimeout(() => {
              if (!isShortcutsVisible) {
                hintsBar.style.display = 'none';
              }
              shortcutsHideTimeout = null;
            }, 180);
          } else {
            hintsBar.style.display = 'none';
          }
        }

        if (btnToggleShortcuts) {
          btnToggleShortcuts.classList.toggle('active', visible);
          btnToggleShortcuts.setAttribute('aria-expanded', String(visible));
        }
      }

      function toggleShortcuts() {
        const nextVisible = !isShortcutsVisible;
        try {
          localStorage.setItem(STORAGE_KEY_SHORTCUTS, String(nextVisible));
        } catch (e) {
          console.warn('[STP-Quicklook] Failed to write shortcuts preference to localStorage:', e);
        }
        setShortcutsVisibility(nextVisible, true);
        if (typeof showToast === 'function') {
          showToast(nextVisible ? 'Shortcuts bar visible' : 'Shortcuts bar hidden');
        }
      }

      // Initial state from localStorage (defaults to true for initial user discoverability)
      let initialShortcutsVisible = true;
      try {
        const savedPref = localStorage.getItem(STORAGE_KEY_SHORTCUTS);
        if (savedPref !== null) {
          initialShortcutsVisible = (savedPref === 'true');
        }
      } catch (e) {
        initialShortcutsVisible = true;
      }
      setShortcutsVisibility(initialShortcutsVisible, false);

      if (btnToggleShortcuts) {
        btnToggleShortcuts.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleShortcuts();
        });
      }

      // Expose to window for testing & integration
      window.toggleShortcuts = toggleShortcuts;
      window.setShortcutsVisibility = setShortcutsVisibility;

    function showError(msg) {
      const container = document.getElementById('error-container');
      container.innerText = msg;
      container.style.display = 'block';
      const spErr = document.getElementById('spinner');
      if (spErr) spErr.style.display = 'none';
      const stErr = document.getElementById('status-text');
      if (stErr) stErr.innerText = 'Failed to load model';
      notifyHost({ type: 'ERROR', message: msg });
    }

    function hideError() {
      document.getElementById('error-container').style.display = 'none';
    }

    function notifyHost(obj) {
      if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage(obj);
      }
    }

    // 5. Host IPC (WebView2 Message Handler)
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.addEventListener('message', function (e) {
        const msg = e.data;
        if (!msg) return;

        if (msg.action === 'LOAD_URL') {
          // Fetch raw binary directly from Virtual Host
          fetch(msg.url)
            .then(res => {
              if (!res.ok) throw new Error('HTTP ' + res.status + ' loading CAD file');
              return res.arrayBuffer();
            })
            .then(buffer => {
              startTessellation(buffer, msg.fileName);
            })
            .catch(err => {
              showError('Failed to fetch file stream: ' + err.message);
            });
        } else if (msg.action === 'CANCEL' || msg.action === 'DISPOSE') {
          if (loadTimer) {
            clearInterval(loadTimer);
            loadTimer = null;
          }
          if (currentWorker) {
            currentWorker.terminate();
            currentWorker = null;
            workerReady = false;
          }
          clearModel();
        } else if (msg.action === 'RESET_VIEW') {
          document.getElementById('btn-reset').click();
        } else if (msg.action === 'TOGGLE_WIREFRAME') {
          document.getElementById('btn-wireframe').click();
        }
      });
    }

// Window exports
window.camera = camera;
window.controls = controls;
window.renderer = renderer;
window.scene = scene;
window.initViewport = initViewport;
window.updateScreenSpaceAnnotations = updateScreenSpaceAnnotations;
window.startTessellation = startTessellation;
window.tweenCamera = tweenCamera;
window.computeSafeCameraDistance = computeSafeCameraDistance;
window.switchCamera = switchCamera;
window.toggleOrthoPersp = toggleOrthoPersp;
window.onResize = onResize;
window.autoFitCamera = autoFitCamera;
window.onTessellationComplete = onTessellationComplete;
window._getActiveLoadId = () => activeLoadId;
window._getWorkerDispatchedLoadId = () => workerDispatchedLoadId;

// Lifecycle cleanup function to prevent memory leaks on window close
window.__cleanupViewer = function() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initViewport);
} else {
  initViewport();
}
