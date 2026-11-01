/**
 * CAD Appearance & Material Popover Engine
 * Manages body material presets, custom colors, metalness/roughness, opacity, and real-time physical estimations.
 */
(function () {
  let activeColorPopoverBodyId = null;

  function openColorPickerPopover(bodyId, anchorEl) {
    const modelBodies = window.modelBodies || [];
    const b = modelBodies.find(item => item.id === bodyId);
    if (!b || !b.mesh || !b.mesh.material) return;
    activeColorPopoverBodyId = bodyId;
    window.activeColorPopoverBodyId = activeColorPopoverBodyId;
    const popover = document.getElementById('color-picker-popover');
    if (!popover) return;

    const titleEl = document.getElementById('color-popover-body-name');
    if (titleEl) titleEl.innerText = `${b.name} Appearance`;

    const origColor = b.originalColor || (b.mesh.userData && b.mesh.userData.originalColor) || b.mesh.material.color;
    const origHex = '#' + origColor.getHexString();
    const origSwatch = document.getElementById('popover-orig-swatch');
    if (origSwatch) origSwatch.style.backgroundColor = origHex;
    const origHexEl = document.getElementById('popover-orig-hex');
    if (origHexEl) origHexEl.innerText = origHex.toUpperCase();

    const curHex = '#' + b.mesh.material.color.getHexString();
    const colorInput = document.getElementById('popover-color-input');
    if (colorInput) colorInput.value = curHex;
    const hexValEl = document.getElementById('popover-color-hex-val');
    if (hexValEl) hexValEl.innerText = curHex.toUpperCase();

    const curOpacity = Math.round((b.mesh.material.opacity !== undefined ? b.mesh.material.opacity : 1.0) * 100);
    const opSlider = document.getElementById('popover-opacity-slider');
    if (opSlider) opSlider.value = curOpacity;
    const opVal = document.getElementById('popover-opacity-val');
    if (opVal) opVal.innerText = `${curOpacity}%`;

    updatePopoverMaterialMeter(b);
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      popover.style.left = `${Math.min(rect.right + 10, window.innerWidth - 300)}px`;
      popover.style.top = `${Math.max(68, Math.min(rect.top - 20, window.innerHeight - 560))}px`;
    }
    popover.style.display = 'flex';
  }

  function closeColorPickerPopover() {
    activeColorPopoverBodyId = null;
    window.activeColorPopoverBodyId = null;
    const popover = document.getElementById('color-picker-popover');
    if (popover) popover.style.display = 'none';
  }

  function updatePopoverMaterialMeter(b) {
    const matNameEl = document.getElementById('meter-mat-name');
    const massEl = document.getElementById('meter-mat-mass');
    const lengthEl = document.getElementById('meter-mat-length');
    document.querySelectorAll('.mat-preset-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mat === b.materialPreset));

    if (!b.materialPreset) {
      if (matNameEl) matNameEl.innerText = 'Custom / CAD Native';
      const volMm3 = (b.data && b.data.volumeMm3) || 0;
      if (volMm3 > 0 && massEl && lengthEl) {
        massEl.innerText = `${(volMm3 / 1000.0 * 1.24).toFixed(1)} g (if PLA)`;
        lengthEl.innerText = `${(volMm3 / 2405.28).toFixed(2)} m (1.75mm)`;
      }
      return;
    }
    if (matNameEl) matNameEl.innerText = `${b.materialPreset} (${b.materialDensity} g/cm³)`;
    const volMm3 = (b.data && b.data.volumeMm3) || 0;
    if (volMm3 > 0 && massEl && lengthEl) {
      massEl.innerText = `${(volMm3 / 1000.0 * b.materialDensity).toFixed(1)} g`;
      lengthEl.innerText = b.materialPreset === 'UV Resin' ? `${(volMm3 / 1000.0).toFixed(1)} mL (Liquid)` : `${(volMm3 / 2405.28).toFixed(2)} m (1.75mm)`;
    }
  }

  function setBodyColor(bodyId, hexColor, metalness, roughness) {
    const modelBodies = window.modelBodies || [];
    const b = modelBodies.find(item => item.id === bodyId);
    if (!b || !b.mesh || !b.mesh.material) return;
    b.mesh.material.color.set(hexColor);
    if (metalness !== undefined) b.mesh.material.metalness = metalness;
    if (roughness !== undefined) b.mesh.material.roughness = roughness;
    b.mesh.material.needsUpdate = true;
    b.customColor = hexColor;
    if (window.AssemblyTree && typeof window.AssemblyTree.updateTreeItemState === 'function') {
      window.AssemblyTree.updateTreeItemState(bodyId);
    }
    const colorInput = document.getElementById('popover-color-input');
    if (colorInput) colorInput.value = hexColor;
    const hexValEl = document.getElementById('popover-color-hex-val');
    if (hexValEl) hexValEl.innerText = hexColor.toUpperCase();
  }

  function resetBodyColor(bodyId) {
    const modelBodies = window.modelBodies || [];
    const b = modelBodies.find(item => item.id === bodyId);
    if (!b || !b.mesh || !b.mesh.material) return;
    const origColor = b.originalColor || (b.mesh.userData && b.mesh.userData.originalColor) || new THREE.Color(0xcccccc);
    b.mesh.material.color.copy(origColor);
    b.mesh.material.metalness = 0.4;
    b.mesh.material.roughness = 0.3;
    b.mesh.material.opacity = 1.0;
    b.mesh.material.transparent = false;
    b.mesh.material.depthWrite = true;
    b.mesh.material.needsUpdate = true;
    b.customColor = null;
    b.materialPreset = null;
    b.materialDensity = null;
    b.isGhosted = false;
    if (window.AssemblyTree && typeof window.AssemblyTree.updateTreeItemState === 'function') {
      window.AssemblyTree.updateTreeItemState(bodyId);
    }
    updatePopoverMaterialMeter(b);
  }

  function setBody3DPrintMaterial(bodyId, matName, density, hexColor, roughness) {
    const modelBodies = window.modelBodies || [];
    const b = modelBodies.find(item => item.id === bodyId);
    if (!b || !b.mesh || !b.mesh.material) return;
    b.materialPreset = matName;
    b.materialDensity = density;
    setBodyColor(bodyId, hexColor, 0.04, roughness || 0.45);
    updatePopoverMaterialMeter(b);
  }

  function setBodyOpacity(bodyId, percent) {
    const modelBodies = window.modelBodies || [];
    const b = modelBodies.find(item => item.id === bodyId);
    if (!b || !b.mesh || !b.mesh.material) return;
    const alpha = Math.max(0.1, Math.min(1.0, percent / 100.0));
    b.mesh.material.opacity = alpha;
    b.mesh.material.transparent = alpha < 0.999;
    b.mesh.material.depthWrite = alpha > 0.85;
    b.mesh.material.needsUpdate = true;
    const opVal = document.getElementById('popover-opacity-val');
    if (opVal) opVal.innerText = `${percent}%`;
  }

  function setupUI() {
    const btnClosePop = document.getElementById('btn-close-color-popover');
    if (btnClosePop) btnClosePop.addEventListener('click', () => closeColorPickerPopover());
    const btnResetOrig = document.getElementById('btn-reset-orig-color');
    if (btnResetOrig) btnResetOrig.addEventListener('click', () => { if (activeColorPopoverBodyId !== null) resetBodyColor(activeColorPopoverBodyId); });
    const btnApplyCustom = document.getElementById('btn-apply-custom-color');
    if (btnApplyCustom) {
      btnApplyCustom.addEventListener('click', () => {
        const inp = document.getElementById('popover-color-input');
        if (inp && activeColorPopoverBodyId !== null) setBodyColor(activeColorPopoverBodyId, inp.value);
      });
    }

    const opSlider = document.getElementById('popover-opacity-slider');
    if (opSlider) opSlider.addEventListener('input', () => { if (activeColorPopoverBodyId !== null) setBodyOpacity(activeColorPopoverBodyId, parseInt(opSlider.value, 10)); });

    document.querySelectorAll('.swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (activeColorPopoverBodyId === null) return;
        setBodyColor(activeColorPopoverBodyId, btn.dataset.color, parseFloat(btn.dataset.metal), parseFloat(btn.dataset.rough));
      });
    });

    document.querySelectorAll('.mat-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (activeColorPopoverBodyId === null) return;
        setBody3DPrintMaterial(activeColorPopoverBodyId, btn.dataset.mat, parseFloat(btn.dataset.density), btn.dataset.color, parseFloat(btn.dataset.rough));
      });
    });
  }

  const AppearancePopover = {
    openColorPickerPopover,
    closeColorPickerPopover,
    updatePopoverMaterialMeter,
    setBodyColor,
    resetBodyColor,
    setBody3DPrintMaterial,
    setBodyOpacity,
    setupUI,
    getActiveBodyId: () => activeColorPopoverBodyId
  };

  window.AppearancePopover = AppearancePopover;
  window.openColorPickerPopover = openColorPickerPopover;
  window.closeColorPickerPopover = closeColorPickerPopover;
  window.setBodyColor = setBodyColor;
  window.resetBodyColor = resetBodyColor;
})();
