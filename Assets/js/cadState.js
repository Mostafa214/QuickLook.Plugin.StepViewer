var APP_CURRENT_VERSION = "v2.0.0";
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

// Exploded Assembly State
var currentExplodePercent = 0;
var isExplodeTrailsActive = true;
var explodeTrailsGroup = new THREE.Group();
var explodeAnimId = null;
var explodeAnchorBodyId = null;
var isExplodeInitialized = false;
var explodeFrameState = null;

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

