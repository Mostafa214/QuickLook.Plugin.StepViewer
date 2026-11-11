/**
 * QuickLook CAD Studio - Interactive 3D ViewCube & NavCube Engine (v2.1.0)
 * Top-Right 3D navigation cube synchronized with main viewport camera.
 * 26 Interactive Hitboxes (6 Faces, 12 Edges at 45°, 8 Isometric Corners)
 * Smooth Quaternion Slerp Camera Transitions (Constant Orbit Radius)
 */
(function () {
  'use strict';

  let cubeScene, cubeCamera, cubeRenderer, cubeMesh;
  let cubeCanvas, cubeContainer;
  let raycaster, mouse;
  let isViewCubeInitialized = false;
  let hitboxMeshes = [];
  let currentlyHoveredHitbox = null;

  const FACE_NAMES = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK'];
  const FACE_COLORS = {
    normal: '#1e2430',
    text: '#94a3b8',
    hover: '#0284c7',
    hoverText: '#ffffff',
    border: 'rgba(255,255,255,0.15)'
  };

  // Space-Filling Hitbox Dimensions (L = 1.6)
  const L = 1.6;
  const H = L / 2; // 0.8
  const b = 0.22;  // Edge & Corner thickness
  const wf = L - 2 * b; // 1.16 Face core width
  const c = H - b / 2;  // 0.69 Center offset

  // 26 Orientation Definitions
  const ORIENTATIONS = {
    // 6 Faces
    RIGHT: { id: 'RIGHT', cat: 'face', faceIdx: 0, size: [b, wf, wf], pos: [c, 0, 0], dir: [1, 0, 0], up: [0, 1, 0], q: [0, 0.7071, 0, 0.7071] },
    LEFT: { id: 'LEFT', cat: 'face', faceIdx: 1, size: [b, wf, wf], pos: [-c, 0, 0], dir: [-1, 0, 0], up: [0, 1, 0], q: [0, -0.7071, 0, 0.7071] },
    TOP: { id: 'TOP', cat: 'face', faceIdx: 2, size: [wf, b, wf], pos: [0, c, 0], dir: [0, 1, 0], up: [0, 0, -1], q: [-0.7071, 0, 0, 0.7071] },
    BOTTOM: { id: 'BOTTOM', cat: 'face', faceIdx: 3, size: [wf, b, wf], pos: [0, -c, 0], dir: [0, -1, 0], up: [0, 0, 1], q: [0.7071, 0, 0, 0.7071] },
    FRONT: { id: 'FRONT', cat: 'face', faceIdx: 4, size: [wf, wf, b], pos: [0, 0, c], dir: [0, 0, 1], up: [0, 1, 0], q: [0, 0, 0, 1] },
    BACK: { id: 'BACK', cat: 'face', faceIdx: 5, size: [wf, wf, b], pos: [0, 0, -c], dir: [0, 0, -1], up: [0, 1, 0], q: [0, 1, 0, 0] },

    // 12 Edges (Top Ring, Bottom Ring, Vertical Ring)
    TOP_FRONT: { id: 'TOP_FRONT', cat: 'edge', size: [wf, b, b], pos: [0, c, c], dir: [0, 1, 1], up: [0, 1, 0], q: [-0.3827, 0, 0, 0.9239] },
    TOP_BACK: { id: 'TOP_BACK', cat: 'edge', size: [wf, b, b], pos: [0, c, -c], dir: [0, 1, -1], up: [0, 1, 0], q: [0, 0.9239, 0.3827, 0] },
    TOP_RIGHT: { id: 'TOP_RIGHT', cat: 'edge', size: [b, b, wf], pos: [c, c, 0], dir: [1, 1, 0], up: [0, 1, 0], q: [-0.2706, 0.6533, 0.2706, 0.6533] },
    TOP_LEFT: { id: 'TOP_LEFT', cat: 'edge', size: [b, b, wf], pos: [-c, c, 0], dir: [-1, 1, 0], up: [0, 1, 0], q: [-0.2706, -0.6533, -0.2706, 0.6533] },

    BOTTOM_FRONT: { id: 'BOTTOM_FRONT', cat: 'edge', size: [wf, b, b], pos: [0, -c, c], dir: [0, -1, 1], up: [0, 1, 0], q: [0.3827, 0, 0, 0.9239] },
    BOTTOM_BACK: { id: 'BOTTOM_BACK', cat: 'edge', size: [wf, b, b], pos: [0, -c, -c], dir: [0, -1, -1], up: [0, 1, 0], q: [0, 0.9239, -0.3827, 0] },
    BOTTOM_RIGHT: { id: 'BOTTOM_RIGHT', cat: 'edge', size: [b, b, wf], pos: [c, -c, 0], dir: [1, -1, 0], up: [0, 1, 0], q: [0.2706, 0.6533, -0.2706, 0.6533] },
    BOTTOM_LEFT: { id: 'BOTTOM_LEFT', cat: 'edge', size: [b, b, wf], pos: [-c, -c, 0], dir: [-1, -1, 0], up: [0, 1, 0], q: [0.2706, -0.6533, 0.2706, 0.6533] },

    FRONT_RIGHT: { id: 'FRONT_RIGHT', cat: 'edge', size: [b, wf, b], pos: [c, 0, c], dir: [1, 0, 1], up: [0, 1, 0], q: [0, 0.3827, 0, 0.9239] },
    FRONT_LEFT: { id: 'FRONT_LEFT', cat: 'edge', size: [b, wf, b], pos: [-c, 0, c], dir: [-1, 0, 1], up: [0, 1, 0], q: [0, -0.3827, 0, 0.9239] },
    BACK_RIGHT: { id: 'BACK_RIGHT', cat: 'edge', size: [b, wf, b], pos: [c, 0, -c], dir: [1, 0, -1], up: [0, 1, 0], q: [0, 0.9239, 0, 0.3827] },
    BACK_LEFT: { id: 'BACK_LEFT', cat: 'edge', size: [b, wf, b], pos: [-c, 0, -c], dir: [-1, 0, -1], up: [0, 1, 0], q: [0, 0.9239, 0, -0.3827] },

    // 8 Isometric Corners
    TOP_FRONT_RIGHT: { id: 'TOP_FRONT_RIGHT', cat: 'corner', size: [b, b, b], pos: [c, c, c], dir: [1, 1, 1], up: [0, 1, 0], q: [-0.2798, 0.3647, 0.1159, 0.8805] },
    TOP_FRONT_LEFT: { id: 'TOP_FRONT_LEFT', cat: 'corner', size: [b, b, b], pos: [-c, c, c], dir: [-1, 1, 1], up: [0, 1, 0], q: [-0.2798, -0.3647, -0.1159, 0.8805] },
    TOP_BACK_RIGHT: { id: 'TOP_BACK_RIGHT', cat: 'corner', size: [b, b, b], pos: [c, c, -c], dir: [1, 1, -1], up: [0, 1, 0], q: [-0.1159, 0.8805, 0.2798, 0.3647] },
    TOP_BACK_LEFT: { id: 'TOP_BACK_LEFT', cat: 'corner', size: [b, b, b], pos: [-c, c, -c], dir: [-1, 1, -1], up: [0, 1, 0], q: [0.1159, 0.8805, 0.2798, -0.3647] },

    BOTTOM_FRONT_RIGHT: { id: 'BOTTOM_FRONT_RIGHT', cat: 'corner', size: [b, b, b], pos: [c, -c, c], dir: [1, -1, 1], up: [0, 1, 0], q: [0.2798, 0.3647, -0.1159, 0.8805] },
    BOTTOM_FRONT_LEFT: { id: 'BOTTOM_FRONT_LEFT', cat: 'corner', size: [b, b, b], pos: [-c, -c, c], dir: [-1, -1, 1], up: [0, 1, 0], q: [0.2798, -0.3647, 0.1159, 0.8805] },
    BOTTOM_BACK_RIGHT: { id: 'BOTTOM_BACK_RIGHT', cat: 'corner', size: [b, b, b], pos: [c, -c, -c], dir: [1, -1, -1], up: [0, 1, 0], q: [0.1159, 0.8805, -0.2798, 0.3647] },
    BOTTOM_BACK_LEFT: { id: 'BOTTOM_BACK_LEFT', cat: 'corner', size: [b, b, b], pos: [-c, -c, -c], dir: [-1, -1, -1], up: [0, 1, 0], q: [-0.1159, 0.8805, -0.2798, -0.3647] }
  };

  // Alias ISO to Home
  ORIENTATIONS.ISO = ORIENTATIONS.TOP_FRONT_RIGHT;

  function createFaceTexture(label, isHovered = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Background fill
    ctx.fillStyle = isHovered ? FACE_COLORS.hover : FACE_COLORS.normal;
    ctx.fillRect(0, 0, 256, 256);

    // Border
    ctx.strokeStyle = isHovered ? '#38bdf8' : FACE_COLORS.border;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 248, 248);

    // Inner chamfer delineation lines (b / L = 0.22 / 1.6 ~= 35px)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(35, 35, 186, 186);

    // Corner markers
    ctx.fillStyle = isHovered ? '#ffffff' : '#38bdf8';
    ctx.fillRect(8, 8, 12, 12);
    ctx.fillRect(236, 8, 12, 12);
    ctx.fillRect(8, 236, 12, 12);
    ctx.fillRect(236, 236, 12, 12);

    // Typography
    ctx.fillStyle = isHovered ? FACE_COLORS.hoverText : FACE_COLORS.text;
    ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }

  function initViewCube() {
    cubeContainer = document.getElementById('viewcube-container');
    cubeCanvas = document.getElementById('viewcube-canvas');
    if (!cubeContainer || !cubeCanvas) return;

    cubeScene = new THREE.Scene();
    cubeCamera = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 50);
    cubeCamera.position.set(0, 0, 4);

    cubeRenderer = new THREE.WebGLRenderer({
      canvas: cubeCanvas,
      alpha: true,
      antialias: true
    });
    cubeRenderer.setSize(110, 110);
    cubeRenderer.setPixelRatio(window.devicePixelRatio || 1);

    // Lighting
    cubeScene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 0.4);
    dir.position.set(2, 4, 3);
    cubeScene.add(dir);

    // Base Textured Box Geometry
    const materials = FACE_NAMES.map(name => new THREE.MeshBasicMaterial({
      map: createFaceTexture(name, false),
      transparent: true,
      opacity: 0.95
    }));

    const geom = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    cubeMesh = new THREE.Mesh(geom, materials);
    cubeScene.add(cubeMesh);

    // Outline Edges
    const edgesGeom = new THREE.EdgesGeometry(geom);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 1.5, transparent: true, opacity: 0.6 });
    cubeMesh.add(new THREE.LineSegments(edgesGeom, edgesMat));

    // Construct 26 Space-Filling Hitbox Meshes
    hitboxMeshes.length = 0;
    const hitboxGroup = new THREE.Group();
    cubeScene.add(hitboxGroup);

    Object.entries(ORIENTATIONS).forEach(([id, def]) => {
      if (id === 'ISO') return;
      const hbGeom = new THREE.BoxGeometry(...def.size);
      const hbMat = new THREE.MeshBasicMaterial({
        color: def.cat === 'corner' ? 0x38bdf8 : 0x0284c7,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -4.0
      });
      const mesh = new THREE.Mesh(hbGeom, hbMat);
      mesh.position.set(...def.pos);
      mesh.name = 'hitbox_' + id;
      mesh.userData = { id, def, orientation: id };
      hitboxGroup.add(mesh);
      hitboxMeshes.push(mesh);
    });
    cubeScene.updateMatrixWorld(true);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    setupInteractions();
    isViewCubeInitialized = true;
  }

  function setupInteractions() {
    if (!cubeCanvas) return;

    cubeCanvas.addEventListener('pointermove', (e) => {
      const rect = cubeCanvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cubeCamera);
      const intersects = raycaster.intersectObjects(hitboxMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (currentlyHoveredHitbox !== hit) {
          resetHoverMaterial();
          currentlyHoveredHitbox = hit;
          const def = hit.userData.def;
          if (def.cat === 'corner') {
            hit.material.opacity = 0.85;
            hit.material.color.setHex(0x38bdf8);
          } else if (def.cat === 'edge') {
            hit.material.opacity = 0.75;
            hit.material.color.setHex(0x0284c7);
          } else if (def.cat === 'face') {
            hit.material.opacity = 0.40;
            const fIdx = def.faceIdx;
            if (cubeMesh && cubeMesh.material && cubeMesh.material[fIdx]) {
              cubeMesh.material[fIdx].map = createFaceTexture(FACE_NAMES[fIdx], true);
              cubeMesh.material[fIdx].needsUpdate = true;
            }
          }
        }
        cubeCanvas.style.cursor = 'pointer';
      } else {
        resetHoverMaterial();
        cubeCanvas.style.cursor = 'default';
      }
    });

    cubeCanvas.addEventListener('pointerleave', () => {
      resetHoverMaterial();
      cubeCanvas.style.cursor = 'default';
    });

    cubeCanvas.addEventListener('click', (e) => {
      const rect = cubeCanvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cubeCamera);
      const intersects = raycaster.intersectObjects(hitboxMeshes);

      if (intersects.length > 0) {
        const hitId = intersects[0].object.userData.id;
        rotateMainCameraToFace(hitId);
      }
    });

    document.getElementById('vc-btn-home')?.addEventListener('click', () => {
      rotateMainCameraToFace('TOP_FRONT_RIGHT');
    });

    document.getElementById('vc-btn-persp')?.addEventListener('click', () => {
      toggleOrthoPersp();
    });
  }

  function resetHoverMaterial() {
    if (currentlyHoveredHitbox) {
      currentlyHoveredHitbox.material.opacity = 0.0;
      if (currentlyHoveredHitbox.userData && currentlyHoveredHitbox.userData.def && currentlyHoveredHitbox.userData.def.cat === 'face') {
        const fIdx = currentlyHoveredHitbox.userData.def.faceIdx;
        if (cubeMesh && cubeMesh.material && cubeMesh.material[fIdx]) {
          cubeMesh.material[fIdx].map = createFaceTexture(FACE_NAMES[fIdx], false);
          cubeMesh.material[fIdx].needsUpdate = true;
        }
      }
      currentlyHoveredHitbox = null;
    }
  }

  function rotateMainCameraToFace(orientationKey) {
    if (!window.camera || !window.controls) return;
    const key = String(orientationKey).toUpperCase();
    const orient = ORIENTATIONS[key] || ORIENTATIONS.ISO;

    const center = window.controls.target.clone();
    let dist = 100;
    if (window.modelGroup && window.modelGroup.children.length > 0) {
      const box = new THREE.Box3().setFromObject(window.modelGroup);
      if (!box.isEmpty()) {
        if (typeof window.computeSafeCameraDistance === 'function') {
          dist = window.computeSafeCameraDistance(box, 1.25);
        } else {
          const sz = box.getSize(new THREE.Vector3());
          dist = Math.max(sz.x, sz.y, sz.z) * 1.8;
        }
      }
    } else if (typeof window.currentModelDistance === 'number' && window.currentModelDistance > 0) {
      dist = window.currentModelDistance;
    }

    const dir = new THREE.Vector3(...orient.dir).normalize();
    const targetPos = center.clone().addScaledVector(dir, dist);
    const targetUp = new THREE.Vector3(...orient.up).normalize();

    if (typeof window.tweenCamera === 'function') {
      window.tweenCamera(targetPos, center, targetUp, 450);
    } else {
      window.camera.position.copy(targetPos);
      window.camera.up.copy(targetUp);
      window.controls.target.copy(center);
      window.controls.update();
    }
  }

  function toggleOrthoPersp() {
    if (typeof window.switchCamera === 'function') {
      window.switchCamera();
      return;
    }
    if (typeof window.toggleOrthoPersp === 'function' && window.toggleOrthoPersp !== toggleOrthoPersp) {
      window.toggleOrthoPersp();
      return;
    }
    const btn = document.getElementById('vc-btn-persp');
    if (!btn || !window.camera) return;
    const isPersp = window.camera.isPerspectiveCamera;
    if (btn) {
      btn.innerText = isPersp ? 'Persp' : 'Ortho';
      if (isPersp) {
        btn.classList.remove('active');
        btn.title = 'Switch to Orthographic Camera [O]';
      } else {
        btn.classList.add('active');
        btn.title = 'Switch to Perspective Camera [O]';
      }
    }
    if (typeof window.showToast === 'function') {
      window.showToast(isPersp ? 'Switched to Perspective Camera' : 'Switched to Orthographic Camera');
    }
  }

  function updateViewCube() {
    if (!isViewCubeInitialized || !window.camera || !window.controls || !cubeMesh) return;

    // Pure quaternion orientation sync - gimbal lock free, zero NaN at poles
    cubeCamera.position.set(0, 0, 3.5).applyQuaternion(window.camera.quaternion);
    cubeCamera.quaternion.copy(window.camera.quaternion);
    cubeCamera.updateMatrixWorld(true);

    cubeRenderer.render(cubeScene, cubeCamera);
  }

  window.ViewCube = {
    init: initViewCube,
    update: updateViewCube,
    rotateToFace: rotateMainCameraToFace,
    rotateToOrientation: rotateMainCameraToFace,
    orientations: ORIENTATIONS,
    get hitboxes() { return hitboxMeshes; },
    get hitboxMeshes() { return hitboxMeshes; },
    toggleOrthoPersp: toggleOrthoPersp
  };

  window.initViewCube = initViewCube;
  window.updateViewCube = updateViewCube;
  window.rotateMainCameraToFace = rotateMainCameraToFace;
  window.toggleOrthoPersp = window.toggleOrthoPersp || toggleOrthoPersp;
})();
