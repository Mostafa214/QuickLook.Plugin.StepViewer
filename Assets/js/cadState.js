var APP_CURRENT_VERSION = "v3.0.0";
/**
 * QuickLook CAD Studio - Shared Global Workbench State (v2.0.0)
 * Global namespace definitions providing zero-friction inter-module communication.
 */
var scene = null;
var camera = null;
var renderer = null;
var controls = null;
var gridHelper = null;
var studioEnvTexture = null;
var modelGroup = new THREE.Group();
var modelBodies = [];
var selectedBodyId = null;
var previewBodyId = null;
var isolatedBodyId = null;
var isTreeActive = false;
var selectedBodyForProps = -1;
var selectedFaceGroup = null;
var previewFaceGroup = null;
var selectedFaceInfo = null;
var faceHighlightMesh = null;

// Cross-Section View State
var isSectionActive = false;
var sectionAxis = 'x';
var sectionFlipped = false;
var isSectionCappingActive = true;
var isSectionPlaneHelperActive = true;
var sectionPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
var sectionBox = new THREE.Box3();
var sectionStencilGroup = new THREE.Group();
var sectionCapMesh = null;
var sectionPlaneHelperMesh = null;
var sectionGizmoMesh = null;
var isDraggingSectionGizmo = false;
var isSectionGizmoHovered = false;
var sectionGizmoMatNormal = null;
var sectionGizmoMatHover = null;

// Smart Measure State
var isMeasureActive = false;
var measurePoints = [];
var measureGroup = new THREE.Group();
var snapIndicator = null;
var rubberbandLine = null;
var modelEdgeFeatures = [];
var modelCadVertices = [];
var hoverEdgeMesh = null;
var currentHoverTarget = null;
var selectedCadEntities = [];
var currentMeasuredValue = '';
var isPropsActive = false;
var currentUnit = 'mm';
var modelPhysicalProps = null;

// Multi-Unit Support (Metric: mm, cm, m | Imperial: in, ft)
var SUPPORTED_UNITS = ['mm', 'cm', 'm', 'in', 'ft'];
var UNIT_META = {
  mm: {
    id: 'mm',
    label: 'mm',
    badge: 'MM',
    fullName: 'MILLIMETERS',
    system: 'metric',
    factor: 1,
    decimals: 2,
    areaDecimals: 2,
    volumeDecimals: 1,
    step: '0.5',
    color: '#38bdf8'
  },
  cm: {
    id: 'cm',
    label: 'cm',
    badge: 'CM',
    fullName: 'CENTIMETERS',
    system: 'metric',
    factor: 0.1,
    decimals: 2,
    areaDecimals: 2,
    volumeDecimals: 2,
    step: '0.1',
    color: '#22d3ee'
  },
  m: {
    id: 'm',
    label: 'm',
    badge: 'M',
    fullName: 'METERS',
    system: 'metric',
    factor: 0.001,
    decimals: 4,
    areaDecimals: 4,
    volumeDecimals: 6,
    step: '0.001',
    color: '#34d399'
  },
  in: {
    id: 'in',
    label: 'in',
    badge: 'IN',
    fullName: 'INCHES',
    system: 'imperial',
    factor: 1 / 25.4,
    decimals: 3,
    areaDecimals: 3,
    volumeDecimals: 3,
    step: '0.01',
    color: '#f59e0b'
  },
  ft: {
    id: 'ft',
    label: 'ft',
    badge: 'FT',
    fullName: 'FEET',
    system: 'imperial',
    factor: 1 / 304.8,
    decimals: 4,
    areaDecimals: 4,
    volumeDecimals: 4,
    step: '0.005',
    color: '#fb923c'
  }
};

function _resolveUnitId(unit) {
  let raw = unit;
  if (!raw) {
    if (typeof window !== 'undefined' && typeof window.currentUnit === 'string') {
      raw = window.currentUnit;
    } else if (typeof currentUnit === 'string') {
      raw = currentUnit;
    }
  }
  const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : 'mm';
  return UNIT_META[normalized] ? normalized : 'mm';
}

function getUnitMeta(unit) {
  return UNIT_META[_resolveUnitId(unit)];
}

function convertFromMm(mm, unit) {
  const meta = getUnitMeta(unit);
  const n = Number(mm);
  if (!isFinite(n)) return 0;
  return n * meta.factor;
}

function convertToMm(val, unit) {
  const meta = getUnitMeta(unit);
  const n = Number(val);
  if (!isFinite(n)) return 0;
  return n / meta.factor;
}

function formatLength(mm, unit) {
  const meta = getUnitMeta(unit);
  const n = Number(mm);
  const val = isFinite(n) ? (n * meta.factor) : 0;
  return `${val.toFixed(meta.decimals)} ${meta.label}`;
}

function formatArea(mm2, unit) {
  const meta = getUnitMeta(unit);
  const n = Number(mm2);
  const val = (isFinite(n) && n > 0) ? (n * meta.factor * meta.factor) : 0;
  if (meta.id === 'mm' && val >= 100) {
    return `${val.toFixed(1)} mm² (${(val / 100).toFixed(2)} cm²)`;
  }
  return `${val.toFixed(meta.areaDecimals)} ${meta.label}²`;
}

function formatVolume(mm3, unit) {
  const meta = getUnitMeta(unit);
  const n = Number(mm3);
  const val = (isFinite(n) && n > 0) ? (n * Math.pow(meta.factor, 3)) : 0;
  return `${val.toFixed(meta.volumeDecimals)} ${meta.label}³`;
}

function setCurrentUnit(unit) {
  const next = _resolveUnitId(unit);
  currentUnit = next;
  if (typeof window !== 'undefined') {
    window.currentUnit = next;
  }
  return next;
}

function cycleCurrentUnit() {
  const cur = _resolveUnitId();
  const idx = SUPPORTED_UNITS.indexOf(cur);
  const next = SUPPORTED_UNITS[(idx + 1) % SUPPORTED_UNITS.length];
  return setCurrentUnit(next);
}

// Exploded Assembly State
var currentExplodePercent = 0;
var isExplodeTrailsActive = true;
var explodeTrailsGroup = new THREE.Group();
var explodeAnimId = null;
var explodeAnchorBodyId = null;
var isExplodeInitialized = false;
var explodeFrameState = null;

// User Preferences Persistence (v1)
var CAD_PREFS_STORAGE_KEY = 'quicklook_cad_prefs_v1';
var DEFAULT_CAD_PREFS = {
  defaultUnit: 'mm',
  showHlrEdges: true,
  defaultCameraMode: 'ortho',
  theme: 'dark'
};

function sanitizeCadPreferences(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  let fallbackTheme = DEFAULT_CAD_PREFS.theme;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const legacyTheme = localStorage.getItem('quicklook_stp_theme');
      if (legacyTheme === 'light' || legacyTheme === 'dark') {
        fallbackTheme = legacyTheme;
      }
    }
  } catch (e) {}

  return {
    defaultUnit: SUPPORTED_UNITS.includes(src.defaultUnit) ? src.defaultUnit : DEFAULT_CAD_PREFS.defaultUnit,
    showHlrEdges: (typeof src.showHlrEdges === 'boolean') ? src.showHlrEdges : DEFAULT_CAD_PREFS.showHlrEdges,
    defaultCameraMode: (src.defaultCameraMode === 'persp' || src.defaultCameraMode === 'ortho') ? src.defaultCameraMode : DEFAULT_CAD_PREFS.defaultCameraMode,
    theme: (src.theme === 'light' || src.theme === 'dark') ? src.theme : fallbackTheme
  };
}

function loadCadPreferences() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) {
      return sanitizeCadPreferences(null);
    }
    const raw = localStorage.getItem(CAD_PREFS_STORAGE_KEY);
    if (!raw) {
      return sanitizeCadPreferences(null);
    }
    const parsed = JSON.parse(raw);
    return sanitizeCadPreferences(parsed);
  } catch (e) {
    return sanitizeCadPreferences(null);
  }
}

function saveCadPreferences(partial) {
  const current = loadCadPreferences();
  const next = sanitizeCadPreferences(Object.assign({}, current, (partial && typeof partial === 'object') ? partial : {}));
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(CAD_PREFS_STORAGE_KEY, JSON.stringify(next));
      if (next.theme === 'light' || next.theme === 'dark') {
        localStorage.setItem('quicklook_stp_theme', next.theme);
      }
    }
  } catch (e) {}
  return next;
}

function getCadPreferences() {
  return loadCadPreferences();
}

// Synchronize into window object
window.scene = scene;
window.camera = camera;
window.controls = controls;
window.renderer = renderer;
window.modelGroup = modelGroup;
window.modelBodies = modelBodies;
window.measureGroup = measureGroup;
window.explodeTrailsGroup = explodeTrailsGroup;
window.sectionStencilGroup = sectionStencilGroup;
window.sectionPlane = sectionPlane;
window.sectionBox = sectionBox;
window.currentUnit = currentUnit;
window.SUPPORTED_UNITS = SUPPORTED_UNITS;
window.UNIT_META = UNIT_META;
window.CadState = {
  SUPPORTED_UNITS,
  UNIT_META,
  getUnitMeta,
  convertFromMm,
  convertToMm,
  formatLength,
  formatArea,
  formatVolume,
  setCurrentUnit,
  cycleCurrentUnit
};
window.getUnitMeta = getUnitMeta;
window.convertFromMm = convertFromMm;
window.convertToMm = convertToMm;
window.formatLength = formatLength;
window.formatArea = formatArea;
window.formatVolume = formatVolume;
window.setCurrentUnit = setCurrentUnit;
window.cycleCurrentUnit = cycleCurrentUnit;
window.CadPrefs = {
  STORAGE_KEY: CAD_PREFS_STORAGE_KEY,
  defaults: Object.assign({}, DEFAULT_CAD_PREFS),
  load: loadCadPreferences,
  save: saveCadPreferences,
  get: getCadPreferences
};
window.loadCadPreferences = loadCadPreferences;
window.saveCadPreferences = saveCadPreferences;
window.getCadPreferences = getCadPreferences;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CAD_PREFS_STORAGE_KEY,
    DEFAULT_CAD_PREFS,
    SUPPORTED_UNITS,
    UNIT_META,
    getUnitMeta,
    convertFromMm,
    convertToMm,
    formatLength,
    formatArea,
    formatVolume,
    setCurrentUnit,
    cycleCurrentUnit,
    sanitizeCadPreferences,
    loadCadPreferences,
    saveCadPreferences,
    getCadPreferences
  };
}

