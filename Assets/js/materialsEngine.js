/**
 * Engineering Materials Library & Mass Estimation System
 * Comprehensive physical properties calculation and standard engineering materials database
 */
(function () {
  let currentUnit = 'mm'; // 'mm' | 'in'
  let isPropsActive = false;
  let selectedMaterialId = 'al_6061';
  let customMaterials = [];
  let isMaterialsInitialized = false;

  function formatDim(mmVal) {
    if (typeof mmVal !== 'number' || isNaN(mmVal)) return '0.00 mm';
    if (currentUnit === 'in') {
      return `${(mmVal / 25.4).toFixed(3)} in`;
    }
    return `${mmVal.toFixed(2)} mm`;
  }
  const formatLength = formatDim;

  function formatCoord(mmVal) {
    if (typeof mmVal !== 'number' || isNaN(mmVal)) return '0.00';
    if (currentUnit === 'in') {
      return (mmVal / 25.4).toFixed(3);
    }
    return mmVal.toFixed(2);
  }

  function formatCircleDim(diameter, radius) {
    const d = (typeof diameter === 'number' && !isNaN(diameter)) ? diameter : 0;
    const r = (typeof radius === 'number' && !isNaN(radius)) ? radius : (d / 2);
    if (currentUnit === 'in') {
      return `Ø ${(d / 25.4).toFixed(3)} in (R ${(r / 25.4).toFixed(3)})`;
    }
    return `Ø ${d.toFixed(2)} mm (R ${r.toFixed(2)})`;
  }

  function formatArea(areaMm2) {
    if (typeof areaMm2 !== 'number' || isNaN(areaMm2) || areaMm2 <= 0) return '0.00 mm²';
    if (currentUnit === 'in') {
      return `${(areaMm2 / 645.16).toFixed(3)} in²`;
    }
    if (areaMm2 >= 100) {
      return `${areaMm2.toFixed(1)} mm² (${(areaMm2 / 100).toFixed(2)} cm²)`;
    }
    return `${areaMm2.toFixed(2)} mm²`;
  }

  const standardMaterials = [
    { id: 'steel_1018', name: 'Carbon Steel 1018', std: 'AISI 1018 / ASTM A108', density: 7.85, category: 'Steel' },
    { id: 'steel_a36', name: 'Structural Steel A36', std: 'ASTM A36', density: 7.85, category: 'Steel' },
    { id: 'steel_4140', name: 'Alloy Steel 4140', std: 'AISI 4140 (Cr-Mo)', density: 7.85, category: 'Steel' },
    { id: 'ss_304', name: 'Stainless Steel 304', std: 'AISI 304 / 1.4301', density: 8.00, category: 'Steel' },
    { id: 'ss_316', name: 'Stainless Steel 316L', std: 'AISI 316L / 1.4404', density: 8.00, category: 'Steel' },
    { id: 'tool_d2', name: 'Tool Steel D2', std: 'ASTM A681', density: 7.70, category: 'Steel' },
    { id: 'cast_iron_gray', name: 'Gray Cast Iron', std: 'ASTM A48 Class 30', density: 7.15, category: 'Steel' },
    { id: 'cast_iron_ductile', name: 'Ductile Iron', std: 'ASTM A536 65-45-12', density: 7.10, category: 'Steel' },
    { id: 'al_6061', name: 'Aluminum 6061-T6', std: 'ASTM B221', density: 2.70, category: 'Aluminum' },
    { id: 'al_7075', name: 'Aluminum 7075-T6', std: 'ASTM B209 (Aerospace)', density: 2.81, category: 'Aluminum' },
    { id: 'al_5052', name: 'Aluminum 5052-H32', std: 'ASTM B209 (Marine)', density: 2.68, category: 'Aluminum' },
    { id: 'al_2024', name: 'Aluminum 2024-T3', std: 'ASTM B209', density: 2.78, category: 'Aluminum' },
    { id: 'al_cast_a380', name: 'Cast Aluminum A380', std: 'ASTM B85', density: 2.71, category: 'Aluminum' },
    { id: 'ti_gr5', name: 'Titanium Ti-6Al-4V', std: 'Grade 5 / ASTM B348', density: 4.43, category: 'Light Alloy' },
    { id: 'ti_gr2', name: 'Titanium Pure Gr 2', std: 'Grade 2 / ASTM B348', density: 4.51, category: 'Light Alloy' },
    { id: 'mg_az31b', name: 'Magnesium AZ31B', std: 'ASTM B107', density: 1.77, category: 'Light Alloy' },
    { id: 'cu_c11000', name: 'Copper Pure C11000', std: 'ASTM B152 (ETP)', density: 8.96, category: 'Copper/Brass' },
    { id: 'brass_c360', name: 'Free-Cutting Brass', std: 'C36000 / ASTM B16', density: 8.50, category: 'Copper/Brass' },
    { id: 'bronze_c510', name: 'Phosphor Bronze C510', std: 'ASTM B103', density: 8.80, category: 'Copper/Brass' },
    { id: 'pla', name: 'PLA (3D Printing)', std: 'Polylactic Acid', density: 1.24, category: 'Plastic' },
    { id: 'abs', name: 'ABS Polymer', std: 'ISO 2580', density: 1.04, category: 'Plastic' },
    { id: 'petg', name: 'PETG Glycol Copolyester', std: 'ASTM D5227', density: 1.27, category: 'Plastic' },
    { id: 'nylon_pa6', name: 'Nylon 6 (PA 6)', std: 'ISO 1874', density: 1.14, category: 'Plastic' },
    { id: 'pom_delrin', name: 'POM / Delrin / Acetal', std: 'ISO 9988', density: 1.41, category: 'Plastic' },
    { id: 'pc_lexan', name: 'Polycarbonate (PC)', std: 'Lexan / ISO 7391', density: 1.20, category: 'Plastic' },
    { id: 'peek', name: 'PEEK (High-Temp)', std: 'Polyether ether ketone', density: 1.30, category: 'Plastic' },
    { id: 'ptfe_teflon', name: 'PTFE / Teflon', std: 'ASTM D4894', density: 2.20, category: 'Plastic' },
    { id: 'pp', name: 'Polypropylene (PP)', std: 'ISO 19069', density: 0.90, category: 'Plastic' },
    { id: 'hdpe', name: 'HDPE Polyethylene', std: 'ASTM D4976', density: 0.95, category: 'Plastic' },
    { id: 'pmma_acrylic', name: 'Acrylic / PMMA', std: 'Plexiglass / ISO 8257', density: 1.18, category: 'Plastic' },
    { id: 'cfrp', name: 'Carbon Fiber (CFRP)', std: 'Quasi-isotropic laminate', density: 1.55, category: 'Composite' },
    { id: 'fiberglass_g10', name: 'Fiberglass G10 / FR4', std: 'NEMA G10', density: 1.85, category: 'Composite' },
    { id: 'nbr_rubber', name: 'Nitrile Rubber (NBR)', std: 'ASTM D2000', density: 1.20, category: 'Elastomer' },
    { id: 'silicone', name: 'Silicone Rubber', std: 'FDA 21 CFR 177.2600', density: 1.25, category: 'Elastomer' }
  ];

  function initMaterialsSystem() {
    if (isMaterialsInitialized) return;
    isMaterialsInitialized = true;
    try {
      const raw = localStorage.getItem('stepviewer_custom_materials');
      if (raw) customMaterials = JSON.parse(raw);
      const savedMat = localStorage.getItem('stepviewer_selected_material');
      if (savedMat) selectedMaterialId = savedMat;
    } catch (e) {
      customMaterials = [];
    }

    const searchInput = document.getElementById('mat-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (window.modelPhysicalProps) {
          renderMaterialsUI((window.modelPhysicalProps.volumeMm3 || 0) / 1000.0);
        }
      });
    }

    const btnToggle = document.getElementById('btn-toggle-custom');
    const customForm = document.getElementById('custom-mat-form');
    if (btnToggle && customForm) {
      btnToggle.addEventListener('click', () => {
        customForm.style.display = (customForm.style.display === 'none' || !customForm.style.display) ? 'block' : 'none';
      });
    }

    const btnCancel = document.getElementById('btn-cancel-custom');
    if (btnCancel && customForm) {
      btnCancel.addEventListener('click', () => { customForm.style.display = 'none'; });
    }

    const btnSave = document.getElementById('btn-save-custom');
    if (btnSave && customForm) {
      btnSave.addEventListener('click', () => {
        const nameInput = document.getElementById('custom-mat-name');
        const densInput = document.getElementById('custom-mat-density');
        const name = nameInput ? nameInput.value.trim() : '';
        const dens = densInput ? parseFloat(densInput.value) : 0;

        if (!name || isNaN(dens) || dens <= 0) {
          alert('Please enter a valid material name and positive density in g/cm³.');
          return;
        }

        const newMat = {
          id: 'custom_' + Date.now(),
          name: name,
          std: 'Custom User Defined',
          density: dens,
          isCustom: true
        };

        customMaterials.unshift(newMat);
        try {
          localStorage.setItem('stepviewer_custom_materials', JSON.stringify(customMaterials));
        } catch (e) {}

        selectedMaterialId = newMat.id;
        try {
          localStorage.setItem('stepviewer_selected_material', newMat.id);
        } catch (e) {}

        if (nameInput) nameInput.value = '';
        if (densInput) densInput.value = '';
        customForm.style.display = 'none';

        if (window.modelPhysicalProps) {
          renderMaterialsUI((window.modelPhysicalProps.volumeMm3 || 0) / 1000.0);
        }
      });
    }

    const btnClose = document.getElementById('btn-close-props');
    if (btnClose) {
      btnClose.addEventListener('click', () => togglePropsModal(false));
    }
  }

  function getAllMaterials() {
    return [...customMaterials, ...standardMaterials];
  }

  function getSelectedMaterial() {
    const all = getAllMaterials();
    return all.find(m => m.id === selectedMaterialId) || all[0];
  }

  function formatWeightValue(grams) {
    if (currentUnit === 'mm') {
      return grams >= 1000 ? `${(grams / 1000).toFixed(3)} kg` : `${grams.toFixed(1)} g`;
    } else {
      const lb = grams * 0.00220462;
      return lb < 1.0 ? `${(lb * 16).toFixed(2)} oz` : `${lb.toFixed(2)} lb`;
    }
  }

  function formatDensityValue(gPerCm3) {
    if (currentUnit === 'mm') {
      return `${gPerCm3.toFixed(2)} g/cm³`;
    } else {
      const lbPerCuIn = gPerCm3 * 0.036127;
      return `${lbPerCuIn.toFixed(3)} lb/in³`;
    }
  }

  function renderMaterialsUI(volCm3) {
    initMaterialsSystem();

    const activeMat = getSelectedMaterial();
    const bannerName = document.getElementById('active-mat-name');
    const bannerDens = document.getElementById('active-mat-density');
    const bannerWeight = document.getElementById('active-mat-weight');

    if (activeMat && bannerName && bannerDens && bannerWeight) {
      bannerName.innerText = activeMat.name;
      bannerDens.innerText = formatDensityValue(activeMat.density);
      const massG = volCm3 * activeMat.density;
      bannerWeight.innerText = formatWeightValue(massG);
    }

    const searchInput = document.getElementById('mat-search');
    const term = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const listEl = document.getElementById('mat-list');
    if (!listEl) return;

    const all = getAllMaterials();
    const filtered = all.filter(m =>
      m.name.toLowerCase().includes(term) ||
      (m.std && m.std.toLowerCase().includes(term)) ||
      (m.category && m.category.toLowerCase().includes(term))
    );

    let html = '';
    filtered.forEach(m => {
      const massG = volCm3 * m.density;
      const wtStr = formatWeightValue(massG);
      const isActive = (m.id === selectedMaterialId);
      const customBadge = m.isCustom ? '<span class="mat-tag-custom">Custom</span>' : '';
      const delBtn = m.isCustom ? `<button class="btn-mat-del" onclick="MaterialsEngine.deleteCustomMaterial('${m.id}', event)" title="Delete Custom Material">✕</button>` : '';

      html += `
        <div class="mat-item ${isActive ? 'active' : ''}" onclick="MaterialsEngine.selectMaterial('${m.id}')">
          <div class="mat-item-info">
            <div class="mat-item-name">${m.name} ${customBadge}</div>
            <div class="mat-item-std">${m.std} &bull; ${formatDensityValue(m.density)}</div>
          </div>
          <div class="mat-item-right">
            <div class="mat-item-weight">${wtStr}</div>
            ${delBtn}
          </div>
        </div>
      `;
    });

    if (filtered.length === 0) {
      html = '<div style="color:#64748b; font-size:11px; text-align:center; padding:12px;">No matching materials found</div>';
    }

    listEl.innerHTML = html;
  }

  function selectMaterial(id) {
    selectedMaterialId = id;
    try { localStorage.setItem('stepviewer_selected_material', id); } catch (e) {}
    if (window.modelPhysicalProps) {
      const volCm3 = (window.modelPhysicalProps.volumeMm3 || 0) / 1000.0;
      renderMaterialsUI(volCm3);
    }
  }

  function deleteCustomMaterial(id, e) {
    if (e) e.stopPropagation();
    customMaterials = customMaterials.filter(m => m.id !== id);
    try { localStorage.setItem('stepviewer_custom_materials', JSON.stringify(customMaterials)); } catch (e) {}
    if (selectedMaterialId === id) {
      selectedMaterialId = 'al_6061';
    }
    if (window.modelPhysicalProps) {
      const volCm3 = (window.modelPhysicalProps.volumeMm3 || 0) / 1000.0;
      renderMaterialsUI(volCm3);
    }
  }

  function updatePhysicalPropertiesCard() {
    if (!window.modelPhysicalProps) return;
    const volEl = document.getElementById('prop-vol');
    const areaEl = document.getElementById('prop-area');
    const bboxEl = document.getElementById('prop-bbox');

    let volMm3 = window.modelPhysicalProps.volumeMm3 || 0;
    let areaMm2 = window.modelPhysicalProps.areaMm2 || 0;
    let bb = window.modelPhysicalProps.bbox || { x: 0, y: 0, z: 0 };

    const selectedBodyForProps = window.selectedBodyForProps !== undefined ? window.selectedBodyForProps : -1;
    const modelBodies = window.modelBodies || [];

    if (selectedBodyForProps >= 0) {
      const targetBody = modelBodies.find(b => b.id === selectedBodyForProps);
      if (targetBody && targetBody.data) {
        volMm3 = targetBody.data.volumeMm3 || 0;
        areaMm2 = targetBody.data.areaMm2 || 0;
        if (targetBody.data.bbox && targetBody.data.bbox.size) {
          bb = { x: targetBody.data.bbox.size[0], y: targetBody.data.bbox.size[1], z: targetBody.data.bbox.size[2] };
        }
      }
    }

    const volCm3 = volMm3 / 1000.0;
    const areaCm2 = areaMm2 / 100.0;

    if (currentUnit === 'mm') {
      if (volEl) volEl.innerText = `${volCm3.toFixed(2)} cm³ (${Math.round(volMm3).toLocaleString()} mm³)`;
      if (areaEl) areaEl.innerText = `${areaCm2.toFixed(1)} cm² (${Math.round(areaMm2).toLocaleString()} mm²)`;
      if (bboxEl) bboxEl.innerText = `${bb.x.toFixed(1)} × ${bb.y.toFixed(1)} × ${bb.z.toFixed(1)} mm`;
    } else {
      const inX = bb.x / 25.4;
      const inY = bb.y / 25.4;
      const inZ = bb.z / 25.4;
      const volCuIn = volMm3 / 16387.064;
      const areaSqIn = areaMm2 / 645.16;

      if (volEl) volEl.innerText = `${volCuIn.toFixed(2)} in³`;
      if (areaEl) areaEl.innerText = `${areaSqIn.toFixed(2)} in²`;
      if (bboxEl) bboxEl.innerText = `${inX.toFixed(2)} × ${inY.toFixed(2)} × ${inZ.toFixed(2)} in`;
    }

    renderMaterialsUI(volCm3);
  }

  function togglePropsModal(enable) {
    isPropsActive = (enable !== undefined) ? enable : !isPropsActive;
    const card = document.getElementById('props-card');
    const btn = document.getElementById('btn-props');
    if (isPropsActive) {
      if (card) card.style.display = 'flex';
      if (btn) btn.classList.add('active');
      updatePhysicalPropertiesCard();
    } else {
      if (card) card.style.display = 'none';
      if (btn) btn.classList.remove('active');
    }
  }

  function toggleUnits() {
    currentUnit = currentUnit === 'mm' ? 'in' : 'mm';
    window.currentUnit = currentUnit;
    const btn = document.getElementById('btn-units');
    if (btn) {
      const span = btn.querySelector('span');
      if (span) {
        span.innerText = currentUnit;
        span.style.color = currentUnit === 'mm' ? '#38bdf8' : '#f59e0b';
      }
    }
    if (typeof window.updateBoundingBoxBadge === 'function') {
      window.updateBoundingBoxBadge();
    }
    updatePhysicalPropertiesCard();
    if (window.selectedCadEntities && window.selectedCadEntities.length > 0 && typeof window.handleUnifiedClick === 'function') {
      const ents = [...window.selectedCadEntities];
      if (typeof window.clearMeasurement === 'function') window.clearMeasurement(false);
      ents.forEach(e => window.handleUnifiedClick(e));
    }
    if (window.isSectionActive && typeof window.updateSectionPlane === 'function') {
      window.updateSectionPlane();
    }
  }

  function updatePropsBodySelect() {
    const row = document.getElementById('props-body-row');
    const select = document.getElementById('props-body-select');
    if (!row || !select) return;
    const modelBodies = window.modelBodies || [];
    if (modelBodies.length <= 1) {
      row.style.display = 'none';
      window.selectedBodyForProps = -1;
      return;
    }
    row.style.display = 'block';
    let html = `<option value="-1">Entire Assembly (Combined ${modelBodies.length} Bodies)</option>`;
    modelBodies.forEach(b => {
      const volCm3 = ((b.data?.volumeMm3 || 0) / 1000.0).toFixed(1);
      html += `<option value="${b.id}">${b.name} (${volCm3} cm³)</option>`;
    });
    select.innerHTML = html;
    select.value = String(window.selectedBodyForProps !== undefined ? window.selectedBodyForProps : -1);
    select.onchange = function () {
      window.selectedBodyForProps = parseInt(select.value, 10);
      updatePhysicalPropertiesCard();
    };
  }

  function setupUI() {
    initMaterialsSystem();
    document.getElementById('btn-props')?.addEventListener('click', () => togglePropsModal());
    document.getElementById('btn-units')?.addEventListener('click', () => toggleUnits());
    document.getElementById('btn-close-props')?.addEventListener('click', () => togglePropsModal(false));
  }

  const MaterialsEngine = {
    formatDim,
    formatLength,
    formatCoord,
    formatCircleDim,
    formatArea,
    formatWeightValue,
    formatDensityValue,
    standardMaterials,
    initMaterialsSystem,
    getAllMaterials,
    getSelectedMaterial,
    renderMaterialsUI,
    selectMaterial,
    deleteCustomMaterial,
    updatePhysicalPropertiesCard,
    togglePropsModal,
    toggleUnits,
    updatePropsBodySelect,
    setupUI,
    getUnit: () => currentUnit,
    setUnit: (u) => { currentUnit = u; window.currentUnit = u; }
  };

  window.MaterialsEngine = MaterialsEngine;
  window.formatDim = formatDim;
  window.formatLength = formatLength;
  window.formatCoord = formatCoord;
  window.formatCircleDim = formatCircleDim;
  window.formatArea = formatArea;
  window.selectMaterial = selectMaterial;
  window.deleteCustomMaterial = deleteCustomMaterial;
  window.togglePropsModal = togglePropsModal;
  window.toggleUnits = toggleUnits;
  window.updatePhysicalPropertiesCard = updatePhysicalPropertiesCard;
  window.updatePropsBodySelect = updatePropsBodySelect;
  window.currentUnit = currentUnit;
})();
