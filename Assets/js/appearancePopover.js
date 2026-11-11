/**
 * CAD Body Appearance & 3D Printing Material Popover Controller (v2.0.0 - Full Restored)
 * Metal presets, industrial plastics, SLA resins, filament meter, opacity slider, custom hex.
 */
    // CAD Body Color & 3D Printing Material Popover Controller
    // =============================================================
    let activeColorPopoverBodyId = null;

    const AUTO_COLOR_PALETTE = [
      '#3b82f6', // Electric Blue
      '#f97316', // Safety Orange
      '#10b981', // Emerald Green
      '#a855f7', // Vivid Purple
      '#f43f5e', // Bright Crimson
      '#06b6d4', // Cyan
      '#eab308', // Industrial Amber
      '#6366f1', // Indigo
      '#ec4899', // Pink
      '#14b8a6', // Teal
      '#84cc16', // Lime
      '#8b5cf6', // Violet
      '#f59e0b', // Warm Amber
      '#64748b', // Slate Steel
      '#d946ef', // Fuchsia
      '#0ea5e9'  // Sky Blue
    ];

    function positionColorPopover(anchorEl) {
      const popover = document.getElementById('color-picker-popover');
      if (!popover) return;
      const treePanel = document.getElementById('tree-panel');
      const treeRect = treePanel ? treePanel.getBoundingClientRect() : { right: 306, top: 68 };
      let left = treeRect.right + 8;
      let top = treeRect.top;
      if (anchorEl) {
        const swatchRect = anchorEl.getBoundingClientRect();
        top = Math.max(68, Math.min(swatchRect.top - 20, window.innerHeight - 560));
      }
      if (left + 290 > window.innerWidth) {
        left = Math.max(10, (treePanel ? treePanel.getBoundingClientRect().left - 290 : 10));
      }
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    }

    function openColorPickerPopover(bodyId, anchorEl) {
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b || !b.mesh || !b.mesh.material) return;

      activeColorPopoverBodyId = bodyId;
      const popover = document.getElementById('color-picker-popover');
      if (!popover) return;

      // Update body title
      const titleEl = document.getElementById('color-popover-body-name');
      if (titleEl) titleEl.innerText = `${b.name} Appearance`;

      // Update original color
      const origColor = b.originalColor || (b.mesh.userData && b.mesh.userData.originalColor) || b.mesh.material.color;
      const origHex = '#' + origColor.getHexString();
      const origSwatch = document.getElementById('popover-orig-swatch');
      if (origSwatch) origSwatch.style.backgroundColor = origHex;
      const origHexEl = document.getElementById('popover-orig-hex');
      if (origHexEl) origHexEl.innerText = origHex.toUpperCase();

      // Update custom input & hex text
      const curHex = '#' + b.mesh.material.color.getHexString();
      const colorInput = document.getElementById('popover-color-input');
      if (colorInput) colorInput.value = curHex;
      const hexValEl = document.getElementById('popover-color-hex-val');
      if (hexValEl) hexValEl.innerText = curHex.toUpperCase();

      // Update opacity slider
      const curOpacity = Math.round((b.mesh.material.opacity !== undefined ? b.mesh.material.opacity : 1.0) * 100);
      const opSlider = document.getElementById('popover-opacity-slider');
      if (opSlider) opSlider.value = curOpacity;
      const opVal = document.getElementById('popover-opacity-val');
      if (opVal) opVal.innerText = `${curOpacity}%`;

      // Update material meter
      updatePopoverMaterialMeter(b);

      positionColorPopover(anchorEl);
      popover.style.display = 'flex';
    }

    function closeColorPickerPopover() {
      activeColorPopoverBodyId = null;
      const popover = document.getElementById('color-picker-popover');
      if (popover) popover.style.display = 'none';
    }

    function updatePopoverMaterialMeter(b) {
      const matNameEl = document.getElementById('meter-mat-name');
      const massEl = document.getElementById('meter-mat-mass');
      const lengthEl = document.getElementById('meter-mat-length');

      // Highlight active material preset button
      document.querySelectorAll('.mat-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mat === b.materialPreset);
      });

      if (!b.materialPreset) {
        if (matNameEl) matNameEl.innerText = 'Custom / CAD Native';
        const volMm3 = b.data.volumeMm3 || 0;
        if (volMm3 > 0) {
          // Show default PLA (1.24) baseline reference
          const plaMass = (volMm3 / 1000.0 * 1.24).toFixed(1);
          const plaFilament = (volMm3 / 2405.28).toFixed(2);
          if (massEl) massEl.innerText = `${plaMass} g (if PLA)`;
          if (lengthEl) lengthEl.innerText = `${plaFilament} m (1.75mm)`;
        } else {
          if (massEl) massEl.innerText = '-';
          if (lengthEl) lengthEl.innerText = '-';
        }
        return;
      }

      if (matNameEl) matNameEl.innerText = `${b.materialPreset} (${b.materialDensity} g/cm³)`;

      const volMm3 = b.data.volumeMm3 || 0;
      if (volMm3 > 0) {
        const massG = (volMm3 / 1000.0 * b.materialDensity).toFixed(1);
        if (massEl) massEl.innerText = `${massG} g`;

        if (b.materialPreset === 'UV Resin') {
          const resinMl = (volMm3 / 1000.0).toFixed(1);
          if (lengthEl) lengthEl.innerText = `${resinMl} mL (Liquid)`;
        } else {
          const lengthM = (volMm3 / 2405.28).toFixed(2);
          if (lengthEl) lengthEl.innerText = `${lengthM} m (1.75mm)`;
        }
      } else {
        if (massEl) massEl.innerText = 'N/A';
        if (lengthEl) lengthEl.innerText = 'N/A';
      }
    }

    function setBodyColor(bodyId, hexColor, metalness, roughness) {
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b || !b.mesh || !b.mesh.material) return;

      b.mesh.material.color.set(hexColor);
      if (metalness !== undefined) b.mesh.material.metalness = metalness;
      if (roughness !== undefined) b.mesh.material.roughness = roughness;
      b.mesh.material.needsUpdate = true;
      b.customColor = hexColor;

      updateTreeItemState(bodyId);

      const colorInput = document.getElementById('popover-color-input');
      if (colorInput) colorInput.value = hexColor;
      const hexValEl = document.getElementById('popover-color-hex-val');
      if (hexValEl) hexValEl.innerText = hexColor.toUpperCase();
    }

    function resetBodyColor(bodyId) {
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b || !b.mesh || !b.mesh.material) return;

      const origColor = b.originalColor || (b.mesh.userData && b.mesh.userData.originalColor) || new THREE.Color(0xb8c0cc);
      b.mesh.material.color.copy(origColor);
      b.mesh.material.metalness = 0.35;
      b.mesh.material.roughness = 0.34;
      b.mesh.material.opacity = 1.0;
      b.mesh.material.transparent = false;
      b.mesh.material.depthWrite = true;
      b.mesh.material.needsUpdate = true;

      b.customColor = null;
      b.materialPreset = null;
      b.materialDensity = null;
      b.isGhosted = false;

      updateTreeItemState(bodyId);
      updatePopoverMaterialMeter(b);

      const curHex = '#' + origColor.getHexString();
      const colorInput = document.getElementById('popover-color-input');
      if (colorInput) colorInput.value = curHex;
      const hexValEl = document.getElementById('popover-color-hex-val');
      if (hexValEl) hexValEl.innerText = curHex.toUpperCase();

      const opSlider = document.getElementById('popover-opacity-slider');
      if (opSlider) opSlider.value = 100;
      const opVal = document.getElementById('popover-opacity-val');
      if (opVal) opVal.innerText = '100%';

      showToast(`Restored original CAD color for ${b.name}`);
    }

    function setBody3DPrintMaterial(bodyId, matName, density, hexColor, roughness) {
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b || !b.mesh || !b.mesh.material) return;

      b.materialPreset = matName;
      b.materialDensity = density;

      setBodyColor(bodyId, hexColor, 0.04, roughness || 0.45);
      updatePopoverMaterialMeter(b);
      showToast(`Applied ${matName} preset (${density} g/cm³) to ${b.name}`);
    }

    function setBodyOpacity(bodyId, percent) {
      const b = modelBodies.find(item => item.id === bodyId);
      if (!b || !b.mesh || !b.mesh.material) return;

      const alpha = Math.max(0.1, Math.min(1.0, percent / 100.0));
      b.mesh.material.opacity = alpha;
      b.mesh.material.transparent = alpha < 0.999;
      b.mesh.material.depthWrite = alpha > 0.85;
      b.mesh.material.needsUpdate = true;

      if (alpha < 0.999) {
        b.isGhosted = false; // Custom opacity overrides binary ghost
      }

      const opVal = document.getElementById('popover-opacity-val');
      if (opVal) opVal.innerText = `${percent}%`;
    }

    function autoColorizeAssembly() {
      if (modelBodies.length === 0) return;

      modelBodies.forEach((b, idx) => {
        const color = AUTO_COLOR_PALETTE[idx % AUTO_COLOR_PALETTE.length];
        b.mesh.material.color.set(color);
        b.mesh.material.needsUpdate = true;
        b.customColor = color;
        updateTreeItemState(b.id);
      });

      if (activeColorPopoverBodyId !== null) {
        const activeBody = modelBodies.find(b => b.id === activeColorPopoverBodyId);
        if (activeBody) {
          const curHex = '#' + activeBody.mesh.material.color.getHexString();
          const colorInput = document.getElementById('popover-color-input');
          if (colorInput) colorInput.value = curHex;
          const hexValEl = document.getElementById('popover-color-hex-val');
          if (hexValEl) hexValEl.innerText = curHex.toUpperCase();
        }
      }

      showToast(`🎨 Auto-colorized assembly (${modelBodies.length} bodies)`);
    }

    function escapeHtml(str) {
      if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function') {
        return window.escapeHtml(str);
      }
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function updatePropsBodySelect() {
      const row = document.getElementById('props-body-row');
      const select = document.getElementById('props-body-select');
      if (!row || !select) return;

      if (modelBodies.length <= 1) {
        row.style.display = 'none';
        selectedBodyForProps = -1;
        return;
      }

      row.style.display = 'block';
      let html = `<option value="-1">Entire Assembly (Combined ${modelBodies.length} Bodies)</option>`;
      modelBodies.forEach((b) => {
        const volVal = b.data.volumeMm3 || 0;
        const volCm3 = (volVal / 1000.0).toFixed(1);
        const safeName = escapeHtml(b.name);
        html += `<option value="${b.id}">${safeName} (${volCm3} cm³)</option>`;
      });
      select.innerHTML = html;
      select.value = String(selectedBodyForProps);

      select.onchange = function () {
        selectedBodyForProps = parseInt(select.value, 10);
        updatePhysicalPropertiesCard();
      };
    }

    // =============================================================

// Appearance Popover Event Listeners
function setupAppearanceListeners() {
      // CAD Body Appearance & 3D Printing Popover Listeners
      // =============================================================
      const btnCloseColorPopover = document.getElementById('btn-close-color-popover');
      if (btnCloseColorPopover) {
        btnCloseColorPopover.addEventListener('click', () => {
          closeColorPickerPopover();
        });
      }

      const btnResetOrigColor = document.getElementById('btn-reset-orig-color');
      if (btnResetOrigColor) {
        btnResetOrigColor.addEventListener('click', () => {
          if (activeColorPopoverBodyId !== null) {
            resetBodyColor(activeColorPopoverBodyId);
          }
        });
      }

      // Engineering metal and plastic swatches
      document.querySelectorAll('.swatch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (activeColorPopoverBodyId === null) return;
          const color = btn.dataset.color;
          const metal = parseFloat(btn.dataset.metal || '0.4');
          const rough = parseFloat(btn.dataset.rough || '0.3');
          setBodyColor(activeColorPopoverBodyId, color, metal, rough);
        });
      });

      // 3D Printing Material preset buttons
      document.querySelectorAll('.mat-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (activeColorPopoverBodyId === null) return;
          const mat = btn.dataset.mat;
          const density = parseFloat(btn.dataset.density);
          const color = btn.dataset.color;
          const rough = parseFloat(btn.dataset.rough || '0.45');
          setBody3DPrintMaterial(activeColorPopoverBodyId, mat, density, color, rough);
        });
      });

      // Custom color picker input & apply button
      const popoverColorInput = document.getElementById('popover-color-input');
      const popoverColorHexVal = document.getElementById('popover-color-hex-val');
      if (popoverColorInput) {
        popoverColorInput.addEventListener('input', (e) => {
          const val = e.target.value;
          if (popoverColorHexVal) popoverColorHexVal.innerText = val.toUpperCase();
          if (activeColorPopoverBodyId !== null) {
            setBodyColor(activeColorPopoverBodyId, val);
          }
        });
      }

      const btnApplyCustomColor = document.getElementById('btn-apply-custom-color');
      if (btnApplyCustomColor && popoverColorInput) {
        btnApplyCustomColor.addEventListener('click', () => {
          if (activeColorPopoverBodyId !== null) {
            setBodyColor(activeColorPopoverBodyId, popoverColorInput.value);
            showToast(`Applied custom color ${popoverColorInput.value.toUpperCase()}`);
          }
        });
      }

      // Body Opacity Slider
      const popoverOpacitySlider = document.getElementById('popover-opacity-slider');
      if (popoverOpacitySlider) {
        popoverOpacitySlider.addEventListener('input', (e) => {
          if (activeColorPopoverBodyId !== null) {
            setBodyOpacity(activeColorPopoverBodyId, parseInt(e.target.value, 10));
          }
        });
      }

      // Close popover when clicking outside
      window.addEventListener('click', (e) => {
        if (activeColorPopoverBodyId !== null) {
          const popover = document.getElementById('color-picker-popover');
          if (popover && !popover.contains(e.target) && !e.target.closest('.tree-color-swatch')) {
            closeColorPickerPopover();
          }
        }
      });

}

// Window exports
window.positionColorPopover = positionColorPopover;
window.openColorPickerPopover = openColorPickerPopover;
window.closeColorPickerPopover = closeColorPickerPopover;
window.setupAppearanceListeners = setupAppearanceListeners;
