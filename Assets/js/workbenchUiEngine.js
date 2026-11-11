/**
 * QuickLook CAD Studio - Unified Workbench UI & Theme Engine (v2.0.0)
 * Manages the Unified Right Inspector Drawer, Live Theme Switcher (Dark/Light),
 * Aerospace Bounding Box Callouts (Concept 3), and Viewport HUD Badges.
 */
(function () {
  'use strict';

  let activeTheme = 'dark'; // 'dark' | 'light'
  let isDrawerOpen = false;
  let activeTab = 'tree';
  let isBoundingBoxActive = false;
  let bboxHelperGroup = null;
  let bboxCalloutSprites = [];

  function initWorkbenchUI() {
    createDrawerStructure();
    setupThemeSwitcher();
    setupBoundingBoxEngine();
    setupDrawerKeyboardEtiquette();
    setupAnalysisListeners();
    setupExplodeKeyboardGuard();
    hookExplodeLifecycle();
    updateExplodeToolState();

    // Restore saved theme preference
    try {
      const savedTheme = localStorage.getItem('quicklook_stp_theme');
      if (savedTheme === 'light' || savedTheme === 'dark') {
        activeTheme = savedTheme;
        if (activeTheme === 'light') {
          toggleTheme('light');
        }
      }
    } catch (e) {}
  }

  const mapToolToTab = {
    'btn-tree': 'tree',
    'btn-measure': 'measure',
    'btn-section': 'section',
    'btn-props': 'mass',
    'btn-analysis': 'analysis',
    'btn-snapshot': 'export'
  };

  const mapTabToTool = {
    'tree': 'btn-tree',
    'measure': 'btn-measure',
    'section': 'btn-section',
    'mass': 'btn-props',
    'analysis': 'btn-analysis',
    'export': 'btn-snapshot'
  };

  function createDrawerStructure() {
    const drawer = document.getElementById('inspector-drawer');
    if (!drawer) return;

    // Hook tab buttons inside drawer header
    drawer.querySelectorAll('.drawer-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const tab = tabBtn.dataset.tab;
        switchDrawerTab(tab);
      });
    });

    // Hook master close button and legacy panel close buttons
    ['btn-close-drawer', 'btn-close-tree', 'btn-close-props', 'btn-close-snapshot'].forEach(btnId => {
      document.getElementById(btnId)?.addEventListener('click', (e) => {
        e?.stopPropagation?.();
        closeDrawer();
      });
    });

    // Wire toolbar triggers to open/toggle respective drawer tab
    Object.entries(mapToolToTab).forEach(([btnId, tabName]) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          toggleDrawer(tabName);
        });
      }
    });
  }

  function toggleDrawer(tabName = 'tree') {
    if (isDrawerOpen && activeTab === tabName) {
      closeDrawer();
    } else {
      openDrawer(tabName);
    }
  }

  function openDrawer(tabName = 'tree') {
    const drawer = document.getElementById('inspector-drawer');
    if (!drawer) return;
    isDrawerOpen = true;
    drawer.classList.add('open');
    document.body.classList.add('drawer-open');
    switchDrawerTab(tabName);
  }

  function closeDrawer() {
    const drawer = document.getElementById('inspector-drawer');
    if (!drawer) return;
    const closingTab = activeTab;
    isDrawerOpen = false;
    drawer.classList.remove('open');
    document.body.classList.remove('drawer-open');

    // Remove active highlight from all drawer-associated toolbar buttons
    Object.keys(mapToolToTab).forEach(btnId => {
      document.getElementById(btnId)?.classList.remove('active');
    });

    // Deactivate all header tab buttons
    drawer.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));

    // Clean up active CAD subsystem modes gracefully
    if (closingTab === 'measure' && typeof window.toggleMeasureMode === 'function' && window.isMeasureActive) {
      window.toggleMeasureMode(false);
    }
    if (closingTab === 'section' && typeof window.toggleSectionView === 'function' && window.isSectionActive) {
      window.toggleSectionView(false);
    }
    if (window.CadAnalysis && typeof window.CadAnalysis.isPickingFace === 'function' && window.CadAnalysis.isPickingFace()) {
      window.CadAnalysis.stopFacePicking();
    }
    // Milestone M4: Hide Draft Legend and clean up draft analysis when drawer closes
    if (window.CadAnalysis && typeof window.CadAnalysis.hideDraftLegend === 'function') {
      window.CadAnalysis.hideDraftLegend();
    }
    if (window.CadAnalysis && typeof window.CadAnalysis.toggleDraftAngle === 'function') {
      const isDraftOn = typeof window.CadAnalysis.isDraftActive === 'function'
        ? window.CadAnalysis.isDraftActive()
        : (typeof window.CadAnalysis.isDraftAngleActive === 'function' && window.CadAnalysis.isDraftAngleActive());
      if (isDraftOn) {
        window.CadAnalysis.toggleDraftAngle(false);
      }
    }
  }

  function switchDrawerTab(tabName) {
    const previousTab = activeTab;
    activeTab = tabName;
    const drawer = document.getElementById('inspector-drawer');
    if (!drawer) return;

    // Toggle tab header buttons
    drawer.querySelectorAll('.drawer-tab').forEach(t => {
      const isNowActive = (t.dataset.tab === tabName);
      t.classList.toggle('active', isNowActive);
      if (isNowActive && typeof t.scrollIntoView === 'function') {
        t.scrollIntoView({ inline: 'nearest', behavior: 'smooth' });
      }
    });

    // Toggle tab content panes
    drawer.querySelectorAll('.drawer-tab-content, .drawer-tab-pane').forEach(c => {
      const isActive = c.dataset.tab === tabName;
      c.style.display = isActive ? 'flex' : 'none';
      c.classList.toggle('active', isActive);
    });

    // Ensure inner legacy panels are always visible (flex) inside active pane
    const innerPanels = {
      tree: 'tree-panel',
      measure: 'measure-card',
      section: 'section-panel',
      mass: 'props-card',
      analysis: 'analysis-panel',
      export: 'snapshot-panel'
    };
    const currentInner = innerPanels[tabName];
    if (currentInner) {
      const el = document.getElementById(currentInner);
      if (el) el.style.display = 'flex';
    }

    // Synchronize toolbar button active state
    const targetToolId = mapTabToTool[tabName] || null;
    Object.keys(mapToolToTab).forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.classList.toggle('active', isDrawerOpen && btnId === targetToolId);
      }
    });

    // Lifecycle transitions for CAD subsystems
    if (previousTab !== tabName) {
      if (previousTab === 'measure' && typeof window.toggleMeasureMode === 'function' && window.isMeasureActive) {
        window.toggleMeasureMode(false);
      }
      if (previousTab === 'section' && typeof window.toggleSectionView === 'function' && window.isSectionActive) {
        window.toggleSectionView(false);
      }
      if (window.CadAnalysis && typeof window.CadAnalysis.isPickingFace === 'function' && window.CadAnalysis.isPickingFace()) {
        window.CadAnalysis.stopFacePicking();
      }
      // Milestone M4: Suspend Draft Analysis and hide legend when switching away from analysis tab
      if (previousTab === 'analysis') {
        if (window.CadAnalysis && typeof window.CadAnalysis.hideDraftLegend === 'function') {
          window.CadAnalysis.hideDraftLegend();
        }
        if (window.CadAnalysis && typeof window.CadAnalysis.toggleDraftAngle === 'function') {
          const isDraftOn = typeof window.CadAnalysis.isDraftActive === 'function'
            ? window.CadAnalysis.isDraftActive()
            : (typeof window.CadAnalysis.isDraftAngleActive === 'function' && window.CadAnalysis.isDraftAngleActive());
          if (isDraftOn) {
            window.CadAnalysis.toggleDraftAngle(false);
          }
        }
      }
    }

    if (tabName === 'measure') {
      if (typeof window.toggleMeasureMode === 'function' && !window.isMeasureActive) {
        window.toggleMeasureMode(true);
      }
    } else if (tabName === 'section') {
      if (typeof window.toggleSectionView === 'function' && !window.isSectionActive) {
        window.toggleSectionView(true);
      }
    } else if (tabName === 'mass') {
      if (typeof window.updatePhysicalPropertiesCard === 'function') {
        window.updatePhysicalPropertiesCard();
      }
    } else if (tabName === 'export') {
      if (typeof window.initSnapshotSystem === 'function') {
        window.initSnapshotSystem();
      }
    }
  }

  function setupAnalysisListeners() {
    document.getElementById('btn-run-collision')?.addEventListener('click', () => {
      if (window.CadAnalysis?.checkCollisions) window.CadAnalysis.checkCollisions();
    });
    document.getElementById('btn-toggle-com')?.addEventListener('click', () => {
      if (window.CadAnalysis?.toggleCenterOfMass) window.CadAnalysis.toggleCenterOfMass();
    });
    document.getElementById('btn-toggle-draft')?.addEventListener('click', () => {
      if (window.CadAnalysis?.toggleDraftAngle) window.CadAnalysis.toggleDraftAngle();
    });
    document.getElementById('btn-generate-blueprint')?.addEventListener('click', () => {
      if (window.BlueprintEngine?.downloadPng) window.BlueprintEngine.downloadPng();
      else if (window.BlueprintSvg?.generateAndDownload) window.BlueprintSvg.generateAndDownload();
    });
    document.getElementById('btn-blueprint-pdf')?.addEventListener('click', () => {
      if (window.BlueprintEngine?.downloadPdf) window.BlueprintEngine.downloadPdf();
    });
    document.getElementById('btn-blueprint-svg')?.addEventListener('click', () => {
      if (window.BlueprintEngine?.downloadSvg) window.BlueprintEngine.downloadSvg();
    });

    // Milestone 3: Draft Analysis Controls (TSK-05)
    document.getElementById('btn-draft-plane-xy')?.addEventListener('click', () => {
      if (window.CadAnalysis?.setPullPlane) window.CadAnalysis.setPullPlane('XY');
    });
    document.getElementById('btn-draft-plane-yz')?.addEventListener('click', () => {
      if (window.CadAnalysis?.setPullPlane) window.CadAnalysis.setPullPlane('YZ');
    });
    document.getElementById('btn-draft-plane-zx')?.addEventListener('click', () => {
      if (window.CadAnalysis?.setPullPlane) window.CadAnalysis.setPullPlane('ZX');
    });
    document.getElementById('btn-draft-flip')?.addEventListener('click', () => {
      if (window.CadAnalysis?.flipPullDirection) window.CadAnalysis.flipPullDirection();
    });
    document.getElementById('btn-flip-draft-pull')?.addEventListener('click', () => {
      if (window.CadAnalysis?.flipPullDirection) window.CadAnalysis.flipPullDirection();
    });

    const btnPickFace = document.getElementById('btn-draft-pick-face') || document.getElementById('btn-pick-draft-face');
    btnPickFace?.addEventListener('click', () => {
      if (window.CadAnalysis?.isPickingFace && window.CadAnalysis.isPickingFace()) {
        window.CadAnalysis.stopFacePicking();
      } else if (window.CadAnalysis?.startFacePicking) {
        window.CadAnalysis.startFacePicking();
      }
    });

    document.getElementById('draft-plane-select')?.addEventListener('change', (e) => {
      if (window.CadAnalysis?.setPullPlane) window.CadAnalysis.setPullPlane(e.target.value);
    });

    const angleSlider = document.getElementById('draft-angle-slider') || document.getElementById('draft-threshold-input');
    const handleAngleInput = (e) => {
      const targetVal = e && e.target ? e.target.value : e;
      const val = parseFloat(targetVal);
      if (!isNaN(val) && window.CadAnalysis?.setDraftThreshold) {
        window.CadAnalysis.setDraftThreshold(val);
      }
    };
    angleSlider?.addEventListener('input', handleAngleInput);
    angleSlider?.addEventListener('change', handleAngleInput);
  }

  function setupThemeSwitcher() {
    const themeBtn = document.getElementById('btn-theme-switch');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => toggleTheme());
    }
  }

  function toggleTheme(targetTheme) {
    activeTheme = targetTheme || (activeTheme === 'dark' ? 'light' : 'dark');
    const isLight = (activeTheme === 'light');

    if (document.body) {
      document.body.classList.toggle('theme-light', isLight);
    }
    if (document.documentElement) {
      document.documentElement.classList.toggle('theme-light', isLight);
    }

    // 1. Sync Three.js WebGL lighting, tone mapping exposure & shadows
    if (typeof window.updateThemeLighting === 'function') {
      window.updateThemeLighting(isLight);
    }

    // 2. Sync Three.js Scene Background
    const ThreeLib = window.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    if (window.scene && ThreeLib) {
      const bgHex = isLight ? 0xf1f5f9 : 0x080a0f;
      window.scene.background = new ThreeLib.Color(bgHex);
    }

    // 3. Update GridHelper colors WITHOUT destroying or resetting position/bounds
    if (window.gridHelper && window.gridHelper.material && ThreeLib) {
      const gridColor = isLight ? new ThreeLib.Color(0xcbd5e1) : new ThreeLib.Color(0x334155);
      const centerColor = isLight ? new ThreeLib.Color(0x0284c7) : new ThreeLib.Color(0x38bdf8);
      const setMatColor = (mat, col) => {
        if (!mat || !mat.color) return;
        if (typeof mat.color.copy === 'function') {
          mat.color.copy(col);
        } else if (typeof mat.color.setHex === 'function') {
          mat.color.setHex(col.getHex ? col.getHex() : col);
        } else {
          mat.color = col;
        }
      };
      if (Array.isArray(window.gridHelper.material)) {
        if (window.gridHelper.material[0]) setMatColor(window.gridHelper.material[0], centerColor);
        if (window.gridHelper.material[1]) setMatColor(window.gridHelper.material[1], gridColor);
      } else {
        setMatColor(window.gridHelper.material, gridColor);
      }
    }

    // 4. Update Theme Button Icon & Tooltip
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    const themeBtn = document.getElementById('btn-theme-switch');
    const label = document.getElementById('theme-btn-label');
    if (sunIcon && moonIcon) {
      sunIcon.style.display = isLight ? 'none' : 'block';
      moonIcon.style.display = isLight ? 'block' : 'none';
    }
    if (themeBtn) {
      themeBtn.title = isLight ? 'Switch to Dark Studio Vignette' : 'Switch to Light Engineering Workbench';
    }
    if (label) {
      label.innerText = isLight ? 'Light' : 'Dark';
    }

    // 5. Update Bounding Box line color if active
    if (isBoundingBoxActive && bboxHelperGroup && typeof bboxHelperGroup.traverse === 'function') {
      const bboxColorHex = isLight ? 0x0284c7 : 0x00f0ff;
      bboxHelperGroup.traverse((child) => {
        if (child && child.isLineSegments && child.material && child.material.color) {
          if (typeof child.material.color.setHex === 'function') {
            child.material.color.setHex(bboxColorHex);
          } else {
            child.material.color = bboxColorHex;
          }
        }
      });
    }

    // 6. Save persistence to localStorage
    try {
      localStorage.setItem('quicklook_stp_theme', activeTheme);
    } catch (e) {}

    if (typeof window.showToast === 'function') {
      window.showToast(`Theme: ${isLight ? 'Light Engineering Workbench' : 'Dark CAD Studio'}`);
    }
  }

  function setupBoundingBoxEngine() {
    bboxHelperGroup = new THREE.Group();
    bboxHelperGroup.name = 'bboxCalloutGroup';
    if (window.scene) window.scene.add(bboxHelperGroup);

    const bboxBtn = document.getElementById('btn-bbox-hud');
    if (bboxBtn) {
      bboxBtn.addEventListener('click', () => toggleBoundingBox());
    }
  }

  function toggleBoundingBox(enable) {
    isBoundingBoxActive = (enable !== undefined) ? enable : !isBoundingBoxActive;
    const btn = document.getElementById('btn-bbox-hud');
    if (btn) btn.classList.toggle('active', isBoundingBoxActive);

    if (!bboxHelperGroup && window.scene) {
      bboxHelperGroup = new THREE.Group();
      window.scene.add(bboxHelperGroup);
    }

    bboxHelperGroup.clear();
    bboxCalloutSprites = [];

    if (!isBoundingBoxActive || !window.modelGroup) return;

    const box = new THREE.Box3().setFromObject(window.modelGroup);
    if (box.isEmpty()) return;

    // High-contrast Bounding Box Lines (SolidWorks Blue in Light Mode, Cyan Aerospace in Dark Mode)
    const isLight = (activeTheme === 'light');
    const bboxColorHex = isLight ? 0x0284c7 : 0x00f0ff;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const boxGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
    const boxEdges = new THREE.EdgesGeometry(boxGeom);
    const boxMat = new THREE.LineBasicMaterial({
      color: bboxColorHex,
      linewidth: 2,
      transparent: true,
      opacity: 0.85
    });
    const boxLine = new THREE.LineSegments(boxEdges, boxMat);
    boxLine.position.copy(center);
    bboxHelperGroup.add(boxLine);

    // Callout dimension labels in mm/in
    const dimX = (typeof window.formatDim === 'function') ? window.formatDim(size.x) : `${size.x.toFixed(1)} mm`;
    const dimY = (typeof window.formatDim === 'function') ? window.formatDim(size.y) : `${size.y.toFixed(1)} mm`;
    const dimZ = (typeof window.formatDim === 'function') ? window.formatDim(size.z) : `${size.z.toFixed(1)} mm`;

    if (typeof window.createTextSprite === 'function') {
      const sX = window.createTextSprite(`X: ${dimX}`);
      sX.position.set(center.x, box.min.y - 4, box.max.z + 4);
      bboxHelperGroup.add(sX);

      const sY = window.createTextSprite(`Y: ${dimY}`);
      sY.position.set(box.max.x + 4, center.y, box.max.z + 4);
      bboxHelperGroup.add(sY);

      const sZ = window.createTextSprite(`Z: ${dimZ}`);
      sZ.position.set(box.max.x + 4, box.min.y - 4, center.z);
      bboxHelperGroup.add(sZ);
    }
  }

  function setupDrawerKeyboardEtiquette() {
    if (typeof window.addEventListener !== 'function') return;
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.altKey) {
        toggleBoundingBox();
      }
    });
  }

  // =========================================================================
  // Milestone 4: Exploded View Tool Adaptation & Shortcut 'X' Interception
  // =========================================================================

  function isSingleBodyStlModel(format, meshCount) {
    const curFormat = format || (typeof window.activeCadFormat !== 'undefined' ? window.activeCadFormat : 'STEP');
    let count;
    if (meshCount !== undefined) {
      count = meshCount;
    } else if (window.modelBodies && Array.isArray(window.modelBodies)) {
      count = window.modelBodies.length;
    } else {
      count = 1;
    }
    return curFormat === 'STL' && count <= 1;
  }

  function updateExplodeToolState(format, meshCount) {
    hookExplodeLifecycle();
    const btnExplode = document.getElementById('btn-explode');
    if (!btnExplode) return;

    const curFormat = format || (typeof window.activeCadFormat !== 'undefined' ? window.activeCadFormat : 'STEP');
    let count;
    if (meshCount !== undefined) {
      count = meshCount;
    } else if (window.modelBodies && Array.isArray(window.modelBodies)) {
      count = window.modelBodies.length;
    } else {
      count = 1;
    }

    const isSingleStl = (curFormat === 'STL' && count <= 1);

    if (isSingleStl) {
      btnExplode.disabled = true;
      btnExplode.setAttribute('disabled', 'true');
      btnExplode.classList.add('disabled');
      btnExplode.style.opacity = '0.4';
      btnExplode.style.pointerEvents = 'none';
      btnExplode.style.cursor = 'not-allowed';
      btnExplode.title = 'Exploded view requires a multi-body assembly';
    } else if (count > 1) {
      btnExplode.disabled = false;
      btnExplode.removeAttribute('disabled');
      btnExplode.classList.remove('disabled');
      btnExplode.style.opacity = '1';
      btnExplode.style.pointerEvents = 'auto';
      btnExplode.style.cursor = 'pointer';
      btnExplode.title = 'Exploded Assembly View [X]';
    } else {
      // Single-body STEP / IGES / BREP
      btnExplode.disabled = false;
      btnExplode.removeAttribute('disabled');
      btnExplode.classList.remove('disabled');
      btnExplode.style.opacity = '0.45';
      btnExplode.style.pointerEvents = 'auto';
      btnExplode.style.cursor = 'pointer';
      btnExplode.title = 'Exploded View (Requires Assembly with 2+ parts)';
    }
  }

  let activeExplodeKeyGuardListener = null;
  function setupExplodeKeyboardGuard() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    if (activeExplodeKeyGuardListener && typeof window.removeEventListener === 'function') {
      window.removeEventListener('keydown', activeExplodeKeyGuardListener, true);
      activeExplodeKeyGuardListener = null;
    }

    const onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key ? e.key.toLowerCase() : '';
      if (key === 'x') {
        if (isSingleBodyStlModel()) {
          e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          if (typeof window.showToast === 'function') {
            window.showToast('Exploded view requires a multi-body assembly with multiple parts');
          }
        }
      }
    };

    activeExplodeKeyGuardListener = onKeyDown;
    window.addEventListener('keydown', onKeyDown, true); // Capture phase is critical to intercept before bubbling listeners
  }

  function hookExplodeLifecycle() {
    // Wrap window.buildModelTree
    if (typeof window.buildModelTree === 'function' && !window.buildModelTree._isExplodeHooked) {
      const origBuildModelTree = window.buildModelTree;
      const hookedBuildModelTree = function (meshes) {
        const ret = origBuildModelTree.apply(this, arguments);
        const count = window.modelBodies ? window.modelBodies.length : (meshes ? meshes.length : 1);
        updateExplodeToolState(window.activeCadFormat, count);
        return ret;
      };
      hookedBuildModelTree._isExplodeHooked = true;
      window.buildModelTree = hookedBuildModelTree;
    }

    // Wrap window.initExplodeVectors
    if (typeof window.initExplodeVectors === 'function' && !window.initExplodeVectors._isExplodeHooked) {
      const origInitExplodeVectors = window.initExplodeVectors;
      const hookedInitExplodeVectors = function () {
        const ret = origInitExplodeVectors.apply(this, arguments);
        updateExplodeToolState();
        return ret;
      };
      hookedInitExplodeVectors._isExplodeHooked = true;
      window.initExplodeVectors = hookedInitExplodeVectors;
    }

    // Wrap window.resetExplodedView
    if (typeof window.resetExplodedView === 'function' && !window.resetExplodedView._isExplodeHooked) {
      const origResetExplodedView = window.resetExplodedView;
      const hookedResetExplodedView = function () {
        const ret = origResetExplodedView.apply(this, arguments);
        updateExplodeToolState();
        return ret;
      };
      hookedResetExplodedView._isExplodeHooked = true;
      window.resetExplodedView = hookedResetExplodedView;
    }

    // Wrap window.toggleExplode
    if (typeof window.toggleExplode === 'function' && !window.toggleExplode._isExplodeHooked) {
      const origToggleExplode = window.toggleExplode;
      const hookedToggleExplode = function () {
        if (isSingleBodyStlModel()) {
          if (typeof window.showToast === 'function') {
            window.showToast('Exploded view requires a multi-body assembly with multiple parts');
          }
          return;
        }
        return origToggleExplode.apply(this, arguments);
      };
      hookedToggleExplode._isExplodeHooked = true;
      window.toggleExplode = hookedToggleExplode;
    }
  }

  // Automatic immediate & DOMContentLoaded attachment
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupExplodeKeyboardGuard();
      hookExplodeLifecycle();
      updateExplodeToolState();
    });
  } else if (typeof window !== 'undefined') {
    setupExplodeKeyboardGuard();
    hookExplodeLifecycle();
  }

  window.WorkbenchUI = {
    init: initWorkbenchUI,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    switchDrawerTab,
    isDrawerOpen: () => isDrawerOpen,
    getActiveTab: () => activeTab,
    getActiveTheme: () => activeTheme,
    toggleTheme,
    toggleBoundingBox,
    updateExplodeToolState,
    isSingleBodyStlModel,
    setupExplodeKeyboardGuard,
    hookExplodeLifecycle
  };

  window.initWorkbenchUI = initWorkbenchUI;
  window.openDrawer = openDrawer;
  window.closeDrawer = closeDrawer;
  window.toggleDrawer = toggleDrawer;
  window.switchDrawerTab = switchDrawerTab;
  window.toggleTheme = toggleTheme;
  window.toggleBoundingBox = toggleBoundingBox;
  window.updateExplodeToolState = updateExplodeToolState;
  window.isSingleBodyStlModel = isSingleBodyStlModel;
})();
