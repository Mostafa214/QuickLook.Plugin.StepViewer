    function toggleUnits() {
      currentUnit = (currentUnit === 'mm') ? 'in' : 'mm';
      const btn = document.getElementById('btn-units');
      if (btn) {
        const span = btn.querySelector('span');
        if (span) {
          span.innerText = currentUnit;
          span.style.color = currentUnit === 'mm' ? '#38bdf8' : '#f59e0b';
        }
      }
      updateBoundingBoxBadge();
      updatePhysicalPropertiesCard();
      if (selectedCadEntities.length > 0) {
        const ents = [...selectedCadEntities];
        clearMeasurement(false);
        ents.forEach(e => handleUnifiedClick(e));
      }
      if (isSectionActive) {
        updateSectionPlane();
      }
    }


/**
 * Engineering Materials Library & Mass Estimation System (v2.0.0 - Full Restored)
 * 20+ metals, plastics, alloys, unit conversions, multi-body vs whole assembly selector.
 */
    // =============================================================
    // Phase 3: Physical Properties & Unit Switching
    // =============================================================
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

    // =============================================================
    // Engineering Materials Library & Mass Estimation System
    // =============================================================
    const standardMaterials = [
      // 3D Printing Filaments & Resins
      { id: 'pla', name: 'PLA (Polylactic Acid)', std: 'Polylactic Acid (3D Printing Plastic / FDM)', density: 1.24, category: '3D Printing' },
      { id: 'petg', name: 'PETG Copolyester', std: 'PETG Glycol Copolyester (3D Printing / FDM)', density: 1.27, category: '3D Printing' },
      { id: 'abs', name: 'ABS Polymer', std: 'Acrylonitrile Butadiene Styrene (3D Printing / ISO 2580)', density: 1.04, category: '3D Printing' },
      { id: 'tpu', name: 'TPU 95A Flexible', std: 'Thermoplastic Polyurethane (3D Printing / Shore 95A)', density: 1.21, category: '3D Printing' },
      { id: 'resin', name: 'Photopolymer Resin', std: 'Standard Photopolymer Resin (SLA / DLP / MSLA)', density: 1.15, category: '3D Printing' },

      // Steels & Ferrous Metals (ASTM / AISI / ISO verified)
      { id: 'steel_1018', name: 'Carbon Steel 1018', std: 'AISI 1018 / ASTM A108', density: 7.85, category: 'Steel' },
      { id: 'steel_a36', name: 'Structural Steel A36', std: 'ASTM A36', density: 7.85, category: 'Steel' },
      { id: 'steel_4140', name: 'Alloy Steel 4140', std: 'AISI 4140 (Cr-Mo)', density: 7.85, category: 'Steel' },
      { id: 'ss_304', name: 'Stainless Steel 304', std: 'AISI 304 / 1.4301', density: 8.00, category: 'Steel' },
      { id: 'ss_316', name: 'Stainless Steel 316L', std: 'AISI 316L / 1.4404', density: 8.00, category: 'Steel' },
      { id: 'tool_d2', name: 'Tool Steel D2', std: 'ASTM A681', density: 7.70, category: 'Steel' },
      { id: 'cast_iron_gray', name: 'Gray Cast Iron', std: 'ASTM A48 Class 30', density: 7.15, category: 'Steel' },
      { id: 'cast_iron_ductile', name: 'Ductile Iron', std: 'ASTM A536 65-45-12', density: 7.10, category: 'Steel' },

      // Aluminum & Light Alloys
      { id: 'al_6061', name: 'Aluminum 6061-T6', std: 'ASTM B221', density: 2.70, category: 'Aluminum' },
      { id: 'al_7075', name: 'Aluminum 7075-T6', std: 'ASTM B209 (Aerospace)', density: 2.81, category: 'Aluminum' },
      { id: 'al_5052', name: 'Aluminum 5052-H32', std: 'ASTM B209 (Marine)', density: 2.68, category: 'Aluminum' },
      { id: 'al_2024', name: 'Aluminum 2024-T3', std: 'ASTM B209', density: 2.78, category: 'Aluminum' },
      { id: 'al_cast_a380', name: 'Cast Aluminum A380', std: 'ASTM B85', density: 2.71, category: 'Aluminum' },
      { id: 'ti_gr5', name: 'Titanium Ti-6Al-4V', std: 'Grade 5 / ASTM B348', density: 4.43, category: 'Light Alloy' },
      { id: 'ti_gr2', name: 'Titanium Pure Gr 2', std: 'Grade 2 / ASTM B348', density: 4.51, category: 'Light Alloy' },
      { id: 'mg_az31b', name: 'Magnesium AZ31B', std: 'ASTM B107', density: 1.77, category: 'Light Alloy' },

      // Copper & Brass
      { id: 'cu_c11000', name: 'Copper Pure C11000', std: 'ASTM B152 (ETP)', density: 8.96, category: 'Copper/Brass' },
      { id: 'brass_c360', name: 'Free-Cutting Brass', std: 'C36000 / ASTM B16', density: 8.50, category: 'Copper/Brass' },
      { id: 'bronze_c510', name: 'Phosphor Bronze C510', std: 'ASTM B103', density: 8.80, category: 'Copper/Brass' },

      // Engineering Plastics & Polymers
      { id: 'nylon_pa6', name: 'Nylon 6 (PA 6)', std: 'ISO 1874', density: 1.14, category: 'Plastic' },
      { id: 'pom_delrin', name: 'POM / Delrin / Acetal', std: 'ISO 9988', density: 1.41, category: 'Plastic' },
      { id: 'pc_lexan', name: 'Polycarbonate (PC)', std: 'Lexan / ISO 7391', density: 1.20, category: 'Plastic' },
      { id: 'peek', name: 'PEEK (High-Temp)', std: 'Polyether ether ketone', density: 1.30, category: 'Plastic' },
      { id: 'ptfe_teflon', name: 'PTFE / Teflon', std: 'ASTM D4894', density: 2.20, category: 'Plastic' },
      { id: 'pp', name: 'Polypropylene (PP)', std: 'ISO 19069', density: 0.90, category: 'Plastic' },
      { id: 'hdpe', name: 'HDPE Polyethylene', std: 'ASTM D4976', density: 0.95, category: 'Plastic' },
      { id: 'pmma_acrylic', name: 'Acrylic / PMMA', std: 'Plexiglass / ISO 8257', density: 1.18, category: 'Plastic' },

      // Composites & Elastomers
      { id: 'cfrp', name: 'Carbon Fiber (CFRP)', std: 'Quasi-isotropic laminate', density: 1.55, category: 'Composite' },
      { id: 'fiberglass_g10', name: 'Fiberglass G10 / FR4', std: 'NEMA G10', density: 1.85, category: 'Composite' },
      { id: 'nbr_rubber', name: 'Nitrile Rubber (NBR)', std: 'ASTM D2000', density: 1.20, category: 'Elastomer' },
      { id: 'silicone', name: 'Silicone Rubber', std: 'FDA 21 CFR 177.2600', density: 1.25, category: 'Elastomer' }
    ];

    let selectedMaterialId = 'al_6061';
    let customMaterials = [];
    let isMaterialsInitialized = false;
    let currentInfillPercent = 20;

    function clampInfill(p) {
      const val = Number(p);
      if (isNaN(val) || val <= 0) return 5;
      return Math.max(5, Math.min(100, Math.round(val)));
    }

    function getInfill() {
      return currentInfillPercent;
    }

    function setInfill(percentage) {
      currentInfillPercent = clampInfill(percentage);
      try {
        localStorage.setItem('stepviewer_infill_percent', currentInfillPercent);
      } catch (e) {}

      // Sync slider & value label
      const slider = document.getElementById('infill-slider');
      if (slider) slider.value = currentInfillPercent;
      const valLabel = document.getElementById('infill-val');
      if (valLabel) valLabel.innerText = `${currentInfillPercent}%`;

      // Sync preset buttons
      const presetBtns = document.querySelectorAll('.btn-preset-infill');
      if (presetBtns) {
        presetBtns.forEach(btn => {
          const p = parseFloat(btn.getAttribute('data-infill'));
          if (p === currentInfillPercent) btn.classList.add('active');
          else btn.classList.remove('active');
        });
      }

      if (typeof updatePhysicalPropertiesCard === 'function') {
        updatePhysicalPropertiesCard();
      }
      return currentInfillPercent;
    }

    function getPrintMetrics(customVolMm3, customDensity, customInfill) {
      const infill = (customInfill !== undefined) ? clampInfill(customInfill) : currentInfillPercent;
      const infillFactor = infill / 100.0;

      let volMm3 = (customVolMm3 !== undefined) ? Number(customVolMm3) : 0;
      if (customVolMm3 === undefined && window.modelPhysicalProps) {
        if (typeof selectedBodyForProps !== 'undefined' && selectedBodyForProps >= 0 && window.modelBodies) {
          const targetBody = window.modelBodies.find(b => b.id === selectedBodyForProps);
          volMm3 = (targetBody && targetBody.data && typeof targetBody.data.volumeMm3 === 'number') 
            ? targetBody.data.volumeMm3 : (window.modelPhysicalProps.volumeMm3 || 0);
        } else {
          volMm3 = window.modelPhysicalProps.volumeMm3 || 0;
        }
      }
      volMm3 = Math.max(0, isNaN(volMm3) ? 0 : volMm3);

      let density = (customDensity !== undefined) ? Number(customDensity) : 0;
      if (customDensity === undefined) {
        const activeMat = (typeof getSelectedMaterial === 'function') ? getSelectedMaterial() : null;
        density = (activeMat && typeof activeMat.density === 'number') ? activeMat.density : 1.24;
      }
      density = Math.max(0, isNaN(density) ? 0 : density);

      const effectiveVolMm3 = volMm3 * infillFactor;
      const effectiveVolCm3 = effectiveVolMm3 / 1000.0;
      const massGrams = effectiveVolCm3 * density;
      const massKg = massGrams / 1000.0;
      const filamentAreaMm2 = Math.PI * Math.pow(1.75 / 2.0, 2);
      const filamentConstant = filamentAreaMm2 * 1000.0; // 2405.281875 mm^3 per linear meter
      const filamentLengthMeters = (effectiveVolMm3 > 0) ? (effectiveVolMm3 / filamentConstant) : 0;
      const spoolFractionPercent = (massGrams / 1000.0) * 100.0; // % of 1kg spool

      return {
        infillPercent: infill,
        effectiveVolMm3: effectiveVolMm3,
        effectiveVolCm3: effectiveVolCm3,
        massGrams: massGrams,
        massKg: massKg,
        filamentLengthMeters: filamentLengthMeters,
        spoolFractionPercent: spoolFractionPercent,
        density: density,
        volumeMm3: volMm3
      };
    }

    function updatePrintEstimator(volMm3) {
      const activeMat = getSelectedMaterial();
      const density = (activeMat && typeof activeMat.density === 'number') ? activeMat.density : 1.24;
      const metrics = getPrintMetrics(volMm3, density, currentInfillPercent);

      const massEl = document.getElementById('print-est-mass');
      const lengthEl = document.getElementById('print-est-length');
      const spoolEl = document.getElementById('print-est-spool');
      const sliderEl = document.getElementById('infill-slider');
      const valLabel = document.getElementById('infill-val');

      if (sliderEl && Number(sliderEl.value) !== currentInfillPercent) {
        sliderEl.value = currentInfillPercent;
      }
      if (valLabel) {
        valLabel.innerText = `${currentInfillPercent}%`;
      }

      if (massEl) {
        massEl.innerText = formatWeightValue(metrics.massGrams);
      }
      if (lengthEl) {
        lengthEl.innerText = metrics.filamentLengthMeters >= 100
          ? `${metrics.filamentLengthMeters.toFixed(1)} m`
          : `${metrics.filamentLengthMeters.toFixed(2)} m`;
      }
      if (spoolEl) {
        spoolEl.innerText = `${metrics.spoolFractionPercent.toFixed(1)}% of 1kg`;
      }

      // Sync preset buttons
      const presetBtns = document.querySelectorAll('.btn-preset-infill');
      if (presetBtns) {
        presetBtns.forEach(btn => {
          const p = parseFloat(btn.getAttribute('data-infill'));
          if (p === currentInfillPercent) btn.classList.add('active');
          else btn.classList.remove('active');
        });
      }

      // Contextual visibility
      const infillSection = document.getElementById('section-infill');
      if (infillSection) {
        const isStl = (typeof window.activeCadFormat === 'undefined' || window.activeCadFormat === 'STL');
        const is3DPrintMat = activeMat && (activeMat.category === '3D Printing');
        infillSection.style.display = (isStl || is3DPrintMat) ? 'block' : 'none';
      }
    }

    function initMaterialsSystem() {
      if (isMaterialsInitialized) return;
      isMaterialsInitialized = true;
      try {
        const raw = localStorage.getItem('stepviewer_custom_materials');
        if (raw) customMaterials = JSON.parse(raw);
        const savedMat = localStorage.getItem('stepviewer_selected_material');
        if (savedMat) {
          selectedMaterialId = savedMat;
        } else if (typeof window.activeCadFormat !== 'undefined' && window.activeCadFormat === 'STL') {
          selectedMaterialId = 'pla';
        }
        const savedInfill = localStorage.getItem('stepviewer_infill_percent');
        if (savedInfill !== null && savedInfill !== undefined) {
          currentInfillPercent = clampInfill(savedInfill);
        }
      } catch (e) {
        customMaterials = [];
      }

      const searchInput = document.getElementById('mat-search');
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          if (modelPhysicalProps) {
            renderMaterialsUI((modelPhysicalProps.volumeMm3 || 0) / 1000.0);
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
          } catch(e) {}

          selectedMaterialId = newMat.id;
          try {
            localStorage.setItem('stepviewer_selected_material', newMat.id);
          } catch(e) {}

          if (nameInput) nameInput.value = '';
          if (densInput) densInput.value = '';
          customForm.style.display = 'none';

          if (modelPhysicalProps) {
            renderMaterialsUI((modelPhysicalProps.volumeMm3 || 0) / 1000.0);
          }
        });
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
        const isStl = (typeof window.activeCadFormat !== 'undefined' && window.activeCadFormat === 'STL');
        const infillFactor = isStl ? (currentInfillPercent / 100.0) : 1.0;
        const massG = volCm3 * infillFactor * activeMat.density;
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
        const delBtn = m.isCustom ? `<button class="btn-mat-del" onclick="deleteCustomMaterial('${m.id}', event)" title="Delete Custom Material">✕</button>` : '';

        html += `
          <div class="mat-item ${isActive ? 'active' : ''}" onclick="selectMaterial('${m.id}')">
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
      try { localStorage.setItem('stepviewer_selected_material', id); } catch(e) {}
      if (modelPhysicalProps) {
        const volMm3 = (selectedBodyForProps >= 0 && window.modelBodies)
          ? ((window.modelBodies.find(b => b.id === selectedBodyForProps)?.data?.volumeMm3) || modelPhysicalProps.volumeMm3 || 0)
          : (modelPhysicalProps.volumeMm3 || 0);
        const volCm3 = volMm3 / 1000.0;
        renderMaterialsUI(volCm3);
        updatePrintEstimator(volMm3);
      }
    }
    window.selectMaterial = selectMaterial;

    function deleteCustomMaterial(id, e) {
      if (e) e.stopPropagation();
      customMaterials = customMaterials.filter(m => m.id !== id);
      try { localStorage.setItem('stepviewer_custom_materials', JSON.stringify(customMaterials)); } catch(e) {}
      if (selectedMaterialId === id) {
        selectedMaterialId = 'al_6061';
      }
      if (modelPhysicalProps) {
        const volMm3 = (selectedBodyForProps >= 0 && window.modelBodies)
          ? ((window.modelBodies.find(b => b.id === selectedBodyForProps)?.data?.volumeMm3) || modelPhysicalProps.volumeMm3 || 0)
          : (modelPhysicalProps.volumeMm3 || 0);
        const volCm3 = volMm3 / 1000.0;
        renderMaterialsUI(volCm3);
        updatePrintEstimator(volMm3);
      }
    }
    window.deleteCustomMaterial = deleteCustomMaterial;

    function updatePhysicalPropertiesCard() {
      if (!modelPhysicalProps) return;
      const volEl = document.getElementById('prop-vol');
      const areaEl = document.getElementById('prop-area');
      const bboxEl = document.getElementById('prop-bbox');

      let volMm3 = modelPhysicalProps.volumeMm3 || 0;
      let areaMm2 = modelPhysicalProps.areaMm2 || 0;
      let bb = modelPhysicalProps.bbox || { x: 0, y: 0, z: 0 };

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
      updatePrintEstimator(volMm3);
    }

    function togglePropsModal(enable) {
      if (window.WorkbenchUI && typeof window.WorkbenchUI.toggleDrawer === 'function') {
        if (enable === true) {
          window.WorkbenchUI.openDrawer('mass');
        } else if (enable === false) {
          if (window.WorkbenchUI.getActiveTab?.() === 'mass') {
            window.WorkbenchUI.closeDrawer();
          }
        } else {
          window.WorkbenchUI.toggleDrawer('mass');
        }
        return;
      }
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

    // =============================================================

// Materials & Physical Properties Event Listeners
function setupMaterialsListeners() {
      // Note: #btn-measure toolbar click is managed centrally by WorkbenchUI

      const btnClearMeasure = document.getElementById('btn-clear-measure');
      if (btnClearMeasure) {
        btnClearMeasure.addEventListener('click', () => {
          if (typeof window.clearActiveMeasurement === 'function') {
            window.clearActiveMeasurement(true);
          } else if (typeof clearMeasurement === 'function') {
            clearMeasurement(false);
          }
        });
      }

      const btnCopyMeasure = document.getElementById('btn-copy-measure');
      if (btnCopyMeasure) {
        btnCopyMeasure.addEventListener('click', () => {
          if (!currentMeasuredValue) return;
          navigator.clipboard.writeText(currentMeasuredValue).then(() => {
            const copySpan = document.getElementById('copy-text');
            if (copySpan) {
              const orig = copySpan.innerText;
              copySpan.innerText = 'Copied! ✓';
              btnCopyMeasure.style.color = '#38bdf8';
              setTimeout(() => {
                copySpan.innerText = orig;
                btnCopyMeasure.style.color = '';
              }, 1500);
            }
          }).catch(err => {
            console.warn('Clipboard write failed:', err);
          });
        });
      }

      // Physical Properties Modal Close
      // Note: #btn-props toolbar click is managed centrally by WorkbenchUI
      const btnCloseProps = document.getElementById('btn-close-props');
      if (btnCloseProps) {
        btnCloseProps.addEventListener('click', () => {
          if (window.WorkbenchUI?.closeDrawer) window.WorkbenchUI.closeDrawer();
          else togglePropsModal(false);
        });
      }

      // Units Toggle (mm / in)
      const btnUnits = document.getElementById('btn-units');
      if (btnUnits) {
        btnUnits.addEventListener('click', () => toggleUnits());
      }

      // CAD Assembly Tree Controls
      // Note: #btn-tree toolbar click is managed centrally by WorkbenchUI
      const btnCloseTree = document.getElementById('btn-close-tree');
      if (btnCloseTree) {
        btnCloseTree.addEventListener('click', () => {
          if (window.WorkbenchUI?.closeDrawer) window.WorkbenchUI.closeDrawer();
          else toggleTreePanel(false);
        });
      }
      const btnTreeShowAll = document.getElementById('btn-tree-showall');
      if (btnTreeShowAll) {
        btnTreeShowAll.addEventListener('click', () => {
          modelBodies.forEach(b => setBodyVisibility(b.id, true));
        });
      }
      const btnTreeSolidAll = document.getElementById('btn-tree-solidall');
      if (btnTreeSolidAll) {
        btnTreeSolidAll.addEventListener('click', () => {
          modelBodies.forEach(b => setBodyGhostMode(b.id, false));
        });
      }
      const btnTreeResetIso = document.getElementById('btn-tree-resetiso');
      if (btnTreeResetIso) {
        btnTreeResetIso.addEventListener('click', () => {
          resetBodyIsolation();
        });
      }
      const btnExitIso = document.getElementById('btn-exit-isolate');
      if (btnExitIso) {
        btnExitIso.addEventListener('click', () => {
          resetBodyIsolation();
        });
      }
      const btnTreeAutoColor = document.getElementById('btn-tree-autocolor');
      if (btnTreeAutoColor) {
        btnTreeAutoColor.addEventListener('click', () => {
          autoColorizeAssembly();
        });
      }

      // Infill Slider and Preset Listeners (Milestone 4)
      const infillSlider = document.getElementById('infill-slider');
      if (infillSlider) {
        const handleInfillInput = (e) => {
          const val = parseFloat(e && e.target ? e.target.value : infillSlider.value);
          setInfill(val);
        };
        infillSlider.addEventListener('input', handleInfillInput);
        infillSlider.addEventListener('change', handleInfillInput);
      }

      const presetBtns = document.querySelectorAll('.btn-preset-infill');
      if (presetBtns) {
        presetBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            const p = parseFloat(btn.getAttribute('data-infill'));
            if (!isNaN(p)) {
              setInfill(p);
            }
          });
        });
      }

      // =============================================================
}

// Window exports
window.formatDim = formatDim;
window.formatArea = formatArea;

function formatVol(volMm3) {
  if (currentUnit === 'in') {
    const volIn3 = (volMm3 || 0) / 16387.064;
    return `${volIn3.toFixed(3)} in³`;
  }
  const volCm3 = (volMm3 || 0) / 1000.0;
  return `${volCm3.toFixed(2)} cm³`;
}

function formatMass(massKg) {
  if (currentUnit === 'in') {
    const massLb = (massKg || 0) * 2.20462;
    return `${massLb.toFixed(2)} lb`;
  }
  return (massKg || 0) >= 1 ? `${(massKg || 0).toFixed(2)} kg` : `${((massKg || 0) * 1000).toFixed(1)} g`;
}

window.formatVol = formatVol;
window.formatMass = formatMass;
window.toggleUnits = toggleUnits;
window.togglePropsCard = togglePropsModal;
window.togglePropsModal = togglePropsModal;
window.updatePhysicalPropertiesCard = updatePhysicalPropertiesCard;
window.updateActiveMaterialSummary = updatePhysicalPropertiesCard;
window.recalculateAllMassProperties = updatePhysicalPropertiesCard;
window.setupMaterialsListeners = setupMaterialsListeners;
window.clampInfill = clampInfill;
window.setInfill = setInfill;
window.getInfill = getInfill;
window.getPrintMetrics = getPrintMetrics;

// Public Materials Engine API
window.MaterialsEngine = {
  getTotalMassKg: function() {
    if (!window.modelPhysicalProps) return 0;
    const volMm3 = window.modelPhysicalProps.volumeMm3 || 0;
    const volCm3 = volMm3 / 1000.0;
    const activeMat = (typeof getSelectedMaterial === 'function') ? getSelectedMaterial() : { density: 2.70 };
    const density = activeMat ? activeMat.density : 2.70;
    const isStl = (typeof window.activeCadFormat !== 'undefined' && window.activeCadFormat === 'STL');
    const infillFactor = isStl ? (currentInfillPercent / 100.0) : 1.0;
    return (volCm3 * infillFactor * density) / 1000.0;
  },
  getSelectedMaterialName: function() {
    const mat = (typeof getSelectedMaterial === 'function') ? getSelectedMaterial() : null;
    return mat ? mat.name : 'Structural Alloy / As-Machined';
  },
  getSelectedMaterial: function() {
    return (typeof getSelectedMaterial === 'function') ? getSelectedMaterial() : null;
  },
  getAllMaterials: function() {
    return (typeof getAllMaterials === 'function') ? getAllMaterials() : standardMaterials;
  },
  selectMaterial: selectMaterial,
  setInfill: setInfill,
  getInfill: getInfill,
  getPrintMetrics: getPrintMetrics,
  clampInfill: clampInfill
};
